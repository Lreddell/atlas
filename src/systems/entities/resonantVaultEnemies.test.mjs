import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  MAX_LOADED_VAULT_ENEMIES,
  MAX_ROOM_ENEMIES,
  getRoomEncounterWaves,
  getVaultEnemyProfile,
  getVaultRecoveryAnchors,
} from './resonantVaultEnemies.ts';
import * as vaultEnemies from './resonantVaultEnemies.ts';

test('vault enemy types have different roles, bodies, and movement', () => {
  assert.equal(getVaultEnemyProfile('vault_guard').role, 'frontline');
  assert.equal(getVaultEnemyProfile('vault_marksman').role, 'ranged');
  assert.equal(getVaultEnemyProfile('bell_hound').role, 'flanker');
  assert.equal(getVaultEnemyProfile('tollkeeper').role, 'elite');
  assert.notDeepEqual(getVaultEnemyProfile('bell_hound').navigation, getVaultEnemyProfile('tollkeeper').navigation);
  assert.ok(getVaultEnemyProfile('tollkeeper').navigation.width > getVaultEnemyProfile('vault_guard').navigation.width);
  for (const kind of ['vault_guard', 'vault_marksman', 'bell_hound', 'tollkeeper']) {
    // The arena room is 55x51, so corner-to-corner is ~75 blocks.
    assert.ok(getVaultEnemyProfile(kind).entity.aggroRange >= 75, `${kind} must acquire across the arena's full diagonal`);
  }
});

test('every damaging action has explicit anticipation, active, recovery, and counterplay', () => {
  for (const kind of ['vault_guard', 'vault_marksman', 'bell_hound', 'tollkeeper']) {
    const profile = getVaultEnemyProfile(kind);
    assert.ok(profile.actions.length >= 2);
    for (const action of profile.actions) {
      assert.match(action.attackClass, /^(melee|ranged|control)$/);
      assert.ok(action.anticipation > 0);
      assert.ok(action.active > 0);
      assert.ok(action.recovery > 0);
      assert.ok(action.damage > 0);
      assert.ok(action.minRange >= 0 && action.range > action.minRange);
      assert.ok(action.cooldownSeconds >= action.active + action.recovery);
      assert.ok(action.counterplay.length > 8);
    }
  }
});

test('room waves are deterministic, role-authored, and respect both live caps', () => {
  assert.equal(MAX_ROOM_ENEMIES, 6);
  assert.equal(MAX_LOADED_VAULT_ENEMIES, 12);
  const expectedWaveCounts = { guard_hall: 3, resonance_foundry: 3, inner_works: 3, bell_crypt: 4, grand_ascent: 2 };
  for (const [roomKind, count] of Object.entries(expectedWaveCounts)) {
    const waves = getRoomEncounterWaves(roomKind, 17);
    assert.deepEqual(getRoomEncounterWaves(roomKind, 17), waves);
    assert.equal(waves.length, count);
    assert.ok(waves.every((wave) => wave.length <= MAX_ROOM_ENEMIES));
    assert.ok(waves.every((wave) => new Set(wave.map((kind) => getVaultEnemyProfile(kind).role)).size >= 2));
    const signatures = new Set(Array.from({ length: 8 }, (_, seed) => JSON.stringify(getRoomEncounterWaves(roomKind, seed))));
    assert.ok(signatures.size >= 2, `${roomKind} must vary between vault seeds`);
  }
});

test('both Bell Titan shell breaks summon distinct authored reinforcement waves', () => {
  assert.equal(typeof vaultEnemies.getBellTitanReinforcementWave, 'function');
  assert.deepEqual(
    vaultEnemies.getBellTitanReinforcementWave(1),
    ['bell_hound', 'bell_hound', 'bell_hound', 'vault_guard', 'vault_guard'],
  );
  assert.deepEqual(
    vaultEnemies.getBellTitanReinforcementWave(2),
    ['vault_marksman', 'vault_marksman', 'tollkeeper', 'tollkeeper', 'bell_hound', 'vault_guard'],
  );
  assert.notDeepEqual(vaultEnemies.getBellTitanReinforcementWave(1), vaultEnemies.getBellTitanReinforcementWave(2));
  // The second break escalates: strictly more bodies than the first.
  assert.ok(vaultEnemies.getBellTitanReinforcementWave(2).length > vaultEnemies.getBellTitanReinforcementWave(1).length);
});

test('each room owns four bounded deterministic recovery anchors', () => {
  const bounds = { minX: 10, maxX: 40, minY: 5, maxY: 22, minZ: -20, maxZ: 12 };
  const anchors = getVaultRecoveryAnchors(bounds, 6, 3);
  assert.equal(anchors.length, 4);
  assert.deepEqual(anchors, getVaultRecoveryAnchors(bounds, 6, 3));
  for (const anchor of anchors) {
    assert.ok(anchor.x >= bounds.minX + 2 && anchor.x <= bounds.maxX - 2);
    assert.ok(anchor.z >= bounds.minZ + 2 && anchor.z <= bounds.maxZ - 2);
    assert.equal(anchor.y, 6);
  }
});

test('the new identities do not inherit Magnetic Warden mechanics', () => {
  const root = path.resolve(import.meta.dirname, '../../..');
  const source = fs.readFileSync(path.join(root, 'src/systems/entities/resonantVaultEnemies.ts'), 'utf8');
  assert.doesNotMatch(source, /polarity|magneticField|shieldCrystals|parryDamage|slamThreshold/);
});
