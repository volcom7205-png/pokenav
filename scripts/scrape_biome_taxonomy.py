#!/usr/bin/env python3
"""
Scrape Cobblemon's biome taxonomy from the wiki "Spawn Definitions" page.

Output: data/biome_taxonomy.json — one entry per Cobblemon biome tag:

    {
      "swamp": {
        "dimension": "overworld",
        "group": "forest",
        "underlying": [
          { "name": "Swamp",          "source": "vanilla" },
          { "name": "Mangrove Swamp", "source": "vanilla" },
          { "name": "Bayou",          "source": "terralith" }
        ]
      },
      ...
    }

Source: https://wiki.cobblemon.com/index.php/Pok%C3%A9mon/Spawning/Spawn_Definitions
fetched via the MediaWiki API (action=parse, prop=wikitext) so we get clean
wikitext rather than rendered HTML to scrape.

Re-runnable. New tags / new mod sources / unclassified tags are logged to stderr.
"""
import json
import re
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
CACHE = Path("/tmp/cobblemon_wiki")
CACHE.mkdir(parents=True, exist_ok=True)

API_URL = (
    "https://wiki.cobblemon.com/api.php"
    "?action=parse&page=Pok%C3%A9mon/Spawning/Spawn_Definitions"
    "&prop=wikitext&format=json"
)
USER_AGENT = "pokenav-scraper/1.0 (personal hobby project)"

# Group assignments for overworld biome tags. Locked in by the active plan
# (Decision log Q3, section C2). Tags not matched here fall through to
# `special` and are logged for manual placement.
OVERWORLD_GROUPS = {
    "aquatic": {
        "ocean", "deep_ocean", "warm_ocean", "lukewarm_ocean",
        "frozen_ocean", "river", "frozen_river", "beach", "snowy_beach",
        "coast", "freshwater",
    },
    "cold": {
        "cold", "freezing", "snowy", "snowy_forest", "snowy_taiga",
        "taiga", "tundra", "glacial",
    },
    "hot": {
        "desert", "badlands", "savanna", "arid", "sandy", "volcanic",
        "thermal", "salt",
    },
    "forest": {
        "forest", "jungle", "bamboo", "cherry_blossom", "swamp", "lush",
    },
    "plains": {
        "plains", "grassland", "sunflower_plains", "floral", "shrubland",
        "temperate",
    },
    "vertical": {
        "mountain", "peak", "highlands", "hills", "plateau",
    },
    "underground": {
        "cave", "dripstone", "deep_dark",
    },
    "special": {
        "magical", "spooky", "mushroom", "mushroom_fields", "sky",
        "island", "tropical_island", "overworld",
    },
}

# Source-mod label normalization. Keys are matched case-insensitive against
# the "Established by" column. Unmapped values pass through verbatim.
SOURCE_LABELS = {
    "vanilla minecraft": "vanilla",
    "vanilla": "vanilla",
    "cobblemon": "cobblemon",
    "terralith": "terralith",
    "wythers' overhauled overworld": "wythers",
    "wythers overhauled overworld": "wythers",
    "oh the biomes you'll go": "oh_the_biomes_youll_go",
    "betternether": "betternether",
    "better nether": "betternether",
    "incendium": "incendium",
    "the aether": "aether",
    "aether": "aether",
    "the bumblezone": "bumblezone",
    "bumblezone": "bumblezone",
    "cinderscapes": "cinderscapes",
    "gardens of the dead": "gardens_of_the_dead",
}


def fetch_wikitext() -> str:
    cache = CACHE / "spawn_definitions.json"
    if cache.exists() and cache.stat().st_size > 1000:
        body = cache.read_text(encoding="utf-8")
    else:
        time.sleep(0.5)
        req = urllib.request.Request(API_URL, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=30) as r:
            body = r.read().decode("utf-8")
        cache.write_text(body, encoding="utf-8")
    return json.loads(body)["parse"]["wikitext"]["*"]


def strip_wiki_links(s: str) -> str:
    # [[Page|Display]] → Display ; [[Page]] → Page
    s = re.sub(r"\[\[([^\]|]+)\|([^\]]+)\]\]", r"\2", s)
    s = re.sub(r"\[\[([^\]]+)\]\]", r"\1", s)
    return s.strip()


