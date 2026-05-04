#!/usr/bin/env python3
"""
Scrape cobbledex.info to build per-generation Pokémon data files.

Output: data/pokemon_gen{1..9}.json — each entry has
    { id, name, types, sprite, learnableMoves: [{ name, method, level? }, ...] }

Gen 1 is merged with the existing data/pokemon_gen1.json: existing
drops/spawns/sprite are preserved; only learnableMoves is replaced.

Page fetches are cached under /tmp/cobbledex/{slug}.html so the script
is resumable. Re-runs skip slugs that are already cached.
"""
import json
import os
import re
import sys
import time
import urllib.request
import urllib.error
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
CACHE = Path("/tmp/cobbledex")
CACHE.mkdir(parents=True, exist_ok=True)

ALLMONS_URL = "https://www.cobbledex.info/all-mons"
MON_URL = "https://www.cobbledex.info/mon/{slug}"
USER_AGENT = "pokenav-scraper/1.0 (personal hobby project)"
THROTTLE_SEC = 0.5

LABEL_TO_GEN_FILE = {
    "gen1": 1, "gen2": 2, "gen3": 3, "gen4": 4, "gen5": 5,
    "gen6": 6, "gen7": 7, "gen8": 8, "gen8a": 8, "gen9": 9,
}


def http_get(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8", errors="replace")


def fetch_cached(url: str, cache_path: Path) -> str:
    if cache_path.exists() and cache_path.stat().st_size > 1000:
        return cache_path.read_text(encoding="utf-8", errors="replace")
    time.sleep(THROTTLE_SEC)
    body = http_get(url)
    cache_path.write_text(body, encoding="utf-8")
    return body


def extract_rsc_payload(html: str) -> str:
    # Each chunk is a JS string literal containing a mix of escape sequences
    # (ÿ, \") AND raw UTF-8 characters. unicode_escape alone mangles the
    # multi-byte UTF-8 sequences, so we round-trip through latin-1 to recover.
    chunks = re.findall(r'self\.__next_f\.push\(\[1,\s*"((?:[^"\\]|\\.)*)"\]\)', html)
    out = []
    for c in chunks:
        decoded = c.encode().decode("unicode_escape")
        try:
            decoded = decoded.encode("latin-1").decode("utf-8")
        except UnicodeError:
            pass  # chunk had no high-byte content; decoded is already correct
        out.append(decoded)
    return "".join(out)


def extract_allmons() -> list[dict]:
    html = fetch_cached(ALLMONS_URL, CACHE / "_all-mons.html")
    payload = extract_rsc_payload(html)
    m = re.search(r'"allPokemon":\[', payload)
    if not m:
        sys.exit("could not find allPokemon array in /all-mons payload")
    start = m.end() - 1
    depth = 0
    in_str = False
    esc = False
    end = None
    for i, ch in enumerate(payload[start:], start):
        if esc:
            esc = False
            continue
        if ch == "\\":
            esc = True
            continue
        if ch == '"':
            in_str = not in_str
            continue
        if in_str:
            continue
        if ch == "[":
            depth += 1
        elif ch == "]":
            depth -= 1
            if depth == 0:
                end = i + 1
                break
    return json.loads(payload[start:end])


def slugify(name: str) -> str:
    # Map gender symbols and other one-char glyphs to their letter
    # equivalents so e.g. Nidoran♀ → "nidoranf", and strip diacritics
    # so Flabébé → "flabebe".
    import unicodedata
    name = name.replace("♀", "f").replace("♂", "m")  # ♀ ♂
    name = unicodedata.normalize("NFKD", name)
    name = "".join(c for c in name if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]", "", name.lower())


def build_move_lookup() -> dict[str, str]:
    moves = json.load((DATA / "moves.json").open())
    return {slugify(m["name"]): m["name"] for m in moves}


def parse_moves(rsc_payload: str, slug_to_name: dict[str, str], pokemon_name: str) -> list[dict]:
    """Pull the `moves` array from a /mon page's RSC payload and convert
    each `"<level>:slug"` / `"<method>:slug"` entry into our schema."""
    m = re.search(r'"moves":\[((?:"[^"]+"(?:,)?)*)\]', rsc_payload)
    if not m:
        return []
    raw = re.findall(r'"([^"]+)"', m.group(1))
    out = []
    seen = set()
    unknown = []
    for entry in raw:
        if ":" not in entry:
            continue
        prefix, mslug = entry.split(":", 1)
        name = slug_to_name.get(mslug)
        if not name:
            unknown.append(entry)
            continue
        if prefix.isdigit():
            key = ("level", name)
            if key in seen:
                continue
            seen.add(key)
            out.append({"name": name, "method": "level", "level": int(prefix)})
        else:
            method = prefix  # 'tm', 'egg', 'tutor', 'legacy', 'special'
            key = (method, name)
            if key in seen:
                continue
            seen.add(key)
            out.append({"name": name, "method": method})
    if unknown:
        print(f"  [{pokemon_name}] {len(unknown)} unknown move slug(s): {unknown[:5]}", file=sys.stderr)
    return out


def parse_sprite(rsc_payload: str) -> str | None:
    m = re.search(r'"image":"(https://cobbledex\.b-cdn\.net/3dmons/previews/[^"]+)"', rsc_payload)
    return m.group(1) if m else None


def scrape_one(mon: dict, slug_to_name: dict[str, str]) -> dict | None:
    # Cobbledex's `slug` field is broken for special-character names
    # (Nidoran♀ → "nidoran", Iron Treads → "iron"), but the actual URLs
    # use the [a-z0-9]+ form of the display name. Derive that ourselves.
    name_slug = slugify(mon["name"])
    candidates = [name_slug, mon["slug"]] if mon["slug"] != name_slug else [name_slug]
    for slug in candidates:
        cache_path = CACHE / f"{slug}-{mon['nationalPokedexNumber']}.html"
        url = MON_URL.format(slug=slug)
        try:
            html = fetch_cached(url, cache_path)
            break
        except urllib.error.HTTPError as e:
            if cache_path.exists():
                cache_path.unlink()
            if slug == candidates[-1]:
                print(f"  HTTP {e.code} for {mon['name']} (tried: {candidates}) — skipping", file=sys.stderr)
                return None
            continue
    payload = extract_rsc_payload(html)
    moves = parse_moves(payload, slug_to_name, mon["name"])
    sprite = parse_sprite(payload)
    types = [mon["primaryType"]]
    secondary = mon.get("secondaryType")
    # "$undefined" is the Next.js RSC sentinel for an undefined value;
    # for single-type mons it should be omitted entirely.
    if secondary and secondary != "$undefined":
        types.append(secondary)
    return {
        "id": mon["nationalPokedexNumber"],
        "name": mon["name"],
        "types": types,
        "sprite": sprite,
        "learnableMoves": moves,
    }


def merge_gen1(new_entries: list[dict]) -> list[dict]:
    """For Gen 1, the existing file has hand-curated cobblemon-specific
    fields (drops, spawns) that aren't reproducible from cobbledex's
    structured data. Preserve just those; everything else (types, sprite,
    learnableMoves) comes from the fresh scrape."""
    existing_path = DATA / "pokemon_gen1.json"
    if not existing_path.exists():
        return new_entries
    existing = {p["id"]: p for p in json.load(existing_path.open())}
    merged = []
    for e in new_entries:
        old = existing.get(e["id"]) or {}
        out = dict(e)
        if "drops" in old:
            out["drops"] = old["drops"]
        if "spawns" in old:
            out["spawns"] = old["spawns"]
        merged.append(out)
    return merged


def main():
    slug_to_name = build_move_lookup()
    print(f"loaded {len(slug_to_name)} move name mappings")

    all_mons = extract_allmons()
    implemented = [p for p in all_mons if p.get("implemented")]
    print(f"roster: {len(all_mons)} total, {len(implemented)} implemented")

    by_gen: dict[int, list[dict]] = {}
    for i, mon in enumerate(implemented, 1):
        gen_label = next((l for l in mon.get("labels", []) if l in LABEL_TO_GEN_FILE), None)
        if gen_label is None:
            print(f"  no gen label for {mon['name']}: labels={mon.get('labels')}", file=sys.stderr)
            continue
        gen_n = LABEL_TO_GEN_FILE[gen_label]
        print(f"[{i}/{len(implemented)}] gen{gen_n} {mon['name']} ({mon['slug']})")
        entry = scrape_one(mon, slug_to_name)
        if entry is None:
            continue
        by_gen.setdefault(gen_n, []).append(entry)

    for gen_n, entries in sorted(by_gen.items()):
        entries.sort(key=lambda e: e["id"])
        out_path = DATA / f"pokemon_gen{gen_n}.json"
        if gen_n == 1:
            entries = merge_gen1(entries)
        with out_path.open("w") as f:
            json.dump(entries, f, indent=2)
        print(f"wrote {out_path} ({len(entries)} entries)")


if __name__ == "__main__":
    main()
