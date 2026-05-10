import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";

const EXCLUDED_MAPS = ["The Range", "Basic Training"];
const DM_MAPS = new Set(["Kasbah", "Glitch", "Drift", "Piazza", "District"]);
const SKIRMISH_MAPS = new Set(["Skirmish A", "Skirmish B", "Skirmish C"]);
const CONFIG_KEY = "mapdodge-config";
const noAnim = () => localStorage.getItem("disable_animations") === "true";
const T0 = { duration: 0 };

const SEARCH_ICON = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="11" cy="11" r="8" />
    <path d="M21 21l-4.35-4.35" />
  </svg>
);

function loadConfig() {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveConfig(blacklist, active) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify({ blacklist: [...blacklist], active }));
}

export default function MapDodgePage({ onActiveChange, onBlacklistChange, connected }) {
  const [maps, setMaps] = useState([]);
  const [search, setSearch] = useState("");
  const [blacklist, setBlacklist] = useState(new Set());
  const [active, setActive] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("https://valorant-api.com/v1/maps")
      .then((r) => r.json())
      .then((res) => {
        const playable = (res.data || []).filter(
          (m) => !EXCLUDED_MAPS.includes(m.displayName)
        );
        setMaps(playable);

        const cfg = loadConfig();
        if (cfg) {
          if (cfg.blacklist) setBlacklist(new Set(cfg.blacklist));
          if (cfg.active) {
            setActive(true);
            onActiveChange?.(true);
          }
        }
      })
      .catch((e) => console.error("[mapdodge] fetch failed:", e))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!loading) {
      saveConfig(blacklist, active);
      onBlacklistChange?.({ blacklist, maps });
    }
  }, [blacklist, active, loading]);

  const filteredMaps = useMemo(() => {
    if (!search.trim()) return maps;
    const q = search.toLowerCase();
    return maps.filter((m) => m.displayName.toLowerCase().includes(q));
  }, [maps, search]);

  const toggleMap = (mapUrl) => {
    setBlacklist((prev) => {
      const next = new Set(prev);
      if (next.has(mapUrl)) next.delete(mapUrl);
      else next.add(mapUrl);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col min-h-0 p-4 gap-3">
        <div className="flex items-center gap-2 shrink-0 animate-pulse">
          <div className="h-8 w-44 rounded-lg bg-base-700" />
          <div className="flex-1" />
          <div className="h-4 w-24 rounded bg-base-700" />
          <div className="h-5 w-9 rounded-full bg-base-700" />
        </div>
        <div className="flex-1 min-h-0 overflow-hidden">
          <div className="h-3 w-56 rounded bg-base-600 mb-3" />
          <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2 animate-pulse">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="h-16 rounded-lg bg-base-700 border border-border" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 p-4 gap-3">
      <div className="flex items-center gap-2 shrink-0">
        <div className="relative">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted">
            {SEARCH_ICON}
          </span>
          <input
            type="text"
            placeholder="Search maps..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-44 pl-8 pr-3 py-1.5 bg-base-700 border border-border rounded-lg text-xs font-body text-text-primary placeholder:text-text-muted focus:outline-none focus:border-border-light transition-colors"
          />
        </div>

        <div className="flex-1" />

        <span className="text-xs font-body text-text-muted">
          {blacklist.size} map{blacklist.size !== 1 ? "s" : ""} blacklisted
        </span>

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
        <p className="text-text-secondary text-xs font-display tracking-wide mb-3">
          Click maps to blacklist — auto-dodge when matched
        </p>
        {(() => {
          const standard = filteredMaps.filter(m => !DM_MAPS.has(m.displayName) && !SKIRMISH_MAPS.has(m.displayName));
          const skirmish = filteredMaps.filter(m => SKIRMISH_MAPS.has(m.displayName));
          const dm = filteredMaps.filter(m => DM_MAPS.has(m.displayName));
          let idx = 0;
          return (
            <div className="space-y-4">
              {standard.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-text-muted/60"><path d="M3 7l6-3 6 3 6-3v13l-6 3-6-3-6 3V7z" /><path d="M9 4v13M15 7v13" /></svg>
                    <span className="text-[10px] font-display font-bold text-text-muted uppercase tracking-wider">Standard Maps</span>
                    <div className="flex-1 h-px bg-border/50" />
                  </div>
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2">
                    {standard.map(map => {
                      const i = idx++;
                      return (
                        <motion.div key={map.uuid} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={noAnim() ? T0 : { duration: 0.15, delay: Math.min(i * 0.03, 0.3) }}>
                        <MapDodgeCard map={map} blacklisted={blacklist.has(map.mapUrl)} onClick={() => toggleMap(map.mapUrl)} />
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              )}
              {skirmish.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-text-muted/60"><path d="M12 2v20M2 12h20" /><circle cx="12" cy="12" r="4" /></svg>
                    <span className="text-[10px] font-display font-bold text-text-muted uppercase tracking-wider">Skirmish Maps</span>
                    <div className="flex-1 h-px bg-border/50" />
                  </div>
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2">
                    {skirmish.map(map => {
                      const i = idx++;
                      return (
                        <motion.div key={map.uuid} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={noAnim() ? T0 : { duration: 0.15, delay: Math.min(i * 0.03, 0.3) }}>
                        <MapDodgeCard map={map} blacklisted={blacklist.has(map.mapUrl)} onClick={() => toggleMap(map.mapUrl)} />
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              )}
              {dm.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-text-muted/60"><circle cx="12" cy="12" r="3" /><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" /></svg>
                    <span className="text-[10px] font-display font-bold text-text-muted uppercase tracking-wider">Deathmatch Maps</span>
                    <div className="flex-1 h-px bg-border/50" />
                  </div>
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2">
                    {dm.map(map => {
                      const i = idx++;
                      return (
                        <motion.div key={map.uuid} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={noAnim() ? T0 : { duration: 0.15, delay: Math.min(i * 0.03, 0.3) }}>
                        <MapDodgeCard map={map} blacklisted={blacklist.has(map.mapUrl)} onClick={() => toggleMap(map.mapUrl)} />
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}

function MapDodgeCard({ map, blacklisted, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`group relative overflow-hidden rounded-lg border transition-all duration-150 text-left h-16 w-full ${
        blacklisted
          ? "border-val-red/60 ring-1 ring-val-red/20"
          : "border-border hover:border-border-light"
      }`}
    >
      <div className="absolute inset-0 bg-base-600 overflow-hidden">
        {map.listViewIcon && (
          <img
            src={map.listViewIcon}
            alt=""
            className={`w-full h-full object-cover transition-opacity duration-150 ${
              blacklisted ? "opacity-15" : "opacity-30 group-hover:opacity-40"
            }`}
            loading="lazy"
          />
        )}
      </div>
      <div className={`absolute inset-0 ${blacklisted ? "bg-val-red/8" : "bg-base-900/50"}`} />
      <div className="relative h-full flex items-center justify-between px-4">
        <p className={`text-sm font-display font-semibold leading-tight ${
          blacklisted ? "text-val-red" : "text-text-primary"
        }`}>
          {map.displayName}
        </p>
        {blacklisted && (
          <span className="text-[10px] font-display font-semibold tracking-widest uppercase text-val-red/70">
            Blocked
          </span>
        )}
      </div>
    </button>
  );
}
