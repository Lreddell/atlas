// Magnetic wall adhesion (Phase 10). With Polarity Boots active, a player who is
// attracted to a magnetite magnet face and is touching (or within a tiny snap
// distance of) it latches onto the surface and can walk/climb along it — the
// camera "up" rolling to the wall normal only AFTER a real attachment, never
// while merely being pulled through the air.
//
// This module is intentionally pure: plain {x,y,z} vectors, numeric block ids
// passed via samplers, no THREE and no BlockType import — so the geometry
// (candidate finding, face selection, local basis, input projection, eye offset,
// detach impulse, detach conditions) is deterministic and unit-testable. The
// THREE-specific camera reorientation lives in Player.tsx.

// Mirrors MAGNET_FORCE in ./magneticField (kept local so this pure module has no
// cross-imports and stays importable by the node --test strip-types runner).
const ADHESION_FIELD_FORCE = 70;

export interface Vec3 {
    x: number;
    y: number;
    z: number;
}

export interface AdhesionCandidate {
    /** Magnet block the player is latched to. */
    blockX: number;
    blockY: number;
    blockZ: number;
    /** Outward face normal (points away from the wall, toward the player) = localUp. */
    normal: Vec3;
    /** Point on the magnet face nearest the player body. */
    surfacePoint: Vec3;
    /** Perpendicular distance from the body to the face plane. */
    distance: number;
    /** Attraction strength (inverse-square in the perpendicular distance). */
    strength: number;
    /** Polarity of the magnet block (+1 / -1). */
    polarity: number;
}

export interface AdhesionState {
    active: boolean;
    // Surface
    blockX: number;
    blockY: number;
    blockZ: number;
    normal: Vec3; // localUp (face normal)
    localUp: Vec3;
    localRight: Vec3;
    localForward: Vec3;
    surfacePoint: Vec3;
    contactDistance: number;
    attachStrength: number;
    polarity: number;
    // Timing / hysteresis (ms timestamps)
    attachedAt: number;
    lastValidSurfaceAt: number;
    detachCooldownUntil: number;
    detachReason: string | null;
    // Camera orientation transition
    transition: number; // 0..1 — eases the up-vector roll on/off the wall
    prevUp: Vec3;
    targetUp: Vec3;
    // Look while attached (yaw around localUp, pitch around localRight)
    lookYaw: number;
    lookPitch: number;
}

// --- Tuning ------------------------------------------------------------------

/** How far (blocks) around the body we look for a magnet face to latch onto. */
export const ADHESION_SCAN_RADIUS = 2;
/** Body must be within this perpendicular distance of the face to attach. */
export const ADHESION_SNAP_DISTANCE = 0.8;
/** Attraction strength required to attach (higher than the detach threshold). */
export const ADHESION_ATTACH_STRENGTH = 28;
/** Below this strength (for the grace period) the player peels off. */
export const ADHESION_DETACH_STRENGTH = 7;
/** A lost-attraction / lost-surface condition must persist this long to detach. */
export const ADHESION_DETACH_GRACE_MS = 300;
/** Minimum time stuck before soft conditions (not jump/flip) can release. */
export const ADHESION_MIN_ATTACH_MS = 200;
/** Cooldown after detaching before the player can re-latch. */
export const ADHESION_REATTACH_COOLDOWN_MS = 400;
/** Failsafe: drop adhesion if no valid surface has been seen for this long. */
export const ADHESION_FAILSAFE_MS = 600;
/** Walk/climb speed along the wall plane (blocks/sec). */
export const ADHESION_CLIMB_SPEED = 4.2;
/** Constant pull into the wall (blocks/sec) that keeps the body in contact.
 *  Light, so you can still slide to a block's edge to crest or climb down. */
export const ADHESION_STICK_SPEED = 1.1;
/** Launch speed away from the wall when jumping off. */
export const ADHESION_JUMP_OFF_SPEED = 7.5;
/** Stronger launch when flipping polarity (the core traversal move). */
export const ADHESION_POLARITY_LAUNCH_SPEED = 13;
/** Fraction of tangent velocity preserved through a detach. */
export const ADHESION_TANGENT_PRESERVE = 0.55;
/** Camera up-vector slerp rate (per second) for the roll on/off the wall. */
export const ADHESION_TRANSITION_RATE = 12;
/** Smallest perpendicular distance used in the inverse-square (avoids blow-up). */
const MIN_PLANE_DIST = 0.18;

