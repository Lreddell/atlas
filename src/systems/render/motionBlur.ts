// Scene-only camera-reprojection motion blur: the tuning, and the pure maths the
// pass uses. Kept out of the component so the numbers are reviewable and testable
// without a WebGL context.
//
// WHY REPROJECTION AND NOT ACCUMULATION
// A history/accumulation blur smears the last N frames together, which produces
// ghost trails behind everything and softens a stationary image. This instead
// derives a per-pixel screen-space velocity from the depth buffer and the change
// in the camera's view-projection between frames, then gathers along that vector.
// A stationary camera yields a zero vector, so a still frame is pixel-identical
// to no blur at all.

/**
 * Shutter angle, as a fraction of the frame interval.
 *
 * 180 degrees (0.5) is the film reference for believable motion blur. Atlas is a
 * first/third-person action game with fast mouse rotation and hard voxel edges,
 * where 180 smears block boundaries and attack telegraphs, so it runs at 120.
 */
export const SHUTTER_ANGLE_DEGREES = 120;
export const SHUTTER_FRACTION = SHUTTER_ANGLE_DEGREES / 360;

/** Strength on the conventional 0..1 motion-blur scale, applied on top of the shutter. */
export const MOTION_BLUR_STRENGTH = 0.35;

/**
 * Hard ceiling on a blur vector, as a fraction of screen WIDTH. Whatever the
 * camera does — a flick of the mouse, a dash, a cut that slipped past the history
 * reset — no pixel gathers further than this, so the worst case is a short streak
 * rather than a frame-wide smear.
 */
export const MAX_BLUR_SCREEN_FRACTION = 0.018;

/** Taps along the velocity vector. Enough to read as a streak, cheap enough to be free. */
export const MOTION_BLUR_SAMPLES = 8;

/** The frame rate the shutter is defined against (see `frameRateScale`). */
export const MOTION_BLUR_REFERENCE_FPS = 60;

/**
 * Below this many pixels of motion the gather is skipped: sub-pixel velocity
 * cannot blur anything, and skipping keeps a resting image exactly sharp.
 */
export const MOTION_BLUR_MIN_PIXELS = 0.35;

/**
 * Reprojection velocity is measured per FRAME, so at 30 fps the camera has moved
 * twice as far between frames as at 60 and would blur twice as hard for the same
 * mouse speed. Scaling by the frame time relative to the reference makes the blur
 * describe the same amount of real-world motion at any frame rate.
 *
 * Clamped so a single long hitch (a chunk upload, a GC pause, an alt-tab) cannot
 * multiply into a huge smear on the frame after it.
 */
export function frameRateScale(deltaSeconds: number): number {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return 0;
    const reference = 1 / MOTION_BLUR_REFERENCE_FPS;
    return Math.min(1, reference / deltaSeconds);
}

/** The scalar the shader multiplies the raw reprojection vector by. */
export function blurScale(deltaSeconds: number): number {
    return SHUTTER_FRACTION * MOTION_BLUR_STRENGTH * frameRateScale(deltaSeconds);
}

/** The gather ceiling in pixels for a given viewport. */
export function maxBlurPixels(viewportWidth: number): number {
    return Math.max(0, viewportWidth) * MAX_BLUR_SCREEN_FRACTION;
}

/**
 * Why the reprojection history is invalid this frame. Reprojecting across any of
 * these compares two unrelated camera positions, which is exactly the frame-wide
 * streak the effect must never produce.
 */
export type MotionBlurResetReason =
    | 'enabled'          // the pass just mounted; there is no previous frame
    | 'resize'           // render targets were rebuilt
    | 'world-load'       // entering or reloading a world
    | 'respawn'
    | 'teleport'         // /tp, setspawn, unstuck, any instantaneous move
    | 'view-mode'        // F5 (free) / F6 (welded)
    | 'detached-camera'  // F7 place / lock / release
    | 'cinematic'        // an authored cutscene taking or handing back the camera
    | 'fov'              // a large FOV change invalidates the old projection
    | 'panorama'         // cube-face capture must stay clean and deterministic
    | 'resume';          // unpausing, where the previous frame may be seconds old

/** Live reset flag, written by gameplay and consumed by the pass. */
export const motionBlurHistory = {
    /** Set while a discontinuity is pending; the pass clears it after reprojecting. */
    dirty: true,
    lastReason: 'enabled' as MotionBlurResetReason,
};

/**
 * Declare the camera discontinuous. The next frame reprojects against itself
 * (zero velocity, so no blur) and the frame after resumes normally.
 */
export function resetMotionBlurHistory(reason: MotionBlurResetReason): void {
    motionBlurHistory.dirty = true;
    motionBlurHistory.lastReason = reason;
}

/**
 * Safety net for a cut nothing reported. A camera that jumps further than this in
 * one frame is a teleport, not movement: the fastest authored motion in the game
 * (the magnetic dash) covers well under a block per frame at any playable rate.
 */
export const CAMERA_CUT_DISTANCE = 6;
/** Likewise for orientation: ~60 degrees in a single frame is a cut, not a mouse flick. */
export const CAMERA_CUT_DOT = Math.cos(Math.PI / 3);

/** Whether this frame's camera is discontinuous from the last one. */
export function isCameraCut(distanceMoved: number, forwardDot: number): boolean {
    return distanceMoved > CAMERA_CUT_DISTANCE || forwardDot < CAMERA_CUT_DOT;
}
