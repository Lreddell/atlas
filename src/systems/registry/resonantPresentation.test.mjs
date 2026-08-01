import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { build } from 'esbuild';

const root = path.resolve(import.meta.dirname, '../../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const textures = read('src/utils/textures.ts');
const manager = read('src/systems/textures/TextureAtlasManager.ts');
const slot = read('src/components/ui/Slot.tsx');
const tooltips = read('src/systems/registry/itemTooltips.ts');
const guide = read('src/data/resonantGuide.ts');
const inventory = read('src/components/ui/InventoryUI.tsx');
const definitions = read('src/data/resonantDefinitions.ts');
const runtime = read('src/systems/world/ResonantVaultRuntime.ts');
const tileBundle = await build({
  entryPoints: [path.join(root, 'src/systems/textures/resonantTexturePixels.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  write: false,
});
const tileModule = await import(`data:text/javascript;base64,${Buffer.from(tileBundle.outputFiles[0].text).toString('base64')}`);
const { getResonantTilePixels, RESONANT_TEXTURE_SLOTS } = tileModule;

const CONTENT_NAMES = [
  'ECHO_STONE','ECHO_BRICKS','CRACKED_ECHO_BRICKS','CHISELED_ECHO_STONE',
  'ECHO_MOSAIC','ECHO_CRYSTAL','RESONANCE_PYLON',
  'PULSE_CONDUIT','PHASE_BLOCK','RESONANCE_PLATE','RESONANT_LAMP',
  'ECHO_SPIKES','SENTINEL_CORE','LISTENING_STONE','VAULT_SEAL',
  'ECHO_SHARD','ECHO_DUST','ECHO_CORE','FRACTURED_CORE',
  'VAULTSTEEL_SPEAR','VAULT_CROSSBOW','VAULT_BOLT','BELLBREAKER_MAUL',
  'ECHO_TUNING_FORK','TITAN_HAMMER',
];

test('the final painted canvas is republished to every atlas consumer', () => {
  assert.match(textures, /export const publishAtlasCanvas/);
  assert.match(textures, /cachedAtlasCanvas = canvas/);
  assert.match(textures, /cachedAtlasURL = canvas\.toDataURL\(\)/);
  assert.match(manager, /paintResonantTextureTiles\(canvas\)[\s\S]{0,120}publishAtlasCanvas\(canvas\)/);
  assert.equal((manager.match(/publishAtlasCanvas\(canvas\)/g) ?? []).length, 2);
});

test('slot rendering classifies cutout blocks from metadata rather than an exception list', () => {
  assert.match(slot, /blockDef\.transparent\s*&&\s*blockDef\.noCollision/);
  assert.doesNotMatch(slot, /item\.type !== BlockType\.ECHO_CRYSTAL/);
  assert.doesNotMatch(slot, /item\.type !== BlockType\.ECHO_SPIKES/);
  assert.match(slot, /ATLAS_UPDATED_EVENT/);
  assert.match(slot, /setAtlasVersion/);
  assert.match(slot, /blockDef\.textureSlot \?\? 0/);
});

test('all Resonant blocks and items have player-facing purpose text', () => {
  for (const name of CONTENT_NAMES) assert.match(guide, new RegExp(`BlockType\\.${name}`));
  assert.match(tooltips, /tone:\s*'purpose'/);
  assert.match(inventory, /line\.tone === 'purpose'/);
  assert.match(inventory, /text-\[#c8dedb\]/);
});

function opaquePixels(slot) {
  const data = getResonantTilePixels(slot);
  const pixels = [];
  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3] === 0) continue;
    pixels.push([data[index], data[index + 1], data[index + 2], data[index + 3]]);
  }
  return pixels;
}

const isBrightSeaGlass = ([r, g, b]) => g >= 145 && b >= 135 && g > r * 1.14;
const isPurple = ([r, g, b]) => r >= 70 && b >= 105 && b > r * 1.2 && b > g * 1.08;

test('ordinary Resonant blocks are muted and functional accents stay below fifteen percent', () => {
  const exempt = new Set([RESONANT_TEXTURE_SLOTS.echoCrystal, RESONANT_TEXTURE_SLOTS.resonantLamp]);
  // Iterate the registered block slots (237-252 minus the retired door's 244).
  const blockSlots = Object.values(RESONANT_TEXTURE_SLOTS)
    .filter((slot) => slot >= RESONANT_TEXTURE_SLOTS.echoStone && slot <= RESONANT_TEXTURE_SLOTS.vaultSeal);
  for (const slot of blockSlots) {
    const pixels = opaquePixels(slot);
    assert.ok(pixels.length > 0, `slot ${slot} is empty`);
    const brightFraction = pixels.filter(isBrightSeaGlass).length / pixels.length;
    if (!exempt.has(slot)) assert.ok(brightFraction < 0.15, `slot ${slot} has ${brightFraction} bright accent coverage`);
    assert.equal(pixels.some(isPurple), false, `slot ${slot} contains purple identity pixels`);
  }
  for (const slot of [
    RESONANT_TEXTURE_SLOTS.echoStone,
    RESONANT_TEXTURE_SLOTS.echoBricks,
    RESONANT_TEXTURE_SLOTS.crackedEchoBricks,
    RESONANT_TEXTURE_SLOTS.chiseledEchoStone,
    RESONANT_TEXTURE_SLOTS.echoMosaic,
  ]) {
    const pixels = opaquePixels(slot);
    const muted = pixels.filter(([r, g, b]) => Math.max(r, g, b) < 150 && Math.max(r, g, b) - Math.min(r, g, b) < 75);
    assert.ok(muted.length / pixels.length > 0.9, `masonry slot ${slot} is not predominantly muted stone`);
  }
});

test('important blocks and all content tiles keep distinct authored signatures', () => {
  const signatures = new Map();
  for (const slot of Object.values(RESONANT_TEXTURE_SLOTS)) {
    const signature = Buffer.from(getResonantTilePixels(slot)).toString('base64');
    assert.equal(signatures.has(signature), false, `slot ${slot} duplicates slot ${signatures.get(signature)}`);
    signatures.set(signature, slot);
  }
  for (const [a, b] of [
    ['vaultSeal', 'resonantLamp'],
    ['phaseBlock', 'chiseledEchoStone'],
    ['resonancePylon', 'pulseConduit'],
    ['vaultsteelSpear', 'echoTuningFork'],
  ]) {
    assert.notDeepEqual(
      getResonantTilePixels(RESONANT_TEXTURE_SLOTS[a]),
      getResonantTilePixels(RESONANT_TEXTURE_SLOTS[b]),
    );
  }
});

test('non-light tiles contain no full-width luminous cross or repeated circuit grid', () => {
  for (const slot of Object.values(RESONANT_TEXTURE_SLOTS)) {
    if (slot === RESONANT_TEXTURE_SLOTS.echoCrystal || slot === RESONANT_TEXTURE_SLOTS.resonantLamp) continue;
    const data = getResonantTilePixels(slot);
    for (let axis = 0; axis < 16; axis += 1) {
      let row = 0;
      let column = 0;
      for (let offset = 0; offset < 16; offset += 1) {
        const rowIndex = (axis * 16 + offset) * 4;
        const columnIndex = (offset * 16 + axis) * 4;
        if (isBrightSeaGlass([data[rowIndex], data[rowIndex + 1], data[rowIndex + 2]])) row += 1;
        if (isBrightSeaGlass([data[columnIndex], data[columnIndex + 1], data[columnIndex + 2]])) column += 1;
      }
      assert.ok(row < 12 && column < 12, `slot ${slot} contains a full-tile luminous line`);
    }
  }
});

test('world lighting and pulse feedback reserve brightness for actual fixtures', () => {
  assert.doesNotMatch(definitions, /#655993|lightLevel:\s*9/);
  assert.match(definitions, /RESONANCE_PYLON[^\n]+lightLevel:\s*3/);
  assert.match(definitions, /PULSE_CONDUIT[^\n]+lightLevel:\s*2/);
  assert.match(definitions, /PHASE_BLOCK[^\n]+lightLevel:\s*2/);
  assert.match(definitions, /SENTINEL_CORE[^\n]+lightLevel:\s*6/);
  assert.match(definitions, /LISTENING_STONE[^\n]+lightLevel:\s*3/);
  assert.doesNotMatch(runtime, /\[0\.72,\s*0\.48,\s*0\.95\]|\[0\.55,\s*0\.4,\s*0\.85\]|\[0\.75,\s*0\.35,\s*0\.72\]/);
  assert.match(runtime, /\[0\.47,\s*0\.58,\s*0\.55\]/);
  assert.match(runtime, /\[0\.72,\s*0\.69,\s*0\.59\]/);
});
