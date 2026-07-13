import assert from "node:assert/strict";
import test from "node:test";
import { loadTs } from "../storage/bundleTs.mjs";

globalThis.__APP_VERSION__ = "test";
globalThis.__APP_DISPLAY_VERSION__ = "test";

const mod = await loadTs(`
  export {
    NEIGHBOR_BORDER_CELLS,
    extractNeighborBorder,
    extractNeighborBorders,
    inflateNeighborBorders,
    neighborScratchBytes,
  } from './src/systems/world/workers/neighborBorders';
  export { CHUNK_SIZE, WORLD_HEIGHT } from './src/constants';
`);

const {
  NEIGHBOR_BORDER_CELLS,
  extractNeighborBorder,
  extractNeighborBorders,
  inflateNeighborBorders,
  neighborScratchBytes,
  CHUNK_SIZE,
  WORLD_HEIGHT,
} = mod;

const index = (x, yOffset, z) =>
  yOffset * CHUNK_SIZE * CHUNK_SIZE + z * CHUNK_SIZE + x;
const cells = CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT;

const source = new Uint8Array(cells);
for (let y = 0; y < WORLD_HEIGHT; y += 1) {
  for (let z = 0; z < CHUNK_SIZE; z += 1) {
    for (let x = 0; x < CHUNK_SIZE; x += 1) {
      source[index(x, y, z)] = (x * 11 + z * 7 + y * 3) & 0xff;
    }
  }
}

test("neighbor border planes contain exactly one vertical chunk face", () => {
  assert.equal(NEIGHBOR_BORDER_CELLS, CHUNK_SIZE * WORLD_HEIGHT);
  const left = extractNeighborBorder(source, "left");
  const right = extractNeighborBorder(source, "right");
  const front = extractNeighborBorder(source, "front");
  const back = extractNeighborBorder(source, "back");
  assert.equal(left[12 * CHUNK_SIZE + 5], source[index(CHUNK_SIZE - 1, 12, 5)]);
  assert.equal(right[12 * CHUNK_SIZE + 5], source[index(0, 12, 5)]);
  assert.equal(front[12 * CHUNK_SIZE + 5], source[index(5, 12, 0)]);
  assert.equal(back[12 * CHUNK_SIZE + 5], source[index(5, 12, CHUNK_SIZE - 1)]);
});

test("inflated sparse neighbor arrays preserve every boundary sample used by the mesher", () => {
  const borders = extractNeighborBorders({
    left: source,
    right: source,
    front: source,
    back: source,
  });
  const scratch = {};
  const inflated = inflateNeighborBorders(borders, source.length, scratch);
  for (let y = 0; y < WORLD_HEIGHT; y += 1) {
    for (let axis = 0; axis < CHUNK_SIZE; axis += 1) {
      assert.equal(
        inflated.left[index(CHUNK_SIZE - 1, y, axis)],
        source[index(CHUNK_SIZE - 1, y, axis)],
      );
      assert.equal(
        inflated.right[index(0, y, axis)],
        source[index(0, y, axis)],
      );
      assert.equal(
        inflated.front[index(axis, y, 0)],
        source[index(axis, y, 0)],
      );
      assert.equal(
        inflated.back[index(axis, y, CHUNK_SIZE - 1)],
        source[index(axis, y, CHUNK_SIZE - 1)],
      );
    }
  }
  assert.equal(neighborScratchBytes(scratch), source.byteLength * 4);
});

test("four block and four light borders reduce full-height neighbor payload by 737,280 bytes", () => {
  const fullNeighborBytes = source.byteLength * 8;
  const borderBytes = NEIGHBOR_BORDER_CELLS * 8;
  assert.equal(fullNeighborBytes, 786_432);
  assert.equal(borderBytes, 49_152);
  assert.equal(fullNeighborBytes - borderBytes, 737_280);
});

test("missing neighbors remain implicit instead of allocating empty full chunks", () => {
  const borders = extractNeighborBorders({ left: source });
  const inflated = inflateNeighborBorders(borders, source.length, {});
  assert.ok(inflated.left);
  assert.equal(inflated.right, undefined);
  assert.equal(inflated.front, undefined);
  assert.equal(inflated.back, undefined);
});
