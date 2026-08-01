import assert from 'node:assert/strict';
import test from 'node:test';

import { getVaultCandidateForCell, getVaultLayout } from './resonantVaults.ts';
import {
  getVaultPreSealRequiredRoomIds,
  getVaultRequiredRoomIds,
} from './resonantVaultProgression.ts';

const MANDATORY_KINDS = new Set([
  'guard_hall', 'resonance_foundry', 'memory_choir',
  'counterweight_gallery', 'acoustic_relay', 'broken_crossing', 'inner_works',
]);

test('every generated challenge is reachable before the single boss seal', () => {
  // Rooms rotate per vault: a fractured_archive in a major slot is optional
  // loot, so the required sets follow the placed kinds instead of fixed ids.
  for (let orientation = 0; orientation < 4; orientation += 1) {
    for (let seed = 100; seed < 132; seed += 1) {
      const candidate = { ...getVaultCandidateForCell(4, -7, seed), active: true, orientation };
      const layout = getVaultLayout(candidate, 96, () => 96);
      const kindOf = new Map(layout.rooms.map((room) => [room.id, room.kind]));
      const expectedAll = ['inner_works', 'major_0', 'major_1', 'major_2', 'major_3', 'major_4', 'major_5']
        .filter((id) => MANDATORY_KINDS.has(kindOf.get(id)));
      assert.deepEqual(getVaultPreSealRequiredRoomIds(layout).toSorted(), expectedAll.toSorted());
      assert.deepEqual(getVaultRequiredRoomIds(layout).toSorted(), expectedAll.toSorted());
      assert.equal(layout.rooms.filter(({ id }) => id.startsWith('annex_')).some(({ id }) => expectedAll.includes(id)), false);
      const seals = layout.doorways.filter(({ gate }) => gate === 'inner_seal');
      assert.equal(seals.length, 1);
      assert.deepEqual([seals[0].from, seals[0].to], ['hub', 'antechamber']);
    }
  }
});
