import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTs } from '../world/storage/bundleTs.mjs';

const {
    DROP_POP_MS, PICKUP_FLIGHT_MS, dropPhase, spawnPop, pickupFlight,
    MINING_SWING_SECONDS, swingStruck,
    CRACK_STAGES, crackStage,
} = await loadTs(`
    export * from './src/systems/fx/dropMotion';
    export { MINING_SWING_SECONDS, swingStruck } from './src/systems/fx/blockChips';
    export { CRACK_STAGES, crackStage } from './src/systems/fx/crackMaterial';
`);

test('new drops pop up to size with a small overshoot', () => {
    assert.equal(spawnPop(0), 0);
    assert.equal(spawnPop(DROP_POP_MS), 1);
    assert.equal(spawnPop(60_000), 1, 'old drops are simply full size');
    assert.equal(spawnPop(-5), 1, 'a clock step backwards never hides a drop');
    assert.equal(spawnPop(Number.NaN), 1);
    let peak = 0;
    for (let ms = 0; ms <= DROP_POP_MS; ms += 5) peak = Math.max(peak, spawnPop(ms));
    assert.ok(peak > 1.03 && peak < 1.15, `overshoots a little (${peak})`);
});

test('drops spin and bob out of step, the same way every time', () => {
    // Real drop ids: Math.random().toString(), which all start with "0.".
    const ids = ['0.1832', '0.1833', '0.9', '0.44170312', '0.5'];
    const phases = ids.map(dropPhase);
    assert.deepEqual(phases, ids.map(dropPhase), 'deterministic');
    assert.equal(new Set(phases).size, ids.length, 'distinct for distinct ids');
    for (const phase of phases) assert.ok(phase >= 0 && phase < Math.PI * 2);
});

test('a collected item flies in, shrinking, and is gone once it arrives', () => {
    const out = { pull: 0, arc: 0, scale: 1, hover: 1 };
    const start = { ...pickupFlight(0, out) };
    assert.deepEqual([start.pull, start.scale, start.hover], [0, 1, 1], 'starts exactly where the drop was');
    let previous = -1;
    for (let ms = 0; ms < PICKUP_FLIGHT_MS; ms += 10) {
        const flight = pickupFlight(ms, out);
        assert.ok(flight.pull >= previous, 'only ever moves toward the player');
        assert.ok(flight.scale > 0 && flight.scale <= 1);
        previous = flight.pull;
    }
    assert.equal(pickupFlight(PICKUP_FLIGHT_MS, out), null);
    assert.equal(pickupFlight(-1, out), null);
});

test('mining chips fly once per swing, at the strike', () => {
    let strikes = 0;
    let elapsed = 0;
    // One second of mining at 60 fps: four swings, four strikes.
    for (let frame = 0; frame < 60; frame++) {
        const before = elapsed;
        elapsed += 1 / 60;
        if (swingStruck(before, elapsed)) strikes++;
    }
    assert.equal(strikes, Math.round(1 / MINING_SWING_SECONDS));
    assert.equal(swingStruck(0, 0.1), false, 'not before the first strike lands');
    assert.equal(swingStruck(0.1, 0.13), true, 'the first strike lands half way through the swing');
    assert.equal(swingStruck(0.2, 0.2), false);
    assert.equal(swingStruck(0.3, 0.1), false, 'a reset never counts as a strike');
});

test('cracks show in ten stages that only grow', () => {
    assert.equal(crackStage(0), 0);
    assert.equal(crackStage(0.999), CRACK_STAGES - 1);
    assert.equal(crackStage(1), CRACK_STAGES);
    assert.equal(crackStage(-1), 0);
    assert.equal(crackStage(7), CRACK_STAGES);
    let previous = 0;
    for (let p = 0; p <= 1; p += 0.01) {
        const stage = crackStage(p);
        assert.ok(stage >= previous);
        previous = stage;
    }
});
