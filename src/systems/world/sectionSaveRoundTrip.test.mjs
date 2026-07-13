import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { URL } from 'node:url';
import { ChunkColumn, COLUMN_VOLUME } from './chunkColumn.ts';

const wm = readFileSync(new URL('../WorldManager.ts', import.meta.url), 'utf8');
const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');

// Simulated "old save": the persisted chunk format is (and stays) three full
// column arrays. Build one with terrain, caves, torch light, and metadata.
function makePersistedChunk() {
    const blocks = new Uint8Array(COLUMN_VOLUME);
    const light = new Uint8Array(COLUMN_VOLUME);
    const meta = new Uint8Array(COLUMN_VOLUME);
    const idx = (lx, yOff, lz) => yOff * 256 + lz * 16 + lx;
    for (let yOff = 0; yOff < 384; yOff++) {
        for (let lz = 0; lz < 16; lz++) {
            for (let lx = 0; lx < 16; lx++) {
                const i = idx(lx, yOff, lz);
                if (yOff < 128) blocks[i] = 1;
                light[i] = yOff >= 128 ? 0xF0 : 0;
            }
        }
    }
    blocks[idx(4, 60, 4)] = 0;      // cave pocket
    light[idx(4, 60, 4)] = 0x09;    // torch-lit
    blocks[idx(8, 128, 8)] = 54;    // a chest-ish block id
    meta[idx(8, 128, 8)] = 0x42;    // rotation + loot bit
    return { blocks, light, meta, idx };
}

test('old save → section runtime → persisted form is byte-identical', () => {
    const { blocks, light, meta } = makePersistedChunk();
    const col = ChunkColumn.fromArrays(blocks, light, meta);
    assert.deepEqual(col.flattenBlocks(), blocks, 'blocks round-trip');
    assert.deepEqual(col.flattenLight(), light, 'light round-trip');
    assert.deepEqual(col.flattenMeta(), meta, 'metadata round-trip');
});

test('edited chunks round-trip through sections and reload identically', () => {
    const { blocks, light, meta, idx } = makePersistedChunk();
    const col = ChunkColumn.fromArrays(blocks, light, meta);

    // Player edits: place a tower into empty sky, dig into uniform stone,
    // rotate a block — touching uniform sections that must materialize.
    col.setB(idx(3, 300, 3), 5);
    col.setB(idx(3, 301, 3), 5);
    col.setM(idx(3, 300, 3), 2);
    col.setB(idx(9, 30, 9), 0);
    col.setL(idx(9, 30, 9), 0x03);

    // "Save": flatten to the persisted arrays; "reload": ingest them again.
    const saved = { b: col.flattenBlocks(), l: col.flattenLight(), m: col.flattenMeta() };
    const reloaded = ChunkColumn.fromArrays(saved.b, saved.l, saved.m);

    // Every cell reads back identically after the save/load cycle.
    assert.deepEqual(reloaded.flattenBlocks(), saved.b);
    assert.deepEqual(reloaded.flattenLight(), saved.l);
    assert.deepEqual(reloaded.flattenMeta(), saved.m);
    assert.equal(reloaded.getB(idx(3, 300, 3)), 5);
    assert.equal(reloaded.getM(idx(3, 300, 3)), 2);
    assert.equal(reloaded.getB(idx(9, 30, 9)), 0);
    assert.equal(reloaded.getL(idx(9, 30, 9)), 0x03);
    // And the expected edits are present in the persisted arrays themselves.
    assert.equal(saved.b[idx(3, 301, 3)], 5);
    assert.equal(saved.m[idx(8, 128, 8)], 0x42, 'untouched metadata preserved');
});

test('the storage boundary flattens sections back to the legacy save format', () => {
    // Save batches are built by flattening columns — the persisted format is
    // untouched by section storage, so existing worlds load identically.
    assert.match(wm, /batch\.push\(\{ cx, cz, blocks: col\.flattenBlocks\(\), light: col\.flattenLight\(\), meta: col\.flattenMeta\(\) \}\)/);
    // Loads ingest the legacy arrays via section detection.
    assert.match(wm, /WorldStore\.setColumnFromArrays\(this\.state, cx, cz, result\.blocks, result\.light, result\.meta\)/);
    assert.match(wm, /result: \{ blocks: data\.blocks, light: data\.light, meta: data\.meta \}/);
});

test('non-chunk save state is untouched by section storage', () => {
    // Tile entities, boss progression, boats, inventory/equipment, and world
    // time are persisted outside the chunk arrays; those modules must not
    // depend on section internals (they were not modified by this work).
    for (const rel of ['./tileEntities.ts', './WorldStorage.ts', './storage/StorageBackend.ts', '../progression/ProgressionStore.ts']) {
        const src = read(rel);
        assert.ok(!src.includes('chunkColumn') && !src.includes('ChunkColumn'),
            `${rel} must not depend on section storage internals`);
    }
    // World time still lives on WorldState and is saved via the same App path.
    assert.match(wm, /getTime\(\): number \{ return this\.state\.time; \}/);
});
