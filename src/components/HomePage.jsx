import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion } from "framer-motion";

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

const rankName = (tier) => RANKS.find(r => r.tier === tier)?.name || "Unranked";

const REFRESH_INTERVAL = 5 * 60 * 1000;

function formatTimer(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

let mapCache = null;
async function getMapData() {
  if (mapCache) return mapCache;
  try {
    const res = await fetch("https://valorant-api.com/v1/maps");
    const json = await res.json();
    const lookup = {};
    for (const m of json.data || []) {
      const key = m.mapUrl?.split("/").pop();
      if (key) lookup[key] = { name: m.displayName, splash: m.splash, listIcon: m.listViewIcon };
    }
    mapCache = lookup;
  } catch {
    mapCache = {};
  }
  return mapCache;
}

export default function HomePage({ connected, player, refreshKey, onRefresh }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [timeLeft, setTimeLeft] = useState(REFRESH_INTERVAL);
  const [maps, setMaps] = useState({});
  const [matches, setMatches] = useState(null);
  const [matchLoading, setMatchLoading] = useState(false);
  const lastFetchRef = useRef(0);
  const lastAutoRefresh = useRef(0);

  useEffect(() => { getMapData().then(setMaps); }, []);

  const fetchStats = useCallback(async () => {
    if (!connected) return;
    setLoading(true);
    setError(null);
    try {
      const raw = await invoke("get_home_stats", { queueFilter: "competitive" });
      const parsed = JSON.parse(raw);
      if (!parsed.level && !parsed.currentTier && !parsed.totalGames) {
        throw new Error("Empty stats returned — token may be stale");
      }
      setStats(parsed);
      lastFetchRef.current = Date.now();
      setTimeLeft(REFRESH_INTERVAL);
    } catch (e) {
      setError(typeof e === "string" ? e : e?.message || "Failed to load stats");
      if (Date.now() - lastAutoRefresh.current > 30000) {
        lastAutoRefresh.current = Date.now();
        onRefresh?.();
      }
    }
    setLoading(false);
  }, [connected, onRefresh]);

  const fetchMatches = useCallback(async () => {
    if (!connected) return;
    setMatchLoading(true);
    try {
      const raw = await invoke("get_match_page", { page: 0, pageSize: 25 });
      const data = JSON.parse(raw);
      setMatches(data.matches || []);
    } catch (e) {
      console.error("[matches] fetch failed:", e);
    }
    setMatchLoading(false);
  }, [connected]);

  useEffect(() => {
    if (connected) {
      fetchStats();
      fetchMatches();
    }
  }, [connected, refreshKey]);

  useEffect(() => {
    if (!connected) return;
    const id = setInterval(() => {
      const elapsed = Date.now() - lastFetchRef.current;
      const remaining = REFRESH_INTERVAL - elapsed;
      if (remaining <= 0) {
        fetchStats();
        fetchMatches();
      } else {
        setTimeLeft(remaining);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [connected, fetchStats]);

  if (!connected) {
    return (
      <div className="flex-1 flex items-center justify-center p-5">
        <div className="text-center space-y-2">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-text-muted mx-auto">
            <path d="M3 12a9 9 0 1018 0 9 9 0 00-18 0zM12 8v4M12 16h.01" />
          </svg>
          <p className="text-sm font-display text-text-muted">Connect to Riot first</p>
        </div>
      </div>
    );
  }

  const cardSmall = stats?.cardId ? `https://media.valorant-api.com/playercards/${stats.cardId}/smallart.png` : player?.player_card_url;
  const cardWide = stats?.cardId ? `https://media.valorant-api.com/playercards/${stats.cardId}/wideart.png` : null;
  const level = stats?.level || 0;
  const gameName = player?.game_name || "Player";
  const gameTag = player?.game_tag || "0000";

  const currentTier = stats?.currentTier || 0;
  const currentRR = stats?.currentRR || 0;
  const peakTier = stats?.peakTier || 0;
  const wins = stats?.wins || 0;
  const losses = stats?.losses || 0;
  const totalPlayed = wins + losses;
  const winRate = totalPlayed > 0 ? Math.round((wins / totalPlayed) * 100) : 0;
  const totalGames = stats?.totalGames || 0;

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
      <div className="relative h-36 shrink-0 overflow-hidden">
        {cardWide && (
          <img src={cardWide} alt="" className="absolute inset-0 w-full h-full object-cover" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-base-900/95 via-base-900/60 to-base-900/30" />

        <div className="absolute top-3 right-3 flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-black/40 backdrop-blur-sm">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-text-muted">
              <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
            </svg>
            <span className="text-[10px] font-mono text-text-muted tabular-nums">{formatTimer(timeLeft)}</span>
          </div>
          <button
            onClick={() => { fetchStats(); fetchMatches(page); }}
            disabled={loading}
            className="p-1.5 rounded-md bg-black/40 backdrop-blur-sm text-text-muted hover:text-text-primary transition-colors disabled:opacity-50"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={loading ? "animate-spin" : ""}>
              <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
            </svg>
          </button>
        </div>

        <div className="absolute bottom-3 left-4 flex items-end gap-3">
          {cardSmall && (
            <img src={cardSmall} alt="" className="w-14 h-14 rounded-lg border border-white/10 shadow-lg object-cover" />
          )}
          <div className="pb-0.5">
            <div className="flex items-baseline gap-0.5">
              <span className="text-lg font-display font-bold text-white drop-shadow-md">{gameName}</span>
              <span className="text-xs font-display text-white/50">#{gameTag}</span>
            </div>
            <p className="text-xs font-body text-white/40">Level {level}</p>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {error && (
          <div className="px-3 py-2 rounded-lg bg-status-red/10 border border-status-red/20 text-xs font-body text-status-red">{error}</div>
        )}

        {loading && !stats && (
          <div className="grid grid-cols-4 gap-3 animate-pulse">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="p-3 rounded-xl bg-base-700 border border-border space-y-2">
                <div className="h-2.5 w-16 rounded bg-base-600" />
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-full bg-base-600" />
                  <div className="space-y-1.5 flex-1">
                    <div className="h-4 w-20 rounded bg-base-600" />
                    <div className="h-3 w-12 rounded bg-base-600" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {stats && (
          <motion.div initial="hidden" animate="show" variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06 } } }} className="grid grid-cols-4 gap-3">
            <StatCard label="Current Rank" loading={loading}>
              <div className="flex items-center gap-2.5">
                <img src={rankIcon(currentTier)} alt="" className="w-10 h-10" />
                <div>
                  <p className="text-base font-display font-bold text-text-primary leading-tight">{rankName(currentTier)}</p>
                  <p className="text-xs font-body text-text-muted">{currentRR} RR</p>
                </div>
              </div>
            </StatCard>

            <StatCard label="Peak Rank" loading={loading}>
              <div className="flex items-center gap-2.5">
                <img src={rankIcon(peakTier)} alt="" className="w-10 h-10" />
                <p className="text-base font-display font-bold text-text-primary">{rankName(peakTier)}</p>
              </div>
            </StatCard>

            <StatCard label="Win Rate" loading={loading}>
              <p className="text-xl font-display font-bold text-text-primary">{winRate}%</p>
              <p className="text-xs font-body text-text-muted">{wins}W / {losses}L</p>
            </StatCard>

            <StatCard label="Total Games" loading={loading}>
              <p className="text-xl font-display font-bold text-text-primary">{totalGames}</p>
              <p className="text-xs font-body text-text-muted">Competitive</p>
            </StatCard>
          </motion.div>
        )}

        <h3 className="text-xs font-display font-semibold text-text-primary uppercase tracking-wider">Match History</h3>

        {matchLoading && !matches && (
          <div className="space-y-1.5 animate-pulse">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="h-14 rounded-lg bg-base-700 border border-border flex items-center px-3 gap-3">
                <div className="w-8 h-8 rounded-full bg-base-600 shrink-0" />
                <div className="w-14 space-y-1">
                  <div className="h-2.5 w-12 rounded bg-base-600" />
                  <div className="h-3 w-8 rounded bg-base-600" />
                </div>
                <div className="h-3 w-16 rounded bg-base-600" />
                <div className="ml-auto space-y-1 text-right">
                  <div className="h-3 w-20 rounded bg-base-600" />
                  <div className="h-2.5 w-12 rounded bg-base-600 ml-auto" />
                </div>
              </div>
            ))}
          </div>
        )}

        <div className={`space-y-1.5 ${matchLoading ? "opacity-60 pointer-events-none" : ""}`}>
          {(matches || []).map((m, i) => {
            const delay = Math.min(i * 0.03, 0.5);
            const mapData = maps[m.map];
            const mapName = mapData?.name || m.map;
            const mapImg = mapData?.listIcon || mapData?.splash;
            const draw = m.roundsWon === m.roundsLost;
            const resultText = draw ? "DRAW" : m.won ? "VICTORY" : "DEFEAT";
            const resultColor = draw ? "text-text-muted" : m.won ? "text-green-400" : "text-red-400";
            const borderColor = draw ? "border-text-muted/20" : m.won ? "border-green-500/20" : "border-red-500/20";
            const agentIcon = m.agent ? `https://media.valorant-api.com/agents/${m.agent}/displayicon.png` : null;
            const kda = m.deaths > 0 ? ((m.kills + m.assists) / m.deaths).toFixed(1) : "Perfect";

            return (
              <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay }} className={`relative rounded-lg overflow-hidden border ${borderColor} h-14 group`}>
                {mapImg && (
                  <img src={mapImg} alt="" className="absolute inset-0 w-full h-full object-cover opacity-20 group-hover:opacity-30 transition-opacity" />
                )}
                <div className="absolute inset-0 bg-gradient-to-r from-base-900/90 via-base-900/70 to-base-900/50" />

                <div className="relative h-full flex items-center px-3 gap-3">
                  {agentIcon && (
                    <img src={agentIcon} alt="" className="w-8 h-8 rounded-full border border-white/10 shrink-0" />
                  )}

                  <div className="w-16 shrink-0">
                    <p className={`text-[10px] font-display font-bold uppercase tracking-wide ${resultColor}`}>{resultText}</p>
                    <p className="text-xs font-mono text-text-muted">{m.roundsWon}-{m.roundsLost}</p>
                  </div>

                  <p className="text-xs font-display font-medium text-text-primary w-20 shrink-0">{mapName}</p>

                  <div className="flex items-center gap-3 ml-auto">
                    <div className="text-right">
                      <div className="flex items-center gap-0.5 text-xs font-mono">
                        <span className="text-text-primary font-semibold">{m.kills}</span>
                        <span className="text-text-muted">/</span>
                        <span className="text-red-400 font-semibold">{m.deaths}</span>
                        <span className="text-text-muted">/</span>
                        <span className="text-text-muted">{m.assists}</span>
                      </div>
                      <p className="text-[10px] font-mono text-text-muted">{kda} KDA</p>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, children, loading }) {
  return (
    <motion.div variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }} transition={{ duration: 0.2 }} className={`p-3 rounded-xl bg-base-700 border border-border space-y-1.5 ${loading ? "opacity-60" : ""}`}>
      <p className="text-[10px] font-display font-medium text-text-muted uppercase tracking-wider">{label}</p>
      {children}
    </motion.div>
  );
}
