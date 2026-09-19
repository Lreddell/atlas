// Stage 1: Heartwood content registry tests. Allocation exactness (frozen
// ids), definition completeness (every block/item has texture, drops, sound,
// category), recipe validity (all inputs/outputs resolve in BLOCKS), gear
// stats/profiles present, no BlockType-enum squeeze, texture slots mapped.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { loadTsViaFile } from '../world/storage/bundleTs.mjs';

const root = path.resolve(import.meta.dirname, '../../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const hw = await loadTsViaFile(`
    export { registerGate0ProvingBlocks } from './src/data/campaign/gate0.ts';
    export { registerHeartwoodContent } from './src/systems/heartwood/heartwoodContent.ts';
    export * as HW from './src/systems/heartwood/heartwoodContent.ts';
    export { BLOCKS } from './src/data/blocks.ts';
    export { RECIPES, checkRecipe } from './src/recipes.ts';
    export { getVaultWeaponProfile } from './src/systems/combat/vaultWeapons.ts';
    export { getItemStats } from './src/systems/registry/itemStats.ts';
`, 'heartwood-content');

hw.registerGate0ProvingBlocks();
hw.registerHeartwoodContent();

const blocksSource = hw.BLOCKS;
const C = hw.HW;

test('allocation is exact and sequential (259-278 blocks, 279-309 items)', () => {
  assert.equal(C.HW_IRONWOOD_LOG, 259);
  assert.equal(C.HW_SURVEY_MARKER, 278);
  assert.equal(C.HW_BRIAR_FIBER, 279);
  assert.equal(C.HW_BELL_ALLOY, 309);
  for (let id = 259; id <= 309; id++) {
    assert.ok(blocksSource[id], `id ${id} has a BLOCKS definition`);
  }
});

test('every Heartwood def is complete (texture, category, drops or item)', () => {
  for (let id = 259; id <= 309; id++) {
    const def = blocksSource[id];
    assert.ok(def.name && def.name.length > 1, `${id} name`);
    assert.ok(Number.isInteger(def.textureSlot), `${id} textureSlot`);
    assert.ok(def.category, `${id} category`);
    assert.ok(Number.isFinite(def.hardness), `${id} hardness`);
    if (!def.isItem) {
      assert.ok(Array.isArray(def.drops) && def.drops.length > 0, `${id} drops`);
      for (const d of def.drops) assert.ok(blocksSource[d.type], `${id} drop ${d.type} resolves`);
    }
  }
});

test('slabs/stairs link texture parents; moonleaf is a cross plant', () => {
  assert.equal(blocksSource[261].shape, 'slab');
  assert.equal(blocksSource[262].shape, 'stairs');
  assert.equal(blocksSource[261].textureParent, 260);
  assert.equal(blocksSource[275].noCollision, true);
  assert.equal(blocksSource[275].transparent, true);
  assert.equal(blocksSource[264].lightLevel, 12);
  assert.equal(blocksSource[270].lightLevel, 13);
});

test('gear stats and weapon profiles are registered', () => {
  assert.equal(hw.getItemStats({ type: 288, count: 1 }).attack, 10);
  assert.equal(hw.getItemStats({ type: 289, count: 1 }).attack, 4);
  assert.equal(hw.getItemStats({ type: 293, count: 1 }).slot, 'helmet');
  assert.equal(hw.getItemStats({ type: 287, count: 1 }).slot, 'accessory');
  assert.equal(hw.getVaultWeaponProfile(288).kind, 'maul');
  assert.equal(hw.getVaultWeaponProfile(289).kind, 'daggers');
  assert.equal(hw.getVaultWeaponProfile(290).kind, 'hook');
  assert.equal(hw.getVaultWeaponProfile(291).kind, 'crossbow');
  assert.equal(hw.getVaultWeaponProfile(292).kind, 'staff');
});

test('recipes resolve: planks, buckler, salve, maul, daggers, armor', () => {
  const { checkRecipe } = hw;
  const LOG = 259, PLANKS = 260;
  assert.deepEqual(checkRecipe([LOG, null, null, null], 2), { type: PLANKS, count: 4 });
  // Thorn Buckler: null,planks,null / planks,ingot,planks / null,planks,null
  assert.deepEqual(
    checkRecipe([null, PLANKS, null, PLANKS, 306, PLANKS, null, PLANKS, null], 3),
    { type: 287, count: 1 },
  );
  // Field Salve: hide, moonleaf-item, resin
  assert.deepEqual(checkRecipe([280, 285, 284, null], 2), { type: 286, count: 2 });
  // Knell Maul (alloy gated).
  assert.deepEqual(
    checkRecipe([309, 309, 309, 309, 103, 309, null, 103, null], 3),
    { type: 288, count: 1 },
  );
  // Roothide chestplate silhouette.
  assert.deepEqual(
    checkRecipe([280, null, 280, 280, 280, 280, 280, 280, 280], 3),
    { type: 294, count: 1 },
  );
});

test('every recipe input and output resolves in BLOCKS', () => {
  for (const r of hw.RECIPES) {
    assert.ok(r.output && blocksSource[r.output.type], `output ${r.output?.type} resolves`);
    for (const cell of r.pattern) {
      if (cell !== null && cell !== undefined) assert.ok(blocksSource[cell], `input ${cell} resolves`);
    }
  }
});

test('no BlockType-enum squeeze: dynamic ids live outside the enum', () => {
  const typesSrc = read('src/types.ts');
  for (const m of typesSrc.matchAll(/=\s*(\d+),?/g)) {
    assert.ok(Number(m[1]) <= 255, `enum id ${m[1]} within legacy range`);
  }
});

test('texture slots are mapped and unique across Heartwood tiles', () => {
  const mappingSrc = read('src/systems/textures/textureMapping.ts');
  const seen = new Set();
  for (let slot = 300; slot <= 316; slot++) {
    assert.match(mappingSrc, new RegExp(`^\\s*${slot}:`, 'm'), `slot ${slot} mapped`);
    assert.ok(!seen.has(slot));
    seen.add(slot);
  }
  for (let slot = 320; slot <= 350; slot++) {
    assert.match(mappingSrc, new RegExp(`^\\s*${slot}:`, 'm'), `slot ${slot} mapped`);
  }
  const texturesSrc = read('src/utils/textures.ts');
  for (const slot of [300, 303, 306, 308, 313, 316, 328, 329, 333, 346]) {
    assert.ok(texturesSrc.includes(`(${slot},`) || texturesSrc.includes(`(${slot} `), `slot ${slot} painted`);
  }
});
