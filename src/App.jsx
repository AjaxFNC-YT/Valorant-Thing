import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import TitleBar from "./components/TitleBar";
import Sidebar from "./components/Sidebar";
import InstalockPage from "./components/InstalockPage";
import SettingsPage from "./components/SettingsPage";
import LogsPage from "./components/LogsPage";
import MapDodgePage from "./components/MapDodgePage";
import MatchInfoPage from "./components/MatchInfoPage";
import PartyPage from "./components/PartyPage";
import MiscPage from "./components/MiscPage";
import FakeStatusPage from "./components/FakeStatusPage";

const CUSTOM_VARS = ['--base-900','--base-800','--base-700','--base-600','--base-500','--base-400','--border','--border-light','--val-red','--val-red-dark','--accent-blue','--accent-blue-dark'];

function hexToRgb(hex) {
  return [parseInt(hex.slice(1,3),16), parseInt(hex.slice(3,5),16), parseInt(hex.slice(5,7),16)];
}

const DEFAULT_CUSTOM = {
  accent: "#e94560",
  angle: 135,
  stops: [
    { color: "#0a0a14", pos: 0 },
    { color: "#1a1a2e", pos: 50 },
    { color: "#e94560", pos: 100 },
  ],
};

function deriveCustomVars(ct) {
  const darkest = [...ct.stops].sort((a, b) => {
    const [ar, ag, ab] = hexToRgb(a.color);
    const [br2, bg2, bb2] = hexToRgb(b.color);
    return (ar + ag + ab) - (br2 + bg2 + bb2);
  })[0];
  const [br, bg, bb] = hexToRgb(darkest.color);
  const [ar, ag, ab] = hexToRgb(ct.accent);
  const t = 0.08;
  const mix = (r, g, b) => `${Math.round(r+(ar-r)*t)} ${Math.round(g+(ag-g)*t)} ${Math.round(b+(ab-b)*t)}`;
  const sc = (f) => [Math.min(255,Math.round(br*f)), Math.min(255,Math.round(bg*f)), Math.min(255,Math.round(bb*f))];
  const s = (f) => { const c = sc(f); return mix(...c); };
  return {
    '--base-900': s(0.5),
    '--base-800': mix(br, bg, bb),
    '--base-700': s(1.3),
    '--base-600': s(1.7),
    '--base-500': s(2.2),
    '--base-400': s(2.8),
    '--border': s(3.3),
    '--border-light': s(4.0),
    '--val-red': `${ar} ${ag} ${ab}`,
    '--val-red-dark': `${Math.round(ar*0.82)} ${Math.round(ag*0.82)} ${Math.round(ab*0.82)}`,
    '--accent-blue': `${ar} ${ag} ${ab}`,
    '--accent-blue-dark': `${Math.round(ar*0.82)} ${Math.round(ag*0.82)} ${Math.round(ab*0.82)}`,
  };
}

function buildGradientCSS(ct) {
  const stops = [...ct.stops].sort((a, b) => a.pos - b.pos);
  return `linear-gradient(${ct.angle}deg, ${stops.map(s => `${s.color} ${s.pos}%`).join(", ")})`;
}

