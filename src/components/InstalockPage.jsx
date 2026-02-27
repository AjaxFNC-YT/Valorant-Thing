import { useState, useEffect, useMemo, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion } from "framer-motion";

const EXCLUDED_MAPS = ["The Range", "Basic Training", "Skirmish A", "Skirmish B", "Skirmish C"];
const noAnim = () => localStorage.getItem("disable_animations") === "true";
const T0 = { duration: 0 };


const GLOBE_ICON = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="12" cy="12" r="10" />
    <path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
  </svg>
);

const MAP_ICON = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M3 7l6-3 6 3 6-3v13l-6 3-6-3-6 3V7z" />
    <path d="M9 4v13M15 7v13" />
  </svg>
);

const SEARCH_ICON = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="11" cy="11" r="8" />
    <path d="M21 21l-4.35-4.35" />
  </svg>
);

const BACK_ICON = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M19 12H5M12 19l-7-7 7-7" />
  </svg>
);

const AGENT_SILHOUETTE = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="text-text-muted/30">
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c0-4.42 3.58-8 8-8s8 3.58 8 8" />
  </svg>
);

const NONE_AGENT = { uuid: "none", displayName: "None", displayIcon: null };

const CONFIG_KEY = "instalock-config";
const PROFILES_KEY = "instalock-profiles";
const ACTIVE_PROFILE_KEY = "instalock-active-profile";

const slimAgent = (a) => a ? { uuid: a.uuid, displayName: a.displayName, displayIcon: a.displayIcon } : null;

function saveConfig(selectedAgent, perMapSelections, active) {
  const perMap = {};
  for (const [mapId, agent] of Object.entries(perMapSelections)) {
    perMap[mapId] = slimAgent(agent);
  }
  localStorage.setItem(CONFIG_KEY, JSON.stringify({ defaultAgent: slimAgent(selectedAgent), perMap, active }));
}

function loadConfig() {
  try { return JSON.parse(localStorage.getItem(CONFIG_KEY)) || null; } catch { return null; }
}

function loadProfiles() {
  try { return JSON.parse(localStorage.getItem(PROFILES_KEY)) || []; } catch { return []; }
}

function saveProfilesLS(profiles) {
  localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
}

function resolveAgent(sorted, saved) {
  if (!saved) return null;
  if (saved.uuid === "none") return NONE_AGENT;
  return sorted.find(a => a.uuid === saved.uuid) || null;
}

function restorePerMap(sorted, perMap) {
  const restored = {};
  if (perMap) {
    for (const [mapId, saved] of Object.entries(perMap)) {
      const agent = resolveAgent(sorted, saved);
      if (agent) restored[mapId] = agent;
      else if (saved?.uuid === "none") restored[mapId] = NONE_AGENT;
    }
  }
  return restored;
}

