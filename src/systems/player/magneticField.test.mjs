import assert from 'node:assert/strict';
import test from 'node:test';
import * as magneticFieldModule from './magneticField.ts';

import {
    DIRECTIONAL_CONE_HALF_ANGLE,
    DIRECTIONAL_LEAK_MULTIPLIER,
    DIRECTIONAL_PEAK_MULTIPLIER,
    getDirectionalAxis,
    getDirectionalMultiplier,
    getMagneticResponseSign,
    sampleRawMagneticField,
    bossFieldVelocityDelta,
    BOSS_FIELD_MAX_DRIFT,
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

test('Iron-backed fields concentrate four-times force into a narrow cone', () => {
    const axis = { x: 1, y: 0, z: 0 };
    const coneEdge = {
        x: Math.cos(DIRECTIONAL_CONE_HALF_ANGLE),
        y: Math.sin(DIRECTIONAL_CONE_HALF_ANGLE),
        z: 0,
    };

    closeTo(getDirectionalMultiplier(null, 1, 0, 0), 1);
    closeTo(getDirectionalMultiplier(axis, 1, 0, 0), DIRECTIONAL_PEAK_MULTIPLIER);
    closeTo(
        getDirectionalMultiplier(axis, coneEdge.x, coneEdge.y, coneEdge.z),
        DIRECTIONAL_LEAK_MULTIPLIER,
    );
    closeTo(getDirectionalMultiplier(axis, 0, 1, 0), DIRECTIONAL_LEAK_MULTIPLIER);
    closeTo(getDirectionalMultiplier(axis, -1, 0, 0), DIRECTIONAL_LEAK_MULTIPLIER);
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

test('ordinary metal and controlled boots use different polarity rules', () => {
    assert.equal(getMagneticResponseSign(false, 1, 1), 1);
    assert.equal(getMagneticResponseSign(false, 1, -1), -1);
    assert.equal(getMagneticResponseSign(true, 1, 1), 1);
    assert.equal(getMagneticResponseSign(true, 1, -1), -1);
    assert.equal(getMagneticResponseSign(true, -1, 1), -1);
    assert.equal(getMagneticResponseSign(true, -1, -1), 1);
});

test('raw field sampling applies the same directional cone as player physics', () => {
    const source = [{ x: 0.5, y: 0.5, z: 0.5, polarity: 1, axis: { x: 1, y: 0, z: 0 } }];
    const forward = sampleRawMagneticField(source, 2.5, 0.5, 0.5);
    const backward = sampleRawMagneticField(source, -1.5, 0.5, 0.5);

    closeTo(
        Math.abs(backward.x / forward.x),
        DIRECTIONAL_LEAK_MULTIPLIER / DIRECTIONAL_PEAK_MULTIPLIER,
    );
});

test('boss field: same polarity repels (pushes away), opposite attracts (pulls in)', () => {
    // Boss at the origin, player 5 blocks out on +X, at rest.
    const boss = (polarity) => [{ x: 0, y: 0, z: 0, polarity, range: 30, force: 40 }];
    const dt = 0.05;

    // Player +1 vs boss +1 (same): pushed further out (+X).
    const repel = bossFieldVelocityDelta(boss(1), 5, 0, 0, 0, 0, 0, 1, dt);
    assert.ok(repel.active);
    assert.ok(repel.x > 0, `expected +X repulsion, got ${repel.x}`);

    // Player +1 vs boss -1 (opposite): pulled toward the boss (−X).
    const attract = bossFieldVelocityDelta(boss(-1), 5, 0, 0, 0, 0, 0, 1, dt);
    assert.ok(attract.x < 0, `expected −X attraction, got ${attract.x}`);

    // Flipping the player's polarity flips the response.
    const flipped = bossFieldVelocityDelta(boss(1), 5, 0, 0, 0, 0, 0, -1, dt);
    assert.ok(flipped.x < 0, 'flipping polarity should reverse the force');
});

test('boss field: zero outside range, stronger up close, drift-capped (air-safe)', () => {
    const src = [{ x: 0, y: 0, z: 0, polarity: 1, range: 30, force: 40 }];
    const dt = 0.05;

    // Out of range → inactive, no push.
    const far = bossFieldVelocityDelta(src, 100, 0, 0, 0, 0, 0, 1, dt);
    assert.equal(far.active, false);
    assert.equal(far.x, 0);

    // Closer is stronger: it ramps toward a higher terminal drift. At a probe
    // velocity that sits between the far and near drift caps, only the near
    // field still pushes (the far field has already reached its lower cap).
    const probeV = 5.0; // between mid cap (~3.5) and near cap (~6.3)
    const nearPush = bossFieldVelocityDelta(src, 3, 0, 0, probeV, 0, 0, 1, dt).x;
    const farPush = bossFieldVelocityDelta(src, 15, 0, 0, probeV, 0, 0, 1, dt).x;
    assert.ok(nearPush > 0, 'near field ramps toward its higher drift cap');
    assert.equal(farPush, 0, 'far field has already reached its lower drift cap');

    // Velocity-aware: a player already drifting at/over the target receives no
    // further push — this is what stops an airborne player being flung.
    const atTarget = bossFieldVelocityDelta(src, 3, 0, 0, BOSS_FIELD_MAX_DRIFT + 5, 0, 0, 1, dt);
    assert.equal(atTarget.x, 0, 'should never push past the drift cap');

    // And a single tick can never add more than the drift cap.
    const oneTick = bossFieldVelocityDelta(src, 3, 0, 0, 0, 0, 0, 1, dt);
    assert.ok(Math.hypot(oneTick.x, oneTick.z) <= BOSS_FIELD_MAX_DRIFT + 1e-9);
});

test('magnetic sampling can use the closest point on the full player AABB', () => {
    assert.equal(
        typeof magneticFieldModule.getClosestPointOnAabb,
        'function',
        'expected a full-body AABB sampling helper',
    );

    const point = magneticFieldModule.getClosestPointOnAabb(
        { x: 0.5, y: 6.5, z: 0.5 },
        { x: 0.2, y: 0, z: 0.2 },
        { x: 0.8, y: 1.8, z: 0.8 },
    );

    assert.deepEqual(point, { x: 0.5, y: 1.8, z: 0.5 });
    assert.ok(Math.hypot(point.x - 0.5, point.y - 6.5, point.z - 0.5) < 5);
});
