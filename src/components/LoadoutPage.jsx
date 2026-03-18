import { useState, useEffect, useMemo, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion, AnimatePresence } from "framer-motion";

const ITEM_TYPES = {
  SKIN_LEVEL: "3ad1b2b2-acdb-4524-852f-954a76ddae0a",
  SKIN_CHROMA: "e7c63390-eda7-46e0-bb7a-a6abdacd2433",
  BUDDY: "dd3bf334-87f3-40bd-b043-682a57a8dc3a",
  SPRAY: "d5f120f8-ff8c-4aac-92ea-f2b5acbe9475",
  CARD: "3f296c07-64c3-494c-923b-fe692a4fa1bd",
  TITLE: "de7caa6b-adf7-4588-bbd1-143831e786c6",
};

const CATEGORY_ORDER = {
  "EEquippableCategory::Sidearm": 0,
  "EEquippableCategory::SMG": 1,
  "EEquippableCategory::Shotgun": 2,
  "EEquippableCategory::Rifle": 3,
  "EEquippableCategory::Sniper": 4,
  "EEquippableCategory::Heavy": 5,
  "EEquippableCategory::Melee": 6,
};

const CATEGORY_LABELS = {
  "EEquippableCategory::Sidearm": "SIDEARMS",
  "EEquippableCategory::SMG": "SMGS",
  "EEquippableCategory::Shotgun": "SHOTGUNS",
  "EEquippableCategory::Rifle": "RIFLES",
  "EEquippableCategory::Sniper": "SNIPERS",
  "EEquippableCategory::Heavy": "HEAVY WEAPONS",
  "EEquippableCategory::Melee": "MELEE",
};

const RARITY_COLORS = {
  "0cebb8be-46d7-c12a-d306-e9907bfc5a25": "#5a9fe2",
  "60bca009-4182-7998-dee7-b8a2558dc369": "#009587",
  "12683d76-48d7-84a3-4e09-6985794f0445": "#d1548d",
  "411e4a55-4e59-7757-41f0-86a53f101bb5": "#f5955b",
  "e046854e-406c-37f4-6607-19a9ba8426fc": "#fad663",
};

const SPRAY_SLOTS = [
  { id: "0814b2fe-4512-60a4-5288-1fbdcec6ca48", label: "Pre-Round" },
  { id: "04af080a-4071-487b-61c0-5b9c0cfaac74", label: "Mid-Round" },
  { id: "5863985e-43ac-b05d-cb2d-139e72970571", label: "Post-Round" },
];

let apiCache = {};
async function apiFetch(endpoint) {
  if (apiCache[endpoint]) return apiCache[endpoint];
  const res = await fetch(`https://valorant-api.com/v1/${endpoint}`);
  const data = await res.json();
  apiCache[endpoint] = data.data;
  return data.data;
}

async function fetchOwnedIds(typeId) {
  try {
    const raw = await invoke("get_owned_items", { itemTypeId: typeId });
    const json = JSON.parse(raw);
    let items = [];
    if (json.Entitlements) {
      items = json.Entitlements;
    } else if (json.EntitlementsByTypes) {
      for (const group of json.EntitlementsByTypes) {
        items.push(...(group.Entitlements || []));
      }
    }
    return new Set(items.map(e => e.ItemID.toLowerCase()));
  } catch (e) {
    console.error(`[Loadout] Failed to fetch owned ${typeId}:`, e);
    return new Set();
  }
}

function Img({ src, className = "", fallback = null }) {
  const [err, setErr] = useState(false);
  if (!src || err) return fallback || <div className={`bg-base-600/50 ${className}`} />;
  return <img src={src} alt="" className={className} onError={() => setErr(true)} loading="lazy" draggable={false} />;
}

