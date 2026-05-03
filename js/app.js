/* =============================================
   POKENAV — app.js
   Stage 3: Pokédex + Item Search
   ============================================= */

// ─── STATE ────────────────────────────────────
let allPokemon = [];
let selectedPokemon = null;
let selectedItem = null;
let itemIndex = {};   // { "Item Name": [{ pokemon, amount }, ...] }
let pokedexSearchQuery = '';
let pokedexSelectedTypes = new Set();

// ─── TYPE RENDER HELPERS ──────────────────────
function typeIconHTML(type) {
  if (!type) return '';
  const lc = String(type).toLowerCase();
  return `<span class="type-badge type-${lc}">${lc}</span>`;
}

function typeCardIconHTML(type) {
  if (!type) return '';
  const lc = String(type).toLowerCase();
  return `<div class="type-card-icon">
    <img src="assets/types/${lc}.png" alt="${lc} type">
    <span class="type-card-icon-label">${lc}</span>
  </div>`;
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

    <div class="settings-card">
      <div class="settings-row">
        <span class="settings-label">Current Trainer</span>
        <span class="settings-value" id="settings-current-name"></span>
      </div>
      <div class="settings-row settings-row--input">
        <label class="settings-label" for="settings-trainer-input">Edit Name</label>
        <input id="settings-trainer-input" type="text" maxlength="20"
               placeholder="Trainer name..." autocomplete="off" />
        <button id="settings-save-btn" class="settings-btn" type="button">SAVE</button>
      </div>
    </div>

    <div class="settings-card settings-card--danger">
      <div class="settings-label settings-label--danger">Danger Zone</div>
      <p class="settings-help">Wipes trainer name, party, storage, and all saved data, then reloads the app.</p>
      <button id="settings-reset-btn" class="settings-btn settings-btn--danger" type="button">RESET ALL DATA</button>
    </div>
  `;

  // Seed values via textContent/value to avoid HTML injection in user input
  document.getElementById('settings-current-name').textContent = name || '—';
  document.getElementById('settings-trainer-input').value = name;

  document.getElementById('settings-save-btn').addEventListener('click', () => {
    const input = document.getElementById('settings-trainer-input');
    const v = (input.value || '').trim();
    if (!v) { input.focus(); return; }
    setTrainerName(v); // updates localStorage + nav display + PC tab label
    document.getElementById('settings-current-name').textContent = v;
    flashSettingsSaved();
  });

  document.getElementById('settings-trainer-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      document.getElementById('settings-save-btn').click();
    }
  });

  document.getElementById('settings-reset-btn').addEventListener('click', () => {
    const ok = confirm('This will erase your trainer name, party, storage, and all PokeNav data. Are you sure?');
    if (!ok) return;
    localStorage.clear();
    location.reload();
  });
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

  document.querySelectorAll('.element-item').forEach(item => {
    item.addEventListener('click', () => {
      const type = item.dataset.type;
      if (!type) return;
      if (pokedexSelectedTypes.has(type)) {
        pokedexSelectedTypes.delete(type);
        item.classList.remove('active');
      } else {
        pokedexSelectedTypes.add(type);
        item.classList.add('active');
      }
      updatePokedexFilterCount();
      renderPokedexActiveFilters();
      renderPokedexTiles();
    });
  });

  document.getElementById('pokedex-clear-types')?.addEventListener('click', () => {
    clearPokedexTypeFilters();
  });

  updatePokedexFilterCount();
  renderPokedexActiveFilters();
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

  grid.innerHTML = filtered.map(p => `
    <div class="pokedex-tile" data-id="${p.id}">
      <img class="pokedex-tile-sprite" src="${p.sprite}" alt="${p.name}"
           onerror="this.style.opacity='0.3'" />
      <div class="pokedex-tile-number">#${String(p.id).padStart(4, '0')}</div>
      <div class="pokedex-tile-name">${p.name}</div>
      <div class="pokedex-tile-types">
        ${p.types.map(t => `<img class="pokedex-tile-type-icon" src="assets/types/${String(t).toLowerCase()}.png" alt="${t}" title="${t}" onerror="this.style.display='none'">`).join('')}
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

function renderPokedexActiveFilters() {
  const container = document.getElementById('pokedex-active-filters');
  if (!container) return;

  if (pokedexSelectedTypes.size === 0) {
    container.classList.add('hidden');
    container.innerHTML = '';
    return;
  }

  container.classList.remove('hidden');
  container.innerHTML = Array.from(pokedexSelectedTypes).map(t => `
    <span class="filter-tag">
      <span class="filter-tag-name">${t}</span>
      <button class="filter-tag-remove" data-type="${t}" type="button" aria-label="Remove ${t} filter">✕</button>
    </span>
  `).join('');

  container.querySelectorAll('.filter-tag-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.type;
      pokedexSelectedTypes.delete(type);
      const item = document.querySelector(`.element-item[data-type="${type}"]`);
      item?.classList.remove('active');
      updatePokedexFilterCount();
      renderPokedexActiveFilters();
      renderPokedexTiles();
    });
  });
}

