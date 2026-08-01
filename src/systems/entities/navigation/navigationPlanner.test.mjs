import assert from 'node:assert/strict';
import test from 'node:test';

import { NavigationPlanner } from './NavigationPlanner.ts';
import { makeNavigationWorld } from './navigationFixtures.ts';

const profile = Object.freeze({ width: 0.6, height: 1.8, maxStep: 1, maxJump: 1, maxDrop: 2 });

const runUntilSettled = (planner, tickets, limit = 200) => {
  for (let index = 0; index < limit && tickets.some((ticket) => planner.getResult(ticket).status === 'pending'); index += 1) {
    planner.tickBudget();
  }
};

test('coalesces compatible requests and starts at most two bounded jobs per tick', () => {
  const world = makeNavigationWorld([
    '...............',
    '.S...........G.',
    '...............',
  ]);
  const planner = new NavigationPlanner(world, { maxNodesPerTick: 5, maxNewJobsPerTick: 2 });
  const request = { start: world.start, goal: world.goal, profile, maxExpandedNodes: 512 };
  const first = planner.request(1, request);
  const shared = planner.request(2, request);
  const uniqueA = planner.request(3, { ...request, start: { x: 2, y: 1, z: 0 } });
  const uniqueB = planner.request(4, { ...request, start: { x: 3, y: 1, z: 0 } });
  assert.equal(planner.getDebugState().sharedJobs, 3);
  const tick = planner.tickBudget();
  assert.equal(tick.started, 2);
  assert.ok(tick.expanded <= 5);
  runUntilSettled(planner, [first, shared, uniqueA, uniqueB]);
  assert.deepEqual(planner.getResult(first).path, planner.getResult(shared).path);
  assert.equal(planner.getResult(uniqueB).status, 'complete');
});

test('production defaults cap work at 600 nodes and two new jobs', () => {
  const world = makeNavigationWorld(['S...................G']);
  const planner = new NavigationPlanner(world);
  const request = { start: world.start, goal: world.goal, profile, maxExpandedNodes: 2048 };
  planner.request(11, request);
  planner.request(12, { ...request, start: { x: 1, y: 1, z: 0 } });
  planner.request(13, { ...request, start: { x: 2, y: 1, z: 0 } });
  const tick = planner.tickBudget();
  assert.equal(tick.started, 2);
  assert.ok(tick.expanded <= 600);
});

test('repeated pending requests from one entity reuse its job instead of starving it', () => {
  const world = makeNavigationWorld(['S................G']);
  const planner = new NavigationPlanner(world, { maxNodesPerTick: 1 });
  const request = { start: world.start, goal: world.goal, profile, maxExpandedNodes: 256 };
  const first = planner.request(7, request);
  const repeated = planner.request(7, request);
  assert.equal(repeated.id, first.id);
  assert.equal(planner.getDebugState().sharedJobs, 1);
  runUntilSettled(planner, [repeated]);
  assert.equal(planner.getResult(repeated).status, 'complete');
});

test('reuses a path for 0.75 seconds, then expires it', () => {
  let now = 1000;
  const world = makeNavigationWorld(['S.........G']);
  const planner = new NavigationPlanner(world, { now: () => now });
  const request = { start: world.start, goal: world.goal, profile, maxExpandedNodes: 256 };
  const initial = planner.request(1, request);
  runUntilSettled(planner, [initial]);
  assert.equal(planner.getResult(initial).status, 'complete');
  now += 749;
  const cached = planner.request(2, request);
  assert.equal(planner.getResult(cached).status, 'complete');
  assert.equal(planner.getDebugState().cacheHits, 1);
  now += 2;
  const expired = planner.request(3, request);
  assert.equal(planner.getResult(expired).status, 'pending');
});

test('region invalidation evicts crossing paths and stale in-flight jobs', () => {
  const world = makeNavigationWorld(['S.............G']);
  const planner = new NavigationPlanner(world, { maxNodesPerTick: 2 });
  const request = { start: world.start, goal: world.goal, profile, maxExpandedNodes: 256 };
  const completed = planner.request(1, request);
  runUntilSettled(planner, [completed]);
  planner.invalidateRegion({ minX: 6, maxX: 8, minZ: 0, maxZ: 0 });
  const replacement = planner.request(2, request);
  assert.equal(planner.getResult(replacement).status, 'pending');
  planner.tickBudget();
  planner.invalidateRegion({ minX: 0, maxX: 14, minZ: 0, maxZ: 0 });
  assert.equal(planner.getResult(replacement).failure, 'cancelled');
});

test('inactive owners are cancelled without spending the frame budget', () => {
  const active = new Set([2]);
  const world = makeNavigationWorld(['S..........G']);
  const planner = new NavigationPlanner(world, { isOwnerActive: (ownerId) => active.has(ownerId) });
  const request = { start: world.start, goal: world.goal, profile, maxExpandedNodes: 256 };
  const cancelled = planner.request(1, request);
  const live = planner.request(2, request);
  const tick = planner.tickBudget();
  assert.equal(planner.getResult(cancelled).failure, 'cancelled');
  assert.ok(tick.expanded > 0);
  runUntilSettled(planner, [live]);
  assert.equal(planner.getResult(live).status, 'complete');
});
