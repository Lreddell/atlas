import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { simulateGroundEntity } from './navigationFixtures.ts';

test('a close-range ground entity replans and walks around a ledge', () => {
  const result = simulateGroundEntity({ behavior: 'close', seconds: 8, fixture: 'ledge_detour' });
  assert.equal(result.fell, false);
  assert.ok(result.distanceToTarget < 2.5);
  assert.ok(result.replans >= 1);
});

test('a ranged ground entity stops inside a visible preferred band', () => {
  const result = simulateGroundEntity({ behavior: 'ranged', seconds: 8, fixture: 'open_range' });
  assert.ok(result.distanceToTarget >= 9);
  assert.ok(result.distanceToTarget <= 13);
  assert.equal(result.hasLineOfSight, true);
});

test('live integration uses runtime-only state, planner budgets, and non-teleport recovery', () => {
  const root = path.resolve(import.meta.dirname, '../../../..');
  const manager = fs.readFileSync(path.join(root, 'src/systems/entities/EntityManager.ts'), 'utf8');
  const entity = fs.readFileSync(path.join(root, 'src/systems/entities/Entity.ts'), 'utf8');
  const locomotion = fs.readFileSync(path.join(root, 'src/systems/entities/navigation/EntityLocomotion.ts'), 'utf8');
  const resonant = fs.readFileSync(path.join(root, 'src/systems/entities/resonantVaultEnemies.ts'), 'utf8');
  assert.match(entity, /navigationState\?: NavigationRuntimeState/);
  assert.match(manager, /navigationPlanner\.tickBudget\(\)/);
  assert.match(manager, /EntityLocomotion\.tick/);
  assert.match(manager, /chooseStrafeGoal/);
  assert.match(manager, /combatGoalUntil/);
  assert.match(manager, /lastProgressAt = this\.navigationClock/);
  assert.match(manager, /recoveryAttempts/);
  assert.match(manager, /NAVIGATION_STUCK_SECONDS = 0\.9/);
  assert.match(manager, /EntityLocomotion\.isSafeDropCommitted/);
  assert.match(locomotion, /node\?\.action !== 'drop'[\s\S]{0,240}hasSafeLanding/);
  assert.doesNotMatch(manager, /navigation[\s\S]{0,200}teleportPlayer/);
  const boatSerializer = manager.slice(manager.indexOf('serializeBoats()'), manager.indexOf('restoreBoats('));
  assert.doesNotMatch(boatSerializer, /navigationState/);
  assert.match(entity, /magnetic_warden:[\s\S]{0,700}navigation:/);
  for (const kind of ['vault_guard', 'vault_marksman', 'bell_hound', 'tollkeeper']) {
    assert.match(resonant, new RegExp(`${kind}:\\s*\\{[\\s\\S]{0,400}width:`));
  }
});
