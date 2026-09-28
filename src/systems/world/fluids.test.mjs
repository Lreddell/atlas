import assert from 'node:assert/strict';
import test from 'node:test';
import { Buffer } from 'node:buffer';
import path from 'node:path';
import { build } from 'esbuild';

// The fluid rules run against a small fake world: WorldManager is swapped for a
// stand-in that writes blocks and levels straight into the world state and
// wakes neighbouring fluid, as the real one does.
globalThis.__APP_VERSION__ = 'test';
globalThis.__APP_DISPLAY_VERSION__ = 'test';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const FAKE_WORLD_MANAGER = `
import { BlockType } from './src/types';
import { getChunkData, ensureMetadata } from './src/systems/world/worldStore';
import { worldToChunk, index3D } from './src/systems/world/worldCoords';
import { scheduleFluidUpdate, fluidDelay } from './src/systems/world/fluids';
const SIX = [[0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]];
const isFluid = (t) => t === BlockType.WATER || t === BlockType.LAVA;
function write(x, y, z, type, meta) {
    const state = globalThis.__fluidWorld;
    const { cx, cz, lx, lz } = worldToChunk(x, z);
    const i = index3D(lx, y, lz);
    getChunkData(state, cx, cz)[i] = type;
    ensureMetadata(state, cx, cz)[i] = meta;
    if (isFluid(type)) scheduleFluidUpdate(x, y, z, type, fluidDelay(type));
    for (const [dx, dy, dz] of SIX) {
        const n = worldToChunk(x + dx, z + dz);
        const t = getChunkData(state, n.cx, n.cz)?.[index3D(n.lx, y + dy, n.lz)];
        if (isFluid(t)) scheduleFluidUpdate(x + dx, y + dy, z + dz, t, fluidDelay(t));
    }
}
export const worldManager = {
    setBlock: (x, y, z, type, meta = 0) => write(x, y, z, type, meta),
    setFluidLevel: (x, y, z, type, level) => write(x, y, z, type, level),
    spawnDrop() {},
};
`;

const bundled = await build({
    absWorkingDir: ROOT,
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
    stdin: {
        contents: `
            export { processFluids, scheduleFluidUpdate, clearFluidUpdates, pendingFluidUpdates } from './src/systems/world/fluids';
            export { setChunkData, getChunkData, getMetadataData } from './src/systems/world/worldStore';
            export { worldToChunk, index3D } from './src/systems/world/worldCoords';
            export { CHUNK_SIZE, WORLD_HEIGHT } from './src/constants';
            export { BlockType } from './src/types';
            export { worldManager } from './src/systems/WorldManager';
        `,
        resolveDir: ROOT,
        sourcefile: 'fluids-test-entry.ts',
    },
    plugins: [{
        name: 'fake-world-manager',
        setup(b) {
            b.onResolve({ filter: /WorldManager$/ }, () => ({ path: 'fake-world-manager', namespace: 'fake' }));
            b.onLoad({ filter: /.*/, namespace: 'fake' }, () => ({ contents: FAKE_WORLD_MANAGER, loader: 'ts', resolveDir: ROOT }));
        },
    }],
});
const mod = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
const { processFluids, clearFluidUpdates, pendingFluidUpdates, setChunkData, getChunkData, getMetadataData, worldToChunk, index3D, CHUNK_SIZE, WORLD_HEIGHT, BlockType, worldManager } = mod;
const { AIR, STONE, WATER, LAVA, OBSIDIAN, COBBLESTONE } = BlockType;

const FLOOR = 64;

/** A flat stone floor at y = 64 over chunks -2..1 each way, air above. */
function flatWorld() {
    clearFluidUpdates();
    const state = { chunks: new Map(), lights: new Map(), metadata: new Map(), listeners: new Map(), furnaces: new Map(), chests: new Map(), time: 0 };
    globalThis.__fluidWorld = state;
    for (let cx = -2; cx <= 1; cx++) {
        for (let cz = -2; cz <= 1; cz++) {
            const blocks = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT);
            for (let lx = 0; lx < CHUNK_SIZE; lx++) {
                for (let lz = 0; lz < CHUNK_SIZE; lz++) blocks[index3D(lx, FLOOR, lz)] = STONE;
            }
            setChunkData(state, cx, cz, blocks);
        }
    }
    return state;
}

const at = (state, x, y, z) => {
    const { cx, cz, lx, lz } = worldToChunk(x, z);
    return getChunkData(state, cx, cz)[index3D(lx, y, lz)];
};
const levelAt = (state, x, y, z) => {
    const { cx, cz, lx, lz } = worldToChunk(x, z);
    return getMetadataData(state, cx, cz)?.[index3D(lx, y, lz)] ?? 0;
};
const place = (x, y, z, type, meta = 0) => worldManager.setBlock(x, y, z, type, meta);
const run = (state, ticks) => { for (let i = 0; i < ticks; i++) processFluids(state); };
const settle = (state) => { for (let i = 0; i < 20000 && pendingFluidUpdates() > 0; i++) processFluids(state); };

