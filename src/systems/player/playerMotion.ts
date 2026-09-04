// The player's F-key kit: one button, resolved by the polarity rule.
//
//   - attached to a wall              → jump off (the ordinary detach)
//   - aiming at an OPPOSITE magnet face within reach → MAGNETIC DASH onto it
//   - an OPPOSITE-polarity boss in reach              → MAGNETIC DASH into it, arming a MAGNET SLAM
//   - a SAME-polarity boss close by                   → REPEL LEAP away from it
//   - otherwise                                       → DODGE ROLL (backstep with no input)
//
// Same repels, opposite attracts: the same rule the whole Warden fight runs on,
// so the kit never needs a tutorial of its own. Every move carries a short
// invulnerability window (the roll's opens a few frames in, like a Souls roll),
// read by the damage gate through `motionStatus`.
//
// Pure: plain vectors, no THREE, no world imports. Player.tsx owns the body and
// integrates the velocities this module asks for.

export interface MotionVec3 {
    x: number;
    y: number;
    z: number;
}

export type MotionKind = 'none' | 'roll' | 'dash' | 'leap';

export interface MotionState {
    action: MotionKind;
    /** Seconds into the current action. */
    time: number;
    /** Seconds the current action lasts. */
    duration: number;
    /** Unit direction of a roll/leap (horizontal) or a dash (3D). */
    dir: MotionVec3;
    /** Dash destination (feet position), null otherwise. */
    target: MotionVec3 | null;
    /** What a dash lands on. */
    onto: 'surface' | 'boss' | null;
    cooldowns: { roll: number; dash: number; leap: number };
    /** Seconds left in which the next melee hit is a Magnet Slam. */
    surgeRemaining: number;
    /** Seconds left before a dash may reach the boss again (prevents slam spam). */
    slamLockout: number;
}

export interface DodgeBoss {
    /** Body centre. */
    x: number;
    y: number;
    z: number;
    polarity: number;
    /** Half width of the body (the dash stops short of it). */
    radius: number;
    /** Whether the boss can currently take a hit (the dash is offered only then). */
    vulnerable: boolean;
}

export interface DodgeMagnet {
    /** Point on the aimed magnet face. */
    point: MotionVec3;
    /** Outward face normal. */
    normal: MotionVec3;
    polarity: number;
    distance: number;
}

export interface DodgeContext {
    attached: boolean;
    grounded: boolean;
    flying: boolean;
    /** World-space horizontal unit input direction, or null when no movement key is held. */
    moveDir: MotionVec3 | null;
    /** Horizontal unit look direction. */
    forward: MotionVec3;
    /** The player's chosen polarity, 0 without Polarity Boots. */
    playerPolarity: number;
    /** Feet position. */
    position: MotionVec3;
    bodyHeight: number;
    bodyWidth: number;
    boss: DodgeBoss | null;
    aimedMagnet: DodgeMagnet | null;
}

export type DodgeResolution =
    | { kind: 'roll'; dir: MotionVec3; duration: number; backstep: boolean }
    | { kind: 'dash'; target: MotionVec3; dir: MotionVec3; duration: number; onto: 'surface' | 'boss' }
    | { kind: 'leap'; dir: MotionVec3 }
    | { kind: 'jump-off' }
    | { kind: 'none'; reason: 'busy' | 'cooldown' | 'flying' };

// --- Tuning -----------------------------------------------------------------

/** Roll length (seconds) and its invulnerability window inside it. */
export const ROLL_DURATION = 0.6;
export const ROLL_IFRAME_START = 0.03;
export const ROLL_IFRAME_END = 0.42;
/** Peak roll speed (blocks/s); the curve eases out so a roll covers ~4.4 blocks. */
export const ROLL_PEAK_SPEED = 11;
/** A backstep (no direction held) is shorter and quicker. */
export const BACKSTEP_DURATION = 0.42;
export const BACKSTEP_PEAK_SPEED = 9;
export const ROLL_COOLDOWN = 0.75;

