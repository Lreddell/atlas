import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTs } from '../world/storage/bundleTs.mjs';

const { ambientMix } = await loadTs(`export { ambientMix } from './src/systems/graphics/ambientMix';`);
const { MAGNETIC_FIELDS_BIOME_ID } = await loadTs(`export { MAGNETIC_FIELDS_BIOME_ID } from './src/systems/world/magneticFields';`);

const env = (extra = {}) => ({
    biomeId: 'plains', snowyTag: false, skyLight: 15, blockLight: 0, sunHeight: 0.8, inFluid: false, ...extra,
});
const NOON = 0.8;
const MIDNIGHT = -0.8;

test('fireflies come out on open-sky nights in grassy biomes only', () => {
    assert.ok(ambientMix(env({ sunHeight: MIDNIGHT })).fireflies > 0);
    assert.equal(ambientMix(env({ sunHeight: NOON })).fireflies, 0, 'not by day');
    assert.equal(ambientMix(env({ sunHeight: MIDNIGHT, biomeId: 'desert' })).fireflies, 0, 'not in the desert');
    assert.equal(ambientMix(env({ sunHeight: MIDNIGHT, skyLight: 4 })).fireflies, 0, 'not underground');
});

test('pollen drifts on sunny meadows, snow falls in cold biomes', () => {
    assert.ok(ambientMix(env({ biomeId: 'meadow' })).pollen > 0);
    assert.equal(ambientMix(env({ biomeId: 'meadow', sunHeight: MIDNIGHT })).pollen, 0);
    assert.ok(ambientMix(env({ biomeId: 'tundra' })).snow > 0);
    assert.ok(ambientMix(env({ biomeId: 'mountains', snowyTag: true })).snow > 0, 'any snowy-tagged biome');
    assert.equal(ambientMix(env({ biomeId: 'tundra', skyLight: 5 })).snow, 0, 'no snow under a roof');
});

test('embers over the volcanic crags, sparks in the Magnetic Fields, dust underground', () => {
    assert.ok(ambientMix(env({ biomeId: 'volcanic' })).embers > 0);
    assert.equal(MAGNETIC_FIELDS_BIOME_ID, 'magnetic_fields', 'the mix keys on the biome id');
    assert.ok(ambientMix(env({ biomeId: MAGNETIC_FIELDS_BIOME_ID })).sparks > 0);
    const cave = ambientMix(env({ skyLight: 0 }));
    assert.ok(cave.dust > 0);
    assert.ok(ambientMix(env({ skyLight: 0, blockLight: 12 })).dust > cave.dust, 'more visible near torchlight');
    assert.equal(ambientMix(env()).dust, 0, 'no dust in open air');
});

test('nothing floats in water or lava, and each pool stays within its share', () => {
    const inWater = ambientMix(env({ sunHeight: MIDNIGHT, inFluid: true }));
    assert.deepEqual(Object.values(inWater), [0, 0, 0, 0, 0, 0]);
    for (const biomeId of ['plains', 'volcanic', 'tundra', 'magnetic_fields', 'meadow']) {
        for (const sunHeight of [NOON, MIDNIGHT, 0]) {
            for (const skyLight of [0, 8, 15]) {
                const mix = ambientMix(env({ biomeId, sunHeight, skyLight, snowyTag: biomeId === 'tundra' }));
                assert.ok(mix.fireflies + mix.embers + mix.sparks <= 1, 'glowing pool');
                assert.ok(mix.pollen + mix.snow + mix.dust <= 1, 'matte pool');
            }
        }
    }
});
