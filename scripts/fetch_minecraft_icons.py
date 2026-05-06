#!/usr/bin/env python3
"""
Fetch vanilla Minecraft item textures from the InventivetalentDev/minecraft-assets
mirror into assets/items/minecraft/. Used by the Academy panel so recipe ingredients
referenced as `minecraft:foo` (Apple, Bread, Stick, Diamond, Iron Ingot, …) and
common vanilla drops actually render.

Sources tried, in order:
  1. textures/item/<name>.png   (most items)
  2. textures/block/<name>.png  (block items: planks, wool, glass, etc.)

Idempotent: skips a basename if the destination file already exists. Reports
misses so missing icons can be hand-curated or remapped.
"""
import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

VERSION = "1.21"
BASE = f"https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/{VERSION}/assets/minecraft/textures"
OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "assets", "items", "minecraft")
DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
COBBLEMON_DIR = os.path.join(os.path.dirname(__file__), "..", "assets", "items", "cobblemon")

# Drop-name → vanilla texture rename. Cobbledex saved drop names like
# "Raw Beef" / "Slimeball" that snake-ify into something different from the
# actual vanilla texture file ("beef.png" / "slime_ball.png").
ALIASES = {
    "raw_beef":         "beef",
    "raw_chicken":      "chicken",
    "raw_cod":          "cod",
    "raw_mutton":       "mutton",
    "raw_porkchop":     "porkchop",
    "raw_rabbit":       "rabbit",
    "raw_salmon":       "salmon",
    "slimeball":        "slime_ball",
    "rabbits_foot":     "rabbit_foot",
    "honey_comb":       "honeycomb",
    "jack_olantern":    "jack_o_lantern",
    "gold_helmet":      "golden_helmet",
    "prismarine_crystal":"prismarine_crystals",
    "glow_ink_sac_1_3":  "glow_ink_sac",
    "glow_ink_sac_2_4":  "glow_ink_sac",
    "dragons_breath":   "dragon_breath",
    "rose":             "poppy",
}

