/* PokeNav — 🎓 Pokémon Academy: unified item / TM / drop hub.
   Replaces the legacy `Items` (TM tracker) + `Poké Drops` (reverse drop index)
   tabs from earlier stages. Recipe rendering ships in Session 6 of the
   biome-and-academy plan; Dropped-by detail body ships in Session 7. */

const Academy = (() => {
  let inited = false;
  let allItems = [];           // [{ id?, name, category, description, icon? }]
  let recipes = [];            // raw recipes.json
  let recipesByResult = new Map();   // 'cobblemon:foo' -> recipe
  let tmIndex = [];            // [{ name, type, category, power, accuracy, pp, learnerIds }]
  let dropIndex = new Map();   // displayName -> [{ pokemon, amount }]
  let activeCategory = 'all';
  let query = '';
  let detailItem = null;       // currently-rendered item, or null = grid
  const itemHistory = [];      // back stack within Academy

  const CATEGORIES = [
    { key: 'all',      label: 'All',       emoji: '◆' },
    { key: 'pokeball', label: 'Pokéballs', emoji: '⚪' },
    { key: 'berry',    label: 'Berries',   emoji: '🍒' },
    { key: 'battle',   label: 'Battle',    emoji: '🧪' },
    { key: 'vitamin',  label: 'Vitamins',  emoji: '💊' },
    { key: 'tm',       label: 'TMs',       emoji: '🎯' },
    { key: 'apricorn', label: 'Apricorns', emoji: '🍎' },
    { key: 'drop',     label: 'Drops',     emoji: '💧' },
    { key: 'raw',      label: 'Raw',       emoji: '⛏' },
  ];

  async function init() {
    if (inited) return;
    inited = true;
    await PokeNavData.load();

    const [itemsRes, recipesRes] = await Promise.all([
      fetch('data/items.json').then(r => r.json()).catch(e => { console.error('items.json load failed', e); return []; }),
      fetch('data/recipes.json').then(r => r.json()).catch(e => { console.error('recipes.json load failed', e); return []; }),
    ]);

    recipes = recipesRes;
    recipesByResult = new Map(recipes.map(r => [r.result, r]));

    const allMon = PokeNavData.getPokemon();
    buildTmIndex(allMon);
    buildDropIndex(allMon);

    const baseItems = itemsRes.map(normalizeItem);
    const baseNames = new Set(baseItems.map(i => i.name));
    const tmItems = tmIndex.map(tmAsItem);
    const tmNames = new Set(tmItems.map(t => t.name));
    const orphanDropItems = [...dropIndex.keys()]
      .filter(n => !baseNames.has(n) && !tmNames.has(n))
      .map(dropAsItem);

    allItems = [...baseItems, ...tmItems, ...orphanDropItems];

    renderShell();
    renderActive();
  }

  function normalizeItem(raw) {
    const icon = raw.icon || (raw.id ? iconPathFromId(raw.id) : null);
    return { ...raw, icon };
  }

  function iconPathFromId(id) {
    const [ns, base] = id.split(':');
    if (!ns || !base) return null;
    return `assets/items/${ns}/${base}.png`;
  }

  // Cross-reference all gens: who can learn each TM-method move?
  function buildTmIndex(allMon) {
    const learners = new Map();
    for (const p of allMon) {
      for (const m of (p.learnableMoves || [])) {
        if (m.method !== 'tm') continue;
        if (!learners.has(m.name)) learners.set(m.name, new Set());
        learners.get(m.name).add(p.id);
      }
    }
    tmIndex = [...learners.entries()]
      .map(([name, ids]) => {
        const move = PokeNavData.getMoveByName(name);
        return move ? { ...move, learnerIds: [...ids].sort((a, b) => a - b) } : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  function tmAsItem(tm) {
    return {
      name: tm.name,
      category: 'tm',
      description: `${tm.type} · ${tm.category || '—'} · ${tm.power || '—'} pwr · ${tm.accuracy || '—'}% acc`,
      icon: `assets/types/${tm.type.toLowerCase()}.png`,
      tm,
    };
  }

  function buildDropIndex(allMon) {
    dropIndex = new Map();
    for (const p of allMon) {
      for (const drop of (p.drops || [])) {
        const name = drop.item;
        if (!dropIndex.has(name)) dropIndex.set(name, []);
        const list = dropIndex.get(name);
        if (list.some(d => d.pokemon.id === p.id)) continue;
        const amount = drop.chance || (drop.quantity ? drop.quantity : '1');
        list.push({ pokemon: p, amount });
      }
    }
  }

  function dropAsItem(name) {
    return {
      name,
      category: 'drop',
      description: `Dropped by ${dropIndex.get(name).length} Pokémon`,
    };
  }

  // ── Rendering ────────────────────────────────────────────

  function renderShell() {
    const root = document.getElementById('panel-academy');
    if (!root) return;
    root.innerHTML = `
      <div class="academy-toolbar">
        <input type="text" id="academy-search" placeholder="Search Academy..." autocomplete="off">
      </div>
      <div class="academy-cat-row">
        ${CATEGORIES.map(c => `
          <button class="academy-cat-btn ${c.key === activeCategory ? 'active' : ''}"
                  data-cat="${c.key}" type="button">${c.emoji} ${c.label}</button>
        `).join('')}
      </div>
      <div id="academy-body" class="academy-body"></div>
    `;

    root.querySelectorAll('.academy-cat-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        activeCategory = btn.dataset.cat;
        detailItem = null;
        itemHistory.length = 0;
        root.querySelectorAll('.academy-cat-btn').forEach(b =>
          b.classList.toggle('active', b === btn));
        renderActive();
      });
    });

    document.getElementById('academy-search').addEventListener('input', e => {
      query = e.target.value.trim().toLowerCase();
      detailItem = null;
      itemHistory.length = 0;
      renderActive();
    });
  }

  function renderActive() {
    if (detailItem) renderDetail();
    else renderGrid();
  }

  function filteredItems() {
    return allItems
      .filter(matchesActiveCategory)
      .filter(i => !query
        || i.name.toLowerCase().includes(query)
        || (i.description || '').toLowerCase().includes(query))
      .sort((a, b) => {
        if (a.category !== b.category) {
          return categoryOrder(a.category) - categoryOrder(b.category);
        }
        return a.name.localeCompare(b.name);
      });
  }

  function matchesActiveCategory(item) {
    if (activeCategory === 'all') return true;
    // Drops chip surfaces every item with at least one Pokémon dropper,
    // including berries/raw items that have their own primary category.
    if (activeCategory === 'drop') return dropIndex.has(item.name);
    return item.category === activeCategory;
  }

  function categoryOrder(cat) {
    const idx = CATEGORIES.findIndex(c => c.key === cat);
    return idx === -1 ? 999 : idx;
  }

  function renderGrid() {
    const body = document.getElementById('academy-body');
    if (!body) return;
    const list = filteredItems();

    if (!list.length) {
      body.innerHTML = `<div class="academy-empty">No items match.</div>`;
      return;
    }

    body.innerHTML = `
      <div class="academy-grid">
        ${list.map(i => renderTile(i)).join('')}
      </div>
    `;

    body.querySelectorAll('.academy-tile').forEach(tile => {
      tile.addEventListener('click', () => {
        const name = tile.dataset.name;
        const item = allItems.find(i => i.name === name);
        if (item) openItem(item);
      });
    });
  }

  function renderTile(item) {
    const meta = CATEGORIES.find(c => c.key === item.category);
    const iconHtml = item.icon
      ? `<img class="academy-tile-icon" src="${item.icon}" alt="${item.name}" onerror="this.style.display='none'">`
      : `<div class="academy-tile-icon academy-tile-icon--placeholder">${meta ? meta.emoji : '◆'}</div>`;
    return `
      <div class="academy-tile" data-name="${escapeAttr(item.name)}" data-cat="${item.category}">
        ${iconHtml}
        <div class="academy-tile-info">
          <div class="academy-tile-name">${item.name}</div>
          <div class="academy-tile-cat">${meta ? meta.label : item.category}</div>
        </div>
      </div>
    `;
  }

  function renderDetail() {
    const body = document.getElementById('academy-body');
    if (!body || !detailItem) return;
    const item = detailItem;
    const meta = CATEGORIES.find(c => c.key === item.category);
    const iconHtml = item.icon
      ? `<img class="academy-detail-icon" src="${item.icon}" alt="${item.name}" onerror="this.style.display='none'">`
      : `<div class="academy-detail-icon academy-detail-icon--placeholder">${meta ? meta.emoji : '◆'}</div>`;

    body.innerHTML = `
      <div class="academy-detail">
        <button class="academy-back-btn" type="button">← back</button>
        <div class="academy-detail-head">
          ${iconHtml}
          <div class="academy-detail-titles">
            <div class="academy-detail-name">${item.name}</div>
            <div class="academy-detail-cat">${meta ? meta.emoji + ' ' + meta.label : item.category}</div>
            ${item.description ? `<div class="academy-detail-desc">${item.description}</div>` : ''}
          </div>
        </div>
        <div class="academy-detail-sections">
          ${renderDetailSections(item)}
        </div>
      </div>
    `;

    body.querySelector('.academy-back-btn').addEventListener('click', back);
  }

  function renderDetailSections(item) {
    if (item.category === 'tm') return renderTmSection(item);

    const parts = [];
    const recipe = item.id ? recipesByResult.get(item.id) : null;
    if (recipe) {
      parts.push(`
        <section class="academy-section">
          <div class="academy-section-head">🍳 Crafting recipe</div>
          <div class="academy-section-placeholder">3×3 grid renderer ships in Session 6.</div>
        </section>
      `);
    }

    if (item.id && itemUsedInRecipes(item.id).length) {
      parts.push(`
        <section class="academy-section">
          <div class="academy-section-head">🧬 Used in recipes</div>
          <div class="academy-section-placeholder">"Used in" linker ships in Session 6.</div>
        </section>
      `);
    }

    if (dropIndex.has(item.name)) {
      const droppers = dropIndex.get(item.name);
      parts.push(`
        <section class="academy-section">
          <div class="academy-section-head">💧 Dropped by — ${droppers.length} Pokémon</div>
          <div class="academy-section-placeholder">Reverse-drop list ships in Session 7.</div>
        </section>
      `);
    }

    if (!parts.length) {
      parts.push(`<div class="academy-section-placeholder academy-section-placeholder--standalone">No additional info yet for this item.</div>`);
    }
    return parts.join('');
  }

  function renderTmSection(item) {
    const tm = item.tm;
    const allMon = PokeNavData.getPokemon();
    const learners = tm.learnerIds.map(id => allMon.find(p => p.id === id)).filter(Boolean);
    return `
      <section class="academy-section">
        <div class="academy-section-head">🎯 Learners — ${learners.length} Pokémon</div>
        <div class="academy-tm-meta">${tm.type} · ${tm.category || '—'} · ${tm.power || '—'} pwr · ${tm.accuracy || '—'}% acc · ${tm.pp || '—'} PP</div>
        <div class="academy-tm-learners">
          ${learners.map(p => `
            <div class="academy-tm-learner" data-id="${p.id}">
              <img src="${spriteUrl(p.id)}" onerror="${spriteFallbackOnError(p.id)}" alt="${p.name}">
              <div class="academy-tm-learner-info">
                <div class="academy-tm-learner-num">#${String(p.id).padStart(4, '0')}</div>
                <div class="academy-tm-learner-name">${p.name}</div>
              </div>
              <div class="academy-tm-learner-types">${p.types.map(t => typeIconHTMLCompact(t)).join('')}</div>
            </div>
          `).join('')}
        </div>
      </section>
    `;
  }

  function itemUsedInRecipes(id) {
    return recipes.filter(r => {
      for (const k of Object.values(r.key || {})) {
        if (k.item === id) return true;
      }
      return false;
    });
  }

  // ── Per-tab back stack ──────────────────────────────────

  function openItem(itemOrName) {
    const item = typeof itemOrName === 'string'
      ? allItems.find(i => i.name === itemOrName) ||
        allItems.find(i => i.id === itemOrName)
      : itemOrName;
    if (!item) return;
    itemHistory.push(item);
    detailItem = item;
    renderActive();
  }

  function back() {
    itemHistory.pop();
    if (itemHistory.length) {
      detailItem = itemHistory[itemHistory.length - 1];
    } else {
      detailItem = null;
    }
    renderActive();
  }

  return { init, openItem };
})();
