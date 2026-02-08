import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

const TIER_UUID = "03621f52-342b-cf4e-4f86-9350a49c6d04";
const rankIcon = (tier) => `https://media.valorant-api.com/competitivetiers/${TIER_UUID}/${tier}/smallicon.png`;

const RANKS = [
  { tier: 0, name: "Unranked" },
  { tier: 3, name: "Iron 1" }, { tier: 4, name: "Iron 2" }, { tier: 5, name: "Iron 3" },
  { tier: 6, name: "Bronze 1" }, { tier: 7, name: "Bronze 2" }, { tier: 8, name: "Bronze 3" },
  { tier: 9, name: "Silver 1" }, { tier: 10, name: "Silver 2" }, { tier: 11, name: "Silver 3" },
  { tier: 12, name: "Gold 1" }, { tier: 13, name: "Gold 2" }, { tier: 14, name: "Gold 3" },
  { tier: 15, name: "Platinum 1" }, { tier: 16, name: "Platinum 2" }, { tier: 17, name: "Platinum 3" },
  { tier: 18, name: "Diamond 1" }, { tier: 19, name: "Diamond 2" }, { tier: 20, name: "Diamond 3" },
  { tier: 21, name: "Ascendant 1" }, { tier: 22, name: "Ascendant 2" }, { tier: 23, name: "Ascendant 3" },
  { tier: 24, name: "Immortal 1" }, { tier: 25, name: "Immortal 2" }, { tier: 26, name: "Immortal 3" },
  { tier: 27, name: "Radiant" },
];

const QUEUES = [
  { id: "newmap", label: "None" },
  { id: "unrated", label: "Unrated" },
  { id: "competitive", label: "Competitive" },
  { id: "spikerush", label: "Spike Rush" },
  { id: "deathmatch", label: "Deathmatch" },
  { id: "swiftplay", label: "Swiftplay" },
  { id: "hurm", label: "Team Deathmatch" },
  { id: "premier", label: "Premier" },
  { id: "ggteam", label: "Escalation" },
  { id: "onefa", label: "Replication" },
];

const PREMIER_DIVISIONS = [
  { id: 0, name: "Style A", icon: "?", color: "#888" },
  { id: 2, name: "Style B", icon: "○", color: "#FFD740" },
  { id: 4, name: "Style C", icon: "✕", color: "#CE93D8" },
];

const SESSION_STATES = [
  { id: "MENUS", name: "Menu" },
  { id: "PREGAME", name: "Agent Select" },
  { id: "INGAME", name: "In Game" },
];

const CONFIG_KEY = "fake-status-config";
function saveConfig(config) { localStorage.setItem(CONFIG_KEY, JSON.stringify(config)); }
function loadConfig() { try { return JSON.parse(localStorage.getItem(CONFIG_KEY)); } catch { return null; } }

