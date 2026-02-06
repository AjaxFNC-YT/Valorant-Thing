import PlayerInfo from "./PlayerInfo";

export default function Sidebar({ status, player, onReconnect, activeTab, onTabChange, showLogs, pregameMatchId, onDodge, simplifiedTheme = true }) {
  return (
    <div className={`w-52 border-r border-border flex flex-col shrink-0 relative ${simplifiedTheme ? "bg-base-700" : ""}`}>
      <nav className="p-2 pt-3 space-y-0.5">
        <button
          onClick={() => onTabChange("instalock")}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-body transition-colors duration-150 ${
            activeTab === "instalock"
              ? "bg-base-500/60 text-text-primary"
              : "text-text-secondary hover:text-text-primary hover:bg-base-600/40"
          }`}
        >
          <span className={activeTab === "instalock" ? "text-val-red" : "text-text-muted"}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0110 0v4" />
            </svg>
          </span>
          Instalock
        </button>
        <button
          onClick={() => onTabChange("mapdodge")}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-body transition-colors duration-150 ${
            activeTab === "mapdodge"
              ? "bg-base-500/60 text-text-primary"
              : "text-text-secondary hover:text-text-primary hover:bg-base-600/40"
          }`}
        >
          <span className={activeTab === "mapdodge" ? "text-val-red" : "text-text-muted"}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M3 7l6-3 6 3 6-3v13l-6 3-6-3-6 3V7z" />
              <path d="M9 4v13M15 7v13" />
            </svg>
          </span>
          Map Dodge
        </button>
        <button
          onClick={() => onTabChange("matchinfo")}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-body transition-colors duration-150 ${
            activeTab === "matchinfo"
              ? "bg-base-500/60 text-text-primary"
              : "text-text-secondary hover:text-text-primary hover:bg-base-600/40"
          }`}
        >
          <span className={activeTab === "matchinfo" ? "text-accent-blue" : "text-text-muted"}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
            </svg>
          </span>
          Match Info
        </button>
        <button
          onClick={() => onTabChange("party")}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-body transition-colors duration-150 ${
            activeTab === "party"
              ? "bg-base-500/60 text-text-primary"
              : "text-text-secondary hover:text-text-primary hover:bg-base-600/40"
          }`}
        >
          <span className={activeTab === "party" ? "text-val-red" : "text-text-muted"}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
            </svg>
          </span>
          Party
        </button>
        <button
          onClick={() => onTabChange("misc")}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-body transition-colors duration-150 ${
            activeTab === "misc"
              ? "bg-base-500/60 text-text-primary"
              : "text-text-secondary hover:text-text-primary hover:bg-base-600/40"
          }`}
        >
          <span className={activeTab === "misc" ? "text-val-red" : "text-text-muted"}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
            </svg>
          </span>
          Misc
        </button>
        {showLogs && (
          <button
            onClick={() => onTabChange("logs")}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-body transition-colors duration-150 ${
              activeTab === "logs"
                ? "bg-base-500/60 text-text-primary"
                : "text-text-secondary hover:text-text-primary hover:bg-base-600/40"
            }`}
          >
            <span className={activeTab === "logs" ? "text-accent-blue" : "text-text-muted"}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
              </svg>
            </span>
            Logs
          </button>
        )}
      </nav>

      <div className="flex-1" />

      <div className="p-3 border-t border-border space-y-2">
        {pregameMatchId && (
          <button
            onClick={onDodge}
            className="w-full py-1.5 rounded-lg bg-val-red/20 hover:bg-val-red/30 border border-val-red/40 text-val-red text-xs font-display font-semibold tracking-wide transition-colors duration-150"
          >
            Dodge
          </button>
        )}
        <div className="flex items-center gap-1.5">
          <PlayerInfo status={status} player={player} />
          <button
            onClick={onReconnect}
            title="Refresh connection"
            className="w-6 h-6 shrink-0 rounded bg-base-600 hover:bg-base-500 flex items-center justify-center text-text-muted hover:text-text-secondary transition-colors duration-150"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M1 4v6h6M23 20v-6h-6" />
              <path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15" />
            </svg>
          </button>
          <button
            onClick={() => onTabChange("settings")}
            title="Settings"
            className="w-6 h-6 shrink-0 rounded bg-base-600 hover:bg-base-500 flex items-center justify-center text-text-muted hover:text-text-secondary transition-colors duration-150"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.39a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.74v-.5a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
        </div>
      </div>

    </div>
  );
}
