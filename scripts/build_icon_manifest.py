#!/usr/bin/env python3
"""
Walk assets/items/{cobblemon,minecraft}/ and write data/icons.js with the
list of basenames available in each namespace. The Academy uses this so it
can resolve a plain drop name like "Apple" to the right namespace
(minecraft:apple if vanilla, cobblemon:apple otherwise) — without having
to issue HTTP requests at render time.
"""
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
ASSETS = ROOT / "assets" / "items"


def list_namespace(ns: str) -> list[str]:
    d = ASSETS / ns
    if not d.is_dir():
        return []
    return sorted(p.stem for p in d.iterdir() if p.suffix == ".png")


def main() -> None:
    manifest = {
        "cobblemon": list_namespace("cobblemon"),
        "minecraft": list_namespace("minecraft"),
    }
    out = DATA / "icons.js"
    out.write_text(
        f"window.POKENAV_ICON_MANIFEST = {json.dumps(manifest)};\n",
        encoding="utf-8",
    )
    sizes = {ns: len(v) for ns, v in manifest.items()}
    print(f"wrote {out.relative_to(ROOT)}: {sizes}", file=sys.stderr)


if __name__ == "__main__":
    main()
