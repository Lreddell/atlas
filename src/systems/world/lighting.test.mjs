import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTs } from './storage/bundleTs.mjs';

globalThis.__APP_VERSION__ = 'test';
globalThis.__APP_DISPLAY_VERSION__ = 'test';

const m = await loadTs(`
    import './src/data/resonantDefinitions';
    export { reseedGlobalNoise } from './src/utils/noise';
    export { generateChunk } from './src/systems/world/baseChunkGeneration';
    export { floodLightLocal, propagateLightTyped, reconcileChunkBorders, updateLightingAround } from './src/systems/world/lighting';
    export { createWorldState } from './src/systems/world/worldTypes';
    export { getChunkData, getLightData, getMetadataData, setChunkData, setLightData, setMetadataData } from './src/systems/world/worldStore';
    export { getDirectionalOpacity } from './src/systems/world/blockProps';
    export { BLOCKS } from './src/data/blocks';
    export { QUEUE_SIZE, SHARED_SKY_Q, SHARED_BLOCK_Q } from './src/systems/world/worldConstants';
    export { CHUNK_SIZE, MIN_Y, MAX_Y } from './src/constants';
    export { BlockType } from './src/types';
`);
const { CHUNK_SIZE, MIN_Y, MAX_Y } = m;
const LAYER = CHUNK_SIZE * CHUNK_SIZE;

// The relight as it was: every lit cell in the box and its rim seeds the flood.
function referenceFlood(state, bx, by, bz, R) {
    const minX = bx - R, maxX = bx + R, minZ = bz - R, maxZ = bz + R;
    const minY = Math.max(MIN_Y, by - R), maxY = Math.min(MAX_Y, by + R);
    const mod = (v) => ((v % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    for (let x = minX; x <= maxX; x++) {
        for (let z = minZ; z <= maxZ; z++) {
            const cx = Math.floor(x / CHUNK_SIZE), cz = Math.floor(z / CHUNK_SIZE);
            const chunk = m.getChunkData(state, cx, cz), light = m.getLightData(state, cx, cz), meta = m.getMetadataData(state, cx, cz);
            if (!chunk || !light) continue;
            const colBase = mod(z) * CHUNK_SIZE + mod(x);
            let top = MIN_Y - 1;
            for (let y = MAX_Y; y >= MIN_Y; y--) if (chunk[(y - MIN_Y) * LAYER + colBase] !== 0) { top = y; break; }
            for (let y = maxY; y > Math.max(top, minY - 1); y--) light[(y - MIN_Y) * LAYER + colBase] = 15 << 4;
            let sky = 15;
            for (let y = top; y >= minY; y--) {
                const idx = (y - MIN_Y) * LAYER + colBase;
                const opacity = m.getDirectionalOpacity(chunk[idx], meta ? meta[idx] : 0, 0, -1, 0);
                if (opacity >= 15) sky = 0; else if (opacity > 0) sky = Math.max(0, sky - opacity);
                if (y <= maxY) light[idx] = (sky << 4) | ((m.BLOCKS[chunk[idx]]?.lightLevel || 0) & 0xF);
            }
        }
    }
    let s = 0, b = 0;
    for (let x = minX - 1; x <= maxX + 1; x++) {
        for (let z = minZ - 1; z <= maxZ + 1; z++) {
            const light = m.getLightData(state, Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE));
            if (!light) continue;
            const colBase = mod(z) * CHUNK_SIZE + mod(x);
            for (let y = Math.max(MIN_Y, minY - 1); y <= Math.min(MAX_Y, maxY + 1); y++) {
                const val = light[(y - MIN_Y) * LAYER + colBase];
                if (val >> 4) { m.SHARED_SKY_Q[s++] = x; m.SHARED_SKY_Q[s++] = y; m.SHARED_SKY_Q[s++] = z; }
                if (val & 0xF) { m.SHARED_BLOCK_Q[b++] = x; m.SHARED_BLOCK_Q[b++] = y; m.SHARED_BLOCK_Q[b++] = z; }
            }
        }
    }
    m.propagateLightTyped(state, m.SHARED_SKY_Q, s, m.SHARED_BLOCK_Q, b);
}

// A 5x5 patch of generated world, borders reconciled as streaming does.
m.reseedGlobalNoise(424242);
const base = m.createWorldState();
const ORIGIN = { cx: 40, cz: -12 };
for (let dx = -2; dx <= 2; dx++) {
    for (let dz = -2; dz <= 2; dz++) {
        const r = m.generateChunk(ORIGIN.cx + dx, ORIGIN.cz + dz);
        m.setChunkData(base, ORIGIN.cx + dx, ORIGIN.cz + dz, r.blocks);
        m.setLightData(base, ORIGIN.cx + dx, ORIGIN.cz + dz, r.light);
        if (r.meta) m.setMetadataData(base, ORIGIN.cx + dx, ORIGIN.cz + dz, r.meta);
    }
}
for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) m.reconcileChunkBorders(base, ORIGIN.cx + dx, ORIGIN.cz + dz, () => {});

