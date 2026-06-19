import assert from 'node:assert/strict';
import test from 'node:test';

import {
    DROP_MAGNET_MAX_SPEED,
    applyMagneticFieldToVelocity,
} from './dropMagnetism.ts';

const closeTo = (actual, expected, epsilon = 1e-9) => {
    assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} is not close to ${expected}`);
};

test('applies raw magnetic field acceleration to a dropped item', () => {
    const velocity = [0, 0, 0];

    applyMagneticFieldToVelocity(velocity, { x: 20, y: -10, z: 5 }, 0.1);

    closeTo(velocity[0], 2);
    closeTo(velocity[1], -1);
    closeTo(velocity[2], 0.5);
});

test('clamps dropped-item magnetic speed without changing direction', () => {
    const velocity = [0, 0, 0];

    applyMagneticFieldToVelocity(velocity, { x: 1000, y: 0, z: 0 }, 1);

    closeTo(velocity[0], DROP_MAGNET_MAX_SPEED);
    closeTo(velocity[1], 0);
    closeTo(velocity[2], 0);
});
