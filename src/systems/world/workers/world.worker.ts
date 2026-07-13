import { generateChunk } from '../chunkGeneration';
import { generateGeometryData } from '../geometry';
import { reseedGlobalNoise } from '../../../utils/noise';
import { loadGenConfig, resetGenConfig } from '../genConfig';

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
    const { type, id, cx, cz, seed, config, chunk, metaData, neighbors, lights, ticket, cullDarkFaces, session } = e.data;

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
            if (!chunk) {
                ctx.postMessage({ type: 'MESH_DONE', id, cx, cz, ticket, session, workerId, result: null });
                return;
            }

            maybeInjectFailure();
            // Generate geometry using data provided in the message.
            const started = performance.now();
            const result = generateGeometryData(cx, cz, chunk, metaData, neighbors, lights, !!cullDarkFaces);
            const durMs = performance.now() - started;

            const buffers: Transferable[] = [];
            [result.opaque, result.cutout, result.transparent].forEach(geo => {
                if (geo.positions.buffer) buffers.push(geo.positions.buffer);
                if (geo.normals.buffer) buffers.push(geo.normals.buffer);
                if (geo.uvs.buffer) buffers.push(geo.uvs.buffer);
                if (geo.colors.buffer) buffers.push(geo.colors.buffer);
                if (geo.indices.buffer) buffers.push(geo.indices.buffer);
            });

            const safeBuffers = buffers.filter(b => b !== undefined && b !== null);

            ctx.postMessage({ type: 'MESH_DONE', id, cx, cz, ticket, session, workerId, durMs, result }, safeBuffers);
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
            if (chunk) inputBytes += chunk.byteLength ?? 0;
            if (metaData) inputBytes += metaData.byteLength ?? 0;
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
