import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

// genConfig.ts is enum-free/erasable, so it can be imported directly under
// Node's type-stripping runner. biomes.ts/chunkGeneration.ts import the
// BlockType enum, so their behavior is asserted via source text instead.
import { DEFAULTS, GenConfig, loadGenConfig, resetGenConfig } from './genConfig.ts';
import * as genConfigModule from './genConfig.ts';

const root = path.resolve(import.meta.dirname, '../../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const biomesSource = read('src/systems/world/biomes.ts');
const chunkGenSource = read('src/systems/world/chunkGeneration.ts');
const regionsSource = read('src/systems/world/regions.ts');

test('temperate weirdness sub-bands are not shadowed by the mountain rule', () => {
    const b = DEFAULTS.biomes;
    // getBiome checks mountains (weird > minWeird) before the temperate bands,
    // so every temperate high-weirdness variant must end at or below it or it
    // can never be selected (the old 0.40 threshold silently ate swamp, jungle,
    // and dark forest).
    assert.ok(b.swamp.maxWeird <= b.mountains.minWeird, 'swamp band shadowed by mountains');
    assert.ok(b.jungle.maxWeird <= b.mountains.minWeird, 'jungle band shadowed by mountains');
    assert.ok(b.darkForest.maxWeird <= b.mountains.minWeird, 'dark forest band shadowed by mountains');
    // Bands must be non-empty.
    assert.ok(b.swamp.minWeird < b.swamp.maxWeird);
    assert.ok(b.jungle.minWeird < b.jungle.maxWeird);
    assert.ok(b.darkForest.minWeird < b.darkForest.maxWeird);
    // Swamp is a warm/wet band with an upper temperature bound.
    assert.equal(typeof b.swamp.maxTemp, 'number');
    assert.ok(b.swamp.minTemp < b.swamp.maxTemp);
});

test('beach biome defaults bridge ocean and inland terrain', () => {
    const b = DEFAULTS.biomes;
    assert.ok(b.beach, 'beach biome config missing');
    assert.ok(b.beach.continentalnessMax > b.ocean.continentalnessMax, 'beach band must sit inland of the ocean threshold');
    assert.ok(b.beach.continentalnessMax < b.stoneShore.continentalnessMax, 'beach band must end before full land');
    assert.ok(b.beach.base >= DEFAULTS.height.seaLevel, 'beaches should surface above sea level');
    assert.match(biomesSource, /BIOMES\.BEACH/);
    assert.match(biomesSource, /id:\s*'beach'/);
});

test('climate domain warp is enabled by default for organic biome edges', () => {
    assert.equal(DEFAULTS.climateWarp.enabled, true);
    assert.ok(DEFAULTS.climateWarp.amplitude > 0);
});

test('land shaping modifiers are masked away from oceans', () => {
    // getBiomeHeightInfo computes the land mask before the biome blends and
    // multiplies the mountain factor by it.
    assert.match(biomesSource, /mountainWeird\s*\*[^;]*landFactor/);
    // chunkGeneration's additive modifiers (volcanic, mountain ridges, mesa
    // plateaus) are all gated on the same land mask.
    assert.match(chunkGenSource, /volcanicFactor\s*=\s*tFactor\s*\*\s*wFactor\s*\*\s*landFactor/);
    assert.match(chunkGenSource, /peakBlend\s*\*[^;]*landFactor/);
    assert.match(chunkGenSource, /b\.mesa\.minTemp\)\s*\*\s*landFactor/);
});

test('volcanic crags is an ordinary biome, not a sealed boss region', () => {
    assert.doesNotMatch(regionsSource, /volcanic:\s*\{/);
    assert.doesNotMatch(regionsSource, /bossId:\s*'cinder_warden'/);
    // The magnetic fields region remains sealed by default.
    assert.match(regionsSource, /magnetic_fields:\s*\{/);
    assert.match(regionsSource, /sealedByDefault:\s*true/);
});

test('old presets without the new biome keys still load safely', () => {
    resetGenConfig();
    // A pre-1.1.0 preset: no beach entry, old swamp shape (no maxTemp), old
    // volcanic/mountain thresholds, and climateWarp disabled.
    const oldPreset = {
        biomes: {
            ocean: { continentalnessMax: -0.30, base: 38, scale: 8 },
            swamp: { minTemp: -0.7, minWeird: 0.45, maxWeird: 1.0, base: 64, scale: 8 },
            mountains: { minWeird: 0.40, base: 145, scale: 120 },
        },
        climateWarp: { enabled: false, frequency: 0.0005, amplitude: 80 },
    };
    assert.equal(loadGenConfig(oldPreset), true);
    // Loaded values win where provided...
    assert.equal(GenConfig.biomes.mountains.minWeird, 0.40);
    assert.equal(GenConfig.climateWarp.enabled, false);
    // ...and keys the preset never knew about keep working defaults.
    assert.ok(GenConfig.biomes.beach);
    assert.equal(typeof GenConfig.biomes.beach.continentalnessMax, 'number');
    resetGenConfig();
});

test('shared normalization preserves every worldgen section including Magnetic Fields', () => {
    const normalizeGenConfigSnapshot = genConfigModule.normalizeGenConfigSnapshot;
    assert.equal(typeof normalizeGenConfigSnapshot, 'function', 'shared normalizer is not exported');

    const input = JSON.parse(JSON.stringify(DEFAULTS));
    input.noise.temperature.scale = 0.0042;
    input.terrainShape.coastPower = 2.75;
    input.biomes.ocean.base = 41;
    input.height.seaLevel = 67;
    input.climateWarp.amplitude = 31;
    input.spawn.searchRadius = 2048;
    input.bossDomains.magneticFields.radius = 777;
    input.bossDomains.magneticFields.enabled = false;
    const original = JSON.parse(JSON.stringify(input));

    const normalized = normalizeGenConfigSnapshot(input);
    assert.deepEqual(Object.keys(normalized).sort(), Object.keys(DEFAULTS).sort());
    assert.equal(normalized.noise.temperature.scale, 0.0042);
    assert.equal(normalized.terrainShape.coastPower, 2.75);
    assert.equal(normalized.biomes.ocean.base, 41);
    assert.equal(normalized.height.seaLevel, 67);
    assert.equal(normalized.climateWarp.amplitude, 31);
    assert.equal(normalized.spawn.searchRadius, 2048);
    assert.equal(normalized.bossDomains.magneticFields.radius, 777);
    assert.equal(normalized.bossDomains.magneticFields.enabled, false);
    assert.deepEqual(normalized, input, 'every current config field must survive normalization');
    assert.deepEqual(input, original, 'normalization must not mutate imported JSON');
});

test('shared normalization upgrades legacy values and ignores unknown keys', () => {
    const normalizeGenConfigSnapshot = genConfigModule.normalizeGenConfigSnapshot;
    assert.equal(typeof normalizeGenConfigSnapshot, 'function', 'shared normalizer is not exported');

    const input = {
        noise: { temperature: { type: 'simplex', scale: 0.003 } },
        bossDomains: { magneticFields: { tierCount: 9 } },
        unknownSection: { unsafe: true },
    };
    const normalized = normalizeGenConfigSnapshot(input);

    assert.equal(normalized.noise.temperature.type, 'opensimplex2');
    assert.equal(normalized.noise.temperature.scale, 0.003);
    assert.equal(normalized.bossDomains.magneticFields.tierCount, 9);
    assert.equal(normalized.bossDomains.magneticFields.radius, DEFAULTS.bossDomains.magneticFields.radius);
    assert.equal('unknownSection' in normalized, false);
});
