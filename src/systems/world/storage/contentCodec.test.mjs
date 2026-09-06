import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { createRequire } from 'node:module';
import { loadTs } from './bundleTs.mjs';
import { FakeDir } from './opfs/fakeOpfs.mjs';

const fixture = JSON.parse(await fs.readFile(new URL('./fixtures/legacy-worlds.json', import.meta.url), 'utf8'));
const api = await loadTs(`
  export * from './src/systems/world/storage/contentCodec.ts';
  export * from './src/systems/world/storage/metadataCodec.ts';
  export * from './src/systems/world/storage/worldExport.ts';
  export * from './src/systems/registry/contentIds.ts';
  export { BlockType, ItemType } from './src/types.ts';
  export { encodeChunkBody, decodeChunkBody, RegionFile } from './src/systems/world/storage/acr/acrCodec.ts';
  export { OpfsSavesCore } from './src/systems/world/storage/opfs/OpfsSavesCore.ts';
  export { RegionBackendBase } from './src/systems/world/storage/RegionBackendBase.ts';
  export * from './src/systems/world/tileEntities.ts';
  export { createWorldState } from './src/systems/world/worldTypes.ts';
`);
const cjs = createRequire(import.meta.url)('../../../../electron/saves/acrCore.cjs');
const { BlockType, ItemType } = api;

test('frozen v1/v2 corpus: all 256 slots, retired keys, player payloads and campaign survive v3 twice', () => {
  for (const source of fixture.worlds) {
    const before = structuredClone(source);
    const first = api.decodeExportedWorld(source);
    const meta = { ...first.metaFields, id: 'golden', created: 1, lastPlayed: 2 };
    const wire = api.encodeExportedWorld(meta, first.chunks);
    const second = api.decodeExportedWorld(wire);
    assert.equal(wire.version, 3);
    for (const { id, key, kind } of fixture.keys) {
      const stack = second.metaFields.player.inventory[id];
      assert.equal(wire.meta.player.inventory[id].type, key);
      assert.deepEqual(stack.instance, source.meta.player.inventory[id].instance);
      assert.equal(stack.type, api.itemFromKey(key) ?? ItemType.UNKNOWN);
      if (kind === 'retired') assert.equal(stack.unknownKey, key);
      const chunk = second.chunks[0];
      assert.equal(chunk.blocks[id], api.blockFromKey(key) ?? BlockType.UNKNOWN);
      if (api.blockFromKey(key) === undefined) assert.equal(chunk.unknownBlocks[id], key);
    }
    for (const field of ['boats', 'progression', 'resonantVaultReservations', 'worldGenConfig', 'spawnPoint', 'worldSpawn']) {
      assert.deepEqual(second.metaFields[field], source.meta[field]);
    }
    assert.deepEqual(second.metaFields.player.equipment, first.metaFields.player.equipment);
    assert.deepEqual(second.metaFields.player.cursorStack, first.metaFields.player.cursorStack);
    assert.deepEqual(second.chunks[0].light, api.base64ToBytes(source.chunks[0].light));
    assert.deepEqual(second.chunks[0].meta, api.base64ToBytes(source.chunks[0].meta));
    assert.equal(second.chunks[0].timestamp, 0);
    assert.deepEqual(source, before, 'dual reading must not mutate the source');
  }
});

test('palette packing crosses every bit width, including more than 255 identities and full uint16 range', () => {
  for (const size of [0, 1, 2, 3, 5, 9, 17, 33, 65, 129, 257, 513, 1025, 2049, 4097, 8193, 16385, 32769, 65536]) {
    const blocks = new Uint16Array(size).fill(BlockType.UNKNOWN);
    const unknownBlocks = Object.fromEntries(Array.from({ length: size }, (_, i) => [i, `unavailable:block_${i}`]));
    const bytes = api.encodeBlockPalette(blocks, { unknownBlocks });
    const read = api.decodeBlockPalette(bytes);
    assert.deepEqual(read.blocks, blocks);
    assert.deepEqual(read.unknownBlocks ?? {}, unknownBlocks);
    assert.deepEqual(api.encodeBlockPalette(read.blocks, read), bytes);
  }
});

test('registered high handles are serialized as keys, with independent block and item ordinals', () => {
  api.registerBlockIdentity(4096, 'test:palette_block');
  api.registerItemIdentity(9001, 'test:palette_item', 4096);
  const bytes = api.encodeBlockPalette(new Uint16Array([4096, BlockType.STONE, 4096]));
  assert.deepEqual([...api.decodeBlockPalette(bytes).blocks], [4096, BlockType.STONE, 4096]);
  assert.equal(api.encodeItemStack({ type: 9001, count: 1 }).type, 'test:palette_item');
  assert.equal(api.decodeItemStack({ type: 'test:palette_item', count: 1 }).type, 9001);
  assert.throws(() => api.decodeItemStack({ type: 4096, count: 1 }), /Invalid saved item identity/);
});

const unknown = { type: ItemType.UNKNOWN, count: 3, unknownKey: 'future:lost_relic', instance: { durability: 19, custom: { enchantment: ['rain', 7] } } };
const entities = () => ({
  chests: { '-1,70,0': { items: [unknown, { type: ItemType.STONE, count: 64 }, null] } },
  furnaces: { '-2,70,0': { input: unknown, fuel: { type: ItemType.COAL, count: 2 }, output: null,
    burnTime: 123, maxBurnTime: 456, cookTime: 12, maxCookTime: 10000, lastUpdate: 900 } },
});

