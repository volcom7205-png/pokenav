/* PokeNav — Items / TM Tracker: berries / battle / vitamins / TMs with hover tooltips */

const ItemsGuide = (() => {
  let inited = false;
  let items = [];          // [{ name, category, description }]
  let tmIndex = [];        // [{ moveName, type, power, accuracy, learners: [pokemon] }]
  let activeTab = 'berry';
  const queries = { berry: '', battle: '', vitamin: '', tm: '' };
  let selectedTm = null;

  async function init() {
    if (inited) return;
    inited = true;
    await PokeNavData.load();

    try {
      const res = await fetch('data/items.json');
      items = await res.json();
    } catch (e) {
      console.error('items.json load failed', e);
      items = [];
    }

    buildTmIndex();
    renderShell();
    renderActive();
  }

  // Cross-reference all gens: who can learn each TM-method move?
  function buildTmIndex() {
    const allMon = PokeNavData.getPokemon();
    const learners = new Map();   // moveName -> Set<dexId>
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

  function renderShell() {
    const root = document.getElementById('panel-itemsguide');
    if (!root) return;
    root.innerHTML = `
      <div class="itemsguide-tab-row">
        <button class="itemsguide-tab active" data-tab="berry"   type="button">🍒 BERRIES</button>
        <button class="itemsguide-tab"        data-tab="battle"  type="button">🧪 BATTLE</button>
        <button class="itemsguide-tab"        data-tab="vitamin" type="button">💊 VITAMINS</button>
        <button class="itemsguide-tab"        data-tab="tm"      type="button">🎯 TMs</button>
      </div>
      <div class="itemsguide-search-row">
        <input type="text" id="itemsguide-search" placeholder="Search items..." autocomplete="off">
      </div>
      <div id="itemsguide-body" class="itemsguide-body"></div>
    `;

    root.querySelectorAll('.itemsguide-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        activeTab = btn.dataset.tab;
        root.querySelectorAll('.itemsguide-tab').forEach(b =>
          b.classList.toggle('active', b === btn));
        const search = document.getElementById('itemsguide-search');
        if (search) search.value = queries[activeTab] || '';
        selectedTm = null;
        renderActive();
      });
    });

    document.getElementById('itemsguide-search').addEventListener('input', e => {
      queries[activeTab] = e.target.value.trim().toLowerCase();
      renderActive();
    });
  }

  function renderActive() {
    if (activeTab === 'tm') return renderTms();
    return renderItemList(activeTab);
  }

  function renderItemList(category) {
    const body = document.getElementById('itemsguide-body');
    if (!body) return;
    const q = queries[category] || '';
    const list = items
      .filter(i => i.category === category)
      .filter(i => !q || i.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));

    if (!list.length) {
      body.innerHTML = `<div class="itemsguide-empty">No items match.</div>`;
      return;
    }

    body.innerHTML = `
      <div class="itemsguide-grid">
        ${list.map(i => `
          <div class="itemsguide-card" data-tip="${escapeAttr(i.description)}">
            <div class="itemsguide-card-name">${i.name}</div>
            <div class="itemsguide-card-desc">${i.description}</div>
          </div>
        `).join('')}
      </div>
    `;
  }

  function renderTms() {
    const body = document.getElementById('itemsguide-body');
    if (!body) return;
    const q = queries.tm || '';
    const list = tmIndex
      .filter(m => !q || m.name.toLowerCase().includes(q) || m.type.toLowerCase().includes(q));

    if (!list.length) {
      body.innerHTML = `<div class="itemsguide-empty">No TMs match.</div>`;
      return;
    }

    const detailHTML = renderTmDetail();

    body.innerHTML = `
      <div class="itemsguide-tm-layout">
        <div class="itemsguide-tm-list">
          ${list.map(m => `
            <div class="itemsguide-tm-row ${selectedTm === m.name ? 'selected' : ''}"
                 data-name="${escapeAttr(m.name)}">
              <img class="itemsguide-tm-typeicon" src="assets/types/${m.type.toLowerCase()}.png" alt="${m.type}">
              <div class="itemsguide-tm-info">
                <div class="itemsguide-tm-name">${m.name}</div>
                <div class="itemsguide-tm-meta">${m.type} · ${m.category || '—'} · ${m.power || '—'} pwr · ${m.accuracy || '—'}% acc</div>
              </div>
              <div class="itemsguide-tm-count">${m.learnerIds.length}<span>mons</span></div>
            </div>
          `).join('')}
        </div>
        <div class="itemsguide-tm-detail">${detailHTML}</div>
      </div>
    `;

    body.querySelectorAll('.itemsguide-tm-row').forEach(row => {
      row.addEventListener('click', () => {
        selectedTm = row.dataset.name;
        renderTms();
      });
    });
  }

  function renderTmDetail() {
    if (!selectedTm) {
      return `<div class="itemsguide-empty itemsguide-empty--inline">Pick a TM to see which Pokémon can learn it.</div>`;
    }
    const tm = tmIndex.find(m => m.name === selectedTm);
    if (!tm) return '';
    const allMon = PokeNavData.getPokemon();
    const learners = tm.learnerIds
      .map(id => allMon.find(p => p.id === id))
      .filter(Boolean);

    return `
      <div class="itemsguide-tm-detail-head">
        <img src="assets/types/${tm.type.toLowerCase()}.png" alt="${tm.type}">
        <div>
          <div class="itemsguide-tm-detail-name">${tm.name}</div>
          <div class="itemsguide-tm-detail-meta">${tm.type} · ${tm.category || '—'} · ${tm.power || '—'} pwr · ${tm.accuracy || '—'}% acc · ${tm.pp || '—'} PP</div>
          <div class="itemsguide-tm-detail-count">${learners.length} Pokémon can learn this</div>
        </div>
      </div>
      <div class="itemsguide-tm-learners">
        ${learners.map(p => `
          <div class="itemsguide-tm-learner" data-id="${p.id}">
            <img src="${spriteUrl(p.id)}" onerror="${spriteFallbackOnError(p.id)}" alt="${p.name}">
            <div class="itemsguide-tm-learner-info">
              <div class="itemsguide-tm-learner-num">#${String(p.id).padStart(4,'0')}</div>
              <div class="itemsguide-tm-learner-name">${p.name}</div>
            </div>
            <div class="itemsguide-tm-learner-types">${p.types.map(t => typeIconHTMLCompact(t)).join('')}</div>
          </div>
        `).join('')}
      </div>
    `;
  }

  return { init };
})();