function Toggle({ enabled, onChange, disabled }) {
  return (
    <button disabled={disabled} onClick={() => onChange(!enabled)}
      className={`relative w-9 h-5 rounded-full transition-colors duration-200 shrink-0 ${disabled ? "bg-base-500 opacity-50 cursor-not-allowed" : enabled ? "bg-val-red" : "bg-base-500"}`}
    >
      <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${disabled ? "translate-x-0.5" : enabled ? "translate-x-[18px]" : "translate-x-0.5"}`} />
    </button>
  );
}

function Field({ label, children }) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-body text-text-muted uppercase tracking-wider">{label}</label>
      {children}
    </div>
  );
}

function CustomSelect({ value, onChange, options, renderOption }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const selected = options.find(o => o.id === value || o.tier === value) || options[0];

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const valKey = selected.tier !== undefined ? "tier" : "id";

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 bg-base-800 border border-border rounded-lg text-xs font-body text-text-primary hover:border-val-red/40 transition-colors"
      >
        <span className="flex-1 text-left flex items-center gap-2">{renderOption ? renderOption(selected) : selected.name || selected.label}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`text-text-muted transition-transform shrink-0 ${open ? "rotate-180" : ""}`}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 left-0 right-0 bg-base-800 border border-border rounded-lg shadow-xl max-h-64 overflow-y-auto">
          {options.map(o => (
            <button key={o[valKey]} onClick={() => { onChange(o[valKey]); setOpen(false); }}
              className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-xs font-body hover:bg-base-600 transition-colors ${o[valKey] === value ? "bg-base-600 text-text-primary" : "text-text-secondary"}`}
            >
              {renderOption ? renderOption(o) : o.name || o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const inputClass = "w-full px-2.5 py-1.5 bg-base-800 border border-border rounded-lg text-xs font-body text-text-primary placeholder:text-text-muted/40 outline-none focus:border-val-red/60 transition-colors";

const apiCache = {};
async function fetchApi(endpoint) {
  if (apiCache[endpoint]) return apiCache[endpoint];
  const res = await fetch(`https://valorant-api.com/v1/${endpoint}?language=en-US`);
  const json = await res.json();
  apiCache[endpoint] = json.data || [];
  return apiCache[endpoint];
}

function ApiSearch({ value, onChange, endpoint, nameKey, iconKey, placeholder }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedName, setSelectedName] = useState("");
  const [selectedIcon, setSelectedIcon] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const loadItems = async () => {
    if (items.length > 0) return;
    setLoading(true);
    try { setItems(await fetchApi(endpoint)); } catch {} 
    setLoading(false);
  };

  useEffect(() => {
    if (value && items.length > 0) {
      const match = items.find(i => i.uuid === value);
      if (match) {
        setSelectedName(match[nameKey] || "");
        if (iconKey) setSelectedIcon(match[iconKey]);
      }
    }
  }, [value, items]);

  useEffect(() => { loadItems(); }, []);

  const filtered = query
    ? items.filter(i => (i[nameKey] || "").toLowerCase().includes(query.toLowerCase())).slice(0, 50)
    : items.slice(0, 50);

  return (
    <div className="relative" ref={ref}>
      <div className="flex items-center gap-1.5">
        {selectedIcon && <img src={selectedIcon} alt="" className="w-6 h-6 rounded object-cover shrink-0" />}
        <input
          value={open ? query : (selectedName || "")}
          onChange={e => { setQuery(e.target.value); if (!open) setOpen(true); }}
          onFocus={() => { setOpen(true); setQuery(""); loadItems(); }}
          placeholder={placeholder}
          className={inputClass}
        />
        {value && (
          <button onClick={() => { onChange(""); setSelectedName(""); setSelectedIcon(null); setQuery(""); }}
            className="text-text-muted hover:text-text-secondary text-xs shrink-0 px-1">✕</button>
        )}
      </div>
      {open && (
        <div className="absolute z-50 mt-1 left-0 right-0 bg-base-800 border border-border rounded-lg shadow-xl max-h-52 overflow-y-auto">
          {loading && <p className="text-[10px] text-text-muted text-center py-3">Loading...</p>}
          {!loading && filtered.length === 0 && <p className="text-[10px] text-text-muted text-center py-3">No results</p>}
          {filtered.map(item => (
            <button key={item.uuid} onClick={() => {
              onChange(item.uuid);
              setSelectedName(item[nameKey] || "");
              if (iconKey) setSelectedIcon(item[iconKey]);
              setOpen(false);
              setQuery("");
            }}
              className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-xs font-body hover:bg-base-600 transition-colors ${item.uuid === value ? "bg-base-600 text-text-primary" : "text-text-secondary"}`}
            >
              {iconKey && item[iconKey] && <img src={item[iconKey]} alt="" className="w-5 h-5 rounded object-cover shrink-0" />}
              <span className="truncate">{item[nameKey] || "(unnamed)"}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function FakeStatusPage({ connected, showLogsSetting }) {
  const [xmppStatus, setXmppStatus] = useState(null);
  const [active, setActive] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectingMsg, setConnectingMsg] = useState("");
  const [error, setError] = useState(null);
  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState([]);
  const [logFilter, setLogFilter] = useState("all");
  const logEndRef = useRef(null);
  const pollRef = useRef(null);
  const sendRef = useRef(null);
  const presenceRef = useRef(null);
  const cancelRef = useRef(false);

  const [presence, setPresence] = useState({
    sessionLoopState: "MENUS",
    queueId: "unrated",
    partyOwnerMatchScoreAllyTeam: 0,
    partyOwnerMatchScoreEnemyTeam: 0,
    maxPartySize: 5,
    partySize: 1,
    accountLevel: 1,
    competitiveTier: 0,
    leaderboardPosition: 0,
    premierDivision: 0,
    rosterName: "",
    playerCardId: "",
    playerTitleId: "",
  });

  const update = (key, val) => setPresence(p => ({ ...p, [key]: val }));
  presenceRef.current = presence;

  useEffect(() => {
    const cfg = loadConfig();
    if (cfg) {
      const { showTag, premierTag, ...clean } = cfg;
      setPresence(p => ({ ...p, ...clean }));
    }
  }, []);

  useEffect(() => { saveConfig(presence); }, [presence]);

  const fetchStatus = async () => {
    try {
      const raw = await invoke("xmpp_get_status");
      setXmppStatus(JSON.parse(raw));
    } catch {}
  };

  const fetchLogs = async () => {
    try {
      const raw = await invoke("xmpp_get_logs");
      setLogs(JSON.parse(raw));
    } catch {}
  };

  const poll = async () => {
    try {
      await invoke("xmpp_poll");
      await fetchLogs();
      await fetchStatus();
    } catch {}
  };

  const hasResumed = useRef(false);

  useEffect(() => { fetchStatus(); }, []);

  useEffect(() => {
    if (!hasResumed.current && xmppStatus?.connected) {
      hasResumed.current = true;
      setActive(true);
    }
  }, [xmppStatus]);

  useEffect(() => {
    if (xmppStatus?.connected) {
      pollRef.current = setInterval(poll, 2000);
      return () => clearInterval(pollRef.current);
    }
  }, [xmppStatus?.connected]);

  useEffect(() => {
    if (showLogs) logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs.length, showLogs]);

  const sendPresence = async () => {
    const data = { ...presenceRef.current, show: "chat" };
    await invoke("xmpp_send_fake_presence", { presenceJson: JSON.stringify(data) });
  };

  const handleToggle = async (enable) => {
    setError(null);
    if (enable) {
      cancelRef.current = false;
      setConnecting(true);
      setConnectingMsg("Establishing XMPP connection...");
      try {
        if (!xmppStatus?.connected) {
          await invoke("xmpp_connect");
          if (cancelRef.current) {
            try { await invoke("xmpp_disconnect"); } catch {}
            setConnecting(false);
            return;
          }
          await fetchStatus();
          await fetchLogs();
        }
        if (cancelRef.current) { setConnecting(false); return; }
        await sendPresence();
        setActive(true);
      } catch (e) {
        const errMsg = typeof e === "string" ? e : e?.message || "Failed to enable";
        if (errMsg.toLowerCase().includes("jwt") || errMsg.toLowerCase().includes("token") || errMsg.includes("auth failed") || errMsg.includes("not-authorized")) {
          try {
            setConnectingMsg("Refreshing access token...");
            await invoke("xmpp_disconnect").catch(() => {});
            await invoke("connect");
            if (cancelRef.current) { setConnecting(false); return; }
            setConnectingMsg("Reconnecting to XMPP...");
            await invoke("xmpp_connect");
            if (cancelRef.current) {
              try { await invoke("xmpp_disconnect"); } catch {}
              setConnecting(false);
              return;
            }
            await fetchStatus();
            await fetchLogs();
            await sendPresence();
            setActive(true);
          } catch (retryErr) {
            setError("Token refresh failed: " + (typeof retryErr === "string" ? retryErr : retryErr?.message || "Unknown error"));
            await fetchLogs();
          }
        } else {
          setError(errMsg);
          await fetchLogs();
        }
      }
      setConnecting(false);
    } else {
      setActive(false);
      clearInterval(sendRef.current);
      try {
        await invoke("xmpp_disconnect");
        await fetchStatus();
      } catch {}
    }
  };

  const handleCancelConnect = async () => {
    cancelRef.current = true;
    try { await invoke("xmpp_disconnect"); } catch {}
    setConnecting(false);
    await fetchStatus();
  };

  const startInterval = () => {
    clearInterval(sendRef.current);
    sendRef.current = setInterval(() => sendPresence().catch(() => {}), 3000);
  };

  useEffect(() => {
    if (active && xmppStatus?.connected) {
      startInterval();
      return () => clearInterval(sendRef.current);
    }
    return () => clearInterval(sendRef.current);
  }, [active, xmppStatus?.connected]);

  useEffect(() => {
    if (active && xmppStatus?.connected) {
      sendPresence().then(() => startInterval()).catch(() => {});
    }
  }, [presence]);

  if (!connected) {
    return (
      <div className="flex-1 flex items-center justify-center p-5">
        <div className="text-center space-y-2">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-text-muted mx-auto">
            <circle cx="12" cy="12" r="2" />
            <path d="M16.24 7.76a6 6 0 010 8.49m-8.48-.01a6 6 0 010-8.49" />
            <path d="M19.07 4.93a10 10 0 010 14.14m-14.14 0a10 10 0 010-14.14" />
          </svg>
          <p className="text-sm font-display text-text-muted">Connect to Riot first</p>
        </div>
      </div>
    );
  }

  return (
    <>
    {connecting && (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 mx-auto border-2 border-val-red/30 border-t-val-red rounded-full animate-spin" />
          <div className="space-y-1">
            <p className="text-sm font-display font-semibold text-white">Connecting</p>
            <p className="text-xs font-body text-white/60">{connectingMsg}</p>
          </div>
          <button onClick={handleCancelConnect}
            className="px-6 py-2 rounded-lg bg-white/10 border border-white/20 text-xs font-display font-semibold text-white/80 hover:text-white hover:bg-white/15 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    )}
    <div className="flex-1 flex flex-col min-h-0 p-4 gap-3">
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-text-muted">
            <circle cx="12" cy="12" r="2" />
            <path d="M16.24 7.76a6 6 0 010 8.49m-8.48-.01a6 6 0 010-8.49" />
            <path d="M19.07 4.93a10 10 0 010 14.14m-14.14 0a10 10 0 010-14.14" />
          </svg>
          <h2 className="text-sm font-display font-semibold text-text-primary">Fake Status</h2>
        </div>
        <div className="flex items-center gap-2">
          {showLogsSetting && (
            <button onClick={() => { setShowLogs(v => !v); if (!showLogs) fetchLogs(); }}
              className={`px-2.5 py-1.5 rounded-lg border text-xs font-display font-semibold transition-colors ${showLogs ? "bg-accent-blue/15 border-accent-blue/30 text-accent-blue" : "bg-base-600 border-border text-text-muted hover:text-text-secondary"}`}
            >
              Logs
            </button>
          )}
          <span className={`text-xs font-display tracking-wide ${active ? "text-val-red" : "text-text-muted"}`}>
            {active ? "Active" : "Inactive"}
          </span>
          <Toggle enabled={active} onChange={handleToggle} disabled={!connected} />
        </div>
      </div>

      {error && (
        <div className="px-3 py-2 rounded-lg bg-status-red/10 border border-status-red/20 text-xs font-body text-status-red shrink-0">{error}</div>
      )}

      {!showLogs && (
        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          <div className="p-4 rounded-xl bg-base-700 border border-border space-y-4">
            <h3 className="text-xs font-display font-medium text-text-secondary uppercase tracking-wider">Rank & Identity</h3>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Rank">
                <CustomSelect value={presence.competitiveTier} onChange={v => update("competitiveTier", v)} options={RANKS}
                  renderOption={r => <><img src={rankIcon(r.tier)} alt="" className="w-5 h-5" />{r.name}</>}
                />
              </Field>
              <Field label="Rank #">
                <input type="number" min={0} value={presence.leaderboardPosition} onChange={e => update("leaderboardPosition", Number(e.target.value))} placeholder="0" className={inputClass} />
              </Field>
              <Field label="Account Level">
                <input type="number" min={1} max={999} value={presence.accountLevel} onChange={e => update("accountLevel", Number(e.target.value))} className={inputClass} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Card">
                <ApiSearch value={presence.playerCardId} onChange={v => update("playerCardId", v)} endpoint="playercards" nameKey="displayName" iconKey="smallArt" placeholder="Search card..." />
              </Field>
              <Field label="Nametag">
                <ApiSearch value={presence.playerTitleId} onChange={v => update("playerTitleId", v)} endpoint="playertitles" nameKey="titleText" placeholder="Search title..." />
              </Field>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-base-700 border border-border space-y-4">
            <h3 className="text-xs font-display font-medium text-text-secondary uppercase tracking-wider">Game State</h3>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Session State">
                <CustomSelect value={presence.sessionLoopState} onChange={v => update("sessionLoopState", v)} options={SESSION_STATES}
                  renderOption={s => s.name}
                />
              </Field>
              <Field label="Queue">
                <CustomSelect value={presence.queueId} onChange={v => update("queueId", v)} options={QUEUES}
                  renderOption={q => q.label}
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Party Size">
                <input type="number" min={0} max={5} value={presence.partySize} onChange={e => update("partySize", Math.min(5, Math.max(0, Number(e.target.value))))} className={inputClass} />
              </Field>
              <Field label="Max Party Size">
                <input type="number" min={0} max={5} value={presence.maxPartySize} onChange={e => update("maxPartySize", Math.min(5, Math.max(0, Number(e.target.value))))} className={inputClass} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Team Score">
                <input type="number" min={0} max={99} value={presence.partyOwnerMatchScoreAllyTeam} onChange={e => update("partyOwnerMatchScoreAllyTeam", Number(e.target.value))} className={inputClass} />
              </Field>
              <Field label="Enemy Score">
                <input type="number" min={0} max={99} value={presence.partyOwnerMatchScoreEnemyTeam} onChange={e => update("partyOwnerMatchScoreEnemyTeam", Number(e.target.value))} className={inputClass} />
              </Field>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-base-700 border border-border space-y-4">
            <h3 className="text-xs font-display font-medium text-text-secondary uppercase tracking-wider">Premier</h3>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Division Style">
                <CustomSelect value={presence.premierDivision} onChange={v => update("premierDivision", v)} options={PREMIER_DIVISIONS}
                  renderOption={d => <><span className="w-5 h-5 flex items-center justify-center rounded text-xs font-bold shrink-0" style={{ color: d.color }}>{d.icon}</span>{d.name}</>}
                />
              </Field>
              <Field label="Roster Name">
                <input value={presence.rosterName} onChange={e => update("rosterName", e.target.value)} placeholder="Team name..." className={inputClass} />
              </Field>
            </div>
          </div>
        </div>
      )}

      {showLogs && (
        <div className="flex-1 min-h-0 flex flex-col gap-2">
          <div className="flex-1 min-h-0 rounded-xl bg-base-800 border border-border overflow-hidden flex flex-col">
            <div className="px-3 py-2 border-b border-border flex items-center justify-between shrink-0">
              <p className="text-xs font-display font-medium text-text-secondary">XMPP Log</p>
              <div className="flex items-center gap-2">
                {["all", "own_presence", "debug", "sent", "system"].map(f => (
                  <button key={f} onClick={() => setLogFilter(f)} className={`text-[9px] font-mono px-1.5 py-0.5 rounded border transition-colors ${
                    logFilter === f ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" : "text-text-muted border-transparent hover:text-text-secondary"
                  }`}>{f}</button>
                ))}
                <span className="text-[10px] font-body text-text-muted">{logs.length}</span>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1 font-mono text-[11px]">
              {logs.length === 0 && <p className="text-text-muted text-center py-8 font-body text-xs">No logs yet</p>}
              {logs.filter(l => logFilter === "all" || l.direction === logFilter).map((log, i) => (
                <div key={i} className={`flex items-start gap-2 px-2 py-1 rounded hover:bg-base-700/50 ${log.direction === "own_presence" ? "bg-yellow-500/5 border-l-2 border-yellow-500/40" : ""}`}>
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase border shrink-0 ${
                    { sent: "bg-accent-blue/20 text-accent-blue border-accent-blue/30", recv: "bg-status-green/20 text-status-green border-status-green/30", system: "bg-val-red/20 text-val-red border-val-red/30", error: "bg-status-red/20 text-status-red border-status-red/30", own_presence: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30", debug: "bg-purple-500/20 text-purple-400 border-purple-500/30" }[log.direction] || "bg-val-red/20 text-val-red border-val-red/30"
                  }`}>{log.direction}</span>
                  <span className="text-text-muted/50 shrink-0 text-[9px] tabular-nums leading-5">{new Date(log.timestamp).toLocaleTimeString()}</span>
                  <pre className="text-text-secondary whitespace-pre-wrap break-all leading-5 flex-1 select-all">{log.data}</pre>
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  );
}
