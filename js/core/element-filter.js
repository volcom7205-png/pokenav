/* PokeNav — shared element-filter (the 18-icon panel that toggles type
   filters on a tile grid). Pokédex and Trainer's PC both use one. */

const ElementFilter = (() => {
  const TYPES = [
    'normal','fire','water','grass','electric','ice',
    'fighting','poison','ground','flying','psychic','bug',
    'rock','ghost','dragon','dark','steel','fairy',
  ];

  // Lazily fill an empty .element-icon-grid with the 18 icon items.
  // Idempotent — if the grid already has items, leaves them alone.
  function populate(panelEl) {
    if (!panelEl) return;
    const grid = panelEl.querySelector('.element-icon-grid');
    if (!grid) return;
    if (grid.children.length === TYPES.length && grid.querySelector('img')) return;
    grid.innerHTML = TYPES.map(t => `
      <div class="element-item" data-type="${t}">
        ${typeIconHTML(t)}<span class="element-item-label">${t[0].toUpperCase()}${t.slice(1)}</span>
      </div>
    `).join('');
  }

  // Wire a type-filter UI block. Caller owns the Set; we mutate it.
  // opts: { panelId, btnId, clearId, countId, selected: Set, onChange: () => void }
  function wire(opts) {
    const { panelId, btnId, clearId, countId, selected, onChange } = opts;
    const panel = document.getElementById(panelId);
    const btn   = document.getElementById(btnId);
    const clear = document.getElementById(clearId);
    const count = document.getElementById(countId);
    if (!panel) return;

    populate(panel);

    btn?.addEventListener('click', () => {
      panel.classList.toggle('hidden');
      btn.classList.toggle('active');
    });

    panel.querySelectorAll('.element-item').forEach(item => {
      const type = item.dataset.type;
      if (!type) return;
      // Reflect current state if pre-selected.
      if (selected.has(type)) item.classList.add('active');
      item.addEventListener('click', () => {
        if (selected.has(type)) {
          selected.delete(type);
          item.classList.remove('active');
        } else {
          selected.add(type);
          item.classList.add('active');
        }
        if (count) count.textContent = `${selected.size} active`;
        onChange?.();
      });
    });

    clear?.addEventListener('click', () => {
      selected.clear();
      panel.querySelectorAll('.element-item.active').forEach(el => el.classList.remove('active'));
      if (count) count.textContent = `${selected.size} active`;
      onChange?.();
    });

    if (count) count.textContent = `${selected.size} active`;
  }

  return { populate, wire, TYPES };
})();
