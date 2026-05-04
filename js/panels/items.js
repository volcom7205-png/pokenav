/* PokeNav — Poké Drops panel: item search + dropper list */

let selectedItem = null;
let itemIndex = {};   // { "Item Name": [{ pokemon, amount }, ...] }

// Scans every pokemon's drops and builds a reverse lookup:
// { "Miracle Seed": [{ pokemon: {...}, amount: "5%" }, ...] }
function buildItemIndex() {
  itemIndex = {};
  allPokemon.forEach(pokemon => {
    (pokemon.drops || []).forEach(drop => {
      const name = drop.item;
      if (!itemIndex[name]) itemIndex[name] = [];
      // Dedupe: each Pokémon appears at most once per item, even if it has
      // multiple drop entries or spawn profiles for the same item.
      if (itemIndex[name].some(d => d.pokemon.id === pokemon.id)) return;
      const amount = drop.chance || (drop.quantity ? drop.quantity : '1');
      itemIndex[name].push({ pokemon, amount });
    });
  });
}

function buildItemSearchPanel() {
  const panel = document.getElementById('panel-items');
  panel.innerHTML = `
    <h2>🎒 Poké Drops</h2>
    <div class="panel-search">
      <input type="text" id="item-search" placeholder="Search for a drop item..." autocomplete="off" />
    </div>
    <div class="item-search-layout">
      <div class="item-results" id="item-results"></div>
      <div id="item-card">
        <div class="item-card-empty">Select an item to see which Pokémon drop it</div>
      </div>
    </div>
  `;

  renderItemList(Object.keys(itemIndex).sort());

  document.getElementById('item-search').addEventListener('input', e => {
    const q = e.target.value.trim().toLowerCase();
    const filtered = Object.keys(itemIndex)
      .filter(name => name.toLowerCase().includes(q))
      .sort();
    renderItemList(filtered);
  });
}

function renderItemList(items) {
  const container = document.getElementById('item-results');
  if (!items.length) {
    container.innerHTML = '<div class="no-results">No items found</div>';
    return;
  }
  container.innerHTML = items.map(name => {
    const count = itemIndex[name].length;
    return `
      <div class="item-result-item ${selectedItem === name ? 'selected' : ''}"
           data-item="${escapeAttr(name)}" onclick="selectItem('${escapeSingleQuote(name)}')">
        <span class="item-result-name">${name}</span>
        <span class="item-result-count">${count} Pokémon</span>
      </div>
    `;
  }).join('');
}

function selectItem(name) {
  selectedItem = name;

  document.querySelectorAll('.item-result-item').forEach(el => {
    el.classList.toggle('selected', el.dataset.item === name);
  });

  renderItemCard(name);
}

function renderItemCard(name) {
  const droppers = itemIndex[name] || [];
  const container = document.getElementById('item-card');

  const dropperRows = droppers.map(({ pokemon, amount }) => `
    <div class="dropper-item" onclick="goToPokedex(${pokemon.id})">
      <img src="${pokemon.sprite}" alt="${pokemon.name}" onerror="this.style.opacity='0.3'" />
      <div class="dropper-info">
        <div class="dropper-name">${pokemon.name}</div>
        <div class="dropper-num">
          <span class="dropper-num-id">#${String(pokemon.id).padStart(4, '0')}</span>
          <span class="dropper-types">${pokemon.types.map(t => typeIconHTMLCompact(t)).join('')}</span>
        </div>
      </div>
      <span class="dropper-amount">${amount}</span>
      <span class="dropper-arrow">→</span>
    </div>
  `).join('');

  container.innerHTML = `
    <div class="item-card">
      <div class="item-card-title">${name}</div>
      <div class="item-card-subtitle">Dropped by ${droppers.length} Pokémon — click any to view spawn info</div>
      <div class="dropper-list">${dropperRows}</div>
    </div>
  `;
}
