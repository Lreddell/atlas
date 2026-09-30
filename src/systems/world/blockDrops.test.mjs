import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTs } from './storage/bundleTs.mjs';

globalThis.__APP_VERSION__ = 'test';
globalThis.__APP_DISPLAY_VERSION__ = 'test';

const { rollDrops, BLOCKS, BlockType } = await loadTs(`
    import './src/data/resonantDefinitions';
    export { rollDrops } from './src/systems/world/blockDrops';
    export { BLOCKS } from './src/data/blocks';
    export { BlockType } from './src/types';
`);

// A fixed sequence of "random" numbers.
const sequence = (...values) => { let i = 0; return () => values[i++ % values.length]; };

// Drop tables name a count range; breaking a block used to give one item per
// entry whatever the range (copper ore 1 raw copper, not 2 to 5).
test('a drop gives a whole number of items across its min to max range', () => {
    const copper = BLOCKS[BlockType.COPPER_ORE].drops;
    assert.equal(rollDrops(copper, sequence(0, 0)).length, 2, 'the low end');
    assert.equal(rollDrops(copper, sequence(0, 0.999)).length, 5, 'the high end');
    const lapis = BLOCKS[BlockType.LAPIS_ORE].drops;
    assert.equal(rollDrops(lapis, sequence(0, 0)).length, 4);
    assert.equal(rollDrops(lapis, sequence(0, 0.999)).length, 9);
    for (let i = 0; i < 200; i++) {
        const n = rollDrops(copper).length;
        assert.ok(n >= 2 && n <= 5, `copper ore gave ${n}`);
    }
});

test('a drop that misses its chance gives nothing, and a zero minimum can give none', () => {
    const leaves = BLOCKS[BlockType.LEAVES].drops;
    assert.deepEqual(rollDrops(leaves, sequence(0.99)), [], 'every chance missed');
    const bush = BLOCKS[BlockType.DEAD_BUSH].drops;
    assert.deepEqual(rollDrops(bush, sequence(0, 0)), [], 'zero sticks is a roll too');
    assert.deepEqual(rollDrops(bush, sequence(0, 0.999)), [BlockType.STICK, BlockType.STICK]);
    assert.deepEqual(rollDrops(undefined), []);
});

// A lit furnace gives light like Minecraft's (13), and only while it burns.
test('a lit furnace glows and an unlit one does not', () => {
    assert.equal(BLOCKS[BlockType.FURNACE_ACTIVE].lightLevel, 13);
    assert.equal(BLOCKS[BlockType.FURNACE].lightLevel ?? 0, 0);
    assert.equal(BLOCKS[BlockType.FURNACE_ACTIVE].drops[0].type, BlockType.FURNACE);
});

test('Minecraft harvest rules: obsidian needs diamond, podzol drops dirt, stone does not smelt into itself', () => {
    assert.equal(BLOCKS[BlockType.OBSIDIAN].minHarvestTier, 4);
    assert.equal(BLOCKS[BlockType.PODZOL].drops[0].type, BlockType.DIRT);
    assert.equal(BLOCKS[BlockType.STONE].smeltsInto, undefined);
    assert.equal(BLOCKS[BlockType.MAGMA].minHarvestTier, 1);
});
