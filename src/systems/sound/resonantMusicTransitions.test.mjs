import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '../../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const loadTransitions = () => import('./musicTransitions.ts');

test('Bell Titan music interrupts vault ambience without a silent stop state', async () => {
  const { createMusicState, reduceMusicRequest } = await loadTransitions();
  let state = createMusicState({ context: 'VAULT', track: 'echoes_below' });

  state = reduceMusicRequest(state, {
    context: 'BOSS_RESONANT',
    track: 'bell_titan',
    reason: 'vault:titan-awakened',
  });

  assert.equal(state.context, 'BOSS_RESONANT');
  assert.equal(state.activeTrack, 'bell_titan');
  assert.equal(state.outgoingTrack, 'echoes_below');
  assert.equal(state.priority, 500);
  assert.equal(state.crossfadeMs, 450);
  assert.equal(state.crossfadeCurve, 'equal-power');
  assert.equal(state.silenceGapMs, 0);
});

test('leaving the vault mid-song restores the live world context', async () => {
  const { createMusicState, reduceMusicRequest } = await loadTransitions();
  let state = createMusicState({ context: 'VAULT_ESCAPE', track: 'the_vault_unravels' });

  state = reduceMusicRequest(state, { context: 'CAVE', reason: 'vault:left' });

  assert.equal(state.context, 'CAVE');
  assert.equal(state.outgoingTrack, 'the_vault_unravels');
  assert.equal(state.resumePreviousVaultTrack, false);
  assert.equal(state.silenceGapMs, 0);
});

test('music priority is explicit and ordered around the authored vault states', async () => {
  const { getMusicContextPriority } = await loadTransitions();
  assert.equal(getMusicContextPriority('DEATH'), getMusicContextPriority('CINEMATIC'));
  assert.ok(getMusicContextPriority('DEATH') > getMusicContextPriority('BOSS_RESONANT'));
  assert.ok(getMusicContextPriority('BOSS_RESONANT') > getMusicContextPriority('VAULT_ESCAPE'));
  assert.ok(getMusicContextPriority('VAULT_ESCAPE') > getMusicContextPriority('VAULT_COMBAT'));
  assert.ok(getMusicContextPriority('VAULT_COMBAT') > getMusicContextPriority('VAULT'));
  assert.ok(getMusicContextPriority('VAULT') > getMusicContextPriority('CAVE'));
});

test('the authoritative Titan event selects the Bell Titan cue in the same event turn', () => {
  const controller = read('src/systems/sound/MusicController.ts');
  const musicIndex = JSON.parse(read('public/assets/rvx/sounds/music-index.json'));
  const hook = controller.match(/gameEvents\.on\('vault:titan-awakened',[\s\S]*?\n\s*\}\);/)?.[0] ?? '';
  assert.match(hook, /requestImmediateContextCrossfade\('BOSS_RESONANT',\s*PRIORITY_CROSSFADE_SECONDS/);
  assert.match(controller, /const PRIORITY_CROSSFADE_SECONDS = PRIORITY_CROSSFADE_MS \/ 1000;/);
  assert.doesNotMatch(hook, /stopMusic/);
  assert.match(controller, /BOSS_RESONANT:\s*\["boss_bell_titan"\]/);
  assert.deepEqual(musicIndex.boss_bell_titan, [
    'assets/rvx/sounds/music/boss_bell_titan/bell_titan.ogg',
  ]);
  assert.equal(musicIndex.boss_resonant_bell_titan, undefined);
  assert.doesNotMatch(controller, /custodian|mason/i);
});

test('vault context transitions crossfade directly and never stop into silence first', () => {
  const controller = read('src/systems/sound/MusicController.ts');
  const immediate = controller.slice(
    controller.indexOf('private requestImmediateContextCrossfade'),
    controller.indexOf('private switchContext'),
  );
  assert.match(immediate, /reduceMusicRequest/);
  assert.match(immediate, /playNextTrack\(fadeSeconds, fadeSeconds\)/);
  assert.doesNotMatch(immediate, /stopMusic/);
});

test('room and Titan combat completion immediately return to Vault ambience', () => {
  const controller = read('src/systems/sound/MusicController.ts');
  const director = read('src/systems/entities/ResonantEncounterDirector.ts');
  const completionHook = controller.match(/gameEvents\.on\('vault:encounter-completed',[\s\S]*?\n\s*\}\);/)?.[0] ?? '';
  const titanHook = controller.match(/gameEvents\.on\('vault:titan-defeated',[\s\S]*?\n\s*\}\);/)?.[0] ?? '';
  assert.match(director, /vault:encounter-completed'[\s\S]{0,120}room:\s*'combat'/);
  assert.match(completionHook, /requestImmediateContextCrossfade\('VAULT'/);
  assert.match(titanHook, /requestImmediateContextCrossfade\('VAULT'/);
});

test('death music also uses the priority crossfade instead of a stop-first timer', () => {
  const controller = read('src/systems/sound/MusicController.ts');
  const death = controller.slice(controller.indexOf('public stopForDeath'), controller.indexOf('public resumeAfterDeath'));
  assert.match(death, /reduceMusicRequest/);
  assert.match(death, /playNextTrack\(PRIORITY_CROSSFADE_SECONDS, PRIORITY_CROSSFADE_SECONDS\)/);
  assert.doesNotMatch(death, /stopMusic|setTimeout/);
});
