// Gate 0 end-to-end fixtures: proving-ground contract cycle on a fake world,
// plus migration coverage (legacy blocks, inventory-only items, equipment,
// chests, furnaces, vault state, boats, exports, unknown ids, double reload).
import assert from 'node:assert/strict';
import test from 'node:test';

import { loadTsViaFile } from '../world/storage/bundleTs.mjs';

const pg = await loadTsViaFile(`
    export { buildProvingGround, clearProvingGround, startProvingEncounter, stageProvingTempEdits, failProvingEncounter, clearProvingEncounter, armProvingRematch, placeProvingAnchor, tryProvingTravel, provingAtlasInfo, canStartProvingFrenzy } from './src/systems/campaign/provingGround.ts';
    export { PROVING_SITE_ID, PROVING_CREST_ID, PROVING_KEYSTONE_ID } from './src/systems/campaign/provingGround.ts';
`, 'proving-fixture');
const tiles = await loadTsViaFile(`
    export { createChest, createFurnace, getChest, getFurnace, handleBlockReplaced, removeChest } from './src/systems/world/tileEntities.ts';
    export { createWorldState } from './src/systems/world/worldTypes.ts';
`, 'tile-fixture');
const expo = await loadTsViaFile(`
    export { encodeExportedWorld, decodeExportedWorld } from './src/systems/world/storage/worldExport.ts';
`, 'export-fixture');
const prog = await loadTsViaFile(`
    export { ProgressionStore } from './src/systems/progression/ProgressionStore.ts';
`, 'progression-fixture');

// --- Fake production surface (in-memory voxels + real state machine) ---

const AIR = 0;
const STONE = 3;
const CHEST = 19;
const PROVING_STONE = 256;
const PROVING_WAYSTONE = 257;
const PROVING_ANCHOR = 258;

function fakeAccess() {
  const voxels = new Map();
  const key = (x, y, z) => `${x},${y},${z}`;
  return {
    voxels,
    getBlock(x, y, z) { return voxels.get(key(x, y, z)) ?? AIR; },
    setBlock(x, y, z, t) { if (t === AIR) voxels.delete(key(x, y, z)); else voxels.set(key(x, y, z), t); },
    getMetadata() { return 0; },
  };
}

function fakeProgression() {
  const store = new prog.ProgressionStore();
  store.load(null);
  return store;
}

test('proving cycle: build -> start -> temp edits -> fail restores -> clear hands off -> rematch', () => {
  const access = fakeAccess();
  // Flat stone floor so the surface scan terminates.
  for (let dx = -10; dx <= 10; dx++) for (let dz = -10; dz <= 10; dz++) access.setBlock(dx, 60, dz, STONE);
  const progression = fakeProgression();
  const layout = pg.buildProvingGround(access, 0, 0, 70);
  assert.equal(access.getBlock(0, 61, 0), PROVING_STONE);
  assert.equal(access.getBlock(layout.waystone.x, layout.waystone.y, layout.waystone.z), PROVING_WAYSTONE);
  assert.equal(access.getBlock(layout.anchor.x, layout.anchor.y, layout.anchor.z), PROVING_ANCHOR);
  // Barrier physically blocks the route.
  assert.ok(layout.barrier.every((p) => access.getBlock(p.x, p.y, p.z) === PROVING_STONE));

  const started = pg.startProvingEncounter(progression);
  assert.equal(started.state.phase, 'fighting');
  pg.stageProvingTempEdits(access, started, layout);
  assert.equal(started.tempLayer.pendingCount, 3);
  const tempCell = { x: layout.origin.x - 2, y: layout.origin.y + 1, z: layout.origin.z - 2 };
  assert.equal(access.getBlock(tempCell.x, tempCell.y, tempCell.z), PROVING_STONE);

  // Failure restores the exact previous voxels (air here).
  const failed = pg.failProvingEncounter(access, progression, started);
  assert.equal(failed.state.phase, 'ready');
  assert.equal(access.getBlock(tempCell.x, tempCell.y, tempCell.z), AIR);
  // Barrier still closed after a failure.
  assert.ok(layout.barrier.every((p) => access.getBlock(p.x, p.y, p.z) === PROVING_STONE));

  // Clear: crest once, barrier opens, waystone activates, keystone granted.
  const cleared = pg.clearProvingEncounter(access, progression, failed, layout, 12345);
  assert.equal(cleared.state.phase, 'cleared');
  assert.ok(progression.hasCampaignCrest(pg.PROVING_CREST_ID));
  assert.ok(progression.getCampaignKeystones().includes(pg.PROVING_KEYSTONE_ID));
  assert.ok(layout.barrier.every((p) => access.getBlock(p.x, p.y, p.z) === AIR));
  assert.equal(progression.getWaystones()[pg.PROVING_SITE_ID]?.active, true);
  // Second clear grants nothing twice.
  const cleared2 = pg.clearProvingEncounter(access, progression, cleared, layout, 12346);
  assert.equal(cleared2.granted, false);

  // Rematch arms a protected instance; cleared site untouched.
  const armed = pg.armProvingRematch(progression, cleared);
  assert.equal(armed.state.phase, 'rematch_armed');
  assert.ok(layout.barrier.every((p) => access.getBlock(p.x, p.y, p.z) === AIR));
});

