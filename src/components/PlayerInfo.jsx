import { useState, useRef } from "react";

const STATUS_CONFIG = {
  connected: {
    label: "Connected",
    color: "bg-status-green",
    textColor: "text-status-green",
    pulse: false,
  },
  connecting: {
    label: "Connecting",
    color: "bg-status-yellow",
    textColor: "text-status-yellow",
    pulse: true,
  },
  waiting: {
    label: "Waiting for game",
    color: "bg-status-yellow",
    textColor: "text-status-yellow",
    pulse: true,
  },
  disconnected: {
    label: "Disconnected",
    color: "bg-status-red",
    textColor: "text-status-red",
    pulse: false,
  },
};

export default function PlayerInfo({ status, player }) {
  const [imgError, setImgError] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [copied, setCopied] = useState(false);
  const tooltipTimer = useRef(null);
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.disconnected;

  const fullName = player ? `${player.game_name}#${player.game_tag}` : "";

  const handleNameClick = () => {
    if (!fullName) return;
    navigator.clipboard.writeText(fullName);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  const handleMouseEnter = () => {
    tooltipTimer.current = setTimeout(() => setShowTooltip(true), 400);
  };

  const handleMouseLeave = () => {
    clearTimeout(tooltipTimer.current);
    setShowTooltip(false);
  };

  return (
    <div className="flex items-center gap-2 min-w-0 flex-1">
      <div className="w-8 h-8 rounded-lg overflow-hidden bg-base-500 shrink-0 flex items-center justify-center">
        {player?.player_card_url && !imgError ? (
          <img
            src={player.player_card_url}
            alt=""
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-text-muted">
            <circle cx="12" cy="8" r="4" />
            <path d="M5 20c0-3.87 3.13-7 7-7s7 3.13 7 7" />
          </svg>
        )}
      </div>

      <div className="min-w-0 flex-1 overflow-hidden">
        {player ? (
          <div className="relative">
            <div
              className="text-[12px] font-display font-medium text-text-primary truncate leading-tight cursor-pointer hover:text-val-red transition-colors"
              onClick={handleNameClick}
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
            >
              {player.game_name}
              <span className="text-text-muted font-normal">#{player.game_tag}</span>
            </div>
            {(showTooltip || copied) && (
              <div className="absolute bottom-full left-0 mb-1.5 px-2 py-1 rounded-md bg-base-500 border border-border shadow-lg whitespace-nowrap z-50 pointer-events-none">
                <span className="text-[10px] font-body text-text-primary">
                  {copied ? "Copied!" : fullName}
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="text-[12px] font-display text-text-muted truncate leading-tight">
            Not signed in
          </div>
        )}

        <div className="flex items-center gap-1">
          <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.color} ${cfg.pulse ? "animate-pulse-dot" : ""}`} />
          <span className={`text-[10px] font-body ${cfg.textColor} leading-none truncate`}>
            {cfg.label}
          </span>
        </div>
      </div>
    </div>
  );
}
