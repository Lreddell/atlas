import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '../../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const regions = {
  heartwood: {
    file: 'src/data/campaign/heartwood.ts',
    bosses: ['root_tusk', 'briar_castellan', 'crownroot_stag', 'bell_titan'],
    guardians: ['moonhorn_stalker', 'the_gleaner'],
    keystone: 'atlas:heartwood_keystone',
  },
  sunscar: {
    file: 'src/data/campaign/sunscar.ts',
    bosses: ['glassjaw_burrower', 'cinder_warden', 'mirage_regent', 'pyreback_colossus'],
    guardians: ['carrion_sun', 'salt_glass_saint'],
    keystone: 'atlas:sunscar_keystone',
  },
  frostbound: {
    file: 'src/data/campaign/frostbound.ts',
    bosses: ['whitefang_packlord', 'rimeblade_exile', 'pale_avalanche', 'boreal_weaver'],
    guardians: ['black_ice_huntsman', 'underfloe_horror'],
    keystone: 'atlas:frostbound_keystone',
  },
  tidelost: {
    file: 'src/data/campaign/tidelost.ts',
    bosses: ['riverjaw_matriarch', 'jade_mantis', 'mangrove_colossus', 'nacre_leviathan'],
    guardians: ['bog_lantern', 'sunken_gardener'],
    keystone: 'atlas:tidelost_keystone',
  },
  shattered: {
    file: 'src/data/campaign/shattered.ts',
    bosses: ['compass_beast', 'rail_saint', 'twin_poles', 'magnetic_warden'],
    guardians: ['lodestone_drake', 'iron_bloom'],
    keystone: 'atlas:meridian_keystone',
  },
};

for (const [name, spec] of Object.entries(regions)) {
  test(`${name}: declares 4 required bosses + 2 guardians + keystone`, () => {
    const src = read(spec.file);
    for (const boss of spec.bosses) assert.ok(src.includes(boss), `${name} missing boss ${boss}`);
    for (const guardian of spec.guardians) assert.ok(src.includes(guardian), `${name} missing guardian ${guardian}`);
    assert.ok(src.includes(spec.keystone), `${name} missing keystone ${spec.keystone}`);
    assert.match(src, /registerCampaignRegion/);
    assert.match(src, /frenzyPackages/);
  });
}

test('engine finale requires all five keystones + atlas seal', () => {
  const src = read('src/data/campaign/engine.ts');
  for (const k of [
    'atlas:heartwood_keystone',
    'atlas:sunscar_keystone',
    'atlas:frostbound_keystone',
    'atlas:tidelost_keystone',
    'atlas:meridian_keystone',
  ]) {
    assert.ok(src.includes(k), `engine missing ${k}`);
  }
  assert.ok(src.includes('atlas:atlas_seal'), 'engine missing Atlas Seal');
  assert.ok(src.includes('first_surveyor'), 'engine missing First Surveyor');
});

test('high reach has preview + canonical gate paths without second migration', () => {
  const src = read('src/data/campaign/highReach.ts');
  assert.match(src, /previewAvailable/);
  assert.match(src, /canonicalGateActive/);
  assert.match(src, /reuses/i);
});

test('no region squeezes BlockType gaps (namespaced atlas: ids)', () => {
  for (const file of [
    'src/data/campaign/heartwood.ts',
    'src/data/campaign/sunscar.ts',
    'src/data/campaign/frostbound.ts',
    'src/data/campaign/tidelost.ts',
    'src/data/campaign/shattered.ts',
    'src/data/campaign/engine.ts',
  ]) {
    const src = read(file);
    assert.match(src, /atlas:/);
    assert.doesNotMatch(src, /BlockType\.\w+\s*=\s*\d+/);
  }
});
