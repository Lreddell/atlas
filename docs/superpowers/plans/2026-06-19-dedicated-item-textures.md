# Dedicated Item Textures Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give all 66 Atlas non-block items dedicated, deterministic 16x16 PNG artwork matching the visual quality and style of the PR 19 magnet textures.

**Architecture:** Keep the existing texture atlas and external-image override flow. Expand `pr19TexturePixels.ts` into the single deterministic source for generated block and item sprites, use reusable tool/armor/material templates to avoid duplicated pixel data, and keep `generate_pr19_textures.mjs` as the PNG writer and byte-identity checker.

**Tech Stack:** TypeScript, Node.js ESM, native Node test runner, Canvas 2D-compatible pixel definitions, custom PNG encoder, React/Three.js texture atlas.

---

## File Structure

- Modify `src/data/blocks.ts`
  - Assign dedicated slots 157-168 to gold, diamond, and copper armor.
- Modify `src/systems/textures/textureMapping.ts`
  - Map every `isItem: true` texture slot to one unique `items/*.png` path.
- Modify `src/systems/textures/pr19TexturePixels.ts`
  - Store reusable palettes, silhouettes, all 66 item asset entries, and deterministic tile definitions.
- Modify `src/systems/textures/pr19TextureAssignments.test.mjs`
  - Enforce exhaustive item mapping, unique paths, armor slots, PNG format, and generated-byte identity.
- Use `scripts/generate_pr19_textures.mjs`
  - Generate every registered asset from the expanded catalog without changing the encoder.
- Create `public/assets/textures/items/*.png`
  - Add or regenerate all 66 item PNGs.
- No changes to `BlockType`, recipes, stats, inventory logic, persistence, or gameplay.

### Task 1: Lock Down The 66-Item Mapping Contract

**Files:**
- Modify: `src/systems/textures/pr19TextureAssignments.test.mjs`
- Modify: `src/data/blocks.ts`
- Modify: `src/systems/textures/textureMapping.ts`

- [ ] **Step 1: Add a failing exhaustive item-mapping test**

Add source parsers to `pr19TextureAssignments.test.mjs`:

```js
const itemEntries = blocksSource
    .split(/\r?\n/)
    .filter((line) => /\bisItem:\s*true\b/.test(line))
    .map((line) => {
        const type = line.match(/BlockType\.([A-Z0-9_]+)/)?.[1];
        const slot = Number(line.match(/textureSlot:\s*(\d+)/)?.[1]);
        assert.ok(type, `Unable to parse item type from: ${line}`);
        assert.ok(Number.isInteger(slot), `Unable to parse item slot from: ${line}`);
        return { type, slot };
    });

const mappedItemPaths = new Map(
    [...mappingSource.matchAll(/^\s*(\d+):\s*['"]items\/([^'"]+\.png)['"]/gm)]
        .map((match) => [Number(match[1]), `items/${match[2]}`]),
);

test('every non-block item has one unique external PNG mapping', () => {
    assert.equal(itemEntries.length, 66);

    const paths = itemEntries.map(({ type, slot }) => {
        const path = mappedItemPaths.get(slot);
        assert.ok(path, `${type} slot ${slot} has no item PNG mapping`);
        return path;
    });

    assert.equal(new Set(paths).size, paths.length);
});
```

- [ ] **Step 2: Add a failing armor-slot test**

```js
const dedicatedArmorSlots = {
    GOLD_HELMET: 157,
    GOLD_CHESTPLATE: 158,
    GOLD_LEGGINGS: 159,
    GOLD_BOOTS: 160,
    DIAMOND_HELMET: 161,
    DIAMOND_CHESTPLATE: 162,
    DIAMOND_LEGGINGS: 163,
    DIAMOND_BOOTS: 164,
    COPPER_HELMET: 165,
    COPPER_CHESTPLATE: 166,
    COPPER_LEGGINGS: 167,
    COPPER_BOOTS: 168,
};

test('material armor uses dedicated slots instead of ingredient fallbacks', () => {
    for (const [type, slot] of Object.entries(dedicatedArmorSlots)) {
        assert.match(
            blocksSource,
            new RegExp(`BlockType\\.${type}\\][^\\n]*textureSlot:\\s*${slot}\\b`),
        );
    }
});
```

- [ ] **Step 3: Run the tests and verify the expected failures**

Run:

```powershell
node --test src/systems/textures/pr19TextureAssignments.test.mjs
```

Expected: FAIL because most item slots have no external mapping and the 12 armor entries still use slots 60, 101, and 102.

- [ ] **Step 4: Assign the 12 armor slots**

Update `src/data/blocks.ts` exactly:

