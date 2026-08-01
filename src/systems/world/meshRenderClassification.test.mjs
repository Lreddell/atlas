import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTs } from './storage/bundleTs.mjs';

globalThis.__APP_VERSION__ = 'test';
globalThis.__APP_DISPLAY_VERSION__ = 'test';

const mod = await loadTs(`
    import './src/data/resonantDefinitions';
    export { generateGeometryData } from './src/systems/world/geometry';
    export { CHUNK_SIZE, MIN_Y, MAX_Y } from './src/constants';
    export { index3D } from './src/systems/world/worldCoords';
    export { BlockType } from './src/types';
    export { CROSS_RENDERED_BLOCKS, isSpriteRenderedType } from './src/data/spriteBlocks';
`);
const {
    generateGeometryData, CHUNK_SIZE, MIN_Y, MAX_Y, index3D, BlockType,
    CROSS_RENDERED_BLOCKS, isSpriteRenderedType,
} = mod;
const H = MAX_Y - MIN_Y + 1;
const CELLS = CHUNK_SIZE * CHUNK_SIZE * H;

const litChunk = () => {
    const chunk = new Uint8Array(CELLS);
    const light = new Uint8Array(CELLS).fill(15 << 4);
    return { chunk, light };
};

// Count quads in a buffer whose first vertex sits on the given axis plane with
// the given outward normal (the mesher always emits 4 vertices per quad).
const countFaces = (buffer, axis, normalValue, plane) => {
    const { positions, normals } = buffer;
    let quads = 0;
    for (let v = 0; v * 3 < positions.length; v += 4) {
        if (normals[v * 3 + axis] === normalValue && positions[v * 3 + axis] === plane) quads++;
    }
    return quads;
};

test('echo crystal and echo spikes mesh as cutout cross sprites, not opaque cubes', () => {
    assert.ok(CROSS_RENDERED_BLOCKS.has(BlockType.ECHO_CRYSTAL));
    assert.ok(CROSS_RENDERED_BLOCKS.has(BlockType.ECHO_SPIKES));
    for (const type of [BlockType.ECHO_CRYSTAL, BlockType.ECHO_SPIKES]) {
        const { chunk, light } = litChunk();
        chunk[index3D(5, 1, 5)] = BlockType.STONE;
        chunk[index3D(5, 2, 5)] = type;
        const res = generateGeometryData(0, 0, chunk, undefined, {}, { center: light }, false);
        // Two cross quads (8 vertices) in the cutout buffer, nothing in opaque
        // besides the stone block (whose quads all touch y<=2).
        assert.equal(res.cutout.positions.length / 3, 8, `${type} should emit 2 cross quads`);
        const opaqueAboveStone = countFaces(res.opaque, 1, 1, MIN_Y + 3);
        assert.equal(opaqueAboveStone, 0, `${type} must not emit an opaque cube top`);
    }
});

test('sprite classification covers items and every cross block', () => {
    assert.ok(isSpriteRenderedType(BlockType.ECHO_CRYSTAL));
    assert.ok(isSpriteRenderedType(BlockType.ECHO_SPIKES));
    assert.ok(isSpriteRenderedType(BlockType.AMETHYST_CLUSTER));
    assert.ok(isSpriteRenderedType(BlockType.ECHO_SHARD)); // isItem
    assert.ok(!isSpriteRenderedType(BlockType.STONE));
    assert.ok(!isSpriteRenderedType(BlockType.ECHO_BRICKS));
});

test('a slab neighbour never seals a transparent-flagged block face (x-ray regression)', () => {
    const { chunk, light } = litChunk();
    const meta = new Uint8Array(CELLS);
    // Phase block with a bottom slab flush against its +X side.
    chunk[index3D(5, 2, 5)] = BlockType.PHASE_BLOCK;
    chunk[index3D(6, 2, 5)] = BlockType.ECHO_STONE_SLAB;
    const res = generateGeometryData(0, 0, chunk, meta, {}, { center: light }, false);
    const phaseFacesTowardSlab = countFaces(res.opaque, 0, 1, 6);
    assert.ok(phaseFacesTowardSlab >= 1, 'phase block face against a slab must render');
});

test('water against a slab keeps its face instead of opening a hole', () => {
    const { chunk, light } = litChunk();
    const meta = new Uint8Array(CELLS);
    chunk[index3D(5, 2, 5)] = BlockType.WATER;
    chunk[index3D(6, 2, 5)] = BlockType.ECHO_STONE_SLAB;
    const res = generateGeometryData(0, 0, chunk, meta, {}, { center: light }, false);
    const waterFacesTowardSlab = countFaces(res.transparent, 0, 1, 6);
    assert.ok(waterFacesTowardSlab >= 1, 'water face against a slab must render');
});
