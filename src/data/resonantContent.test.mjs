import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const definitions = read('src/data/resonantDefinitions.ts');
const recipes = read('src/data/resonantRecipes.ts');
const textures = read('src/systems/textures/resonantTexturePixels.ts');
const atlasManager = read('src/systems/textures/TextureAtlasManager.ts');
const index = read('src/index.tsx');

const WORLD_NAMES = [
  'ECHO_STONE','ECHO_BRICKS','CRACKED_ECHO_BRICKS','CHISELED_ECHO_STONE',
  'ECHO_MOSAIC','ECHO_CRYSTAL','RESONANCE_PYLON',
  'PULSE_CONDUIT','PHASE_BLOCK','RESONANCE_PLATE','RESONANT_LAMP',
  'ECHO_SPIKES','SENTINEL_CORE','LISTENING_STONE','VAULT_SEAL',
  'ECHO_STONE_SLAB','ECHO_STONE_STAIRS','ECHO_BRICK_SLAB','ECHO_BRICK_STAIRS',
];
const ITEM_NAMES = [
  'ECHO_SHARD','ECHO_DUST','ECHO_CORE','FRACTURED_CORE',
  'VAULTSTEEL_SPEAR','VAULT_CROSSBOW','VAULT_BOLT','BELLBREAKER_MAUL',
  'ECHO_TUNING_FORK','TITAN_HAMMER',
];

test('all resonant blocks and items register into the authoritative BLOCKS table', () => {
  assert.match(definitions, /BLOCKS as Record<number, BlockDef>/);
  for (const name of WORLD_NAMES) assert.match(definitions, new RegExp(`\\[BlockType\\.${name}\\]`));
  for (const name of ITEM_NAMES) assert.match(definitions, new RegExp(`\\[BlockType\\.${name}\\]`));
  assert.match(index, /resonantInit/);
});

test('inventory-only resonant content is explicitly marked and world blocks are not', () => {
  for (const name of ITEM_NAMES) {
    const entry = definitions.match(new RegExp(`\\[BlockType\\.${name}\\]: \\{([^}]+)\\}`))?.[1] ?? '';
    assert.match(entry, /isItem:\s*true/, `${name} must be inventory-only`);
  }
  for (const name of WORLD_NAMES) {
    const entry = definitions.match(new RegExp(`\\[BlockType\\.${name}\\]: \\{([^}]+)\\}`))?.[1] ?? '';
    assert.doesNotMatch(entry, /isItem:\s*true/, `${name} must remain world-placeable`);
  }
});

test('echo crystal drops shards and active vault blocks emit light', () => {
  assert.match(definitions, /BlockType\.ECHO_CRYSTAL[\s\S]{0,420}drops:\s*\[\{\s*type:\s*BlockType\.ECHO_SHARD/);
  for (const name of ['ECHO_CRYSTAL','RESONANCE_PYLON','PULSE_CONDUIT','RESONANT_LAMP','SENTINEL_CORE','LISTENING_STONE']) {
    assert.match(definitions, new RegExp(`BlockType\\.${name}[\\s\\S]{0,380}lightLevel:`));
  }
});

test('building recipes remain without prototype gadget recipes', () => {
  assert.match(recipes, /BlockType\.ECHO_SHARD,\s*BlockType\.ECHO_SHARD[\s\S]{0,120}BlockType\.ECHO_DUST,\s*count:\s*4/);
  assert.match(recipes, /RESONANT_SHAPE_FAMILIES\.flatMap/);
  assert.doesNotMatch(recipes, /output:\s*\{\s*type:\s*BlockType\.RESONATOR/);
  assert.doesNotMatch(recipes, /output:\s*\{\s*type:\s*BlockType\.PULSE_BRACER/);
});

test('resonant content has deterministic pixel art integrated into the shared atlas', () => {
  assert.match(textures, /RESONANT_TEXTURE_SLOTS/);
  assert.match(textures, /paintResonantTextureTiles/);
  assert.match(textures, /getResonantTilePixels/);
  assert.match(textures, /Uint8ClampedArray/);
  assert.match(textures, /createImageData/);
  assert.doesNotMatch(textures, /Math\.random/);
  assert.match(atlasManager, /paintResonantTextureTiles\(canvas\)/);
});

test('all 25 authored resonant texture slots are unique', () => {
  // Slot 244 was the unimplemented Resonance Door and is retired with it.
  const block = textures.match(/RESONANT_TEXTURE_SLOTS = \{([\s\S]*?)\} as const/)?.[1] ?? '';
  const matches = [...block.matchAll(/:\s*(\d+),/g)].map((match) => Number(match[1]));
  assert.equal(matches.length, 25);
  assert.equal(new Set(matches).size, 25);
  assert.equal(Math.min(...matches), 237);
  assert.equal(Math.max(...matches), 266);
  assert.equal(matches.includes(244), false);
});