/** Magnetic dash: reach (blocks), travel speed, and the longest it may last. */
export const DASH_RANGE = 14;
export const DASH_SPEED = 26;
export const DASH_MAX_DURATION = 0.6;
export const DASH_COOLDOWN = 1.2;
/** How far from a face the body centre stops (pressed against it, inside snap range). */
export const DASH_FACE_STANDOFF = 0.12;
/** Gap left between the body and the boss at the end of a dash. */
export const DASH_BOSS_GAP = 0.7;

/** Repel leap: reach of the boss field that kicks you out, and the launch. */
export const LEAP_RANGE = 10;
export const LEAP_SPEED = 14;
export const LEAP_UP = 7.5;
export const LEAP_IFRAMES = 0.35;
export const LEAP_DURATION = 0.35;
export const LEAP_COOLDOWN = 1.0;

/** Seconds a Magnet Slam stays armed after a dash reaches the boss. */
export const SURGE_DURATION = 2.5;
/** Seconds after a slam before another boss dash can arm one. */
export const SLAM_LOCKOUT = 1.5;

export function createMotionState(): MotionState {
    return {
        action: 'none',
        time: 0,
        duration: 0,
        dir: { x: 0, y: 0, z: 1 },
        target: null,
        onto: null,
        cooldowns: { roll: 0, dash: 0, leap: 0 },
        surgeRemaining: 0,
        slamLockout: 0,
    };
}

const norm = (v: MotionVec3): MotionVec3 => {
    const l = Math.hypot(v.x, v.y, v.z);
    return l < 1e-9 ? { x: 0, y: 0, z: 0 } : { x: v.x / l, y: v.y / l, z: v.z / l };
};

const relation = (playerPolarity: number, other: number): 'same' | 'opposite' | 'neutral' => {
    if (!Number.isFinite(playerPolarity) || playerPolarity === 0 || other === 0) return 'neutral';
    return Math.sign(playerPolarity) === Math.sign(other) ? 'same' : 'opposite';
};

/** Speed along a roll at `t` seconds: a sharp start easing to a stop. */
export function rollSpeedAt(t: number, duration: number, peak: number): number {
    if (duration <= 0 || t < 0 || t >= duration) return 0;
    const u = t / duration;
    return peak * (1 - u * u);
}

/** Where a dash onto a magnet face puts the feet: body pressed against the face. */
export function dashSurfaceTarget(magnet: DodgeMagnet, bodyWidth: number, bodyHeight: number): MotionVec3 {
    const n = magnet.normal;
    const extent = Math.abs(n.y) > 0.5 ? bodyHeight * 0.5 : bodyWidth * 0.5;
    const standoff = extent + DASH_FACE_STANDOFF;
    return {
        x: magnet.point.x + n.x * standoff,
        y: magnet.point.y + n.y * standoff - bodyHeight * 0.5,
        z: magnet.point.z + n.z * standoff,
    };
}

/** Where a dash into the boss puts the feet: just outside its body, at its feet level. */
export function dashBossTarget(boss: DodgeBoss, from: MotionVec3, bodyWidth: number, bodyHeight: number): MotionVec3 {
    const dx = from.x - boss.x;
    const dz = from.z - boss.z;
    const d = Math.hypot(dx, dz) || 1;
    const stop = boss.radius + bodyWidth * 0.5 + DASH_BOSS_GAP;
    return {
        x: boss.x + (dx / d) * stop,
        y: boss.y - bodyHeight * 0.5,
        z: boss.z + (dz / d) * stop,
    };
}

/**
 * Resolve a press of F. Pure: returns the resolution and the next state
 * (unchanged when nothing happens). Player.tsx applies the physics.
 */
