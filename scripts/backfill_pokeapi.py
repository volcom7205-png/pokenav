#!/usr/bin/env python3
"""
Backfill the per-gen Pokémon JSONs from PokeAPI for any national dex id
that's missing.

Cobbledex's roster (the source for our base data) doesn't list every
Cobblemon-implemented mon — Audino, Arceus, Calyrex, etc. are gaps.
The cobbledex CDN does serve their 3D sprites though, so we keep the
sprite URL pattern consistent and pull the rest (id / name / types /
learnableMoves) from PokeAPI.

Output: each missing entry is inserted into the appropriate
data/pokemon_gen{N}.json (id-sorted). Existing entries are untouched —
the script only ADDS, never modifies.

Caching: /tmp/pokeapi/{kind}-{id}.json so re-runs are free.
"""
import json
import re
import sys
import time
import urllib.request
import urllib.error
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
CACHE = Path("/tmp/pokeapi")
CACHE.mkdir(parents=True, exist_ok=True)

API = "https://pokeapi.co/api/v2"
USER_AGENT = "pokenav-scraper/1.0 (personal hobby project)"
THROTTLE_SEC = 0.15

# National dex range per Cobblemon-convention gen.
GEN_RANGES = {
    1: (1, 151), 2: (152, 251), 3: (252, 386), 4: (387, 493),
    5: (494, 649), 6: (650, 721), 7: (722, 809), 8: (810, 905), 9: (906, 1025),
}

# PokeAPI version groups in chronological order — newer groups are
# preferred so the move list reflects the latest learnset balance.
VERSION_PRIORITY = [
    "scarlet-violet", "sword-shield", "sun-moon", "ultra-sun-ultra-moon",
    "x-y", "omega-ruby-alpha-sapphire", "black-2-white-2", "black-white",
    "heartgold-soulsilver", "platinum", "diamond-pearl", "emerald",
    "ruby-sapphire", "firered-leafgreen", "crystal", "gold-silver",
    "yellow", "red-blue",
]
VERSION_RANK = {v: i for i, v in enumerate(VERSION_PRIORITY)}

# PokeAPI move-learn-method names → our schema's `method` field.
METHOD_MAP = {
    "level-up": "level",
    "machine": "tm",
    "egg": "egg",
    "tutor": "tutor",
    # PokeAPI also has 'form-change', 'light-ball-egg', etc. — these are
    # rare and we treat them as 'special' so the UI still renders them.
}

# PokeAPI evolution trigger → our schema's `method` field. The strings
# match what cobbledex_scrape.py emits, so the renderer's chip-shortener
# (`shortenRequirement` in pokedex.js) handles both data sources.
EVO_TRIGGER_MAP = {
    "level-up": "level_up",
    "use-item": "item_interact",
    "trade": "trade",
}


def http_get_json(url: str) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def fetch_cached(url: str, cache_path: Path) -> dict:
    if cache_path.exists() and cache_path.stat().st_size > 100:
        return json.loads(cache_path.read_text())
    time.sleep(THROTTLE_SEC)
    body = http_get_json(url)
    cache_path.write_text(json.dumps(body))
    return body


def cap_type(t: str) -> str:
    return t[:1].upper() + t[1:]


def english_display_name(species: dict) -> str:
    for n in species.get("names", []):
        if n.get("language", {}).get("name") == "en":
            return n["name"]
    # Fallback: title-case the slug, swap dashes for spaces.
    return species["name"].replace("-", " ").title()


def build_move_lookup() -> tuple[dict[str, str], dict[str, str]]:
    """Return (slug→display_name, normalized_slug→display_name) maps.
    Some moves use hyphens (PokeAPI: 'thunder-punch') vs ours
    ('Thunder Punch'). Normalize both to a hyphenless lowercase form
    for the second index to handle the rare mismatch."""
    moves = json.load((DATA / "moves.json").open())
    by_dash = {}
    by_compact = {}
    for m in moves:
        n = m["name"]
        slug_dash = re.sub(r"[^a-z0-9]+", "-", n.lower()).strip("-")
        slug_compact = re.sub(r"[^a-z0-9]", "", n.lower())
        by_dash[slug_dash] = n
        by_compact[slug_compact] = n
    return by_dash, by_compact


def pick_version_detail(details: list[dict]) -> dict | None:
    """Pick the most-recent version-group entry from PokeAPI's
    `version_group_details` array (it can list the same move multiple
    times across generations)."""
    if not details:
        return None
    return min(
        details,
        key=lambda d: VERSION_RANK.get(
            d.get("version_group", {}).get("name"), 999
        ),
    )


