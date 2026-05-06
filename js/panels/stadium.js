/* PokeNav — Stadium: battle planning. Pick up to 6 opponents, see aggregated
   type weaknesses + recommended counters drawn from your party + storage.

   Best-moveset analysis was folded into the Pokédex card's Moves section. */

const Stadium = (() => {
  const MAX_OPPONENTS = 6;
  let opponents = [];        // up to 6 dex entries
  let pokemonData = [];      // full Pokémon data across all gens (incl. learnableMoves)
  let movesData = [];        // full move metadata (type/power/etc)

  async function loadData() {
    if (!pokemonData.length || !movesData.length) {
      await PokeNavData.load();
      pokemonData = PokeNavData.getPokemon();
      movesData = PokeNavData.getMoves();
    }
  }

  // learnableMoves entries are { name, method, level? } objects.
  function learnableNames(dex) {
    const moves = dex?.learnableMoves;
    if (!moves) return [];
    return moves.map(m => typeof m === 'string' ? m : m.name);
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

  // ── Picker (reuses shared overlay) ─────────────
  function openOpponentPicker(slotIdx) {
    PokeNavPicker.openPokemonPicker({
      title: `Add Opponent (slot ${slotIdx + 1})`,
      items: pokemonData,
      withLevel: true,
      onPick: (poke, lvl) => {
        if (opponents.length >= MAX_OPPONENTS) return;
        opponents.push({ ...poke, level: lvl });
        renderOpponents();
        renderAnalysis();
        updateOpponentCount();
      },
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

  // ── Init ─────────────────────────────────────────
  async function init() {
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
  }

  return { init };
})();
