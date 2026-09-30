import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { URL } from 'node:url';
import { build } from 'esbuild';

const source = readFileSync(new URL('./recipes.ts', import.meta.url), 'utf8');
const root = path.resolve(import.meta.dirname, '..');
const bundled = await build({
    absWorkingDir: root,
    bundle: true,
    format: 'esm',
    platform: 'node',
    stdin: {
        contents: `
            export { checkRecipe } from './src/recipes.ts';
            export { BlockType } from './src/types.ts';
            export { WOOD_FAMILIES, STONE_TOOL_MATERIALS } from './src/systems/registry/blockFamilies.ts';
        `,
        resolveDir: root,
        sourcefile: 'recipe-test-entry.ts',
    },
    write: false,
});
const recipeModule = await import(
    `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`
);
const {
    BlockType,
    STONE_TOOL_MATERIALS,
    WOOD_FAMILIES,
    checkRecipe,
} = recipeModule;

test('iron ingots compress into an Iron Block', () => {
    assert.match(
        source,
        /push\(\s*3,\s*\[(?:\s*BlockType\.IRON_INGOT\s*,?){9}\s*\],\s*BlockType\.IRON_BLOCK,\s*1\s*\)/s,
    );
});

test('an Iron Block decompresses into nine iron ingots', () => {
    assert.match(
        source,
        /push\(\s*2,\s*\[\s*BlockType\.IRON_BLOCK,\s*null,\s*null,\s*null\s*\],\s*BlockType\.IRON_INGOT,\s*9\s*\)/s,
    );
});

test('every wood family supports the established crafting set', () => {
    for (const family of WOOD_FAMILIES) {
        assert.deepEqual(
            checkRecipe([family.log, null, null, null], 2),
            { type: family.planks, count: 4 },
            `${family.name} logs to planks`,
        );
        assert.deepEqual(
            checkRecipe([family.planks, null, family.planks, null], 2),
            { type: BlockType.STICK, count: 4 },
            `${family.name} planks to sticks`,
        );
        assert.deepEqual(
            checkRecipe([
                family.planks, family.planks,
                family.planks, family.planks,
            ], 2),
            { type: BlockType.CRAFTING_TABLE, count: 1 },
            `${family.name} crafting table`,
        );
        assert.deepEqual(
            checkRecipe([
                family.planks, family.planks, family.planks,
                family.planks, null, family.planks,
                family.planks, family.planks, family.planks,
            ], 3),
            { type: BlockType.CHEST, count: 1 },
            `${family.name} chest`,
        );
        assert.deepEqual(
            checkRecipe([
                BlockType.WOOL, BlockType.WOOL, BlockType.WOOL,
                family.planks, family.planks, family.planks,
                null, null, null,
            ], 3),
            { type: BlockType.BED_ITEM, count: 1 },
            `${family.name} bed`,
        );
        assert.deepEqual(
            checkRecipe([
                family.planks, family.planks, family.planks,
                null, BlockType.STICK, null,
                null, BlockType.STICK, null,
            ], 3),
            { type: BlockType.WOOD_PICKAXE, count: 1 },
            `${family.name} pickaxe`,
        );
        assert.deepEqual(
            checkRecipe([
                family.planks, family.planks, null,
                family.planks, BlockType.STICK, null,
                null, BlockType.STICK, null,
            ], 3),
            { type: BlockType.WOOD_AXE, count: 1 },
            `${family.name} axe`,
        );
        assert.deepEqual(
            checkRecipe([
                null, family.planks, null,
                null, BlockType.STICK, null,
                null, BlockType.STICK, null,
            ], 3),
            { type: BlockType.WOOD_SHOVEL, count: 1 },
            `${family.name} shovel`,
        );
        assert.deepEqual(
            checkRecipe([
                null, family.planks, null,
                null, family.planks, null,
                null, BlockType.STICK, null,
            ], 3),
            { type: BlockType.WOOD_SWORD, count: 1 },
            `${family.name} sword`,
        );
        assert.deepEqual(
            checkRecipe([
                family.planks, family.planks, null,
                null, BlockType.STICK, null,
                null, BlockType.STICK, null,
            ], 3),
            { type: BlockType.WOOD_HOE, count: 1 },
            `${family.name} hoe`,
        );
        assert.deepEqual(
            checkRecipe([
                family.planks, family.planks, family.planks,
                null, null, null,
                null, null, null,
            ], 3),
            { type: family.slab, count: 6 },
            `${family.name} slab`,
        );
        assert.deepEqual(
            checkRecipe([
                family.planks, null, null,
                family.planks, family.planks, null,
                family.planks, family.planks, family.planks,
            ], 3),
            { type: family.stairs, count: 4 },
            `${family.name} stairs`,
        );
    }
});

