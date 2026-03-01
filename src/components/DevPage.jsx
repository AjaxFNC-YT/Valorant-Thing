import { useRef, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { invoke } from "@tauri-apps/api/core";

const TABS = [
  { id: "logs", label: "Logs" },
  { id: "gamelog", label: "Game Log" },
  { id: "notifs", label: "Notifications" },
  { id: "cloud", label: "Cloud" },
  { id: "state", label: "State" },
];

export default function DevPage({ logs, pushNotification, addLog, onClearLogs }) {
  const [tab, setTab] = useState("logs");

  return (
    <div className="flex-1 flex flex-col min-h-0 p-4 gap-3">
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-val-red">
            <polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" />
          </svg>
          <h1 className="text-sm font-display font-semibold text-text-primary">Developer Console</h1>
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0 border-b border-border pb-2">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 text-[11px] font-display font-medium rounded-md transition-colors ${
              tab === t.id
                ? "bg-val-red/20 text-val-red border border-val-red/40"
                : "text-text-muted hover:text-text-secondary"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "logs" && <LogsTab logs={logs} onClear={onClearLogs} />}
      {tab === "gamelog" && <GameLogTab />}
      {tab === "notifs" && <NotifsTab pushNotification={pushNotification} />}
      {tab === "cloud" && <CloudTab addLog={addLog} />}
      {tab === "state" && <StateTab />}
    </div>
  );
}

