// The view rig: where the player's EYE is versus where the CAMERA is.
//
// In first person they coincide. In third person the camera hangs on a spring
// arm behind and over the shoulder of the eye, pulled in by any voxel in the
// way (Godot's SpringArm3D / UE's spring arm idea: sweep from the pivot back
// along the arm and stop short of the first hit). Every gameplay ray (block
// targeting, melee, the crossbow, the dash aim) starts from the eye, aimed at
// the point under the crosshair, so aiming behaves identically in both modes.
//
// Pure geometry here; Player.tsx feeds it the camera basis and a voxel sweep.

export interface RigVec3 {
    x: number;
    y: number;
    z: number;
}

export type ViewMode = 'first' | 'third';

export interface ThirdPersonRig {
    /** Arm length (blocks) behind the pivot. */
    distance: number;
    /** Sideways pivot offset (blocks, positive = over the right shoulder). */
    shoulder: number;
    /** Pivot lift above the eye (blocks). */
    height: number;
    /** Gap kept between the camera and any voxel the arm hits. */
    margin: number;
    /** The arm never collapses below this. */
    minDistance: number;
    /** Hide the player model once the arm is shorter than this (the camera is inside the body). */
    hideModelBelow: number;
}

export const THIRD_PERSON_RIG: ThirdPersonRig = {
    distance: 4.6,
    shoulder: 0.55,
    height: 0.4,
    margin: 0.35,
    minDistance: 0.6,
    hideModelBelow: 0.9,
};

export interface RigPlacement {
    camera: RigVec3;
    pivot: RigVec3;
    armLength: number;
    showModel: boolean;
}

/**
 * A voxel sweep: distance along the (unit) direction to the first solid, or
 * null when the way is clear up to `maxDist`.
 */
export type RigSweep = (ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist: number) => number | null;

/**
 * Place the third-person camera for an eye looking along `dir` with the given
 * camera `right` and `up` basis vectors (unit).
 */
export function placeThirdPersonCamera(
    eye: RigVec3,
    dir: RigVec3,
    right: RigVec3,
    up: RigVec3,
    sweep: RigSweep,
    rig: ThirdPersonRig = THIRD_PERSON_RIG,
): RigPlacement {
    // 1. Slide the pivot out over the shoulder, stopping short of any wall.
    const offset = {
        x: right.x * rig.shoulder + up.x * rig.height,
        y: right.y * rig.shoulder + up.y * rig.height,
        z: right.z * rig.shoulder + up.z * rig.height,
    };
    const offsetLength = Math.hypot(offset.x, offset.y, offset.z);
    let pivot: RigVec3 = { x: eye.x + offset.x, y: eye.y + offset.y, z: eye.z + offset.z };
    if (offsetLength > 1e-6) {
        const ux = offset.x / offsetLength, uy = offset.y / offsetLength, uz = offset.z / offsetLength;
        const hit = sweep(eye.x, eye.y, eye.z, ux, uy, uz, offsetLength + rig.margin);
        if (hit !== null) {
            const reach = Math.max(0, Math.min(offsetLength, hit - rig.margin));
            pivot = { x: eye.x + ux * reach, y: eye.y + uy * reach, z: eye.z + uz * reach };
        }
    }
    // 2. Swing the arm back from the pivot along -dir.
    const back = { x: -dir.x, y: -dir.y, z: -dir.z };
    let arm = rig.distance;
    const hit = sweep(pivot.x, pivot.y, pivot.z, back.x, back.y, back.z, rig.distance + rig.margin);
    if (hit !== null) arm = Math.max(rig.minDistance, Math.min(rig.distance, hit - rig.margin));
    const camera: RigVec3 = { x: pivot.x + back.x * arm, y: pivot.y + back.y * arm, z: pivot.z + back.z * arm };
    return { camera, pivot, armLength: arm, showModel: arm >= rig.hideModelBelow };
}

