# PR 19 Block Family Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the Dead Forest biome, make every PR 19 block family follow Atlas's established behavior, and replace weak added textures with deterministic 16x16 artwork.

**Architecture:** Add one shared registry for wood, log, grass, and stone family membership, then use it from interaction and recipe code instead of repeated conditionals. Keep block IDs stable, remove only Dead Forest routing, and extend the existing deterministic PR 19 texture catalog so committed PNGs are generated and byte-checked from TypeScript definitions.

**Tech Stack:** TypeScript, React, Three.js, Node.js native test runner, deterministic RGBA pixel definitions, custom PNG encoder.

---

## File Structure

- Create `src/systems/registry/blockFamilies.ts`
  - Own explicit grass, log, wood, and stone family metadata and membership helpers.
- Create `src/systems/registry/blockFamilies.test.mjs`
  - Verify family completeness and unique membership.
- Create `src/systems/world/biomeRegistry.test.mjs`
  - Verify Dead Forest is absent from biome/config/music/generation source.
- Modify `src/systems/world/biomes.ts`
  - Remove Dead Forest registration and selection.
- Modify `src/systems/world/genConfig.ts`
  - Remove `deadForest` configuration.
- Modify `src/systems/world/chunkGeneration.ts`
  - Remove the unused `dead` vegetation branch.
- Modify `src/systems/sound/MusicController.ts`
  - Remove `dead_forest` music routing.
- Modify `src/data/blocks.ts`
  - Add correct drops and fuel behavior to added block families and wooden tools.
- Modify `src/components/controllers/InteractionController.tsx`
  - Use the shared log-family predicate for placement rotation.
- Modify `src/recipes.ts`
  - Generate complete wood recipes and stone-tool recipes from shared family tables.
- Modify `src/recipes.test.mjs`
  - Verify every family recipe through the real `checkRecipe` API.
- Modify `src/systems/textures/pr19TexturePixels.ts`
  - Add deterministic definitions for slots 169-204 and improve slots 35, 102, and 103.
- Modify `src/systems/textures/pr19TextureAssignments.test.mjs`
  - Verify complete deterministic block catalog, dimensions, byte identity, and visual signatures.
- Regenerate `public/assets/textures/blocks/*.png`
  - Replace all GLM-added external block textures with deterministic files.
- Regenerate:
  - `public/assets/textures/items/stick.png`
  - `public/assets/textures/items/diamond.png`
  - `public/assets/textures/items/emerald.png`

### Task 1: Shared Block Family Registry

**Files:**
- Create: `src/systems/registry/blockFamilies.ts`
- Create: `src/systems/registry/blockFamilies.test.mjs`

- [ ] **Step 1: Write the failing family registry test**

The test imports the proposed registry and requires:

```js
const expectedWoodNames = [
    'oak', 'spruce', 'birch', 'cherry', 'jungle', 'dark_oak', 'acacia',
];

test('all seven wood families are registered once', () => {
    assert.deepEqual(WOOD_FAMILIES.map(({ name }) => name), expectedWoodNames);
    assert.equal(new Set(WOOD_FAMILIES.map(({ log }) => log)).size, 7);
    assert.equal(new Set(WOOD_FAMILIES.map(({ planks }) => planks)).size, 7);
    assert.equal(new Set(WOOD_FAMILIES.map(({ sapling }) => sapling)).size, 7);
});

test('grass and stone families contain the intended blocks', () => {
    assert.equal(GRASS_BLOCKS.length, 8);
    assert.equal(STONE_TOOL_MATERIALS.length, 4);
    LOG_BLOCKS.forEach((type) => assert.equal(isLogBlock(type), true));
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
node --test src/systems/registry/blockFamilies.test.mjs
```

Expected: FAIL because `blockFamilies.ts` does not exist.

- [ ] **Step 3: Implement the registry**

Export:

