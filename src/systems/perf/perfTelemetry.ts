/**
 * Lightweight runtime performance telemetry.
 *
 * Counters and duration stats are plain numeric updates (no allocation on the
 * hot path beyond a fixed ring buffer slot), so systems can report events
 * unconditionally. Snapshots are computed on demand — providers registered by
 * subsystems (e.g. the world streaming pipeline) are only invoked when a
 * snapshot is requested, keeping steady-state overhead near zero.
 *
 * The benchmark harness and the in-game debug screen both read from here via
 * `window.__ATLAS_PERF__`.
 */

const PERCENTILE_RING_SIZE = 512;

interface DurationStat {
    count: number;
    totalMs: number;
    maxMs: number;
    ring: Float64Array;
    ringLength: number;
    ringCursor: number;
}

export interface DurationSnapshot {
    count: number;
    totalMs: number;
    maxMs: number;
    avgMs: number;
    p50Ms: number | null;
    p95Ms: number | null;
    p99Ms: number | null;
}

export type SnapshotProvider = () => Record<string, unknown>;

function percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
    return sorted[idx];
}

class PerfTelemetry {
    private counters = new Map<string, number>();
    private durations = new Map<string, DurationStat>();
    private providers = new Map<string, SnapshotProvider>();

    count(name: string, n: number = 1): void {
        this.counters.set(name, (this.counters.get(name) ?? 0) + n);
    }

    getCounter(name: string): number {
        return this.counters.get(name) ?? 0;
    }

    duration(name: string, ms: number): void {
        let stat = this.durations.get(name);
        if (!stat) {
            stat = {
                count: 0,
                totalMs: 0,
                maxMs: 0,
                ring: new Float64Array(PERCENTILE_RING_SIZE),
                ringLength: 0,
                ringCursor: 0,
            };
            this.durations.set(name, stat);
        }
        stat.count++;
        stat.totalMs += ms;
        if (ms > stat.maxMs) stat.maxMs = ms;
        stat.ring[stat.ringCursor] = ms;
        stat.ringCursor = (stat.ringCursor + 1) % PERCENTILE_RING_SIZE;
        if (stat.ringLength < PERCENTILE_RING_SIZE) stat.ringLength++;
    }

    registerProvider(name: string, provider: SnapshotProvider): void {
        this.providers.set(name, provider);
    }

    unregisterProvider(name: string): void {
        this.providers.delete(name);
    }

    snapshot(): {
        at: number;
        counters: Record<string, number>;
        durations: Record<string, DurationSnapshot>;
        providers: Record<string, Record<string, unknown>>;
    } {
        const counters: Record<string, number> = {};
        for (const [k, v] of this.counters) counters[k] = v;

        const durations: Record<string, DurationSnapshot> = {};
        for (const [k, stat] of this.durations) {
            const window = Array.from(stat.ring.subarray(0, stat.ringLength)).sort((a, b) => a - b);
            durations[k] = {
                count: stat.count,
                totalMs: stat.totalMs,
                maxMs: stat.maxMs,
                avgMs: stat.count > 0 ? stat.totalMs / stat.count : 0,
                p50Ms: window.length ? percentile(window, 50) : null,
                p95Ms: window.length ? percentile(window, 95) : null,
                p99Ms: window.length ? percentile(window, 99) : null,
            };
        }

        const providers: Record<string, Record<string, unknown>> = {};
        for (const [k, fn] of this.providers) {
            try {
                providers[k] = fn();
            } catch (e) {
                providers[k] = { error: String(e) };
            }
        }

        return { at: Date.now(), counters, durations, providers };
    }

    /** Clears counters and duration stats (providers stay registered). */
    reset(): void {
        this.counters.clear();
        this.durations.clear();
    }
}

export const perf = new PerfTelemetry();

declare global {
    interface Window {
        __ATLAS_PERF__?: PerfTelemetry;
    }
}

if (typeof window !== 'undefined') {
    window.__ATLAS_PERF__ = perf;
}
