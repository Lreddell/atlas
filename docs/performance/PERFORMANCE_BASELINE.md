# Atlas Performance Baseline

## Source snapshot

- Repository: `Lreddell/atlas`
- Starting commit: `08ee5db4147dd755a7b1516c1f96d8ac40731d5c`
- Branch: `perf/streaming-memory-overhaul`
- Audit date: 2026-07-13

The connected repository still pointed `main` at the same commit named in the original audit. Runtime execution was unavailable in the implementation sandbox because the local environment could not resolve GitHub to clone/install the project. The benchmark harness added by this branch records machine-specific runtime values when run in Chromium. Source-level verification was performed against an isolated copy of the changed dependency graph; it is not a substitute for a full checkout build.

## Reproduce the runtime baseline

```bash
npm install
npm run perf:baseline
```

The baseline variant observes the starting full-column streaming behavior without installing the Stage 1 enforcement adapter. It opens `http://localhost:5175/?perf=1&variant=baseline`, runs the deterministic streaming scenarios, and downloads both JSON and Markdown reports.

Run the Stage 1 variant on the same machine/settings with:

```bash
npm run perf
```

Run the extended Stage 1 travel scenario with:

```bash
npm run perf:stress
```

## Verified source-level baseline

The starting implementation stores each resident chunk column as three full-height byte arrays:

- `blocks`: `16 × 384 × 16 = 98,304` bytes
- `light`: `98,304` bytes
- `metadata`: `98,304` bytes
- Total raw arrays per resident chunk: `294,912` bytes

Approximate raw-array pressure by circular render distance:

| Render distance | Approximate chunk count | Raw arrays only |
| --------------: | ----------------------: | --------------: |
|               8 |                     197 |        55.4 MiB |
|              16 |                     797 |       224.2 MiB |
|              24 |                   1,793 |       504.3 MiB |
|              48 |                   7,213 |        1.98 GiB |

These values exclude JavaScript object overhead, meshes, worker clones, scratch buffers, entities, textures, save snapshots, and GPU allocations.

The starting source also had these verified behaviors:

- A single worker `onerror` disabled and terminated the entire pool.
- Generation and meshing then fell back to main-thread `setTimeout` callbacks.
- Eviction scanned only every sixth desired-set update and stopped after 16 successful unloads.
- Mesh jobs included three full center arrays plus eight full-height neighbor block/light arrays: 1,081,344 input bytes for a fully surrounded chunk before structured-clone overhead.
- `WorldManager.meshCache` retained transferred geometry arrays after `ChunkMesh` wrapped them in `BufferGeometry`.
- Generation/mesh results used a ticket check, but did not carry a world-session ID, per-key desired epoch, or data version.

## Harness coverage

Automated in the first harness:

1. Stationary streaming at render distances 8, 16, and 24.
2. Continuous 10,000-block straight-line travel.
3. Optional 20,000-block stress travel.
4. Repeated long-distance teleports.
5. Travel away from an area and return.

Recorded metrics include frame-time percentiles, long-frame counts, resident chunks, raw bytes, CPU mesh bytes, estimated GPU mesh bytes, in-flight bytes, queue depths, eviction backlog, save backlog, and optional Chromium heap values. Stage 1 adds structured worker duration/error/restart, stale-result, worker-scratch, and explicit main-thread-fallback telemetry. The baseline report labels those fields unavailable instead of presenting their zero placeholders as measured values.

The first harness labels full-game cave, edit, fluid, plant, boss, save/reload, cloud, shadow, and renderer metrics unavailable until the corresponding deterministic replay layer is added. It does not substitute fabricated values for unavailable APIs.
