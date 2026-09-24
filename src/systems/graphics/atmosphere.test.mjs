import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTs } from '../world/storage/bundleTs.mjs';

const { sampleAtmosphere, createAtmosphereState, sunDirection, SUN_ORBIT_TILT, moonPhaseBrightness } =
    await loadTs(`export * from './src/systems/graphics/atmosphere';`);

const input = (ticks, extra = {}) => ({
    ticks, lunar: { phaseIndex: 4, isBloodMoon: false }, magnetic: 0, storm: 0,
    renderDistanceChunks: 8, chunkSize: 16, ...extra,
});
const sample = (ticks, extra) => sampleAtmosphere(input(ticks, extra), createAtmosphereState());
const luminance = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const VECTOR_FIELDS = ['skyZenith', 'skyHorizon', 'skyHorizonSun', 'sunGlow', 'moonGlow', 'keyColor', 'hemiSky', 'hemiGround', 'fogGround'];
const maxDelta = (a, b) => Math.max(
    ...VECTOR_FIELDS.flatMap(key => a[key].map((v, i) => Math.abs(v - b[key][i]))),
    Math.abs(a.exposure - b.exposure) * 0.25,
);

test('the sun keeps its schedule on the tilted arc', () => {
    const rise = sunDirection(0);
    assert.ok(Math.abs(rise[0] - 1) < 1e-9 && Math.abs(rise[1]) < 1e-9, 'rises in +X at tick 0');
    const noon = sunDirection(6000);
    assert.ok(Math.abs(noon[1] - Math.cos(SUN_ORBIT_TILT)) < 1e-9, 'highest at 6000');
    assert.ok(noon[2] > 0.3, 'noon light comes from +Z, so shadows have a direction');
    const set = sunDirection(12000);
    assert.ok(Math.abs(set[0] + 1) < 1e-9 && Math.abs(set[1]) < 1e-9, 'sets in -X at 12000');
});

test('the atmosphere changes smoothly through the whole day, including the wrap', () => {
    // Every 5 ticks (a quarter second of game time): a switch or pop would show
    // as a jump here even though sunrise itself changes the sky quickly.
    let previous = sample(0);
    for (let ticks = 5; ticks <= 24000; ticks += 5) {
        const next = sample(ticks);
        assert.ok(maxDelta(previous, next) < 0.04, `jump at tick ${ticks}: ${maxDelta(previous, next)}`);
        previous = next;
    }
    assert.ok(maxDelta(sample(23995), sample(24000)) < 0.04);
    assert.ok(maxDelta(sample(-10), sample(23990)) < 1e-9, 'negative ticks wrap like positive ones');
});

test('nothing lights the terrain from below the horizon', () => {
    for (let ticks = 0; ticks < 24000; ticks += 25) {
        const s = sample(ticks);
        if (luminance(s.keyColor) > 1e-4) assert.ok(s.keyDir[1] > -0.021, `key light below the horizon at ${ticks}`);
    }
    // Twilight hand-over: the key light is near zero while it swaps from sun to moon.
    const dusk = sample(12200);
    assert.ok(luminance(dusk.keyColor) < 0.02);
});

test('nights are moonlit and readable, never black', () => {
    for (const phaseIndex of [0, 2, 4, 6]) {
        const s = sample(18000, { lunar: { phaseIndex, isBloodMoon: false } });
        // Sky fill plus moonlight after the night exposure lift.
        const fill = (luminance(s.hemiSky) + luminance(s.keyColor)) * s.exposure;
        assert.ok(fill > 0.12, `phase ${phaseIndex}: fill ${fill}`);
        if (phaseIndex === 4) assert.ok(fill > 0.22, `full moon fill ${fill}`);
        assert.ok(s.keyIsMoon);
        assert.ok(s.starVisibility > 0.99);
    }
    // A full moon is brighter than a new one, and noon is far brighter than midnight.
    assert.ok(moonPhaseBrightness(4) > moonPhaseBrightness(0));
    assert.ok(luminance(sample(6000).keyColor) > 5 * luminance(sample(18000).keyColor));
    // Nights are blue: the sky fill leans cool.
    const night = sample(18000);
    assert.ok(night.hemiSky[2] > night.hemiSky[0] * 1.5);
});

