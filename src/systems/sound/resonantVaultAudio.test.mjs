import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '../../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const MUSIC = {
  resonant_vault: 'echoes_below.ogg',
  resonant_combat: 'three_wings.ogg',
  boss_bell_titan: 'bell_titan.ogg',
  resonant_escape: 'the_vault_unravels.ogg',
};
const ENEMY_SFX = [
  'guard_step_1.ogg', 'guard_step_2.ogg', 'guard_swing.ogg',
  'marksman_brace.ogg', 'marksman_fire.ogg', 'marksman_reload.ogg',
  'hound_leap.ogg', 'hound_land.ogg',
  'tollkeeper_windup.ogg', 'tollkeeper_impact.ogg',
];
const ENEMY_EVENTS = [
  'vault.enemy.guard_step', 'vault.enemy.guard_swing',
  'vault.enemy.marksman_brace', 'vault.enemy.marksman_fire', 'vault.enemy.marksman_reload',
  'vault.enemy.hound_leap', 'vault.enemy.hound_land',
  'vault.enemy.tollkeeper_windup', 'vault.enemy.tollkeeper_impact',
];
const TITAN_SFX = [
  'titan_awaken.ogg', 'titan_step_1.ogg', 'titan_step_2.ogg',
  'titan_chain_1.ogg', 'titan_chain_2.ogg', 'titan_sweep.ogg',
  'titan_slam.ogg', 'titan_toll.ogg', 'titan_core_open.ogg',
  'titan_shell_break.ogg', 'titan_hurt_1.ogg', 'titan_hurt_2.ogg', 'titan_death.ogg',
];
const TITAN_EVENTS = [
  'vault.titan_awaken', 'vault.titan_step', 'vault.titan_chain', 'vault.titan_sweep',
  'vault.titan_slam', 'vault.titan_toll', 'vault.titan_core_open',
  'vault.titan_shell_break', 'vault.titan_hurt', 'vault.titan_death',
];

