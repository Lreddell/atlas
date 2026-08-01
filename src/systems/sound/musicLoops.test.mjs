import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '../../..');
const loadLoops = () => import('./musicLoops.ts');

test('all four vault cues loop from their authored final sample directly to their first sample', async () => {
  const { readMusicLoopManifest, scheduleLoopDecks } = await loadLoops();
  const manifest = readMusicLoopManifest();
  const expectedEndSamples = {
    echoes_below: 9_216_000,
    three_wings: 6_248_135,
    bell_titan: 9_525_454,
    the_vault_unravels: 5_266_286,
  };

  for (const id of ['echoes_below', 'three_wings', 'bell_titan', 'the_vault_unravels']) {
    const loop = manifest[id];
    assert.ok(loop, `${id} needs loop metadata`);
    assert.equal(loop.sampleRate, 48_000);
    assert.equal(loop.endSample, expectedEndSamples[id]);
    assert.equal(loop.crossfadeSamples, 0);
    const schedule = scheduleLoopDecks(loop, 0);
    assert.equal(schedule.nextStartSample, loop.endSample);
    assert.equal(schedule.overlapSamples, 0);
    assert.equal(schedule.silenceGapSamples, 0);
  }
});

test('runtime loop metadata and the shipped JSON manifest stay identical', async () => {
  const { readMusicLoopManifest } = await loadLoops();
  const shipped = JSON.parse(
    fs.readFileSync(path.join(root, 'public/assets/rvx/sounds/music-loops.json'), 'utf8'),
  );
  assert.deepEqual(shipped, readMusicLoopManifest());
});

test('loop scheduling preserves the same sample offset on later deck cycles', async () => {
  const { readMusicLoopManifest, scheduleLoopDecks } = await loadLoops();
  const loop = readMusicLoopManifest().echoes_below;
  const schedule = scheduleLoopDecks(loop, 12_345);
  assert.equal(
    schedule.nextStartSample,
    12_345 + loop.endSample - loop.startSample,
  );
  assert.equal(schedule.overlapSamples, loop.crossfadeSamples);
});

test('SoundManager preserves authored endings and loops one decoded voice at exact bounds', async () => {
  const manager = fs.readFileSync(path.join(root, 'src/systems/sound/SoundManager.ts'), 'utf8');
  assert.match(manager, /getMusicLoopDefinition/);
  assert.match(manager, /musicBufferCache/);
  assert.match(manager, /decodeAudioData/);
  assert.doesNotMatch(manager, /scheduleDecodedLoopVoice/);
  assert.match(manager, /source\.loop = true/);
  assert.doesNotMatch(manager, /prepareDecodedLoopSeam|preparedDecodedLoopSeams|samples\[tailStart/);
  assert.match(manager, /resolveDecodedLoopBounds/);
  assert.match(manager, /source\.loopStart = bounds\.startSeconds/);
  assert.match(manager, /source\.loopEnd = bounds\.endSeconds/);
  assert.match(manager, /setValueCurveAtTime/);
  assert.match(manager, /buildEqualPowerFadeCurve/);
  assert.match(manager, /source\.start\(startTime,\s*bounds\.startSeconds\)/);
});

test('Vault loop masters preload and stale decode requests cannot replace a newer context', () => {
  const manager = fs.readFileSync(path.join(root, 'src/systems/sound/SoundManager.ts'), 'utf8');
  assert.match(manager, /preloadDecodedMusicLoops/);
  assert.match(manager, /musicRequestSerial/);
  assert.match(manager, /requestSerial !== this\.musicRequestSerial/);
  assert.match(manager, /void this\.preloadDecodedMusicLoops\(\)/);
});
