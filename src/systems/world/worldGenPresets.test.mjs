import assert from 'node:assert/strict';
import test from 'node:test';

import { loadTs } from './storage/bundleTs.mjs';

const { DEFAULTS, listWorldGenPresets, saveWorldGenPreset } = await loadTs(`
    export { DEFAULTS } from './src/systems/world/genConfig.ts';
    export { listWorldGenPresets, saveWorldGenPreset } from './src/systems/world/worldGenPresets.ts';
`);

const makeLocalStorage = () => {
    const values = new Map();
    return {
        values,
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, String(value)),
        removeItem: (key) => values.delete(key),
        clear: () => values.clear(),
    };
};

test('browser preset round trip preserves the complete worldgen configuration', () => {
    const previousWindow = globalThis.window;
    const localStorage = makeLocalStorage();
    globalThis.window = { localStorage };

    try {
        const config = JSON.parse(JSON.stringify(DEFAULTS));
        config.noise.temperature.scale = 0.0024;
        config.terrainShape.landOffset = 0.27;
        config.biomes.mountains.base = 166;
        config.height.seaLevel = 65;
        config.climateWarp.amplitude = 29;
        config.spawn.searchRadius = 3072;
        config.bossDomains.magneticFields.radius = 901;
        config.bossDomains.magneticFields.fieldThreshold = 0.73;

        const saved = saveWorldGenPreset('Complete', config);
        assert.ok(saved);
        const [loaded] = listWorldGenPresets();
        assert.ok(loaded);

        assert.equal(loaded.config.noise.temperature.scale, 0.0024);
        assert.equal(loaded.config.terrainShape.landOffset, 0.27);
        assert.equal(loaded.config.biomes.mountains.base, 166);
        assert.equal(loaded.config.height.seaLevel, 65);
        assert.equal(loaded.config.climateWarp.amplitude, 29);
        assert.equal(loaded.config.spawn.searchRadius, 3072);
        assert.equal(loaded.config.bossDomains.magneticFields.radius, 901);
        assert.equal(loaded.config.bossDomains.magneticFields.fieldThreshold, 0.73);
        assert.deepEqual(loaded.config, config, 'every current config field must survive the preset round trip');

        const raw = JSON.parse(localStorage.values.get('atlas.worldGen.presets'));
        assert.equal(raw[0].config.bossDomains.magneticFields.radius, 901);
    } finally {
        if (previousWindow === undefined) delete globalThis.window;
        else globalThis.window = previousWindow;
    }
});