const FACE_NORMALS: ReadonlyArray<Vec3> = [
    { x: 1, y: 0, z: 0 },
    { x: -1, y: 0, z: 0 },
    { x: 0, y: 1, z: 0 },
    { x: 0, y: -1, z: 0 },
    { x: 0, y: 0, z: 1 },
    { x: 0, y: 0, z: -1 },
];

// --- Small vector helpers (plain objects, no allocation pressure on callers) -

export const vdot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;

export const vlen = (a: Vec3): number => Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);

export const vcross = (a: Vec3, b: Vec3): Vec3 => ({
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
});

export const vnorm = (a: Vec3): Vec3 => {
    const l = vlen(a);
    if (l < 1e-9) return { x: 0, y: 0, z: 0 };
    return { x: a.x / l, y: a.y / l, z: a.z / l };
};

const vscale = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
const vadd = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const vsub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });

/** With controllable (boots) polarity, opposite signs attract — that is what latches. */
export const isAttractive = (playerPolarity: number, blockPolarity: number): boolean =>
    blockPolarity !== 0 && Math.sign(playerPolarity) !== Math.sign(blockPolarity);

export function createAdhesionState(): AdhesionState {
    return {
        active: false,
        blockX: 0,
        blockY: 0,
        blockZ: 0,
        normal: { x: 0, y: 1, z: 0 },
        localUp: { x: 0, y: 1, z: 0 },
        localRight: { x: 1, y: 0, z: 0 },
        localForward: { x: 0, y: 0, z: -1 },
        surfacePoint: { x: 0, y: 0, z: 0 },
        contactDistance: 0,
        attachStrength: 0,
        polarity: 0,
        attachedAt: 0,
        lastValidSurfaceAt: 0,
        detachCooldownUntil: 0,
        detachReason: null,
        transition: 0,
        prevUp: { x: 0, y: 1, z: 0 },
        targetUp: { x: 0, y: 1, z: 0 },
        lookYaw: 0,
        lookPitch: 0,
    };
}

/** Clamp a point to the square face of a unit block, given the face's outward normal. */
function clampToFace(point: Vec3, blockCenter: Vec3, normal: Vec3): Vec3 {
    const out: Vec3 = { x: point.x, y: point.y, z: point.z };
    // On the normal axis the point sits exactly on the face plane; the two
    // tangent axes are clamped to the block's [-0.5, +0.5] extent.
    if (normal.x === 0) out.x = Math.max(blockCenter.x - 0.5, Math.min(blockCenter.x + 0.5, out.x));
    if (normal.y === 0) out.y = Math.max(blockCenter.y - 0.5, Math.min(blockCenter.y + 0.5, out.y));
    if (normal.z === 0) out.z = Math.max(blockCenter.z - 0.5, Math.min(blockCenter.z + 0.5, out.z));
    return out;
}

/**
 * Find the best magnet face to latch onto near the player body center. Returns
 * null when there is no attractive, exposed, nearby face — meaning the camera
 * must stay world-up (the player is only being pulled through the air).
 *
 * @param getPolarity  block magnet polarity (+1 / -1, or 0 if not a magnet)
 * @param isSolid      whether a block cell is solid (used to require an open face)
 * @param center       player body center in world space
 * @param playerPolarity  the player's chosen polarity sign
 */
export function findAdhesionCandidate(
    getPolarity: (x: number, y: number, z: number) => number,
    isSolid: (x: number, y: number, z: number) => boolean,
    center: Vec3,
    playerPolarity: number,
    snapDistance = ADHESION_SNAP_DISTANCE,
): AdhesionCandidate | null {
    const cx = Math.floor(center.x);
    const cy = Math.floor(center.y);
    const cz = Math.floor(center.z);

    let best: AdhesionCandidate | null = null;

    for (let bx = cx - ADHESION_SCAN_RADIUS; bx <= cx + ADHESION_SCAN_RADIUS; bx++) {
        for (let by = cy - ADHESION_SCAN_RADIUS; by <= cy + ADHESION_SCAN_RADIUS; by++) {
            for (let bz = cz - ADHESION_SCAN_RADIUS; bz <= cz + ADHESION_SCAN_RADIUS; bz++) {
                const polarity = getPolarity(bx, by, bz);
                if (!isAttractive(playerPolarity, polarity)) continue;

                const blockCenter: Vec3 = { x: bx + 0.5, y: by + 0.5, z: bz + 0.5 };

                for (const n of FACE_NORMALS) {
                    // The face must be open (the cell just outside it is not solid),
                    // otherwise there is no room for the player against it.
                    if (isSolid(bx + n.x, by + n.y, bz + n.z)) continue;

                    const toCenter = vsub(center, blockCenter);
                    const side = vdot(toCenter, n);
                    if (side <= 0) continue; // player is on the far side of this face

                    const facePoint = vadd(blockCenter, vscale(n, 0.5));
                    // Perpendicular distance from the body to the face plane.
                    const planeDist = vdot(vsub(center, facePoint), n);
                    if (planeDist < 0 || planeDist > snapDistance) continue;

                    // Project the body center onto the face plane, clamp to the face.
                    const onPlane = vsub(center, vscale(n, planeDist));
                    const surfacePoint = clampToFace(onPlane, blockCenter, n);

                    const d = Math.max(planeDist, MIN_PLANE_DIST);
                    const strength = ADHESION_FIELD_FORCE / (d * d);

                    if (!best || strength > best.strength) {
                        best = {
                            blockX: bx,
                            blockY: by,
                            blockZ: bz,
                            normal: { x: n.x, y: n.y, z: n.z },
                            surfacePoint,
                            distance: planeDist,
                            strength,
                            polarity,
                        };
                    }
                }
            }
        }
    }

    return best;
}

