import test from 'node:test';
import assert from 'node:assert/strict';
import { headLookPitch, eatingPose, crouchPose, airbornePose, placementPose } from './playerAnimation.ts';
import { lookBasis } from './viewRig.ts';

test('the face looks up and down with the camera, including a forward-leaning sprint', () => {
    for (const pitch of [-1, -0.4, 0.4, 1]) {
        for (const lean of [-0.22, 0, 0.1]) {
            const faceY = Math.sin(lean + headLookPitch(pitch, lean));
            const cameraY = lookBasis(0, pitch).forward.y;
            assert.equal(Math.sign(faceY), Math.sign(cameraY));
        }
    }
    assert.equal(headLookPitch(0), 0);
    assert.ok(Math.abs(-0.22 + headLookPitch(0, -0.22)) < 1e-9);
});

test('eating raises the right hand toward the mouth with small, bounded bite motions', () => {
    for (let t = 0; t <= 1.6; t += 0.02) {
        const p = eatingPose(t);
        const handY = 1.42 - Math.cos(p.shoulder) * 0.36 - Math.cos(p.shoulder + p.elbow) * 0.38;
        const handZ = -Math.sin(p.shoulder) * 0.36 - Math.sin(p.shoulder + p.elbow) * 0.38;
        assert.ok(handY > 1.6 && handY < 1.85);
        assert.ok(handZ < -0.35 && handZ > -0.6);
        assert.ok(p.inward < 0, 'bring the right hand inward');
        assert.deepEqual(eatingPose(t), p, 'simulation time holds the pose while paused');
    }
});

test('crouching bends at the waist while the articulated legs keep the feet planted', () => {
    const p = crouchPose();
    const footY = 0.75 + p.bodyY - 0.375 * Math.cos(p.hip) - 0.375 * Math.cos(p.hip + p.knee);
    const footZ = p.bodyZ - 0.375 * Math.sin(p.hip) - 0.375 * Math.sin(p.hip + p.knee);
    assert.ok(Math.abs(footY) < 0.02 && Math.abs(footZ) < 0.02);
    assert.ok(p.torsoLean < -0.3 && p.knee < 0 && p.hip > 0);
    assert.ok(Math.abs(p.shoulder + p.torsoLean) < 0.1, 'arms hang down from the bent torso');
});
test('airborne arms stay below the shoulders and successful placement has a short bounded push', () => {
    for (const vy of [-40, -3, 0, 3, 10]) {
        const p = airbornePose(vy);
        assert.ok(Math.abs(p.shoulder) < 0.5 && p.elbow < 0.4 && p.outward > 0);
    }
    assert.equal(placementPose(Infinity).weight, 0);
    assert.equal(placementPose(0).weight, 0);
    assert.equal(placementPose(0.125).weight, 1);
    assert.equal(placementPose(0.25).weight, 0);
});
