// Stage 3: Heartwood layout tests. Determinism, spacing, containment,
// site-overlap freedom, sub-biome classification, height-override safety.
import assert from 'node:assert/strict';
import test from 'node:test';

import { loadTsViaFile } from '../world/storage/bundleTs.mjs';

const sites = await loadTsViaFile(`
    export { getHeartwoodLayout, getHeartwoodSubBiome, isHeartwoodUnderwood, getHeartwoodHeightOverride, getHeartwoodSites, clearHeartwoodLayoutCacheForTests } from './src/systems/heartwood/heartwoodSites.ts';
`, 'heartwood-sites');

test('layout is deterministic per seed and varies across seeds', () => {
  const a = sites.getHeartwoodLayout(12345);
  const b = sites.getHeartwoodLayout(12345);
  assert.deepEqual(a, b);
  const c = sites.getHeartwoodLayout(999);
  assert.notDeepEqual(a.amphitheater, c.amphitheater);
});

test('chain order reads meadow -> downs -> keep -> grove -> vault', () => {
  const layout = sites.getHeartwoodLayout(12345);
  const d = (p) => Math.hypot(p.x, p.z);
  assert.ok(d(layout.amphitheater) < d(layout.keep), 'downs inside keep');
  assert.ok(d(layout.keep) < d(layout.stagAmphitheater), 'keep inside grove');
  assert.ok(d(layout.stagAmphitheater) <= 1400, 'grove within disc');
  assert.ok(d(layout.vaultEntrance) <= 1550, 'vault within reach');
  assert.ok(d(layout.mill) <= 1150, 'mill within reach');
});

test('all reserved sites sit inside the Heartwood disc without overlaps', () => {
  for (const seed of [1, 12345, 777777, 2147483647]) {
    const volumes = sites.getHeartwoodSites(seed);
    assert.ok(volumes.length >= 20, `seed ${seed} reserves enough sites`);
    for (const v of volumes) {
      assert.ok(Math.hypot(v.x, v.z) < 1600, `${v.id} inside disc`);
    }
    for (let i = 0; i < volumes.length; i++) {
      for (let j = i + 1; j < volumes.length; j++) {
        const a = volumes[i];
        const b = volumes[j];
        const dist = Math.hypot(a.x - b.x, a.z - b.z);
        assert.ok(
          dist >= a.radius + b.radius - 30,
          `seed ${seed}: ${a.id} overlaps ${b.id} (dist ${Math.round(dist)})`,
        );
      }
    }
  }
});

test('sub-biome classifier covers the chain volumes', () => {
  const seed = 12345;
  const layout = sites.getHeartwoodLayout(seed);
  assert.equal(sites.getHeartwoodSubBiome(0, 0, seed), 'meadow');
  assert.equal(sites.getHeartwoodSubBiome(layout.amphitheater.x, layout.amphitheater.z, seed), 'downs');
  assert.equal(sites.getHeartwoodSubBiome(layout.keep.x, layout.keep.z, seed), 'briar');
  assert.equal(sites.getHeartwoodSubBiome(layout.stagAmphitheater.x, layout.stagAmphitheater.z, seed), 'grove');
  assert.equal(sites.getHeartwoodSubBiome(5000, 5000, seed), null);
});

test('underwood overlay is depth-gated inside the disc', () => {
  const seed = 12345;
  assert.equal(sites.isHeartwoodUnderwood(0, 0, 30, seed), true);
  assert.equal(sites.isHeartwoodUnderwood(0, 0, 60, seed), false);
  assert.equal(sites.isHeartwoodUnderwood(5000, 5000, 0, seed), false);
});

test('height override stays near natural terrain with rim blend', () => {
  const seed = 12345;
  const layout = sites.getHeartwoodLayout(seed);
  const { x, z } = layout.amphitheater;
  // Center: pulled toward the datum by at most 3.
  for (const natural of [60, 72, 85]) {
    const h = sites.getHeartwoodHeightOverride(x, z, seed, natural);
    assert.ok(h !== null);
    assert.ok(Math.abs(h - natural) <= 3, `center ${natural} -> ${h}`);
  }
  // Far outside: null (natural terrain).
  assert.equal(sites.getHeartwoodHeightOverride(x + 200, z, seed, 70), null);
  // Rim blends: never a cliff step larger than the natural delta + 3.
  const r = 42;
  const rim = sites.getHeartwoodHeightOverride(x + r - 2, z, seed, 70);
  assert.ok(rim !== null && Math.abs(rim - 70) <= 3);
});
