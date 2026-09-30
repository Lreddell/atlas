// How restless the aurora is, from moment to moment (sky/Aurora.tsx).
//
// A real display swells and fades over minutes, and now and then a substorm
// breaks out: within seconds the curtains brighten, grow taller, fringe pink
// at their feet and race along the sky, then die back over a minute or so
// into faint, slow arcs again. The level is 0.3 or so at its calmest, about
// 0.7 at its liveliest between storms, and up to about 1.6 at a storm's peak.

export interface AuroraActivity {
    /** Seconds the aurora has run (the calm swell's clock). */
    time: number;
    /** Seconds into the current substorm, or -1 between storms. */
    stormAge: number;
    /** How long the current substorm lasts (seconds). */
    stormLength: number;
    /** The level last computed. */
    level: number;
}

/** A substorm breaks out about once every this many seconds, on average. */
export const AURORA_STORM_GAP = 150;
/** Seconds a substorm takes to reach its peak. */
const STORM_RISE = 6;

export const createAuroraActivity = (): AuroraActivity => ({ time: 0, stormAge: -1, stormLength: 0, level: 0.5 });

/** The sky's aurora (DayNightCycle steps it once a frame). */
export const auroraActivity = createAuroraActivity();

/** The calm swell: two slow waves that rarely line up, 0.3..0.7. */
function calm(time: number): number {
    const a = 0.5 + 0.5 * Math.sin(time / 47);
    const b = 0.5 + 0.5 * Math.sin(time / 113 + 1.3);
    return 0.3 + 0.4 * a * (0.4 + 0.6 * b);
}

/** How strong a substorm is at `age` seconds into its `length`: a quick rise, a long fall. */
export function stormEnvelope(age: number, length: number): number {
    if (age < 0 || age >= length) return 0;
    const t = Math.min(1, age / STORM_RISE);
    const rise = t * t * (3 - 2 * t);
    const fall = age <= STORM_RISE ? 1 : Math.exp(-(age - STORM_RISE) / ((length - STORM_RISE) / 3));
    return rise * fall;
}

/** Advances the aurora by `dt` seconds and returns its level. */
export function stepAuroraActivity(state: AuroraActivity, dt: number, random: () => number = Math.random): number {
    state.time += dt;
    if (state.stormAge >= 0) {
        state.stormAge += dt;
        if (state.stormAge >= state.stormLength) state.stormAge = -1;
    } else if (random() < dt / AURORA_STORM_GAP) {
        state.stormAge = 0;
        state.stormLength = 40 + random() * 40;
    }
    state.level = calm(state.time) + 0.9 * stormEnvelope(state.stormAge, state.stormLength);
    return state.level;
}

/** Breaks a substorm out now (for testing the look). */
export function startAuroraStorm(state: AuroraActivity, length = 60): void {
    state.stormAge = 0;
    state.stormLength = length;
}
