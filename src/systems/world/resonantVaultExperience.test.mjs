import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { build } from 'esbuild';

const root = path.resolve(import.meta.dirname, '../../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const bundle = await build({
  entryPoints: [path.join(root, 'src/systems/world/resonantVaultTestHarness.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  write: false,
});
const { simulateVaultJourney } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`
);

test('a new vault supports a complete connected journey to the real surface', async () => {
  const journey = await simulateVaultJourney({ seed: 73014, route: 'fracture' });
  assert.equal(journey.locateCommandFoundVault, true);
  assert.equal(journey.allRequiredRoomsConnected, true);
  assert.ok(journey.meaningfulRooms >= 12 && journey.meaningfulRooms <= 16);
  assert.ok(journey.optionalAnnexes >= 2 && journey.optionalAnnexes <= 3);
  assert.deepEqual(journey.guaranteedWeapons, ['spear', 'crossbow', 'maul']);
  assert.equal(journey.unusualArtifacts, 1);
  assert.equal(journey.echoDemonstrationVisibleAndAudible, true);
  assert.equal(journey.bellTitanDefeated, true);
  assert.equal(journey.escapeFinishedAboveSurface, true);
  assert.ok(journey.estimatedFirstClearMinutes >= 45 && journey.estimatedFirstClearMinutes <= 70);
});

test('the complete-journey harness is deterministic and proves both authored exits', async () => {
  const grand = await simulateVaultJourney({ seed: 73014, route: 'grand' });
  const fracture = await simulateVaultJourney({ seed: 73014, route: 'fracture' });
  assert.equal(grand.layoutSignature, fracture.layoutSignature);
  assert.equal(grand.escapeFinishedAboveSurface, true);
  assert.equal(fracture.escapeFinishedAboveSurface, true);
  assert.notEqual(grand.escapePathLength, fracture.escapePathLength);
});

test('world transitions use one narrow vault-runtime reset and clear every transient subsystem', () => {
  const app = read('src/App.tsx');
  const runtime = read('src/systems/world/ResonantVaultRuntime.ts');
  assert.match(app, /resonantVaultRuntime\.reset\(\)[\s\S]{0,220}worldManager\.reset\(\)/);
  assert.match(runtime, /reset\(\): void \{[\s\S]*resonantVaultHazards\.reset\(\)/);
  assert.match(runtime, /reset\(\): void \{[\s\S]*bellTitanEncounter\.cleanup\(\)/);
  assert.match(runtime, /reset\(\): void \{[\s\S]*resonantEncounterDirector\.reset\(\)/);
  assert.match(runtime, /reset\(\): void \{[\s\S]*this\.echoScheduler\.reset\(\)/);
  assert.match(runtime, /reset\(\): void \{[\s\S]*this\.discoveryPulse = 0/);
  assert.match(runtime, /reset\(\): void \{[\s\S]*this\.hazardCooldown = 0/);
});

test('crossing failure becomes a recoverable lower combat route instead of a teleport', () => {
  const runtime = read('src/systems/world/ResonantVaultRuntime.ts');
  const director = read('src/systems/entities/ResonantEncounterDirector.ts');
  const crossingMethod = runtime.match(/private tickBrokenCrossing\([\s\S]*?\n\s{4}private restorePhaseBlocks/)?.[0] ?? '';
  assert.doesNotMatch(crossingMethod, /teleportPlayer/);
  assert.match(crossingMethod, /ensureCrossingFailureEncounter/);
  assert.match(crossingMethod, /crossingPitActive/);
  assert.match(crossingMethod, /getCrossingPitDescriptor/);
  assert.match(director, /ensureCrossingFailureEncounter\(/);
});

test('the Bell Titan requires explicit confirmation and owns a distinct cinematic', () => {
  const app = read('src/App.tsx');
  const runtime = read('src/systems/world/ResonantVaultRuntime.ts');
  const cinematic = read('src/systems/boss/bellTitanCinematic.ts');
  const runtimeTick = runtime.match(/tick\(dt: number,[\s\S]*?\n\s{4}useTuningFork/)?.[0] ?? '';
  assert.doesNotMatch(runtimeTick, /ensureTitan/);
  assert.match(runtime, /requestTitanConfirmation/);
  assert.match(runtime, /getTitanConfirmationControl/);
  assert.match(runtime, /sameVaultCell\(target, confirmationControl\)/);
  const confirmationMethod = runtime.match(/private requestTitanConfirmation\([\s\S]*?\n\s{4}cancelTitanConfirmation/)?.[0] ?? '';
  assert.match(confirmationMethod, /candidate\.kind === 'arena'/);
  assert.doesNotMatch(confirmationMethod, /candidate\.kind === 'antechamber'/);
  assert.match(runtime, /beginTitanAwakening/);
  assert.match(runtime, /spawnConfirmedTitan/);
  assert.match(app, /vault:titan-confirm-request/);
  assert.match(app, /Answer the final toll\?/);
  assert.match(cinematic, /shares no crystal, beam, orbit, or[\s\S]*Magnetic Warden/);
  assert.match(cinematic, /vault\.titan_chain/);
  assert.match(cinematic, /vault\.titan_toll/);
});

test('vault progression has no room-kind migration fallback and boss defeat cleanses only matching registered regions', () => {
  const runtime = read('src/systems/world/ResonantVaultRuntime.ts');
  const director = read('src/systems/entities/ResonantEncounterDirector.ts');
  const app = read('src/App.tsx');
  assert.doesNotMatch(runtime, /isVaultRoomSolved\(layout\.vaultId, room\.kind\)/);
  assert.doesNotMatch(director, /allowKindProgress/);
  assert.match(app, /const region = regionId \? getRegionById\(regionId\) : undefined/);
  assert.match(app, /region\?\.bossId === bossId/);
});
