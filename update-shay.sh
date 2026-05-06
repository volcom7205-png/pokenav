#!/usr/bin/env bash
# Sync main PokeNav into pokenav-shay/ while preserving her customizations,
# then rebuild the zip.
#
# Run this after any change you want Shay to see (data refresh, code changes,
# new panels). Idempotent — safe to re-run.
#
# What it overwrites in pokenav-shay/ (kept in sync with main):
#   data/                                      — Pokémon, moves, recipes, biomes
#   js/core/{biomes,data,nav,picker,types,utils}.js  — non-customized core
#   js/panels/{academy,biome,party,pokedex,stadium,typechart}.js — non-customized panels
#   assets/items/                              — except *_ball.png in cobblemon/ (her custom art)
#   index.html                                 — sync from main, then patch in
#                                                Shay's title + subtitle + letter-modal
#
# What it leaves alone (her customizations):
#   js/app.js                  — console.log easter egg
#   js/core/trainer.js         — letter-from-Dickie modal logic
#   js/panels/settings.js      — letter card + Shay placeholder + love tag
#   css/                       — her purple Gengar theme (whole tree)
#   README.md                  — Shay's README
#   assets/items/cobblemon/*_ball.png  — her custom ball art (16 files)
#
# What it patches without overwriting (idempotent append):
#   css/panels/pokedex.css     — appends Phase 1 rules (collection chips,
#                                move rows, matchup blocks) below a sentinel
#                                comment if not already present.

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

echo "→ Syncing js/core/ (skipping trainer.js, her letter modal lives there)"
mkdir -p "$DST_ROOT/js/core"
for f in biomes data nav picker types utils; do
  cp "$SRC_ROOT/js/core/$f.js" "$DST_ROOT/js/core/$f.js"
done

echo "→ Syncing js/panels/ (skipping settings.js, her letter card lives there)"
mkdir -p "$DST_ROOT/js/panels"
for f in academy biome party pokedex stadium typechart; do
  cp "$SRC_ROOT/js/panels/$f.js" "$DST_ROOT/js/panels/$f.js"
done

echo "→ Syncing assets/items/ (preserving her existing *_ball.png, copying new ones)"
mkdir -p "$DST_ROOT/assets/items"
# Copy every file from main; for ball PNGs, only copy if Shay doesn't have it yet
(cd "$SRC_ROOT/assets/items" && find . -type f) | while read -r rel; do
  dst="$DST_ROOT/assets/items/$rel"
  case "$rel" in
    ./cobblemon/*_ball.png)
      if [ ! -e "$dst" ]; then
        mkdir -p "$(dirname "$dst")"
        cp "$SRC_ROOT/assets/items/$rel" "$dst"
      fi
      ;;
    *)
      mkdir -p "$(dirname "$dst")"
      cp "$SRC_ROOT/assets/items/$rel" "$dst"
      ;;
  esac
done

echo "→ Patching index.html (main's structure + Shay's branding + letter-modal)"
python3 - "$SRC_ROOT/index.html" "$DST_ROOT/index.html" <<'PY'
import sys, re, pathlib

src_idx = pathlib.Path(sys.argv[1]).read_text()
dst_path = pathlib.Path(sys.argv[2])

LETTER_MODAL = '''
  <!-- LETTER FROM DICKIE MODAL -->
  <div id="letter-modal" class="trainer-modal-overlay hidden">
    <div class="letter-card">
      <div class="letter-header">
        <div class="letter-avatar" aria-hidden="true">D</div>
        <div class="letter-header-text">
          <div class="letter-from">Dickie</div>
          <div class="letter-status"><span class="letter-dot"></span> always online for you</div>
        </div>
        <button class="letter-close-btn" id="letter-close-btn" type="button" aria-label="close">✕</button>
      </div>
      <div class="letter-thread" id="letter-thread"></div>
      <div class="letter-footer">
        <button id="letter-dismiss-btn" class="letter-dismiss-btn" type="button">read · close 💜</button>
      </div>
    </div>
  </div>
'''

out = src_idx
out = out.replace('<title>PokeNav</title>', "<title>Shay's PokeNav · 👻💜</title>")
out = out.replace(
    '<span class="nav-logo-subtitle">TEAM DICKIE</span>',
    '<span class="nav-logo-subtitle">TEAM DICKIE · for shay 💜</span>'
)
# Inject letter modal just before the closing </body>
if 'id="letter-modal"' not in out:
    out = out.replace('</body>', LETTER_MODAL + '\n</body>')

dst_path.write_text(out)
print(f"  wrote {len(out)} chars")
PY

echo "→ Patching css/panels/pokedex.css (appending Phase 1 rules if absent)"
python3 - "$SRC_ROOT/css/panels/pokedex.css" "$DST_ROOT/css/panels/pokedex.css" <<'PY'
import sys, pathlib, re

main_css = pathlib.Path(sys.argv[1]).read_text()
shay_path = pathlib.Path(sys.argv[2])
shay_css = shay_path.read_text() if shay_path.exists() else ''

SENTINEL = '/* === SHAY-PATCH-PHASE-1 === */'

if SENTINEL in shay_css:
    print('  already patched, skipping')
    sys.exit(0)

# Pull every rule that uses one of these selectors from main's CSS.
SELECTORS = [
    '.poke-card-matchup-grid',
    '.poke-card-matchup-block',
    '.poke-card-matchup-subhead',
    '.poke-card-move-filter-row',
    '.poke-card-move-filter',
    '.poke-card-move-block',
    '.poke-card-move-subhead',
    '.poke-card-move-row',
    '.poke-card-move-type',
    '.poke-card-move-name',
    '.poke-card-move-stab',
    '.poke-card-move-cat',
    '.poke-card-move-stat',
    '.poke-card-move-score',
    '.poke-card-move-empty',
    '.pokedex-collection-row',
    '.collection-chip',
    '.tile-wanted-star',
]

# Greedy: grab any rule (selector ... { ... }) whose selector mentions one of the new classes.
# Also grab @media blocks containing those.
def extract_rules(css, selectors):
    out_blocks = []
    i = 0
    n = len(css)
    while i < n:
        # find next "{"
        brace = css.find('{', i)
        if brace == -1:
            break
        # selector is everything from i (after preceding '}' or start) to brace
        # but we may be at top level — find the start of this rule
        # simpler: scan back from brace to last '}' or start
        rule_start = max(css.rfind('}', 0, brace), css.rfind('*/', 0, brace), -1) + 1
        # also handle @media/@supports — they have nested braces
        selector_block = css[rule_start:brace]
        # find matching closing brace, accounting for nesting (for @media)
        depth = 1
        j = brace + 1
        while j < n and depth > 0:
            if css[j] == '{': depth += 1
            elif css[j] == '}': depth -= 1
            j += 1
        rule = css[rule_start:j].strip()
        if any(sel in selector_block for sel in selectors) or (
            selector_block.lstrip().startswith('@media') and any(sel in css[brace:j] for sel in selectors)
        ):
            out_blocks.append(rule)
        i = j
    return out_blocks

blocks = extract_rules(main_css, SELECTORS)
if not blocks:
    print('  no Phase 1 rules found in main CSS — nothing to append')
    sys.exit(0)

patch = '\n\n' + SENTINEL + '\n' + '\n\n'.join(blocks) + '\n'
shay_path.write_text(shay_css + patch)
print(f'  appended {len(blocks)} rule blocks ({len(patch)} chars)')
PY

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
