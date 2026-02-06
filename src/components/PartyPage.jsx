import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

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

export default function PartyPage({ connected, addLog }) {
  const [party, setParty] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showJoin, setShowJoin] = useState(false);
  const [queueing, setQueueing] = useState(false);
  const [queueError, setQueueError] = useState(null);
  const [joinCode, setJoinCode] = useState("");
  const [partyCode, setPartyCode] = useState("");
  const [codeCopied, setCodeCopied] = useState(false);
  const cancelledRef = useRef(false);

  const isLeader = party?.members?.some(m => m.puuid === party.my_puuid && m.is_owner);

  const fetchParty = async () => {
    try {
      const raw = await invoke("get_party");
      if (cancelledRef.current) return;
      const data = JSON.parse(raw);
      data.members.sort((a, b) => (b.is_owner ? 1 : 0) - (a.is_owner ? 1 : 0));
      setParty(data);
      setError(null);
    } catch (e) {
      if (cancelledRef.current) return;
      setError(typeof e === "string" ? e : e?.message || "Failed to fetch party");
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
    try { await invoke("join_party_by_code", { code: joinCode.trim() }); setShowJoin(false); setJoinCode(""); fetchParty(); } catch {}
  };

  const handleCopyCode = () => {
    if (!partyCode) return;
    navigator.clipboard.writeText(partyCode);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 1500);
  };

  if (!connected) {
    return (
      <div className="flex-1 flex items-center justify-center p-5">
        <div className="text-center space-y-2">
          <UsersIcon size={32} className="text-text-muted mx-auto" />
          <p className="text-sm font-display text-text-muted">Connect to see your party</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-5">
        <div className="flex items-center gap-2 text-text-muted">
          <div className="w-4 h-4 border-2 border-val-red/30 border-t-val-red rounded-full animate-spin" />
          <span className="text-sm font-body">Loading party...</span>
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
    <div className="flex-1 flex flex-col min-h-0 p-5 gap-3 overflow-y-auto">
      <div className="flex items-center justify-between">
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
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {isLeader && (
          <button
            disabled={queueing}
            onClick={async () => {
              setQueueing(true);
              try {
                if (party.state === "MATCHMAKING") await invoke("leave_queue");
                else await invoke("enter_queue");
                fetchParty();
              } catch (e) {
                const msg = typeof e === "string" ? e : e?.message || "";
                if (msg.includes("QUEUE_RESTRICTED")) setQueueError("You are currently queue restricted (banned). Wait for your penalty to expire.");
                else if (msg.includes("403")) setQueueError("Unable to join queue — you may be restricted.");
                else setQueueError(msg || "Failed to join queue.");
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
              <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3" /></svg>{queueing ? "..." : "Queue"}</>
            )}
          </button>
        )}
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
      </div>

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

      <div className="space-y-1.5">
        {party.members.map((member) => (
          <MemberCard
            key={member.puuid}
            member={member}
            isLeader={isLeader}
            isMe={member.puuid === party.my_puuid}
            onKick={() => handleKick(member.puuid)}
          />
        ))}
      </div>

      {queueError && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setQueueError(null)} onKeyDown={(e) => e.key === "Escape" && setQueueError(null)}>
          <div className="bg-base-700 border border-border rounded-2xl p-5 w-80 shadow-xl" onClick={(e) => e.stopPropagation()}>
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
          </div>
        </div>
      )}

      {showJoin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => { setShowJoin(false); setJoinCode(""); }}>
          <div className="bg-base-700 border border-border rounded-xl p-5 w-80 shadow-2xl" onClick={(e) => e.stopPropagation()}>
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
          </div>
        </div>
      )}
    </div>
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

