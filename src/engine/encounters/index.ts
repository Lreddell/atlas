/** Public, deterministic encounter primitives. No rendering or world singleton dependencies. */
export type ActionPhase = 'anticipation' | 'active' | 'recovery';
export interface ActionDurations { anticipation: number; active: number; recovery: number }
export interface ActionTimeline { phase: ActionPhase; elapsed: number; duration: number }

export function nonnegativeFinite(value: number): number {
    return Number.isFinite(value) ? Math.max(0, value) : 0;
}

/** New cooldown map, preserving keys and the caller's deterministic iteration order. */
export function advanceCooldowns<K extends string>(cooldowns: Record<K, number>, dt: number): Record<K, number> {
    const next = { ...cooldowns };
    const elapsed = nonnegativeFinite(dt);
    for (const key of Object.keys(next) as K[]) next[key] = Math.max(0, next[key] - elapsed);
    return next;
}

/** Mutates the small live action record; callback runs at each crossed boundary in order. */
export function advanceActionTimeline(
    state: ActionTimeline,
    durations: ActionDurations,
    dt: number,
    onPhase: (phase: ActionPhase) => void = () => {},
): boolean {
    state.elapsed += nonnegativeFinite(dt);
    // At most three stages: zero-length phases are legal and cannot loop forever.
    for (let boundary = 0; boundary < 3 && state.elapsed >= state.duration; boundary += 1) {
        state.elapsed -= state.duration;
        if (state.phase === 'recovery') return true;
        state.phase = state.phase === 'anticipation' ? 'active' : 'recovery';
        state.duration = nonnegativeFinite(durations[state.phase]);
        onPhase(state.phase);
    }
    return false;
}

export interface EncounterState {
    version: 1;
    status: 'idle' | 'active' | 'defeated';
    phase: number;
    elapsed: number;
    rewardClaimed: boolean;
}

/** Owns encounter-local cleanup and once-only completion; unique mechanics remain ordinary TS. */
export class EncounterSession {
    private state: EncounterState = { version: 1, status: 'idle', phase: 0, elapsed: 0, rewardClaimed: false };
    private cleanups: Array<() => void> = [];

    constructor(readonly id: string) {
        if (!/^[a-z][a-z0-9_.-]*:[a-z0-9_./-]+$/.test(id)) throw new Error(`Invalid encounter id: ${id}`);
    }

    snapshot(): EncounterState { return { ...this.state }; }
    restore(state: EncounterState): void {
        if (state.version !== 1 || !['idle', 'active', 'defeated'].includes(state.status)
            || !Number.isInteger(state.phase) || state.phase < 0
            || !Number.isFinite(state.elapsed) || state.elapsed < 0 || typeof state.rewardClaimed !== 'boolean'
            || (state.rewardClaimed && state.status !== 'defeated')) throw new Error(`Invalid encounter state: ${this.id}`);
        this.cleanup();
        this.state = { ...state };
    }
    start(): boolean {
        if (this.state.status !== 'idle') return false;
        this.state = { ...this.state, status: 'active', phase: 1 };
        return true;
    }
    tick(dt: number): void {
        if (this.state.status === 'active') this.state.elapsed += nonnegativeFinite(dt);
    }
    enterPhase(phase: number): boolean {
        if (!Number.isInteger(phase) || phase < 1) throw new Error('Encounter phase must be a positive integer');
        if (this.state.status !== 'active' || phase <= this.state.phase) return false;
        this.state.phase = phase;
        return true;
    }
    own(cleanup: () => void): void { this.cleanups.push(cleanup); }
    defeat(): boolean {
        if (this.state.status !== 'active') return false;
        this.state.status = 'defeated';
        this.cleanup();
        return true;
    }
    claimReward(): boolean {
        if (this.state.status !== 'defeated' || this.state.rewardClaimed) return false;
        this.state.rewardClaimed = true;
        return true;
    }
    reset(): void {
        this.cleanup();
        this.state = { version: 1, status: 'idle', phase: 0, elapsed: 0, rewardClaimed: false };
    }
    private cleanup(): void {
        const callbacks = this.cleanups.splice(0).reverse();
        const errors: unknown[] = [];
        for (const callback of callbacks) { try { callback(); } catch (error) { errors.push(error); } }
        if (errors.length) throw new Error(`Encounter ${this.id} cleanup failed: ${errors.map(String).join('; ')}`);
    }
}

export interface CombatPoint { x: number; y: number; z: number }
export function isWithinAttackCone(
    origin: CombatPoint, forward: { x: number; z: number }, target: CombatPoint,
    range: number, halfAngle: number, verticalReach = 3.2,
): boolean {
    const dx = target.x - origin.x, dz = target.z - origin.z;
    const distance = Math.hypot(dx, dz);
    if (distance > range || Math.abs(target.y - origin.y) > verticalReach) return false;
    if (distance < 0.001) return true;
    const length = Math.hypot(forward.x, forward.z) || 1;
    return (dx * forward.x + dz * forward.z) / (distance * length) >= Math.cos(halfAngle);
}

export function isWithinAttackLane(
    origin: CombatPoint, forward: { x: number; z: number }, target: CombatPoint,
    length: number, halfWidth: number, rearAllowance = 0, verticalReach = 3.2,
): boolean {
    const dx = target.x - origin.x, dz = target.z - origin.z;
    const along = dx * forward.x + dz * forward.z;
    const across = Math.abs(dx * forward.z - dz * forward.x);
    return along >= -rearAllowance && along <= length && across <= halfWidth && Math.abs(target.y - origin.y) <= verticalReach;
}
