/* =============================================
   POKENAV — app.js
   Stage 3: Pokédex + Poké Drops
   ============================================= */

// ─── STATE ────────────────────────────────────
let allPokemon = [];
let selectedPokemon = null;
let selectedItem = null;
let itemIndex = {};   // { "Item Name": [{ pokemon, amount }, ...] }
let pokedexSearchQuery = '';
let pokedexSelectedTypes = new Set();

// ─── TYPE RENDER HELPERS ──────────────────────
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

// ─── TYPE EFFECTIVENESS CHART ─────────────────
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

// ─── INIT ─────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initTrainer();
  initNav();
  loadPokemonData();
});

// ─── NAVIGATION ───────────────────────────────
const tabHistory = [];
let currentPanel = 'pokedex';

function switchPanel(panelName, isBack) {
  if (!panelName || panelName === currentPanel) return;
  if (!isBack) tabHistory.push(currentPanel);

  document.querySelectorAll('.nav-tab[data-panel]').forEach(t => {
    t.classList.toggle('active', t.dataset.panel === panelName);
  });
  document.querySelectorAll('.panel').forEach(p => {
    p.classList.toggle('active', p.id === 'panel-' + panelName);
  });

  currentPanel = panelName;
  updateBackBtn();

  if (panelName === 'settings') buildSettingsPanel();
}

function updateBackBtn() {
  const btn = document.getElementById('back-btn');
  if (!btn) return;
  btn.style.display = tabHistory.length > 0 ? 'inline-block' : 'none';
}

function initNav() {
  document.querySelectorAll('.nav-tab[data-panel]').forEach(item => {
    item.addEventListener('click', () => {
      switchPanel(item.dataset.panel, false);
    });
  });

  document.getElementById('back-btn')?.addEventListener('click', () => {
    if (!tabHistory.length) return;
    const prev = tabHistory.pop();
    switchPanel(prev, true);
  });
}

// ─── TRAINER NAME ─────────────────────────────
const TRAINER_KEY = 'pokenav_trainer';

function getTrainerName() {
  return localStorage.getItem(TRAINER_KEY) || '';
}

function setTrainerName(name) {
  localStorage.setItem(TRAINER_KEY, name);
  applyTrainerName();
}

function applyTrainerName() {
  const name = getTrainerName();
  const display = document.getElementById('trainer-display');
  if (display) display.textContent = name ? name.toUpperCase() : 'TRAINER';

  const pcTab = document.querySelector('.nav-tab[data-panel="party"]');
  if (pcTab) pcTab.textContent = name ? `${name.toUpperCase()}'S PC` : "TRAINER'S PC";
}

function initTrainer() {
  applyTrainerName();
  if (!getTrainerName()) {
    showTrainerModal();
  }
}

function showTrainerModal() {
  const modal = document.getElementById('trainer-modal');
  const input = document.getElementById('trainer-modal-input');
  const btn   = document.getElementById('trainer-modal-confirm');
  if (!modal || !input || !btn) return;

  modal.classList.remove('hidden');
  input.value = getTrainerName();
  setTimeout(() => input.focus(), 50);

  const submit = () => {
    const v = input.value.trim();
    if (!v) { input.focus(); return; }
    setTrainerName(v);
    modal.classList.add('hidden');
  };

  btn.onclick = submit;
  input.onkeydown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); submit(); }
  };
}

// Settings panel — trainer name editor + reset all data.
function buildSettingsPanel() {
  const panel = document.getElementById('panel-settings');
  if (!panel) return;

  const name = getTrainerName();

  panel.innerHTML = `
    <h2 class="settings-heading">TRAINER SETTINGS</h2>

    <div class="settings-trainer-display" id="settings-current-name"></div>

    <div class="settings-card">
      <label class="settings-label" for="settings-trainer-input">Edit Trainer Name</label>
      <div class="settings-row settings-row--input">
        <input id="settings-trainer-input" type="text" maxlength="20"
               placeholder="Trainer name..." autocomplete="off" />
        <button id="settings-save-btn" class="settings-btn settings-btn--primary" type="button">SAVE</button>
      </div>
    </div>

    <div class="settings-divider"></div>

    <div class="settings-card settings-card--danger">
      <div class="settings-label settings-label--danger">Danger Zone</div>
      <p class="settings-help">Wipes trainer name, party, storage, and all saved data, then reloads the app.</p>
      <button id="settings-reset-btn" class="settings-btn settings-btn--danger" type="button">RESET ALL DATA</button>
    </div>
  `;

  // Seed values via textContent/value to avoid HTML injection in user input
  document.getElementById('settings-current-name').textContent = name ? name.toUpperCase() : '—';
  document.getElementById('settings-trainer-input').value = name;

  document.getElementById('settings-save-btn').addEventListener('click', () => {
    const input = document.getElementById('settings-trainer-input');
    const v = (input.value || '').trim();
    if (!v) { input.focus(); return; }
    setTrainerName(v); // updates localStorage + nav display + PC tab label
    document.getElementById('settings-current-name').textContent = v.toUpperCase();
    flashSettingsSaved();
  });

  document.getElementById('settings-trainer-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      document.getElementById('settings-save-btn').click();
    }
  });

  document.getElementById('settings-reset-btn').addEventListener('click', showResetModal);
}

function showResetModal() {
  const modal = document.getElementById('reset-modal');
  if (!modal) return;
  modal.classList.remove('hidden');

  const cancel = document.getElementById('reset-modal-cancel');
  const confirm = document.getElementById('reset-modal-confirm');
  const close = () => modal.classList.add('hidden');

  cancel.onclick = close;
  confirm.onclick = () => {
    localStorage.clear();
    location.reload();
  };

  // Close on backdrop click
  modal.onclick = (e) => { if (e.target === modal) close(); };
}

function flashSettingsSaved() {
  const btn = document.getElementById('settings-save-btn');
  if (!btn) return;
  const prev = btn.textContent;
  btn.textContent = 'SAVED';
  btn.disabled = true;
  setTimeout(() => {
    btn.textContent = prev;
    btn.disabled = false;
  }, 900);
}

// ─── DATA LOADING ─────────────────────────────
function loadPokemonData() {
  fetch('data/pokemon_gen1.json')
    .then(res => {
      if (!res.ok) throw new Error('Could not load pokemon_gen1.json');
      return res.json();
    })
    .then(data => {
      allPokemon = data;
      buildItemIndex();
      buildPokedexPanel();
      buildItemSearchPanel();
      buildTypeChartPanel();
    })
    .catch(err => {
      console.error('Data load error:', err);
      document.getElementById('panel-pokedex').innerHTML =
        `<h2>📖 Pokédex</h2><p style="color:var(--accent-red)">
        Error loading data: ${err.message}. Make sure pokemon_gen1.json is in the data/ folder.</p>`;
    });
}