export function resolveDodge(state: MotionState, ctx: DodgeContext): { state: MotionState; result: DodgeResolution } {
    if (ctx.attached) return { state, result: { kind: 'jump-off' } };
    if (ctx.flying) return { state, result: { kind: 'none', reason: 'flying' } };
    if (state.action !== 'none') return { state, result: { kind: 'none', reason: 'busy' } };

    const cd = state.cooldowns;
    const boots = ctx.playerPolarity !== 0;

    // A magnet face in the crosshair that attracts: dash onto it.
    if (boots && ctx.aimedMagnet && ctx.aimedMagnet.distance <= DASH_RANGE
        && relation(ctx.playerPolarity, ctx.aimedMagnet.polarity) === 'opposite') {
        if (cd.dash > 0) return { state, result: { kind: 'none', reason: 'cooldown' } };
        const target = dashSurfaceTarget(ctx.aimedMagnet, ctx.bodyWidth, ctx.bodyHeight);
        return beginDash(state, ctx.position, target, 'surface');
    }

    if (boots && ctx.boss) {
        const dx = ctx.boss.x - ctx.position.x;
        const dy = ctx.boss.y - (ctx.position.y + ctx.bodyHeight * 0.5);
        const dz = ctx.boss.z - ctx.position.z;
        const distance = Math.hypot(dx, dy, dz);
        const rel = relation(ctx.playerPolarity, ctx.boss.polarity);
        // A dash into a shielded boss would only buy a wasted slam and a fall,
        // so the kit offers it only while a hit can land.
        if (rel === 'opposite' && ctx.boss.vulnerable && distance <= DASH_RANGE + ctx.boss.radius && state.slamLockout <= 0) {
            if (cd.dash > 0) return { state, result: { kind: 'none', reason: 'cooldown' } };
            const target = dashBossTarget(ctx.boss, ctx.position, ctx.bodyWidth, ctx.bodyHeight);
            return beginDash(state, ctx.position, target, 'boss');
        }
        if (rel === 'same' && distance <= LEAP_RANGE + ctx.boss.radius) {
            if (cd.leap > 0) return { state, result: { kind: 'none', reason: 'cooldown' } };
            const h = Math.hypot(dx, dz);
            const dir = h > 1e-6 ? { x: -dx / h, y: 0, z: -dz / h } : { x: -ctx.forward.x, y: 0, z: -ctx.forward.z };
            const next: MotionState = {
                ...state,
                action: 'leap',
                time: 0,
                duration: LEAP_DURATION,
                dir,
                target: null,
                onto: null,
                cooldowns: { ...cd, leap: LEAP_COOLDOWN },
            };
            return { state: next, result: { kind: 'leap', dir } };
        }
    }

    if (cd.roll > 0) return { state, result: { kind: 'none', reason: 'cooldown' } };
    const backstep = ctx.moveDir === null;
    const dir = backstep
        ? norm({ x: -ctx.forward.x, y: 0, z: -ctx.forward.z })
        : norm({ x: ctx.moveDir!.x, y: 0, z: ctx.moveDir!.z });
    const duration = backstep ? BACKSTEP_DURATION : ROLL_DURATION;
    const next: MotionState = {
        ...state,
        action: 'roll',
        time: 0,
        duration,
        dir,
        target: null,
        onto: null,
        cooldowns: { ...cd, roll: ROLL_COOLDOWN },
    };
    return { state: next, result: { kind: 'roll', dir, duration, backstep } };
}

function beginDash(state: MotionState, from: MotionVec3, target: MotionVec3, onto: 'surface' | 'boss'): { state: MotionState; result: DodgeResolution } {
    const delta = { x: target.x - from.x, y: target.y - from.y, z: target.z - from.z };
    const distance = Math.hypot(delta.x, delta.y, delta.z);
    const dir = norm(delta);
    const duration = Math.min(DASH_MAX_DURATION, Math.max(0.05, distance / DASH_SPEED));
    const next: MotionState = {
        ...state,
        action: 'dash',
        time: 0,
        duration,
        dir,
        target: { ...target },
        onto,
        cooldowns: { ...state.cooldowns, dash: DASH_COOLDOWN },
    };
    return { state: next, result: { kind: 'dash', target: { ...target }, dir, duration, onto } };
}

/** What F would do right now (for the HUD prompt); never mutates. */
export function previewDodge(state: MotionState, ctx: DodgeContext): DodgeResolution['kind'] {
    return resolveDodge(state, ctx).result.kind;
}