# Items that don't have a flat texture (3D blocks/entities). We pick a sensible
# substitute texture so the icon still renders. None means "skip — no good fallback."
SUBSTITUTE = {
    # 3D blocks → use a representative face texture
    "chest":          "block/oak_planks",       # close enough as an inventory hint
    "ender_chest":    "block/obsidian",
    "trapped_chest":  "block/oak_planks",
    "brewing_stand":  "item/brewing_stand",
    "cake":           "block/cake_top",
    "bed":            "block/red_wool",
    "anvil":          "block/anvil",
    "minecart":       "item/minecart",
    "piston":         "block/piston_top",
    "torch":          "block/torch",
    "redstone_torch": "block/redstone_torch",
    "redstone_lamp":  "block/redstone_lamp",
    "hopper":         "item/hopper",
    "composter":      "block/composter_side",
    "target":         "block/target_top",
    "note_block":     "block/note_block",
    "sea_lantern":    "block/sea_lantern",
    "magma_block":    "block/magma",
    "moss_block":     "block/moss_block",
    "redstone_block": "block/redstone_block",
    "iron_block":     "block/iron_block",
    "iron_trapdoor":  "block/iron_trapdoor",
    "smooth_stone":   "block/smooth_stone",
    "smooth_stone_slab": "block/smooth_stone",
    "stone":          "block/stone",
    "deepslate":      "block/deepslate",
    "cobbled_deepslate": "block/cobbled_deepslate",
    "blackstone":     "block/blackstone",
    "tuff":           "block/tuff",
    "cobblestone":    "block/cobblestone",
    "sand":           "block/sand",
    "sandstone":      "block/sandstone_top",
    "chiseled_sandstone": "block/chiseled_sandstone",
    "dirt":           "block/dirt",
    "coarse_dirt":    "block/coarse_dirt",
    "mud":            "block/mud",
    "clay":           "block/clay",
    "obsidian":       "block/obsidian",
    "glass":          "block/glass",
    "tinted_glass":   "block/tinted_glass",
    "dripstone_block":"block/dripstone_block",
    "sculk":          "block/sculk",
    "bone_block":     "block/bone_block_side",
    "basalt":         "block/basalt_side",
    "calcite":        "block/calcite",
    "blue_ice":       "block/blue_ice",
    "cactus":         "block/cactus_side",
    "bamboo":         "block/bamboo_stalk",
    "gravel":         "block/gravel",
    "dead_bush":      "block/dead_bush",
    "candle":         "block/candle",
    "wool":           "block/white_wool",
    "white_wool":     "block/white_wool",
    "red_wool":       "block/red_wool",
    "blue_wool":      "block/blue_wool",
    "brown_wool":     "block/brown_wool",
    "yellow_wool":    "block/yellow_wool",
    "green_wool":     "block/green_wool",
    "black_wool":     "block/black_wool",
    "gray_wool":      "block/gray_wool",
    "light_gray_wool":"block/light_gray_wool",
    "light_blue_wool":"block/light_blue_wool",
    "lime_wool":      "block/lime_wool",
    "magenta_wool":   "block/magenta_wool",
    "orange_wool":    "block/orange_wool",
    "pink_wool":      "block/pink_wool",
    "purple_wool":    "block/purple_wool",
    "cyan_wool":      "block/cyan_wool",
    "oak_planks":     "block/oak_planks",
    "oak_button":     "block/oak_planks",
    "oak_slab":       "block/oak_planks",
    "acacia_log":     "block/acacia_log",
    "dark_oak_sapling":"block/dark_oak_sapling",
    "pumpkin":        "block/pumpkin_side",
    "melon":          "block/melon_side",
    "pink_petals":    "block/pink_petals",
    "moss_block":     "block/moss_block",
    "glow_lichen":    "block/glow_lichen",
    # Froglights are tall blocks — pick the top texture as a representative.
    "ochre_froglight":       "block/ochre_froglight_top",
    "pearlescent_froglight": "block/pearlescent_froglight_top",
    "verdant_froglight":     "block/verdant_froglight_top",
    "sunflower":             "block/sunflower_front",
}

def needed_basenames():
    """Walk recipes + drops and return the set of minecraft basenames we want."""
    basenames = set()
    # 1. recipes.json
    with open(os.path.join(DATA_DIR, "recipes.json")) as f:
        recipes = json.load(f)
    def visit(slot):
        if slot is None: return
        if isinstance(slot, list):
            for s in slot: visit(s)
            return
        if not isinstance(slot, dict): return
        if "item" in slot and slot["item"].startswith("minecraft:"):
            basenames.add(slot["item"].split(":", 1)[1])
    for r in recipes:
        if isinstance(r.get("result"), str) and r["result"].startswith("minecraft:"):
            basenames.add(r["result"].split(":", 1)[1])
        if r.get("type") == "shaped":
            for s in (r.get("key") or {}).values(): visit(s)
        elif r.get("type") == "shapeless":
            for s in (r.get("ingredients") or []): visit(s)
        elif r.get("type") in ("smelting","blasting","smoking","campfire","stonecutting"):
            visit(r.get("ingredient"))
        elif r.get("type") == "cooking_pot":
            for s in (r.get("ingredients") or []): visit(s)
            for s in (r.get("key") or {}).values(): visit(s)
        elif r.get("type") == "brewing":
            visit(r.get("input")); visit(r.get("bottle"))
        elif r.get("type") == "smithing":
            visit(r.get("base")); visit(r.get("addition")); visit(r.get("template"))

    # 2. Drops without cobblemon icon — likely vanilla
    cobblemon_files = set()
    if os.path.isdir(COBBLEMON_DIR):
        cobblemon_files = {f.replace(".png", "") for f in os.listdir(COBBLEMON_DIR)}

    def snake(s):
        return re.sub(r"_+", "_",
                      re.sub(r"[^a-z0-9]+", "_", s.lower().replace("'", ""))).strip("_")

    for n in range(1, 10):
        with open(os.path.join(DATA_DIR, f"pokemon_gen{n}.json")) as f:
            d = json.load(f)
        for p in d:
            for dr in p.get("drops", []):
                sk = snake(dr.get("item", ""))
                if not sk: continue
                if sk in cobblemon_files: continue
                basenames.add(sk)

    # 3. Tag representatives (used to render tag cells with a real icon).
    for rep in TAG_REPRESENTATIVE_BASENAMES:
        basenames.add(rep)

    return basenames


