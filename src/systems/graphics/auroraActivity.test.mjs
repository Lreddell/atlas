import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTs } from '../world/storage/bundleTs.mjs';

const { createAuroraActivity, stepAuroraActivity, startAuroraStorm, stormEnvelope, AURORA_STORM_GAP } = await loadTs(`
    export * from './src/systems/graphics/auroraActivity';
`);

/** A seeded stand-in for Math.random. */
function seeded(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

test('between storms the aurora only swells and fades gently', () => {
    const state = createAuroraActivity();
    const never = () => 1; // no storm ever breaks out
    let low = Infinity;
    let high = -Infinity;
    let previous = stepAuroraActivity(state, 0, never);
    for (let i = 0; i < 20 * 60 * 30; i++) {
        const level = stepAuroraActivity(state, 1 / 30, never);
        assert.ok(Math.abs(level - previous) < 0.002, 'no jumps from frame to frame');
        previous = level;
        low = Math.min(low, level);
        high = Math.max(high, level);
    }
    assert.ok(low >= 0.3 - 1e-9 && high <= 0.7 + 1e-9, `stays calm: ${low}..${high}`);
    assert.ok(high - low > 0.25, 'but it does breathe');
});

test('a substorm flares within seconds, peaks bright, then dies back', () => {
    assert.equal(stormEnvelope(-1, 60), 0);
    assert.equal(stormEnvelope(0, 60), 0);
    assert.equal(stormEnvelope(6, 60), 1, 'at its peak');
    assert.ok(stormEnvelope(3, 60) > 0.3 && stormEnvelope(3, 60) < 0.7, 'on its way up');
    assert.ok(stormEnvelope(30, 60) < 0.5 && stormEnvelope(30, 60) > 0.05, 'dying back');
    assert.ok(stormEnvelope(59.9, 60) < 0.06, 'all but gone at its end');
    assert.equal(stormEnvelope(60, 60), 0);

    const state = createAuroraActivity();
    const calmLevel = stepAuroraActivity(state, 0.1, () => 1);
    startAuroraStorm(state, 60);
    let peak = 0;
    for (let i = 0; i < 61 * 30; i++) peak = Math.max(peak, stepAuroraActivity(state, 1 / 30, () => 1));
    assert.ok(peak > calmLevel + 0.8, `a storm lifts it well above the calm (${peak})`);
    assert.equal(state.stormAge, -1, 'and ends');
});

test('storms break out now and then, at about the set rate', () => {
    const random = seeded(7);
    const state = createAuroraActivity();
    let storms = 0;
    let wasStorming = false;
    const hours = 4;
    for (let i = 0; i < hours * 3600 * 10; i++) {
        stepAuroraActivity(state, 0.1, random);
        const storming = state.stormAge >= 0;
        if (storming && !wasStorming) storms++;
        wasStorming = storming;
    }
    // One every AURORA_STORM_GAP seconds of calm, give or take.
    const expected = (hours * 3600) / (AURORA_STORM_GAP + 60);
    assert.ok(storms > expected * 0.6 && storms < expected * 1.5, `${storms} storms, about ${expected.toFixed(0)} expected`);
});
