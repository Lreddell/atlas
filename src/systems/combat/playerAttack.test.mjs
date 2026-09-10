import assert from 'node:assert/strict';
import test from 'node:test';
import { createAttackState, beginAttack, advanceAttack, cancelAttack, attackBusy, attackPose, inAttackArc } from './playerAttack.ts';

test('every weapon strikes at the upswing boundary once and recovers even on a miss', () => {
    for (const [kind, duration] of [['sword', 0.58], ['axe', 1], ['spear', 0.625], ['maul', 1.05], ['hammer', 1.1]]) {
        const s = createAttackState();
        assert.equal(beginAttack(s, kind, duration), true);
        assert.equal(advanceAttack(s, duration * 0.49), false);
        assert.equal(advanceAttack(s, duration * 0.02), true);
        assert.equal(beginAttack(s, 'sword', 0.1), false, 'switching cannot skip recovery');
        assert.equal(advanceAttack(s, duration), false);
        assert.equal(attackBusy(s), false);
        assert.equal(beginAttack(s, kind, duration), true);
        assert.equal(s.combo, 1);
    }
});
test('cancelled windups never damage, keep recovery, and do not advance while paused', () => {
    const s = createAttackState(); beginAttack(s, 'sword', 0.625);
    advanceAttack(s, 0.1); cancelAttack(s);
    assert.equal(advanceAttack(s, 0), false); assert.equal(s.elapsed, 0.1);
    assert.equal(attackPose(s).weight, 0);
    assert.equal(beginAttack(s, 'axe', 1), false);
    assert.equal(advanceAttack(s, 1), false);
    advanceAttack(s, 1);
    beginAttack(s, 'sword', 0.625); assert.equal(s.combo, 0);
});
test('the pose winds up before the strike, bends elbows forward and settles to rest', () => {
    const s = createAttackState(); beginAttack(s, 'sword', 1);
    advanceAttack(s, 0.35); const raised = attackPose(s);
    assert.ok(raised.shoulder > 2 && raised.elbow > 0);
    advanceAttack(s, 0.2); const strike = attackPose(s);
    assert.ok(strike.shoulder < raised.shoulder && strike.twist > raised.twist);
    advanceAttack(s, 0.45); assert.equal(attackPose(s).weight, 0);
});
test('sweeps include side targets within range but exclude rear, overhead and distant targets', () => {
    assert.equal(inAttackArc(1, 0, -2, 0, 0, -1, 3.2, 120), true);
    assert.equal(inAttackArc(1, 0, -2, 0, 0, -1, 3.2, 30), false);
    assert.equal(inAttackArc(0, 0, 2, 0, 0, -1, 3.2, 120), false);
    assert.equal(inAttackArc(0, 3, -0.1, 0, 0, -1, 3.2, 120), false);
    assert.equal(inAttackArc(0, 0, -4, 0, 0, -1, 3.2, 120), false);
});
