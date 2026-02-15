import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion, AnimatePresence } from "framer-motion";

const noAnim = () => localStorage.getItem("disable_animations") === "true";
const T0 = { duration: 0 };

const QUEUES = [
  { id: "unrated", label: "Unrated" },
  { id: "competitive", label: "Competitive" },
  { id: "valaram", label: "All Random One Site" },
  { id: "swiftplay", label: "Swiftplay" },
  { id: "deathmatch", label: "Deathmatch" },
  { id: "hurm", label: "Team Deathmatch" },
  { id: "spikerush", label: "Spike Rush" },
  { id: "premier", label: "Premier" },
];

const POLL_INTERVAL = 3000;

const UsersIcon = ({ size = 16, className = "" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
    <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
  </svg>
);

const CrownIcon = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className="text-val-red shrink-0">
    <path d="M2 4l3 12h14l3-12-5 4-5-4-5 4-5-4z" />
    <rect x="4" y="18" width="16" height="2" rx="1" />
  </svg>
);

export default function PartyPage({ connected, addLog, onRefresh }) {
  const [party, setParty] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showJoin, setShowJoin] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [friends, setFriends] = useState([]);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [invitingPuuid, setInvitingPuuid] = useState(null);
  const [invitedPuuids, setInvitedPuuids] = useState(new Set());
  const [friendSearch, setFriendSearch] = useState("");
  const [queueing, setQueueing] = useState(false);
  const [queueError, setQueueError] = useState(null);
  const [showQueuePicker, setShowQueuePicker] = useState(false);
  const [changingQueue, setChangingQueue] = useState(false);
  const [customConfigs, setCustomConfigs] = useState(null);
  const [savingCustom, setSavingCustom] = useState(false);
  const [apiMaps, setApiMaps] = useState(null);
  const [apiModes, setApiModes] = useState(null);
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [showModePicker, setShowModePicker] = useState(false);
  const [showServerPicker, setShowServerPicker] = useState(false);
  const mapPickerRef = useRef(null);
  const modePickerRef = useRef(null);
  const serverPickerRef = useRef(null);
  const [joinCode, setJoinCode] = useState("");
  const [partyCode, setPartyCode] = useState("");
  const [codeCopied, setCodeCopied] = useState(false);
  const cancelledRef = useRef(false);
  const queuePickerRef = useRef(null);

  useEffect(() => {
    if (!showQueuePicker) return;
    const handler = (e) => { if (queuePickerRef.current && !queuePickerRef.current.contains(e.target)) setShowQueuePicker(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showQueuePicker]);

  const isLeader = party?.members?.some(m => m.puuid === party.my_puuid && m.is_owner);

  const fetchParty = async () => {
    try {
      const raw = await invoke("get_party");
      if (cancelledRef.current) return;
      addLog?.("info", "[Party] Response", raw);
      const data = JSON.parse(raw);
      if (!data.members || data.members.length === 0) {
        throw new Error("Empty party data — token may be stale");
      }
      data.members.sort((a, b) => (b.is_owner ? 1 : 0) - (a.is_owner ? 1 : 0));
      setParty(data);
      setError(null);
    } catch (e) {
      if (cancelledRef.current) return;
      const msg = typeof e === "string" ? e : e?.message || "Failed to fetch party";
      addLog?.("error", `[Party] ${msg}`);
      if (msg.includes("No party ID") || msg.includes("token may be stale")) {
        addLog?.("info", "[Party] Bad data — refreshing token...");
        onRefresh?.();
        return;
      }
      setError(msg);
    } finally {
      if (!cancelledRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    cancelledRef.current = false;
    if (!connected) {
      setParty(null);
      setLoading(false);
      setError("Not connected");
      return;
    }
    fetchParty();
    const interval = setInterval(fetchParty, POLL_INTERVAL);
    return () => { cancelledRef.current = true; clearInterval(interval); };
  }, [connected]);

  const handleKick = async (puuid) => {
    try { await invoke("kick_from_party", { targetPuuid: puuid }); fetchParty(); } catch {}
  };

  const handleGenerateCode = async () => {
    try {
      const raw = await invoke("generate_party_code");
      const data = JSON.parse(raw);
      const code = data?.InviteCode || data?.inviteCode || "";
      setPartyCode(code);
    } catch {}
  };

  const handleJoin = async () => {
    if (!joinCode.trim()) return;
    try {
      addLog?.("info", `[Party] Joining by code: ${joinCode.trim()}`);
      await invoke("join_party_by_code", { code: joinCode.trim() });
      addLog?.("info", "[Party] Join by code succeeded");
      setShowJoin(false); setJoinCode(""); fetchParty();
    } catch (e) {
      addLog?.("error", `[Party] Join by code failed: ${e}`);
    }
  };

  const fetchFriends = async () => {
    setFriendsLoading(true);
    try {
      const raw = await invoke("get_friends");
      const data = JSON.parse(raw);
      setFriends(data || []);
      const online = (data || []).filter(f => f.status && f.status !== "offline");
      const withCard = online.filter(f => f.player_card_url);
      addLog?.("info", `[Friends] Loaded ${(data || []).length} friends — ${online.length} online, ${withCard.length} with card`);
      online.slice(0, 10).forEach(f => {
        addLog?.("info", `[Friends] ${f.game_name}#${f.game_tag} status=${f.status} lv=${f.account_level} card=${!!f.player_card_url} product=${f.product}`);
      });
    } catch (e) {
      addLog?.("error", `[Party] Failed to fetch friends: ${e}`);
      setFriends([]);
    }
    setFriendsLoading(false);
  };

  const openInviteModal = () => {
    setShowInvite(true);
    setInvitedPuuids(new Set());
    setFriendSearch("");
    fetchFriends();
  };


  const handleInvite = async (friend) => {
    setInvitingPuuid(friend.puuid);
    try {
      await invoke("invite_to_party", { name: friend.game_name, tag: friend.game_tag });
      setInvitedPuuids(prev => new Set([...prev, friend.puuid]));
      addLog?.("info", `[Party] Invited ${friend.game_name}#${friend.game_tag}`);
    } catch (e) {
      addLog?.("error", `[Party] Invite failed: ${e}`);
    }
    setInvitingPuuid(null);
  };


  const handleCopyCode = () => {
    if (!partyCode) return;
    navigator.clipboard.writeText(partyCode);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 1500);
  };

  const handleChangeQueue = async (queueId) => {
    setChangingQueue(true);
    try {
      await invoke("change_queue", { queueId });
      addLog?.("info", `[Party] Changed queue to ${queueId}`);
      fetchParty();
    } catch (e) {
      addLog?.("error", `[Party] Queue change failed: ${e}`);
    }
    setChangingQueue(false);
    setShowQueuePicker(false);
  };

  const fetchCustomConfigs = async () => {
    try {
      const raw = await invoke("get_custom_configs");
      setCustomConfigs(JSON.parse(raw));
    } catch (e) {
      addLog?.("error", `[Party] Failed to fetch custom configs: ${e}`);
    }
  };

  const handleCustomSetting = async (overrides = {}) => {
    if (!party) return;
    setSavingCustom(true);
    const p = {
      map: party.custom_map || customConfigs?.maps?.[0] || "",
      mode: party.custom_mode || customConfigs?.modes?.[0] || "",
      pod: party.custom_pod || customConfigs?.pods?.[0] || "",
      allowCheats: party.custom_allow_cheats || false,
      playOutAllRounds: party.custom_play_out_all_rounds || false,
      skipMatchHistory: party.custom_skip_match_history || false,
      tournamentMode: party.custom_tournament_mode || false,
      overtimeWinByTwo: party.custom_overtime_win_by_two !== false,
      ...overrides,
    };
    addLog?.("info", "[Custom] Sending settings", p);
    try {
      const resp = await invoke("set_custom_settings", p);
      addLog?.("info", `[Custom] OK`);
      fetchParty();
    } catch (e) {
      addLog?.("error", `[Custom] Failed: ${e}`);
    }
    setSavingCustom(false);
  };

  const isCustom = party?.state === "CUSTOM_GAME_SETUP";
  const currentQueueLabel = isCustom ? "Custom" : (QUEUES.find(q => q.id === party?.queue_id)?.label || party?.queue_id || "Unknown");

  useEffect(() => {
    if (isCustom && !customConfigs) fetchCustomConfigs();
    if (isCustom && !apiMaps) {
      fetch("https://valorant-api.com/v1/maps?language=en-US").then(r => r.json()).then(j => {
        const lookup = {};
        (j.data || []).forEach(m => { if (m.mapUrl) lookup[m.mapUrl] = m; });
        setApiMaps(lookup);
      }).catch(() => {});
    }
    if (isCustom && !apiModes) {
      fetch("https://valorant-api.com/v1/gamemodes?language=en-US").then(r => r.json()).then(j => {
        const lookup = {};
        (j.data || []).forEach(m => {
          const cls = (m.assetPath || "").split("/").pop();
          if (cls) lookup[cls] = m;
        });
        setApiModes(lookup);
      }).catch(() => {});
    }
  }, [isCustom]);

  useEffect(() => {
    if (!showMapPicker) return;
    const h = (e) => { if (mapPickerRef.current && !mapPickerRef.current.contains(e.target)) setShowMapPicker(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [showMapPicker]);

  useEffect(() => {
    if (!showModePicker) return;
    const h = (e) => { if (modePickerRef.current && !modePickerRef.current.contains(e.target)) setShowModePicker(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [showModePicker]);

  useEffect(() => {
    if (!showServerPicker) return;
    const h = (e) => { if (serverPickerRef.current && !serverPickerRef.current.contains(e.target)) setShowServerPicker(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [showServerPicker]);

  if (!connected) {
    return (
      <div className="flex-1 flex items-center justify-center p-5">
        <div className="text-center space-y-2">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-text-muted mx-auto">
            <path d="M1 1l22 22" />
            <path d="M16.72 11.06A10.94 10.94 0 0119 12.55" />
            <path d="M5 12.55a10.94 10.94 0 015.17-2.39" />
            <path d="M10.71 5.05A16 16 0 0122.56 9" />
            <path d="M1.42 9a15.91 15.91 0 014.7-2.88" />
            <path d="M8.53 16.11a6 6 0 016.95 0" />
            <line x1="12" y1="20" x2="12.01" y2="20" />
          </svg>
          <p className="text-sm font-display text-text-muted">Waiting for Valorant</p>
          <p className="text-[11px] font-body text-text-muted/60">Open Valorant and it will connect automatically</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex-1 flex flex-col min-h-0 p-5 gap-3 animate-pulse">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-base-600" />
            <div className="h-4 w-12 rounded bg-base-600" />
            <div className="h-3 w-6 rounded bg-base-600" />
          </div>
          <div className="h-4 w-14 rounded bg-base-600" />
        </div>
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-base-700 border border-border">
              <div className="w-10 h-10 rounded-lg bg-base-600 shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3.5 w-28 rounded bg-base-600" />
                <div className="h-2.5 w-16 rounded bg-base-600" />
              </div>
              <div className="h-5 w-16 rounded bg-base-600" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error && !party) {
    return (
      <div className="flex-1 flex items-center justify-center p-5">
        <div className="text-center space-y-2">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-text-muted mx-auto">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4M12 16h.01" />
          </svg>
          <p className="text-sm font-display text-text-muted">No party found</p>
          <p className="text-xs font-body text-text-muted/60">Make sure Valorant is open</p>
        </div>
      </div>
    );
  }

  if (!party?.members?.length) return null;

  return (
    <motion.div initial="hidden" animate="show" variants={{ hidden: {}, show: { transition: { staggerChildren: noAnim() ? 0 : 0.04 } } }} className="flex-1 flex flex-col min-h-0 p-5 gap-3 overflow-y-auto">
      <motion.div variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }} transition={noAnim() ? T0 : { duration: 0.2 }} className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <UsersIcon size={16} className="text-text-muted" />
          <h2 className="text-sm font-display font-semibold text-text-primary">Party</h2>
          <span className="text-xs font-body text-text-muted">{party.members.length}/5</span>
        </div>
        <div className="flex items-center gap-1.5">
          {isLeader ? (
            <button
              onClick={async () => { try { await invoke("set_party_accessibility", { open: party.accessibility !== "OPEN" }); fetchParty(); } catch {} }}
              className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-body transition-colors ${
                party.accessibility === "OPEN" ? "text-status-green bg-status-green/10 hover:bg-status-green/20" : "text-status-red bg-status-red/10 hover:bg-status-red/20"
              }`}
            >
              <div className={`w-1.5 h-1.5 rounded-full ${party.accessibility === "OPEN" ? "bg-status-green" : "bg-status-red"}`} />
              {party.accessibility === "OPEN" ? "Open" : "Closed"}
            </button>
          ) : (
            <>
              <div className={`w-1.5 h-1.5 rounded-full ${party.accessibility === "OPEN" ? "bg-status-green" : "bg-status-red"}`} />
              <span className="text-xs font-body text-text-muted">{party.accessibility === "OPEN" ? "Open" : "Closed"}</span>
            </>
          )}
        </div>
      </motion.div>

      <motion.div variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }} transition={noAnim() ? T0 : { duration: 0.2 }} className="relative" ref={queuePickerRef}>
        {isLeader ? (
          <button
            onClick={() => setShowQueuePicker(p => !p)}
            disabled={changingQueue}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-base-700 border border-border text-xs font-body text-text-primary hover:bg-base-600 transition-colors w-full"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-text-muted shrink-0"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg>
            <span className="font-display font-medium">{changingQueue ? "..." : currentQueueLabel}</span>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-text-muted ml-auto shrink-0"><polyline points="6 9 12 15 18 9" /></svg>
          </button>
        ) : (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-base-700/50 border border-border text-xs font-body text-text-muted">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="shrink-0"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg>
            <span>{currentQueueLabel}</span>
          </div>
        )}
        <AnimatePresence>
          {showQueuePicker && isLeader && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.12 }}
              className="absolute z-40 top-full left-0 mt-1 w-48 bg-base-700 border border-border rounded-lg shadow-xl overflow-hidden"
            >
              {QUEUES.map(q => (
                <button
                  key={q.id}
                  onClick={() => handleChangeQueue(q.id)}
                  className={`w-full text-left px-3 py-1.5 text-[11px] font-display transition-colors ${
                    (q.id === "custom" ? isCustom : !isCustom && party?.queue_id === q.id)
                      ? "text-val-red bg-val-red/10 font-semibold"
                      : "text-text-primary hover:bg-base-600"
                  }`}
                >
                  {q.label}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      <motion.div variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }} transition={noAnim() ? T0 : { duration: 0.2 }} className="flex items-center gap-2 flex-wrap">
        {isLeader && (
          <button
            disabled={queueing}
            onClick={async () => {
              setQueueing(true);
              try {
                if (isCustom) await invoke("start_custom_game_match");
                else if (party.state === "MATCHMAKING") await invoke("leave_queue");
                else await invoke("enter_queue");
                fetchParty();
              } catch (e) {
                const msg = typeof e === "string" ? e : e?.message || "";
                if (msg.includes("QUEUE_RESTRICTED")) setQueueError("You are currently queue restricted (banned). Wait for your penalty to expire.");
                else if (msg.includes("403")) setQueueError("Unable to join queue — you may be restricted.");
                else setQueueError(msg || isCustom ? "Failed to start custom game." : "Failed to join queue.");
              }
              setQueueing(false);
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-body transition-colors disabled:opacity-50 ${
              party.state === "MATCHMAKING"
                ? "bg-status-red/15 border-status-red/30 text-status-red hover:bg-status-red/25"
                : "bg-val-red/15 border-val-red/30 text-val-red hover:bg-val-red/25"
            }`}
          >
            {party.state === "MATCHMAKING" ? (
              <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>{queueing ? "..." : "Leave Queue"}</>
            ) : (
              <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3" /></svg>{queueing ? "..." : isCustom ? "Start" : "Queue"}</>
            )}
          </button>
        )}
        <button
          onClick={openInviteModal}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-base-600 border border-border text-xs font-body text-text-primary hover:bg-base-500 transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="19" y1="8" x2="19" y2="14" /><line x1="22" y1="11" x2="16" y2="11" /></svg>
          Invite
        </button>
        <button
          onClick={() => setShowJoin(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-base-600 border border-border text-xs font-body text-text-primary hover:bg-base-500 transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M10 17l5-5-5-5M15 12H3" /></svg>
          Join Code
        </button>
        <button
          onClick={handleGenerateCode}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-base-600 border border-border text-xs font-body text-text-primary hover:bg-base-500 transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" /></svg>
          Get Code
        </button>
      </motion.div>

      {partyCode && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-base-700 border border-border">
          <span className="text-xs font-body text-text-muted">Party Code:</span>
          <code className="text-xs font-body text-text-primary font-medium tracking-wider">{partyCode}</code>
          <button onClick={handleCopyCode} className="text-xs font-body text-val-red hover:text-val-red/80 transition-colors">
            {codeCopied ? "Copied!" : "Copy"}
          </button>
          <button
            onClick={async () => { try { await invoke("disable_party_code"); setPartyCode(""); } catch {} }}
            className="ml-auto w-5 h-5 rounded flex items-center justify-center text-text-muted hover:text-status-red hover:bg-status-red/10 transition-colors"
            title="Delete code"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>
      )}

      {isCustom && isLeader && customConfigs && (() => {
        const MODE_NAMES = {
          BombGameMode: "Standard", DeathmatchGameMode: "Deathmatch", GunGameTeamsGameMode: "Escalation",
          QuickBombGameMode: "Spike Rush", OneForAll_GameMode: "Replication", AROS_GameMode: "All Random One Site",
          Swiftplay_EoRCredits_GameMode: "Swiftplay", SwiftPlayGameMode: "Swiftplay",
          HURM_GameMode: "Team Deathmatch", SkirmishGameMode: "Skirmish", SnowballGameMode: "Snowball Fight", NewMapGameMode: "New Map",
        };
        const MAP_NAMES = {
          Duality: "Bind", Triad: "Haven", Bonsai: "Split", Port: "Icebox", Foxtrot: "Breeze",
          Canyon: "Fracture", Pitt: "Pearl", Jam: "Lotus", Juliett: "Sunset", Infinity: "Abyss",
          HURM_Yard: "District", HURM_Alley: "Kasbah", HURM_Bowl: "Piazza", HURM_Helix: "Drift",
          HURM_ShipLong: "Glitch", Skirmish_A: "Skirmish A", Skirmish_B: "Skirmish B",
          Skirmish_C: "Skirmish C", Skirmish_D: "Skirmish D",
        };
        const MODE_PRIORITY = ["Swiftplay", "Standard", "Deathmatch", "All Random One Site", "Spike Rush", "Escalation", "Replication", "Team Deathmatch", "Skirmish"];
        const SERVER_NAMES = { dallas: "US Central (Texas)", atlanta: "US Central (Georgia)", chicago: "US Central (Illinois)", ashburn: "US East (N. Virginia)", norcal: "US West (N. California)", oregon: "US West (Oregon)" };

        const getModeName = (m) => { const f = m.split("/").pop()?.split(".")[0] || m; if (MODE_NAMES[f]) return MODE_NAMES[f]; if (f.includes("HURM")) return "Team Deathmatch"; return f.replace(/_GameMode|GameMode/gi, "").replace(/_/g, " ").trim(); };
        const getModeIcon = (m) => { const cls = m.split("/").pop()?.split(".")[0] || ""; return apiModes?.[cls]?.displayIcon || null; };
        const getModeBg = (m) => { const cls = m.split("/").pop()?.split(".")[0] || ""; return apiModes?.[cls]?.listViewIconTall || null; };
        const getMapName = (m) => { const raw = m.split("/").pop() || m; return apiMaps?.[m]?.displayName || MAP_NAMES[raw] || raw; };
        const getMapImg = (m) => apiMaps?.[m]?.listViewIcon || null;
        const getMapSplash = (m) => apiMaps?.[m]?.splash || null;

        const curMode = party.custom_mode || "";
        const isHURM = curMode.includes("HURM");
        const isSkirmish = curMode.includes("Skirmish");
        const filteredMaps = customConfigs.maps.filter(m => {
          if (isSkirmish) return m.includes("Duel") || m.includes("Skirmish");
          if (isHURM) return m.includes("HURM");
          return !m.includes("HURM") && !m.includes("Duel") && !m.includes("Skirmish");
        });
        const seen = new Set();
        const sortedModes = [...customConfigs.modes].sort((a, b) => {
          const ai = MODE_PRIORITY.indexOf(getModeName(a));
          const bi = MODE_PRIORITY.indexOf(getModeName(b));
          return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
        }).filter(m => { const n = getModeName(m); if (seen.has(n)) return false; seen.add(n); return true; });

        const curMapSplash = getMapSplash(party.custom_map);

        return (
        <div className="rounded-lg bg-base-700 border border-border overflow-hidden">
          {curMapSplash && (
            <div className="relative h-20 overflow-hidden">
              <img src={curMapSplash} alt="" className="w-full h-full object-cover opacity-40" />
              <div className="absolute inset-0 bg-gradient-to-t from-base-700 via-base-700/60 to-transparent" />
              <div className="absolute bottom-2 left-3 flex items-center gap-2">
                {getModeIcon(curMode) && <img src={getModeIcon(curMode)} alt="" className="w-5 h-5 brightness-0 invert opacity-60" />}
                <span className="text-[13px] font-display font-bold text-white drop-shadow">{getMapName(party.custom_map)}</span>
                <span className="text-[10px] font-body text-white/50">— {getModeName(curMode)}</span>
              </div>
              {savingCustom && <div className="absolute top-2 right-3"><span className="text-[10px] text-white/60 animate-pulse">Saving...</span></div>}
            </div>
          )}
          <div className="p-3 space-y-2.5">
            {!curMapSplash && (
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-display font-semibold text-text-primary">Custom Game Settings</span>
                {savingCustom && <span className="text-[10px] text-text-muted animate-pulse">Saving...</span>}
              </div>
            )}

            <div className="relative" ref={modePickerRef}>
              <label className="text-[10px] font-body text-text-muted mb-0.5 block">Mode</label>
              <button onClick={() => { setShowModePicker(v => !v); setShowMapPicker(false); }} disabled={savingCustom}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 bg-base-600 border border-border rounded-lg text-[11px] font-body text-text-primary hover:border-val-red/40 transition-colors disabled:opacity-50 relative overflow-hidden">
                {getModeBg(curMode) && <img src={getModeBg(curMode)} alt="" className="absolute inset-0 w-full h-full object-cover opacity-[0.08]" />}
                <span className="relative flex items-center gap-2 flex-1">
                  {getModeIcon(curMode) && <img src={getModeIcon(curMode)} alt="" className="w-4 h-4 brightness-0 invert opacity-70" />}
                  {getModeName(curMode)}
                </span>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`text-text-muted transition-transform shrink-0 relative ${showModePicker ? "rotate-180" : ""}`}><path d="M6 9l6 6 6-6" /></svg>
              </button>
              {showModePicker && (
                <div className="absolute z-50 mt-1 left-0 right-0 bg-base-800 border border-border rounded-lg shadow-xl max-h-64 overflow-y-auto">
                  {sortedModes.map(m => {
                    const active = m === curMode;
                    return (
                      <button key={m} onClick={() => { handleCustomSetting({ mode: m }); setShowModePicker(false); }}
                        className={`w-full flex items-center gap-2.5 px-2.5 py-2 text-[11px] font-body hover:bg-base-600 transition-colors relative overflow-hidden ${active ? "bg-base-600 text-text-primary" : "text-text-secondary"}`}>
                        {getModeBg(m) && <img src={getModeBg(m)} alt="" className="absolute inset-0 w-full h-full object-cover opacity-[0.06]" />}
                        {getModeIcon(m) && <img src={getModeIcon(m)} alt="" className="w-4 h-4 brightness-0 invert opacity-60 relative" />}
                        <span className="relative">{getModeName(m)}</span>
                        {active && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-val-red relative" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="relative" ref={mapPickerRef}>
              <label className="text-[10px] font-body text-text-muted mb-0.5 block">Map</label>
              <button onClick={() => { setShowMapPicker(v => !v); setShowModePicker(false); }} disabled={savingCustom}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 bg-base-600 border border-border rounded-lg text-[11px] font-body text-text-primary hover:border-val-red/40 transition-colors disabled:opacity-50 overflow-hidden relative">
                {getMapImg(party.custom_map) && <img src={getMapImg(party.custom_map)} alt="" className="w-8 h-5 object-cover rounded shrink-0" />}
                <span className="flex-1 text-left">{getMapName(party.custom_map)}</span>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`text-text-muted transition-transform shrink-0 ${showMapPicker ? "rotate-180" : ""}`}><path d="M6 9l6 6 6-6" /></svg>
              </button>
              {showMapPicker && (
                <div className="absolute z-50 mt-1 left-0 right-0 bg-base-800 border border-border rounded-lg shadow-xl max-h-64 overflow-y-auto">
                  {filteredMaps.map(m => {
                    const active = m === party.custom_map;
                    const img = getMapImg(m);
                    return (
                      <button key={m} onClick={() => { handleCustomSetting({ map: m }); setShowMapPicker(false); }}
                        className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 text-[11px] font-body hover:bg-base-600 transition-colors ${active ? "bg-base-600 text-text-primary" : "text-text-secondary"}`}>
                        {img ? <img src={img} alt="" className="w-8 h-5 object-cover rounded shrink-0" />
                             : <div className="w-8 h-5 bg-base-600 rounded shrink-0" />}
                        <span className="flex-1 text-left">{getMapName(m)}</span>
                        {active && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-val-red" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="relative" ref={serverPickerRef}>
              <label className="text-[10px] font-body text-text-muted mb-0.5 block">Server</label>
              <button onClick={() => { setShowServerPicker(v => !v); setShowMapPicker(false); setShowModePicker(false); }} disabled={savingCustom}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 bg-base-600 border border-border rounded-lg text-[11px] font-body text-text-primary hover:border-val-red/40 transition-colors disabled:opacity-50">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-text-muted shrink-0"><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" /></svg>
                <span className="flex-1 text-left">{(() => { const pts = (party.custom_pod || "").toLowerCase().split(/[.\-]/); const c = pts.find(s => SERVER_NAMES[s]); return c ? SERVER_NAMES[c] : party.custom_pod || ""; })()}</span>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`text-text-muted transition-transform shrink-0 ${showServerPicker ? "rotate-180" : ""}`}><path d="M6 9l6 6 6-6" /></svg>
              </button>
              {showServerPicker && (
                <div className="absolute z-50 mt-1 left-0 right-0 bg-base-800 border border-border rounded-lg shadow-xl max-h-64 overflow-y-auto">
                  {customConfigs.pods.map(p => {
                    const active = p === party.custom_pod;
                    const pts = p.toLowerCase().split(/[.\-]/);
                    const city = pts.find(s => SERVER_NAMES[s]);
                    return (
                      <button key={p} onClick={() => { handleCustomSetting({ pod: p }); setShowServerPicker(false); }}
                        className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 text-[11px] font-body hover:bg-base-600 transition-colors ${active ? "bg-base-600 text-text-primary" : "text-text-secondary"}`}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-text-muted shrink-0"><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" /></svg>
                        <span className="flex-1 text-left">{city ? SERVER_NAMES[city] : p}</span>
                        {active && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-val-red" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="border-t border-border pt-2 space-y-1.5">
              <span className="text-[10px] font-display font-semibold text-text-muted">Game Rules</span>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                {[
                  { key: "allowCheats", label: "Allow Cheats", val: party.custom_allow_cheats },
                  { key: "tournamentMode", label: "Tournament Mode", val: party.custom_tournament_mode },
                  { key: "overtimeWinByTwo", label: "Overtime Win By Two", val: party.custom_overtime_win_by_two },
                  { key: "playOutAllRounds", label: "Play Out All Rounds", val: party.custom_play_out_all_rounds },
                  { key: "skipMatchHistory", label: "Skip Match History", val: party.custom_skip_match_history },
                ].map(({ key, label, val }) => (
                  <label key={key} className="flex items-center gap-2 cursor-pointer group">
                    <button onClick={() => handleCustomSetting({ [key]: !val })} disabled={savingCustom}
                      className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors disabled:opacity-50 ${val ? "bg-val-red border-val-red" : "bg-base-600 border-border group-hover:border-text-muted"}`}>
                      {val && <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>}
                    </button>
                    <span className="text-[11px] font-body text-text-primary select-none">{label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>
        );
      })()}

      <div className="space-y-1.5">
        {party.members.map((member, i) => (
          <motion.div key={member.puuid} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={noAnim() ? T0 : { duration: 0.2, delay: i * 0.05 }}>
          <MemberCard
            member={member}
            isLeader={isLeader}
            isMe={member.puuid === party.my_puuid}
            onKick={() => handleKick(member.puuid)}
          />
          </motion.div>
        ))}
      </div>

      <AnimatePresence>
      {queueError && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setQueueError(null)} onKeyDown={(e) => e.key === "Escape" && setQueueError(null)}>
          <motion.div initial={{ opacity: 0, scale: 0.95, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 8 }} transition={{ duration: 0.15 }} className="bg-base-700 border border-border rounded-2xl p-5 w-80 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-3">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-status-red shrink-0">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 8v4M12 16h.01" />
              </svg>
              <h3 className="text-sm font-display font-bold text-text-primary">Queue Error</h3>
            </div>
            <p className="text-xs font-body text-text-secondary mb-4">{queueError}</p>
            <button
              onClick={() => setQueueError(null)}
              className="w-full py-1.5 rounded-lg bg-val-red/20 border border-val-red/40 text-xs font-display font-semibold text-val-red hover:bg-val-red/30 transition-colors"
            >
              OK
            </button>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>

      <AnimatePresence>
      {showJoin && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => { setShowJoin(false); setJoinCode(""); }}>
          <motion.div initial={{ opacity: 0, scale: 0.95, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 8 }} transition={{ duration: 0.15 }} className="bg-base-700 border border-border rounded-xl p-5 w-80 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-display font-semibold text-text-primary mb-3">Join Party</h3>
            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleJoin()}
              placeholder="Enter party code"
              autoFocus
              className="w-full px-3 py-2 bg-base-600 border border-border rounded-lg text-sm font-body text-text-primary placeholder:text-text-muted/50 outline-none focus:border-val-red/60 transition-colors tracking-wider"
            />
            <div className="flex gap-2 mt-3">
              <button onClick={() => { setShowJoin(false); setJoinCode(""); }} className="flex-1 py-1.5 rounded-lg bg-base-600 border border-border text-xs font-body text-text-secondary hover:bg-base-500 transition-colors">Cancel</button>
              <button onClick={handleJoin} className="flex-1 py-1.5 rounded-lg bg-val-red/20 border border-val-red/40 text-xs font-display font-semibold text-val-red hover:bg-val-red/30 transition-colors">Join</button>
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>

      <AnimatePresence>
      {showInvite && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowInvite(false)}>
          <motion.div initial={{ opacity: 0, scale: 0.95, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 8 }} transition={{ duration: 0.15 }} className="bg-base-700 border border-border rounded-xl w-80 max-h-[420px] shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-4 pt-3.5 pb-3 border-b border-border shrink-0">
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-display font-semibold text-text-primary">Invite to Party</h3>
                  {!friendsLoading && friends.length > 0 && (
                    <span className="text-[10px] font-body text-text-muted">{friends.length}</span>
                  )}
                </div>
                <button onClick={() => setShowInvite(false)} className="w-5 h-5 rounded flex items-center justify-center text-text-muted hover:text-text-primary transition-colors">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12" /></svg>
                </button>
              </div>
              <input
                type="text"
                value={friendSearch}
                onChange={(e) => setFriendSearch(e.target.value)}
                placeholder="Search..."
                autoFocus
                className="w-full px-2.5 py-1.5 bg-base-600 border border-border rounded-lg text-[11px] font-body text-text-primary placeholder:text-text-muted/40 outline-none focus:border-val-red/60 transition-colors"
              />
            </div>
            <div className="flex-1 overflow-y-auto py-1 min-h-0">
              {friendsLoading ? (
                <div className="px-2 space-y-0.5">
                  {[0, 1, 2, 3, 4, 5].map(i => (
                    <div key={i} className="flex items-center gap-2.5 px-2 py-2 animate-pulse">
                      <div className="w-6 h-6 rounded-full bg-base-500 shrink-0" />
                      <div className="h-3 w-28 rounded bg-base-500" />
                    </div>
                  ))}
                </div>
              ) : friends.length === 0 ? (
                <div className="flex items-center justify-center py-10 text-text-muted">
                  <p className="text-[11px] font-body">No friends found</p>
                </div>
              ) : (
                friends
                  .filter(f => {
                    if (!friendSearch.trim()) return true;
                    const q = friendSearch.toLowerCase();
                    return f.game_name?.toLowerCase().includes(q) || f.game_tag?.toLowerCase().includes(q);
                  })
                  .map((friend, i) => (
                    <FriendInviteCard
                      key={friend.puuid}
                      friend={friend}
                      onInvite={() => handleInvite(friend)}
                      inviting={invitingPuuid === friend.puuid}
                      invited={invitedPuuids.has(friend.puuid)}
                      index={i}
                    />
                  ))
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>

    </motion.div>
  );
}

function FriendInviteCard({ friend, onInvite, inviting, invited, index, actionLabel = "Invite", doneLabel = "Sent" }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -4 }}
      animate={{ opacity: 1, x: 0 }}
      transition={noAnim() ? T0 : { duration: 0.12, delay: index * 0.015 }}
      className="flex items-center gap-2 mx-1 px-2.5 py-1.5 rounded-lg hover:bg-base-600/60 transition-colors group"
    >
      <div className="w-6 h-6 rounded-full bg-base-500/60 shrink-0 flex items-center justify-center">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-text-muted/60">
          <circle cx="12" cy="8" r="4" /><path d="M5 20c0-3.87 3.13-7 7-7s7 3.13 7 7" />
        </svg>
      </div>
      <p className="text-[11px] font-display font-medium text-text-primary truncate flex-1 min-w-0">
        {friend.game_name}<span className="text-text-muted font-body font-normal ml-0.5">#{friend.game_tag}</span>
      </p>
      <button
        onClick={onInvite}
        disabled={inviting || invited}
        className={`shrink-0 text-[10px] font-display font-semibold px-2 py-0.5 rounded transition-all ${
          invited
            ? "text-status-green"
            : inviting
              ? "text-text-muted"
              : "text-text-muted/40 group-hover:text-val-red"
        }`}
      >
        {invited ? `✓ ${doneLabel}` : inviting ? "..." : actionLabel}
      </button>
    </motion.div>
  );
}

function MemberCard({ member, isLeader, isMe, onKick }) {
  const [imgError, setImgError] = useState(false);

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-base-700 border border-border group">
      <div className="w-10 h-10 rounded-lg overflow-hidden bg-base-500 shrink-0">
        {member.player_card_url && !imgError ? (
          <img
            src={member.player_card_url}
            alt=""
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-text-muted">
              <circle cx="12" cy="8" r="4" />
              <path d="M5 20c0-3.87 3.13-7 7-7s7 3.13 7 7" />
            </svg>
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {member.is_owner && <CrownIcon size={12} />}
          <p className="text-sm font-display font-medium text-text-primary truncate">
            {member.incognito ? "Anonymous" : member.game_name}
          </p>
          {!member.incognito && (
            <span className="text-xs font-body text-text-muted">#{member.game_tag}</span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          {!member.hide_account_level && (
            <span className="text-[11px] font-body text-text-muted">Lv {member.account_level}</span>
          )}
          {member.is_ready && (
            <span className="text-[11px] font-body text-status-green">Ready</span>
          )}
        </div>
      </div>

      {isLeader && !isMe && (
        <button
          onClick={onKick}
          title="Kick"
          className="w-7 h-7 rounded-lg flex items-center justify-center text-text-muted hover:text-status-red hover:bg-status-red/10 transition-colors opacity-0 group-hover:opacity-100 shrink-0"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}

