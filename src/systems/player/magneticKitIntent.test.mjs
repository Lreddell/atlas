import assert from 'node:assert/strict';
import test from 'node:test';
import { createMotionState, resolveDodge, canArmMagnetSlam } from './playerMotion.ts';

const context = (overrides = {}) => ({ attached: false, grounded: true, flying: false,
    moveDir: { x: 0, y: 0, z: -1 }, forward: { x: 0, y: 0, z: -1 }, playerPolarity: 1,
    position: { x: 0, y: 64, z: 0 }, bodyHeight: 1.8, bodyWidth: 0.6, aimedMagnet: null,
    boss: { x: 0, y: 65, z: -7, polarity: -1, radius: 1, vulnerable: true }, ...overrides });

test('a sideways or backward dodge stays a roll next to either boss polarity', () => {
    for (const polarity of [-1, 1]) {
        for (const moveDir of [{ x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }]) {
            const ctx = context({ moveDir }); ctx.boss.polarity = polarity;
            assert.equal(resolveDodge(createMotionState(), ctx).result.kind, 'roll');
        }
    }
    assert.equal(resolveDodge(createMotionState(), context()).result.kind, 'dash');
});

test('the kit does not acquire a boss behind the camera or beyond a solid wall', () => {
    const behind = context(); behind.boss.z = 7;
    assert.equal(resolveDodge(createMotionState(), behind).result.kind, 'roll');
    const blocked = context(); blocked.boss.lineOfSight = false;
    assert.equal(resolveDodge(createMotionState(), blocked).result.kind, 'roll');
});

test('a recharging dash still allows an available dodge roll', () => {
    const state = createMotionState(); state.cooldowns.dash = 1;
    assert.equal(resolveDodge(state, context()).result.kind, 'roll');
});

test('blocked, short, stale-target and polarity-mismatched dashes never award a slam', () => {
    const ctx = context();
    const dash = resolveDodge(createMotionState(), ctx);
    const landed = { ...ctx, position: { ...dash.result.target } };
    assert.equal(canArmMagnetSlam(dash.state, landed, true, false), true);
    assert.equal(canArmMagnetSlam(dash.state, landed, true, true), false);
    assert.equal(canArmMagnetSlam(dash.state, landed, false, false), false);
    assert.equal(canArmMagnetSlam(dash.state, ctx, true, false), false);
    assert.equal(canArmMagnetSlam(dash.state, { ...landed, boss: { ...ctx.boss, z: -14 } }, true, false), false);
    assert.equal(canArmMagnetSlam(dash.state, { ...landed, boss: { ...ctx.boss, vulnerable: false } }, true, false), false);
    assert.equal(canArmMagnetSlam(dash.state, { ...landed, playerPolarity: -1 }, true, false), false);
});
