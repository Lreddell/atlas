import assert from 'node:assert/strict';
import test from 'node:test';

import { isEntityHitVisible } from './meleeOcclusion.ts';

test('melee accepts an unobstructed entity hit', () => {
    assert.equal(isEntityHitVisible(2.5, null), true);
    assert.equal(isEntityHitVisible(2.5, 3), true);
});

test('melee rejects entities clearly behind a wall', () => {
    // A block well in front of the target (beyond the tolerance) occludes.
    assert.equal(isEntityHitVisible(2.5, 1.5), false);
    assert.equal(isEntityHitVisible(3.0, 1.0), false);
});

test('melee allows hits when terrain only grazes near the target', () => {
    // Ground at the target's feet (within tolerance) must not drop a body shot.
    assert.equal(isEntityHitVisible(2.5, 2.0), true);
    assert.equal(isEntityHitVisible(2.5, 2.5), true);
});
