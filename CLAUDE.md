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
    nav.js              # switchPanel + back stack
    trainer.js          # Trainer name + first-run modal
  panels/               # One file per tab; each is self-contained
    pokedex.js          # Tile grid + detail modal (renderSpawnContent is reused by biome.js)
    party.js            # Trainer's PC: party + storage + drag/drop + IV/EV/move editor
    items.js            # Poké Drops (item → droppers reverse index)
    typechart.js        # Type Chart panel
    stadium.js          # Battle Planning + Best Moveset
    itemsguide.js       # Items / TM tracker (Berries/Battle/Vitamins/TMs)
    biome.js            # Biome Search (Pokémon / Biome / Most Wanted)
    settings.js
css/
  base.css, theme.css   # Shared
  panels/*.css          # One per panel
data/
  pokemon_gen{1..9}.json  # Roster + types + sprite + learnableMoves (cobbledex) + spawns + drops (xlsx)
  moves.json              # 954 moves with type/category/power/accuracy/pp
  items.json              # Hand-curated berries / battle items / vitamins
scripts/
  scrape_cobbledex.py        # Roster scraper (cobbledex.info RSC payloads)
  import_cobblemon_xlsx.py   # Spawns + drops importer (Cobblemon 1.7.3 XLSX → per-gen JSON)
assets/types/*.png      # 18 type icons
```

## Data shape

**Pokémon** — `data/pokemon_gen{N}.json`:
```js
{ id, name, types: ["Grass","Poison"], sprite, learnableMoves: [{name, method, level?}], drops: [{item, chance?|quantity?}], spawns: [{label, bucket, levelRange, time, weather, biomes:[..], context:[..], notes?}] }
```
`method` ∈ `level | tm | hm | egg | tutor | special | legacy | evolution`. `bucket` ∈ `common | uncommon | rare | ultra-rare | unknown`. `time` ∈ `any | day | night | dusk | morning`. `weather` ∈ `any | clear | rain | thunder`. Biomes are lowercase + underscores (`tropical_island`, `nether_basalt`).

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
```

The xlsx importer **preserves** existing spawns/drops when the xlsx has no row for a mon — protects hand-curated legendary entries (Mew, etc.).

## What's working now (Stage 7 + plan-purring-raccoon)

- 851 mons across 9 gens; 1,952 drop entries; 2,583 spawn entries.
- Tabs: Pokédex · Trainer's PC · Poké Drops · Stadium · Type Chart · **Items** (new) · **Biome Search** (new) · Settings.
- Biome Search has 3 modes including a wanted-poster Most Wanted list with sort/filter.
- Items tab covers Berries / Battle / Vitamins (with hover descriptions) / TMs (with learner mons).

## Next up

- **Stage 8 — Evolutions** (deferred). See `~/.claude/projects/-home-dickie-projects-pokenav/memory/project_stage8_evolutions.md`.
- **Roster gap**: 178 mons in Cobblemon 1.7.3 but not in our cobbledex-scraped roster (Audino, Arceus, Calyrex, etc.). Filling needs a non-cobbledex fallback for id/types/sprite. Importer logs them to stderr at `import_cobblemon_xlsx.py` runtime.
- **Form variants** ([Galarian]/[Hisuian]/etc.) skipped during xlsx import — base species don't carry form data. ~118 form rows lost.

## Most recent plan

`~/.claude/plans/ok-lets-use-plan-purring-raccoon.md` — the batch plan that delivered Items, Biome Search, the data backfill, and the party.js/stadium.js bug cleanup.
