import assert from 'node:assert/strict';
import test from 'node:test';

import {
    THIRD_PERSON_RIG, aimRay, lookBasis, placeThirdPersonCamera, smoothThirdPersonCamera,
    playerModelOpacity, firstPersonHandOpacity, isThirdPerson, angleDelta, easeAngle, walkYaw,
    detachedFlyStep, nextDetachedStage, DETACHED_FLY_SPEED,
} from './viewRig.ts';

const clear = () => null;
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} !== ${b}`);

test('the camera basis follows the three.js YXZ camera convention', () => {
    const { forward, right, up } = lookBasis(0, 0);
    assert.deepEqual(forward, { x: -0, y: 0, z: -1 });
    assert.deepEqual(right, { x: 1, y: 0, z: -0 });
    near(up.y, 1);
    const turned = lookBasis(Math.PI / 2, 0);
    near(turned.forward.x, -1);
    near(turned.forward.z, 0);
    near(turned.right.z, -1);
    const pitched = lookBasis(0, Math.PI / 4);
    near(pitched.forward.y, Math.SQRT1_2);
    near(pitched.up.y, Math.SQRT1_2);
    // Looking up tips the camera's up backward (+z, behind a yaw-0 camera).
    near(pitched.up.z, Math.SQRT1_2);
});

test('in open space the camera hangs the full arm behind the shoulder pivot', () => {
    const { forward, right, up } = lookBasis(0, 0);
    const eye = { x: 10, y: 65.62, z: 10 };
    const placement = placeThirdPersonCamera(eye, forward, right, up, clear);
    near(placement.armLength, THIRD_PERSON_RIG.distance);
    near(placement.pivot.x, eye.x + THIRD_PERSON_RIG.shoulder);
    near(placement.pivot.y, eye.y + THIRD_PERSON_RIG.height);
    near(placement.camera.z, eye.z + THIRD_PERSON_RIG.distance);
    assert.equal(placement.showModel, true);
});

test('a wall behind the player pulls the camera in, and inside the body the model hides', () => {
    const { forward, right, up } = lookBasis(0, 0);
    const eye = { x: 0, y: 10, z: 0 };
    const wallAt = (distance) => (ox, oy, oz, dx, dy, dz) => (dz > 0.5 ? distance : null);
    const pulled = placeThirdPersonCamera(eye, forward, right, up, wallAt(3));
    near(pulled.armLength, 3 - THIRD_PERSON_RIG.margin);
    assert.equal(pulled.showModel, true);
    // Pulled in tight the body would fill the frame, so it hides.
    const close = placeThirdPersonCamera(eye, forward, right, up, wallAt(1.5));
    assert.ok(close.armLength < THIRD_PERSON_RIG.hideModelBelow);
    assert.equal(close.showModel, false);
    const cramped = placeThirdPersonCamera(eye, forward, right, up, wallAt(0.5));
    near(cramped.armLength, 0.5 - THIRD_PERSON_RIG.margin);
    assert.ok(cramped.camera.z < 0.5, 'the preferred arm minimum cannot push the camera through a wall');
    assert.equal(cramped.showModel, false);
    // A wall on the shoulder side collapses the pivot toward the eye.
    const shoulderWall = (ox, oy, oz, dx) => (dx > 0.5 ? 0.3 : null);
    const tight = placeThirdPersonCamera(eye, forward, right, up, shoulderWall);
    assert.ok(tight.pivot.x < THIRD_PERSON_RIG.shoulder);
    assert.ok(tight.pivot.x >= 0);
});

test('the aim ray starts at the eye and converges on the crosshair point', () => {
    const dir = { x: 0, y: 0, z: -1 };
    const eye = { x: 0, y: 10, z: 0 };
    const camera = { x: 0.55, y: 10.4, z: 4.6 };
    // A block 20 ahead of the camera: the eye ray must point at that same spot.
    const ray = aimRay(camera, eye, dir, () => 20);
    const point = { x: camera.x, y: camera.y, z: camera.z - 20 };
    const t = (point.z - eye.z) / ray.dir.z;
    near(eye.x + ray.dir.x * t, point.x);
    near(eye.y + ray.dir.y * t, point.y);
    assert.deepEqual(ray.origin, eye);
    // Nothing under the crosshair: aim at a far point along the camera ray.
    const far = aimRay(camera, eye, dir, clear, 64);
    assert.ok(far.dir.z < -0.99);
    // First person: unchanged.
    assert.deepEqual(aimRay(eye, eye, dir, () => 3), { origin: eye, dir });
});

test('third person zooms out from the player and recovers smoothly without crossing a wall', () => {
    const { forward, right, up } = lookBasis(0, 0);
    const eye = { x: 0, y: 1.62, z: 0 };
    const spring = { distance: 0, offset: 0 };
    let view = smoothThirdPersonCamera(eye, forward, right, up, clear, spring, 1 / 60);
    assert.ok(view.armLength > 0 && view.armLength < 1);
    for (let i = 0; i < 90; i++) view = smoothThirdPersonCamera(eye, forward, right, up, clear, spring, 1 / 60);
    assert.ok(view.armLength > 4.99);
    const blocked = (ox, oy, oz, dx, dy, dz) => dz > 0.9 ? 0.7 : null;
    view = smoothThirdPersonCamera(eye, forward, right, up, blocked, spring, 1 / 60);
    assert.ok(view.armLength <= 0.7 - THIRD_PERSON_RIG.margin);
    const released = smoothThirdPersonCamera(eye, forward, right, up, clear, spring, 1 / 60);
    assert.ok(released.armLength > view.armLength && released.armLength < 1.5);
});
test('model fades continuously near the body and uses wall-relative height', () => {
    const feet = { x: 0, y: 0, z: 0 }, up = { x: 0, y: 1, z: 0 };
    assert.equal(playerModelOpacity({ x: 0, y: 1.5, z: 0 }, feet, up), 0);
    let previous = 0;
    for (let z = 0; z < 2; z += 0.05) {
        const opacity = playerModelOpacity({ x: 0, y: 1.5, z }, feet, up);
        assert.ok(opacity >= previous && opacity >= 0 && opacity <= 1);
        previous = opacity;
    }
    assert.equal(previous, 1);
    near(playerModelOpacity({ x: 0, y: 1.5, z: 0.8 }, feet, up),
        playerModelOpacity({ x: 1.5, y: 0, z: 0.8 }, feet, { x: 1, y: 0, z: 0 }));
});

test('returning to first person eases to the exact eye, and reversing mid-transition remains continuous', () => {
    const { forward, right, up } = lookBasis(0, 0);
    const eye = { x: 0, y: 1.62, z: 0 };
    const spring = { distance: 5, offset: 1 };
    const returning = smoothThirdPersonCamera(eye, forward, right, up, clear, spring, 1 / 60, false);
    assert.ok(returning.armLength > 4 && returning.armLength < 5);
    const reversed = smoothThirdPersonCamera(eye, forward, right, up, clear, spring, 1 / 60, true);
    assert.ok(reversed.armLength > returning.armLength && reversed.armLength < 5);
    let hand = 0, view;
    for (let i = 0; i < 100; i++) {
        view = smoothThirdPersonCamera(eye, forward, right, up, clear, spring, 1 / 60, false);
        const opacity = firstPersonHandOpacity(view.camera, eye);
        assert.ok(opacity >= hand);
        hand = opacity;
    }
    assert.deepEqual(view.camera, eye);
    assert.equal(hand, 1);
    assert.equal(spring.distance, 0);
    assert.equal(spring.offset, 0);
});

test('both third-person views hang the camera on the arm; first person does not', () => {
    assert.equal(isThirdPerson('first'), false);
    assert.equal(isThirdPerson('third'), true);
    assert.equal(isThirdPerson('free'), true);
});

test('the free view walks the eight directions around the camera, camera unmoved', () => {
    // Forward is the camera's own heading, and each key combination is 45 deg off it.
    near(walkYaw(0, 1, 0), 0);
    near(walkYaw(0, 0, 1), -Math.PI / 2); // strafe right faces +x
    near(walkYaw(0, 0, -1), Math.PI / 2);
    near(walkYaw(0, 1, 1), -Math.PI / 4);
    near(Math.abs(walkYaw(0, -1, 0)), Math.PI); // backpedal turns the body around
    // The camera's heading only shifts the whole set; it is never changed by walking.
    near(walkYaw(1.2, 1, 0), 1.2);
    near(walkYaw(1.2, 0, 1), 1.2 - Math.PI / 2);
    assert.equal(walkYaw(1.2, 0, 0), null, 'standing still holds the current facing');
});

test('the body eases onto a heading the short way round and settles there', () => {
    near(angleDelta(3.0, -3.0), 2 * Math.PI - 6.0);
    near(angleDelta(-3.0, 3.0), 6.0 - 2 * Math.PI);
    // Turning from just under +pi to just over -pi crosses the seam, not the long way.
    const stepped = easeAngle(3.1, -3.1, 11, 1 / 60);
    assert.ok(stepped > 3.1, 'the short way round is forward through +pi');
    // And it converges rather than oscillating.
    let yaw = 0;
    for (let i = 0; i < 240; i++) yaw = easeAngle(yaw, 1.5, 11, 1 / 60);
    near(yaw, 1.5, 1e-3);
});

test('the detached camera flies along its own look at a fixed speed', () => {
    const dt = 0.5;
    const ahead = detachedFlyStep(0, 0, 1, 0, 0, DETACHED_FLY_SPEED, dt);
    near(ahead.x, 0, 1e-9);
    near(ahead.y, 0, 1e-9);
    near(ahead.z, -DETACHED_FLY_SPEED * dt);
    // Pitched up, forward climbs.
    const climbing = detachedFlyStep(0, Math.PI / 4, 1, 0, 0, DETACHED_FLY_SPEED, dt);
    near(climbing.y, DETACHED_FLY_SPEED * dt * Math.SQRT1_2);
    // A diagonal is no faster than a straight line, and up is world up.
    const diagonal = detachedFlyStep(0, 0, 1, 1, 1, DETACHED_FLY_SPEED, dt);
    near(Math.hypot(diagonal.x, diagonal.y, diagonal.z), DETACHED_FLY_SPEED * dt);
    assert.ok(diagonal.y > 0);
    const still = detachedFlyStep(0, 0, 0, 0, 0, DETACHED_FLY_SPEED, dt);
    assert.deepEqual(still, { x: 0, y: 0, z: 0 });
});

test('F7 cycles place, park, release', () => {
    assert.equal(nextDetachedStage('off'), 'placing');
    assert.equal(nextDetachedStage('placing'), 'locked');
    assert.equal(nextDetachedStage('locked'), 'off');
});
