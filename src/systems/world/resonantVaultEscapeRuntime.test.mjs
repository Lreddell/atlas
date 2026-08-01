import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  advanceVaultEscape,
  createVaultEscapeState,
  getEscapeHazardTier,
} from './resonantVaultEscapeRuntime.ts';

const root = path.resolve(import.meta.dirname, '../../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('choosing one route locks the other only after crossing its threshold', () => {
  let state = createVaultEscapeState();
  state = advanceVaultEscape(state, { type: 'core_claimed' }).state;
  assert.equal(state.remainingSeconds, 420);
  assert.equal(state.chosenRoute, null);
  assert.equal(state.closedRoute, null);
  state = advanceVaultEscape(state, { type: 'route_threshold', route: 'fracture' }).state;
  assert.equal(state.chosenRoute, 'fracture');
  assert.equal(state.closedRoute, 'grand');
});

test('zero time maximizes hazards but never permanently locks the chosen route', () => {
  let state = createVaultEscapeState({ remainingSeconds: 0.05, chosenRoute: 'grand' });
  state = advanceVaultEscape(state, { type: 'tick', dt: 1 }).state;
  assert.equal(state.remainingSeconds, 0);
  assert.equal(state.hazardTier, 3);
  assert.equal(state.routeOpen, true);
  assert.equal(state.completed, false);
});

test('an underground outlet threshold cannot complete the escape', () => {
  let state = createVaultEscapeState({ chosenRoute: 'grand', remainingSeconds: 200 });
  state = advanceVaultEscape(state, {
    type: 'player_position', route: 'grand', y: 50, surfaceY: 72,
    insideCompletionVolume: false, connectedToOpenAir: false,
  }).state;
  assert.equal(state.completed, false);
  state = advanceVaultEscape(state, {
    type: 'player_position', route: 'grand', y: 73, surfaceY: 72,
    insideCompletionVolume: true, connectedToOpenAir: true,
  }).state;
  assert.equal(state.completed, true);
});

test('completion and checkpoints must belong to the locked route', () => {
  let state = createVaultEscapeState({ chosenRoute: 'fracture', remainingSeconds: 180 });
  state = advanceVaultEscape(state, { type: 'checkpoint', route: 'grand', checkpointId: 'grand:checkpoint:0' }).state;
  assert.equal(state.latestCheckpoint, null);
  state = advanceVaultEscape(state, {
    type: 'player_position', route: 'grand', y: 90, surfaceY: 80,
    insideCompletionVolume: true, connectedToOpenAir: true,
  }).state;
  assert.equal(state.completed, false);
});

test('hazard tiers escalate at the authored thresholds', () => {
  assert.equal(getEscapeHazardTier(420), 0);
  assert.equal(getEscapeHazardTier(181), 0);
  assert.equal(getEscapeHazardTier(180), 1);
  assert.equal(getEscapeHazardTier(91), 1);
  assert.equal(getEscapeHazardTier(90), 2);
  assert.equal(getEscapeHazardTier(31), 2);
  assert.equal(getEscapeHazardTier(30), 3);
  assert.equal(getEscapeHazardTier(0), 3);
});

test('tier two adds one bounded Grand Ascent reinforcement through the encounter director', () => {
  const runtime = read('src/systems/world/ResonantVaultRuntime.ts');
  const director = read('src/systems/entities/ResonantEncounterDirector.ts');
  assert.match(runtime, /tier >= 2 && chosenRoute === 'grand'/);
  assert.match(runtime, /queueGrandAscentReinforcement/);
  assert.match(director, /reinforcementAdded/);
  assert.match(director, /\['vault_marksman', 'bell_hound'\]/);
});

test('death and reload consume saved recovery through existing spawn flows only', () => {
  const app = read('src/App.tsx');
  const controller = read('src/components/ResonantVaultController.tsx');
  assert.ok((app.match(/getActiveVaultEscapeRecovery\(/g) ?? []).length >= 2);
  assert.match(app, /const pos = vaultRecovery\?\.checkpoint \?\? meta\.player\.position/);
  assert.doesNotMatch(controller, /teleportPlayer|\.teleport\(/);
});
