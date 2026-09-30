import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTs } from '../world/storage/bundleTs.mjs';

const {
    createBodyTurn, stepBodyTurn, strafeOffset, velocityYaw, wrapAngle, gaitKnee,
    springToward, springPose, NECK_REACH, STRAFE_TURN,
} = await loadTs(`export * from './src/systems/player/bodyMotion';`);

const DT = 1 / 60;
const step = (turn, extra, seconds = DT) => {
    for (let t = 0; t < seconds; t += DT) stepBodyTurn(turn, { dt: DT, aimYaw: 0, vx: 0, vz: 0, locked: false, ...extra });
    return turn;
};

test('standing, the head looks around first and the body only follows past the neck', () => {
    const turn = step(createBodyTurn(), { aimYaw: 0 });
    assert.equal(turn.yaw, 0);
    step(turn, { aimYaw: 0.6 }, 1);
    assert.equal(turn.yaw, 0, 'a glance inside the neck\'s reach leaves the body where it was');
    step(turn, { aimYaw: 1.6 }, 1.5);
    const lag = Math.abs(wrapAngle(1.6 - turn.yaw));
    assert.ok(lag < NECK_REACH - 0.3, `past the reach the body steps round, most of the way (${lag})`);
    assert.ok(turn.yaw > 0.5, 'toward the aim');
    // The turn is a step: the feet shuffle while it happens, and settle after.
    const turning = createBodyTurn();
    step(turning, { aimYaw: 0 });
    let peak = 0;
    for (let t = 0; t < 0.4; t += DT) {
        stepBodyTurn(turning, { dt: DT, aimYaw: 2.2, vx: 0, vz: 0, locked: false });
        peak = Math.max(peak, turning.shuffle);
    }
    assert.ok(peak > 0.3, `the feet shuffle through the turn (${peak})`);
    step(turning, { aimYaw: 2.2 }, 2);
    assert.ok(turning.shuffle < 0.05, 'and stop once it is done');
});

test('on the move the body lines up with the aim, hips angled into a strafe', () => {
    const forward = step(createBodyTurn(), { aimYaw: 0.4, vx: -Math.sin(0.4) * 4, vz: -Math.cos(0.4) * 4 }, 1.5);
    assert.ok(Math.abs(wrapAngle(forward.yaw - 0.4)) < 0.02, 'walking forward faces the aim');
    // Strafing right (aim 0, moving +X) angles the hips toward the right, capped.
    assert.ok(Math.abs(velocityYaw(4, 0) - -Math.PI / 2) < 1e-9);
    const right = strafeOffset(0, velocityYaw(4, 0));
    assert.equal(right, -STRAFE_TURN);
    // Backpedalling mirrors instead of spinning round to face backwards.
    assert.ok(Math.abs(strafeOffset(0, velocityYaw(0, 4))) < 1e-9);
    const backDiagonal = strafeOffset(0, velocityYaw(3, 3));
    assert.ok(Math.abs(backDiagonal) <= STRAFE_TURN && Math.abs(backDiagonal) > 0.5);
    // Across the angle wrap the body takes the short way round.
    const wrapped = step(createBodyTurn(), { aimYaw: Math.PI - 0.1 });
    const aim = -Math.PI + 0.1;
    step(wrapped, { aimYaw: aim, vx: -Math.sin(aim) * 4, vz: -Math.cos(aim) * 4 }, 0.5);
    assert.ok(Math.abs(wrapAngle(wrapped.yaw - aim)) < 0.02, `short way round (${wrapped.yaw})`);
});

test('locked poses snap, and bad frame times never break the turn', () => {
    const turn = step(createBodyTurn(), { aimYaw: 0 });
    stepBodyTurn(turn, { dt: DT, aimYaw: 2.5, vx: 0, vz: 0, locked: true });
    assert.equal(turn.yaw, 2.5);
    for (const dt of [0, Number.NaN, 5]) {
        stepBodyTurn(turn, { dt, aimYaw: -2, vx: 1, vz: Number.NaN, locked: false });
        assert.ok(Number.isFinite(turn.yaw) && Number.isFinite(turn.shuffle), `finite at dt=${dt}`);
    }
});

test('the knee lifts through the forward swing and is straight at heel strike', () => {
    assert.ok(gaitKnee(0, 1) < -1, 'mid forward swing: knee well bent');
    assert.ok(Math.abs(gaitKnee(Math.PI / 2, 1)) < 1e-9, 'leg fully forward: straight for the heel strike');
    assert.ok(gaitKnee(-Math.PI / 2, 1) < 0, 'leg behind: a little bend to push off');
    assert.ok(gaitKnee(-Math.PI / 2, 1) > gaitKnee(0, 1), 'less than the swing');
    for (let phase = 0; phase < Math.PI * 2; phase += 0.1) assert.ok(gaitKnee(phase, 1) <= 0, 'knees never bend forwards');
});

test('pose springs ease in and out, settle without overshoot, and never go unstable', () => {
    let [x, v] = [0, 0];
    const trace = [];
    for (let t = 0; t < 1; t += DT) {
        [x, v] = springToward(x, v, 1, 14, DT);
        trace.push(x);
    }
    assert.ok(trace[0] < 0.2, `it starts gently (${trace[0]})`);
    assert.ok(Math.abs(x - 1) < 1e-3, 'and arrives');
    assert.ok(Math.max(...trace) <= 1 + 1e-6, 'critically damped: no overshoot');
    [x, v] = springToward(0, 0, 1, 32, 5);
    assert.ok(Number.isFinite(x) && x <= 1.0001, 'a long frame is substepped');
    const live = { a: 0, b: 2 };
    const velocity = { a: 0, b: 0 };
    for (let t = 0; t < 1; t += DT) springPose(live, velocity, { a: 1, b: -1 }, ['a', 'b'], 20, DT);
    assert.ok(Math.abs(live.a - 1) < 1e-3 && Math.abs(live.b + 1) < 1e-3);
});
