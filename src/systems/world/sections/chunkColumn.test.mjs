import assert from "node:assert/strict";
import test from "node:test";
import { loadTs } from "../storage/bundleTs.mjs";

globalThis.__APP_VERSION__ = "test";
globalThis.__APP_DISPLAY_VERSION__ = "test";

const mod = await loadTs(`
  export {
    ChunkColumn, SECTION_COUNT, SECTION_VOLUME, COLUMN_VOLUME, materializeColumnArray
  } from './src/systems/world/sections/chunkColumn';
  export {
    allocatedBytesOfArray, createSectionedColumnMaps, isSectionedColumnView, materializeUint8Array
  } from './src/systems/world/sections/sectionedColumnMap';
  export { createWorldState } from './src/systems/world/worldTypes';
  export {
    allocatedWorldBytes, getBlockAt, getChunkData, getMetadataData, materializeChunkKind,
    residentSectionCount, setChunkData, setLightData, setMetadataAt
  } from './src/systems/world/worldStore';
`);

const {
  ChunkColumn, SECTION_COUNT, SECTION_VOLUME, COLUMN_VOLUME, materializeColumnArray,
  allocatedBytesOfArray, createSectionedColumnMaps, isSectionedColumnView, materializeUint8Array,
  createWorldState, allocatedWorldBytes, getBlockAt, getChunkData, getMetadataData,
  materializeChunkKind, residentSectionCount, setChunkData, setLightData, setMetadataAt,
} = mod;

const index = (x, y, z) => ((y + 64) * 16 * 16) + (z * 16) + x;

test("empty column keeps all 24 sections implicit", () => {
  const column = new ChunkColumn();
  assert.equal(SECTION_COUNT, 24);
  assert.equal(column.allocatedSectionCount, 0);
  assert.equal(column.allocatedBytes, 0);
  assert.equal(column.getBlock(0, -64, 0), 0);
  assert.equal(column.getLight(0, 319, 0), 0xf0);
  assert.equal(column.getMetadata(0, 0, 0), 0);
});

test("writes allocate only the touched section and metadata stays lazy", () => {
  const column = new ChunkColumn();
  column.setBlock(3, -1, 7, 42);
  assert.equal(column.allocatedSectionCount, 1);
  assert.equal(column.allocatedBytes, SECTION_VOLUME * 2);
  column.setMetadata(3, -1, 7, 5);
  assert.equal(column.allocatedBytes, SECTION_VOLUME * 3);
  assert.equal(column.getBlock(3, -1, 7), 42);
  assert.equal(column.getMetadata(3, -1, 7), 5);
});

test("minimum and maximum Y indexing remains exact", () => {
  const column = new ChunkColumn();
  column.setBlock(15, -64, 15, 1);
  column.setBlock(0, 319, 0, 2);
  assert.equal(column.getBlock(15, -64, 15), 1);
  assert.equal(column.getBlock(0, 319, 0), 2);
  assert.throws(() => column.getBlock(0, -65, 0), RangeError);
  assert.throws(() => column.setBlock(16, 0, 0, 1), RangeError);
});

test("legacy arrays round-trip byte-for-byte while empty sky sections stay implicit", () => {
  const blocks = new Uint8Array(COLUMN_VOLUME);
  const light = new Uint8Array(COLUMN_VOLUME);
  light.fill(0xf0);
  const metadata = new Uint8Array(COLUMN_VOLUME);
  for (let y = -64; y <= 80; y += 1) {
    for (let z = 0; z < 16; z += 1) {
      for (let x = 0; x < 16; x += 1) {
        const i = index(x, y, z);
        blocks[i] = y < 64 ? 3 : (y === 64 ? 2 : 0);
        light[i] = y > 64 ? 0xf0 : 0;
      }
    }
  }
  metadata[index(4, 64, 4)] = 7;
  const column = ChunkColumn.fromLegacy(blocks, light, metadata);
  assert.ok(column.allocatedSectionCount < SECTION_COUNT);
  assert.deepEqual(materializeColumnArray(column, "blocks"), blocks);
  assert.deepEqual(materializeColumnArray(column, "light"), light);
  assert.deepEqual(materializeColumnArray(column, "metadata"), metadata);
  assert.ok(column.allocatedBytes < blocks.byteLength + light.byteLength + metadata.byteLength);
});

