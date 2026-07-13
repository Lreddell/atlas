# Performance Architecture

## Stage 1 streaming safety layer

`src/systems/performance/streamingSafety.ts` installs once, before the main application is dynamically imported. It wraps the existing `WorldManager` singleton instead of changing its public API or save format.

The adapter is intentionally isolated so the section-storage rewrite can later replace internals without forcing gameplay callers to change.

## Memory budget

Default tracked limits:

- Soft limit: 512 MiB
- Hard limit: 768 MiB

Tracked ownership categories:

- Raw chunk block/light/metadata arrays
- CPU mesh arrays retained by `WorldManager.meshCache`
- Estimated GPU mesh bytes by resident chunk
- Worker in-flight input bytes
- Worker border-cache and mesher scratch estimates reported by heartbeat and job responses
- Dirty save snapshots

The center-first desired list is capped to the estimated number of resident chunks the soft budget can hold. This reserves the hard limit for transient worker output, dirty-save snapshots, and estimation error. Reaching the soft limit reduces generation and mesh concurrency to one each and prevents farther low-priority chunks from entering residency. Hard-limit pressure drains eviction immediately and leaves worker jobs queued until dirty chunks save or memory returns below the cap.

The active player area stays first because desired chunks already arrive center-first. At very high configured render distances, the effective distance can therefore be lower until Stage 2 section storage reduces per-column memory.

## Continuous eviction

The adapter tracks numeric `{cx, cz}` coordinates as chunks enter the desired set. Chunks leaving the set enter a farthest-first eviction queue using squared distance.

Each streaming scheduler cycle drains the queue under a 2 ms budget and always attempts at least one item. Hard-budget pressure drains without the time cap.

Eviction delegates to the existing dirty-safe `WorldManager.evict` path. Dirty chunks remain resident and trigger the existing save queue; they are retried after persistence completes. In-flight tickets, accounting, mesh ownership records, worker affinity state, and GPU estimates are removed when eviction succeeds.

## Job identity and stale-result rejection

Every worker generation/mesh envelope now includes:

- `worldSessionId`
- chunk key through `cx`/`cz`
- `dataVersion`
- per-key `desiredEpoch`
- `uniqueTicket`
- worker ID
- input byte count

Workers echo the identity fields on success and error. The main thread accepts a result only when:

- the original active ticket still matches
- the chunk is still desired
- the world session matches
- the key's desired epoch matches
- the key's data version matches
- the unique ticket matches

Rejected outputs increment telemetry and are not inserted into world storage or the mesh cache. Valid desired jobs are requeued after stale/error cleanup.

A per-key desired epoch changes when a chunk leaves and later re-enters the desired set. Ordinary movement does not invalidate jobs for chunks that remain desired.

## Worker protocol and failure containment

`world.worker.ts` wraps each generation/mesh job in `try/catch` and returns `JOB_ERROR` with:

- Worker ID
- Job type/key/ticket
- Error name/message
- Allocation-related classification
- Input byte count
- Current scratch-capacity fields
- Job duration

Workers answer `PING` with `HEARTBEAT` and also emit periodic heartbeats.

The main thread uses stable chunk-to-worker affinity. A worker failure:

1. Releases only jobs assigned to that worker.
2. Requeues jobs that remain desired.
3. Reduces concurrency after allocation-related failures.
4. Terminates/restarts only that worker.
5. Applies exponential restart backoff.

No failure path deliberately switches generation or meshing to the renderer thread. When no healthy worker exists, streaming pauses with queued jobs and a diagnostic status.

The existing workers-disabled setting now selects a single-worker compatibility mode. Generation and meshing remain off the renderer thread, while concurrency and worker memory are reduced. Pool resizing requeues jobs assigned to removed workers and invalidates delayed restarts from the previous pool.

## Worker input ownership

Mesh dispatch keeps the authoritative center block, metadata, and light arrays on the main thread. They remain structured-cloned because gameplay and storage still own them.

Neighbor data uses copied border planes:

- Previous fully surrounded input: `3 × 98,304` center bytes plus `8 × 98,304` neighbor bytes = `1,081,344` bytes.
- Stage 1 input: `3 × 98,304` center bytes plus `8 × 6,144` border bytes = `344,064` bytes.
- Reduction: `737,280` bytes, or 68.2%, per fully surrounded mesh request.

The newly allocated border-plane buffers are transferred to the selected worker. Each worker inflates them into reusable sparse full-array scratch because the existing mesher indexes neighbor arrays with the legacy full-column layout. Only the boundary cells read by the mesher are populated. Heartbeats report both allocated neighbor scratch and the mesher's current capacity estimate so the central memory budget includes them.

This is the lower-risk Stage 1 protocol. Stable worker affinity is already in place, so a later measured change can replace border planes with versioned worker-local chunk caches and edit patches.

## Mesh ownership

The worker transfers geometry arrays to the main thread. A subscribed chunk renderer receives the arrays synchronously and wraps them directly in Three `BufferAttribute` objects. After the subscriber consumes the result, the adapter removes the duplicate `WorldManager.meshCache` reference in a microtask. The renderer-owned `BufferGeometry` remains the sole CPU owner of those attribute/index arrays until disposal; its bytes are tracked separately from the estimated GPU upload.

An uploaded-key marker prevents normal desired-set updates from remeshing every already-rendered chunk. If the React chunk component later remounts and no CPU mesh is retained, subscription queues a fresh mesh for that chunk.

Uploaded CPU/GPU estimates are removed when the last chunk subscriber unmounts or the chunk is evicted. Actual geometry/GPU disposal remains owned by `ChunkMesh`/Three.

## Save compatibility and determinism

Stage 1 does not alter:

- Chunk generation functions or seed/config propagation
- Block/light/metadata array layout
- Storage backend payloads
- World IDs or save versions
- Gameplay systems

Existing worlds continue using the same persisted full-column arrays. Section storage and save-boundary flattening remain Stage 2 work.

## Development telemetry

The harness supports two variants: `baseline` installs an observer only, while `stage1` installs the enforcement adapter used by normal gameplay. `window.__ATLAS_PERFORMANCE__` exposes:

- `sample()`
- `configureBudget()`
- `registerRenderer()`
- `getRecentWorkerErrors()`

The API uses optional Chromium heap metrics. It functions when `performance.memory` is unavailable and reports `null` for unavailable values.

## Known Stage 1 limits

- The safety layer adapts the current full-column `WorldManager` internals at startup. Stage 2 should move these policies behind explicit typed manager interfaces while introducing section records.
- GPU bytes are estimated from uploaded attribute/index arrays; browser drivers may allocate more.
- Dirty chunks are never discarded to satisfy the hard limit. Streaming pauses and forces save progress instead. A failed storage backend can therefore keep memory above the configured limit while preserving edits.
- The streaming-only harness does not provide gameplay/render fidelity coverage for caves, fluids, boss combat, clouds, shadows, or save/reload.
