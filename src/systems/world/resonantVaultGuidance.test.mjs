import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '../../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const tutorial = read('src/data/tutorial.ts');
const guide = read('src/data/resonantGuide.ts');
const definitions = read('src/data/resonantDefinitions.ts');
const runtime = read('src/systems/world/ResonantVaultRuntime.ts');
const objectives = read('src/systems/world/resonantVaultObjectives.ts');
const objectiveHud = read('src/components/ui/ResonantObjectiveHUD.tsx');
const controller = read('src/components/ResonantVaultController.tsx');
const chat = read('src/components/ui/Chat.tsx');
const commandData = read('src/data/commands.ts');
const recipes = read('src/data/resonantRecipes.ts');
const effects = read('src/components/ResonantEffectsRenderer.tsx');

test('the vault teaches each stage with a compact objective line', () => {
  for (const objective of [
    'Descend into the vault',
    'Find a tuning fork',
    'Complete the chambers',
    'Follow the echo',
    'Seal locked',
    'Listen',
    'Repeat the echo',
    'Cross the chamber',
    'The lower hall is listening',
    'Carry the pulse',
    'Balance the gallery',
    'Defeat the guardians',
    'Enter the bell chamber',
    'Claim the hammer',
    'Choose an ascent',
    'Reach the surface',
  ]) assert.match(objectives, new RegExp(objective));
  assert.doesNotMatch(objectives, /Strike the exposed bell/);
  assert.match(objectives, /Grand: long, guarded \| Fracture: short, hazardous/);

  assert.match(objectiveHud, /font-pixel/);
  assert.match(objectiveHud, /bg-black\/65/);
  assert.match(objectiveHud, /border-stone-500\/45/);
  assert.match(objectiveHud, /aria-live="polite"/);
  assert.doesNotMatch(objectiveHud, /neon|glow|gradient|cyan|purple/i);
  assert.match(objectiveHud, /vault:room-solved/);
  assert.match(objectiveHud, /Chamber complete/);
});

test('puzzle responses remain visible on the machinery instead of relying on prose', () => {
  assert.match(effects, /vault:memory-input/);
  assert.match(effects, /InputStepMarker/);
  assert.match(effects, /torusGeometry/);
  assert.match(effects, /setInputSteps/);
});

test('prose popups and the vault guide command are removed', () => {
  assert.doesNotMatch(runtime, /showGuidance|shownGuidance|replayGuide|getVaultStageGuidance/);
  assert.doesNotMatch(controller, /querySelector|createElement|data-texture-slot|updateCooldownOverlay/);
  assert.doesNotMatch(chat, /resonantVaultCommands|executeResonantVaultCommand/);
  assert.doesNotMatch(commandData, /['"]\/vault['"]/);
  assert.equal(fs.existsSync(path.join(root, 'src/systems/world/resonantVaultCommands.ts')), false);
});

test('current-facing copy removes prose tutorials and prototype items', () => {
  assert.doesNotMatch(tutorial, /id:\s*'resonant-vaults'/);
  assert.doesNotMatch(`${guide}\n${definitions}`, /RESONATOR|PULSE_BRACER|CUSTODIAN_SIGIL|RESONANT_LENS/);
});

test('active content teaches conventional equipment and one machinery artifact', () => {
  const purposeBlock = guide.match(/RESONANT_ITEM_PURPOSES:[\s\S]*?= \{([\s\S]*?)\n\};/)?.[1] ?? '';
  assert.equal((purposeBlock.match(/\[BlockType\./g) ?? []).length, 29);
  for (const id of ['VAULTSTEEL_SPEAR','VAULT_CROSSBOW','VAULT_BOLT','BELLBREAKER_MAUL','ECHO_TUNING_FORK','TITAN_HAMMER']) {
    assert.match(guide, new RegExp(`\\[BlockType\\.${id}\\]:\\s*'[^']+'`), `missing summary for ${id}`);
  }
  assert.doesNotMatch(purposeBlock, /RESONATOR|PULSE_BRACER|CUSTODIAN_SIGIL|RESONANT_LENS/);
});

test('repeat clears and enemy drops do not introduce prototype gadgets', () => {
  assert.match(recipes, /BlockType\.FRACTURED_CORE,\s*BlockType\.FRACTURED_CORE[\s\S]{0,120}BlockType\.ECHO_DUST/);
  assert.match(recipes, /BlockType\.ECHO_BRICKS,\s*BlockType\.ECHO_BRICKS,\s*BlockType\.ECHO_BRICKS[\s\S]{0,300}BlockType\.ECHO_CORE[\s\S]{0,220}BlockType\.LISTENING_STONE/);
  assert.match(runtime, /worldFirstClear/);
  assert.doesNotMatch(runtime, /spawnDrop\(BlockType\.RESONANT_LENS/);
  assert.match(runtime, /locateFromListeningStone/);
});
