#!/usr/bin/env python3
"""
Re-download the cobblemon inventory icons that the original scraper
got wrong (64×32 entity textures instead of 16×16 inventory icons).
The proper icons live in subdirectories (poke_balls/, pokedexes/, …)
that the recipe scraper's flat indexing missed.

Idempotent: only re-downloads icons that are not 16×16.
"""
import sys
import urllib.request
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets" / "items" / "cobblemon"

RAW = "https://gitlab.com/cable-mc/cobblemon/-/raw/main/common/src/main/resources/assets/cobblemon/textures/item"

# basename -> repo subdir under textures/item/
CORRECT_PATHS = {
    "poke_ball":      "poke_balls",
    "ultra_ball":     "poke_balls",
    "moon_ball":      "poke_balls",
    "nest_ball":      "poke_balls",
    "net_ball":       "poke_balls",
    "park_ball":      "poke_balls",
    "premier_ball":   "poke_balls",
    "quick_ball":     "poke_balls",
    "repeat_ball":    "poke_balls",
    "roseate_ball":   "poke_balls",
    "safari_ball":    "poke_balls",
    "slate_ball":     "poke_balls",
    "sport_ball":     "poke_balls",
    "timer_ball":     "poke_balls",
    "verdant_ball":   "poke_balls",
    "pokedex_black":  "pokedexes",
    "pokedex_blue":   "pokedexes",
    "pokedex_green":  "pokedexes",
    "pokedex_pink":   "pokedexes",
    "pokedex_red":    "pokedexes",
    "pokedex_white":  "pokedexes",
    "pokedex_yellow": "pokedexes",
}


def is_inventory_size(path: Path) -> bool:
    try:
        with Image.open(path) as im:
            return im.size == (16, 16)
    except Exception:
        return False


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "pokenav-icon-fix/1.0"})
    with urllib.request.urlopen(req, timeout=15) as r:
        return r.read()


def main() -> None:
    fixed = 0
    skipped = 0
    failed = []
    for short, subdir in sorted(CORRECT_PATHS.items()):
        dst = ASSETS / f"{short}.png"
        if dst.exists() and is_inventory_size(dst):
            skipped += 1
            continue
        url = f"{RAW}/{subdir}/{short}.png"
        try:
            data = fetch(url)
            dst.write_bytes(data)
            with Image.open(dst) as im:
                size = im.size
            print(f"  {short}: {size}  <- {url}", file=sys.stderr)
            fixed += 1
        except Exception as e:
            failed.append((short, e))
            print(f"  {short}: FAILED ({e})", file=sys.stderr)

    print(f"\nDone. fixed={fixed}  skipped={skipped}  failed={len(failed)}", file=sys.stderr)
    if failed:
        for name, err in failed:
            print(f"  - {name}: {err}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
