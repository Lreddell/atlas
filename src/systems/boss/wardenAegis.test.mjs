import assert from 'node:assert/strict';
import test from 'node:test';
import { advanceWarden, createWardenState, WARDEN_TIMING } from './magneticWardenCore.ts';

function run(state, seconds, distance = 8) {
    const events = [];
    for (let i = 0; i < Math.ceil(seconds / 0.05); i++) {
        const step = advanceWarden(state, { type: 'tick', dt: 0.05, playerDistance: distance });
        state = step.state; events.push(...step.events);
    }
    return { state, events };
}

test('each melee attack teaches its single before adding a locked delayed backswing', () => {
    for (const [attack, distance] of [['lash', 2], ['charge', 9]]) {
        let state = createWardenState({ actionTime: 0.5, cooldowns: { volley: 100, draw: 100, lash: 100, charge: 100, [attack]: 0 } });
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
        volleyTimer: 0, volleyIndex: index, swapTimer: 100 }), 0.05, 35).state.volleyPattern;
    assert.equal(pattern([false, true, true], 0), 'aimed');
    assert.equal(pattern([false, true, true], 1), 'sweep');
    assert.equal(pattern([false, false, true], 0), 'sweep');
    assert.equal(pattern([false, true, false], 1), 'aimed');
});

test('Aegis crystals never decay while attacks and polarity swaps run', () => {
    let state = createWardenState({ form: 2, hp: 200, action: 'hover', actionDuration: 0,
        crystals: [false, true, true, false], ignited: [1, 2], shieldLayers: 2, swapTimer: 7.5 });
    const active = run(state, 120, 35);
    assert.deepEqual(active.state.crystals, state.crystals);
    assert.equal(active.state.shieldLayers, 2);
    assert.ok(active.events.filter(e => e.type === 'polarity').length >= 10);
    assert.ok(!active.events.some(e => e.type === 'crystal-lost'));
    const broken = advanceWarden(active.state, { type: 'crystal-broken', crystal: 1 });
    const duplicate = advanceWarden(broken.state, { type: 'crystal-broken', crystal: 1 });
    assert.equal(duplicate.state.shieldLayers, 1);
});

test('Aegis uses the tracking slam timings and faster swaps without changing Storm tuning', () => {
    const state = createWardenState({ form: 2, action: 'hover', actionDuration: 0, plungeTimer: 0 });
    const marked = run(state, 0.05).state;
    assert.equal(marked.action, 'plunge_windup');
    assert.equal(marked.actionDuration, 1.6);
    assert.equal(WARDEN_TIMING.form2.swapInterval, 7.5);
    assert.equal(WARDEN_TIMING.form3.beatInterval, 3.2);
    assert.equal(WARDEN_TIMING.form3.slam.interval, 6);
});

 test('every form pressures nearby climbers, including spent and unlit towers, with volleys', () => {
    for (const form of [1, 2, 3]) {
        for (const live of [false, true]) {
            let state = createWardenState({ form, action: form === 1 ? 'idle' : form === 2 ? 'hover' : 'spiral',
                actionDuration: form === 1 ? 0.5 : 0, actionTime: 0.5, plungeTimer: 0,
                crystals: [live, false, false, false], ignited: live ? [0] : [], shieldLayers: live ? 1 : 0 });
            const events = [];
            for (let i = 0; i < 600; i++) {
                const result = advanceWarden(state, { type: 'tick', dt: 0.05, playerDistance: 3, playerTower: 0 });
                state = result.state; events.push(...result.events);
            }
            assert.ok(events.filter(e => e.type === 'volley' && e.climber).length >= 3, `form ${form}, live ${live}`);
            assert.ok(!events.some(e => ['lash', 'charge', 'plunge', 'spiral-bolt'].includes(e.type)));
            assert.equal(state.contestTower, live ? 0 : null);
            assert.equal(state.playerTower, 0);
        }
    }
});
