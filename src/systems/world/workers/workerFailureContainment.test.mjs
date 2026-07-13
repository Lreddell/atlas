import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { URL } from 'node:url';

const worker = readFileSync(new URL('./world.worker.ts', import.meta.url), 'utf8');
const wm = readFileSync(new URL('../../WorldManager.ts', import.meta.url), 'utf8');

test('worker jobs are wrapped in try/catch and report structured JOB_ERROR', () => {
    // The whole message handler body is guarded.
    assert.match(worker, /ctx\.onmessage = \(e\) => \{[\s\S]*?try \{/);
    // Structured error payload with everything the pool needs to react.
    assert.match(worker, /type: 'JOB_ERROR'/);
    for (const field of ['jobType', 'ticket', 'workerId', 'errorName', 'errorMessage', 'allocationRelated', 'inputBytes']) {
        assert.match(worker, new RegExp(`${field}[:,]`), `JOB_ERROR must carry ${field}`);
    }
    // Allocation failures are classified so the pool can throttle.
    assert.match(worker, /isAllocationError/);
    assert.match(worker, /RangeError/);
});

test('worker pool is never disabled wholesale and never falls back to the main thread on error', () => {
    // The old failure mode: one worker error => workersEnabled = false =>
    // permanent main-thread setTimeout generation/meshing. Must stay gone.
    assert.doesNotMatch(wm, /onerror[\s\S]{0,400}?workersEnabled = false/);
    assert.doesNotMatch(wm, /Switching to Main Thread/);
    // A crashed worker restarts individually.
    assert.match(wm, /worker\.onerror = \(e\) => \{[\s\S]{0,200}?this\.restartWorker\(slot/);
    // While the pool is down, jobs stay queued rather than running on the main thread.
    assert.match(wm, /const poolDown = this\.workersEnabled && this\.workers\.length === 0;/);
    assert.match(wm, /while \(!poolDown && this\.inFlightGen/);
    assert.match(wm, /while \(!poolDown && this\.inFlightMesh/);
    // The setTimeout fallback is reachable only when workers were explicitly disabled.
    assert.match(wm, /Workers explicitly disabled by the user\/config/);
});

test('worker failures are contained: requeue, backoff, recovery, heartbeat', () => {
    // In-flight jobs of a dead worker are requeued (only if still desired).
    assert.match(wm, /requeueJobsForWorker/);
    assert.match(wm, /desiredChunkKeys\.has\(key\)/);
    // Repeated restarts within the window drop the worker instead of thrashing.
    assert.match(wm, /WORKER_MAX_RESTARTS_IN_WINDOW/);
    // An empty pool schedules recovery attempts on a timer.
    assert.match(wm, /scheduleWorkerRecovery/);
    assert.match(wm, /WORKER_RECOVERY_RETRY_MS/);
    // Heartbeats detect hung workers.
    assert.match(worker, /type: 'PONG'/);
    assert.match(wm, /heartbeatWorkers/);
    assert.match(wm, /WORKER_MAX_MISSED_PONGS/);
});

test('allocation-related failures throttle concurrency and recover gradually', () => {
    assert.match(wm, /allocationRelated[\s\S]{0,600}?MAX_GEN_IN_FLIGHT = Math\.max\(1, this\.MAX_GEN_IN_FLIGHT >> 1\)/);
    assert.match(wm, /MAX_MESH_IN_FLIGHT = Math\.max\(1, this\.MAX_MESH_IN_FLIGHT >> 1\)/);
    assert.match(wm, /noteJobSuccess/);
    assert.match(wm, /THROTTLE_RECOVERY_SUCCESSES/);
});
