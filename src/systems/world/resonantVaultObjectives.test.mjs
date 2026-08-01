import assert from 'node:assert/strict';
import test from 'node:test';

import { getVaultObjective } from './resonantVaultObjectives.ts';

const context = (overrides = {}) => ({
  discovered: true,
  entered: true,
  room: 'hub',
  hasTuningFork: true,
  roomSolved: false,
  expeditionReady: false,
  memoryProgress: 0,
  restoreProgress: 0,
  restoreTotal: 0,
  counterweightProgress: 0,
  counterweightTotal: 3,
  crossingPitActive: false,
  echoMode: 'idle',
  echoProgress: 0,
  echoLength: 4,
  titanActive: false,
  titanCoreExposed: false,
  titanDefeated: false,
  titanAction: null,
  coreClaimed: false,
  escapeStarted: false,
  escapeCompleted: false,
  escapeRoute: null,
  escapeHazardTier: 0,
  escapeRemaining: 0,
  requiredCompleted: 2,
  requiredTotal: 7,
  preSealCompleted: 2,
  preSealTotal: 4,
  nearInnerSeal: false,
  guidanceActive: false,
  ...overrides,
});

test('the objective line follows environmental room cues', () => {
  assert.equal(getVaultObjective(context({ discovered: false, entered: false }))?.primary, 'Descend into the vault');
  assert.equal(getVaultObjective(context({ hasTuningFork: false }))?.primary, 'Find a tuning fork');
  assert.deepEqual(getVaultObjective(context()), {
    key: 'search:2:7', primary: 'Complete the chambers', secondary: '2 / 7 complete', persistent: true,
  });
  assert.deepEqual(getVaultObjective(context({ guidanceActive: true })), {
    key: 'follow_echo:2:7', primary: 'Follow the echo', secondary: '2 / 7 complete', persistent: true,
  });
  assert.deepEqual(getVaultObjective(context({ nearInnerSeal: true })), {
    key: 'sealed:2:4', primary: 'Seal locked', secondary: '2 / 4 chambers complete', persistent: true,
  });
  assert.equal(getVaultObjective(context({ room: 'memory_choir' }))?.primary, 'Listen');
  assert.deepEqual(getVaultObjective(context({ room: 'memory_choir', echoMode: 'repeat', echoProgress: 2 })), {
    key: 'echo_repeat:2:4', primary: 'Repeat the echo', secondary: '2 / 4', persistent: true,
  });
  assert.equal(getVaultObjective(context({ room: 'broken_crossing' }))?.primary, 'Cross the chamber');
  assert.deepEqual(getVaultObjective(context({ room: 'broken_crossing', crossingPitActive: true })), {
    key: 'judgment_pit', primary: 'The lower hall is listening', persistent: true,
  });
  assert.deepEqual(getVaultObjective(context({ room: 'acoustic_relay', restoreProgress: 1, restoreTotal: 4 })), {
    key: 'restore_relay:1:4',
    primary: 'Carry the pulse',
    secondary: '1 / 4 resonators awake',
    persistent: true,
  });
  assert.deepEqual(getVaultObjective(context({ room: 'counterweight_gallery' })), {
    key: 'restore_counterweight:0:3',
    primary: 'Balance the gallery',
    secondary: '0 / 3 weights raised',
    persistent: true,
  });
  assert.equal(
    getVaultObjective(context({ room: 'counterweight_gallery', counterweightProgress: 2 }))?.secondary,
    '2 / 3 weights raised',
  );
  assert.equal(getVaultObjective(context({ room: 'guard_hall' }))?.primary, 'Defeat the guardians');
});

test('Bell Titan, core, and surface escape stay concise', () => {
  const ready = { expeditionReady: true };
  assert.equal(getVaultObjective(context({ ...ready, room: 'antechamber' }))?.primary, 'Enter the bell chamber');
  assert.equal(getVaultObjective(context({ ...ready, room: 'arena', titanActive: true, titanAction: 'sweep_windup' })), null);
  assert.equal(getVaultObjective(context({ ...ready, room: 'arena', titanActive: true, titanCoreExposed: true, titanAction: 'core_open' })), null);
  assert.equal(getVaultObjective(context({ ...ready, titanDefeated: true }))?.primary, 'Claim the hammer');
  assert.deepEqual(getVaultObjective(context({ ...ready, titanDefeated: true, coreClaimed: true, escapeStarted: true, escapeRemaining: 420 })), {
    key: 'choose_exit:0:0', primary: 'Choose an ascent', secondary: 'Grand: long, guarded | Fracture: short, hazardous', persistent: true,
  });
  assert.deepEqual(getVaultObjective(context({ ...ready, titanDefeated: true, coreClaimed: true, escapeStarted: true, escapeRemaining: 198, escapeRoute: 'grand' })), {
    key: 'escape:grand:198', primary: 'Reach the surface', secondary: '3:18 | Grand Ascent', persistent: true,
  });
  assert.equal(getVaultObjective(context({ escapeCompleted: true })), null);
});
