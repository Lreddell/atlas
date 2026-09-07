/** Model forward is -Z. Positive local X rotates that direction upward. */
export function headLookPitch(cameraPitch: number, bodyLean = 0): number {
    return Math.max(-1.2, Math.min(1.2, cameraPitch * 0.7 - bodyLean));
}

/** Raised food hand and repeated small bites, matching the familiar Minecraft cadence. */
export function eatingPose(time: number) {
    const bite = Math.sin(time * 22);
    return { shoulder: 1.35 + bite * 0.07, elbow: 1.5 + bite * 0.09, inward: -0.35, head: -0.08 + bite * 0.025 };
}
