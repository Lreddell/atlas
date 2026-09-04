import assert from 'node:assert/strict';
import test from 'node:test';

import { THIRD_PERSON_RIG, aimRay, lookBasis, placeThirdPersonCamera } from './viewRig.ts';

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
    const pulled = placeThirdPersonCamera(eye, forward, right, up, wallAt(2));
    near(pulled.armLength, 2 - THIRD_PERSON_RIG.margin);
    assert.equal(pulled.showModel, true);
    const cramped = placeThirdPersonCamera(eye, forward, right, up, wallAt(0.5));
    near(cramped.armLength, THIRD_PERSON_RIG.minDistance);
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
