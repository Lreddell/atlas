import assert from 'node:assert/strict';
import test from 'node:test';

import { ProgressionStore } from './ProgressionStore.ts';

const VAULT_A = 'resonant:1:2:a';
const VAULT_B = 'resonant:-4:7:b';

test('new vault progress uses only the current expedition schema', () => {
  const store = new ProgressionStore();
  assert.deepEqual(store.getVaultProgress(VAULT_A), {
    discovered: false,
    rooms: {},
    titanDefeated: false,
    coreClaimed: false,
    escapeStarted: false,
    escapeCompleted: false,
    coreRewardClaimed: false,
  });
});

test('unknown prototype fields are discarded instead of converted', () => {
  const store = new ProgressionStore();
  store.load({
    version: 1,
    bossesDefeated: [],
    regionStates: {},
    unlockedAbilities: [],
    unlockedRecipes: [],
    resonantVaults: {
      firstVaultRewardClaimed: false,
      vaults: {
        [VAULT_A]: {
          discovered: true,
          rooms: { major_0: true },
          titanDefeated: false,
          coreClaimed: false,
          escapeStarted: false,
          escapeCompleted: false,
          coreRewardClaimed: false,
          wings: { memory: true, traversal: true, combat: true },
          custodianDefeated: true,
        },
      },
    },
  });
  assert.deepEqual(store.getVaultProgress(VAULT_A), {
    discovered: true,
    rooms: { major_0: true },
    titanDefeated: false,
    coreClaimed: false,
    escapeStarted: false,
    escapeCompleted: false,
    coreRewardClaimed: false,
  });
});

test('room and Titan completion is idempotent and vault-scoped', () => {
  const store = new ProgressionStore();
  assert.equal(store.setVaultRoomSolved(VAULT_A, 'major_3'), true);
  assert.equal(store.setVaultRoomSolved(VAULT_A, 'major_3'), false);
  assert.equal(store.isVaultRoomSolved(VAULT_B, 'major_3'), false);
  assert.equal(store.markVaultTitanDefeated(VAULT_A), true);
  assert.equal(store.markVaultTitanDefeated(VAULT_A), false);
  assert.equal(store.getVaultProgress(VAULT_A).titanDefeated, true);
  assert.equal(store.getVaultProgress(VAULT_B).titanDefeated, false);
});

test('core, route choice, and surface completion enforce their order', () => {
  const store = new ProgressionStore();
  assert.equal(store.claimVaultCore(VAULT_A), false);
  store.markVaultTitanDefeated(VAULT_A);
  assert.equal(store.claimVaultCore(VAULT_A), true);
  assert.equal(store.startVaultEscape(VAULT_A), true);
  assert.equal(store.chooseVaultEscapeRoute(VAULT_A, 'fracture'), true);
  assert.equal(store.chooseVaultEscapeRoute(VAULT_A, 'grand'), false);
  assert.equal(store.completeVaultEscape(VAULT_A, 'grand'), false);
  assert.equal(store.completeVaultEscape(VAULT_A, 'fracture'), true);
});

test('current escape checkpoint state round-trips exactly', () => {
  const source = new ProgressionStore();
  source.markVaultTitanDefeated(VAULT_A);
  source.claimVaultCore(VAULT_A);
  source.startVaultEscape(VAULT_A);
  source.chooseVaultEscapeRoute(VAULT_A, 'grand');
  source.updateVaultEscapeRemaining(VAULT_A, 213.4);
  source.setVaultEscapeCheckpoint(VAULT_A, {
    id: 'grand:checkpoint:1', route: 'grand', x: 14.5, y: 81, z: -9.5,
  });

  const restored = new ProgressionStore();
  restored.load(source.serialize());
  assert.deepEqual(restored.serialize(), source.serialize());
  assert.deepEqual(restored.getActiveVaultEscapeRecovery(), {
    vaultId: VAULT_A,
    checkpoint: { id: 'grand:checkpoint:1', route: 'grand', x: 14.5, y: 81, z: -9.5 },
  });
});

test('a checkpoint from the other route is rejected on read', () => {
  const store = new ProgressionStore();
  store.load({
    version: 1,
    bossesDefeated: [],
    regionStates: {},
    unlockedAbilities: [],
    unlockedRecipes: [],
    resonantVaults: {
      firstVaultRewardClaimed: false,
      vaults: {
        [VAULT_A]: {
          discovered: true,
          rooms: {},
          titanDefeated: true,
          coreClaimed: true,
          escapeStarted: true,
          escapeCompleted: false,
          escapeRoute: 'grand',
          escapeRemainingSeconds: 150,
          escapeCheckpoint: {
            id: 'fracture:checkpoint:1', route: 'fracture', x: 12, y: 60, z: -4,
          },
          coreRewardClaimed: true,
        },
      },
    },
  });
  assert.deepEqual(store.getVaultEscapeSession(VAULT_A), {
    remainingSeconds: 150,
    route: 'grand',
    checkpoint: null,
  });
});

test('the global first-vault reward remains a one-time flag', () => {
  const store = new ProgressionStore();
  assert.equal(store.claimFirstVaultReward(), true);
  assert.equal(store.claimFirstVaultReward(), false);
});
