# Atlas Performance Results

## Current implementation status

Stage 1 code now includes:

- deterministic streaming-memory model
- unit-tested byte accounting
- unit-tested farthest-first eviction queue
- unit-tested worker assignment and retry state
- unit-tested frame-time percentile summaries
- structured worker job errors
- isolated worker restart and heartbeat handling
- stale world-session and undesired-result rejection
- continuous eviction with dirty-save deferral
- soft and hard memory pressure policies
- desired-set clamping based on estimated safe residency
- mesh-cache release after renderer ownership transfer
- compact neighbor-border payloads for mesh workers
- browser capture API for repeatable scenarios

## Worker payload model

The current whole-column mesher needs the complete center blocks, center metadata, and center light arrays, but it reads only one boundary plane from each horizontal neighbor. Stage 1 now sends those eight neighbor planes rather than eight full-height neighbor arrays.

| Mesh input | Before | Stage 1 |
|---|---:|---:|
| Four block neighbors | 384 KiB | 24 KiB |
| Four light neighbors | 384 KiB | 24 KiB |
| Total modeled mesh input | 1,056 KiB | 336 KiB |

This reduces the modeled structured-clone input per ordinary mesh job by 720 KiB, or about 68.2 percent. The worker expands the planes into compatibility arrays before invoking the existing mesher, so this improvement targets cross-thread copying and main-thread transfer pressure. Section-aware meshing should remove that worker-side expansion in a later stage.

## Automated checks completed

| Check | Result |
|---|---|
| Repository TypeScript check | Passed in GitHub Actions |
| Streaming unit tests | 23 passed, 0 failed |
| Production Vite build | Passed in GitHub Actions and Vercel |
| Deterministic memory model | Generated successfully |
| GitHub Actions workflow | Completed successfully |

The repository verification workflow ran from the pull-request merge ref using Node.js on Ubuntu. It installed dependencies, ran `npm run typecheck`, `npm run test:streaming`, `npm run build`, and `npm run perf` successfully.

## Runtime results

Runtime before and after metrics are not available yet. The implementation environment did not provide an interactive browser or Electron gameplay session. No claim is made that memory has plateaued, FPS has increased, save behavior is regression-free, or the allocation failure is resolved until the PR branch is exercised with the documented capture workflow.

## Required next verification

1. Run browser and Electron smoke tests.
2. Capture stationary render distances 8, 16, and 24.
3. Capture 10,000-block travel and repeated teleport scenarios.
4. Verify world save, close, reload, and continued travel.
5. Inject a worker job failure and verify only one worker restarts.
6. Compare memory and frame-time percentiles on the same hardware and settings.