```ts
export interface WoodFamily {
    name: 'oak' | 'spruce' | 'birch' | 'cherry' | 'jungle' | 'dark_oak' | 'acacia';
    log: BlockType;
    planks: BlockType;
    sapling: BlockType;
    slab: BlockType;
    stairs: BlockType;
}

export const WOOD_FAMILIES: readonly WoodFamily[] = [/* all seven exact mappings */];
export const GRASS_BLOCKS = [
    BlockType.GRASS,
    BlockType.SNOWY_GRASS,
    BlockType.MOSSY_GRASS,
    BlockType.LUSH_GRASS,
    BlockType.DARK_GRASS,
    BlockType.MEADOW_GRASS,
    BlockType.SAVANNA_GRASS,
    BlockType.JUNGLE_GRASS,
] as const;
export const STONE_TOOL_MATERIALS = [
    BlockType.COBBLESTONE,
    BlockType.ANDESITE,
    BlockType.DIORITE,
    BlockType.GRANITE,
] as const;
export const LOG_BLOCKS = WOOD_FAMILIES.map(({ log }) => log);
const LOG_BLOCK_SET = new Set<BlockType>(LOG_BLOCKS);
export const isLogBlock = (type: BlockType): boolean => LOG_BLOCK_SET.has(type);
```

- [ ] **Step 4: Run the test and verify GREEN**

Run:

```powershell
node --test src/systems/registry/blockFamilies.test.mjs
```

Expected: PASS.

### Task 2: Remove Dead Forest Without Breaking Saves

**Files:**
- Create: `src/systems/world/biomeRegistry.test.mjs`
- Modify: `src/systems/world/biomes.ts`
- Modify: `src/systems/world/genConfig.ts`
- Modify: `src/systems/world/chunkGeneration.ts`
- Modify: `src/systems/sound/MusicController.ts`

- [ ] **Step 1: Write the failing Dead Forest removal test**

Read the four source files and require:

```js
for (const [name, source] of Object.entries(sources)) {
    assert.doesNotMatch(source, /\bdead_forest\b/i, `${name} still routes dead_forest`);
    assert.doesNotMatch(source, /\bDEAD_FOREST\b/, `${name} still registers DEAD_FOREST`);
    assert.doesNotMatch(source, /\bdeadForest\b/, `${name} still configures deadForest`);
}
assert.doesNotMatch(chunkGenerationSource, /vType === ['"]dead['"]/);
```

Also assert `BlockType.COARSE_DIRT` and its block definition remain present.

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
node --test src/systems/world/biomeRegistry.test.mjs
```

Expected: FAIL on the existing biome, config, music, and vegetation branch.

- [ ] **Step 3: Remove Dead Forest routing**

Delete:

- `BIOMES.DEAD_FOREST`
- the `b.deadForest` selection branch
- `GenConfig.biomes.deadForest`
- `"dead_forest": ["music.forest"]`
- `vType === 'dead'` generation logic
- `'dead'` from the `VegetationType` union

Do not remove `COARSE_DIRT` from `BlockType`, `BLOCKS`, creative inventory, or texture mappings.

- [ ] **Step 4: Run the test and verify GREEN**

Run:

```powershell
node --test src/systems/world/biomeRegistry.test.mjs
```

Expected: PASS.

### Task 3: Correct Drops, Fuel, And Log Rotation

**Files:**
- Modify: `src/systems/registry/blockFamilies.test.mjs`
- Modify: `src/data/blocks.ts`
- Modify: `src/components/controllers/InteractionController.tsx`

- [ ] **Step 1: Add failing behavior assertions**

Parse `BLOCKS` and interaction source to assert:

```js
for (const type of GRASS_BLOCKS) {
    assert.deepEqual(BLOCKS[type].drops, [
        { type: BlockType.DIRT, chance: 1, min: 1, max: 1 },
    ]);
}

for (const family of WOOD_FAMILIES) {
    assert.equal(BLOCKS[family.log].isFuel, true);
    assert.equal(BLOCKS[family.log].fuelValue, 15000);
    assert.equal(BLOCKS[family.log].smeltsInto, BlockType.CHARCOAL);
    assert.equal(BLOCKS[family.planks].isFuel, true);
    assert.equal(BLOCKS[family.sapling].isFuel, true);
    assert.equal(BLOCKS[family.slab].isFuel, true);
    assert.equal(BLOCKS[family.stairs].isFuel, true);
}