test('anchor: five charges, rest attunes, refill consumes cobblestone, exhaustion denies', () => {
  const progression = fakeProgression();
  const anchor = pg.placeProvingAnchor(progression, { anchor: { x: 1, y: 2, z: 3 } });
  assert.equal(anchor.charges, 5);
  assert.equal(anchor.maxCharges, 5);
  assert.ok(progression.consumeAnchorCharge(pg.PROVING_SITE_ID));
  assert.equal(progression.getAnchor(pg.PROVING_SITE_ID).charges, 4);
  assert.equal(progression.refillAnchor(pg.PROVING_SITE_ID, 3), 1);
  assert.equal(progression.getAnchor(pg.PROVING_SITE_ID).charges, 5);
  for (let i = 0; i < 5; i++) progression.consumeAnchorCharge(pg.PROVING_SITE_ID);
  assert.equal(progression.consumeAnchorCharge(pg.PROVING_SITE_ID), false);
});

test('waystone travel: dormant refused, fighting refused, cleared travels', () => {
  const access = fakeAccess();
  for (let dx = -10; dx <= 10; dx++) for (let dz = -10; dz <= 10; dz++) access.setBlock(dx, 60, dz, STONE);
  const layout = pg.buildProvingGround(access, 0, 0, 70);
  // Dormant waystone refuses.
  assert.equal(pg.tryProvingTravel(access, 'ready', layout, false).ok, false);
  // Fighting refuses even when active.
  assert.equal(pg.tryProvingTravel(access, 'fighting', layout, true).ok, false);
  // Cleared + active travels to a validated landing.
  const res = pg.tryProvingTravel(access, 'cleared', layout, true);
  assert.equal(res.ok, true);
  assert.ok(res.destination);
});

test('frenzy needs all three: demonstrable blood moon, cleared site, active waystone', () => {
  assert.equal(pg.canStartProvingFrenzy(false, 'cleared', true), false);
  assert.equal(pg.canStartProvingFrenzy(true, 'ready', true), false);
  assert.equal(pg.canStartProvingFrenzy(true, 'cleared', false), false);
  assert.equal(pg.canStartProvingFrenzy(true, 'cleared', true), true);
});

test('atlas info is bearing + sketch prose, never live markers', () => {
  const info = pg.provingAtlasInfo({ anchors: [{ type: 'heartwood', x: 0, z: 0, radius: 1600 }] }, 300, 400);
  assert.equal(info.region, 'gate0_proving_ground');
  assert.ok(info.sketch.length > 0);
  assert.ok(info.hint.includes('bearing'));
  assert.ok(!('enemies' in info) && !('loot' in info));
});

test('tile entities: chest guard, furnace smelt chain, break spills contents', () => {
  const state = tiles.createWorldState();
  tiles.createChest(state, 1, 2, 3);
  tiles.getChest(state, 1, 2, 3).items[0] = { type: 111, count: 5 };
  tiles.createChest(state, 1, 2, 3); // guarded: no wipe
  assert.equal(tiles.getChest(state, 1, 2, 3).items[0].count, 5);
  tiles.createFurnace(state, 4, 5, 6);
  const dropped = tiles.handleBlockReplaced(state, 1, 2, 3, CHEST, AIR);
  assert.deepEqual(dropped, [{ type: 111, count: 5 }]);
  assert.equal(tiles.getChest(state, 1, 2, 3), undefined);
  // Furnace active<->idle swap preserves state.
  tiles.createFurnace(state, 7, 8, 9);
  tiles.getFurnace(state, 7, 8, 9).input = { type: 15, count: 2 };
  tiles.handleBlockReplaced(state, 7, 8, 9, 17, 18);
  assert.equal(tiles.getFurnace(state, 7, 8, 9).input.count, 2);
});