```ts
[BlockType.GOLD_HELMET]: { id: BlockType.GOLD_HELMET, color: '#fbc02d', name: 'Gold Helmet', textureSlot: 157, hardness: 0, isItem: true, category: 'tools' },
[BlockType.GOLD_CHESTPLATE]: { id: BlockType.GOLD_CHESTPLATE, color: '#fbc02d', name: 'Gold Chestplate', textureSlot: 158, hardness: 0, isItem: true, category: 'tools' },
[BlockType.GOLD_LEGGINGS]: { id: BlockType.GOLD_LEGGINGS, color: '#fbc02d', name: 'Gold Leggings', textureSlot: 159, hardness: 0, isItem: true, category: 'tools' },
[BlockType.GOLD_BOOTS]: { id: BlockType.GOLD_BOOTS, color: '#fbc02d', name: 'Gold Boots', textureSlot: 160, hardness: 0, isItem: true, category: 'tools' },
[BlockType.DIAMOND_HELMET]: { id: BlockType.DIAMOND_HELMET, color: '#00bcd4', name: 'Diamond Helmet', textureSlot: 161, hardness: 0, isItem: true, category: 'tools' },
[BlockType.DIAMOND_CHESTPLATE]: { id: BlockType.DIAMOND_CHESTPLATE, color: '#00bcd4', name: 'Diamond Chestplate', textureSlot: 162, hardness: 0, isItem: true, category: 'tools' },
[BlockType.DIAMOND_LEGGINGS]: { id: BlockType.DIAMOND_LEGGINGS, color: '#00bcd4', name: 'Diamond Leggings', textureSlot: 163, hardness: 0, isItem: true, category: 'tools' },
[BlockType.DIAMOND_BOOTS]: { id: BlockType.DIAMOND_BOOTS, color: '#00bcd4', name: 'Diamond Boots', textureSlot: 164, hardness: 0, isItem: true, category: 'tools' },
[BlockType.COPPER_HELMET]: { id: BlockType.COPPER_HELMET, color: '#e67e22', name: 'Copper Helmet', textureSlot: 165, hardness: 0, isItem: true, category: 'tools' },
[BlockType.COPPER_CHESTPLATE]: { id: BlockType.COPPER_CHESTPLATE, color: '#e67e22', name: 'Copper Chestplate', textureSlot: 166, hardness: 0, isItem: true, category: 'tools' },
[BlockType.COPPER_LEGGINGS]: { id: BlockType.COPPER_LEGGINGS, color: '#e67e22', name: 'Copper Leggings', textureSlot: 167, hardness: 0, isItem: true, category: 'tools' },
[BlockType.COPPER_BOOTS]: { id: BlockType.COPPER_BOOTS, color: '#e67e22', name: 'Copper Boots', textureSlot: 168, hardness: 0, isItem: true, category: 'tools' },
```

Remove the obsolete fallback-texture comment.

- [ ] **Step 5: Add all item paths to `TEXTURE_PATHS`**

Replace the existing partial `// --- TOOLS ---` section with one
`// --- ITEMS ---` section. Move slots 151-155 out of the magnetism section so
every numeric key appears once; keep block slots 149, 150, and 156 in the
magnetism section. Add these exact item mappings:

```ts
32: 'items/wood_pickaxe.png',
33: 'items/stone_pickaxe.png',
34: 'items/iron_pickaxe.png',
35: 'items/stick.png',
36: 'items/wood_axe.png',
37: 'items/stone_axe.png',
38: 'items/iron_axe.png',
39: 'items/wood_shovel.png',
40: 'items/stone_shovel.png',
41: 'items/iron_shovel.png',
48: 'items/coal.png',
49: 'items/iron_ingot.png',
50: 'items/apple.png',
51: 'items/oak_sapling.png',
55: 'items/raw_iron.png',
57: 'items/charcoal.png',
59: 'items/raw_copper.png',
60: 'items/copper_ingot.png',
61: 'items/copper_pickaxe.png',
62: 'items/copper_axe.png',
63: 'items/copper_shovel.png',
67: 'items/bed.png',
73: 'items/wheat_seeds.png',
100: 'items/raw_gold.png',
101: 'items/gold_ingot.png',
102: 'items/diamond.png',
103: 'items/emerald.png',
104: 'items/lapis_lazuli.png',
105: 'items/wood_sword.png',
106: 'items/wood_hoe.png',
107: 'items/stone_sword.png',
108: 'items/stone_hoe.png',
109: 'items/iron_sword.png',
110: 'items/iron_hoe.png',
111: 'items/copper_sword.png',
112: 'items/copper_hoe.png',
113: 'items/gold_pickaxe.png',
114: 'items/gold_axe.png',
115: 'items/gold_shovel.png',
116: 'items/gold_sword.png',
117: 'items/gold_hoe.png',
118: 'items/diamond_pickaxe.png',
119: 'items/diamond_axe.png',
120: 'items/diamond_shovel.png',
121: 'items/diamond_sword.png',
122: 'items/diamond_hoe.png',
146: 'items/spruce_sapling.png',
147: 'items/birch_sapling.png',
148: 'items/cherry_sapling.png',
151: 'items/iron_helmet.png',
152: 'items/iron_chestplate.png',
153: 'items/iron_leggings.png',
154: 'items/iron_boots.png',
155: 'items/polarity_boots.png',
157: 'items/gold_helmet.png',
158: 'items/gold_chestplate.png',
159: 'items/gold_leggings.png',
160: 'items/gold_boots.png',
161: 'items/diamond_helmet.png',
162: 'items/diamond_chestplate.png',
163: 'items/diamond_leggings.png',
164: 'items/diamond_boots.png',
165: 'items/copper_helmet.png',
166: 'items/copper_chestplate.png',
167: 'items/copper_leggings.png',
168: 'items/copper_boots.png',
```

- [ ] **Step 6: Run the mapping tests**

Run:

```powershell
node --test src/systems/textures/pr19TextureAssignments.test.mjs
```

Expected: mapping and armor-slot tests PASS. The existing eight file-existence checks also remain green.

- [ ] **Step 7: Commit the mapping contract**

```powershell
git add src/data/blocks.ts src/systems/textures/textureMapping.ts src/systems/textures/pr19TextureAssignments.test.mjs
git commit -m "test: require dedicated textures for every item"
```

### Task 2: Generalize The Deterministic Texture Catalog

**Files:**
- Modify: `src/systems/textures/pr19TexturePixels.ts`
- Test: `src/systems/textures/pr19TextureAssignments.test.mjs`

