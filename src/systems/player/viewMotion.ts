// The body motion the first-person view feels: the walking step cycle and the
// landing dip. One shared state, advanced once per frame by Player, so the
// camera's head bob and the viewmodel's hand bob stay in the same step.
//
// Pure presentation: nothing here feeds physics, collision or combat.

/** Radians of step phase per block walked: one full cycle (two footfalls) every ~3.3 blocks. */
export const STEP_PHASE_PER_BLOCK = 1.9;

export interface StepCycle {
    /** Step phase; each half turn is one footfall. */
    phase: number;
    /** How much of the walking bob applies, 0 standing .. 1 at walking pace (eased). */
    amount: number;
    /** Eased sprint and sneak weights, 0..1. */
    sprint: number;
    sneak: number;
    /** Landing dip: a spring pulled down by the impact, in blocks (<= 0). */
    landY: number;
    landV: number;
    wasGrounded: boolean;
    /** Fastest fall speed since leaving the ground, blocks/s. */
    fallSpeed: number;
    /** Vertical speed, eased (the viewmodel leans on it while airborne). */
    airVelocity: number;
}

export const createStepCycle = (): StepCycle => ({
    phase: 0, amount: 0, sprint: 0, sneak: 0, landY: 0, landV: 0,
    wasGrounded: true, fallSpeed: 0, airVelocity: 0,
});

/** The shared step cycle Player advances and HeldItem reads. */
export const viewMotion = createStepCycle();

export interface StepInput {
    dt: number;
    /** Horizontal speed, blocks/s. */
    speed: number;
    /** Walking speed, blocks/s: the bob reaches full strength here. */
    walkSpeed: number;
    grounded: boolean;
    verticalSpeed: number;
    sprinting: boolean;
    sneaking: boolean;
    /** Swimming or climbing: no footfalls and no landings. */
    suspended: boolean;
}

const ease = (current: number, target: number, rate: number, dt: number) =>
    current + (target - current) * (1 - Math.exp(-rate * dt));

/**
 * Advances a critically-ish damped spring toward 0 in small steps, so a long
 * frame never makes it explode. Returns nothing; writes position and velocity.
 */
function settleSpring(state: StepCycle, dt: number, stiffness: number, damping: number): void {
    let remaining = dt;
    while (remaining > 1e-6) {
        const h = Math.min(remaining, 1 / 120);
        state.landV += (-stiffness * state.landY - damping * state.landV) * h;
        state.landY += state.landV * h;
        remaining -= h;
    }
}

export function advanceStepCycle(state: StepCycle, input: StepInput): void {
    const dt = Number.isFinite(input.dt) ? Math.min(Math.max(0, input.dt), 0.1) : 0;
    const onGround = input.grounded && !input.suspended;
    const pace = onGround ? Math.min(1.5, input.speed / Math.max(0.1, input.walkSpeed)) : 0;
    // The step only advances while feet are down; a still player finishes the
    // current step (the bob eases out rather than freezing mid-stride).
    if (onGround) state.phase += input.speed * dt * STEP_PHASE_PER_BLOCK;
    state.amount = ease(state.amount, pace > 0.12 ? Math.min(1, pace) : 0, 7, dt);
    state.sprint = ease(state.sprint, input.sprinting && pace > 0.5 ? 1 : 0, 6, dt);
    state.sneak = ease(state.sneak, input.sneaking ? 1 : 0, 8, dt);
    state.airVelocity = ease(state.airVelocity, onGround ? 0 : input.verticalSpeed, 10, dt);

    // Landing: the harder the fall, the deeper the dip, then a slightly springy recovery.
    if (!onGround && !input.suspended) state.fallSpeed = Math.max(state.fallSpeed, -input.verticalSpeed);
    if (onGround && !state.wasGrounded) {
        const impact = Math.min(1, state.fallSpeed / 20);
        if (impact > 0.15) state.landV -= 1.3 * impact;
        state.fallSpeed = 0;
    }
    if (input.suspended) state.fallSpeed = 0;
    state.wasGrounded = onGround || input.suspended;
    settleSpring(state, dt, 170, 15);
}

export interface CameraBob {
    /** Along the camera's up (blocks). */
    up: number;
    /** Along the camera's right (blocks). */
    side: number;
    /** Roll about the view axis (radians). */
    roll: number;
}

/**
 * The head bob: a small figure-eight, one dip per footfall and one sway per
 * stride, a touch stronger when sprinting and calmer when sneaking; plus the
 * landing dip. All zero when view bobbing is off.
 */
export function cameraBob(state: StepCycle, enabled: boolean, out: CameraBob): CameraBob {
    if (!enabled) {
        out.up = 0; out.side = 0; out.roll = 0;
        return out;
    }
    const strength = state.amount * (1 + 0.45 * state.sprint) * (1 - 0.5 * state.sneak);
    // landY bottoms out near -0.05 on a hard fall: a dip of about 6.5 cm for the
    // eye, about 2.5 cm after an ordinary jump.
    out.up = -Math.abs(Math.sin(state.phase)) * 0.05 * strength + state.landY * 1.3;
    out.side = Math.sin(state.phase) * 0.028 * strength;
    out.roll = Math.sin(state.phase) * 0.006 * strength;
    return out;
}
