# Atlas Streaming Architecture (post Stage 2)

This documents the world-streaming pipeline after crash-proof streaming
(Stage 1) and the section-based world/meshing migration (Stage 2). It covers
section storage, memory ownership, the worker protocol, eviction, budgets,
dirty propagation, the bulk-edit transaction, and failure handling.

## Section storage (`ChunkColumn`)

A resident chunk is a `ChunkColumn` (src/systems/world/chunkColumn.ts): 24
vertical sections of 16×16×16 cells per data plane (blocks, light, metadata).
A section is either an implicit **uniform value** (a plain number — empty
air, deep solid stone, open sky light, unset metadata, ocean water) or a
materialized `Uint8Array(4096)`. Sections materialize lazily on the first
write that actually changes a value; no-op writes are free. Columns track
per-section data/mesh versions, a dirty-section bitmask, non-air occupancy
bounds, and their materialized byte total (the raw-memory accounting input).

Layout invariant: the section-local index is the low 12 bits of the classic
`index3D` flat index, so section `i` owns bytes `[i*4096, (i+1)*4096)` of the
legacy full array. Ingest (`fromArrays`) and flattening are slice copies, and
all flat-index call sites (lighting floods, fluids, plant growth, accessors)
address cells with `idx >> 12` / `idx & 4095`.

**Save compatibility by boundary flattening:** the persisted chunk format is
unchanged. Loads ingest the legacy arrays; saves flatten dirty columns back
to byte-identical arrays. Existing worlds load identically (round-trip
tested), and the storage backends know nothing about sections.

### Section dirty propagation

- Block/metadata writes mark their own section in the column's dirty mask.
- Lighting floods write through a NET-change log: the flood's reset-and-
  repropagate pass may rewrite a cell transiently (zero it then restore it);
  only cells whose value differs after the flood mark their section dirty.
- After an edit + flood, `sweepDirtySections` (3×3 chunks — a radius-15 flood
  cannot reach farther) consumes the masks and queues one section-masked mesh
  job per affected chunk. A single interior edit remeshes ONE section; a
  section-boundary edit adds the vertical neighbor; a chunk-border edit adds
  the matching sections of the border chunk (face culling).

### Bulk-edit transaction (`WorldEditBatch`)

`worldManager.createEditBatch(opts)` — writes apply immediately (fluid/growth
logic reads state between its own writes) with setBlock-equivalent side
effects (tile entities + drops, loot-cache seeding, fluid scheduling, support
cascades — each behind a parity flag); lighting floods collapse to one per
~radius-13 edit cluster and remesh queueing dedupes per section at commit().
Used by the fluid tick (one batch per tick), tree growth, and structure/arena
placement (`setBlocks`).

## Pipeline overview

```
setDesiredChunks (App, on chunk-center change)
   │  desired set + priorities; retention scan → eviction queue
   ▼
processStreamingJobs (pumped once per frame by ChunkStreamer)
   ├─ repairDesiredChunks (round-robin self-heal, 64 checks/cycle)
   ├─ drainEvictions      (farthest-first, budgeted, every cycle)
   ├─ gen dispatch        (storage load → else worker GEN)
   └─ mesh dispatch       (center sections + neighbor border planes → worker MESH, section mask)
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
| Mesh job input (center sections) | uniform sections as numbers; materialized sections as fresh copies, **transferred** to worker, flattened into worker scratch | worker GC after job |
| Mesh job input (neighbor planes) | freshly extracted per job, **transferred** to worker | worker GC after job |
| Mesh result buffers (per section) | worker → **transferred** to main → **delivered to subscriber** | ChunkMesh disposes on unmount/section replacement |
| Mesh result without subscriber | `meshCache` (per-section, byte-accounted), bridges until first `subscribeMesh` | taken by first subscriber, or dropped on evict |

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
| `MESH` | `cx, cz, ticket, session, sectionMask, full, sections` (uniform sections as numbers, materialized as transferred 4 KiB copies) + 8 border planes (transferred) | worker flattens sections into reusable scratch |
| `DEBUG_FAIL_NEXT` | `count, kind` | test/benchmark fault injection only |
| `EVICT` | — | no-op (workers are stateless) |

Messages **from** workers: `GEN_DONE`, `MESH_DONE` (one geometry result per
requested section, buffers transferred, `durMs` measured in-worker), `PONG`,
and structured `JOB_ERROR`
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

- The **top/bottom "greedy" path still emits one quad per cell** after rect
  detection; real merging + tiled atlas sampling is Stage 3. The Stage-2
  initial-load time-to-idle regression (~15–25%: one mesher pass per occupied
  section) should be recovered there by sharing per-column scans.
- **Renderer**: one mesh per non-empty section per material (~2–4× objects vs
  per-chunk meshes, offset by tight 16-block culling bounds); no
  batching/LOD (Stage 4 — measure `renderer.info` first); cloud rebuilds
  (Stage 5), entity/drop/particle work (Stages 6–7), fluid scheduling
  internals and plant probing (Stage 8), React/App state breadth (Stage 10)
  are untouched.
- Budget levels react to main-thread accounting only; worker scratch
  capacities are bounded by the mesher's existing `HARD_MAX_FACES` guard but
  not yet reported per worker.