- [ ] **Step 1: Run the existing tests as characterization coverage**

Run:

```powershell
node --test src/systems/textures/pr19TextureAssignments.test.mjs
node --no-warnings --experimental-strip-types scripts/generate_pr19_textures.mjs --check
```

Expected: PASS for the current eight generated assets. These tests protect the refactor from changing their output.

- [ ] **Step 2: Generalize the catalog types**

Replace the fixed slot union with:

```ts
export type GeneratedTextureSlot = number;

export interface GeneratedTextureAsset {
    slot: GeneratedTextureSlot;
    path: string;
}

export interface MaterialPalette {
    outline: string;
    shadow: string;
    base: string;
    highlight: string;
}
```

Keep `PixelRect`, `PixelLayer`, `PixelTileDefinition`, `paintPixelTile`, and `rasterizePixelTile` behavior unchanged.

- [ ] **Step 3: Add deterministic composition helpers**

```ts
const tile = (...layers: PixelLayer[]): PixelTileDefinition => ({ layers });

const layer = (color: string, rects: readonly PixelRect[]): PixelLayer => ({
    color,
    rects,
});

const registerTexture = (
    assets: GeneratedTextureAsset[],
    tiles: Record<number, PixelTileDefinition>,
    slot: number,
    path: string,
    definition: PixelTileDefinition,
): void => {
    assets.push({ slot, path });
    tiles[slot] = definition;
};

const assets: GeneratedTextureAsset[] = [];
const tiles: Record<number, PixelTileDefinition> = {};
```

Initialize local mutable `assets` and `tiles`, register every family, then export:

```ts
export const PR19_TEXTURE_ASSETS = assets;
export const PR19_TEXTURE_TILES = tiles;
```

- [ ] **Step 4: Preserve the three block textures and five existing equipment textures**

Register slots 149-156 with their current exact definitions before adding new families. This keeps magnet, iron armor, Polarity Boots, and Iron Block byte-compatible during the refactor.

- [ ] **Step 5: Run existing texture tests**

Run:

```powershell
node --test src/systems/textures/pr19TextureAssignments.test.mjs
node --no-warnings --experimental-strip-types scripts/generate_pr19_textures.mjs --check
```

Expected: existing eight generated assets remain byte-identical.

- [ ] **Step 6: Commit the catalog foundation**

```powershell
git add src/systems/textures/pr19TexturePixels.ts src/systems/textures/pr19TextureAssignments.test.mjs
git commit -m "refactor: generalize generated texture catalog"
```

### Task 3: Add Dedicated Tool Sprites

**Files:**
- Modify: `src/systems/textures/pr19TexturePixels.ts`
- Modify: `src/systems/textures/pr19TextureAssignments.test.mjs`
- Create: 30 PNGs under `public/assets/textures/items/`

- [ ] **Step 1: Add failing tool-family tests**

```js
const TOOL_SLOTS = [
    32, 33, 34, 36, 37, 38, 39, 40, 41, 61, 62, 63,
    105, 106, 107, 108, 109, 110, 111, 112,
    113, 114, 115, 116, 117, 118, 119, 120, 121, 122,
];

test('all 30 tool slots have generated assets', () => {
    const generatedSlots = new Set(PR19_TEXTURE_ASSETS.map(({ slot }) => slot));
    TOOL_SLOTS.forEach((slot) => assert.equal(generatedSlots.has(slot), true));
});

test('tool sprites use transparent backgrounds and hard alpha', () => {
    for (const slot of TOOL_SLOTS) {
        const pixels = rasterizePixelTile(PR19_TEXTURE_TILES[slot]);
        for (let offset = 3; offset < pixels.length; offset += 4) {
            assert.ok(pixels[offset] === 0 || pixels[offset] === 255);
        }
        assert.equal(pixels[3], 0);
    }
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run:

```powershell
node --test src/systems/textures/pr19TextureAssignments.test.mjs
```

Expected: FAIL because tool assets are not registered.

- [ ] **Step 3: Add the exact material palettes**

```ts
const MATERIAL_PALETTES = {
    wood: { outline: '#3e2723', shadow: '#5d4037', base: '#8d6e63', highlight: '#bcaaa4' },
    stone: { outline: '#424242', shadow: '#616161', base: '#9e9e9e', highlight: '#e0e0e0' },
    iron: { outline: '#757575', shadow: '#9e9e9e', base: '#d7ccc8', highlight: '#eeeeee' },
    copper: { outline: '#7f3515', shadow: '#b44f1d', base: '#e67e22', highlight: '#ffab73' },
    gold: { outline: '#8d6e00', shadow: '#c49000', base: '#fbc02d', highlight: '#fff59d' },
    diamond: { outline: '#006064', shadow: '#00838f', base: '#00bcd4', highlight: '#84ffff' },
} satisfies Record<string, MaterialPalette>;