test('music controller gives vault exploration, combat, Bell Titan, and escape dedicated priority contexts', () => {
  const music = read('src/systems/sound/MusicController.ts');
  for (const context of ['VAULT', 'VAULT_COMBAT', 'BOSS_RESONANT', 'VAULT_ESCAPE']) {
    assert.match(music, new RegExp(`${context}: \\["`), `${context} needs a music tag`);
  }
  assert.match(music, /gameEvents\.on\('vault:entered'/);
  assert.match(music, /gameEvents\.on\('vault:encounter-started'/);
  assert.match(music, /gameEvents\.on\('vault:titan-awakened'/);
  assert.match(music, /gameEvents\.on\('vault:titan-awakened',[\s\S]*?requestImmediateContextCrossfade\('BOSS_RESONANT'/);
  assert.match(music, /private requestImmediateContextCrossfade[\s\S]*?this\.playNextTrack\([^)]*,[^)]*\)/);
  const titanHook = music.match(/gameEvents\.on\('vault:titan-awakened',[\s\S]*?\n\s*\}\);/)?.[0] ?? '';
  assert.doesNotMatch(titanHook, /stopMusic/);
  assert.match(music, /gameEvents\.on\('vault:escape-started'/);
  assert.match(music, /gameEvents\.on\('vault:left', \(\) => \{ this\.endVaultMusicImmediately\(\); \}\)/);
  assert.match(music, /gameEvents\.on\('vault:escape-completed', \(\) => \{ this\.endVaultMusicImmediately\(\); \}\)/);
  assert.match(music, /private endVaultMusicImmediately[\s\S]*?soundManager\.stopMusic\(0\.08\)/);
  assert.match(music, /this\.vaultEscape[\s\S]*VAULT_ESCAPE[\s\S]*this\.vaultTitan[\s\S]*BOSS_RESONANT[\s\S]*this\.vaultCombat[\s\S]*VAULT_COMBAT[\s\S]*this\.vaultActive[\s\S]*VAULT/);
  assert.match(music, /RESONANT_MUSIC_CONTEXTS/);
  assert.match(music, /CONTINUOUS_MUSIC_CONTEXTS/);
  assert.match(music, /CONTINUOUS_LOOP_CROSSFADE/);
  assert.match(music, /shouldCrossfadeContinuousTrack/);
});

test('Resonant audio director maps gameplay events to authored cues and throttles countdown warnings', () => {
  const audio = read('src/systems/sound/ResonantVaultAudio.ts');
  const runtime = read('src/systems/world/ResonantVaultRuntime.ts');
  const events = read('src/systems/events/GameEvents.ts');
  const index = read('src/index.tsx');
  assert.match(index, /\.\/systems\/sound\/ResonantVaultAudio/);
  for (const event of [
    'vault:discovered', 'vault:entered', 'vault:memory-input', 'vault:echo-step',
    'vault:room-solved', 'vault:unsealed', 'vault:encounter-started',
    'vault:titan-awakened', 'vault:titan-action', 'vault:titan-core',
    'vault:titan-shell-broken', 'vault:titan-hurt', 'vault:titan-deflected', 'vault:titan-defeated',
    'vault:core-claimed', 'vault:escape-started', 'vault:escape-tick',
    'vault:escape-completed', 'vault:resonance-pulse',
    'vault:listening-stone-activated',
  ]) {
    assert.match(audio, new RegExp(`gameEvents\\.on\\('${event.replace(':', '\\:')}'`), `${event} should drive audio`);
  }
  assert.match(events, /'vault:listening-stone-activated': \{ vaultId: string; x: number; y: number; z: number \}/);
  assert.match(events, /'vault:memory-input': \{ vaultId: string; symbol: number; progress: number; correct: boolean; x: number; y: number; z: number \}/);
  assert.match(events, /'vault:echo-step': \{/);
  assert.match(runtime, /gameEvents\.emit\('vault:listening-stone-activated'/);
  assert.match(runtime, /gameEvents\.emit\('vault:memory-input',[\s\S]*x: target\.x,[\s\S]*y: target\.y,[\s\S]*z: target\.z/);
  assert.match(audio, /correct \? 'vault\.echo_step' : 'vault\.pylon_wrong'/);
  assert.match(audio, /ECHO_STEP_PITCH\[symbol & 3\]/);
  assert.match(audio, /sound\.playAt\(\s*'vault\.echo_step'/);
  assert.match(audio, /ECHO_STEP_PITCH\[symbol & 3\]/);
  assert.match(audio, /refDistance:\s*7/);
  assert.match(audio, /rolloffFactor:\s*0\.55/);
  assert.match(audio, /volume:\s*1\.15/);
  assert.match(audio, /sound\.playAt\('vault\.listening_stone'/);
  assert.match(audio, /'vault\.listening_stone'/);
  assert.match(audio, /ESCAPE_WARNING_THRESHOLDS/);
  assert.match(audio, /playedEscapeWarnings/);
  assert.match(audio, /sound\.playAt\('vault\.tuning_fork'/);
  assert.match(audio, /gameEvents\.on\('vault:echo-preview'/);
  assert.doesNotMatch(audio, /vault\.resonator_pulse|vault\.bracer_pulse|vault\.projectile_deflect/);
});

test('sound manifests and static web music index include every Resonant event and track', () => {
  const manifest = JSON.parse(read('public/assets/rvx/sounds.json'));
  const defaults = read('src/systems/sound/soundDefaults.ts');
  const index = JSON.parse(read('public/assets/rvx/sounds/music-index.json'));
  for (const tag of Object.keys(MUSIC)) {
    assert.ok(manifest[`music.${tag}`], `sounds.json missing music.${tag}`);
    assert.match(defaults, new RegExp(`"music\\.${tag}"`));
    const tracks = index.tags?.[tag] ?? index[tag];
    assert.ok(Array.isArray(tracks) && tracks.length === 1, `music index missing ${tag}`);
    assert.ok(fs.existsSync(path.join(root, 'public', tracks[0].replace(/^assets\//, 'assets/'))));
  }
  for (const event of [
    'vault.discovery', 'vault.enter', 'vault.tuning_fork', 'vault.echo_step',
    'vault.pylon_correct', 'vault.pylon_wrong', 'vault.room_complete',
    'vault.seal_release', 'vault.sentinel_spawn',
    ...TITAN_EVENTS,
    'vault.core_claim', 'vault.escape_start', 'vault.escape_warning', 'vault.escape_complete',
    'vault.listening_stone',
  ]) {
    assert.ok(manifest[event], `sounds.json missing ${event}`);
    assert.match(defaults, new RegExp(`"${event.replaceAll('.', '\\.')}"`));
  }
  assert.equal(manifest['vault.echo_step'].fallback, false, 'pattern cue must never synthesize a placeholder');
  assert.deepEqual(manifest['vault.tuning_fork'].sounds, ['resonant_vault/pylon_correct_1']);
  assert.deepEqual(manifest['vault.echo_step'].sounds, ['resonant_vault/pylon_correct_1']);
  assert.equal(manifest['vault.phase_shift'], undefined, 'the ambiguous global ratchet cue must remain retired');
  const effects = read('src/components/ResonantEffectsRenderer.tsx');
  const patternMarker = effects.slice(effects.indexOf('const PatternStepMarker'), effects.indexOf('const InputStepMarker'));
  assert.doesNotMatch(patternMarker, /pointLight/, 'puzzle steps must not recompile lighting shaders mid-pattern');
  assert.doesNotMatch(read('src/systems/sound/ResonantVaultAudio.ts'), /this\.sound\.play\('vault\.phase_shift'\)/);
  assert.match(defaults, /"vault\.echo_step"[^\n]*fallback: false/);
  assert.doesNotMatch(JSON.stringify(manifest), /custodian/i);
});

test('Bell Titan cues are recorded, positional, provenance-backed, and fail silent', () => {
  const manifest = JSON.parse(read('public/assets/rvx/sounds.json'));
  const audio = read('src/systems/sound/ResonantVaultAudio.ts');
  const provenance = JSON.parse(read('public/assets/rvx/sounds/resonant_vault/audio-provenance.json'));
  for (const file of TITAN_SFX) {
    const audioPath = path.join(root, 'public/assets/rvx/sounds/resonant_vault', file);
    assert.ok(fs.statSync(audioPath).size > 5_000, `${file} must be an authored encoded cue`);
    assert.equal(fs.readFileSync(audioPath).subarray(0, 4).toString('ascii'), 'OggS');
    const entry = provenance.assets[file];
    assert.ok(entry?.sourceIds?.length > 0, `${file} needs recorded-source provenance`);
    assert.ok(entry.peakDb < -1, `${file} needs codec-safe headroom`);
    assert.equal(createHash('sha256').update(fs.readFileSync(audioPath)).digest('hex'), entry.sha256);
  }
  for (const event of TITAN_EVENTS) {
    assert.ok(manifest[event], `${event} missing`);
    assert.equal(manifest[event].fallback, false, `${event} may not synthesize a replacement`);
  }
  for (const source of provenance.sources) {
    assert.match(source.sourceKind, /^(recorded|foley|licensed_music)$/);
    assert.doesNotMatch(JSON.stringify(source), /synth|oscillator|warden|mason/i);
  }
  for (const event of ['awakened', 'action', 'core', 'shell-broken', 'hurt', 'deflected', 'defeated']) {
    assert.match(audio, new RegExp(`gameEvents\\.on\\('vault:titan-${event}'`));
  }
  assert.match(audio, /playAt\([\s\S]{0,120}vault\.titan_/);
  assert.match(audio, /fallback:\s*false/);
});

test('definitive vault enemies use positional recorded foley and fail silent without authored files', () => {
  const manifest = JSON.parse(read('public/assets/rvx/sounds.json'));
  const audio = read('src/systems/sound/ResonantVaultAudio.ts');
  const soundManager = read('src/systems/sound/SoundManager.ts');
  const soundTypes = read('src/systems/sound/soundTypes.ts');
  const director = read('src/systems/entities/ResonantEncounterDirector.ts');
  const events = read('src/systems/events/GameEvents.ts');
  const provenance = JSON.parse(read('public/assets/rvx/sounds/resonant_vault/audio-provenance.json'));

  for (const file of ENEMY_SFX) {
    const audioPath = path.join(root, 'public/assets/rvx/sounds/resonant_vault', file);
    assert.ok(fs.statSync(audioPath).size > 5_000, `${file} must be a real encoded cue`);
    assert.equal(fs.readFileSync(audioPath).subarray(0, 4).toString('ascii'), 'OggS');
    const entry = provenance.assets[file];
    assert.ok(entry, `${file} needs provenance`);
    assert.ok(entry.sourceIds.length > 0);
    assert.ok(entry.peakDb < -1, `${file} needs codec-safe headroom`);
    assert.equal(createHash('sha256').update(fs.readFileSync(audioPath)).digest('hex'), entry.sha256);
  }
  for (const event of ENEMY_EVENTS) {
    assert.ok(manifest[event], `missing ${event}`);
    assert.equal(manifest[event].fallback, false, `${event} may not synthesize a replacement`);
    assert.equal(manifest[event].sounds.every((sound) => sound.startsWith('resonant_vault/')), true);
  }
  for (const source of provenance.sources) {
    assert.match(source.sourceKind, /^(recorded|foley|licensed_music)$/);
    assert.doesNotMatch(JSON.stringify(source), /synth|oscillator|warden/i);
  }
  assert.match(events, /'vault:enemy-action':/);
  assert.match(events, /'vault:enemy-footstep':/);
  assert.match(events, /'vault:enemy-landed':/);
  assert.match(director, /gameEvents\.emit\('vault:enemy-action'/);
  assert.match(director, /gameEvents\.emit\('vault:enemy-footstep'/);
  assert.match(audio, /gameEvents\.on\('vault:enemy-action'/);
  assert.match(audio, /gameEvents\.on\('vault:enemy-footstep'/);
  assert.match(audio, /gameEvents\.on\('vault:enemy-landed'/);
  assert.match(audio, /fallback:\s*false/);
  assert.match(soundTypes, /fallback\?: boolean/);
  assert.match(soundManager, /opts\?\.fallback \?\?/);
});

test('repository ships runtime Oggs without editable Vault music sources', () => {
  assert.equal(fs.existsSync(path.join(root, 'scripts/render_resonant_audio.py')), false);
  assert.equal(fs.existsSync(path.join(root, 'scripts/prepare_trial_vault_projects.py')), false);
  assert.equal(fs.existsSync(path.join(root, 'assets/source/audio/resonant_vault')), false);
});
