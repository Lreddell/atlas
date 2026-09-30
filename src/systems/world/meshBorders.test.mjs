import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTs } from './storage/bundleTs.mjs';

// The mesher graph reaches src/constants.ts, which reads vite's compile-time
// defines, stub them before the bundled module is imported.
globalThis.__APP_VERSION__ = 'test';
globalThis.__APP_DISPLAY_VERSION__ = 'test';

const mod = await loadTs(`
    import './src/data/resonantDefinitions';
    export { generateChunk } from './src/systems/world/chunkGeneration';
    export { reseedGlobalNoise } from './src/utils/noise';
    export { generateGeometryData } from './src/systems/world/geometry';
    export { packMeshBorders, unpackMeshBorders, createBorderScratch, borderPlane, expandBorderPlane } from './src/systems/world/meshBorders';
    export { CHUNK_SIZE, WORLD_HEIGHT } from './src/constants';
    export { index3D } from './src/systems/world/worldCoords';
    export { BlockType } from './src/types';
`);
const { generateChunk, reseedGlobalNoise, generateGeometryData, packMeshBorders, unpackMeshBorders, createBorderScratch, borderPlane, expandBorderPlane, CHUNK_SIZE, WORLD_HEIGHT, index3D, BlockType } = mod;

const LAYERS = ['opaque', 'cutout', 'transparent', 'water'];
const ARRAYS = ['positions', 'normals', 'uvs', 'colors', 'tiles', 'indices'];

const sameMesh = (a, b, where) => {
    for (const layer of LAYERS) {
        for (const name of ARRAYS) {
            const x = a[layer][name], y = b[layer][name];
            assert.equal(x.length, y.length, `${where}: ${layer}.${name} length`);
            for (let i = 0; i < x.length; i++) {
                if (x[i] !== y[i]) assert.fail(`${where}: ${layer}.${name}[${i}] is ${y[i]}, was ${x[i]}`);
            }
        }
        assert.deepEqual(b[layer].bounds, a[layer].bounds, `${where}: ${layer} bounds`);
    }
};

test('a border plane goes out and back to the same cells', () => {
    const data = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT);
    for (let i = 0; i < data.length; i++) data[i] = (i * 2654435761) >>> 24;
    const into = new Uint8Array(data.length);
    const facing = { left: [CHUNK_SIZE - 1, null], right: [0, null], back: [null, CHUNK_SIZE - 1], front: [null, 0] };
    for (const [side, [fx, fz]] of Object.entries(facing)) {
        const back = expandBorderPlane(borderPlane(data, side), side, into);
        for (let y = -64; y < WORLD_HEIGHT - 64; y += 7) {
            for (let k = 0; k < CHUNK_SIZE; k++) {
                const x = fx ?? k, z = fz ?? k;
                assert.equal(back[index3D(x, y, z)], data[index3D(x, y, z)], `${side} plane at ${x},${y},${z}`);
            }
        }
    }
});

// The mesher only reads side chunks on the plane facing the chunk. Mesh real
// terrain (caves, water, trees and plants on the borders) with the whole side
// chunks, then with only their facing planes: the meshes must be identical.
test('meshing from border planes matches meshing from whole side chunks', () => {
    const scratch = createBorderScratch();
    let meshed = 0;
    for (const seed of [1337, 20260928]) {
        reseedGlobalNoise(seed);
        for (const [cx, cz] of [[0, 0], [37, -12], [-80, 45], [130, 130]]) {
            const at = (dx, dz) => generateChunk(cx + dx, cz + dz);
            const center = at(0, 0);
            const sides = { left: at(-1, 0), right: at(1, 0), back: at(0, -1), front: at(0, 1) };
            const neighbors = Object.fromEntries(Object.entries(sides).map(([k, v]) => [k, v.blocks]));
            const lights = { center: center.light, ...Object.fromEntries(Object.entries(sides).map(([k, v]) => [k, v.light])) };
            const metas = Object.fromEntries(Object.entries(sides).map(([k, v]) => [k, v.meta]));
            for (const cull of [false, true]) {
                const whole = generateGeometryData(cx, cz, center.blocks, center.meta, neighbors, lights, cull, metas);
                const { neighbors: n2, lights: l2, neighborMeta: m2 } = unpackMeshBorders(packMeshBorders(neighbors, lights, metas), center.light, scratch);
                const planes = generateGeometryData(cx, cz, center.blocks, center.meta, n2, l2, cull, m2);
                sameMesh(whole, planes, `seed ${seed} chunk ${cx},${cz} cull ${cull}`);
                meshed++;
            }
        }
    }
    assert.equal(meshed, 16);
});

