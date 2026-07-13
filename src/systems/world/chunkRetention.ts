/**
 * Pure retention/eviction/budget policy for chunk streaming.
 *
 * Deliberately free of world/game imports (and of non-erasable TS syntax) so
 * it can be unit-tested directly under `node --test` and reasoned about in
 * isolation. All distance work uses squared chunk distances — no square roots
 * and no string key parsing on the hot path.
 */

export interface ChunkCoord {
    cx: number;
    cz: number;
}

/** Extra ring (in chunks) kept beyond the desired radius before eviction. */
export const RETENTION_HYSTERESIS = 2;

/**
 * True when (cx, cz) lies within the retention circle around the center:
 * desired radius plus hysteresis, compared in squared space.
 */
export function isWithinRetention(
    cx: number, cz: number,
    centerCx: number, centerCz: number,
    desiredRadius: number,
    hysteresis: number = RETENTION_HYSTERESIS,
): boolean {
    const dx = cx - centerCx;
    const dz = cz - centerCz;
    const r = desiredRadius + hysteresis;
    return dx * dx + dz * dz <= r * r;
}

export function distanceSq(a: ChunkCoord, centerCx: number, centerCz: number): number {
    const dx = a.cx - centerCx;
    const dz = a.cz - centerCz;
    return dx * dx + dz * dz;
}

/**
 * Orders eviction candidates farthest-first from the center. Mutates and
 * returns `candidates`.
 */
export function sortFarthestFirst<T extends ChunkCoord>(
    candidates: T[],
    centerCx: number,
    centerCz: number,
): T[] {
    return candidates.sort((a, b) => distanceSq(b, centerCx, centerCz) - distanceSq(a, centerCx, centerCz));
}

export type BudgetLevel = 'ok' | 'soft' | 'hard';

export interface BudgetConfig {
    /** Above this many accounted bytes: stop prefetch, throttle, evict harder. */
    softLimitBytes: number;
    /** Above this: reject low-priority work, shrink the effective radius. */
    hardLimitBytes: number;
    /** Raw bytes per fully resident chunk (blocks + light + metadata). */
    bytesPerChunk: number;
}

export function budgetLevel(accountedBytes: number, config: BudgetConfig): BudgetLevel {
    if (accountedBytes >= config.hardLimitBytes) return 'hard';
    if (accountedBytes >= config.softLimitBytes) return 'soft';
    return 'ok';
}

/**
 * Effective streaming radius under the current budget level. At the hard
 * limit the radius shrinks so that the retained disc alone cannot exceed the
 * hard byte limit (the active player area always fits); at the soft limit the
 * outer prefetch ring is dropped. Returns the squared radius for comparison
 * against squared distances.
 */
export function effectiveRadiusSq(
    desiredRadius: number,
    level: BudgetLevel,
    config: BudgetConfig,
): number {
    if (level === 'hard') {
        const maxChunks = Math.max(9, Math.floor(config.hardLimitBytes / config.bytesPerChunk));
        // Invert area = π r²; the sqrt runs once per budget change, not per chunk.
        const rFit = Math.max(1, Math.floor(Math.sqrt(maxChunks / Math.PI)) - 1);
        const r = Math.min(desiredRadius, rFit);
        return r * r;
    }
    if (level === 'soft') {
        const r = Math.max(1, Math.ceil(desiredRadius * 0.9));
        return r * r;
    }
    return desiredRadius * desiredRadius;
}

/** How many evictions one scheduler cycle may perform at each budget level. */
export function evictionDrainBudget(level: BudgetLevel): number {
    if (level === 'hard') return 1024;
    if (level === 'soft') return 256;
    return 64;
}
