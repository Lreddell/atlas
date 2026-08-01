import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import path from 'node:path';
import test from 'node:test';
import { build } from 'esbuild';

const root = path.resolve(import.meta.dirname, '../../..');
const bundle = await build({
  entryPoints: [path.join(root, 'src/systems/entities/BellTitanArena.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  write: false,
});
const arenaModule = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const { BellTitanArena } = arenaModule;

test('slam rings expand once and damage a player only when crossing them', () => {
  const arena = new BellTitanArena();
  arena.spawnShockwave({ x: 0, y: 4, z: 0 }, {
    startRadius: 3,
    endRadius: 19,
    speed: 8,
    damage: 8,
  });
  assert.equal(arena.tick(0.5, { x: 10, y: 4, z: 0 }).playerDamage, 0);
  assert.equal(arena.tick(0.5, { x: 10, y: 4, z: 0 }).playerDamage, 8);
  assert.equal(arena.tick(0.5, { x: 10, y: 4, z: 0 }).playerDamage, 0);
});
test('rings stop at the authored arena boundary and never hit through a sealed wall', () => {
  const arena = new BellTitanArena({ centerX: 0, centerZ: 0, radius: 12 });
  arena.spawnShockwave({ x: 0, y: 4, z: 0 }, {
    startRadius: 2,
    endRadius: 20,
    speed: 10,
    damage: 8,
  });
  const outside = arena.tick(2, { x: 15, y: 4, z: 0 });
  assert.equal(outside.playerDamage, 0);
  assert.equal(outside.shockwaves.length, 0);

  arena.spawnShockwave({ x: 0, y: 4, z: 0 }, {
    startRadius: 2,
    endRadius: 11,
    speed: 10,
    damage: 8,
  });
  const occluded = arena.tick(0.8, { x: 9, y: 4, z: 0 }, () => false);
  assert.equal(occluded.playerDamage, 0);
});

test('travelling toll rings are jumpable instead of unavoidable floor damage', () => {
  const arena = new BellTitanArena();
  arena.spawnShockwave({ x: 0, y: 4, z: 0 }, {
    startRadius: 2,
    endRadius: 14,
    speed: 10,
    damage: 9,
  });
  assert.equal(arena.tick(0.7, { x: 9, y: 5.1, z: 0 }).playerDamage, 0);
});

test('marked impacts provide a full warning window before activating once', () => {
  const arena = new BellTitanArena({ centerX: 0, centerZ: 0, radius: 12 });
  arena.spawnImpact({ x: 20, y: 4, z: 0 }, {
    radius: 3,
    warningSeconds: 1,
    activeSeconds: 0.3,
    damage: 15,
  });
  const warning = arena.tick(0.9, { x: 8, y: 4, z: 0 });
  assert.equal(warning.playerDamage, 0);
  assert.equal(warning.impacts[0].phase, 'warning');
  assert.ok(warning.impacts[0].x <= 8.5, 'impact should be clamped inside the arena');
  assert.equal(arena.tick(0.12, { x: warning.impacts[0].x, y: 4, z: 0 }).playerDamage, 15);
  assert.equal(arena.tick(0.08, { x: warning.impacts[0].x, y: 4, z: 0 }).playerDamage, 0);
});

test('resonance lanes damage only their visible strip and can be jumped', () => {
  const arena = new BellTitanArena();
  arena.spawnLane({ x: 0, y: 4, z: 0 }, {
    yaw: 0,
    length: 20,
    halfWidth: 1,
    warningSeconds: 0.5,
    activeSeconds: 0.4,
    damage: 12,
  });
  assert.equal(arena.tick(0.51, { x: 0.5, y: 4, z: 5 }).playerDamage, 12);

  const safe = new BellTitanArena();
  safe.spawnLane({ x: 0, y: 4, z: 0 }, {
    yaw: 0,
    length: 20,
    halfWidth: 1,
    warningSeconds: 0.5,
    activeSeconds: 0.4,
    damage: 12,
  });
  assert.equal(safe.tick(0.51, { x: 3, y: 4, z: 5 }).playerDamage, 0);

  const jumped = new BellTitanArena();
  jumped.spawnLane({ x: 0, y: 4, z: 0 }, {
    yaw: 0,
    length: 20,
    halfWidth: 1,
    warningSeconds: 0.5,
    activeSeconds: 0.4,
    damage: 12,
  });
  assert.equal(jumped.tick(0.51, { x: 0, y: 5.1, z: 5 }).playerDamage, 0);
});

test('shell debris is deterministic, finite, and carries no collision edits', () => {
  const arena = new BellTitanArena();
  const first = arena.breakShell({ x: 2, y: 5, z: -3 }, 1);
  const second = new BellTitanArena().breakShell({ x: 2, y: 5, z: -3 }, 1);
  assert.deepEqual(first, second);
  assert.equal(first.length, 8);
  assert.ok(first.every((piece) => piece.ttl > 2.145 && piece.ttl <= 4));
  assert.ok(first.every((piece) => !('blockEdit' in piece)));
  arena.tick(2.2, { x: 99, y: 99, z: 99 });
  const settled = arena.getDebris();
  assert.equal(settled.length, 8);
  assert.ok(settled.every((piece) => piece.settled && piece.y === piece.floorY));
  arena.tick(2, { x: 99, y: 99, z: 99 });
  assert.equal(arena.getDebris().length, 0);
});
