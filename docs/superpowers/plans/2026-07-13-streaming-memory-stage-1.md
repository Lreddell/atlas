# Streaming Memory Stage 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add measurable, crash-resistant chunk streaming protections without changing world generation, save data, rendering APIs, or gameplay behavior.

**Architecture:** Install a compatibility guard around the existing `WorldManager` singleton at application startup. The guard adds memory accounting, desired-set clamping, continuous eviction, stale-result rejection, isolated worker recovery, job-level error messages, mesh-cache ownership release, frame-time capture, and a deterministic memory model while leaving the current world and mesher implementations intact.

**Tech Stack:** TypeScript, Web Workers, React entrypoint, Node test runner, TypeScript transpile API, Vite.

## Global Constraints

- Preserve procedural determinism and existing save formats.
- Keep generation and meshing off the renderer thread.
- Do not change engine, language, renderer framework, UI design, or game direction.
- Keep browser, Electron, and mobile behavior supported.
- Measure before claiming performance improvement.
- Keep the PR draft until runtime benchmarks and gameplay smoke tests are complete.

---

### Task 1: Add pure streaming budget and queue primitives

**Files:**
- Create: `src/systems/world/streamingBudget.ts`
- Create: `src/systems/world/streamingEviction.ts`
- Create: `src/systems/world/streamingGuardState.ts`
- Create: `src/systems/world/streamingMetrics.ts`
- Create: `src/systems/world/workers/streamingProtocol.ts`
- Test: `scripts/perf/tests/*.test.ts`

**Interfaces:**
- Produces `getDefaultStreamingBudget`, `estimateTransferBytes`, `byteLengthOfGeometryResult`, `EvictionQueue`, `StreamingGuardState`, `summarizeFrameTimes`, and serializable worker error types.

- [x] Write failing tests for byte accounting, queue ordering, assignment tracking, frame percentiles, allocation-error classification, and retry backoff.
- [x] Run the tests and confirm missing-module failures.
- [x] Implement the minimal primitives.
- [x] Run `node scripts/perf/run-streaming-tests.mjs` and confirm all tests pass.

### Task 2: Add job-level worker error handling

**Files:**
- Modify: `src/systems/world/workers/world.worker.ts`

**Interfaces:**
- Consumes `normalizeWorkerError` from `streamingProtocol.ts`.
- Produces `GEN_DONE`, `MESH_DONE`, `JOB_ERROR`, and `PONG` messages with worker, session, epoch, ticket, and input-byte metadata.

- [x] Wrap generation and meshing jobs in `try/catch`.
- [x] Echo job identity on successful messages.
- [x] Add `PING` and `PONG` support.
- [x] Preserve transferable output buffers.
- [x] Typecheck the worker against strict compiler settings.

### Task 3: Install crash-proof streaming guards

**Files:**
- Create: `src/systems/world/streamingGuards.ts`
- Modify: `src/index.tsx`

**Interfaces:**
- Installs once against the `worldManager` singleton.
- Exposes `window.__ATLAS_PERF__` with `snapshot`, `history`, `resetCapture`, `capture`, `downloadCapture`, `budget`, and `forceEviction`.

- [x] Add world-session and desired-epoch tracking.
- [x] Add worker assignment byte accounting.
- [x] Reject stale worker results before insertion.
- [x] Recover job failures without disabling the entire pool.
- [x] Restart only failed workers and add heartbeat checks.
- [x] Prevent normal main-thread generation and meshing fallback by keeping a valid worker pool or pausing streaming.
- [x] Add continuous farthest-first eviction with dirty-save deferral.
- [x] Add soft and hard memory pressure policies.
- [x] Bound the desired set according to the memory budget.
- [x] Release completed mesh results from `WorldManager.meshCache` after a renderer subscriber takes ownership.
- [x] Add frame-time and streaming diagnostics capture.
- [x] Typecheck the guard against strict compiler settings with repository-compatible stubs.

### Task 4: Add reproducible local checks

**Files:**
- Create: `scripts/perf/run-streaming-tests.mjs`
- Create: `scripts/perf/streaming-model.mjs`
- Modify: `package.json`
- Modify: `tsconfig.json`
- Modify: `.gitignore`

- [x] Add `npm run test:streaming`.
- [x] Add `npm run perf`.
- [x] Generate the render-distance memory model.
- [x] Exclude generated test and performance artifacts from normal typechecking and source control.

### Task 5: Document architecture and verification state

**Files:**
- Create: `docs/performance/PERFORMANCE_BASELINE.md`
- Create: `docs/performance/PERFORMANCE_RESULTS.md`
- Create: `docs/performance/ARCHITECTURE.md`

- [x] Document the static memory model and capture workflow.
- [x] Document worker recovery and memory ownership.
- [x] State which runtime claims remain unverified.

### Task 6: Repository verification

- [x] Run repository `npm run typecheck`.
- [x] Run repository `npm run build`.
- [x] Run `npm run test:streaming`.
- [x] Run `npm run perf`.
- [x] Inspect Vercel status.
- [ ] Run browser and Electron long-distance scenarios.
- [ ] Record before and after runtime captures on the same hardware and settings.