function clearPokedexTypeFilters() {
  pokedexSelectedTypes.clear();
  document.querySelectorAll('.element-item.active').forEach(el => el.classList.remove('active'));
  updatePokedexFilterCount();
  renderPokedexActiveFilters();
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
        <div class="poke-card-types">
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

// ─── ITEM SEARCH PANEL ────────────────────────
function buildItemSearchPanel() {
  const panel = document.getElementById('panel-items');
  panel.innerHTML = `
    <h2>🎒 Item Search</h2>
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
        <div class="dropper-num">#${String(pokemon.id).padStart(4, '0')} •
          ${pokemon.types.map(t => typeIconHTML(t)).join(' ')}
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

// ─── CROSS-PANEL NAVIGATION ───────────────────
// Called when user clicks a Pokémon in the Item Search panel.
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

  // ── Type badge HTML (delegates to global typeIconHTML) ─
  function typeBadge(type) {
    return typeIconHTML(type);
  }

  // ── Render a tile ──────────────────────────────────
  function makeTile(poke) {
    const div = document.createElement('div');
    div.className = 'poke-tile';
    div.draggable = true;
    div.dataset.uid = poke.uid;
    div.innerHTML = `
      <img class="tile-sprite" src="${spriteUrl(poke.dexId)}"
           onerror="this.src='https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${poke.dexId}.png'"
           alt="${poke.name}">
      <div class="tile-name">${poke.nickname || poke.name}</div>
      <div class="tile-number">#${String(poke.dexId).padStart(4,'0')}</div>
      <div class="tile-types">${poke.types.map(typeBadge).join('')}</div>
    `;
    return div;
  }

  // ── Render party column ────────────────────────────
  function renderParty() {
    const container = document.getElementById('party-slots');
    if (!container) return;
    container.innerHTML = '';
    for (let i = 0; i < PARTY_SIZE; i++) {
      const slot = document.createElement('div');
      slot.className = 'party-slot';
      slot.dataset.index = i;
      const poke = state.party[i];
      if (poke) {
        slot.classList.remove('empty');
        const tile = makeTile(poke);
        bindTileEvents(tile, 'party', i);
        slot.appendChild(tile);
      } else {
        slot.classList.add('empty');
        slot.textContent = '+';
      }
      bindSlotDrop(slot, 'party', i);
      container.appendChild(slot);
    }
  }

  // ── Render storage grid ────────────────────────────
  function renderStorage(filter = '') {
    const container = document.getElementById('storage-grid');
    if (!container) return;
    container.innerHTML = '';
    let list = state.storage;
    if (filter) {
      const f = filter.toLowerCase();
      list = list.filter(p =>
        p.name.toLowerCase().includes(f) ||
        String(p.dexId).includes(f) ||
        p.types.some(t => t.toLowerCase().includes(f)) ||
        p.moves.some(m => m.toLowerCase().includes(f))
      );
    }
    list.forEach((poke, i) => {
      const tile = makeTile(poke);
      bindTileEvents(tile, 'storage', state.storage.indexOf(poke));
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
      if (!e.defaultPrevented) openCard(sourceType === 'party' ? state.party[index] : state.storage[index], tile);
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
    renderParty();
    renderStorage(document.getElementById('storage-search')?.value || '');
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
  function openCard(poke, originTile) {
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

    card.innerHTML = buildCardHTML(poke);
    overlay.classList.remove('hidden');

    // Restart animation
    card.classList.remove('pop-in');
    card.offsetHeight;
    card.classList.add('pop-in');

    bindCardEvents(poke);
  }

  // ── Build card inner HTML ──────────────────────────
  function buildCardHTML(poke) {
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
          <div class="tile-types">${poke.types.map(t => typeCardIconHTML(t)).join('')}</div>
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
    `;
  }

  // ── Bind card interactivity ────────────────────────
  function bindCardEvents(poke) {
    const overlay = document.getElementById('pokedex-card-overlay');

    // Close
    document.getElementById('card-close-btn')?.addEventListener('click', () => {
      overlay.classList.add('hidden');
    });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.classList.add('hidden');
    });

    // Nickname / level / nature
    document.querySelectorAll('[data-field]').forEach(el => {
      el.addEventListener('change', () => {
        const field = el.dataset.field;
        poke[field] = el.type === 'number' ? Number(el.value) : el.value;
        save();
        renderParty();
        renderStorage(document.getElementById('storage-search')?.value || '');
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
        bindCardEvents(poke);
      });
    });

    // Move picker
    renderMoveList(poke, '');
    document.getElementById('move-search')?.addEventListener('input', (e) => {
      renderMoveList(poke, e.target.value);
    });
  }

  // ── Render move picker list ────────────────────────
  function renderMoveList(poke, filter) {
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
        bindCardEvents(poke);
      });
    });
  }

  // ── Add Pokémon from Pokédex panel ─────────────────
  function addToStorage(dexEntry) {
    const poke = createPoke(dexEntry);
    state.storage.push(poke);
    save();
    renderStorage(document.getElementById('storage-search')?.value || '');
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

    renderParty();
    renderStorage();
    bindStorageGridDrop();

    // Search
    document.getElementById('storage-search')?.addEventListener('input', (e) => {
      renderStorage(e.target.value);
    });

    // Type filter pills
    document.getElementById('storage-filter-pills')?.addEventListener('click', (e) => {
      const pill = e.target.closest('.pill');
      if (!pill) return;
      document.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      const f = pill.dataset.filter === 'all' ? '' : pill.dataset.filter;
      document.getElementById('storage-search').value = f;
      renderStorage(f);
    });

    document.getElementById('add-poke-btn')?.addEventListener('click', () => {
      openAddPicker();
    });

    // "Add to Storage" button hook — fires when Pokédex panel sends a pokemon over
    window.pokeNavAddToStorage = addToStorage;
  }

  return { init };
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
