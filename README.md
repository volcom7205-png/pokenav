# PokeNav

A static, no-build Pokédex / Cobblemon helper. Pure HTML + plain JS + CSS — no bundler, no transpile, no server required.

## Run it

Either double-click `index.html`, or:

```bash
python3 -m http.server 8765
# then open http://localhost:8765
```

(Both work — data loads via `window.POKENAV_*` globals so `file://` is fine too.)

## What's in it

- **Pokédex** — 851 mons across 9 gens. Tile grid with element / generation / collection (Owned/Wanted/Missing) filters. Click a tile to open a detailed card: types, sprite, learnable moves (with STAB highlighting + DAMAGE/STATUS filters), defensive matchups, evolution chain (clickable), spawn locations, drops.
- **Trainer's PC** — your party + storage with drag/drop, IV/EV editor, move pickers.
- **Stadium** — battle planning: load a mon, pick four moves, see effective coverage.
- **Type Chart** — quick lookup of any type matchup.
- **🎓 Academy** — unified item / TM / drop / recipe hub. 13 category chips. Renders shaped, shapeless, smelting, stonecutting, brewing, smithing, and cooking-pot recipes.
- **Biome Search** — collapsed two-level accordion picker; filter to Cobblemon-supported mod packs in Settings.
- **Settings** — trainer name, mod packs, danger zone (reset).

Trainer name, party, storage, and wanted list persist via `localStorage`.

## Data

All data lives in `data/`:
- `pokemon_gen{1..9}.json` — roster + spawns + drops + learnable moves + evolutions
- `moves.json` — 954 moves
- `items.json` — hand-curated berries / battle items / vitamins
- `recipes.json` — 774 Cobblemon crafting recipes
- `biome_taxonomy.json` — biome metadata for the picker

After editing any `.json`, run `python3 scripts/build_data_js.py` to regenerate the `.js` mirrors that the browser actually loads.

See `CLAUDE.md` for the full architecture, data shape, and refresh workflows.
