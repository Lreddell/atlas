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
`);
const { generateChunk, reseedGlobalNoise, generateGeometryData, packMeshBorders, unpackMeshBorders, createBorderScratch, borderPlane, expandBorderPlane, CHUNK_SIZE, WORLD_HEIGHT, index3D } = mod;

const LAYERS = ['opaque', 'cutout', 'transparent'];
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
            for (const cull of [false, true]) {
                const whole = generateGeometryData(cx, cz, center.blocks, center.meta, neighbors, lights, cull);
                const { neighbors: n2, lights: l2 } = unpackMeshBorders(packMeshBorders(neighbors, lights), center.light, scratch);
                const planes = generateGeometryData(cx, cz, center.blocks, center.meta, n2, l2, cull);
                sameMesh(whole, planes, `seed ${seed} chunk ${cx},${cz} cull ${cull}`);
                meshed++;
            }
        }
    }
    assert.equal(meshed, 16);
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