assert.equal(BLOCKS[BlockType.WOOD_SWORD].isFuel, true);
assert.equal(BLOCKS[BlockType.WOOD_HOE].isFuel, true);
assert.match(interactionSource, /isLogBlock\(heldItem\.type\)/);
```

Also require andesite, diorite, and granite to explicitly drop themselves and smelt to stone.

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
node --test src/systems/registry/blockFamilies.test.mjs
```

Expected: FAIL for grass drops, wooden sword/hoe fuel, stone drops, and the interaction helper.

- [ ] **Step 3: Implement minimal block behavior**

- Add dirt drops to all eight grass definitions.
- Add self-drops to andesite, diorite, and granite.
- Add `isFuel: true, fuelValue: 10000` to wooden sword and hoe.
- Import `isLogBlock` in `InteractionController.tsx`.
- Replace the four-log conditional with:

```ts
if (isLogBlock(heldItem.type)) {
    if (Math.abs(hit.ny) > 0.5) rotation = 0;
    else if (Math.abs(hit.nx) > 0.5) rotation = 1;
    else if (Math.abs(hit.nz) > 0.5) rotation = 2;
}
```

- [ ] **Step 4: Run the test and verify GREEN**

Run:

```powershell
node --test src/systems/registry/blockFamilies.test.mjs
```

Expected: PASS.

### Task 4: Generate Complete Wood And Stone Recipes

**Files:**
- Modify: `src/recipes.test.mjs`
- Modify: `src/recipes.ts`

- [ ] **Step 1: Add real recipe API tests**

Import `checkRecipe`, `WOOD_FAMILIES`, and `STONE_TOOL_MATERIALS`. For every wood
family, test:

```js
assert.deepEqual(checkRecipe([family.log, null, null, null], 2), {
    type: family.planks,
    count: 4,
});
assert.deepEqual(checkRecipe([family.planks, null, family.planks, null], 2), {
    type: BlockType.STICK,
    count: 4,
});
assert.deepEqual(checkRecipe([
    family.planks, family.planks, family.planks,
    family.planks, null, family.planks,
    family.planks, family.planks, family.planks,
], 3), { type: BlockType.CHEST, count: 1 });
```

Test the matching crafting table, bed, five wooden tools, slab, and both stair
handedness recipes. Test that mixing two plank species does not match.

For every `STONE_TOOL_MATERIALS` entry, test pickaxe, axe in both handednesses,
shovel, sword, and hoe in both handednesses.

- [ ] **Step 2: Run the tests and verify RED**

Run:

```powershell
node --test src/recipes.test.mjs
```

Expected: FAIL because the new stone variants have no tool recipes.

- [ ] **Step 3: Refactor recipe construction around family tables**

Import `WOOD_FAMILIES` and `STONE_TOOL_MATERIALS`. Generate wood recipes from
the family table and remove duplicated declarations for:

- logs to planks
- sticks
- crafting tables
- chests
- beds
- wooden tools
- wood slabs and stairs

Generate stone tools for every stone material while retaining the existing
output types and recipe shapes.

- [ ] **Step 4: Run the tests and verify GREEN**

Run:

```powershell
node --test src/recipes.test.mjs
```

Expected: PASS.

### Task 5: Deterministic Block And Corrected Item Textures

**Files:**
- Modify: `src/systems/textures/pr19TextureAssignments.test.mjs`
- Modify: `src/systems/textures/pr19TexturePixels.ts`
- Modify: `src/systems/textures/textureMapping.ts`
- Regenerate: `public/assets/textures/blocks/*.png`
- Regenerate:
  - `public/assets/textures/items/stick.png`
  - `public/assets/textures/items/diamond.png`
  - `public/assets/textures/items/emerald.png`

- [ ] **Step 1: Add failing deterministic catalog tests**

Require generated definitions for slots 169-204:

```js
const GLM_BLOCK_SLOTS = Array.from({ length: 36 }, (_, index) => 169 + index);
const generatedSlots = new Set(PR19_TEXTURE_ASSETS.map(({ slot }) => slot));
GLM_BLOCK_SLOTS.forEach((slot) => assert.equal(generatedSlots.has(slot), true));
assert.equal(PR19_TEXTURE_ASSETS.length, 105);
```

