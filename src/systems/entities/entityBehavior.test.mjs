import assert from 'node:assert/strict';
import test from 'node:test';

import {
    canTargetPlayer,
    shouldForgetTarget,
    shouldPreserveKnockback,
} from './entityBehavior.ts';

test('hostile entities target only survival players', () => {
    assert.equal(canTargetPlayer('survival'), true);
    assert.equal(canTargetPlayer('creative'), false);
    assert.equal(canTargetPlayer('spectator'), false);
});

test('aggro clears beyond the configured forget radius', () => {
    assert.equal(shouldForgetTarget(14 * 14, 14), false);
    assert.equal(shouldForgetTarget(22 * 22, 14), true);
});

test('recent knockback temporarily owns horizontal velocity', () => {
    assert.equal(shouldPreserveKnockback(0.15), true);
    assert.equal(shouldPreserveKnockback(0), false);
});
