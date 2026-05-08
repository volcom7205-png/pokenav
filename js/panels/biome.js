/* PokeNav — Biome Search: per-biome lookup of what spawns where */

const BiomeSearch = (() => {
  let inited = false;
  let allPokemon = [];
  let biomeIndex = new Map();   // biome -> [{ pokemon, spawn }]
  let biomeFilter = '';
  let biomeSelected = null;
  let pickerOpen = new Set();   // 'dim:overworld', 'group:aquatic', …

  const prettyBiome = b => PokeNavBiomes.prettyBiome(b);

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

  async function init() {
    if (inited) return;
    inited = true;
    await Promise.all([PokeNavData.load(), PokeNavBiomes.load()]);
    allPokemon = PokeNavData.getPokemon();
    buildIndex();
    wireBiomeView();
    PokeNavBiomes.onModsChanged(() => renderBiomePicker());
    renderBiomeView();
  }

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

    const dimToGroups = {};
    for (const dim of PokeNavBiomes.getDimensionOrder()) dimToGroups[dim] = [];
    for (const g of PokeNavBiomes.getGroupOrder()) {
      if (!byGroup[g]?.length) continue;
      const meta = PokeNavBiomes.getGroupMeta(g);
      dimToGroups[meta.dimension].push(g);
    }

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
        if (typeof selectPokemon === 'function') selectPokemon(id);
      });
    });
  }

  // Public — Pokédex card / Wanted list call this to deep-link into a biome
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
    renderBiomeView();
    setTimeout(() => {
      const chip = document.querySelector(`.biome-chip[data-biome="${tag}"]`);
      if (chip) chip.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 60);
  }

  return { init, openBiome };
})();

function goToBiome(tag) {
  const overlay = document.getElementById('pokedex-card-overlay');
  if (overlay) overlay.classList.add('hidden');
  switchPanel('biome', false);
  BiomeSearch.openBiome(tag);
}
