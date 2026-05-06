#!/usr/bin/env bash
# Sync data/ from main PokeNav into pokenav-shay/, then rebuild the zip.
# Run this after refreshing Cobblemon data (scrape_cobbledex.py / import_cobblemon_xlsx.py).
#
# What it touches:
#   pokenav-shay/data/   ← overwritten with main's data
#   pokenav-shay.zip     ← regenerated
#
# What it does NOT touch:
#   pokenav-shay/css|js|index.html|README.md  ← Shay's customizations stay intact
#   pokenav/ (the main project)                ← read-only here

set -euo pipefail

SRC_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DST_ROOT="$(dirname "$SRC_ROOT")/pokenav-shay"
ZIP_PATH="$(dirname "$SRC_ROOT")/pokenav-shay.zip"

if [ ! -d "$DST_ROOT" ]; then
  echo "❌ Shay's copy not found at: $DST_ROOT" >&2
  exit 1
fi

if [ ! -d "$SRC_ROOT/data" ]; then
  echo "❌ Source data/ not found at: $SRC_ROOT/data" >&2
  exit 1
fi

echo "→ Rebuilding icon manifest from assets/items/"
python3 "$SRC_ROOT/scripts/build_icon_manifest.py"

echo "→ Building data/*.js (so file:// works without a server)"
python3 "$SRC_ROOT/scripts/build_data_js.py" "$SRC_ROOT"

echo "→ Syncing data/ → $DST_ROOT/data/"
cp -r "$SRC_ROOT/data/." "$DST_ROOT/data/"

echo "→ Syncing assets/items/ → $DST_ROOT/assets/items/"
mkdir -p "$DST_ROOT/assets/items"
cp -r "$SRC_ROOT/assets/items/." "$DST_ROOT/assets/items/"

echo "→ Rebuilding $ZIP_PATH"
python3 - "$DST_ROOT" "$ZIP_PATH" <<'PY'
import os, sys, zipfile

src, dst = sys.argv[1], sys.argv[2]
if os.path.exists(dst):
    os.remove(dst)

count = 0
with zipfile.ZipFile(dst, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as z:
    for root, dirs, files in os.walk(src):
        dirs[:] = [d for d in dirs if d not in ('.git', '__pycache__', '.claude', 'scripts')]
        for f in files:
            if f == '.DS_Store' or f.endswith('.pyc'):
                continue
            full = os.path.join(root, f)
            arc = os.path.relpath(full, os.path.dirname(src))
            z.write(full, arc)
            count += 1

size_mb = os.path.getsize(dst) / 1024 / 1024
print(f'  wrote {count} files · {size_mb:.2f} MB')
PY

echo "✅ Done. Send: $ZIP_PATH"
