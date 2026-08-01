import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import path from 'node:path';
import test from 'node:test';
import { build } from 'esbuild';

const root = path.resolve(import.meta.dirname, '../../..');
const bundle = await build({
  absWorkingDir: root,
  bundle: true,
  format: 'esm',
  platform: 'node',
  stdin: {
    contents: `
      import { BlockType } from './src/types.ts';
      import { BLOCKS } from './src/data/blocks.ts';
      import { RESONANT_RECIPES } from './src/data/resonantRecipes.ts';
      import { getItemCatalogEntry, isInventoryOnlyItemId } from './src/systems/registry/itemCatalog.ts';
      import { isWorldBlockId } from './src/systems/registry/worldBlockCatalog.ts';
      import { getItemStats, isVaultRangedWeapon, isVaultWeapon } from './src/systems/registry/itemStats.ts';
      import { RESONANT_SHAPE_FAMILIES } from './src/systems/registry/blockFamilies.ts';
      import { getResonantTilePixels } from './src/systems/textures/resonantTexturePixels.ts';
      export { BlockType, BLOCKS, RESONANT_RECIPES, getItemCatalogEntry, isInventoryOnlyItemId, isWorldBlockId, getItemStats, isVaultRangedWeapon, isVaultWeapon, RESONANT_SHAPE_FAMILIES, getResonantTilePixels };
    `,
    resolveDir: root,
    sourcefile: 'resonant-definitive-content-entry.ts',
  },
  write: false,
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`;
const {
  BlockType,
  BLOCKS,
  RESONANT_RECIPES,
  getItemCatalogEntry,
  isInventoryOnlyItemId,
  isWorldBlockId,
  getItemStats,
  isVaultRangedWeapon,
  isVaultWeapon,
  RESONANT_SHAPE_FAMILIES,
  getResonantTilePixels,
} = await import(moduleUrl);

const expected = {
  ECHO_STONE_SLAB: 178,
  ECHO_STONE_STAIRS: 179,
  ECHO_BRICK_SLAB: 180,
  ECHO_BRICK_STAIRS: 181,
  VAULTSTEEL_SPEAR: 182,
  VAULT_CROSSBOW: 183,
  VAULT_BOLT: 184,
  BELLBREAKER_MAUL: 185,
  ECHO_TUNING_FORK: 186,
  TITAN_HAMMER: 187,
};

test('definitive vault IDs, classification, shapes, and weapon stats are exact', () => {
  for (const [name, id] of Object.entries(expected)) assert.equal(BlockType[name], id);
  for (const id of [178, 179, 180, 181]) {
    assert.equal(isWorldBlockId(id), true);
    assert.equal(isInventoryOnlyItemId(id), false);
  }
  for (const id of [182, 183, 184, 185, 186, 187]) {
    assert.equal(isInventoryOnlyItemId(id), true);
    assert.equal(isWorldBlockId(id), false);
    assert.ok(getItemCatalogEntry(id));
  }
  assert.equal(BLOCKS[BlockType.ECHO_STONE_SLAB].shape, 'slab');
  assert.equal(BLOCKS[BlockType.ECHO_STONE_STAIRS].shape, 'stairs');
  assert.equal(BLOCKS[BlockType.ECHO_BRICK_SLAB].textureParent, BlockType.ECHO_BRICKS);
  assert.equal(isVaultWeapon(BlockType.VAULTSTEEL_SPEAR), true);
  assert.equal(isVaultWeapon(BlockType.VAULT_CROSSBOW), true);
  assert.equal(isVaultRangedWeapon(BlockType.VAULT_CROSSBOW), true);
  assert.ok(getItemStats({ type: BlockType.BELLBREAKER_MAUL, count: 1 })?.attack);
  for (const retired of [172, 174, 175, 176]) assert.equal(BLOCKS[retired], undefined);
  assert.equal(BLOCKS[188], undefined);
  assert.equal(BLOCKS[189], undefined);
});

test('shape families, crafting outputs, and weapon icons are complete and distinct', () => {
  assert.deepEqual(
    RESONANT_SHAPE_FAMILIES.map(({ material, slab, stairs }) => [material, slab, stairs]),
    [
      [BlockType.ECHO_STONE, BlockType.ECHO_STONE_SLAB, BlockType.ECHO_STONE_STAIRS],
      [BlockType.ECHO_BRICKS, BlockType.ECHO_BRICK_SLAB, BlockType.ECHO_BRICK_STAIRS],
    ],
  );
  for (const output of [
    BlockType.ECHO_STONE_SLAB,
    BlockType.ECHO_STONE_STAIRS,
    BlockType.ECHO_BRICK_SLAB,
    BlockType.ECHO_BRICK_STAIRS,
  ]) {
    assert.equal(RESONANT_RECIPES.some((recipe) => recipe.output.type === output), true, `missing recipe for ${output}`);
  }

  const icons = [261, 262, 263, 264, 265, 266].map((slot) => getResonantTilePixels(slot));
  for (const pixels of icons) {
    let opaquePixels = 0;
    for (let index = 3; index < pixels.length; index += 4) if (pixels[index] > 0) opaquePixels += 1;
    assert.ok(opaquePixels >= 18, `icon has only ${opaquePixels} opaque pixels`);
  }
  assert.equal(new Set(icons.map((pixels) => Buffer.from(pixels).toString('base64'))).size, icons.length);
});
