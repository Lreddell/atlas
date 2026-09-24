import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTs } from '../world/storage/bundleTs.mjs';

const { sampleClassicAtmosphere, acesToneMap, inverseAcesToneMap } =
    await loadTs(`export * from './src/systems/graphics/classicAtmosphere';`);
const { createAtmosphereState } = await loadTs(`export * from './src/systems/graphics/atmosphere';`);

const normalNight = {
    phaseIndex: 4, isBloodMoon: false, skyTintHex: '#000000', fogTintHex: '#000000',
    moonLightHex: '#ffffff', ambientLightHex: '#ffffff', nightBrightnessMultiplier: 1, moonLightMultiplier: 1,
};
const bloodNight = {
    ...normalNight, phaseIndex: 1, isBloodMoon: true, skyTintHex: '#481012', fogTintHex: '#3c0c10',
    moonLightHex: '#ff8a72', ambientLightHex: '#d85a54',
};
const sample = (ticks, extra = {}) => sampleClassicAtmosphere({
    ticks, lunar: normalNight, magnetic: 0, storm: 0, renderDistanceChunks: 8, chunkSize: 16, ...extra,
}, createAtmosphereState());

const srgbEncode = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);
const srgbDecode = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
/** What a scene-linear colour looks like on screen (ACES, sRGB), 0..255. */
const onScreen = (color) => acesToneMap(color).map(c => Math.round(srgbEncode(c) * 255));
const hexChannels = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
const close = (a, b, tolerance = 2) => a.every((v, i) => Math.abs(v - b[i]) <= tolerance);

test('the inverse tone map lands exactly back on the screen colour', () => {
    for (const screen of [[0.02, 0.05, 0.1], [0.5, 0.5, 0.5], [0.24, 0.62, 0.83], [0.9, 0.3, 0.1], [0.01, 0.01, 0.02]]) {
        const back = acesToneMap(inverseAcesToneMap(screen));
        assert.ok(back.every((v, i) => Math.abs(v - screen[i]) < 2e-3), `${screen} -> ${back}`);
    }
});

test('Classic shows the old sky and fog colours on screen, day and night', () => {
    const noon = sample(6000);
    assert.equal(noon.classic, true);
    assert.equal(noon.exposure, 1);
    // The old dome wrote THREE.Color's linear values straight to the screen...
    const zenithShown = hexChannels(0x4a90e2).map(c => Math.round(srgbDecode(c / 255) * 255));
    assert.ok(close(onScreen(noon.skyZenith), zenithShown), `${onScreen(noon.skyZenith)} vs ${zenithShown}`);
    // ...and mixed the fog in after the sRGB encode, so the fog showed the colour itself.
    assert.ok(close(onScreen(noon.classicFog), hexChannels(0x87ceeb)), `${onScreen(noon.classicFog)}`);
    // Midnight: a black sky and a near-black fog, like before.
    const midnight = sample(18000);
    assert.ok(onScreen(midnight.skyZenith).every(c => c <= 2));
    assert.ok(close(onScreen(midnight.classicFog), hexChannels(0x080815)));
});

test('Classic keeps the old orbit, fog distances and light levels', () => {
    const noon = sample(6000);
    assert.ok(Math.abs(noon.sunDir[1] - 1) < 1e-9 && Math.abs(noon.sunDir[2]) < 1e-9, 'straight overhead, no tilt');
    assert.equal(noon.fogStart, 38.4);
    assert.equal(noon.fogEnd, 123);
    assert.equal(sample(6000, { renderDistanceChunks: 4 }).fogStart, 30);
    // The old lights: a 0.8 white sun at noon over a flat 0.6 ambient.
    assert.ok(Math.abs(noon.keyColor[0] - 0.8) < 1e-9 && noon.keyColor[0] === noon.keyColor[2]);
    assert.deepEqual(noon.hemiSky, noon.hemiGround);
    assert.ok(Math.abs(noon.hemiSky[1] - 0.6) < 1e-9);
    assert.equal(noon.classicSunlight, 1);
    // Night: the moon keys the scene, dimmer with the phase; sky light dims with it.
    const full = sample(18000);
    const crescent = sample(18000, { lunar: { ...normalNight, phaseIndex: 1 } });
    assert.ok(full.keyIsMoon && full.keyDir[1] > 0);
    assert.ok(full.keyColor[0] > crescent.keyColor[0]);
    assert.ok(full.classicSunlight < 1 && full.classicSunlight > crescent.classicSunlight);
});

test('Classic blood moons and Magnetic Fields fog are the old ones', () => {
    const blood = sample(18000, { lunar: bloodNight });
    const night = sample(18000);
    assert.ok(blood.skyZenith[0] > night.skyZenith[0], 'red-tinted sky');
    assert.ok(blood.hemiSky[0] > blood.hemiSky[2], 'red ambient');
    assert.ok(blood.keyColor[0] > blood.keyColor[2], 'red moonlight');
    const calm = sample(6000, { magnetic: 1, storm: 0 });
    const frenzy = sample(6000, { magnetic: 1, storm: 1 });
    assert.equal(calm.fogStart, 12);
    assert.ok(Math.abs(calm.fogEnd - 123 * 0.45) < 1e-9);
    assert.ok(frenzy.fogEnd < calm.fogEnd && frenzy.fogEnd >= 16);
    // The dusky purple-grey tint pulls the fog darker.
    assert.ok(calm.classicFog[1] < sample(6000).classicFog[1]);
});
