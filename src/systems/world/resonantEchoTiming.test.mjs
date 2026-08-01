import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { ECHO_PREVIEW_MILLISECONDS, ECHO_PREVIEW_SECONDS, ResonantEchoScheduler } from './resonantEchoTiming.ts';

const root = path.resolve(import.meta.dirname, '../../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('an echo always previews before resolving in scheduled order', () => {
  const events = [];
  const scheduler = new ResonantEchoScheduler();
  scheduler.schedule('second', 4, () => events.push('preview:second'), () => events.push('resolve:second'));
  scheduler.schedule('first', 3.9, () => events.push('preview:first'), () => events.push('resolve:first'));

  assert.deepEqual(events, ['preview:second', 'preview:first']);
  scheduler.tick(3.9 + ECHO_PREVIEW_SECONDS - 0.001);
  assert.deepEqual(events, ['preview:second', 'preview:first']);
  scheduler.tick(5);
  assert.deepEqual(events, ['preview:second', 'preview:first', 'resolve:first', 'resolve:second']);
});

test('reset cancels stale scheduled callbacks', () => {
  const events = [];
  const scheduler = new ResonantEchoScheduler();
  scheduler.schedule('pattern', 1, () => events.push('preview'), () => events.push('resolve'));
  scheduler.reset();
  scheduler.tick(10);
  assert.deepEqual(events, ['preview']);
});

test('a specific receiver can be cancelled without disturbing other echoes', () => {
  const events = [];
  const scheduler = new ResonantEchoScheduler();
  scheduler.schedule('cancelled', 0, () => events.push('preview:cancelled'), () => events.push('resolve:cancelled'));
  scheduler.schedule('kept', 0, () => events.push('preview:kept'), () => events.push('resolve:kept'));
  assert.equal(scheduler.cancel('cancelled'), true);
  scheduler.tick(ECHO_PREVIEW_SECONDS);
  assert.deepEqual(events, ['preview:cancelled', 'preview:kept', 'resolve:kept']);
});

test('a pending receiver debounces repeats and can schedule again after resolution', () => {
  const events = [];
  const scheduler = new ResonantEchoScheduler();
  assert.equal(scheduler.schedule('receiver', 0, () => events.push('preview:1'), () => events.push('resolve:1')), true);
  assert.equal(scheduler.schedule('receiver', 0.2, () => events.push('preview:duplicate'), () => events.push('resolve:duplicate')), false);
  scheduler.tick(ECHO_PREVIEW_SECONDS);
  assert.equal(scheduler.schedule('receiver', 1, () => events.push('preview:2'), () => events.push('resolve:2')), true);
  scheduler.tick(1 + ECHO_PREVIEW_SECONDS);
  assert.deepEqual(events, ['preview:1', 'resolve:1', 'preview:2', 'resolve:2']);
});

test('vault runtime gives memory patterns sustained typed steps while Crossing keeps preview timing', () => {
  const runtime = read('src/systems/world/ResonantVaultRuntime.ts');
  const events = read('src/systems/events/GameEvents.ts');
  assert.equal(ECHO_PREVIEW_MILLISECONDS, ECHO_PREVIEW_SECONDS * 1000);
  assert.match(events, /'vault:echo-preview'/);
  assert.match(events, /'vault:echo-step'/);
  assert.match(events, /'vault:echo-resolved'/);
  assert.match(runtime, /target\.type === BlockType\.RESONANCE_PLATE/);
  assert.match(runtime, /buildMemoryDemonstration/);
  assert.match(runtime, /tickMemoryDemonstration/);
  assert.match(runtime, /gameEvents\.emit\('vault:echo-step'/);
  assert.match(runtime, /candidate\.kind === 'memory_choir'/);
  assert.match(runtime, /scheduleEcho\(`crossing:/);
  assert.match(runtime, /worldManager\.setBlocks\(cells\.map/);
  assert.doesNotMatch(runtime, /scheduleEcho\(`pattern:|Vault signal:/);
});

test('memory echoes sustain pylon caps, floor glyphs, and dust trails with world-lit materials', () => {
  const renderer = read('src/components/ResonantEffectsRenderer.tsx');
  const echoLayer = renderer.match(/const PatternFloorGlyph[\s\S]*?export const ResonantEffectsRenderer/)?.[0] ?? '';
  assert.match(echoLayer, /PatternStepMarker/);
  assert.match(echoLayer, /visual\.durationMs/);
  assert.match(echoLayer, /visual\.floorY/);
  assert.match(echoLayer, /const trail = next/);
  assert.match(echoLayer, /meshStandardMaterial/);
  assert.doesNotMatch(echoLayer, /meshBasicMaterial|sphereGeometry|neon|cyan|purple/i);
});
