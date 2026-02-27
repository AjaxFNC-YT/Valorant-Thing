import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, emitTo } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getCached, setCache } from "../matchCache";

const AGENT_URL = "https://valorant-api.com/v1/agents?isPlayableCharacter=true";
const TIERS_URL = "https://valorant-api.com/v1/competitivetiers";
const MAPS_URL = "https://valorant-api.com/v1/maps";
const POLL_INTERVAL = 2000;

export default function OverlayWindow() {
  const [players, setPlayers] = useState([]);
  const [matchPhase, setMatchPhase] = useState(null);
  const [mapId, setMapId] = useState(null);
  const [matchInfo, setMatchInfo] = useState(null);
  const [agents, setAgents] = useState({});
  const [tiers, setTiers] = useState({});
  const [maps, setMaps] = useState({});
  const [matchId, setMatchId] = useState(null);
  const [fetching, setFetching] = useState(false);
  const [dodging, setDodging] = useState(false);
  const fetchedMatchRef = useRef(null);
  const cancelledRef = useRef(false);
  const myPuuid = useRef(null);

  useEffect(() => {
    const applyTheme = (t) => {
      document.documentElement.setAttribute("data-theme", t || "crimson-moon");
      if (t === "custom") {
        try {
          const ct = JSON.parse(localStorage.getItem("custom_theme"));
          if (ct?.vars) Object.entries(ct.vars).forEach(([k, v]) => document.documentElement.style.setProperty(k, v));
        } catch {}
      }
    };
    applyTheme(localStorage.getItem("app_theme"));
    const unlisten = listen("overlay-theme", (e) => applyTheme(e.payload));
    return () => { unlisten.then(fn => fn()); };
  }, []);

  useEffect(() => {
    fetch(AGENT_URL).then(r => r.json()).then(res => {
      const m = {};
      (res.data || []).forEach(a => { m[a.uuid.toLowerCase()] = a; });
      setAgents(m);
    }).catch(() => {});
    fetch(TIERS_URL).then(r => r.json()).then(res => {
      const eps = res.data || [];
      const latest = eps[eps.length - 1];
      if (!latest) return;
      const m = {};
      (latest.tiers || []).forEach(t => {
        m[t.tier] = { name: t.tierName === "Unused1" || t.tierName === "Unused2" ? "Unranked" : t.tierName, icon: t.smallIcon };
      });
      setTiers(m);
    }).catch(() => {});
    fetch(MAPS_URL).then(r => r.json()).then(res => {
      const m = {};
      (res.data || []).forEach(map => {
        if (map.mapUrl) m[map.mapUrl.toLowerCase()] = map;
        m[map.uuid.toLowerCase()] = map;
      });
      setMaps(m);
    }).catch(() => {});
  }, []);

  const fetchMatchData = useCallback(async () => {
    const splooshimaApiKey = localStorage.getItem("splooshima_api_key") || "";
    const splooshimaAvailable = localStorage.getItem("splooshima_available") !== "false";

    try {
      const raw = await invoke("check_current_game");
      const match = JSON.parse(raw);
      const phase = match._phase === "pregame" ? "PREGAME" : "INGAME";
      const id = match.ID || match.MatchID;
      setMatchPhase(phase);
      setMapId(match.MapID || null);
      setMatchId(id);

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
      setMatchInfo({ mode: modeName, server: match.GamePodID || "" });

      let playerList;
      if (phase === "PREGAME") {
        const ally = match.AllyTeam?.Players || [];
        playerList = ally.map(p => ({
          puuid: p.Subject, characterId: p.CharacterID, team: "ally",
          accountLevel: p.PlayerIdentity?.AccountLevel || 0,
          incognito: p.PlayerIdentity?.Incognito || false,
          hideLevel: p.PlayerIdentity?.HideAccountLevel || false,
        }));
      } else {
        const all = match.Players || [];
        playerList = all.map(p => ({
          puuid: p.Subject, characterId: p.CharacterID, team: p.TeamID,
          accountLevel: p.PlayerIdentity?.AccountLevel || 0,
          incognito: p.PlayerIdentity?.Incognito || false,
          hideLevel: p.PlayerIdentity?.HideAccountLevel || false,
        }));
      }

      try {
        const statusRaw = await invoke("get_status");
        const statusData = JSON.parse(statusRaw);
        if (statusData?.puuid) myPuuid.current = statusData.puuid;
      } catch {}

      const prevKey = fetchedMatchRef.current;
      const newKey = `${id}_${phase}`;
      if (prevKey === newKey) {
        setPlayers(prev => prev.map(old => {
          const upd = playerList.find(p => p.puuid === old.puuid);
          return upd ? { ...old, characterId: upd.characterId, team: upd.team, accountLevel: upd.accountLevel } : old;
        }));
        return;
      }
      fetchedMatchRef.current = newKey;

      const withCached = playerList.map(p => ({
        ...p,
        account: getCached(p.puuid, "account") || null,
        mmr: getCached(p.puuid, "mmr") || null,
        _loading: !getCached(p.puuid, "account"),
      }));
      setPlayers(withCached);

      const needsAccount = withCached.filter(p => !p.account);
      if (needsAccount.length > 0) setFetching(true);

      if (needsAccount.length > 0) {
        const puuids = needsAccount.map(p => p.puuid);
        const resolved = {};

        try {
          const namesRaw = await invoke("resolve_player_names", { puuids });
          if (cancelledRef.current) return;
          JSON.parse(namesRaw).forEach(n => { if (n.name) { resolved[n.puuid] = { name: n.name, tag: n.tag }; setCache(n.puuid, "account", resolved[n.puuid]); } });
        } catch {}

        const needLevel = needsAccount.filter(p => (p.hideLevel || p.accountLevel === 0) && resolved[p.puuid]);
        if (needLevel.length > 0) {
          const levelResults = await Promise.all(needLevel.map(async (p) => {
            try {
              const raw = await invoke("get_player_level_from_history", { targetPuuid: p.puuid });
              const data = JSON.parse(raw);
              return { puuid: p.puuid, level: data.level || 0 };
            } catch { return { puuid: p.puuid, level: 0 }; }
          }));
          if (cancelledRef.current) return;
          levelResults.forEach(r => {
            if (r.level > 0 && resolved[r.puuid]) { resolved[r.puuid] = { ...resolved[r.puuid], account_level: r.level }; setCache(r.puuid, "account", resolved[r.puuid]); }
          });
        }

        let unresolvedNames = puuids.filter(id => !resolved[id]);
        let stillNeedLevel = needLevel.filter(p => !resolved[p.puuid]?.account_level);
        if ((unresolvedNames.length > 0 || stillNeedLevel.length > 0) && splooshimaApiKey && splooshimaAvailable) {
          try {
            const sPuuids = [...new Set([...unresolvedNames, ...stillNeedLevel.map(p => p.puuid)])];
            const sRaw = await invoke("splooshima_lookup", { puuids: sPuuids, apiKey: splooshimaApiKey });
            if (cancelledRef.current) return;
            const sData = JSON.parse(sRaw);
            (sData?.results || []).forEach(r => {
              const entry = { name: r.gameName || resolved[r.puuid]?.name, tag: r.tagLine || resolved[r.puuid]?.tag, account_level: r.level ?? resolved[r.puuid]?.account_level ?? null };
              if (entry.name) { resolved[r.puuid] = { ...resolved[r.puuid], ...entry }; setCache(r.puuid, "account", resolved[r.puuid]); }
              if (r.currentTier != null) { setCache(r.puuid, "mmr", { currenttier: r.currentTier || 0, ranking_in_tier: r.currentRR || 0, peaktier: r.peakTier || 0, peak_rr: r.peakRR || 0 }); }
            });
          } catch {}
        }

        setPlayers(prev => prev.map(p => {
          const r = resolved[p.puuid];
          const cachedMmr = getCached(p.puuid, "mmr") || null;
          return r ? { ...p, account: { ...p.account, ...r }, mmr: cachedMmr || p.mmr, _loading: false } : { ...p, mmr: cachedMmr || p.mmr, _loading: false };
        }));
        setFetching(false);
      }

      const needsMmr = withCached.filter(p => !getCached(p.puuid, "mmr"));
      if (needsMmr.length === 0) return;

      const extractPeak = (rawJson) => {
        try {
          const seasons = rawJson?.QueueSkills?.competitive?.SeasonalInfoBySeasonID;
          if (!seasons) return { peaktier: 0, peak_rr: 0 };
          let best = 0, bestRr = 0;
          Object.values(seasons).forEach(s => {
            const t = s.CompetitiveTier || 0;
            const r = s.RankedRating || 0;
            if (t > best || (t === best && r > bestRr)) { best = t; bestRr = r; }
          });
          return { peaktier: best, peak_rr: bestRr };
        } catch { return { peaktier: 0, peak_rr: 0 }; }
      };

      const fetchMmr = (puuid) =>
        invoke("get_player_mmr", { targetPuuid: puuid })
          .then(raw => {
            const j = JSON.parse(raw);
            const tier = j.currenttier || 0;
            const rr = j.ranking_in_tier || 0;
            if (tier === 0 && rr === 0) return { puuid, data: null, needsFallback: true };
            const peak = extractPeak(j.raw);
            return { puuid, data: { currenttier: tier, ranking_in_tier: rr, ...peak } };
          })
          .catch(() => ({ puuid, data: null, needsFallback: true }));

      let mmrResults = await Promise.all(needsMmr.map(p => fetchMmr(p.puuid)));
      if (cancelledRef.current) return;

      mmrResults.filter(r => r.data).forEach(r => setCache(r.puuid, "mmr", r.data));
      setPlayers(prev => prev.map(p => {
        const r = mmrResults.find(a => a.puuid === p.puuid);
        return r?.data ? { ...p, mmr: r.data } : p;
      }));

      const mmrFailed = mmrResults.filter(r => r.needsFallback).map(r => r.puuid);
      if (mmrFailed.length > 0 && splooshimaApiKey && splooshimaAvailable) {
        try {
          const sRaw = await invoke("splooshima_lookup", { puuids: mmrFailed, apiKey: splooshimaApiKey });
          if (cancelledRef.current) return;
          const sData = JSON.parse(sRaw);
          const smmrMap = {};
          (sData?.results || []).forEach(r => {
            if (r.currentTier != null && r.currentTier > 0) {
              smmrMap[r.puuid] = { currenttier: r.currentTier || 0, ranking_in_tier: r.currentRR || 0, peaktier: r.peakTier || 0, peak_rr: r.peakRR || 0 };
              setCache(r.puuid, "mmr", smmrMap[r.puuid]);
            }
          });
          setPlayers(prev => prev.map(p => smmrMap[p.puuid] ? { ...p, mmr: smmrMap[p.puuid] } : p));
        } catch {}
      }
    } catch (err) {
      const msg = typeof err === "string" ? err : err?.message || "";
      if (msg.includes("Not in a match")) {
        setMatchPhase(null);
        setPlayers([]);
        fetchedMatchRef.current = null;
        setFetching(false);
      }
    }
  }, []);

  useEffect(() => {
    cancelledRef.current = false;
    fetchMatchData();
    const timer = setInterval(fetchMatchData, POLL_INTERVAL);
    return () => { cancelledRef.current = true; clearInterval(timer); };
  }, [fetchMatchData]);

  const startDrag = () => getCurrentWindow().startDragging();

  const handleDodge = async () => {
    if (!matchId || dodging) return;
    setDodging(true);
    try {
      console.log("[Overlay] Dodging match:", matchId);
      await invoke("pregame_quit", { matchId });
      console.log("[Overlay] Dodge success");
    } catch (err) {
      console.error("[Overlay] Dodge failed:", err);
    }
    setDodging(false);
  };

  if (!matchPhase || players.length === 0) return null;

  const mapData = mapId ? maps[mapId.toLowerCase()] || null : null;
  const mapName = mapData?.displayName || "Unknown Map";
  const mapSplash = mapData?.listViewIcon || mapData?.splash || null;
  const teamData = splitTeams(players, matchPhase, myPuuid.current);
  const playerCount = players.length;

  return (
    <div className="w-full h-full flex flex-col">
      <div onMouseDown={startDrag} className="shrink-0 relative overflow-hidden cursor-move rounded-t-lg">
        {mapSplash && <img src={mapSplash} alt="" className="absolute inset-0 w-full h-full object-cover opacity-25" />}
        <div className="absolute inset-0 bg-gradient-to-r from-base-900/95 via-base-900/80 to-base-900/60" />
        <div className="relative flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-2 min-w-0">
            {mapSplash && (
              <div className="w-10 h-6 rounded overflow-hidden bg-base-600 shrink-0 border border-border/30">
                <img src={mapSplash} alt="" className="w-full h-full object-cover" />
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-display font-bold text-text-primary truncate">{mapName}</span>
                <span className="text-[9px] font-body text-text-muted px-1.5 py-0.5 rounded bg-base-600/60 backdrop-blur-sm">
                  {matchPhase === "PREGAME" ? "Agent Select" : "In Game"}
                </span>
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                {matchInfo?.mode && <span className="text-[9px] font-body text-text-muted">{matchInfo.mode}</span>}
                {matchInfo?.server && <><span className="text-[9px] text-text-muted/40">·</span><span className="text-[9px] font-body text-text-muted">{parseServer(matchInfo.server)}</span></>}
                <span className="text-[9px] text-text-muted/40">·</span>
                <span className="text-[9px] font-body text-text-muted">{playerCount} players</span>
                {fetching && <Spinner />}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {matchPhase === "PREGAME" && matchId && (
              <button disabled={dodging} onClick={(e) => { e.stopPropagation(); handleDodge(); }}
                className="flex items-center gap-1 px-2 py-1 rounded bg-status-red/15 border border-status-red/30 text-[10px] font-display font-semibold text-status-red hover:bg-status-red/25 transition-colors disabled:opacity-50">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
                </svg>
                {dodging ? "..." : "Dodge"}
              </button>
            )}
            <button onClick={(e) => { e.stopPropagation(); emitTo("main", "overlay-dismissed", matchId).catch(() => {}); getCurrentWindow().hide(); }}
              className="w-5 h-5 flex items-center justify-center rounded hover:bg-status-red/20 transition-colors text-text-muted hover:text-status-red">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto bg-base-900/90 rounded-b-lg">
        {teamData.mode === "teams" ? (
          <div className="p-2 space-y-1.5">
            <div className="space-y-0.5">
              <p className="text-[9px] font-display font-bold tracking-wider text-status-green px-1 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-status-green inline-block" /> YOUR TEAM
              </p>
              {teamData.ally.map(p => <PlayerRow key={p.puuid} player={p} agents={agents} tiers={tiers} isSelf={p.puuid === myPuuid.current} />)}
            </div>
            <div className="border-t border-border/40" />
            <div className="space-y-0.5">
              <p className="text-[9px] font-display font-bold tracking-wider text-val-red px-1 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-val-red inline-block" /> ENEMY TEAM
              </p>
              {teamData.enemy.map(p => <PlayerRow key={p.puuid} player={p} agents={agents} tiers={tiers} isSelf={p.puuid === myPuuid.current} />)}
            </div>
          </div>
        ) : (
          <div className="p-2 space-y-0.5">
            {teamData.all.map(p => <PlayerRow key={p.puuid} player={p} agents={agents} tiers={tiers} isSelf={p.puuid === myPuuid.current} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function parseServer(podId) {
  if (!podId) return "";
  const parts = podId.split("-");
  const gpIdx = parts.indexOf("gp");
  if (gpIdx >= 0 && gpIdx + 1 < parts.length) {
    const region = parts.slice(0, gpIdx).find(p => ["na", "eu", "ap", "kr", "br", "latam"].includes(p))?.toUpperCase() || "";
    const city = parts[gpIdx + 1].charAt(0).toUpperCase() + parts[gpIdx + 1].slice(1).replace(/\d+$/, "");
    return region ? `${region} - ${city}` : city;
  }
  return podId.split(".").pop()?.split("-").slice(0, 2).join(" ") || podId;
}

function splitTeams(players, phase, puuid) {
  if (phase === "PREGAME") return { mode: "list", all: players };
  const teams = [...new Set(players.map(p => p.team))];
  if (teams.length === 2) {
    const me = players.find(p => p.puuid === puuid);
    const myTeam = me?.team || teams[0];
    return { mode: "teams", ally: players.filter(p => p.team === myTeam), enemy: players.filter(p => p.team !== myTeam) };
  }
  return { mode: "list", all: players };
}

function PlayerRow({ player, agents, tiers, isSelf }) {
  const agent = agents[player.characterId?.toLowerCase()];
  const acct = player.account;
  const mmr = player.mmr;
  const tierInfo = tiers[mmr?.currenttier] || null;
  const peakInfo = tiers[mmr?.peaktier] || null;
  const name = acct?.name || agent?.displayName || player.puuid?.slice(0, 8) || "???";
  const tag = acct?.tag || "";
  const level = acct?.account_level || player.accountLevel || 0;

  if (player._loading) {
    return (
      <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-base-700/30 border border-border/20">
        <div className="w-8 h-8 rounded-md bg-base-600/80 shrink-0 animate-pulse" />
        <div className="flex-1 space-y-1.5">
          <div className="h-3.5 w-24 rounded bg-base-600/60 animate-pulse" />
          <div className="h-3 w-32 rounded bg-base-600/40 animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 px-2 py-1.5 rounded-lg border ${isSelf ? "bg-val-red/10 border-val-red/30" : "bg-base-700/40 border-border/20"}`}>
      <div className="w-8 h-8 rounded-md bg-base-600 overflow-hidden shrink-0 flex items-center justify-center">
        {agent?.displayIconSmall ? <img src={agent.displayIconSmall} alt="" className="w-full h-full object-cover" /> : <span className="text-text-muted text-[9px]">?</span>}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <span className={`text-[11px] font-display font-bold truncate ${isSelf ? "text-val-red" : "text-text-primary"}`}>{name}</span>
          {tag && <span className="text-[9px] font-body text-text-muted">#{tag}</span>}
          {(player.incognito || player.hideLevel) && (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-text-muted/50 shrink-0">
              <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
          )}
          {isSelf && <span className="text-[8px] font-display font-bold text-val-red/70 uppercase tracking-wider">you</span>}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-[10px] font-body text-text-muted tabular-nums shrink-0">{level > 0 ? `Lv${level}` : "Lv?"}</span>
          <span className="text-[10px] text-text-muted/40 shrink-0">·</span>
          <img src={tierInfo?.icon || "https://media.valorant-api.com/competitivetiers/03621f52-342b-cf4e-4f86-9350a49c6d04/0/smallicon.png"} alt="" className="w-3.5 h-3.5 shrink-0" />
          <span className="text-[10px] font-display font-semibold text-text-primary">{tierInfo?.name || "Unranked"}</span>
          <span className="text-[10px] font-body text-text-muted/70 tabular-nums shrink-0">{mmr?.ranking_in_tier ?? 0}RR</span>
          {peakInfo && mmr?.peaktier > 0 && (
            <>
              <span className="text-[10px] text-text-muted/40 shrink-0">·</span>
              <span className="text-[9px] font-body text-text-muted shrink-0">Peak:</span>
              <img src={peakInfo.icon} alt="" className="w-3 h-3 shrink-0" />
              <span className="text-[10px] font-display font-semibold text-text-primary">{peakInfo.name}</span>
              <span className="text-[10px] font-body text-text-muted/70 tabular-nums shrink-0">{mmr?.peak_rr ?? 0}RR</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="w-3 h-3 animate-spin text-text-muted" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-20" />
      <path d="M12 2a10 10 0 019.95 9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
