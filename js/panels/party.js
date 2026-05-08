/* PokeNav — Trainer's PC: party + storage, drag/drop, IV/EV/move editor */

const PartyStorage = (() => {

  // ── Constants ──────────────────────────────────────
  const PARTY_SIZE = 6;
  const LS_KEY = 'pokenav_party_storage';

  // ── State ──────────────────────────────────────────
  let state = { party: Array(PARTY_SIZE).fill(null), storage: [] };
  let draggedPoke = null;
  let dragSource = null; // { type: 'party'|'storage', index }
  let allMoves = [];
  let allPokemon = [];

  // PC tab filter state
  let pcSearchQuery = '';
  let pcSelectedTypes = new Set();

  // PC sub-mode: 'party' (party + storage) or 'wanted' (Most Wanted list)
  let pcMode = 'party';

  // Wanted view filter/sort state
  let wantedQuery = '';
  let wantedSort = 'id';

  // ── localStorage ───────────────────────────────────
  function save() {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
    if (typeof updateTabBadges === 'function') updateTabBadges();
  }

  function load() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        state.party = parsed.party || Array(PARTY_SIZE).fill(null);
        state.storage = parsed.storage || [];
      }
    } catch(e) { console.warn('PokeNav: could not load party/storage', e); }
  }

  // ── Unique ID ──────────────────────────────────────
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  // ── Create a new Pokémon object ────────────────────
  function createPoke(dexEntry) {
    return {
      uid: uid(),
      dexId: dexEntry.id,
      name: dexEntry.name,
      types: dexEntry.types,
      nickname: '',
      level: (typeof dexEntry.level === 'number' && dexEntry.level >= 1 && dexEntry.level <= 100) ? dexEntry.level : 50,
      nature: 'Hardy',
      ivs: { hp:31, atk:31, def:31, spa:31, spd:31, spe:31 },
      evs: { hp:0,  atk:0,  def:0,  spa:0,  spd:0,  spe:0  },
      moves: []
    };
  }

  // ── Render a tile ──────────────────────────────────
  function makeTile(poke, sourceType) {
    const div = document.createElement('div');
    div.className = 'poke-tile';
    div.draggable = true;
    div.dataset.uid = poke.uid;
    const lvlText = (typeof poke.level === 'number' && poke.level >= 1) ? `LVL ${poke.level}` : 'LVL —';
    const depositBtn = sourceType === 'party'
      ? `<button class="tile-deposit-btn" title="Deposit to PC">→</button>`
      : '';
    div.innerHTML = `
      ${depositBtn}
      <img class="tile-sprite" src="${spriteUrl(poke.dexId)}"
           onerror="${spriteFallbackOnError(poke.dexId)}"
           alt="${poke.name}">
      <div class="tile-number-row">
        <span class="tile-number">#${String(poke.dexId).padStart(4,'0')}</span>
        <span class="tile-number-sep">•</span>
        <span class="tile-level">${lvlText}</span>
      </div>
      <div class="tile-name">${poke.nickname || poke.name}</div>
      <div class="tile-types" style="display:flex;flex-direction:row;gap:6px;justify-content:center;margin-top:6px;">${poke.types.map(t => typeIconHTML(t)).join('')}</div>
    `;
    return div;
  }

  // ── Quick deposit (party → storage) ────────────────
  // PC storage is unbounded, so this always succeeds when a party
  // slot has a Pokémon.
  function depositToStorage(partyIndex) {
    const poke = state.party[partyIndex];
    if (!poke) return;
    state.storage.push(poke);
    state.party[partyIndex] = null;
    save();
    renderPC();
  }

  function bindDepositButton(tile, partyIndex) {
    const btn = tile.querySelector('.tile-deposit-btn');
    if (!btn) return;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      depositToStorage(partyIndex);
    });
  }

  // ── Filter logic (search + type set, AND logic) ────
  function pokeMatchesFilter(poke) {
    if (!poke) return false;
    if (pcSearchQuery) {
      const q = pcSearchQuery;
      const hits =
        (poke.nickname || '').toLowerCase().includes(q) ||
        poke.name.toLowerCase().includes(q) ||
        String(poke.dexId).includes(q) ||
        String(poke.dexId).padStart(4, '0').includes(q);
      if (!hits) return false;
    }
    if (pcSelectedTypes.size > 0) {
      const pTypes = poke.types.map(t => String(t).toLowerCase());
      for (const t of pcSelectedTypes) {
        if (!pTypes.includes(t)) return false;
      }
    }
    return true;
  }

  function isFilterActive() {
    return pcSearchQuery !== '' || pcSelectedTypes.size > 0;
  }

  // ── Render PC tab (party + storage grids together) ─
  function renderPC() {
    renderParty();
    renderStorage();
    if (typeof renderPokedexTiles === 'function') renderPokedexTiles();
  }

  // ── Render party grid (2-column) ───────────────────
  function renderParty() {
    const container = document.getElementById('party-grid');
    if (!container) return;
    container.innerHTML = '';
    const filterOn = isFilterActive();

    for (let i = 0; i < PARTY_SIZE; i++) {
      const poke = state.party[i];
      if (poke) {
        if (filterOn && !pokeMatchesFilter(poke)) continue;
        const tile = makeTile(poke, 'party');
        bindTileEvents(tile, 'party', i);
        bindSlotDrop(tile, 'party', i);
        bindDepositButton(tile, i);
        container.appendChild(tile);
      } else if (!filterOn) {
        const slot = document.createElement('div');
        slot.className = 'party-slot empty';
        slot.dataset.index = i;
        slot.innerHTML = '<button class="slot-fill-btn">+</button>';
        slot.querySelector('.slot-fill-btn').addEventListener('click', (e) => {
          e.stopPropagation();
          openStoragePicker(i);
        });
        bindSlotDrop(slot, 'party', i);
        container.appendChild(slot);
      }
    }
  }

  // ── Render storage grid ────────────────────────────
  function renderStorage() {
    const container = document.getElementById('storage-grid');
    if (!container) return;
    container.innerHTML = '';
    const list = state.storage.filter(pokeMatchesFilter);
    list.forEach((poke) => {
      const idx = state.storage.indexOf(poke);
      const tile = makeTile(poke, 'storage');
      bindTileEvents(tile, 'storage', idx);
      tile.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        tile.classList.add('drag-over');
      });
      tile.addEventListener('dragleave', () => {
        tile.classList.remove('drag-over');
      });
      tile.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        tile.classList.remove('drag-over');
        if (!draggedPoke || !dragSource) return;
        const targetStorageIndex = state.storage.indexOf(
          state.storage.find(p => p.uid === tile.dataset.uid)
        );
        if (targetStorageIndex === -1) return;
        movePoke(dragSource, { type: 'storage', index: targetStorageIndex });
      });
      container.appendChild(tile);
    });
  }

  // ── Drag events on tiles ───────────────────────────
  function bindTileEvents(tile, sourceType, index) {
    tile.addEventListener('dragstart', (e) => {
      const poke = sourceType === 'party' ? state.party[index] : state.storage[index];
      draggedPoke = poke;
      dragSource = { type: sourceType, index };
      tile.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    tile.addEventListener('dragend', () => {
      tile.classList.remove('dragging');
      draggedPoke = null;
      dragSource = null;
    });
    tile.addEventListener('click', (e) => {
      if (!e.defaultPrevented) openCard(sourceType === 'party' ? state.party[index] : state.storage[index], tile, sourceType);
    });
  }

  // ── Drop events on slots / storage grid ───────────
  function bindSlotDrop(el, targetType, targetIndex) {
    el.addEventListener('dragover', (e) => {
      e.preventDefault();
      el.classList.add('drag-over');
    });
    el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      el.classList.remove('drag-over');
      if (!draggedPoke || !dragSource) return;
      movePoke(dragSource, { type: targetType, index: targetIndex });
    });
  }

  // ── Move a Pokémon between party/storage ───────────
  function movePoke(from, to) {
    let poke;
    if (from.type === 'party') {
      poke = state.party[from.index];
      state.party[from.index] = null;
    } else {
      poke = state.storage.splice(from.index, 1)[0];
    }
    if (to.type === 'party') {
      const displaced = state.party[to.index];
      state.party[to.index] = poke;
      if (displaced) {
        if (from.type === 'party') {
          state.party[from.index] = displaced;
        } else {
          state.storage.push(displaced);
        }
      }
    } else {
      if (typeof to.index === 'number' && to.index < state.storage.length) {
        // dropping onto a specific storage tile — swap
        const displaced = state.storage[to.index];
        state.storage[to.index] = poke;
        if (displaced && from.type === 'party') {
          state.party[from.index] = displaced;
        } else if (displaced) {
          state.storage.push(displaced);
        }
      } else {
        state.storage.push(poke);
      }
    }
    save();
    renderPC();
  }

  // ── Storage grid drop zone ─────────────────────────
  function bindStorageGridDrop() {
    const grid = document.getElementById('storage-grid');
    if (!grid) return;
    grid.addEventListener('dragenter', (e) => { e.preventDefault(); });
    grid.addEventListener('dragover', (e) => { e.preventDefault(); });
    grid.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!draggedPoke || !dragSource) return;
      const src = dragSource;
      if (src.type === 'party') {
        movePoke(src, { type: 'storage', index: state.storage.length });
      }
      draggedPoke = null;
      dragSource = null;
    });
  }

  // ── NATURES list ───────────────────────────────────
  const NATURES = [
    'Hardy','Lonely','Brave','Adamant','Naughty',
    'Bold','Docile','Relaxed','Impish','Lax',
    'Timid','Hasty','Serious','Jolly','Naive',
    'Modest','Mild','Quiet','Bashful','Rash',
    'Calm','Gentle','Sassy','Careful','Quirky'
  ];

  // ── Open Pokédex card ──────────────────────────────
  function openCard(poke, originTile, sourceType) {
    if (!poke) return;
    const overlay = document.getElementById('pokedex-card-overlay');
    const card    = document.getElementById('pokedex-card');
    if (!overlay || !card) return;

    // Set transform-origin to tile position for zoom effect
    if (originTile) {
      const r = originTile.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top  + r.height / 2;
      card.style.transformOrigin = `${cx}px ${cy}px`;
    } else {
      card.style.transformOrigin = 'center center';
    }

    card.innerHTML = buildCardHTML(poke, sourceType);
    overlay.classList.remove('hidden');

    // Restart animation
    card.classList.remove('pop-in');
    card.offsetHeight;
    card.classList.add('pop-in');

    bindCardEvents(poke, sourceType);
  }

  // ── Move slots HTML (the 4-slot ribbon inside the card) ──
  function moveSlotsHTML(poke) {
    return [0,1,2,3].map(i => `
      <div class="move-slot" data-slot="${i}">
        ${poke.moves[i]
          ? `<span class="move-name">${poke.moves[i]}</span><button class="move-clear" data-slot="${i}">✕</button>`
          : `<span class="move-empty">— empty —</span>`}
      </div>`).join('');
  }

  // Re-render the move-slot ribbon and rebind ONLY its move-clear
  // buttons. Keeps card-level listeners (close, fields, IVs, picker)
  // attached to their original elements so we don't accumulate them.
  function rerenderMoveSlots(poke) {
    const root = document.getElementById('card-move-slots');
    if (!root) return;
    root.innerHTML = moveSlotsHTML(poke);
    root.querySelectorAll('.move-clear').forEach(btn => {
      btn.addEventListener('click', () => {
        const slot = Number(btn.dataset.slot);
        poke.moves[slot] = undefined;
        poke.moves = poke.moves.filter(Boolean);
        save();
        rerenderMoveSlots(poke);
        // Clear the picker's "selected" highlight on whatever was removed
        document.querySelectorAll('#move-list .move-item').forEach(el => {
          el.classList.toggle('selected', poke.moves.includes(el.dataset.move));
        });
      });
    });
  }

  // ── Build card inner HTML ──────────────────────────
  function buildCardHTML(poke, sourceType) {
    const statKeys = ['hp','atk','def','spa','spd','spe'];
    const statLabels = { hp:'HP', atk:'Atk', def:'Def', spa:'Sp.A', spd:'Sp.D', spe:'Spe' };

    const ivRows = statKeys.map(s => `
      <div class="stat-row">
        <label>${statLabels[s]}</label>
        <input type="number" class="stat-input" data-stat="${s}" data-kind="iv"
               min="0" max="31" value="${poke.ivs[s]}">
        <span class="stat-divider">/</span>
        <input type="number" class="stat-input" data-stat="${s}" data-kind="ev"
               min="0" max="252" value="${poke.evs[s]}">
      </div>`).join('');

    const moveSlots = moveSlotsHTML(poke);

    return `
      <button class="card-close-btn" id="card-close-btn">✕</button>
      <div class="card-header">
        <img class="card-sprite" src="${spriteUrl(poke.dexId)}"
             onerror="${spriteFallbackOnError(poke.dexId)}"
             alt="${poke.name}">
        <div class="card-identity">
          <div class="card-number">#${String(poke.dexId).padStart(4,'0')}</div>
          <input class="card-nickname" type="text" placeholder="${poke.name}"
                 value="${poke.nickname}" data-field="nickname" maxlength="12">
          <div class="card-species">${poke.name}</div>
          <div class="tile-types" style="display:flex;flex-direction:row;gap:6px;justify-content:center;margin-top:6px;">${poke.types.map(t => typeIconHTML(t)).join('')}</div>
        </div>
      </div>
      <div class="card-section">
        <div class="card-row">
          <label>Level</label>
          <input type="number" class="card-field-input" data-field="level"
                 min="1" max="100" value="${poke.level}">
          <label>Nature</label>
          <select class="card-field-input" data-field="nature">
            ${NATURES.map(n => `<option ${n===poke.nature?'selected':''}>${n}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="card-section">
        <div class="stat-header">
          <span>Stat</span><span>IV (0–31)</span><span>EV (0–252)</span>
        </div>
        ${ivRows}
      </div>
      <div class="card-section">
        <div class="section-label">Moveset</div>
        <div class="move-slots" id="card-move-slots">${moveSlots}</div>
      </div>
      <div class="card-section">
        <div class="section-label">Move Picker</div>
        <input type="text" id="move-search" placeholder="Search moves..." class="move-search-input">
        <div class="move-list" id="move-list"></div>
      </div>
      ${sourceType === 'storage' ? `<button class="release-btn">RELEASE</button>` : ''}
    `;
  }

  // ── Bind card interactivity ────────────────────────
  function bindCardEvents(poke, sourceType) {
    const overlay = document.getElementById('pokedex-card-overlay');

    // Close — assign (don't addEventListener) so handlers don't
    // accumulate across modal opens.
    const closeBtn = document.getElementById('card-close-btn');
    if (closeBtn) closeBtn.onclick = () => overlay.classList.add('hidden');
    overlay.onclick = (e) => {
      if (e.target === overlay) overlay.classList.add('hidden');
    };

    // Release (storage only — button not present otherwise)
    const releaseBtn = document.querySelector('.release-btn');
    if (releaseBtn) {
      releaseBtn.addEventListener('click', () => {
        if (!releaseBtn.classList.contains('release-btn--confirm')) {
          releaseBtn.classList.add('release-btn--confirm');
          releaseBtn.textContent = 'CONFIRM RELEASE';
          return;
        }
        const idx = state.storage.findIndex(p => p && p.uid === poke.uid);
        if (idx !== -1) state.storage.splice(idx, 1);
        save();
        renderPC();
        if (typeof renderPokedexTiles === 'function') renderPokedexTiles();
        overlay.classList.add('hidden');
      });
      releaseBtn.addEventListener('mouseleave', () => {
        releaseBtn.classList.remove('release-btn--confirm');
        releaseBtn.textContent = 'RELEASE';
      });
    }

    // Nickname / level / nature
    document.querySelectorAll('[data-field]').forEach(el => {
      el.addEventListener('change', () => {
        const field = el.dataset.field;
        poke[field] = el.type === 'number' ? Number(el.value) : el.value;
        save();
        renderPC();
      });
    });

    // IVs / EVs
    document.querySelectorAll('.stat-input').forEach(el => {
      el.addEventListener('change', () => {
        const kind = el.dataset.kind;
        const stat = el.dataset.stat;
        poke[kind][stat] = Math.min(Number(el.value), kind === 'iv' ? 31 : 252);
        el.value = poke[kind][stat];
        save();
      });
    });

    // Clear move — handlers attached by rerenderMoveSlots so they
    // don't pile up via repeated bindCardEvents calls.
    rerenderMoveSlots(poke);

    // Move picker
    renderMoveList(poke, '', sourceType);
    document.getElementById('move-search')?.addEventListener('input', (e) => {
      renderMoveList(poke, e.target.value, sourceType);
    });
  }

  // ── Method ordering for picker sort ────────────────
  const METHOD_ORDER = { level: 0, evolution: 1, tm: 2, hm: 3, tutor: 4, egg: 5, special: 6, legacy: 7 };
  const METHOD_LABEL = { level: 'Lv', evolution: 'Evo', tm: 'TM', hm: 'HM', tutor: 'Tutor', egg: 'Egg', special: 'Special', legacy: 'Legacy' };

  function methodBadge(entry) {
    if (entry.method === 'level') return `<span class="move-item-method">Lv ${entry.level}</span>`;
    return `<span class="move-item-method move-item-method--${entry.method}">${METHOD_LABEL[entry.method] || entry.method}</span>`;
  }

  // ── Render move picker list ────────────────────────
  // Shows only the moves this Pokémon can learn, labeled with the
  // learn method (Lv N / TM / Egg / Tutor / …) and sorted by level
  // ascending, with non-level methods grouped after.
  function renderMoveList(poke, filter, sourceType) {
    const list = document.getElementById('move-list');
    if (!list) return;
    const dex = PokeNavData.getPokemonById(poke.dexId);
    const learnable = dex?.learnableMoves || [];
    const f = filter.toLowerCase();

    // Build a render row per learnable entry (a move can appear once
    // per method, e.g. learned by level AND available as a TM).
    const rows = learnable
      .map(entry => ({
        ...entry,
        move: PokeNavData.getMoveByName(entry.name),
      }))
      .filter(r => r.move)
      .filter(r => !f || r.name.toLowerCase().includes(f))
      .sort((a, b) => {
        const ao = METHOD_ORDER[a.method] ?? 99;
        const bo = METHOD_ORDER[b.method] ?? 99;
        if (ao !== bo) return ao - bo;
        if (a.method === 'level') return (a.level || 0) - (b.level || 0);
        return a.name.localeCompare(b.name);
      });

    if (!rows.length) {
      list.innerHTML = `<div style="color:#666;padding:12px;text-align:center;">No learnable moves${dex ? '' : ' (data not loaded)'}.</div>`;
      return;
    }

    list.innerHTML = rows.map(r => `
      <div class="move-item ${poke.moves.includes(r.name) ? 'selected' : ''}"
           data-move="${r.name}">
        ${typeIconHTML(r.move.type)}
        <span class="move-item-name">${r.name}</span>
        ${methodBadge(r)}
        ${r.move.power ? `<span class="move-item-power">${r.move.power}</span>` : ''}
      </div>
    `).join('');

    list.querySelectorAll('.move-item').forEach(el => {
      el.addEventListener('click', () => {
        const moveName = el.dataset.move;
        if (poke.moves.includes(moveName)) return;
        if (poke.moves.length >= 4) return;
        poke.moves.push(moveName);
        save();
        rerenderMoveSlots(poke);
        el.classList.add('selected');
      });
    });
  }

  // ── Add Pokémon from Pokédex panel ─────────────────
  function addToStorage(dexEntry) {
    const poke = createPoke(dexEntry);
    state.storage.push(poke);
    save();
    renderPC();
  }

  async function openAddPicker() {
    if (!allPokemon.length) {
      await PokeNavData.load();
      allPokemon = PokeNavData.getPokemon();
    }
    PokeNavPicker.openPokemonPicker({
      title: 'Add Pokémon to Storage',
      items: allPokemon,
      withLevel: true,
      multiAdd: true,
      onPick: (poke, lvl) => {
        addToStorage({ ...poke, level: lvl });
      },
    });
  }

  // ── Storage picker (used to fill empty party slots) ─
  function openStoragePicker(slotIndex) {
    PokeNavPicker.openPokemonPicker({
      title: 'Pick from PC Storage',
      items: state.storage.filter(Boolean),
      withLevel: false,
      onPick: (picked) => {
        const idx = state.storage.findIndex(p => p && p.uid === picked.uid);
        if (idx === -1) return;
        const poke = state.storage.splice(idx, 1)[0];
        const displaced = state.party[slotIndex];
        state.party[slotIndex] = poke;
        if (displaced) state.storage.push(displaced);
        save();
        renderPC();
      },
    });
  }

  // ── Owned dex IDs (for Pokédex tile indicator) ─────
  function getOwnedDexIds() {
    const ids = new Set();
    state.party.forEach(p => { if (p) ids.add(p.dexId); });
    state.storage.forEach(p => { if (p) ids.add(p.dexId); });
    return ids;
  }

  // ── Wanted view (sub-mode) ─────────────────────────
  const RARITY_ORDER = { 'common': 0, 'uncommon': 1, 'rare': 2, 'ultra-rare': 3, 'unknown': 4 };
  const prettyBiome = b => (typeof PokeNavBiomes !== 'undefined') ? PokeNavBiomes.prettyBiome(b) : b;

  function setMode(m) {
    pcMode = m;
    document.querySelectorAll('.pc-mode-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.mode === m);
    });
    document.getElementById('pc-party-view')?.classList.toggle('hidden', m !== 'party');
    document.getElementById('pc-wanted-view')?.classList.toggle('hidden', m !== 'wanted');
    if (m === 'wanted') renderWantedView();
  }

  function renderWantedView() {
    const root = document.getElementById('pc-wanted-grid');
    if (!root) return;

    const wanted = WantedList.getAll();
    if (!wanted.size) {
      root.innerHTML = `<div class="biome-empty">
        Your Most Wanted list is empty. Open a Pokémon's detail card and click "+ Wanted" to track it.
      </div>`;
      return;
    }

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
      const biomeSet = new Set();
      for (const s of (p.spawns || [])) for (const b of (s.biomes || [])) biomeSet.add(b);
      const biomes = (typeof PokeNavBiomes !== 'undefined')
        ? PokeNavBiomes.sortBiomes([...biomeSet])
        : [...biomeSet];
      const bestBucket = (p.spawns || [])
        .map(s => s.bucket)
        .filter(Boolean)
        .sort((a, b) => (RARITY_ORDER[a] ?? 9) - (RARITY_ORDER[b] ?? 9))[0] || 'unknown';

      return `
        <div class="pc-wanted-tile" data-id="${p.id}">
          <button class="pc-wanted-remove" data-id="${p.id}" type="button" title="Remove from list">✕</button>
          <div class="wanted-poster-stamp">★ WANTED ★</div>
          <img class="pc-wanted-sprite" src="${p.sprite}" alt="${p.name}"
               onerror="this.style.opacity='0.3'">
          <div class="pc-wanted-num">#${String(p.id).padStart(4,'0')}</div>
          <div class="pc-wanted-name">${p.name}</div>
          <div class="pc-wanted-types">${p.types.map(t => typeIconHTMLCompact(t)).join('')}</div>
          <div class="pc-wanted-rarity rarity-${bestBucket}">${bestBucket.toUpperCase()}</div>
          <div class="pc-wanted-biomes">
            ${biomes.length
              ? biomes.slice(0, 8).map(b => {
                  const color = (typeof PokeNavBiomes !== 'undefined') ? PokeNavBiomes.getGroupColor(b) : '#888';
                  const group = (typeof PokeNavBiomes !== 'undefined') ? PokeNavBiomes.getGroup(b) : '';
                  return `<span class="pc-wanted-biome" data-biome="${b}" data-group="${group}" role="button" tabindex="0" style="border-left-color:${color}">${prettyBiome(b)}</span>`;
                }).join('')
              : '<span class="pc-wanted-biome pc-wanted-biome--none">No spawn data</span>'}
            ${biomes.length > 8 ? `<span class="pc-wanted-more">+${biomes.length - 8} more</span>` : ''}
          </div>
        </div>
      `;
    }).join('');

    root.querySelectorAll('.pc-wanted-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        WantedList.toggleWanted(Number(btn.dataset.id));
      });
    });
    root.querySelectorAll('.pc-wanted-biome[data-biome]').forEach(chip => {
      chip.addEventListener('click', (e) => {
        e.stopPropagation();
        if (typeof goToBiome === 'function') goToBiome(chip.dataset.biome);
      });
    });
    root.querySelectorAll('.pc-wanted-tile').forEach(tile => {
      tile.addEventListener('click', (e) => {
        if (e.target.closest('.pc-wanted-remove')) return;
        if (e.target.closest('.pc-wanted-biome[data-biome]')) return;
        const id = Number(tile.dataset.id);
        if (typeof selectPokemon === 'function') selectPokemon(id);
      });
    });
  }

  function wireWantedView() {
    document.querySelectorAll('.pc-mode-btn').forEach(btn => {
      btn.addEventListener('click', () => setMode(btn.dataset.mode));
    });
    document.getElementById('pc-wanted-search')?.addEventListener('input', e => {
      wantedQuery = e.target.value.trim().toLowerCase();
      renderWantedView();
    });
    document.getElementById('pc-wanted-sort')?.addEventListener('change', e => {
      wantedSort = e.target.value;
      renderWantedView();
    });
  }

  // ── Init ───────────────────────────────────────────
  async function init() {
    load();

    try {
      await PokeNavData.load();
      allMoves = PokeNavData.getMoves();
      allPokemon = PokeNavData.getPokemon();
    } catch(e) { console.warn('PokeNav: data load failed', e); }

    renderPC();
    bindStorageGridDrop();
    wireWantedView();
    WantedList.onChanged(() => {
      if (pcMode === 'wanted') renderWantedView();
    });

    // Search input
    document.getElementById('pc-search')?.addEventListener('input', (e) => {
      pcSearchQuery = e.target.value.trim().toLowerCase();
      renderPC();
    });

    // Element panel toggle
    document.getElementById('pc-element-btn')?.addEventListener('click', () => {
      const panel = document.getElementById('pc-element-panel');
      const btn   = document.getElementById('pc-element-btn');
      panel?.classList.toggle('hidden');
      btn?.classList.toggle('active');
    });

    // Element items — render PNG icons + bind toggles
    document.querySelectorAll('#pc-element-panel .element-item').forEach(item => {
      const type = item.dataset.type;
      if (type) item.innerHTML = typeIconHTML(type);
      item.addEventListener('click', () => {
        if (!type) return;
        if (pcSelectedTypes.has(type)) {
          pcSelectedTypes.delete(type);
          item.classList.remove('active');
        } else {
          pcSelectedTypes.add(type);
          item.classList.add('active');
        }
        updatePcFilterCount();
        renderPC();
      });
    });

    document.getElementById('pc-clear-types')?.addEventListener('click', () => {
      pcSelectedTypes.clear();
      document.querySelectorAll('#pc-element-panel .element-item.active').forEach(el => el.classList.remove('active'));
      updatePcFilterCount();
      renderPC();
    });

    updatePcFilterCount();

    document.getElementById('add-poke-btn')?.addEventListener('click', () => {
      openAddPicker();
    });

    // "Add to Storage" button hook — fires when Pokédex panel sends a pokemon over
    window.pokeNavAddToStorage = addToStorage;
  }

  function updatePcFilterCount() {
    const el = document.getElementById('pc-filter-count');
    if (el) el.textContent = `${pcSelectedTypes.size} active`;
  }

  // Bootstrap: load saved state immediately so owned indicators
  // render correctly on Pokédex even before the Party tab is opened.
  load();

  return {
    init,
    getOwnedDexIds,
    getAllOwned: () => [
      ...state.party.filter(Boolean).map(p => ({ ...p, source: 'party' })),
      ...state.storage.map(p => ({ ...p, source: 'storage' })),
    ],
  };
})();
