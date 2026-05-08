# PokeNav

A static, no-build single-page Pokédex/Cobblemon helper. Pure HTML + plain JS + CSS. Open `index.html` and it runs.

## Run it

```bash
python3 -m http.server 8765
# http://localhost:8765
```

The trainer name modal shows on first load; localStorage carries trainer / party / storage / wanted-list state across sessions.

## Layout

```
index.html              # Single page; nav + all panel containers
js/
  app.js                # Entry: data load, lazy-init wiring for tabs
  core/                 # Loaded first; no inter-deps
    data.js             # PokeNavData IIFE: load(), getPokemon(), getMoves(), getPokemonById(), getMoveByName()
    types.js            # TYPE_CHART, getMul, multiplyTypes, getDefenseMultipliers, typeIconHTML(Compact)
    utils.js            # formatTime/Weather, escape helpers, spriteUrl/spriteFallbackOnError
    biomes.js           # PokeNavBiomes: dimension/group order, color, sortBiomes, mod-pack state
    wanted.js           # WantedList: isWanted, toggleWanted, getAll, onChanged subscribers
    element-filter.js   # ElementFilter.wire({panelId,btnId,clearId,countId,selected,onChange})
    picker.js           # PokeNavPicker.openPokemonPicker — shared Pokémon picker modal
    nav.js              # switchPanel + back stack + ESC + tab badges + gear button
    trainer.js          # Trainer name + first-run modal
  panels/               # One file per tab; each is self-contained
    pokedex.js          # Tile grid + detail modal (the centre-of-gravity card)
    party.js            # Trainer's PC: 🎒 Party+Storage / ★ Most Wanted sub-modes
    typechart.js        # Type Chart Quick Lookup
    stadium.js          # Battle Planning
    biome.js            # Biome Search (single mode: picker → results)
    academy.js          # 🎓 Academy: items / TMs / drops / recipes
    settings.js         # Trainer name + mod packs + danger zone (rendered into #panel-settings on demand)
css/
  base.css, theme.css   # Shared
  panels/*.css          # One per panel
data/
  pokemon_gen{1..9}.json  # Roster + types + sprite + learnableMoves (cobbledex) + spawns + drops (xlsx)
  pokemon_gen{1..9}.js    # Build output: window.POKENAV_POKEMON_GEN<n> = [...]
  moves.json / moves.js   # 954 moves; .js is build output (window.POKENAV_MOVES)
  items.json / items.js   # Hand-curated berries / battle items / vitamins
  biome_taxonomy.json/.js # Biome metadata (window.POKENAV_BIOME_TAXONOMY)
  recipes.json / recipes.js # Academy recipes (window.POKENAV_RECIPES)
scripts/
  scrape_cobbledex.py        # Roster scraper (cobbledex.info RSC payloads)
  import_cobblemon_xlsx.py   # Spawns + drops importer (Cobblemon 1.7.3 XLSX → per-gen JSON)
  build_data_js.py           # Wraps each data/*.json as data/*.js for file:// loading
assets/types/*.png      # 18 type icons
```

## Data shape

**Pokémon** — `data/pokemon_gen{N}.json`:
```js
{ id, name, types: ["Grass","Poison"], sprite, learnableMoves: [{name, method, level?}], drops: [{item, chance?|quantity?}], spawns: [{label, bucket, levelRange, time, weather, biomes:[..], context:[..], notes?}], evolutions: [{to: <dexId>, method: 'level_up'|'item_interact'|'trade', item?, requirements?: [str]}] }
```
`method` ∈ `level | tm | hm | egg | tutor | special | legacy | evolution`. `bucket` ∈ `common | uncommon | rare | ultra-rare | unknown`. `time` ∈ `any | day | night | dusk | morning`. `weather` ∈ `any | clear | rain | thunder`. Biomes are lowercase + underscores (`tropical_island`, `nether_basalt`). Evolutions: 413 mons / 432 edges; chain reassembled client-side via reverse-incoming lookup so any node shows the full lineage.

**Moves** — `data/moves.json`: `{name, type, category, power, accuracy, pp}`.

**Items** — `data/items.json`: `[{name, category: 'berry'|'battle'|'vitamin', description}]`. TMs are derived dynamically from `learnableMoves[].method === 'tm'`.

## Conventions worth keeping

- **No bundler, no transpile.** New globals work — every script is in the same scope. Order in `index.html` matters: `core/*` before `panels/*`, `app.js` last.
- **Modal overlay is shared** (`#pokedex-card-overlay` / `#pokedex-card`) — every panel that needs a popover reuses it. Always set handlers via `overlay.onclick = ...` (assignment), not `addEventListener` — listeners pile up across opens otherwise.
- **Lazy-init pattern for new tabs**: register a click listener in `js/app.js` that calls the panel's `init()` once. See `BiomeSearch.init()` / `ItemsGuide.init()` / `PartyStorage.init()` / `Stadium.init()`. Each `init()` should `await PokeNavData.load()` — that promise is cached so it's free to call.
- **Sprite URLs**: always go through `spriteUrl(id, size?)` + `spriteFallbackOnError(id)` from `js/core/utils.js`. Never hardcode `cobbledex.b-cdn.net/...` or the PokeAPI fallback.
- **Mode toggles** (Stadium, Type Chart, Biome Search): row of `*-mode-btn` buttons; click toggles `.active` + `.hidden` on sibling `*-view` divs. Mirror this for any new multi-mode panel.
- **localStorage keys** are namespaced `pokenav_*`: `pokenav_trainer`, `pokenav_party_storage`, `pokenav_wanted_list`. New persisted state should follow.
- **No comments unless the WHY is non-obvious.** Don't restate what well-named code already says.