test('a blood moon turns the night sky, fog and ambient red', () => {
    const normal = sample(18000);
    const blood = sample(18000, { lunar: { phaseIndex: 1, isBloodMoon: true } });
    assert.ok(blood.skyHorizon[0] > blood.skyHorizon[2] * 2, 'crimson horizon');
    assert.ok(blood.fogGround[0] > normal.fogGround[0]);
    assert.ok(blood.hemiSky[0] > blood.hemiSky[2], 'red ambient');
    assert.ok(blood.keyColor[0] > blood.keyColor[2] * 2, 'red moonlight');
    // The red moon is always full: its halo is the same on any phase night, and red.
    const bloodOnFullNight = sample(18000, { lunar: { phaseIndex: 4, isBloodMoon: true } });
    assert.deepEqual(blood.moonGlow, bloodOnFullNight.moonGlow);
    assert.ok(blood.moonGlow[0] > 5 * blood.moonGlow[2], 'red halo');
    assert.ok(luminance(blood.moonGlow) > 0.02, 'the red moon always glows');
    // By day the event has no effect.
    const day = sample(6000, { lunar: { phaseIndex: 1, isBloodMoon: true } });
    assert.deepEqual(day.skyZenith, sample(6000).skyZenith);
});

test('fog always finishes inside the render distance edge', () => {
    for (let chunks = 4; chunks <= 48; chunks++) {
        const s = sample(6000, { renderDistanceChunks: chunks });
        const edge = chunks * 16;
        assert.ok(s.fogEnd <= edge, `fog ends at ${s.fogEnd} beyond the ${edge} edge`);
        assert.ok(s.fogStart < s.fogEnd);
        assert.ok(s.fogStart > 0);
    }
});

// The haze curve the fog shader uses (atmosphereUniforms.ts), at sea level.
const haze = (s, distance) => 1 - Math.exp(-(distance * s.hazeNear + (distance / s.hazeDistance) ** 2));

test('the haze lifts the near distance lightly and closes in with distance', () => {
    const day = sample(6000);
    // A light veil nearby: it keeps shadows and dark ground from feeling heavy, never a fog.
    assert.ok(haze(day, 32) > 0.02 && haze(day, 32) < 0.05, `light veil nearby (${haze(day, 32)})`);
    assert.ok(haze(day, 96) < 0.2, `light at mid range (${haze(day, 96)})`);
    assert.ok(haze(day, 400) > 0.6, `thick far out (${haze(day, 400)})`);
    // An increasing scale: each further stretch hazes more than the one before.
    const steps = [0, 50, 100, 150, 200].map(d => haze(day, d));
    for (let i = 2; i < steps.length; i++) assert.ok(steps[i] - steps[i - 1] > steps[i - 1] - steps[i - 2]);
    // Golden hour and dusk are hazier than noon, never murky nearby.
    for (const ticks of [0, 11600, 12400]) assert.ok(haze(sample(ticks), 150) > haze(day, 150));
    for (let ticks = 0; ticks < 24000; ticks += 400) assert.ok(haze(sample(ticks), 32) < 0.1, `murky nearby at ${ticks}`);
});

test('the Magnetic Fields haze is thick and steel-blue, closing in with the storm', () => {
    const clear = sample(6000);
    const calm = sample(6000, { magnetic: 1, storm: 0 });
    const frenzy = sample(6000, { magnetic: 1, storm: 1 });
    assert.ok(calm.hazeDistance < clear.hazeDistance * 0.25);
    assert.ok(frenzy.hazeDistance < calm.hazeDistance * 0.6);
    // Readable across the arena, thick past it (the old biome fog was opaque by 55 blocks).
    assert.ok(haze(calm, 30) < 0.4, `readable at 30 blocks (${haze(calm, 30)})`);
    assert.ok(haze(calm, 60) > 0.65, `thick at 60 blocks (${haze(calm, 60)})`);
    // Cool steel blue, not violet: blue over red, green close behind blue.
    const [r, g, b] = calm.fogGround;
    assert.ok(b > r * 1.4 && g > r, `steel-blue fog ${calm.fogGround}`);
});