export default function LoadoutPage({ connected }) {
  const [weapons, setWeapons] = useState([]);
  const [sprays, setSprays] = useState([]);
  const [cards, setCards] = useState([]);
  const [titles, setTitles] = useState([]);
  const [buddies, setBuddies] = useState([]);
  const [loadout, setLoadout] = useState(null);
  const [pending, setPending] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [owned, setOwned] = useState({ levels: new Set(), chromas: new Set(), buddies: new Set(), sprays: new Set(), cards: new Set(), titles: new Set() });
  const [picker, setPicker] = useState(null);
  const [search, setSearch] = useState("");

  const hasChanges = useMemo(() => {
    if (!loadout || !pending) return false;
    return JSON.stringify(loadout) !== JSON.stringify(pending);
  }, [loadout, pending]);

  const fetchAll = useCallback(async () => {
    if (!connected) return;
    setLoading(true);
    setError(null);
    try {
      const [weaps, sprayData, cardData, titleData, buddyData, loadoutRaw] = await Promise.all([
        apiFetch("weapons"), apiFetch("sprays"), apiFetch("playercards"),
        apiFetch("playertitles"), apiFetch("buddies"), invoke("get_loadout"),
      ]);
      setWeapons(weaps);
      setSprays(sprayData);
      setCards(cardData);
      setTitles(titleData);
      setBuddies(buddyData);
      const parsed = JSON.parse(loadoutRaw);
      setLoadout(parsed);
      setPending(JSON.parse(JSON.stringify(parsed)));

      const [levels, chromas, buds, sprys, crds, ttls] = await Promise.all([
        fetchOwnedIds(ITEM_TYPES.SKIN_LEVEL), fetchOwnedIds(ITEM_TYPES.SKIN_CHROMA),
        fetchOwnedIds(ITEM_TYPES.BUDDY), fetchOwnedIds(ITEM_TYPES.SPRAY),
        fetchOwnedIds(ITEM_TYPES.CARD), fetchOwnedIds(ITEM_TYPES.TITLE),
      ]);
      const skinUuids = new Set();
      const levelUuids = new Set();
      for (const w of weaps) {
        for (const s of (w.skins || [])) {
          skinUuids.add(s.uuid.toLowerCase());
          for (const l of (s.levels || [])) levelUuids.add(l.uuid.toLowerCase());
        }
      }
      let bySkin = 0, byLevel = 0;
      for (const id of levels) {
        if (skinUuids.has(id)) bySkin++;
        if (levelUuids.has(id)) byLevel++;
      }
      console.log(`[Loadout] Entitlement ID matching: ${bySkin} match skin UUIDs, ${byLevel} match level UUIDs (out of ${levels.size} owned)`);
      setOwned({ levels, chromas, buddies: buds, sprays: sprys, cards: crds, titles: ttls });
    } catch (e) {
      setError(typeof e === "string" ? e : e?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [connected]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const weaponsByCategory = useMemo(() => {
    const groups = {};
    for (const w of weapons) {
      const cat = w.category || "Unknown";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(w);
    }
    return Object.entries(groups).sort(([a], [b]) => (CATEGORY_ORDER[a] ?? 99) - (CATEGORY_ORDER[b] ?? 99));
  }, [weapons]);

  const findSkinByLevel = useCallback((weapon, levelId) => {
    if (!weapon?.skins || !levelId) return null;
    for (const skin of weapon.skins) {
      if (skin.levels?.some(l => l.uuid.toLowerCase() === levelId.toLowerCase())) return skin;
    }
    return null;
  }, []);

  const findChroma = useCallback((skin, chromaId) => {
    if (!skin?.chromas || !chromaId) return null;
    return skin.chromas.find(c => c.uuid.toLowerCase() === chromaId.toLowerCase()) || null;
  }, []);

  const getEquipped = useCallback((weaponUuid) => {
    return pending?.Guns?.find(g => g.ID.toLowerCase() === weaponUuid.toLowerCase());
  }, [pending]);

  const getSkinImg = (skin, chroma) => {
    if (chroma) return chroma.fullRender || chroma.displayIcon || skin?.displayIcon;
    return skin?.chromas?.[0]?.fullRender || skin?.chromas?.[0]?.displayIcon || skin?.displayIcon;
  };

  const getAllSkins = useCallback((weapon) => {
    if (!weapon?.skins) return [];
    return weapon.skins.filter(s => s.displayIcon || s.chromas?.[0]?.displayIcon || s.chromas?.[0]?.fullRender);
  }, []);

  const getOwnedChromas = useCallback((skin) => {
    if (!skin?.chromas) return [];
    return skin.chromas;
  }, []);

  const getOwnedLevels = useCallback((skin) => {
    if (!skin?.levels) return [];
    return skin.levels;
  }, []);

  const equipSkin = useCallback((weaponUuid, skin, chroma, level) => {
    setPending(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      const gun = next.Guns?.find(g => g.ID.toLowerCase() === weaponUuid.toLowerCase());
      if (!gun) return prev;
      gun.SkinID = skin.uuid;
      gun.SkinLevelID = level?.uuid || skin.levels?.[skin.levels.length - 1]?.uuid || gun.SkinLevelID;
      gun.ChromaID = chroma?.uuid || skin.chromas?.[0]?.uuid || gun.ChromaID;
      return next;
    });
  }, []);

  const equipSpray = useCallback((slotId, sprayUuid) => {
    setPending(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      const slot = next.Sprays?.find(s => s.EquipSlotID === slotId);
      if (slot) slot.SprayID = sprayUuid;
      return next;
    });
  }, []);

  const equipCard = useCallback((cardId) => {
    setPending(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      if (next.Identity) next.Identity.PlayerCardID = cardId;
      return next;
    });
  }, []);

  const equipTitle = useCallback((titleId) => {
    setPending(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      if (next.Identity) next.Identity.PlayerTitleID = titleId;
      return next;
    });
  }, []);

  const saveLoadout = useCallback(async () => {
    if (!pending || saving) return;
    setSaving(true);
    setError(null);
    try {
      const body = { Guns: pending.Guns, Sprays: pending.Sprays, Identity: pending.Identity, Incognito: pending.Incognito };
      const jsonStr = JSON.stringify(body);
      console.log("[Loadout] Saving, body length:", jsonStr.length);
      await invoke("set_loadout", { loadoutJson: jsonStr });
      const verifyRaw = await invoke("get_loadout");
      const verified = JSON.parse(verifyRaw);
      console.log("[Loadout] Verified version:", verified.Version);
      setLoadout(verified);
      setPending(JSON.parse(JSON.stringify(verified)));
      setSuccessMsg("Loadout updated! Restart game to see changes.");
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (e) {
      console.error("[Loadout] Save error:", e);
      setError(typeof e === "string" ? e : e?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }, [pending, saving]);

  const resetLoadout = useCallback(() => {
    if (!loadout) return;
    setPending(JSON.parse(JSON.stringify(loadout)));
    setPicker(null);
  }, [loadout]);

  const closePicker = () => { setPicker(null); setSearch(""); };

  if (!connected) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <p className="text-text-muted text-sm">Connect to Valorant to manage your loadout</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="flex items-center gap-3 text-text-muted text-sm">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
          Loading loadout...
        </div>
      </div>
    );
  }

  const renderWeaponCard = (weapon) => {
    const eq = getEquipped(weapon.uuid);
    const skin = eq ? findSkinByLevel(weapon, eq.SkinLevelID) : null;
    const chroma = skin ? findChroma(skin, eq?.ChromaID) : null;
    const imgUrl = getSkinImg(skin, chroma) || weapon.displayIcon;
    const skinName = skin?.displayName?.replace(weapon.displayName, "").trim() || "Standard";
    const rarity = skin?.contentTierUuid;
    const rarityColor = rarity ? RARITY_COLORS[rarity] : null;

    return (
      <button
        key={weapon.uuid}
        onClick={() => { setPicker({ type: "weapon", weapon }); setSearch(""); }}
        className="group relative bg-base-700/60 hover:bg-base-600/80 border border-border/50 hover:border-border rounded-lg overflow-hidden transition-all duration-150 flex flex-col"
      >
        {rarityColor && <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ backgroundColor: rarityColor }} />}
        <div className="flex-1 flex items-center justify-center p-3 min-h-[70px]">
          <Img src={imgUrl} className="max-w-full max-h-[56px] object-contain drop-shadow-lg" />
        </div>
        <div className="px-2 pb-2 text-center">
          <div className="text-[10px] font-display font-bold text-text-primary uppercase tracking-wide truncate">{weapon.displayName}</div>
          <div className="text-[9px] text-text-muted truncate" style={rarityColor ? { color: rarityColor } : {}}>{skinName}</div>
        </div>
      </button>
    );
  };

  const renderSprayCard = (slot) => {
    const eq = pending?.Sprays?.find(s => s.EquipSlotID === slot.id);
    const sprayData = sprays.find(s => s.uuid === eq?.SprayID);
    return (
      <button
        key={slot.id}
        onClick={() => { setPicker({ type: "spray", slot }); setSearch(""); }}
        className="bg-base-700/60 hover:bg-base-600/80 border border-border/50 hover:border-border rounded-lg overflow-hidden transition-all duration-150 flex flex-col"
      >
        <div className="flex-1 flex items-center justify-center p-2 min-h-[70px]">
          {sprayData?.displayIcon ? (
            <Img src={sprayData.displayIcon} className="max-w-full max-h-[56px] object-contain" />
          ) : (
            <div className="w-12 h-12 rounded bg-base-600/50" />
          )}
        </div>
        <div className="px-2 pb-2 text-center">
          <div className="text-[10px] font-display font-bold text-text-primary uppercase tracking-wide">{slot.label}</div>
          <div className="text-[9px] text-text-muted truncate">{sprayData?.displayName || "None"}</div>
        </div>
      </button>
    );
  };

  const renderIdentitySection = () => {
    const cardId = pending?.Identity?.PlayerCardID;
    const titleId = pending?.Identity?.PlayerTitleID;
    const cardData = cards.find(c => c.uuid === cardId);
    const titleData = titles.find(t => t.uuid === titleId);

    return (
      <div className="flex gap-3">
        <button
          onClick={() => { setPicker({ type: "card" }); setSearch(""); }}
          className="flex items-center gap-3 bg-base-700/60 hover:bg-base-600/80 border border-border/50 hover:border-border rounded-lg p-2.5 transition-all flex-1 min-w-0"
        >
          {cardData?.smallArt ? (
            <Img src={cardData.smallArt} className="w-10 h-10 rounded object-cover flex-shrink-0" />
          ) : (
            <div className="w-10 h-10 rounded bg-base-600/50 flex-shrink-0" />
          )}
          <div className="text-left min-w-0">
            <div className="text-[9px] font-display text-text-muted uppercase tracking-wider">Player Card</div>
            <div className="text-xs text-text-primary truncate">{cardData?.displayName || "Default"}</div>
          </div>
        </button>
        <button
          onClick={() => { setPicker({ type: "title" }); setSearch(""); }}
          className="flex items-center gap-3 bg-base-700/60 hover:bg-base-600/80 border border-border/50 hover:border-border rounded-lg p-2.5 transition-all flex-1 min-w-0"
        >
          <div className="w-10 h-10 rounded bg-base-600/50 flex-shrink-0 flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-text-muted">
              <path d="M4 7V4h16v3M9 20h6M12 4v16" />
            </svg>
          </div>
          <div className="text-left min-w-0">
            <div className="text-[9px] font-display text-text-muted uppercase tracking-wider">Title</div>
            <div className="text-xs text-text-primary truncate">{titleData?.titleText || "None"}</div>
          </div>
        </button>
      </div>
    );
  };

  const renderSkinPicker = () => {
    const weapon = picker.weapon;
    const ownedSkins = getAllSkins(weapon);
    const eq = getEquipped(weapon.uuid);
    const q = search.toLowerCase();
    const filtered = q ? ownedSkins.filter(s => s.displayName.toLowerCase().includes(q)) : ownedSkins;

    return (
      <div className="flex-1 flex flex-col min-h-0">
        <div className="px-4 py-3 border-b border-border flex items-center gap-3">
          <button onClick={closePicker} className="text-text-muted hover:text-text-primary transition-colors">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
          </button>
          <div>
            <div className="text-sm font-display font-bold text-text-primary uppercase tracking-wide">{weapon.displayName}</div>
            <div className="text-[10px] text-text-muted">{filtered.length} skins</div>
          </div>
        </div>
        <div className="px-4 py-2">
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search skins..." autoFocus
            className="w-full bg-base-700 border border-border rounded px-3 py-1.5 text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-text-muted/50"
          />
        </div>
        <div className="flex-1 overflow-y-auto custom-scroll px-4 pb-4 space-y-1.5">
          {filtered.map(skin => {
            const isEquipped = eq?.SkinID?.toLowerCase() === skin.uuid.toLowerCase();
            const ownedChroms = getOwnedChromas(skin);
            const ownedLvls = getOwnedLevels(skin);
            const topLevel = ownedLvls[ownedLvls.length - 1] || skin.levels?.[0];
            const rarity = skin.contentTierUuid;
            const rarityColor = rarity ? RARITY_COLORS[rarity] : null;

            return (
              <div key={skin.uuid} className={`rounded-lg border overflow-hidden transition-colors ${isEquipped ? "border-val-red/60 bg-val-red/5" : "border-border/50 bg-base-700/40 hover:bg-base-600/60"}`}>
                <button
                  onClick={() => equipSkin(weapon.uuid, skin, ownedChroms[0], topLevel)}
                  className="w-full p-3 flex items-center gap-4"
                >
                  <div className="w-28 h-14 flex-shrink-0 flex items-center justify-center">
                    <Img src={getSkinImg(skin, null)} className="max-w-full max-h-full object-contain" />
                  </div>
                  <div className="text-left min-w-0 flex-1">
                    <div className="text-xs font-display font-semibold text-text-primary">{skin.displayName}</div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {rarityColor && <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: rarityColor }} />}
                      <span className="text-[10px] text-text-muted">
                        {ownedLvls.length} level{ownedLvls.length !== 1 ? "s" : ""} · {ownedChroms.length} variant{ownedChroms.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                  </div>
                  {isEquipped && (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-val-red flex-shrink-0"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" /></svg>
                  )}
                </button>
                {isEquipped && ownedChroms.length > 1 && (
                  <div className="px-3 pb-2.5 pt-0.5 flex gap-1.5 flex-wrap border-t border-border/30">
                    <span className="text-[9px] text-text-muted mr-1 self-center">Variants:</span>
                    {ownedChroms.map(ch => {
                      const isCur = eq?.ChromaID?.toLowerCase() === ch.uuid.toLowerCase();
                      return (
                        <button key={ch.uuid} onClick={() => equipSkin(weapon.uuid, skin, ch, topLevel)}
                          className={`rounded border transition-colors ${isCur ? "border-val-red ring-1 ring-val-red/30" : "border-border/50 hover:border-text-muted/40"}`}
                          title={ch.displayName}>
                          {ch.swatch ? <img src={ch.swatch} alt="" className="w-6 h-6 rounded" /> : <div className="w-6 h-6 rounded bg-base-500 text-[8px] text-text-muted flex items-center justify-center">{ownedChroms.indexOf(ch) + 1}</div>}
                        </button>
                      );
                    })}
                  </div>
                )}
                {isEquipped && ownedLvls.length > 1 && (
                  <div className="px-3 pb-2.5 pt-0.5 flex gap-1 flex-wrap border-t border-border/30">
                    <span className="text-[9px] text-text-muted mr-1 self-center">Level:</span>
                    {ownedLvls.map((lvl, idx) => {
                      const isCur = eq?.SkinLevelID?.toLowerCase() === lvl.uuid.toLowerCase();
                      return (
                        <button key={lvl.uuid} onClick={() => equipSkin(weapon.uuid, skin, findChroma(skin, eq.ChromaID), lvl)}
                          className={`px-2 py-0.5 rounded text-[10px] border transition-colors ${isCur ? "border-val-red text-val-red bg-val-red/10" : "border-border/50 text-text-muted hover:border-text-muted/40"}`}>
                          {idx + 1}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderGridPicker = (items, equippedId, onSelect, label, renderItem) => {
    const q = search.toLowerCase();
    const filtered = q ? items.filter(i => (i.displayName || i.titleText || "").toLowerCase().includes(q)) : items;

    return (
      <div className="flex-1 flex flex-col min-h-0">
        <div className="px-4 py-3 border-b border-border flex items-center gap-3">
          <button onClick={closePicker} className="text-text-muted hover:text-text-primary transition-colors">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
          </button>
          <div>
            <div className="text-sm font-display font-bold text-text-primary uppercase tracking-wide">{label}</div>
            <div className="text-[10px] text-text-muted">{filtered.length} items</div>
          </div>
        </div>
        <div className="px-4 py-2">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={`Search ${label.toLowerCase()}...`} autoFocus
            className="w-full bg-base-700 border border-border rounded px-3 py-1.5 text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-text-muted/50" />
        </div>
        <div className="flex-1 overflow-y-auto custom-scroll px-4 pb-4">
          <div className={`grid gap-2 ${label === "Player Cards" ? "grid-cols-5" : label === "Player Titles" ? "grid-cols-3" : "grid-cols-5"}`}>
            {filtered.map(item => {
              const isEq = equippedId?.toLowerCase() === item.uuid.toLowerCase();
              return (
                <button key={item.uuid} onClick={() => onSelect(item.uuid)}
                  className={`rounded-lg border p-1.5 flex flex-col items-center gap-1 transition-colors ${isEq ? "border-val-red bg-val-red/5" : "border-border/50 bg-base-700/40 hover:bg-base-600/60"}`}
                  title={item.displayName || item.titleText || ""}>
                  {renderItem(item)}
                  <div className="text-[8px] text-text-muted text-center truncate w-full leading-tight">{item.displayName || item.titleText || "None"}</div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const renderPicker = () => {
    if (!picker) return null;

    if (picker.type === "weapon") return renderSkinPicker();

    if (picker.type === "spray") {
      const ownedList = sprays.filter(s => owned.sprays.has(s.uuid.toLowerCase()) || s.displayName === "Random Favorite Spray");
      const eq = pending?.Sprays?.find(s => s.EquipSlotID === picker.slot.id);
      return renderGridPicker(ownedList, eq?.SprayID, (id) => equipSpray(picker.slot.id, id), `${picker.slot.label} Spray`,
        (item) => <Img src={item.displayIcon} className="w-14 h-14 object-contain" fallback={<div className="w-14 h-14 bg-base-600/50 rounded" />} />
      );
    }

    if (picker.type === "card") {
      const ownedList = cards.filter(c => owned.cards.has(c.uuid.toLowerCase()));
      return renderGridPicker(ownedList, pending?.Identity?.PlayerCardID, equipCard, "Player Cards",
        (item) => <Img src={item.smallArt} className="w-12 h-16 object-cover rounded" fallback={<div className="w-12 h-16 bg-base-600/50 rounded" />} />
      );
    }

    if (picker.type === "title") {
      const ownedList = titles.filter(t => owned.titles.has(t.uuid.toLowerCase()) || t.titleText === "" || !t.titleText);
      return renderGridPicker(ownedList, pending?.Identity?.PlayerTitleID, equipTitle, "Player Titles",
        (item) => <div className="w-full h-8 flex items-center justify-center"><span className="text-[9px] text-text-primary text-center leading-tight px-1">{item.titleText || "None"}</span></div>
      );
    }
    return null;
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-4 py-2.5 border-b border-border flex items-center justify-between gap-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-val-red">
            <path d="M14.5 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V7.5L14.5 2z" /><polyline points="14 2 14 8 20 8" />
          </svg>
          <span className="text-sm font-display font-bold text-text-primary uppercase tracking-wide">Collection</span>
        </div>
        <div className="flex items-center gap-2">
          <AnimatePresence>
            {successMsg && (
              <motion.span initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="text-[10px] text-green-400">
                {successMsg}
              </motion.span>
            )}
          </AnimatePresence>
          {error && <span className="text-[10px] text-red-400 truncate max-w-[180px]">{error}</span>}
          {hasChanges && (
            <>
              <button onClick={resetLoadout} className="px-2 py-1 rounded text-[10px] font-display bg-base-600 hover:bg-base-500 text-text-secondary border border-border transition-colors">
                Discard
              </button>
              <button onClick={saveLoadout} disabled={saving}
                className="px-2.5 py-1 rounded text-[10px] font-display font-bold bg-val-red/20 hover:bg-val-red/30 text-val-red border border-val-red/40 transition-colors disabled:opacity-50 uppercase tracking-wider">
                {saving ? "Saving..." : "Save"}
              </button>
            </>
          )}
          <button onClick={fetchAll} className="p-1 rounded text-text-muted hover:text-text-primary transition-colors" title="Refresh">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M1 4v6h6M23 20v-6h-6" /><path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15" />
            </svg>
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {picker ? (
          <motion.div key="picker" className="flex-1 flex flex-col min-h-0" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.12 }}>
            {renderPicker()}
          </motion.div>
        ) : (
          <motion.div key="grid" className="flex-1 overflow-y-auto custom-scroll" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.1 }}>
            <div className="p-4 space-y-5">
              <div className="space-y-2">
                <div className="text-[10px] font-display font-bold text-text-muted uppercase tracking-widest">Identity</div>
                {renderIdentitySection()}
              </div>

              <div className="space-y-2">
                <div className="text-[10px] font-display font-bold text-text-muted uppercase tracking-widest">Sprays</div>
                <div className="grid grid-cols-3 gap-2">
                  {SPRAY_SLOTS.map(slot => renderSprayCard(slot))}
                </div>
              </div>

              {weaponsByCategory.map(([cat, weaps]) => (
                <div key={cat} className="space-y-2">
                  <div className="text-[10px] font-display font-bold text-text-muted uppercase tracking-widest">{CATEGORY_LABELS[cat] || cat}</div>
                  <div className="grid grid-cols-4 gap-2">
                    {weaps.map(w => renderWeaponCard(w))}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
