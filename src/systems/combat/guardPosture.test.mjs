// Heartwood combat layer tests: guard/parry/heavy-guard resolution,
// entity posture with break resistance, and signature art windows.
// Pure sim (guardPosture.ts) — no engine imports, runs anywhere.
import assert from 'node:assert/strict';
import test from 'node:test';

import { loadTsViaFile } from '../world/storage/bundleTs.mjs';

const gp = await loadTsViaFile(`
    export { resolveGuardHit, resolveIncomingHit, addPosture, getPostureBreaks, clearPosture } from './src/systems/combat/guardPosture.ts';
    export { noteDodge, noteParry, consumeArtWindows, peekArtWindows, consumeEcho, peekEcho } from './src/systems/combat/guardPosture.ts';
    export { getGuardView, setBucklerEquipped } from './src/systems/combat/guardPosture.ts';
    export { resetGuardForTests, resetPostureForTests, resetArtsForTests } from './src/systems/combat/guardPosture.ts';
    export { PERFECT_PARRY_WINDOW_MS, BUCKLER_PARRY_WINDOW_MS, GUARD_REDUCTION, HEAVY_GUARD_REDUCTION, POSTURE_CAP, ECHO_STORE_CAP } from './src/systems/combat/guardPosture.ts';
`, 'guard-posture');

const base = (over = {}) => ({
  nowMs: 10000,
  guardActive: true,
  guardStartedAtMs: 9000,
  heavyGuard: false,
  frontal: true,
  guardable: true,
  damage: 6,
  bucklerEquipped: false,
  stability: 100,
  brokenUntilMs: 0,
  ...over,
});

test('no guard, wrong arc, or unguardable hit lands full', () => {
  assert.equal(gp.resolveGuardHit(base({ guardActive: false })).outcome, 'full');
  assert.equal(gp.resolveGuardHit(base({ frontal: false })).outcome, 'full');
  assert.equal(gp.resolveGuardHit(base({ guardable: false })).outcome, 'full');
  const r = gp.resolveGuardHit(base({ guardActive: false }));
  assert.equal(r.damageTaken, 6);
});

test('perfect parry inside the window negates everything', () => {
  const r = gp.resolveGuardHit(base({ guardStartedAtMs: 9900 }));
  assert.equal(r.outcome, 'parry');
  assert.equal(r.damageTaken, 0);
  assert.equal(r.stabilityCost, 0);
  // Boundary: exactly at the window edge still parries.
  const edge = gp.resolveGuardHit(base({ guardStartedAtMs: 10000 - gp.PERFECT_PARRY_WINDOW_MS }));
  assert.equal(edge.outcome, 'parry');
  const late = gp.resolveGuardHit(base({ guardStartedAtMs: 10000 - gp.PERFECT_PARRY_WINDOW_MS - 1 }));
  assert.equal(late.outcome, 'guarded');
});

test('buckler widens the parry window', () => {
  const t = 10000 - gp.PERFECT_PARRY_WINDOW_MS - 50;
  assert.equal(gp.resolveGuardHit(base({ guardStartedAtMs: t })).outcome, 'guarded');
  assert.equal(gp.resolveGuardHit(base({ guardStartedAtMs: t, bucklerEquipped: true })).outcome, 'parry');
  assert.ok(gp.BUCKLER_PARRY_WINDOW_MS > gp.PERFECT_PARRY_WINDOW_MS);
});

test('guarded hits reduce damage and cost stability', () => {
  const r = gp.resolveGuardHit(base({}));
  assert.equal(r.outcome, 'guarded');
  assert.ok(Math.abs(r.damageTaken - 6 * (1 - gp.GUARD_REDUCTION)) < 1e-9);
  assert.ok(r.stabilityCost > 0);
  const h = gp.resolveGuardHit(base({ heavyGuard: true }));
  assert.equal(h.outcome, 'heavy_guarded');
  assert.ok(Math.abs(h.damageTaken - 6 * (1 - gp.HEAVY_GUARD_REDUCTION)) < 1e-9);
  assert.ok(h.stabilityCost > r.stabilityCost);
});

test('stability exhaustion breaks the guard, then recovers', () => {
  const breaking = gp.resolveGuardHit(base({ stability: 5 }));
  assert.equal(breaking.outcome, 'broken');
  assert.equal(breaking.broken, true);
  // Breaking blow still lands at the guarded value, never amplified.
  assert.ok(breaking.damageTaken <= 6);
  // While broken, hits land full.
  const during = gp.resolveGuardHit(base({ nowMs: 10500, brokenUntilMs: 11200, stability: 0 }));
  assert.equal(during.outcome, 'full');
  // After the break window, guarding works again.
  const after = gp.resolveGuardHit(base({ nowMs: 12000, brokenUntilMs: 11200, stability: 50 }));
  assert.equal(after.outcome, 'guarded');
});