## Refreshing data

```bash
# Roster (id, name, types, sprite, learnableMoves) — usually only after a Cobblemon update:
python3 scripts/scrape_cobbledex.py

# Spawns + drops — when the user provides a new Cobblemon 1.7.3+ XLSX export:
python3 scripts/import_cobblemon_xlsx.py
# (defaults to /mnt/c/Users/Dickie/Downloads/drive-download-…zip; takes --zip / --spawns / --drops)

# Recipes + cobblemon item icons — re-run after a Cobblemon update; also walks
# pokemon_gen*.json drops and pulls held_items/, evolution/, medicine/ textures:
python3 scripts/scrape_cobblemon_recipes.py

# Vanilla minecraft icons referenced as ingredients or drops:
python3 scripts/fetch_minecraft_icons.py

# After ANY icon-pack change, regenerate data/icons.js (the manifest the
# Academy uses to namespace plain drop names → cobblemon: vs minecraft:):
python3 scripts/build_icon_manifest.py

# After ANY data refresh, regenerate the .js mirrors so file:// still works:
python3 scripts/build_data_js.py
```

The xlsx importer **preserves** existing spawns/drops when the xlsx has no row for a mon — protects hand-curated legendary entries (Mew, etc.).

`update-shay.sh` runs the icon manifest + data .js build automatically and syncs `assets/items/` to Shay's copy before rebuilding the zip.

**Why `data/*.js`?** The app loads data from `window.POKENAV_*` globals (set by the inlined `<script src="data/*.js">` tags in `index.html`), not via `fetch()`. This lets non-technical users (e.g., Shay) double-click `index.html` and have it run — `fetch()` of local JSON is blocked under `file://`. Edit JSON, run `build_data_js.py`, then commit both. `update-shay.sh` runs the build automatically.

## What's working now

- 851 mons across 9 gens; 1,952 drop entries; 2,583 spawn entries; 774 recipes across 10 types; 432 evolution edges.
- Tabs: Pokédex · Trainer's PC · Stadium · Type Chart · 🎓 Academy · Biome Search, plus ⚙ gear (top-right) for Settings.
- **Pokédex card** is the centre of gravity: header + types + spawns + drops + learnable moves (DAMAGE/STATUS/ALL filters, STAB-highlighted) + defensive matchups + evolution chain (clickable mini-tiles, chip-style condition labels).
- **Pokédex grid** has search + element filter + gen chips + collection chips (All/Owned/Wanted/Missing) + sort dropdown (Dex# / Name / Type / Owned-first / Wanted-first).
- **Trainer's PC** has two sub-modes via toggle: 🎒 Party + Storage, ★ Most Wanted. Mode buttons carry live count badges; the PC nav tab shows total owned count.
- Biome Search: single mode (collapsed two-level accordion picker → results), Settings mod-pack toggles, cross-tab biome chips.
- Stadium: single Battle Planning view.
- Type Chart: single Quick Lookup view.
- Academy: unified item / TM / drop / recipe hub. 13 category chips. Shaped, shapeless, smelting (4 cookers), stonecutting, brewing, smithing, cooking-pot recipes; auto-stubs every cobblemon: id referenced by a recipe.
- Shared core helpers: `picker.js` (Pokémon picker), `wanted.js` (Most Wanted state + subscriber API), `element-filter.js` (the 18-icon type filter).
- Global ESC closes any open Pokédex modal / reset confirm.

## Active plan

`~/.claude/plans/pokenav-restructure.md` — 5-phase consolidation, all phases shipped. Punch list of optional follow-ups in [memory/project_punch_list_followups.md](~/.claude/projects/-home-dickie-projects-pokenav/memory/project_punch_list_followups.md).

## Carryover backlog

- **Roster gap**: 178 mons in Cobblemon 1.7.3 but not in our cobbledex-scraped roster (Audino, Arceus, Calyrex, etc.). Filling needs a non-cobbledex fallback for id/types/sprite. Importer logs them to stderr at `import_cobblemon_xlsx.py` runtime.
- **Form variants** ([Galarian]/[Hisuian]/etc.) skipped during xlsx import — base species don't carry form data. ~118 form rows lost.
- **37 mons missing spawns/drops** (legendaries Cobblemon doesn't ship spawn data for). Auto-fix not possible; needs hand-curation.
- **Sacred Ash**: 1 cobblemon item with no texture in either cobblemon or vanilla; renders as text fallback.