const HANDLE_PALETTE = MATERIAL_PALETTES.wood;
```

- [ ] **Step 4: Add shared tool silhouettes**

Define `ToolShape = 'pickaxe' | 'axe' | 'shovel' | 'sword' | 'hoe'` and use these exact rect groups:

```ts
const TOOL_RECTS = {
    pickaxe: {
        outline: [[3, 4], [4, 3], [5, 2, 6, 1], [11, 3], [12, 4], [7, 5, 2, 2]],
        base: [[4, 4], [5, 3, 6, 2], [11, 4], [8, 5]],
        highlight: [[5, 3, 4, 1]],
    },
    axe: {
        outline: [[7, 3, 5, 1], [6, 4, 7, 4], [7, 8, 4, 1]],
        base: [[8, 4, 4, 4], [7, 5, 1, 2], [8, 8, 2, 1]],
        highlight: [[8, 4, 3, 1], [7, 5]],
    },
    shovel: {
        outline: [[10, 3, 3, 1], [9, 4, 5, 4], [10, 8, 3, 1]],
        base: [[10, 4, 3, 4], [9, 5], [13, 5]],
        highlight: [[10, 4, 2, 1]],
    },
    sword: {
        outline: [[11, 2, 2, 1], [10, 3, 3, 2], [9, 5, 3, 2], [8, 7, 3, 2], [5, 9, 5, 2]],
        base: [[11, 3], [10, 4, 2, 2], [9, 6, 2, 2], [8, 8, 2, 1]],
        highlight: [[11, 3], [10, 4], [9, 5], [8, 6]],
    },
    hoe: {
        outline: [[6, 2, 6, 1], [10, 3, 3, 2], [11, 5, 2, 4]],
        base: [[7, 3, 5, 1], [11, 4], [12, 5, 1, 3]],
        highlight: [[7, 2, 3, 1]],
    },
} as const;

const LONG_HANDLE: readonly PixelRect[] = [
    [3, 12, 2, 2], [4, 11, 2, 2], [5, 10, 2, 2], [6, 9, 2, 2],
    [7, 8, 2, 2], [8, 7, 2, 2], [9, 6, 2, 2],
];

const HANDLE_BASE: readonly PixelRect[] = [
    [4, 12], [5, 11], [6, 10], [7, 9], [8, 8], [9, 7], [10, 6],
];

const HANDLE_HIGHLIGHT: readonly PixelRect[] = [
    [4, 11], [5, 10], [6, 9], [7, 8],
];

const toolTile = (
    shape: keyof typeof TOOL_RECTS,
    palette: MaterialPalette,
): PixelTileDefinition => {
    const rects = TOOL_RECTS[shape];
    return tile(
        layer(HANDLE_PALETTE.outline, LONG_HANDLE),
        layer(HANDLE_PALETTE.base, HANDLE_BASE),
        layer(HANDLE_PALETTE.highlight, HANDLE_HIGHLIGHT),
        layer(palette.outline, rects.outline),
        layer(palette.base, rects.base),
        layer(palette.highlight, rects.highlight),
    );
};
```

- [ ] **Step 5: Register all 30 tools**

Use this metadata:

```ts
const TOOL_TEXTURES = [
    [32, 'wood_pickaxe', 'pickaxe', 'wood'],
    [33, 'stone_pickaxe', 'pickaxe', 'stone'],
    [34, 'iron_pickaxe', 'pickaxe', 'iron'],
    [61, 'copper_pickaxe', 'pickaxe', 'copper'],
    [113, 'gold_pickaxe', 'pickaxe', 'gold'],
    [118, 'diamond_pickaxe', 'pickaxe', 'diamond'],
    [36, 'wood_axe', 'axe', 'wood'],
    [37, 'stone_axe', 'axe', 'stone'],
    [38, 'iron_axe', 'axe', 'iron'],
    [62, 'copper_axe', 'axe', 'copper'],
    [114, 'gold_axe', 'axe', 'gold'],
    [119, 'diamond_axe', 'axe', 'diamond'],
    [39, 'wood_shovel', 'shovel', 'wood'],
    [40, 'stone_shovel', 'shovel', 'stone'],
    [41, 'iron_shovel', 'shovel', 'iron'],
    [63, 'copper_shovel', 'shovel', 'copper'],
    [115, 'gold_shovel', 'shovel', 'gold'],
    [120, 'diamond_shovel', 'shovel', 'diamond'],
    [105, 'wood_sword', 'sword', 'wood'],
    [107, 'stone_sword', 'sword', 'stone'],
    [109, 'iron_sword', 'sword', 'iron'],
    [111, 'copper_sword', 'sword', 'copper'],
    [116, 'gold_sword', 'sword', 'gold'],
    [121, 'diamond_sword', 'sword', 'diamond'],
    [106, 'wood_hoe', 'hoe', 'wood'],
    [108, 'stone_hoe', 'hoe', 'stone'],
    [110, 'iron_hoe', 'hoe', 'iron'],
    [112, 'copper_hoe', 'hoe', 'copper'],
    [117, 'gold_hoe', 'hoe', 'gold'],
    [122, 'diamond_hoe', 'hoe', 'diamond'],
] as const;

for (const [slot, name, shape, material] of TOOL_TEXTURES) {
    registerTexture(
        assets,
        tiles,
        slot,
        `items/${name}.png`,
        toolTile(shape, MATERIAL_PALETTES[material]),
    );
}
```

- [ ] **Step 6: Generate and verify the tool PNGs**

Run:

```powershell
node --no-warnings --experimental-strip-types scripts/generate_pr19_textures.mjs
node --test src/systems/textures/pr19TextureAssignments.test.mjs
```

Expected: all tool tests PASS and 30 tool PNGs exist.

- [ ] **Step 7: Commit tools**

```powershell
git add src/systems/textures/pr19TexturePixels.ts src/systems/textures/pr19TextureAssignments.test.mjs public/assets/textures/items
git commit -m "feat: add dedicated tool textures"
```

### Task 4: Add Ingredients, Food, Plants, And Utility Sprites

**Files:**
- Modify: `src/systems/textures/pr19TexturePixels.ts`
- Modify: `src/systems/textures/pr19TextureAssignments.test.mjs`
- Create: 19 PNGs under `public/assets/textures/items/`

- [ ] **Step 1: Add failing special-item coverage**

```js
const SPECIAL_ITEM_SLOTS = [
    35, 48, 49, 50, 51, 55, 57, 59, 60, 67, 73,
    100, 101, 102, 103, 104, 146, 147, 148,
];

