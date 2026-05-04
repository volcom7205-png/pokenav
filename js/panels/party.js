/* PokeNav — Trainer's PC: party + storage, drag/drop, IV/EV/move editor */

const PartyStorage = (() => {

  // ── Constants ──────────────────────────────────────
  const PARTY_SIZE = 6;
  const LS_KEY = 'pokenav_party_storage';
  const SPRITE_BASE = 'https://cobbledex.b-cdn.net/3dmons/previews/small/';

  // ── State ──────────────────────────────────────────
  let state = { party: Array(PARTY_SIZE).fill(null), storage: [] };
  let draggedPoke = null;
  let dragSource = null; // { type: 'party'|'storage', index }
  let allMoves = [];
  let allPokemon = [];

  // PC tab filter state
  let pcSearchQuery = '';
  let pcSelectedTypes = new Set();

  // ── localStorage ───────────────────────────────────
  function save() {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
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

  // ── Sprite URL ─────────────────────────────────────
  function spriteUrl(dexId) {
    return `${SPRITE_BASE}${dexId}.webp`;
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
           onerror="this.src='https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${poke.dexId}.png'"
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
  function depositToStorage(partyIndex) {
    const poke = state.party[partyIndex];
    if (!poke) return false;

    let placed = false;
    for (let i = 0; i < state.storage.length; i++) {
      if (state.storage[i] === null) {
        state.storage[i] = poke;
        placed = true;
        break;
      }
    }
    if (!placed) {
      state.storage.push(poke);
      placed = true;
    }
    if (!placed) return false;

    state.party[partyIndex] = null;
    save();
    renderPC();
    return true;
  }

  function showPcFullWarning(tile) {
    const warn = document.createElement('div');
    warn.className = 'tile-deposit-warning';
    warn.textContent = 'PC FULL';
    tile.appendChild(warn);
    setTimeout(() => warn.remove(), 2000);
  }

  function bindDepositButton(tile, partyIndex) {
    const btn = tile.querySelector('.tile-deposit-btn');
    if (!btn) return;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const ok = depositToStorage(partyIndex);
      if (!ok) showPcFullWarning(tile);
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

    const moveSlots = [0,1,2,3].map(i => `
      <div class="move-slot" data-slot="${i}">
        ${poke.moves[i]
          ? `<span class="move-name">${poke.moves[i]}</span><button class="move-clear" data-slot="${i}">✕</button>`
          : `<span class="move-empty">— empty —</span>`}
      </div>`).join('');

    return `
      <button class="card-close-btn" id="card-close-btn">✕</button>
      <div class="card-header">
        <img class="card-sprite" src="${spriteUrl(poke.dexId)}"
             onerror="this.src='https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${poke.dexId}.png'"
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

    // Close
    document.getElementById('card-close-btn')?.addEventListener('click', () => {
      overlay.classList.add('hidden');
    });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.classList.add('hidden');
    });

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

    // Clear move
    document.querySelectorAll('.move-clear').forEach(btn => {
      btn.addEventListener('click', () => {
        const slot = Number(btn.dataset.slot);
        poke.moves[slot] = undefined;
        poke.moves = poke.moves.filter(Boolean);
        save();
        document.getElementById('card-move-slots').innerHTML =
          [0,1,2,3].map(i => `
            <div class="move-slot" data-slot="${i}">
              ${poke.moves[i]
                ? `<span class="move-name">${poke.moves[i]}</span><button class="move-clear" data-slot="${i}">✕</button>`
                : `<span class="move-empty">— empty —</span>`}
            </div>`).join('');
        document.querySelectorAll('.move-clear').forEach(b => {
          b.addEventListener('click', () => b.closest('[data-slot]') && b.click());
        });
        bindCardEvents(poke, sourceType);
      });
    });

    // Move picker
    renderMoveList(poke, '', sourceType);
    document.getElementById('move-search')?.addEventListener('input', (e) => {
      renderMoveList(poke, e.target.value, sourceType);
    });
  }

  // ── Render move picker list ────────────────────────
  function renderMoveList(poke, filter, sourceType) {
    const list = document.getElementById('move-list');
    if (!list) return;
    const f = filter.toLowerCase();
    const filtered = allMoves.filter(m => !f || m.name.toLowerCase().includes(f)).slice(0, 80);
    list.innerHTML = filtered.map(m => `
      <div class="move-item ${poke.moves.includes(m.name) ? 'selected' : ''}"
           data-move="${m.name}">
        ${typeIconHTML(m.type)}
        <span class="move-item-name">${m.name}</span>
        ${m.power ? `<span class="move-item-power">${m.power}</span>` : ''}
      </div>
    `).join('');

    list.querySelectorAll('.move-item').forEach(el => {
      el.addEventListener('click', () => {
        const moveName = el.dataset.move;
        if (poke.moves.includes(moveName)) return;
        if (poke.moves.length >= 4) return;
        poke.moves.push(moveName);
        save();
        // refresh move slots
        document.getElementById('card-move-slots').innerHTML =
          [0,1,2,3].map(i => `
            <div class="move-slot" data-slot="${i}">
              ${poke.moves[i]
                ? `<span class="move-name">${poke.moves[i]}</span><button class="move-clear" data-slot="${i}">✕</button>`
                : `<span class="move-empty">— empty —</span>`}
            </div>`).join('');
        el.classList.add('selected');
        bindCardEvents(poke, sourceType);
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
    const overlay = document.getElementById('pokedex-card-overlay');
    const card    = document.getElementById('pokedex-card');
    if (!overlay || !card) return;

    card.style.transformOrigin = 'center center';
    card.innerHTML = `
      <button class="card-close-btn" id="card-close-btn">✕</button>
      <div class="section-label" style="margin-bottom:12px;">Add Pokémon to Storage</div>
      <input type="text" id="picker-search" placeholder="Search by name or #..."
             class="move-search-input" style="margin-bottom:10px;">
      <div class="move-list" id="picker-list" style="max-height:360px;"></div>
    `;

    overlay.classList.remove('hidden');
    card.classList.remove('pop-in');
    card.offsetHeight;
    card.classList.add('pop-in');

    document.getElementById('card-close-btn')?.addEventListener('click', () => {
      overlay.classList.add('hidden');
    });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.classList.add('hidden');
    });

    if (!allPokemon.length) {
      try {
        const res = await fetch('data/pokemon_gen1.json');
        allPokemon = await res.json();
      } catch(e) { console.warn('PokeNav: could not load pokemon_gen1.json', e); }
    }

    renderPickerList('');
    document.getElementById('picker-search')?.addEventListener('input', (e) => {
      renderPickerList(e.target.value);
    });
  }

  function renderPickerList(filter) {
    const list = document.getElementById('picker-list');
    if (!list || !allPokemon.length) {
      if (list) list.innerHTML = '<div style="color:#555;padding:8px;">No Pokémon data loaded.</div>';
      return;
    }
    const f = filter.toLowerCase();
    const filtered = allPokemon.filter(p =>
      !f ||
      p.name.toLowerCase().includes(f) ||
      String(p.id).includes(f)
    ).slice(0, 80);

    list.innerHTML = filtered.map(p => `
      <div class="move-item picker-row" data-id="${p.id}">
        <div style="display:flex;align-items:center;gap:8px;flex:1;">
          <img src="https://cobbledex.b-cdn.net/3dmons/previews/small/${p.id}.webp"
               onerror="this.src='https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${p.id}.png'"
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
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = Number(btn.dataset.id);
        const poke = allPokemon.find(p => p.id === id);
        if (!poke) return;
        const input = list.querySelector(`.picker-level-input[data-id="${id}"]`);
        const lvl = Math.max(1, Math.min(100, Number(input?.value) || 50));
        poke.level = lvl;
        addToStorage(poke);
        const row = btn.closest('.picker-row');
        if (row) {
          row.style.background = 'rgba(230,57,70,0.2)';
          setTimeout(() => { row.style.background = ''; }, 400);
        }
        const search = document.getElementById('picker-search');
        if (search) search.value = '';
        renderPickerList('');
      });
    });
  }

  // ── Storage picker (used to fill empty party slots) ─
  async function openStoragePicker(slotIndex) {
    const overlay = document.getElementById('pokedex-card-overlay');
    const card    = document.getElementById('pokedex-card');
    if (!overlay || !card) return;

    card.style.transformOrigin = 'center center';
    card.innerHTML = `
      <button class="card-close-btn" id="card-close-btn">✕</button>
      <div class="section-label" style="margin-bottom:12px;">Pick from PC Storage</div>
      <input type="text" id="storage-picker-search" placeholder="Search PC storage..."
             class="move-search-input" style="margin-bottom:10px;">
      <div class="move-list" id="storage-picker-list" style="max-height:360px;"></div>
    `;

    overlay.classList.remove('hidden');
    card.classList.remove('pop-in');
    card.offsetHeight;
    card.classList.add('pop-in');

    document.getElementById('card-close-btn')?.addEventListener('click', () => {
      overlay.classList.add('hidden');
    });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.classList.add('hidden');
    });

    renderStoragePickerList(slotIndex, '');
    document.getElementById('storage-picker-search')?.addEventListener('input', (e) => {
      renderStoragePickerList(slotIndex, e.target.value);
    });
  }

  function renderStoragePickerList(slotIndex, filter) {
    const list = document.getElementById('storage-picker-list');
    if (!list) return;
    const f = (filter || '').toLowerCase();
    const filtered = state.storage.filter(p => p && (
      !f ||
      (p.nickname || '').toLowerCase().includes(f) ||
      p.name.toLowerCase().includes(f) ||
      String(p.dexId).includes(f)
    ));

    if (!filtered.length) {
      list.innerHTML = '<div style="color:#555;padding:8px;">No Pokémon in PC storage.</div>';
      return;
    }

    list.innerHTML = filtered.map(p => `
      <div class="move-item picker-row" data-uid="${p.uid}">
        <div style="display:flex;align-items:center;gap:8px;flex:1;">
          <img src="${spriteUrl(p.dexId)}"
               onerror="this.src='https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${p.dexId}.png'"
               style="width:32px;height:32px;image-rendering:pixelated;" alt="${p.name}">
          <span class="move-item-name">#${String(p.dexId).padStart(4,'0')} ${p.nickname || p.name}
            <span style="color:#666;font-size:0.7rem;margin-left:4px;">LVL ${p.level}</span>
          </span>
        </div>
        <div style="display:flex;align-items:center;gap:6px;">
          ${p.types.map(t => typeIconHTML(t)).join('')}
        </div>
      </div>
    `).join('');

    list.querySelectorAll('.picker-row').forEach(row => {
      row.addEventListener('click', () => {
        const uid = row.dataset.uid;
        const idx = state.storage.findIndex(p => p && p.uid === uid);
        if (idx === -1) return;
        const poke = state.storage.splice(idx, 1)[0];
        const displaced = state.party[slotIndex];
        state.party[slotIndex] = poke;
        if (displaced) state.storage.push(displaced);
        save();
        renderPC();
        document.getElementById('pokedex-card-overlay')?.classList.add('hidden');
      });
    });
  }

  // ── Owned dex IDs (for Pokédex tile indicator) ─────
  function getOwnedDexIds() {
    const ids = new Set();
    state.party.forEach(p => { if (p) ids.add(p.dexId); });
    state.storage.forEach(p => { if (p) ids.add(p.dexId); });
    return ids;
  }

  // ── Init ───────────────────────────────────────────
  async function init() {
    load();

    // Load moves data
    try {
      const res = await fetch('data/moves.json');
      allMoves = await res.json();
    } catch(e) { console.warn('PokeNav: could not load moves.json', e); }

    // Load pokemon data
    try {
      const res = await fetch('data/pokemon_gen1.json');
      allPokemon = await res.json();
    } catch(e) { console.warn('PokeNav: could not load pokemon_gen1.json', e); }

    renderPC();
    bindStorageGridDrop();

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
