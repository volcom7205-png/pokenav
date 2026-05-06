/* PokeNav — shared Pokémon-picker overlay.
   Reused by:
   - Trainer's PC: "+ Add Pokémon" (full dex, level input, multi-add)
   - Trainer's PC: "Pick from Storage" for empty party slot (PC storage, row click)
   - Stadium: "Add Opponent" (full dex, level input, single-add)

   Renders against #pokedex-card-overlay / #pokedex-card so the open/close
   animation + backdrop dismissal are inherited from the existing modal. */

const PokeNavPicker = (() => {
  function openPokemonPicker({ title, items, withLevel = false, multiAdd = false, onPick }) {
    const overlay = document.getElementById('pokedex-card-overlay');
    const card    = document.getElementById('pokedex-card');
    if (!overlay || !card) return;

    card.style.transformOrigin = 'center center';
    card.innerHTML = `
      <button class="card-close-btn" id="card-close-btn">✕</button>
      <div class="section-label" style="margin-bottom:12px;">${title}</div>
      <input type="text" id="pokenav-picker-search" placeholder="Search by name or #..."
             class="move-search-input" style="margin-bottom:10px;">
      <div class="move-list" id="pokenav-picker-list" style="max-height:360px;"></div>
    `;

    overlay.classList.remove('hidden');
    card.classList.remove('pop-in');
    card.offsetHeight;
    card.classList.add('pop-in');

    const close = () => overlay.classList.add('hidden');
    document.getElementById('card-close-btn').onclick = close;
    overlay.onclick = (e) => { if (e.target === overlay) close(); };

    const list = document.getElementById('pokenav-picker-list');
    const search = document.getElementById('pokenav-picker-search');

    const render = (filter = '') => {
      const f = filter.trim().toLowerCase();
      const filtered = items.filter(p =>
        !f ||
        p.name.toLowerCase().includes(f) ||
        (p.nickname || '').toLowerCase().includes(f) ||
        String(p.id ?? p.dexId ?? '').includes(f)
      ).slice(0, 80);

      if (!filtered.length) {
        list.innerHTML = '<div style="color:#555;padding:8px;">No matches.</div>';
        return;
      }

      list.innerHTML = filtered.map(p => {
        const dexId = p.id ?? p.dexId;
        const lvlSuffix = (!withLevel && typeof p.level === 'number')
          ? `<span style="color:#666;font-size:0.7rem;margin-left:4px;">LVL ${p.level}</span>`
          : '';
        const ctrls = withLevel
          ? `<input type="number" class="picker-level-input" data-key="${p.uid || dexId}"
                    min="1" max="100" value="${p.level ?? 50}" placeholder="Lv">
             <button class="picker-add-btn" data-key="${p.uid || dexId}">＋</button>`
          : '';
        return `
          <div class="move-item picker-row" data-key="${p.uid || dexId}">
            <div style="display:flex;align-items:center;gap:8px;flex:1;">
              <img src="${spriteUrl(dexId)}"
                   onerror="${spriteFallbackOnError(dexId)}"
                   style="width:32px;height:32px;image-rendering:pixelated;" alt="${p.name}">
              <span class="move-item-name">#${String(dexId).padStart(4,'0')} ${p.nickname || p.name}${lvlSuffix}</span>
            </div>
            <div style="display:flex;align-items:center;gap:6px;">
              ${(p.types || []).map(t => typeIconHTML(t)).join('')}
              ${ctrls}
            </div>
          </div>
        `;
      }).join('');

      list.querySelectorAll('.picker-level-input').forEach(input => {
        input.addEventListener('click', (e) => e.stopPropagation());
      });

      const handlePick = (key, lvl) => {
        const picked = items.find(p => String(p.uid || p.id || p.dexId) === String(key));
        if (!picked) return;
        const result = onPick(picked, lvl);
        if (result === false || !multiAdd) {
          close();
        } else {
          // multi-add: flash the row red, clear search
          const row = list.querySelector(`.picker-row[data-key="${key}"]`);
          if (row) {
            row.style.background = 'rgba(230,57,70,0.2)';
            setTimeout(() => { row.style.background = ''; }, 400);
          }
          if (search) { search.value = ''; render(''); }
        }
      };

      if (withLevel) {
        list.querySelectorAll('.picker-add-btn').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const key = btn.dataset.key;
            const input = list.querySelector(`.picker-level-input[data-key="${key}"]`);
            const lvl = Math.max(1, Math.min(100, Number(input?.value) || 50));
            handlePick(key, lvl);
          });
        });
      } else {
        list.querySelectorAll('.picker-row').forEach(row => {
          row.addEventListener('click', () => handlePick(row.dataset.key));
        });
      }
    };

    render('');
    search?.addEventListener('input', (e) => render(e.target.value));
  }

  return { openPokemonPicker };
})();
