import assert from 'node:assert/strict';
import test from 'node:test';

import { EntityLocomotion } from './EntityLocomotion.ts';

const profile = Object.freeze({
  width: 0.8, height: 1.6, maxStep: 1, maxJump: 1, maxDrop: 2,
  preferredRange: { min: 0, max: 2 }, acceleration: 12, turnRate: 8,
  jumpImpulse: 7, dropSpeedScale: 0.55,
});

const makeAgent = () => ({
  pos: { x: 0.5, y: 1, z: 0.5 },
  vel: { x: 0, y: 0, z: 0 },
  yaw: 0,
  grounded: true,
  navigationState: { waypointIndex: 1 },
});

const world = { canOccupy: () => true, hasSafeLanding: () => true };

test('locomotion accelerates toward a waypoint without moving the entity directly', () => {
  const agent = makeAgent();
  const path = { nodes: [{ x: 0, y: 1, z: 0, action: 'walk' }, { x: 3, y: 1, z: 0, action: 'walk' }], expandedNodes: 2, totalCost: 3 };
  const before = { ...agent.pos };
  const result = EntityLocomotion.tick(agent, path, world, 0.05, profile, 2.6);
  assert.deepEqual(agent.pos, before);
  assert.ok(agent.vel.x > 0);
  assert.ok(Math.hypot(agent.vel.x, agent.vel.z) <= 0.6 + 1e-9);
  assert.equal(result.routeComplete, false);
});

test('jump nodes apply one grounded impulse while drops stay controlled', () => {
  const jumper = makeAgent();
  const jumpPath = { nodes: [{ x: 0, y: 1, z: 0, action: 'walk' }, { x: 1, y: 2, z: 0, action: 'jump' }], expandedNodes: 2, totalCost: 1 };
  const jump = EntityLocomotion.tick(jumper, jumpPath, world, 0.05, profile, 2.6);
  assert.equal(jump.jumped, true);
  assert.equal(jumper.vel.y, profile.jumpImpulse);

  const dropper = makeAgent();
  const dropPath = { nodes: [{ x: 0, y: 2, z: 0, action: 'walk' }, { x: 1, y: 1, z: 0, action: 'drop' }], expandedNodes: 2, totalCost: 1 };
  const drop = EntityLocomotion.tick(dropper, dropPath, world, 0.05, profile, 2.6);
  assert.equal(drop.jumped, false);
  assert.ok(Math.hypot(dropper.vel.x, dropper.vel.z) <= 2.6);

  dropper.grounded = false;
  dropper.vel.x = 0;
  EntityLocomotion.tick(dropper, dropPath, world, 0.25, profile, 2.6);
  assert.ok(Math.hypot(dropper.vel.x, dropper.vel.z) <= 2.6 * profile.dropSpeedScale + 1e-9);
});

test('an unsafe landing invalidates the route instead of committing a drop', () => {
  const agent = makeAgent();
  const path = { nodes: [{ x: 0, y: 2, z: 0, action: 'walk' }, { x: 1, y: 1, z: 0, action: 'drop' }], expandedNodes: 2, totalCost: 1 };
  const result = EntityLocomotion.tick(agent, path, { ...world, hasSafeLanding: () => false }, 0.05, profile, 2.6);
  assert.equal(result.routeInvalid, true);
  assert.equal(agent.vel.x, 0);
});

test('ledge guarding recognizes an immediately upcoming safe drop before the waypoint flips', () => {
  assert.equal(typeof EntityLocomotion.isSafeDropCommitted, 'function');
  const agent = makeAgent();
  agent.pos = { x: 1.1, y: 2, z: 0.5 };
  agent.navigationState.waypointIndex = 1;
  const path = {
    nodes: [
      { x: 0, y: 2, z: 0, action: 'walk' },
      { x: 1, y: 2, z: 0, action: 'walk' },
      { x: 2, y: 1, z: 0, action: 'drop' },
    ],
    expandedNodes: 3,
    totalCost: 2,
  };
  assert.equal(EntityLocomotion.isSafeDropCommitted(agent, path, world, profile), true);
  assert.equal(EntityLocomotion.isSafeDropCommitted(agent, path, { ...world, hasSafeLanding: () => false }, profile), false);
});

test('ledge guarding commits to the extended drop stride required by a wide body', () => {
  const agent = makeAgent();
  agent.pos = { x: 1.5, y: 2, z: 0.5 };
  agent.navigationState.waypointIndex = 1;
  const wideProfile = { ...profile, width: 1.45 };
  const path = {
    nodes: [
      { x: 0, y: 1, z: 0, action: 'walk' },
      { x: 1, y: 2, z: 0, action: 'step' },
      { x: 3, y: 1, z: 0, action: 'drop' },
    ],
    expandedNodes: 3,
    totalCost: 3,
  };
  assert.equal(EntityLocomotion.isSafeDropCommitted(agent, path, world, wideProfile), true);
});

test('a wide body carries enough momentum to clear the lip and finish a one-block descent', () => {
  const wideProfile = { ...profile, width: 1.45 };
  const agent = makeAgent();
  agent.pos = { x: 3.5, y: 2, z: 0.5 };
  agent.navigationState.waypointIndex = 1;
  const path = {
    nodes: [
      { x: 3, y: 2, z: 0, action: 'walk' },
      { x: 6, y: 1, z: 0, action: 'drop' },
    ],
    expandedNodes: 2,
    totalCost: 3,
  };
  let complete = false;
  for (let step = 0; step < 120 && !complete; step += 1) {
    const result = EntityLocomotion.tick(agent, path, world, 0.05, wideProfile, 2.6);
    agent.pos.x += agent.vel.x * 0.05;
    agent.pos.z += agent.vel.z * 0.05;
    if (agent.grounded && agent.pos.x - wideProfile.width * 0.5 > 5) agent.grounded = false;
    if (!agent.grounded) {
      agent.pos.y = Math.max(1, agent.pos.y - 0.16);
      if (agent.pos.y === 1) agent.grounded = true;
    }
    complete = result.routeComplete;
  }
  assert.equal(agent.grounded, true);
  assert.equal(agent.pos.y, 1);
  assert.ok(Math.abs(agent.pos.x - 6.5) < 0.45);
  assert.equal(complete, true);
});
