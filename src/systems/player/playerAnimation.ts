/** Model forward is -Z. Positive local X rotates that direction upward. */
export function headLookPitch(cameraPitch: number, bodyLean = 0): number {
    return Math.max(-1.2, Math.min(1.2, cameraPitch * 0.7 - bodyLean));
}