Verify all generated files are 16x16 RGBA. Verify unique signatures for:

- log sides: 191, 196, 201
- planks: 192, 197, 202
- saplings: 194, 199, 204
- stones: 184, 185, 186, 189
- grass tops: 170, 172, 174, 176, 178, 180

Verify item silhouettes:

```js
assert.ok(opaqueCount(35) >= 20, 'stick must be a readable two-pixel shaft');
assert.notDeepEqual(alphaMask(102), alphaMask(103));
assert.ok(lowestOpaqueY(102) > highestOpaqueY(102));
```

- [ ] **Step 2: Run texture tests and verify RED**

Run:

```powershell
node --test src/systems/textures/pr19TextureAssignments.test.mjs
```

Expected: FAIL because slots 169-204 are not in the deterministic catalog and
the current stick/diamond/emerald definitions do not meet the new silhouette
requirements.

- [ ] **Step 3: Add deterministic texture definitions**

Extend `PR19_TEXTURE_ASSETS` with:

- slot 169: `blocks/packed_ice.png`
- slots 170-189: all biome grass, podzol, stone, dirt, mud, and mossy cobble files
- slots 190-204: jungle, dark oak, and acacia log/plank/leaf/sapling files

Add reusable helpers:

```ts
const opaqueTile = (...layers: PixelLayer[]) => tile(...layers);
const cutoutTile = (...layers: PixelLayer[]) => tile(...layers);
const pixelSignature = not exported; tests use rasterized output.
```

Use explicit rectangle layers only. Do not use randomness. Keep all block
textures fully opaque except leaves and saplings, which use hard alpha.

Replace slots 35, 102, and 103 with the approved stick, diamond, and emerald
silhouettes.

Add slot 169 to `TEXTURE_PATHS` as `blocks/packed_ice.png`.

- [ ] **Step 4: Generate PNGs**

Run:

```powershell
node --no-warnings --experimental-strip-types scripts/generate_pr19_textures.mjs
```

Expected: 105 generated assets, including all slots 169-204.

- [ ] **Step 5: Run texture tests and verify GREEN**

Run:

```powershell
node --test src/systems/textures/pr19TextureAssignments.test.mjs
node --no-warnings --experimental-strip-types scripts/generate_pr19_textures.mjs --check
```

Expected: PASS.

### Task 6: Visual QA And Full Validation

**Files:**
- Fix only defects revealed by validation.

- [ ] **Step 1: Generate nearest-neighbor contact sheets**

Create temporary contact sheets outside the repository for:

- all seven wood families;
- all saplings and leaves;
- new grass/soil/stone blocks;
- diamond, emerald, and stick.

Inspect for blank pixels, clipping, weak contrast, duplicated patterns, and
palette confusion.

- [ ] **Step 2: Run the complete Node test suite**

```powershell
$tests = Get-ChildItem -Path src -Recurse -Filter *.test.mjs | ForEach-Object { $_.FullName }
node --test $tests
```

Expected: all tests PASS.

- [ ] **Step 3: Run static and production checks**

```powershell
npm run typecheck
npm run lint
npm run build
node --no-warnings --experimental-strip-types scripts/generate_pr19_textures.mjs --check
git diff --check
```

Expected: all commands exit 0. Existing Vite bundle-size and font-resolution
warnings may remain.

- [ ] **Step 4: Browser smoke test**

Start:

```powershell
npm run dev -- --host 127.0.0.1 --port 5174
```

Verify:

- main menu loads;
- a new creative world reaches gameplay;
- no texture loading errors appear;
- creative inventory shows the added wood and stone blocks;
- representative new logs rotate correctly when placed if pointer-lock input is
  available.

- [ ] **Step 5: Commit and push**

Commit implementation without agent attribution:

```powershell
git add src public/assets/textures docs/superpowers/plans/2026-06-20-pr19-block-family-consistency.md
git commit -m "fix: align biome block families"
git fetch origin main-kf9l7x
git merge-base --is-ancestor origin/main-kf9l7x HEAD
git push origin main-kf9l7x
```

Never force-push. Confirm the normal checkout remains clean on `main`.
