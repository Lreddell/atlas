import assert from 'node:assert/strict';
import test from 'node:test';

import {
    DEFAULT_MAX_HEALTH, heartbeatBpm, heartbeatIntervalMs, lowHealthEnterAt, lowHealthExitAt,
    lowHealthSeverity, resolveLowHealth,
} from './lowHealth.ts';

test('the thresholds are 40% in and 50% out (8 and 10 of 20)', () => {
    assert.equal(lowHealthEnterAt(DEFAULT_MAX_HEALTH), 8);
    assert.equal(lowHealthExitAt(DEFAULT_MAX_HEALTH), 10);
    // The rule is a fraction, not a constant, so a different maximum still works.
    assert.equal(lowHealthEnterAt(40), 16);
    assert.equal(lowHealthExitAt(40), 20);
});

test('9 -> 8 enters, 8 -> 9 stays, 9 -> 10 exits', () => {
    let active = false;
    active = resolveLowHealth(active, 9);
    assert.equal(active, false, '9 HP alone does not enter');
    active = resolveLowHealth(active, 8);
    assert.equal(active, true, '8 HP enters');
    // The hysteresis band: regenerating to 9 must NOT stop the heartbeat.
    active = resolveLowHealth(active, 9);
    assert.equal(active, true, '9 HP holds once active');
    active = resolveLowHealth(active, 10);
    assert.equal(active, false, '10 HP clears');
});

test('a big hit from full health straight into the band enters', () => {
    assert.equal(resolveLowHealth(false, 8), true);
    assert.equal(resolveLowHealth(false, 3), true);
});

test('regeneration across the band does not flap', () => {
    // 8 -> 9 -> 8 -> 9 -> 10: exactly one enter and one exit.
    const flips = [];
    let active = false;
    for (const hp of [8, 9, 8, 9, 10]) {
        const next = resolveLowHealth(active, hp);
        if (next !== active) flips.push(`${active ? 'exit' : 'enter'}@${hp}`);
        active = next;
    }
    assert.deepEqual(flips, ['enter@8', 'exit@10']);
});

test('zero health is death, not low health', () => {
    assert.equal(resolveLowHealth(true, 0), false, 'a heartbeat must not outlive the player');
    assert.equal(resolveLowHealth(false, 0), false);
    // A hit from above the band straight to 0 never passes through low health.
    assert.equal(resolveLowHealth(false, 0), false);
});

test('loading a save inside the band initialises active without another hit', () => {
    assert.equal(resolveLowHealth(false, 6), true);
});

test('respawning at full health clears it', () => {
    assert.equal(resolveLowHealth(true, DEFAULT_MAX_HEALTH), false);
});

test('severity runs 0 at the threshold to 1 at one point', () => {
    assert.equal(lowHealthSeverity(8), 0);
    assert.equal(lowHealthSeverity(1), 1);
    assert.equal(lowHealthSeverity(20), 0, 'healthy is never severe');
    assert.equal(lowHealthSeverity(0), 0, 'dead is not severe, it is dead');
    // Monotonic all the way down.
    for (let hp = 8; hp > 1; hp--) {
        assert.ok(lowHealthSeverity(hp - 1) > lowHealthSeverity(hp), `${hp - 1} > ${hp}`);
    }
});

test('the heartbeat accelerates as health falls, within a tolerable band', () => {
    assert.ok(Math.abs(heartbeatBpm(8) - 72) < 0.001, 'rests at ~72 BPM on entry');
    assert.ok(Math.abs(heartbeatBpm(1) - 114) < 0.001, 'peaks at ~114 BPM at 1 HP');
    for (let hp = 8; hp > 1; hp--) {
        assert.ok(heartbeatBpm(hp - 1) > heartbeatBpm(hp), `${hp - 1} beats faster than ${hp}`);
    }
    // Never a machine gun: even at 1 HP the beats are half a second apart, which
    // is what makes being pinned at 1 HP by starvation survivable to listen to.
    assert.ok(heartbeatIntervalMs(1) > 500, `interval ${heartbeatIntervalMs(1)}ms`);
    assert.ok(heartbeatIntervalMs(8) < 900);
});
