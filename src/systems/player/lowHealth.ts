// The low-health rule, and the heartbeat cadence that escalates with it.
//
// Pure so the thresholds and the BPM curve can be tested without audio, timers or
// React. The runtime that schedules beats lives in lowHealthState.ts.

/** Low health starts at or below 40% of maximum health (8 HP of 20). */
export const LOW_HEALTH_ENTER_FRACTION = 0.4;
/**
 * ...and only clears at or above 50% (10 HP of 20). The gap is deliberate:
 * natural regeneration ticks one point at a time, and a single threshold would
 * start and stop the heartbeat, the vignette and the music pitch on every tick.
 */
export const LOW_HEALTH_EXIT_FRACTION = 0.5;

export const DEFAULT_MAX_HEALTH = 20;

/** The HP at or below which low health begins, for a given maximum. */
export function lowHealthEnterAt(maxHealth: number = DEFAULT_MAX_HEALTH): number {
    return Math.floor(maxHealth * LOW_HEALTH_ENTER_FRACTION);
}

/** The HP at or above which it clears. */
export function lowHealthExitAt(maxHealth: number = DEFAULT_MAX_HEALTH): number {
    return Math.ceil(maxHealth * LOW_HEALTH_EXIT_FRACTION);
}

/**
 * Whether low health is active after a health change, given whether it already
 * was. Hysteresis lives here: between the two thresholds the previous state
 * simply persists.
 *
 * Zero health is death, not low health — death owns its own presentation, and a
 * heartbeat must never outlive the player.
 */
export function resolveLowHealth(
    wasActive: boolean,
    health: number,
    maxHealth: number = DEFAULT_MAX_HEALTH,
): boolean {
    if (!Number.isFinite(health) || health <= 0) return false;
    if (health <= lowHealthEnterAt(maxHealth)) return true;
    if (health >= lowHealthExitAt(maxHealth)) return false;
    return wasActive;
}

/**
 * How far into the low band the player is: 0 at the entry threshold, 1 at 1 HP.
 * Drives both the cadence and the vignette's severity, so the two escalate
 * together off one number.
 */
export function lowHealthSeverity(health: number, maxHealth: number = DEFAULT_MAX_HEALTH): number {
    const enter = lowHealthEnterAt(maxHealth);
    if (!Number.isFinite(health) || health <= 0) return 0;
    if (health >= enter) return 0;
    const span = Math.max(1, enter - 1);
    return Math.max(0, Math.min(1, (enter - health) / span));
}

/** Resting rate, at the moment low health begins. */
export const HEARTBEAT_MIN_BPM = 72;
/** ...and at 1 HP. Fast enough to read as panic, slow enough to sit at for minutes. */
export const HEARTBEAT_MAX_BPM = 114;

/**
 * Beats per minute for a given health. Interpolated across the low band rather
 * than tabulated per HP, which keeps it correct if maximum health ever changes.
 * The curve is slightly convex so most of the acceleration lands in the last few
 * points, where the danger actually is.
 */
export function heartbeatBpm(health: number, maxHealth: number = DEFAULT_MAX_HEALTH): number {
    const severity = lowHealthSeverity(health, maxHealth);
    const eased = severity * severity * 0.35 + severity * 0.65;
    return HEARTBEAT_MIN_BPM + (HEARTBEAT_MAX_BPM - HEARTBEAT_MIN_BPM) * eased;
}

/** The gap between beats, in milliseconds. */
export function heartbeatIntervalMs(health: number, maxHealth: number = DEFAULT_MAX_HEALTH): number {
    return 60000 / heartbeatBpm(health, maxHealth);
}
