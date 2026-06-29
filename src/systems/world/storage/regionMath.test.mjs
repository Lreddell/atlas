import assert from 'node:assert/strict';
import test from 'node:test';

import { loadTs } from './bundleTs.mjs';

const { regionForChunk, localCoord, slotForChunk, regionFileName } = await loadTs(`
    export { regionForChunk, localCoord, slotForChunk, regionFileName } from './src/systems/world/storage/regionMath.ts';
`);

test('positive chunk coords map to the right region and slot', () => {
    assert.deepEqual(regionForChunk(0, 0), { rx: 0, rz: 0 });
    assert.deepEqual(regionForChunk(5, 7), { rx: 0, rz: 0 });
    assert.deepEqual(regionForChunk(31, 31), { rx: 0, rz: 0 });
    assert.deepEqual(regionForChunk(32, 32), { rx: 1, rz: 1 });
    assert.deepEqual(slotForChunk(0, 0), { rx: 0, rz: 0, localX: 0, localZ: 0, slot: 0 });
    assert.deepEqual(slotForChunk(1, 0).slot, 1);
    assert.deepEqual(slotForChunk(0, 1).slot, 32);
    assert.deepEqual(slotForChunk(31, 31).slot, 31 + 31 * 32); // 1023
});

test('negative chunk coords floor to the correct region (not truncate-to-zero)', () => {
    assert.deepEqual(regionForChunk(-1, -1), { rx: -1, rz: -1 });
    assert.deepEqual(regionForChunk(-32, -32), { rx: -1, rz: -1 });
    assert.deepEqual(regionForChunk(-33, -33), { rx: -2, rz: -2 });
    // local coords stay in 0..31 with floored modulo
    assert.equal(localCoord(-1), 31);
    assert.equal(localCoord(-32), 0);
    assert.equal(localCoord(-33), 31);
    const s = slotForChunk(-1, -1);
    assert.deepEqual(s, { rx: -1, rz: -1, localX: 31, localZ: 31, slot: 1023 });
});

test('boundary chunks around multiples of 32', () => {
    for (const base of [-64, -32, 0, 32, 64]) {
        const first = slotForChunk(base, base);
        assert.equal(first.slot, 0, `chunk ${base} should be slot 0 of its region`);
        const last = slotForChunk(base + 31, base + 31);
        assert.equal(last.slot, 1023, `chunk ${base + 31} should be slot 1023`);
        // adjacent regions don't collide
        assert.notDeepEqual(regionForChunk(base, base), regionForChunk(base + 32, base + 32));
    }
});

test('region file naming includes negative coordinates', () => {
    assert.equal(regionFileName(0, 0), 'r.0.0.acr');
    assert.equal(regionFileName(-1, 0), 'r.-1.0.acr');
    assert.equal(regionFileName(2, -3), 'r.2.-3.acr');
});