// ─── BUILD ITEM INDEX ─────────────────────────
// Scans every pokemon's drops and builds a reverse lookup:
// { "Miracle Seed": [{ pokemon: {...}, amount: "5%" }, ...] }
function buildItemIndex() {
  itemIndex = {};
  allPokemon.forEach(pokemon => {
    (pokemon.drops || []).forEach(drop => {
      const name = drop.item;
      if (!itemIndex[name]) itemIndex[name] = [];
      // Dedupe: each Pokémon appears at most once per item, even if it has
      // multiple drop entries or spawn profiles for the same item.
      if (itemIndex[name].some(d => d.pokemon.id === pokemon.id)) return;
      const amount = drop.chance || (drop.quantity ? drop.quantity : '1');
      itemIndex[name].push({ pokemon, amount });
    });
  });
}

// ─── POKÉDEX PANEL ────────────────────────────
function buildPokedexPanel() {
  const grid = document.getElementById('pokedex-grid');
  if (!grid) return;

  renderPokedexTiles();

  document.getElementById('pokedex-search')?.addEventListener('input', e => {
    pokedexSearchQuery = e.target.value.trim().toLowerCase();
    renderPokedexTiles();
  });

  document.getElementById('pokedex-element-btn')?.addEventListener('click', () => {
    const panel = document.getElementById('pokedex-element-panel');
    const btn   = document.getElementById('pokedex-element-btn');
    panel?.classList.toggle('hidden');
    btn?.classList.toggle('active');
  });

  document.querySelectorAll('#pokedex-element-panel .element-item').forEach(item => {
    const type = item.dataset.type;
    if (type) item.innerHTML = typeIconHTML(type);
    item.addEventListener('click', () => {
      if (!type) return;
      if (pokedexSelectedTypes.has(type)) {
        pokedexSelectedTypes.delete(type);
        item.classList.remove('active');
      } else {
        pokedexSelectedTypes.add(type);
        item.classList.add('active');
      }
      updatePokedexFilterCount();
      renderPokedexTiles();
    });
  });

  document.getElementById('pokedex-clear-types')?.addEventListener('click', () => {
    clearPokedexTypeFilters();
  });

  updatePokedexFilterCount();
}

function renderPokedexTiles() {
  const grid = document.getElementById('pokedex-grid');
  if (!grid) return;

  const filtered = allPokemon.filter(p => {
    if (pokedexSearchQuery) {
      const q = pokedexSearchQuery;
      const matches =
        p.name.toLowerCase().includes(q) ||
        String(p.id).includes(q) ||
        String(p.id).padStart(4, '0').includes(q);
      if (!matches) return false;
    }
    if (pokedexSelectedTypes.size > 0) {
      const pTypes = p.types.map(t => String(t).toLowerCase());
      for (const t of pokedexSelectedTypes) {
        if (!pTypes.includes(t)) return false;
      }
    }
    return true;
  });

  if (!filtered.length) {
    grid.innerHTML = '<div class="no-results">No Pokémon found</div>';
    return;
  }

  const ownedIds = (typeof PartyStorage !== 'undefined' && PartyStorage.getOwnedDexIds)
    ? PartyStorage.getOwnedDexIds()
    : new Set();

  grid.innerHTML = filtered.map(p => `
    <div class="pokedex-tile" data-id="${p.id}">
      ${ownedIds.has(p.id) ? '<div class="tile-owned-ball"></div>' : ''}
      <img class="pokedex-tile-sprite" src="${p.sprite}" alt="${p.name}"
           onerror="this.style.opacity='0.3'" />
      <div class="pokedex-tile-number">#${String(p.id).padStart(4, '0')}</div>
      <div class="pokedex-tile-name">${p.name}</div>
      <div class="pokedex-tile-types" style="display:flex;flex-direction:row;gap:6px;justify-content:center;margin-top:6px;">
        ${p.types.map(t => typeIconHTML(t)).join('')}
      </div>
    </div>
  `).join('');

  grid.querySelectorAll('.pokedex-tile').forEach(tile => {
    tile.addEventListener('click', () => {
      const id = parseInt(tile.dataset.id, 10);
      selectPokemon(id);
    });
  });
}

function updatePokedexFilterCount() {
  const el = document.getElementById('pokedex-filter-count');
  if (!el) return;
  el.textContent = `${pokedexSelectedTypes.size} active`;
}

function clearPokedexTypeFilters() {
  pokedexSelectedTypes.clear();
  document.querySelectorAll('#pokedex-element-panel .element-item.active').forEach(el => el.classList.remove('active'));
  updatePokedexFilterCount();
  renderPokedexTiles();
}

function addPokemonToStorageById(id, event) {
  if (event) event.stopPropagation();
  const p = allPokemon.find(x => x.id === id);
  if (!p) return;
  const send = () => window.pokeNavAddToStorage({ id: p.id, name: p.name, types: p.types });
  if (typeof window.pokeNavAddToStorage === 'function') {
    send();
  } else if (typeof PartyStorage !== 'undefined') {
    Promise.resolve(PartyStorage.init()).then(send);
  } else {
    console.warn('PokeNav: storage hook not ready');
  }
}

function selectPokemon(id) {
  selectedPokemon = allPokemon.find(p => p.id === id);
  if (!selectedPokemon) return;
  openPokedexDetailModal(selectedPokemon);
}

function openPokedexDetailModal(pokemon) {
  const overlay = document.getElementById('pokedex-card-overlay');
  const card    = document.getElementById('pokedex-card');
  if (!overlay || !card) return;

  card.style.transformOrigin = 'center center';
  renderPokedexCard(pokemon, 0);
  overlay.classList.remove('hidden');

  // restart pop-in animation
  card.classList.remove('pop-in');
  card.offsetHeight;
  card.classList.add('pop-in');

  // assign (don't add) so handlers don't accumulate
  overlay.onclick = (e) => {
    if (e.target === overlay) overlay.classList.add('hidden');
  };
}

function renderPokedexCard(pokemon, spawnIdx) {
  const card = document.getElementById('pokedex-card');
  if (!card) return;

  const spawns = pokemon.spawns || [];
  const spawn  = spawns[spawnIdx] || spawns[0];

  const tabsHTML = spawns.length > 1
    ? `<div class="spawn-tabs">
        ${spawns.map((s, i) => `
          <button class="spawn-tab ${i === spawnIdx ? 'active' : ''}"
                  onclick="renderPokedexCard(selectedPokemon, ${i})">
            ${s.label}
          </button>
        `).join('')}
      </div>`
    : '';

  const spawnHTML = spawn ? renderSpawnContent(spawn) : '<p style="color:var(--text-muted)">No spawn data.</p>';

  const dropsHTML = (pokemon.drops && pokemon.drops.length)
    ? `<div class="drops-list">
        ${pokemon.drops.map(d => `
          <div class="drop-item">
            <span class="drop-item-name">${d.item}</span>
            <span class="drop-item-amount">${d.chance || (d.quantity ? '×' + d.quantity : '×1')}</span>
          </div>
        `).join('')}
      </div>`
    : '<p style="color:var(--text-muted);font-size:0.85rem">No drops recorded.</p>';

  card.innerHTML = `
    <button class="card-close-btn" id="card-close-btn">✕</button>
    <button class="add-storage-btn" id="detail-add-storage-btn" style="position:absolute;top:14px;right:46px;">+ Storage</button>
    <div class="poke-card-header">
      <img class="poke-card-sprite" src="${pokemon.sprite}" alt="${pokemon.name}"
           onerror="this.style.opacity='0.3'" />
      <div>
        <div class="poke-card-num">#${String(pokemon.id).padStart(4, '0')}</div>
        <div class="poke-card-name">${pokemon.name}</div>
        <div class="poke-card-types" style="display:flex;flex-direction:row;gap:12px;flex-wrap:wrap;">
          ${pokemon.types.map(t => typeIconHTML(t)).join('')}
        </div>
      </div>
    </div>

    <hr class="poke-card-divider" />
    <div class="poke-card-section-label">Spawn Locations</div>
    ${tabsHTML}
    ${spawnHTML}

    <hr class="poke-card-divider" />
    <div class="poke-card-section-label">Drops</div>
    ${dropsHTML}
  `;

  document.getElementById('detail-add-storage-btn')?.addEventListener('click', (e) => {
    addPokemonToStorageById(pokemon.id, e);
  });

  document.getElementById('card-close-btn')?.addEventListener('click', () => {
    document.getElementById('pokedex-card-overlay')?.classList.add('hidden');
  });
}