def parse_moves(pokemon: dict, slug_dash: dict[str, str], slug_compact: dict[str, str], log_name: str) -> list[dict]:
    """Convert PokeAPI's moves[] into our learnableMoves[] schema. Picks
    the latest version-group's learn-method per move; dedupes (level, name)
    and (other-method, name)."""
    out = []
    seen = set()
    unknown = []
    for m in pokemon.get("moves", []):
        slug = m["move"]["name"]
        # Map slug → display name. Try dashed form first, then compact.
        compact = slug.replace("-", "")
        name = slug_dash.get(slug) or slug_compact.get(compact)
        if not name:
            unknown.append(slug)
            continue
        v = pick_version_detail(m.get("version_group_details", []))
        if not v:
            continue
        api_method = v["move_learn_method"]["name"]
        method = METHOD_MAP.get(api_method, "special")
        if method == "level":
            level = v.get("level_learned_at") or 1
            key = ("level", name)
            if key in seen:
                continue
            seen.add(key)
            out.append({"name": name, "method": "level", "level": level})
        else:
            key = (method, name)
            if key in seen:
                continue
            seen.add(key)
            out.append({"name": name, "method": method})
    if unknown:
        print(f"  [{log_name}] {len(unknown)} unknown move slug(s): {unknown[:4]}", file=sys.stderr)
    # Sort: level moves by level, then other methods grouped alphabetically.
    METHOD_ORDER = {"level": 0, "tm": 1, "egg": 2, "tutor": 3, "special": 4}
    out.sort(key=lambda x: (
        METHOD_ORDER.get(x["method"], 9),
        x.get("level", 0),
        x["name"],
    ))
    return out


def gen_for_id(dex_id: int) -> int | None:
    for g, (lo, hi) in GEN_RANGES.items():
        if lo <= dex_id <= hi:
            return g
    return None


def find_missing_ids() -> dict[int, list[int]]:
    """Walk per-gen JSONs and return {gen: [missing ids…]}."""
    missing: dict[int, list[int]] = {}
    for g, (lo, hi) in GEN_RANGES.items():
        path = DATA / f"pokemon_gen{g}.json"
        present = {e["id"] for e in json.load(path.open())} if path.exists() else set()
        miss = [i for i in range(lo, hi + 1) if i not in present]
        if miss:
            missing[g] = miss
    return missing


SPECIES_URL_RE = re.compile(r"/pokemon-species/(\d+)/?")


def species_id_from_url(url: str) -> int | None:
    m = SPECIES_URL_RE.search(url or "")
    return int(m.group(1)) if m else None


def find_node_by_species(node: dict, species_name: str) -> dict | None:
    if node.get("species", {}).get("name") == species_name:
        return node
    for child in node.get("evolves_to", []):
        hit = find_node_by_species(child, species_name)
        if hit:
            return hit
    return None


def evo_details_to_edge(details: dict, target_id: int) -> dict | None:
    trigger = (details.get("trigger") or {}).get("name", "")
    method = EVO_TRIGGER_MAP.get(trigger, "special")
    edge: dict = {"to": target_id, "method": method}

    # Item only carried for use-item triggers; held_item goes into requirements
    # so the renderer treats it as "Hold X" alongside the other conditions.
    if trigger == "use-item":
        item = (details.get("item") or {}).get("name")
        if item:
            edge["item"] = f"cobblemon:{item.replace('-', '_')}"

    requirements: list[str] = []
    if details.get("min_level"):
        requirements.append(f"Must reach level {details['min_level']}")
    if details.get("min_happiness"):
        requirements.append(f"Must reach friendship amount of {details['min_happiness']}")
    elif details.get("min_affection"):
        requirements.append(f"Must reach friendship amount of {details['min_affection']}")
    if details.get("time_of_day"):
        requirements.append(f"Must evolve during {details['time_of_day']}")
    if details.get("needs_overworld_rain"):
        requirements.append("Must evolve during rain")
    kmt = (details.get("known_move_type") or {}).get("name")
    if kmt:
        requirements.append(f"Must know a {kmt} type move")
    km = (details.get("known_move") or {}).get("name")
    if km:
        requirements.append(f"Must know {km.replace('-', ' ').title()}")
    held = (details.get("held_item") or {}).get("name")
    if held and trigger != "use-item":
        requirements.append(f"Must be holding {held.replace('-', ' ').title()}")
    loc = (details.get("location") or {}).get("name")
    if loc:
        requirements.append(f"Must be in {loc.replace('-', ' ').title()}")
    rps = details.get("relative_physical_stats")
    if rps == 1:
        requirements.append("Stat comparison: Atk > Def")
    elif rps == -1:
        requirements.append("Stat comparison: Atk < Def")
    elif rps == 0:
        requirements.append("Stats must be equal: Atk = Def")
    if details.get("gender") == 1:
        requirements.append("Must be female")
    elif details.get("gender") == 2:
        requirements.append("Must be male")
    if details.get("min_beauty"):
        requirements.append(f"Beauty {details['min_beauty']}+")
    if details.get("turn_upside_down"):
        requirements.append("Phone upside down")

    if requirements:
        edge["requirements"] = requirements
    return edge


