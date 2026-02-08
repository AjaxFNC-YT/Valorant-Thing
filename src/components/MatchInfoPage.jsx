import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion } from "framer-motion";

const AGENT_MAP_URL = "https://valorant-api.com/v1/agents?isPlayableCharacter=true";
const COMP_TIERS_URL = "https://valorant-api.com/v1/competitivetiers";
const MAPS_URL = "https://valorant-api.com/v1/maps";
const POLL_INTERVAL = 5000;
const CACHE_TTL = 10 * 60 * 1000;

const playerCache = new Map();

function getCached(puuid, key) {
  const entry = playerCache.get(puuid);
  if (!entry) return undefined;
  if (Date.now() - entry.ts > CACHE_TTL) { playerCache.delete(puuid); return undefined; }
  return entry[key];
}

function setCache(puuid, key, value) {
  const entry = playerCache.get(puuid) || { ts: Date.now() };
  entry[key] = value;
  entry.ts = Date.now();
  playerCache.set(puuid, entry);
}

export default function MatchInfoPage({ henrikApiKey, player: selfPlayer, connected }) {
  const myPuuid = selfPlayer?.puuid;
  const [players, setPlayers] = useState([]);
  const [agents, setAgents] = useState({});
  const [tiers, setTiers] = useState({});
  const [maps, setMaps] = useState({});
  const [matchPhase, setMatchPhase] = useState(null);
  const [mapId, setMapId] = useState(null);
  const [matchId, setMatchId] = useState(null);
  const [matchInfo, setMatchInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState(null);
  const fetchedMatchRef = useRef(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    fetch(AGENT_MAP_URL)
      .then((r) => r.json())
      .then((res) => {
        const map = {};
        (res.data || []).forEach((a) => {
          map[a.uuid.toLowerCase()] = a;
        });
        setAgents(map);
      })
      .catch(() => {});
    fetch(COMP_TIERS_URL)
      .then((r) => r.json())
      .then((res) => {
        const episodes = res.data || [];
        const latest = episodes[episodes.length - 1];
        if (!latest) return;
        const map = {};
        (latest.tiers || []).forEach((t) => {
          map[t.tier] = { name: t.tierName === "Unused1" || t.tierName === "Unused2" ? "Unranked" : t.tierName, icon: t.smallIcon };
        });
        setTiers(map);
      })
      .catch(() => {});
    fetch(MAPS_URL)
      .then((r) => r.json())
      .then((res) => {
        const m = {};
        (res.data || []).forEach((map) => {
          if (map.mapUrl) m[map.mapUrl.toLowerCase()] = map;
          m[map.uuid.toLowerCase()] = map;
        });
        setMaps(m);
      })
      .catch(() => {});
  }, []);

  const fetchMatchData = useCallback(async () => {
    try {
      const raw = await invoke("check_current_game");
      const match = JSON.parse(raw);
      const phase = match._phase === "pregame" ? "PREGAME" : "INGAME";
      const matchId = match.ID || match.MatchID;
      setMatchPhase(phase);
      setMapId(match.MapID || null);
      setMatchId(matchId);

      const modeUrl = match.GameMode || match.Mode || "";
      const queueId = match.MatchmakingData?.QueueID || match.QueueID || "";
      let modeName = queueId || "Custom";
      if (modeUrl.includes("competitive") || queueId === "competitive") modeName = "Competitive";
      else if (modeUrl.includes("unrated") || queueId === "unrated") modeName = "Unrated";
      else if (modeUrl.includes("deathmatch") || queueId === "deathmatch") modeName = "Deathmatch";
      else if (modeUrl.includes("spikerush") || queueId === "spikerush") modeName = "Spike Rush";
      else if (modeUrl.includes("swiftplay") || queueId === "swiftplay") modeName = "Swiftplay";
      else if (modeUrl.includes("ggteam") || queueId === "ggteam") modeName = "Escalation";
      else if (queueId === "premier") modeName = "Premier";

      const nonTeamModes = ["Deathmatch"];
      const isTeamMode = !nonTeamModes.includes(modeName);
      const info = { mode: modeName, server: match.GamePodID || "", isTeamMode };

      // Score tracking disabled — coregame endpoint doesn't return Teams/RoundsWon
      // if (phase === "INGAME" && isTeamMode) {
      //   const me = (match.Players || []).find((p) => p.Subject === myPuuid);
      //   const myTeam = me?.TeamID;
      //   const blueTeam = match.Teams?.find?.((t) => t.TeamID === "Blue");
      //   const redTeam = match.Teams?.find?.((t) => t.TeamID === "Red");
      //   info.allyScore = myTeam === "Blue" ? (blueTeam?.RoundsWon ?? 0) : (redTeam?.RoundsWon ?? 0);
      //   info.enemyScore = myTeam === "Blue" ? (redTeam?.RoundsWon ?? 0) : (blueTeam?.RoundsWon ?? 0);
      //   info.round = (info.allyScore + info.enemyScore + 1);
      // }

      setMatchInfo(info);

      const rawPlayers = phase === "PREGAME" ? (match.AllyTeam?.Players || []) : (match.Players || []);
      if (rawPlayers.length > 0) console.log("[MatchInfo] Sample PlayerIdentity:", JSON.stringify(rawPlayers[0]?.PlayerIdentity, null, 2));

      let playerList = [];
      if (phase === "PREGAME") {
        const ally = match.AllyTeam?.Players || [];
        playerList = ally.map((p) => ({
          puuid: p.Subject,
          characterId: p.CharacterID,
          team: "ally",
          accountLevel: p.PlayerIdentity?.AccountLevel || 0,
          incognito: p.PlayerIdentity?.Incognito || false,
          hideLevel: p.PlayerIdentity?.HideAccountLevel || false,
        }));
      } else {
        const all = match.Players || [];
        playerList = all.map((p) => ({
          puuid: p.Subject,
          characterId: p.CharacterID,
          team: p.TeamID,
          accountLevel: p.PlayerIdentity?.AccountLevel || 0,
          incognito: p.PlayerIdentity?.Incognito || false,
          hideLevel: p.PlayerIdentity?.HideAccountLevel || false,
        }));
      }

      const prevKey = fetchedMatchRef.current;
      const newKey = `${matchId}_${phase}`;
      if (prevKey === newKey) {
        setPlayers((prev) => prev.map((old) => {
          const updated = playerList.find((p) => p.puuid === old.puuid);
          return updated ? { ...old, characterId: updated.characterId, team: updated.team, accountLevel: updated.accountLevel } : old;
        }));
        setLoading(false);
        return;
      }
      fetchedMatchRef.current = newKey;
      const withCached = playerList.map((p) => ({
        ...p,
        account: getCached(p.puuid, "account") || null,
        mmr: getCached(p.puuid, "mmr") || null,
        _loading: !getCached(p.puuid, "account"),
      }));
      setPlayers(withCached);
      setLoading(false);

      const needsAccount = withCached.filter((p) => !p.account);
      const needsMmr = withCached.filter((p) => !p.mmr);

      if (needsAccount.length === 0 && needsMmr.length === 0) return;

      setError(null);
      if (needsAccount.length > 0) setFetching(true);

      if (needsAccount.length > 0) {
        try {
          const raw = await invoke("resolve_player_names", { puuids: needsAccount.map((p) => p.puuid) });
          if (cancelledRef.current) return;
          const names = JSON.parse(raw);
          const nameMap = {};
          names.forEach((n) => { nameMap[n.puuid] = n; });

          const isHidden = (n) => !n || !n.name || n.name === "" || /^[a-f0-9]{6,}$/i.test(n.name);

          const hiddenPuuids = needsAccount
            .filter((p) => isHidden(nameMap[p.puuid]) || p.incognito || p.hideLevel)
            .map((p) => p.puuid);

          needsAccount.forEach((p) => {
            const n = nameMap[p.puuid];
            if (n && !hiddenPuuids.includes(p.puuid)) setCache(p.puuid, "account", n);
          });

          setPlayers((prev) => prev.map((p) => {
            const n = nameMap[p.puuid];
            if (hiddenPuuids.includes(p.puuid)) return { ...p, _loading: !!henrikApiKey };
            return n ? { ...p, account: n, _loading: false } : { ...p, _loading: false };
          }));

          if (hiddenPuuids.length > 0 && henrikApiKey) {
            const henrikResults = await Promise.all(hiddenPuuids.map((puuid) =>
              invoke("henrik_get_account", { puuid, apiKey: henrikApiKey })
                .then((r) => {
                  const j = JSON.parse(r);
                  if (j.status === 429 || !j.data) return { puuid, data: null };
                  return { puuid, data: { name: j.data.name, tag: j.data.tag, account_level: j.data.account_level } };
                })
                .catch(() => ({ puuid, data: null }))
            ));
            if (cancelledRef.current) return;

            henrikResults.forEach((r) => { if (r.data) setCache(r.puuid, "account", r.data); });
            setPlayers((prev) => prev.map((p) => {
              const r = henrikResults.find((a) => a.puuid === p.puuid);
              return r?.data ? { ...p, account: r.data, _loading: false } : { ...p, _loading: false };
            }));
          } else if (hiddenPuuids.length > 0) {
            setPlayers((prev) => prev.map((p) =>
              hiddenPuuids.includes(p.puuid) ? { ...p, _loading: false } : p
            ));
          }
        } catch (e) {
          setError(`Name resolve failed: ${e}`);
          setPlayers((prev) => prev.map((p) => ({ ...p, _loading: false })));
        }
        setFetching(false);
      }

      const UNRANKED = { currenttier: 0, ranking_in_tier: 0 };

      const fetchMmr = (puuid) =>
        invoke("get_player_mmr", { targetPuuid: puuid })
          .then((raw) => {
            const json = JSON.parse(raw);
            return {
              puuid,
              data: {
                currenttier: json.currenttier || 0,
                ranking_in_tier: json.ranking_in_tier || 0,
              },
              limited: false,
            };
          })
          .catch(() => ({ puuid, data: UNRANKED, limited: false }));

      if (needsMmr.length === 0) return;

      let mmrResults = await Promise.all(needsMmr.map((p) => fetchMmr(p.puuid)));
      if (cancelledRef.current) return;

      const mmrLimited = mmrResults.filter((r) => r.limited).map((r) => r.puuid);
      mmrResults.filter((r) => !r.limited && r.data).forEach((r) => setCache(r.puuid, "mmr", r.data));

      setPlayers((prev) => prev.map((p) => {
        const r = mmrResults.find((a) => a.puuid === p.puuid);
        return r && !r.limited ? { ...p, mmr: r.data } : p;
      }));

      if (mmrLimited.length > 0) {
        await sleep(RATE_LIMIT_WAIT);
        if (cancelledRef.current) return;

        const retryMmr = await Promise.all(mmrLimited.map((puuid) => fetchMmr(puuid)));
        if (cancelledRef.current) return;

        retryMmr.filter((r) => r.data).forEach((r) => setCache(r.puuid, "mmr", r.data));
        setPlayers((prev) => prev.map((p) => {
          const r = retryMmr.find((a) => a.puuid === p.puuid);
          return r ? { ...p, mmr: r.data } : p;
        }));
      }
    } catch (err) {
      const msg = typeof err === "string" ? err : err?.message || "";
      if (msg.includes("Not in a match")) {
        setMatchPhase(null);
        setPlayers([]);
        fetchedMatchRef.current = null;
        setError(null);
        setFetching(false);
      }
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cancelledRef.current = false;
    setLoading(true);
    fetchMatchData();
    const timer = setInterval(fetchMatchData, POLL_INTERVAL);
    return () => {
      cancelledRef.current = true;
      clearInterval(timer);
    };
  }, [fetchMatchData]);

  if (!connected) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-text-muted/40">
          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
        </svg>
        <p className="text-text-muted text-sm font-body">Waiting for Valorant to connect</p>
      </div>
    );
  }

  if (!matchPhase) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-text-muted/25">
          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
        </svg>
        <div className="text-center space-y-1">
          <p className="text-sm font-display font-semibold text-text-secondary">No Active Match</p>
          <p className="text-xs font-body text-text-muted">Player info will appear when you enter a match</p>
        </div>
      </div>
    );
  }

  if (players.length === 0) {
    return (
      <div className="flex-1 flex flex-col min-h-0 p-4 gap-3 animate-pulse">
        <div className="h-[72px] rounded-xl bg-base-700 border border-border" />
        <div className="grid grid-cols-2 gap-4 flex-1">
          <div className="space-y-1.5">
            <div className="h-3 w-20 rounded bg-base-600 mb-2" />
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-2.5 p-2 rounded-lg bg-base-700 border border-border h-12">
                <div className="w-8 h-8 rounded-md bg-base-600 shrink-0" />
                <div className="flex-1 space-y-1">
                  <div className="h-3 w-24 rounded bg-base-600" />
                  <div className="h-2.5 w-14 rounded bg-base-600" />
                </div>
                <div className="h-6 w-6 rounded bg-base-600" />
              </div>
            ))}
          </div>
          <div className="space-y-1.5">
            <div className="h-3 w-20 rounded bg-base-600 mb-2" />
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-2.5 p-2 rounded-lg bg-base-700 border border-border h-12">
                <div className="w-8 h-8 rounded-md bg-base-600 shrink-0" />
                <div className="flex-1 space-y-1">
                  <div className="h-3 w-24 rounded bg-base-600" />
                  <div className="h-2.5 w-14 rounded bg-base-600" />
                </div>
                <div className="h-6 w-6 rounded bg-base-600" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const teamData = splitTeams(players, matchPhase, myPuuid);

  return (
    <div className="flex-1 flex flex-col min-h-0 p-4 gap-3">
      <MatchHeader mapId={mapId} maps={maps} matchPhase={matchPhase} matchInfo={matchInfo} matchId={matchId} playerCount={players.length} fetching={fetching} error={error} />

      <div className="flex-1 min-h-0 overflow-y-auto pr-1">
        {teamData.mode === "teams" ? (
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <p className="text-xs font-display font-bold tracking-wider text-status-green mb-2 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-status-green inline-block" />
                YOUR TEAM
              </p>
              {teamData.ally.map((p, i) => (
                <motion.div key={p.puuid} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.15, delay: i * 0.04 }}>
                <PlayerCard player={p} agents={agents} tiers={tiers} isSelf={p.puuid === myPuuid} />
                </motion.div>
              ))}
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-display font-bold tracking-wider text-val-red mb-2 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-val-red inline-block" />
                ENEMY TEAM
              </p>
              {teamData.enemy.map((p, i) => (
                <motion.div key={p.puuid} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.15, delay: i * 0.04 }}>
                <PlayerCard player={p} agents={agents} tiers={tiers} isSelf={p.puuid === myPuuid} />
                </motion.div>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-1.5">
            {teamData.all.map((p, i) => (
              <motion.div key={p.puuid} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.15, delay: i * 0.04 }}>
              <PlayerCard player={p} agents={agents} tiers={tiers} isSelf={p.puuid === myPuuid} />
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function splitTeams(players, phase, myPuuid) {
  if (phase === "PREGAME") {
    return { mode: "list", all: players };
  }
  const teamIds = [...new Set(players.map((p) => p.team))];
  if (teamIds.length === 2) {
    const me = players.find((p) => p.puuid === myPuuid);
    const myTeam = me?.team || teamIds[0];
    return {
      mode: "teams",
      ally: players.filter((p) => p.team === myTeam),
      enemy: players.filter((p) => p.team !== myTeam),
    };
  }
  return { mode: "list", all: players };
}

function parseServer(podId) {
  if (!podId) return "";
  const parts = podId.split("-");
  const gpIdx = parts.indexOf("gp");
  if (gpIdx >= 0 && gpIdx + 1 < parts.length) {
    const region = parts.slice(0, gpIdx).find((p) => ["na", "eu", "ap", "kr", "br", "latam"].includes(p))?.toUpperCase() || "";
    const city = parts[gpIdx + 1].charAt(0).toUpperCase() + parts[gpIdx + 1].slice(1).replace(/\d+$/, "");
    return region ? `${region} - ${city}` : city;
  }
  return podId.split(".").pop()?.split("-").slice(0, 2).join(" ") || podId;
}

function MatchHeader({ mapId, maps, matchPhase, matchInfo, matchId, playerCount, fetching, error }) {
  const mapData = mapId ? (maps[mapId.toLowerCase()] || null) : null;
  const mapName = mapData?.displayName || "Unknown Map";
  const mapImg = mapData?.listViewIcon || mapData?.splash || "";
  const isDeathmatch = matchInfo?.mode === "Deathmatch";
  const [leaving, setLeaving] = useState(false);

  return (
    <div className="shrink-0 rounded-xl overflow-hidden border border-border bg-base-700 relative">
      {mapImg && (
        <div className="absolute inset-0">
          <img src={mapImg} alt="" className="w-full h-full object-cover opacity-20" />
          <div className="absolute inset-0 bg-gradient-to-r from-base-700 via-base-700/80 to-transparent" />
        </div>
      )}
      <div className="relative flex items-center gap-4 px-4 py-3">
        {mapImg && (
          <div className="w-16 h-10 rounded-lg overflow-hidden bg-base-600 shrink-0 border border-border/50">
            <img src={mapImg} alt="" className="w-full h-full object-cover" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-display font-bold text-text-primary">{mapName}</h2>
            <span className="text-[10px] font-body text-text-muted px-1.5 py-0.5 rounded bg-base-600/80 border border-border/50">
              {matchPhase === "PREGAME" ? "Agent Select" : "In Game"}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[11px] font-body text-text-muted">{matchInfo?.mode || ""}</span>
            {matchInfo?.server && (
              <>
                <span className="text-[11px] text-text-muted/40">·</span>
                <span className="text-[11px] font-body text-text-muted">{parseServer(matchInfo.server)}</span>
              </>
            )}
            <span className="text-[11px] text-text-muted/40">·</span>
            <span className="text-[11px] font-body text-text-muted">{playerCount} players</span>
          </div>
        </div>

        {/* Score display disabled — coregame endpoint doesn't provide round scores */}

        {isDeathmatch && matchPhase === "INGAME" && matchId && (
          <button
            disabled={leaving}
            onClick={async () => {
              setLeaving(true);
              try { await invoke("coregame_quit", { matchId }); } catch {}
              setLeaving(false);
            }}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-status-red/15 border border-status-red/30 text-xs font-display font-semibold text-status-red hover:bg-status-red/25 transition-colors disabled:opacity-50"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
            {leaving ? "..." : "Leave"}
          </button>
        )}

        <div className="flex flex-col items-end gap-1 shrink-0">
          {fetching && (
            <div className="flex items-center gap-1.5">
              <Spinner />
              <span className="text-[10px] font-body text-text-muted">Fetching...</span>
            </div>
          )}
          {error && (
            <span className="text-[10px] font-body text-yellow-400 max-w-[140px] truncate">{error}</span>
          )}
        </div>
      </div>
    </div>
  );
}

function PlayerCard({ player, agents, tiers, isSelf }) {
  const agent = agents[player.characterId?.toLowerCase()];
  const acct = player.account;
  const mmr = player.mmr;
  const tierInfo = tiers[mmr?.currenttier] || null;
  const isLoading = player._loading;
  const displayName = acct?.name || agent?.displayName || player.puuid.slice(0, 8);
  const displayLevel = acct?.account_level || player.accountLevel || 0;

  return (
    <div className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border ${
      isSelf
        ? "bg-val-red/10 border-val-red/30"
        : "bg-base-700 border-border"
    }`}>
      <div className="w-10 h-10 rounded-lg bg-base-600 overflow-hidden shrink-0 flex items-center justify-center">
        {agent?.displayIconSmall ? (
          <img src={agent.displayIconSmall} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="text-text-muted text-[10px]">?</span>
        )}
      </div>

      <div className="flex-1 min-w-0">
        {isLoading ? (
          <div className="space-y-1.5">
            <div className="h-3.5 w-24 rounded bg-base-500 animate-pulse" />
            <div className="h-3 w-12 rounded bg-base-500/60 animate-pulse" />
          </div>
        ) : (
          <>
            <div className="flex items-center gap-1">
              <p className={`text-sm font-display font-bold truncate ${isSelf ? "text-val-red" : "text-text-primary"}`}>
                {displayName}
              </p>
              {acct?.tag && !player.incognito && (
                <span className="text-xs font-body text-text-muted">#{acct.tag}</span>
              )}
              {isSelf && (
                <span className="text-[9px] font-display font-bold text-val-red/70 uppercase tracking-wider ml-0.5">you</span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-body text-text-primary">
                {displayLevel > 0 ? `Level ${displayLevel}` : "Level ?"}
              </span>
              <span className="text-[11px] text-text-primary/50">·</span>
              <img
                src={tierInfo?.icon || "https://media.valorant-api.com/competitivetiers/03621f52-342b-cf4e-4f86-9350a49c6d04/0/smallicon.png"}
                alt="" className="w-3.5 h-3.5"
              />
              <span className="text-[11px] font-display font-semibold text-text-primary">
                {tierInfo?.name || "Unranked"}
              </span>
              <span className="text-[11px] text-text-primary/50">·</span>
              <span className="text-[11px] font-body text-text-primary/70">{mmr?.ranking_in_tier ?? 0}RR</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="w-4 h-4 animate-spin text-text-muted" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-20" />
      <path d="M12 2a10 10 0 019.95 9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
