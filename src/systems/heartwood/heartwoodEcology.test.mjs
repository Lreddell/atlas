// Stage 4: Heartwood ecology director tests. Population convergence per
// sub-biome, threat budget, despawn distance, spawn pacing, determinism.
import assert from 'node:assert/strict';
import test from 'node:test';

import { loadTsViaFile } from '../world/storage/bundleTs.mjs';

const eco = await loadTsViaFile(`
    export { ecologyStep, createEcologyState, ECOLOGY_THREAT_CAP } from './src/systems/heartwood/heartwoodEcology.ts';
    export { HEARTWOOD_HOSTILES, HEARTWOOD_PASSIVES } from './src/systems/heartwood/heartwoodEcology.ts';
`, 'heartwood-ecology');

function world() {
  return {
    hasChunk: () => true,
    groundY: () => 70,
    isNight: () => false,
  };
}

function entities() {
  const rows = [];
  let nextId = 1;
  return {
    rows,
    spawn: (kind, x, y, z) => {
      const id = nextId++;
      rows.push({ id, kind, hp: 20, x, y, z, boss: false });
      return id;
    },
    despawn: (id) => {
      const i = rows.findIndex((e) => e.id === id);
      if (i >= 0) rows.splice(i, 1);
    },
    list: () => rows,
  };
}

const step = (state, player, seed, w, e) => eco.ecologyStep(state, 2.0, player, seed, w, e);

test('meadow converges to deer/finch/furrowling mix', () => {
  const state = eco.createEcologyState();
  const w = world();
  const e = entities();
  const player = { x: 0, y: 70, z: 0 };
  for (let i = 0; i < 30; i++) step(state, player, 12345, w, e);
  const kinds = e.list().map((x) => x.kind);
  assert.ok(kinds.includes('field_deer'), 'deer present');
  assert.ok(kinds.includes('bellfinch'), 'finch present');
  assert.ok(kinds.filter((k) => k === 'furrowling').length <= 2, 'furrowlings capped');
});

test('briar country fields sentries and at most one bailiff', () => {
  const state = eco.createEcologyState();
  const w = world();
  const e = entities();
  // Keep anchor: briar disc around the keep for seed 12345.
  const player = { x: -495, y: 70, z: 767 };
  for (let i = 0; i < 40; i++) step(state, player, 12345, w, e);
  const kinds = e.list().map((x) => x.kind);
  assert.ok(kinds.includes('briar_sentry'), 'sentries present');
  assert.ok(kinds.filter((k) => k === 'mossback_bailiff').length <= 1, 'single elite');
});

test('threat budget is never exceeded', () => {
  const state = eco.createEcologyState();
  const w = world();
  const e = entities();
  const player = { x: -495, y: 70, z: 767 };
  for (let i = 0; i < 60; i++) step(state, player, 12345, w, e);
  let threat = 0;
  for (const x of e.list()) threat += x.kind === 'mossback_bailiff' ? 3 : eco.HEARTWOOD_HOSTILES.includes(x.kind) ? 1 : 0;
  assert.ok(threat <= eco.ECOLOGY_THREAT_CAP, `threat ${threat} within cap`);
});

test('far creatures despawn, spawns land on valid ground in ring', () => {
  const state = eco.createEcologyState();
  const w = world();
  const e = entities();
  e.spawn('furrowling', 500, 70, 500);
  step(state, { x: 0, y: 70, z: 0 }, 12345, w, e);
  assert.ok(!e.list().some((x) => x.x === 500), 'far creature despawned');
  for (const x of e.list()) {
    const d = Math.hypot(x.x, x.z);
    assert.ok(d >= 20 && d <= 60, `spawn ${x.kind} in ring (d=${d.toFixed(1)})`);
    assert.equal(x.y, 71);
  }
});

test('no spawns without chunks or ground, one per step', () => {
  const state = eco.createEcologyState();
  const w = world();
  w.hasChunk = () => false;
  const e = entities();
  for (let i = 0; i < 10; i++) step(state, { x: 0, y: 70, z: 0 }, 12345, w, e);
  assert.equal(e.list().length, 0, 'nothing spawns into unloaded void');
  const w2 = world();
  const e2 = entities();
  step(state, { x: 0, y: 70, z: 0 }, 12345, w2, e2);
  assert.ok(e2.list().length <= 1, 'at most one spawn per step');
});

test('director is deterministic per seed', () => {
  const run = (seed) => {
    const state = eco.createEcologyState();
    const e = entities();
    for (let i = 0; i < 15; i++) step(state, { x: 0, y: 70, z: 0 }, seed, world(), e);
    return e.list().map((x) => `${x.kind}@${Math.round(x.x)},${Math.round(x.z)}`).sort().join('|');
  };
  assert.equal(run(4242), run(4242));
});
