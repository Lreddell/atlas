import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTs } from '../world/storage/bundleTs.mjs';

const {
    createStepCycle, advanceStepCycle, cameraBob, STEP_PHASE_PER_BLOCK,
    createViewmodelState, createViewmodelPose, stepViewmodel, chopCurve, EQUIP_SECONDS,
} = await loadTs(`
    export * from './src/systems/player/viewMotion';
    export * from './src/systems/player/viewmodelMotion';
`);

const WALK = 4.317;
const DT = 1 / 60;
const stepInput = (extra = {}) => ({
    dt: DT, speed: 0, walkSpeed: WALK, grounded: true, verticalSpeed: 0,
    sprinting: false, sneaking: false, suspended: false, ...extra,
});
const run = (cycle, seconds, extra) => {
    for (let t = 0; t < seconds; t += DT) advanceStepCycle(cycle, stepInput(extra));
};
const bobRange = (cycle, seconds, extra, enabled = true) => {
    let lo = Infinity, hi = -Infinity;
    const out = { up: 0, side: 0, roll: 0 };
    for (let t = 0; t < seconds; t += DT) {
        advanceStepCycle(cycle, stepInput(extra));
        cameraBob(cycle, enabled, out);
        lo = Math.min(lo, out.up); hi = Math.max(hi, out.up);
    }
    return { lo, hi };
};

test('the head bobs with each step, and only while walking', () => {
    const still = createStepCycle();
    const standing = bobRange(still, 2, { speed: 0 });
    assert.ok(standing.lo > -1e-3, 'standing still does not bob');

    const walking = createStepCycle();
    run(walking, 1, { speed: WALK });
    const walk = bobRange(walking, 2, { speed: WALK });
    assert.ok(walk.lo < -0.03, `a walking step dips the view (${walk.lo})`);
    assert.ok(walk.hi <= 1e-6, 'the bob only ever dips, it never lifts the eye above standing height');

    // The step cycle tracks distance walked, not time.
    const cycle = createStepCycle();
    advanceStepCycle(cycle, stepInput({ speed: WALK, dt: 0.1 }));
    assert.ok(Math.abs(cycle.phase - WALK * 0.1 * STEP_PHASE_PER_BLOCK) < 1e-9);

    const sprinting = createStepCycle();
    run(sprinting, 1, { speed: 5.6, sprinting: true });
    const sprint = bobRange(sprinting, 2, { speed: 5.6, sprinting: true });
    assert.ok(sprint.lo < walk.lo, 'sprinting bobs harder than walking');

    const off = createStepCycle();
    run(off, 1, { speed: WALK });
    const disabled = bobRange(off, 2, { speed: WALK }, false);
    assert.deepEqual([disabled.lo, disabled.hi], [0, 0], 'view bobbing off means no head motion at all');
});

test('a hard landing dips the view and springs back without flapping', () => {
    const cycle = createStepCycle();
    run(cycle, 0.3, { grounded: false, verticalSpeed: -18 });
    advanceStepCycle(cycle, stepInput());
    let deepest = 0;
    let highest = 0;
    for (let t = 0; t < 1.2; t += DT) {
        advanceStepCycle(cycle, stepInput());
        deepest = Math.min(deepest, cycle.landY);
        highest = Math.max(highest, cycle.landY);
    }
    assert.ok(deepest < -0.04, `the landing dips (${deepest})`);
    assert.ok(Math.abs(cycle.landY) < 0.005, 'and settles');
    assert.ok(highest < -deepest * 0.25, `any overshoot above rest is small (${highest})`);

    const soft = createStepCycle();
    run(soft, 0.2, { grounded: false, verticalSpeed: -2 });
    run(soft, 0.5, {});
    assert.ok(Math.abs(soft.landY) < 1e-3, 'a hop off a step does not dip');

    const swimming = createStepCycle();
    run(swimming, 1, { speed: WALK, grounded: false, suspended: true, verticalSpeed: -3 });
    run(swimming, 0.5, { speed: WALK, suspended: true });
    assert.ok(swimming.amount < 0.01 && Math.abs(swimming.landY) < 1e-3, 'swimming neither bobs nor lands');
});

