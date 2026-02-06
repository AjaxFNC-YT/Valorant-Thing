import { useState, useEffect, useMemo, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

const EXCLUDED_MAPS = ["The Range", "District", "Kasbah", "Drift", "Glitch", "Piazza", "Basic Training", "Skirmish A", "Skirmish B", "Skirmish C"];


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

function saveConfig(selectedAgent, perMapSelections, active) {
  const slim = (a) => a ? { uuid: a.uuid, displayName: a.displayName, displayIcon: a.displayIcon } : null;
  const perMap = {};
  for (const [mapId, agent] of Object.entries(perMapSelections)) {
    perMap[mapId] = slim(agent);
  }
  localStorage.setItem(CONFIG_KEY, JSON.stringify({
    defaultAgent: slim(selectedAgent),
    perMap,
    active,
  }));
}

function loadConfig() {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
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
  const configLoaded = useRef(false);

  useEffect(() => {
    invoke("get_owned_agents")
      .then((ids) => setOwnedAgents(new Set(ids)))
      .catch(() => setOwnedAgents(null));
  }, []);

  useEffect(() => {
    Promise.all([
      fetch("https://valorant-api.com/v1/agents?isPlayableCharacter=true")
        .then((r) => r.json()),
      fetch("https://valorant-api.com/v1/maps")
        .then((r) => r.json()),
    ])
      .then(([agentsRes, mapsRes]) => {
        const sorted = (agentsRes.data || []).sort((a, b) =>
          a.displayName.localeCompare(b.displayName)
        );
        setAgents(sorted);
        const playable = (mapsRes.data || []).filter(
          (m) => !EXCLUDED_MAPS.includes(m.displayName)
        );
        setMaps(playable);

        const cfg = loadConfig();
        if (cfg) {
          const findAgent = (saved) => {
            if (!saved) return null;
            if (saved.uuid === "none") return NONE_AGENT;
            return sorted.find((a) => a.uuid === saved.uuid) || null;
          };
          if (cfg.defaultAgent) setSelectedAgent(findAgent(cfg.defaultAgent));
          if (cfg.perMap) {
            const restored = {};
            for (const [mapId, saved] of Object.entries(cfg.perMap)) {
              const agent = findAgent(saved);
              if (agent) restored[mapId] = agent;
              else if (saved?.uuid === "none") restored[mapId] = NONE_AGENT;
            }
            setPerMapSelections(restored);
          }
          if (cfg.active) {
            setActive(true);
            onActiveChange?.(true);
          }
          configLoaded.current = true;
        }
      })
      .catch((e) => console.error("[instalock] fetch failed:", e))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!loading) saveConfig(selectedAgent, perMapSelections, active);
  }, [selectedAgent, perMapSelections, active, loading]);

  useEffect(() => {
    if (!loading) onConfigChange?.({ maps, selectedAgent, perMapSelections });
  }, [maps, selectedAgent, perMapSelections, loading]);

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
      <div className="flex-1 flex items-center justify-center">
        <div className="text-text-muted text-sm font-body">Loading agents...</div>
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
        {agents.map((agent) => (
          <AgentCard
            key={agent.uuid}
            agent={agent}
            selected={selectedAgent?.uuid === agent.uuid}
            onClick={() => onAgentClick(agent)}
            owned={isOwned(agent)}
          />
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
          {filtered.map((map) => (
            <MapCard
              key={map.uuid}
              map={map}
              selectedAgent={getAgentForMap(map.uuid)}
              isDefault={!perMapSelections[map.uuid] && !!getAgentForMap(map.uuid)}
              onClick={() => onMapSelect(map)}
            />
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
