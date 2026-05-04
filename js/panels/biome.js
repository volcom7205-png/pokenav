/* PokeNav — Biome Search: per-biome lookup, Pokémon spawn lookup, Most Wanted */

const BiomeSearch = (() => {
  const LS_KEY = 'pokenav_wanted_list';

  // ── State ────────────────────────────────────────
  let inited = false;
  let allPokemon = [];
  let biomeIndex = new Map();   // biome -> [{ pokemon, spawn }]
  let wanted = new Set();        // Set<dexId>
  let mode = 'pokemon';
  let pokQuery = '';
  let biomeFilter = '';
  let biomeSelected = null;
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
    wirePokemonView();
    wireBiomeView();
    wireWantedView();
    renderMode();
  }

  function wireModeToggle() {
    document.querySelectorAll('.biome-mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        mode = btn.dataset.mode;
        document.querySelectorAll('.biome-mode-btn').forEach(b => {
          b.classList.toggle('active', b === btn);
        });
        document.getElementById('biome-pokemon-view').classList.toggle('hidden', mode !== 'pokemon');
        document.getElementById('biome-biome-view').classList.toggle('hidden', mode !== 'biome');
        document.getElementById('biome-wanted-view').classList.toggle('hidden', mode !== 'wanted');
        renderMode();
      });
    });
  }

  function renderMode() {
    if (mode === 'pokemon') renderPokemonView();
    else if (mode === 'biome') renderBiomeView();
    else if (mode === 'wanted') renderWantedView();
  }

  // ── Pokémon search mode ─────────────────────────
  function wirePokemonView() {
    document.getElementById('biome-pok-search')?.addEventListener('input', e => {
      pokQuery = e.target.value.trim().toLowerCase();
      renderPokemonView();
    });
  }

  function renderPokemonView() {
    const root = document.getElementById('biome-pok-results');
    if (!root) return;

    if (!pokQuery) {
      root.innerHTML = '<div class="biome-empty">Type a Pokémon name to see where it spawns.</div>';
      return;
    }
    const matches = allPokemon.filter(p =>
      p.name.toLowerCase().includes(pokQuery) ||
      String(p.id).includes(pokQuery) ||
      String(p.id).padStart(4, '0').includes(pokQuery)
    ).slice(0, 12);

    if (!matches.length) {
      root.innerHTML = '<div class="biome-empty">No Pokémon found.</div>';
      return;
    }

    root.innerHTML = matches.map(p => `
      <section class="biome-pok-card">
        <div class="biome-pok-head">
          <img class="biome-pok-sprite" src="${p.sprite}" alt="${p.name}"
               onerror="this.style.opacity='0.3'">
          <div class="biome-pok-meta">
            <div class="biome-pok-num">#${String(p.id).padStart(4,'0')}</div>
            <div class="biome-pok-name">${p.name}</div>
            <div class="biome-pok-types">${p.types.map(t => typeIconHTMLCompact(t)).join('')}</div>
          </div>
          <button class="biome-wanted-toggle ${wanted.has(p.id) ? 'is-wanted' : ''}"
                  data-id="${p.id}" type="button">
            ${wanted.has(p.id) ? '★ Wanted' : '+ Wanted'}
          </button>
        </div>
        ${(p.spawns && p.spawns.length)
          ? p.spawns.map(s => `
            <div class="biome-spawn-block">
              <div class="biome-spawn-label">${s.label || 'Spawn'}</div>
              ${renderSpawnContent(s)}
            </div>
          `).join('')
          : '<div class="biome-spawn-empty">No spawn data for this Pokémon.</div>'}
      </section>
    `).join('');

    root.querySelectorAll('.biome-wanted-toggle').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = Number(btn.dataset.id);
        toggleWanted(id);
        renderPokemonView();
      });
    });
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

    // Bucket by group (canonical order via PokeNavBiomes).
    const byGroup = {};
    for (const b of biomes) {
      const g = PokeNavBiomes.getGroup(b);
      (byGroup[g] = byGroup[g] || []).push(b);
    }

    const groupOrder = PokeNavBiomes.getGroupOrder().filter(g => byGroup[g]);
    root.innerHTML = groupOrder.map(g => {
      const meta = PokeNavBiomes.getGroupMeta(g);
      return `
      <div class="biome-picker-group" data-group="${g}">
        <div class="biome-picker-header" style="color:${meta.color}">
          ${meta.emoji} ${meta.label}
        </div>
        <div class="biome-picker-chips">
          ${byGroup[g].map(b => {
            const count = biomeIndex.get(b)?.length || 0;
            const empty = count === 0 ? 'is-empty' : '';
            const active = biomeSelected === b ? 'active' : '';
            return `
              <button class="biome-chip ${empty} ${active}" data-biome="${b}"
                      data-group="${g}" type="button" title="${count} mons"
                      style="--biome-group-color:${meta.color}">
                ${prettyBiome(b)}
                <span class="biome-chip-count">${count}</span>
              </button>
            `;
          }).join('')}
        </div>
      </div>
      `;
    }).join('');

    root.querySelectorAll('.biome-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        biomeSelected = btn.dataset.biome;
        renderBiomePicker();
        renderBiomeResults();
      });
    });
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
                  return `<span class="biome-wanted-biome" data-group="${PokeNavBiomes.getGroup(b)}" style="border-left-color:${color}">${prettyBiome(b)}</span>`;
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
    root.querySelectorAll('.biome-wanted-tile').forEach(tile => {
      tile.addEventListener('click', (e) => {
        if (e.target.closest('.biome-wanted-remove')) return;
        const id = Number(tile.dataset.id);
        if (typeof selectPokemon === 'function') selectPokemon(id);
      });
    });
  }

  // Public surface — Pokédex panel calls these to add the "+ Wanted"
  // button on its detail modal.
  return { init, isWanted, toggleWanted };
})();
