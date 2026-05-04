/* PokeNav — Type Chart panel: quick lookup + Pokémon search */

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
