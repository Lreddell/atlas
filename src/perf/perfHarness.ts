/**
 * Development-only benchmark harness.
 *
 * Loaded by perf.html (never part of the game bundle). Drives the real
 * streaming pipeline — the same WorldManager singleton, worker pool, chunk
 * generation, lighting and meshing the game uses — through deterministic
 * scenarios without mounting the React renderer. That keeps runs repeatable
 * and lets the harness isolate world-streaming cost from GPU cost.
 *
 * Renderer statistics (draw calls, triangles) are therefore NOT available in
 * this mode and are reported as null; the in-game debug screen remains the
 * source for those. Heap figures use performance.memory when the browser
 * exposes it (Chromium) and are labelled unavailable otherwise.
 *
 * The scenario API is consumed by scripts/perf/run-perf.mjs via
 * window.__ATLAS_HARNESS__.
 */

import { worldManager } from '../systems/WorldManager';
import { perf } from '../systems/perf/perfTelemetry';
import * as WorldGen from '../systems/world/chunkGeneration';
import * as Geometry from '../systems/world/geometry';
import { reseedGlobalNoise } from '../utils/noise';
import { CHUNK_SIZE } from '../constants';
import { BlockType } from '../types';

const FIXED_DT = 1 / 20;

interface ScenarioOpts {
    seed?: number;
    renderDistance?: number;
    /** travel / outAndBack: distance in blocks */
    blocks?: number;
    /** travel: speed in blocks per second */
    speed?: number;
    /** teleport: number of jumps */
    jumps?: number;
    /** teleport: distance per jump in blocks */
    jumpDistance?: number;
    /** teleport / editChurn: how long to dwell/run, ms */
    durationMs?: number;
    maxMs?: number;
}

interface Sample {
    t: number;
    heapUsed: number | null;
    residentChunks: number;
    rawChunkBytes: number;
    cpuMeshBytes: number;
    meshCacheEntries: number;
    deliveredMeshBytes: number;
    genQueue: number;
    meshQueue: number;
    inFlightGen: number;
    inFlightMesh: number;
    dirtyChunks: number;
    desiredChunks: number;
    evicted: number;
    evictDeferredDirty: number;
    staleDiscarded: number;
    meshInputBytes: number;
    workers: number;
    workersEnabled: boolean;
    mainThreadJobs: number;
}

const log = (msg: string) => {
    console.log(`[perf] ${msg}`);
    const el = document.getElementById('log');
    if (el) el.textContent += `${msg}\n`;
};

// Live sample streaming: if the driver (run-perf.mjs) exposed a sink binding,
// push each sample out as it is taken, so a tab crash mid-scenario (e.g. an
// allocation failure — the very bug under investigation) still leaves a
// timeline on disk instead of losing the whole run.
let currentScenario = 'none';
function postSampleToSink(sample: Sample) {
    const sink = (window as unknown as { __ATLAS_PERF_SINK__?: (json: string) => void }).__ATLAS_PERF_SINK__;
    if (sink) {
        try { sink(JSON.stringify({ scenario: currentScenario, sample })); } catch { /* sink gone */ }
    }
}

function buildOffsets(r: number): Array<{ dx: number; dz: number }> {
    // Mirrors App.tsx buildChunkOffsets: circular, sorted center-out.
    const items: Array<{ dx: number; dz: number; d: number; a: number }> = [];
    for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
            const d = dx * dx + dz * dz;
            if (d > r * r) continue;
            items.push({ dx, dz, d, a: Math.atan2(dz, dx) });
        }
    }
    items.sort((p, q) => (p.d - q.d) || (p.a - q.a));
    return items.map(({ dx, dz }) => ({ dx, dz }));
}

function heapUsed(): number | null {
    const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    return mem ? mem.usedJSHeapSize : null;
}

function streamingStats(): Record<string, number | string | boolean> {
    return worldManager.getStreamingStats() as Record<string, number | string | boolean>;
}