function renderSpawnContent(spawn) {
  const contexts = (spawn.context || [])
    .map(c => c.charAt(0).toUpperCase() + c.slice(1));

  const biomeNames = (spawn.biomes || [])
    .map(b => b.replace(/_/g, ' ').replace('nether/', 'Nether: '));

  const rarityClass = 'rarity-' + (spawn.bucket || 'unknown').replace(' ', '-');
  const rarityLabel = spawn.bucket
    ? spawn.bucket.charAt(0).toUpperCase() + spawn.bucket.slice(1)
    : 'Unknown';

  const timeLabel = formatTime(spawn.time);
  const weatherLabel = formatWeather(spawn.weather);

  return `
    <div class="spawn-stat-grid">
      <div class="spawn-stat">
        <div class="spawn-stat-label">Rarity</div>
        <div class="spawn-stat-value ${rarityClass}">${rarityLabel}</div>
      </div>
      <div class="spawn-stat">
        <div class="spawn-stat-label">Levels</div>
        <div class="spawn-stat-value">${spawn.levelRange || '?'}</div>
      </div>
      <div class="spawn-stat">
        <div class="spawn-stat-label">Time</div>
        <div class="spawn-stat-value">${timeLabel}</div>
      </div>
      <div class="spawn-stat">
        <div class="spawn-stat-label">Weather</div>
        <div class="spawn-stat-value">${weatherLabel}</div>
      </div>
    </div>

    ${contexts.length ? `
      <div class="poke-card-section-label" style="margin-top:10px">How to find</div>
      <div class="context-row">
        ${contexts.map(c => `<span class="context-pill">${c}</span>`).join('')}
      </div>` : ''}

    ${biomeNames.length ? `
      <div class="poke-card-section-label" style="margin-top:12px">Biomes</div>
      <div class="biome-list">
        ${biomeNames.map(b => `<span class="biome-pill">${b}</span>`).join('')}
      </div>` : ''}

    ${spawn.notes ? `<div class="spawn-notes">${spawn.notes}</div>` : ''}
  `;
}

// ─── POKÉ DROPS PANEL ─────────────────────────
function buildItemSearchPanel() {
  const panel = document.getElementById('panel-items');
  panel.innerHTML = `
    <h2>🎒 Poké Drops</h2>
    <div class="panel-search">
      <input type="text" id="item-search" placeholder="Search for a drop item..." autocomplete="off" />
    </div>
    <div class="item-search-layout">
      <div class="item-results" id="item-results"></div>
      <div id="item-card">
        <div class="item-card-empty">Select an item to see which Pokémon drop it</div>
      </div>
    </div>
  `;

  renderItemList(Object.keys(itemIndex).sort());

  document.getElementById('item-search').addEventListener('input', e => {
    const q = e.target.value.trim().toLowerCase();
    const filtered = Object.keys(itemIndex)
      .filter(name => name.toLowerCase().includes(q))
      .sort();
    renderItemList(filtered);
  });
}

function renderItemList(items) {
  const container = document.getElementById('item-results');
  if (!items.length) {
    container.innerHTML = '<div class="no-results">No items found</div>';
    return;
  }
  container.innerHTML = items.map(name => {
    const count = itemIndex[name].length;
    return `
      <div class="item-result-item ${selectedItem === name ? 'selected' : ''}"
           data-item="${escapeAttr(name)}" onclick="selectItem('${escapeSingleQuote(name)}')">
        <span class="item-result-name">${name}</span>
        <span class="item-result-count">${count} Pokémon</span>
      </div>
    `;
  }).join('');
}

function selectItem(name) {
  selectedItem = name;

  document.querySelectorAll('.item-result-item').forEach(el => {
    el.classList.toggle('selected', el.dataset.item === name);
  });

  renderItemCard(name);
}

function renderItemCard(name) {
  const droppers = itemIndex[name] || [];
  const container = document.getElementById('item-card');

  const dropperRows = droppers.map(({ pokemon, amount }) => `
    <div class="dropper-item" onclick="goToPokedex(${pokemon.id})">
      <img src="${pokemon.sprite}" alt="${pokemon.name}" onerror="this.style.opacity='0.3'" />
      <div class="dropper-info">
        <div class="dropper-name">${pokemon.name}</div>
        <div class="dropper-num">
          <span class="dropper-num-id">#${String(pokemon.id).padStart(4, '0')}</span>
          <span class="dropper-types">${pokemon.types.map(t => typeIconHTMLCompact(t)).join('')}</span>
        </div>
      </div>
      <span class="dropper-amount">${amount}</span>
      <span class="dropper-arrow">→</span>
    </div>
  `).join('');

  container.innerHTML = `
    <div class="item-card">
      <div class="item-card-title">${name}</div>
      <div class="item-card-subtitle">Dropped by ${droppers.length} Pokémon — click any to view spawn info</div>
      <div class="dropper-list">${dropperRows}</div>
    </div>
  `;
}

// ─── TYPE CHART PANEL ─────────────────────────
let typechartMode = 'lookup';            // 'lookup' | 'search'
let typechartSelectedTypes = [];         // max 2 — order matters for offensive display
let typechartSelectedPokemonId = null;

function buildTypeChartPanel() {
  // Mode toggle
  document.querySelectorAll('.typechart-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode;
      typechartMode = mode;
      document.querySelectorAll('.typechart-mode-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.mode === mode);
      });
      document.getElementById('typechart-lookup-view').classList.toggle('hidden', mode !== 'lookup');
      document.getElementById('typechart-search-view').classList.toggle('hidden', mode !== 'search');
    });
  });

  // Type picker
  const picker = document.getElementById('typechart-picker');
  picker.innerHTML = TYPE_LIST.map(t => {
    const color = TYPE_COLORS[t] || '#888';
    return `
      <div class="typechart-picker-item" data-type="${t}">
        <img src="assets/types/${t}.png" alt="${t}">
        <span class="typechart-picker-label" style="color:${color}">${t}</span>
      </div>
    `;
  }).join('');

  picker.addEventListener('click', (e) => {
    const item = e.target.closest('.typechart-picker-item');
    if (!item) return;
    const t = item.dataset.type;
    const idx = typechartSelectedTypes.indexOf(t);
    if (idx >= 0) {
      typechartSelectedTypes.splice(idx, 1);
    } else {
      if (typechartSelectedTypes.length >= 2) typechartSelectedTypes.shift();
      typechartSelectedTypes.push(t);
    }
    renderTypeChartLookup();
  });

  document.getElementById('typechart-picker-clear').addEventListener('click', () => {
    typechartSelectedTypes = [];
    renderTypeChartLookup();
  });

  // Pokémon search
  document.getElementById('typechart-search').addEventListener('input', (e) => {
    renderTypeChartSearchResults(e.target.value.trim().toLowerCase());
  });

  renderTypeChartLookup();
}

