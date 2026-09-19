// Stage 3: Heartwood generation stamp tests. Fake flat terrain, real stamp
// code: keep walls/gate/hall, amphitheater floor/terraces, waystone hub,
// vault seal, border continuity, and determinism.
import assert from 'node:assert/strict';
import test from 'node:test';

import { loadTsViaFile } from '../world/storage/bundleTs.mjs';

const gen = await loadTsViaFile(`
    export { applyHeartwoodToChunk } from './src/systems/heartwood/heartwoodGeneration.ts';
    export { getHeartwoodLayout } from './src/systems/heartwood/heartwoodSites.ts';
    export { registerHeartwoodContent } from './src/systems/heartwood/heartwoodContent.ts';
    export { registerGate0ProvingBlocks } from './src/data/campaign/gate0.ts';
    export { index3D } from './src/systems/world/worldCoords.ts';
`, 'heartwood-generation');

gen.registerGate0ProvingBlocks();
gen.registerHeartwoodContent();

const CELLS = 16 * 16 * 384;
const MIN_Y = -64;

function flatChunk(topY, topBlock, fillBlock) {
  const blocks = new Uint16Array(CELLS);
  for (let x = 0; x < 16; x++) {
    for (let z = 0; z < 16; z++) {
      for (let y = MIN_Y; y <= topY; y++) {
        blocks[gen.index3D(x, y, z)] = y === topY ? topBlock : fillBlock;
      }
    }
  }
  return { blocks, light: new Uint8Array(CELLS), meta: new Uint8Array(CELLS) };
}

const ctx = { seed: 12345, getSurfaceY: () => 70 };
const layout = gen.getHeartwoodLayout(12345);
// IDs under test (fixed by the registry contract).
const GRASS = 2, STONE = 3, AIR = 0;
const HEDGE = 271, ROOT = 272, CUT = 266, PATH = 277, FURROW = 276;
const RING = 268, MARKER = 278, SEAL = 85, LAMP = 270;

function stampAt(cx, cz) {
  return gen.applyHeartwoodToChunk(cx, cz, flatChunk(70, GRASS, STONE), ctx);
}

// Global voxel view over a lazily stamped chunk cache (sites routinely span
// chunk borders, so single-chunk reads would miss clipped cells).
const stamped = new Map();
function stampCached(cx, cz) {
  const key = `${cx},${cz}`;
  let entry = stamped.get(key);
  if (!entry) {
    entry = stampAt(cx, cz);
    stamped.set(key, entry);
  }
  return entry;
}

function gat(x, y, z) {
  const cx = Math.floor(x / 16);
  const cz = Math.floor(z / 16);
  const chunk = stampCached(cx, cz);
  return chunk.blocks[gen.index3D(x - cx * 16, y, z - cz * 16)];
}

test('keep: hedge ring with root gate, courtyard, hollow hall', () => {
  const { x, z, half } = layout.keep;
  // Courtyard path exists in the annulus between hall and walls.
  assert.equal(gat(x + 10, 71, z), PATH);
  // Hall is hollow inside.
  assert.equal(gat(x, 72, z), AIR);
  // Gate cells come from the layout (single source with the transform code).
  const gateCells = [];
  for (let y = 71; y <= 74; y++) {
    for (const cell of layout.keep.gateCells) gateCells.push(gat(cell.x, y, cell.z));
  }
  assert.equal(gateCells.length, 12);
  assert.ok(gateCells.every((t) => t === ROOT), `gate closed with root blocks, got ${gateCells}`);
  // Hedge wall present away from the gate.
  let hedge = 0;
  for (let dx = -half; dx <= half; dx++) {
    if (gat(x + dx, 71, z - half) === HEDGE) hedge++;
  }
  assert.ok(hedge >= half, `hedge wall spans the north face (found ${hedge})`);
});

test('amphitheater: furrow floor, terrace rings, cleared bowl', () => {
  const { x, z } = layout.amphitheater;
  assert.equal(gat(x, 70, z), PATH);
  assert.equal(gat(x + 20, 70, z), FURROW);
  // Terrace ring present.
  let ring = 0;
  for (let dx = -40; dx <= 40; dx++) {
    if (gat(x + dx, 71, z) === CUT) ring++;
  }
  assert.ok(ring > 0, 'terrace ring stamped');
});

test('waystone hub: ring stones around a dormant marker', () => {
  const { x, z } = layout.waystoneHub;
  assert.equal(gat(x, 71, z), MARKER);
  let stones = 0;
  for (let dx = -7; dx <= 7; dx++) {
    for (let dz = -7; dz <= 7; dz++) {
      if (gat(x + dx, 71, z + dz) === RING) stones++;
    }
  }
  assert.equal(stones, 7);
});

test('vault entrance: sealed arch with lamps', () => {
  const { x, z } = layout.vaultEntrance;
  assert.equal(gat(x, 71, z), SEAL);
  assert.equal(gat(x - 4, 71, z + 4), LAMP);
  assert.equal(gat(x + 4, 71, z + 4), LAMP);
});

test('floor disc is continuous across a chunk border', () => {
  const { x, z } = layout.amphitheater;
  // Find a chunk boundary inside the disc: step west until x is a multiple of 16.
  let bx = x;
  while (bx % 16 !== 0) bx--;
  const left = gat(bx - 1, 70, z);
  const right = gat(bx, 70, z);
  assert.ok(left === PATH || left === FURROW, `west floor present (got ${left})`);
  assert.ok(right === PATH || right === FURROW, `east floor present (got ${right})`);
});

test('stamping is deterministic across runs', () => {
  const { x, z } = layout.keep;
  const cx = Math.floor(x / 16);
  const cz = Math.floor(z / 16);
  const a = stampAt(cx, cz);
  const b = stampAt(cx, cz);
  assert.deepEqual([...a.blocks], [...b.blocks]);
});