test('facing math: frontal arc is generous but rear hits land full', () => {
  gp.resetGuardForTests();
  // Facing -Z (yaw 0). Knockback +Z means the attacker is at -Z (in front).
  // The first resolve arms the parry window, so it parries (correct).
  const front = gp.resolveIncomingHit({
    nowMs: 20000, guardActive: true, sneaking: false, facingYaw: 0,
    knockX: 0, knockZ: 1, damage: 6, guardable: true,
  });
  assert.equal(front.frontal, true);
  assert.equal(front.outcome, 'parry');
  // Knockback -Z means the attacker is behind (+Z): full damage.
  const rear = gp.resolveIncomingHit({
    nowMs: 20100, guardActive: true, sneaking: false, facingYaw: 0,
    knockX: 0, knockZ: -1, damage: 6, guardable: true,
  });
  assert.equal(rear.frontal, false);
  assert.equal(rear.outcome, 'full');
  // Front-left hit at 45 degrees sits inside the 150-degree arc.
  const side = gp.resolveIncomingHit({
    nowMs: 20400, guardActive: true, sneaking: false, facingYaw: 0,
    knockX: 0.7, knockZ: 0.7, damage: 6, guardable: true,
  });
  assert.equal(side.frontal, true);
  assert.equal(side.outcome, 'guarded');
});

test('guard start edge arms the parry window on first resolve', () => {
  gp.resetGuardForTests();
  const first = gp.resolveIncomingHit({
    nowMs: 30000, guardActive: true, sneaking: false, facingYaw: 0,
    knockX: 0, knockZ: 1, damage: 6, guardable: true,
  });
  assert.equal(first.outcome, 'parry');
});

test('sneak guard is heavy; buckler forces heavy', () => {
  gp.resetGuardForTests();
  const sneak = gp.resolveIncomingHit({
    nowMs: 40000, guardActive: true, sneaking: true, facingYaw: 0,
    knockX: 0, knockZ: 1, damage: 6, guardable: true,
  });
  // First impact inside the window still parries.
  assert.equal(sneak.outcome, 'parry');
  const late = gp.resolveIncomingHit({
    nowMs: 41000, guardActive: true, sneaking: true, facingYaw: 0,
    knockX: 0, knockZ: 1, damage: 6, guardable: true,
  });
  assert.equal(late.outcome, 'heavy_guarded');
  assert.equal(late.heavyGuard, true);
});

test('posture accumulates, breaks, then resists further gain', () => {
  gp.resetPostureForTests();
  const id = 4242;
  const now = 50000;
  assert.equal(gp.addPosture(id, 6, 0, now), false); // 30
  assert.equal(gp.addPosture(id, 6, 0, now), false); // 60
  assert.equal(gp.addPosture(id, 6, 1, now), false); // 60 + 30 + 8 = 98 < 100
  assert.equal(gp.getPostureBreaks(id), 0);
  assert.equal(gp.addPosture(id, 6, 0, now), true); // 98 + 30 breaks
  assert.equal(gp.getPostureBreaks(id), 1);
  // Second bar needs more hits (resistance).
  assert.equal(gp.addPosture(id, 6, 0, now), false);
  assert.equal(gp.addPosture(id, 6, 0, now), false);
  assert.equal(gp.addPosture(id, 6, 0, now), false);
  gp.clearPosture(id);
  assert.equal(gp.getPostureBreaks(id), 0);
});

test('posture decays over time', () => {
  gp.resetPostureForTests();
  const id = 777;
  gp.addPosture(id, 6, 0, 60000); // 30
  // 10s later 140 decayed -> 0, so a fresh 30 cannot break.
  assert.equal(gp.addPosture(id, 6, 0, 70000), false);
  assert.equal(gp.getPostureBreaks(id), 0);
});

test('art windows arm on dodge and consume on one swing', () => {
  gp.resetArtsForTests();
  gp.noteDodge(80000, true, true);
  assert.deepEqual(gp.peekArtWindows(80100), { boarstep: true, crown: true });
  assert.deepEqual(gp.consumeArtWindows(80200), { boarstep: true, crown: true });
  // Consumed: second read is empty.
  assert.deepEqual(gp.peekArtWindows(80300), { boarstep: false, crown: false });
  // Expired windows do not fire.
  gp.noteDodge(81000, true, false);
  assert.deepEqual(gp.peekArtWindows(82000), { boarstep: false, crown: false });
});

test('echo guard stores with a cap and releases once', () => {
  gp.resetArtsForTests();
  gp.noteParry(90000, true);
  gp.noteParry(90001, true);
  gp.noteParry(90002, true);
  assert.equal(gp.peekEcho(), 12);
  assert.equal(gp.consumeEcho(), 12);
  assert.equal(gp.peekEcho(), 0);
  assert.ok(gp.peekEcho() <= gp.ECHO_STORE_CAP);
  // No unlock, no store.
  gp.noteParry(90100, false);
  assert.equal(gp.peekEcho(), 0);
});

test('guard view reports stability, break, and buckler', () => {
  gp.resetGuardForTests();
  gp.setBucklerEquipped(true);
  const v = gp.getGuardView(95000);
  assert.equal(v.stability, 100);
  assert.equal(v.broken, false);
  assert.equal(v.buckler, true);
});