function renderTypeChartLookup() {
  // Update picker visual state
  document.querySelectorAll('.typechart-picker-item').forEach(el => {
    el.classList.toggle('selected', typechartSelectedTypes.includes(el.dataset.type));
  });
  const count = typechartSelectedTypes.length;
  document.getElementById('typechart-picker-count').textContent =
    `${count} selected${count >= 2 ? ' (max)' : ''}`;

  const results = document.getElementById('typechart-lookup-results');
  if (!count) {
    results.innerHTML = '<div class="typechart-empty">Pick a type above to see effectiveness.</div>';
    return;
  }

  // Offensive: for each selected attacker type, what does it do to each defender?
  const offensiveSections = typechartSelectedTypes.map(atk => {
    const tiles = TYPE_LIST.map(def => {
      const m = getMul(atk, def);
      return renderTypeMultiplierTile(def, m);
    }).join('');
    return `
      <div class="typechart-block">
        <div class="typechart-block-header">
          <span class="typechart-block-label">${atk.toUpperCase()} attacks vs.</span>
        </div>
        <div class="typechart-tile-grid">${tiles}</div>
      </div>
    `;
  }).join('');

  // Defensive: incoming attacks against this type/dual-type
  const defMults = getDefenseMultipliers(typechartSelectedTypes);
  const defenseTiles = TYPE_LIST.map(atk =>
    renderTypeMultiplierTile(atk, defMults[atk])
  ).join('');

  results.innerHTML = `
    <div class="typechart-results-grid">
      <div class="typechart-section">
        <div class="typechart-section-header">⚔️ OFFENSIVE — your attacks vs defenders</div>
        ${offensiveSections}
      </div>

      <div class="typechart-section">
        <div class="typechart-section-header">🛡️ DEFENSIVE — incoming attacks vs you</div>
        <div class="typechart-block">
          <div class="typechart-tile-grid">${defenseTiles}</div>
        </div>
      </div>
    </div>
  `;
}

function renderTypeMultiplierTile(type, mult) {
  const cls = multiplierClass(mult);
  const label = formatMultiplier(mult);
  const color = TYPE_COLORS[type] || '#888';
  return `
    <div class="typechart-tile ${cls}" title="${type} ${label}">
      <img src="assets/types/${type}.png" alt="${type}">
      <span class="typechart-tile-mult">${label}</span>
      <span class="typechart-tile-name" style="color:${color}">${type}</span>
    </div>
  `;
}

function renderTypeChartSearchResults(query) {
  const container = document.getElementById('typechart-search-results');
  if (!query) {
    container.innerHTML = '<div class="typechart-empty">Search for a Pokémon to see its defensive matchups.</div>';
    typechartSelectedPokemonId = null;
    return;
  }
  const matches = allPokemon.filter(p =>
    p.name.toLowerCase().includes(query) ||
    String(p.id).padStart(4, '0').includes(query) ||
    String(p.id).includes(query)
  ).slice(0, 30);

  if (!matches.length) {
    container.innerHTML = '<div class="typechart-empty">No Pokémon found.</div>';
    return;
  }

  // Auto-pick the first match if none selected or current selection not in matches
  if (!matches.find(p => p.id === typechartSelectedPokemonId)) {
    typechartSelectedPokemonId = matches[0].id;
  }

  const listHTML = matches.map(p => `
    <div class="typechart-search-item ${p.id === typechartSelectedPokemonId ? 'selected' : ''}"
         data-id="${p.id}">
      <img src="${p.sprite}" alt="${p.name}" onerror="this.style.opacity='0.3'">
      <div class="typechart-search-info">
        <div class="typechart-search-name">${p.name}</div>
        <div class="typechart-search-num">#${String(p.id).padStart(4, '0')}</div>
      </div>
    </div>
  `).join('');

  container.innerHTML = `
    <div class="typechart-search-layout">
      <div class="typechart-search-list">${listHTML}</div>
      <div class="typechart-search-detail" id="typechart-search-detail"></div>
    </div>
  `;

  container.querySelectorAll('.typechart-search-item').forEach(el => {
    el.addEventListener('click', () => {
      typechartSelectedPokemonId = parseInt(el.dataset.id);
      container.querySelectorAll('.typechart-search-item').forEach(x =>
        x.classList.toggle('selected', parseInt(x.dataset.id) === typechartSelectedPokemonId));
      renderTypeChartSearchDetail();
    });
  });

  renderTypeChartSearchDetail();
}

function renderTypeChartSearchDetail() {
  const detail = document.getElementById('typechart-search-detail');
  if (!detail) return;
  const p = allPokemon.find(x => x.id === typechartSelectedPokemonId);
  if (!p) {
    detail.innerHTML = '<div class="typechart-empty">Select a Pokémon.</div>';
    return;
  }

  const defMults = getDefenseMultipliers(p.types);
  const tiles = TYPE_LIST.map(atk =>
    renderTypeMultiplierTile(atk, defMults[atk])
  ).join('');

  detail.innerHTML = `
    <div class="typechart-detail-header">
      <img src="${p.sprite}" alt="${p.name}" class="typechart-detail-sprite" onerror="this.style.opacity='0.3'">
      <div class="typechart-detail-info">
        <div class="typechart-detail-name">${p.name}</div>
        <div class="typechart-detail-num">#${String(p.id).padStart(4, '0')}</div>
        <div class="typechart-detail-types">${p.types.map(t => typeIconHTMLCompact(t)).join('')}</div>
      </div>
    </div>
    <div class="typechart-section-header">🛡️ INCOMING ATTACKS vs ${p.name.toUpperCase()}</div>
    <div class="typechart-tile-grid">${tiles}</div>
  `;
}

