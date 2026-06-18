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
    entities: ['forge_warden', 'slime'],
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
    assert.deepEqual(complete('/cleanse v', options), ['volcanic']);
    assert.deepEqual(complete('/giveitem i', options), ['iron_boots']);
    assert.deepEqual(complete('/equip i', options), ['iron_boots']);
    assert.deepEqual(complete('/unequip b', options), ['boots']);
    assert.deepEqual(complete('/spawn f', options), ['forge_warden']);
    assert.deepEqual(complete('/playsound ui', options), ['ui.click']);
    assert.deepEqual(complete('/locate biome v', options), ['volcanic']);
    assert.deepEqual(complete('/giveitem stone ', options), ['1', '16', '32', '64']);
});