const clone = (state) => {
    const copy = m.createWorldState();
    for (const [key, value] of state.chunks) copy.chunks.set(key, value.slice());
    for (const [key, value] of state.lights) copy.lights.set(key, value.slice());
    for (const [key, value] of state.metadata) copy.metadata.set(key, value.slice());
    return copy;
};
const surfaceY = (state, x, z) => {
    const chunk = m.getChunkData(state, Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE));
    const colBase = (((z % 16) + 16) % 16) * 16 + (((x % 16) + 16) % 16);
    for (let y = MAX_Y; y >= MIN_Y; y--) if (chunk[(y - MIN_Y) * LAYER + colBase] !== 0) return y;
    return MIN_Y;
};
const setCell = (state, x, y, z, type) => {
    const chunk = m.getChunkData(state, Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE));
    chunk[(y - MIN_Y) * LAYER + (((z % 16) + 16) % 16) * 16 + (((x % 16) + 16) % 16)] = type;
};

// Edits a player makes: digging into the surface and down, building up, walls
// that shade, and torches, near chunk borders as well as inside chunks.
let seed = 7;
const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const edits = [];
for (let i = 0; i < 40; i++) {
    const x = ORIGIN.cx * 16 + Math.floor(rand() * 16) + (i % 5 === 0 ? -1 : 0);
    const z = ORIGIN.cz * 16 + Math.floor(rand() * 16) + (i % 7 === 0 ? 16 : 0);
    const kind = i % 4;
    edits.push({ x, z, kind });
}

test('the relight gives exactly the light the old full flood did', () => {
    let world = clone(base);
    for (const { x, z, kind } of edits) {
        const top = surfaceY(world, x, z);
        let y;
        if (kind === 0) { y = top; setCell(world, x, y, z, m.BlockType.AIR); }
        else if (kind === 1) { y = top - 3; setCell(world, x, y, z, m.BlockType.AIR); }
        else if (kind === 2) { y = top + 2; setCell(world, x, y, z, m.BlockType.STONE); }
        else { y = top + 1; setCell(world, x, y, z, m.BlockType.TORCH); }
        const expected = clone(world);
        referenceFlood(expected, x, y, z, 15);
        const before = clone(world);
        const reached = new Set();
        m.updateLightingAround(world, x, y, z, (cx, cz) => reached.add(`${cx},${cz}`), 15);
        for (const [key, light] of expected.lights) {
            assert.deepEqual(world.lights.get(key), light, `light of chunk ${key} after editing ${x},${y},${z}`);
            // Every chunk whose light changed is remeshed, and each side
            // neighbour whose border plane it meshes against changed.
            const old = before.lights.get(key);
            if (old.some((v, i) => v !== light[i])) assert.ok(reached.has(key), `chunk ${key} changed but was not remeshed`);
        }
    }
});

test('an edit in open ground remeshes only the chunks it changes', () => {
    const world = clone(base);
    const x = ORIGIN.cx * 16 + 8, z = ORIGIN.cz * 16 + 8;
    const y = surfaceY(world, x, z) + 1;
    setCell(world, x, y, z, m.BlockType.STONE);
    const reached = [];
    m.updateLightingAround(world, x, y, z, (cx, cz) => reached.push(`${cx},${cz}`), 15);
    assert.ok(reached.length < 9, `reached ${reached.length} chunks: ${reached.join(' ')}`);
    assert.ok(reached.includes(`${ORIGIN.cx},${ORIGIN.cz}`));
});
