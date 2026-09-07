/** Model forward is -Z. Positive local X rotates that direction upward. */
export function headLookPitch(cameraPitch: number, bodyLean = 0): number {
    return Math.max(-1.2, Math.min(1.2, cameraPitch * 0.7 - bodyLean));
}

/**
 * How far the head turns to make up a body/aim split (the free third-person
 * view). Wrapped to the short way round and capped at what a neck can do, so a
 * body facing fully away just looks over its shoulder instead of spinning.
 */
export function headLookYaw(offset: number): number {
    const wrapped = Math.atan2(Math.sin(offset), Math.cos(offset));
    return Math.max(-1.1, Math.min(1.1, wrapped * 0.75));
}

/** Raised food hand and repeated small bites, matching the familiar Minecraft cadence. */
export function eatingPose(time: number) {
    const bite = Math.sin(time * 22);
    return { shoulder: 1.35 + bite * 0.07, elbow: 1.5 + bite * 0.09, inward: -0.35, head: -0.08 + bite * 0.025 };
}

/** Waist bend and a small hip shift keep the feet planted instead of tipping the whole body. */
export function crouchPose() {
    return { bodyY: -0.06, bodyZ: 0.12, torsoLean: -0.5, hip: 0.5, knee: -0.68, shoulder: 0.45, elbow: 0.08 };
}
export function airbornePose(verticalSpeed: number) {
    const rising = verticalSpeed > 1.5;
    const fall = Math.min(1, Math.max(0, -verticalSpeed / 16));
    return { shoulder: rising ? -0.15 : 0.15 + fall * 0.15, elbow: 0.2,
        outward: 0.12 + fall * 0.2, hip: rising ? 0.35 : -0.08, knee: rising ? -0.5 : -0.18 };
}
/** A successful placement gives the hand a brief forward push; it does not gate gameplay. */
export function placementPose(elapsed: number) {
    const weight = elapsed >= 0 && elapsed < 0.25 ? Math.sin(elapsed / 0.25 * Math.PI) : 0;
    return { weight, shoulder: 0.18 + weight * 0.8, elbow: 0.28 - weight * 0.18 };
}
