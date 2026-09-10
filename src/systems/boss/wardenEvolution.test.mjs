import assert from 'node:assert/strict';
import test from 'node:test';
import { advanceWarden, createWardenState, isWardenShielded, WARDEN_TIMING } from './magneticWardenCore.ts';

function run(state, seconds, distance = 8) {
    const events = [];
    for (let i = 0; i < Math.ceil(seconds / 0.05); i++) {
        const step = advanceWarden(state, { type: 'tick', dt: 0.05, playerDistance: distance });
        state = step.state; events.push(...step.events);
    }
    return { state, events };
}
const hit = (state, extra = {}) => advanceWarden(state, { type: 'damage', amount: 9, playerPolarity: -1, ...extra });

test('return bolts interrupt shields but only expose and damage an unshielded core', () => {
    const shielded = createWardenState({ crystals: [true], ignited: [0], shieldLayers: 1 });
    const stopped = hit(shielded, { counter: true });
    assert.equal(stopped.state.hp, 300);
    assert.equal(stopped.state.action, 'stagger');
    assert.equal(isWardenShielded(stopped.state), true);
    const returned = hit(createWardenState({ action: 'draw_active' }), { counter: true, playerPolarity: 1, amount: 12 });
    assert.equal(returned.state.hp, 288);
    assert.equal(returned.state.actionDuration, 2.2);
    assert.equal(returned.state.exposedTimer, 2.2);
    assert.ok(returned.events.some(e => e.type === 'draw' && !e.active));
    const transition = hit(createWardenState({ action: 'shatter', form: 2 }), { counter: true });
    assert.equal(transition.state.hp, 300);
    assert.equal(transition.state.exposedTimer, 0);
});

test('routine slams cannot stagger-lock the Warden; heavy hits extend a shield break only once', () => {
    const first = hit(createWardenState(), { slam: true });
    assert.equal(first.state.action, 'stagger');
    const standing = { ...first.state, action: 'idle' };
    const repeated = hit(standing, { slam: true });
    assert.equal(repeated.state.action, 'idle');
    const ready = { ...standing, staggerLock: 0 };
    assert.equal(hit(ready, { slam: true }).state.action, 'stagger');
    let exposed = createWardenState({ action: 'shield_break', actionDuration: 4.5 });
    exposed = hit(exposed, { heavy: true }).state;
    assert.equal(exposed.armorStress, 1);
    exposed = hit(exposed, { heavy: true }).state;
    assert.equal(exposed.actionDuration, 5.1);
    exposed = hit(exposed, { heavy: true }).state;
    assert.equal(exposed.actionDuration, 5.1);
});

test('each melee attack teaches its single before adding a locked delayed backswing', () => {
    for (const [attack, distance] of [['lash', 2], ['charge', 9]]) {
        let state = createWardenState({ actionTime: 0.5, counterTimer: 100, cooldowns: { volley: 100, draw: 100, lash: 100, charge: 100, [attack]: 0 } });
        state = run(state, 0.05, distance).state;
        assert.equal(state.action, `${attack}_windup`);
        assert.equal(state.followup, false);
        const single = run(state, 1.6, distance);
        assert.ok(!single.events.some(e => e.action === 'backswing_windup'));
        state = { ...single.state, action: 'idle', actionDuration: 0.5, actionTime: 0.5, cooldowns: { volley: 100, draw: 100, lash: 100, charge: 100, [attack]: 0 } };
        state = run(state, 0.05, distance).state;
        assert.equal(state.followup, true);
        const combo = run(state, 2.2, distance);
        assert.ok(combo.events.some(e => e.action === 'backswing_windup'));
        assert.equal(combo.events.filter(e => e.type === 'lash').length, attack === 'lash' ? 2 : 1);
    }
});

test('Aegis tower crystals disable different volley patterns', () => {
    const pattern = (crystals, index) => run(createWardenState({ form: 2, action: 'hover', actionDuration: 0,
        crystals, ignited: [1, 2], shieldLayers: crystals.filter(Boolean).length,
        volleyTimer: 0, volleyIndex: index, swapTimer: 100, counterTimer: 100 }), 0.05, 35).state.volleyPattern;
    assert.equal(pattern([false, true, true], 0), 'aimed');
    assert.equal(pattern([false, true, true], 1), 'sweep');
    assert.equal(pattern([false, false, true], 0), 'sweep');
    assert.equal(pattern([false, true, false], 1), 'aimed');
});

test('Storm remains beat-driven and completes tracking slams and counter shots without overlapping flips', () => {
    let state = createWardenState({ form: 3, hp: 100, action: 'spiral', actionDuration: 0,
        crystals: [false, false, false, true], ignited: [3], shieldLayers: 1, plungeTimer: 0, counterTimer: 0 });
    assert.equal(isWardenShielded(state), false);
    assert.ok(hit(state).state.hp < 100);
    const events = [];
    for (let i = 0; i < 1200; i++) {
        const previous = state;
        const step = advanceWarden(state, { type: 'tick', dt: 0.05, playerDistance: 8 });
        state = step.state; events.push(...step.events);
        if (previous.action.startsWith('plunge_') && previous.actionTime + 0.05 < previous.actionDuration) {
            assert.equal(state.beatTimer, previous.beatTimer);
            assert.ok(!step.events.some(e => e.type === 'beat'));
        }
    }
    assert.equal(events.find(e => e.type === 'beat' || e.type === 'counter-bolt' || e.type === 'plunge').type, 'beat');
    assert.ok(events.some(e => e.type === 'counter-bolt'));
    assert.ok(events.some(e => e.type === 'plunge' && e.phase === 'impact'));
    assert.ok(events.some(e => e.type === 'beat' && e.second));
    const broken = advanceWarden(state, { type: 'crystal-broken', crystal: 3 });
    assert.ok(broken.events.some(e => e.type === 'shards' && !e.active));
    assert.equal(broken.state.actionDuration, WARDEN_TIMING.actions.shield_break);
});
