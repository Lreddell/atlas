import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTs } from './storage/bundleTs.mjs';

// The mesher graph reaches src/constants.ts, which reads vite's compile-time
// defines, stub them before the bundled module is imported.
globalThis.__APP_VERSION__ = 'test';
globalThis.__APP_DISPLAY_VERSION__ = 'test';

const mod = await loadTs(`
    import './src/data/resonantDefinitions';
    export { generateGeometryData, TILE_RAW, packTile } from './src/systems/world/geometry';
    export { resolveTile } from './src/systems/world/textureResolver';
    export { uvVariationMode } from './src/systems/world/voxelVertex';
    export { CHUNK_SIZE, MIN_Y, MAX_Y } from './src/constants';
    export { index3D } from './src/systems/world/worldCoords';
    export { BlockType } from './src/types';
`);
const { generateGeometryData, TILE_RAW, packTile, resolveTile, uvVariationMode, CHUNK_SIZE, MIN_Y, MAX_Y, index3D, BlockType } = mod;
const CELLS = CHUNK_SIZE * CHUNK_SIZE * (MAX_Y - MIN_Y + 1);
const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const SOLIDS = [BlockType.STONE, BlockType.DIRT, BlockType.GRASS, BlockType.COBBLESTONE];

const quadsOf = (buffer) => {
    const quads = [];
    for (let v = 0; v * 3 < buffer.positions.length; v += 4) {
        const corners = [0, 1, 2, 3].map(k => [buffer.positions[(v + k) * 3], buffer.positions[(v + k) * 3 + 1], buffer.positions[(v + k) * 3 + 2]]);
        const min = [0, 1, 2].map(a => Math.min(...corners.map(c => c[a])));
        const max = [0, 1, 2].map(a => Math.max(...corners.map(c => c[a])));
        quads.push({
            v, min, max,
            normal: [buffer.normals[v * 3], buffer.normals[v * 3 + 1], buffer.normals[v * 3 + 2]],
            colors: [0, 1, 2, 3].map(k => [...buffer.colors.slice((v + k) * 4, (v + k) * 4 + 4)]),
            uvs: [0, 1, 2, 3].map(k => [buffer.uvs[(v + k) * 2], buffer.uvs[(v + k) * 2 + 1]]),
            tiles: [0, 1, 2, 3].map(k => buffer.tiles[v + k]),
        });
    }
    return quads;
};

// A deterministic lumpy terrain: mixed solids, holes and overhangs, under open sky.
function terrainChunk() {
    const chunk = new Uint8Array(CELLS);
    const light = new Uint8Array(CELLS).fill(15 << 4);
    let seed = 12345;
    const rand = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296);
    for (let x = 0; x < CHUNK_SIZE; x++) {
        for (let z = 0; z < CHUNK_SIZE; z++) {
            const height = 6 + Math.floor(3 * Math.sin(x * 0.7) + 2 * Math.cos(z * 0.5));
            for (let y = 0; y <= height; y++) {
                if (rand() < 0.04) continue; // holes
                chunk[index3D(x, y, z)] = y === height ? BlockType.GRASS : SOLIDS[Math.floor(rand() * 2) === 0 ? 0 : 1];
            }
        }
    }
    return { chunk, light };
}

