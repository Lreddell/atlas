// Presentation-only motion for dropped items: a pop when they appear, an idle
// spin and bob that differ from drop to drop, and a quick flight into the
// player when picked up. None of this touches drop physics or pickup rules.

/** How long a new drop takes to pop up to full size. */
export const DROP_POP_MS = 220;
/** How long a collected item takes to fly into the player. */
export const PICKUP_FLIGHT_MS = 180;
/** Where on the player a collected item flies to, above the feet. */
export const PICKUP_TARGET_HEIGHT = 0.8;

const TAU = Math.PI * 2;

/**
 * A stable per-drop phase in [0, 2π), so drops spin and bob out of step with
 * each other. Drop ids are random strings that all start with "0.", so the
 * whole id is hashed (FNV-1a), not its first character.
 */
export function dropPhase(id: string): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < id.length; i++) {
        h ^= id.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return ((h >>> 0) / 0x100000000) * TAU;
}

/** Scale of a drop `ageMs` after it appeared: 0 → a small overshoot → 1. */
export function spawnPop(ageMs: number): number {
    if (!(ageMs > 0)) return ageMs === 0 ? 0 : 1;
    const t = Math.min(1, ageMs / DROP_POP_MS);
    const c = 1.7;
    const s = t - 1;
    return 1 + (c + 1) * s * s * s + c * s * s;
}

export interface PickupFlight {
    /** 0..1 of the way from where it was picked up to the player. */
    pull: number;
    /** Extra height for a small hop on the way in. */
    arc: number;
    scale: number;
    /** How much of the idle bob is left (fades out as it leaves the ground). */
    hover: number;
}

/** The flight of a collected item `elapsedMs` after pickup, or null once it has arrived. */
export function pickupFlight(elapsedMs: number, out: PickupFlight): PickupFlight | null {
    if (!(elapsedMs >= 0) || elapsedMs >= PICKUP_FLIGHT_MS) return null;
    const u = elapsedMs / PICKUP_FLIGHT_MS;
    out.pull = u * u;
    out.arc = Math.sin(u * Math.PI) * 0.3;
    out.scale = 1 - 0.75 * out.pull;
    out.hover = 1 - u;
    return out;
}
