// Global camera shake (trauma model). Any system can add trauma; the player
// camera samples a decaying random offset each frame. Trauma is squared when
// sampled so small shakes stay subtle while big ones really kick.

let trauma = 0;

/** Add shake energy (0..1). Stacks, clamped to 1. */
export function addTrauma(amount: number): void {
    trauma = Math.min(1, trauma + amount);
}

/** Current trauma (0..1), for callers that want to react to it. */
export function getTrauma(): number {
    return trauma;
}

export function resetShake(): void {
    trauma = 0;
}

/**
 * Advance the shake and return this frame's positional offset (blocks). Mutates
 * `out`. Decays trauma by `dt`. Returns a zero offset when idle.
 */
export function sampleShake(out: { x: number; y: number; z: number }, dt: number): { x: number; y: number; z: number } {
    if (trauma <= 0) { out.x = 0; out.y = 0; out.z = 0; return out; }
    trauma = Math.max(0, trauma - dt * 1.6);
    const s = trauma * trauma * 0.45; // peak offset ~0.45 blocks
    out.x = (Math.random() * 2 - 1) * s;
    out.y = (Math.random() * 2 - 1) * s;
    out.z = (Math.random() * 2 - 1) * s;
    return out;
}
