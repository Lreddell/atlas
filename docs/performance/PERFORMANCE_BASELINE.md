# Atlas Performance Baseline

Baseline measurements taken **before** any optimization work, using the
deterministic benchmark harness added in the same change series.

## Provenance

- **Starting commit (main):** `08ee5db4147dd755a7b1516c1f96d8ac40731d5c`
- **Baseline measured at:** `d9f4f00e684f6bb12c1c009e5532b1c83dca0a7d`
  (= starting commit + harness/telemetry only; no behavior changes)
- **Date:** 2026-07-13
- **Environment:** headless Chromium 141.0.7390.37 (playwright-core),
  Linux container, Node v22.22.2, 4 hardware threads reported
  (`navigator.hardwareConcurrency` → pool of 2 world workers,
  gen concurrency 3, mesh concurrency 2)
- **Mode:** `vite build` production bundle served by `vite preview`
- **Raw data:** `docs/performance/results/2026-07-13-04-41-14-baseline.{json,md}`

## How the harness measures

`npm run perf` (see `scripts/perf/run-perf.mjs` and `src/perf/perfHarness.ts`)
drives the real `WorldManager` singleton — the same worker pool, chunk
generation, lighting, and mesher the game uses — through deterministic
scenarios without mounting the React renderer:

- Frame times are real main-thread rAF deltas while the world ticks at the
  game's fixed 20 Hz and the streaming scheduler pumps once per frame,
  exactly like `GameLoop` + `ChunkStreamer`.
- Byte figures come from the streaming telemetry provider
  (`window.__ATLAS_PERF__`), heap from `performance.memory`
  (`--enable-precise-memory-info`).
- **Not measured in this mode (labelled unavailable):** renderer draw calls,
  triangles, geometry/texture counts (no Three renderer is mounted), GPU
  timings, shadows/clouds/antialiasing settings, entity/drop/particle counts.
  Storage is bypassed (empty world id) so save backlog is exercised only via
  the world-tick dirty path in `editChurn`.
- Seed 12345 for every scenario. Workload is deterministic; scheduling across
  the worker pool is not, so timing metrics vary run-to-run while chunk/byte
  metrics are stable.

## Baseline results (summary)

### Stationary spawn load

| Metric | RD 8 | RD 16 | RD 24 |
| --- | --- | --- | --- |
| desired/resident chunks at idle | 197 | 797 | 1,793 |
| raw chunk bytes | 55.4 MiB | 224.2 MiB | 504.3 MiB |
| CPU mesh bytes retained by WorldManager | 158.9 MiB | 454.4 MiB | 927.9 MiB |
| JS heap end | 283.5 MiB | 732.9 MiB | 1.43 GiB |
| mesh worker input cloned | 229.2 MiB | 823.4 MiB | 1.79 GiB |
| time to idle | 11.2 s | 26.4 s | 61.0 s |
| frame p95 / p99 | 20.3 / 34.3 ms | 19.6 / 37.7 ms | 26.7 / 55.1 ms |

### Continuous travel — 10,000 blocks at 64 blocks/s, RD 16

The reproduction of the reported
`Uncaught RangeError: Array buffer allocation failed` +
`WorldWorker Failed - Switching to Main Thread` field crash:

| Metric | Value |
| --- | --- |
| resident chunks at end (desired: 797) | **7,618 — unbounded growth** |
| raw chunk bytes | **2.09 GiB** |
| CPU mesh bytes | **2.28 GiB** |
| JS heap | **4.42 GiB — at Chromium's heap ceiling** |
| evictions performed | 1,664 (vs ~28,000 chunks generated) |
| mesh input cloned to workers | 5.50 GiB |
| frames > 50 ms | 109 |

A longer run, a higher render distance, or a machine with less headroom tips
this straight into the allocation-failure crash; the old `worker.onerror`
handler then disabled the entire pool and moved generation + meshing onto the
main thread permanently, which is the second half of the reported failure.

### Teleports — 8 × 4,096 blocks, RD 16

| Metric | Value |
| --- | --- |
| resident chunks at end | 2,730 |
| evictions performed | **16** |
| JS heap peak | 4.43 GiB |

Eviction ran only every 6th desired-set update with a 16-chunk cap; a
teleport produces a single update, so stale areas were essentially never
unloaded.

### Out-and-back — 2,000 blocks out and return, RD 16

| Metric | Value |
| --- | --- |
| resident after initial idle | 797 |
| resident after returning to start | **3,467 — no plateau restoration** |
| raw bytes idle → return | 224.2 MiB → 975.1 MiB |

### Edit churn — 10 edits/s across a chunk boundary for 30 s, RD 8

| Metric | Value |
| --- | --- |
| mesh input cloned to workers | **1.86 GiB in 30 s** (whole-column remesh + ~1.03 MiB clone per job) |
| frame p95 | 31.2 ms |

### Worker failure behavior (code inspection, verified by injection later)

`worker.onerror` → `workersEnabled = false`, `terminateWorkers()`, permanent
`setTimeout` main-thread generation and meshing. One transient worker error
removed all parallelism for the rest of the session.

### Determinism reference

Chunk-generation FNV-1a hashes (seed 12345) and mesher output hashes recorded
in the baseline JSON; all subsequent work must reproduce them exactly:

- gen: `0,0=e8082ce8`, `1,0=82d8e414`, `0,1=0d0e5528`, `-1,-1=631c31bb`,
  `-3,7=1118655a`, `100,-100=8929c0f6`, `625,625=f99c119f`,
  `-1000,250=5fe5ef94`, `4096,0=8a50777a`
- mesh (recorded at `docs/performance/results/2026-07-13-04-59-47-meshhash-before.json`):
  `0,0=80cce902`, `0,0,culled=86ef219e`, `3,-2=527734de`, `3,-2,culled=04e91205`,
  `-5,5=71645ed0`, `-5,5,culled=0ed65aa6`, `100,-100=c3c7a2db`, `100,-100,culled=976a053e`

## Reproducing

```bash
npm install            # ELECTRON_SKIP_BINARY_DOWNLOAD=1 if electron's postinstall is blocked
npm run perf -- --label baseline
# subsets:
npm run perf -- --scenarios hashCheck 'travel:renderDistance=16,blocks=10000,speed=64'
npm run perf -- --dev --no-build ...   # against the dev server instead of a build
```

Results land in `docs/performance/results/<timestamp>-<label>.{json,md}`.
