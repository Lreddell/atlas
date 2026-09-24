import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTs } from './storage/bundleTs.mjs';

globalThis.__APP_VERSION__ = 'test';
globalThis.__APP_DISPLAY_VERSION__ = 'test';

const store = await loadTs(`
    export * from './src/systems/world/worldStore';
    export { CHUNK_SIZE, WORLD_HEIGHT } from './src/constants';
`);
const CELLS = store.CHUNK_SIZE * store.CHUNK_SIZE * store.WORLD_HEIGHT;
const emptyState = () => ({ chunks: new Map(), lights: new Map(), metadata: new Map(), listeners: new Map(), furnaces: new Map(), chests: new Map(), time: 0 });

test('metadata is kept only for chunks that hold any', () => {
    const state = emptyState();
    store.setMetadataIfAny(state, 0, 0, new Uint8Array(CELLS));
    assert.equal(store.getMetadataData(state, 0, 0), undefined, 'an all-zero column is dropped');

    const rotated = new Uint8Array(CELLS);
    rotated[CELLS - 1] = 3;
    store.setMetadataIfAny(state, 1, 0, rotated);
    assert.equal(store.getMetadataData(state, 1, 0), rotated, 'a column with a value is kept as is');

    // Regenerating a chunk as all zeros drops the old array too.
    store.setMetadataIfAny(state, 1, 0, new Uint8Array(CELLS));
    assert.equal(store.getMetadataData(state, 1, 0), undefined);
    store.setMetadataIfAny(state, 2, 0, undefined);
    assert.equal(store.getMetadataData(state, 2, 0), undefined);
});

test('writes allocate on first use', () => {
    const state = emptyState();
    const meta = store.ensureMetadata(state, 5, -3);
    assert.equal(meta.length, CELLS);
    assert.equal(store.getMetadataData(state, 5, -3), meta);
    assert.equal(store.ensureMetadata(state, 5, -3), meta, 'the same array next time');
});

test('the any-value scan agrees with a byte scan, aligned or not', () => {
    for (const at of [0, 1, 2, 3, 4, 97, CELLS - 1]) {
        const data = new Uint8Array(CELLS);
        data[at] = 1;
        assert.equal(store.hasAnyMetadata(data), true, `a value at ${at}`);
    }
    assert.equal(store.hasAnyMetadata(new Uint8Array(CELLS)), false);
    // A view that doesn't start on a four-byte boundary falls back to bytes.
    const backing = new Uint8Array(CELLS + 1);
    backing[CELLS] = 7;
    assert.equal(store.hasAnyMetadata(backing.subarray(1)), true);
    assert.equal(store.hasAnyMetadata(new Uint8Array(CELLS + 1).subarray(1)), false);
});
