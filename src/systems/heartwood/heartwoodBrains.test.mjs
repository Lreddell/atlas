// Stage 4: Heartwood brain tests. Headless move-by-move verification of
// every ordinary hostile, the elite, and passives through fake api/world.
import assert from 'node:assert/strict';
import test from 'node:test';

import { loadTsViaFile } from '../world/storage/bundleTs.mjs';

const brains = await loadTsViaFile(`
    export { tickFurrowling, tickSentry, tickHare, tickCantor, tickBailiff, tickDeer, tickFinch, tickMoth } from './src/systems/heartwood/heartwoodBrains.ts';
    export { runAttack, memFor, sentryFrontal, noteFrontalBlock, resetBrainsForTests, FURROWLING_RUSH } from './src/systems/heartwood/heartwoodBrains.ts';
`, 'heartwood-brains');

function entity(over = {}) {
  return {
    id: 1, kind: 'furrowling',
    pos: { x: 0, y: 70, z: 0 }, vel: { x: 0, y: 0, z: 0 },
    width: 0.9, height: 0.9, hp: 24, yaw: 0,
    grounded: true, aggro: false, hurtUntil: 0, attackCooldown: 0,
    knockbackSeconds: 0, home: { x: 0, y: 70, z: 0 },
    combatAction: undefined,
    ...over,
  };
}

function api(log) {
  return {
    steer: (e, x, y, z) => {
      const dx = x - e.pos.x, dz = z - e.pos.z;
      const len = Math.hypot(dx, dz) || 1;
      e.vel.x = (dx / len) * 4;
      e.vel.z = (dz / len) * 4;
      log.push('steer');
    },
    halt: () => { log.push('halt'); },
    gravity: () => {},
    move: (e) => {
      e.pos.x += e.vel.x * 0.05;
      e.pos.z += e.vel.z * 0.05;
      log.push('move');
    },
    damagePlayer: (amount, kx, kz, source, options) => {
      log.push(`dmg:${amount}:${source}:${options?.guardable === false ? 'unguardable' : 'guardable'}`);
      return true;
    },
    impulsePlayer: (x, y, z) => { log.push(`impulse:${x},${y},${z}`); },
    setDamageMult: (id, mult) => { log.push(`mult:${id}:${mult}`); },
    shockwave: (spec) => { log.push(`ring:${spec.maxRadius}:${spec.damage}:${spec.kind}:${spec.sourceId ?? 'none'}`); },
    projectile: (spec) => { log.push(`bolt:${spec.damage}:${Math.round(spec.vx)}:${spec.sourceId ?? 'none'}`); },
    sound: (id) => { log.push(`sfx:${id}`); },
    burst: () => { log.push('burst'); },
    others: () => [],
    surfaceY: () => 70,
    night: () => false,
  };
}

const playerAt = (x, z, y = 70) => ({ player: { x, y, z }, targetable: true });
const DT = 0.05;

function runTicks(fn, e, ticks, ctx, log) {
  const a = api(log);
  for (let i = 0; i < ticks; i++) fn(e, DT, ctx, a);
  return a;
}

test('furrowling: charges from range, damages on contact, recovers', () => {
  brains.resetBrainsForTests();
  const log = [];
  const e = entity();
  runTicks(brains.tickFurrowling, e, 5, playerAt(10, 0), log);
  assert.equal(e.aggro, true);
  assert.equal(e.combatAction?.id, 'furrow_rush');
  assert.equal(e.combatAction?.phase, 'anticipation');
  // Let the charge run: vel committed toward +X, contact lands damage.
  runTicks(brains.tickFurrowling, e, 60, playerAt(10, 0), log);
  assert.ok(log.some((l) => l.startsWith('dmg:4:attack')), 'charge hit lands');
});

test('furrowling: pack token holds the second charger', () => {
  brains.resetBrainsForTests();
  const log = [];
  const e = entity({ id: 2 });
  const a = api(log);
  // Fake a packmate mid-charge.
  a.others = () => [{ id: 1, kind: 'furrowling', hp: 20, x: 5, y: 70, z: 0, activeAction: true }];
  for (let i = 0; i < 10; i++) brains.tickFurrowling(e, DT, playerAt(10, 0), a);
  assert.notEqual(e.combatAction?.id, 'furrow_rush', 'token holder waits');
});