def normalize_tag(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")


def normalize_source(label: str) -> str:
    key = strip_wiki_links(label).lower().strip()
    if key in SOURCE_LABELS:
        return SOURCE_LABELS[key]
    print(f"[scraper] unknown source label: {label!r}", file=sys.stderr)
    return normalize_tag(key)


def parse_cell(cell: str) -> tuple[int, str]:
    """Extract optional rowspan + the cell value.

    MediaWiki cell syntax is `attributes|value` or just `value`. We split on
    the first `|` outside any `[[...]]` link, since wiki links use `|` too.
    The attributes prefix only applies if it looks attribute-like (contains
    `=`); otherwise the whole cell is the value (e.g. `[[Foo|Bar]] biomes`).
    """
    sep = -1
    depth = 0
    for i, ch in enumerate(cell):
        if ch == "[" and i + 1 < len(cell) and cell[i + 1] == "[":
            depth += 1
        elif ch == "]" and i + 1 < len(cell) and cell[i + 1] == "]":
            depth = max(0, depth - 1)
        elif ch == "|" and depth == 0:
            sep = i
            break

    if sep >= 0 and "=" in cell[:sep]:
        attrs, value = cell[:sep], cell[sep + 1:]
    else:
        attrs, value = "", cell

    rowspan = 1
    m = re.search(r'rowspan\s*=\s*"?(\d+)"?', attrs)
    if m:
        rowspan = int(m.group(1))
    return rowspan, value.strip()


def parse_table(wikitext: str) -> list[dict]:
    """Parse the single biomes wikitable into a list of {tag, underlying, source}."""
    # Trim to just the table body. Header rows start with `!`; data rows are
    # separated by `|-`. We split on `|-` and walk rows.
    start = wikitext.index("{|")
    end = wikitext.rindex("|}")
    body = wikitext[start:end]

    rows = body.split("\n|-")
    # First chunk has the table header (`{| class="wikitable"...!Biome\n!Qualifying...`)
    # — skip it.
    rows = rows[1:]

    # Track ongoing rowspans for cols 1/2/3 (umbrella tag, underlying, source).
    spans = [None, None, None]  # (value, remaining_rows) per column
    out = []

    for raw in rows:
        # Each row is a sequence of `\n|cell` or `\n!cell` lines.
        cells = []
        for line in raw.split("\n"):
            line = line.strip()
            if not line or line.startswith("|}"):
                continue
            if line.startswith("!") or line.startswith("|"):
                cells.append(line[1:].strip())

        if not cells:
            continue

        # Match cells to columns, skipping any column whose rowspan is still active.
        col_values = [None, None, None]
        cell_idx = 0
        for col in range(3):
            if spans[col] and spans[col][1] > 0:
                col_values[col] = spans[col][0]
                spans[col] = (spans[col][0], spans[col][1] - 1)
            else:
                if cell_idx >= len(cells):
                    break
                rowspan, value = parse_cell(cells[cell_idx])
                col_values[col] = value
                if rowspan > 1:
                    spans[col] = (value, rowspan - 1)
                else:
                    spans[col] = None
                cell_idx += 1

        umbrella, underlying, source = col_values
        if not (umbrella and underlying and source):
            continue
        out.append({
            "tag": normalize_tag(umbrella),
            "tag_display": umbrella,
            "underlying": strip_wiki_links(underlying),
            "source": normalize_source(source),
        })

    return out


def classify(tag: str, underlying_sources: set[str]) -> tuple[str, str]:
    """Return (dimension, group) for an umbrella biome tag."""
    # Dimension hints from the tag name
    if tag.startswith("nether") or tag in {"crimson", "warped"}:
        return ("nether", "nether")
    if tag == "end" or tag.startswith("end_"):
        return ("end", "end")
    if tag == "aether" or tag.startswith("aether_") or "aether" in underlying_sources:
        return ("aether", "aether")
    if tag == "bumblezone" or "bumblezone" in underlying_sources:
        return ("bumblezone", "bumblezone")

    for group, members in OVERWORLD_GROUPS.items():
        if tag in members:
            return ("overworld", group)
    print(f"[scraper] unclassified overworld tag → special: {tag}", file=sys.stderr)
    return ("overworld", "special")


def main() -> None:
    wikitext = fetch_wikitext()
    rows = parse_table(wikitext)

    # Collapse rows to {tag → [{name, source}, ...]}
    by_tag: dict[str, dict] = {}
    for r in rows:
        entry = by_tag.setdefault(r["tag"], {
            "display": r["tag_display"],
            "sources": set(),
            "underlying": [],
        })
        entry["sources"].add(r["source"])
        entry["underlying"].append({"name": r["underlying"], "source": r["source"]})

    out: dict[str, dict] = {}
    for tag, e in by_tag.items():
        dimension, group = classify(tag, e["sources"])
        out[tag] = {
            "dimension": dimension,
            "group": group,
            "underlying": e["underlying"],
        }

    out_path = DATA / "biome_taxonomy.json"
    out_path.write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    # Summary
    by_dim: dict[str, int] = {}
    by_group: dict[str, int] = {}
    by_source: dict[str, int] = {}
    for tag, info in out.items():
        by_dim[info["dimension"]] = by_dim.get(info["dimension"], 0) + 1
        by_group[info["group"]] = by_group.get(info["group"], 0) + 1
        for u in info["underlying"]:
            by_source[u["source"]] = by_source.get(u["source"], 0) + 1
    print(f"[scraper] wrote {out_path.relative_to(ROOT)}: {len(out)} umbrella tags, "
          f"{sum(len(v['underlying']) for v in out.values())} underlying biomes",
          file=sys.stderr)
    print(f"[scraper]   dimensions: {dict(sorted(by_dim.items()))}", file=sys.stderr)
    print(f"[scraper]   groups:     {dict(sorted(by_group.items()))}", file=sys.stderr)
    print(f"[scraper]   sources:    {dict(sorted(by_source.items()))}", file=sys.stderr)


if __name__ == "__main__":
    main()
