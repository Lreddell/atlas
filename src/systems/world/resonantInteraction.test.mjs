import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { build } from 'esbuild';

const root = path.resolve(import.meta.dirname, '../../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const interaction = read('src/components/controllers/InteractionController.tsx');
const controller = read('src/components/ResonantVaultController.tsx');
const runtime = read('src/systems/world/ResonantVaultRuntime.ts');
const editRulesBundle = await build({
  entryPoints: [path.join(root, 'src/systems/world/resonantVaultEditRules.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  write: false,
});
const { canEditSealedVaultCell } = await import(`data:text/javascript;base64,${Buffer.from(editRulesBundle.outputFiles[0].text).toString('base64')}`);
const EditBlock = Object.freeze({ AIR: 0, STONE: 3, TORCH: 20, ECHO_CRYSTAL: 75, PHASE_BLOCK: 79, VAULT_SEAL: 85 });

test('sealed vault edit policy allows only crystals and safe torches', () => {
  assert.equal(canEditSealedVaultCell({ kind: 'break', currentBlock: EditBlock.ECHO_CRYSTAL }, false), true);
  assert.equal(canEditSealedVaultCell({ kind: 'break', currentBlock: EditBlock.STONE }, false), false);
  assert.equal(canEditSealedVaultCell({ kind: 'place', currentBlock: EditBlock.AIR, placedBlock: EditBlock.TORCH }, false), true);
  assert.equal(canEditSealedVaultCell({ kind: 'place', currentBlock: EditBlock.AIR, placedBlock: EditBlock.TORCH }, true), false);
  assert.equal(canEditSealedVaultCell({ kind: 'place', currentBlock: EditBlock.PHASE_BLOCK, placedBlock: EditBlock.TORCH }, false), false);
  assert.equal(canEditSealedVaultCell({ kind: 'place', currentBlock: EditBlock.VAULT_SEAL, placedBlock: EditBlock.TORCH }, false), false);
  assert.equal(canEditSealedVaultCell({ kind: 'place', currentBlock: EditBlock.AIR, placedBlock: EditBlock.STONE }, false), false);
});

test('the tuning fork uses Atlas normal right-click targeting', () => {
  assert.match(interaction, /heldForUse\?\.type === BlockType\.ECHO_TUNING_FORK/);
  assert.match(interaction, /resonantVaultRuntime\.useTuningFork/);
  assert.match(interaction, /targetType[\s\S]{0,500}worldManager\.getMetadata/);
  assert.doesNotMatch(interaction, /RESONATOR|PULSE_BRACER/);
  assert.doesNotMatch(controller, /addEventListener\('mousedown'|raycastVaultTarget/);
});

test('the only artifact activates marked machinery and claims the visible core', () => {
  assert.match(runtime, /target\.type !== BlockType\.RESONANCE_PYLON/);
  assert.match(runtime, /target\.type !== BlockType\.RESONANCE_PLATE/);
  assert.match(runtime, /target\.type !== BlockType\.LISTENING_STONE/);
  assert.match(runtime, /target\.type !== BlockType\.SENTINEL_CORE/);
  assert.match(runtime, /activatePylon\(target\)/);
  assert.match(runtime, /activatePuzzleControl\(target\)/);
  assert.match(runtime, /tryClaimCore\(target\)/);
  assert.doesNotMatch(runtime, /pulseNearbyCreatures|RESONATOR|PULSE_BRACER/);
});

test('unfinished vaults cannot be mined through while preparation crystals remain available', () => {
  const geometry = read('src/systems/world/resonantVaults.ts');
  const editRules = read('src/systems/world/resonantVaultEditRules.ts');
  assert.match(interaction, /resonantVaultRuntime\.canPlayerEditAt/);
  assert.match(runtime, /canEditSealedVaultCell/);
  assert.match(runtime, /torchDeniedCell/);
  assert.match(runtime, /gatePlaneCell/);
  assert.match(runtime, /movingHazardCell/);
  assert.match(editRules, /BlockType\.TORCH/);
  assert.match(runtime, /escapeCompleted/);
  assert.match(runtime, /isVaultStructurePosition/);
  assert.match(geometry, /getVaultShaftCenter/);
});
