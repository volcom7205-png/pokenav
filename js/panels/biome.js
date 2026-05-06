/* PokeNav — Biome Search: per-biome lookup, Pokémon spawn lookup, Most Wanted */

const BiomeSearch = (() => {
  const LS_KEY = 'pokenav_wanted_list';

  // ── State ────────────────────────────────────────
  let inited = false;
  let allPokemon = [];
  let biomeIndex = new Map();   // biome -> [{ pokemon, spawn }]
  let wanted = new Set();        // Set<dexId>
  let mode = 'biome';
  let biomeFilter = '';
  let biomeSelected = null;
  let pickerOpen = new Set();   // 'dim:overworld', 'group:aquatic', …
  let wantedQuery = '';
  let wantedSort = 'id';

  const prettyBiome = b => PokeNavBiomes.prettyBiome(b);

  // ── Most Wanted localStorage ─────────────────────
  function loadWanted() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) wanted = new Set(JSON.parse(raw));
    } catch (e) { /* corrupt — ignore */ }
  }
  function saveWanted() {
    localStorage.setItem(LS_KEY, JSON.stringify([...wanted]));
  }
  function isWanted(id) { return wanted.has(id); }
  function toggleWanted(id) {
    if (wanted.has(id)) wanted.delete(id); else wanted.add(id);
    saveWanted();
    if (mode === 'wanted') renderWantedView();
  }

  // ── Reverse index ────────────────────────────────
  function buildIndex() {
    biomeIndex = new Map();
    for (const p of allPokemon) {
      for (const sp of (p.spawns || [])) {
        for (const b of (sp.biomes || [])) {
          if (!biomeIndex.has(b)) biomeIndex.set(b, []);
          biomeIndex.get(b).push({ pokemon: p, spawn: sp });
        }
      }
    }
  }

  function allKnownBiomes() {
    const set = new Set();
    const tax = PokeNavBiomes;
    for (const g of tax.getGroupOrder()) {
      for (const t of tax.getGroupMeta(g).tags) set.add(t);
    }
    for (const b of biomeIndex.keys()) set.add(b);
    return tax.sortBiomes([...set]);
  }

  // ── Init / mode toggle ───────────────────────────
  async function init() {
    if (inited) return;
    inited = true;
    await Promise.all([PokeNavData.load(), PokeNavBiomes.load()]);
    allPokemon = PokeNavData.getPokemon();
    buildIndex();
    loadWanted();
    wireModeToggle();
    wireBiomeView();
    wireWantedView();
    PokeNavBiomes.onModsChanged(() => {
      if (mode === 'biome') renderBiomePicker();
    });
    renderMode();
  }

  function wireModeToggle() {
    document.querySelectorAll('.biome-mode-btn').forEach(btn => {
      btn.addEventListener('click', () => setMode(btn.dataset.mode));
    });
  }

  function setMode(m) {
    mode = m;
    document.querySelectorAll('.biome-mode-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.mode === m);
    });
    document.getElementById('biome-biome-view').classList.toggle('hidden', m !== 'biome');
    document.getElementById('biome-wanted-view').classList.toggle('hidden', m !== 'wanted');
    renderMode();
  }

  function renderMode() {
    if (mode === 'biome') renderBiomeView();
    else if (mode === 'wanted') renderWantedView();
  }

  // ── Biome search mode ───────────────────────────
  function wireBiomeView() {
    document.getElementById('biome-biome-search')?.addEventListener('input', e => {
      biomeFilter = e.target.value.trim().toLowerCase();
      renderBiomePicker();
    });
  }

  function renderBiomeView() {
    renderBiomePicker();
    renderBiomeResults();
  }

  function renderBiomePicker() {
    const root = document.getElementById('biome-picker');
    if (!root) return;

    const biomes = allKnownBiomes()
      .filter(b => !biomeFilter || b.includes(biomeFilter));

    const byGroup = {};
    for (const b of biomes) {
      const g = PokeNavBiomes.getGroup(b);
      (byGroup[g] = byGroup[g] || []).push(b);
    }

    // Bucket non-empty groups by dimension, preserving canonical order.
    const dimToGroups = {};
    for (const dim of PokeNavBiomes.getDimensionOrder()) dimToGroups[dim] = [];
    for (const g of PokeNavBiomes.getGroupOrder()) {
      if (!byGroup[g]?.length) continue;
      const meta = PokeNavBiomes.getGroupMeta(g);
      dimToGroups[meta.dimension].push(g);
    }

    // Active search forces every section open so the user can see what survived
    // the filter. Selection alone respects user-toggled state.
    const forceOpen = !!biomeFilter;
    const isOpen = key => forceOpen || pickerOpen.has(key);

    let html = '';
    for (const dim of PokeNavBiomes.getDimensionOrder()) {
      const groups = dimToGroups[dim];
      if (!groups.length) continue;
      const dimMeta = PokeNavBiomes.getDimensionMeta(dim);
      const dimKey = `dim:${dim}`;
      const dimOpen = isOpen(dimKey);
      const totalCount = groups.reduce((s, g) => s + byGroup[g].length, 0);
      const isOverworld = dim === 'overworld';

      let body = '';
      if (isOverworld) {
        body = groups.map(g => {
          const gMeta = PokeNavBiomes.getGroupMeta(g);
          const gKey = `group:${g}`;
          const gOpen = isOpen(gKey);
          return `
            <div class="biome-picker-subgroup" data-group="${g}">
              <button class="biome-picker-subheader ${gOpen ? 'is-open' : ''}"
                      data-toggle="${gKey}" type="button"
                      style="--biome-group-color:${gMeta.color}">
                <span class="picker-chevron">${gOpen ? '▼' : '▶'}</span>
                <span class="picker-emoji">${gMeta.emoji}</span>
                <span class="picker-label">${gMeta.label}</span>
                <span class="picker-count">${byGroup[g].length}</span>
              </button>
              ${gOpen ? renderChipRow(byGroup[g], gMeta.color, g) : ''}
            </div>
          `;
        }).join('');
      } else {
        const merged = groups.flatMap(g => byGroup[g]);
        const color = PokeNavBiomes.getGroupMeta(groups[0]).color;
        body = renderChipRow(merged, color, groups[0]);
      }

      html += `
        <div class="biome-picker-dim" data-dim="${dim}">
          <button class="biome-picker-header ${dimOpen ? 'is-open' : ''}"
                  data-toggle="${dimKey}" type="button">
            <span class="picker-chevron">${dimOpen ? '▼' : '▶'}</span>
            <span class="picker-emoji">${dimMeta.emoji}</span>
            <span class="picker-label">${dimMeta.label}</span>
            <span class="picker-count">${isOverworld ? `${groups.length} groups` : totalCount}</span>
          </button>
          ${dimOpen ? `<div class="biome-picker-dim-body">${body}</div>` : ''}
        </div>
      `;
    }

    root.innerHTML = html || '<div class="biome-empty">No biomes match.</div>';

    root.querySelectorAll('[data-toggle]').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.toggle;
        if (pickerOpen.has(key)) pickerOpen.delete(key);
        else pickerOpen.add(key);
        renderBiomePicker();
      });
    });

    root.querySelectorAll('.biome-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        const tag = btn.dataset.biome;
        biomeSelected = biomeSelected === tag ? null : tag;
        renderBiomePicker();
        renderBiomeResults();
      });
    });
  }

  function renderChipRow(biomes, color, groupKey) {
    return `
      <div class="biome-picker-chips">
        ${biomes.map(b => {
          const count = biomeIndex.get(b)?.length || 0;
          const empty = count === 0 ? 'is-empty' : '';
          const active = biomeSelected === b ? 'active' : '';
          return `
            <div class="biome-chip-wrap ${active}">
              <button class="biome-chip ${empty} ${active}" data-biome="${b}"
                      data-group="${groupKey}" type="button" title="${count} mons"
                      style="--biome-group-color:${color}">
                ${prettyBiome(b)}
                <span class="biome-chip-count">${count}</span>
              </button>
              ${active ? renderUnderlyingPanel(b) : ''}
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  function renderUnderlyingPanel(tag) {
    const entry = PokeNavBiomes.getTaxonomyEntry(tag);
    if (!entry) {
      return '<div class="biome-underlying biome-underlying--empty">No underlying biome data.</div>';
    }
    const enabled = PokeNavBiomes.getEnabledMods();
    const filtered = (entry.underlying || []).filter(u => enabled.has(u.source));
    if (!filtered.length) {
      return '<div class="biome-underlying biome-underlying--empty">No underlying biomes from enabled mod packs.</div>';
    }
    const bySource = {};
    for (const u of filtered) (bySource[u.source] = bySource[u.source] || []).push(u);
    const order = Object.keys(bySource).sort();
    return `
      <div class="biome-underlying">
        ${order.map(src => `
          <div class="biome-underlying-source">
            <div class="biome-underlying-source-label">${src.replace(/_/g, ' ')}</div>
            <div class="biome-underlying-list">
              ${bySource[src].map(u => `<span class="biome-underlying-tag">${u.name}</span>`).join('')}
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  function renderBiomeResults() {
    const root = document.getElementById('biome-biome-results');
    if (!root) return;

    if (!biomeSelected) {
      root.innerHTML = '<div class="biome-empty">Pick a biome to see what spawns there.</div>';
      return;
    }

    const entries = biomeIndex.get(biomeSelected) || [];
    if (!entries.length) {
      root.innerHTML = `
        <div class="biome-results-header">${prettyBiome(biomeSelected)}</div>
        <div class="biome-empty">No spawns recorded in this biome.</div>
      `;
      return;
    }

    // Group by Pokémon so each mon shows once even if multiple spawn
    // entries reference the same biome.
    const byMon = new Map();
    for (const { pokemon, spawn } of entries) {
      if (!byMon.has(pokemon.id)) byMon.set(pokemon.id, { pokemon, spawns: [] });
      byMon.get(pokemon.id).spawns.push(spawn);
    }

    const RARITY_ORDER = { 'common': 0, 'uncommon': 1, 'rare': 2, 'ultra-rare': 3, 'unknown': 4 };
    const rows = [...byMon.values()].sort((a, b) => {
      const ar = Math.min(...a.spawns.map(s => RARITY_ORDER[s.bucket] ?? 9));
      const br = Math.min(...b.spawns.map(s => RARITY_ORDER[s.bucket] ?? 9));
      if (ar !== br) return ar - br;
      return a.pokemon.id - b.pokemon.id;
    });

    root.innerHTML = `
      <div class="biome-results-header">
        ${prettyBiome(biomeSelected)}
        <span class="biome-results-count">${rows.length} Pokémon</span>
      </div>
      <div class="biome-results-grid">
        ${rows.map(({ pokemon, spawns }) => `
          <div class="biome-result-tile" data-id="${pokemon.id}">
            <img src="${pokemon.sprite}" alt="${pokemon.name}"
                 onerror="this.style.opacity='0.3'">
            <div class="biome-result-num">#${String(pokemon.id).padStart(4,'0')}</div>
            <div class="biome-result-name">${pokemon.name}</div>
            <div class="biome-result-types">${pokemon.types.map(t => typeIconHTMLCompact(t)).join('')}</div>
            <div class="biome-result-conds">
              ${spawns.map(s => `
                <div class="biome-result-cond">
                  <span class="biome-cond-rarity rarity-${s.bucket || 'unknown'}">${s.bucket || '—'}</span>
                  <span class="biome-cond-lvl">Lv ${s.levelRange || '?'}</span>
                  ${s.time && s.time !== 'any' ? `<span class="biome-cond-time">${formatTime(s.time)}</span>` : ''}
                  ${s.weather && s.weather !== 'any' ? `<span class="biome-cond-weather">${formatWeather(s.weather)}</span>` : ''}
                  ${(s.context || []).filter(c => c !== 'grounded').map(c => `<span class="biome-cond-ctx">${c}</span>`).join('')}
                </div>
              `).join('')}
            </div>
          </div>
        `).join('')}
      </div>
    `;

    root.querySelectorAll('.biome-result-tile').forEach(tile => {
      tile.addEventListener('click', () => {
        const id = Number(tile.dataset.id);
        // Re-use Pokédex modal so users can act on the result
        if (typeof selectPokemon === 'function') {
          selectPokemon(id);
        }
      });
    });
  }

  // ── Most Wanted mode ────────────────────────────
  function wireWantedView() {
    document.getElementById('biome-wanted-search')?.addEventListener('input', e => {
      wantedQuery = e.target.value.trim().toLowerCase();
      renderWantedView();
    });
    document.getElementById('biome-wanted-sort')?.addEventListener('change', e => {
      wantedSort = e.target.value;
      renderWantedView();
    });
  }

  function renderWantedView() {
    const root = document.getElementById('biome-wanted-grid');
    if (!root) return;

    if (!wanted.size) {
      root.innerHTML = `<div class="biome-empty">
        Your Most Wanted list is empty. Open a Pokémon's detail card and click "+ Wanted" to track it.
      </div>`;
      return;
    }

    const RARITY_ORDER = { 'common': 0, 'uncommon': 1, 'rare': 2, 'ultra-rare': 3, 'unknown': 4 };
    let list = [...wanted].map(id => allPokemon.find(p => p.id === id)).filter(Boolean);

    if (wantedQuery) {
      list = list.filter(p =>
        p.name.toLowerCase().includes(wantedQuery) ||
        String(p.id).includes(wantedQuery) ||
        p.types.some(t => t.toLowerCase().includes(wantedQuery))
      );
    }
    list.sort((a, b) => {
      if (wantedSort === 'name') return a.name.localeCompare(b.name);
      if (wantedSort === 'type') return (a.types[0] || '').localeCompare(b.types[0] || '');
      if (wantedSort === 'rarity') {
        const ar = Math.min(...(a.spawns || []).map(s => RARITY_ORDER[s.bucket] ?? 9), 9);
        const br = Math.min(...(b.spawns || []).map(s => RARITY_ORDER[s.bucket] ?? 9), 9);
        return ar - br;
      }
      return a.id - b.id;
    });

    if (!list.length) {
      root.innerHTML = '<div class="biome-empty">No matches in your Most Wanted list.</div>';
      return;
    }

    root.innerHTML = list.map(p => {
      // Aggregate biomes across all spawn entries
      const biomeSet = new Set();
      for (const s of (p.spawns || [])) for (const b of (s.biomes || [])) biomeSet.add(b);
      const biomes = PokeNavBiomes.sortBiomes([...biomeSet]);
      const bestBucket = (p.spawns || [])
        .map(s => s.bucket)
        .filter(Boolean)
        .sort((a, b) => (RARITY_ORDER[a] ?? 9) - (RARITY_ORDER[b] ?? 9))[0] || 'unknown';

      return `
        <div class="biome-wanted-tile" data-id="${p.id}">
          <button class="biome-wanted-remove" data-id="${p.id}" type="button" title="Remove from list">✕</button>
          <div class="wanted-poster-stamp">★ WANTED ★</div>
          <img class="biome-wanted-sprite" src="${p.sprite}" alt="${p.name}"
               onerror="this.style.opacity='0.3'">
          <div class="biome-wanted-num">#${String(p.id).padStart(4,'0')}</div>
          <div class="biome-wanted-name">${p.name}</div>
          <div class="biome-wanted-types">${p.types.map(t => typeIconHTMLCompact(t)).join('')}</div>
          <div class="biome-wanted-rarity rarity-${bestBucket}">${bestBucket.toUpperCase()}</div>
          <div class="biome-wanted-biomes">
            ${biomes.length
              ? biomes.slice(0, 8).map(b => {
                  const color = PokeNavBiomes.getGroupColor(b);
                  return `<span class="biome-wanted-biome" data-biome="${b}" data-group="${PokeNavBiomes.getGroup(b)}" role="button" tabindex="0" style="border-left-color:${color}">${prettyBiome(b)}</span>`;
                }).join('')
              : '<span class="biome-wanted-biome biome-wanted-biome--none">No spawn data</span>'}
            ${biomes.length > 8 ? `<span class="biome-wanted-more">+${biomes.length - 8} more</span>` : ''}
          </div>
        </div>
      `;
    }).join('');

    root.querySelectorAll('.biome-wanted-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleWanted(Number(btn.dataset.id));
      });
    });
    root.querySelectorAll('.biome-wanted-biome[data-biome]').forEach(chip => {
      chip.addEventListener('click', (e) => {
        e.stopPropagation();
        openBiome(chip.dataset.biome);
      });
    });

    root.querySelectorAll('.biome-wanted-tile').forEach(tile => {
      tile.addEventListener('click', (e) => {
        if (e.target.closest('.biome-wanted-remove')) return;
        if (e.target.closest('.biome-wanted-biome[data-biome]')) return;
        const id = Number(tile.dataset.id);
        if (typeof selectPokemon === 'function') selectPokemon(id);
      });
    });
  }

  // Public surface — Pokédex panel calls these to add the "+ Wanted"
  // button on its detail modal.
  async function openBiome(tag) {
    await init();
    const group = PokeNavBiomes.getGroup(tag);
    const dim = PokeNavBiomes.getDimension(tag);
    pickerOpen.add(`dim:${dim}`);
    pickerOpen.add(`group:${group}`);
    biomeSelected = tag;
    biomeFilter = '';
    const search = document.getElementById('biome-biome-search');
    if (search) search.value = '';
    setMode('biome');
    setTimeout(() => {
      const chip = document.querySelector(`.biome-chip[data-biome="${tag}"]`);
      if (chip) chip.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 60);
  }

  return { init, isWanted, toggleWanted, openBiome };
})();

function goToBiome(tag) {
  const overlay = document.getElementById('pokedex-card-overlay');
  if (overlay) overlay.classList.add('hidden');
  switchPanel('biome', false);
  BiomeSearch.openBiome(tag);
}
