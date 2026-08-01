import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { build } from 'esbuild';

const root = path.resolve(import.meta.dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const bundle = await build({
  entryPoints: [path.join(root, 'src/components/bellTitanModel.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  write: false,
});
const model = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

test('the Titan has a bell, chains, asymmetric hammer arms, and no Mason anatomy', () => {
  const names = model.BELL_TITAN_MODEL.parts.map((part) => part.name);
  for (const required of [
    'hanging_bell', 'bell_clapper', 'left_chain', 'right_chain',
    'bell_crown', 'bell_lower', 'bell_corner_left', 'bell_corner_right',
    'left_hammer', 'right_hammer', 'left_hammer_spur', 'right_hammer_spur',
    'chest_cage_left', 'chest_cage_right', 'face_resonator',
  ]) assert.ok(names.includes(required), `${required} missing`);
  assert.equal(names.some((name) => /mason|trowel|wall|remesh/i.test(name)), false);
  assert.ok(model.BELL_TITAN_MODEL.height >= 6.4);
  assert.notDeepEqual(
    model.BELL_TITAN_MODEL.parts.find((part) => part.name === 'left_hammer').size,
    model.BELL_TITAN_MODEL.parts.find((part) => part.name === 'right_hammer').size,
  );
});

test('shell stages permanently remove outer armor and expose more of the bell', () => {
  const stage0 = model.getBellTitanVisibleParts(0);
  const stage1 = model.getBellTitanVisibleParts(1);
  const stage2 = model.getBellTitanVisibleParts(2);
  assert.ok(stage0.length > stage1.length);
  assert.ok(stage1.length > stage2.length);
  assert.ok(stage2.includes('hanging_bell'));
  assert.ok(stage2.includes('bell_clapper'));
  assert.equal(stage2.some((name) => /outer_shell|shoulder_shell/.test(name)), false);
});

test('every encounter action samples a finite authored pose with readable contacts', () => {
  for (const action of model.BELL_TITAN_ACTIONS) {
    for (const progress of [0, 0.25, 0.5, 0.75, 1]) {
      const pose = model.sampleBellTitanPose(action, progress, 4.25);
      for (const value of Object.values(pose)) {
        if (typeof value === 'number') assert.ok(Number.isFinite(value), `${action} produced a non-finite value`);
      }
    }
  }
  assert.ok(model.sampleBellTitanPose('slam_windup', 0.75, 0).rightHammerX < -1);
  assert.ok(Math.abs(model.sampleBellTitanPose('sweep_active', 0.5, 0).torsoYaw) > 0.5);
  assert.ok(Math.abs(model.sampleBellTitanPose('chain_lash_active', 0.75, 0).rightHammerZ) > 0.5);
  assert.ok(model.sampleBellTitanPose('vaultbreaker_windup', 0.8, 0).rightHammerX < -1.4);
  assert.ok(Math.abs(model.sampleBellTitanPose('resonance_cage_active', 0.5, 0).clapperSwing) > 0.2);
  assert.ok(Math.abs(model.sampleBellTitanPose('core_open', 0.5, 0).bellSwingZ) > 0.08);
  assert.ok(model.sampleBellTitanPose('death', 1, 0).rootY < -1.5);
});

test('the dedicated renderer owns Titan hit zones, world lighting, and non-neon texture', () => {
  const renderer = read('src/components/BellTitanRenderer.tsx');
  const entities = read('src/components/EntityRenderer.tsx');
  const effects = read('src/components/ResonantEffectsRenderer.tsx');
  assert.match(renderer, /bell_titan\.png/);
  assert.match(renderer, /MeshLambertMaterial/);
  assert.match(renderer, /hanging_bell/);
  assert.match(renderer, /hitZone:\s*['"]core['"]/);
  assert.match(renderer, /getBellTitanVisibleParts/);
  assert.match(renderer, /TITAN_LIGHT_OFFSETS/);
  assert.match(renderer, /getArenaAnchor\(\)/);
  assert.match(renderer, /getImpacts\(\)/);
  assert.match(renderer, /getLanes\(\)/);
  assert.match(renderer, /sectorTelegraphRef/);
  assert.match(renderer, /lineTelegraphRef/);
  assert.match(renderer, /diskTelegraphRef/);
  assert.match(renderer, /actionTime \/ getBellTitanActionDuration\(['"]awaken['"]\)/);
  assert.doesNotMatch(renderer, /actionTime \/ 8/);
  assert.match(renderer, /const lightAnchor = arenaAnchor \?\? anchor/);
  assert.match(renderer, /light\.position\.set\(lightAnchor\.x \+ offset\[0\]/);
  assert.match(renderer, /headRef\.current\.rotation\.x = pose\.headX/);
  assert.match(renderer, /clapperRef\.current\.rotation\.x = pose\.clapperSwing/);
  assert.match(renderer, /Array\.from\(\{ length: TITAN_LIGHT_OFFSETS\.length \}/);
  assert.match(renderer, /for \(const ring of ringRefs\.current\)[^\n]*ring\.visible = false/);
  assert.match(renderer, /for \(const piece of debrisRefs\.current\)[^\n]*piece\.visible = false/);
  assert.doesNotMatch(renderer, /neon|bloom|MeshBasicMaterial|magnetic_warden/i);
  assert.match(entities, /'bell_titan'/);
  assert.match(effects, /<BellTitanRenderer/);
});

test('the Titan texture is opaque, substantial, and keeps warm accents restrained', () => {
  const texturePath = path.join(root, 'public/assets/rvx/textures/entities/bell_titan.png');
  const bytes = fs.readFileSync(texturePath);
  assert.ok(bytes.length >= 650);
  assert.equal(bytes.subarray(1, 4).toString('ascii'), 'PNG');
  const pixels = read('src/systems/textures/resonantEntityTexturePixels.ts');
  assert.match(pixels, /bellTitan/);
  assert.match(pixels, /EmissiveFraction[^\n]*0\.0[0-5]/);
});
