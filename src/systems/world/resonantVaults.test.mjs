import assert from 'node:assert/strict';
import test from 'node:test';

import {
  RESONANT_VAULT_GRID,
  RESONANT_VAULT_HALF_EXTENT,
  getVaultCandidateForCell,
  getVaultId,
  getVaultLayout,
  getVaultDoorways,
  getVaultSurfaceOutlet,
  getVaultCorridorRoute,
  getVaultGlyphSequence,
  getVaultPhaseTiming,
  getVaultSurfaceApproach,
  getVaultSpirePosition,
  findNearestVaultCandidate,
  resonantVaultTouchesBox,
  floorDiv,
} from './resonantVaults.ts';

const SEED = 24681357;

test('the locator approach stays on the lit forecourt outside the Listening Spire', () => {
  for (let orientation = 0; orientation < 4; orientation += 1) {
    const candidate = {
      ...getVaultCandidateForCell(3, -2, SEED),
      orientation,
      active: true,
    };
    const approach = getVaultSurfaceApproach(candidate, 91);
    const spire = getVaultSpirePosition(candidate);
    assert.equal(approach.y, 93);
    assert.equal(Math.abs(approach.x - spire.x) + Math.abs(approach.z - spire.z), 12);
    assert.ok(Math.abs(approach.x - spire.x) > 7 || Math.abs(approach.z - spire.z) > 7);
  }
});

test('vault grid math is stable across positive and negative coordinates', () => {
  assert.equal(floorDiv(0, RESONANT_VAULT_GRID), 0);
  assert.equal(floorDiv(RESONANT_VAULT_GRID - 1, RESONANT_VAULT_GRID), 0);
  assert.equal(floorDiv(-1, RESONANT_VAULT_GRID), -1);
  assert.equal(floorDiv(-RESONANT_VAULT_GRID, RESONANT_VAULT_GRID), -1);
});

test('candidate lookup is deterministic and stays inside its grid cell', () => {
  for (let gx = -8; gx <= 8; gx += 1) {
    for (let gz = -8; gz <= 8; gz += 1) {
      const a = getVaultCandidateForCell(gx, gz, SEED);
      const b = getVaultCandidateForCell(gx, gz, SEED);
      assert.deepEqual(a, b);
      assert.equal(a.gridX, gx);
      assert.equal(a.gridZ, gz);
      assert.ok(a.centerX >= gx * RESONANT_VAULT_GRID + RESONANT_VAULT_HALF_EXTENT);
      assert.ok(a.centerX < (gx + 1) * RESONANT_VAULT_GRID - RESONANT_VAULT_HALF_EXTENT);
      assert.ok(a.centerZ >= gz * RESONANT_VAULT_GRID + RESONANT_VAULT_HALF_EXTENT);
      assert.ok(a.centerZ < (gz + 1) * RESONANT_VAULT_GRID - RESONANT_VAULT_HALF_EXTENT);
    }
  }
});

test('vault ids and layouts are stable but vary between cells', () => {
  const a = getVaultCandidateForCell(2, -3, SEED);
  const b = getVaultCandidateForCell(-4, 5, SEED);
  assert.equal(getVaultId(a), getVaultId(getVaultCandidateForCell(2, -3, SEED)));
  assert.notEqual(getVaultId(a), getVaultId(b));
  assert.deepEqual(getVaultLayout(a, 91), getVaultLayout(a, 91));
  assert.notDeepEqual(getVaultLayout(a, 91), getVaultLayout(b, 91));
});

test('layout always contains the complete feasible expedition graph', () => {
  const candidate = getVaultCandidateForCell(1, 1, SEED);
  const layout = getVaultLayout(candidate, 96);
  const rooms = new Set(layout.rooms.map((room) => room.id));
  for (const required of [
    'spire','entrance','processional','tuning','hub',
    'major_0','major_1','major_2','major_3','major_4','major_5',
    'inner_works','antechamber','arena','core',
    'grand_ascent','fracture_stair','outlet_grand','outlet_fracture',
  ]) {
    assert.equal(rooms.has(required), true, `missing ${required}`);
  }
  const edges = new Set(layout.edges.map(([a,b]) => `${a}>${b}`));
  // Two challenge circuits leave and return to the hub (left through the
  // crossing and inner works, right through the deep wing), and the boss spine
  // runs hub > antechamber > arena > core > both ascents.
  for (const required of [
    'entrance>processional','processional>tuning','tuning>hub',
    'hub>major_0','major_0>major_1','major_1>major_4',
    'major_4>inner_works','inner_works>hub',
    'hub>major_2','major_2>major_3','major_3>major_5','major_5>hub',
    'hub>antechamber','antechamber>arena','arena>core',
    'core>grand_ascent','core>fracture_stair',
    'grand_ascent>outlet_grand','fracture_stair>outlet_fracture',
  ]) {
    assert.equal(edges.has(required), true, `missing edge ${required}`);
  }
});

function projectLocalX(candidate, orientation, x, z) {
  const dx = x - candidate.centerX;
  const dz = z - candidate.centerZ;
  switch (orientation) {
    case 1: return dz;
    case 2: return -dx;
    case 3: return -dz;
    default: return dx;
  }
}

