import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveEncounterWaveSpawnPoints } from './resonantEncounterSpawn.ts';

const entry = [
  { x: 0, y: 1, z: 0 },
  { x: 10, y: 1, z: 0 },
];
const recovery = [
  { x: 2, y: 1, z: 2 },
  { x: 8, y: 1, z: 2 },
  { x: 8, y: 1, z: 8 },
  { x: 2, y: 1, z: 8 },
];

const resolveOpen = (kind, anchor) => ({ ...anchor });

test('the first wave spawns on recovery anchors only', () => {
  const seen = [];
  const points = resolveEncounterWaveSpawnPoints(
    ['vault_guard', 'vault_guard'],
    entry,
    recovery,
    0,
    (kind, anchor) => { seen.push(anchor); return { ...anchor }; },
  );
  assert.equal(points.filter(Boolean).length, 2);
  for (const anchor of seen) {
    assert.ok(recovery.some((cell) => cell.x === anchor.x && cell.z === anchor.z));
  }
});

test('a sealed doorway anchor falls back to recovery anchors instead of failing the wave', () => {
  const sealedEntry = new Set(entry.map((cell) => `${cell.x},${cell.z}`));
  const points = resolveEncounterWaveSpawnPoints(
    ['bell_hound', 'bell_hound'],
    entry,
    recovery,
    1,
    (kind, anchor) => (sealedEntry.has(`${anchor.x},${anchor.z}`) ? null : { ...anchor }),
  );
  assert.equal(points.filter(Boolean).length, 2);
  for (const point of points) {
    assert.ok(recovery.some((cell) => cell.x === point.x && cell.z === point.z));
  }
});

test('a kind that fits nowhere resolves null without blocking the rest of its wave', () => {
  const points = resolveEncounterWaveSpawnPoints(
    ['tollkeeper', 'vault_guard'],
    entry,
    recovery,
    1,
    (kind, anchor) => (kind === 'tollkeeper' ? null : { ...anchor }),
  );
  assert.equal(points[0], null);
  assert.notEqual(points[1], null);
});

test('enemies prefer unique points and only then share one', () => {
  const single = [{ x: 5, y: 1, z: 5 }];
  const points = resolveEncounterWaveSpawnPoints(
    ['bell_hound', 'bell_hound', 'bell_hound'],
    [],
    single,
    1,
    resolveOpen,
  );
  assert.equal(points.filter(Boolean).length, 3);
  const keys = new Set(points.map((point) => `${point.x},${point.z}`));
  assert.equal(keys.size, 1);
});

test('an empty anchor list resolves every slot to null', () => {
  const points = resolveEncounterWaveSpawnPoints(['vault_guard'], [], [], 2, resolveOpen);
  assert.deepEqual(points, [null]);
});

test('later waves try doorway entry anchors before recovery anchors', () => {
  const first = [];
  resolveEncounterWaveSpawnPoints(
    ['vault_guard'],
    entry,
    recovery,
    1,
    (kind, anchor) => { first.push(anchor); return { ...anchor }; },
  );
  assert.ok(entry.some((cell) => cell.x === first[0].x && cell.z === first[0].z));
});
