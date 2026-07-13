import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTs } from '../world/storage/bundleTs.mjs';

const {
  classifyTerrainLod,
  shouldCastTerrainShadow,
  terrainRenderPolicy,
  lodFromChunkFlags,
  shadowFromChunkFlags,
} = await loadTs(`
  export {
    classifyTerrainLod,
    shouldCastTerrainShadow,
    terrainRenderPolicy,
    lodFromChunkFlags,
    shadowFromChunkFlags,
  } from './src/systems/rendering/terrainLod';
`);

test('LOD thresholds use squared distance', () => {
  assert.equal(classifyTerrainLod(64), 'near');
  assert.equal(classifyTerrainLod(65), 'middle');
  assert.equal(classifyTerrainLod(256), 'middle');
  assert.equal(classifyTerrainLod(257), 'far');
});

test('shadow casting is restricted to six chunks', () => {
  assert.equal(shouldCastTerrainShadow(36, true), true);
  assert.equal(shouldCastTerrainShadow(37, true), false);
  assert.equal(shouldCastTerrainShadow(1, false), false);
});

test('store notifies once per center change and exposes stable flags', () => {
  let calls = 0;
  const off = terrainRenderPolicy.subscribe(() => { calls += 1; });
  terrainRenderPolicy.setCenter(10, -5);
  terrainRenderPolicy.setCenter(10, -5);
  assert.equal(calls, 1);
  const flags = terrainRenderPolicy.getChunkFlags(16, -5, true);
  assert.equal(lodFromChunkFlags(flags), 'near');
  assert.equal(shadowFromChunkFlags(flags), true);
  terrainRenderPolicy.setCenter(0, 0);
  assert.equal(lodFromChunkFlags(terrainRenderPolicy.getChunkFlags(20, 0, true)), 'far');
  off();
});
