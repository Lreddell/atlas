import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  advanceMemoryInput,
  beginRelay,
  advanceRelayInput,
  isPhaseLaneSolid,
  getNextVaultEchoTarget,
  getVaultRoomPath,
} from './resonantMachineryRules.ts';
import { getVaultCandidateForCell, getVaultLayout } from './resonantVaults.ts';
import { getVaultPreSealRequiredRoomIds, getVaultRequiredRoomIds } from './resonantVaultProgression.ts';

const root = path.resolve(import.meta.dirname, '../../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const sequence = [2, 0, 3, 1];

test('memory sequence advances, solves, and resets locally on error', () => {
  let state = { progress: 0, solved: false };
  state = advanceMemoryInput(sequence, state, 2).state;
  state = advanceMemoryInput(sequence, state, 0).state;
  const wrong = advanceMemoryInput(sequence, state, 1);
  assert.equal(wrong.correct, false);
  assert.deepEqual(wrong.state, { progress: 0, solved: false });
  state = wrong.state;
  for (const symbol of sequence) state = advanceMemoryInput(sequence, state, symbol).state;
  assert.deepEqual(state, { progress: 4, solved: true });
  assert.deepEqual(advanceMemoryInput(sequence, state, 0).state, state);
});

test('phase lanes are deterministic, alternating, and provide a readable solid window', () => {
  const timing = { periodTicks: 100, solidTicks: 44, offsetTicks: 13 };
  assert.equal(isPhaseLaneSolid(0, timing, 0), isPhaseLaneSolid(100, timing, 0));
  assert.notEqual(isPhaseLaneSolid(20, timing, 0), isPhaseLaneSolid(20, timing, 2));
  let solid = 0;
  for (let tick = 0; tick < 100; tick += 1) if (isPhaseLaneSolid(tick, timing, 0)) solid += 1;
  assert.equal(solid, 44);
});

test('the retired Echo Sentinel prototype machinery stays deleted', () => {
  // The definitive roster is the Bell Titan plus the four room enemies; the
  // prototype sentinel kinds, conductor links, and their events must not creep
  // back in through a stale merge.
  const machinery = read('src/systems/world/resonantMachineryRules.ts');
  const entities = read('src/systems/entities/resonantEntities.ts');
  const events = read('src/systems/events/GameEvents.ts');
  for (const source of [machinery, entities, events]) {
    assert.doesNotMatch(source, /echo_sentinel|conductor_sentinel|SENTINEL_LINK|getEncounterComposition/);
  }
});

test('acoustic relay has a fair handoff, can start from its first receiver, and recovers after expiry', () => {
  let state = { progress: 0, solved: false, active: false, deadlineSeconds: Number.POSITIVE_INFINITY };
  const directStart = advanceRelayInput(state, 0, 6, 10);
  assert.equal(directStart.correct, true, 'the first receiver can wake the relay if the striker cue was missed');
  assert.equal(directStart.state.progress, 1);
  state = beginRelay(state, 10, 6);
  assert.equal(state.active, true);
  state = advanceRelayInput(state, 0, 6, 11).state;
  assert.equal(state.progress, 1);
  assert.ok(state.deadlineSeconds > 18 && state.deadlineSeconds < 19);
  state = advanceRelayInput(state, 1, 6, 12).state;
  const wrong = advanceRelayInput(state, 3, 6, 13);
  assert.equal(wrong.correct, false);
  assert.equal(wrong.state.progress, 0);
  assert.equal(wrong.state.active, false);
  state = beginRelay(wrong.state, 20, 6);
  for (const [receiver, at] of [[0, 20.5], [1, 21], [2, 21.5], [3, 22], [4, 22.5], [5, 23]]) state = advanceRelayInput(state, receiver, 6, at).state;
  assert.equal(state.solved, true);
  const expired = advanceRelayInput({ progress: 2, solved: false, active: true, deadlineSeconds: 5 }, 2, 6, 6);
  assert.equal(expired.correct, false);
  assert.equal(expired.state.progress, 0);
  assert.equal(expired.state.active, false);
  const restarted = advanceRelayInput(expired.state, 0, 6, 7);
  assert.equal(restarted.correct, true);
  assert.equal(restarted.state.progress, 1);
});

test('acoustic relay mistakes and timeouts never queue damaging backlash', () => {
  const runtime = read('src/systems/world/ResonantVaultRuntime.ts');
  const relayStart = runtime.indexOf('private activateRelayReceiver');
  const relayEnd = runtime.indexOf('private activatePuzzleControl', relayStart);
  assert.ok(relayStart >= 0 && relayEnd > relayStart);
  assert.doesNotMatch(runtime.slice(relayStart, relayEnd), /queueResonanceBacklash/);
});

test('route echoes follow randomized room IDs without pointing through the closed inner seal', () => {
  const candidate = { ...getVaultCandidateForCell(4, -7, 73014), active: true, orientation: 0 };
  const layout = getVaultLayout(candidate, 96, () => 96);
  const base = {
    rooms: {},
    titanDefeated: false,
    coreClaimed: false,
    escapeStarted: false,
  };
  const preSeal = getVaultPreSealRequiredRoomIds(layout);
  const required = getVaultRequiredRoomIds(layout);
  assert.ok(preSeal.includes(getNextVaultEchoTarget(layout, base, 'hub')));

  const preSealSolved = Object.fromEntries(preSeal.map((roomId) => [roomId, true]));
  const afterSeal = getNextVaultEchoTarget(layout, { ...base, rooms: preSealSolved }, 'hub');
  const postSealRequired = required.filter((roomId) => !preSeal.includes(roomId));
  if (postSealRequired.length > 0) assert.ok(postSealRequired.includes(afterSeal));
  else assert.equal(afterSeal, 'arena');

  const solved = Object.fromEntries(required.map((roomId) => [roomId, true]));
  assert.equal(getNextVaultEchoTarget(layout, { ...base, rooms: solved }, 'hub'), 'arena');
  assert.equal(getNextVaultEchoTarget(layout, { ...base, rooms: solved, titanDefeated: true }, 'arena'), 'core');
  assert.match(
    getNextVaultEchoTarget(layout, { ...base, rooms: solved, titanDefeated: true, coreClaimed: true, escapeStarted: true }, 'core'),
    /^outlet_(grand|fracture)$/,
  );
});

test('route echoes follow authored room edges instead of crossing walls', () => {
  const edges = [
    ['hub', 'combat'],
    ['combat', 'seal'],
    ['seal', 'antechamber'],
    ['antechamber', 'arena'],
  ];
  assert.deepEqual(getVaultRoomPath(edges, 'hub', 'arena'), ['hub', 'combat', 'seal', 'antechamber', 'arena']);
  assert.deepEqual(getVaultRoomPath(edges, 'arena', 'hub'), ['arena', 'antechamber', 'seal', 'combat', 'hub']);
});

test('Vault Marksman shots use authored anticipation, swept collision, and enemy ownership', () => {
  const director = read('src/systems/entities/ResonantEncounterDirector.ts');
  const enemies = read('src/systems/entities/resonantVaultEnemies.ts');
  assert.match(enemies, /crossbow_shot[\s\S]*anticipation:[\s\S]*projectile:/);
  assert.match(director, /VaultProjectileSystem/);
  assert.match(director, /combatAction[\s\S]*phase:\s*'anticipation'/);
  assert.match(director, /owner:\s*'enemy'/);
  assert.doesNotMatch(director, /owner:\s*'player'|bolt\.owner|projectile-deflected|getCustodianPhase|vault_custodian|magnetic_warden/);
});
