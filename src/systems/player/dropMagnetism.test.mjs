import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { URL } from 'node:url';

import {
    DROP_MAGNET_MAX_SPEED,
    applyMagneticFieldToVelocity,
} from './dropMagnetism.ts';

const closeTo = (actual, expected, epsilon = 1e-9) => {
    assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} is not close to ${expected}`);
};
const dropManagerSource = readFileSync(
    new URL('../../components/DropManager.tsx', import.meta.url),
    'utf8',
);

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

test('dropped magnet polarity repels matching poles and attracts opposite poles', () => {
    const cases = [
        { sourceField: 20, dropPolarity: 1, expected: 2, label: 'positive + positive' },
        { sourceField: 20, dropPolarity: -1, expected: -2, label: 'positive + negative' },
        { sourceField: -20, dropPolarity: 1, expected: -2, label: 'negative + positive' },
        { sourceField: -20, dropPolarity: -1, expected: 2, label: 'negative + negative' },
    ];

    for (const { sourceField, dropPolarity, expected, label } of cases) {
        const velocity = [0, 0, 0];
        applyMagneticFieldToVelocity(
            velocity,
            { x: sourceField, y: 0, z: 0 },
            0.1,
            dropPolarity,
        );
        closeTo(velocity[0], expected, 1e-9);
        assert.equal(Math.sign(velocity[0]), Math.sign(expected), label);
    }
});

test('drop physics passes negative polarity only for negative magnet items', () => {
    assert.match(
        dropManagerSource,
        /drop\.type === BlockType\.NEGATIVE_MAGNET \? -1 : 1/,
    );
});
