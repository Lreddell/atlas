// Authoritative registry tests: frozen legacy table, dynamic allocation,
// and the unknown-id rule enforced at the renderer-side funnels.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { loadTsViaFile } from '../world/storage/bundleTs.mjs';

const root = path.resolve(import.meta.dirname, '../../..');
const snapshot = JSON.parse(fs.readFileSync(path.join(root, 'src/systems/registry/legacyIds.json'), 'utf8'));

const reg = await loadTsViaFile(`
    export { deriveLegacyTable, allocateWorldBlockId, numericForNamespaced, namespacedForNumeric } from './src/systems/registry/blockRegistry.ts';
    export { resolveNumericForDecode, copyUpLegacyBlocks, legacyDecodeRemap, UNKNOWN_PLACEHOLDER_ID, FIRST_DYNAMIC_ID } from './src/systems/registry/blockRegistry.ts';
    export { buildRegistrySnapshotExtra, applyRegistrySnapshot, resetBlockRegistryForTests } from './src/systems/registry/blockRegistry.ts';
`, 'registry-test');

test('derived legacy table matches the checked-in frozen snapshot', () => {
    assert.deepEqual(reg.deriveLegacyTable(), snapshot.table);
});

test('legacy snapshot covers every defined id and nothing else', () => {
    const ids = Object.keys(snapshot.table).map(Number);
    assert.equal(ids.length, snapshot.count);
    assert.ok(!ids.includes(4), 'gap id 4 must stay unassigned');
    assert.ok(!ids.includes(90), 'gap id 90 must stay unassigned');
    assert.equal(snapshot.table[77], 'atlas:retired_resonance_door');
    assert.equal(snapshot.table[18], 'minecraft:furnace_active');
    assert.equal(snapshot.table[36], 'minecraft:grass_plant');
});

test('dynamic allocation starts at 256 and is deterministic in order', () => {
    reg.resetBlockRegistryForTests();
    const a = reg.allocateWorldBlockId('atlas:test_alpha', { color: '#fff', name: 'Alpha', textureSlot: 46, hardness: 1, category: 'building' });
    const b = reg.allocateWorldBlockId('atlas:test_beta', { color: '#fff', name: 'Beta', textureSlot: 46, hardness: 1, category: 'building' });
    assert.equal(a, 256);
    assert.equal(b, 257);
    // Idempotent per namespaced id.
    assert.equal(reg.allocateWorldBlockId('atlas:test_alpha', { color: '#fff', name: 'Alpha', textureSlot: 46, hardness: 1, category: 'building' }), 256);
    assert.equal(reg.numericForNamespaced('atlas:test_beta'), 257);
    assert.equal(reg.namespacedForNumeric(256), 'atlas:test_alpha');
});

test('allocation rejects legacy collisions and bad definitions', () => {
    reg.resetBlockRegistryForTests();
    assert.throws(() => reg.allocateWorldBlockId('minecraft:stone', { color: '#fff', name: 'X', textureSlot: 46, hardness: 1 }), /collides with a frozen legacy/);
    assert.throws(() => reg.allocateWorldBlockId('not-namespaced', { color: '#fff', name: 'X', textureSlot: 46, hardness: 1 }), /Invalid namespaced/);
    assert.throws(() => reg.allocateWorldBlockId('atlas:no_slot', { color: '#fff', name: 'X', hardness: 1 }), /textureSlot/);
});

test('unknown-id rule: gaps, negatives, and out-of-range become the placeholder', () => {
    reg.resetBlockRegistryForTests();
    const P = reg.UNKNOWN_PLACEHOLDER_ID;
    assert.equal(P, 65535);
    assert.equal(reg.resolveNumericForDecode(3), 3);
    assert.equal(reg.resolveNumericForDecode(255), 255);
    assert.equal(reg.resolveNumericForDecode(4), P);
    assert.equal(reg.resolveNumericForDecode(90), P);
    assert.equal(reg.resolveNumericForDecode(-1), P);
    assert.equal(reg.resolveNumericForDecode(65536), P);
    assert.equal(reg.resolveNumericForDecode(1000), P);
    assert.equal(reg.resolveNumericForDecode(65535), P);
});

test('copyUpLegacyBlocks widens uint8 and enforces the rule on uint16', () => {
    reg.resetBlockRegistryForTests();
    const widened = reg.copyUpLegacyBlocks(new Uint8Array([1, 4, 255]));
    assert.ok(widened instanceof Uint16Array);
    assert.deepEqual([...widened], [1, 65535, 255]);
    const enforced = reg.copyUpLegacyBlocks(new Uint16Array([1, 4, 1000, 65535]));
    assert.deepEqual([...enforced], [1, 65535, 65535, 65535]);
});

test('snapshot round-trips allocations; unknown snapshot entries are reported', () => {
    reg.resetBlockRegistryForTests();
    reg.allocateWorldBlockId('atlas:test_snap', { color: '#fff', name: 'Snap', textureSlot: 46, hardness: 1, category: 'building' });
    const snap = reg.buildRegistrySnapshotExtra();
    assert.deepEqual(snap, [{ numeric: 256, namespaced: 'atlas:test_snap' }]);
    assert.deepEqual(reg.applyRegistrySnapshot(snap), []);
    const issues = reg.applyRegistrySnapshot([{ numeric: 999, namespaced: 'atlas:removed_content' }]);
    assert.equal(issues.length, 1);
});
