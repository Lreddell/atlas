import test from 'node:test';
import assert from 'node:assert/strict';
import { headLookPitch } from './playerAnimation.ts';
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
