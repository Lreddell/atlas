import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  getEncounterActivation,
  insetEncounterBounds,
  isPlayerInsideEncounter,
  selectActivatedRoomId,
} from './resonantEncounterActivation.ts';

const room = { minX: 20, maxX: 40, minY: 4, maxY: 20, minZ: -10, maxZ: 10 };

test('an enemy in the next sealed room does not activate through the wall', () => {
  const result = getEncounterActivation({
    player: { x: 0, y: 10, z: 0 },
    room,
    entranceCrossed: false,
    gateOpen: false,
  });
  assert.equal(result.active, false);
  assert.equal(result.lockRoomId, false);
});

test('crossing the authored threshold activates exactly one room encounter', () => {
  const result = getEncounterActivation({
    player: { x: 21, y: 10, z: 0 },
    room,
    entranceCrossed: true,
    gateOpen: true,
  });
  assert.equal(result.active, true);
  assert.equal(result.lockRoomId, true);
  assert.equal(isPlayerInsideEncounter(room, { x: 21, y: 10, z: 0 }), true);
  const safeInterior = insetEncounterBounds(room, 1.5);
  assert.equal(isPlayerInsideEncounter(safeInterior, { x: 20.5, y: 10, z: 0 }), false);
  assert.equal(isPlayerInsideEncounter(safeInterior, { x: 22, y: 10, z: 0 }), true);

  const selected = selectActivatedRoomId({
    player: { x: 21, y: 10, z: 0 },
    lockedRoomId: null,
    rooms: [
      { id: 'guard', bounds: room, cleared: false, chunksLoaded: true },
      { id: 'foundry', bounds: { ...room, minX: 41, maxX: 61 }, cleared: false, chunksLoaded: true },
    ],
  });
  assert.equal(selected, 'guard');
});

test('cleared, unloaded, adjacent, and already locked rooms cannot steal activation', () => {
  const rooms = [
    { id: 'guard', bounds: room, cleared: false, chunksLoaded: true },
    { id: 'foundry', bounds: { ...room, minX: 41, maxX: 61 }, cleared: false, chunksLoaded: true },
  ];
  assert.equal(selectActivatedRoomId({ player: { x: 21, y: 10, z: 0 }, lockedRoomId: 'foundry', rooms }), 'foundry');
  assert.equal(selectActivatedRoomId({ player: { x: 21, y: 10, z: 0 }, lockedRoomId: null, rooms: [{ ...rooms[0], cleared: true }] }), null);
  assert.equal(selectActivatedRoomId({ player: { x: 21, y: 10, z: 0 }, lockedRoomId: null, rooms: [{ ...rooms[0], chunksLoaded: false }] }), null);
  assert.equal(selectActivatedRoomId({ player: { x: 41.5, y: 10, z: 0 }, lockedRoomId: null, rooms }), 'foundry');
});

test('live encounters are room-scoped, gate-aware, capped, and use swept enemy bolts', () => {
  const root = path.resolve(import.meta.dirname, '../../..');
  const director = fs.readFileSync(path.join(root, 'src/systems/entities/ResonantEncounterDirector.ts'), 'utf8');
  const runtime = fs.readFileSync(path.join(root, 'src/systems/world/ResonantVaultRuntime.ts'), 'utf8');
  const manager = fs.readFileSync(path.join(root, 'src/systems/entities/EntityManager.ts'), 'utf8');
  const events = fs.readFileSync(path.join(root, 'src/systems/events/GameEvents.ts'), 'utf8');
  assert.match(director, /getRoomEncounterWaves/);
  assert.match(director, /MAX_LOADED_VAULT_ENEMIES/);
  assert.match(director, /VaultProjectileSystem/);
  assert.match(director, /owner:\s*'enemy'/);
  assert.doesNotMatch(director, /distance\s*<\s*30/);
  assert.match(runtime, /ensureRoomEncounter/);
  assert.match(runtime, /guard_hall[\s\S]{0,240}resonance_foundry[\s\S]{0,240}inner_works/);
  assert.match(manager, /encounterBounds/);
  assert.match(manager, /recoveryAnchors/);
  assert.match(events, /'vault:encounter-progress'/);
  assert.match(events, /'vault:encounter-cleared'/);
});
