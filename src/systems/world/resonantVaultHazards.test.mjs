import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { build } from 'esbuild';

const root = path.resolve(import.meta.dirname, '../../..');
const bundle = await build({
  entryPoints: [path.join(root, 'src/systems/world/resonantVaultHazards.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  write: false,
});
const hazards = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const { buildVaultHazards, getTieredHazardTiming, sampleVaultHazard, validateHazardCourse } = hazards;
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('the Fracture Stair has no walkable perimeter bypass', () => {
  const result = validateHazardCourse('fixture:fracture_stair');
  assert.equal(result.safeBypassPaths, 0);
  assert.ok(result.legalTimedPaths >= 1);
  assert.equal(result.mandatoryBeats, 5);
});

test('spikes occupy three-dimensional swept collision volume', () => {
  const result = validateHazardCourse('fixture:spike_lane');
  assert.ok(result.spikeTriangles >= 16);
  assert.ok(result.spikeCollisionHeight > 0.65);
  assert.equal(result.spikesAreCubes, false);
});

test('timed hazards always include a readable warning and a solvable rest window', () => {
  const descriptors = buildVaultHazards('fixture:all');
  for (const descriptor of descriptors.filter((hazard) => hazard.kind !== 'gap')) {
    const base = getTieredHazardTiming(descriptor, 0);
    const urgent = getTieredHazardTiming(descriptor, 3);
    assert.ok(urgent.telegraphSeconds >= 0.55, descriptor.id);
    assert.ok(urgent.restSeconds >= 0.65, descriptor.id);
    assert.ok(urgent.restSeconds < base.restSeconds, descriptor.id);
    const warning = sampleVaultHazard(descriptor, descriptor.phaseOffset + urgent.restSeconds + 0.1, 3);
    assert.equal(warning.telegraphing, true, descriptor.id);
  }
});

test('collapsible landings remove support only after warning and restore every cycle', () => {
  const collapse = buildVaultHazards('fixture:all').find((hazard) => hazard.kind === 'collapse');
  assert.ok(collapse);
  const rest = sampleVaultHazard(collapse, collapse.phaseOffset + 0.1, 0);
  const warning = sampleVaultHazard(collapse, collapse.phaseOffset + collapse.restSeconds + 0.1, 0);
  const dropped = sampleVaultHazard(collapse, collapse.phaseOffset + collapse.restSeconds + collapse.telegraphSeconds + 0.1, 0);
  const restored = sampleVaultHazard(collapse, collapse.phaseOffset + collapse.cycleSeconds + 0.05, 0);
  assert.equal(rest.platformSolid, true);
  assert.equal(warning.platformSolid, true);
  assert.equal(warning.telegraphing, true);
  assert.equal(dropped.platformSolid, false);
  assert.equal(restored.platformSolid, true);
});

test('generation, runtime, renderer, and recorded positional audio own the hazards end to end', () => {
  const generation = read('src/systems/world/resonantVaultGeneration.ts');
  const runtime = read('src/systems/world/ResonantVaultRuntime.ts');
  const renderer = read('src/components/ResonantVaultHazardRenderer.tsx');
  const effects = read('src/components/ResonantEffectsRenderer.tsx');
  const sounds = JSON.parse(read('public/assets/rvx/sounds.json'));
  assert.match(generation, /paintVaultEscapeCourses\(writer, layout\)/);
  assert.match(generation, /getHazardFloorCells/);
  assert.match(runtime, /resonantVaultHazards\.configure/);
  assert.match(runtime, /resonantVaultHazards\.tick/);
  assert.match(runtime, /applyCollapsePlatform/);
  assert.match(runtime, /soundManager\.playAt\('vault\.hazard_warning'/);
  assert.match(renderer, /coneGeometry args=\{\[0\.34, 1, 4\]\}/);
  assert.match(renderer, /crusherHeadRefs/);
  assert.match(renderer, /collisionHeight/);
  assert.match(renderer, /state\.tier === 3/);
  assert.match(renderer, /0x6b2412/);
  assert.doesNotMatch(renderer, /<meshBasicMaterial|<Bloom/);
  assert.match(effects, /<ResonantVaultHazardRenderer \/>/);
  for (const event of ['vault.hazard_warning', 'vault.hazard_strike']) {
    assert.equal(sounds[event].fallback, false);
    assert.ok(sounds[event].sounds.every((cue) => /resonant_vault\/(marksman|tollkeeper|guard)/.test(cue)));
  }
});