test("occupancy bounds shrink when a boundary block is removed", () => {
  const column = new ChunkColumn();
  column.setBlock(0, 0, 0, 1);
  column.setBlock(15, 15, 15, 1);
  const section = column.getSection(4);
  assert.deepEqual(section?.occupancyMin, [0, 0, 0]);
  assert.deepEqual(section?.occupancyMax, [15, 15, 15]);
  column.setBlock(15, 15, 15, 0);
  assert.deepEqual(section?.occupancyMax, [0, 0, 0]);
});

test("compatibility views preserve indexed read/write without retaining flat arrays", () => {
  const maps = createSectionedColumnMaps();
  const blocks = new Uint8Array(COLUMN_VOLUME);
  blocks[index(4, 10, 7)] = 9;
  maps.chunks.set("0,0", blocks);
  const view = maps.chunks.get("0,0");
  assert.ok(view);
  assert.equal(isSectionedColumnView(view), true);
  assert.equal(view.length, COLUMN_VOLUME);
  assert.equal(view[index(4, 10, 7)], 9);
  view[index(5, 10, 7)] = 12;
  assert.equal(maps.columns.get("0,0").getBlock(5, 10, 7), 12);
  const expected = blocks.slice();
  expected[index(5, 10, 7)] = 12;
  assert.deepEqual(materializeUint8Array(view), expected);
});

test("metadata compatibility writes allocate only the touched section", () => {
  const maps = createSectionedColumnMaps();
  maps.chunks.set("1,-2", new Uint8Array(COLUMN_VOLUME));
  const metadata = maps.metadata.get("1,-2");
  metadata[index(2, 0, 3)] = 7;
  assert.equal(allocatedBytesOfArray(metadata), SECTION_VOLUME);
  assert.equal(materializeUint8Array(metadata)[index(2, 0, 3)], 7);
});

test("fill and slice keep typed-array-compatible semantics", () => {
  const maps = createSectionedColumnMaps();
  maps.chunks.set("0,0", new Uint8Array(COLUMN_VOLUME));
  const view = maps.chunks.get("0,0");
  view.fill(3, 10, 20);
  assert.deepEqual([...view.slice(8, 22)], [0,0,3,3,3,3,3,3,3,3,3,3,0,0]);
});

test("deleting blocks evicts the shared column and every compatibility view", () => {
  const maps = createSectionedColumnMaps();
  maps.chunks.set("0,0", new Uint8Array(COLUMN_VOLUME));
  maps.lights.set("0,0", new Uint8Array(COLUMN_VOLUME));
  assert.equal(maps.chunks.delete("0,0"), true);
  assert.equal(maps.chunks.get("0,0"), undefined);
  assert.equal(maps.lights.get("0,0"), undefined);
  assert.equal(maps.metadata.get("0,0"), undefined);
});

test("world state splits legacy arrays into one shared section column", () => {
  const state = createWorldState();
  const blocks = new Uint8Array(COLUMN_VOLUME);
  const light = new Uint8Array(COLUMN_VOLUME);
  light.fill(0xf0);
  blocks[index(1, 10, 2)] = 9;
  setChunkData(state, -3, 5, blocks);
  setLightData(state, -3, 5, light);
  assert.equal(state.columns.size, 1);
  assert.equal(residentSectionCount(state), 1);
  assert.equal(getBlockAt(state, -3, 5, 1, 10, 2), 9);
  assert.deepEqual(materializeChunkKind(state, -3, 5, "blocks"), blocks);
  assert.ok(allocatedWorldBytes(state) <= SECTION_VOLUME * 2);
});

test("world metadata view stays lazy and direct accessor is writable", () => {
  const state = createWorldState();
  setChunkData(state, 0, 0, new Uint8Array(COLUMN_VOLUME));
  const metadata = getMetadataData(state, 0, 0);
  assert.ok(metadata);
  assert.equal(metadata.byteLength, 0);
  assert.equal(setMetadataAt(state, 0, 0, 4, 0, 4, 3), true);
  assert.equal(metadata.byteLength, SECTION_VOLUME);
  assert.equal(materializeChunkKind(state, 0, 0, "metadata")[index(4, 0, 4)], 3);
});

test("generated all-air columns retain a truthy compatibility view", () => {
  const state = createWorldState();
  setChunkData(state, 7, -8, new Uint8Array(COLUMN_VOLUME));
  const view = getChunkData(state, 7, -8);
  assert.ok(view);
  assert.equal(view.length, COLUMN_VOLUME);
  assert.equal(residentSectionCount(state), 0);
});
