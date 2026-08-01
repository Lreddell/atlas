import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { build } from 'esbuild';

const root = path.resolve(import.meta.dirname, '../..');
const bundle = await build({
  entryPoints: [path.join(root, 'src/components/resonantVaultEnemyModels.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  write: false,
});
const models = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const textureBundle = await build({
  entryPoints: [path.join(root, 'src/systems/textures/resonantEntityTexturePixels.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  write: false,
});
const textures = await import(`data:text/javascript;base64,${Buffer.from(textureBundle.outputFiles[0].text).toString('base64')}`);

const KINDS = ['vault_guard', 'vault_marksman', 'bell_hound', 'tollkeeper'];
const CLIPS = ['idle', 'alert', 'turn', 'move', 'anticipation', 'attack', 'recovery', 'hurt', 'stagger', 'death'];

for (const kind of KINDS) {
  test(`${kind} has a distinct segmented silhouette and complete animation set`, () => {
    const model = models.VAULT_ENEMY_MODELS[kind];
    assert.ok(model.parts.length >= 10, `${kind} needs enough segments to read as an authored model`);
    assert.match(model.texture, new RegExp(`/entities/${kind}\\.png$`));
    assert.equal(model.visualScale.length, 3);
    assert.equal(model.visualScale.every((value) => Number.isFinite(value) && value > 0), true);
    assert.equal(new Set(model.parts.map((part) => part.id)).size, model.parts.length);
    assert.equal(model.parts.some((part) => part.parent && !model.parts.some((candidate) => candidate.id === part.parent)), false);
    for (const clip of CLIPS) {
      const pose = models.sampleVaultEnemyAnimation(kind, clip, 0.5, 1.25);
      const values = [
        ...pose.rootPosition,
        ...pose.rootRotation,
        ...Object.values(pose.partRotations).flat(),
        ...Object.values(pose.partPositions).flat(),
        ...Object.values(pose.partScales).flat(),
      ];
      assert.ok(values.length >= 6);
      assert.equal(values.every(Number.isFinite), true, `${kind}:${clip} emitted an invalid transform`);
    }
  });
}

test('all four enemies have independent silhouette signatures', () => {
  const signatures = KINDS.map((kind) => {
    const model = models.VAULT_ENEMY_MODELS[kind];
    return `${model.bodyPlan}:${model.parts.map((part) => `${part.shape}:${part.size.join(',')}`).join('|')}`;
  });
  assert.equal(new Set(signatures).size, KINDS.length);
});

test('secondary attacks own readable poses instead of reusing the primary swing', () => {
  const actions = {
    vault_guard: ['guard_sweep', 'shield_bash'],
    vault_marksman: ['crossbow_shot', 'crossbow_volley'],
    bell_hound: ['hound_leap', 'hound_rake'],
    tollkeeper: ['hammer_strike', 'bell_toll', 'breaker_charge'],
  };
  for (const [kind, ids] of Object.entries(actions)) {
    const signatures = ids.map((id) => JSON.stringify(models.sampleVaultEnemyAnimation(kind, 'attack', 0.5, 1.25, id)));
    assert.equal(new Set(signatures).size, ids.length, `${kind} action poses must stay distinct`);
  }
});

test('enemy texture sheets are opaque, independently painted, and keep functional highlights restrained', () => {
  const signatures = new Set();
  for (const kind of KINDS) {
    const pixels = textures.getResonantEntityTexturePixels(kind);
    assert.equal(pixels.length, textures.RESONANT_ENTITY_TEXTURE_WIDTH * textures.RESONANT_ENTITY_TEXTURE_HEIGHT * 4);
    for (let offset = 3; offset < pixels.length; offset += 4) assert.equal(pixels[offset], 255);
    assert.ok(textures.getResonantEntityEmissivePixelFraction(kind) < 0.08);
    signatures.add(Buffer.from(pixels).toString('base64'));

    const png = fs.readFileSync(path.join(root, `public/assets/rvx/textures/entities/${kind}.png`));
    assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.equal(png.readUInt32BE(16), textures.RESONANT_ENTITY_TEXTURE_WIDTH);
    assert.equal(png.readUInt32BE(20), textures.RESONANT_ENTITY_TEXTURE_HEIGHT);
  }
  assert.equal(signatures.size, KINDS.length);
});

test('the renderer routes only the four definitive enemy kinds through the dedicated presentation', () => {
  const entityRenderer = fs.readFileSync(path.join(root, 'src/components/EntityRenderer.tsx'), 'utf8');
  const effectsRenderer = fs.readFileSync(path.join(root, 'src/components/ResonantEffectsRenderer.tsx'), 'utf8');
  const vaultRenderer = fs.readFileSync(path.join(root, 'src/components/ResonantVaultEnemyRenderer.tsx'), 'utf8');
  assert.match(entityRenderer, /ResonantVaultEnemyRenderer/);
  for (const kind of KINDS) assert.match(entityRenderer, new RegExp(`['"]${kind}['"]`));
  assert.doesNotMatch(entityRenderer, /CUSTOM_RENDERED_ENTITY_KINDS[^;]+echo_sentinel/);
  assert.doesNotMatch(effectsRenderer, /SentinelModel|RESONANT_KINDS/);
  assert.match(vaultRenderer, /entity\.combatAction/);
  assert.match(vaultRenderer, /gameEvents\.on\('entity:died'/);
  assert.match(vaultRenderer, /sampleVaultEnemyAnimation\(visual\.kind, 'death'/);
  assert.match(vaultRenderer, /forcedAnticipationFrames/);
  assert.match(vaultRenderer, /Math\.hypot\(entity\.pos\.x - previous\.x, entity\.pos\.z - previous\.z\)/);
  assert.doesNotMatch(vaultRenderer, /entity\.vel/);
  assert.match(vaultRenderer, /THREE\.NearestFilter/);
  assert.match(vaultRenderer, /MeshLambertMaterial/);
  assert.doesNotMatch(vaultRenderer, /bloom|MeshBasicMaterial|emissiveIntensity\s*=\s*[1-9]/i);
});
