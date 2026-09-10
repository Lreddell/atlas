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

/** One physical eye position for camera placement, breath and fluid effects.
 * The magnetic body is stored as an upright collision box, whose centre stands
 * contactDistance from the wall. Its eyes extend along the surface normal.
 */
export function playerEyePosition(
    feet: RigVec3, eyeHeight: number, bodyHeight: number,
    wall: { active: boolean; normal: RigVec3; contactDistance: number },
): RigVec3 {
    if (!wall.active) return { x: feet.x, y: feet.y + eyeHeight, z: feet.z };
    const standoff = eyeHeight - wall.contactDistance;
    return {
        x: feet.x + wall.normal.x * standoff,
        y: feet.y + bodyHeight * 0.5 + wall.normal.y * standoff,
        z: feet.z + wall.normal.z * standoff,
    };
}

export type ViewMode = 'first' | 'third' | 'free';

/**
 * Both third-person views hang the camera on the same spring arm. They differ
 * only in what the BODY does: 'third' welds it to the camera, 'free' lets it
 * keep its own facing (see FREE_BODY_TURN_RATE).
 */
export const isThirdPerson = (mode: ViewMode): boolean => mode !== 'first';

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
    distance: 5.0,
    shoulder: 0.6,
    // Lifted enough that the body sits below the crosshair instead of across it,
    // so the character never covers what you are aiming at.
    height: 0.7,
    margin: 0.35,
    minDistance: 0.6,
    // Once a wall has pulled the arm in this close the body would fill the
    // frame and block the view, so it hides and the shot reads as first person.
    hideModelBelow: 1.7,
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
    // Collision outranks the preferred minimum. Otherwise a nearby wall pushes
    // the camera THROUGH itself by forcing the arm back out to minDistance.
    if (hit !== null) arm = Math.max(0, Math.min(rig.distance, hit - rig.margin));
    const camera: RigVec3 = { x: pivot.x + back.x * arm, y: pivot.y + back.y * arm, z: pivot.z + back.z * arm };
    return { camera, pivot, armLength: arm, showModel: arm >= rig.hideModelBelow };
}

/** Radial spring state, local to one player. Reset when leaving third person. */
export interface CameraSpring { distance: number; offset: number }
export function smoothThirdPersonCamera(
    eye: RigVec3, dir: RigVec3, right: RigVec3, up: RigVec3,
    sweep: RigSweep, spring: CameraSpring, dt: number, extend = true,
): RigPlacement {
    const k = 1 - Math.exp(-9 * Math.max(0, Math.min(dt, 0.1)));
    spring.offset += ((extend ? 1 : 0) - spring.offset) * k;
    if (!extend && spring.offset < 0.002) spring.offset = 0;
    const rig = { ...THIRD_PERSON_RIG, shoulder: THIRD_PERSON_RIG.shoulder * spring.offset, height: THIRD_PERSON_RIG.height * spring.offset };
    const safe = placeThirdPersonCamera(eye, dir, right, up, sweep, rig);
    // Never ease through geometry. Recover the distance smoothly when space opens.
    spring.distance = Math.min(safe.armLength, spring.distance + ((extend ? safe.armLength : 0) - spring.distance) * k);
    if (!extend && spring.distance < 0.01) spring.distance = 0;
    return { ...safe, armLength: spring.distance, showModel: spring.distance >= THIRD_PERSON_RIG.hideModelBelow, camera: {
        x: safe.pivot.x - dir.x * spring.distance,
        y: safe.pivot.y - dir.y * spring.distance,
        z: safe.pivot.z - dir.z * spring.distance,
    } };
}

/** The viewmodel fades only in the final stretch to/from the eye. */
export function firstPersonHandOpacity(camera: RigVec3, eye: RigVec3): number {
    const distance = Math.hypot(camera.x - eye.x, camera.y - eye.y, camera.z - eye.z);
    const t = Math.max(0, Math.min(1, (distance - 0.05) / 0.6));
    return 1 - t * t * (3 - 2 * t);
}

