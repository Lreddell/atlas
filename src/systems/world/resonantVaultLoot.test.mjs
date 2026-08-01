import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { Buffer } from 'node:buffer';
import { build } from 'esbuild';

import { getVaultCandidateForCell, getVaultLayout } from './resonantVaults.ts';
import {
  SparseVaultStructureWriter,
  VaultTestBlockType,
  loadVaultGenerationModule,
} from './resonantVaultGeometry.testSupport.mjs';

const root = path.resolve(import.meta.dirname, '../../..');
const lootBundle = await build({
  entryPoints: [path.join(root, 'src/systems/world/resonantVaultLoot.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  write: false,
});
const {
  VAULT_CACHE_FLAG,
  decodeVaultCacheMetadata,
  encodeVaultCacheMetadata,
  getVaultCacheDescriptors,
  getVaultCacheLoot,
  seedVaultCache,
} = await import(`data:text/javascript;base64,${Buffer.from(lootBundle.outputFiles[0].text).toString('base64')}`);
const BlockType = Object.freeze({
  TORCH: 20,
  APPLE: 112,
  VAULTSTEEL_SPEAR: 182,
  VAULT_CROSSBOW: 183,
  VAULT_BOLT: 184,
  BELLBREAKER_MAUL: 185,
  ECHO_TUNING_FORK: 186,
  TITAN_HAMMER: 187,
});

test('critical caches guarantee equipment before its first mandatory use', () => {
  const tuning = getVaultCacheLoot('resonant:4:-2:test', 'tuning', true);
  const armory = getVaultCacheLoot('resonant:4:-2:test', 'armory', true);
  const ranged = getVaultCacheLoot('resonant:4:-2:test', 'ranged', true);
  const heavy = getVaultCacheLoot('resonant:4:-2:test', 'heavy', true);
  const core = getVaultCacheLoot('resonant:4:-2:test', 'core', true);
  assert.equal(tuning.some(({ itemId }) => itemId === BlockType.ECHO_TUNING_FORK), true);
  assert.equal(armory.some(({ itemId }) => itemId === BlockType.VAULTSTEEL_SPEAR), true);
  assert.equal(ranged.some(({ itemId }) => itemId === BlockType.VAULT_CROSSBOW), true);
  assert.ok(ranged.find(({ itemId }) => itemId === BlockType.VAULT_BOLT)?.count >= 16);
  assert.equal(heavy.some(({ itemId }) => itemId === BlockType.BELLBREAKER_MAUL), true);
  assert.equal(core.some(({ itemId }) => itemId === BlockType.TITAN_HAMMER), false);
});

test('optional supplies are deterministic and repeat core loot does not duplicate the Titan Hammer', () => {
  const first = getVaultCacheLoot('resonant:9:8:test', 'annex_1', false);
  assert.deepEqual(first, getVaultCacheLoot('resonant:9:8:test', 'annex_1', false));
  assert.ok(first.length >= 2);
  assert.equal(getVaultCacheLoot('resonant:9:8:test', 'core', false).some(({ itemId }) => itemId === BlockType.TITAN_HAMMER), false);
});

test('weighted cache tables vary between vaults instead of repeating one supply recipe', () => {
  const signatures = new Set();
  const annexSignatures = new Set();
  for (let index = 0; index < 32; index += 1) {
    const vaultId = `resonant:${index}:${index * -3}:variety`;
    signatures.add(getVaultCacheLoot(vaultId, 'antechamber', false).map(({ itemId, count }) => `${itemId}:${count}`).sort().join('|'));
    annexSignatures.add(getVaultCacheLoot(vaultId, `annex_${index % 3}`, false).map(({ itemId, count }) => `${itemId}:${count}`).sort().join('|'));
  }
  assert.ok(signatures.size >= 20, `expected varied supply rolls, saw ${signatures.size}`);
  assert.ok(annexSignatures.size >= 20, `expected varied annex rolls, saw ${annexSignatures.size}`);
});

test('vault cache metadata preserves facing and owns only bits two through five plus its flag', () => {
  for (const id of ['tuning', 'armory', 'ranged', 'heavy', 'antechamber', 'core', 'ascent', 'annex_0', 'annex_1', 'annex_2']) {
    for (let facing = 0; facing < 4; facing += 1) {
      const metadata = encodeVaultCacheMetadata(id, facing);
      assert.equal((metadata & VAULT_CACHE_FLAG) !== 0, true);
      assert.equal(metadata & 0x3, facing);
      assert.deepEqual(decodeVaultCacheMetadata(metadata), { cacheId: id, rotation: facing });
    }
  }
  assert.equal(decodeVaultCacheMetadata(0x40), null, 'Magnetic cache metadata must remain a separate path');
});

test('seeding is idempotent and never overwrites an occupied chest slot', () => {
  const chest = { items: Array(27).fill(null) };
  chest.items[13] = { type: BlockType.APPLE, count: 1 };
  const entries = [
    { slot: 13, itemId: BlockType.ECHO_TUNING_FORK, count: 1 },
    { slot: 14, itemId: BlockType.TORCH, count: 8 },
  ];
  assert.equal(seedVaultCache(chest, entries), 1);
  assert.deepEqual(chest.items[13], { type: BlockType.APPLE, count: 1 });
  assert.deepEqual(chest.items[14], { type: BlockType.TORCH, count: 8 });
  assert.equal(seedVaultCache(chest, entries), 0);
});

test('every definitive layout places caches in authored rooms with an unobstructed teaching approach', () => {
  for (let orientation = 0; orientation < 4; orientation += 1) {
    const candidate = { ...getVaultCandidateForCell(5, -7, 91357), active: true, orientation };
    const layout = getVaultLayout(candidate, 104, (x) => x < candidate.centerX ? 91 : 116);
    const descriptors = getVaultCacheDescriptors(layout);
    for (const id of ['tuning', 'armory', 'ranged', 'heavy', 'antechamber', 'core', 'ascent']) {
      assert.ok(descriptors.some((entry) => entry.id === id), `missing ${id}`);
    }
    assert.equal(descriptors.filter(({ id }) => id.startsWith('annex_')).length, layout.rooms.filter(({ id }) => id.startsWith('annex_')).length);
    assert.equal(new Set(descriptors.map(({ x, y, z }) => `${x},${y},${z}`)).size, descriptors.length);
    for (const descriptor of descriptors) {
      const room = layout.rooms.find(({ id }) => id === descriptor.roomId);
      assert.ok(room);
      assert.equal(descriptor.y, room.y + 1);
      assert.ok(Math.abs(descriptor.x - room.x) <= Math.floor(room.width / 2) - 2);
      assert.ok(Math.abs(descriptor.z - room.z) <= Math.floor(room.depth / 2) - 2);
      assert.equal(descriptor.approach.length >= 2, true);
    }
  }
});

test('the final structure pass paints every cache and preserves its walk-up volume', async () => {
  const { paintResonantVaultStructure } = await loadVaultGenerationModule();
  for (let orientation = 0; orientation < 4; orientation += 1) {
    const candidate = { ...getVaultCandidateForCell(5, -7, 91357), active: true, orientation };
    const getSurfaceY = () => 104;
    const layout = getVaultLayout(candidate, 104, getSurfaceY);
    const writer = new SparseVaultStructureWriter();
    paintResonantVaultStructure(writer, candidate, layout, { seed: 91357, getSurfaceY });
    for (const descriptor of getVaultCacheDescriptors(layout)) {
      const cell = writer.blocks.get(`${descriptor.x},${descriptor.y},${descriptor.z}`);
      assert.equal(cell?.type, 19, `${descriptor.id} chest was overwritten`);
      assert.deepEqual(decodeVaultCacheMetadata(cell.meta), { cacheId: descriptor.id, rotation: descriptor.rotation });
      for (const approach of descriptor.approach) {
        assert.equal(writer.get(approach.x, approach.y, approach.z), VaultTestBlockType.AIR, `${descriptor.id} approach is blocked`);
        assert.equal(writer.get(approach.x, approach.y + 1, approach.z), VaultTestBlockType.AIR, `${descriptor.id} headroom is blocked`);
      }
    }
  }
});

test('WorldManager seeds and spills vault caches through the existing chest path', () => {
  const manager = fs.readFileSync(path.join(root, 'src/systems/WorldManager.ts'), 'utf8');
  const generation = fs.readFileSync(path.join(root, 'src/systems/world/resonantVaultGeneration.ts'), 'utf8');
  const textures = fs.readFileSync(path.join(root, 'src/systems/world/textureResolver.ts'), 'utf8');
  assert.match(manager, /decodeVaultCacheMetadata/);
  assert.match(manager, /getVaultCacheLoot/);
  assert.match(manager, /seedVaultCache/);
  assert.doesNotMatch(manager, /TitanHammerReward/);
  assert.match(manager, /oldRotation & VAULT_CACHE_FLAG/);
  assert.match(generation, /getVaultCacheDescriptors/);
  assert.match(generation, /BlockType\.CHEST/);
  assert.match(textures, /rotation & 0x3/);
});
