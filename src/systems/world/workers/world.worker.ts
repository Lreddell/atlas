import { generateChunk } from '../chunkGeneration';
import { generateGeometryData } from '../geometry';
import { reseedGlobalNoise } from '../../../utils/noise';
import { loadGenConfig, resetGenConfig } from '../genConfig';
import { ChunkColumn, COLUMN_VOLUME, type SectionPlane } from '../chunkColumn';

// Reusable scratch: center-chunk sections arrive as uniform values + 4 KiB
// materialized copies and are flattened here once per job, so the mesher keeps
// its fast flat-array access without the main thread cloning ~295 KiB per job.
const scratchBlocks = new Uint8Array(COLUMN_VOLUME);
const scratchMeta = new Uint8Array(COLUMN_VOLUME);
const scratchLight = new Uint8Array(COLUMN_VOLUME);

// Cast self to Worker
const ctx = self as unknown as Worker;

// Assigned by the main thread via INIT and echoed on every reply so the pool
// can attribute results, errors, and heartbeats to a specific worker.
let workerId = -1;

// Test/benchmark fault injection (DEBUG_FAIL_NEXT): fail the next N jobs, so
// the error-containment path can be exercised end-to-end by the perf harness.
let injectedFailures = 0;
let injectedFailureKind: 'alloc' | 'generic' = 'generic';

const maybeInjectFailure = () => {
    if (injectedFailures <= 0) return;
    injectedFailures--;
    if (injectedFailureKind === 'alloc') throw new RangeError('Array buffer allocation failed (injected)');
    throw new Error('Injected worker fault');
};

const isAllocationError = (e: unknown): boolean => {
    const name = e instanceof Error ? e.name : '';
    const msg = e instanceof Error ? e.message : String(e);
    return name === 'RangeError' || /allocation|out of memory|invalid array length|invalid typed array length/i.test(msg);
};

ctx.onmessage = (e) => {
    const { type, id, cx, cz, seed, config, sections, sectionMask, full, neighbors, lights, ticket, cullDarkFaces, session } = e.data;

    try {
        if (type === 'INIT') {
            workerId = e.data.workerId;
        }
        else if (type === 'PING') {
            ctx.postMessage({ type: 'PONG', workerId });
        }
        else if (type === 'DEBUG_FAIL_NEXT') {
            injectedFailures = e.data.count ?? 1;
            injectedFailureKind = e.data.kind === 'alloc' ? 'alloc' : 'generic';
        }
        else if (type === 'SET_SEED') {
            reseedGlobalNoise(seed);
            console.log(`[Worker ${workerId}] Reseeded with: ${seed}`);
        }
        else if (type === 'SET_GEN_CONFIG') {
            resetGenConfig();
            if (config) {
                loadGenConfig(config);
            }
            console.log(`[Worker ${workerId}] Applied world generation config`);
        }
        else if (type === 'GEN') {
            maybeInjectFailure();
            const started = performance.now();
            const result = generateChunk(cx, cz);
            const durMs = performance.now() - started;

            // Transfer the generated buffers directly to the main thread.
            // The worker no longer maintains a cache, making it stateless.
            ctx.postMessage({
                type: 'GEN_DONE',
                id, cx, cz,
                ticket,
                session,
                workerId,
                durMs,
                result: {
                    blocks: result.blocks,
                    light: result.light,
                    meta: result.meta
                }
            }, [result.blocks.buffer, result.light.buffer, result.meta.buffer]);
        }
        else if (type === 'MESH') {
            if (!sections) {
                ctx.postMessage({ type: 'MESH_DONE', id, cx, cz, ticket, session, workerId, results: null, full: !!full });
                return;
            }

            maybeInjectFailure();
            const started = performance.now();
            ChunkColumn.flattenPlane(sections.blocks as SectionPlane[], scratchBlocks);
            ChunkColumn.flattenPlane(sections.meta as SectionPlane[], scratchMeta);
            ChunkColumn.flattenPlane(sections.light as SectionPlane[], scratchLight);

            // One mesher pass per requested section: each pass emits only the
            // faces owned by blocks in that 16-block slab, so an edit costs one
            // section, not a 384-block column. Passes share the scratch data.
            const results: Array<{ sy: number; result: ReturnType<typeof generateGeometryData> }> = [];
            const buffers: Transferable[] = [];
            const mask = sectionMask >>> 0;
            for (let sy = 0; sy < 24; sy++) {
                if ((mask & (1 << sy)) === 0) continue;
                const result = generateGeometryData(
                    cx, cz, scratchBlocks, scratchMeta,
                    neighbors, { center: scratchLight, ...lights },
                    !!cullDarkFaces,
                    sy * 16, (sy + 1) * 16,
                );
                results.push({ sy, result });
                for (const geo of [result.opaque, result.cutout, result.transparent]) {
                    if (geo.positions.buffer) buffers.push(geo.positions.buffer);
                    if (geo.normals.buffer) buffers.push(geo.normals.buffer);
                    if (geo.uvs.buffer) buffers.push(geo.uvs.buffer);
                    if (geo.colors.buffer) buffers.push(geo.colors.buffer);
                    if (geo.indices.buffer) buffers.push(geo.indices.buffer);
                }
            }
            const durMs = performance.now() - started;

            const safeBuffers = buffers.filter(b => b !== undefined && b !== null);

            ctx.postMessage({ type: 'MESH_DONE', id, cx, cz, ticket, session, workerId, durMs, results, full: !!full }, safeBuffers);
        }
        else if (type === 'EVICT') {
            // Stateless worker: nothing to evict locally.
        }
    } catch (err) {
        // A failed job must never take down the worker (or the pool). Report a
        // structured error so the main thread can requeue the job, apply
        // backoff, and keep every other worker running.
        if (type === 'GEN' || type === 'MESH') {
            let inputBytes = 0;
            if (sections) {
                for (const plane of Object.values(sections)) {
                    for (const sec of plane as SectionPlane[]) {
                        if (typeof sec !== 'number') inputBytes += sec.byteLength;
                    }
                }
            }
            if (neighbors) {
                for (const n of Object.values(neighbors)) {
                    inputBytes += (n as Uint8Array | undefined)?.byteLength ?? 0;
                }
            }
            if (lights) {
                for (const l of Object.values(lights)) {
                    inputBytes += (l as Uint8Array | undefined)?.byteLength ?? 0;
                }
            }
            ctx.postMessage({
                type: 'JOB_ERROR',
                jobType: type,
                id, cx, cz,
                ticket,
                session,
                workerId,
                errorName: err instanceof Error ? err.name : 'Error',
                errorMessage: err instanceof Error ? err.message : String(err),
                allocationRelated: isAllocationError(err),
                inputBytes,
            });
        } else {
            console.error(`[Worker ${workerId}] control message '${type}' failed:`, err);
        }
    }
};