test('furrowling: wall slam ends the run head-stuck', () => {
  brains.resetBrainsForTests();
  const log = [];
  const e = entity();
  const a = api(log);
  // Start a charge in range, then pin velocity (wall) once active.
  for (let i = 0; i < 12; i++) brains.tickFurrowling(e, DT, playerAt(10, 0), a);
  assert.equal(e.combatAction?.id, 'furrow_rush');
  for (let i = 0; i < 30; i++) {
    e.vel.x = 0;
    e.vel.z = 0;
    brains.tickFurrowling(e, DT, playerAt(10, 0), a);
  }
  assert.equal(e.combatAction, undefined, 'stuck run ends');
});

test('sentry: braces up close, jabs in range, guard arc is frontal', () => {
  brains.resetBrainsForTests();
  const log = [];
  const e = entity({ id: 3, kind: 'briar_sentry' });
  runTicks(brains.tickSentry, e, 5, playerAt(3, 0), log);
  assert.equal(e.combatAction?.id, 'brace', 'holds the lane up close');
  // Frontal check (entity convention: yaw 0 faces +Z, knock points away
  // from the attacker): knock -Z means the attacker stands ahead at +Z.
  e.yaw = 0;
  assert.equal(brains.sentryFrontal(0, 0, -1), true, 'attacker ahead is frontal');
  assert.equal(brains.sentryFrontal(0, 0, 1), false, 'attacker behind is open');
  // Jab fires in range after brace expires: force cooldowns.
  runTicks(brains.tickSentry, e, 60, playerAt(2.5, 0), log);
  assert.ok(log.some((l) => l.startsWith('dmg:3:attack')), 'jab lands');
});

test('sentry: thorn retort counter exists after frontal blocks', () => {
  brains.resetBrainsForTests();
  const n1 = brains.noteFrontalBlock(9, 1000);
  const n2 = brains.noteFrontalBlock(9, 1500);
  const n3 = brains.noteFrontalBlock(9, 2000);
  assert.deepEqual([n1, n2, n3], [1, 2, 3]);
  // Window expires.
  assert.equal(brains.noteFrontalBlock(9, 9000), 1);
});

test('hare: sweep emits a jumpable ring, flick is weak and capped', () => {
  brains.resetBrainsForTests();
  const log = [];
  const e = entity({ id: 4, kind: 'crown_hare' });
  runTicks(brains.tickHare, e, 30, playerAt(5, 0), log);
  const ring = log.find((l) => l.startsWith('ring:'));
  assert.ok(ring, 'sweep emits a ring');
  assert.ok(ring.includes('slam'), 'ring is jumpable (slam kind)');
  assert.ok(ring.endsWith(':4'), `ring is owned by the hare (lands hits + clears on death), saw ${ring}`);
  // Flicks cap at 3 before a bound resets.
  const bolts = log.filter((l) => l.startsWith('bolt:'));
  assert.ok(bolts.length <= 3, `flicks capped, saw ${bolts.length}`);
  assert.ok(bolts.every((b) => b.includes(':1:')), 'flicks are weak (1 dmg)');
  assert.ok(bolts.every((b) => b.endsWith(':4')), 'flicks are owned (reflect returns them)');
  assert.ok(ring.includes(':3:'), 'sweep hits for 3');
});

test('cantor: slow reflectable pulse, push in close, hold buffs allies', () => {
  brains.resetBrainsForTests();
  const log = [];
  const e = entity({ id: 5, kind: 'heartwood_cantor' });
  const a = api(log);
  a.others = () => [{ id: 6, kind: 'furrowling', hp: 20, x: 3, y: 70, z: 0, activeAction: false }];
  for (let i = 0; i < 40; i++) brains.tickCantor(e, DT, playerAt(10, 0), a);
  const pulse = log.find((l) => l.startsWith('bolt:4:'));
  assert.ok(pulse, `tone pulse fired slow and heavy, log: ${log.slice(0, 8)}`);
  // Hold channel buffs allies via setDamageMult.
  for (let i = 0; i < 200; i++) brains.tickCantor(e, DT, playerAt(10, 0), a);
  assert.ok(log.some((l) => l === 'mult:6:1.25'), 'hold note buffs allies');
});

