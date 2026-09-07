import assert from 'node:assert/strict';
import test from 'node:test';

import {
    CAMERA_CUT_DISTANCE, MAX_BLUR_SCREEN_FRACTION, MOTION_BLUR_REFERENCE_FPS, MOTION_BLUR_STRENGTH,
    SHUTTER_ANGLE_DEGREES, SHUTTER_FRACTION, blurScale, frameRateScale, isCameraCut,
    maxBlurPixels, motionBlurHistory, resetMotionBlurHistory,
} from './motionBlur.ts';

test('the tuning is the restrained target, not the maximum the shader allows', () => {
    // 180 degrees is the cinematic reference; a voxel action game with fast mouse
    // rotation and hard block edges runs under it.
    assert.ok(SHUTTER_ANGLE_DEGREES < 180, 'less than a 180-degree shutter');
    assert.equal(SHUTTER_ANGLE_DEGREES, 120);
    assert.ok(Math.abs(SHUTTER_FRACTION - 1 / 3) < 1e-9);
    assert.equal(MOTION_BLUR_STRENGTH, 0.35);
    // The gather ceiling stays in the 1.5-2% of screen width band.
    assert.ok(MAX_BLUR_SCREEN_FRACTION >= 0.015 && MAX_BLUR_SCREEN_FRACTION <= 0.02);
});

test('blur is normalised to 60 fps, so a low frame rate does not smear', () => {
    const reference = 1 / MOTION_BLUR_REFERENCE_FPS;
    assert.equal(frameRateScale(reference), 1, 'at 60 fps the shutter is unscaled');
    // At 30 fps the camera moved twice as far between frames, so halve the scale
    // to describe the same real-world motion.
    assert.ok(Math.abs(frameRateScale(1 / 30) - 0.5) < 1e-9);
    assert.ok(Math.abs(frameRateScale(1 / 15) - 0.25) < 1e-9);
    // Above 60 fps it is capped rather than amplified: a 144 fps frame has moved
    // less, and scaling up would reintroduce the frame-rate dependence.
    assert.equal(frameRateScale(1 / 144), 1);
    // A stalled or nonsensical frame contributes nothing.
    assert.equal(frameRateScale(0), 0);
    assert.equal(frameRateScale(-1), 0);
    assert.equal(frameRateScale(Number.NaN), 0);
});

test('the composed scale stays small at every frame rate', () => {
    for (const fps of [15, 30, 60, 90, 144]) {
        const scale = blurScale(1 / fps);
        assert.ok(scale > 0 && scale <= SHUTTER_FRACTION * MOTION_BLUR_STRENGTH + 1e-9, `${fps} fps -> ${scale}`);
    }
    // 60 fps is the maximum, and it is the restrained target, not 1.0.
    assert.ok(Math.abs(blurScale(1 / 60) - SHUTTER_FRACTION * MOTION_BLUR_STRENGTH) < 1e-9);
    assert.ok(blurScale(1 / 60) < 0.12, 'well under a full-frame smear');
});

test('the pixel ceiling scales with the viewport', () => {
    assert.ok(Math.abs(maxBlurPixels(1920) - 1920 * MAX_BLUR_SCREEN_FRACTION) < 1e-9);
    assert.ok(maxBlurPixels(3840) > maxBlurPixels(1920), 'same fraction, more pixels');
    assert.equal(maxBlurPixels(0), 0);
    // ~35px on a 1080p screen: a short streak, never a frame-wide one.
    assert.ok(maxBlurPixels(1920) < 40);
});

test('a camera cut is detected by distance or by turn', () => {
    // Ordinary movement, even the fastest authored move, is not a cut.
    assert.equal(isCameraCut(0, 1), false, 'still');
    assert.equal(isCameraCut(0.4, 0.999), false, 'sprinting');
    assert.equal(isCameraCut(1.2, 0.9), false, 'dashing while turning');
    // Teleports and instant reorientations are.
    assert.equal(isCameraCut(CAMERA_CUT_DISTANCE + 1, 1), true, 'teleport');
    assert.equal(isCameraCut(0, -1), true, 'spun to face the opposite way');
    assert.equal(isCameraCut(0, 0), true, 'a 90-degree snap');
});

test('every discontinuity marks the history dirty for the next frame', () => {
    const reasons = [
        'enabled', 'resize', 'world-load', 'respawn', 'teleport', 'view-mode',
        'detached-camera', 'cinematic', 'fov', 'panorama', 'resume',
    ];
    for (const reason of reasons) {
        motionBlurHistory.dirty = false;
        resetMotionBlurHistory(reason);
        assert.equal(motionBlurHistory.dirty, true, `${reason} must invalidate`);
        assert.equal(motionBlurHistory.lastReason, reason);
    }
});
