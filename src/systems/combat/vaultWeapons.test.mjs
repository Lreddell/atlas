import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { build } from 'esbuild';

const root = path.resolve(import.meta.dirname, '../../..');
const bundled = await build({
  entryPoints: [path.join(root, 'src/systems/combat/vaultWeapons.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  write: false,
});
const { getVaultWeaponProfile, isEchoArtifact, resolveVaultMeleeHit } = await import(
  `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`
);
const Item = Object.freeze({ SPEAR: 182, CROSSBOW: 183, MAUL: 185, FORK: 186, HAMMER: 187 });

test('vault weapons have distinct conventional tradeoffs', () => {
  assert.deepEqual(getVaultWeaponProfile(Item.SPEAR), { kind: 'spear', damage: 6, reach: 5.4, cooldownSeconds: 0.58, stagger: 0.35, durabilityCost: 1 });
  assert.deepEqual(getVaultWeaponProfile(Item.CROSSBOW), { kind: 'crossbow', damage: 7, reach: 64, cooldownSeconds: 1.15, stagger: 0.25, durabilityCost: 1 });
  assert.deepEqual(getVaultWeaponProfile(Item.MAUL), { kind: 'maul', damage: 9, reach: 4.2, cooldownSeconds: 1.05, stagger: 1, durabilityCost: 1 });
  assert.deepEqual(getVaultWeaponProfile(Item.HAMMER), { kind: 'hammer', damage: 11, reach: 4.4, cooldownSeconds: 1.1, stagger: 1.25, durabilityCost: 1 });
});

test('heavy weapons pressure armor while resistance reduces stagger rather than deleting it', () => {
  assert.equal(resolveVaultMeleeHit(Item.MAUL, { armored: true }).armorMultiplier, 1.65);
  assert.equal(resolveVaultMeleeHit(Item.SPEAR, { armored: true }).armorMultiplier, 1);
  assert.equal(resolveVaultMeleeHit(Item.HAMMER, { armored: true, staggerResistance: 0.4 }).stagger, 0.75);
  assert.equal(resolveVaultMeleeHit(Item.MAUL, { armored: true }).damage, 14.85);
  assert.equal(resolveVaultMeleeHit(Item.MAUL, { armored: true }).technique, 'armor_break');
  assert.equal(resolveVaultMeleeHit(Item.HAMMER, { armored: false }).technique, 'titan_crush');
});

test('the spear rewards deliberate tip spacing instead of behaving like a longer sword', () => {
  const close = resolveVaultMeleeHit(Item.SPEAR, { armored: false }, { distance: 1.2 });
  const normal = resolveVaultMeleeHit(Item.SPEAR, { armored: false }, { distance: 2.4 });
  const sweetSpot = resolveVaultMeleeHit(Item.SPEAR, { armored: false }, { distance: 4.1 });
  assert.equal(close.technique, 'standard');
  assert.equal(sweetSpot.technique, 'spear_sweet_spot');
  assert.ok(close.damage < normal.damage);
  assert.ok(sweetSpot.damage > normal.damage);
  assert.ok(sweetSpot.stagger > normal.stagger);
});

test('the Tuning Fork is the sole artifact and never resolves as a weapon', () => {
  assert.equal(isEchoArtifact(Item.FORK), true);
  assert.equal(getVaultWeaponProfile(Item.FORK), null);
  assert.equal(resolveVaultMeleeHit(Item.FORK, { armored: true }), null);
});

test('interaction and held rendering use profiles, ammo, physical bolts, and distinct valid-use animation events', () => {
  const interaction = fs.readFileSync(path.join(root, 'src/components/controllers/InteractionController.tsx'), 'utf8');
  const held = fs.readFileSync(path.join(root, 'src/components/HeldItem.tsx'), 'utf8');
  const runtime = fs.readFileSync(path.join(root, 'src/systems/world/ResonantVaultRuntime.ts'), 'utf8');
  const effects = fs.readFileSync(path.join(root, 'src/components/ResonantEffectsRenderer.tsx'), 'utf8');
  const loop = fs.readFileSync(path.join(root, 'src/components/GameLoop.tsx'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'src/App.tsx'), 'utf8');
  assert.match(interaction, /getVaultWeaponProfile/);
  assert.match(interaction, /vaultProjectileSystem\.fire/);
  assert.match(interaction, /BlockType\.VAULT_BOLT/);
  assert.match(interaction, /atlas:weapon-used/);
  assert.match(interaction, /damageHeldItem/);
  assert.match(interaction, /distance: hit\.dist/);
  assert.match(interaction, /resolved\.technique === 'titan_crush'/);
  assert.ok(interaction.indexOf('targetType === BlockType.CHEST') < interaction.indexOf('heldForUse?.type === BlockType.VAULT_CROSSBOW'));
  assert.match(held, /atlas:weapon-used/);
  assert.match(held, /kind === 'spear'/);
  assert.match(held, /kind === 'crossbow'/);
  assert.match(held, /kind === 'maul' \|\| kind === 'hammer'/);
  assert.match(runtime, /useTuningFork/);
  assert.match(runtime, /input\.heldItem !== BlockType\.ECHO_TUNING_FORK/);
  assert.match(effects, /vaultProjectileSystem\.getRenderState/);
  assert.match(loop, /vaultProjectileSystem\.tick\(FIXED_DT\)/);
  assert.match(loop, /vaultProjectileSystem\.clear\(\)/);
  assert.match(app, /entityManager\.clear\(\);\s+vaultProjectileSystem\.clear\(\);/);
});
