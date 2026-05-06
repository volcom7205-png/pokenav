/* PokeNav — 🎓 Pokémon Academy: unified item / TM / drop / recipe hub.
   Session 8 (recipe scale-up): renders shaped, shapeless, smelting (4 cookers),
   stonecutting, brewing, smithing, and cooking-pot recipes; auto-stubs every
   cobblemon: id referenced by a recipe so drill-through always works. */

const Academy = (() => {
  let inited = false;
  let allItems = [];
  let itemsById = new Map();
  let recipes = [];
  let recipesByResult = new Map();      // id -> recipe[]
  let recipesByIngredient = new Map();  // id -> recipe[]
  let tmIndex = [];
  let dropIndex = new Map();
  let activeCategory = 'all';
  let query = '';
  let detailItem = null;
  const itemHistory = [];

  const CATEGORIES = [
    { key: 'all',       label: 'All',       emoji: '◆' },
    { key: 'pokeball',  label: 'Pokéballs', emoji: '⚪' },
    { key: 'berry',     label: 'Berries',   emoji: '🍒' },
    { key: 'battle',    label: 'Battle',    emoji: '🧪' },
    { key: 'vitamin',   label: 'Vitamins',  emoji: '💊' },
    { key: 'food',      label: 'Foods',     emoji: '🍲' },
    { key: 'stone',     label: 'Stones',    emoji: '🪨' },
    { key: 'rod',       label: 'Rods',      emoji: '🎣' },
    { key: 'apricorn',  label: 'Apricorns', emoji: '🍎' },
    { key: 'tm',        label: 'TMs',       emoji: '🎯' },
    { key: 'drop',      label: 'Drops',     emoji: '💧' },
    { key: 'raw',       label: 'Raw',       emoji: '⛏' },
    { key: 'material',  label: 'Materials', emoji: '🧱' },
  ];

  // 'all' chip excludes catch-all auto-stub buckets so the default view stays curated.
  const ALL_EXCLUDES = new Set(['material']);

  // Recipe type → display metadata (header label + emoji + station).
  const RECIPE_TYPE_META = {
    shaped:       { label: 'Crafting recipe',     emoji: '🍳', station: 'Crafting Table' },
    shapeless:    { label: 'Shapeless crafting',  emoji: '🥣', station: 'Crafting Table' },
    smelting:     { label: 'Smelting',            emoji: '🔥', station: 'Furnace' },
    blasting:     { label: 'Blast smelting',      emoji: '💥', station: 'Blast Furnace' },
    smoking:      { label: 'Smoking',             emoji: '💨', station: 'Smoker' },
    campfire:     { label: 'Campfire cooking',    emoji: '🏕️', station: 'Campfire' },
    stonecutting: { label: 'Stonecutting',        emoji: '🪚', station: 'Stonecutter' },
    cooking_pot:  { label: 'Cooking pot',         emoji: '🍲', station: 'Campfire Cooking Pot' },
    brewing:      { label: 'Brewing',             emoji: '🧪', station: 'Brewing Stand' },
    smithing:     { label: 'Smithing',            emoji: '⚒️',  station: 'Smithing Table' },
  };

  // Tag refs don't resolve to single items; show a labelled cell + tooltip (Q11).
  const TAG_LABELS = {
    'cobblemon:tier_1_poke_ball_materials': { short: 'Tier 1', desc: 'Tier 1 Poké Ball materials — iron / copper-tier ingots.' },
    'cobblemon:tier_2_poke_ball_materials': { short: 'Tier 2', desc: 'Tier 2 Poké Ball materials — gold-tier ingots.' },
    'cobblemon:tier_3_poke_ball_materials': { short: 'Tier 3', desc: 'Tier 3 Poké Ball materials — diamond-tier.' },
    'cobblemon:tier_4_poke_ball_materials': { short: 'Tier 4', desc: 'Tier 4 Poké Ball materials — netherite-tier.' },
    'cobblemon:apples':                     { short: 'Apple',     desc: 'Any apple (vanilla or modded).' },
    'cobblemon:apricorns':                  { short: 'Apricorn',  desc: 'Any color of Apricorn.' },
    'cobblemon:apricorn_logs':              { short: 'Apricorn Log', desc: 'Any Apricorn log variant.' },
    'cobblemon:saccharine_logs':            { short: 'Saccharine Log', desc: 'Any Saccharine log variant.' },
    'cobblemon:berries':                    { short: 'Berry',     desc: 'Any Pokémon berry.' },
    'cobblemon:remedy_berries':             { short: 'Remedy Berry', desc: 'Status-curing berry (Cheri/Chesto/Pecha/Rawst/Aspear/Persim/Lum).' },
    'cobblemon:full_heal_ingredients':      { short: 'Full Heal Mat', desc: 'Cobblemon ingredient tag for Full Heal brewing.' },
    'cobblemon:super_potion_ingredients':   { short: 'Super Potion Mat', desc: 'Cobblemon ingredient tag for Super Potion brewing.' },
    'cobblemon:full_heal_bottles':          { short: 'Heal Bottle', desc: 'Bottle base used for full-heal brews.' },
    'cobblemon:plaques':                    { short: 'Plaque', desc: 'Any color of decorative plaque.' },
    'cobblemon:pokedex_screen':             { short: 'Pokédex Screen', desc: 'Pokédex assembly base.' },
    'cobblemon:sandwich_veggies':           { short: 'Sandwich Veg', desc: 'Any Pokémon-sandwich vegetable.' },
    'c:ingots/iron':       { short: 'Iron',     desc: 'Any iron ingot (vanilla or modded — Common tag).' },
    'c:ingots/gold':       { short: 'Gold',     desc: 'Any gold ingot (vanilla or modded).' },
    'c:ingots/copper':     { short: 'Copper',   desc: 'Any copper ingot (vanilla or modded).' },
    'c:ingots/netherite':  { short: 'Netherite', desc: 'Any netherite ingot.' },
    'c:gems/diamond':      { short: 'Diamond', desc: 'Any diamond gem.' },
    'c:gems/amethyst':     { short: 'Amethyst', desc: 'Any amethyst shard.' },
    'c:gems/lapis':        { short: 'Lapis',   desc: 'Any lapis lazuli.' },
    'c:gems/quartz':       { short: 'Quartz',  desc: 'Any quartz gem.' },
    'c:gems/prismarine':   { short: 'Prismarine', desc: 'Any prismarine shard.' },
    'c:nuggets/iron':      { short: 'Iron Nug', desc: 'Iron nugget (vanilla or modded).' },
    'c:nuggets/gold':      { short: 'Gold Nug', desc: 'Gold nugget (vanilla or modded).' },
    'c:rods/blaze':        { short: 'Blaze Rod', desc: 'Blaze rod (vanilla or modded).' },
    'c:rods/wooden':       { short: 'Stick',   desc: 'Any wooden rod / stick.' },
    'c:bones':             { short: 'Bone',    desc: 'Any bone item.' },
    'c:strings':           { short: 'String',  desc: 'Any string-type item.' },
    'c:slime_balls':       { short: 'Slime Ball', desc: 'Any slime ball.' },
    'c:storage_blocks/iron': { short: 'Iron Block', desc: 'Solid iron block.' },
    'c:bricks/normal':     { short: 'Brick',   desc: 'Any brick block.' },
    'c:foods/bread':       { short: 'Bread',   desc: 'Any bread food.' },
    'c:foods/raw_meat':    { short: 'Raw Meat', desc: 'Any raw-meat food.' },
    'c:crops/wheat':       { short: 'Wheat',   desc: 'Any wheat crop.' },
    'c:seeds':             { short: 'Seeds',   desc: 'Any plantable seeds.' },
    'c:mushrooms':         { short: 'Mushroom', desc: 'Any mushroom.' },
    'c:dyes/red':          { short: 'Red Dye', desc: 'Any red dye.' },
    'c:dyes/blue':         { short: 'Blue Dye', desc: 'Any blue dye.' },
    'c:dyes/green':        { short: 'Green Dye', desc: 'Any green dye.' },
    'c:dyes/yellow':       { short: 'Yellow Dye', desc: 'Any yellow dye.' },
    'c:dyes/white':        { short: 'White Dye', desc: 'Any white dye.' },
    'c:dyes/black':        { short: 'Black Dye', desc: 'Any black dye.' },
    'c:dyes/orange':       { short: 'Orange Dye', desc: 'Any orange dye.' },
    'c:dyes/pink':         { short: 'Pink Dye', desc: 'Any pink dye.' },
    'c:dyes/purple':       { short: 'Purple Dye', desc: 'Any purple dye.' },
    'c:dyes/cyan':         { short: 'Cyan Dye', desc: 'Any cyan dye.' },
    'c:dyes/magenta':      { short: 'Magenta Dye', desc: 'Any magenta dye.' },
    'c:dyes/brown':        { short: 'Brown Dye', desc: 'Any brown dye.' },
    'c:dyes/lime':         { short: 'Lime Dye', desc: 'Any lime dye.' },
    'c:dyes/light_blue':   { short: 'L.Blue Dye', desc: 'Any light-blue dye.' },
    'c:dyes/light_gray':   { short: 'L.Gray Dye', desc: 'Any light-gray dye.' },
    'c:dyes/gray':         { short: 'Gray Dye', desc: 'Any gray dye.' },
    'c:concretes':         { short: 'Concrete', desc: 'Any colored concrete block.' },
    'c:fertilizers':       { short: 'Fertilizer', desc: 'Any fertilizer (bone meal etc.).' },
    'c:dusts/redstone':    { short: 'Redstone', desc: 'Redstone dust.' },
    'c:chests/wooden':     { short: 'Chest',   desc: 'Any wooden chest.' },
    'c:chains':            { short: 'Chain',   desc: 'Any iron chain.' },
    'c:leathers':          { short: 'Leather', desc: 'Any leather.' },
    'c:drinks/milk':       { short: 'Milk',    desc: 'Any milk bucket / bottle.' },
    'c:buckets/empty':     { short: 'Bucket',  desc: 'Empty bucket.' },
    'c:tools/shield':      { short: 'Shield',  desc: 'Any shield.' },
    'c:raw_materials/gold': { short: 'Raw Gold', desc: 'Raw gold ore drop.' },
    'minecraft:planks':    { short: 'Planks',  desc: 'Any wooden planks.' },
    'minecraft:wooden_slabs': { short: 'Wood Slab', desc: 'Any wooden slab.' },
    'minecraft:wool':      { short: 'Wool',    desc: 'Any wool block.' },
    'minecraft:buttons':   { short: 'Button',  desc: 'Any button.' },
    'minecraft:enchantable/fishing': { short: 'Fishing Rod', desc: 'Any fishing rod.' },
  };

  // Tag → representative item id (rendered as the cell icon so users see a
  // concrete thing — diamond instead of "Tier 3", iron ingot instead of "Iron").
  // The "TAG" corner badge stays so it's still visually distinct from a
  // literal-item slot.
  const TAG_REPRESENTATIVES = {
    'cobblemon:tier_1_poke_ball_materials': 'minecraft:iron_ingot',
    'cobblemon:tier_2_poke_ball_materials': 'minecraft:gold_ingot',
    'cobblemon:tier_3_poke_ball_materials': 'minecraft:diamond',
    'cobblemon:tier_4_poke_ball_materials': 'minecraft:netherite_ingot',
    'cobblemon:apples':                     'minecraft:apple',
    'cobblemon:apricorns':                  'cobblemon:red_apricorn',
    'cobblemon:apricorn_logs':              'cobblemon:apricorn_sign',
    'cobblemon:saccharine_logs':            'cobblemon:saccharine_sign',
    'cobblemon:berries':                    'cobblemon:cheri_berry',
    'cobblemon:remedy_berries':             'cobblemon:cheri_berry',
    'cobblemon:full_heal_ingredients':      'cobblemon:pecha_berry',
    'cobblemon:super_potion_ingredients':   'cobblemon:oran_berry',
    'cobblemon:full_heal_bottles':          'minecraft:glass_bottle',
    'cobblemon:pokedex_screen':             'cobblemon:pokedex_red',
    'cobblemon:sandwich_veggies':           'minecraft:carrot',
    'c:ingots/iron':       'minecraft:iron_ingot',
    'c:ingots/gold':       'minecraft:gold_ingot',
    'c:ingots/copper':     'minecraft:copper_ingot',
    'c:ingots/netherite':  'minecraft:netherite_ingot',
    'c:gems/diamond':      'minecraft:diamond',
    'c:gems/amethyst':     'minecraft:amethyst_shard',
    'c:gems/lapis':        'minecraft:lapis_lazuli',
    'c:gems/quartz':       'minecraft:quartz',
    'c:gems/prismarine':   'minecraft:prismarine_shard',
    'c:nuggets/iron':      'minecraft:iron_nugget',
    'c:nuggets/gold':      'minecraft:gold_nugget',
    'c:rods/blaze':        'minecraft:blaze_rod',
    'c:rods/wooden':       'minecraft:stick',
    'c:bones':             'minecraft:bone',
    'c:strings':           'minecraft:string',
    'c:slime_balls':       'minecraft:slime_ball',
    'c:storage_blocks/iron': 'minecraft:iron_block',
    'c:bricks/normal':     'minecraft:brick',
    'c:foods/bread':       'minecraft:bread',
    'c:foods/raw_meat':    'minecraft:beef',
    'c:crops/wheat':       'minecraft:wheat',
    'c:seeds':             'minecraft:wheat_seeds',
    'c:mushrooms':         'minecraft:red_mushroom',
    'c:dyes/red':          'minecraft:red_dye',
    'c:dyes/blue':         'minecraft:blue_dye',
    'c:dyes/green':        'minecraft:green_dye',
    'c:dyes/yellow':       'minecraft:yellow_dye',
    'c:dyes/white':        'minecraft:white_dye',
    'c:dyes/black':        'minecraft:black_dye',
    'c:dyes/orange':       'minecraft:orange_dye',
    'c:dyes/pink':         'minecraft:pink_dye',
    'c:dyes/purple':       'minecraft:purple_dye',
    'c:dyes/cyan':         'minecraft:cyan_dye',
    'c:dyes/magenta':      'minecraft:magenta_dye',
    'c:dyes/brown':        'minecraft:brown_dye',
    'c:dyes/lime':         'minecraft:lime_dye',
    'c:dyes/light_blue':   'minecraft:light_blue_dye',
    'c:dyes/light_gray':   'minecraft:light_gray_dye',
    'c:dyes/gray':         'minecraft:gray_dye',
    'c:concretes':         'minecraft:white_concrete',
    'c:fertilizers':       'minecraft:bone_meal',
    'c:dusts/redstone':    'minecraft:redstone',
    'c:chests/wooden':     'minecraft:chest',
    'c:chains':            'minecraft:chain',
    'c:leathers':          'minecraft:leather',
    'c:drinks/milk':       'minecraft:milk_bucket',
    'c:buckets/empty':     'minecraft:bucket',
    // 'c:tools/shield': no flat shield texture — falls back to text "Shield".
    'c:raw_materials/gold':'minecraft:raw_gold',
    'minecraft:planks':    'minecraft:oak_planks',
    'minecraft:wooden_slabs': 'minecraft:oak_slab',
    'minecraft:wool':      'minecraft:white_wool',
    'minecraft:buttons':   'minecraft:oak_button',
    'minecraft:enchantable/fishing': 'minecraft:fishing_rod',
  };

  async function init() {
    if (inited) return;
    inited = true;
    await PokeNavData.load();

    const itemsRes = window.POKENAV_ITEMS || [];
    const recipesRes = window.POKENAV_RECIPES || [];

    recipes = recipesRes;
    indexRecipes();

    const allMon = PokeNavData.getPokemon();
    buildTmIndex(allMon);
    buildDropIndex(allMon);

    const baseItems = itemsRes.map(normalizeItem);
    autoLinkBerryIds(baseItems);

    const baseNames = new Set(baseItems.map(i => i.name));
    const baseIds = new Set(baseItems.filter(i => i.id).map(i => i.id));
    const tmItems = tmIndex.map(tmAsItem);
    const tmNames = new Set(tmItems.map(t => t.name));
    const orphanDropItems = [...dropIndex.keys()]
      .filter(n => !baseNames.has(n) && !tmNames.has(n))
      .map(dropAsItem);

    // Auto-stub every cobblemon: id referenced by a recipe (result or ingredient)
    // so click-through inside the detail view always lands on something.
    const stubs = synthesizeStubs(baseIds, baseNames);

    allItems = [...baseItems, ...tmItems, ...orphanDropItems, ...stubs];
    itemsById = new Map(allItems.filter(i => i.id).map(i => [i.id, i]));

    renderShell();
    renderActive();
  }

  function indexRecipes() {
    recipesByResult = new Map();
    recipesByIngredient = new Map();
    for (const r of recipes) {
      pushTo(recipesByResult, r.result, r);
      const seen = new Set();
      forEachIngredientId(r, id => {
        if (seen.has(id)) return;
        seen.add(id);
        pushTo(recipesByIngredient, id, r);
      });
    }
  }

  function pushTo(map, key, val) {
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(val);
  }

  function forEachIngredientId(recipe, cb) {
    const visit = (slot) => {
      if (!slot) return;
      if (Array.isArray(slot)) { slot.forEach(visit); return; }
      if (slot.item) cb(slot.item);
    };
    if (recipe.type === 'shaped' || (recipe.type === 'cooking_pot' && recipe.key)) {
      for (const slot of Object.values(recipe.key || {})) visit(slot);
    } else if (recipe.type === 'shapeless' || recipe.type === 'cooking_pot') {
      (recipe.ingredients || []).forEach(visit);
    } else if (['smelting','blasting','smoking','campfire','stonecutting'].includes(recipe.type)) {
      visit(recipe.ingredient);
    } else if (recipe.type === 'brewing') {
      visit(recipe.input); visit(recipe.bottle);
    } else if (recipe.type === 'smithing') {
      visit(recipe.base); visit(recipe.addition); visit(recipe.template);
    }
  }

  function snakeify(s) {
    return s.toLowerCase()
      .replace(/[.']/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  // Curated entries (e.g. "Cheri Berry") get auto-linked to cobblemon:cheri_berry
  // when a recipe references that id — no need to hand-tag every one.
  function autoLinkBerryIds(items) {
    const referenced = new Set();
    for (const r of recipes) {
      referenced.add(r.result);
      forEachIngredientId(r, id => referenced.add(id));
    }
    for (const item of items) {
      if (item.id) continue;
      const candidate = `cobblemon:${snakeify(item.name)}`;
      if (referenced.has(candidate)) {
        item.id = candidate;
        if (!item.icon) item.icon = iconPathFromId(candidate);
      }
    }
  }

  function synthesizeStubs(baseIds, baseNames) {
    const need = new Set();
    for (const r of recipes) {
      need.add(r.result);
      forEachIngredientId(r, id => need.add(id));
    }
    const stubs = [];
    for (const id of need) {
      if (baseIds.has(id)) continue;
      if (!id.startsWith('cobblemon:')) continue;
      const name = prettyId(id);
      if (baseNames.has(name)) continue;
      stubs.push({
        id,
        name,
        category: inferStubCategory(id),
        icon: iconPathFromId(id),
        auto: true,
      });
    }
    return stubs;
  }

  function inferStubCategory(id) {
    const short = id.split(':').pop() || '';
    if (short.endsWith('_rod')) return 'rod';
    if (short.endsWith('_stone')) return 'stone';   // Tumblestones are explicit 'raw' in items.json (id-set)
    if (short.endsWith('_ball')) return 'pokeball';
    if (short.endsWith('_apricorn')) return 'apricorn';
    if (short.endsWith('_berry') || short === 'candied_berry') return 'berry';
    if (short.includes('candy')) return 'vitamin';
    if (short === 'poke_cake' || short === 'poke_snack' || short === 'ponigiri') return 'food';
    if (/(^|_)(soup|stew|curry|sandwich|tea|brew)$/.test(short)) return 'food';
    if (/(_log|_planks|_wood|_slab|_stairs|_wall|_fence|_door|_button|_pressure_plate|_trapdoor)/.test(short)) return 'material';
    if (/(_block|_ore|_bricks?|_plaque|_chest)$/.test(short)) return 'material';
    return 'material';
  }

  function normalizeItem(raw) {
    const icon = raw.icon || (raw.id ? iconPathFromId(raw.id) : null);
    return { ...raw, icon };
  }

  function iconPathFromId(id) {
    const [ns, base] = id.split(':');
    if (!ns || !base) return null;
    return `assets/items/${ns}/${base}.png`;
  }

  function buildTmIndex(allMon) {
    const learners = new Map();
    for (const p of allMon) {
      for (const m of (p.learnableMoves || [])) {
        if (m.method !== 'tm') continue;
        if (!learners.has(m.name)) learners.set(m.name, new Set());
        learners.get(m.name).add(p.id);
      }
    }
    tmIndex = [...learners.entries()]
      .map(([name, ids]) => {
        const move = PokeNavData.getMoveByName(name);
        return move ? { ...move, learnerIds: [...ids].sort((a, b) => a - b) } : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  function tmAsItem(tm) {
    return {
      name: tm.name,
      category: 'tm',
      description: `${tm.type} · ${tm.category || '—'} · ${tm.power || '—'} pwr · ${tm.accuracy || '—'}% acc`,
      icon: `assets/types/${tm.type.toLowerCase()}.png`,
      tm,
    };
  }

  function buildDropIndex(allMon) {
    dropIndex = new Map();
    for (const p of allMon) {
      for (const drop of (p.drops || [])) {
        const name = drop.item;
        if (!dropIndex.has(name)) dropIndex.set(name, []);
        const list = dropIndex.get(name);
        if (list.some(d => d.pokemon.id === p.id)) continue;
        const amount = drop.chance || (drop.quantity ? drop.quantity : '1');
        list.push({ pokemon: p, amount });
      }
    }
  }

  function dropAsItem(name) {
    const { id, icon } = resolveIconForName(name);
    return {
      id,
      name,
      category: 'drop',
      description: `Dropped by ${dropIndex.get(name).length} Pokémon`,
      icon,
    };
  }

  // Pick the correct namespace + icon for a plain item name. Vanilla drops
  // (Apple, Bone, Feather) live under minecraft:, cobblemon items under
  // cobblemon:. Falls back to cobblemon: with null icon when no PNG exists,
  // letting the in-cell text fallback take over.
  let _iconLookup = null;
  function resolveIconForName(name) {
    if (!_iconLookup) {
      const m = window.POKENAV_ICON_MANIFEST || { cobblemon: [], minecraft: [] };
      _iconLookup = {
        cobblemon: new Set(m.cobblemon),
        minecraft: new Set(m.minecraft),
      };
    }
    const sk = snakeify(name);
    if (_iconLookup.cobblemon.has(sk)) {
      return { id: `cobblemon:${sk}`, icon: `assets/items/cobblemon/${sk}.png` };
    }
    if (_iconLookup.minecraft.has(sk)) {
      return { id: `minecraft:${sk}`, icon: `assets/items/minecraft/${sk}.png` };
    }
    return { id: `cobblemon:${sk}`, icon: null };
  }

  // ── Rendering ────────────────────────────────────────────

  function renderShell() {
    const root = document.getElementById('panel-academy');
    if (!root) return;
    root.innerHTML = `
      <div class="academy-toolbar">
        <input type="text" id="academy-search" placeholder="Search Academy..." autocomplete="off">
      </div>
      <div class="academy-cat-row">
        ${CATEGORIES.map(c => `
          <button class="academy-cat-btn ${c.key === activeCategory ? 'active' : ''}"
                  data-cat="${c.key}" type="button">${c.emoji} ${c.label}</button>
        `).join('')}
      </div>
      <div id="academy-body" class="academy-body"></div>
    `;

    root.querySelectorAll('.academy-cat-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        activeCategory = btn.dataset.cat;
        detailItem = null;
        itemHistory.length = 0;
        root.querySelectorAll('.academy-cat-btn').forEach(b =>
          b.classList.toggle('active', b === btn));
        renderActive();
      });
    });

    document.getElementById('academy-search').addEventListener('input', e => {
      query = e.target.value.trim().toLowerCase();
      detailItem = null;
      itemHistory.length = 0;
      renderActive();
    });
  }

  function renderActive() {
    if (detailItem) renderDetail();
    else renderGrid();
  }

  function filteredItems() {
    return allItems
      .filter(i => matchesActiveCategory(i) || (query && matchesQuery(i)))
      .filter(i => !query || matchesQuery(i))
      .sort((a, b) => {
        if (a.category !== b.category) {
          return categoryOrder(a.category) - categoryOrder(b.category);
        }
        return a.name.localeCompare(b.name);
      });
  }

  function matchesActiveCategory(item) {
    if (activeCategory === 'all') return !ALL_EXCLUDES.has(item.category);
    if (activeCategory === 'drop') return dropIndex.has(item.name);
    return item.category === activeCategory;
  }

  function matchesQuery(item) {
    return item.name.toLowerCase().includes(query)
        || (item.description || '').toLowerCase().includes(query);
  }

  function categoryOrder(cat) {
    const idx = CATEGORIES.findIndex(c => c.key === cat);
    return idx === -1 ? 999 : idx;
  }

  function renderGrid() {
    const body = document.getElementById('academy-body');
    if (!body) return;
    const list = filteredItems();
    if (!list.length) {
      body.innerHTML = `<div class="academy-empty">No items match.</div>`;
      return;
    }
    body.innerHTML = `
      <div class="academy-grid">
        ${list.map(renderTile).join('')}
      </div>
    `;
    body.querySelectorAll('.academy-tile').forEach(tile => {
      tile.addEventListener('click', () => {
        const name = tile.dataset.name;
        const item = allItems.find(i => i.name === name);
        if (item) openItem(item);
      });
    });
  }

  function renderTile(item) {
    const meta = CATEGORIES.find(c => c.key === item.category);
    const iconHtml = item.icon
      ? `<img class="academy-tile-icon" src="${item.icon}" alt="${escapeAttr(item.name)}" onerror="this.style.display='none';this.nextElementSibling&&this.nextElementSibling.classList.remove('academy-tile-icon-fallback--hidden')">
         <div class="academy-tile-icon academy-tile-icon-fallback academy-tile-icon-fallback--hidden">${meta ? meta.emoji : '◆'}</div>`
      : `<div class="academy-tile-icon academy-tile-icon--placeholder">${meta ? meta.emoji : '◆'}</div>`;
    return `
      <div class="academy-tile" data-name="${escapeAttr(item.name)}" data-cat="${item.category}">
        ${iconHtml}
        <div class="academy-tile-info">
          <div class="academy-tile-name">${item.name}</div>
          <div class="academy-tile-cat">${meta ? meta.label : item.category}</div>
        </div>
      </div>
    `;
  }

  function renderDetail() {
    const body = document.getElementById('academy-body');
    if (!body || !detailItem) return;
    const item = detailItem;
    const meta = CATEGORIES.find(c => c.key === item.category);
    const iconHtml = item.icon
      ? `<img class="academy-detail-icon" src="${item.icon}" alt="${escapeAttr(item.name)}" onerror="this.style.display='none'">`
      : `<div class="academy-detail-icon academy-detail-icon--placeholder">${meta ? meta.emoji : '◆'}</div>`;

    body.innerHTML = `
      <div class="academy-detail">
        <button class="academy-back-btn" type="button">← back</button>
        <div class="academy-detail-head">
          ${iconHtml}
          <div class="academy-detail-titles">
            <div class="academy-detail-name">${item.name}</div>
            <div class="academy-detail-cat">${meta ? meta.emoji + ' ' + meta.label : item.category}</div>
            ${item.description ? `<div class="academy-detail-desc">${item.description}</div>` : ''}
          </div>
        </div>
        <div class="academy-detail-sections">
          ${renderDetailSections(item)}
        </div>
      </div>
    `;

    body.querySelector('.academy-back-btn').addEventListener('click', back);
    body.querySelectorAll('[data-ingredient-id]').forEach(el => {
      el.addEventListener('click', () => openItem(el.dataset.ingredientId));
    });
    body.querySelectorAll('[data-result-id]').forEach(el => {
      el.addEventListener('click', () => openItem(el.dataset.resultId));
    });
    body.querySelectorAll('[data-mon-id]').forEach(el => {
      el.addEventListener('click', () => goToPokedex(Number(el.dataset.monId)));
    });
  }

  function renderDetailSections(item) {
    if (item.category === 'tm') return renderTmSection(item);

    const parts = [];
    const myRecipes = item.id ? (recipesByResult.get(item.id) || []) : [];
    for (const r of myRecipes) parts.push(renderRecipeSection(item, r));

    if (item.id && (recipesByIngredient.get(item.id) || []).length) {
      parts.push(renderUsedInSection(item));
    }

    if (dropIndex.has(item.name)) {
      parts.push(renderDroppedBySection(item));
    }

    if (!parts.length) {
      parts.push(`<div class="academy-section-placeholder academy-section-placeholder--standalone">No additional info yet for this item.</div>`);
    }
    return parts.join('');
  }

  // ── Recipe section dispatcher ─────────────────────────

  function renderRecipeSection(item, recipe) {
    const meta = RECIPE_TYPE_META[recipe.type] || { label: recipe.type, emoji: '🔧', station: recipe.type };
    const head = `<div class="academy-section-head">${meta.emoji} ${meta.label}<span class="academy-section-station"> · ${meta.station}</span></div>`;
    let body = '';
    if (recipe.type === 'shaped' || (recipe.type === 'cooking_pot' && recipe.key)) {
      body = renderShapedBody(item, recipe);
    } else if (recipe.type === 'shapeless' || recipe.type === 'cooking_pot') {
      body = renderShapelessBody(item, recipe);
    } else if (['smelting','blasting','smoking','campfire'].includes(recipe.type)) {
      body = renderCookerBody(item, recipe);
    } else if (recipe.type === 'stonecutting') {
      body = renderCookerBody(item, recipe, /*hideTime*/ true);
    } else if (recipe.type === 'brewing') {
      body = renderBrewingBody(item, recipe);
    } else if (recipe.type === 'smithing') {
      body = renderSmithingBody(item, recipe);
    } else {
      body = `<div class="academy-section-placeholder">Unsupported recipe type: ${recipe.type}.</div>`;
    }
    return `<section class="academy-section">${head}${body}</section>`;
  }

  // Shaped 3×3 grid (also used for cooking-pot patterned recipes).
  function renderShapedBody(item, recipe) {
    const rows = [0, 1, 2].map(i => (recipe.pattern[i] || '   ').padEnd(3, ' '));
    const cells = [];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        cells.push(renderRecipeCell(rows[r][c], recipe.key));
      }
    }
    return `
      <div class="academy-recipe">
        <div class="academy-recipe-grid">${cells.join('')}</div>
        <div class="academy-recipe-arrow">→</div>
        ${renderResultCell(item, recipe)}
      </div>
      ${renderRecipeLegend(recipe.key)}
    `;
  }

  function renderShapelessBody(item, recipe) {
    const ings = (recipe.ingredients || []).filter(Boolean);
    const cells = ings.map(ref => renderIngredientChip(ref));
    return `
      <div class="academy-recipe">
        <div class="academy-shapeless-list">${cells.join('') || '<span class="academy-empty-mini">no ingredients</span>'}</div>
        <div class="academy-recipe-arrow">→</div>
        ${renderResultCell(item, recipe)}
      </div>
    `;
  }

  function renderCookerBody(item, recipe, hideTime = false) {
    const ing = renderIngredientChip(recipe.ingredient);
    const meta = [];
    if (!hideTime && recipe.time) meta.push(`${(recipe.time / 20).toFixed(1)}s`);
    if (recipe.xp) meta.push(`${recipe.xp} xp`);
    return `
      <div class="academy-recipe">
        <div class="academy-shapeless-list">${ing}</div>
        <div class="academy-recipe-arrow">→</div>
        ${renderResultCell(item, recipe)}
        ${meta.length ? `<div class="academy-recipe-station-meta">${meta.join(' · ')}</div>` : ''}
      </div>
    `;
  }

  function renderBrewingBody(item, recipe) {
    return `
      <div class="academy-recipe academy-recipe--brewing">
        <div class="academy-brewing-stack">
          <div class="academy-brewing-input">${renderIngredientChip(recipe.input)}</div>
          <div class="academy-brewing-arrow">↓</div>
          <div class="academy-brewing-bottle">${renderIngredientChip(recipe.bottle)}</div>
        </div>
        <div class="academy-recipe-arrow">→</div>
        ${renderResultCell(item, recipe)}
      </div>
    `;
  }

  function renderSmithingBody(item, recipe) {
    const parts = [recipe.template, recipe.base, recipe.addition]
      .filter(Boolean).map(renderIngredientChip);
    return `
      <div class="academy-recipe">
        <div class="academy-shapeless-list">${parts.join('')}</div>
        <div class="academy-recipe-arrow">→</div>
        ${renderResultCell(item, recipe)}
      </div>
    `;
  }

  // ── Recipe atoms (cells + legend) ──────────────────────

  function renderRecipeCell(letter, key) {
    if (!letter || letter === ' ') {
      return `<div class="academy-recipe-cell academy-recipe-cell--empty"></div>`;
    }
    const entry = key && key[letter];
    if (!entry) {
      return `<div class="academy-recipe-cell academy-recipe-cell--empty" data-key="${letter}"></div>`;
    }
    return wrapRecipeCell(entry);
  }

  function wrapRecipeCell(entry) {
    if (Array.isArray(entry)) {
      // option list — render the first in the cell, with a tooltip showing all
      const first = entry[0];
      const tip = entry.map(refLabel).join(' · ');
      return cellFromRef(first, tip);
    }
    return cellFromRef(entry);
  }

  function cellFromRef(ref, tipOverride) {
    if (!ref) return `<div class="academy-recipe-cell academy-recipe-cell--empty"></div>`;
    if (Array.isArray(ref)) {
      const first = ref[0];
      const tip = tipOverride || ref.map(refLabel).join(' · ');
      return cellFromRef(first, tip);
    }
    if (ref.item) {
      const ing = itemsById.get(ref.item);
      const name = ing ? ing.name : prettyId(ref.item);
      const icon = ing && ing.icon ? ing.icon : iconPathFromId(ref.item);
      const clickable = ing ? `data-ingredient-id="${ref.item}"` : '';
      const iconHtml = icon
        ? `<img src="${icon}" alt="${escapeAttr(name)}" onerror="this.parentElement.classList.add('academy-recipe-cell--noicon')">
           <span class="academy-recipe-cell-name">${escapeAttr(name)}</span>`
        : `<span class="academy-recipe-cell-name">${escapeAttr(name)}</span>`;
      return `
        <div class="academy-recipe-cell ${clickable ? 'academy-recipe-cell--clickable' : ''}"
             ${clickable} title="${escapeAttr(tipOverride || name)}">
          ${iconHtml}
        </div>
      `;
    }
    if (ref.tag) {
      const tag = TAG_LABELS[ref.tag] || { short: prettyTagShort(ref.tag), desc: ref.tag };
      const repId = TAG_REPRESENTATIVES[ref.tag];
      const repName = repId ? prettyId(repId) : tag.short;
      const repIcon = repId ? iconPathFromId(repId) : null;
      const tip = tipOverride || `${tag.short} — ${tag.desc}`;
      const inner = repIcon
        ? `<img src="${repIcon}" alt="${escapeAttr(repName)}" onerror="this.parentElement.classList.add('academy-recipe-cell--noicon')">
           <span class="academy-recipe-cell-name">${escapeAttr(tag.short)}</span>`
        : `<span class="academy-recipe-cell-name">${escapeAttr(tag.short)}</span>`;
      return `
        <div class="academy-recipe-cell academy-recipe-cell--tag" title="${escapeAttr(tip)}">
          ${inner}
          <span class="academy-recipe-tag-badge">TAG</span>
        </div>
      `;
    }
    return `<div class="academy-recipe-cell academy-recipe-cell--empty"></div>`;
  }

  function renderIngredientChip(ref) {
    return `<div class="academy-shapeless-cell">${cellFromRef(ref)}</div>`;
  }

  function refLabel(ref) {
    if (!ref) return '?';
    if (Array.isArray(ref)) return ref.map(refLabel).join(' / ');
    if (ref.item) {
      const ing = itemsById.get(ref.item);
      return ing ? ing.name : prettyId(ref.item);
    }
    if (ref.tag) {
      const tag = TAG_LABELS[ref.tag];
      return tag ? `[${tag.short}]` : `[${ref.tag.split(':').pop()}]`;
    }
    return '?';
  }

  function renderResultCell(item, recipe) {
    const outItem = itemsById.get(recipe.result) || item;
    const icon = outItem.icon || iconPathFromId(recipe.result);
    const iconHtml = icon
      ? `<img src="${icon}" alt="${escapeAttr(outItem.name)}" onerror="this.parentElement.classList.add('academy-recipe-result--noicon')">
         <span class="academy-recipe-result-name">${escapeAttr(outItem.name)}</span>`
      : `<span class="academy-recipe-result-name">${escapeAttr(outItem.name)}</span>`;
    const count = recipe.count && recipe.count > 1 ? `<div class="academy-recipe-count">×${recipe.count}</div>` : '';
    return `
      <div class="academy-recipe-result" title="${escapeAttr(outItem.name)}">
        ${iconHtml}
        ${count}
      </div>
    `;
  }

  function renderRecipeLegend(key) {
    if (!key) return '';
    const entries = Object.entries(key).map(([letter, v]) => {
      if (Array.isArray(v) && v.length) v = v[0];
      if (v && v.item) {
        const ing = itemsById.get(v.item);
        const name = ing ? ing.name : prettyId(v.item);
        const clickable = ing ? `data-ingredient-id="${v.item}"` : '';
        return `
          <div class="academy-recipe-legend-row ${clickable ? 'academy-recipe-legend-row--clickable' : ''}" ${clickable}>
            <span class="academy-recipe-legend-letter">${letter}</span>
            <span class="academy-recipe-legend-name">${name}</span>
          </div>
        `;
      }
      if (v && v.tag) {
        const tag = TAG_LABELS[v.tag] || { short: prettyTagShort(v.tag), desc: v.tag };
        return `
          <div class="academy-recipe-legend-row academy-recipe-legend-row--tag">
            <span class="academy-recipe-legend-letter">${letter}</span>
            <div class="academy-recipe-legend-tag-text">
              <span class="academy-recipe-legend-name">${escapeAttr(tag.short)}</span>
              <span class="academy-recipe-legend-tag-desc">${escapeAttr(tag.desc)}</span>
            </div>
            <span class="academy-recipe-legend-tag-hint">tag</span>
          </div>
        `;
      }
      return '';
    });
    return `<div class="academy-recipe-legend">${entries.join('')}</div>`;
  }

  function renderUsedInSection(item) {
    const list = recipesByIngredient.get(item.id) || [];
    // Dedupe by result — same result can have multiple recipes; only show the result tile once.
    const seen = new Set();
    const tiles = [];
    for (const r of list) {
      if (seen.has(r.result)) continue;
      seen.add(r.result);
      const result = itemsById.get(r.result);
      const name = result ? result.name : prettyId(r.result);
      const icon = (result && result.icon) || iconPathFromId(r.result);
      const iconHtml = icon
        ? `<img src="${icon}" alt="${escapeAttr(name)}" onerror="this.style.display='none'">`
        : `<div class="academy-usedin-icon-fallback">◆</div>`;
      tiles.push(`
        <div class="academy-usedin-tile" data-result-id="${r.result}">
          ${iconHtml}
          <span class="academy-usedin-name">${name}</span>
        </div>
      `);
    }
    return `
      <section class="academy-section">
        <div class="academy-section-head">🧬 Used in recipes — ${tiles.length}</div>
        <div class="academy-usedin-grid">${tiles.join('')}</div>
      </section>
    `;
  }

  function renderDroppedBySection(item) {
    const droppers = dropIndex.get(item.name) || [];
    const rows = droppers.map(({ pokemon, amount }) => `
      <div class="academy-dropper" data-mon-id="${pokemon.id}">
        <img class="academy-dropper-sprite"
             src="${spriteUrl(pokemon.id)}"
             onerror="${spriteFallbackOnError(pokemon.id)}"
             alt="${pokemon.name}">
        <div class="academy-dropper-info">
          <div class="academy-dropper-name">${pokemon.name}</div>
          <div class="academy-dropper-meta">
            <span class="academy-dropper-num">#${String(pokemon.id).padStart(4, '0')}</span>
            <span class="academy-dropper-types">${pokemon.types.map(t => typeIconHTMLCompact(t)).join('')}</span>
          </div>
        </div>
        <span class="academy-dropper-amount">${amount}</span>
        <span class="academy-dropper-arrow">→</span>
      </div>
    `).join('');
    return `
      <section class="academy-section">
        <div class="academy-section-head">💧 Dropped by — ${droppers.length} Pokémon</div>
        <div class="academy-droppers-list">${rows}</div>
      </section>
    `;
  }

  function prettyId(id) {
    const base = (id.split(':').pop() || id).replace(/_/g, ' ');
    return base.replace(/\b\w/g, c => c.toUpperCase());
  }

  function prettyTagShort(tag) {
    return prettyId(tag.replace(/^c:/, '').replace(/\//g, ' '));
  }

  function renderTmSection(item) {
    const tm = item.tm;
    const allMon = PokeNavData.getPokemon();
    const learners = tm.learnerIds.map(id => allMon.find(p => p.id === id)).filter(Boolean);
    return `
      <section class="academy-section">
        <div class="academy-section-head">🎯 Learners — ${learners.length} Pokémon</div>
        <div class="academy-tm-meta">${tm.type} · ${tm.category || '—'} · ${tm.power || '—'} pwr · ${tm.accuracy || '—'}% acc · ${tm.pp || '—'} PP</div>
        <div class="academy-tm-learners">
          ${learners.map(p => `
            <div class="academy-tm-learner" data-id="${p.id}">
              <img src="${spriteUrl(p.id)}" onerror="${spriteFallbackOnError(p.id)}" alt="${p.name}">
              <div class="academy-tm-learner-info">
                <div class="academy-tm-learner-num">#${String(p.id).padStart(4, '0')}</div>
                <div class="academy-tm-learner-name">${p.name}</div>
              </div>
              <div class="academy-tm-learner-types">${p.types.map(t => typeIconHTMLCompact(t)).join('')}</div>
            </div>
          `).join('')}
        </div>
      </section>
    `;
  }

  // ── Per-tab back stack ──────────────────────────────────

  function openItem(itemOrName, opts = {}) {
    const item = typeof itemOrName === 'string'
      ? (itemsById.get(itemOrName)
         || allItems.find(i => i.name === itemOrName)
         || allItems.find(i => i.id === itemOrName))
      : itemOrName;
    if (!item) return;
    if (opts.fresh) itemHistory.length = 0;
    itemHistory.push(item);
    detailItem = item;
    renderActive();
  }

  function back() {
    itemHistory.pop();
    if (itemHistory.length) {
      detailItem = itemHistory[itemHistory.length - 1];
    } else {
      detailItem = null;
    }
    renderActive();
  }

  return { init, openItem };
})();
