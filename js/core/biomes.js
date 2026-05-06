/* PokeNav — biome taxonomy + canonical ordering / colors / groups.
   Single source of truth for any panel that renders biome tags. */

const PokeNavBiomes = (() => {
  const TAXONOMY_URL = 'data/biome_taxonomy.json';
  const LS_MODS = 'pokenav_biome_mods';
  const DEFAULT_MODS = ['vanilla', 'cobblemon', 'terralith'];
  const LOCKED_MODS = new Set(['vanilla', 'cobblemon']);

  // Canonical groups (plan §C2). Order here is the order applied everywhere.
  const GROUPS = {
    aquatic: {
      dimension: 'overworld', label: 'Aquatic', emoji: '🌊', color: '#3b82f6',
      tags: ['ocean','deep_ocean','warm_ocean','lukewarm_ocean','cold_ocean',
             'frozen_ocean','river','frozen_river','beach','snowy_beach',
             'coast','freshwater'],
    },
    cold: {
      dimension: 'overworld', label: 'Cold', emoji: '❄️', color: '#7dd3fc',
      tags: ['cold','freezing','snowy','snowy_forest','snowy_taiga',
             'taiga','tundra','glacial'],
    },
    hot: {
      dimension: 'overworld', label: 'Hot/Arid', emoji: '🔥', color: '#f97316',
      tags: ['desert','badlands','savanna','arid','sandy','volcanic',
             'thermal','salt'],
    },
    forest: {
      dimension: 'overworld', label: 'Forest', emoji: '🌳', color: '#22c55e',
      tags: ['forest','jungle','bamboo','cherry_blossom','swamp','lush','muddy'],
    },
    plains: {
      dimension: 'overworld', label: 'Plains', emoji: '🌾', color: '#a3e635',
      tags: ['plains','grassland','sunflower_plains','floral','shrubland','temperate'],
    },
    vertical: {
      dimension: 'overworld', label: 'Vertical', emoji: '⛰️', color: '#a78bfa',
      tags: ['mountain','peak','highlands','hills','plateau'],
    },
    underground: {
      dimension: 'overworld', label: 'Underground', emoji: '🕳️', color: '#525252',
      tags: ['cave','dripstone','deep_dark'],
    },
    overworld_special: {
      dimension: 'overworld', label: 'Special', emoji: '✨', color: '#ec4899',
      tags: ['magical','spooky','mushroom','mushroom_fields','sky',
             'island','tropical_island','overworld',
             'autumn','spring','summer','winter','dense','sparse'],
    },
    nether: {
      dimension: 'nether', label: 'Nether', emoji: '🔥', color: '#dc2626',
      tags: ['nether','nether_basalt','nether_crimson','nether_desert','nether_forest',
             'nether_frozen','nether_fungus','nether_mountain','nether_overgrowth',
             'nether_quartz','nether_soul_fire','nether_soul_sand','nether_toxic',
             'nether_warped','nether_wasteland'],
    },
    end: {
      dimension: 'end', label: 'End', emoji: '🌌', color: '#7e22ce',
      tags: ['end','warped_desert','crystalline_chasm'],
    },
    aether: {
      dimension: 'aether', label: 'Aether', emoji: '☁️', color: '#67e8f9',
      tags: ['aether','skyroot_grove','skyroot_meadow','skyroot_forest',
             'skyroot_woodland','crystal_canyon','howling_constructs',
             'pollinated_fields','floral_meadow'],
    },
    bumblezone: {
      dimension: 'bumblezone', label: 'Bumblezone', emoji: '🐝', color: '#facc15',
      tags: ['bumblezone'],
    },
  };

  const GROUP_ORDER = [
    'aquatic','cold','hot','forest','plains','vertical','underground',
    'overworld_special','nether','end','aether','bumblezone',
  ];

  const DIMENSIONS = ['overworld','nether','end','aether','bumblezone'];
  const DIMENSION_LABELS = {
    overworld: { label: 'Overworld', emoji: '🌍' },
    nether:    { label: 'Nether',    emoji: '🔥' },
    end:       { label: 'End',       emoji: '🌌' },
    aether:    { label: 'Aether',    emoji: '☁️' },
    bumblezone:{ label: 'Bumblezone', emoji: '🐝' },
  };

  const tagToGroup = {};
  for (const key of GROUP_ORDER) {
    for (const tag of GROUPS[key].tags) tagToGroup[tag] = key;
  }

  let taxonomy = {};
  let enabledMods = new Set(DEFAULT_MODS);
  const subscribers = [];
  let loadPromise = null;

  function load() {
    if (loadPromise) return loadPromise;
    loadPromise = Promise.resolve().then(() => {
      taxonomy = window.POKENAV_BIOME_TAXONOMY || {};
      loadEnabledMods();
    });
    return loadPromise;
  }

  function loadEnabledMods() {
    try {
      const raw = localStorage.getItem(LS_MODS);
      if (raw) {
        enabledMods = new Set(JSON.parse(raw));
        for (const m of LOCKED_MODS) enabledMods.add(m);
      } else {
        enabledMods = new Set(DEFAULT_MODS);
      }
    } catch (e) {
      enabledMods = new Set(DEFAULT_MODS);
    }
  }

  function getGroup(tag) {
    if (tagToGroup[tag]) return tagToGroup[tag];
    if (typeof tag === 'string' && tag.startsWith('nether')) return 'nether';
    return 'overworld_special';
  }

  function getGroupColor(tag) { return GROUPS[getGroup(tag)].color; }
  function getGroupMeta(key)  { return GROUPS[key]; }
  function getGroupOrder()    { return GROUP_ORDER.slice(); }
  function getDimension(tag)  { return GROUPS[getGroup(tag)].dimension; }
  function getDimensionMeta(d){ return DIMENSION_LABELS[d]; }
  function getDimensionOrder(){ return DIMENSIONS.slice(); }

  function prettyBiome(tag) {
    return String(tag).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  function sortBiomes(list) {
    const arr = [...list];
    arr.sort((a, b) => {
      const ag = getGroup(a), bg = getGroup(b);
      const ai = GROUP_ORDER.indexOf(ag);
      const bi = GROUP_ORDER.indexOf(bg);
      if (ai !== bi) return ai - bi;
      const tags = GROUPS[ag].tags;
      const aIdx = tags.indexOf(a);
      const bIdx = tags.indexOf(b);
      if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
      if (aIdx !== -1) return -1;
      if (bIdx !== -1) return 1;
      return a.localeCompare(b);
    });
    return arr;
  }

  function groupBiomes(list) {
    const out = {};
    for (const b of list) {
      const g = getGroup(b);
      (out[g] = out[g] || []).push(b);
    }
    for (const g of Object.keys(out)) out[g] = sortBiomes(out[g]);
    return out;
  }

  function getEnabledMods() { return new Set(enabledMods); }
  function setEnabledMods(set) {
    enabledMods = new Set(set);
    for (const m of LOCKED_MODS) enabledMods.add(m);
    localStorage.setItem(LS_MODS, JSON.stringify([...enabledMods]));
    subscribers.forEach(cb => { try { cb(); } catch (e) { console.error(e); } });
  }
  function getUnderlyingBiomes(tag) {
    const entry = taxonomy[tag];
    if (!entry) return [];
    return entry.underlying.filter(u => enabledMods.has(u.source));
  }
  function getTaxonomyEntry(tag) { return taxonomy[tag] || null; }
  function onModsChanged(cb) { subscribers.push(cb); }

  return {
    load,
    getGroup, getGroupColor, getGroupMeta, getGroupOrder,
    getDimension, getDimensionMeta, getDimensionOrder,
    prettyBiome, sortBiomes, groupBiomes,
    getEnabledMods, setEnabledMods, getUnderlyingBiomes, getTaxonomyEntry,
    onModsChanged,
  };
})();
