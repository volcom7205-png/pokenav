/* PokeNav — Stadium: battle planning + best moveset analysis */

const Stadium = (() => {
  const MAX_OPPONENTS = 6;
  let mode = 'planning';
  let opponents = [];        // up to 6 dex entries
  let pokemonData = [];      // full Pokémon data across all gens (incl. learnableMoves)
  let movesData = [];        // full move metadata (type/power/etc)
  let movesetSelectedId = null;
  let movesetSearch = '';
  let movesetCategory = 'all'; // 'all' | 'damage' | 'status'

  async function loadData() {
    if (!pokemonData.length || !movesData.length) {
      await PokeNavData.load();
      pokemonData = PokeNavData.getPokemon();
      movesData = PokeNavData.getMoves();
    }
  }

  // learnableMoves entries are { name, method, level? } objects.
  // Helpers below extract just the move names for code paths that
  // only care about "can this Pokémon learn move X?".
  function learnableNames(dex) {
    const moves = dex?.learnableMoves;
    if (!moves) return [];
    // Backward-compat: legacy data files may still hold strings.
    return moves.map(m => typeof m === 'string' ? m : m.name);
  }

  // ── Mode toggle ──────────────────────────────────
  function wireModeToggle() {
    document.querySelectorAll('.stadium-mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        mode = btn.dataset.mode;
        document.querySelectorAll('.stadium-mode-btn').forEach(b => {
          b.classList.toggle('active', b === btn);
        });
        document.getElementById('stadium-planning-view').classList.toggle('hidden', mode !== 'planning');
        document.getElementById('stadium-moveset-view').classList.toggle('hidden', mode !== 'moveset');
        if (mode === 'moveset') renderMovesetList();
      });
    });
  }

  // ── Opponent slots ───────────────────────────────
  function renderOpponents() {
    const grid = document.getElementById('stadium-opponent-grid');
    if (!grid) return;
    let html = '';
    for (let i = 0; i < MAX_OPPONENTS; i++) {
      const p = opponents[i];
      if (!p) {
        html += `<div class="stadium-opponent-slot empty" data-slot="${i}">＋</div>`;
      } else {
        const types = (p.types || []).map(t => {
          const tl = t.toLowerCase();
          return `<img src="assets/types/${tl}.png" alt="${tl}">`;
        }).join('');
        html += `
          <div class="stadium-opponent-slot" data-slot="${i}">
            <button class="stadium-opponent-remove" data-slot="${i}" title="Remove">✕</button>
            <img class="opp-sprite" src="${spriteUrl(p.id)}"
                 onerror="${spriteFallbackOnError(p.id)}"
                 alt="${p.name}">
            <div class="stadium-opponent-name">${p.name}</div>
            <div class="stadium-opponent-level">
              Lv <input type="number" class="opp-level-input" data-slot="${i}"
                        min="1" max="100" value="${p.level ?? 50}">
            </div>
            <div class="stadium-opponent-types">${types}</div>
          </div>
        `;
      }
    }
    grid.innerHTML = html;

    grid.querySelectorAll('.stadium-opponent-slot.empty').forEach(slot => {
      slot.addEventListener('click', () => openOpponentPicker(Number(slot.dataset.slot)));
    });
    grid.querySelectorAll('.stadium-opponent-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const i = Number(btn.dataset.slot);
        opponents.splice(i, 1);
        renderOpponents();
        renderAnalysis();
        updateOpponentCount();
      });
    });

    grid.querySelectorAll('.opp-level-input').forEach(input => {
      input.addEventListener('click', (e) => e.stopPropagation());
      input.addEventListener('change', (e) => {
        const i = Number(input.dataset.slot);
        const lvl = Math.max(1, Math.min(100, Number(input.value) || 50));
        if (opponents[i]) opponents[i].level = lvl;
        input.value = lvl;
      });
    });
  }

  function updateOpponentCount() {
    const el = document.getElementById('stadium-opponent-count');
    if (el) el.textContent = `${opponents.length} / ${MAX_OPPONENTS} set`;
  }

  // ── Picker (reuses pokedex-card overlay) ────────
  function openOpponentPicker(slotIdx) {
    const overlay = document.getElementById('pokedex-card-overlay');
    const card    = document.getElementById('pokedex-card');
    if (!overlay || !card) return;

    card.style.transformOrigin = 'center center';
    card.innerHTML = `
      <button class="card-close-btn" id="card-close-btn">✕</button>
      <div class="section-label" style="margin-bottom:12px;">Add Opponent (slot ${slotIdx + 1})</div>
      <input type="text" id="opp-picker-search" placeholder="Search by name or #..."
             class="move-search-input" style="margin-bottom:10px;">
      <div class="move-list" id="opp-picker-list" style="max-height:360px;"></div>
    `;
    overlay.classList.remove('hidden');
    card.classList.remove('pop-in');
    card.offsetHeight;
    card.classList.add('pop-in');

    const closeBtn = document.getElementById('card-close-btn');
    if (closeBtn) closeBtn.onclick = () => overlay.classList.add('hidden');
    overlay.onclick = (e) => {
      if (e.target === overlay) overlay.classList.add('hidden');
    };

    renderOppPickerList('');
    document.getElementById('opp-picker-search')?.addEventListener('input', (e) => {
      renderOppPickerList(e.target.value);
    });
  }

  function renderOppPickerList(filter) {
    const list = document.getElementById('opp-picker-list');
    if (!list) return;
    if (!pokemonData.length) {
      list.innerHTML = '<div style="color:#555;padding:8px;">Loading…</div>';
      return;
    }
    const f = filter.toLowerCase();
    const filtered = pokemonData.filter(p =>
      !f || p.name.toLowerCase().includes(f) || String(p.id).includes(f)
    ).slice(0, 80);

    list.innerHTML = filtered.map(p => `
      <div class="move-item picker-row" data-id="${p.id}">
        <div style="display:flex;align-items:center;gap:8px;flex:1;">
          <img src="${spriteUrl(p.id)}"
               onerror="${spriteFallbackOnError(p.id)}"
               style="width:32px;height:32px;image-rendering:pixelated;" alt="${p.name}">
          <span class="move-item-name">#${String(p.id).padStart(4,'0')} ${p.name}</span>
        </div>
        <div style="display:flex;align-items:center;gap:6px;">
          ${p.types.map(t => typeIconHTML(t)).join('')}
          <input type="number" class="picker-level-input" data-id="${p.id}"
                 min="1" max="100" value="50" placeholder="Lv">
          <button class="picker-add-btn" data-id="${p.id}">＋</button>
        </div>
      </div>
    `).join('');

    list.querySelectorAll('.picker-level-input').forEach(input => {
      input.addEventListener('click', (e) => e.stopPropagation());
    });

    list.querySelectorAll('.picker-add-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = Number(btn.dataset.id);
        const poke = pokemonData.find(p => p.id === id);
        if (!poke || opponents.length >= MAX_OPPONENTS) return;
        const input = list.querySelector(`.picker-level-input[data-id="${id}"]`);
        const lvl = Math.max(1, Math.min(100, Number(input?.value) || 50));
        opponents.push({ ...poke, level: lvl });
        document.getElementById('pokedex-card-overlay')?.classList.add('hidden');
        renderOpponents();
        renderAnalysis();
        updateOpponentCount();
      });
    });
  }

  // ── Analysis ─────────────────────────────────────
  function renderAnalysis() {
    const root = document.getElementById('stadium-analysis');
    if (!root) return;

    if (!opponents.length) {
      root.innerHTML = `<div class="stadium-empty">Add opponents to see weakness analysis and recommended counters from your party + storage.</div>`;
      return;
    }

    // Aggregated weakness: for each attack type, count how many opponents take >1× from it
    const weaknessCounts = {};
    for (const atk of TYPE_LIST) {
      let count = 0;
      for (const opp of opponents) {
        const m = multiplyTypes(atk, opp.types);
        if (m > 1) count++;
      }
      weaknessCounts[atk] = count;
    }

    const weaknessTiles = TYPE_LIST.map(t => {
      const n = weaknessCounts[t];
      const cls = n > 0 ? 'has-se' : '';
      const color = TYPE_COLORS[t] || '#888';
      return `
        <div class="stadium-weakness-tile ${cls}" title="${t}: ${n} opponent${n === 1 ? '' : 's'} weak">
          <img src="assets/types/${t}.png" alt="${t}">
          <span class="se-count">${n}/${opponents.length}</span>
          <span class="type-name" style="color:${color}">${t}</span>
        </div>
      `;
    }).join('');

    // Counter recommendations from owned roster
    const owned = (typeof PartyStorage !== 'undefined' && PartyStorage.getAllOwned)
      ? PartyStorage.getAllOwned()
      : [];

    let counterHTML;
    if (!owned.length) {
      counterHTML = `<div class="stadium-empty" style="padding:20px;">No Pokémon in your party or storage yet — add some on the Trainer's PC tab.</div>`;
    } else {
      const movesByName = new Map(movesData.map(m => [m.name, m]));
      const scored = owned.map(o => {
        const dex = pokemonData.find(p => p.id === o.dexId);
        if (!dex) return null;

        // Per-opponent: find best damaging move (power × multiplier)
        const perOpp = opponents.map(opp => {
          let best = { score: 0, move: null, mult: 1 };
          for (const moveName of learnableNames(dex)) {
            const move = movesByName.get(moveName);
            if (!move || move.power <= 1) continue;
            const mult = multiplyTypes(move.type, opp.types);
            if (mult === 0) continue;
            const score = move.power * mult;
            if (score > best.score) best = { score, move, mult };
          }
          return best;
        });

        const totalScore = perOpp.reduce((s, x) => s + x.score, 0);
        return { owned: o, dex, perOpp, totalScore };
      }).filter(Boolean);

      scored.sort((a, b) => b.totalScore - a.totalScore);
      const top = scored.slice(0, 8);

      counterHTML = `
        <div class="stadium-counter-list">
          ${top.map(c => {
            const badges = c.perOpp.map((b, i) => {
              const opp = opponents[i];
              const oppLvl = opp.level ?? 50;
              const lvlDiff = oppLvl - (c.owned.level ?? 50);
              const lvlCls = lvlDiff >= 10 ? 'lvl-bad' : (lvlDiff <= -10 ? 'lvl-good' : '');
              if (!b.move) {
                return `
                  <div class="stadium-counter-badge mult-bad" title="${opp.name} Lv ${oppLvl}: no effective move">
                    <img src="${spriteUrl(opp.id)}"
                         onerror="${spriteFallbackOnError(opp.id)}"
                         alt="${opp.name}">
                    <span class="badge-mult">×${b.mult}</span>
                    <span class="badge-lvl ${lvlCls}">Lv ${oppLvl}</span>
                  </div>
                `;
              }
              const cls = b.mult >= 2 ? (b.mult >= 4 ? 'mult-great' : 'mult-good') : '';
              return `
                <div class="stadium-counter-badge ${cls}" title="${opp.name} Lv ${oppLvl}: ${b.move.name} ×${b.mult}">
                  <img src="${spriteUrl(opp.id)}"
                       onerror="${spriteFallbackOnError(opp.id)}"
                       alt="${opp.name}">
                  <span class="badge-mult">×${formatMul(b.mult)}</span>
                  <span class="badge-lvl ${lvlCls}">Lv ${oppLvl}</span>
                </div>
              `;
            }).join('');

            return `
              <div class="stadium-counter-row">
                <img class="counter-sprite" src="${spriteUrl(c.dex.id)}"
                     onerror="${spriteFallbackOnError(c.dex.id)}"
                     alt="${c.dex.name}">
                <div class="stadium-counter-info">
                  <div class="stadium-counter-name">
                    ${c.owned.nickname || c.dex.name}
                    <span class="stadium-counter-source">${c.owned.source}</span>
                  </div>
                  <div class="stadium-counter-meta">Lv ${c.owned.level} · ${c.dex.types.join('/')} · score ${Math.round(c.totalScore)}</div>
                </div>
                <div class="stadium-counter-badges">${badges}</div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    }

    root.innerHTML = `
      <div class="stadium-analysis-block">
        <div class="stadium-section-header">⚠️ TEAM WEAKNESSES — attacks that hit 2× or more</div>
        <div class="stadium-weakness-grid">${weaknessTiles}</div>
      </div>
      <div class="stadium-analysis-block">
        <div class="stadium-section-header">⭐ TOP COUNTERS — from your party + storage</div>
        ${counterHTML}
      </div>
    `;
  }

  function formatMul(m) {
    if (m === 0.25) return '¼';
    if (m === 0.5) return '½';
    if (Number.isInteger(m)) return String(m);
    return String(m);
  }

  // ── Best Moveset ─────────────────────────────────
  // Score a damaging move: power × accuracy × STAB
  function scoreMove(move, dexTypes) {
    if (!move || !move.power || move.power <= 1) return 0;
    const acc = (move.accuracy && move.accuracy > 0) ? move.accuracy / 100 : 1;
    const stab = dexTypes.some(t => t.toLowerCase() === move.type.toLowerCase()) ? 1.5 : 1;
    return move.power * acc * stab;
  }

  function renderMovesetList() {
    const list = document.getElementById('moveset-pokemon-list');
    if (!list) return;
    if (!pokemonData.length) {
      list.innerHTML = '<div style="color:#555;padding:8px;">Loading…</div>';
      return;
    }
    const f = movesetSearch.toLowerCase();
    const filtered = pokemonData.filter(p =>
      !f || p.name.toLowerCase().includes(f) || String(p.id).includes(f)
    );

    list.innerHTML = filtered.map(p => `
      <div class="moveset-pokemon-row ${p.id === movesetSelectedId ? 'selected' : ''}" data-id="${p.id}">
        <img src="${spriteUrl(p.id)}"
             onerror="${spriteFallbackOnError(p.id)}"
             alt="${p.name}">
        <div class="moveset-pokemon-info">
          <div class="moveset-pokemon-name">${p.name}</div>
          <div class="moveset-pokemon-num">#${String(p.id).padStart(4,'0')}</div>
        </div>
        <div class="moveset-pokemon-types">${p.types.map(t => typeIconHTMLCompact(t)).join('')}</div>
      </div>
    `).join('');

    list.querySelectorAll('.moveset-pokemon-row').forEach(row => {
      row.addEventListener('click', () => {
        movesetSelectedId = Number(row.dataset.id);
        list.querySelectorAll('.moveset-pokemon-row').forEach(r =>
          r.classList.toggle('selected', Number(r.dataset.id) === movesetSelectedId)
        );
        renderMovesetDetail();
      });
    });
  }

  function renderMovesetDetail() {
    const root = document.getElementById('moveset-detail');
    if (!root) return;
    if (!movesetSelectedId) {
      root.innerHTML = `<div class="stadium-empty">Pick a Pokémon to see its top recommended moves.</div>`;
      return;
    }
    const dex = pokemonData.find(p => p.id === movesetSelectedId);
    if (!dex) return;

    const movesByName = new Map(movesData.map(m => [m.name, m]));
    const learned = learnableNames(dex)
      .map(name => movesByName.get(name))
      .filter(Boolean);

    const damaging = learned
      .filter(m => m.power > 1)
      .map(m => ({ ...m, score: scoreMove(m, dex.types), stab: dex.types.some(t => t.toLowerCase() === m.type.toLowerCase()) }))
      .sort((a, b) => b.score - a.score);

    const status = learned
      .filter(m => !m.power || m.power <= 1)
      .sort((a, b) => a.name.localeCompare(b.name));

    const showDamage = movesetCategory === 'all' || movesetCategory === 'damage';
    const showStatus = movesetCategory === 'all' || movesetCategory === 'status';

    const damageHeader = `
      <div class="moveset-row moveset-row-header">
        <span></span>
        <span>MOVE</span>
        <span>CATEGORY</span>
        <span>POWER</span>
        <span>ACCURACY</span>
        <span>PP</span>
        <span>SCORE</span>
      </div>
    `;
    const statusHeader = `
      <div class="moveset-row moveset-row-header">
        <span></span>
        <span>MOVE</span>
        <span>CATEGORY</span>
        <span>POWER</span>
        <span>ACCURACY</span>
        <span>PP</span>
        <span></span>
      </div>
    `;

    const damageRows = damaging.slice(0, 20).map(m => moveRow(m, true)).join('') ||
      '<div class="stadium-empty" style="padding:14px;">No damaging moves.</div>';

    const statusRows = status.slice(0, 30).map(m => moveRow(m, false)).join('') ||
      '<div class="stadium-empty" style="padding:14px;">No status moves.</div>';

    root.innerHTML = `
      <div class="moveset-detail-header">
        <img class="moveset-detail-sprite"
             src="${spriteUrl(dex.id)}"
             onerror="${spriteFallbackOnError(dex.id)}"
             alt="${dex.name}">
        <div class="moveset-detail-title">
          <div class="moveset-detail-name">${dex.name}</div>
          <div class="moveset-detail-meta">#${String(dex.id).padStart(4,'0')} · ${learned.length} learnable moves</div>
        </div>
        <div class="moveset-detail-types">${dex.types.map(t => typeIconHTML(t)).join('')}</div>
      </div>

      <div class="moveset-filter-row">
        <button class="moveset-filter-btn ${movesetCategory==='all'?'active':''}" data-cat="all">ALL</button>
        <button class="moveset-filter-btn ${movesetCategory==='damage'?'active':''}" data-cat="damage">DAMAGE</button>
        <button class="moveset-filter-btn ${movesetCategory==='status'?'active':''}" data-cat="status">STATUS</button>
      </div>

      ${showDamage ? `
        <div class="moveset-section">
          <div class="stadium-section-header">⚔️ TOP DAMAGE MOVES</div>
          <div class="moveset-rows">${damageHeader}${damageRows}</div>
        </div>
      ` : ''}
      ${showStatus ? `
        <div class="moveset-section">
          <div class="stadium-section-header">✦ STATUS / UTILITY MOVES</div>
          <div class="moveset-rows">${statusHeader}${statusRows}</div>
        </div>
      ` : ''}
    `;

    root.querySelectorAll('.moveset-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        movesetCategory = btn.dataset.cat;
        renderMovesetDetail();
      });
    });
  }

  function moveRow(m, isDamage) {
    const tl = m.type.toLowerCase();
    const color = TYPE_COLORS[tl] || '#888';
    const cat = m.category || '';
    const catCls = cat === 'Physical' ? 'cat-phys' : cat === 'Special' ? 'cat-spec' : 'cat-stat';
    const acc = (m.accuracy && m.accuracy > 0) ? `${m.accuracy}%` : '—';
    const pow = (m.power && m.power > 1) ? m.power : '—';
    const stabBadge = isDamage && m.stab ? '<span class="moveset-stab">STAB</span>' : '';
    const scoreCell = isDamage ? `<span class="moveset-score">${Math.round(m.score)}</span>` : '';
    return `
      <div class="moveset-row" style="border-left-color:${color};">
        <img class="moveset-row-type" src="assets/types/${tl}.png" alt="${tl}">
        <div class="moveset-row-name">${m.name}${stabBadge}</div>
        <span class="moveset-row-cat ${catCls}">${cat || '—'}</span>
        <span class="moveset-row-stat">${pow}</span>
        <span class="moveset-row-stat">${acc}</span>
        <span class="moveset-row-stat">${m.pp ?? '—'}</span>
        ${scoreCell || '<span></span>'}
      </div>
    `;
  }

  // ── Init ─────────────────────────────────────────
  async function init() {
    wireModeToggle();
    await loadData();
    renderOpponents();
    updateOpponentCount();
    renderAnalysis();

    document.getElementById('stadium-opponent-clear')?.addEventListener('click', () => {
      opponents = [];
      renderOpponents();
      renderAnalysis();
      updateOpponentCount();
    });

    const search = document.getElementById('moveset-search');
    search?.addEventListener('input', (e) => {
      movesetSearch = e.target.value;
      renderMovesetList();
    });
    renderMovesetList();
  }

  return { init };
})();