/** Fade near the body's capsule, including when the body stands on a wall. */
export function playerModelOpacity(camera: RigVec3, feet: RigVec3, up: RigVec3): number {
    const x = camera.x - feet.x, y = camera.y - feet.y, z = camera.z - feet.z;
    const along = Math.max(0.25, Math.min(1.8, x * up.x + y * up.y + z * up.z));
    const distance = Math.hypot(x - up.x * along, y - up.y * along, z - up.z * along);
    const t = Math.max(0, Math.min(1, (distance - 0.45) / 0.85));
    return t * t * (3 - 2 * t);
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

// --- Free third person (F5) -------------------------------------------------
// The 'free' view unbolts the body from the camera. The camera still orbits the
// eye on the same spring arm, but a full 360 deg of it is usable because the
// body no longer spins to match: WASD picks one of eight headings around the
// camera and the body turns onto that heading, leaving the camera where it was
// pointed. While an action plays the body swings back onto the aim, so a swing,
// a placed block or a mined face still reads as coming from the character.

/** How fast the body swings onto a new walk heading (exponential, per second). */
export const FREE_BODY_TURN_RATE = 11;
/** Faster, for the swing back onto the aim while acting: an action must read immediately. */
export const FREE_BODY_AIM_TURN_RATE = 26;

/** Shortest signed difference from `from` to `to`, in (-PI, PI]. */
export function angleDelta(from: number, to: number): number {
    const d = to - from;
    return Math.atan2(Math.sin(d), Math.cos(d));
}

/** Frame-rate independent ease of an angle onto a target the short way round. */
export function easeAngle(current: number, target: number, rate: number, dt: number): number {
    return current + angleDelta(current, target) * (1 - Math.exp(-rate * Math.max(0, Math.min(dt, 0.1))));
}

/**
 * The heading WASD walks in for a camera at `cameraYaw`: the eight directions
 * around the camera, matching how the movement input is rotated into the world.
 * Null when nothing is held, which is the body holding its current facing.
 */
export function walkYaw(cameraYaw: number, forward: number, right: number): number | null {
    if (forward === 0 && right === 0) return null;
    return cameraYaw + Math.atan2(-right, forward);
}

/** Live rig state shared with everything that needs the eye instead of the camera. */
export interface ViewRigState {
    mode: ViewMode;
    /** Whether the third-person placement is in effect this frame. */
    third: boolean;
    /**
     * The camera is parked away from the player (F7), so the crosshair no longer
     * means anything: aiming casts straight out of the eye instead of through it.
     */
    detached: boolean;
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
    detached: false,
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
    /** Body yaw (radians) and look pitch. */
    yaw: number;
    pitch: number;
    /**
     * Where the player is AIMING (the camera's yaw). Equal to `yaw` except in
     * the free view, where the body keeps its own facing and only the head
     * turns the rest of the way toward the aim.
     */
    lookYaw: number;
    /** Velocity (blocks/s). */
    vx: number;
    vy: number;
    vz: number;
    grounded: boolean;
    inWater: boolean;
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
    lookYaw: 0,
    vx: 0, vy: 0, vz: 0,
    grounded: false,
    inWater: false,
    sneak: false,
    sprint: false,
    attached: false,
    up: { x: 0, y: 1, z: 0 },
    wallForward: { x: 0, y: 0, z: -1 },
    wallRight: { x: 1, y: 0, z: 0 },
    polarity: 0,
    time: 0,
};

// --- The detached camera (F7) -----------------------------------------------
// A tripod. The first press lifts the camera off the player and flies it into
// place with the movement keys while the body stands still; the second bolts it
// down and hands the player back, framed by that fixed shot; the third puts the
// camera back on the player, in whatever view mode it left.

export type DetachedCameraStage = 'off' | 'placing' | 'locked';

export interface DetachedCameraState {
    stage: DetachedCameraStage;
    /** Where the tripod stands. */
    x: number;
    y: number;
    z: number;
    /** Its look, in the same world-up yaw/pitch frame as the player camera. */
    yaw: number;
    pitch: number;
}

export const detachedCamera: DetachedCameraState = {
    stage: 'off',
    x: 0, y: 0, z: 0,
    yaw: 0, pitch: 0,
};

/** The stage F7 moves to from `stage`. */
export const nextDetachedStage = (stage: DetachedCameraStage): DetachedCameraStage =>
    stage === 'off' ? 'placing' : stage === 'placing' ? 'locked' : 'off';

/** Put the camera back on the player (leaving a world, a cutscene taking over). */
export const releaseDetachedCamera = (): void => {
    detachedCamera.stage = 'off';
    // Cleared here too: the player rig rewrites it every frame, but it must not
    // stay set for the frames between an unmount and the next rig update.
    viewRig.detached = false;
};

/**
 * Whether the free body rule (F5) is actually in effect.
 *
 * The free view is defined against a camera that orbits the player: the body
 * turns onto its own heading and *leaves the camera pointed where it was*. A
 * tripod has no such camera — it stands off in the world, framing a shot — so
 * while F7 owns the camera the body goes back to following the player's look,
 * exactly like the welded views, and the walk keys mean what they mean there.
 *
 * The view MODE is deliberately left alone, so putting the tripod away returns
 * the player to the free view they came from.
 */
export const freeBodyActive = (): boolean =>
    viewRig.mode === 'free' && detachedCamera.stage === 'off';

/** F7 while the shot is being framed: the walk keys fly the tripod, not the body. */
export const framingDetachedShot = (): boolean => detachedCamera.stage === 'placing';

/** Flight speed of the camera while it is being placed (blocks/s), and its sprint. */
export const DETACHED_FLY_SPEED = 9;
export const DETACHED_FLY_SPRINT = 26;
/** The tripod pitches as far as the player camera does. */
export const DETACHED_MAX_PITCH = 1.55;

/**
 * One step of free flight for the detached camera: forward/right along its own
 * look (so holding forward while pitched up climbs) and `up` along world up.
 * Normalised, so a diagonal is not faster than a straight line.
 */
export function detachedFlyStep(
    yaw: number, pitch: number,
    forward: number, right: number, up: number,
    speed: number, dt: number,
): RigVec3 {
    const basis = lookBasis(yaw, pitch);
    const x = basis.forward.x * forward + basis.right.x * right;
    const y = basis.forward.y * forward + up;
    const z = basis.forward.z * forward + basis.right.z * right;
    const length = Math.hypot(x, y, z);
    if (length < 1e-6) return { x: 0, y: 0, z: 0 };
    const k = (speed * Math.max(0, dt)) / length;
    return { x: x * k, y: y * k, z: z * k };
}
