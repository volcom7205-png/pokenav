#!/usr/bin/env python3
"""
Import Cobblemon 1.7.3 spawn + drop data from the official XLSX exports
into per-gen JSON files.

Reads two workbooks (Cobblemon Spawns + Cobblemon Drops) and rewrites
`spawns` and `drops` on every entry across data/pokemon_gen{1..9}.json,
preserving id / name / types / sprite / learnableMoves.

Form variants in the xlsx (e.g. "Mr. Mime [Galarian]") are skipped:
they don't match base-species entries in the per-gen JSON. Mismatches
are logged to stderr.

Reads xlsx via stdlib zipfile + xml.etree (no openpyxl needed).
"""
import argparse
import io
import json
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"

DEFAULT_ZIP = "/mnt/c/Users/Dickie/Downloads/drive-download-20260504T143210Z-3-001.zip"
SPAWN_NAME = "Cobblemon Spawns 1.7.3.xlsx"
DROP_NAME = "Cobblemon Drops 1.7.3.xlsx"


def load_xlsx_bytes(args) -> tuple[bytes, bytes]:
    if args.spawns and args.drops:
        return Path(args.spawns).read_bytes(), Path(args.drops).read_bytes()
    src = Path(args.zip or DEFAULT_ZIP)
    if not src.exists():
        sys.exit(f"input not found: {src}")
    z = zipfile.ZipFile(src)
    return z.read(SPAWN_NAME), z.read(DROP_NAME)


def read_sheet(xlsx_bytes: bytes) -> list[dict]:
    """Return rows as dicts keyed by header label. Row 0 is header."""
    z = zipfile.ZipFile(io.BytesIO(xlsx_bytes))
    shared = []
    if "xl/sharedStrings.xml" in z.namelist():
        for si in ET.fromstring(z.read("xl/sharedStrings.xml")).iter(NS + "si"):
            shared.append("".join(t.text or "" for t in si.iter(NS + "t")))
    sheet = ET.fromstring(z.read("xl/worksheets/sheet1.xml"))

    raw_rows = []
    for r in sheet.iter(NS + "row"):
        row = {}
        for c in r.iter(NS + "c"):
            ref = c.attrib.get("r", "")
            col = re.match(r"[A-Z]+", ref).group()
            t = c.attrib.get("t", "n")
            v_el = c.find(NS + "v")
            is_el = c.find(NS + "is")
            if t == "s" and v_el is not None:
                val = shared[int(v_el.text)]
            elif t == "inlineStr" and is_el is not None:
                val = "".join(t.text or "" for t in is_el.iter(NS + "t"))
            elif v_el is not None:
                val = v_el.text or ""
            else:
                val = ""
            row[col] = val
        raw_rows.append(row)

    if not raw_rows:
        return []
    headers = {col: label.strip() for col, label in raw_rows[0].items()}
    out = []
    for raw in raw_rows[1:]:
        out.append({headers[col]: val for col, val in raw.items() if col in headers})
    return out


# ── Normalizers ─────────────────────────────────────────────────────

BIOME_REPLACE = {
    # Existing data uses these exact strings; map xlsx "Title Case" to them.
    # Default rule (lowercase + spaces→underscores) covers the rest.
}


def norm_biome(name: str) -> str:
    s = name.strip()
    if not s:
        return ""
    if s in BIOME_REPLACE:
        return BIOME_REPLACE[s]
    return s.lower().replace(" ", "_")


def parse_biome_list(cell: str) -> list[str]:
    if not cell:
        return []
    out = []
    for chunk in cell.split(","):
        b = norm_biome(chunk)
        if b and b not in out:
            out.append(b)
    return out


def num_or_none(s: str) -> int | None:
    s = (s or "").strip()
    if not s:
        return None
    try:
        return int(float(s))
    except ValueError:
        return None


# `<item> <qty> <chance%>` — both qty and trailing chance (e.g. "Glow Ink Sac 1-3 10%")
DROP_TOKEN_QTY_CHANCE_RE = re.compile(
    r"^\s*(?P<item>.+?)\s+(?P<qty>\d+(?:-\d+)?)\s+(?P<chance>\d+(?:\.\d+)?%)\s*$"
)
# `<item> <chance%>` or `<item> <qty>`
DROP_TOKEN_RE = re.compile(
    r"""
    ^\s*
    (?P<item>.+?)
    \s+
    (?:
        (?P<chance>\d+(?:\.\d+)?%)
      |
        (?P<qty>\d+(?:-\d+)?)
    )
    \s*$
    """,
    re.VERBOSE,
)


def parse_drops(cell: str) -> list[dict]:
    if not cell:
        return []
    out = []
    # Tokens may be comma-separated OR " OR "-separated (Chansey/Blissey style).
    raw_chunks = []
    for c in re.split(r",\s*", cell):
        raw_chunks.extend(re.split(r"\s+OR\s+", c))
    for chunk in raw_chunks:
        chunk = chunk.strip()
        if not chunk:
            continue
        m = DROP_TOKEN_QTY_CHANCE_RE.match(chunk)
        if m:
            out.append({
                "item": m.group("item").strip(),
                "chance": m.group("chance"),
                "quantity": m.group("qty"),
            })
            continue
        m = DROP_TOKEN_RE.match(chunk)
        if not m:
            out.append({"item": chunk, "quantity": "1"})
            continue
        item = m.group("item").strip()
        if m.group("chance"):
            out.append({"item": item, "chance": m.group("chance")})
        else:
            out.append({"item": item, "quantity": m.group("qty")})
    return out