def fetch_evolutions(species: dict, dex_id: int) -> list[dict]:
    chain_url = (species.get("evolution_chain") or {}).get("url")
    if not chain_url:
        return []
    m = re.search(r"/evolution-chain/(\d+)/?", chain_url)
    if not m:
        return []
    chain_id = m.group(1)
    chain = fetch_cached(chain_url, CACHE / f"chain-{chain_id}.json")
    node = find_node_by_species(chain.get("chain", {}), species.get("name"))
    if not node:
        return []

    edges: list[dict] = []
    seen: set = set()
    for child in node.get("evolves_to", []):
        target_id = species_id_from_url(child.get("species", {}).get("url"))
        if not target_id:
            continue
        for details in child.get("evolution_details", []) or [{}]:
            edge = evo_details_to_edge(details, target_id)
            # Dedupe on (target, method, item) — same as cobbledex scraper.
            key = (edge["to"], edge["method"], edge.get("item"))
            if key in seen:
                continue
            seen.add(key)
            edges.append(edge)
    return edges


def fetch_one(dex_id: int, slug_dash: dict, slug_compact: dict) -> dict | None:
    pokemon = fetch_cached(f"{API}/pokemon/{dex_id}/", CACHE / f"pokemon-{dex_id}.json")
    species = fetch_cached(f"{API}/pokemon-species/{dex_id}/", CACHE / f"species-{dex_id}.json")
    name = english_display_name(species)
    types = [cap_type(t["type"]["name"]) for t in pokemon.get("types", [])]
    moves = parse_moves(pokemon, slug_dash, slug_compact, name)
    sprite = f"https://cobbledex.b-cdn.net/3dmons/previews/large/{dex_id}.webp"
    evolutions = fetch_evolutions(species, dex_id)
    entry = {
        "id": dex_id,
        "name": name,
        "types": types,
        "sprite": sprite,
        "learnableMoves": moves,
        "drops": [],
        "spawns": [],
    }
    if evolutions:
        entry["evolutions"] = evolutions
    return entry


def main():
    missing = find_missing_ids()
    total = sum(len(v) for v in missing.values())
    if not total:
        print("nothing missing — all gens are full")
        return
    print(f"missing across all gens: {total}")
    for g, ids in missing.items():
        print(f"  gen{g}: {len(ids)} missing")

    slug_dash, slug_compact = build_move_lookup()
    print(f"loaded {len(slug_dash)} move-name mappings")

    additions: dict[int, list[dict]] = {}
    for g, ids in missing.items():
        for i, dex_id in enumerate(ids, 1):
            try:
                entry = fetch_one(dex_id, slug_dash, slug_compact)
            except urllib.error.HTTPError as e:
                print(f"  HTTP {e.code} for #{dex_id} — skipping", file=sys.stderr)
                continue
            additions.setdefault(g, []).append(entry)
            print(f"[{i}/{len(ids)}] gen{g} #{dex_id} {entry['name']:<14} types={'/'.join(entry['types']):<14} moves={len(entry['learnableMoves'])}")

    # Merge into per-gen JSON, id-sorted.
    for g, new_entries in additions.items():
        path = DATA / f"pokemon_gen{g}.json"
        existing = json.load(path.open())
        merged = sorted(existing + new_entries, key=lambda e: e["id"])
        json.dump(merged, path.open("w"), indent=2, ensure_ascii=False)
        print(f"wrote {path.name}: {len(existing)} existing + {len(new_entries)} added = {len(merged)} total")


if __name__ == "__main__":
    main()
