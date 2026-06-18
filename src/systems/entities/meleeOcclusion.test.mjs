import assert from 'node:assert/strict';
import test from 'node:test';

import { isEntityHitVisible } from './meleeOcclusion.ts';

test('melee accepts an unobstructed entity hit', () => {
    assert.equal(isEntityHitVisible(2.5, null), true);
    assert.equal(isEntityHitVisible(2.5, 3), true);
});

test('melee rejects entities behind or flush with a block hit', () => {
    assert.equal(isEntityHitVisible(2.5, 2), false);
    assert.equal(isEntityHitVisible(2.5, 2.5), false);
});
