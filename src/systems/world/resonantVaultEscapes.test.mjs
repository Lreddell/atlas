import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import path from 'node:path';
import test from 'node:test';
import { build } from 'esbuild';

const root = path.resolve(import.meta.dirname, '../../..');
const bundle = await build({
  entryPoints: [path.join(root, 'src/systems/world/resonantVaultEscapes.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  write: false,
});
const escapes = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const { buildVaultEscapeRoutes, getVaultEscapeRoutes, validateSurfaceOutlet } = escapes;
const vaultBundle = await build({
  entryPoints: [path.join(root, 'src/systems/world/resonantVaults.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  write: false,
});
const { getVaultLayout } = await import(`data:text/javascript;base64,${Buffer.from(vaultBundle.outputFiles[0].text).toString('base64')}`);

test('the two exits have measurably different risk and length', () => {
  const routes = buildVaultEscapeRoutes({ seed: 4242, vaultBaseY: -44, grandSurfaceY: 71, fractureSurfaceY: 68 });
  assert.ok(routes.grand.pathLength >= routes.fracture.pathLength * 1.55);
  assert.ok(routes.grand.combatZones >= 2);
  assert.equal(routes.fracture.combatZones, 0);
  assert.ok(routes.fracture.requiredHazards >= 5);
  assert.deepEqual(routes.grand.tradeoff, { length: 'long', pressure: 'guarded' });
  assert.deepEqual(routes.fracture.tradeoff, { length: 'short', pressure: 'hazardous' });
});

test('both final stair volumes open above actual terrain', () => {
  const routes = buildVaultEscapeRoutes({ seed: 99, vaultBaseY: -36, grandSurfaceY: 84, fractureSurfaceY: 77 });
  assert.deepEqual(validateSurfaceOutlet(routes.grand, 84), { reachesSurface: true, openToSky: true });
  assert.deepEqual(validateSurfaceOutlet(routes.fracture, 77), { reachesSurface: true, openToSky: true });
  for (const route of Object.values(routes)) {
    assert.equal(route.surfaceLanding.y, route.surfaceY + 1);
    assert.ok(route.protectedOutlet.maxY >= route.surfaceY + 5);
    assert.ok(route.path.every((point, index) => index === 0 || Math.abs(point.y - route.path[index - 1].y) <= 1));
  }
});

test('route construction is deterministic and keeps hazards away from turns and surface thresholds', () => {
  const first = buildVaultEscapeRoutes({ seed: 731, vaultBaseY: -30, grandSurfaceY: 76, fractureSurfaceY: 73 });
  const second = buildVaultEscapeRoutes({ seed: 731, vaultBaseY: -30, grandSurfaceY: 76, fractureSurfaceY: 73 });
  assert.deepEqual(first, second);
  for (const route of Object.values(first)) {
    assert.ok(route.hazardSlots.every((slot) => slot.pathIndex >= 8 && slot.pathIndex <= route.path.length - 9));
    assert.ok(route.checkpoints.length >= route.requiredHazards);
  }
});

test('real layouts preserve route distinction and surface reachability across 128 seeds', () => {
  for (let seed = 1; seed <= 128; seed += 1) {
    const candidate = { gridX: 2, gridZ: -3, centerX: 4000, centerZ: -5000, seed, active: true, orientation: seed & 3 };
    const surface = (x, z) => 68 + (Math.abs(x * 3 + z * 5 + seed) % 17);
    const layout = getVaultLayout(candidate, surface(candidate.centerX, candidate.centerZ), surface);
    const routes = getVaultEscapeRoutes(layout);
    assert.ok(routes.grand.pathLength >= routes.fracture.pathLength * 1.3, `seed ${seed}`);
    assert.deepEqual(validateSurfaceOutlet(routes.grand, layout.surfaceOutlets.grand.surfaceY), { reachesSurface: true, openToSky: true });
    assert.deepEqual(validateSurfaceOutlet(routes.fracture, layout.surfaceOutlets.fracture.surfaceY), { reachesSurface: true, openToSky: true });
    assert.equal(routes.fracture.hazardSlots.length, 5);
  }
});
