#!/usr/bin/env python3
"""Generate data/*.js from data/*.json so the app works under file:// (no fetch).

Each JSON file becomes a sibling .js that assigns to a window global. The app's
loaders read from those globals instead of fetching, so double-clicking
index.html works without a local server.

Run after refreshing data (scrape_cobbledex.py / import_cobblemon_xlsx.py) or
whenever items.json / recipes.json / biome_taxonomy.json change.
"""

import json
import sys
from pathlib import Path

SPECS = [
    ("moves.json", "POKENAV_MOVES"),
    ("items.json", "POKENAV_ITEMS"),
    ("recipes.json", "POKENAV_RECIPES"),
    ("biome_taxonomy.json", "POKENAV_BIOME_TAXONOMY"),
] + [(f"pokemon_gen{g}.json", f"POKENAV_POKEMON_GEN{g}") for g in range(1, 10)]


def build(data_dir: Path) -> int:
    n = 0
    for fname, var in SPECS:
        src = data_dir / fname
        if not src.exists():
            print(f"  skip {fname} (missing)", file=sys.stderr)
            continue
        with src.open() as f:
            data = json.load(f)
        dst = src.with_suffix(".js")
        with dst.open("w") as f:
            f.write(f"window.{var} = ")
            json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
            f.write(";\n")
        n += 1
        print(f"  {fname} -> {dst.name}")
    return n


def main():
    root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent
    data_dir = root / "data"
    if not data_dir.is_dir():
        print(f"data/ not found at {data_dir}", file=sys.stderr)
        sys.exit(1)
    print(f"Building data/*.js in {data_dir}")
    n = build(data_dir)
    print(f"Wrote {n} files.")


if __name__ == "__main__":
    main()