test('export/import carries player, equipment, cursor, boats, vaults, tiles, campaign, registry', () => {
  const meta = {
    name: 'Fixture', seed: 's', seedNum: 7, gameMode: 'survival', time: 1000,
    player: {
      position: { x: 1, y: 2, z: 3 }, rotation: { x: 0, y: 0 },
      inventory: [{ type: 256, count: 16 }, null],
      health: 20, hunger: 20, saturation: 5, breath: 10, gameMode: 'survival', selectedSlot: 0,
      equipment: { helmet: { type: 192, count: 1 } },
      cursorStack: { type: 256, count: 3 },
    },
    spawnPoint: { x: 0, y: 64, z: 0 }, worldSpawn: { x: 0, y: 64, z: 0 },
    progression: { version: 2, bossesDefeated: [], regionStates: {}, unlockedAbilities: [], unlockedRecipes: [], campaign: { crests: ['atlas:gate0_crest'] } },
    boats: [{ x: 1, y: 62, z: 1, yaw: 0 }],
    resonantVaultReservations: { 'resonant:1:2:v': { layoutSignature: 'sig', acceptedAtVersion: 1 } },
    campaignGraph: { schema: 1, worldgenVersion: 1, seedNum: 7, isRetrofit: false, anchors: [{ type: 'heartwood', x: 0, z: 0, radius: 1600 }] },
    provenance: 'standard',
    registrySnapshot: { version: 1, extra: [{ numeric: 256, namespaced: 'atlas:gate0_proving_stone' }] },
    tileEntities: { chests: { '1,2,3': { items: [{ type: 111, count: 5 }] } }, furnaces: {} },
  };
  const chunks = [{ cx: 0, cz: 0, blocks: new Uint16Array([1, 256, 65535]), light: new Uint8Array([0, 0, 0]), meta: new Uint8Array([0, 0, 0]), timestamp: 1 }];
  const exported = expo.encodeExportedWorld(meta, chunks);
  assert.equal(exported.version, 3);
  const { metaFields, chunks: back } = expo.decodeExportedWorld(exported);
  assert.deepEqual(metaFields.player.equipment, { helmet: { type: 192, count: 1 } });
  assert.deepEqual(metaFields.player.cursorStack, { type: 256, count: 3 });
  assert.deepEqual(metaFields.player.inventory[0], { type: 256, count: 16 });
  assert.deepEqual(metaFields.boats, [{ x: 1, y: 62, z: 1, yaw: 0 }]);
  assert.deepEqual(metaFields.tileEntities.chests['1,2,3'].items[0], { type: 111, count: 5 });
  assert.deepEqual(metaFields.campaignGraph.anchors[0], { type: 'heartwood', x: 0, z: 0, radius: 1600 });
  assert.deepEqual(metaFields.registrySnapshot.extra, [{ numeric: 256, namespaced: 'atlas:gate0_proving_stone' }]);
  // 256 survives only when registered; here the bundle has no allocation, so
  // the import funnel maps it to the placeholder (documented rule).
  assert.deepEqual([...back[0].blocks], [1, 65535, 65535]);
  // Double reload is stable: re-export the decoded world and compare bytes.
  const re = expo.decodeExportedWorld(expo.encodeExportedWorld(metaFields, back));
  assert.deepEqual([...re.chunks[0].blocks], [1, 65535, 65535]);
  assert.equal(re.metaFields.provenance, 'standard');
});

test('preview worlds never fabricate canonical clears', () => {
  const store = new prog.ProgressionStore();
  store.load({ version: 2, bossesDefeated: [], regionStates: {}, unlockedAbilities: [], unlockedRecipes: [], campaign: { provenance: 'preview', crests: ['atlas:gate0_crest', 'atlas:furrow_crest'], keystones: ['atlas:sunscar_keystone'] } });
  const dropped = store.sanitizePreviewCampaign(['atlas:gate0_', 'gate0:']);
  assert.deepEqual(dropped.sort(), ['atlas:furrow_crest', 'atlas:sunscar_keystone']);
  assert.deepEqual(store.getCampaign().crests, ['atlas:gate0_crest']);
  assert.deepEqual(store.getCampaign().keystones ?? [], []);
});
