/* PokeNav — shared data loader (Pokémon across all gens + moves) */

const PokeNavData = (() => {
  const GENS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  let allPokemon = null;
  let allMoves = null;
  let movesByName = null;
  let pokemonById = null;
  let loadingPromise = null;

  async function load() {
    if (loadingPromise) return loadingPromise;
    loadingPromise = (async () => {
      allMoves = window.POKENAV_MOVES || [];
      movesByName = new Map(allMoves.map(m => [m.name, m]));
      const gens = GENS.map(g => window[`POKENAV_POKEMON_GEN${g}`] || []);
      allPokemon = gens.flat().sort((a, b) => a.id - b.id);
      pokemonById = new Map(allPokemon.map(p => [p.id, p]));
    })();
    return loadingPromise;
  }

  function getPokemon() { return allPokemon || []; }
  function getMoves() { return allMoves || []; }
  function getPokemonById(id) { return pokemonById?.get(id) || null; }
  function getMoveByName(name) { return movesByName?.get(name) || null; }

  function getGen(dexId) {
    if (dexId <= 151) return 1;
    if (dexId <= 251) return 2;
    if (dexId <= 386) return 3;
    if (dexId <= 493) return 4;
    if (dexId <= 649) return 5;
    if (dexId <= 721) return 6;
    if (dexId <= 809) return 7;
    if (dexId <= 905) return 8;
    return 9;
  }

  return { load, getPokemon, getMoves, getPokemonById, getMoveByName, getGen, GENS };
})();
