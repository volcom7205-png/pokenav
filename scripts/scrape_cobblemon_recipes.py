#!/usr/bin/env python3
"""
Scrape Cobblemon's shaped crafting recipes from the GitLab repo.

v1 scope (Decision log Q9): only `minecraft:crafting_shaped` recipes whose
result item id ends in `_ball` (Pokéball variants).

Outputs:
    data/recipes.json — list of normalized recipes (see schema below)
    assets/items/cobblemon/*.png — texture for every Cobblemon item that
        appears as a result or ingredient

Schema per recipe:
    {
      "result": "cobblemon:poke_ball",
      "count":  4,
      "type":   "shaped",
      "pattern": [" t ", "lcr", " b "],
      "key": {
        "t": {"item": "cobblemon:red_apricorn"},
        "c": {"tag":  "cobblemon:tier_1_poke_ball_materials"}
      }
    }

Source: https://gitlab.com/cable-mc/cobblemon
  recipes:  common/src/main/resources/data/cobblemon/recipe/*.json
  textures: common/src/main/resources/assets/cobblemon/textures/item/**/*.png

Re-runnable. Cache lives in /tmp/cobblemon_repo/. Unhandled recipe types,
shapeless recipes, and missing textures get logged to stderr.
"""
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
ASSETS = ROOT / "assets" / "items" / "cobblemon"
CACHE = Path("/tmp/cobblemon_repo")
CACHE.mkdir(parents=True, exist_ok=True)

PROJECT = "cable-mc%2Fcobblemon"
REF = "main"
API = f"https://gitlab.com/api/v4/projects/{PROJECT}"
RAW = f"https://gitlab.com/cable-mc/cobblemon/-/raw/{REF}"
USER_AGENT = "pokenav-scraper/1.0 (personal hobby project)"
THROTTLE_SEC = 0.2

RECIPE_DIR = "common/src/main/resources/data/cobblemon/recipe"
TEXTURE_DIR = "common/src/main/resources/assets/cobblemon/textures/item"


def http_get(url: str, binary: bool = False) -> bytes | str:
    time.sleep(THROTTLE_SEC)
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=30) as r:
        body = r.read()
    return body if binary else body.decode("utf-8")


def fetch_cached(url: str, cache_path: Path, binary: bool = False) -> bytes | str:
    if cache_path.exists() and cache_path.stat().st_size > 0:
        return cache_path.read_bytes() if binary else cache_path.read_text(encoding="utf-8")
    body = http_get(url, binary=binary)
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    if binary:
        cache_path.write_bytes(body)
    else:
        cache_path.write_text(body, encoding="utf-8")
    return body


def list_tree(path: str, recursive: bool = False) -> list[dict]:
    """Page through GitLab's tree listing for `path`."""
    out: list[dict] = []
    page = 1
    while True:
        params = {
            "path": path,
            "ref": REF,
            "per_page": "100",
            "page": str(page),
        }
        if recursive:
            params["recursive"] = "true"
        url = f"{API}/repository/tree?{urllib.parse.urlencode(params)}"
        cache = CACHE / f"tree_{re.sub(r'[^a-zA-Z0-9]', '_', path)}_{int(recursive)}_{page}.json"
        body = fetch_cached(url, cache)
        items = json.loads(body)
        if not isinstance(items, list) or not items:
            break
        out.extend(items)
        if len(items) < 100:
            break
        page += 1
    return out


def fetch_recipe(name: str) -> dict:
    url = f"{RAW}/{RECIPE_DIR}/{name}"
    body = fetch_cached(url, CACHE / "recipe" / name)
    return json.loads(body)


def normalize_recipe(name: str, raw: dict) -> dict | None:
    rtype = raw.get("type", "")
    if rtype != "minecraft:crafting_shaped":
        print(f"[scraper] skipping {name}: type={rtype} (not shaped)", file=sys.stderr)
        return None

    result = raw.get("result", {})
    if isinstance(result, str):
        result_id, count = result, 1
    else:
        result_id = result.get("id") or result.get("item")
        count = result.get("count", 1)
    if not result_id:
        print(f"[scraper] skipping {name}: no result id", file=sys.stderr)
        return None

    return {
        "result": result_id,
        "count": count,
        "type": "shaped",
        "pattern": raw.get("pattern", []),
        "key": raw.get("key", {}),
    }


