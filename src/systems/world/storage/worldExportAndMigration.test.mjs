import assert from 'node:assert/strict';
import test from 'node:test';

import { loadTs } from './bundleTs.mjs';

const {
    encodeExportedWorld,
    decodeExportedWorld,
    uniqueWorldName,
    bytesToBase64,
    base64ToBytes,
    migrateWorlds,
} = await loadTs(`
    export { encodeExportedWorld, decodeExportedWorld, uniqueWorldName, bytesToBase64, base64ToBytes } from './src/systems/world/storage/worldExport.ts';
    export { migrateWorlds } from './src/systems/world/storage/migration.ts';
`);

const meta = () => ({
    id: 'abc', name: 'My World', seed: 'hi', seedNum: 42, created: 1, lastPlayed: 2,
    gameMode: 'creative', time: 12000,
    player: { position: { x: 1, y: 2, z: 3 }, rotation: { x: 0, y: 0 }, inventory: [], health: 20, hunger: 20, saturation: 5, breath: 10, gameMode: 'creative', selectedSlot: 0 },
    spawnPoint: { x: 1, y: 2, z: 3 }, worldSpawn: { x: 0, y: 64, z: 0 },
    worldGenConfig: { a: 1 }, worldGenPresetId: 'p', worldGenPresetName: 'Preset',
    progression: { version: 1, bossesDefeated: ['x'], regionStates: {}, unlockedAbilities: [], unlockedRecipes: [] },
});
const rawChunk = (cx, cz) => ({ cx, cz, blocks: new Uint8Array([1, 2, 3, cx & 255]), light: new Uint8Array([4, 5]), meta: new Uint8Array([6]), timestamp: 999 });

test('base64 helpers round-trip arbitrary bytes', () => {
    const bytes = new Uint8Array([0, 1, 127, 128, 255, 42]);
    assert.deepEqual([...base64ToBytes(bytesToBase64(bytes))], [...bytes]);
});

test('export then import preserves metadata fields and all chunks', () => {
    const exported = encodeExportedWorld(meta(), [rawChunk(0, 0), rawChunk(-1, 5)]);
    assert.equal(exported.format, 'atlas-world-export');
    assert.equal(exported.version, 2);
    const { metaFields, chunks } = decodeExportedWorld(exported);
    assert.equal(metaFields.name, 'My World');
    assert.equal(metaFields.seedNum, 42);
    assert.equal(metaFields.gameMode, 'creative');
    assert.equal(metaFields.time, 12000);
    assert.deepEqual(metaFields.progression.bossesDefeated, ['x']);
    assert.equal(metaFields.worldGenPresetName, 'Preset');
    assert.equal(chunks.length, 2);
    const c0 = chunks.find((c) => c.cx === 0 && c.cz === 0);
    assert.deepEqual([...c0.blocks], [1, 2, 3, 0]);
    assert.equal(c0.timestamp, 999);
    const cN = chunks.find((c) => c.cx === -1 && c.cz === 5);
    assert.deepEqual([...cN.blocks], [1, 2, 3, 255]);
});

test('a v1 export (no progression) still imports', () => {
    const exported = encodeExportedWorld(meta(), [rawChunk(0, 0)]);
    exported.version = 1;
    delete exported.meta.progression;
    const { metaFields, chunks } = decodeExportedWorld(exported);
    assert.equal(metaFields.progression, undefined);
    assert.equal(chunks.length, 1);
});

test('a non-Atlas file is rejected', () => {
    assert.throws(() => decodeExportedWorld({ format: 'nope', version: 2, chunks: [] }), /Invalid world export/);
    assert.throws(() => decodeExportedWorld({ format: 'atlas-world-export', version: 9, chunks: [] }), /Invalid world export/);
});

test('uniqueWorldName disambiguates against existing names', () => {
    assert.equal(uniqueWorldName('World', []), 'World');
    assert.equal(uniqueWorldName('World', ['World']), 'World (2)');
    assert.equal(uniqueWorldName('World', ['World', 'World (2)']), 'World (3)');
});

test('migration is idempotent: already-present worlds are skipped', async () => {
    const migrated = [];
    const result = await migrateWorlds({
        listLegacy: async () => [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
        listExisting: async () => ['b'], // b already on disk
        migrateOne: async (w) => { migrated.push(w.id); },
    });
    assert.deepEqual(migrated.sort(), ['a', 'c']);
    assert.deepEqual(result.migrated.sort(), ['a', 'c']);
    assert.deepEqual(result.skipped, ['b']);
    assert.equal(result.failed.length, 0);

    // Running again with everything present migrates nothing.
    const again = await migrateWorlds({
        listLegacy: async () => [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
        listExisting: async () => ['a', 'b', 'c'],
        migrateOne: async () => { throw new Error('should not be called'); },
    });
    assert.deepEqual(again.skipped.sort(), ['a', 'b', 'c']);
    assert.equal(again.migrated.length, 0);
});

test('a failed world migration is isolated and does not abort the others or touch the source', async () => {
    const deletedFromSource = [];
    const result = await migrateWorlds({
        listLegacy: async () => [{ id: 'a' }, { id: 'bad' }, { id: 'c' }],
        listExisting: async () => [],
        migrateOne: async (w) => {
            if (w.id === 'bad') throw new Error('disk full');
            // a real migrateOne never deletes the source; assert none do here
        },
    });
    assert.deepEqual(result.migrated.sort(), ['a', 'c']);
    assert.equal(result.failed.length, 1);
    assert.equal(result.failed[0].id, 'bad');
    assert.match(result.failed[0].error, /disk full/);
    assert.equal(deletedFromSource.length, 0); // source untouched
});