# Set of basenames that are tag representatives — fetched separately so we
# always have them, regardless of whether the recipe scrape produced them.
TAG_REPRESENTATIVE_BASENAMES = {
    "iron_ingot", "gold_ingot", "copper_ingot", "netherite_ingot",
    "diamond", "amethyst_shard", "lapis_lazuli", "quartz", "prismarine_shard",
    "iron_nugget", "gold_nugget",
    "blaze_rod", "stick", "bone", "string", "slime_ball",
    "iron_block", "brick", "bread", "beef", "wheat", "wheat_seeds",
    "red_mushroom",
    "red_dye","blue_dye","green_dye","yellow_dye","white_dye","black_dye",
    "orange_dye","pink_dye","purple_dye","cyan_dye","magenta_dye","brown_dye",
    "lime_dye","light_blue_dye","light_gray_dye","gray_dye",
    "white_concrete", "bone_meal", "redstone", "chest", "chain", "leather",
    "milk_bucket", "bucket", "shield", "raw_gold",
    "oak_planks", "oak_slab", "white_wool", "oak_button", "fishing_rod",
    "apple",
}


def url_for(basename, kind):
    return f"{BASE}/{kind}/{basename}.png"


def fetch(basename, dest_path):
    sub = SUBSTITUTE.get(basename)
    aliased = ALIASES.get(basename)
    candidates = []
    if sub:
        kind, name = sub.split("/", 1)
        candidates.append(url_for(name, kind))
    if aliased:
        candidates.append(url_for(aliased, "item"))
        candidates.append(url_for(aliased, "block"))
    candidates.append(url_for(basename, "item"))
    candidates.append(url_for(basename, "block"))
    for url in candidates:
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "pokenav-icon-fetcher/1.0"})
            with urllib.request.urlopen(req, timeout=10) as r:
                if r.status == 200:
                    data = r.read()
                    with open(dest_path, "wb") as out:
                        out.write(data)
                    return url
        except urllib.error.HTTPError as e:
            if e.code == 404:
                continue
            raise
        except urllib.error.URLError:
            continue
    return None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true", help="re-download even if file exists")
    parser.add_argument("--limit", type=int, default=0, help="max icons to download (0 = unlimited)")
    args = parser.parse_args()

    os.makedirs(OUT_DIR, exist_ok=True)
    needed = sorted(needed_basenames())
    print(f"Need {len(needed)} basenames", file=sys.stderr)

    have = 0
    fetched = 0
    misses = []
    for i, name in enumerate(needed):
        if args.limit and fetched >= args.limit:
            break
        dest = os.path.join(OUT_DIR, f"{name}.png")
        if os.path.exists(dest) and not args.force:
            have += 1
            continue
        used = fetch(name, dest)
        if used:
            fetched += 1
            print(f"[{i+1}/{len(needed)}] {name}.png  <- {used}", file=sys.stderr)
            time.sleep(0.05)  # be polite to GitHub raw
        else:
            misses.append(name)
            print(f"[{i+1}/{len(needed)}] {name}.png  MISS", file=sys.stderr)

    print(f"\nDone. already-had={have}  fetched={fetched}  misses={len(misses)}", file=sys.stderr)
    if misses:
        print("Missed:", file=sys.stderr)
        for m in misses:
            print(f"  - {m}", file=sys.stderr)


if __name__ == "__main__":
    main()
