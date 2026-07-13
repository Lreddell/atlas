# Atlas Streaming Architecture (post Stage 1)

This documents the world-streaming pipeline after the crash-proof-streaming
work (Stage 1 of the performance overhaul). It covers memory ownership, the
worker protocol, eviction, budgets, and failure handling.

## Pipeline overview

```
setDesiredChunks (App, on chunk-center change)
   │  desired set + priorities; retention scan → eviction queue
   ▼
processStreamingJobs (pumped once per frame by ChunkStreamer)
   ├─ repairDesiredChunks (round-robin self-heal, 64 checks/cycle)
   ├─ drainEvictions      (farthest-first, budgeted, every cycle)
   ├─ gen dispatch        (storage load → else worker GEN)
   └─ mesh dispatch       (center clone + neighbor border planes → worker MESH)
        ▼
world.worker.ts (pool of 2–4, stable ids, heartbeats)
        ▼
handleWorkerMessage: session gate → ticket gate → retention gate → accept
```

Chunk lifecycle stages: `EMPTY → REQUESTED → GENERATING → GENERATED →
MESH_QUEUED → MESHING → READY` (unchanged from before Stage 1).

## Memory ownership

| Data | Owner | Freed when |
| --- | --- | --- |
| Chunk blocks/light/metadata (`WorldState` maps) | WorldManager (main thread) | chunk evicted (never while dirty) |
| Mesh job input (center arrays) | main thread; structured-cloned to worker per job | GC after job |
| Mesh job input (neighbor planes) | freshly extracted per job, **transferred** to worker | worker GC after job |
| Mesh result buffers | worker → **transferred** to main → **delivered to subscriber** | ChunkMesh disposes on unmount/replacement |
| Mesh result without subscriber | `meshCache` (byte-accounted), bridges until first `subscribeMesh` | taken by first subscriber, or dropped on evict |

**Deliver-and-release contract:** WorldManager never retains a mesh a live
`ChunkMesh` also holds. On `MESH_DONE` with subscribers, buffers go straight
to the component (wrapped as `BufferAttribute`s without copying) and only
their byte size is remembered (`deliveredMeshBytes`, also the estimated
GPU-resident mesh memory). The last unsubscribe releases the accounting; a
remounting chunk is remeshed by a worker (`subscribeMesh` queues it) instead
of being served from a retained CPU copy. Nothing depends on GC timing.

## Worker protocol

Messages **to** workers:

| Type | Payload | Notes |
| --- | --- | --- |
| `INIT` | `workerId` | identity echoed on every reply |
| `SET_SEED` / `SET_GEN_CONFIG` | seed / config | per-worker on spawn, broadcast on world switch |
| `PING` | — | heartbeat, every 5 s |
| `GEN` | `cx, cz, ticket, session` | |
| `MESH` | `cx, cz, ticket, session, chunk, metaData, lights.center` (cloned) + 8 border planes (transferred) | |
| `DEBUG_FAIL_NEXT` | `count, kind` | test/benchmark fault injection only |
| `EVICT` | — | no-op (workers are stateless) |

Messages **from** workers: `GEN_DONE`, `MESH_DONE` (result buffers
transferred, `durMs` measured in-worker), `PONG`, and structured `JOB_ERROR`
(`workerId, jobType, cx, cz, ticket, session, errorName, errorMessage,
allocationRelated, inputBytes`).

### Border planes

The mesher samples at most one block past the chunk boundary (face culling,
AO corners, light smoothing are ±1; tangential coordinates are clamped to the
border). Each neighbor therefore ships as a 16×384 plane
(`plane[(y − MIN_Y) × 16 + tangent]`), blocks + light per side: ~48 KiB per
job instead of ~1.03 MiB of cloned full arrays. `Geometry.buildNeighborInput`
/ `extractBorderPlane` are the single extraction points; the mesher's output
is verified byte-identical to the full-array protocol by the `meshHash`
harness scenario.

## Stale-result rejection

Every job carries and every reply echoes:

1. **world session** — monotonic counter bumped by `setWorldContext()` and
   `reset()`. Mismatch ⇒ discarded before touching any state (counter:
   `streaming.staleSessionDiscarded`). Closes the window where a seed switch
   with jobs in flight could insert old-world terrain.
2. **ticket** — per-chunk monotonic id; only the active ticket is accepted
   (`staleGenDiscarded` / `staleMeshDiscarded`).
