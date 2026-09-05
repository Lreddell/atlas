import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTs } from '../world/storage/bundleTs.mjs';

const api = await loadTs(`
 export * from './src/systems/registry/contentIds';
 export * from './src/systems/registry/legacyIds';
 export * from './src/systems/registry/itemDefinitions';
 export * from './src/systems/registry/worldBlockCatalog';
 export { BlockType, ItemType } from './src/types';
`);

test('all 256 legacy slots have frozen unique keys, including every retired slot', () => {
    assert.equal(api.LEGACY_CONTENT.length, 256);
    assert.equal(new Set(api.LEGACY_CONTENT.map(e => e[1])).size, 256);
    assert.deepEqual(api.LEGACY_CONTENT.filter(e => e[2] === 'retired').map(e => e[0]), [4, 77, 90, 172, 174, 175, 176, 188, 189]);
});

test('all legacy inventory definitions resolve independently from placement identities', () => {
    for (const [legacy, key, kind] of api.LEGACY_CONTENT) {
        if (kind === 'retired') { assert.equal(api.itemFromKey(key), undefined); continue; }
        const id = api.itemFromKey(key);
        assert.equal(id, legacy);
        assert.equal(api.getItemDefinition(id).key, key);
        assert.ok(api.getItemDefinition(id).name);
    }
    assert.equal(api.blockForItem(api.ItemType.IRON_SWORD), null);
    assert.equal(api.isWorldBlockId(api.ItemType.IRON_SWORD), false);
    assert.equal(api.blockForItem(api.ItemType.STONE), api.BlockType.STONE);
    assert.equal(api.blockForItem(api.ItemType.SAPLING), api.BlockType.SAPLING);
    assert.equal(api.isWorldBlockId(api.BlockType.SAPLING), true);
    assert.equal(api.itemForBlock(api.BlockType.SAPLING), api.ItemType.SAPLING);
});

test('registries reject collisions and invalid placement while accepting handles above 255', () => {
    api.registerBlockIdentity(4096, 'test:block');
    api.registerItemIdentity(8192, 'test:item', 4096);
    assert.equal(api.blockFromKey('test:block'), 4096);
    assert.equal(api.itemFromKey('test:item'), 8192);
    assert.equal(api.blockForItem(8192), 4096);
    assert.throws(() => api.registerBlockIdentity(4096, 'test:different'), /Duplicate/);
    assert.throws(() => api.registerItemIdentity(8193, 'test:bad', 4097), /unregistered/);
    assert.throws(() => api.registerBlockIdentity(65536, 'test:overflow'), /Invalid/);
});