export default function InstalockPage({ onActiveChange, onConfigChange, connected }) {
  const [subTab, setSubTab] = useState("all");
  const [agents, setAgents] = useState([]);
  const [maps, setMaps] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [selectedMap, setSelectedMap] = useState(null);
  const [perMapSelections, setPerMapSelections] = useState({});
  const [active, setActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [ownedAgents, setOwnedAgents] = useState(null);
  const [profiles, setProfiles] = useState([]);
  const [activeProfileId, setActiveProfileId] = useState(null);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [dotMenuId, setDotMenuId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [importMode, setImportMode] = useState(false);
  const [importValue, setImportValue] = useState("");
  const [nameModal, setNameModal] = useState(null);
  const [nameModalValue, setNameModalValue] = useState("");
  const profileMenuRef = useRef(null);
  const configLoaded = useRef(false);

  useEffect(() => {
    invoke("get_owned_agents")
      .then((ids) => setOwnedAgents(new Set(ids)))
      .catch(() => setOwnedAgents(null));
  }, []);

  useEffect(() => {
    Promise.all([
      fetch("https://valorant-api.com/v1/agents?isPlayableCharacter=true").then(r => r.json()),
      fetch("https://valorant-api.com/v1/maps").then(r => r.json()),
    ]).then(([agentsRes, mapsRes]) => {
      const sorted = (agentsRes.data || []).sort((a, b) => a.displayName.localeCompare(b.displayName));
      setAgents(sorted);
      const playable = (mapsRes.data || []).filter(m => !EXCLUDED_MAPS.includes(m.displayName));
      setMaps(playable);

      let profs = loadProfiles();
      let activeId = localStorage.getItem(ACTIVE_PROFILE_KEY);

      if (!profs.length) {
        const cfg = loadConfig();
        profs = [{ id: "default", name: "Default", defaultAgent: cfg?.defaultAgent || null, perMap: cfg?.perMap || {} }];
        activeId = "default";
        saveProfilesLS(profs);
        localStorage.setItem(ACTIVE_PROFILE_KEY, activeId);
      }
      if (!activeId || !profs.find(p => p.id === activeId)) {
        activeId = profs[0].id;
        localStorage.setItem(ACTIVE_PROFILE_KEY, activeId);
      }

      setProfiles(profs);
      setActiveProfileId(activeId);

      const profile = profs.find(p => p.id === activeId);
      const cfg = loadConfig();
      const source = profile || cfg;
      if (source) {
        if (source.defaultAgent) setSelectedAgent(resolveAgent(sorted, source.defaultAgent));
        setPerMapSelections(restorePerMap(sorted, source.perMap));
        if (cfg?.active) { setActive(true); onActiveChange?.(true); }
        configLoaded.current = true;
      }
    }).catch(e => console.error("[instalock] fetch failed:", e))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (loading || !activeProfileId) return;
    saveConfig(selectedAgent, perMapSelections, active);
    const perMap = {};
    for (const [mapId, agent] of Object.entries(perMapSelections)) perMap[mapId] = slimAgent(agent);
    setProfiles(prev => {
      const updated = prev.map(p => p.id === activeProfileId ? { ...p, defaultAgent: slimAgent(selectedAgent), perMap } : p);
      saveProfilesLS(updated);
      return updated;
    });
  }, [selectedAgent, perMapSelections, active, loading, activeProfileId]);

  useEffect(() => {
    if (!loading) onConfigChange?.({ maps, selectedAgent, perMapSelections });
  }, [maps, selectedAgent, perMapSelections, loading]);

  useEffect(() => {
    if (!profileMenuOpen) return;
    const handler = (e) => { if (profileMenuRef.current && !profileMenuRef.current.contains(e.target)) { setProfileMenuOpen(false); setDotMenuId(null); setImportMode(false); setImportValue(""); } };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [profileMenuOpen]);

  const activeProfile = profiles.find(p => p.id === activeProfileId);

  const switchProfile = (newId) => {
    if (newId === activeProfileId) { setProfileMenuOpen(false); return; }
    const perMap = {};
    for (const [mapId, agent] of Object.entries(perMapSelections)) perMap[mapId] = slimAgent(agent);
    const saved = profiles.map(p => p.id === activeProfileId ? { ...p, defaultAgent: slimAgent(selectedAgent), perMap } : p);
    const target = saved.find(p => p.id === newId);
    if (!target) return;
    setSelectedAgent(resolveAgent(agents, target.defaultAgent));
    setPerMapSelections(restorePerMap(agents, target.perMap));
    setActiveProfileId(newId);
    localStorage.setItem(ACTIVE_PROFILE_KEY, newId);
    setProfiles(saved);
    saveProfilesLS(saved);
    setProfileMenuOpen(false);
  };

  const startCreateProfile = () => {
    setProfileMenuOpen(false);
    setNameModal({ type: "new" });
    setNameModalValue(`Profile ${profiles.length + 1}`);
  };

  const deleteProfileById = (id) => {
    if (profiles.length <= 1) return;
    const remaining = profiles.filter(p => p.id !== id);
    if (id === activeProfileId) {
      const target = remaining[0];
      setSelectedAgent(resolveAgent(agents, target.defaultAgent));
      setPerMapSelections(restorePerMap(agents, target.perMap));
      setActiveProfileId(target.id);
      localStorage.setItem(ACTIVE_PROFILE_KEY, target.id);
    }
    setProfiles(remaining);
    saveProfilesLS(remaining);
    setConfirmDeleteId(null);
    setDotMenuId(null);
    setProfileMenuOpen(false);
  };

  const shareProfile = (id) => {
    const profile = profiles.find(p => p.id === id);
    if (!profile) return;
    navigator.clipboard.writeText(btoa(JSON.stringify({ name: profile.name, defaultAgent: profile.defaultAgent, perMap: profile.perMap })));
    setDotMenuId(null);
    setProfileMenuOpen(false);
  };

  const startImport = () => {
    try {
      const data = JSON.parse(atob(importValue.trim()));
      setImportMode(false);
      setImportValue("");
      setProfileMenuOpen(false);
      setNameModal({ type: "import", importData: data });
      setNameModalValue(data.name || `Imported ${profiles.length + 1}`);
    } catch {}
  };

  const startRename = (id) => {
    const p = profiles.find(pr => pr.id === id);
    setDotMenuId(null);
    setProfileMenuOpen(false);
    setNameModal({ type: "rename", profileId: id });
    setNameModalValue(p?.name || "");
  };

  const handleNameModalConfirm = () => {
    const name = nameModalValue.trim();
    if (!name || !nameModal) return;
    if (nameModal.type === "new") {
      const id = Date.now().toString(36);
      const perMap = {};
      for (const [mapId, agent] of Object.entries(perMapSelections)) perMap[mapId] = slimAgent(agent);
      const saved = profiles.map(p => p.id === activeProfileId ? { ...p, defaultAgent: slimAgent(selectedAgent), perMap } : p);
      const updated = [...saved, { id, name, defaultAgent: null, perMap: {} }];
      setSelectedAgent(null);
      setPerMapSelections({});
      setActiveProfileId(id);
      localStorage.setItem(ACTIVE_PROFILE_KEY, id);
      setProfiles(updated);
      saveProfilesLS(updated);
    } else if (nameModal.type === "import") {
      const id = Date.now().toString(36);
      const perMap = {};
      for (const [mapId, agent] of Object.entries(perMapSelections)) perMap[mapId] = slimAgent(agent);
      const saved = profiles.map(p => p.id === activeProfileId ? { ...p, defaultAgent: slimAgent(selectedAgent), perMap } : p);
      const d = nameModal.importData;
      const np = { id, name, defaultAgent: d?.defaultAgent || null, perMap: d?.perMap || {} };
      const updated = [...saved, np];
      setSelectedAgent(resolveAgent(agents, np.defaultAgent));
      setPerMapSelections(restorePerMap(agents, np.perMap));
      setActiveProfileId(id);
      localStorage.setItem(ACTIVE_PROFILE_KEY, id);
      setProfiles(updated);
      saveProfilesLS(updated);
    } else if (nameModal.type === "rename") {
      const updated = profiles.map(p => p.id === nameModal.profileId ? { ...p, name } : p);
      setProfiles(updated);
      saveProfilesLS(updated);
    }
    setNameModal(null);
    setNameModalValue("");
  };

  const FREE_AGENTS = new Set(["brimstone", "jett", "phoenix", "sage", "sova"]);
  const isOwned = (agent) => !ownedAgents || ownedAgents.has(agent.uuid.toLowerCase()) || FREE_AGENTS.has(agent.displayName.toLowerCase());

  const filteredAgents = useMemo(() => {
    let list = agents;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((a) => a.displayName.toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => {
      const aOwned = isOwned(a) ? 0 : 1;
      const bOwned = isOwned(b) ? 0 : 1;
      return aOwned - bOwned || a.displayName.localeCompare(b.displayName);
    });
  }, [agents, search, ownedAgents]);

  const handleAgentClick = (agent) => {
    if (!isOwned(agent)) return;
    if (subTab === "all") {
      setSelectedAgent(selectedAgent?.uuid === agent.uuid ? null : agent);
    } else if (selectedMap) {
      setPerMapSelections((prev) => {
        const current = prev[selectedMap.uuid];
        if (current?.uuid === agent.uuid) {
          const next = { ...prev };
          delete next[selectedMap.uuid];
          return next;
        }
        return { ...prev, [selectedMap.uuid]: agent };
      });
    }
  };

  const handleNoneClick = () => {
    if (!selectedMap) return;
    setPerMapSelections((prev) => {
      if (prev[selectedMap.uuid]?.uuid === "none") {
        const next = { ...prev };
        delete next[selectedMap.uuid];
        return next;
      }
      return { ...prev, [selectedMap.uuid]: NONE_AGENT };
    });
  };

  const getAgentForMap = (mapUuid) => perMapSelections[mapUuid] || selectedAgent;

  if (loading) {
    return (
      <div className="flex-1 flex flex-col min-h-0 p-4 gap-3">
        <div className="flex items-center gap-2 shrink-0 animate-pulse">
          <div className="h-8 w-44 rounded-lg bg-base-700" />
          <div className="flex-1" />
          <div className="h-8 w-44 rounded-lg bg-base-700" />
          <div className="h-5 w-9 rounded-full bg-base-700" />
        </div>
        <div className="flex-1 min-h-0 overflow-hidden">
          <div className="h-3 w-20 rounded bg-base-600 mb-3" />
          <div className="grid grid-cols-[repeat(auto-fill,minmax(80px,1fr))] gap-1.5 animate-pulse">
            {Array.from({ length: 20 }, (_, i) => (
              <div key={i} className="flex flex-col items-center gap-1 p-1.5">
                <div className="w-14 h-14 rounded-md bg-base-600" />
                <div className="h-2.5 w-10 rounded bg-base-600" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 p-4 gap-3">
      <div className="flex items-center gap-2 shrink-0">
        <div className="flex bg-base-700 rounded-lg p-0.5 border border-border">
          <button
            onClick={() => { setSubTab("all"); setSelectedMap(null); setSearch(""); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-display font-medium tracking-wide transition-colors duration-150 ${
              subTab === "all"
                ? "bg-base-500 text-text-primary"
                : "text-text-muted hover:text-text-secondary"
            }`}
          >
            {GLOBE_ICON}
            All Maps
          </button>
          <button
            onClick={() => { setSubTab("permap"); setSearch(""); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-display font-medium tracking-wide transition-colors duration-150 ${
              subTab === "permap"
                ? "bg-base-500 text-text-primary"
                : "text-text-muted hover:text-text-secondary"
            }`}
          >
            {MAP_ICON}
            Per Map
          </button>
        </div>

        <div className="relative" ref={profileMenuRef}>
          <button
            onClick={() => { setProfileMenuOpen(!profileMenuOpen); setDotMenuId(null); setImportMode(false); setImportValue(""); }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-base-700 border border-border rounded-lg text-xs font-display text-text-secondary hover:text-text-primary transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="shrink-0">
              <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
            </svg>
            <span className="max-w-[100px] truncate">{activeProfile?.name || "Default"}</span>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="shrink-0 text-text-muted">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
          {profileMenuOpen && (
            <div className="absolute top-full left-0 mt-1 min-w-[200px] bg-base-700 border border-border rounded-lg shadow-xl z-20">
              {profiles.map(p => (
                <div key={p.id} className={`relative flex items-center gap-1.5 px-3 py-2 text-xs font-body hover:bg-base-600 transition-colors ${p.id === activeProfileId ? "text-accent-blue" : "text-text-secondary"}`}>
                  <span className="flex-1 truncate cursor-pointer" onClick={() => switchProfile(p.id)}>{p.name}</span>
                  {p.id === activeProfileId && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="shrink-0">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  )}
                  <button onClick={e => { e.stopPropagation(); setDotMenuId(dotMenuId === p.id ? null : p.id); }} className="shrink-0 p-0.5 rounded hover:bg-base-500 text-text-muted hover:text-text-primary transition-colors">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
                  </button>
                  {dotMenuId === p.id && (
                    <div className="absolute right-2 top-full -mt-0.5 bg-base-600 border border-border rounded-lg shadow-xl z-30 min-w-[130px] overflow-hidden">
                      <button onClick={() => startRename(p.id)} className="w-full px-3 py-1.5 text-left text-xs font-body text-text-secondary hover:text-text-primary hover:bg-base-500 transition-colors flex items-center gap-2">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0"><path d="M17 3a2.83 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
                        Rename
                      </button>
                      <button onClick={() => shareProfile(p.id)} className="w-full px-3 py-1.5 text-left text-xs font-body text-text-secondary hover:text-text-primary hover:bg-base-500 transition-colors flex items-center gap-2">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                        Share
                      </button>
                      {profiles.length > 1 && (
                        <button onClick={() => { setConfirmDeleteId(p.id); setDotMenuId(null); setProfileMenuOpen(false); }} className="w-full px-3 py-1.5 text-left text-xs font-body text-val-red/70 hover:text-val-red hover:bg-base-500 transition-colors flex items-center gap-2">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                          Delete
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
              <div className="border-t border-border" />
              {importMode ? (
                <div className="px-2.5 py-2 flex gap-1.5">
                  <input
                    value={importValue}
                    onChange={e => setImportValue(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") startImport(); if (e.key === "Escape") { setImportMode(false); setImportValue(""); } }}
                    placeholder="Paste code..."
                    className="flex-1 min-w-0 bg-base-800 border border-border rounded px-2 py-1 text-xs font-body text-text-primary placeholder:text-text-muted focus:outline-none"
                    autoFocus
                  />
                  <button onClick={startImport} className="px-2 py-1 bg-accent-blue/20 text-accent-blue rounded text-xs font-body hover:bg-accent-blue/30 transition-colors shrink-0">
                    Go
                  </button>
                </div>
              ) : (
                <>
                  <button onClick={startCreateProfile} className="w-full px-3 py-2 text-left text-xs font-body text-text-muted hover:text-text-primary hover:bg-base-600 transition-colors flex items-center gap-2">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    New Profile
                  </button>
                  <button onClick={() => setImportMode(true)} className="w-full px-3 py-2 text-left text-xs font-body text-text-muted hover:text-text-primary hover:bg-base-600 transition-colors flex items-center gap-2">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    Import Profile
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        <div className="flex-1" />

        <div className="relative">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted">
            {SEARCH_ICON}
          </span>
          <input
            type="text"
            placeholder={subTab === "permap" && !selectedMap ? "Search maps..." : "Search agents..."}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-44 pl-8 pr-3 py-1.5 bg-base-700 border border-border rounded-lg text-xs font-body text-text-primary placeholder:text-text-muted focus:outline-none focus:border-border-light transition-colors"
          />
        </div>

        <div className="flex items-center gap-2 ml-1">
          <span className={`text-xs font-display tracking-wide ${!connected ? "text-text-muted" : active ? "text-status-green" : "text-text-muted"}`}>
            {!connected ? "Off" : active ? "Active" : "Inactive"}
          </span>
          <button
            disabled={!connected}
            onClick={() => { if (!connected) return; const next = !active; setActive(next); onActiveChange?.(next); }}
            className={`relative w-9 h-5 rounded-full transition-colors duration-200 ${
              !connected ? "bg-base-500 opacity-50 cursor-not-allowed" : active ? "bg-status-green" : "bg-base-500"
            }`}
          >
            <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${
              !connected ? "translate-x-0.5" : active ? "translate-x-[18px]" : "translate-x-0.5"
            }`} />
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto pr-1">
        {subTab === "all" ? (
          <AllMapsView
            agents={filteredAgents}
            selectedAgent={selectedAgent}
            onAgentClick={handleAgentClick}
            isOwned={isOwned}
          />
        ) : (
          <PerMapView
            agents={agents}
            maps={maps}
            search={search}
            selectedMap={selectedMap}
            onMapSelect={(map) => { setSelectedMap(map); setSearch(""); }}
            onMapBack={() => { setSelectedMap(null); setSearch(""); }}
            perMapSelections={perMapSelections}
            onAgentClick={handleAgentClick}
            onNoneClick={handleNoneClick}
            getAgentForMap={getAgentForMap}
            isOwned={isOwned}
          />
        )}
      </div>

      {nameModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => { setNameModal(null); setNameModalValue(""); }}>
          <div className="bg-base-700 border border-border rounded-xl p-5 max-w-xs w-full space-y-3 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              {nameModal.type === "new" && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent-blue shrink-0"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>}
              {nameModal.type === "import" && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent-blue shrink-0"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>}
              {nameModal.type === "rename" && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent-blue shrink-0"><path d="M17 3a2.83 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>}
              <p className="text-sm font-display font-semibold text-text-primary">
                {nameModal.type === "new" ? "New Profile" : nameModal.type === "import" ? "Import Profile" : "Rename Profile"}
              </p>
            </div>
            <input
              value={nameModalValue}
              onChange={e => setNameModalValue(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && nameModalValue.trim()) handleNameModalConfirm(); if (e.key === "Escape") { setNameModal(null); setNameModalValue(""); } }}
              placeholder="Profile name..."
              className="w-full px-3 py-2 bg-base-800 border border-border rounded-lg text-xs font-body text-text-primary placeholder:text-text-muted focus:outline-none focus:border-border-light transition-colors"
              autoFocus
            />
            <div className="flex gap-2 justify-end pt-1">
              <button onClick={() => { setNameModal(null); setNameModalValue(""); }} className="px-3 py-1.5 rounded-lg text-xs font-body bg-base-600 border border-border text-text-secondary hover:text-text-primary transition-colors">
                Cancel
              </button>
              <button onClick={handleNameModalConfirm} disabled={!nameModalValue.trim()} className="px-3 py-1.5 rounded-lg text-xs font-body bg-accent-blue/20 text-accent-blue hover:bg-accent-blue/30 transition-colors disabled:opacity-40 disabled:pointer-events-none">
                {nameModal.type === "rename" ? "Rename" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setConfirmDeleteId(null)}>
          <div className="bg-base-700 border border-border rounded-xl p-5 max-w-xs w-full space-y-3 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-val-red shrink-0"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
              <p className="text-sm font-display font-semibold text-text-primary">Delete Profile</p>
            </div>
            <p className="text-xs font-body text-text-muted">
              Are you sure you want to delete <span className="text-text-secondary font-semibold">{profiles.find(p => p.id === confirmDeleteId)?.name}</span>?
            </p>
            <div className="flex gap-2 justify-end pt-1">
              <button onClick={() => setConfirmDeleteId(null)} className="px-3 py-1.5 rounded-lg text-xs font-body bg-base-600 border border-border text-text-secondary hover:text-text-primary transition-colors">
                Cancel
              </button>
              <button onClick={() => deleteProfileById(confirmDeleteId)} className="px-3 py-1.5 rounded-lg text-xs font-body bg-val-red/20 text-val-red hover:bg-val-red/30 transition-colors">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AllMapsView({ agents, selectedAgent, onAgentClick, isOwned }) {
  return (
    <div>
      <p className="text-text-secondary text-xs font-display tracking-wide mb-3">
        Select Agent
      </p>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(80px,1fr))] gap-1.5">
        {agents.map((agent, i) => (
          <motion.div key={agent.uuid} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={noAnim() ? T0 : { duration: 0.15, delay: Math.min(i * 0.02, 0.4) }}>
          <AgentCard
            agent={agent}
            selected={selectedAgent?.uuid === agent.uuid}
            onClick={() => onAgentClick(agent)}
            owned={isOwned(agent)}
          />
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function PerMapView({ agents, maps, search, selectedMap, onMapSelect, onMapBack, perMapSelections, onAgentClick, onNoneClick, getAgentForMap, isOwned }) {
  if (!selectedMap) {
    const q = search.toLowerCase();
    const filtered = search.trim()
      ? maps.filter((m) => m.displayName.toLowerCase().includes(q))
      : maps;

    return (
      <div>
        <p className="text-text-secondary text-xs font-display tracking-wide mb-3">
          Select Map
        </p>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2">
          {filtered.map((map, i) => (
            <motion.div key={map.uuid} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={noAnim() ? T0 : { duration: 0.15, delay: Math.min(i * 0.03, 0.3) }}>
            <MapCard
              map={map}
              selectedAgent={getAgentForMap(map.uuid)}
              isDefault={!perMapSelections[map.uuid] && !!getAgentForMap(map.uuid)}
              onClick={() => onMapSelect(map)}
            />
            </motion.div>
          ))}
        </div>
      </div>
    );
  }

  const q = search.toLowerCase();
  const filtered = search.trim()
    ? agents.filter((a) => a.displayName.toLowerCase().includes(q))
    : agents;
  const currentSelection = perMapSelections[selectedMap.uuid];

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={onMapBack}
          className="flex items-center gap-1.5 text-text-muted hover:text-text-primary text-xs font-display transition-colors"
        >
          {BACK_ICON}
          Back
        </button>
        <span className="text-text-secondary text-xs">—</span>
        <span className="text-text-primary text-xs font-display font-medium">
          {selectedMap.displayName}
        </span>
        {currentSelection && (
          <span className={`text-xs font-display ml-auto ${currentSelection.uuid === "none" ? "text-text-muted" : "text-accent-blue"}`}>
            {currentSelection.displayName}
          </span>
        )}
      </div>
      <p className="text-text-secondary text-xs font-display tracking-wide mb-3">
        Select Agent for {selectedMap.displayName}
      </p>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(80px,1fr))] gap-1.5">
        <button
          onClick={onNoneClick}
          className={`group flex flex-col items-center gap-1 p-1.5 rounded-lg border transition-all duration-150 ${
            currentSelection?.uuid === "none"
              ? "bg-base-500/30 border-text-muted/40"
              : "border-transparent hover:bg-base-600/50"
          }`}
        >
          <div className="w-14 h-14 rounded-md bg-base-600 flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-text-muted/50">
              <circle cx="12" cy="12" r="10" />
              <path d="M4.93 4.93l14.14 14.14" />
            </svg>
          </div>
          <span className={`text-[11px] font-body leading-tight ${
            currentSelection?.uuid === "none" ? "text-text-primary font-medium" : "text-text-muted group-hover:text-text-secondary"
          }`}>None</span>
        </button>
        {filtered.map((agent) => (
          <AgentCard
            key={agent.uuid}
            agent={agent}
            selected={currentSelection?.uuid === agent.uuid}
            onClick={() => onAgentClick(agent)}
            owned={isOwned(agent)}
          />
        ))}
      </div>
    </div>
  );
}

function AgentCard({ agent, selected, onClick, owned = true }) {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div className="relative" onMouseEnter={() => !owned && setShowTooltip(true)} onMouseLeave={() => setShowTooltip(false)}>
      <button
        onClick={onClick}
        disabled={!owned}
        className={`group flex flex-col items-center gap-1 p-1.5 rounded-lg border transition-all duration-150 w-full ${
          !owned
            ? "border-transparent opacity-30 cursor-not-allowed"
            : selected
              ? "bg-accent-blue/10 border-accent-blue/60"
              : "border-transparent hover:bg-base-600/50"
        }`}
      >
        <div className={`w-14 h-14 rounded-md overflow-hidden bg-base-600 ${!owned ? "grayscale" : ""}`}>
          <img
            src={agent.displayIcon}
            alt={agent.displayName}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </div>
        <span className={`text-[11px] font-body leading-tight truncate max-w-[72px] ${
          !owned
            ? "text-text-muted"
            : selected ? "text-accent-blue font-medium" : "text-text-secondary group-hover:text-text-primary"
        }`}>
          {agent.displayName}
        </span>
      </button>
      {showTooltip && (
        <div className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 rounded bg-base-900 border border-border text-[10px] font-body text-text-muted whitespace-nowrap z-10 pointer-events-none">
          Agent Locked
        </div>
      )}
    </div>
  );
}

function MapCard({ map, selectedAgent, isDefault, onClick }) {
  return (
    <button
      onClick={onClick}
      className="group relative overflow-hidden rounded-lg border border-border hover:border-border-light transition-all duration-150 text-left h-16 w-full"
    >
      <div className="absolute inset-0 bg-base-600 overflow-hidden">
        {map.listViewIcon && (
          <img
            src={map.listViewIcon}
            alt=""
            className="w-full h-full object-cover opacity-30 group-hover:opacity-40 transition-opacity duration-150"
            loading="lazy"
          />
        )}
      </div>
      <div className="absolute inset-0 bg-base-900/50" />
      <div className="relative h-full flex items-center gap-3 px-3">
        {selectedAgent && selectedAgent.uuid !== "none" ? (
          <div className="w-9 h-9 rounded-lg overflow-hidden shrink-0 bg-base-600">
            <img
              src={selectedAgent.displayIcon}
              alt={selectedAgent.displayName}
              className="w-full h-full object-cover"
            />
          </div>
        ) : selectedAgent?.uuid === "none" ? (
          <div className="w-9 h-9 rounded-lg shrink-0 bg-base-500/30 flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-text-muted/50">
              <circle cx="12" cy="12" r="10" />
              <path d="M4.93 4.93l14.14 14.14" />
            </svg>
          </div>
        ) : (
          <div className="w-9 h-9 rounded-lg shrink-0 bg-base-500/30 flex items-center justify-center text-text-muted/20">
            {AGENT_SILHOUETTE}
          </div>
        )}
        <div className="min-w-0">
          <p className="text-sm font-display font-semibold text-text-primary leading-tight">
            {map.displayName}
          </p>
          {selectedAgent ? (
            <p className="text-xs font-body text-text-muted leading-tight mt-0.5">
              {selectedAgent.displayName}
              {!isDefault && <span className="text-text-muted/50"> (override)</span>}
              {isDefault && <span className="text-text-muted/50"> (default)</span>}
            </p>
          ) : (
            <p className="text-xs font-body text-text-muted/40 leading-tight mt-0.5 italic">
              No agent
            </p>
          )}
        </div>
      </div>
    </button>
  );
}