/**
 * The gameplay aim ray for a camera that may sit away from the eye: aim at the
 * point under the crosshair (the camera ray's first hit, or a far point), and
 * cast from the eye toward it. In first person this is exactly the camera ray.
 */
export function aimRay(
    camera: RigVec3,
    eye: RigVec3,
    dir: RigVec3,
    sweep: RigSweep,
    farDistance = 64,
): { origin: RigVec3; dir: RigVec3 } {
    const same = Math.abs(camera.x - eye.x) < 1e-6 && Math.abs(camera.y - eye.y) < 1e-6 && Math.abs(camera.z - eye.z) < 1e-6;
    if (same) return { origin: { ...eye }, dir: { ...dir } };
    const hit = sweep(camera.x, camera.y, camera.z, dir.x, dir.y, dir.z, farDistance);
    const reach = hit !== null ? hit : farDistance;
    const point = { x: camera.x + dir.x * reach, y: camera.y + dir.y * reach, z: camera.z + dir.z * reach };
    const delta = { x: point.x - eye.x, y: point.y - eye.y, z: point.z - eye.z };
    const length = Math.hypot(delta.x, delta.y, delta.z);
    if (length < 1e-6) return { origin: { ...eye }, dir: { ...dir } };
    return { origin: { ...eye }, dir: { x: delta.x / length, y: delta.y / length, z: delta.z / length } };
}

/** Camera basis vectors from a world-up yaw/pitch look (three.js YXZ camera). */
export function lookBasis(yaw: number, pitch: number): { forward: RigVec3; right: RigVec3; up: RigVec3 } {
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const forward = { x: -sy * cp, y: sp, z: -cy * cp };
    const right = { x: cy, y: 0, z: -sy };
    const up = {
        x: right.y * forward.z - right.z * forward.y,
        y: right.z * forward.x - right.x * forward.z,
        z: right.x * forward.y - right.y * forward.x,
    };
    return { forward, right, up };
}

/** Live rig state shared with everything that needs the eye instead of the camera. */
export interface ViewRigState {
    mode: ViewMode;
    /** Whether the third-person placement is in effect this frame. */
    third: boolean;
    /** The player's eye (first-person camera position, before shake). */
    eye: RigVec3;
    /** Unit look direction. */
    dir: RigVec3;
    /** Where the camera actually sits this frame. */
    camera: RigVec3;
    armLength: number;
    showModel: boolean;
}

export const viewRig: ViewRigState = {
    mode: 'first',
    third: false,
    eye: { x: 0, y: 0, z: 0 },
    dir: { x: 0, y: 0, z: -1 },
    camera: { x: 0, y: 0, z: 0 },
    armLength: 0,
    showModel: false,
};

/** The player's body as the third-person model sees it, written every frame by the player physics. */
export interface PlayerPose {
    /** Feet position (render-interpolated). */
    x: number;
    y: number;
    z: number;
    /** Body yaw (radians, the look yaw) and look pitch. */
    yaw: number;
    pitch: number;
    /** Velocity (blocks/s). */
    vx: number;
    vy: number;
    vz: number;
    grounded: boolean;
    sneak: boolean;
    sprint: boolean;
    /** Latched to a magnet wall: the body's up is the wall normal. */
    attached: boolean;
    up: RigVec3;
    /** Wall-space basis while attached (forward/right on the wall plane). */
    wallForward: RigVec3;
    wallRight: RigVec3;
    /** The player's polarity (+1 / -1), 0 without boots. */
    polarity: number;
    /** Seconds of simulated time, for the idle animation. */
    time: number;
}

export const playerPose: PlayerPose = {
    x: 0, y: 0, z: 0,
    yaw: 0, pitch: 0,
    vx: 0, vy: 0, vz: 0,
    grounded: false,
    sneak: false,
    sprint: false,
    attached: false,
    up: { x: 0, y: 1, z: 0 },
    wallForward: { x: 0, y: 0, z: -1 },
    wallRight: { x: 1, y: 0, z: 0 },
    polarity: 0,
    time: 0,
};
