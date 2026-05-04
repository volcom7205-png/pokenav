/* PokeNav — Pokédex panel: tile grid, search, type filter, detail card modal */

let pokedexSearchQuery = '';
let pokedexSelectedTypes = new Set();
let pokedexSelectedGen = 'all';

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

  document.querySelectorAll('#pokedex-gen-row .gen-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      pokedexSelectedGen = chip.dataset.gen;
      document.querySelectorAll('#pokedex-gen-row .gen-chip').forEach(c => {
        c.classList.toggle('active', c === chip);
      });
      renderPokedexTiles();
    });
  });

  updatePokedexFilterCount();
}

function renderPokedexTiles() {
  const grid = document.getElementById('pokedex-grid');
  if (!grid) return;

  const filtered = allPokemon.filter(p => {
    if (pokedexSelectedGen !== 'all' && PokeNavData.getGen(p.id) !== Number(pokedexSelectedGen)) {
      return false;
    }
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

  const isWanted = typeof BiomeSearch !== 'undefined' && BiomeSearch.isWanted?.(pokemon.id);
  card.innerHTML = `
    <button class="card-close-btn" id="card-close-btn">✕</button>
    <button class="add-storage-btn" id="detail-add-storage-btn" style="position:absolute;top:14px;right:46px;">+ Storage</button>
    <button class="add-wanted-btn ${isWanted ? 'is-wanted' : ''}" id="detail-add-wanted-btn"
            style="position:absolute;top:14px;right:140px;">${isWanted ? '★ Wanted' : '+ Wanted'}</button>
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

  document.getElementById('detail-add-wanted-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (typeof BiomeSearch === 'undefined') return;
    BiomeSearch.toggleWanted(pokemon.id);
    // Re-render so button label flips
    renderPokedexCard(pokemon, spawnIdx);
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

// Cross-panel nav: clicking a Pokémon in Poké Drops jumps to Pokédex and opens its card.
function goToPokedex(id) {
  switchPanel('pokedex', false);
  selectPokemon(id);

  // Scroll the underlying tile into view so it's visible after the modal closes
  setTimeout(() => {
    const tile = document.querySelector(`.pokedex-tile[data-id="${id}"]`);
    if (tile) tile.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, 50);
}
