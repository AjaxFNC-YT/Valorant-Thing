import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion, AnimatePresence } from "framer-motion";

const noAnim = () => localStorage.getItem("disable_animations") === "true";
const T0 = { duration: 0 };
const POLL_INTERVAL = 2000;

const CONV_LABELS = {
  "ares-parties": "Party",
  "ares-pregame": "Pre-Game",
  "ares-coregame": "In-Game",
};

const CONV_ICONS = {
  "ares-parties": (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
    </svg>
  ),
  "ares-pregame": (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
    </svg>
  ),
  "ares-coregame": (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M14.5 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  ),
};

function getConvType(conv) {
  if (!conv) return null;
  if (conv.chat_type) return conv.chat_type;
  const cid = conv.cid || conv;
  if (!cid || typeof cid !== "string") return null;
  if (cid.includes("ares-parties")) return "ares-parties";
  if (cid.includes("ares-pregame")) return "ares-pregame";
  if (cid.includes("ares-coregame")) return "ares-coregame";
  return null;
}

function formatTime(ts) {
  if (!ts) return "";
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export default function ChatPage({ connected, addLog }) {
  const [conversations, setConversations] = useState([]);
  const [activeCid, setActiveCid] = useState(null);
  const activeCidRef = useRef(null);
  const convMapRef = useRef({});
  const [messages, setMessages] = useState([]);
  const [participants, setParticipants] = useState({});
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const messagesEndRef = useRef(null);
  const cancelledRef = useRef(false);
  const prevMsgCountRef = useRef(0);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const fetchConversations = useCallback(async () => {
    try {
      const raw = await invoke("get_chat_conversations");
      let data;
      try { data = JSON.parse(raw); } catch { data = null; }
      let convs = [];
      if (Array.isArray(data)) convs = data;
      else if (data && Array.isArray(data.conversations)) convs = data.conversations;
      convs = convs.filter(c => c && typeof c === "object");
      const map = {};
      for (const c of convs) { if (c.cid) map[c.cid] = c; }
      convMapRef.current = map;
      setConversations(convs);
      setError(null);

      if (!activeCidRef.current && convs.length > 0) {
        const prio = ["ares-coregame", "ares-pregame", "ares-parties"];
        const best = prio.find(p => convs.some(c => getConvType(c) === p));
        const pick = best ? convs.find(c => getConvType(c) === best) : convs[0];
        if (pick) { setActiveCid(pick.cid); activeCidRef.current = pick.cid; }
      }
    } catch (e) {
      const msg = typeof e === "string" ? e : e?.message || "Failed to fetch conversations";
      console.error("[Chat] Fetch error:", e);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchMessages = useCallback(async () => {
    if (!activeCid) return;
    try {
      const raw = await invoke("get_chat_messages", { cid: activeCid });
      let data;
      try { data = JSON.parse(raw); } catch { data = null; }
      let msgs = [];
      if (Array.isArray(data)) msgs = data;
      else if (data && Array.isArray(data.messages)) msgs = data.messages;
      else if (data && typeof data === "object") {
        const arr = Object.values(data).find(v => Array.isArray(v));
        if (arr) msgs = arr;
      }
      setMessages(msgs);
      if (msgs.length > prevMsgCountRef.current) {
        setTimeout(scrollToBottom, 50);
      }
      prevMsgCountRef.current = msgs.length;
    } catch {}
  }, [activeCid, scrollToBottom]);

  const fetchParticipants = useCallback(async () => {
    if (!activeCid) return;
    try {
      const raw = await invoke("get_chat_participants", { cid: activeCid });
      const data = JSON.parse(raw);
      const parts = data?.participants || data || [];
      const map = {};
      for (const p of parts) {
        const id = p.puuid || p.pid || p.name || "";
        if (id) map[id] = p;
      }
      setParticipants(map);
    } catch {}
  }, [activeCid]);

  useEffect(() => {
    cancelledRef.current = false;
    if (!connected) {
      setConversations([]);
      setMessages([]);
      setLoading(false);
      setError("Not connected");
      return;
    }
    setLoading(true);
    fetchConversations();
    const interval = setInterval(fetchConversations, 5000);
    return () => { cancelledRef.current = true; clearInterval(interval); };
  }, [connected]);

  useEffect(() => {
    if (!activeCid || !connected) return;
    prevMsgCountRef.current = 0;
    fetchMessages();
    fetchParticipants();
    const interval = setInterval(fetchMessages, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [activeCid, connected]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || !activeCid || sending) return;
    setSending(true);
    setInput("");
    try {
      const conv = convMapRef.current[activeCid];
      const msgType = conv?.type || "chat";
      await invoke("send_chat_message", { cid: activeCid, message: text, msgType });
      addLog?.("info", `[Chat] Sent message to ${getConvType(convMapRef.current[activeCid]) || activeCid}`);
      await fetchMessages();
    } catch (e) {
      addLog?.("error", `[Chat] Send failed: ${e}`);
      setInput(text);
    }
    setSending(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const getSenderName = (msg) => {
    if (msg.game_name) return msg.game_name;
    if (msg.puuid && participants[msg.puuid]?.game_name) return participants[msg.puuid].game_name;
    if (msg.pid && participants[msg.pid]?.game_name) return participants[msg.pid].game_name;
    const id = msg.puuid || msg.pid || msg.id || "";
    return id ? id.slice(0, 8) + "..." : "Unknown";
  };

  if (!connected) {
    return (
      <div className="flex-1 flex items-center justify-center p-5">
        <div className="text-center space-y-3">
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
      <div className="flex-1 flex flex-col p-5 gap-3">
        <div className="flex items-center gap-2">
          <div className="h-4 w-24 rounded bg-base-600 animate-pulse" />
        </div>
        <div className="flex gap-2">
          {[0, 1, 2].map(i => <div key={i} className="h-8 w-20 rounded-lg bg-base-600 animate-pulse" />)}
        </div>
        <div className="flex-1 rounded-xl bg-base-700 border border-border animate-pulse" />
      </div>
    );
  }

  const activeConv = activeCid ? convMapRef.current[activeCid] : null;
  const activeType = getConvType(activeConv);
  const safeConvs = Array.isArray(conversations) ? conversations : [];
  const safeMsgs = Array.isArray(messages) ? messages : [];

  return (
    <motion.div
      initial="hidden" animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: noAnim() ? 0 : 0.04 } } }}
      className="flex-1 flex flex-col min-h-0 p-5 gap-3"
    >
      <motion.div
        variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
        transition={noAnim() ? T0 : { duration: 0.2 }}
        className="flex items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-val-red">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z" />
          </svg>
          <h2 className="text-sm font-display font-bold text-text-primary tracking-tight">Chat</h2>
        </div>
        {error && (
          <span className="text-[10px] font-body text-status-red">{error}</span>
        )}
      </motion.div>

      <motion.div
        variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
        transition={noAnim() ? T0 : { duration: 0.2 }}
        className="flex gap-1.5"
      >
        {safeConvs.length === 0 ? (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-base-700 border border-border">
            <span className="text-[11px] font-body text-text-muted">No active conversations</span>
          </div>
        ) : (
          safeConvs.map(conv => {
            const type = getConvType(conv);
            const label = CONV_LABELS[type] || conv.display_name || conv.name || (type || conv.cid?.split("@")?.[0]?.slice(0, 8) || "Chat");
            const icon = CONV_ICONS[type] || CONV_ICONS["ares-parties"];
            const isActive = conv.cid === activeCid;
            return (
              <button
                key={conv.cid}
                onClick={() => { setActiveCid(conv.cid); activeCidRef.current = conv.cid; }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-body transition-colors border ${
                  isActive
                    ? "bg-val-red/15 border-val-red/30 text-val-red"
                    : "bg-base-700 border-border text-text-secondary hover:text-text-primary hover:bg-base-600"
                }`}
              >
                <span className={isActive ? "text-val-red" : "text-text-muted"}>{icon}</span>
                {label}
              </button>
            );
          })
        )}
      </motion.div>

      <motion.div
        variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
        transition={noAnim() ? T0 : { duration: 0.2 }}
        className="flex-1 flex flex-col min-h-0 rounded-xl bg-base-700 border border-border overflow-hidden"
      >
        <div className="flex-1 overflow-y-auto p-3 space-y-1 min-h-0">
          {!activeCid ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-[11px] font-body text-text-muted">Select a conversation</p>
            </div>
          ) : safeMsgs.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center space-y-2">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="text-text-muted/30 mx-auto">
                  <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z" />
                </svg>
                <p className="text-[11px] font-body text-text-muted">No messages yet in {CONV_LABELS[activeType] || "chat"}</p>
              </div>
            </div>
          ) : (
            <>
              {safeMsgs.map((msg, i) => {
                const name = getSenderName(msg);
                const time = formatTime(msg.time || msg.timestamp || msg.dt);
                const body = msg.body || msg.message || msg.content || "";
                const isSystem = msg.type === "system" || msg.type === "groupchat" && !body;
                if (!body) return null;
                return (
                  <div key={msg.id || msg.mid || i} className="group flex gap-2 px-2 py-1 rounded-lg hover:bg-base-600/30 transition-colors">
                    <div className="shrink-0 w-6 h-6 rounded-full bg-base-500/60 flex items-center justify-center mt-0.5">
                      <span className="text-[9px] font-display font-bold text-text-muted uppercase">
                        {name.charAt(0)}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-[11px] font-display font-semibold text-text-primary truncate">{name}</span>
                        <span className="text-[9px] font-body text-text-muted/50 shrink-0">{time}</span>
                      </div>
                      <p className="text-[11px] font-body text-text-secondary break-words leading-relaxed">{body}</p>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {activeCid && (
          <div className="shrink-0 p-2 border-t border-border">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`Message ${CONV_LABELS[activeType] || "chat"}...`}
                disabled={sending}
                className="flex-1 px-3 py-2 bg-base-600 border border-border rounded-lg text-[11px] font-body text-text-primary placeholder:text-text-muted/40 outline-none focus:border-val-red/40 transition-colors disabled:opacity-50"
              />
              <button
                onClick={handleSend}
                disabled={sending || !input.trim()}
                className="shrink-0 w-8 h-8 rounded-lg bg-val-red/15 border border-val-red/30 flex items-center justify-center text-val-red hover:bg-val-red/25 transition-colors disabled:opacity-30"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
