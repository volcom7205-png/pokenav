/* PokeNav — small string + label formatters used across panels */

function formatTime(t) {
  if (!t || t === 'any') return 'Any time';
  if (typeof t === 'string' && t.includes('+')) {
    const labels = { day: 'Day', night: 'Night', dusk: 'Dusk', morning: 'Morning' };
    return t.split('+').map(p => labels[p] || p).join(' or ');
  }
  const map = {
    day: '☀ Day only',
    night: '🌙 Night only',
    morning: '🌅 Morning only',
    dusk: '🌆 Dusk only',
  };
  return map[t] || 'Any time';
}

function formatWeather(w) {
  if (!w || w === 'any') return 'Any';
  if (typeof w === 'string' && w.includes('+')) {
    const labels = { clear: 'Clear', rain: 'Rain', thunder: 'Thunder' };
    return w.split('+').map(p => labels[p] || p).join(' or ');
  }
  const map = { clear: '☀ Clear only', rain: '🌧 Rain only', thunder: '⛈ Thunder only' };
  return map[w] || 'Any';
}

// Merge spawn entries that share (sortedBiomes, bucket). Level ranges → min-max,
// time/weather → single value when uniform, "any" if "any" appears, else joined
// with "+", context → union, notes → unique join. Label is derived from biomes
// since the source labels ("Overworld 1", "Overworld 2", …) are meaningless
// after dedupe.
function mergeSpawns(spawns) {
  if (!Array.isArray(spawns) || !spawns.length) return [];
  const groups = new Map();
  for (const s of spawns) {
    const biomes = [...(s.biomes || [])].sort();
    const key = biomes.join('|') + '\x1f' + (s.bucket || 'unknown');
    if (!groups.has(key)) groups.set(key, { biomes, bucket: s.bucket, entries: [] });
    groups.get(key).entries.push(s);
  }
  return [...groups.values()].map(mergeSpawnGroup);
}

function mergeSpawnGroup({ biomes, bucket, entries }) {
  let lo = Infinity, hi = -Infinity;
  for (const e of entries) {
    const range = String(e.levelRange || '').match(/(\d+)\s*-\s*(\d+)/);
    if (range) { lo = Math.min(lo, +range[1]); hi = Math.max(hi, +range[2]); continue; }
    const single = String(e.levelRange || '').match(/^\s*(\d+)\s*$/);
    if (single) { lo = Math.min(lo, +single[1]); hi = Math.max(hi, +single[1]); }
  }
  const levelRange = isFinite(lo)
    ? (lo === hi ? String(lo) : `${lo}-${hi}`)
    : (entries[0].levelRange || '?');

  const time    = mergeAnyToken(entries.map(e => e.time));
  const weather = mergeAnyToken(entries.map(e => e.weather));

  const ctxSet = new Set();
  for (const e of entries) for (const c of (e.context || [])) ctxSet.add(c);

  const noteSet = new Set();
  for (const e of entries) if (e.notes) noteSet.add(e.notes);

  return {
    bucket,
    levelRange,
    time,
    weather,
    biomes,
    context: [...ctxSet],
    notes: noteSet.size ? [...noteSet].join('; ') : undefined,
    label: spawnLabelFromBiomes(biomes),
    mergedCount: entries.length,
  };
}

function mergeAnyToken(values) {
  const set = new Set(values.filter(v => v != null && v !== ''));
  if (!set.size) return 'any';
  if (set.has('any')) return 'any';
  if (set.size === 1) return [...set][0];
  return [...set].join('+');
}

function spawnLabelFromBiomes(biomes) {
  if (!biomes.length) return 'Spawn';
  const pretty = (typeof PokeNavBiomes !== 'undefined')
    ? PokeNavBiomes.prettyBiome
    : (b => b.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()));
  if (biomes.length === 1) return pretty(biomes[0]);
  if (biomes.length <= 3) return biomes.map(pretty).join(' · ');
  return `${pretty(biomes[0])} +${biomes.length - 1}`;
}

function escapeAttr(str) {
  return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function escapeSingleQuote(str) {
  return str.replace(/'/g, "\\'");
}

// Cobbledex 3D model preview URL with PokeAPI sprite as fallback.
// Use the returned object's onerror string as an inline `onerror=...` attr
// so a single broken image swaps to the fallback without JS scaffolding.
const SPRITE_CDN = 'https://cobbledex.b-cdn.net/3dmons/previews';
const SPRITE_FALLBACK = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';

function spriteUrl(id, size = 'small') {
  return `${SPRITE_CDN}/${size}/${id}.webp`;
}

function spriteFallbackOnError(id) {
  return `this.onerror=null;this.src='${SPRITE_FALLBACK}/${id}.png'`;
}