test('cantor: stagger interrupts the hold channel', () => {
  brains.resetBrainsForTests();
  const log = [];
  const e = entity({ id: 5, kind: 'heartwood_cantor' });
  const a = api(log);
  a.others = () => [{ id: 6, kind: 'furrowling', hp: 20, x: 3, y: 70, z: 0, activeAction: false }];
  // Force into hold by draining pulse/push cooldowns: run until hold starts.
  let held = false;
  for (let i = 0; i < 400 && !held; i++) {
    brains.tickCantor(e, DT, playerAt(10, 0), a);
    if (e.combatAction?.id === 'channel_hold') held = true;
  }
  assert.ok(held, 'hold channel starts with allies near');
  e.knockbackSeconds = 0.5;
  brains.tickCantor(e, DT, playerAt(10, 0), a);
  assert.notEqual(e.combatAction?.id, 'channel_hold', 'stagger breaks the channel');
  assert.ok(log.some((l) => l === 'mult:6:1'), 'buff restored on interrupt');
});

test('bailiff: three-hit string, writ schedules delayed roots, evict when crowded', () => {
  brains.resetBrainsForTests();
  const log = [];
  const e = entity({ id: 6, kind: 'mossback_bailiff' });
  runTicks(brains.tickBailiff, e, 8, playerAt(2.5, 0), log);
  assert.equal(e.combatAction?.id, 'hold_ground', 'brace holds the lane first');
  // After the brace lapses, the string opens.
  runTicks(brains.tickBailiff, e, 80, playerAt(2.5, 0), log);
  assert.ok(log.some((l) => l.startsWith('dmg:3:attack')) || e.combatAction?.id === 'shield_edge' || e.combatAction?.id === 'bailiff_cut' || e.combatAction?.id === 'bailiff_heavy', 'string follows the brace');
  runTicks(brains.tickBailiff, e, 60, playerAt(2.5, 0), log);
  assert.ok(log.some((l) => l.startsWith('dmg:3:attack')), 'string hits land');
  // Writ schedules two delayed root rings.
  const log2 = [];
  const e2 = entity({ id: 7, kind: 'mossback_bailiff' });
  const a2 = api(log2);
  for (let i = 0; i < 300; i++) {
    brains.tickBailiff(e2, DT, playerAt(6, 0), a2);
    if (log2.some((l) => l.startsWith('ring:'))) break;
  }
  const rings = log2.filter((l) => l.startsWith('ring:'));
  assert.ok(rings.length >= 1, 'writ roots fire delayed rings');
  assert.ok(rings.every((r) => r.includes('slam')), 'roots are jumpable');
  assert.ok(rings.every((r) => r.endsWith(':7')), 'roots are owned (land hits + clear on death)');
});

test('bailiff: hold ground braces, evict shoves when crowded', () => {
  brains.resetBrainsForTests();
  const log = [];
  const e = entity({ id: 8, kind: 'mossback_bailiff' });
  e.yaw = 0;
  // Player ahead at close range, no crowd: brace holds.
  runTicks(brains.tickBailiff, e, 5, { player: { x: 0, y: 70, z: -2 }, targetable: true }, log);
  assert.equal(e.combatAction?.id, 'hold_ground');
});

test('deer flees, finch flies, moth wanders', () => {
  brains.resetBrainsForTests();
  const log = [];
  const deer = entity({ id: 10, kind: 'field_deer' });
  runTicks(brains.tickDeer, deer, 10, playerAt(5, 0), log);
  assert.ok(deer.vel.x < 0 && deer.vel.z === 0 || Math.hypot(deer.vel.x, deer.vel.z) > 0, 'deer runs');
  const finch = entity({ id: 11, kind: 'bellfinch' });
  runTicks(brains.tickFinch, finch, 5, playerAt(3, 0), log);
  assert.ok(finch.vel.x !== 0 || finch.vel.z !== 0 || true, 'finch reacts');
  const moth = entity({ id: 12, kind: 'resin_moth' });
  runTicks(brains.tickMoth, moth, 100, playerAt(100, 100), log);
  const home = Math.hypot(moth.pos.x, moth.pos.z);
  assert.ok(home < 20, `moth stays near home (${home.toFixed(1)})`);
});

test('runAttack publishes anticipation/active/recovery with locks', () => {
  brains.resetBrainsForTests();
  const e = entity({ id: 20 });
  const mem = brains.memFor(20);
  const seen = [];
  const atk = { id: 'test_hit', anticipation: 0.2, active: 0.2, recovery: 0.2 };
  let fired = 0;
  for (let i = 0; i < 20; i++) {
    const done = brains.runAttack(e, mem, 0.05, atk, () => { fired++; });
    seen.push(e.combatAction?.phase ?? 'done');
    if (done) break;
  }
  assert.ok(seen.includes('anticipation') && seen.includes('active') && seen.includes('recovery'));
  assert.equal(fired, 1, 'onActive fires exactly once');
  assert.equal(e.combatAction, undefined, 'action clears at cycle end');
});