test('greedy faces cover every visible face of a full cube exactly once, and nothing else', () => {
    const { chunk, light } = terrainChunk();
    const { opaque } = generateGeometryData(0, 0, chunk, undefined, {}, { center: light }, false);
    const typeAt = (x, y, z) => (x < 0 || x >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE || y < MIN_Y || y > MAX_Y) ? 0 : chunk[index3D(x, y, z)];
    // Every unit face the quads stand for, keyed by block and direction.
    const covered = new Map();
    for (const quad of quadsOf(opaque)) {
        const d = DIRS.findIndex(n => n[0] === quad.normal[0] && n[1] === quad.normal[1] && n[2] === quad.normal[2]);
        assert.ok(d >= 0, 'axis-aligned face');
        const axis = DIRS[d].findIndex(c => c !== 0);
        const plane = quad.min[axis];
        const block = DIRS[d][axis] > 0 ? plane - 1 : plane;
        const ranges = [0, 1, 2].map(a => (a === axis ? [block, block + 1] : [quad.min[a], quad.max[a]]));
        for (let x = ranges[0][0]; x < ranges[0][1]; x++) {
            for (let y = ranges[1][0]; y < ranges[1][1]; y++) {
                for (let z = ranges[2][0]; z < ranges[2][1]; z++) {
                    const key = `${x},${y},${z},${d}`;
                    covered.set(key, (covered.get(key) ?? 0) + 1);
                }
            }
        }
    }
    let visible = 0;
    for (let x = 0; x < CHUNK_SIZE; x++) {
        for (let z = 0; z < CHUNK_SIZE; z++) {
            for (let y = -2; y <= 16; y++) {
                if (!SOLIDS.includes(typeAt(x, y, z))) continue;
                DIRS.forEach((n, d) => {
                    const neighbour = typeAt(x + n[0], y + n[1], z + n[2]);
                    const key = `${x},${y},${z},${d}`;
                    if (SOLIDS.includes(neighbour)) {
                        assert.equal(covered.get(key), undefined, `hidden face drawn: ${key}`);
                    } else {
                        visible++;
                        assert.equal(covered.get(key), 1, `visible face ${key} covered once`);
                    }
                });
            }
        }
    }
    assert.ok(visible > 1000, 'the terrain has faces to check');
    assert.equal([...covered.values()].reduce((a, b) => a + b, 0), visible, 'no face covered that is not a visible face');
});

test('merged quads are flat-lit, tiled, and span their size in blocks', () => {
    const { chunk, light } = terrainChunk();
    const { opaque } = generateGeometryData(0, 0, chunk, undefined, {}, { center: light }, false);
    const quads = quadsOf(opaque);
    let merged = 0;
    for (const quad of quads) {
        const size = [0, 1, 2].map(a => quad.max[a] - quad.min[a]).filter(s => s > 0);
        const area = size[0] * size[1];
        assert.ok(quad.tiles.every(t => t === quad.tiles[0] && t !== TILE_RAW), 'full cubes are tiled');
        // UVs run in blocks: the far corner sits at the quad's size.
        const uMax = Math.max(...quad.uvs.map(uv => uv[0]));
        const vMax = Math.max(...quad.uvs.map(uv => uv[1]));
        assert.equal(uMax * vMax, area, 'UVs in blocks match the area');
        if (area > 1) {
            merged++;
            for (const corner of quad.colors) assert.deepEqual(corner, quad.colors[0], 'a merge is flat-lit');
        }
    }
    assert.ok(merged > 0, 'something merged');
});

test('an open flat floor becomes a handful of quads', () => {
    const chunk = new Uint8Array(CELLS);
    const light = new Uint8Array(CELLS).fill(15 << 4);
    for (let x = 0; x < CHUNK_SIZE; x++) for (let z = 0; z < CHUNK_SIZE; z++) chunk[index3D(x, 1, z)] = BlockType.STONE;
    const { opaque } = generateGeometryData(0, 0, chunk, undefined, {}, { center: light }, false);
    const quads = quadsOf(opaque);
    // Top, bottom and the four chunk-edge sides: six quads for 256 blocks (was 256 + 256 + 64).
    assert.equal(quads.length, 6);
    const top = quads.find(q => q.normal[1] === 1);
    const stoneTop = resolveTile(BlockType.STONE, 'top', 0, 1, 0, 0);
    assert.equal(top.tiles[0], packTile(stoneTop.texIdx, stoneTop.uvRot, uvVariationMode(BlockType.STONE)));
});