test('ingredients, food, plants, and utility items have generated assets', () => {
    const generatedSlots = new Set(PR19_TEXTURE_ASSETS.map(({ slot }) => slot));
    SPECIAL_ITEM_SLOTS.forEach((slot) => assert.equal(generatedSlots.has(slot), true));
});
```

- [ ] **Step 2: Verify the test fails**

Run:

```powershell
node --test src/systems/textures/pr19TextureAssignments.test.mjs
```

Expected: FAIL because these assets are not registered.

- [ ] **Step 3: Add reusable special-item builders**

Implement these helpers with the exact geometry:

```ts
const ingotTile = (palette: MaterialPalette) => tile(
    layer(palette.outline, [[3, 6, 10, 5], [4, 5, 8, 1]]),
    layer(palette.shadow, [[4, 9, 8, 2], [11, 7, 2, 3]]),
    layer(palette.base, [[4, 6, 8, 4]]),
    layer(palette.highlight, [[5, 6, 5, 1], [4, 7, 2, 1]]),
);

const rawOreTile = (rock: MaterialPalette, ore: MaterialPalette) => tile(
    layer(rock.outline, [[4, 6, 1, 5], [5, 4, 6, 1], [11, 5, 2, 2], [12, 7, 1, 4], [5, 11, 7, 1]]),
    layer(rock.base, [[5, 5, 6, 6], [4, 7, 8, 3]]),
    layer(ore.shadow, [[6, 6, 2, 2], [9, 9, 2, 2]]),
    layer(ore.base, [[7, 6, 2, 2], [9, 7, 2, 2], [6, 9, 2, 1]]),
    layer(ore.highlight, [[7, 6], [10, 7]]),
);

const gemTile = (palette: MaterialPalette) => tile(
    layer(palette.outline, [[7, 2, 2, 1], [5, 3, 6, 1], [4, 4, 8, 4], [5, 8, 6, 2], [7, 10, 2, 3]]),
    layer(palette.shadow, [[4, 6, 2, 2], [10, 4, 2, 4], [7, 9, 2, 3]]),
    layer(palette.base, [[6, 4, 4, 5], [5, 5, 6, 2]]),
    layer(palette.highlight, [[6, 4, 3, 1], [6, 5, 2, 2]]),
);
```

Add the exact special definitions:

```ts
const RAW_ROCK = {
    outline: '#4e342e',
    shadow: '#6d4c41',
    base: '#8d6e63',
    highlight: '#bcaaa4',
};

