import type { StepCycle } from './viewMotion';

// Procedural motion for the first-person hand and held item, layered on top of
// its rest pose (camera space: +X right, +Y up, -Z forward).
//
// - Walking bob from the shared step cycle. With view bobbing on, the camera
//   already bobs and the hand only lags a little behind it; with it off, the
//   hand carries the whole bob itself.
// - Look sway: turning drags the item a little behind the view on a soft spring.
// - Airborne lean and the landing dip.
// - Equip: switching items raises the new one from below.
// - Sprint and sneak carry poses; idle breathing when standing still.
// - A mining chop with a wind-up, a fast strike and an eased recovery, and a
//   hand-to-mouth eating motion with small bites.
//
// Pure: callers own the state and the clock, so it is testable and pauses with
// the game.

export interface ViewmodelState {
    swayX: number;
    swayY: number;
    swayVX: number;
    swayVY: number;
    /** 0 just switched (item held low) .. 1 fully raised. */
    equip: number;
    equipKey: unknown;
    hasEquipKey: boolean;
    eat: number;
    lastYaw: number;
    lastPitch: number;
    hasLook: boolean;
}

export const createViewmodelState = (): ViewmodelState => ({
    swayX: 0, swayY: 0, swayVX: 0, swayVY: 0,
    equip: 1, equipKey: undefined, hasEquipKey: false,
    eat: 0, lastYaw: 0, lastPitch: 0, hasLook: false,
});

export interface ViewmodelFrame {
    dt: number;
    /** Render clock, seconds (breathing and bites). */
    time: number;
    /** Camera look angles, radians. */
    yaw: number;
    pitch: number;
    /** Identity of the held item; a change raises the new one. */
    itemKey: unknown;
    eating: boolean;
    /** Progress 0..1 through the current mining swing, or null when not mining. */
    swing: number | null;
    /** The camera bobs too (view bobbing on). */
    cameraBobbing: boolean;
}

export interface ViewmodelPose {
    x: number; y: number; z: number;
    rx: number; ry: number; rz: number;
}

export const createViewmodelPose = (): ViewmodelPose => ({ x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 });

/** Seconds to raise a newly selected item. */
export const EQUIP_SECONDS = 0.24;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const easeOutQuad = (t: number) => 1 - (1 - t) * (1 - t);
const easeInQuad = (t: number) => t * t;
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const easeOutBack = (t: number) => {
    const c = 1.4;
    return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};
const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * The mining chop over one swing (u = 0..1): draw back, strike through, ease
 * back to rest. 0 at both ends, so back-to-back swings flow into each other.
 * Negative is the wind-up (item raised), 1 is the bottom of the strike.
 */
export function chopCurve(u: number): number {
    const t = clamp(u, 0, 1);
    if (t < 0.3) return -0.3 * easeOutQuad(t / 0.3);
    if (t < 0.55) return -0.3 + 1.3 * easeInQuad((t - 0.3) / 0.25);
    return 1 - easeInOut((t - 0.55) / 0.45);
}

function springToward(position: number, velocity: number, target: number, dt: number, stiffness: number, damping: number): [number, number] {
    let p = position;
    let v = velocity;
    let remaining = dt;
    while (remaining > 1e-6) {
        const h = Math.min(remaining, 1 / 120);
        v += (stiffness * (target - p) - damping * v) * h;
        p += v * h;
        remaining -= h;
    }
    return [p, v];
}

export function stepViewmodel(state: ViewmodelState, step: StepCycle, frame: ViewmodelFrame, out: ViewmodelPose): ViewmodelPose {
    const dt = Number.isFinite(frame.dt) ? clamp(frame.dt, 0, 0.1) : 0;

    // --- Look sway: the item trails the turn, then settles.
    if (!state.hasLook || dt <= 0) {
        state.lastYaw = frame.yaw;
        state.lastPitch = frame.pitch;
        state.hasLook = true;
    }
    const yawRate = dt > 0 ? wrapAngle(frame.yaw - state.lastYaw) / dt : 0;
    const pitchRate = dt > 0 ? (frame.pitch - state.lastPitch) / dt : 0;
    state.lastYaw = frame.yaw;
    state.lastPitch = frame.pitch;
    const targetX = clamp(yawRate * 0.011, -0.07, 0.07);
    const targetY = clamp(-pitchRate * 0.011, -0.06, 0.06);
    [state.swayX, state.swayVX] = springToward(state.swayX, state.swayVX, targetX, dt, 90, 12);
    [state.swayY, state.swayVY] = springToward(state.swayY, state.swayVY, targetY, dt, 90, 12);

    // --- Equip: a new item comes up from below with a small overshoot.
    if (!state.hasEquipKey) {
        state.equipKey = frame.itemKey;
        state.hasEquipKey = true;
    } else if (frame.itemKey !== state.equipKey) {
        state.equipKey = frame.itemKey;
        state.equip = 0;
    }
    state.equip = Math.min(1, state.equip + dt / EQUIP_SECONDS);
    const raised = easeOutBack(state.equip);

    state.eat += ((frame.eating ? 1 : 0) - state.eat) * (1 - Math.exp(-12 * dt));

    // --- Walking bob.
    const walk = step.amount * (1 + 0.5 * step.sprint) * (1 - 0.4 * step.sneak);
    const stride = Math.sin(step.phase);
    const footfall = Math.abs(stride);
    let bobX: number;
    let bobY: number;
    if (frame.cameraBobbing) {
        // The view already dips each step; the hand just lags behind it.
        bobX = -stride * 0.01 * walk;
        bobY = footfall * 0.012 * walk;
    } else {
        bobX = stride * 0.022 * walk;
        bobY = -footfall * 0.026 * walk;
    }
    const idle = 1 - Math.min(1, step.amount);
    const breathe = Math.sin(frame.time * 1.7) * 0.005 * idle;

    const air = clamp(-step.airVelocity * 0.004, -0.035, 0.035);
    const land = step.landY;

    const chop = frame.swing === null ? 0 : chopCurve(frame.swing);
    const bite = Math.sin(frame.time * 22) * 0.016 * state.eat;

    out.x = bobX + state.swayX + 0.025 * step.sprint - 0.24 * state.eat + Math.sin(frame.time * 0.8) * 0.003 * idle;
    out.y = bobY + breathe + air + land * 0.8 + state.swayY
        - 0.045 * step.sprint - 0.025 * step.sneak
        - (1 - raised) * 0.5
        - chop * 0.16
        + 0.1 * state.eat + bite;
    out.z = -chop * 0.12 + 0.2 * state.eat;
    out.rx = land * 1.2 + (1 - raised) * 0.9 - chop * 0.9 - 0.22 * step.sprint - 0.35 * state.eat - state.swayY * 0.8;
    out.ry = state.swayX * 1.2 + chop * 0.25 + 0.55 * state.eat;
    out.rz = state.swayX * 0.8 + stride * 0.03 * walk * (frame.cameraBobbing ? -0.5 : 1) - 0.18 * step.sprint;
    return out;
}