test('browser and desktop palette bodies preserve chest/furnace contents, timers and unavailable payloads', () => {
  const blocks = new Uint16Array([BlockType.CHEST, BlockType.FURNACE, BlockType.UNKNOWN]);
  const extras = { tileEntities: entities(), unknownBlocks: { 2: 'future:lost_block' } };
  const light = new Uint8Array([0xf0, 0x77, 0]);
  const meta = new Uint8Array([2, 3, 4]);
  const tsBytes = api.encodeChunkBody(blocks, light, meta, 0, extras);
  const nodeBytes = cjs.encodeChunkBody(blocks, light, meta, 0, extras);
  assert.deepEqual(tsBytes, nodeBytes);
  for (const codec of [api, cjs]) {
    const read = codec.decodeChunkBody(tsBytes);
    assert.deepEqual(read, { blocks, light, meta, timestamp: 0, ...extras });
  }
});

test('crafting grids, cursor and equipment survive metadata wire conversion with unknown keys intact', () => {
  const meta = { ...api.decodeExportedWorld(fixture.worlds[1]).metaFields, id: 'grids', created: 1, lastPlayed: 2 };
  meta.player.craftingGrid2x2 = [unknown, null, null, null];
  meta.player.craftingGrid3x3 = Array(9).fill(unknown);
  const decoded = api.decodeWorldMetadata(api.encodeWorldMetadata(meta));
  assert.deepEqual(decoded, meta);
  assert.throws(() => api.decodeWorldMetadata({ ...meta, schemaVersion: 99 }), /Unsupported world schema/);
});

test('truncated, corrupt or duplicate palette and import data rejects before publication', () => {
  const valid = api.encodeBlockPalette(new Uint16Array([1, 2, 3]));
  for (const damaged of [valid.slice(0, -1), new Uint8Array([...valid, 0]), valid.slice()]) {
    if (damaged.length === valid.length) damaged[12] = 17;
    assert.throws(() => api.decodeBlockPalette(damaged));
  }
  const padding = valid.slice(); padding[padding.length - 1] |= 128;
  assert.throws(() => api.decodeBlockPalette(padding), /padding/);
  const source = structuredClone(fixture.worlds[1]);
  source.chunks.push(structuredClone(source.chunks[0]));
  assert.throws(() => api.decodeExportedWorld(source), /Duplicate chunk/);
  source.chunks[1].cx = 5; source.chunks[1].blocks = 'not base64!';
  assert.throws(() => api.decodeExportedWorld(source));
});

test('container unload/reload and block replacement conserve contents once across negative chunk borders', () => {
  const state = api.createWorldState();
  api.restoreChunkEntities(state, '-1,0', entities());
  const snapshot = api.captureChunkEntities(state, '-1,0');
  api.unloadChunkEntities(state, '-1,0');
  assert.equal(state.chests.size + state.furnaces.size, 0);
  api.restoreChunkEntities(state, '-1,0', snapshot);
  const drops = api.handleBlockReplaced(state, -1, 70, 0, BlockType.CHEST, BlockType.AIR);
  assert.deepEqual(drops, [unknown, { type: ItemType.STONE, count: 64 }]);
  assert.deepEqual(api.handleBlockReplaced(state, -1, 70, 0, BlockType.CHEST, BlockType.AIR), []);
  assert.throws(() => api.restoreChunkEntities(state, '0,0', snapshot), /chunk boundary/);
});

test('OPFS palette chunks and containers survive handle closure, reload and enumeration', async () => {
  const root = new FakeDir();
  const first = new api.OpfsSavesCore(root, null);
  await first.create({ id: 'palette', name: 'Palette', schemaVersion: 3 });
  const chunk = { cx: -1, cz: 0, blocks: new Uint16Array([BlockType.CHEST, BlockType.UNKNOWN]),
    light: new Uint8Array([0xf0, 0x44]), meta: new Uint8Array([2, 0]), timestamp: 5,
    tileEntities: entities(), unknownBlocks: { 1: 'future:sky_metal' } };
  await first.writeChunks('palette', [chunk]);
  await first.close('palette');
  const next = new api.OpfsSavesCore(root, null);
  assert.deepEqual(await next.listAllChunks('palette'), [chunk]);
  await next.close('palette');
  const denied = new api.OpfsSavesCore({ getDirectoryHandle: async () => { throw new DOMException('Denied', 'NotAllowedError'); } }, null);
  await assert.rejects(() => denied.readChunk('palette', 0, 0), /Denied/);
});

test('recovery copies publish metadata last and an interrupted copy leaves source bytes untouched', async () => {
  const records = new Map([['old', { id: 'old', name: 'Legacy', player: fixture.worlds[1].meta.player }]]);
  const source = structuredClone(records.get('old'));
  const order = [];
  const chunks = Array.from({ length: 130 }, (_, cx) => ({ cx, cz: 0, blocks: new Uint8Array([cx & 255]), light: new Uint8Array(1), meta: new Uint8Array(1) }));
  class Backend extends api.RegionBackendBase {
    constructor() { super({}); this.api = {
      readMeta: async id => records.get(id),
      readChunksAll: async () => structuredClone(chunks),
      writeChunks: async (_id, batch) => { order.push(batch.length); if (order.length === 2) throw new Error('disk full'); },
      create: async meta => { order.push('publish'); records.set(meta.id, meta); },
    }; }
  }
  const backend = new Backend();
  await assert.rejects(() => backend.createRecoveryCopy('old', 'backup'), /disk full/);
  assert.deepEqual(order, [64, 64]);
  assert.equal(records.has('backup'), false);
  assert.deepEqual(records.get('old'), source);
  order.length = 0;
  backend.api.writeChunks = async (_id, batch) => { order.push(batch.length); };
  await backend.createRecoveryCopy('old', 'backup');
  assert.deepEqual(order, [64, 64, 2, 'publish']);
  assert.equal(records.get('backup').recoverySourceId, 'old');
  assert.deepEqual(records.get('backup').player, source.player);
  assert.deepEqual(records.get('old'), source);
});
