import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { VoxelNavigator } from './VoxelNavigator.ts';
import { makeNavigationWorld, NAV_FIXTURE_BLOCKS } from './navigationFixtures.ts';

const groundProfile = Object.freeze({ width: 0.6, height: 1.8, maxStep: 1, maxJump: 1, maxDrop: 2 });

test('routes around an unsafe ledge instead of freezing at it', () => {
  const world = makeNavigationWorld([
    '#########',
    '#S..   G#',
    '#.#####.#',
    '#.......#',
    '#########',
  ]);
  const path = new VoxelNavigator(world).findPath({
    start: world.start,
    goal: world.goal,
    profile: groundProfile,
    maxExpandedNodes: 2048,
  });
  assert.ok(path);
  assert.ok(path.nodes.some((node) => node.z >= 3));
  assert.deepEqual(path.nodes.at(-1), { ...world.goal, action: 'walk' });
});

test('uses a one-block stair and rejects a three-block blind drop', () => {
  const navigator = new VoxelNavigator(makeNavigationWorld(['S^..G']));
  assert.deepEqual(navigator.validateSegment({ x: 0, y: 1, z: 0 }, { x: 1, y: 2, z: 0 }, groundProfile), {
    traversable: true,
    action: 'step',
  });
  assert.equal(navigator.validateSegment({ x: 2, y: 4, z: 0 }, { x: 3, y: 1, z: 0 }, groundProfile).traversable, false);
});

test('marks jumps and safe drops explicitly so smoothing cannot erase them', () => {
  const world = makeNavigationWorld(['S^.G']);
  const jumpProfile = { ...groundProfile, maxStep: 0, maxJump: 1 };
  const path = new VoxelNavigator(world).findPath({ start: world.start, goal: world.goal, profile: jumpProfile, maxExpandedNodes: 64 });
  assert.ok(path);
  assert.ok(path.nodes.some((node) => node.action === 'jump'));
  assert.ok(path.nodes.some((node) => node.action === 'drop'));
});

test('wide enemies clear a one-block descent instead of rejecting the ledge cell', () => {
  const world = makeNavigationWorld([
    '...........',
    '...........',
    '...........',
    '........G..',
    '...........',
    '...........',
    '...........',
  ]);
  for (let z = 1; z <= 5; z += 1) {
    for (let x = 1; x <= 4; x += 1) world.setBlock(x, 1, z, NAV_FIXTURE_BLOCKS.STONE);
  }
  const start = { x: 3, y: 2, z: 3 };
  for (const width of [1.08, 1.45, 1.8]) {
    const path = new VoxelNavigator(world).findPath({
      start,
      goal: world.goal,
      profile: { ...groundProfile, width },
      maxExpandedNodes: 128,
    });
    assert.ok(path, `width ${width} should route down the one-block ledge`);
    const drop = path.nodes.find((node) => node.action === 'drop');
    assert.ok(drop, `width ${width} should retain an explicit drop node`);
    assert.ok(drop.x - start.x >= 3, `width ${width} should clear the upper lip before descending`);
  }
});

test('height-change actions stay local and cannot become long smoothing shortcuts', () => {
  const world = makeNavigationWorld(['S........G']);
  world.setBlock(world.goal.x, 1, world.goal.z, NAV_FIXTURE_BLOCKS.STONE);
  const navigator = new VoxelNavigator(world);
  assert.equal(navigator.validateSegment(
    world.start,
    { ...world.goal, y: 2 },
    { ...groundProfile, maxStep: 0, maxJump: 1 },
  ).traversable, false);
});

test('rejects low ceilings, lava, spikes, closed gates, and unloaded columns', () => {
  const world = makeNavigationWorld(['S....G']);
  const navigator = new VoxelNavigator(world);
  world.setBlock(1, 2, 0, NAV_FIXTURE_BLOCKS.STONE);
  assert.equal(navigator.validateSegment(world.start, { x: 1, y: 1, z: 0 }, groundProfile).reason, 'no_clearance');
  world.setBlock(1, 2, 0, NAV_FIXTURE_BLOCKS.AIR);
  for (const [x, type] of [[2, NAV_FIXTURE_BLOCKS.LAVA], [3, NAV_FIXTURE_BLOCKS.SPIKES], [4, NAV_FIXTURE_BLOCKS.CLOSED_GATE]]) {
    world.setBlock(x, 0, 0, type);
    assert.equal(navigator.validateSegment({ x: x - 1, y: 1, z: 0 }, { x, y: 1, z: 0 }, groundProfile).reason, 'hazard');
  }
  world.setLoaded(5, 0, false);
  assert.equal(navigator.validateSegment({ x: 4, y: 1, z: 0 }, { x: 5, y: 1, z: 0 }, groundProfile).reason, 'unloaded');
});

test('body width rejects a one-block corridor that a small entity can traverse', () => {
  const world = makeNavigationWorld([
    '#####',
    '#S.G#',
    '#####',
  ]);
  const navigator = new VoxelNavigator(world);
  assert.ok(navigator.findPath({ start: world.start, goal: world.goal, profile: groundProfile, maxExpandedNodes: 64 }));
  assert.equal(navigator.findPath({
    start: world.start,
    goal: world.goal,
    profile: { ...groundProfile, width: 1.6 },
    maxExpandedNodes: 64,
  }), null);
});

test('deterministic ties produce identical safe paths and bounded failures', () => {
  const world = makeNavigationWorld([
    '.......',
    '.S.#.G.',
    '.......',
  ]);
  const navigator = new VoxelNavigator(world);
  const request = { start: world.start, goal: world.goal, profile: groundProfile, maxExpandedNodes: 128 };
  const first = navigator.findPath(request);
  const second = navigator.findPath(request);
  assert.deepEqual(second, first);
  assert.equal(new VoxelNavigator(world).findPath({ ...request, maxExpandedNodes: 1 }), null);
});

test('entity definitions expose explicit movement ability while retaining canStep compatibility', () => {
  const root = path.resolve(import.meta.dirname, '../../../..');
  const source = fs.readFileSync(path.join(root, 'src/systems/entities/Entity.ts'), 'utf8');
  assert.match(source, /interface EntityMovementAbility extends NavigationProfile/);
  assert.match(source, /preferredRange:\s*{\s*min: number;\s*max: number/);
  assert.match(source, /navigation\?: EntityMovementAbility/);
  assert.match(source, /canStep\?: boolean/);
});
