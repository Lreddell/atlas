import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { URL } from 'node:url';

import * as commandData from './commands.ts';

const options = {
    biomes: ['plains', 'volcanic'],
    regions: ['volcanic'],
    items: ['iron_boots', 'stone'],
    equippableItems: ['iron_boots'],
    entities: ['bell_titan', 'magnetic_warden'],
    sounds: ['entity.player.hurt', 'ui.click'],
};

test('registers every executable command for top-level autocomplete', () => {
    const appSource = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
    const handledCommands = Array.from(
        new Set(Array.from(appSource.matchAll(/parts\[0\]\s*===\s*'([^']+)'/g), match => match[1])),
    );

    for (const command of handledCommands) {
        assert.ok(commandData.COMMANDS.includes(command), `${command} is missing`);
    }
});

test('suggests commands and their known arguments', () => {
    assert.equal(typeof commandData.getAutocompleteCandidates, 'function');
    const complete = commandData.getAutocompleteCandidates;

    assert.deepEqual(complete('/reg', options), ['/region']);
    assert.deepEqual(complete('/boss ', options), ['spawn', 'kill']);
    assert.deepEqual(complete('/vault ', options), ['skip']);
    assert.deepEqual(complete('/vault s', options), ['skip']);
    assert.deepEqual(complete('/magf', options), ['/magfields']);
    assert.deepEqual(complete('/magfields ', options), ['on', 'off', 'toggle']);
    assert.deepEqual(complete('/magfields t', options), ['toggle']);
    assert.deepEqual(complete('/cleanse v', options), ['volcanic']);
    assert.deepEqual(complete('/giveitem i', options), ['iron_boots']);
    assert.deepEqual(complete('/equip i', options), ['iron_boots']);
    assert.deepEqual(complete('/unequip b', options), ['boots']);
    assert.deepEqual(complete('/spawn b', options), ['bell_titan']);
    assert.deepEqual(complete('/playsound ui', options), ['ui.click']);
    assert.deepEqual(complete('/locate ', options), ['biome', 'vault']);
    assert.deepEqual(complete('/locate v', options), ['vault']);
    assert.deepEqual(complete('/locate biome v', options), ['volcanic']);
    assert.deepEqual(complete('/giveitem stone ', options), ['1', '16', '32', '64']);
});

test('/vault skip completes only the active Vault requirements and opens its boss seal', () => {
    const appSource = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
    const runtimeSource = readFileSync(new URL('../systems/world/ResonantVaultRuntime.ts', import.meta.url), 'utf8');
    const skipMethod = runtimeSource.slice(
        runtimeSource.indexOf('skipRequirementsBeforeBoss('),
        runtimeSource.indexOf('prepareForPlayerRecovery()'),
    );

    assert.match(appSource, /parts\[0\]\s*===\s*'\/vault'[\s\S]{0,500}skipRequirementsBeforeBoss\(playerPosRef\.current\)/);
    assert.match(runtimeSource, /skipRequirementsBeforeBoss\([\s\S]{0,500}getVaultRequiredRoomIds\(layout\)/);
    assert.match(runtimeSource, /skipRequirementsBeforeBoss\([\s\S]{0,900}progression\.setVaultRoomSolved\(layout\.vaultId, roomId\)/);
    assert.match(runtimeSource, /skipRequirementsBeforeBoss\([\s\S]{0,1100}this\.openHubSeal\(layout\)/);
    assert.doesNotMatch(skipMethod, /markVaultTitanDefeated|claimVaultCore|startVaultEscape/);
});

test('/locate vault uses the deterministic vault locator and offers a surface teleport', () => {
    const appSource = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
    const worldManagerSource = readFileSync(new URL('../systems/WorldManager.ts', import.meta.url), 'utf8');

    assert.match(appSource, /parts\[1\]\s*===\s*'vault'[\s\S]{0,180}worldManager\.locateVault\(/);
    assert.match(worldManagerSource, /public async locateVault\(startX: number, startZ: number\): Promise<void>/);
    // The locator must only report candidates that pass preflight; a rejected
    // candidate never generates and would point players at empty terrain.
    assert.match(worldManagerSource, /locateVault[\s\S]{0,200}resolveNearestAcceptedVaultCandidate\(startX, startZ, 18000\)/);
    assert.match(worldManagerSource, /rejectedVaultCandidates\.has\(getVaultId\(entry\)\)/);
    assert.match(worldManagerSource, /getVaultSpirePosition\(candidate\)/);
    assert.match(worldManagerSource, /getVaultOpenAirSurfaceY\(this\.getTerrainHeight\(spire\.x, spire\.z\)\)/);
    assert.match(worldManagerSource, /getVaultSurfaceApproach\(candidate, surfaceY\)/);
    assert.match(worldManagerSource, /Found Resonant Vault at X=\$\{tx\}, Z=\$\{tz\}[\s\S]{0,100}`\/tp \$\{tx\} \$\{ty\} \$\{tz\}`/);
});
