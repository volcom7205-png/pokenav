#!/usr/bin/env python3
"""
Augment the existing data/pokemon_gen{1..9}.json files with an `evolutions`
field by re-fetching each mon's cobbledex page and running the evolution
parser from scrape_cobbledex.py.

Only the `evolutions` field is touched; types / sprite / learnableMoves /
drops / spawns are preserved exactly. This is safer than re-running the
full scraper (which would clobber drops/spawns on gens 2-9).

Pages are cached under /tmp/cobbledex/{slug}-{id}.html (same cache the
main scraper uses) so re-runs are cheap.
"""
import json
import sys
import urllib.error
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from scrape_cobbledex import (  # noqa: E402
    CACHE,
    MON_URL,
    extract_rsc_payload,
    fetch_cached,
    parse_evolutions,
    slugify,
)

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"


def fetch_payload(name: str, dex_id: int) -> str | None:
    name_slug = slugify(name)
    cache_path = CACHE / f"{name_slug}-{dex_id}.html"
    url = MON_URL.format(slug=name_slug)
    try:
        return fetch_cached(url, cache_path)
    except urllib.error.HTTPError as e:
        print(f"  HTTP {e.code} for {name} #{dex_id} — skipping", file=sys.stderr)
        if cache_path.exists():
            cache_path.unlink()
        return None


def main() -> None:
    total_with_evos = 0
    total_edges = 0
    for gen_n in range(1, 10):
        path = DATA / f"pokemon_gen{gen_n}.json"
        if not path.exists():
            continue
        entries = json.load(path.open())
        gen_with_evos = 0
        gen_edges = 0
        for i, mon in enumerate(entries, 1):
            html = fetch_payload(mon["name"], mon["id"])
            if html is None:
                continue
            payload = extract_rsc_payload(html)
            evos = parse_evolutions(payload)
            if evos:
                mon["evolutions"] = evos
                gen_with_evos += 1
                gen_edges += len(evos)
            else:
                # Final-stage mons (no outgoing evolutions) intentionally have
                # no field — keeps the JSON small. Strip any prior value too.
                mon.pop("evolutions", None)
            if i % 25 == 0:
                print(f"  gen{gen_n} {i}/{len(entries)}…")
        with path.open("w") as f:
            json.dump(entries, f, indent=2)
        print(f"gen{gen_n}: {gen_with_evos}/{len(entries)} mons evolve; {gen_edges} edges total")
        total_with_evos += gen_with_evos
        total_edges += gen_edges
    print(f"\nTOTAL: {total_with_evos} mons with outgoing evolutions; {total_edges} edges")


if __name__ == "__main__":
    main()
