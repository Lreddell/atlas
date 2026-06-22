import assert from 'node:assert/strict';
import test from 'node:test';

// magneticAdhesion.ts is pure (plain {x,y,z} vectors, numeric block ids via
// samplers, no THREE / no BlockType enum) so it imports cleanly under
// --experimental-strip-types and the geometry can be asserted directly.
import {
    createAdhesionState,
    findAdhesionCandidate,
    computeLocalBasis,
    projectInput,
    eyeOffset,
    detachImpulse,
    evaluateSoftDetach,
    isAttractive,
    vdot,
    vlen,
    ADHESION_SNAP_DISTANCE,
    ADHESION_MIN_ATTACH_MS,
    ADHESION_DETACH_GRACE_MS,
    ADHESION_FAILSAFE_MS,
} from './magneticAdhesion.ts';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

test('isAttractive: opposite controllable polarity attracts, same repels', () => {
    assert.equal(isAttractive(-1, 1), true);
    assert.equal(isAttractive(1, -1), true);
    assert.equal(isAttractive(1, 1), false);
    assert.equal(isAttractive(-1, -1), false);
    assert.equal(isAttractive(1, 0), false); // not a magnet
});

test('findAdhesionCandidate latches onto the exposed face the player is pressed against', () => {
    // Single +1 magnet at the origin block; everything else air.
    const getPolarity = (x, y, z) => (x === 0 && y === 0 && z === 0 ? 1 : 0);
    const isSolid = () => false;
    // Body just outside the +X face of the block (face plane at x = 1).
    const center = { x: 1.3, y: 0.5, z: 0.5 };

    const cand = findAdhesionCandidate(getPolarity, isSolid, center, -1);
    assert.ok(cand, 'expected a candidate for an attractive nearby face');
    assert.deepEqual(cand.normal, { x: 1, y: 0, z: 0 });
    assert.ok(near(cand.distance, 0.3, 1e-6), `distance ${cand.distance}`);
    assert.equal(cand.polarity, 1);
    assert.ok(cand.strength > 0);
});

test('findAdhesionCandidate returns null when polarity repels', () => {
    const getPolarity = (x, y, z) => (x === 0 && y === 0 && z === 0 ? 1 : 0);
    const isSolid = () => false;
    const center = { x: 1.3, y: 0.5, z: 0.5 };
    // Same sign as the block -> repulsion -> no latch.
    assert.equal(findAdhesionCandidate(getPolarity, isSolid, center, 1), null);
});

test('findAdhesionCandidate requires an open face (room for the body)', () => {
    const getPolarity = (x, y, z) => (x === 0 && y === 0 && z === 0 ? 1 : 0);
    // The +X neighbour is solid, so that face is not climbable.
    const isSolid = (x, y, z) => x === 1 && y === 0 && z === 0;
    const center = { x: 1.3, y: 0.5, z: 0.5 };
    assert.equal(findAdhesionCandidate(getPolarity, isSolid, center, -1), null);
});

test('findAdhesionCandidate respects the snap distance', () => {
    const getPolarity = (x, y, z) => (x === 0 && y === 0 && z === 0 ? 1 : 0);
    const isSolid = () => false;
    // Far past the snap distance from the +X face plane (x = 1).
    const center = { x: 1 + ADHESION_SNAP_DISTANCE + 0.5, y: 0.5, z: 0.5 };
    assert.equal(findAdhesionCandidate(getPolarity, isSolid, center, -1), null);
});

test('computeLocalBasis: up is the normal and the basis is orthonormal', () => {
    const b = computeLocalBasis({ x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: -1 });
    assert.deepEqual(b.up, { x: 1, y: 0, z: 0 });
    // forward lies in the wall plane (perpendicular to up).
    assert.ok(near(vdot(b.forward, b.up), 0));
    assert.ok(near(vdot(b.right, b.up), 0));
    assert.ok(near(vdot(b.forward, b.right), 0));
    assert.ok(near(vlen(b.forward), 1));
    assert.ok(near(vlen(b.right), 1));
});

test('projectInput maps forward/right onto the wall plane', () => {
    const b = computeLocalBasis({ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
    const fwd = projectInput(1, 0, b);
    assert.ok(near(vlen(fwd), 1));
    assert.ok(near(vdot(fwd, b.up), 0)); // never pushes into/out of the wall
    const none = projectInput(0, 0, b);
    assert.deepEqual(none, { x: 0, y: 0, z: 0 });
});

test('eyeOffset scales the unit up vector by the eye height', () => {
    const e = eyeOffset({ x: 2, y: 0, z: 0 }, 1.62);
    assert.ok(near(e.x, 1.62));
    assert.ok(near(e.y, 0));
});

test('detachImpulse launches along up and preserves only tangent momentum', () => {
    const up = { x: 1, y: 0, z: 0 };
    const vel = { x: 5, y: 2, z: 3 }; // x is inward (along up) and must be dropped
    const imp = detachImpulse(up, vel, 10, 0.5);
    assert.ok(near(imp.x, 10)); // launch only, inward component stripped
    assert.ok(near(imp.y, 1));  // 2 * 0.5 preserved tangent
    assert.ok(near(imp.z, 1.5));
});

test('evaluateSoftDetach honours min-attach, grace, and failsafe', () => {
    const s = createAdhesionState();
    s.active = true;
    s.attachedAt = 1000;
    s.lastValidSurfaceAt = 1000;

    // Before the minimum attach time, soft conditions never release.
    assert.equal(evaluateSoftDetach(s, 1000 + ADHESION_MIN_ATTACH_MS - 1, 0, false), null);

    // Weak attraction within the grace window: still attached.
    assert.equal(evaluateSoftDetach(s, 1000 + ADHESION_MIN_ATTACH_MS + 10, 0, true), null);

    // Weak attraction past the grace window: peel off.
    assert.equal(
        evaluateSoftDetach(s, 1000 + ADHESION_DETACH_GRACE_MS + 1, 0, true),
        'attraction-lost',
    );

    // Lost surface past grace.
    assert.equal(
        evaluateSoftDetach(s, 1000 + ADHESION_DETACH_GRACE_MS + 1, 999, false),
        'surface-ended',
    );

    // No surface for a long time -> failsafe.
    assert.equal(evaluateSoftDetach(s, 1000 + ADHESION_FAILSAFE_MS + 1, 999, false), 'failsafe');
});

test('createAdhesionState starts inactive and world-up', () => {
    const s = createAdhesionState();
    assert.equal(s.active, false);
    assert.deepEqual(s.localUp, { x: 0, y: 1, z: 0 });
    assert.equal(s.detachReason, null);
});