test('faces shaded by a neighbouring wall keep their own quads', () => {
    const chunk = new Uint8Array(CELLS);
    const light = new Uint8Array(CELLS).fill(15 << 4);
    for (let x = 0; x < CHUNK_SIZE; x++) for (let z = 0; z < CHUNK_SIZE; z++) chunk[index3D(x, 1, z)] = BlockType.STONE;
    // A wall along x = 8 on the floor: the floor tops beside it catch AO.
    for (let z = 0; z < CHUNK_SIZE; z++) chunk[index3D(8, 2, z)] = BlockType.STONE;
    const { opaque } = generateGeometryData(0, 0, chunk, undefined, {}, { center: light }, false);
    const tops = quadsOf(opaque).filter(q => q.normal[1] === 1 && q.min[1] === 2);
    let beside = 0;
    for (const quad of tops) {
        // The floor either side of the wall is darker on the wall side, so it never merges across x.
        if (quad.min[0] <= 9 && quad.max[0] >= 8) {
            beside++;
            assert.equal(quad.max[0] - quad.min[0], 1, `quad at x ${quad.min[0]}..${quad.max[0]}`);
        }
    }
    assert.ok(beside >= 2, 'both sides of the wall meshed');
});

test('a lone shaded corner keeps to its own triangle', () => {
    const chunk = new Uint8Array(CELLS);
    const light = new Uint8Array(CELLS).fill(15 << 4);
    for (let x = 0; x < CHUNK_SIZE; x++) for (let z = 0; z < CHUNK_SIZE; z++) chunk[index3D(x, 1, z)] = BlockType.STONE;
    // A pillar on the floor: the floor block diagonally beside it has one dark corner.
    chunk[index3D(8, 2, 8)] = BlockType.STONE;
    const { opaque } = generateGeometryData(0, 0, chunk, undefined, {}, { center: light }, false);
    const quads = quadsOf(opaque);
    // The four floor blocks diagonal to it: each has its dark corner at a different corner of its quad.
    const darkCorners = new Set();
    for (const [x, z] of [[7, 7], [9, 7], [7, 9], [9, 9]]) {
        const q = quads.findIndex(quad => quad.normal[1] === 1 && quad.min[1] === 2 && quad.min[0] === x && quad.min[2] === z);
        assert.ok(q >= 0, `the floor top at ${x}, ${z}`);
        const quad = quads[q];
        const ao = quad.colors.map(c => c[2]);
        const dark = ao.indexOf(Math.min(...ao));
        assert.equal(ao.filter(a => a === ao[dark]).length, 1, 'one corner is darker');
        darkCorners.add(dark);
        const indices = [...opaque.indices.slice(q * 6, q * 6 + 6)].map(i => i - quad.v);
        assert.equal(indices.filter(i => i === dark).length, 1, `the dark corner ${dark} is in one triangle only`);
    }
    assert.equal(darkCorners.size, 4, 'every corner position is covered');
});

test('water leaves out faces toward an unloaded chunk, not toward loaded air', () => {
    const chunk = new Uint8Array(CELLS);
    const light = new Uint8Array(CELLS).fill(15 << 4);
    // A strip of water along the chunk's west edge (x = 0).
    for (let z = 0; z < CHUNK_SIZE; z++) chunk[index3D(0, 1, z)] = BlockType.WATER;
    const westFaces = (result) => {
        const { positions, normals } = result.transparent;
        let count = 0;
        for (let v = 0; v * 3 < positions.length; v += 4) if (normals[v * 3] === -1 && positions[v * 3] === 0) count++;
        return count;
    };
    const unloaded = generateGeometryData(0, 0, chunk, undefined, {}, { center: light }, false);
    assert.equal(westFaces(unloaded), 0, 'no wall toward the unloaded west chunk');
    const air = new Uint8Array(CELLS);
    const loaded = generateGeometryData(0, 0, chunk, undefined, { left: air }, { center: light, left: light }, false);
    assert.equal(westFaces(loaded), CHUNK_SIZE, 'a real shore toward loaded air keeps its faces');
});