/** Advance timers; ends an action when its duration runs out. */
export function advanceMotion(state: MotionState, dt: number): MotionState {
    const step = Math.max(0, dt);
    const cooldowns = {
        roll: Math.max(0, state.cooldowns.roll - step),
        dash: Math.max(0, state.cooldowns.dash - step),
        leap: Math.max(0, state.cooldowns.leap - step),
    };
    const surgeRemaining = Math.max(0, state.surgeRemaining - step);
    const slamLockout = Math.max(0, state.slamLockout - step);
    if (state.action === 'none') return { ...state, cooldowns, surgeRemaining, slamLockout };
    const time = state.time + step;
    if (time >= state.duration) {
        return { ...state, action: 'none', time: 0, duration: 0, target: null, onto: null, cooldowns, surgeRemaining, slamLockout };
    }
    return { ...state, time, cooldowns, surgeRemaining, slamLockout };
}

/** Player.tsx ends a dash early when it arrives or is blocked. */
export function endMotion(state: MotionState): MotionState {
    if (state.action === 'none') return state;
    return { ...state, action: 'none', time: 0, duration: 0, target: null, onto: null };
}

/** A dash reached the boss: arm the Magnet Slam. */
export function armSurge(state: MotionState): MotionState {
    return { ...state, surgeRemaining: SURGE_DURATION };
}

/** Spend the armed slam on a hit; returns whether one was armed. */
export function consumeSurge(state: MotionState): { state: MotionState; slam: boolean } {
    if (state.surgeRemaining <= 0) return { state, slam: false };
    return { state: { ...state, surgeRemaining: 0, slamLockout: SLAM_LOCKOUT }, slam: true };
}

/** Horizontal velocity a roll asks for this tick (blocks/s). */
export function rollVelocity(state: MotionState): MotionVec3 {
    if (state.action !== 'roll') return { x: 0, y: 0, z: 0 };
    const backstep = state.duration < ROLL_DURATION - 1e-6;
    const speed = rollSpeedAt(state.time, state.duration, backstep ? BACKSTEP_PEAK_SPEED : ROLL_PEAK_SPEED);
    return { x: state.dir.x * speed, y: 0, z: state.dir.z * speed };
}

/** Whether the roll is in its tucked (fastest) half, for the animation. */
export function rollTuck(state: MotionState): number {
    if (state.action !== 'roll' || state.duration <= 0) return 0;
    const u = state.time / state.duration;
    return Math.sin(Math.min(1, u) * Math.PI);
}

export function isInvulnerable(state: MotionState): boolean {
    switch (state.action) {
        case 'roll': return state.time >= ROLL_IFRAME_START && state.time <= ROLL_IFRAME_END;
        case 'dash': return true;
        case 'leap': return state.time <= LEAP_IFRAMES;
        default: return false;
    }
}

/** Live status the damage gate, HUD and player model read each frame. */
export interface MotionStatus {
    action: MotionKind;
    invulnerable: boolean;
    surge: boolean;
    surgeFraction: number;
    /** 0..1 progress through the current action. */
    progress: number;
    /** Largest remaining cooldown fraction across the kit (for a cooldown ring). */
    cooldown: number;
    /** What F would do right now (set by Player.tsx from previewDodge). */
    prompt: DodgeResolution['kind'];
}

export const motionStatus: MotionStatus = {
    action: 'none',
    invulnerable: false,
    surge: false,
    surgeFraction: 0,
    progress: 0,
    cooldown: 0,
    prompt: 'roll',
};

/**
 * Requests from systems that cannot reach the kit state directly (the melee
 * controller spending an armed slam); the player physics honours them next tick.
 */
export const motionRequests = {
    consumeSurge: false,
};

export function writeMotionStatus(state: MotionState, prompt: DodgeResolution['kind'], target: MotionStatus = motionStatus): MotionStatus {
    target.action = state.action;
    target.invulnerable = isInvulnerable(state);
    target.surge = state.surgeRemaining > 0;
    target.surgeFraction = SURGE_DURATION > 0 ? state.surgeRemaining / SURGE_DURATION : 0;
    target.progress = state.duration > 0 ? Math.min(1, state.time / state.duration) : 0;
    target.cooldown = Math.max(
        state.cooldowns.roll / ROLL_COOLDOWN,
        state.cooldowns.dash / DASH_COOLDOWN,
        state.cooldowns.leap / LEAP_COOLDOWN,
    );
    target.prompt = prompt;
    return target;
}
