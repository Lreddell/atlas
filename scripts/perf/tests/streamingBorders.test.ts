import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BORDER_PLANE_LENGTH,
  compactNeighborPlanes,
  expandNeighborPlanes,
} from '../../../src/systems/world/streamingBorders';

const CHUNK_SIZE = 16;
const WORLD_HEIGHT = 384;
const LAYER_SIZE = CHUNK_SIZE * CHUNK_SIZE;
const index = (x: number, localY: number, z: number) => localY * LAYER_SIZE + z * CHUNK_SIZE + x;

const makeChunk = (seed: number) => {
  const data = new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);
  for (let localY = 0; localY < WORLD_HEIGHT; localY += 1) {
    for (let z = 0; z < CHUNK_SIZE; z += 1) {
      for (let x = 0; x < CHUNK_SIZE; x += 1) {
        data[index(x, localY, z)] = (seed + x * 3 + z * 5 + localY * 7) & 0xff;
      }
    }
  }
  return data;
};

test('compaction extracts only the boundary plane for each neighbor direction', () => {
  const left = makeChunk(1);
  const right = makeChunk(2);
  const front = makeChunk(3);
  const back = makeChunk(4);
  const compact = compactNeighborPlanes({ left, right, front, back });

  assert.equal(compact.borderOnly, true);
  assert.equal(compact.left?.length, BORDER_PLANE_LENGTH);
  assert.equal(compact.right?.length, BORDER_PLANE_LENGTH);
  assert.equal(compact.front?.length, BORDER_PLANE_LENGTH);
  assert.equal(compact.back?.length, BORDER_PLANE_LENGTH);

  for (const localY of [0, 17, WORLD_HEIGHT - 1]) {
    for (const lateral of [0, 5, CHUNK_SIZE - 1]) {
      const planeIndex = localY * CHUNK_SIZE + lateral;
      assert.equal(compact.left?.[planeIndex], left[index(CHUNK_SIZE - 1, localY, lateral)]);
      assert.equal(compact.right?.[planeIndex], right[index(0, localY, lateral)]);
      assert.equal(compact.front?.[planeIndex], front[index(lateral, localY, 0)]);
      assert.equal(compact.back?.[planeIndex], back[index(lateral, localY, CHUNK_SIZE - 1)]);
    }
  }
});

test('expanded compact planes reproduce the boundary cells read by the current mesher', () => {
  const sources = {
    left: makeChunk(11),
    right: makeChunk(12),
    front: makeChunk(13),
    back: makeChunk(14),
  };
  const expanded = expandNeighborPlanes(compactNeighborPlanes(sources));

  for (const localY of [0, 31, WORLD_HEIGHT - 1]) {
    for (const lateral of [0, 9, CHUNK_SIZE - 1]) {
      assert.equal(expanded.left?.[index(CHUNK_SIZE - 1, localY, lateral)], sources.left[index(CHUNK_SIZE - 1, localY, lateral)]);
      assert.equal(expanded.right?.[index(0, localY, lateral)], sources.right[index(0, localY, lateral)]);
      assert.equal(expanded.front?.[index(lateral, localY, 0)], sources.front[index(lateral, localY, 0)]);
      assert.equal(expanded.back?.[index(lateral, localY, CHUNK_SIZE - 1)], sources.back[index(lateral, localY, CHUNK_SIZE - 1)]);
    }
  }
});

test('full neighbor data passes through without copying', () => {
  const full = { left: makeChunk(21) };
  assert.equal(expandNeighborPlanes(full).left, full.left);
});

test('neighbor compaction cuts cloned neighbor bytes to one sixteenth', () => {
  const full = {
    left: makeChunk(31),
    right: makeChunk(32),
    front: makeChunk(33),
    back: makeChunk(34),
  };
  const compact = compactNeighborPlanes(full);
  const fullBytes = Object.values(full).reduce((total, value) => total + value.byteLength, 0);
  const compactBytes = [compact.left, compact.right, compact.front, compact.back]
    .reduce((total, value) => total + (value?.byteLength ?? 0), 0);

  assert.equal(compactBytes, fullBytes / CHUNK_SIZE);
});