// Water meshes apart from glass and ice, so that it can draw first everywhere
// (regionBatcher.ts): ice over water must not depend on which chunk drew first.
test('water has a layer of its own, apart from glass and ice', () => {
    const cells = CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT;
    const blocks = new Uint8Array(cells);
    const light = new Uint8Array(cells).fill(15 << 4);
    const y = 64;
    for (let z = 0; z < CHUNK_SIZE; z++) {
        for (let x = 0; x < CHUNK_SIZE; x++) {
            blocks[index3D(x, y - 2, z)] = BlockType.STONE;
            blocks[index3D(x, y - 1, z)] = BlockType.WATER;
            blocks[index3D(x, y, z)] = x < 8 ? BlockType.ICE : BlockType.GLASS;
        }
    }
    const mesh = generateGeometryData(0, 0, blocks, new Uint8Array(cells), {}, { center: light }, false);
    const heights = (layer) => {
        const found = new Set();
        const positions = mesh[layer].positions;
        for (let i = 1; i < positions.length; i += 3) found.add(Math.floor(positions[i]));
        return [...found].sort((a, b) => a - b);
    };
    assert.ok(mesh.water.positions.length > 0, 'the water under the ice meshes');
    assert.ok(heights('water').every((h) => h === y - 1), `water only: ${heights('water')}`);
    assert.ok(mesh.transparent.positions.length > 0, 'the ice and glass mesh');
    assert.ok(heights('transparent').every((h) => h >= y), `ice and glass only: ${heights('transparent')}`);
});

test('a missing side chunk stays missing', () => {
    const light = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT);
    const borders = packMeshBorders({ left: new Uint8Array(light.length) }, { center: light });
    const { neighbors, lights } = unpackMeshBorders(borders, light, createBorderScratch());
    assert.ok(neighbors.left);
    assert.equal(neighbors.right, undefined);
    assert.equal(lights.left, undefined);
    assert.equal(lights.center, light);
});

// A flowing surface slopes toward its neighbours' levels. Each chunk used to
// guess its side neighbours' levels from its own cell, so the two chunks put
// the same corner at different heights: a step along every chunk border.
test('a flowing surface meets itself across a chunk border', () => {
    const cells = CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT;
    const make = () => ({ blocks: new Uint8Array(cells), light: new Uint8Array(cells).fill(15 << 4), meta: new Uint8Array(cells) });
    const west = make();
    const east = make();
    const y = 64;
    for (let z = 0; z < CHUNK_SIZE; z++) {
        for (let x = 10; x < CHUNK_SIZE; x++) {
            west.blocks[index3D(x, y - 1, z)] = BlockType.STONE;
            west.blocks[index3D(x, y, z)] = BlockType.WATER;
            west.meta[index3D(x, y, z)] = 2 + (z % 3);
        }
        for (let x = 0; x < 6; x++) {
            east.blocks[index3D(x, y - 1, z)] = BlockType.STONE;
            east.blocks[index3D(x, y, z)] = BlockType.WATER;
            east.meta[index3D(x, y, z)] = 5 + (z % 2);
        }
    }
    const westMesh = generateGeometryData(0, 0, west.blocks, west.meta, { right: east.blocks }, { center: west.light, right: east.light }, false, { right: east.meta });
    const eastMesh = generateGeometryData(1, 0, east.blocks, east.meta, { left: west.blocks }, { center: east.light, left: west.light }, false, { left: west.meta });
    // The surface's corner heights on the border line: x = 16 in the west chunk, x = 0 in the east.
    const borderCorners = (mesh, x) => {
        const heights = new Map();
        const positions = mesh.water.positions;
        for (let i = 0; i < positions.length; i += 3) {
            if (positions[i] === x && positions[i + 1] > y && positions[i + 1] < y + 1) heights.set(positions[i + 2], positions[i + 1]);
        }
        return heights;
    };
    const fromWest = borderCorners(westMesh, CHUNK_SIZE);
    const fromEast = borderCorners(eastMesh, 0);
    assert.equal(fromWest.size, CHUNK_SIZE + 1);
    // Along the border, not at its two ends: a chunk's very corner also averages
    // a cell of the diagonal chunk, which a mesh job doesn't carry.
    for (let z = 1; z < CHUNK_SIZE; z++) assert.equal(fromEast.get(z), fromWest.get(z), `corner at z ${z}`);
});
