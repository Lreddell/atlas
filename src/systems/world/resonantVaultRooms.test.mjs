import assert from 'node:assert/strict';
import test from 'node:test';

import { getVaultCandidateForCell, getVaultRoomBounds, rotateVaultOffset } from './resonantVaults.ts';
import {
  getMeaningfulVaultRoomCount,
  placeVaultRooms,
  selectVaultModules,
} from './resonantVaultRooms.ts';

const combatKinds = new Set(['guard_hall', 'resonance_foundry']);
const puzzleKinds = new Set([
  'memory_choir',
  'counterweight_gallery',
  'acoustic_relay',
  'broken_crossing',
]);

test('every seed selects six constrained majors and two or three annexes deterministically', () => {
  for (let index = 0; index < 256; index += 1) {
    const candidate = {
      ...getVaultCandidateForCell(index - 128, 17 - index, 91357),
      active: true,
    };
    const first = selectVaultModules(candidate);
    const second = selectVaultModules(candidate);

    assert.deepEqual(first, second);
    assert.equal(first.majors.length, 6);
    assert.ok(first.annexes.length === 2 || first.annexes.length === 3);
    assert.equal(combatKinds.has(first.majors[0].kind), true);
    assert.equal(combatKinds.has(first.majors[1].kind), true);
    assert.equal(first.majors.find(({ id }) => id === 'major_4')?.kind, 'broken_crossing');
    assert.ok(first.majors.filter(({ kind }) => puzzleKinds.has(kind)).length >= 2);
    assert.equal(new Set(first.majors.map(({ kind }) => kind)).size, first.majors.length);
    assert.equal(first.annexes.filter(({ kind }) => kind === 'bell_crypt').length, 1);
  }
});

test('room placement creates two side circuits around a centered boss axis', () => {
  for (let orientation = 0; orientation < 4; orientation += 1) {
    const candidate = {
      ...getVaultCandidateForCell(5, -7, 91357),
      active: true,
      orientation,
    };
    const placed = placeVaultRooms(candidate, 104, (x) => x < candidate.centerX ? 88 : 116);
    const ids = new Set(placed.rooms.map(({ id }) => id));

    for (const id of [
      'spire', 'entrance', 'processional', 'tuning', 'hub',
      'major_0', 'major_1', 'major_2', 'major_3', 'major_4', 'major_5',
      'inner_works', 'antechamber', 'arena', 'core',
      'grand_ascent', 'fracture_stair', 'outlet_grand', 'outlet_fracture',
    ]) {
      assert.equal(ids.has(id), true, `missing ${id} at orientation ${orientation}`);
    }

    assert.ok(ids.has('annex_0') && ids.has('annex_1'));
    assert.notDeepEqual(placed.surfaceOutlets.grand, placed.surfaceOutlets.fracture);
    assert.ok(placed.rooms.length >= 21 && placed.rooms.length <= 22);
    assert.ok(getMeaningfulVaultRoomCount(placed.rooms) >= 12);
    assert.ok(getMeaningfulVaultRoomCount(placed.rooms) <= 16);

    for (const room of placed.rooms.filter(({ id }) => id.startsWith('major_') || id === 'inner_works')) {
      const local = rotateVaultOffset(room.x - candidate.centerX, room.z - candidate.centerZ, (4 - orientation) & 3);
      assert.ok(Math.abs(local.x) >= 40, `${room.id} occupies the central boss axis`);
    }
    for (const id of ['hub', 'antechamber', 'arena', 'core']) {
      const room = placed.rooms.find((entry) => entry.id === id);
      const local = rotateVaultOffset(room.x - candidate.centerX, room.z - candidate.centerZ, (4 - orientation) & 3);
      assert.equal(Math.abs(local.x), 0, `${id} is not centered`);
    }

    const underground = placed.rooms.filter(({ kind }) => kind !== 'spire');
    for (let left = 0; left < underground.length; left += 1) {
      const a = getVaultRoomBounds(underground[left]);
      for (let right = left + 1; right < underground.length; right += 1) {
        const b = getVaultRoomBounds(underground[right]);
        const overlaps = !(a.maxX < b.minX || b.maxX < a.minX
          || a.maxY < b.minY || b.maxY < a.minY
          || a.maxZ < b.minZ || b.maxZ < a.minZ);
        assert.equal(overlaps, false, `${underground[left].id} overlaps ${underground[right].id}`);
      }
    }

    const edges = new Set(placed.edges.map(([from, to]) => `${from}>${to}`));
    for (const edge of [
      'entrance>processional', 'processional>tuning', 'tuning>hub',
      'hub>major_0', 'major_0>major_1', 'major_1>major_4',
      'major_4>inner_works', 'inner_works>hub',
      'hub>major_2', 'major_2>major_3', 'major_3>major_5', 'major_5>hub',
      'hub>antechamber', 'antechamber>arena', 'arena>core',
      'core>grand_ascent', 'core>fracture_stair',
      'grand_ascent>outlet_grand', 'fracture_stair>outlet_fracture',
    ]) {
      assert.equal(edges.has(edge), true, `missing ${edge} at orientation ${orientation}`);
    }

    const annexCount = placed.rooms.filter(({ id }) => id.startsWith('annex_')).length;
    assert.equal(edges.has('major_1>annex_0'), true);
    assert.equal(edges.has('major_3>annex_1'), true);
    assert.equal(edges.has('major_5>annex_2'), annexCount === 3);
  }
});