def collect_referenced_items(recipes: list[dict]) -> tuple[set[str], set[str]]:
    """Return (cobblemon_item_ids, other_refs). other_refs holds tags + non-cobblemon items."""
    items: set[str] = set()
    other: set[str] = set()
    for r in recipes:
        items.add(r["result"])
        for slot in r["key"].values():
            if isinstance(slot, dict):
                if "item" in slot:
                    items.add(slot["item"])
                elif "tag" in slot:
                    other.add(f"tag:{slot['tag']}")
            elif isinstance(slot, list):
                for opt in slot:
                    if isinstance(opt, dict) and "item" in opt:
                        items.add(opt["item"])
            elif isinstance(slot, str):
                items.add(slot)

    cobblemon = {i for i in items if i.startswith("cobblemon:")}
    other.update(i for i in items if not i.startswith("cobblemon:"))
    return cobblemon, other


def build_texture_index() -> dict[str, str]:
    """Map cobblemon short item name → repo path of its PNG texture."""
    tree = list_tree(TEXTURE_DIR, recursive=True)
    index: dict[str, str] = {}
    for entry in tree:
        if entry["type"] != "blob" or not entry["name"].endswith(".png"):
            continue
        short = entry["name"][:-4]  # strip .png
        full_path = entry["path"]
        # If multiple subdirs share a name, prefer the most specific later
        # match (poke_balls/ over a top-level duplicate). Cobblemon's tree
        # doesn't actually have collisions in practice but be defensive.
        index.setdefault(short, full_path)
    return index


def download_texture(short: str, repo_path: str) -> bool:
    target = ASSETS / f"{short}.png"
    if target.exists() and target.stat().st_size > 0:
        return True
    url = f"{RAW}/{repo_path}"
    cache = CACHE / "texture" / f"{short}.png"
    body = fetch_cached(url, cache, binary=True)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(body)
    return True


def main() -> None:
    ASSETS.mkdir(parents=True, exist_ok=True)

    # Collect all *_ball.json filenames
    print("[scraper] listing recipe directory...", file=sys.stderr)
    listing = list_tree(RECIPE_DIR)
    ball_files = sorted(
        e["name"] for e in listing
        if e["type"] == "blob" and e["name"].endswith("_ball.json")
    )
    print(f"[scraper] found {len(ball_files)} *_ball.json recipe files", file=sys.stderr)

    # Fetch + normalize
    recipes: list[dict] = []
    for name in ball_files:
        try:
            raw = fetch_recipe(name)
        except Exception as e:
            print(f"[scraper] failed to fetch {name}: {e}", file=sys.stderr)
            continue
        norm = normalize_recipe(name, raw)
        if norm:
            recipes.append(norm)

    print(f"[scraper] kept {len(recipes)} shaped recipes", file=sys.stderr)

    # Collect referenced items + textures
    cobblemon_items, other_refs = collect_referenced_items(recipes)
    print(f"[scraper] {len(cobblemon_items)} cobblemon items, "
          f"{len(other_refs)} other refs (tags + vanilla)", file=sys.stderr)

    print("[scraper] indexing texture tree...", file=sys.stderr)
    tex_index = build_texture_index()

    downloaded = 0
    missing: list[str] = []
    for full_id in sorted(cobblemon_items):
        short = full_id.split(":", 1)[1]
        if short not in tex_index:
            missing.append(full_id)
            continue
        try:
            download_texture(short, tex_index[short])
            downloaded += 1
        except Exception as e:
            print(f"[scraper] texture {short}.png failed: {e}", file=sys.stderr)
            missing.append(full_id)

    if missing:
        print(f"[scraper] {len(missing)} cobblemon items had no texture: {missing}",
              file=sys.stderr)

    # Non-cobblemon refs (vanilla items + item tags) — log so the user knows what
    # icon assets we still need to source.
    vanilla = sorted(r for r in other_refs if not r.startswith("tag:"))
    tags = sorted(r for r in other_refs if r.startswith("tag:"))
    if vanilla:
        print(f"[scraper] {len(vanilla)} vanilla/external items (need icons): {vanilla}",
              file=sys.stderr)
    if tags:
        print(f"[scraper] {len(tags)} tag refs (resolve later): {tags}", file=sys.stderr)

    # Write output. Sort recipes by result id for stable diffs.
    recipes.sort(key=lambda r: r["result"])
    out_path = DATA / "recipes.json"
    out_path.write_text(json.dumps(recipes, indent=2) + "\n", encoding="utf-8")
    print(f"[scraper] wrote {out_path.relative_to(ROOT)}: {len(recipes)} recipes", file=sys.stderr)
    print(f"[scraper] downloaded {downloaded} textures into "
          f"{ASSETS.relative_to(ROOT)}/", file=sys.stderr)


if __name__ == "__main__":
    main()
