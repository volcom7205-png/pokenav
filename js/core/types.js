/* PokeNav — type chart constants + render helpers + effectiveness math */

const TYPE_COLORS = {
  fire: '#b84000', water: '#1a6aaa', grass: '#2d7a2d', electric: '#aa8800',
  psychic: '#9c2060', ice: '#2a8a9a', dragon: '#2a3a99', dark: '#2a3040',
  fairy: '#8a3060', fighting: '#8a2000', poison: '#5a1a80', ground: '#7a4a1a',
  flying: '#3a4a99', bug: '#4a6a00', rock: '#5a4a2a', ghost: '#3a2a7a',
  steel: '#4a5a6a', normal: '#4a4a4a',
};

function typeIconHTML(type) {
  if (!type) return '';
  const lc = String(type).toLowerCase();
  const color = TYPE_COLORS[lc] || '#4a4a4a';
  return `<div style="display:flex;flex-direction:column;align-items:center;gap:4px;">
    <img src="assets/types/${lc}.png" alt="${lc} type"
         style="width:40px;height:40px;border-radius:50%;">
    <span style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:${color};">${lc}</span>
  </div>`;
}

// Compact horizontal pill for dense list rows where the 40px stacked icon
// would make rows too tall (e.g. Poké Drops dropper rows).
function typeIconHTMLCompact(type) {
  if (!type) return '';
  const lc = String(type).toLowerCase();
  const color = TYPE_COLORS[lc] || '#4a4a4a';
  return `<span style="display:inline-flex;align-items:center;gap:5px;vertical-align:middle;">
    <img src="assets/types/${lc}.png" alt="${lc} type"
         style="width:20px;height:20px;border-radius:50%;">
    <span style="font-size:10px;letter-spacing:1px;text-transform:uppercase;color:${color};">${lc}</span>
  </span>`;
}

// Gen 6+ (matches Cobblemon). Only non-1× entries stored; getMul() returns 1 otherwise.
const TYPE_LIST = ['normal','fire','water','electric','grass','ice','fighting','poison','ground','flying','psychic','bug','rock','ghost','dragon','dark','steel','fairy'];

const TYPE_CHART = {
  normal:   { ghost: 0, rock: 0.5, steel: 0.5 },
  fire:     { fire: 0.5, water: 0.5, grass: 2, ice: 2, bug: 2, rock: 0.5, dragon: 0.5, steel: 2 },
  water:    { fire: 2, water: 0.5, grass: 0.5, ground: 2, rock: 2, dragon: 0.5 },
  electric: { water: 2, electric: 0.5, grass: 0.5, ground: 0, flying: 2, dragon: 0.5 },
  grass:    { fire: 0.5, water: 2, grass: 0.5, poison: 0.5, ground: 2, flying: 0.5, bug: 0.5, rock: 2, dragon: 0.5, steel: 0.5 },
  ice:      { fire: 0.5, water: 0.5, grass: 2, ice: 0.5, ground: 2, flying: 2, dragon: 2, steel: 0.5 },
  fighting: { normal: 2, ice: 2, poison: 0.5, flying: 0.5, psychic: 0.5, bug: 0.5, rock: 2, ghost: 0, dark: 2, steel: 2, fairy: 0.5 },
  poison:   { grass: 2, poison: 0.5, ground: 0.5, rock: 0.5, ghost: 0.5, steel: 0, fairy: 2 },
  ground:   { fire: 2, electric: 2, grass: 0.5, poison: 2, flying: 0, bug: 0.5, rock: 2, steel: 2 },
  flying:   { electric: 0.5, grass: 2, fighting: 2, bug: 2, rock: 0.5, steel: 0.5 },
  psychic:  { fighting: 2, poison: 2, psychic: 0.5, dark: 0, steel: 0.5 },
  bug:      { fire: 0.5, grass: 2, fighting: 0.5, poison: 0.5, flying: 0.5, psychic: 2, ghost: 0.5, dark: 2, steel: 0.5, fairy: 0.5 },
  rock:     { fire: 2, ice: 2, fighting: 0.5, ground: 0.5, flying: 2, bug: 2, steel: 0.5 },
  ghost:    { normal: 0, psychic: 2, ghost: 2, dark: 0.5 },
  dragon:   { dragon: 2, steel: 0.5, fairy: 0 },
  dark:     { fighting: 0.5, psychic: 2, ghost: 2, dark: 0.5, fairy: 0.5 },
  steel:    { fire: 0.5, water: 0.5, electric: 0.5, ice: 2, rock: 2, steel: 0.5, fairy: 2 },
  fairy:    { fire: 0.5, fighting: 2, poison: 0.5, dragon: 2, dark: 2, steel: 0.5 },
};

function getMul(atk, def) {
  const row = TYPE_CHART[atk];
  if (!row) return 1;
  return def in row ? row[def] : 1;
}

// Defensive multipliers for a Pokémon with 1 or 2 types — returns { atkType: multiplier }
function getDefenseMultipliers(defenderTypes) {
  const result = {};
  const defs = defenderTypes.map(t => String(t).toLowerCase());
  for (const atk of TYPE_LIST) {
    let mult = 1;
    for (const def of defs) mult *= getMul(atk, def);
    result[atk] = mult;
  }
  return result;
}

// Format multiplier as ×4 / ×2 / ×1 / ×½ / ×¼ / ×0
function formatMultiplier(m) {
  if (m === 0) return '×0';
  if (m === 0.25) return '×¼';
  if (m === 0.5) return '×½';
  if (m === 1) return '×1';
  if (m === 2) return '×2';
  if (m === 4) return '×4';
  return '×' + m;
}

function multiplierClass(m) {
  if (m === 0) return 'mul-zero';
  if (m < 1) return 'mul-resist';
  if (m === 1) return 'mul-normal';
  if (m === 2) return 'mul-weak';
  return 'mul-veryweak'; // 4x
}
