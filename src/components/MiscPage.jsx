import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

export default function MiscPage({ connected, autoUnqueue, onAutoUnqueueChange, autoRequeue, onAutoRequeueChange }) {
  const [isLeader, setIsLeader] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!connected) { setIsLeader(false); setLoading(false); return; }
    let cancelled = false;
    const check = async () => {
      try {
        const raw = await invoke("get_party");
        if (cancelled) return;
        const data = JSON.parse(raw);
        const leader = data.members?.some(m => m.puuid === data.my_puuid && m.is_owner);
        setIsLeader(!!leader);
      } catch {
        if (!cancelled) setIsLeader(false);
      }
      if (!cancelled) setLoading(false);
    };
    check();
    const interval = setInterval(check, 15000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [connected]);

  const disabled = !connected || !isLeader;

  return (
    <div className="flex-1 flex flex-col min-h-0 p-5 gap-4 overflow-y-auto">
      <div className="flex items-center gap-2">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-text-muted">
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
        </svg>
        <h2 className="text-sm font-display font-semibold text-text-primary">Misc</h2>
      </div>

      <div className="p-4 rounded-xl bg-base-700 border border-border space-y-4">
        <h3 className="text-xs font-display font-medium text-text-secondary uppercase tracking-wider">Queue Automation</h3>

        {disabled && connected && !loading && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-status-yellow/10 border border-status-yellow/20">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-status-yellow shrink-0">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01" />
            </svg>
            <span className="text-[11px] font-body text-status-yellow">You must be party leader to use queue automation</span>
          </div>
        )}

        <div className={`flex items-center justify-between ${disabled ? "opacity-40 pointer-events-none" : ""}`}>
          <div>
            <p className="text-sm font-display font-medium text-text-primary">Auto Unqueue on Dodge</p>
            <p className="text-xs font-body text-text-muted mt-0.5">Leave queue when someone dodges your match</p>
          </div>
          <Toggle enabled={autoUnqueue} onChange={onAutoUnqueueChange} />
        </div>

        <div className={`flex items-center justify-between ${disabled ? "opacity-40 pointer-events-none" : ""}`}>
          <div>
            <p className="text-sm font-display font-medium text-text-primary">Auto Requeue</p>
            <p className="text-xs font-body text-text-muted mt-0.5">Automatically requeue when a match ends</p>
          </div>
          <Toggle enabled={autoRequeue} onChange={onAutoRequeueChange} />
        </div>
      </div>
    </div>
  );
}

function Toggle({ enabled, onChange }) {
  return (
    <button
      onClick={() => onChange(!enabled)}
      className={`w-9 h-5 rounded-full transition-colors duration-200 relative shrink-0 ${enabled ? "bg-val-red" : "bg-base-500"}`}
    >
      <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all duration-200 ${enabled ? "left-[18px]" : "left-0.5"}`} />
    </button>
  );
}
