import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '../../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('gate 0 foundation modules exist', () => {
  for (const f of [
    'src/systems/campaign/contentIdentity.ts',
    'src/systems/campaign/chunkPalette.ts',
    'src/systems/campaign/campaignGraph.ts',
    'src/systems/campaign/regionDomains.ts',
    'src/systems/campaign/encounterSites.ts',
    'src/systems/campaign/progression.ts',
    'src/systems/campaign/waystones.ts',
    'src/systems/campaign/bloodMoon.ts',
    'src/systems/campaign/previewScenarios.ts',
    'src/systems/campaign/retrofit.ts',
    'src/systems/campaign/campaignRegions.ts',
    'src/systems/campaign/presentation.ts',
    'src/systems/campaign/fixtures.ts',
  ]) {
    assert.ok(fs.existsSync(path.join(root, f)), `${f} missing`);
  }
});

test('campaign graph keeps fixed region order with heartwood origin', () => {
  const src = read('src/systems/campaign/campaignGraph.ts');
  assert.match(src, /heartwood[\s\S]*sunscar[\s\S]*frostbound[\s\S]*tidelost[\s\S]*shattered_meridian[\s\S]*meridian_engine/);
  assert.match(src, /x:\s*0[\s\S]*z:\s*0/);
});

test('encounter state machine never corrupts cleared sites on rematch', () => {
  const src = read('src/systems/campaign/encounterSites.ts');
  assert.match(src, /rematchAvailable/);
  assert.match(src, /tempLayerActive/);
  assert.match(src, /resolveInterruptedFight/);
});

test('preview provenance never fabricates prior clears', () => {
  const src = read('src/systems/campaign/previewScenarios.ts');
  assert.match(src, /fabricatedPriorClears:\s*false/);
  assert.match(src, /nonExportable/);
});

test('progression store preserves old saves (campaign optional)', () => {
  const src = read('src/systems/progression/ProgressionStore.ts');
  assert.match(src, /campaign\?: CampaignProgressionData/);
  assert.match(src, /version:\s*1\s*\|\s*2/);
  assert.match(src, /sanitizeCampaignData/);
});
