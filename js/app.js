/* PokeNav — entry point: shared state, data loading, top-level init */

let allPokemon = [];
let selectedPokemon = null;

function loadPokemonData() {
  fetch('data/pokemon_gen1.json')
    .then(res => {
      if (!res.ok) throw new Error('Could not load pokemon_gen1.json');
      return res.json();
    })
    .then(data => {
      allPokemon = data;
      buildItemIndex();
      buildPokedexPanel();
      buildItemSearchPanel();
      buildTypeChartPanel();
    })
    .catch(err => {
      console.error('Data load error:', err);
      document.getElementById('panel-pokedex').innerHTML =
        `<h2>📖 Pokédex</h2><p style="color:var(--accent-red)">
        Error loading data: ${err.message}. Make sure pokemon_gen1.json is in the data/ folder.</p>`;
    });
}

document.addEventListener('DOMContentLoaded', () => {
  initTrainer();
  initNav();
  loadPokemonData();

  // Lazy-init Party + Stadium when their tabs are first opened
  let partyInited = false;
  let stadiumInited = false;
  document.querySelectorAll('.nav-tab[data-panel]').forEach(item => {
    item.addEventListener('click', () => {
      if (item.dataset.panel === 'party' && !partyInited) {
        partyInited = true;
        PartyStorage.init();
      }
      if (item.dataset.panel === 'battle' && !stadiumInited) {
        stadiumInited = true;
        Stadium.init();
      }
    });
  });
});