export interface LocalBasis {
    up: Vec3;
    right: Vec3;
    forward: Vec3;
}

/**
 * Build a right-handed local basis for the wall surface. localUp is the face
 * normal; localForward is the look direction projected onto the wall plane (so
 * "forward" walks where you look); localRight completes the basis.
 */
export function computeLocalBasis(normal: Vec3, lookDir: Vec3): LocalBasis {
    const up = vnorm(normal);
    // Project look onto the plane perpendicular to up.
    let fwd = vsub(lookDir, vscale(up, vdot(lookDir, up)));
    if (vlen(fwd) < 1e-4) {
        // Degenerate (looking straight along the normal): pick any tangent.
        const seed = Math.abs(up.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
        fwd = vsub(seed, vscale(up, vdot(seed, up)));
    }
    const forward = vnorm(fwd);
    // Camera convention: right = forward × up.
    const right = vnorm(vcross(forward, up));
    return { up, right, forward };
}

/** Movement direction in the wall plane from forward/right input amounts. */
export function projectInput(forwardAmt: number, rightAmt: number, basis: LocalBasis): Vec3 {
    const dir = vadd(vscale(basis.forward, forwardAmt), vscale(basis.right, rightAmt));
    return vlen(dir) > 1e-6 ? vnorm(dir) : { x: 0, y: 0, z: 0 };
}

/** Eye position offset along the local up from the contact point. */
export function eyeOffset(up: Vec3, eyeHeight: number): Vec3 {
    return vscale(vnorm(up), eyeHeight);
}

/**
 * Velocity to apply when leaving the wall: a push out along the surface normal
 * plus a fraction of the tangential velocity (so momentum carries onto the next
 * route). A polarity flip uses the stronger launch speed.
 */
export function detachImpulse(
    up: Vec3,
    tangentVel: Vec3,
    launchSpeed: number,
    tangentPreserve = ADHESION_TANGENT_PRESERVE,
): Vec3 {
    const u = vnorm(up);
    // Strip any inward (toward-wall) component from the preserved tangent.
    const along = vdot(tangentVel, u);
    const tangent = vsub(tangentVel, vscale(u, along));
    return vadd(vscale(u, launchSpeed), vscale(tangent, tangentPreserve));
}

/**
 * Decide whether a soft condition should release the adhesion. Hard triggers
 * (jump, polarity flip, flying, death, teleport) are handled by the caller; this
 * covers attraction loss, lost surface, and the failsafe — all gated by the
 * minimum-attach time and the detach grace period.
 *
 * @returns a detach reason string, or null to stay attached.
 */
export function evaluateSoftDetach(
    state: AdhesionState,
    now: number,
    currentStrength: number,
    hasSurface: boolean,
): string | null {
    if (now - state.attachedAt < ADHESION_MIN_ATTACH_MS) return null;

    // Failsafe: no valid surface seen for too long, regardless of grace.
    if (now - state.lastValidSurfaceAt > ADHESION_FAILSAFE_MS) return 'failsafe';

    const weak = currentStrength < ADHESION_DETACH_STRENGTH;
    if ((weak || !hasSurface) && now - state.lastValidSurfaceAt > ADHESION_DETACH_GRACE_MS) {
        return weak ? 'attraction-lost' : 'surface-ended';
    }
    return null;
}