function formatTimeLeft(ageSecs) {
  const left = Math.max(0, 3600 - ageSecs);
  const m = Math.floor(left / 60);
  const s = left % 60;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

const RECONNECT_INTERVAL = 3000;
const HEALTH_CHECK_INTERVAL = 10000;
const MATCH_POLL_INTERVAL = 3000;

export default function App() {
  const [status, setStatus] = useState("waiting");
  const [player, setPlayer] = useState(null);
  const [activeTab, setActiveTab] = useState("instalock");
  const [showLogs, setShowLogs] = useState(() => localStorage.getItem("show_logs") === "true");
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem("app_theme");
    if (!saved || saved === "default") return "crimson-moon";
    return saved;
  });
  const [simplifiedTheme, setSimplifiedTheme] = useState(() => localStorage.getItem("simplified_theme") === "true");
  const [customTheme, setCustomTheme] = useState(() => {
    try { const s = localStorage.getItem("custom_theme"); return s ? JSON.parse(s) : DEFAULT_CUSTOM; }
    catch { return DEFAULT_CUSTOM; }
  });
  const [discordRpc, setDiscordRpc] = useState(() => localStorage.getItem("discord_rpc") !== "false");
  const [startWithWindows, setStartWithWindows] = useState(() => localStorage.getItem("start_with_windows") === "true");
  const [startMinimized, setStartMinimized] = useState(() => localStorage.getItem("start_minimized") === "true");
  const [minimizeToTray, setMinimizeToTray] = useState(() => localStorage.getItem("minimize_to_tray") === "true");
  const [logs, setLogs] = useState([]);
  const [instalockActive, setInstalockActive] = useState(false);
  const [henrikApiKey, setHenrikApiKey] = useState(() => localStorage.getItem("henrik_api_key") || "");
  const [mapDodgeActive, setMapDodgeActive] = useState(() => {
    try {
      const cfg = JSON.parse(localStorage.getItem("mapdodge-config"));
      return cfg?.active || false;
    } catch { return false; }
  });
  const [pregameMatchId, setPregameMatchId] = useState(null);
  const [autoUnqueue, setAutoUnqueue] = useState(() => localStorage.getItem("auto_unqueue") === "true");
  const [autoRequeue, setAutoRequeue] = useState(() => localStorage.getItem("auto_requeue") === "true");
  const [selectDelay, setSelectDelay] = useState(() => {
    const saved = localStorage.getItem("instalock_select_delay");
    return saved ? parseInt(saved, 10) : 0;
  });
  const [lockDelay, setLockDelay] = useState(() => {
    const saved = localStorage.getItem("instalock_lock_delay");
    return saved ? parseInt(saved, 10) : 500;
  });
  const connectingRef = useRef(false);
  const instalockConfigRef = useRef({ maps: [], selectedAgent: null, perMapSelections: {} });
  const lockedMatchRef = useRef(null);
  const lockedAgentNameRef = useRef(null);
  const selectDelayRef = useRef(selectDelay);
  const lockDelayRef = useRef(lockDelay);
  const lastLogKeyRef = useRef(null);
  const mapDodgeRef = useRef((() => {
    try {
      const cfg = JSON.parse(localStorage.getItem("mapdodge-config"));
      return { blacklist: new Set(cfg?.blacklist || []), maps: [] };
    } catch { return { blacklist: new Set(), maps: [] }; }
  })());
  const dodgedMatchRef = useRef(null);
  const mapDodgeActiveRef = useRef(mapDodgeActive);
  const gamePhaseRef = useRef(null);
  const rpcMatchInfoRef = useRef(null);
  const autoUnqueueRef = useRef(autoUnqueue);
  const autoRequeueRef = useRef(autoRequeue);
  const pendingUnqueueRef = useRef(false);
  const pendingRequeueRef = useRef(false);

  useEffect(() => {
    if (startMinimized) {
      const win = getCurrentWindow();
      win.hide();
      import("@tauri-apps/plugin-notification").then(({ sendNotification }) => {
        sendNotification({ title: "Valorant Thing", body: "Started in system tray." });
      }).catch(() => {});
    }
  }, []);

  useEffect(() => { mapDodgeActiveRef.current = mapDodgeActive; }, [mapDodgeActive]);
  useEffect(() => { autoUnqueueRef.current = autoUnqueue; localStorage.setItem("auto_unqueue", String(autoUnqueue)); }, [autoUnqueue]);
  useEffect(() => { autoRequeueRef.current = autoRequeue; localStorage.setItem("auto_requeue", String(autoRequeue)); }, [autoRequeue]);

  useEffect(() => {
    localStorage.setItem("discord_rpc", String(discordRpc));
    if (discordRpc) {
      invoke("start_discord_rpc")
        .then(() => addLog("info", "[Discord] RPC connected"))
        .catch((e) => addLog("error", `[Discord] RPC start failed: ${e}`));
    } else {
      invoke("stop_discord_rpc").catch(() => {});
    }
  }, [discordRpc]);

  useEffect(() => {
    if (!discordRpc) return;
    const buildRpc = () => {
      let details = "In Lobby";
      let rpcState = "";

      if (status === "disconnected") {
        details = "Idle";
        rpcState = "App Open";
      } else if (status === "connecting") {
        details = "Connecting...";
      } else if (status === "waiting") {
        details = "Waiting for Valorant";
      } else if (status === "connected") {
        const phase = gamePhaseRef.current;
        const mi = rpcMatchInfoRef.current;
        const features = [];

        if (instalockActive) {
          const cfg = instalockConfigRef.current;
          const agentNames = new Set();
          if (cfg?.selectedAgent?.displayName && cfg.selectedAgent.displayName !== "none") {
            agentNames.add(cfg.selectedAgent.displayName);
          }
          if (cfg?.perMapSelections) {
            Object.values(cfg.perMapSelections).forEach((a) => {
              if (a?.displayName && a.displayName !== "none") agentNames.add(a.displayName);
            });
          }
          if (agentNames.size === 1) features.push(`Autolock: ${[...agentNames][0]}`);
          else if (agentNames.size > 1) features.push(`Autolocking ${agentNames.size} agents`);
        }
        if (mapDodgeActive) {
          const count = mapDodgeRef.current?.blacklist?.size || 0;
          if (count > 0) features.push(`Dodging ${count} map${count !== 1 ? "s" : ""}`);
        }

        if (phase === "pregame") {
          details = lockedAgentNameRef.current ? `Locked ${lockedAgentNameRef.current}` : "Agent Select";
          rpcState = features.length > 0 ? features.join(" · ") : "Picking agents...";
        } else if (phase === "ingame" && mi) {
          if (mi.isDeathmatch) {
            details = `In Game — ${mi.mode}`;
          } else {
            details = `In Game — ${mi.allyScore} - ${mi.enemyScore}`;
          }
          rpcState = mi.mode;
        } else {
          details = "In Lobby";
          rpcState = features.length > 0 ? features.join(" · ") : "Waiting for match";
        }
      }

      invoke("update_discord_rpc", {
        details, rpcState,
        largeImage: "valorant", largeText: "Valorant",
        smallImage: "logo", smallText: "Valorant Thing",
      }).catch(() => {});
    };
    buildRpc();
    const interval = setInterval(buildRpc, 5000);
    return () => clearInterval(interval);
  }, [status, discordRpc, instalockActive, mapDodgeActive]);

  useEffect(() => { selectDelayRef.current = selectDelay; localStorage.setItem("instalock_select_delay", selectDelay); }, [selectDelay]);
  useEffect(() => { localStorage.setItem("henrik_api_key", henrikApiKey); }, [henrikApiKey]);
  useEffect(() => { lockDelayRef.current = lockDelay; localStorage.setItem("instalock_lock_delay", lockDelay); }, [lockDelay]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("app_theme", theme);
    if (theme !== "custom") {
      CUSTOM_VARS.forEach(v => document.documentElement.style.removeProperty(v));
    }
  }, [theme]);

  useEffect(() => {
    if (theme !== "custom") return;
    const vars = customTheme.vars || deriveCustomVars(customTheme);
    Object.entries(vars).forEach(([k, v]) => document.documentElement.style.setProperty(k, v));
    localStorage.setItem("custom_theme", JSON.stringify(customTheme));
  }, [theme, customTheme]);

  const addLog = useCallback((type, message, data) => {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev.slice(-200), { time, type, message, data }]);
  }, []);

  const [showRefreshModal, setShowRefreshModal] = useState(false);
  const [tokenAge, setTokenAge] = useState(0);

  const doConnect = async () => {
    if (connectingRef.current) return;
    connectingRef.current = true;
    setStatus("connecting");
    addLog("info", "[Connect] Attempting to connect to Riot Client...");
    try {
      const info = await invoke("connect");
      setPlayer(info);
      setStatus("connected");
      addLog("info", `[Connect] Connected as ${info.game_name}#${info.game_tag} (${info.puuid?.slice(0,8)}...)`);
      if (info.rso_debug) {
        try { addLog("info", "RSO Userinfo (auth.riotgames.com/userinfo)", JSON.parse(info.rso_debug)); } catch { addLog("info", "RSO Userinfo", info.rso_debug); }
      }
      if (info.loadout_debug) {
        try { addLog("info", "PD Player Loadout (playerloadout)", JSON.parse(info.loadout_debug)); } catch { addLog("info", "PD Player Loadout", info.loadout_debug); }
      }
    } catch (err) {
      const errMsg = typeof err === "string" ? err : err?.message || String(err);
      addLog("error", `[Connect] Failed: ${errMsg}`);
      console.error("[connect]", err);
      setStatus("waiting");
    } finally {
      connectingRef.current = false;
    }
  };

  useEffect(() => {
    if (!showRefreshModal) return;
    const id = setInterval(() => setTokenAge((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [showRefreshModal]);

  const handleRefreshClick = async () => {
    if (status !== "connected") {
      doConnect();
      return;
    }
    try {
      const age = await invoke("get_token_age");
      setTokenAge(Number(age));
    } catch { setTokenAge(0); }
    setShowRefreshModal(true);
  };

  const confirmRefresh = () => {
    setShowRefreshModal(false);
    setPlayer(null);
    setStatus("waiting");
  };

  useEffect(() => {
    if (status !== "waiting") return;
    let cancelled = false;
    addLog("info", "[Connect] Waiting for Valorant process...");
    const check = async () => {
      if (cancelled) return;
      try {
        const running = await invoke("is_valorant_running");
        if (running && !cancelled) {
          addLog("info", "[Connect] Valorant detected, connecting...");
          doConnect();
        }
      } catch (err) {
        const errMsg = typeof err === "string" ? err : err?.message || String(err);
        addLog("error", `[Connect] is_valorant_running check failed: ${errMsg}`);
      }
    };
    check();
    const timer = setInterval(check, RECONNECT_INTERVAL);
    return () => { cancelled = true; clearInterval(timer); };
  }, [status]);

  useEffect(() => {
    if (status !== "connected") return;
    const check = async () => {
      try {
        const info = await invoke("health_check");
        if (info) {
          setPlayer(info);
        } else {
          addLog("error", "[Health] Riot Client API returned null — connection lost");
          setPlayer(null);
          setStatus("waiting");
        }
      } catch (err) {
        const errMsg = typeof err === "string" ? err : err?.message || String(err);
        addLog("error", `[Health] Health check failed: ${errMsg}`);
        setPlayer(null);
        setStatus("waiting");
      }
    };
    const timer = setInterval(check, HEALTH_CHECK_INTERVAL);
    return () => clearInterval(timer);
  }, [status]);

  useEffect(() => {
    if ((!instalockActive && !mapDodgeActive) || status !== "connected") return;
    let cancelled = false;

    const logOnce = (key, type, message, data) => {
      if (lastLogKeyRef.current === key) return;
      lastLogKeyRef.current = key;
      addLog(type, message, data);
    };

    const poll = async () => {
      if (cancelled) return;
      try {
        const raw = await invoke("check_current_game");
        const match = JSON.parse(raw);
        const phase = match._phase === "pregame" ? "PREGAME" : "INGAME";
        const matchId = match.ID || match.MatchID;
        logOnce(`match:${matchId}:${phase}`, "match", `[${phase}] Match ${matchId} — Map: ${match.MapID}`, raw);

        const currentPhase = match._phase === "pregame" ? "pregame" : "ingame";
        gamePhaseRef.current = currentPhase;

        if (currentPhase === "ingame") {
          const myPuuid = player?.puuid;
          const me = (match.Players || []).find((p) => p.Subject === myPuuid);
          const myTeam = me?.TeamID;
          const blueTeam = (match.Teams || []).find((t) => t.TeamID === "Blue");
          const redTeam = (match.Teams || []).find((t) => t.TeamID === "Red");
          const allyScore = myTeam === "Blue" ? (blueTeam?.RoundsWon ?? 0) : (redTeam?.RoundsWon ?? 0);
          const enemyScore = myTeam === "Blue" ? (redTeam?.RoundsWon ?? 0) : (blueTeam?.RoundsWon ?? 0);
          const modeUrl = match.GameMode || "";
          const queueId = match.MatchmakingData?.QueueID || match.QueueID || "";
          let mode = "Custom";
          if (modeUrl.includes("competitive") || queueId === "competitive") mode = "Competitive";
          else if (modeUrl.includes("unrated") || queueId === "unrated") mode = "Unrated";
          else if (modeUrl.includes("deathmatch") || queueId === "deathmatch") mode = "Deathmatch";
          else if (modeUrl.includes("spikerush") || queueId === "spikerush") mode = "Spike Rush";
          else if (modeUrl.includes("swiftplay") || queueId === "swiftplay") mode = "Swiftplay";
          else if (modeUrl.includes("ggteam") || queueId === "ggteam") mode = "Escalation";
          else if (queueId === "premier") mode = "Premier";
          rpcMatchInfoRef.current = { allyScore, enemyScore, mode, isDeathmatch: mode === "Deathmatch" };
        } else {
          rpcMatchInfoRef.current = null;
        }

        if (match._phase === "pregame") {
          setPregameMatchId(matchId);

          if (mapDodgeActiveRef.current && dodgedMatchRef.current !== matchId) {
            const dodgeCfg = mapDodgeRef.current;
            if (dodgeCfg.blacklist.has(match.MapID)) {
              dodgedMatchRef.current = matchId;
              addLog("info", `Map blacklisted — auto-dodging ${match.MapID}`);
              try {
                await invoke("pregame_quit", { matchId });
                addLog("match", "Auto-dodged blacklisted map!");
                setPregameMatchId(null);
                lockedMatchRef.current = null;
              } catch (dodgeErr) {
                const dodgeMsg = typeof dodgeErr === "string" ? dodgeErr : dodgeErr?.message || "Dodge failed";
                addLog("error", `Auto-dodge failed: ${dodgeMsg}`);
              }
              if (!cancelled) setTimeout(poll, MATCH_POLL_INTERVAL);
              return;
            }
          }

          if (instalockActive && lockedMatchRef.current !== matchId && match.PregameState === "character_select_active") {
            const cfg = instalockConfigRef.current;
            const mapEntry = cfg.maps.find((m) => m.mapUrl === match.MapID);
            const agent = mapEntry
              ? (cfg.perMapSelections[mapEntry.uuid] || cfg.selectedAgent)
              : cfg.selectedAgent;

            if (agent && agent.uuid === "none") {
              lockedMatchRef.current = matchId;
              logOnce(`none:${matchId}`, "info", "Instalock disabled for this map (None selected)");
            } else if (agent) {
              lockedMatchRef.current = matchId;
              const sd = selectDelayRef.current;
              const ld = lockDelayRef.current;
              addLog("info", `Selecting ${agent.displayName} in ${sd}ms`);
              await new Promise((r) => setTimeout(r, sd));
              if (cancelled) return;
              await invoke("select_agent", { matchId, agentId: agent.uuid });
              addLog("info", `Selected — locking in ${ld}ms`);
              await new Promise((r) => setTimeout(r, ld));
              if (cancelled) return;
              await invoke("lock_agent", { matchId, agentId: agent.uuid });
              lockedAgentNameRef.current = agent.displayName;
              addLog("match", `Locked ${agent.displayName}!`);
            } else {
              logOnce(`noagent:${matchId}`, "info", "No agent configured for this map");
            }
          }
        } else {
          setPregameMatchId(null);
        }
      } catch (err) {
        const msg = typeof err === "string" ? err : err?.message || "Unknown error";
        if (!msg.includes("Not in a match")) {
          addLog("error", msg);
        } else {
          const prevPhase = gamePhaseRef.current;
          gamePhaseRef.current = null;

          if (prevPhase === "pregame" && autoUnqueueRef.current) {
            addLog("info", `[Misc] Dodge detected (phase: ${prevPhase} → none) — waiting for confirmed out-of-match`);
            pendingUnqueueRef.current = true;
          } else if (prevPhase === "pregame") {
            addLog("info", `[Misc] Dodge detected but auto-unqueue is off`);
          }
          if (prevPhase === "ingame" && autoRequeueRef.current) {
            addLog("info", `[Misc] Match ended (phase: ${prevPhase} → none) — waiting for confirmed out-of-match`);
            pendingRequeueRef.current = true;
          } else if (prevPhase === "ingame") {
            addLog("info", `[Misc] Match ended but auto-requeue is off`);
          }

          if (!prevPhase && pendingUnqueueRef.current) {
            pendingUnqueueRef.current = false;
            addLog("info", "[Misc] Confirmed out-of-match — leaving queue");
            invoke("leave_queue")
              .then(() => addLog("info", "[Misc] Successfully left queue after dodge"))
              .catch((e) => addLog("error", `[Misc] Failed to leave queue: ${e}`));
          }
          if (!prevPhase && pendingRequeueRef.current) {
            pendingRequeueRef.current = false;
            addLog("info", "[Misc] Confirmed out-of-match — requeuing");
            invoke("enter_queue")
              .then(() => addLog("info", "[Misc] Successfully requeued after match"))
              .catch((e) => addLog("error", `[Misc] Failed to requeue: ${e}`));
          }

          logOnce("not_in_match", "info", "Not in a match");
          setPregameMatchId(null);
          lockedMatchRef.current = null;
          lockedAgentNameRef.current = null;
          rpcMatchInfoRef.current = null;
          dodgedMatchRef.current = null;
        }
      }
      if (!cancelled) setTimeout(poll, MATCH_POLL_INTERVAL);
    };
    poll();
    return () => { cancelled = true; };
  }, [instalockActive, mapDodgeActive, status, addLog]);

  const handleDodge = async () => {
    if (!pregameMatchId) return;
    try {
      await invoke("pregame_quit", { matchId: pregameMatchId });
      addLog("info", `Dodged match ${pregameMatchId}`);
      setPregameMatchId(null);
      lockedMatchRef.current = null;
    } catch (err) {
      const msg = typeof err === "string" ? err : err?.message || "Dodge failed";
      addLog("error", `Dodge failed: ${msg}`);
    }
  };

  return (
    <div
      className={`w-full h-full rounded-xl overflow-hidden border border-border flex flex-col shadow-2xl ${simplifiedTheme ? "bg-base-800" : ""}`}
      style={!simplifiedTheme ? {
        background: theme === "custom"
          ? buildGradientCSS(customTheme)
          : "linear-gradient(135deg, transparent 0%, rgb(var(--val-red) / 0.18) 100%), rgb(var(--base-900))"
      } : undefined}
    >
      <TitleBar simplifiedTheme={simplifiedTheme} minimizeToTray={minimizeToTray} />
      <div className="flex flex-1 min-h-0">
        <Sidebar
          status={status}
          player={player}
          onReconnect={handleRefreshClick}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          showLogs={showLogs}
          pregameMatchId={pregameMatchId}
          onDodge={handleDodge}
          simplifiedTheme={simplifiedTheme}
        />
        <main className="flex-1 flex min-h-0">
          {activeTab === "instalock" && (
            <InstalockPage
              onActiveChange={setInstalockActive}
              onConfigChange={(cfg) => { instalockConfigRef.current = cfg; }}
              connected={status === "connected"}
            />
          )}
          {activeTab === "matchinfo" && (
            <MatchInfoPage henrikApiKey={henrikApiKey} player={player} connected={status === "connected"} />
          )}
          {activeTab === "mapdodge" && (
            <MapDodgePage
              onActiveChange={setMapDodgeActive}
              onBlacklistChange={(cfg) => { mapDodgeRef.current = cfg; }}
              connected={status === "connected"}
            />
          )}
          {activeTab === "settings" && (
            <SettingsPage
              showLogs={showLogs}
              onShowLogsChange={(v) => { setShowLogs(v); localStorage.setItem("show_logs", String(v)); }}
              selectDelay={selectDelay}
              onSelectDelayChange={setSelectDelay}
              lockDelay={lockDelay}
              onLockDelayChange={setLockDelay}
              henrikApiKey={henrikApiKey}
              onHenrikApiKeyChange={setHenrikApiKey}
              theme={theme}
              onThemeChange={setTheme}
              startWithWindows={startWithWindows}
              onStartWithWindowsChange={async (v) => {
                setStartWithWindows(v);
                localStorage.setItem("start_with_windows", String(v));
                try {
                  const { enable, disable } = await import("@tauri-apps/plugin-autostart");
                  if (v) await enable(); else await disable();
                } catch (e) { console.error("[autostart]", e); }
              }}
              startMinimized={startMinimized}
              onStartMinimizedChange={(v) => { setStartMinimized(v); localStorage.setItem("start_minimized", String(v)); }}
              minimizeToTray={minimizeToTray}
              onMinimizeToTrayChange={(v) => { setMinimizeToTray(v); localStorage.setItem("minimize_to_tray", String(v)); }}
              simplifiedTheme={simplifiedTheme}
              onSimplifiedThemeChange={(v) => { setSimplifiedTheme(v); localStorage.setItem("simplified_theme", String(v)); }}
              customTheme={customTheme}
              onCustomThemeChange={setCustomTheme}
              discordRpc={discordRpc}
              onDiscordRpcChange={setDiscordRpc}
            />
          )}
          {activeTab === "party" && <PartyPage connected={status === "connected"} addLog={addLog} />}
          {activeTab === "fakestatus" && <FakeStatusPage connected={status === "connected"} showLogsSetting={showLogs} />}
          {activeTab === "misc" && (
            <MiscPage
              connected={status === "connected"}
              autoUnqueue={autoUnqueue}
              onAutoUnqueueChange={setAutoUnqueue}
              autoRequeue={autoRequeue}
              onAutoRequeueChange={setAutoRequeue}
            />
          )}
          {activeTab === "logs" && showLogs && <LogsPage logs={logs} onClear={() => setLogs([])} />}
        </main>
      </div>
      {showRefreshModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm rounded-xl">
          <div className="bg-base-700 border border-border rounded-xl p-5 w-72 shadow-2xl">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-val-red/15 flex items-center justify-center">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-val-red">
                  <path d="M1 4v6h6M23 20v-6h-6" />
                  <path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15" />
                </svg>
              </div>
              <h3 className="text-sm font-display font-semibold text-text-primary">Refresh Token</h3>
            </div>
            <p className="text-xs font-body text-text-secondary leading-relaxed mb-1">
              This will re-fetch your entitlement tokens from the Riot Client.
            </p>
            <div className="flex items-center gap-1.5 mb-4 px-2 py-1.5 rounded-lg bg-base-600/50">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-text-muted shrink-0">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </svg>
              <span className="text-[11px] font-mono text-text-muted">
                Token has <span className="text-text-primary font-semibold">{formatTimeLeft(tokenAge)}</span> remaining
              </span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowRefreshModal(false)}
                className="flex-1 py-1.5 rounded-lg bg-base-600 hover:bg-base-500 text-text-secondary text-xs font-display font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmRefresh}
                className="flex-1 py-1.5 rounded-lg bg-val-red hover:bg-val-red/80 text-white text-xs font-display font-semibold transition-colors"
              >
                Refresh
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
