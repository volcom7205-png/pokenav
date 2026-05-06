#!/usr/bin/env python3
"""
Scrape Cobblemon's crafting recipes from the GitLab repo.

Session 8 (recipe scale-up): no longer filtered to Pokéballs. Pulls every
recipe in the recipe directory and normalizes each into a uniform schema
the Academy renderer can dispatch on.

Outputs:
    data/recipes.json — list of normalized recipes (see schema below)
    assets/items/cobblemon/*.png — texture for every Cobblemon item that
        appears as a result or ingredient

Schemas per recipe (one of):
    shaped         {result, count, type:'shaped',     pattern, key}
    shapeless      {result, count, type:'shapeless',  ingredients:[ref,...]}
    smelting       {result, count, type:'smelting'|'blasting'|'smoking'|'campfire',
                    ingredient:ref, time:secs, xp:float}
    stonecutting   {result, count, type:'stonecutting', ingredient:ref}
    brewing        {result, count, type:'brewing', input:ref, reagent:ref}
    cooking_pot    {result, count, type:'cooking_pot', ingredients:[ref,...], time:secs}

`ref` is one of: {item:'ns:foo'} | {tag:'ns:foo'} | [refs...] (option list).

Source: https://gitlab.com/cable-mc/cobblemon
  recipes:  common/src/main/resources/data/cobblemon/recipe/*.json (recursive)
  textures: common/src/main/resources/assets/cobblemon/textures/item/**/*.png

Re-runnable. Cache lives in /tmp/cobblemon_repo/. Unhandled recipe types and
missing textures get logged to stderr.
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

# Drops appear in pokemon_gen*.json as plain English ("Up-Grade", "Light Ball").
# Snake-cased they line up with cobblemon's PNG basenames — except when the
# in-game item name diverges from the texture filename. Map slug → repo basename.
DROP_BASENAME_ALIASES = {
    "up_grade": "upgrade",
}

# Maps Minecraft / Cobblemon recipe type strings to our normalized type.
TYPE_MAP = {
    "minecraft:crafting_shaped":    "shaped",
    "minecraft:crafting_shapeless": "shapeless",
    "minecraft:smelting":           "smelting",
    "minecraft:blasting":           "blasting",
    "minecraft:smoking":            "smoking",
    "minecraft:campfire_cooking":   "campfire",
    "minecraft:stonecutting":       "stonecutting",
    "minecraft:smithing_transform": "smithing",
    "cobblemon:brewing_stand":         "brewing",
    "cobblemon:cooking_pot":           "cooking_pot",
    "cobblemon:cooking_pot_shapeless": "cooking_pot",
    "cobblemon:cooking_pot_shaped":    "cooking_pot",
    "cobblemon:apricorn_cooking":      "cooking_pot",
}


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


def fetch_recipe(repo_path: str) -> dict:
    url = f"{RAW}/{repo_path}"
    safe = re.sub(r'[^a-zA-Z0-9]', '_', repo_path)
    body = fetch_cached(url, CACHE / "recipe" / f"{safe}.json")
    return json.loads(body)


def normalize_ref(slot):
    """Normalize a single ingredient slot into one of:
       {item: 'ns:foo'}, {tag: 'ns:foo'}, or a list of those for an option list."""
    if isinstance(slot, dict):
        if "item" in slot:
            return {"item": slot["item"]}
        if "tag" in slot:
            return {"tag": slot["tag"]}
        if "id" in slot:
            return {"item": slot["id"]}
        return None
    if isinstance(slot, list):
        opts = [normalize_ref(o) for o in slot]
        opts = [o for o in opts if o]
        return opts if opts else None
    if isinstance(slot, str):
        return {"item": slot}
    return None


def normalize_result(result):
    if isinstance(result, str):
        return result, 1
    if isinstance(result, dict):
        return (result.get("id") or result.get("item")), result.get("count", 1)
    return None, 1


def normalize_recipe(name: str, raw: dict) -> dict | None:
    rtype = raw.get("type", "")
    norm_type = TYPE_MAP.get(rtype)
    if not norm_type:
        print(f"[scraper] skipping {name}: unhandled type={rtype}", file=sys.stderr)
        return None

    result_id, count = normalize_result(raw.get("result", {}))
    if not result_id:
        print(f"[scraper] skipping {name}: no result id", file=sys.stderr)
        return None

    base = {"result": result_id, "count": count, "type": norm_type}

    if norm_type == "shaped":
        return {**base, "pattern": raw.get("pattern", []), "key": raw.get("key", {})}

    if norm_type == "shapeless":
        ings = [normalize_ref(i) for i in raw.get("ingredients", [])]
        ings = [i for i in ings if i]
        return {**base, "ingredients": ings}

    if norm_type in ("smelting", "blasting", "smoking", "campfire"):
        ing = normalize_ref(raw.get("ingredient"))
        if not ing:
            return None
        return {
            **base,
            "ingredient": ing,
            "time": raw.get("cookingtime", 0),
            "xp": raw.get("experience", 0),
        }

    if norm_type == "stonecutting":
        ing = normalize_ref(raw.get("ingredient"))
        if not ing:
            return None
        return {**base, "ingredient": ing}

    if norm_type == "cooking_pot":
        # Two shapes: 3×3 patterned (cobblemon:cooking_pot) or shapeless ingredient list.
        # Preserve pattern+key when present so the grid renders like JEI;
        # always also emit an `ingredients` list of unique refs for compact contexts.
        out = {**base, "time": raw.get("cookingtime", 0)}
        if "key" in raw and "pattern" in raw:
            out["pattern"] = raw.get("pattern", [])
            out["key"] = raw.get("key", {})
            seen = set()
            ings = []
            for row in raw.get("pattern", []):
                for ch in row:
                    if ch == " " or ch in seen:
                        continue
                    seen.add(ch)
                    ref = normalize_ref(raw["key"].get(ch))
                    if ref:
                        ings.append(ref)
            out["ingredients"] = ings
        else:
            ings = [normalize_ref(i) for i in raw.get("ingredients", [])]
            out["ingredients"] = [i for i in ings if i]
        return out

    if norm_type == "brewing":
        # Cobblemon brewing-stand recipes: `input` is the catalyst (above the bottle),
        # `bottle` is the base potion/bottle (in one of the 3 bottle slots).
        input_ref = normalize_ref(raw.get("input"))
        bottle_ref = normalize_ref(raw.get("bottle"))
        if not input_ref or not bottle_ref:
            return None
        return {**base, "input": input_ref, "bottle": bottle_ref}

    if norm_type == "smithing":
        base_ref = normalize_ref(raw.get("base"))
        addition_ref = normalize_ref(raw.get("addition"))
        template_ref = normalize_ref(raw.get("template"))
        if not base_ref or not addition_ref:
            return None
        out = {**base, "base": base_ref, "addition": addition_ref}
        if template_ref:
            out["template"] = template_ref
        return out

    return None


def collect_referenced_items(recipes: list[dict]) -> tuple[set[str], set[str]]:
    """Return (cobblemon_item_ids, other_refs). other_refs holds tags + non-cobblemon items."""
    items: set[str] = set()
    other: set[str] = set()

    def walk(ref):
        if ref is None:
            return
        if isinstance(ref, list):
            for r in ref:
                walk(r)
            return
        if "item" in ref:
            items.add(ref["item"])
        elif "tag" in ref:
            other.add(f"tag:{ref['tag']}")

    for r in recipes:
        items.add(r["result"])
        t = r["type"]
        if t == "shaped" or (t == "cooking_pot" and "key" in r):
            for slot in r.get("key", {}).values():
                walk(normalize_ref(slot))
        elif t in ("shapeless", "cooking_pot"):
            for ing in r.get("ingredients", []):
                walk(ing)
        elif t in ("smelting", "blasting", "smoking", "campfire", "stonecutting"):
            walk(r.get("ingredient"))
        elif t == "brewing":
            walk(r.get("input"))
            walk(r.get("bottle"))
        elif t == "smithing":
            walk(r.get("base"))
            walk(r.get("addition"))
            walk(r.get("template"))

    cobblemon = {i for i in items if i.startswith("cobblemon:")}
    other.update(i for i in items if not i.startswith("cobblemon:"))
    return cobblemon, other


def collect_drop_slugs() -> set[str]:
    """Snake-case every Pokémon drop name across data/pokemon_gen*.json."""
    slugs: set[str] = set()
    for path in sorted(DATA.glob("pokemon_gen*.json")):
        for p in json.loads(path.read_text(encoding="utf-8")):
            for d in p.get("drops", []):
                name = d.get("item", "") or ""
                if not name:
                    continue
                slug = re.sub(r"_+", "_",
                              re.sub(r"[^a-z0-9]+", "_",
                                     name.lower().replace("'", "").replace(".", ""))
                              ).strip("_")
                if slug:
                    slugs.add(slug)
    return slugs


def build_texture_index() -> dict[str, str]:
    """Map basename → repo path for every PNG under textures/item/.

    Subdirectories (poke_balls/, pokedexes/, …) hold the proper 16×16
    inventory icons; other paths sometimes hold 3D entity textures that
    happen to share a basename. Prefer subdirectory hits so we don't
    accidentally grab a 64×32 entity texture.
    """
    tree = list_tree(TEXTURE_DIR, recursive=True)
    candidates: dict[str, list[str]] = {}
    for entry in tree:
        if entry["type"] != "blob" or not entry["name"].endswith(".png"):
            continue
        short = entry["name"][:-4]
        candidates.setdefault(short, []).append(entry["path"])

    index: dict[str, str] = {}
    for short, paths in candidates.items():
        # Deeper paths win — `item/poke_balls/ultra_ball.png` beats
        # any same-named file at a shallower level.
        index[short] = sorted(paths, key=lambda p: -p.count("/"))[0]
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

    print("[scraper] listing recipe directory recursively...", file=sys.stderr)
    listing = list_tree(RECIPE_DIR, recursive=True)
    recipe_files = sorted(
        e["path"] for e in listing
        if e["type"] == "blob" and e["name"].endswith(".json")
    )
    print(f"[scraper] found {len(recipe_files)} recipe json files", file=sys.stderr)

    recipes: list[dict] = []
    type_counts: dict[str, int] = {}
    for repo_path in recipe_files:
        try:
            raw = fetch_recipe(repo_path)
        except Exception as e:
            print(f"[scraper] failed to fetch {repo_path}: {e}", file=sys.stderr)
            continue
        norm = normalize_recipe(repo_path, raw)
        if norm:
            recipes.append(norm)
            type_counts[norm["type"]] = type_counts.get(norm["type"], 0) + 1

    print(f"[scraper] kept {len(recipes)} recipes by type: {type_counts}", file=sys.stderr)

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

    # Second pass: cobblemon textures referenced as drop names in
    # data/pokemon_gen*.json. Recipes don't mention every held/evolution item
    # (Light Ball, Razor Claw, Up-Grade, etc.) so a roster-driven sweep
    # is needed to keep the Academy drop tiles iconned.
    drop_extra = 0
    drop_missing: list[str] = []
    for slug in sorted(collect_drop_slugs()):
        target = ASSETS / f"{slug}.png"
        if target.exists() and target.stat().st_size > 0:
            continue
        actual = DROP_BASENAME_ALIASES.get(slug, slug)
        if actual not in tex_index:
            drop_missing.append(slug)
            continue
        try:
            download_texture(slug, tex_index[actual])
            drop_extra += 1
        except Exception as e:
            print(f"[scraper] drop texture {slug}.png failed: {e}", file=sys.stderr)
            drop_missing.append(slug)

    print(f"[scraper] downloaded {drop_extra} extra drop textures from cobblemon",
          file=sys.stderr)
    if drop_missing:
        print(f"[scraper] {len(drop_missing)} drop slugs not in cobblemon textures "
              f"(likely vanilla — fetch_minecraft_icons.py picks them up): {drop_missing}",
              file=sys.stderr)

    vanilla = sorted(r for r in other_refs if not r.startswith("tag:"))
    tags = sorted(r for r in other_refs if r.startswith("tag:"))
    if vanilla:
        print(f"[scraper] {len(vanilla)} vanilla/external items (need icons): {vanilla}",
              file=sys.stderr)
    if tags:
        print(f"[scraper] {len(tags)} tag refs (resolve later): {tags}", file=sys.stderr)

    recipes.sort(key=lambda r: (r["type"], r["result"]))
    out_path = DATA / "recipes.json"
    out_path.write_text(json.dumps(recipes, indent=2) + "\n", encoding="utf-8")
    print(f"[scraper] wrote {out_path.relative_to(ROOT)}: {len(recipes)} recipes", file=sys.stderr)
    print(f"[scraper] downloaded {downloaded} textures into "
          f"{ASSETS.relative_to(ROOT)}/", file=sys.stderr)


if __name__ == "__main__":
    main()
