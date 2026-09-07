import test from 'node:test';
import assert from 'node:assert/strict';
import { headLookPitch, eatingPose } from './playerAnimation.ts';
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
