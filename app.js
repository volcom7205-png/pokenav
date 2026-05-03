/* =============================================
   POKENAV — app.js
   Stage 3: Pokédex + Item Search
   ============================================= */

// ─── STATE ────────────────────────────────────
let allPokemon = [];
let selectedPokemon = null;
let selectedItem = null;
let itemIndex = {};   // { "Item Name": [{ pokemon, amount }, ...] }

// ─── INIT ─────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initNav();
  loadPokemonData();
});

// ─── NAVIGATION ───────────────────────────────
function initNav() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
      item.classList.add('active');
      const panelId = 'panel-' + item.dataset.panel;
      const panel = document.getElementById(panelId);
      if (panel) panel.classList.add('active');
    });
  });
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
  const panel = document.getElementById('panel-pokedex');
  panel.innerHTML = `
    <h2>📖 Pokédex</h2>
    <div class="panel-search">
      <input type="text" id="pokedex-search" placeholder="Search by name or number..." autocomplete="off" />
    </div>
    <div class="pokedex-layout">
      <div class="pokedex-results" id="pokedex-results"></div>
      <div id="pokedex-card">
        <div class="poke-card-empty">Select a Pokémon to view details</div>
      </div>
    </div>
  `;

  renderPokedexList(allPokemon);

  document.getElementById('pokedex-search').addEventListener('input', e => {
    const q = e.target.value.trim().toLowerCase();
    const filtered = allPokemon.filter(p =>
      p.name.toLowerCase().includes(q) ||
      String(p.id).includes(q) ||
      String(p.id).padStart(4, '0').includes(q)
    );
    renderPokedexList(filtered);
  });
}

function renderPokedexList(list) {
  const container = document.getElementById('pokedex-results');
  if (!list.length) {
    container.innerHTML = '<div class="no-results">No Pokémon found</div>';
    return;
  }
  container.innerHTML = list.map(p => `
    <div class="pokedex-result-item ${selectedPokemon?.id === p.id ? 'selected' : ''}"
         data-id="${p.id}" onclick="selectPokemon(${p.id})">
      <img src="${p.sprite}" alt="${p.name}" onerror="this.style.opacity='0.3'" />
      <span class="pokedex-result-num">#${String(p.id).padStart(4, '0')}</span>
      <span class="pokedex-result-name">${p.name}</span>
      <div class="pokedex-result-types">
        ${p.types.map(t => `<span class="type-badge type-${t}">${t}</span>`).join('')}
      </div>
    </div>
  `).join('');
}

function selectPokemon(id) {
  selectedPokemon = allPokemon.find(p => p.id === id);
  if (!selectedPokemon) return;

  // Update selected state in list
  document.querySelectorAll('.pokedex-result-item').forEach(el => {
    el.classList.toggle('selected', parseInt(el.dataset.id) === id);
  });

  renderPokedexCard(selectedPokemon, 0);
}

function renderPokedexCard(pokemon, spawnIdx) {
  const container = document.getElementById('pokedex-card');
  const spawns = pokemon.spawns || [];
  const spawn = spawns[spawnIdx] || spawns[0];

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

  container.innerHTML = `
    <div class="poke-card">
      <div class="poke-card-header">
        <img class="poke-card-sprite" src="${pokemon.sprite}" alt="${pokemon.name}"
             onerror="this.style.opacity='0.3'" />
        <div>
          <div class="poke-card-num">#${String(pokemon.id).padStart(4, '0')}</div>
          <div class="poke-card-name">${pokemon.name}</div>
          <div class="poke-card-types">
            ${pokemon.types.map(t => `<span class="type-badge type-${t}">${t}</span>`).join('')}
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
    </div>
  `;
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
          ${pokemon.types.map(t => `<span class="type-badge type-${t}">${t}</span>`).join(' ')}
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
// Switches to Pokédex tab and opens that Pokémon's card.
function goToPokedex(id) {
  // Switch nav
  document.querySelectorAll('.nav-item').forEach(n => {
    n.classList.toggle('active', n.dataset.panel === 'pokedex');
  });
  document.querySelectorAll('.panel').forEach(p => {
    p.classList.toggle('active', p.id === 'panel-pokedex');
  });

  // Select and scroll to pokemon
  selectPokemon(id);

  // Scroll the result into view
  setTimeout(() => {
    const el = document.querySelector(`.pokedex-result-item[data-id="${id}"]`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