// As in Minecraft: planks mix for what doesn't depend on the wood, and
// cobblestone and cobbled deepslate mix for the furnace and stone tools; slabs,
// stairs and boats keep to one kind.
test('mixed planks and stone make what Minecraft lets them make, and only that', () => {
    const O = BlockType.OAK_PLANKS, P = BlockType.SPRUCE_PLANKS, B = BlockType.BIRCH_PLANKS, S = BlockType.STICK;
    assert.deepEqual(checkRecipe([O, P, B, O], 2), { type: BlockType.CRAFTING_TABLE, count: 1 });
    assert.deepEqual(checkRecipe([O, null, P, null], 2), { type: BlockType.STICK, count: 4 });
    assert.deepEqual(checkRecipe([O, P, B, null, S, null, null, S, null], 3), { type: BlockType.WOOD_PICKAXE, count: 1 });
    assert.deepEqual(checkRecipe([O, O, O, P, null, P, B, B, B], 3), { type: BlockType.CHEST, count: 1 });
    assert.deepEqual(checkRecipe([BlockType.WOOL, BlockType.WOOL, BlockType.WOOL, O, P, B, null, null, null], 3), { type: BlockType.BED_ITEM, count: 1 });
    // Wood-specific results never mix.
    assert.equal(checkRecipe([null, null, null, O, P, O, null, null, null], 3), null, 'no mixed slabs');
    assert.equal(checkRecipe([O, null, null, O, P, null, O, O, O], 3), null, 'no mixed stairs');
    assert.equal(checkRecipe([null, null, null, O, null, O, O, P, O], 3), null, 'no mixed boat');
    const C = BlockType.COBBLESTONE, D = BlockType.COBBLED_DEEPSLATE;
    assert.deepEqual(checkRecipe([C, D, C, D, null, D, C, D, C], 3), { type: BlockType.FURNACE, count: 1 });
    assert.deepEqual(checkRecipe([D, D, D, D, null, D, D, D, D], 3), { type: BlockType.FURNACE, count: 1 });
    assert.deepEqual(checkRecipe([C, D, C, null, S, null, null, S, null], 3), { type: BlockType.STONE_PICKAXE, count: 1 });
    // Planks and stone never stand in for each other.
    assert.equal(checkRecipe([O, C, O, O], 2), null);
});

// Minecraft's recipes only: the pickaxe is three planks over two sticks at a
// table (there was a 2x2 one), and a mirrored axe mirrors the axe.
test('no 2x2 wooden pickaxe, and mirrored axes are real mirror images', () => {
    const O = BlockType.OAK_PLANKS, S = BlockType.STICK;
    assert.equal(checkRecipe([O, O, S, S], 2), null);
    for (const [mat, axe] of [[O, BlockType.WOOD_AXE], [BlockType.IRON_INGOT, BlockType.IRON_AXE], [BlockType.DIAMOND, BlockType.DIAMOND_AXE], [BlockType.COBBLESTONE, BlockType.STONE_AXE]]) {
        assert.deepEqual(checkRecipe([mat, mat, null, mat, S, null, null, S, null], 3), { type: axe, count: 1 });
        assert.deepEqual(checkRecipe([null, mat, mat, null, S, mat, null, S, null], 3), { type: axe, count: 1 });
        assert.equal(checkRecipe([mat, mat, null, null, mat, S, null, S, null], 3), null, 'the old broken mirror');
    }
    // Nine ice pack into one packed ice, as in Minecraft.
    const I = BlockType.ICE;
    assert.equal(checkRecipe([I, I, I, I], 2), null);
    assert.deepEqual(checkRecipe([I, I, I, I, I, I, I, I, I], 3), { type: BlockType.PACKED_ICE, count: 1 });
});

test('every stone variant crafts the complete stone tool set', () => {
    const S = BlockType.STICK;
    for (const material of STONE_TOOL_MATERIALS) {
        assert.deepEqual(
            checkRecipe([material, material, material, null, S, null, null, S, null], 3),
            { type: BlockType.STONE_PICKAXE, count: 1 },
        );
        assert.deepEqual(
            checkRecipe([material, material, null, material, S, null, null, S, null], 3),
            { type: BlockType.STONE_AXE, count: 1 },
        );
        assert.deepEqual(
            checkRecipe([null, material, material, null, S, material, null, S, null], 3),
            { type: BlockType.STONE_AXE, count: 1 },
        );
        assert.deepEqual(
            checkRecipe([null, material, null, null, S, null, null, S, null], 3),
            { type: BlockType.STONE_SHOVEL, count: 1 },
        );
        assert.deepEqual(
            checkRecipe([null, material, null, null, material, null, null, S, null], 3),
            { type: BlockType.STONE_SWORD, count: 1 },
        );
        assert.deepEqual(
            checkRecipe([material, material, null, null, S, null, null, S, null], 3),
            { type: BlockType.STONE_HOE, count: 1 },
        );
        assert.deepEqual(
            checkRecipe([null, material, material, null, S, null, null, S, null], 3),
            { type: BlockType.STONE_HOE, count: 1 },
        );
    }
});