const SPECIAL_ITEM_TILES: Record<number, PixelTileDefinition> = {
    35: tile(
        layer('#3e2723', [[3, 12, 2, 2], [4, 11, 2, 2], [5, 10, 2, 2], [6, 9, 2, 2], [7, 8, 2, 2], [8, 7, 2, 2], [9, 6, 2, 2], [10, 5, 2, 2], [11, 4, 2, 2]]),
        layer('#6d4c41', [[4, 12], [5, 11], [6, 10], [7, 9], [8, 8], [9, 7], [10, 6], [11, 5]]),
        layer('#a1887f', [[5, 10], [6, 9], [7, 8], [8, 7]]),
    ),
    48: tile(
        layer('#050505', [[4, 5, 1, 6], [5, 3, 6, 1], [11, 4, 2, 2], [12, 6, 1, 5], [5, 11, 7, 2]]),
        layer('#151515', [[5, 4, 6, 7], [4, 6, 8, 4]]),
        layer('#303030', [[6, 4, 3, 2], [9, 6, 2, 2], [6, 9, 2, 1]]),
        layer('#555555', [[6, 4], [9, 6]]),
    ),
    49: ingotTile(MATERIAL_PALETTES.iron),
    50: tile(
        layer('#7f0000', [[5, 5, 6, 1], [4, 6, 8, 6], [5, 12, 6, 1]]),
        layer('#b71c1c', [[5, 6, 6, 6], [4, 8, 8, 3]]),
        layer('#e53935', [[5, 6, 4, 4]]),
        layer('#ff8a80', [[6, 6, 2, 2]]),
        layer('#4e342e', [[8, 2, 2, 4]]),
        layer('#2e7d32', [[10, 3, 3, 2], [11, 2, 2, 1]]),
    ),
    51: tile(
        layer('#4e342e', [[7, 9, 2, 7]]),
        layer('#6d4c41', [[8, 10, 1, 5]]),
        layer('#1b5e20', [[5, 4, 6, 6], [4, 6, 8, 3]]),
        layer('#2e7d32', [[6, 3, 4, 5], [5, 5, 6, 3]]),
        layer('#66bb6a', [[6, 4, 2, 2], [9, 5, 2, 2]]),
    ),
    55: rawOreTile(RAW_ROCK, MATERIAL_PALETTES.iron),
    57: tile(
        layer('#1b0f0a', [[5, 3, 6, 1], [4, 4, 8, 9], [5, 13, 6, 1]]),
        layer('#2b1b14', [[5, 4, 6, 9], [4, 6, 8, 5]]),
        layer('#4e342e', [[6, 4, 2, 4], [9, 8, 2, 3]]),
        layer('#6d4c41', [[6, 4], [9, 8]]),
    ),
    59: rawOreTile(RAW_ROCK, MATERIAL_PALETTES.copper),
    60: ingotTile(MATERIAL_PALETTES.copper),
    67: tile(
        layer('#3e2723', [[2, 10, 12, 3], [2, 13, 2, 2], [12, 13, 2, 2]]),
        layer('#5d4037', [[3, 11, 10, 2]]),
        layer('#8e0000', [[2, 6, 12, 5]]),
        layer('#c62828', [[3, 6, 10, 4]]),
        layer('#ef5350', [[3, 6, 5, 1]]),
        layer('#bdbdbd', [[10, 6, 3, 3]]),
        layer('#eeeeee', [[10, 6, 2, 2]]),
    ),
    73: tile(
        layer('#4e5d23', [[5, 6, 2, 4], [8, 4, 2, 4], [10, 8, 2, 4], [6, 11, 2, 2]]),
        layer('#7cb342', [[6, 6], [9, 4], [11, 8], [7, 11]]),
        layer('#c0ca33', [[6, 7], [9, 5], [11, 9]]),
    ),
    100: rawOreTile(RAW_ROCK, MATERIAL_PALETTES.gold),
    101: ingotTile(MATERIAL_PALETTES.gold),
    102: gemTile(MATERIAL_PALETTES.diamond),
    103: gemTile({
        outline: '#1b5e20',
        shadow: '#2e7d32',
        base: '#00c853',
        highlight: '#b9f6ca',
    }),
    104: tile(
        layer('#0d175f', [[4, 7, 2, 4], [6, 5, 3, 6], [9, 4, 2, 7], [11, 7, 2, 4], [5, 11, 7, 1]]),
        layer('#1a237e', [[5, 7, 2, 3], [7, 6, 3, 5], [10, 5, 1, 5], [11, 8, 1, 2]]),
        layer('#3949ab', [[7, 6, 2, 2], [10, 5], [6, 9]]),
        layer('#7986cb', [[7, 6], [10, 5]]),
    ),
    146: tile(
        layer('#4e342e', [[7, 11, 2, 5]]),
        layer('#0d3b14', [[7, 2, 2, 2], [5, 4, 6, 2], [4, 6, 8, 2], [3, 8, 10, 3]]),
        layer('#1b5e20', [[7, 3, 2, 1], [6, 5, 4, 1], [5, 7, 6, 1], [4, 9, 8, 1]]),
        layer('#4caf50', [[7, 3], [6, 5], [5, 7], [4, 9]]),
    ),
    147: tile(
        layer('#757575', [[7, 9, 2, 7]]),
        layer('#eeeeee', [[8, 9, 1, 6]]),
        layer('#212121', [[7, 11], [8, 14]]),
        layer('#558b2f', [[5, 4, 6, 6], [4, 6, 8, 3]]),
        layer('#8bc34a', [[6, 3, 4, 5], [5, 5, 6, 3]]),
        layer('#c5e1a5', [[6, 4, 2, 2], [9, 6, 2, 1]]),
    ),
    148: tile(
        layer('#4e342e', [[7, 9, 2, 7]]),
        layer('#2e7d32', [[5, 4, 6, 6], [4, 6, 8, 3]]),
        layer('#66bb6a', [[6, 3, 4, 5], [5, 5, 6, 3]]),
        layer('#ec407a', [[5, 4, 2, 2], [9, 5, 2, 2], [7, 7, 2, 2]]),
        layer('#f8bbd0', [[5, 4], [9, 5], [7, 7]]),
    ),
};
```

- [ ] **Step 4: Register all 19 assets**

```ts
const SPECIAL_TEXTURES = [
    [35, 'stick'],
    [48, 'coal'],
    [49, 'iron_ingot'],
    [50, 'apple'],
    [51, 'oak_sapling'],
    [55, 'raw_iron'],
    [57, 'charcoal'],
    [59, 'raw_copper'],
    [60, 'copper_ingot'],
    [67, 'bed'],
    [73, 'wheat_seeds'],
    [100, 'raw_gold'],
    [101, 'gold_ingot'],
    [102, 'diamond'],
    [103, 'emerald'],
    [104, 'lapis_lazuli'],
    [146, 'spruce_sapling'],
    [147, 'birch_sapling'],
    [148, 'cherry_sapling'],
] as const;

for (const [slot, name] of SPECIAL_TEXTURES) {
    registerTexture(
        assets,
        tiles,
        slot,
        `items/${name}.png`,
        SPECIAL_ITEM_TILES[slot],
    );
}
```

- [ ] **Step 5: Generate, test, and visually inspect this family**

Run:

```powershell
node --no-warnings --experimental-strip-types scripts/generate_pr19_textures.mjs
node --test src/systems/textures/pr19TextureAssignments.test.mjs
```

Inspect the 19 PNGs at 8x nearest-neighbor scale. Verify transparent corners, recognizable silhouettes, and distinct coal/charcoal and diamond/lapis shapes.

- [ ] **Step 6: Commit special items**

```powershell
git add src/systems/textures/pr19TexturePixels.ts src/systems/textures/pr19TextureAssignments.test.mjs public/assets/textures/items
git commit -m "feat: add dedicated material and utility textures"
```

### Task 5: Add Every Armor Sprite

**Files:**
- Modify: `src/systems/textures/pr19TexturePixels.ts`
- Modify: `src/systems/textures/pr19TextureAssignments.test.mjs`
- Create: 12 PNGs under `public/assets/textures/items/`
- Regenerate: existing five equipment PNGs

- [ ] **Step 1: Add failing armor-family tests**

```js
const ARMOR_SLOTS = [
    151, 152, 153, 154, 155,
    157, 158, 159, 160,
    161, 162, 163, 164,
    165, 166, 167, 168,
];

