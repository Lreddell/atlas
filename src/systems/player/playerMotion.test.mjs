import assert from 'node:assert/strict';
import test from 'node:test';

import {
    BACKSTEP_DURATION,
    DASH_COOLDOWN,
    DASH_MAX_DURATION,
    DASH_RANGE,
    DASH_SPEED,
    LEAP_IFRAMES,
    LEAP_RANGE,
    ROLL_CHAIN_WINDOW,
    ROLL_COOLDOWN,
    ROLL_DURATION,
    ROLL_IFRAME_END,
    ROLL_IFRAME_START,
    SLAM_LOCKOUT,
    SURGE_DURATION,
    advanceMotion,
    armSurge,
    consumeSurge,
    createMotionState,
    dashSurfaceTarget,
    endMotion,
    isInvulnerable,
    markDodgeRefused,
    previewDodge,
    resolveDodge,
    rollAbsorbsLanding,
    rollDistance,
    rollSpeedAt,
    rollTuck,
    rollVelocity,
    writeMotionStatus,
} from './playerMotion.ts';

const STEP = 0.05;

function ctx(overrides = {}) {
    return {
        attached: false,
        grounded: true,
        flying: false,
        moveDir: { x: 1, y: 0, z: 0 },
        forward: { x: 0, y: 0, z: -1 },
        playerPolarity: 1,
        position: { x: 0, y: 10, z: 0 },
        bodyHeight: 1.8,
        bodyWidth: 0.6,
        boss: null,
        aimedMagnet: null,
        ...overrides,
    };
}

const boss = (overrides = {}) => ({ x: 6, y: 11.4, z: 0, polarity: -1, radius: 0.9, vulnerable: true, ...overrides });

test('F with nothing magnetic around is a roll along the held direction, or a backstep with none', () => {
    const roll = resolveDodge(createMotionState(), ctx());
    assert.equal(roll.result.kind, 'roll');
    assert.deepEqual(roll.result.dir, { x: 1, y: 0, z: 0 });
    assert.equal(roll.result.backstep, false);
    assert.equal(roll.state.action, 'roll');
    assert.equal(roll.state.duration, ROLL_DURATION);
    assert.equal(roll.state.cooldowns.roll, ROLL_COOLDOWN);

    const back = resolveDodge(createMotionState(), ctx({ moveDir: null }));
    assert.equal(back.result.kind, 'roll');
    assert.equal(back.result.backstep, true);
    assert.deepEqual(back.result.dir, { x: -0, y: 0, z: 1 });
    assert.equal(back.state.duration, BACKSTEP_DURATION);
});

test('a roll covers about five blocks and its i-frames open a few frames in', () => {
    let state = resolveDodge(createMotionState(), ctx()).state;
    let travelled = 0;
    let airTravelled = 0;
    let invulnerableSeconds = 0;
    let firstInvulnerable = null;
    let lastInvulnerable = null;
    while (state.action === 'roll') {
        travelled += rollVelocity(state).x * STEP;
        airTravelled += rollVelocity(state, true).x * STEP;
        if (isInvulnerable(state)) {
            invulnerableSeconds += STEP;
            if (firstInvulnerable === null) firstInvulnerable = state.time;
            lastInvulnerable = state.time;
        }
        state = advanceMotion(state, STEP);
    }
    assert.ok(travelled > 5 && travelled < 6, `travelled ${travelled}`);
    assert.ok(Math.abs(rollDistance() - 5.2) < 1e-9);
    assert.ok(rollDistance(true) < rollDistance(), 'a backstep is shorter than a roll');
    // Airborne the roll drives harder: the save-yourself move after a launch.
    assert.ok(airTravelled > travelled * 1.1, `air roll ${airTravelled} vs ground ${travelled}`);
    assert.ok(firstInvulnerable >= ROLL_IFRAME_START && firstInvulnerable < 0.1);
    assert.ok(lastInvulnerable <= ROLL_IFRAME_END);
    assert.ok(invulnerableSeconds >= 0.35 && invulnerableSeconds <= 0.45, `${invulnerableSeconds}s of i-frames`);
    assert.equal(rollSpeedAt(0, ROLL_DURATION, 11), 11);
    assert.equal(rollSpeedAt(ROLL_DURATION, ROLL_DURATION, 11), 0);
    assert.ok(rollTuck({ ...state, action: 'roll', time: 0.3, duration: 0.6 }) > 0.99);
    // Cooldown gate, and the busy gate outside the chain window.
    const rolling = resolveDodge(createMotionState(), ctx()).state;
    assert.deepEqual(resolveDodge(rolling, ctx()).result, { kind: 'none', reason: 'busy' });
    const cooling = { ...createMotionState(), cooldowns: { roll: 0.2, dash: 0, leap: 0 } };
    assert.deepEqual(resolveDodge(cooling, ctx()).result, { kind: 'none', reason: 'cooldown' });
});