test('a water source on flat ground spreads 7 blocks, a level a block, then stops', () => {
    const state = flatWorld();
    place(0, FLOOR + 1, 0, WATER);
    settle(state);
    for (let d = 1; d <= 7; d++) {
        assert.equal(at(state, d, FLOOR + 1, 0), WATER, `water ${d} blocks out`);
        assert.equal(levelAt(state, d, FLOOR + 1, 0), d, `level ${d} at ${d} blocks`);
    }
    assert.equal(at(state, 8, FLOOR + 1, 0), AIR, 'no further than 7 blocks');
    // Diagonals are reached around the corner: (3, 3) is 6 steps out.
    assert.equal(levelAt(state, 3, FLOOR + 1, 3), 6);
    assert.equal(at(state, 4, FLOOR + 1, 4), AIR, '8 steps out is dry');
});

test('flowing water with its source gone drains away', () => {
    const state = flatWorld();
    place(0, FLOOR + 1, 0, WATER);
    settle(state);
    place(0, FLOOR + 1, 0, AIR);
    settle(state);
    for (let x = -8; x <= 8; x++) {
        for (let z = -8; z <= 8; z++) assert.equal(at(state, x, FLOOR + 1, z), AIR, `dry at ${x}, ${z}`);
    }
});

test('water runs only toward the nearest way down', () => {
    const state = flatWorld();
    place(3, FLOOR, 0, AIR); // a hole three blocks east
    place(0, FLOOR + 1, 0, WATER);
    run(state, 6); // the source's first move
    assert.equal(at(state, 1, FLOOR + 1, 0), WATER, 'toward the hole');
    assert.equal(at(state, -1, FLOOR + 1, 0), AIR, 'not away from it');
    assert.equal(at(state, 0, FLOOR + 1, 1), AIR);
    assert.equal(at(state, 0, FLOOR + 1, -1), AIR);
    settle(state);
    assert.equal(at(state, 3, FLOOR, 0), WATER, 'it pours into the hole');
    assert.equal(levelAt(state, 3, FLOOR, 0), 8, 'as falling water');
});

test('water falls as a column and spreads out where it lands', () => {
    const state = flatWorld();
    place(0, FLOOR + 6, 0, WATER);
    settle(state);
    for (let y = FLOOR + 1; y < FLOOR + 6; y++) {
        assert.equal(at(state, 0, y, 0), WATER);
        assert.equal(levelAt(state, 0, y, 0), 8, `falling at y ${y}`);
    }
    // Once water stands under it, a source in the air rings itself with a
    // level of flowing water that falls from the edge too, as in Minecraft.
    assert.equal(levelAt(state, 1, FLOOR + 6, 0), 1);
    assert.equal(levelAt(state, 1, FLOOR + 5, 0), 8);
    assert.equal(at(state, 2, FLOOR + 6, 0), AIR, 'and no wider');
    // Where the ring's columns land (x = 1), water spreads on as level 1.
    assert.equal(levelAt(state, 1, FLOOR + 1, 0), 8);
    assert.equal(levelAt(state, 2, FLOOR + 1, 0), 1, 'landed water spreads as level 1');
    assert.equal(levelAt(state, 8, FLOOR + 1, 0), 7);
    assert.equal(at(state, 9, FLOOR + 1, 0), AIR);
});

test('water between two sources on firm ground becomes a source', () => {
    const state = flatWorld();
    place(0, FLOOR + 1, 0, WATER);
    place(2, FLOOR + 1, 0, WATER);
    settle(state);
    assert.equal(at(state, 1, FLOOR + 1, 0), WATER);
    assert.equal(levelAt(state, 1, FLOOR + 1, 0), 0, 'a new source');
    // Over air it does not.
    const air = flatWorld();
    place(0, FLOOR + 5, 0, STONE); place(1, FLOOR + 5, 0, STONE); place(2, FLOOR + 5, 0, STONE);
    place(1, FLOOR + 5, 0, AIR);
    place(0, FLOOR + 6, 0, WATER);
    place(2, FLOOR + 6, 0, WATER);
    run(air, 12);
    assert.notEqual(levelAt(air, 1, FLOOR + 6, 0), 0);
});

test('lava runs 3 blocks, two levels a block, on a slower tick', () => {
    const state = flatWorld();
    place(0, FLOOR + 1, 0, LAVA);
    run(state, 29);
    assert.equal(at(state, 1, FLOOR + 1, 0), AIR, 'lava waits 30 ticks');
    settle(state);
    assert.deepEqual([1, 2, 3].map(d => levelAt(state, d, FLOOR + 1, 0)), [2, 4, 6]);
    assert.equal(at(state, 4, FLOOR + 1, 0), AIR);
});

test('lava meeting water: a source turns to obsidian, flowing lava to cobblestone, lava onto water to stone', () => {
    const state = flatWorld();
    place(0, FLOOR + 1, 0, LAVA);
    place(1, FLOOR + 1, 0, WATER);
    run(state, 6);
    assert.equal(at(state, 0, FLOOR + 1, 0), OBSIDIAN);

    const flowing = flatWorld();
    place(0, FLOOR + 1, 0, LAVA, 2);
    place(0, FLOOR + 2, 0, LAVA); // keeps it fed
    place(1, FLOOR + 1, 0, WATER);
    run(flowing, 6);
    assert.equal(at(flowing, 0, FLOOR + 1, 0), COBBLESTONE);

    const pour = flatWorld();
    place(0, FLOOR + 1, 0, WATER);
    place(-5, FLOOR + 1, 0, STONE); // keep the water small
    place(0, FLOOR + 3, 0, LAVA);
    place(0, FLOOR + 2, 0, AIR);
    run(pour, 70);
    assert.equal(at(pour, 0, FLOOR + 1, 0), STONE);
});
