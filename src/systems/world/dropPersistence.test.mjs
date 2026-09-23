import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { serializeDrops, restoreDrops, MAX_SAVED_DROPS } from './dropPersistence.ts';

const LIFETIME = 300_000;
const drop = (over = {}) => ({
    id: 'a', type: 5, count: 3, position: [1.234, 64.5, -7.891], velocity: [1, 2, 3],
    createdAt: 0, pickupDelay: 0, age: 1000, ...over,
});

test('drops round-trip through a save with position, count, instance and age', () => {
    const saved = serializeDrops([drop({ instance: { durability: 12, maxDurability: 60 } })], LIFETIME);
    assert.deepEqual(saved, [{ type: 5, count: 3, x: 1.23, y: 64.5, z: -7.89, age: 1000, instance: { durability: 12, maxDurability: 60 } }]);
    // The save is plain JSON.
    const restored = restoreDrops(JSON.parse(JSON.stringify(saved)), LIFETIME, 42, () => 'new-id');
    assert.equal(restored.length, 1);
    assert.deepEqual(restored[0], {
        id: 'new-id', type: 5, count: 3, instance: { durability: 12, maxDurability: 60 },
        position: [1.23, 64.5, -7.89], velocity: [0, 0, 0], createdAt: 42, pickupDelay: 42, age: 1000,
    });
});

test('collected, empty, expired and non-finite drops are not saved', () => {
    const saved = serializeDrops([
        drop({ position: [0, -5000, 0] }),
        drop({ count: 0 }),
        drop({ age: LIFETIME }),
        drop({ position: [NaN, 1, 1] }),
        drop({ type: 9 }),
    ], LIFETIME);
    assert.deepEqual(saved.map((d) => d.type), [9]);
});

test('a save is capped, keeping the freshest drops', () => {
    const many = Array.from({ length: MAX_SAVED_DROPS + 5 }, (_, i) => drop({ age: MAX_SAVED_DROPS + 5 - i }));
    const saved = serializeDrops(many, 1e9);
    assert.equal(saved.length, MAX_SAVED_DROPS);
    assert.ok(saved.every((d) => d.age <= MAX_SAVED_DROPS));
});

test('restore tolerates old saves and malformed entries', () => {
    assert.deepEqual(restoreDrops(undefined, LIFETIME, 0, () => 'x'), []);
    assert.deepEqual(restoreDrops('nope', LIFETIME, 0, () => 'x'), []);
    const restored = restoreDrops([
        null, 7, { type: 'stone', count: 1, x: 0, y: 0, z: 0 },
        { type: 1, count: -1, x: 0, y: 0, z: 0 },
        { type: 1, count: 1, x: 0, y: Infinity, z: 0 },
        { type: 1, count: 1, x: 0, y: 0, z: 0, age: LIFETIME + 1 },
        { type: 2, count: 4, x: 1, y: 2, z: 3 },
    ], LIFETIME, 0, () => 'x');
    assert.equal(restored.length, 1);
    assert.equal(restored[0].type, 2);
    assert.equal(restored[0].age, 0);
});

test('drops are saved with the world, restored on load and carried through export', () => {
    const root = path.resolve(import.meta.dirname, '../../..');
    const app = fs.readFileSync(path.join(root, 'src/App.tsx'), 'utf8');
    const exportSrc = fs.readFileSync(path.join(root, 'src/systems/world/storage/worldExport.ts'), 'utf8');
    assert.match(app, /meta\.drops = dropsData;/);
    assert.match(app, /restoreDrops\(meta\.drops,/);
    // Quitting right after the Warden dies still saves its delayed loot.
    assert.match(app, /entityManager\.flushPendingLoot\(\);/);
    assert.match(exportSrc, /drops: meta\.drops,/);
    assert.match(exportSrc, /drops: m\?\.drops,/);
});
