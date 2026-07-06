import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTs } from './storage/bundleTs.mjs';

// The mesher graph reaches src/constants.ts, which reads vite's compile-time
// defines, stub them before the bundled module is imported.
globalThis.__APP_VERSION__ = 'test';
globalThis.__APP_DISPLAY_VERSION__ = 'test';

const mod = await loadTs(`
    export { generateGeometryData } from './src/systems/world/geometry';
    export { CHUNK_SIZE, MIN_Y, MAX_Y } from './src/constants';
    export { index3D } from './src/systems/world/worldCoords';
    export { BlockType } from './src/types';
`);
const { generateGeometryData, CHUNK_SIZE, MIN_Y, MAX_Y, index3D, BlockType } = mod;
const H = MAX_Y - MIN_Y + 1;
const CELLS = CHUNK_SIZE * CHUNK_SIZE * H;

// Count opaque quads whose first vertex sits at worldY facing up (+Y normal).
// The mesher always emits 4 vertices per quad.
const countTopFacesAt = (res, worldY) => {
    const { positions, normals } = res.opaque;
    let quads = 0;
    for (let v = 0; v * 3 < positions.length; v += 4) {
        if (normals[v * 3 + 1] === 1 && positions[v * 3 + 1] === worldY) quads++;
    }
    return quads;
};

test('far-chunk dark culling keeps deep-ocean floors visible through water', () => {
    // Stone floor at y=0 under 12 blocks of water. Skylight attenuates through
    // the water, so the floor and the water facing it sit at light 0, but the
    // floor is still visible THROUGH the water column. Regression: these faces
    // were dark-culled in far chunks, so distant oceans rendered see-through
    // until the player walked close enough to trigger a full remesh.
    const chunk = new Uint8Array(CELLS);
    const light = new Uint8Array(CELLS); // dark by default
    for (let z = 0; z < CHUNK_SIZE; z++) {
        for (let x = 0; x < CHUNK_SIZE; x++) {
            chunk[index3D(x, 0, z)] = BlockType.STONE;
            for (let y = 1; y <= 12; y++) chunk[index3D(x, y, z)] = BlockType.WATER;
            for (let y = 10; y <= MAX_Y; y++) light[index3D(x, y, z)] = (15 << 4); // lit near surface
        }
    }
    const res = generateGeometryData(0, 0, chunk, undefined, {}, { center: light }, true);
    // Top face of the y=0 stone layer sits at worldY=1, all 16x16 must be present.
    assert.equal(countTopFacesAt(res, 1), CHUNK_SIZE * CHUNK_SIZE);
});

test('far-chunk dark culling still strips enclosed dark cave geometry', () => {
    // Solid stone slab with a sealed, unlit 2x2x2 air pocket: its interior faces
    // are only visible from inside the cave, so the far-chunk mesh must drop them
    // (the whole point of the optimization) while the full mesh keeps them.
    const chunk = new Uint8Array(CELLS);
    const light = new Uint8Array(CELLS);
    for (let z = 0; z < CHUNK_SIZE; z++) {
        for (let x = 0; x < CHUNK_SIZE; x++) {
            for (let y = 0; y <= 6; y++) chunk[index3D(x, y, z)] = BlockType.STONE;
            for (let y = 7; y <= MAX_Y; y++) light[index3D(x, y, z)] = (15 << 4);
        }
    }
    for (let x = 7; x <= 8; x++) {
        for (let y = 2; y <= 3; y++) {
            for (let z = 7; z <= 8; z++) chunk[index3D(x, y, z)] = BlockType.AIR;
        }
    }
    const culled = generateGeometryData(0, 0, chunk, undefined, {}, { center: light }, true);
    const full = generateGeometryData(0, 0, chunk, undefined, {}, { center: light }, false);
    // The pocket floor's top face (worldY=2) is culled in the far mesh…
    assert.equal(countTopFacesAt(culled, 2), 0);
    // …and the far mesh is strictly smaller than the full mesh.
    assert.ok(culled.opaque.positions.length < full.opaque.positions.length);
});
