import assert from 'node:assert/strict';
import test from 'node:test';

import { findNearestVaultCandidate, getVaultCandidateForCell, getVaultLayout } from './resonantVaults.ts';
import {
  getVaultFootprintChunks,
  getVaultLayoutSignature,
  getVaultReservedBoxes,
  validatePaintedVault,
  validateVaultLayout,
} from './resonantVaultConnectivity.ts';
import { loadVaultGenerationModule, makeSparseVaultFixture } from './resonantVaultGeometry.testSupport.mjs';
import { preflightVaultCandidate } from './resonantVaultPreflight.ts';

test('hundreds of definitive layouts have no room overlap and every graph endpoint exists', () => {
  for (let seedIndex = 0; seedIndex < 256; seedIndex += 1) {
    for (let orientation = 0; orientation < 4; orientation += 1) {
      const candidate = {
        ...getVaultCandidateForCell(seedIndex - 128, 31 - seedIndex, 60013 + seedIndex),
        active: true,
        orientation,
      };
      const layout = getVaultLayout(
        candidate,
        98,
        (x, z) => 82 + (Math.abs(x * 3 + z * 5) % 37),
      );
      assert.deepEqual(validateVaultLayout(layout), { valid: true, errors: [] });

      const reservations = getVaultReservedBoxes(layout);
      assert.equal(reservations.length, layout.rooms.length + layout.edges.length + 4);
      assert.equal(new Set(reservations.map(({ owner }) => owner)).size, reservations.length);
      for (const route of ['grand', 'fracture']) {
        const outlet = layout.surfaceOutlets[route];
        const protectedOutlet = reservations.find(({ owner }) => owner === `outlet:${route}`);
        assert.ok(protectedOutlet, `missing protected ${route} outlet`);
        assert.ok(protectedOutlet.minX <= outlet.x && protectedOutlet.maxX >= outlet.x);
        assert.ok(protectedOutlet.minZ <= outlet.z && protectedOutlet.maxZ >= outlet.z);
        assert.ok(protectedOutlet.minY <= outlet.surfaceY - 5);
        assert.ok(protectedOutlet.maxY >= outlet.surfaceY + 5);
      }
      const footprint = getVaultFootprintChunks(layout);
      assert.ok(footprint.length > 100);
      assert.equal(new Set(footprint.map(({ cx, cz }) => `${cx},${cz}`)).size, footprint.length);
      assert.equal(getVaultLayoutSignature(layout), getVaultLayoutSignature(getVaultLayout(
        candidate,
        98,
        (x, z) => 82 + (Math.abs(x * 3 + z * 5) % 37),
      )));
    }
  }
});

test('painted voxels connect entrance, mandatory rooms, boss, both exits, and surface thresholds', async () => {
  const fixture = await makeSparseVaultFixture({
    seed: 77123,
    orientation: 3,
    centerSurfaceY: 104,
    grandSurfaceY: 87,
    fractureSurfaceY: 119,
  });
  const result = validatePaintedVault(fixture.layout, fixture.reader);

  assert.equal(result.valid, true, result.errors.join('\n'));
  for (const room of fixture.layout.rooms) {
    if (room.kind !== 'spire') assert.equal(result.reachedRoomIds.has(room.id), true, `unreached ${room.id}`);
  }
  assert.equal(result.reachedRoomIds.has('arena'), true);
  assert.equal(result.reachedRoomIds.has('outlet_grand'), true);
  assert.equal(result.reachedRoomIds.has('outlet_fracture'), true);
});

test('preflight accepts atomically and rejects any persisted footprint conflict', async () => {
  const candidate = { ...getVaultCandidateForCell(4, -9, 1123), active: true };
  const layout = getVaultLayout(candidate, 103, () => 103);
  let meta = {
    id: 'fixture-world', name: 'Fixture', seed: '1123', seedNum: 1123,
    created: 1, lastPlayed: 1, gameMode: 'survival', time: 1000,
  };
  let writes = 0;
  const makeContext = (persisted) => ({
    worldId: meta.id,
    candidate,
    layout,
    hasMemoryChunk: () => false,
    hasAnyPersistedChunk: async () => persisted,
    readMeta: async () => meta,
    writeMeta: async (next) => { meta = next; writes += 1; },
  });

  const accepted = await preflightVaultCandidate(makeContext(false));
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.reason, 'new-reservation');
  assert.equal(writes, 1);
  const repeated = await preflightVaultCandidate(makeContext(true));
  assert.equal(repeated.accepted, true);
  assert.equal(repeated.reason, 'existing-reservation');
  assert.equal(writes, 1);

  meta = { ...meta, resonantVaultReservations: undefined };
  const rejected = await preflightVaultCandidate(makeContext(true));
  assert.deepEqual(rejected, { accepted: false, reason: 'persisted-footprint-conflict' });
  assert.equal(writes, 1);
});

test('a session-rejected candidate is not stamped by chunk generation', async () => {
  const seed = 77123;
  const candidate = findNearestVaultCandidate(4000, -4000, seed);
  assert.ok(candidate);
  const cx = Math.floor(candidate.centerX / 16);
  const cz = Math.floor(candidate.centerZ / 16);
  const makeChunk = () => ({
    blocks: new Uint8Array(16 * 384 * 16),
    light: new Uint8Array(16 * 384 * 16),
    meta: new Uint8Array(16 * 384 * 16),
  });
  const { applyResonantVaultsToChunk } = await loadVaultGenerationModule();
  const rejected = makeChunk();
  applyResonantVaultsToChunk(cx, cz, rejected, {
    seed,
    getSurfaceY: () => 100,
    getSurfaceBiomeId: () => 'plains',
    isCandidateAllowed: () => false,
  });
  assert.equal(rejected.blocks.some((value) => value !== 0), false);

  const accepted = makeChunk();
  applyResonantVaultsToChunk(cx, cz, accepted, {
    seed,
    getSurfaceY: () => 100,
    getSurfaceBiomeId: () => 'plains',
    isCandidateAllowed: () => true,
  });
  assert.equal(accepted.blocks.some((value) => value !== 0), true);
});
