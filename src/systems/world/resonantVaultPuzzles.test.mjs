import assert from 'node:assert/strict';
import test from 'node:test';

import {
  advanceTraversalCheckpoint,
  buildVaultPuzzleDescriptor,
  getCrossingStairRotation,
  getCrossingPitDescriptor,
  getPuzzleResponseIndex,
  isCrossingFinishReached,
  isInsideCrossingRecoveryVolume,
} from './resonantVaultPuzzles.ts';

test('crossing checkpoints preserve recovery progress without gating a valid finish', () => {
  let state = { nextIndex: 0, completed: false, lastSafeCheckpoint: 'start' };
  state = advanceTraversalCheckpoint(state, 'crossing_0');
  assert.equal(state.nextIndex, 1);
  state = advanceTraversalCheckpoint(state, 'crossing_3');
  assert.equal(state.nextIndex, 1, 'skipping ahead must not complete the room');
  for (const id of ['crossing_1', 'crossing_2', 'crossing_3']) state = advanceTraversalCheckpoint(state, id);
  assert.equal(state.completed, true);
  assert.equal(state.lastSafeCheckpoint, 'crossing_3');

  const descriptor = buildVaultPuzzleDescriptor({ id: 'major_4', kind: 'broken_crossing', x: 0, y: 10, z: 0, width: 39, height: 25, depth: 35, variant: 0 });
  assert.equal(isCrossingFinishReached(descriptor, descriptor.completion), true);
});

test('every selected puzzle has visible cause, response, fallback, and recovery anchors', () => {
  for (const kind of ['memory_choir', 'counterweight_gallery', 'acoustic_relay', 'broken_crossing']) {
    const descriptor = buildVaultPuzzleDescriptor({ id: 'test', kind, x: 0, y: 20, z: 0, width: 37, height: 17, depth: 31, variant: 2 });
    assert.ok(descriptor.activation);
    assert.ok(Array.isArray(descriptor.mechanismControls));
    assert.ok(descriptor.responseCells.length > 0);
    assert.ok(descriptor.fallbackControl);
    assert.ok(descriptor.recoveryAnchors.length > 0);
    assert.ok(descriptor.responseCells.every(({ x, y, z }) => Number.isInteger(x) && Number.isInteger(y) && Number.isInteger(z)));
  }
});

test('counterweights expose three purposeful controls and raise a separate traversal bank', () => {
  const descriptor = buildVaultPuzzleDescriptor({ id: 'counterweights', kind: 'counterweight_gallery', x: 0, y: 20, z: 0, width: 37, height: 17, depth: 31, variant: 2 });
  assert.equal(descriptor.mechanismControls.length, 3);
  assert.equal(new Set(descriptor.mechanismControls.map(({ x, y, z }) => `${x},${y},${z}`)).size, 3);
  assert.ok(descriptor.responseCells.length > descriptor.mechanismControls.length * 10);
  assert.equal(descriptor.responseCells.some((cell) => descriptor.mechanismControls.some((control) => (
    cell.x === control.x && cell.y === control.y && cell.z === control.z
  ))), false);
});

test('relay receivers and crossing checkpoints have stable coordinate-derived indices', () => {
  for (const kind of ['acoustic_relay', 'broken_crossing']) {
    const descriptor = buildVaultPuzzleDescriptor({ id: 'test', kind, x: 15, y: 8, z: -24, width: 31, height: 21, depth: 37, variant: 1 });
    descriptor.responseCells.forEach((cell, index) => {
      assert.equal(getPuzzleResponseIndex(descriptor, cell), index);
    });
    assert.equal(getPuzzleResponseIndex(descriptor, { x: 999, y: 999, z: 999 }), -1);
  }
});

test('the acoustic relay is a six-stage zig-zag course with a distinct starting striker', () => {
  const descriptor = buildVaultPuzzleDescriptor({ id: 'relay', kind: 'acoustic_relay', x: 0, y: 20, z: 0, width: 39, height: 17, depth: 31, variant: 2 });
  assert.equal(descriptor.responseCells.length, 6);
  assert.equal(descriptor.responseCells.some((cell) => cell.x === descriptor.activation.x
    && cell.y === descriptor.activation.y && cell.z === descriptor.activation.z), false);
  const crossValues = descriptor.alongX
    ? descriptor.responseCells.map(({ z }) => z)
    : descriptor.responseCells.map(({ x }) => x);
  assert.ok(new Set(crossValues).size >= 5, 'relay receivers must demand movement instead of four hits in a line');
  for (let index = 1; index < crossValues.length; index += 1) {
    assert.notEqual(Math.sign(crossValues[index]), Math.sign(crossValues[index - 1]));
  }
});

test('broken crossing exposes only ordered islands between distinct start and finish controls', () => {
  const descriptor = buildVaultPuzzleDescriptor({ id: 'major_4', kind: 'broken_crossing', x: 0, y: 10, z: 0, width: 39, height: 25, depth: 35, variant: 0 });
  assert.equal(descriptor.responseCells.length, 4);
  assert.equal(descriptor.recoveryAnchors.length, 5);
  assert.notDeepEqual(descriptor.activation, descriptor.completion);
  assert.notDeepEqual(descriptor.fallbackControl, descriptor.completion);
  assert.deepEqual(descriptor.recoveryAnchors.map(({ id }) => id), ['start', 'crossing_0', 'crossing_1', 'crossing_2', 'crossing_3']);
});

test('a crossing fall enters a sealed judgment pit with a complete latent return stair', () => {
  const room = { id: 'major_4', kind: 'broken_crossing', x: 0, y: 10, z: 0, width: 39, height: 25, depth: 35, variant: 0 };
  const pit = getCrossingPitDescriptor(room);
  assert.equal(pit.floorY, room.y - 8);
  assert.equal(pit.stairCells.length, 21);
  assert.equal(Math.min(...pit.stairCells.map(({ y }) => y)), pit.floorY + 1);
  assert.equal(Math.max(...pit.stairCells.map(({ y }) => y)), room.y - 1);
  assert.equal('gateCells' in pit, false, 'the judgment pit must not define a decorative Vault door');
  assert.ok(pit.landingCells.length >= 10);
  assert.ok(pit.stairCells.every((cell) => cell.y > pit.floorY), 'the return stair may not punch holes through the pit floor');
  assert.ok(pit.spawnAnchors.length >= 4);
  assert.ok(pit.stairCells.every(({ x, z }) => x > pit.bounds.minX && x < pit.bounds.maxX
    && z > pit.bounds.minZ && z < pit.bounds.maxZ));
  assert.equal(isInsideCrossingRecoveryVolume(room, { x: 0, y: 5, z: 0 }), true);
  assert.equal(isInsideCrossingRecoveryVolume(room, { x: 40, y: 5, z: 0 }), false);
  assert.equal(getCrossingStairRotation(room), 0);
});
