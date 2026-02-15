const playerCache = new Map();
const CACHE_TTL = 10 * 60 * 1000;

export function getCached(puuid, key) {
  const entry = playerCache.get(puuid);
  if (!entry) return undefined;
  if (Date.now() - entry.ts > CACHE_TTL) { playerCache.delete(puuid); return undefined; }
  return entry[key];
}

export function setCache(puuid, key, value) {
  const entry = playerCache.get(puuid) || { ts: Date.now() };
  entry[key] = value;
  entry.ts = Date.now();
  playerCache.set(puuid, entry);
}