function takeSample(t: number): Sample {
    const s = streamingStats();
    return {
        t: Math.round(t),
        heapUsed: heapUsed(),
        residentChunks: s.residentChunks as number,
        rawChunkBytes: s.rawChunkBytes as number,
        cpuMeshBytes: s.cpuMeshBytes as number,
        meshCacheEntries: s.meshCacheEntries as number,
        deliveredMeshBytes: (s.deliveredMeshBytes as number) ?? 0,
        genQueue: s.genQueue as number,
        meshQueue: s.meshQueue as number,
        inFlightGen: s.inFlightGen as number,
        inFlightMesh: s.inFlightMesh as number,
        dirtyChunks: s.dirtyChunks as number,
        desiredChunks: s.desiredChunks as number,
        evicted: perf.getCounter('streaming.evicted'),
        evictDeferredDirty: perf.getCounter('streaming.evictDeferredDirty'),
        staleDiscarded: perf.getCounter('streaming.staleGenDiscarded') + perf.getCounter('streaming.staleMeshDiscarded'),
        meshInputBytes: perf.getCounter('streaming.meshInputBytes'),
        workers: s.workers as number,
        workersEnabled: s.workersEnabled as boolean,
        mainThreadJobs: perf.getCounter('streaming.mainThreadGen') + perf.getCounter('streaming.mainThreadMesh'),
    };
}

function percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
    return sorted[idx];
}

function frameStats(deltas: number[]) {
    const sorted = [...deltas].sort((a, b) => a - b);
    const total = deltas.reduce((a, b) => a + b, 0);
    return {
        count: deltas.length,
        p50Ms: percentile(sorted, 50),
        p95Ms: percentile(sorted, 95),
        p99Ms: percentile(sorted, 99),
        maxMs: sorted.length ? sorted[sorted.length - 1] : 0,
        over25Ms: deltas.filter(d => d > 25).length,
        over50Ms: deltas.filter(d => d > 50).length,
        over100Ms: deltas.filter(d => d > 100).length,
        avgFps: total > 0 ? (deltas.length / total) * 1000 : 0,
    };
}

function pipelineIdle(): boolean {
    const s = streamingStats();
    return (s.genQueue as number) === 0
        && (s.meshQueue as number) === 0
        && (s.inFlightGen as number) === 0
        && (s.inFlightMesh as number) === 0
        && (s.pendingRemesh as number) === 0;
}

/**
 * Core loop: emulates GameLoop + ChunkStreamer. Per animation frame it runs
 * fixed 20Hz world ticks and pumps the streaming scheduler, records the frame
 * delta, and samples telemetry every 500ms. `update` returns true to finish.
 */
