import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTs } from '../../systems/world/storage/bundleTs.mjs';

const {
  buildCloudFieldLayout,
  cloudCoverageBlocks,
  cloudGridState,
} = await loadTs(`
  export {
    buildCloudFieldLayout,
    cloudCoverageBlocks,
    cloudGridState,
  } from './src/components/world/cloudField';
`);

test('layout is deterministic and independent of player position', () => {
  const first = buildCloudFieldLayout(24, () => 0);
  const second = buildCloudFieldLayout(24, () => 0);
  assert.equal(first.instanceCount, second.instanceCount);
  assert.deepEqual(first.cells, second.cells);
});

test('extreme terrain distance does not expand cloud coverage indefinitely', () => {
  assert.equal(cloudCoverageBlocks(48), 768);
  assert.equal(cloudCoverageBlocks(128), 768);
});

test('crossing a cloud cell changes only origin/uniform state', () => {
  const layout = buildCloudFieldLayout(16, () => 0);
  const first = cloudGridState(15, 0, 0);
  const second = cloudGridState(17, 0, 0);
  assert.equal(layout.instanceCount, buildCloudFieldLayout(16, () => 0).instanceCount);
  assert.notDeepEqual(first, second);
});

test('scroll changes mask offset without changing field origin', () => {
  const first = cloudGridState(200, 100, 0);
  const second = cloudGridState(200, 100, 24);
  assert.equal(first.originX, second.originX);
  assert.equal(first.originZ, second.originZ);
  assert.notEqual(first.gridU, second.gridU);
});
