// Collision and telegraph geometry shared by the encounter and its renderer.
// Plain values keep the fast-moving attack cases reproducible without WebGL.
export interface CombatPoint { x: number; y: number; z: number }

/** Slab intersection, including a segment that starts inside the box. */
export function segmentHitsBox(from: CombatPoint, to: CombatPoint, min: CombatPoint, max: CombatPoint): boolean {
    let enter = 0, leave = 1;
    for (const axis of ['x', 'y', 'z'] as const) {
        const delta = to[axis] - from[axis];
        if (Math.abs(delta) < 1e-9) {
            if (from[axis] < min[axis] || from[axis] > max[axis]) return false;
        } else {
            const a = (min[axis] - from[axis]) / delta;
            const b = (max[axis] - from[axis]) / delta;
            enter = Math.max(enter, Math.min(a, b));
            leave = Math.min(leave, Math.max(a, b));
            if (enter > leave) return false;
        }
    }
    return true;
}

/** A ring is a travelling edge, not an ever-expanding damaging disc. */
export function ringSweepsPlayer(previous: number, radius: number, maxRadius: number, distance: number, feetAboveFloor: number): boolean {
    const halfWidth = 0.55;
    return distance <= maxRadius + halfWidth && distance >= previous - halfWidth
        && distance <= Math.min(radius, maxRadius) + halfWidth
        && feetAboveFloor > -0.5 && feetAboveFloor < 1.1;
}

/** XY sector geometry, tipped -PI/2 around X, points down world +Z. */
export const WARDEN_SECTOR_START = -Math.PI / 2;

/** The Aegis reaches the marked point before dropping; no hidden second target. */
export function plungePosition(start: CombatPoint, target: CombatPoint, windup: number, drop: number): CombatPoint {
    const ease = (t: number) => { const u = Math.max(0, Math.min(1, t)); return u * u * (3 - 2 * u); };
    const travel = ease(windup);
    const fall = ease(drop);
    const apex = start.y + 2;
    return {
        x: start.x + (target.x - start.x) * travel,
        y: drop > 0 ? apex + (target.y - apex) * fall : start.y + 2 * travel,
        z: start.z + (target.z - start.z) * travel,
    };
}
