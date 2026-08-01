export const MUSIC_FADE_CURVE_POINTS = 64;

export function buildEqualPowerFadeCurve(
    fadeIn: boolean,
    targetVolume: number,
    points = MUSIC_FADE_CURVE_POINTS,
): Float32Array {
    const curve = new Float32Array(Math.max(2, points));
    for (let index = 0; index < curve.length; index += 1) {
        const phase = (index / (curve.length - 1)) * (Math.PI / 2);
        curve[index] = targetVolume * (fadeIn ? Math.sin(phase) : Math.cos(phase));
    }
    return curve;
}

/** Adjacent copies of one loop must never gain loudness at their seam. */
export function buildConstantSumFadeCurve(
    fadeIn: boolean,
    targetVolume: number,
    points = MUSIC_FADE_CURVE_POINTS,
): Float32Array {
    const curve = new Float32Array(Math.max(2, points));
    for (let index = 0; index < curve.length; index += 1) {
        const progress = index / (curve.length - 1);
        curve[index] = targetVolume * (fadeIn ? progress : 1 - progress);
    }
    return curve;
}