const frame = (extra = {}) => ({
    dt: DT, time: 0, yaw: 0, pitch: 0, itemKey: 'pickaxe', eating: false, swing: null, cameraBobbing: true, ...extra,
});

test('the mining chop winds up, strikes, and recovers to rest', () => {
    assert.ok(Math.abs(chopCurve(0)) < 1e-12);
    assert.ok(Math.abs(chopCurve(1)) < 1e-9, 'back-to-back swings flow into each other');
    assert.ok(chopCurve(0.25) < -0.2, 'a wind-up raises the item first');
    assert.ok(chopCurve(0.55) > 0.99, 'then the strike lands');
    let previous = chopCurve(0.3);
    for (let u = 0.31; u <= 0.55; u += 0.01) {
        const value = chopCurve(u);
        assert.ok(value >= previous - 1e-9, 'the strike only accelerates down');
        previous = value;
    }
});

test('switching items raises the new one from below', () => {
    const state = createViewmodelState();
    const pose = createViewmodelPose();
    const cycle = createStepCycle();
    stepViewmodel(state, cycle, frame({ itemKey: 'pickaxe' }), pose);
    assert.ok(Math.abs(pose.y) < 0.02, 'the first item held does not animate in');
    stepViewmodel(state, cycle, frame({ itemKey: 'torch' }), pose);
    assert.ok(pose.y < -0.3, 'the new item starts low');
    for (let t = 0; t < EQUIP_SECONDS + 0.1; t += DT) stepViewmodel(state, cycle, frame({ itemKey: 'torch' }), pose);
    assert.ok(Math.abs(pose.y) < 0.02 && Math.abs(pose.rx) < 0.02, 'and settles at rest');
});

test('turning drags the item behind the view, then it settles', () => {
    const state = createViewmodelState();
    const pose = createViewmodelPose();
    const cycle = createStepCycle();
    let yaw = 0;
    for (let t = 0; t < 0.25; t += DT) {
        yaw -= 3 * DT; // turning right
        stepViewmodel(state, cycle, frame({ yaw }), pose);
    }
    assert.ok(pose.x < -0.02, `the item trails to the left (${pose.x})`);
    for (let t = 0; t < 1.5; t += DT) stepViewmodel(state, cycle, frame({ yaw }), pose);
    assert.ok(Math.abs(pose.x) < 0.005, 'and comes back once the turn stops');
    // A wrap-around in yaw is not a 360 degree flick.
    stepViewmodel(state, cycle, frame({ yaw: Math.PI - 0.01 }), pose);
    stepViewmodel(state, cycle, frame({ yaw: -Math.PI + 0.01 }), pose);
    assert.ok(Math.abs(state.swayVX) < 5, 'no violent snap across the angle wrap');
});

test('the hand bob is small when the head already bobs, and never NaN', () => {
    const measure = (cameraBobbing) => {
        const state = createViewmodelState();
        const pose = createViewmodelPose();
        const cycle = createStepCycle();
        let range = 0;
        for (let t = 0; t < 3; t += DT) {
            advanceStepCycle(cycle, stepInput({ speed: WALK }));
            stepViewmodel(state, cycle, frame({ cameraBobbing, time: t }), pose);
            if (t > 1) range = Math.max(range, Math.abs(pose.y));
        }
        return range;
    };
    assert.ok(measure(true) < measure(false), 'with view bobbing on, the hand only lags');
    const state = createViewmodelState();
    const pose = createViewmodelPose();
    for (const dt of [0, 5, Number.NaN]) {
        stepViewmodel(state, createStepCycle(), frame({ dt, swing: 0.4, eating: true }), pose);
        for (const value of Object.values(pose)) assert.ok(Number.isFinite(value), `finite at dt=${dt}`);
    }
});