test('layout owns explicit doorways and terrain-sampled surface outlets in every orientation', () => {
  for (let orientation = 0; orientation < 4; orientation += 1) {
    const candidate = { ...getVaultCandidateForCell(3, -2, SEED), active: true, orientation };
    const sampled = [];
    const getSurfaceY = (x, z) => {
      sampled.push([x, z]);
      const localX = projectLocalX(candidate, orientation, x, z);
      if (localX < -1) return 88;
      if (localX > 1) return 112;
      return 100;
    };
    const layout = getVaultLayout(candidate, 100, getSurfaceY);
    const byId = new Map(layout.rooms.map((room) => [room.id, room]));
    const edges = new Set(layout.edges.map(([from, to]) => `${from}>${to}`));

    assert.equal(edges.has('grand_ascent>outlet_grand'), true);
    assert.equal(edges.has('fracture_stair>outlet_fracture'), true);
    assert.equal(layout.doorways.length, layout.edges.length);
    assert.deepEqual(getVaultDoorways(layout), layout.doorways);

    const doorwayKeys = new Set(layout.doorways.map(({ from, to }) => `${from}>${to}`));
    assert.equal(doorwayKeys.size, layout.edges.length);
    for (const edge of edges) assert.equal(doorwayKeys.has(edge), true, `missing doorway ${edge}`);

    const innerSeal = layout.doorways.find(({ from, to }) => from === 'hub' && to === 'antechamber');
    const grandGate = layout.doorways.find(({ from, to }) => from === 'core' && to === 'grand_ascent');
    const fractureGate = layout.doorways.find(({ from, to }) => from === 'core' && to === 'fracture_stair');
    assert.equal(innerSeal?.gate, 'inner_seal');
    assert.equal(grandGate?.gate, 'grand_ascent');
    assert.equal(fractureGate?.gate, 'fracture_stair');
    assert.equal(layout.doorways.filter(({ gate }) => gate).length, 3);

    const grand = getVaultSurfaceOutlet(layout, 'grand');
    const fracture = getVaultSurfaceOutlet(layout, 'fracture');
    assert.equal(grand, layout.surfaceOutlets.grand);
    assert.equal(fracture, layout.surfaceOutlets.fracture);
    assert.notDeepEqual([grand.x, grand.z], [fracture.x, fracture.z]);
    assert.equal(new Set([grand.surfaceY, fracture.surfaceY]).has(88), true);
    assert.equal(new Set([grand.surfaceY, fracture.surfaceY]).has(112), true);
    assert.equal(byId.get('outlet_grand')?.y, grand.floorY);
    assert.equal(byId.get('outlet_fracture')?.y, fracture.floorY);
    assert.equal(sampled.some(([x, z]) => x === grand.x && z === grand.z), true);
    assert.equal(sampled.some(([x, z]) => x === fracture.x && z === fracture.z), true);

    const spire = byId.get('spire');
    for (const outlet of [grand, fracture]) {
      assert.ok(Math.abs(outlet.x - candidate.centerX) < RESONANT_VAULT_HALF_EXTENT);
      assert.ok(Math.abs(outlet.z - candidate.centerZ) < RESONANT_VAULT_HALF_EXTENT);
      assert.ok(Math.abs(outlet.x - spire.x) > Math.floor(spire.width / 2)
        || Math.abs(outlet.z - spire.z) > Math.floor(spire.depth / 2));
      assert.ok(outlet.thresholdRadius >= 2);
    }

    for (const [fromId, toId] of [['grand_ascent', 'outlet_grand'], ['fracture_stair', 'outlet_fracture']]) {
      const route = getVaultCorridorRoute(byId.get(fromId), byId.get(toId));
      for (let index = 1; index < route.length; index += 1) {
        const previous = route[index - 1];
        const current = route[index];
        assert.equal(Math.abs(previous.x - current.x) + Math.abs(previous.z - current.z), 1);
        assert.ok(Math.abs(previous.y - current.y) <= 1, `${fromId}>${toId} rises too quickly`);
      }
    }
  }
});

test('glyph sequence has four readable symbols with no immediate repeat', () => {
  for (let gx = -20; gx <= 20; gx += 1) {
    const candidate = getVaultCandidateForCell(gx, 7 - gx, SEED);
    const sequence = getVaultGlyphSequence(candidate);
    assert.equal(sequence.length, 4);
    for (let i = 0; i < sequence.length; i += 1) {
      assert.ok(sequence[i] >= 0 && sequence[i] <= 3);
      if (i > 0) assert.notEqual(sequence[i], sequence[i - 1]);
    }
  }
});

test('phase timing is deterministic and remains playable', () => {
  const candidate = getVaultCandidateForCell(8, -9, SEED);
  const timing = getVaultPhaseTiming(candidate);
  assert.deepEqual(timing, getVaultPhaseTiming(candidate));
  assert.ok(timing.periodTicks >= 80 && timing.periodTicks <= 120);
  assert.ok(timing.solidTicks >= 34 && timing.solidTicks < timing.periodTicks);
  assert.ok(timing.offsetTicks >= 0 && timing.offsetTicks < timing.periodTicks);
});

test('nearest lookup skips inactive and rejected candidates deterministically', () => {
  const reject = (candidate) => candidate.centerX < 0;
  const found = findNearestVaultCandidate(0, 0, SEED, 5000, reject);
  assert.ok(found);
  assert.ok(found.centerX >= 0);
  assert.equal(found.active, true);
  assert.deepEqual(found, findNearestVaultCandidate(0, 0, SEED, 5000, reject));
});

test('structure box intersection is bounded and exact', () => {
  const candidate = getVaultCandidateForCell(0, 0, SEED);
  assert.equal(resonantVaultTouchesBox(candidate, candidate.centerX - 4, candidate.centerZ - 4, candidate.centerX + 4, candidate.centerZ + 4), true);
  assert.equal(resonantVaultTouchesBox(candidate, candidate.centerX + 500, candidate.centerZ + 500, candidate.centerX + 520, candidate.centerZ + 520), false);
});
