import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import path from 'node:path';
import test from 'node:test';
import { build } from 'esbuild';

const root = path.resolve(import.meta.dirname, '../../..');
const bundled = await build({
  entryPoints: [path.join(root, 'src/systems/combat/VaultProjectileSystem.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  define: { __APP_VERSION__: '"test"', __APP_DISPLAY_VERSION__: '"test"' },
  write: false,
});
const { VaultProjectileSystem } = await import(
  `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`
);

test('a physical bolt stops at a wall before damaging an entity behind it', () => {
  const hits = [];
  const system = new VaultProjectileSystem({
    getBlock: (x) => x >= 3 ? 3 : 0,
    raycastEntity: () => ({ id: 9, distance: 6 }),
    damageEntity: (id, damage) => hits.push([id, damage]),
  });
  system.fire({ x: 0, y: 2, z: 0 }, { x: 1, y: 0, z: 0 }, 7);
  for (let index = 0; index < 20; index += 1) system.tick(0.05);
  assert.deepEqual(hits, []);
  assert.equal(system.getRenderState().length, 0);
});

test('the first visible entity is hit exactly once with projectile stagger and hit zone', () => {
  const hits = [];
  const system = new VaultProjectileSystem({
    getBlock: () => 0,
    raycastEntity: (_origin, _direction, maxDistance) => maxDistance >= 0.2 ? { id: 4, distance: 0.2, hitZone: 'core' } : null,
    damageEntity: (id, damage, direction, stagger, _owner, hitZone) => hits.push({ id, damage, direction, stagger, hitZone }),
  });
  system.fire({ x: 0, y: 2, z: 0 }, { x: 1, y: 0, z: 0 }, 7, { stagger: 0.25 });
  system.tick(0.05);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].id, 4);
  assert.equal(hits[0].damage, 7);
  assert.equal(hits[0].stagger, 0.25);
  assert.equal(hits[0].hitZone, 'core');
  assert.equal(system.getRenderState().length, 0);
});

test('bolts use short collision substeps, expire by range, and clear deterministically', () => {
  let longestRay = 0;
  const system = new VaultProjectileSystem({
    getBlock: () => 0,
    raycastEntity: (_origin, _direction, maxDistance) => { longestRay = Math.max(longestRay, maxDistance); return null; },
    damageEntity: () => {},
  });
  system.fire({ x: 0, y: 2, z: 0 }, { x: 1, y: 0, z: 0 }, 7, { maxDistance: 1 });
  system.tick(0.2);
  assert.ok(longestRay <= 0.35 + Number.EPSILON);
  for (let index = 0; index < 10; index += 1) system.tick(0.05);
  assert.equal(system.getRenderState().length, 0);
  system.fire({ x: 0, y: 2, z: 0 }, { x: 1, y: 0, z: 0 }, 7);
  system.clear();
  assert.equal(system.getRenderState().length, 0);
});
