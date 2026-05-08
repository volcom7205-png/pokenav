/* PokeNav — Pokédex panel: tile grid, search, type filter, detail card modal */

let pokedexSearchQuery = '';
let pokedexSelectedTypes = new Set();
let pokedexSelectedGen = 'all';
let pokedexSelectedCollection = 'all'; // 'all' | 'owned' | 'wanted' | 'missing'
let pokedexCardMoveCategory = 'damage'; // 'all' | 'damage' | 'status'

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

  document.querySelectorAll('#pokedex-collection-row .collection-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      pokedexSelectedCollection = chip.dataset.collection;
      document.querySelectorAll('#pokedex-collection-row .collection-chip').forEach(c => {
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

  const ownedIds = (typeof PartyStorage !== 'undefined' && PartyStorage.getOwnedDexIds)
    ? PartyStorage.getOwnedDexIds()
    : new Set();
  const wantedFn = (typeof WantedList !== 'undefined' && WantedList.isWanted)
    ? id => WantedList.isWanted(id)
    : () => false;

  const filtered = allPokemon.filter(p => {
    if (pokedexSelectedGen !== 'all' && PokeNavData.getGen(p.id) !== Number(pokedexSelectedGen)) {
      return false;
    }
    if (pokedexSelectedCollection === 'owned' && !ownedIds.has(p.id)) return false;
    if (pokedexSelectedCollection === 'wanted' && !wantedFn(p.id)) return false;
    if (pokedexSelectedCollection === 'missing' && ownedIds.has(p.id)) return false;
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
      ${ownedIds.has(p.id) ? '<div class="tile-owned-ball"></div>' : ''}
      ${wantedFn(p.id) ? '<div class="tile-wanted-star">★</div>' : ''}
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

  const spawns = mergeSpawns(pokemon.spawns || []);
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
          <div class="drop-item" data-drop-item="${escapeAttr(d.item)}" role="button" tabindex="0">
            <span class="drop-item-name">${d.item}</span>
            <span class="drop-item-amount">${d.chance || (d.quantity ? '×' + d.quantity : '×1')}</span>
          </div>
        `).join('')}
      </div>`
    : '<p style="color:var(--text-muted);font-size:0.85rem">No drops recorded.</p>';

  const isWanted = typeof WantedList !== 'undefined' && WantedList.isWanted?.(pokemon.id);
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

    ${renderEvolutionSection(pokemon)}

    <hr class="poke-card-divider" />
    <div class="poke-card-section-label">Spawn Locations</div>
    ${tabsHTML}
    ${spawnHTML}

    <hr class="poke-card-divider" />
    <div class="poke-card-section-label">Drops</div>
    ${dropsHTML}

    <hr class="poke-card-divider" />
    <div class="poke-card-section-label">Defensive Matchups</div>
    ${renderMatchupSection(pokemon)}

    <hr class="poke-card-divider" />
    <div class="poke-card-section-label">Moves</div>
    ${renderMoveSection(pokemon)}
  `;

  document.getElementById('detail-add-storage-btn')?.addEventListener('click', (e) => {
    addPokemonToStorageById(pokemon.id, e);
  });

  card.querySelectorAll('.poke-card-move-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      pokedexCardMoveCategory = btn.dataset.cat;
      renderPokedexCard(pokemon, spawnIdx);
    });
  });

  document.getElementById('detail-add-wanted-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (typeof WantedList === 'undefined') return;
    WantedList.toggleWanted(pokemon.id);
    renderPokedexCard(pokemon, spawnIdx);
  });

  document.getElementById('card-close-btn')?.addEventListener('click', () => {
    document.getElementById('pokedex-card-overlay')?.classList.add('hidden');
  });

  card.querySelectorAll('.biome-pill[data-biome]').forEach(pill => {
    pill.addEventListener('click', (e) => {
      e.stopPropagation();
      goToBiome(pill.dataset.biome);
    });
  });

  card.querySelectorAll('.drop-item[data-drop-item]').forEach(row => {
    row.addEventListener('click', (e) => {
      e.stopPropagation();
      goToAcademy(row.dataset.dropItem);
    });
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        goToAcademy(row.dataset.dropItem);
      }
    });
  });

  card.querySelectorAll('.poke-card-evo-tile[data-evo-id]').forEach(tile => {
    tile.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = parseInt(tile.dataset.evoId, 10);
      const target = PokeNavData.getPokemonById(id);
      if (!target) return;
      selectedPokemon = target;
      renderPokedexCard(target, 0);
      const cardEl = document.getElementById('pokedex-card');
      if (cardEl) {
        cardEl.classList.remove('pop-in');
        cardEl.offsetHeight;
        cardEl.classList.add('pop-in');
      }
    });
  });
}

function renderSpawnContent(spawn) {
  const contexts = (spawn.context || [])
    .map(c => c.charAt(0).toUpperCase() + c.slice(1));

  const biomes = PokeNavBiomes.sortBiomes(spawn.biomes || []);

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

    ${biomes.length ? `
      <div class="poke-card-section-label" style="margin-top:12px">Biomes</div>
      <div class="biome-list">
        ${biomes.map(b => {
          const color = PokeNavBiomes.getGroupColor(b);
          return `<span class="biome-pill" data-biome="${b}" data-group="${PokeNavBiomes.getGroup(b)}" role="button" tabindex="0" style="border-left-color:${color}">${PokeNavBiomes.prettyBiome(b)}</span>`;
        }).join('')}
      </div>` : ''}

    ${spawn.notes ? `<div class="spawn-notes">${spawn.notes}</div>` : ''}
  `;
}

function renderMatchupSection(pokemon) {
  const stabs = pokemon.types.map(t => String(t).toLowerCase());

  // Offensive overall: best STAB multiplier against each defender type.
  const offensiveTiles = TYPE_LIST.map(def => {
    const best = Math.max(...stabs.map(atk => getMul(atk, def)));
    return renderTypeMultiplierTile(def, best);
  }).join('');

  // Defensive: incoming attacks against this mon's type combo.
  const defMults = getDefenseMultipliers(pokemon.types);
  const defenseTiles = TYPE_LIST.map(atk =>
    renderTypeMultiplierTile(atk, defMults[atk])
  ).join('');

  return `
    <div class="poke-card-matchup-block">
      <div class="poke-card-matchup-subhead">⚔️ Best STAB attack vs each type</div>
      <div class="typechart-tile-grid poke-card-matchup-grid">${offensiveTiles}</div>
    </div>
    <div class="poke-card-matchup-block">
      <div class="poke-card-matchup-subhead">🛡️ Incoming attacks vs ${pokemon.name}</div>
      <div class="typechart-tile-grid poke-card-matchup-grid">${defenseTiles}</div>
    </div>
  `;
}

/* Evolution chain ----------------------------------------------------- */

const EVO_ITEM_LABELS = {
  thunder_stone: 'Thunder Stone',
  water_stone: 'Water Stone',
  fire_stone: 'Fire Stone',
  leaf_stone: 'Leaf Stone',
  ice_stone: 'Ice Stone',
  sun_stone: 'Sun Stone',
  moon_stone: 'Moon Stone',
  shiny_stone: 'Shiny Stone',
  dusk_stone: 'Dusk Stone',
  dawn_stone: 'Dawn Stone',
  oval_stone: 'Oval Stone',
  link_cable: 'Link Cable',
  kings_rock: "King's Rock",
  metal_coat: 'Metal Coat',
  dragon_scale: 'Dragon Scale',
  upgrade: 'Up-Grade',
  dubious_disc: 'Dubious Disc',
  electirizer: 'Electirizer',
  magmarizer: 'Magmarizer',
  protector: 'Protector',
  reaper_cloth: 'Reaper Cloth',
  razor_claw: 'Razor Claw',
  razor_fang: 'Razor Fang',
  prism_scale: 'Prism Scale',
  whipped_dream: 'Whipped Dream',
  sachet: 'Sachet',
  tart_apple: 'Tart Apple',
  sweet_apple: 'Sweet Apple',
  cracked_pot: 'Cracked Pot',
  chipped_pot: 'Chipped Pot',
  galarica_cuff: 'Galarica Cuff',
  galarica_wreath: 'Galarica Wreath',
  black_augurite: 'Black Augurite',
  peat_block: 'Peat Block',
  auspicious_armor: 'Auspicious Armor',
  malicious_armor: 'Malicious Armor',
  syrupy_apple: 'Syrupy Apple',
  scroll_of_darkness: 'Scroll of Darkness',
  scroll_of_waters: 'Scroll of Waters',
  metal_alloy: 'Metal Alloy',
};

function prettyEvoItem(slug) {
  if (!slug) return '';
  const bare = String(slug).replace(/^cobblemon:/, '').replace(/\s+/g, '_').toLowerCase();
  if (EVO_ITEM_LABELS[bare]) return EVO_ITEM_LABELS[bare];
  return bare.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function shortenRequirement(raw) {
  // The cobbledex page emits localized English; convert the common shapes
  // to short chip-friendly labels, fall back to the raw string for the rest.
  if (!raw) return '';
  let m;
  if ((m = raw.match(/^Must reach level (\d+)/i)))
    return `Lv ${m[1]}`;
  if ((m = raw.match(/^Must reach friendship amount of (\d+)/i)))
    return `Friendship ${m[1]}`;
  if ((m = raw.match(/^Must evolve during (\w+)/i)))
    return m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase();
  if ((m = raw.match(/^Must know a (\w+) type move/i)))
    return `Know ${m[1].toLowerCase()}-type move`;
  if ((m = raw.match(/^Must know (.+)/i)))
    return `Know ${m[1]}`;
  if ((m = raw.match(/^Must be holding (.+)/i)))
    return `Hold ${prettyEvoItem(m[1])}`;
  if ((m = raw.match(/^Must be in (.+?)\s*biome\s*$/i))) {
    const biome = m[1].replace(/^#evolution\/regional\//, '').replace(/_/g, ' ').trim();
    return `In ${biome}`;
  }
  if ((m = raw.match(/^Must be in (.+)/i))) return `At ${m[1]}`;
  if ((m = raw.match(/^Must be (.+)/i)))    return m[1];
  if (/^Stat comparison/i.test(raw))   return 'Atk vs Def';
  if (/^Stats must be equal/i.test(raw)) return 'Atk = Def';
  return raw;
}

function methodLabel(edge) {
  // Cobbledex's level_up edges with a level requirement → "Lv N"; edges
  // with friendship → "Friendship"; etc. Without a requirement list, fall
  // back to the bare method name.
  const reqs = edge.requirements || [];
  if (edge.method === 'item_interact' && edge.item) return prettyEvoItem(edge.item);
  if (edge.method === 'trade') return 'Trade';
  return null;
}

function buildEvolutionChain(rootMon) {
  // Find chain root by walking backward via reverse lookup, then collect
  // all reachable mons forward. Returns { stages, edges } where stages is
  // an array of arrays of mons grouped by depth, and edges is the flat
  // list of {from, to, method, item, requirements}.
  const all = PokeNavData.getPokemon();
  const incoming = new Map(); // dexId → [from-id]
  for (const m of all) {
    for (const e of m.evolutions || []) {
      if (!incoming.has(e.to)) incoming.set(e.to, []);
      incoming.get(e.to).push(m.id);
    }
  }
  // Walk backward to find root(s). Use seen-set to handle cycles defensively.
  const seen = new Set();
  let frontier = [rootMon.id];
  let roots = new Set();
  while (frontier.length) {
    const next = [];
    for (const id of frontier) {
      if (seen.has(id)) continue;
      seen.add(id);
      const parents = incoming.get(id) || [];
      if (!parents.length) {
        roots.add(id);
      } else {
        next.push(...parents);
      }
    }
    frontier = next;
  }
  // BFS forward from roots, recording depth + edges.
  const depth = new Map();
  const edges = [];
  const visited = new Set();
  let frontier2 = [];
  for (const r of roots) {
    depth.set(r, 0);
    frontier2.push(r);
  }
  while (frontier2.length) {
    const next = [];
    for (const id of frontier2) {
      if (visited.has(id)) continue;
      visited.add(id);
      const mon = PokeNavData.getPokemonById(id);
      if (!mon) continue;
      const d = depth.get(id);
      for (const e of mon.evolutions || []) {
        edges.push({ from: id, ...e });
        if (!depth.has(e.to) || depth.get(e.to) < d + 1) {
          depth.set(e.to, d + 1);
        }
        next.push(e.to);
      }
    }
    frontier2 = next;
  }
  // Group ids by depth.
  const stages = [];
  for (const [id, d] of depth) {
    if (!stages[d]) stages[d] = [];
    stages[d].push(id);
  }
  return { stages: stages.filter(s => s && s.length), edges, rootIds: [...roots] };
}

function renderEvolutionTile(mon, isCurrent) {
  const cls = ['poke-card-evo-tile'];
  if (isCurrent) cls.push('is-current');
  return `
    <div class="${cls.join(' ')}" data-evo-id="${mon.id}" role="button" tabindex="0" title="${mon.name}">
      <img src="${mon.sprite}" alt="${mon.name}"
           onerror="${spriteFallbackOnError(mon.id)}" />
      <div class="poke-card-evo-name">${mon.name}</div>
      <div class="poke-card-evo-num">#${String(mon.id).padStart(4, '0')}</div>
    </div>
  `;
}

function renderEvolutionEdgeRow(edge, currentId) {
  const from = PokeNavData.getPokemonById(edge.from);
  const to   = PokeNavData.getPokemonById(edge.to);
  if (!from || !to) return '';
  const chips = [];
  const ml = methodLabel(edge);
  if (ml) chips.push(ml);
  for (const r of edge.requirements || []) {
    const short = shortenRequirement(r);
    if (short && !chips.includes(short)) chips.push(short);
  }
  if (!chips.length && edge.method) chips.push(edge.method.replace(/_/g, ' '));
  return `
    <div class="poke-card-evo-row">
      ${renderEvolutionTile(from, from.id === currentId)}
      <div class="poke-card-evo-arrow">
        <div class="poke-card-evo-conds">
          ${chips.map(c => `<span class="poke-card-evo-chip">${c}</span>`).join('')}
        </div>
        <div class="poke-card-evo-arrowhead">→</div>
      </div>
      ${renderEvolutionTile(to, to.id === currentId)}
    </div>
  `;
}

function renderEvolutionSection(pokemon) {
  const chain = buildEvolutionChain(pokemon);
  if (!chain.edges.length) return '';
  const rows = chain.edges.map(e => renderEvolutionEdgeRow(e, pokemon.id)).join('');
  return `
    <hr class="poke-card-divider" />
    <div class="poke-card-section-label">Evolution Chain</div>
    <div class="poke-card-evo-list">${rows}</div>
  `;
}

function pokedexScoreMove(move, dexTypes) {
  if (!move || !move.power || move.power <= 1) return 0;
  const acc = (move.accuracy && move.accuracy > 0) ? move.accuracy / 100 : 1;
  const stab = dexTypes.some(t => t.toLowerCase() === move.type.toLowerCase()) ? 1.5 : 1;
  return move.power * acc * stab;
}

function renderMoveSection(pokemon) {
  const learnable = pokemon.learnableMoves || [];
  if (!learnable.length) {
    return `<div style="color:var(--text-muted);font-size:0.85rem;">No move data for this Pokémon.</div>`;
  }

  const seen = new Set();
  const learned = [];
  for (const entry of learnable) {
    const name = typeof entry === 'string' ? entry : entry.name;
    if (seen.has(name)) continue;
    seen.add(name);
    const move = PokeNavData.getMoveByName(name);
    if (move) learned.push(move);
  }

  const damaging = learned
    .filter(m => m.power > 1)
    .map(m => ({
      ...m,
      score: pokedexScoreMove(m, pokemon.types),
      stab: pokemon.types.some(t => t.toLowerCase() === m.type.toLowerCase()),
    }))
    .sort((a, b) => b.score - a.score);

  const status = learned
    .filter(m => !m.power || m.power <= 1)
    .sort((a, b) => a.name.localeCompare(b.name));

  const cat = pokedexCardMoveCategory;
  const showDamage = cat === 'all' || cat === 'damage';
  const showStatus = cat === 'all' || cat === 'status';

  const filterRow = `
    <div class="poke-card-move-filter-row">
      <button class="poke-card-move-filter ${cat==='all'?'active':''}" data-cat="all">ALL</button>
      <button class="poke-card-move-filter ${cat==='damage'?'active':''}" data-cat="damage">DAMAGE · ${damaging.length}</button>
      <button class="poke-card-move-filter ${cat==='status'?'active':''}" data-cat="status">STATUS · ${status.length}</button>
    </div>
  `;

  const damageBlock = showDamage ? `
    <div class="poke-card-move-block">
      <div class="poke-card-move-subhead">⚔️ Top damage</div>
      ${damaging.length
        ? damaging.slice(0, 20).map(m => pokedexMoveRow(m, true)).join('')
        : '<div class="poke-card-move-empty">No damaging moves.</div>'}
    </div>` : '';

  const statusBlock = showStatus ? `
    <div class="poke-card-move-block">
      <div class="poke-card-move-subhead">✦ Status / utility</div>
      ${status.length
        ? status.slice(0, 30).map(m => pokedexMoveRow(m, false)).join('')
        : '<div class="poke-card-move-empty">No status moves.</div>'}
    </div>` : '';

  return filterRow + damageBlock + statusBlock;
}

function pokedexMoveRow(m, isDamage) {
  const tl = m.type.toLowerCase();
  const color = TYPE_COLORS[tl] || '#888';
  const cat = m.category || '';
  const catCls = cat === 'Physical' ? 'cat-phys' : cat === 'Special' ? 'cat-spec' : 'cat-stat';
  const acc = (m.accuracy && m.accuracy > 0) ? `${m.accuracy}%` : '—';
  const pow = (m.power && m.power > 1) ? m.power : '—';
  const stabBadge = isDamage && m.stab ? '<span class="poke-card-move-stab">STAB</span>' : '';
  const scoreCell = isDamage ? `<span class="poke-card-move-score">${Math.round(m.score)}</span>` : '<span></span>';
  return `
    <div class="poke-card-move-row" style="border-left-color:${color};">
      <img class="poke-card-move-type" src="assets/types/${tl}.png" alt="${tl}">
      <div class="poke-card-move-name">${m.name}${stabBadge}</div>
      <span class="poke-card-move-cat ${catCls}">${cat || '—'}</span>
      <span class="poke-card-move-stat">${pow}</span>
      <span class="poke-card-move-stat">${acc}</span>
      <span class="poke-card-move-stat">${m.pp ?? '—'}</span>
      ${scoreCell}
    </div>
  `;
}

async function goToAcademy(itemName) {
  const overlay = document.getElementById('pokedex-card-overlay');
  if (overlay) overlay.classList.add('hidden');
  switchPanel('academy', false);
  if (typeof Academy !== 'undefined') {
    await Academy.init();
    Academy.openItem(itemName, { fresh: true });
  }
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
