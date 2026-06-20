# PR 19 Block Family Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the Dead Forest biome, make every PR 19 block family follow Atlas's established behavior, improve new sapling/item artwork, and expose optional PNG paths for every used atlas slot.

**Architecture:** Add one shared registry for wood, log, grass, and stone family membership, then use it from interaction and recipe code instead of repeated conditionals. Keep block IDs stable, remove only Dead Forest routing, retain existing placed-block PNGs, generate only the approved sapling/item artwork, and complete the existing `TEXTURE_PATHS` fallback map.

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
  - Add deterministic definitions for saplings 194, 199, and 204 and improve slots 35, 102, and 103.
- Modify `src/systems/textures/pr19TextureAssignments.test.mjs`
  - Verify all used atlas slots have optional PNG mappings, generated dimensions, byte identity, and sapling/item visual signatures.
- Regenerate:
  - `public/assets/textures/blocks/jungle_sapling.png`
  - `public/assets/textures/blocks/dark_oak_sapling.png`
  - `public/assets/textures/blocks/acacia_sapling.png`
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

### Task 5: Complete PNG Override Coverage And Corrected Artwork

**Files:**
- Modify: `src/systems/textures/pr19TextureAssignments.test.mjs`
- Modify: `src/systems/textures/pr19TexturePixels.ts`
- Modify: `src/systems/textures/textureMapping.ts`
- Regenerate:
  - `public/assets/textures/blocks/jungle_sapling.png`
  - `public/assets/textures/blocks/dark_oak_sapling.png`
  - `public/assets/textures/blocks/acacia_sapling.png`
- Regenerate:
  - `public/assets/textures/items/stick.png`
  - `public/assets/textures/items/diamond.png`
  - `public/assets/textures/items/emerald.png`

- [ ] **Step 1: Add failing override coverage and generated-art tests**

Derive used slots from `blocks.ts`, `atlasTileFamilies.ts`, `textures.ts`, and
`textureResolver.ts`. Require a descriptive `blocks/*.png` or `items/*.png`
mapping for every used slot:

```js
for (const slot of usedSlots) {
    assert.ok(mappedPaths.get(slot), `slot ${slot} has no optional PNG mapping`);
}
```

Require generated definitions only for saplings 194, 199, and 204. Verify all
generated files are 16x16 RGBA and the saplings have distinct signatures.

Verify item silhouettes:

```js
assert.ok(opaqueCount(35) >= 30, 'stick must be a readable two-pixel shaft');
assert.notDeepEqual(alphaMask(102), alphaMask(103));
assert.ok(opaqueCount(102) >= 40);
assert.ok(opaqueCount(103) >= 40);
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```powershell
node --test src/systems/textures/pr19TextureAssignments.test.mjs
```

Expected: FAIL because several used procedural/face slots have no
`TEXTURE_PATHS` entry, the three saplings are not generated, and the current
stick/diamond/emerald definitions do not meet the new silhouette requirements.

- [ ] **Step 3: Complete `TEXTURE_PATHS`**

Add descriptive mappings for every missing used slot, including crafting table,
furnace, chest, torch, bed, cherry/birch wood, terracotta, ores, cactus, and
packed ice. Do not create the missing PNG files; absence must preserve the
current procedural fallback.

- [ ] **Step 4: Add deterministic sapling and item definitions**

Extend `PR19_TEXTURE_ASSETS` with:

- slot 194: `blocks/jungle_sapling.png`
- slot 199: `blocks/dark_oak_sapling.png`
- slot 204: `blocks/acacia_sapling.png`

Replace slots 35, 102, and 103 with the approved stick, diamond, and emerald
silhouettes.

- [ ] **Step 5: Generate PNGs**

Run:

```powershell
node --no-warnings --experimental-strip-types scripts/generate_pr19_textures.mjs
```

Expected: 72 generated assets. Existing non-sapling placed-block PNGs remain
unchanged.

- [ ] **Step 6: Run texture tests and verify GREEN**

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

- jungle, dark oak, and acacia saplings;
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
- absent mapped PNGs fall back without image decode errors;
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