test('all armor and polarity boots have generated assets', () => {
    const generatedSlots = new Set(PR19_TEXTURE_ASSETS.map(({ slot }) => slot));
    ARMOR_SLOTS.forEach((slot) => assert.equal(generatedSlots.has(slot), true));
});

test('gold diamond and copper armor palettes remain distinct', () => {
    const signature = (slot) => new Set(
        Array.from({ length: 256 }, (_, index) => {
            const pixels = rasterizePixelTile(PR19_TEXTURE_TILES[slot]);
            return Array.from(pixels.slice(index * 4, index * 4 + 4)).join(',');
        }).filter((rgba) => rgba !== '0,0,0,0'),
    );

    assert.notDeepEqual(signature(157), signature(161));
    assert.notDeepEqual(signature(157), signature(165));
    assert.notDeepEqual(signature(161), signature(165));
});
```

- [ ] **Step 2: Verify the tests fail**

Run:

```powershell
node --test src/systems/textures/pr19TextureAssignments.test.mjs
```

Expected: FAIL because slots 157-168 have no definitions or PNGs.

- [ ] **Step 3: Extract shared armor geometry**

Define:

```ts
type ArmorPiece = 'helmet' | 'chestplate' | 'leggings' | 'boots';

const ARMOR_RECTS = {
    helmet: {
        shadow: [[5, 3, 6, 1], [4, 4, 8, 1], [3, 5, 10, 6], [3, 11, 3, 1], [10, 11, 3, 1]],
        base: [[5, 4, 6, 1], [4, 5, 8, 2], [4, 7, 2, 4], [10, 7, 2, 4]],
        highlight: [[5, 5, 5, 1], [4, 6, 6, 1], [4, 7, 1, 2]],
    },
    chestplate: {
        shadow: [[4, 2, 3, 2], [9, 2, 3, 2], [3, 3, 4, 2], [9, 3, 4, 2], [2, 4, 4, 4], [10, 4, 4, 4], [4, 4, 8, 9]],
        base: [[5, 3, 2, 2], [9, 3, 2, 2], [3, 4, 3, 3], [10, 4, 3, 3], [5, 5, 6, 7]],
        highlight: [[5, 3], [3, 4, 2, 1], [5, 5, 4, 1], [5, 6, 1, 5]],
    },
    leggings: {
        shadow: [[4, 3, 8, 2], [4, 5, 8, 3], [3, 7, 4, 6], [9, 7, 4, 6]],
        base: [[5, 4, 6, 3], [4, 7, 2, 5], [10, 7, 2, 5]],
        highlight: [[5, 4, 4, 1], [4, 7, 1, 3], [10, 7, 1, 3]],
    },
    boots: {
        shadow: [[3, 4, 4, 7], [2, 9, 5, 4], [9, 4, 4, 7], [9, 9, 6, 4]],
        base: [[4, 5, 2, 5], [3, 10, 3, 2], [10, 5, 2, 5], [10, 10, 4, 2]],
        highlight: [[4, 5, 1, 3], [10, 5, 1, 3]],
    },
} as const;

const armorTile = (piece: ArmorPiece, palette: MaterialPalette): PixelTileDefinition => {
    const rects = ARMOR_RECTS[piece];
    return tile(
        layer(palette.shadow, rects.shadow),
        layer(palette.base, rects.base),
        layer(palette.highlight, rects.highlight),
    );
};
```

This must reproduce the current iron sprites exactly.

- [ ] **Step 4: Register all armor variants**

Remove the four individual slot 151-154 registrations preserved in Task 2,
then replace them with this one family table. Leave the slot-155 Polarity Boots
registration untouched.

```ts
const ARMOR_TEXTURES = [
    [151, 'iron_helmet', 'helmet', 'iron'],
    [152, 'iron_chestplate', 'chestplate', 'iron'],
    [153, 'iron_leggings', 'leggings', 'iron'],
    [154, 'iron_boots', 'boots', 'iron'],
    [157, 'gold_helmet', 'helmet', 'gold'],
    [158, 'gold_chestplate', 'chestplate', 'gold'],
    [159, 'gold_leggings', 'leggings', 'gold'],
    [160, 'gold_boots', 'boots', 'gold'],
    [161, 'diamond_helmet', 'helmet', 'diamond'],
    [162, 'diamond_chestplate', 'chestplate', 'diamond'],
    [163, 'diamond_leggings', 'leggings', 'diamond'],
    [164, 'diamond_boots', 'boots', 'diamond'],
    [165, 'copper_helmet', 'helmet', 'copper'],
    [166, 'copper_chestplate', 'chestplate', 'copper'],
    [167, 'copper_leggings', 'leggings', 'copper'],
    [168, 'copper_boots', 'boots', 'copper'],
] as const;

