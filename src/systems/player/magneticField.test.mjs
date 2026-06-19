import assert from 'node:assert/strict';
import test from 'node:test';

import {
    DIRECTIONAL_RESIDUAL,
    getDirectionalAxis,
    getDirectionalMultiplier,
    sampleRawMagneticField,
} from './magneticField.ts';

const IRON_BLOCK = 197;

const blockSampler = (ironPositions) => {
    const occupied = new Set(ironPositions.map(([x, y, z]) => `${x},${y},${z}`));
    return (x, y, z) => occupied.has(`${x},${y},${z}`) ? IRON_BLOCK : 0;
};

const closeTo = (actual, expected, epsilon = 1e-9) => {
    assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} is not close to ${expected}`);
};

test('magnets without adjacent iron keep a spherical field', () => {
    assert.equal(getDirectionalAxis(blockSampler([]), 0, 0, 0, IRON_BLOCK), null);
});

test('an iron block behind a magnet directs the field away from the iron', () => {
    assert.deepEqual(
        getDirectionalAxis(blockSampler([[-1, 0, 0]]), 0, 0, 0, IRON_BLOCK),
        { x: 1, y: 0, z: 0 },
    );
});

test('multiple iron blocks combine across all three dimensions', () => {
    const axis = getDirectionalAxis(
        blockSampler([[1, 0, 0], [0, -1, 0], [0, 0, 1]]),
        0,
        0,
        0,
        IRON_BLOCK,
    );

    assert.ok(axis);
    closeTo(axis.x, -1 / Math.sqrt(3));
    closeTo(axis.y, 1 / Math.sqrt(3));
    closeTo(axis.z, -1 / Math.sqrt(3));
});

test('opposing iron blocks cancel back to a spherical field', () => {
    assert.equal(
        getDirectionalAxis(blockSampler([[-1, 0, 0], [1, 0, 0]]), 0, 0, 0, IRON_BLOCK),
        null,
    );
});

test('directional fields retain a small residual behind the magnet', () => {
    const axis = { x: 1, y: 0, z: 0 };

    closeTo(getDirectionalMultiplier(axis, 1, 0, 0), 1);
    closeTo(getDirectionalMultiplier(axis, -1, 0, 0), DIRECTIONAL_RESIDUAL);
    assert.ok(getDirectionalMultiplier(axis, 0, 1, 0) > DIRECTIONAL_RESIDUAL);
    assert.ok(getDirectionalMultiplier(axis, 0, 1, 0) < 1);
});

test('raw field vectors use positive-test-pole polarity and cancel overlaps', () => {
    const positive = [{ x: 0.5, y: 0.5, z: 0.5, polarity: 1, axis: null }];
    const negative = [{ x: 0.5, y: 0.5, z: 0.5, polarity: -1, axis: null }];

    const positiveField = sampleRawMagneticField(positive, 2.5, 0.5, 0.5);
    const negativeField = sampleRawMagneticField(negative, 2.5, 0.5, 0.5);
    const canceledField = sampleRawMagneticField([...positive, ...negative], 2.5, 0.5, 0.5);

    assert.ok(positiveField.x > 0);
    assert.ok(negativeField.x < 0);
    closeTo(canceledField.x, 0);
    closeTo(canceledField.y, 0);
    closeTo(canceledField.z, 0);
    closeTo(canceledField.positiveStrength, canceledField.negativeStrength);
});

test('raw field sampling applies the same directional cone as player physics', () => {
    const source = [{ x: 0.5, y: 0.5, z: 0.5, polarity: 1, axis: { x: 1, y: 0, z: 0 } }];
    const forward = sampleRawMagneticField(source, 2.5, 0.5, 0.5);
    const backward = sampleRawMagneticField(source, -1.5, 0.5, 0.5);

    closeTo(Math.abs(backward.x / forward.x), DIRECTIONAL_RESIDUAL);
});