test('a landing mid-roll is absorbed, and a roll re-pressed at its end chains into the next', () => {
    const rolling = resolveDodge(createMotionState(), ctx()).state;
    assert.equal(rollAbsorbsLanding(rolling), true);
    assert.equal(rollAbsorbsLanding(createMotionState()), false);
    assert.equal(rollAbsorbsLanding({ ...rolling, action: 'dash' }), false);
    // The last few frames accept the next press, so chained rolls never drop one.
    const ending = { ...rolling, time: ROLL_DURATION - ROLL_CHAIN_WINDOW + 0.01, cooldowns: { roll: 0, dash: 0, leap: 0 } };
    const chained = resolveDodge(ending, ctx());
    assert.equal(chained.result.kind, 'roll');
    assert.equal(chained.state.time, 0);
    // Earlier in the roll it is still refused.
    assert.deepEqual(resolveDodge({ ...ending, time: 0.2 }, ctx()).result, { kind: 'none', reason: 'busy' });
});

test('aiming at an opposite magnet face turns F into a magnetic dash that lands pressed against it', () => {
    const magnet = { point: { x: 8, y: 11, z: 0 }, normal: { x: -1, y: 0, z: 0 }, polarity: -1, distance: 8 };
    const { state, result } = resolveDodge(createMotionState(), ctx({ aimedMagnet: magnet }));
    assert.equal(result.kind, 'dash');
    assert.equal(result.onto, 'surface');
    const target = dashSurfaceTarget(magnet, 0.6, 1.8);
    assert.deepEqual(result.target, target);
    assert.ok(target.x < 8 && target.x > 7.5, 'body centre stops just off the face');
    assert.equal(target.y, 11 - 0.9);
    assert.equal(state.cooldowns.dash, DASH_COOLDOWN);
    assert.ok(state.duration <= DASH_MAX_DURATION);
    assert.ok(Math.abs(state.duration - Math.hypot(target.x, target.y - 10, target.z) / DASH_SPEED) < 1e-9);
    assert.equal(isInvulnerable(state), true);
    // A same-polarity face repels: no dash, just the roll.
    assert.equal(resolveDodge(createMotionState(), ctx({ aimedMagnet: { ...magnet, polarity: 1 } })).result.kind, 'roll');
    // Out of reach: roll.
    assert.equal(resolveDodge(createMotionState(), ctx({ aimedMagnet: { ...magnet, distance: DASH_RANGE + 1 } })).result.kind, 'roll');
    // A ceiling face puts the head against it.
    const ceiling = dashSurfaceTarget({ point: { x: 0, y: 14, z: 0 }, normal: { x: 0, y: -1, z: 0 }, polarity: -1, distance: 4 }, 0.6, 1.8);
    assert.ok(ceiling.y + 1.8 < 14 && ceiling.y + 1.8 > 13.5);
});

test('an opposite boss in reach is dashed into and arms a Magnet Slam; a same boss is leapt away from', () => {
    const dash = resolveDodge(createMotionState(), ctx({ boss: boss() }));
    assert.equal(dash.result.kind, 'dash');
    assert.equal(dash.result.onto, 'boss');
    assert.ok(dash.result.target.x < 6 - 0.9, 'stops short of the body');
    assert.ok(dash.result.target.x > 3.5);
    let state = armSurge(endMotion(dash.state));
    assert.equal(state.surgeRemaining, SURGE_DURATION);
    const spent = consumeSurge(state);
    assert.equal(spent.slam, true);
    assert.equal(spent.state.surgeRemaining, 0);
    assert.equal(spent.state.slamLockout, SLAM_LOCKOUT);
    assert.equal(consumeSurge(spent.state).slam, false);
    // While locked out the boss dash is refused (a roll instead), so slams cannot be chained.
    assert.equal(resolveDodge({ ...spent.state, cooldowns: { roll: 0, dash: 0, leap: 0 } }, ctx({ boss: boss() })).result.kind, 'roll');
    // Surge fades on its own.
    state = advanceMotion(armSurge(createMotionState()), SURGE_DURATION + 0.1);
    assert.equal(state.surgeRemaining, 0);

    // A shielded boss is not dashed into (nothing would land): roll instead.
    assert.equal(resolveDodge(createMotionState(), ctx({ boss: boss({ vulnerable: false }) })).result.kind, 'roll');

    const leap = resolveDodge(createMotionState(), ctx({ boss: boss({ polarity: 1 }) }));
    assert.equal(leap.result.kind, 'leap');
    assert.deepEqual(leap.result.dir, { x: -1, y: 0, z: -0 });
    assert.equal(isInvulnerable(leap.state), true);
    assert.equal(isInvulnerable({ ...leap.state, time: LEAP_IFRAMES + 0.01 }), false);
    // Out of the field's reach the same boss is just a roll.
    assert.equal(resolveDodge(createMotionState(), ctx({ boss: boss({ polarity: 1, x: LEAP_RANGE + 3 }) })).result.kind, 'roll');
});