// ─── CROSS-PANEL NAVIGATION ───────────────────
// Called when user clicks a Pokémon in the Poké Drops panel.
// Switches to Pokédex tab and opens that Pokémon's pop-out card.
function goToPokedex(id) {
  switchPanel('pokedex', false);
  selectPokemon(id);

  // Scroll the underlying tile into view so it's visible after the modal closes
  setTimeout(() => {
    const tile = document.querySelector(`.pokedex-tile[data-id="${id}"]`);
    if (tile) tile.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, 50);
}

// ─── FORMATTERS ───────────────────────────────
function formatTime(t) {
  const map = { day: '☀ Day only', night: '🌙 Night only', morning: '🌅 Morning only', any: 'Any time' };
  return map[t] || 'Any time';
}

function formatWeather(w) {
  const map = { clear: '☀ Clear only', rain: '🌧 Rain only', thunder: '⛈ Thunder only', any: 'Any' };
  return map[w] || 'Any';
}

// ─── UTILS ────────────────────────────────────
function escapeAttr(str) {
  return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function escapeSingleQuote(str) {
  return str.replace(/'/g, "\\'");
}

// ═══════════════════════════════════════════════════════
// PARTY / STORAGE — Stage 4
// ═══════════════════════════════════════════════════════

const PartyStorage = (() => {

  // ── Constants ──────────────────────────────────────
  const PARTY_SIZE = 6;
  const LS_KEY = 'pokenav_party_storage';
  const SPRITE_BASE = 'https://cobbledex.b-cdn.net/3dmons/previews/small/';

  // ── State ──────────────────────────────────────────
  let state = { party: Array(PARTY_SIZE).fill(null), storage: [] };
  let draggedPoke = null;
  let dragSource = null; // { type: 'party'|'storage', index }
  let allMoves = [];
  let allPokemon = [];

  // PC tab filter state
  let pcSearchQuery = '';
  let pcSelectedTypes = new Set();

  // ── localStorage ───────────────────────────────────
  function save() {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  }

  function load() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        state.party = parsed.party || Array(PARTY_SIZE).fill(null);
        state.storage = parsed.storage || [];
      }
    } catch(e) { console.warn('PokeNav: could not load party/storage', e); }
  }

  // ── Unique ID ──────────────────────────────────────
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  // ── Create a new Pokémon object ────────────────────
  function createPoke(dexEntry) {
    return {
      uid: uid(),
      dexId: dexEntry.id,
      name: dexEntry.name,
      types: dexEntry.types,
      nickname: '',
      level: (typeof dexEntry.level === 'number' && dexEntry.level >= 1 && dexEntry.level <= 100) ? dexEntry.level : 50,
      nature: 'Hardy',
      ivs: { hp:31, atk:31, def:31, spa:31, spd:31, spe:31 },
      evs: { hp:0,  atk:0,  def:0,  spa:0,  spd:0,  spe:0  },
      moves: []
    };
  }

  // ── Sprite URL ─────────────────────────────────────
  function spriteUrl(dexId) {
    return `${SPRITE_BASE}${dexId}.webp`;
  }

  // ── Render a tile ──────────────────────────────────
  function makeTile(poke, sourceType) {
    const div = document.createElement('div');
    div.className = 'poke-tile';
    div.draggable = true;
    div.dataset.uid = poke.uid;
    const lvlText = (typeof poke.level === 'number' && poke.level >= 1) ? `LVL ${poke.level}` : 'LVL —';
    const depositBtn = sourceType === 'party'
      ? `<button class="tile-deposit-btn" title="Deposit to PC">→</button>`
      : '';
    div.innerHTML = `
      ${depositBtn}
      <img class="tile-sprite" src="${spriteUrl(poke.dexId)}"
           onerror="this.src='https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${poke.dexId}.png'"
           alt="${poke.name}">
      <div class="tile-number-row">
        <span class="tile-number">#${String(poke.dexId).padStart(4,'0')}</span>
        <span class="tile-number-sep">•</span>
        <span class="tile-level">${lvlText}</span>
      </div>
      <div class="tile-name">${poke.nickname || poke.name}</div>
      <div class="tile-types" style="display:flex;flex-direction:row;gap:6px;justify-content:center;margin-top:6px;">${poke.types.map(t => typeIconHTML(t)).join('')}</div>
    `;
    return div;
  }

  // ── Quick deposit (party → storage) ────────────────
  function depositToStorage(partyIndex) {
    const poke = state.party[partyIndex];
    if (!poke) return false;

    let placed = false;
    for (let i = 0; i < state.storage.length; i++) {
      if (state.storage[i] === null) {
        state.storage[i] = poke;
        placed = true;
        break;
      }
    }
    if (!placed) {
      state.storage.push(poke);
      placed = true;
    }
    if (!placed) return false;

    state.party[partyIndex] = null;
    save();
    renderPC();
    return true;
  }

  function showPcFullWarning(tile) {
    const warn = document.createElement('div');
    warn.className = 'tile-deposit-warning';
    warn.textContent = 'PC FULL';
    tile.appendChild(warn);
    setTimeout(() => warn.remove(), 2000);
  }

  function bindDepositButton(tile, partyIndex) {
    const btn = tile.querySelector('.tile-deposit-btn');
    if (!btn) return;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const ok = depositToStorage(partyIndex);
      if (!ok) showPcFullWarning(tile);
    });
  }

  // ── Filter logic (search + type set, AND logic) ────
  function pokeMatchesFilter(poke) {
    if (!poke) return false;
    if (pcSearchQuery) {
      const q = pcSearchQuery;
      const hits =
        (poke.nickname || '').toLowerCase().includes(q) ||
        poke.name.toLowerCase().includes(q) ||
        String(poke.dexId).includes(q) ||
        String(poke.dexId).padStart(4, '0').includes(q);
      if (!hits) return false;
    }
    if (pcSelectedTypes.size > 0) {
      const pTypes = poke.types.map(t => String(t).toLowerCase());
      for (const t of pcSelectedTypes) {
        if (!pTypes.includes(t)) return false;
      }
    }
    return true;
  }

  function isFilterActive() {
    return pcSearchQuery !== '' || pcSelectedTypes.size > 0;
  }

  // ── Render PC tab (party + storage grids together) ─
  function renderPC() {
    renderParty();
    renderStorage();
    if (typeof renderPokedexTiles === 'function') renderPokedexTiles();
  }

  // ── Render party grid (2-column) ───────────────────
  function renderParty() {
    const container = document.getElementById('party-grid');
    if (!container) return;
    container.innerHTML = '';
    const filterOn = isFilterActive();

    for (let i = 0; i < PARTY_SIZE; i++) {
      const poke = state.party[i];
      if (poke) {
        if (filterOn && !pokeMatchesFilter(poke)) continue;
        const tile = makeTile(poke, 'party');
        bindTileEvents(tile, 'party', i);
        bindSlotDrop(tile, 'party', i);
        bindDepositButton(tile, i);
        container.appendChild(tile);
      } else if (!filterOn) {
        const slot = document.createElement('div');
        slot.className = 'party-slot empty';
        slot.dataset.index = i;
        slot.innerHTML = '<button class="slot-fill-btn">+</button>';
        slot.querySelector('.slot-fill-btn').addEventListener('click', (e) => {
          e.stopPropagation();
          openStoragePicker(i);
        });
        bindSlotDrop(slot, 'party', i);
        container.appendChild(slot);
      }
    }
  }

  // ── Render storage grid ────────────────────────────
  function renderStorage() {
    const container = document.getElementById('storage-grid');
    if (!container) return;
    container.innerHTML = '';
    const list = state.storage.filter(pokeMatchesFilter);
    list.forEach((poke) => {
      const idx = state.storage.indexOf(poke);
      const tile = makeTile(poke, 'storage');
      bindTileEvents(tile, 'storage', idx);
      tile.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        tile.classList.add('drag-over');
      });
      tile.addEventListener('dragleave', () => {
        tile.classList.remove('drag-over');
      });
      tile.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        tile.classList.remove('drag-over');
        if (!draggedPoke || !dragSource) return;
        const targetStorageIndex = state.storage.indexOf(
          state.storage.find(p => p.uid === tile.dataset.uid)
        );
        if (targetStorageIndex === -1) return;
        movePoke(dragSource, { type: 'storage', index: targetStorageIndex });
      });
      container.appendChild(tile);
    });
  }

  // ── Drag events on tiles ───────────────────────────
  function bindTileEvents(tile, sourceType, index) {
    tile.addEventListener('dragstart', (e) => {
      const poke = sourceType === 'party' ? state.party[index] : state.storage[index];
      draggedPoke = poke;
      dragSource = { type: sourceType, index };
      tile.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    tile.addEventListener('dragend', () => {
      tile.classList.remove('dragging');
      draggedPoke = null;
      dragSource = null;
    });
    tile.addEventListener('click', (e) => {
      if (!e.defaultPrevented) openCard(sourceType === 'party' ? state.party[index] : state.storage[index], tile, sourceType);
    });
  }

  // ── Drop events on slots / storage grid ───────────
  function bindSlotDrop(el, targetType, targetIndex) {
    el.addEventListener('dragover', (e) => {
      e.preventDefault();
      el.classList.add('drag-over');
    });
    el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      el.classList.remove('drag-over');
      if (!draggedPoke || !dragSource) return;
      movePoke(dragSource, { type: targetType, index: targetIndex });
    });
  }

  // ── Move a Pokémon between party/storage ───────────
  function movePoke(from, to) {
    let poke;
    if (from.type === 'party') {
      poke = state.party[from.index];
      state.party[from.index] = null;
    } else {
      poke = state.storage.splice(from.index, 1)[0];
    }
    if (to.type === 'party') {
      const displaced = state.party[to.index];
      state.party[to.index] = poke;
      if (displaced) {
        if (from.type === 'party') {
          state.party[from.index] = displaced;
        } else {
          state.storage.push(displaced);
        }
      }
    } else {
      if (typeof to.index === 'number' && to.index < state.storage.length) {
        // dropping onto a specific storage tile — swap
        const displaced = state.storage[to.index];
        state.storage[to.index] = poke;
        if (displaced && from.type === 'party') {
          state.party[from.index] = displaced;
        } else if (displaced) {
          state.storage.push(displaced);
        }
      } else {
        state.storage.push(poke);
      }
    }
    save();
    renderPC();
  }

  // ── Storage grid drop zone ─────────────────────────
  function bindStorageGridDrop() {
    const grid = document.getElementById('storage-grid');
    if (!grid) return;
    grid.addEventListener('dragenter', (e) => { e.preventDefault(); });
    grid.addEventListener('dragover', (e) => { e.preventDefault(); });
    grid.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!draggedPoke || !dragSource) return;
      const src = dragSource;
      if (src.type === 'party') {
        movePoke(src, { type: 'storage', index: state.storage.length });
      }
      draggedPoke = null;
      dragSource = null;
    });
  }

  // ── NATURES list ───────────────────────────────────
  const NATURES = [
    'Hardy','Lonely','Brave','Adamant','Naughty',
    'Bold','Docile','Relaxed','Impish','Lax',
    'Timid','Hasty','Serious','Jolly','Naive',
    'Modest','Mild','Quiet','Bashful','Rash',
    'Calm','Gentle','Sassy','Careful','Quirky'
  ];

  // ── Open Pokédex card ──────────────────────────────
  function openCard(poke, originTile, sourceType) {
    if (!poke) return;
    const overlay = document.getElementById('pokedex-card-overlay');
    const card    = document.getElementById('pokedex-card');
    if (!overlay || !card) return;

    // Set transform-origin to tile position for zoom effect
    if (originTile) {
      const r = originTile.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top  + r.height / 2;
      card.style.transformOrigin = `${cx}px ${cy}px`;
    } else {
      card.style.transformOrigin = 'center center';
    }

    card.innerHTML = buildCardHTML(poke, sourceType);
    overlay.classList.remove('hidden');

    // Restart animation
    card.classList.remove('pop-in');
    card.offsetHeight;
    card.classList.add('pop-in');

    bindCardEvents(poke, sourceType);
  }

  // ── Build card inner HTML ──────────────────────────
  function buildCardHTML(poke, sourceType) {
    const statKeys = ['hp','atk','def','spa','spd','spe'];
    const statLabels = { hp:'HP', atk:'Atk', def:'Def', spa:'Sp.A', spd:'Sp.D', spe:'Spe' };

    const ivRows = statKeys.map(s => `
      <div class="stat-row">
        <label>${statLabels[s]}</label>
        <input type="number" class="stat-input" data-stat="${s}" data-kind="iv"
               min="0" max="31" value="${poke.ivs[s]}">
        <span class="stat-divider">/</span>
        <input type="number" class="stat-input" data-stat="${s}" data-kind="ev"
               min="0" max="252" value="${poke.evs[s]}">
      </div>`).join('');

    const moveSlots = [0,1,2,3].map(i => `
      <div class="move-slot" data-slot="${i}">
        ${poke.moves[i]
          ? `<span class="move-name">${poke.moves[i]}</span><button class="move-clear" data-slot="${i}">✕</button>`
          : `<span class="move-empty">— empty —</span>`}
      </div>`).join('');

    return `
      <button class="card-close-btn" id="card-close-btn">✕</button>
      <div class="card-header">
        <img class="card-sprite" src="${spriteUrl(poke.dexId)}"
             onerror="this.src='https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${poke.dexId}.png'"
             alt="${poke.name}">
        <div class="card-identity">
          <div class="card-number">#${String(poke.dexId).padStart(4,'0')}</div>
          <input class="card-nickname" type="text" placeholder="${poke.name}"
                 value="${poke.nickname}" data-field="nickname" maxlength="12">
          <div class="card-species">${poke.name}</div>
          <div class="tile-types" style="display:flex;flex-direction:row;gap:6px;justify-content:center;margin-top:6px;">${poke.types.map(t => typeIconHTML(t)).join('')}</div>
        </div>
      </div>
      <div class="card-section">
        <div class="card-row">
          <label>Level</label>
          <input type="number" class="card-field-input" data-field="level"
                 min="1" max="100" value="${poke.level}">
          <label>Nature</label>
          <select class="card-field-input" data-field="nature">
            ${NATURES.map(n => `<option ${n===poke.nature?'selected':''}>${n}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="card-section">
        <div class="stat-header">
          <span>Stat</span><span>IV (0–31)</span><span>EV (0–252)</span>
        </div>
        ${ivRows}
      </div>
      <div class="card-section">
        <div class="section-label">Moveset</div>
        <div class="move-slots" id="card-move-slots">${moveSlots}</div>
      </div>
      <div class="card-section">
        <div class="section-label">Move Picker</div>
        <input type="text" id="move-search" placeholder="Search moves..." class="move-search-input">
        <div class="move-list" id="move-list"></div>
      </div>
      ${sourceType === 'storage' ? `<button class="release-btn">RELEASE</button>` : ''}
    `;
  }

  // ── Bind card interactivity ────────────────────────
  function bindCardEvents(poke, sourceType) {
    const overlay = document.getElementById('pokedex-card-overlay');

    // Close
    document.getElementById('card-close-btn')?.addEventListener('click', () => {
      overlay.classList.add('hidden');
    });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.classList.add('hidden');
    });

    // Release (storage only — button not present otherwise)
    const releaseBtn = document.querySelector('.release-btn');
    if (releaseBtn) {
      releaseBtn.addEventListener('click', () => {
        if (!releaseBtn.classList.contains('release-btn--confirm')) {
          releaseBtn.classList.add('release-btn--confirm');
          releaseBtn.textContent = 'CONFIRM RELEASE';
          return;
        }
        const idx = state.storage.findIndex(p => p && p.uid === poke.uid);
        if (idx !== -1) state.storage.splice(idx, 1);
        save();
        renderPC();
        if (typeof renderPokedexTiles === 'function') renderPokedexTiles();
        overlay.classList.add('hidden');
      });
      releaseBtn.addEventListener('mouseleave', () => {
        releaseBtn.classList.remove('release-btn--confirm');
        releaseBtn.textContent = 'RELEASE';
      });
    }

    // Nickname / level / nature
    document.querySelectorAll('[data-field]').forEach(el => {
      el.addEventListener('change', () => {
        const field = el.dataset.field;
        poke[field] = el.type === 'number' ? Number(el.value) : el.value;
        save();
        renderPC();
      });
    });

    // IVs / EVs
    document.querySelectorAll('.stat-input').forEach(el => {
      el.addEventListener('change', () => {
        const kind = el.dataset.kind;
        const stat = el.dataset.stat;
        poke[kind][stat] = Math.min(Number(el.value), kind === 'iv' ? 31 : 252);
        el.value = poke[kind][stat];
        save();
      });
    });

    // Clear move
    document.querySelectorAll('.move-clear').forEach(btn => {
      btn.addEventListener('click', () => {
        const slot = Number(btn.dataset.slot);
        poke.moves[slot] = undefined;
        poke.moves = poke.moves.filter(Boolean);
        save();
        document.getElementById('card-move-slots').innerHTML =
          [0,1,2,3].map(i => `
            <div class="move-slot" data-slot="${i}">
              ${poke.moves[i]
                ? `<span class="move-name">${poke.moves[i]}</span><button class="move-clear" data-slot="${i}">✕</button>`
                : `<span class="move-empty">— empty —</span>`}
            </div>`).join('');
        document.querySelectorAll('.move-clear').forEach(b => {
          b.addEventListener('click', () => b.closest('[data-slot]') && b.click());
        });
        bindCardEvents(poke, sourceType);
      });
    });

    // Move picker
    renderMoveList(poke, '', sourceType);
    document.getElementById('move-search')?.addEventListener('input', (e) => {
      renderMoveList(poke, e.target.value, sourceType);
    });
  }

  // ── Render move picker list ────────────────────────
  function renderMoveList(poke, filter, sourceType) {
    const list = document.getElementById('move-list');
    if (!list) return;
    const f = filter.toLowerCase();
    const filtered = allMoves.filter(m => !f || m.name.toLowerCase().includes(f)).slice(0, 80);
    list.innerHTML = filtered.map(m => `
      <div class="move-item ${poke.moves.includes(m.name) ? 'selected' : ''}"
           data-move="${m.name}">
        ${typeIconHTML(m.type)}
        <span class="move-item-name">${m.name}</span>
        ${m.power ? `<span class="move-item-power">${m.power}</span>` : ''}
      </div>
    `).join('');

    list.querySelectorAll('.move-item').forEach(el => {
      el.addEventListener('click', () => {
        const moveName = el.dataset.move;
        if (poke.moves.includes(moveName)) return;
        if (poke.moves.length >= 4) return;
        poke.moves.push(moveName);
        save();
        // refresh move slots
        document.getElementById('card-move-slots').innerHTML =
          [0,1,2,3].map(i => `
            <div class="move-slot" data-slot="${i}">
              ${poke.moves[i]
                ? `<span class="move-name">${poke.moves[i]}</span><button class="move-clear" data-slot="${i}">✕</button>`
                : `<span class="move-empty">— empty —</span>`}
            </div>`).join('');
        el.classList.add('selected');
        bindCardEvents(poke, sourceType);
      });
    });
  }

  // ── Add Pokémon from Pokédex panel ─────────────────
  function addToStorage(dexEntry) {
    const poke = createPoke(dexEntry);
    state.storage.push(poke);
    save();
    renderPC();
  }

  async function openAddPicker() {
    const overlay = document.getElementById('pokedex-card-overlay');
    const card    = document.getElementById('pokedex-card');
    if (!overlay || !card) return;

    card.style.transformOrigin = 'center center';
    card.innerHTML = `
      <button class="card-close-btn" id="card-close-btn">✕</button>
      <div class="section-label" style="margin-bottom:12px;">Add Pokémon to Storage</div>
      <input type="text" id="picker-search" placeholder="Search by name or #..."
             class="move-search-input" style="margin-bottom:10px;">
      <div class="move-list" id="picker-list" style="max-height:360px;"></div>
    `;

    overlay.classList.remove('hidden');
    card.classList.remove('pop-in');
    card.offsetHeight;
    card.classList.add('pop-in');

    document.getElementById('card-close-btn')?.addEventListener('click', () => {
      overlay.classList.add('hidden');
    });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.classList.add('hidden');
    });

    if (!allPokemon.length) {
      try {
        const res = await fetch('data/pokemon_gen1.json');
        allPokemon = await res.json();
      } catch(e) { console.warn('PokeNav: could not load pokemon_gen1.json', e); }
    }

    renderPickerList('');
    document.getElementById('picker-search')?.addEventListener('input', (e) => {
      renderPickerList(e.target.value);
    });
  }

  function renderPickerList(filter) {
    const list = document.getElementById('picker-list');
    if (!list || !allPokemon.length) {
      if (list) list.innerHTML = '<div style="color:#555;padding:8px;">No Pokémon data loaded.</div>';
      return;
    }
    const f = filter.toLowerCase();
    const filtered = allPokemon.filter(p =>
      !f ||
      p.name.toLowerCase().includes(f) ||
      String(p.id).includes(f)
    ).slice(0, 80);

    list.innerHTML = filtered.map(p => `
      <div class="move-item picker-row" data-id="${p.id}">
        <div style="display:flex;align-items:center;gap:8px;flex:1;">
          <img src="https://cobbledex.b-cdn.net/3dmons/previews/small/${p.id}.webp"
               onerror="this.src='https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${p.id}.png'"
               style="width:32px;height:32px;image-rendering:pixelated;" alt="${p.name}">
          <span class="move-item-name">#${String(p.id).padStart(4,'0')} ${p.name}</span>
        </div>
        <div style="display:flex;align-items:center;gap:6px;">
          ${p.types.map(t => typeIconHTML(t)).join('')}
          <input type="number" class="picker-level-input" data-id="${p.id}"
                 min="1" max="100" value="50" placeholder="Lv">
          <button class="picker-add-btn" data-id="${p.id}">＋</button>
        </div>
      </div>
    `).join('');

    list.querySelectorAll('.picker-level-input').forEach(input => {
      input.addEventListener('click', (e) => e.stopPropagation());
    });

    list.querySelectorAll('.picker-add-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = Number(btn.dataset.id);
        const poke = allPokemon.find(p => p.id === id);
        if (!poke) return;
        const input = list.querySelector(`.picker-level-input[data-id="${id}"]`);
        const lvl = Math.max(1, Math.min(100, Number(input?.value) || 50));
        poke.level = lvl;
        addToStorage(poke);
        const row = btn.closest('.picker-row');
        if (row) {
          row.style.background = 'rgba(230,57,70,0.2)';
          setTimeout(() => { row.style.background = ''; }, 400);
        }
        const search = document.getElementById('picker-search');
        if (search) search.value = '';
        renderPickerList('');
      });
    });
  }

  // ── Storage picker (used to fill empty party slots) ─
  async function openStoragePicker(slotIndex) {
    const overlay = document.getElementById('pokedex-card-overlay');
    const card    = document.getElementById('pokedex-card');
    if (!overlay || !card) return;

    card.style.transformOrigin = 'center center';
    card.innerHTML = `
      <button class="card-close-btn" id="card-close-btn">✕</button>
      <div class="section-label" style="margin-bottom:12px;">Pick from PC Storage</div>
      <input type="text" id="storage-picker-search" placeholder="Search PC storage..."
             class="move-search-input" style="margin-bottom:10px;">
      <div class="move-list" id="storage-picker-list" style="max-height:360px;"></div>
    `;

    overlay.classList.remove('hidden');
    card.classList.remove('pop-in');
    card.offsetHeight;
    card.classList.add('pop-in');

    document.getElementById('card-close-btn')?.addEventListener('click', () => {
      overlay.classList.add('hidden');
    });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.classList.add('hidden');
    });

    renderStoragePickerList(slotIndex, '');
    document.getElementById('storage-picker-search')?.addEventListener('input', (e) => {
      renderStoragePickerList(slotIndex, e.target.value);
    });
  }

  function renderStoragePickerList(slotIndex, filter) {
    const list = document.getElementById('storage-picker-list');
    if (!list) return;
    const f = (filter || '').toLowerCase();
    const filtered = state.storage.filter(p => p && (
      !f ||
      (p.nickname || '').toLowerCase().includes(f) ||
      p.name.toLowerCase().includes(f) ||
      String(p.dexId).includes(f)
    ));

    if (!filtered.length) {
      list.innerHTML = '<div style="color:#555;padding:8px;">No Pokémon in PC storage.</div>';
      return;
    }

    list.innerHTML = filtered.map(p => `
      <div class="move-item picker-row" data-uid="${p.uid}">
        <div style="display:flex;align-items:center;gap:8px;flex:1;">
          <img src="${spriteUrl(p.dexId)}"
               onerror="this.src='https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${p.dexId}.png'"
               style="width:32px;height:32px;image-rendering:pixelated;" alt="${p.name}">
          <span class="move-item-name">#${String(p.dexId).padStart(4,'0')} ${p.nickname || p.name}
            <span style="color:#666;font-size:0.7rem;margin-left:4px;">LVL ${p.level}</span>
          </span>
        </div>
        <div style="display:flex;align-items:center;gap:6px;">
          ${p.types.map(t => typeIconHTML(t)).join('')}
        </div>
      </div>
    `).join('');

    list.querySelectorAll('.picker-row').forEach(row => {
      row.addEventListener('click', () => {
        const uid = row.dataset.uid;
        const idx = state.storage.findIndex(p => p && p.uid === uid);
        if (idx === -1) return;
        const poke = state.storage.splice(idx, 1)[0];
        const displaced = state.party[slotIndex];
        state.party[slotIndex] = poke;
        if (displaced) state.storage.push(displaced);
        save();
        renderPC();
        document.getElementById('pokedex-card-overlay')?.classList.add('hidden');
      });
    });
  }

  // ── Owned dex IDs (for Pokédex tile indicator) ─────
  function getOwnedDexIds() {
    const ids = new Set();
    state.party.forEach(p => { if (p) ids.add(p.dexId); });
    state.storage.forEach(p => { if (p) ids.add(p.dexId); });
    return ids;
  }

  // ── Init ───────────────────────────────────────────
  async function init() {
    load();

    // Load moves data
    try {
      const res = await fetch('data/moves.json');
      allMoves = await res.json();
    } catch(e) { console.warn('PokeNav: could not load moves.json', e); }

    // Load pokemon data
    try {
      const res = await fetch('data/pokemon_gen1.json');
      allPokemon = await res.json();
    } catch(e) { console.warn('PokeNav: could not load pokemon_gen1.json', e); }

    renderPC();
    bindStorageGridDrop();

    // Search input
    document.getElementById('pc-search')?.addEventListener('input', (e) => {
      pcSearchQuery = e.target.value.trim().toLowerCase();
      renderPC();
    });

    // Element panel toggle
    document.getElementById('pc-element-btn')?.addEventListener('click', () => {
      const panel = document.getElementById('pc-element-panel');
      const btn   = document.getElementById('pc-element-btn');
      panel?.classList.toggle('hidden');
      btn?.classList.toggle('active');
    });

    // Element items — render PNG icons + bind toggles
    document.querySelectorAll('#pc-element-panel .element-item').forEach(item => {
      const type = item.dataset.type;
      if (type) item.innerHTML = typeIconHTML(type);
      item.addEventListener('click', () => {
        if (!type) return;
        if (pcSelectedTypes.has(type)) {
          pcSelectedTypes.delete(type);
          item.classList.remove('active');
        } else {
          pcSelectedTypes.add(type);
          item.classList.add('active');
        }
        updatePcFilterCount();
        renderPC();
      });
    });

    document.getElementById('pc-clear-types')?.addEventListener('click', () => {
      pcSelectedTypes.clear();
      document.querySelectorAll('#pc-element-panel .element-item.active').forEach(el => el.classList.remove('active'));
      updatePcFilterCount();
      renderPC();
    });

    updatePcFilterCount();

    document.getElementById('add-poke-btn')?.addEventListener('click', () => {
      openAddPicker();
    });

    // "Add to Storage" button hook — fires when Pokédex panel sends a pokemon over
    window.pokeNavAddToStorage = addToStorage;
  }

  function updatePcFilterCount() {
    const el = document.getElementById('pc-filter-count');
    if (el) el.textContent = `${pcSelectedTypes.size} active`;
  }

  // Bootstrap: load saved state immediately so owned indicators
  // render correctly on Pokédex even before the Party tab is opened.
  load();

  return { init, getOwnedDexIds };
})();

// Hook into existing panel-switch logic — init when Party panel is shown
document.addEventListener('DOMContentLoaded', () => {
  // Run init once when the party panel first becomes active
  let partyInited = false;
  document.querySelectorAll('.nav-tab[data-panel]').forEach(item => {
    item.addEventListener('click', () => {
      if (item.dataset.panel === 'party' && !partyInited) {
        partyInited = true;
        PartyStorage.init();
      }
    });
  });
});