for (const [slot, name, piece, material] of ARMOR_TEXTURES) {
    registerTexture(
        assets,
        tiles,
        slot,
        `items/${name}.png`,
        armorTile(piece, MATERIAL_PALETTES[material]),
    );
}
```

Do not remove or add a second slot-155 registration. Retain the existing
`items/polarity_boots.png` definition preserved in Task 2.

- [ ] **Step 5: Generate and validate armor PNGs**

Run:

```powershell
node --no-warnings --experimental-strip-types scripts/generate_pr19_textures.mjs
node --test src/systems/textures/pr19TextureAssignments.test.mjs
```

Expected: armor tests PASS, existing iron/polarity PNGs remain deterministic, and 12 new armor PNGs exist.

- [ ] **Step 6: Commit armor**

```powershell
git add src/data/blocks.ts src/systems/textures/pr19TexturePixels.ts src/systems/textures/pr19TextureAssignments.test.mjs public/assets/textures/items
git commit -m "feat: add dedicated armor textures"
```

### Task 6: Enforce PNG Format And Complete Coverage

**Files:**
- Modify: `src/systems/textures/pr19TextureAssignments.test.mjs`

- [ ] **Step 1: Add the final catalog-count and uniqueness test**

```js
test('generated catalog contains every item plus the three PR 19 blocks', () => {
    assert.equal(PR19_TEXTURE_ASSETS.length, 69);
    assert.equal(new Set(PR19_TEXTURE_ASSETS.map(({ slot }) => slot)).size, 69);
    assert.equal(new Set(PR19_TEXTURE_ASSETS.map(({ path }) => path)).size, 69);

    for (const { slot } of PR19_TEXTURE_ASSETS) {
        assert.ok(PR19_TEXTURE_TILES[slot], `slot ${slot} has no pixel definition`);
    }
});
```

- [ ] **Step 2: Add committed-PNG format tests**

```js
const readPngHeader = (filePath) => {
    const bytes = fs.readFileSync(filePath);
    assert.deepEqual(
        Array.from(bytes.subarray(0, 8)),
        [137, 80, 78, 71, 13, 10, 26, 10],
    );
    return {
        width: bytes.readUInt32BE(16),
        height: bytes.readUInt32BE(20),
        bitDepth: bytes[24],
        colorType: bytes[25],
    };
};

test('all generated item PNGs are 16x16 RGBA images', () => {
    const itemAssets = PR19_TEXTURE_ASSETS.filter(({ path }) => path.startsWith('items/'));
    assert.equal(itemAssets.length, 66);

    for (const { path: relativePath } of itemAssets) {
        const header = readPngHeader(path.join(root, 'public/assets/textures', relativePath));
        assert.deepEqual(header, {
            width: 16,
            height: 16,
            bitDepth: 8,
            colorType: 6,
        });
    }
});
```

- [ ] **Step 3: Add hard-alpha and exact-output tests**

```js
test('all item definitions use only transparent or fully opaque alpha', () => {
    for (const { slot, path: relativePath } of PR19_TEXTURE_ASSETS) {
        if (!relativePath.startsWith('items/')) continue;
        const pixels = rasterizePixelTile(PR19_TEXTURE_TILES[slot]);
        for (let offset = 3; offset < pixels.length; offset += 4) {
            assert.ok(pixels[offset] === 0 || pixels[offset] === 255);
        }
    }
});

test('committed PNGs exactly match every generated definition', () => {
    const result = spawnSync(
        process.execPath,
        [
            '--no-warnings',
            '--experimental-strip-types',
            path.join(root, 'scripts/generate_pr19_textures.mjs'),
            '--check',
        ],
        { cwd: root, encoding: 'utf8' },
    );
    assert.equal(result.status, 0, result.stderr || result.stdout);
});
```

- [ ] **Step 4: Run all texture tests**

Run:

```powershell
node --test src/systems/textures/pr19TextureAssignments.test.mjs
node --no-warnings --experimental-strip-types scripts/generate_pr19_textures.mjs --check
```

Expected: PASS with 66 item PNGs and 69 total generated assets.

- [ ] **Step 5: Commit final coverage**

```powershell
git add src/systems/textures/pr19TextureAssignments.test.mjs
git commit -m "test: verify every generated item texture"
```

### Task 7: Full Validation And Runtime Visual Review

**Files:**
- No planned source edits.
- Fix only defects revealed by validation.

- [ ] **Step 1: Run the complete Node test suite**

```powershell
$tests = Get-ChildItem -Path src -Recurse -Filter *.test.mjs | ForEach-Object { $_.FullName }
node --test $tests
```

Expected: all tests PASS.

- [ ] **Step 2: Run static checks and production build**

```powershell
npm run typecheck
npm run lint
npm run build
git diff --check
```

Expected: all commands exit 0. Existing module-type, font-resolution, and large-bundle warnings may remain.

- [ ] **Step 3: Start the browser build**

```powershell
npm run dev -- --host 127.0.0.1 --port 5174
```

Open `http://127.0.0.1:5174`.

- [ ] **Step 4: Inspect all item families**

In a temporary creative world:

- Open creative inventory.
- Inspect all six material tool families.
- Inspect all four armor materials and Polarity Boots.
- Inspect the bed, apple, stick, fuels, ingots, raw ores, gems, lapis, seeds, and four saplings.
- Select representative items from each family and inspect first-person held rendering.
- Drop representative items and inspect dropped-item rendering in daylight and darkness.

Expected:

- No item displays a block face, ingot/gem armor fallback, missing image, blurry scaling, transparent fringe, or incorrect family palette.
- All sprites remain recognizable in inventory slots and as small dropped items.

- [ ] **Step 5: Confirm branch isolation**

```powershell
git status --short
git -C C:\Users\Logan\VisualStudioCode\atlas status --short
git -C C:\Users\Logan\VisualStudioCode\atlas branch --show-current
```

Expected:

- PR worktree is clean after commits.
- Normal checkout remains clean on `main`.

- [ ] **Step 6: Push the existing PR branch**

Fetch first. Rebase when the remote head is not already contained in the local
branch:

```powershell
git fetch origin main-kf9l7x
git merge-base --is-ancestor origin/main-kf9l7x HEAD
if ($LASTEXITCODE -ne 0) { git rebase origin/main-kf9l7x }
git push origin main-kf9l7x
```

Never force-push. If the remote contains overlapping texture work, stop and reconcile it before pushing.
