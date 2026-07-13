import assert from "node:assert/strict";
import test from "node:test";
import { loadTs } from "../world/storage/bundleTs.mjs";

globalThis.__APP_VERSION__ = "test";
globalThis.__APP_DISPLAY_VERSION__ = "test";

const mod = await loadTs(`
  export {
    RAW_CHUNK_BYTES,
    capDesiredChunks,
    compactQueuedChunkJobs,
    drainEvictionQueue,
    prioritizeEvictions,
    residentChunkCapacity,
    selectAffinityWorker,
    estimateTransferBytes,
    summarizeFrameTimes,
    totalBudgetBytes,
    isCurrentStreamingResult,
    workerRestartDelayMs,
  } from './src/systems/performance/streamingSafetyCore';
`);

const {
  RAW_CHUNK_BYTES,
  capDesiredChunks,
  compactQueuedChunkJobs,
  drainEvictionQueue,
  prioritizeEvictions,
  residentChunkCapacity,
  selectAffinityWorker,
  estimateTransferBytes,
  summarizeFrameTimes,
  totalBudgetBytes,
  isCurrentStreamingResult,
  workerRestartDelayMs,
} = mod;

test("full-height raw chunk accounting matches three 16x384x16 byte arrays", () => {
  assert.equal(RAW_CHUNK_BYTES, 294_912);
});

test("hard-cap trimming preserves center-first desired order", () => {
  const chunks = [
    { cx: 0, cz: 0 },
    { cx: 1, cz: 0 },
    { cx: -1, cz: 0 },
    { cx: 2, cz: 0 },
  ];
  assert.deepEqual(capDesiredChunks(chunks, 3), chunks.slice(0, 3));
  assert.deepEqual(chunks, [
    { cx: 0, cz: 0 },
    { cx: 1, cz: 0 },
    { cx: -1, cz: 0 },
    { cx: 2, cz: 0 },
  ]);
});

test("eviction priority is farthest-first without square roots", () => {
  const sorted = prioritizeEvictions(
    [
      { cx: 1, cz: 0 },
      { cx: 8, cz: 0 },
      { cx: -3, cz: -4 },
    ],
    { cx: 0, cz: 0 },
  );
  assert.deepEqual(sorted, [
    { cx: 8, cz: 0 },
    { cx: -3, cz: -4 },
    { cx: 1, cz: 0 },
  ]);
});

test("worker affinity is stable for positive and negative chunk coordinates", () => {
  const workers = [0, 1, 2, 3];
  assert.equal(
    selectAffinityWorker(42, -91, workers),
    selectAffinityWorker(42, -91, workers),
  );
  assert.ok(
    workers.includes(selectAffinityWorker(-2_000_000, 2_000_000, workers)),
  );
  assert.equal(selectAffinityWorker(0, 0, []), null);
});

test("transfer accounting counts aliased typed-array buffers once", () => {
  const buffer = new ArrayBuffer(128);
  const bytes = estimateTransferBytes({
    center: new Uint8Array(buffer),
    repeated: new Uint8Array(buffer),
    other: new Uint16Array(16),
  });
  assert.equal(bytes, 160);
});

test("frame summaries report percentiles and long-frame counts", () => {
  const result = summarizeFrameTimes([10, 20, 30, 60, 120]);
  assert.equal(result.sampleCount, 5);
  assert.equal(result.p50Ms, 30);
  assert.equal(result.p95Ms, 120);
  assert.equal(result.p99Ms, 120);
  assert.equal(result.over25Ms, 3);
  assert.equal(result.over50Ms, 2);
  assert.equal(result.over100Ms, 1);
});

test("budget total includes every tracked ownership category", () => {
  assert.equal(
    totalBudgetBytes({
      rawChunkBytes: 1,
      cpuMeshBytes: 2,
      estimatedGpuMeshBytes: 3,
      workerInFlightInputBytes: 4,
      workerScratchEstimatedBytes: 5,
      dirtySaveSnapshotBytes: 6,
    }),
    21,
  );
});

