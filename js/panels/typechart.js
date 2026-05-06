/* PokeNav — Type Chart panel: type quick-lookup (offensive + defensive grids).
   Pokémon-by-name search lives on the Pokédex card now (Defensive Matchups
   section), so this panel is single-mode. */

let typechartSelectedTypes = []; // max 2 — order matters for offensive display

function buildTypeChartPanel() {
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

  renderTypeChartLookup();
}

function renderTypeChartLookup() {
  document.querySelectorAll('.typechart-picker-item').forEach(el => {
    el.classList.toggle('selected', typechartSelectedTypes.includes(el.dataset.type));
  });
  const count = typechartSelectedTypes.length;
  document.getElementById('typechart-picker-count').textContent =
    `${count} selected${count >= 2 ? ' (max)' : ''}`;

  const results = document.getElementById('typechart-lookup-results');
  if (!count) {
    results.innerHTML = '<div class="typechart-empty">Pick a type above to see effectiveness. Search a Pokémon\'s defensive matchups via the Pokédex card.</div>';
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
