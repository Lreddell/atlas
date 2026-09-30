// Third-person body motion helpers (PlayerModel.tsx). Pure and presentation
// only: gameplay reads none of this.
//
//  - The body turns after the aim instead of snapping to it. Standing still,
//    the head looks around on its own and the body only follows once the neck
//    runs out of reach, shuffling its feet as it turns. On the move it lines up
//    with the aim, angled toward a strafe so the legs walk along the path.
//  - A gait whose knees lift through the forward swing and push off behind.
//  - Critically damped springs to blend between poses, so a new pose eases in
//    as well as out (plain exponential smoothing starts every change at full speed).

const TAU = Math.PI * 2;

export const wrapAngle = (a: number): number => {
    if (!Number.isFinite(a)) return 0;
    return a - TAU * Math.floor((a + Math.PI) / TAU);
};

/** How far the head turns before the body has to follow (radians). */
export const NECK_REACH = 0.85;
/** Most a strafe turns the hips off the aim (radians). */
export const STRAFE_TURN = 0.7;

export interface BodyTurn {
    yaw: number;
    hasYaw: boolean;
    /** Standing: the body is stepping round to catch up with the head. */
    catching: boolean;
    /** Advances while the body turns on the spot; drives the foot shuffle. */
    shufflePhase: number;
    /** 0..1, how much the feet are shuffling right now. */
    shuffle: number;
}

export const createBodyTurn = (): BodyTurn => ({ yaw: 0, hasYaw: false, catching: false, shufflePhase: 0, shuffle: 0 });

export interface BodyTurnInput {
    dt: number;
    /** Where the body means to face (the aim, or the free view's walk facing). */
    aimYaw: number;
    /** Horizontal velocity (blocks/s). */
    vx: number;
    vz: number;
    /** Snap to the aim (wall walking, rolls, dashes: the body is driven directly). */
    locked: boolean;
}

/** Yaw of a horizontal velocity in the same convention as the aim (0 faces -Z). */
export const velocityYaw = (vx: number, vz: number): number => Math.atan2(-vx, -vz);

/**
 * Hip offset from the aim for walking in direction `moveYaw`: toward a strafe,
 * mirrored when backpedalling so the body never turns around to walk backwards.
 */
export function strafeOffset(aimYaw: number, moveYaw: number): number {
    let rel = wrapAngle(moveYaw - aimYaw);
    if (Math.abs(rel) > Math.PI / 2) rel = wrapAngle(rel - Math.PI);
    return Math.max(-STRAFE_TURN, Math.min(STRAFE_TURN, rel));
}

export function stepBodyTurn(state: BodyTurn, input: BodyTurnInput): BodyTurn {
    const dt = Number.isFinite(input.dt) ? Math.min(Math.max(input.dt, 0), 0.1) : 0;
    const aim = wrapAngle(input.aimYaw);
    if (!state.hasYaw || input.locked) {
        state.yaw = aim;
        state.hasYaw = true;
        state.catching = false;
        state.shuffle = 0;
        return state;
    }
    const speed = Math.hypot(input.vx, input.vz);
    const before = state.yaw;
    if (speed > 0.6) {
        // Walking: line up with the aim, hips angled into a strafe.
        state.catching = false;
        const target = aim + strafeOffset(aim, velocityYaw(input.vx, input.vz)) * Math.min(1, (speed - 0.6) / 1.5);
        state.yaw = wrapAngle(state.yaw + wrapAngle(target - state.yaw) * (1 - Math.exp(-10 * dt)));
    } else {
        // Standing: the head turns first; once the neck runs out of reach the
        // body steps round until the head is only a little turned, then holds.
        const lag = wrapAngle(aim - state.yaw);
        if (Math.abs(lag) > NECK_REACH) state.catching = true;
        if (state.catching) {
            const target = aim - Math.sign(lag) * (NECK_REACH - 0.45);
            state.yaw = wrapAngle(state.yaw + wrapAngle(target - state.yaw) * (1 - Math.exp(-8 * dt)));
            if (Math.abs(wrapAngle(aim - state.yaw)) < NECK_REACH - 0.38) state.catching = false;
        }
    }
    const turnRate = dt > 0 ? Math.abs(wrapAngle(state.yaw - before)) / dt : 0;
    const shuffling = speed <= 0.6 ? Math.min(1, turnRate / 2.5) : 0;
    state.shuffle += (shuffling - state.shuffle) * (1 - Math.exp(-14 * dt));
    state.shufflePhase += turnRate * dt * 3.2;
    return state;
}

/**
 * Knee flex (negative bends the shin back) for a leg whose hip angle is
 * sin(phase) * amplitude: it lifts through the forward swing (cos > 0) and
 * bends a little as it pushes off behind; straight as the heel strikes.
 */
export function gaitKnee(phase: number, amplitude: number): number {
    const swing = Math.max(0, Math.cos(phase));
    const pushOff = Math.max(0, -Math.sin(phase));
    return -(swing * swing * 1.15 + pushOff * 0.35) * amplitude;
}

/**
 * Critically damped spring from `value` (with `velocity`) toward `target`.
 * `rate` matches the old exponential blend rates in how fast a pose settles.
 * Substepped, so it is stable at any frame time. Returns [value, velocity].
 */
export function springToward(value: number, velocity: number, target: number, rate: number, dt: number): [number, number] {
    let x = value;
    let v = velocity;
    const omega = rate * 2.1;
    let remaining = Number.isFinite(dt) ? Math.min(Math.max(dt, 0), 0.1) : 0;
    while (remaining > 1e-6) {
        const h = Math.min(remaining, 1 / 240);
        v += (omega * omega * (target - x) - 2 * omega * v) * h;
        x += v * h;
        remaining -= h;
    }
    return [x, v];
}

/**
 * springToward over every key of a pose, in place and without allocating (it
 * runs every frame): `live` moves toward `target`, `velocity` carries the motion.
 */
export function springPose<K extends string>(
    live: Record<K, number>, velocity: Record<K, number>, target: Readonly<Record<K, number>>,
    keys: readonly K[], rate: number, dt: number,
): void {
    const omega = rate * 2.1;
    let remaining = Number.isFinite(dt) ? Math.min(Math.max(dt, 0), 0.1) : 0;
    while (remaining > 1e-6) {
        const h = Math.min(remaining, 1 / 240);
        const pull = omega * omega * h;
        const drag = 2 * omega * h;
        for (const key of keys) {
            const v = velocity[key] + pull * (target[key] - live[key]) - drag * velocity[key];
            velocity[key] = v;
            live[key] += v * h;
        }
        remaining -= h;
    }
}