function LogsTab({ logs, onClear }) {
  const bottomRef = useRef(null);
  const [copied, setCopied] = useState(false);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs.length]);

  const filtered = filter === "all" ? logs : logs.filter(l => l.type === filter);

  const handleCopy = (log) => {
    const text = log.data
      ? `[${log.time}] ${log.message}\n${typeof log.data === "string" ? log.data : JSON.stringify(log.data, null, 2)}`
      : `[${log.time}] ${log.message}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const copyAll = () => {
    const text = filtered.map(l => {
      const base = `[${l.time}] [${(l.type || "info").toUpperCase()}] ${l.message}`;
      return l.data ? `${base}\n${typeof l.data === "string" ? l.data : JSON.stringify(l.data, null, 2)}` : base;
    }).join("\n");
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <>
      <div className="flex items-center gap-1.5 shrink-0">
        {["all", "info", "error", "match"].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-2 py-0.5 text-[10px] font-display font-medium rounded transition-colors ${
              filter === f ? "bg-base-500 text-text-primary" : "text-text-muted hover:text-text-secondary"
            }`}
          >
            {f.toUpperCase()}
          </button>
        ))}
        <div className="flex-1" />
        {copied && <span className="text-[10px] font-body text-status-green">Copied!</span>}
        <span className="text-[10px] font-body text-text-muted">{filtered.length}</span>
        <button onClick={copyAll} className="px-2 py-0.5 text-[10px] font-display font-medium rounded bg-base-600 text-text-muted hover:text-text-secondary transition-colors">
          Copy All
        </button>
        <button onClick={onClear} className="px-2 py-0.5 text-[10px] font-display font-medium rounded bg-status-red/20 text-status-red hover:bg-status-red/30 transition-colors">
          Clear
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden rounded-lg bg-base-800 border border-border font-mono">
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center h-full text-text-muted text-xs font-body">No logs yet.</div>
        ) : (
          <div className="p-2 space-y-px">
            {filtered.map((log, i) => (
              <div key={i} onClick={() => handleCopy(log)} className="text-[11px] leading-relaxed cursor-pointer rounded px-1.5 py-0.5 -mx-0.5 hover:bg-base-700/60 transition-colors break-all">
                <span className="text-text-muted/60">{log.time}</span>{" "}
                <span className={log.type === "error" ? "text-status-red font-semibold" : log.type === "match" ? "text-status-green font-semibold" : "text-accent-blue/70"}>
                  {(log.type || "info").toUpperCase()}
                </span>{" "}
                <span className="text-text-primary/90">{log.message}</span>
                {log.data && (
                  <pre className="mt-0.5 text-[10px] text-text-muted/50 whitespace-pre-wrap break-all max-h-32 overflow-y-auto pl-2 border-l border-border/30">
                    {typeof log.data === "string" ? log.data : JSON.stringify(log.data, null, 2)}
                  </pre>
                )}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>
    </>
  );
}

const MAX_LINES = 1000;
const POLL_MS = 2000;
const LOG_LEVEL_COLORS = {
  "Log": "text-text-primary/70",
  "Warning": "text-yellow-400",
  "Error": "text-status-red",
  "Display": "text-accent-blue/80",
};

function parseLogLevel(line) {
  if (line.includes(": Error:") || line.includes("LogError")) return "Error";
  if (line.includes(": Warning:") || line.includes("LogWarning")) return "Warning";
  if (line.includes(": Display:")) return "Display";
  return "Log";
}

function GameLogTab() {
  const [lines, setLines] = useState([]);
  const [search, setSearch] = useState("");
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState(null);
  const [fileSize, setFileSize] = useState(0);
  const [levelFilter, setLevelFilter] = useState("all");
  const offsetRef = useRef(0);
  const bottomRef = useRef(null);
  const containerRef = useRef(null);
  const autoScrollRef = useRef(true);
  const pausedRef = useRef(false);

  useEffect(() => { pausedRef.current = paused; }, [paused]);

  useEffect(() => {
    const handleScroll = () => {
      const el = containerRef.current;
      if (!el) return;
      autoScrollRef.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 40;
    };
    const el = containerRef.current;
    el?.addEventListener("scroll", handleScroll);
    return () => el?.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let initialized = false;
    const poll = async () => {
      if (cancelled) return;
      if (!pausedRef.current) {
        try {
          const res = await invoke("read_game_log", { offset: offsetRef.current });
          if (cancelled) return;
          setError(null);
          setFileSize(res.fileSize);
          if (!initialized) {
            initialized = true;
            offsetRef.current = res.offset;
          } else {
            if (res.text) {
              const newLines = res.text.split("\n").filter(l => l.length > 0);
              if (newLines.length > 0) {
                setLines(prev => {
                  const combined = [...prev, ...newLines];
                  return combined.length > MAX_LINES ? combined.slice(-MAX_LINES) : combined;
                });
              }
            }
            offsetRef.current = res.offset;
          }
        } catch (e) {
          if (!cancelled) setError(String(e));
        }
      }
      if (!cancelled) setTimeout(poll, POLL_MS);
    };
    poll();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (autoScrollRef.current && !paused) {
      bottomRef.current?.scrollIntoView({ behavior: "auto" });
    }
  }, [lines.length, paused]);

  const filtered = lines.filter(l => {
    if (levelFilter !== "all" && parseLogLevel(l) !== levelFilter) return false;
    if (search && !l.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  return (
    <>
      <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
        {["all", "Log", "Warning", "Error", "Display"].map(f => (
          <button
            key={f}
            onClick={() => setLevelFilter(f)}
            className={`px-2 py-0.5 text-[10px] font-display font-medium rounded transition-colors ${
              levelFilter === f ? "bg-base-500 text-text-primary" : "text-text-muted hover:text-text-secondary"
            }`}
          >
            {f === "all" ? "ALL" : f.toUpperCase()}
          </button>
        ))}
        <div className="flex-1" />
        <span className="text-[10px] font-body text-text-muted">{formatSize(fileSize)}</span>
        <span className="text-[10px] font-body text-text-muted">{filtered.length} lines</span>
        <button
          onClick={() => setPaused(p => !p)}
          className={`px-2 py-0.5 text-[10px] font-display font-medium rounded transition-colors ${
            paused ? "bg-status-green/20 text-status-green border border-status-green/40" : "bg-base-600 text-text-muted hover:text-text-secondary"
          }`}
        >
          {paused ? "Resume" : "Pause"}
        </button>
        <button
          onClick={async () => { setLines([]); try { const res = await invoke("read_game_log", { offset: 0 }); offsetRef.current = res.offset; } catch {} }}
          className="px-2 py-0.5 text-[10px] font-display font-medium rounded bg-status-red/20 text-status-red hover:bg-status-red/30 transition-colors"
        >
          Clear
        </button>
      </div>
      <div className="shrink-0">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Filter logs..."
          className="w-full px-2.5 py-1.5 bg-base-700 border border-border rounded text-xs font-body text-text-primary outline-none focus:border-val-red/60 transition-colors"
        />
      </div>
      <div ref={containerRef} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden rounded-lg bg-base-800 border border-border font-mono">
        {error ? (
          <div className="flex items-center justify-center h-full text-status-red text-xs font-body p-4 text-center">{error}</div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center h-full text-text-muted text-xs font-body">
            {lines.length === 0 ? "Waiting for ShooterGame.log..." : "No matching lines."}
          </div>
        ) : (
          <div className="p-2">
            {filtered.map((line, i) => {
              const level = parseLogLevel(line);
              return (
                <div
                  key={i}
                  className="text-[10px] leading-[1.6] px-1.5 py-px hover:bg-base-700/40 transition-colors rounded cursor-default select-text"
                >
                  <span className={LOG_LEVEL_COLORS[level] || "text-text-primary/70"}>{line}</span>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </div>
    </>
  );
}

const NOTIF_PRESETS = [
  {
    label: "Locking Agent",
    desc: "Countdown timer notification",
    build: () => ({ id: `dev-lock-${Date.now()}`, type: "locking", agentName: "Reyna", totalMs: 3000, startTime: Date.now() }),
  },
  {
    label: "Agent Locked",
    desc: "Success confirmation",
    build: () => ({ id: `dev-locked-${Date.now()}`, type: "locked", agentName: "Reyna" }),
  },
  {
    label: "Match Found (Competitive)",
    desc: "With map image, server, dodge keybind",
    build: () => ({
      id: `dev-match-${Date.now()}`, type: "match-found",
      mapName: "Ascent", mapImage: "https://media.valorant-api.com/maps/7eaecc1b-4337-bbf6-6ab9-04b8f06b3319/listviewicon.png",
      server: "US Central (Texas)", canDodge: true, dodgeKeybind: localStorage.getItem("dodge_keybind") || "Ctrl+D",
    }),
  },
  {
    label: "Match Found (Deathmatch)",
    desc: "No dodge option",
    build: () => ({
      id: `dev-match-${Date.now()}`, type: "match-found",
      mapName: "Breeze", mapImage: "https://media.valorant-api.com/maps/2fb9a4fd-47b8-4e7d-a969-74b4046ebd53/listviewicon.png",
      server: "US East (Virginia)", canDodge: false,
    }),
  },
  {
    label: "Dodged (Map)",
    desc: "Auto-dodged blacklisted map",
    build: () => ({ id: `dev-dodge-${Date.now()}`, type: "dodged", reason: "map", mapName: "Breeze" }),
  },
  {
    label: "Dodged (Keybind)",
    desc: "Manual dodge via keybind",
    build: () => ({ id: `dev-dodge-${Date.now()}`, type: "dodged", reason: "keybind", keybind: localStorage.getItem("dodge_keybind") || "Ctrl+D" }),
  },
  {
    label: "Dodged (Manual)",
    desc: "Button dodge",
    build: () => ({ id: `dev-dodge-${Date.now()}`, type: "dodged", reason: "manual" }),
  },
  {
    label: "Left Queue",
    desc: "Auto-unqueue after dodge",
    build: () => ({ id: `dev-queue-${Date.now()}`, type: "queue", action: "unqueue" }),
  },
  {
    label: "Requeued",
    desc: "Auto-requeue after match",
    build: () => ({ id: `dev-queue-${Date.now()}`, type: "queue", action: "requeue" }),
  },
];

function NotifsTab({ pushNotification }) {
  const [customAgent, setCustomAgent] = useState("Jett");
  const [customDelay, setCustomDelay] = useState(3000);
  const [sent, setSent] = useState(null);

  const send = (preset) => {
    const data = preset.build();
    if (data.agentName && data.type === "locking") {
      data.agentName = customAgent;
      data.totalMs = customDelay;
      data.startTime = Date.now();
    }
    if (data.agentName && data.type === "locked") {
      data.agentName = customAgent;
    }
    pushNotification(data);
    setSent(preset.label);
    setTimeout(() => setSent(null), 1500);
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto space-y-4">
      <div className="rounded-lg bg-base-800 border border-border p-3 space-y-3">
        <p className="text-[10px] font-display font-bold text-text-muted uppercase tracking-wider">Custom Values</p>
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <label className="text-[10px] font-body text-text-muted mb-1 block">Agent Name</label>
            <input value={customAgent} onChange={e => setCustomAgent(e.target.value)} className="w-full px-2.5 py-1.5 bg-base-700 border border-border rounded text-xs font-body text-text-primary outline-none focus:border-val-red/60 transition-colors" />
          </div>
          <div className="w-32">
            <label className="text-[10px] font-body text-text-muted mb-1 block">Lock Delay (ms)</label>
            <input type="number" value={customDelay} onChange={e => setCustomDelay(Number(e.target.value))} className="w-full px-2.5 py-1.5 bg-base-700 border border-border rounded text-xs font-body text-text-primary outline-none focus:border-val-red/60 transition-colors" />
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <p className="text-[10px] font-display font-bold text-text-muted uppercase tracking-wider">Notification Presets</p>
          {sent && <span className="text-[10px] font-body text-status-green">Sent: {sent}</span>}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {NOTIF_PRESETS.map(preset => (
            <button
              key={preset.label}
              onClick={() => send(preset)}
              className="text-left p-3 rounded-lg bg-base-800 border border-border hover:border-val-red/40 hover:bg-base-700 transition-colors group"
            >
              <p className="text-xs font-display font-medium text-text-primary group-hover:text-val-red transition-colors">{preset.label}</p>
              <p className="text-[10px] font-body text-text-muted mt-0.5">{preset.desc}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function CloudTab({ addLog }) {
  const [saveType, setSaveType] = useState("agent");
  const [saveData, setSaveData] = useState("{}");
  const [saveResult, setSaveResult] = useState(null);
  const [saveLoading, setSaveLoading] = useState(false);
  const [loadCode, setLoadCode] = useState("");
  const [loadResult, setLoadResult] = useState(null);
  const [loadLoading, setLoadLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSave = async () => {
    setError(null);
    setSaveResult(null);
    setSaveLoading(true);
    try {
      const data = JSON.parse(saveData);
      const code = await invoke("cloud_save", { saveType, data });
      setSaveResult(code);
      addLog?.("info", `[Dev] Cloud save: ${code}`);
    } catch (e) {
      setError(`Save failed: ${e.message}`);
    } finally { setSaveLoading(false); }
  };

  const handleLoad = async () => {
    setError(null);
    setLoadResult(null);
    setLoadLoading(true);
    try {
      const result = await invoke("cloud_load", { code: loadCode });
      setLoadResult(result);
      addLog?.("info", `[Dev] Cloud load: ${loadCode} → type=${result.type}`);
    } catch (e) {
      setError(`Load failed: ${e.message}`);
    } finally { setLoadLoading(false); }
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto space-y-4">
      <div className="rounded-lg bg-base-800 border border-border p-3 space-y-3">
        <p className="text-[10px] font-display font-bold text-text-muted uppercase tracking-wider">Save to Cloud</p>
        <div className="flex items-center gap-2">
          <select value={saveType} onChange={e => setSaveType(e.target.value)} className="px-2.5 py-1.5 bg-base-700 border border-border rounded text-xs font-body text-text-primary outline-none">
            <option value="agent">Agent Profile</option>
            <option value="theme">Theme</option>
            <option value="config">Config</option>
          </select>
          <button onClick={handleSave} disabled={saveLoading} className="px-3 py-1.5 rounded bg-val-red/20 border border-val-red/40 text-val-red text-xs font-display font-medium hover:bg-val-red/30 transition-colors disabled:opacity-50">
            {saveLoading ? "Saving..." : "Save"}
          </button>
        </div>
        <textarea value={saveData} onChange={e => setSaveData(e.target.value)} rows={4} className="w-full px-2.5 py-2 bg-base-700 border border-border rounded text-[11px] font-mono text-text-primary outline-none focus:border-val-red/60 transition-colors resize-none" placeholder='{"key": "value"}' />
        {saveResult && (
          <div className="flex items-center gap-2">
            <code className="text-xs font-mono text-status-green bg-status-green/10 px-2 py-1 rounded">{saveResult}</code>
            <button onClick={() => { navigator.clipboard.writeText(saveResult); }} className="text-[10px] font-body text-text-muted hover:text-text-secondary transition-colors">Copy</button>
          </div>
        )}
      </div>

      <div className="rounded-lg bg-base-800 border border-border p-3 space-y-3">
        <p className="text-[10px] font-display font-bold text-text-muted uppercase tracking-wider">Load from Cloud</p>
        <div className="flex items-center gap-2">
          <input value={loadCode} onChange={e => setLoadCode(e.target.value)} placeholder="VT-AGENT-XXXXX" className="flex-1 px-2.5 py-1.5 bg-base-700 border border-border rounded text-xs font-mono text-text-primary outline-none focus:border-val-red/60 transition-colors" />
          <button onClick={handleLoad} disabled={loadLoading || !loadCode.trim()} className="px-3 py-1.5 rounded bg-accent-blue/20 border border-accent-blue/40 text-accent-blue text-xs font-display font-medium hover:bg-accent-blue/30 transition-colors disabled:opacity-50">
            {loadLoading ? "Loading..." : "Load"}
          </button>
        </div>
        {loadResult && (
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-display font-bold text-text-muted uppercase">Type:</span>
              <span className="text-xs font-mono text-text-primary">{loadResult.type}</span>
            </div>
            <pre className="text-[10px] font-mono text-text-secondary bg-base-700 rounded p-2 max-h-48 overflow-auto whitespace-pre-wrap break-all">{JSON.stringify(loadResult.data, null, 2)}</pre>
          </div>
        )}
      </div>

      {error && <p className="text-xs font-body text-status-red">{error}</p>}
    </div>
  );
}

function StateTab() {
  const [entries, setEntries] = useState([]);
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState(false);
  const [editKey, setEditKey] = useState(null);
  const [editValue, setEditValue] = useState("");

  const refresh = () => {
    const items = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      items.push({ key, value: localStorage.getItem(key) });
    }
    items.sort((a, b) => a.key.localeCompare(b.key));
    setEntries(items);
  };

  useEffect(refresh, []);

  const filtered = search ? entries.filter(e => e.key.toLowerCase().includes(search.toLowerCase()) || e.value.toLowerCase().includes(search.toLowerCase())) : entries;

  const copyAll = () => {
    const obj = {};
    entries.forEach(e => { obj[e.key] = e.value; });
    navigator.clipboard.writeText(JSON.stringify(obj, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const startEdit = (key, value) => {
    setEditKey(key);
    setEditValue(value);
  };

  const saveEdit = () => {
    if (editKey) {
      localStorage.setItem(editKey, editValue);
      refresh();
      setEditKey(null);
    }
  };

  const deleteKey = (key) => {
    localStorage.removeItem(key);
    refresh();
  };

  const truncate = (str, len = 80) => str.length > len ? str.slice(0, len) + "..." : str;

  return (
    <>
      <div className="flex items-center gap-2 shrink-0">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Filter keys..." className="flex-1 px-2.5 py-1.5 bg-base-700 border border-border rounded text-xs font-body text-text-primary outline-none focus:border-val-red/60 transition-colors" />
        <span className="text-[10px] font-body text-text-muted">{filtered.length}/{entries.length}</span>
        {copied && <span className="text-[10px] font-body text-status-green">Copied!</span>}
        <button onClick={copyAll} className="px-2 py-1 text-[10px] font-display font-medium rounded bg-base-600 text-text-muted hover:text-text-secondary transition-colors">
          Export All
        </button>
        <button onClick={refresh} className="px-2 py-1 text-[10px] font-display font-medium rounded bg-base-600 text-text-muted hover:text-text-secondary transition-colors">
          Refresh
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto rounded-lg bg-base-800 border border-border">
        <div className="divide-y divide-border">
          {filtered.map(e => (
            <div key={e.key} className="px-3 py-2 hover:bg-base-700/50 transition-colors group">
              {editKey === e.key ? (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-mono text-val-red font-semibold">{e.key}</p>
                  <textarea value={editValue} onChange={ev => setEditValue(ev.target.value)} rows={3} className="w-full px-2 py-1.5 bg-base-700 border border-border rounded text-[10px] font-mono text-text-primary outline-none resize-none" />
                  <div className="flex gap-1.5">
                    <button onClick={saveEdit} className="px-2 py-0.5 text-[10px] font-display rounded bg-status-green/20 text-status-green border border-status-green/40 hover:bg-status-green/30 transition-colors">Save</button>
                    <button onClick={() => setEditKey(null)} className="px-2 py-0.5 text-[10px] font-display rounded bg-base-600 text-text-muted border border-border hover:text-text-secondary transition-colors">Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-mono text-val-red font-semibold">{e.key}</p>
                    <p className="text-[10px] font-mono text-text-muted mt-0.5 break-all">{truncate(e.value)}</p>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button onClick={() => { navigator.clipboard.writeText(e.value); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="px-1.5 py-0.5 text-[9px] font-display rounded bg-base-600 text-text-muted hover:text-text-secondary transition-colors">Copy</button>
                    <button onClick={() => startEdit(e.key, e.value)} className="px-1.5 py-0.5 text-[9px] font-display rounded bg-base-600 text-text-muted hover:text-text-secondary transition-colors">Edit</button>
                    <button onClick={() => deleteKey(e.key)} className="px-1.5 py-0.5 text-[9px] font-display rounded bg-status-red/20 text-status-red hover:bg-status-red/30 transition-colors">Del</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