function runLoop(
    update: (elapsedMs: number, dtSec: number) => boolean,
    maxMs: number,
): Promise<{ deltas: number[]; samples: Sample[]; durationMs: number }> {
    return new Promise(resolve => {
        const deltas: number[] = [];
        const samples: Sample[] = [];
        const start = performance.now();
        let last = start;
        let nextSampleAt = 0;
        let tickAcc = 0;

        samples.push(takeSample(0));
        nextSampleAt = 500;

        const frame = () => {
            const now = performance.now();
            const dtMs = now - last;
            last = now;
            const elapsed = now - start;
            deltas.push(dtMs);

            const dtSec = Math.min(dtMs / 1000, 0.25);
            tickAcc += dtSec;
            let steps = 0;
            while (tickAcc >= FIXED_DT && steps < 5) {
                worldManager.tick(FIXED_DT);
                tickAcc -= FIXED_DT;
                steps++;
            }

            worldManager.processStreamingJobs();

            if (elapsed >= nextSampleAt) {
                const s = takeSample(elapsed);
                samples.push(s);
                postSampleToSink(s);
                nextSampleAt += 500;
            }

            const done = update(elapsed, dtSec);
            if (done || elapsed >= maxMs) {
                const final = takeSample(elapsed);
                samples.push(final);
                postSampleToSink(final);
                resolve({ deltas, samples, durationMs: elapsed });
                return;
            }
            requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
    });
}

// Mesh subscriptions mirroring the game's ChunkMesh mount/unmount lifecycle:
// App mounts one ChunkMesh per desired chunk, which subscribes and takes
// ownership of delivered geometry. Without this, delivered-mesh accounting
// (and the deliver-and-release ownership path) would go unexercised.
const activeMeshSubs = new Map<string, () => void>();

function clearMeshSubscriptions() {
    for (const unsub of activeMeshSubs.values()) unsub();
    activeMeshSubs.clear();
}

function setCenter(offsets: Array<{ dx: number; dz: number }>, cx: number, cz: number) {
    worldManager.setDesiredChunks(offsets.map(({ dx, dz }) => ({ cx: cx + dx, cz: cz + dz })));

    const want = new Set<string>();
    for (const { dx, dz } of offsets) want.add(`${cx + dx},${cz + dz}`);
    for (const [key, unsub] of activeMeshSubs) {
        if (!want.has(key)) {
            unsub();
            activeMeshSubs.delete(key);
        }
    }
    for (const key of want) {
        if (activeMeshSubs.has(key)) continue;
        const comma = key.indexOf(',');
        const scx = Number(key.slice(0, comma));
        const scz = Number(key.slice(comma + 1));
        activeMeshSubs.set(key, worldManager.subscribeMesh(scx, scz, () => { /* geometry consumed by renderer in-game */ }));
    }
}

/** Waits until the pipeline has been idle for `holdMs`, up to `maxMs`. */
function waitForIdle(holdMs: number, maxMs: number) {
    let idleSince: number | null = null;
    let becameIdleAt: number | null = null;
    return {
        update: (elapsed: number): boolean => {
            if (pipelineIdle()) {
                if (idleSince === null) idleSince = elapsed;
                if (becameIdleAt === null) becameIdleAt = elapsed;
                if (elapsed - idleSince >= holdMs) return true;
            } else {
                idleSince = null;
            }
            return elapsed >= maxMs;
        },
        getIdleAt: () => becameIdleAt,
    };
}

function resetWorld(seed: number) {
    clearMeshSubscriptions();
    worldManager.reset();
    // Empty world id: generation + meshing run normally, storage is bypassed
    // (nothing to load, autosave skipped) so runs never touch IndexedDB/OPFS.
    worldManager.setWorldContext('', seed);
    perf.reset();
}

// FNV-1a over all generated arrays: cheap, stable, order-sensitive.
function fnv1a(hash: number, arr: Uint8Array): number {
    for (let i = 0; i < arr.length; i++) {
        hash ^= arr[i];
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash;
}

type ScenarioResult = Record<string, unknown>;

const scenarios: Record<string, (opts: ScenarioOpts) => Promise<ScenarioResult>> = {
    /** Load the spawn area at a given render distance, wait for full idle, hold. */
    async stationary(opts) {
        const rd = opts.renderDistance ?? 16;
        const seed = opts.seed ?? 12345;
        const maxMs = opts.maxMs ?? 180000;
        resetWorld(seed);
        const offsets = buildOffsets(rd);
        setCenter(offsets, 0, 0);

        const idle = waitForIdle(2000, maxMs);
        const { deltas, samples, durationMs } = await runLoop(idle.update, maxMs);
        return {
            renderDistance: rd,
            timeToIdleMs: idle.getIdleAt(),
            reachedIdle: pipelineIdle(),
            durationMs,
            frames: frameStats(deltas),
            samples,
            end: takeSample(durationMs),
            telemetry: perf.snapshot(),
        };
    },

    /** Continuous straight-line travel along +X. */
    async travel(opts) {
        const rd = opts.renderDistance ?? 16;
        const seed = opts.seed ?? 12345;
        const blocks = opts.blocks ?? 10000;
        const speed = opts.speed ?? 64; // blocks per second
        const maxMs = opts.maxMs ?? Math.max(120000, (blocks / speed) * 1000 * 2 + 60000);
        resetWorld(seed);
        const offsets = buildOffsets(rd);

        let x = 0;
        let lastCx = Number.NaN;
        let travelDoneAt: number | null = null;
        const idle = waitForIdle(2000, maxMs);

        const { deltas, samples, durationMs } = await runLoop((elapsed, dt) => {
            if (x < blocks) {
                x += speed * dt;
                const cx = Math.floor(x / CHUNK_SIZE);
                if (cx !== lastCx) {
                    lastCx = cx;
                    setCenter(offsets, cx, 0);
                }
                return false;
            }
            if (travelDoneAt === null) travelDoneAt = elapsed;
            // After arriving, wait for the pipeline to settle so the end state
            // reflects steady residency, not in-flight churn.
            return idle.update(elapsed);
        }, maxMs);

        return {
            renderDistance: rd,
            blocks,
            speed,
            travelDoneAt,
            reachedIdle: pipelineIdle(),
            durationMs,
            frames: frameStats(deltas),
            samples,
            end: takeSample(durationMs),
            telemetry: perf.snapshot(),
        };
    },

    /** Repeated long-distance teleports with a dwell at each destination. */
    async teleport(opts) {
        const rd = opts.renderDistance ?? 16;
        const seed = opts.seed ?? 12345;
        const jumps = opts.jumps ?? 8;
        const jumpDistance = opts.jumpDistance ?? 4096;
        const dwellMs = opts.durationMs ?? 8000;
        const maxMs = opts.maxMs ?? jumps * (dwellMs + 30000);
        resetWorld(seed);
        const offsets = buildOffsets(rd);

        let jump = 0;
        let nextJumpAt = 0;
        const { deltas, samples, durationMs } = await runLoop((elapsed) => {
            if (elapsed >= nextJumpAt) {
                if (jump >= jumps) return true;
                const cx = Math.floor((jump * jumpDistance) / CHUNK_SIZE);
                setCenter(offsets, cx, 0);
                jump++;
                nextJumpAt = elapsed + dwellMs;
            }
            return false;
        }, maxMs);

        return {
            renderDistance: rd,
            jumps,
            jumpDistance,
            dwellMs,
            durationMs,
            frames: frameStats(deltas),
            samples,
            end: takeSample(durationMs),
            telemetry: perf.snapshot(),
        };
    },

    /** Travel away from spawn and return; growth after return indicates leaks. */
    async outAndBack(opts) {
        const rd = opts.renderDistance ?? 16;
        const seed = opts.seed ?? 12345;
        const blocks = opts.blocks ?? 2000;
        const speed = opts.speed ?? 64;
        const maxMs = opts.maxMs ?? (blocks / speed) * 2000 * 2 + 120000;
        resetWorld(seed);
        const offsets = buildOffsets(rd);
        setCenter(offsets, 0, 0);

        // Phase 0: initial idle at spawn
        let phase = 0;
        let x = 0;
        let lastCx = Number.NaN;
        let initialIdleSample: Sample | null = null;
        let farSample: Sample | null = null;
        let idleHold: ReturnType<typeof waitForIdle> = waitForIdle(1500, maxMs);

        const { deltas, samples, durationMs } = await runLoop((elapsed, dt) => {
            if (phase === 0) {
                if (idleHold.update(elapsed)) {
                    initialIdleSample = takeSample(elapsed);
                    phase = 1;
                }
                return false;
            }
            if (phase === 1) {
                x += speed * dt;
                if (x >= blocks) { farSample = takeSample(elapsed); phase = 2; }
            } else if (phase === 2) {
                x -= speed * dt;
                if (x <= 0) {
                    x = 0;
                    phase = 3;
                    idleHold = waitForIdle(2000, maxMs);
                }
            } else if (phase === 3) {
                const cx0 = Math.floor(x / CHUNK_SIZE);
                if (cx0 !== lastCx) { lastCx = cx0; setCenter(offsets, cx0, 0); }
                return idleHold.update(elapsed);
            }
            const cx = Math.floor(x / CHUNK_SIZE);
            if (cx !== lastCx) { lastCx = cx; setCenter(offsets, cx, 0); }
            return false;
        }, maxMs);

        return {
            renderDistance: rd,
            blocks,
            speed,
            durationMs,
            initialIdle: initialIdleSample,
            atFarPoint: farSample,
            afterReturn: takeSample(durationMs),
            frames: frameStats(deltas),
            samples,
            telemetry: perf.snapshot(),
        };
    },

    /** Rapid block placement/breaking across a chunk boundary. */
    async editChurn(opts) {
        const rd = opts.renderDistance ?? 8;
        const seed = opts.seed ?? 12345;
        const runMs = opts.durationMs ?? 30000;
        const maxMs = opts.maxMs ?? runMs + 120000;
        resetWorld(seed);
        const offsets = buildOffsets(rd);
        setCenter(offsets, 0, 0);

        const idle = waitForIdle(1500, maxMs);
        let phase = 0;
        let editStart = 0;
        let edits = 0;
        let nextEditAt = 0;
        const baseY = worldManager.getTerrainHeight(15, 0) + 2;

        const { deltas, samples, durationMs } = await runLoop((elapsed) => {
            if (phase === 0) {
                if (idle.update(elapsed)) { phase = 1; editStart = elapsed; nextEditAt = elapsed; }
                return false;
            }
            if (elapsed - editStart >= runMs) return true;
            if (elapsed >= nextEditAt) {
                // Alternate place/break straddling the x=15|16 chunk boundary.
                const i = edits % 8;
                const x = 15 + (i % 2); // 15 or 16 → chunk 0 or chunk 1
                const y = baseY + (i >> 1);
                if ((edits & 8) === 0) worldManager.setBlock(x, y, i % 3, BlockType.STONE);
                else worldManager.setBlock(x, y, i % 3, BlockType.AIR);
                edits++;
                nextEditAt += 100; // 10 edits/sec
            }
            return false;
        }, maxMs);

        return {
            renderDistance: rd,
            edits,
            durationMs,
            frames: frameStats(deltas),
            samples,
            end: takeSample(durationMs),
            telemetry: perf.snapshot(),
        };
    },

    /**
     * Stale-result rejection check: switch the world context (new seed, new
     * session) while generation jobs are in flight, WITHOUT resetting the
     * pipeline, then verify the surviving world matches a fresh main-thread
     * generation of the new seed (i.e. no old-seed chunk leaked in) and that
     * stale results were counted and discarded.
     */
    async worldSwitch(opts) {
        const rd = opts.renderDistance ?? 8;
        const seedA = opts.seed ?? 12345;
        const seedB = seedA + 999;
        const maxMs = opts.maxMs ?? 120000;
        resetWorld(seedA);
        const offsets = buildOffsets(rd);
        setCenter(offsets, 0, 0);

        let phase = 0;
        const idle = waitForIdle(2500, maxMs);
        const { samples, durationMs } = await runLoop((elapsed) => {
            if (phase === 0 && elapsed > 1200) {
                phase = 1;
                // Deliberately NOT calling reset() yet: live workers still hold
                // in-flight seed-A jobs whose results must now be
                // session-rejected instead of landing in the seed-B world.
                worldManager.setWorldContext('', seedB);
            } else if (phase === 1 && elapsed > 3500) {
                phase = 2;
                // Now the normal switch flow: full pipeline reset + reload.
                clearMeshSubscriptions();
                worldManager.reset();
                worldManager.setWorldContext('', seedB);
                setCenter(offsets, 0, 0);
            }
            return phase === 2 ? idle.update(elapsed) : false;
        }, maxMs);

        // Compare a few resident chunks against fresh seed-B generation.
        const mismatches: string[] = [];
        for (const [cx, cz] of [[0, 0], [2, -1], [-3, 3]] as Array<[number, number]>) {
            const resident = worldManager.getChunkData(cx, cz, false);
            const expected = WorldGen.generateChunk(cx, cz).blocks;
            if (!resident) { mismatches.push(`${cx},${cz}: missing`); continue; }
            let h1 = 0x811c9dc5, h2 = 0x811c9dc5;
            h1 = fnv1a(h1, resident);
            h2 = fnv1a(h2, expected);
            if (h1 !== h2) mismatches.push(`${cx},${cz}: ${h1.toString(16)} != ${h2.toString(16)}`);
        }

        return {
            renderDistance: rd,
            seedA, seedB,
            durationMs,
            reachedIdle: pipelineIdle(),
            staleSessionDiscarded: perf.getCounter('streaming.staleSessionDiscarded'),
            staleDiscarded: perf.getCounter('streaming.staleGenDiscarded') + perf.getCounter('streaming.staleMeshDiscarded'),
            chunkMismatchesVsFreshSeedB: mismatches,
            end: takeSample(durationMs),
            samples,
        };
    },

    /**
     * Worker failure containment check: inject faults (including allocation
     * errors) into the live pool mid-stream and verify streaming completes
     * anyway, with workers alive and zero main-thread fallback jobs.
     */
    async workerFault(opts) {
        const rd = opts.renderDistance ?? 6;
        const seed = opts.seed ?? 12345;
        const maxMs = opts.maxMs ?? 120000;
        resetWorld(seed);
        const offsets = buildOffsets(rd);
        setCenter(offsets, 0, 0);

        let injectedGeneric = false;
        let injectedAlloc = false;
        const idle = waitForIdle(2500, maxMs);
        const { samples, durationMs } = await runLoop((elapsed) => {
            // Poison the pool twice while work is in flight.
            if (!injectedGeneric && elapsed > 500) {
                injectedGeneric = true;
                worldManager.devInjectWorkerFault(2, 'generic');
            }
            if (!injectedAlloc && elapsed > 2000) {
                injectedAlloc = true;
                worldManager.devInjectWorkerFault(1, 'alloc');
            }
            return idle.update(elapsed);
        }, maxMs);

        const end = takeSample(durationMs);
        const stats = streamingStats();
        return {
            renderDistance: rd,
            durationMs,
            reachedIdle: pipelineIdle(),
            jobErrors: perf.getCounter('worker.jobError'),
            allocationErrors: perf.getCounter('worker.allocationError'),
            workerRestarts: perf.getCounter('worker.restart'),
            workersAliveAtEnd: stats.workers,
            workersEnabledAtEnd: stats.workersEnabled,
            mainThreadJobs: end.mainThreadJobs,
            meshCacheEntries: end.meshCacheEntries,
            desiredChunks: end.desiredChunks,
            samples,
            telemetry: perf.snapshot(),
        };
    },

    /**
     * Deterministic mesher hash: generates a fixed set of chunk neighborhoods
     * on the main thread and hashes every geometry buffer the mesher emits
     * (both with and without dark-face culling). Guards against any change in
     * visual output from mesher/transfer-protocol work — the hash must remain
     * identical unless a rendering change is intentional and documented.
     */
    async meshHash(opts) {
        const seed = opts.seed ?? 12345;
        reseedGlobalNoise(seed);
        const coords: Array<[number, number]> = [[0, 0], [3, -2], [-5, 5], [100, -100]];
        const hashes: Record<string, string> = {};
        const gen = (cx: number, cz: number) => WorldGen.generateChunk(cx, cz);
        for (const [cx, cz] of coords) {
            const center = gen(cx, cz);
            const left = gen(cx - 1, cz);
            const right = gen(cx + 1, cz);
            const front = gen(cx, cz + 1);
            const back = gen(cx, cz - 1);
            const neighbors = Geometry.buildNeighborInput(
                { blocks: left.blocks, light: left.light },
                { blocks: right.blocks, light: right.light },
                { blocks: front.blocks, light: front.light },
                { blocks: back.blocks, light: back.light },
            );
            for (const cull of [false, true]) {
                const r = Geometry.generateGeometryData(
                    cx, cz, center.blocks, center.meta,
                    neighbors.blocks,
                    { center: center.light, ...neighbors.light },
                    cull,
                );
                let h = 0x811c9dc5;
                for (const part of [r.opaque, r.cutout, r.transparent]) {
                    for (const arr of [part.positions, part.normals, part.uvs, part.colors, part.indices]) {
                        h = fnv1a(h, new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength));
                    }
                }
                hashes[`${cx},${cz}${cull ? ',culled' : ''}`] = h.toString(16).padStart(8, '0');
            }
        }
        return { seed, hashes };
    },

    /**
     * Deterministic generation hash over a fixed chunk set (including far and
     * negative coordinates). Must not change across performance work.
     */
    async hashCheck(opts) {
        const seed = opts.seed ?? 12345;
        reseedGlobalNoise(seed);
        const coords: Array<[number, number]> = [
            [0, 0], [1, 0], [0, 1], [-1, -1], [-3, 7],
            [100, -100], [625, 625], [-1000, 250], [4096, 0],
        ];
        const hashes: Record<string, string> = {};
        for (const [cx, cz] of coords) {
            const r = WorldGen.generateChunk(cx, cz);
            let h = 0x811c9dc5;
            h = fnv1a(h, r.blocks);
            h = fnv1a(h, r.light);
            h = fnv1a(h, r.meta);
            hashes[`${cx},${cz}`] = h.toString(16).padStart(8, '0');
        }
        return { seed, hashes };
    },
};

declare global {
    interface Window {
        __ATLAS_HARNESS__?: {
            run(name: string, opts?: ScenarioOpts): Promise<ScenarioResult>;
            scenarios: string[];
        };
    }
}

window.__ATLAS_HARNESS__ = {
    scenarios: Object.keys(scenarios),
    async run(name: string, opts: ScenarioOpts = {}): Promise<ScenarioResult> {
        const fn = scenarios[name];
        if (!fn) throw new Error(`Unknown scenario: ${name} (have: ${Object.keys(scenarios).join(', ')})`);
        currentScenario = name;
        log(`running ${name} ${JSON.stringify(opts)}`);
        const started = Date.now();
        const result = await fn(opts);
        log(`finished ${name} in ${((Date.now() - started) / 1000).toFixed(1)}s`);
        return {
            scenario: name,
            opts,
            startedAt: started,
            rendererStats: null, // no renderer mounted in harness mode
            memoryApi: heapUsed() !== null ? 'performance.memory' : 'unavailable',
            ...result,
        };
    },
};

log(`harness ready — scenarios: ${Object.keys(scenarios).join(', ')}`);