test("stale worker results are rejected across world switches, desired epochs, and data edits", () => {
  const base = {
    activeTicket: 7,
    resultTicket: 7,
    desired: true,
    currentSessionId: 3,
    currentDesiredEpoch: 9,
    currentDataVersion: 4,
    recordSessionId: 3,
    recordDesiredEpoch: 9,
    recordDataVersion: 4,
    recordUniqueTicket: "3:MESH:7",
    resultSessionId: 3,
    resultDesiredEpoch: 9,
    resultDataVersion: 4,
    resultUniqueTicket: "3:MESH:7",
  };
  assert.equal(isCurrentStreamingResult(base), true);
  assert.equal(
    isCurrentStreamingResult({ ...base, currentSessionId: 4 }),
    false,
  );
  assert.equal(
    isCurrentStreamingResult({ ...base, currentDesiredEpoch: 10 }),
    false,
  );
  assert.equal(
    isCurrentStreamingResult({ ...base, currentDataVersion: 5 }),
    false,
  );
  assert.equal(isCurrentStreamingResult({ ...base, desired: false }), false);
  assert.equal(isCurrentStreamingResult({ ...base, activeTicket: 8 }), false);
});

test("storage completions without worker identity remain valid when the active ticket is current", () => {
  assert.equal(
    isCurrentStreamingResult({
      activeTicket: 12,
      resultTicket: 12,
      desired: true,
      currentSessionId: 2,
      currentDesiredEpoch: 6,
      currentDataVersion: 0,
    }),
    true,
  );
});

test("worker restart backoff is bounded and exponential", () => {
  assert.deepEqual(
    [1, 2, 3, 4, 5, 6, 20].map(workerRestartDelayMs),
    [250, 500, 1000, 2000, 4000, 8000, 8000],
  );
});

test("queued generation and mesh work is compacted when chunks leave retention", () => {
  const queue = {
    _data: [
      undefined,
      { cx: 10, cz: 0, priority: 10 },
      { cx: 0, cz: 0, priority: 0 },
      { cx: -5, cz: 2, priority: 29 },
    ],
    _head: 1,
  };
  const queued = new Set(["10,0", "0,0", "-5,2"]);
  compactQueuedChunkJobs(queue, queued, new Set(["0,0"]));
  assert.deepEqual(queue._data, [{ cx: 0, cz: 0, priority: 0 }]);
  assert.equal(queue._head, 0);
  assert.deepEqual([...queued], ["0,0"]);
});

test("forced eviction attempts each dirty chunk once and makes bounded progress", () => {
  const queue = [
    { cx: 8, cz: 0 },
    { cx: 2, cz: 0 },
  ];
  let calls = 0;
  const result = drainEvictionQueue(
    queue,
    { cx: 0, cz: 0 },
    () => false,
    () => {
      calls += 1;
      return false;
    },
    { force: true },
  );
  assert.equal(calls, 2);
  assert.deepEqual(result, {
    attempted: 2,
    evicted: 0,
    deferred: 2,
    skippedDesired: 0,
  });
  assert.equal(queue.length, 2);
});

test("eviction removes far chunks first and cancels a returning desired chunk", () => {
  const queue = [
    { cx: 1, cz: 0 },
    { cx: 9, cz: 0 },
    { cx: 4, cz: 0 },
  ];
  const evicted = [];
  const result = drainEvictionQueue(
    queue,
    { cx: 0, cz: 0 },
    (coord) => coord.cx === 4,
    (coord) => {
      evicted.push(coord.cx);
      return true;
    },
    { force: true },
  );
  assert.deepEqual(evicted, [9, 1]);
  assert.equal(result.skippedDesired, 1);
  assert.equal(queue.length, 0);
});

test("resident capacity reserves fixed worker and save memory before admitting chunks", () => {
  assert.equal(residentChunkCapacity(1_000, 200, 100), 8);
  assert.equal(residentChunkCapacity(100, 200, 100), 1);
  assert.equal(residentChunkCapacity(0, 0, 100), 0);
});