test('without Polarity Boots only the roll exists, attached means jump off, flying means nothing', () => {
    const noBoots = ctx({ playerPolarity: 0, boss: boss(), aimedMagnet: { point: { x: 4, y: 11, z: 0 }, normal: { x: -1, y: 0, z: 0 }, polarity: -1, distance: 4 } });
    assert.equal(resolveDodge(createMotionState(), noBoots).result.kind, 'roll');
    assert.equal(resolveDodge(createMotionState(), ctx({ attached: true, boss: boss() })).result.kind, 'jump-off');
    assert.deepEqual(resolveDodge(createMotionState(), ctx({ flying: true })).result, { kind: 'none', reason: 'flying' });
    assert.equal(previewDodge(createMotionState(), ctx({ boss: boss() })), 'dash');
    assert.equal(previewDodge(createMotionState(), ctx()), 'roll');
});

test('the shared status mirrors the state for the damage gate and the crosshair ring', () => {
    const blank = () => ({ action: 'none', invulnerable: false, surge: false, surgeFraction: 0, progress: 0, cooldown: 0, ready: true, refusedAt: 0, prompt: 'roll' });
    const rolling = advanceMotion(resolveDodge(createMotionState(), ctx()).state, 0.1);
    const status = writeMotionStatus(rolling, 'roll', blank());
    assert.equal(status.action, 'roll');
    assert.equal(status.invulnerable, true);
    assert.equal(status.ready, false);
    assert.ok(status.progress > 0.15 && status.progress < 0.2);
    assert.ok(Math.abs(status.cooldown - (ROLL_COOLDOWN - 0.1) / ROLL_COOLDOWN) < 1e-9);
    // The ring must still be sweeping AFTER the roll ends, or it would only ever
    // be drawn while rolling (when a press is refused anyway) and say nothing.
    const justEnded = advanceMotion(rolling, ROLL_DURATION);
    assert.equal(justEnded.action, 'none');
    const after = writeMotionStatus(justEnded, 'roll', blank());
    assert.ok(after.cooldown > 0.1, `ring still visible after the roll (${after.cooldown})`);
    assert.equal(after.ready, false);
    const recovered = writeMotionStatus(advanceMotion(justEnded, ROLL_COOLDOWN), 'roll', blank());
    assert.equal(recovered.cooldown, 0);
    assert.equal(recovered.ready, true);
    // The ring shows the cooldown of the move the kit would actually use, so a
    // recharging dash never reads as "you cannot roll".
    const dashCooling = { ...createMotionState(), cooldowns: { roll: 0, dash: 1.0, leap: 0 } };
    assert.equal(writeMotionStatus(dashCooling, 'roll', blank()).cooldown, 0);
    assert.ok(writeMotionStatus(dashCooling, 'dash', blank()).cooldown > 0.5);
    // Idle and off cooldown is the "ready" state the HUD draws nothing for.
    const idle = writeMotionStatus(createMotionState(), 'roll', blank());
    assert.equal(idle.ready, true);
    assert.equal(idle.cooldown, 0);
    const armed = writeMotionStatus(armSurge(createMotionState()), 'dash', blank());
    assert.equal(armed.surge, true);
    assert.equal(armed.surgeFraction, 1);
    assert.equal(armed.prompt, 'dash');
    // A refused press is stamped for the crosshair flash.
    const refused = blank();
    assert.equal(refused.refusedAt, 0);
    markDodgeRefused(refused);
    assert.ok(Date.now() - refused.refusedAt < 1000);
});
