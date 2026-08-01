import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { getCompletedEscapeRoute } from './resonantVaultEscapeRules.ts';

const root = path.resolve(import.meta.dirname, '../../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const runtime = read('src/systems/world/ResonantVaultRuntime.ts');
const guide = read('src/data/resonantGuide.ts');
const loot = read('src/systems/world/resonantVaultLoot.ts');
const entities = read('src/systems/entities/resonantEntities.ts');

const escapeLayout = {
  rooms: [],
  surfaceOutlets: {
    grand: { route: 'grand', x: -13, z: 0, floorY: 100, surfaceY: 100, thresholdRadius: 2, room: 'outlet_grand' },
    fracture: { route: 'fracture', x: 13, z: 0, floorY: 104, surfaceY: 104, thresholdRadius: 2, room: 'outlet_fracture' },
  },
};

test('escape completion requires the chosen open-air surface threshold', () => {
  assert.equal(getCompletedEscapeRoute(escapeLayout, { x: -13, y: 101, z: 0 }, 'grand', false), null);
  assert.equal(getCompletedEscapeRoute(escapeLayout, { x: -13, y: 100, z: 0 }, 'grand', true), null);
  assert.equal(getCompletedEscapeRoute(escapeLayout, { x: 13, y: 105, z: 0 }, 'grand', true), null);
  assert.equal(getCompletedEscapeRoute(escapeLayout, { x: -13, y: 101, z: 0 }, 'grand', true), 'grand');
  assert.equal(getCompletedEscapeRoute(escapeLayout, { x: 13, y: 105, z: 0 }, 'fracture', true), 'fracture');
});

test('runtime opens only the chosen current ascent and resolves at the surface', () => {
  assert.match(runtime, /currentProgress\.escapeStarted && !currentProgress\.escapeCompleted/);
  assert.match(runtime, /getCompletedEscapeRoute\(layout, player, chosenRoute/);
  assert.match(runtime, /advanceVaultEscape/);
  assert.match(runtime, /gate === 'grand_ascent' \|\| gate === 'fracture_stair'/);
  assert.doesNotMatch(runtime, /escape_west|escape_east|outlet_west|outlet_east/);
});

test('Vault rewards are conventional equipment and the Titan Hammer remains boss-exclusive', () => {
  for (const item of ['VAULTSTEEL_SPEAR', 'VAULT_CROSSBOW', 'BELLBREAKER_MAUL', 'ECHO_TUNING_FORK', 'TITAN_HAMMER']) {
    assert.match(guide, new RegExp(`BlockType\\.${item}`));
  }
  assert.doesNotMatch(loot, /BlockType\.TITAN_HAMMER/);
  assert.match(entities, /bell_titan:[\s\S]{0,800}drops: \[\{ type: BlockType\.TITAN_HAMMER, min: 1, max: 1, chance: 1 \}\]/);
  assert.doesNotMatch(`${runtime}\n${loot}`, /RESONATOR|PULSE_BRACER|CUSTODIAN_SIGIL|RESONANT_LENS/);
});
