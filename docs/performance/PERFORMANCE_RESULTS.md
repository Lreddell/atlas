# Atlas Performance Results

## Session status

This branch implements the first benchmark/telemetry slice and a bounded Stage 1 streaming-safety implementation. Machine-specific runtime benchmarks were not executed in the implementation sandbox because the repository could not be cloned or installed there. The branch therefore does not claim an FPS, memory plateau, or crash result from this session.

Run `npm run perf:baseline` and `npm run perf` on the same machine, then attach the generated JSON/Markdown files to this document or the pull request before marking the Stage 1 acceptance gates complete.

## Source-level changes

| Metric/behavior                        | Before                                  | After in source                                       | Runtime validation                                                |
| -------------------------------------- | --------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------- |
| Raw bytes per full-height chunk        | 294,912 bytes                           | 294,912 bytes                                         | Formula/unit test only; section rewrite remains                   |
| Worker failure scope                   | Whole pool disabled                     | Failed worker isolated/restarted with bounded backoff | Backoff/pool bookkeeping assertions pass; fault injection pending |
| Failure-triggered main-thread fallback | Enabled                                 | Streaming pauses/requeues without fallback            | Pending runtime fault injection                                   |
| Job identity                           | Ticket only                             | Session/key/version/desired epoch/unique ticket       | Identity/stale-result assertions pass; integration run pending    |
| Eviction cadence                       | Every sixth desired update, max 16      | Queue drained every scheduler cycle, farthest-first   | Pure queue tests pass; long-travel runtime pending                |
| Mesh CPU ownership                     | `WorldManager` retained ordinary arrays | Cache reference released after renderer consumption   | Pending renderer memory profile                                   |
| Fully surrounded mesh input            | 1,081,344 bytes                         | 344,064 bytes                                         | Source formula and border round-trip test; runtime p95 pending    |
| Neighbor portion of mesh input         | 786,432 bytes                           | 49,152 bytes                                          | 737,280 bytes lower (93.75% neighbor reduction)                   |
| Frame p95/p99                          | Unavailable                             | Harness records both                                  | Pending harness run                                               |
| Long-distance memory plateau           | Unavailable                             | Harness records resident/byte samples                 | Pending harness run                                               |
| ArrayBuffer allocation failure         | Reported previously                     | No session evidence yet                               | Pending 10k/20k run                                               |

## Verification completed in this session

- Strict TypeScript check for the changed slice: passed.
- Browser-target esbuild bundle for the changed entry/harness/safety graph: passed.
- Node assertions for budgets, queue compaction, eviction, stale identities, worker affinity/backoff, transfer accounting, and neighbor borders: 18 passed, 0 failed.
- Full repository build/lint/Electron smoke and runtime benchmarks: unavailable because the repository could not be cloned into the execution sandbox.

## Commands

```bash
npm install
npm test
npm run typecheck
npm run lint
npm run build
npm run perf:baseline
npm run perf
npm run perf:stress
```

## Acceptance table template

Populate from the same machine/settings before and after subsequent stages.

| Metric                  |  Before |   After |  Change | Scenario              |
| ----------------------- | ------: | ------: | ------: | --------------------- |
| Frame p95               | Pending | Pending | Pending | 10,000-block travel   |
| Frame p99               | Pending | Pending | Pending | 10,000-block travel   |
| Peak tracked memory     | Pending | Pending | Pending | 10,000-block travel   |
| End/peak memory ratio   | Pending | Pending | Pending | Travel plateau        |
| Worker input bytes p95  | Pending | Pending | Pending | Chunk meshing         |
| CPU mesh retained bytes | Pending | Pending | Pending | RD16 stationary       |
| Worker errors/restarts  | Pending | Pending | Pending | Fault injection       |
| Stale results discarded | Pending | Pending | Pending | Teleport/world switch |
| Draw calls              | Pending | Pending | Pending | RD8/RD16/RD24         |
| Triangles               | Pending | Pending | Pending | RD8/RD16/RD24         |

## Remaining work

- Complete automated full-game scenarios and renderer registration.
- Run long-distance and worker-fault benchmarks on a controlled machine.
- Add Stage 2 section storage/save-boundary flattening.
- Measure whether versioned worker-local chunk caches outperform the implemented border-plane protocol without increasing retained worker memory.
- Add true greedy meshing, packed attributes, renderer batching/LOD, cloud rewrite, entity spatial indexing/sleep, particle/drop pools, fluid timing wheel, plant indexes, player/audio/environment allocation cleanup, and React/startup work.
