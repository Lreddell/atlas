import assert from 'node:assert/strict';
import test from 'node:test';

import { buildMemoryDemonstration, getMemoryEchoMarkers } from './resonantEchoSequence.ts';

const sequence = [2, 0, 3, 1];
const markers = [
  { x: 10, y: 25, z: 0 },
  { x: 0, y: 25, z: -10 },
  { x: -10, y: 25, z: 0 },
  { x: 0, y: 25, z: 10 },
];

test('first memory activation plays two complete visible passes at a readable cadence', () => {
  const steps = buildMemoryDemonstration(sequence, markers, true);
  assert.equal(steps.length, 8);
  assert.deepEqual(steps.map(({ symbol }) => symbol), [...sequence, ...sequence]);
  assert.deepEqual(steps.slice(0, 4).map(({ pass }) => pass), [1, 1, 1, 1]);
  assert.deepEqual(steps.slice(4).map(({ pass }) => pass), [2, 2, 2, 2]);
  assert.deepEqual(steps.slice(0, 4).map(({ sequenceIndex }) => sequenceIndex), [0, 1, 2, 3]);
  // The demonstration deliberately paces at just over a second per glyph so
  // each tone-and-light pair reads before the next begins.
  assert.ok(steps.every(({ durationMs }) => durationMs >= 900 && durationMs <= 1300));
  assert.ok(steps.every(({ marker }) => marker.y === 25));
});

test('memory markers sit on the strikeable dais pylons', () => {
  // Markers highlight the block the player actually sounds (the dais pylon at
  // floor level), not the lamp caps above it.
  assert.deepEqual(getMemoryEchoMarkers({ x: 50, y: 12, z: -20 }), [
    { x: 42, y: 13, z: -26 },
    { x: 58, y: 13, z: -26 },
    { x: 58, y: 13, z: -14 },
    { x: 42, y: 13, z: -14 },
  ]);
});

test('manual replay plays one pass and preserves exact symbol positions', () => {
  const steps = buildMemoryDemonstration(sequence, markers, false);
  assert.equal(steps.length, 4);
  assert.deepEqual(steps.map(({ marker }) => marker), sequence.map((symbol) => markers[symbol]));
});

test('invalid symbols and missing marker geometry fail explicitly', () => {
  assert.throws(() => buildMemoryDemonstration([4], markers, true), /marker/i);
  assert.throws(() => buildMemoryDemonstration(sequence, markers.slice(0, 3), false), /marker/i);
});