def normalize_spawn_row(row: dict) -> dict:
    lvl_min = num_or_none(row.get("Lv. Min", ""))
    lvl_max = num_or_none(row.get("Lv. Max", ""))
    if lvl_min is not None and lvl_max is not None:
        level_range = f"{lvl_min}-{lvl_max}"
    elif lvl_min is not None:
        level_range = str(lvl_min)
    else:
        level_range = "?"

    bucket = (row.get("Bucket") or "").strip().lower() or "unknown"
    time_v = (row.get("Time") or "any").strip().lower() or "any"
    weather = (row.get("Weather") or "any").strip().lower() or "any"
    biomes = parse_biome_list(row.get("Biomes", ""))
    excluded = parse_biome_list(row.get("Excluded Biomes", ""))
    context_raw = (row.get("Context") or "").strip()
    context = [c.strip().lower() for c in context_raw.split(",") if c.strip()]

    spawn = {
        "bucket": bucket,
        "levelRange": level_range,
        "time": time_v,
        "weather": weather,
        "biomes": biomes,
        "context": context,
    }
    if excluded:
        # Title-case the names back so the UI reads naturally.
        pretty = ", ".join(b.replace("_", " ").title() for b in excluded)
        spawn["notes"] = f"Not in: {pretty}"
    return spawn


# ── Top-level ───────────────────────────────────────────────────────


def is_form_name(name: str) -> bool:
    """xlsx mons with bracket suffix (e.g. 'Mr. Mime [Galarian]') are
    form variants; the per-gen JSON only has base species."""
    return "[" in name and "]" in name


def build_indexes(spawn_rows: list[dict], drop_rows: list[dict]):
    """Return (spawns_by_name, drops_by_name) — keys are exact mon names
    matching the per-gen JSON. Form variants are dropped."""
    by_name_spawn: dict[str, list[dict]] = {}
    skipped_forms: set[str] = set()
    for row in spawn_rows:
        name = (row.get("Pokémon") or "").strip()
        if not name:
            continue
        if is_form_name(name):
            skipped_forms.add(name)
            continue
        spawn = normalize_spawn_row(row)
        by_name_spawn.setdefault(name, []).append(spawn)

    # Label the spawns: "Overworld" if 1, else "Overworld N"
    for name, lst in by_name_spawn.items():
        if len(lst) == 1:
            lst[0]["label"] = "Overworld"
        else:
            for i, s in enumerate(lst, 1):
                s["label"] = f"Overworld {i}"

    by_name_drop: dict[str, list[dict]] = {}
    for row in drop_rows:
        name = (row.get("Pokémon") or "").strip()
        if not name or is_form_name(name):
            if name and is_form_name(name):
                skipped_forms.add(name)
            continue
        by_name_drop[name] = parse_drops(row.get("Drops", ""))

    if skipped_forms:
        print(
            f"  skipped {len(skipped_forms)} form variant(s) (e.g. "
            + ", ".join(sorted(skipped_forms)[:5])
            + ")",
            file=sys.stderr,
        )
    return by_name_spawn, by_name_drop


def reorder_keys(entry: dict) -> dict:
    """Match the field order seen in existing data files for cleaner diffs."""
    order = ["id", "name", "types", "sprite", "learnableMoves", "drops", "spawns"]
    out = {k: entry[k] for k in order if k in entry}
    for k, v in entry.items():
        if k not in out:
            out[k] = v
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--zip", help="path to outer drive-download zip")
    ap.add_argument("--spawns", help="path to Cobblemon Spawns xlsx")
    ap.add_argument("--drops", help="path to Cobblemon Drops xlsx")
    args = ap.parse_args()

    spawns_bytes, drops_bytes = load_xlsx_bytes(args)
    spawn_rows = read_sheet(spawns_bytes)
    drop_rows = read_sheet(drops_bytes)
    print(f"loaded spawns rows={len(spawn_rows)}  drops rows={len(drop_rows)}")

    by_name_spawn, by_name_drop = build_indexes(spawn_rows, drop_rows)
    print(
        f"indexed: {len(by_name_spawn)} mons with spawns, "
        f"{len(by_name_drop)} with drops"
    )

    matched = 0
    unmatched_xlsx_names: set[str] = set(by_name_spawn) | set(by_name_drop)

    for gen in range(1, 10):
        path = DATA / f"pokemon_gen{gen}.json"
        if not path.exists():
            print(f"  skip missing {path}", file=sys.stderr)
            continue
        entries = json.load(path.open())
        for e in entries:
            name = e["name"]
            spawns = by_name_spawn.get(name)
            drops = by_name_drop.get(name)
            if spawns is not None:
                e["spawns"] = spawns
                unmatched_xlsx_names.discard(name)
                matched += 1
            elif "spawns" not in e:
                e["spawns"] = []
            if drops is not None:
                e["drops"] = drops
                unmatched_xlsx_names.discard(name)
            elif "drops" not in e:
                e["drops"] = []
        ordered = [reorder_keys(e) for e in entries]
        json.dump(ordered, path.open("w"), indent=2, ensure_ascii=False)
        print(f"  wrote {path.name} ({len(entries)} entries)")

    if unmatched_xlsx_names:
        print(
            f"\nwarning: {len(unmatched_xlsx_names)} xlsx names had no JSON match",
            file=sys.stderr,
        )
        for n in sorted(unmatched_xlsx_names)[:20]:
            print(f"  - {n}", file=sys.stderr)
    print(f"\ndone: matched {matched} spawn-blocks across all gens")


if __name__ == "__main__":
    main()
