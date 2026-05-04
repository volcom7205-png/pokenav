/* PokeNav — entry point: shared state, data loading, top-level init */

let allPokemon = [];
let selectedPokemon = null;

function loadPokemonData() {
  PokeNavData.load()
    .then(() => {
      allPokemon = PokeNavData.getPokemon();
      buildItemIndex();
      buildPokedexPanel();
      buildItemSearchPanel();
      buildTypeChartPanel();
    })
    .catch(err => {
      console.error('Data load error:', err);
      document.getElementById('panel-pokedex').innerHTML =
        `<h2>📖 Pokédex</h2><p style="color:var(--accent-red)">
        Error loading data: ${err.message}. Make sure data/pokemon_gen*.json files exist.</p>`;
    });
}

document.addEventListener('DOMContentLoaded', () => {
  initTrainer();
  initNav();
  loadPokemonData();

  // Lazy-init Party / Stadium / Biome Search / Items panels when
  // their tabs are first opened.
  let partyInited = false;
  let stadiumInited = false;
  let biomeInited = false;
  let itemsGuideInited = false;
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
      if (item.dataset.panel === 'biome' && !biomeInited) {
        biomeInited = true;
        BiomeSearch.init();
      }
      if (item.dataset.panel === 'itemsguide' && !itemsGuideInited && typeof ItemsGuide !== 'undefined') {
        itemsGuideInited = true;
        ItemsGuide.init();
      }
    });
  });
});
