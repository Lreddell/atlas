import assert from 'node:assert/strict';
import test from 'node:test';
import { createMotionState, resolveDodge, advanceMotion, isInvulnerable, rollAbsorbsLanding, writeMotionStatus } from './playerMotion.ts';
const context = { attached: false, grounded: true, flying: false, moveDir: { x: 0, y: 0, z: -1 }, forward: { x: 0, y: 0, z: -1 }, playerPolarity: 0, position: { x: 0, y: 0, z: 0 }, bodyHeight: 1.8, bodyWidth: 0.6, boss: null, aimedMagnet: null };
test('three consecutive rolls spend 90 stamina, refused rolls spend nothing, recovery waits', () => {
    let s = createMotionState();
    for (let i = 0; i < 3; i++) { s = resolveDodge(s, context).state; s = advanceMotion(s, 0.85); }
    assert.equal(s.stamina, 10);
    const refused = resolveDodge(s, context);
    assert.equal(refused.result.reason, 'stamina'); assert.equal(refused.state.stamina, 10);
    assert.equal(writeMotionStatus(s, 'roll').ready, false);
    s = advanceMotion(s, 0.25); assert.ok(Math.abs(s.stamina - 10) < 1e-8);
    s = advanceMotion(s, 1); assert.ok(Math.abs(s.stamina - 34) < 1e-8);
    assert.equal(writeMotionStatus(s, 'roll').ready, true);
    s = advanceMotion(s, 100); assert.equal(s.stamina, 100);
});
test('ordinary immunity lasts 150ms and landing requires the first 100ms of it', () => {
    const s = resolveDodge(createMotionState(), context).state;
    for (const [time, immune, landing] of [[0, false, false], [0.099, false, false], [0.1, true, true], [0.199, true, true], [0.2, true, false], [0.249, true, false], [0.25, false, false], [0.5, false, false]]) {
        assert.equal(isInvulnerable({ ...s, time }), immune, `${time} immunity`);
        assert.equal(rollAbsorbsLanding({ ...s, time }), landing, `${time} landing`);
    }
});
test('walking and magnetic actions do not spend stamina; pause does not regenerate', () => {
    const s = { ...createMotionState(), stamina: 50 };
    assert.equal(advanceMotion(s, 0).stamina, 50);
    const dash = resolveDodge(s, { ...context, playerPolarity: 1, boss: { x: 0, y: 1, z: -6, radius: 1, polarity: -1, vulnerable: true } });
    assert.equal(dash.result.kind, 'dash'); assert.equal(dash.state.stamina, 50);
    const leap = resolveDodge(s, { ...context, playerPolarity: 1, boss: { x: 0, y: 1, z: -6, radius: 1, polarity: 1, vulnerable: true } });
    assert.equal(leap.result.kind, 'leap'); assert.equal(leap.state.stamina, 50);
});