3. **retention** — on acceptance the chunk must still be desired or within
   the retention circle; otherwise the pipeline slot is released but nothing
   is inserted.

## Continuous eviction

- Retention circle = desired radius + 2 chunks hysteresis (squared-distance
  compare; per-chunk numeric coords are kept so no string keys are parsed).
- Every desired-set update: chunks outside retention are enqueued for
  eviction and their in-flight work is cancelled immediately (tickets
  invalidated, pipeline slots released, in-flight input bytes credited).
- Every scheduler cycle: `drainEvictions()` unloads farthest-first under a
  per-cycle count budget (64 / 256 / 1024 at ok / soft / hard memory
  pressure) and a 2–4 ms time budget; each candidate is visited at most once
  per cycle.
- Dirty chunks are never dropped: they stay queued, a save is requested, and
  they unload after persisting (same contract the old code had).
- A pending chunk that becomes desired again is reclaimed in place.

## Memory budget

`accountedBytes = raw chunk bytes + meshCache bytes + delivered mesh bytes +
in-flight mesh input bytes` (all tracked incrementally, O(1) to read).

| Level | Default threshold | Behavior |
| --- | --- | --- |
| ok | < 1.5 GiB | normal streaming |
| soft | ≥ 1.5 GiB | outer 10% prefetch ring skipped, gen concurrency halved, eviction drains harder |
| hard | ≥ 2 GiB | far generation rejected; effective radius shrinks so the retained disc alone fits the cap; active player area always kept |

Defaults are sized so render distance 24 streams unthrottled while capping
far below the ~4.4 GiB Chromium heap ceiling the baseline crashed against.
`worldManager.configureMemoryBudget()` adjusts limits; every value is in the
telemetry snapshot.

## Worker failure containment

- Per-job `try/catch` in the worker: a failed job posts `JOB_ERROR`, the
  worker survives, the job is requeued if still desired.
- Allocation-classified errors halve gen/mesh concurrency (restored stepwise
  after 200 successful jobs) and restart the reporting worker to release
  scratch buffers.
- Uncaught worker errors restart only that worker; its in-flight jobs are
  requeued via per-worker dispatch tracking. More than 3 restarts in 60 s
  drops the worker from the pool.
- An empty pool keeps jobs queued and retries recovery every 15 s
  indefinitely. **Generation/meshing never silently migrate to the main
  thread**; the `setTimeout` main-thread path exists only behind the explicit
  user/config workers-disabled setting. The only synchronous main-thread
  generation is the pre-existing spawn-critical `ensureChunk` (single chunk,
  bounded, unchanged).
- Heartbeats: `PING`/`PONG` every 5 s; 2 missed pongs restart the worker
  (catches silent hangs that `onerror` never reports).

## Telemetry

`src/systems/perf/perfTelemetry.ts` — counters, duration stats (ring-buffer
percentiles), and snapshot providers, exposed at `window.__ATLAS_PERF__`.
The `streaming` provider reports residency, queues, in-flight, byte
accounting, budget state, worker health. The benchmark harness
(`perf.html` + `src/perf/perfHarness.ts`, bundled only with `ATLAS_PERF=1`)
and `scripts/perf/run-perf.mjs` are documented in
`PERFORMANCE_BASELINE.md`.

## Known limits / remaining bottlenecks (future stages)

- **Full-height chunk storage** (16×384×16, 3 × 96 KiB arrays per chunk) is
  unchanged — Stage 2 (16³ sections in a `ChunkColumn`, implicit air, lazy
  metadata) is the next big win for raw residency and edit-scoped remeshing.
- **Whole-column meshing**: one block edit still remeshes full 384-block
  columns (plus border neighbors); section meshing belongs to Stage 2/3.
- The **top/bottom "greedy" path still emits one quad per cell** after rect
  detection; real merging + tiled atlas sampling is Stage 3.
- **Renderer**: up to 3 meshes + 1 group per chunk; no batching/LOD (Stage 4);
  cloud rebuilds (Stage 5), entity/drop/particle/fluid work (Stages 6–8),
  React/App state breadth (Stage 10) are untouched.
- Budget levels react to main-thread accounting only; worker scratch
  capacities are bounded by the mesher's existing `HARD_MAX_FACES` guard but
  not yet reported per worker.
