# Atlas Streaming Performance Architecture

## Stage 1 boundary

Stage 1 deliberately avoids changing chunk generation, persisted world data, block indexing, lighting algorithms, or mesh formats. It wraps the current `WorldManager` singleton with a temporary compatibility guard so the highest-risk lifecycle failures can be addressed before the section-based rewrite.

## Memory budget

The guard computes a default soft and hard budget from `navigator.deviceMemory` and mobile detection. The hard budget can be overridden for testing with:

```js
localStorage.setItem('atlas.performance.streamingBudgetMiB', '768')
```

The budget tracks:

- raw block, light, and metadata bytes
- cached mesh bytes
- mesh bytes owned by mounted renderers
- worker in-flight input bytes
- dirty resident chunk bytes as a separate diagnostic

At soft pressure, worker concurrency is reduced and eviction is prioritized. At hard pressure, generation and meshing each run one job at a time and the desired set is bounded to preserve headroom.

## Continuous eviction

Chunks outside the desired retention radius enter an indexed farthest-first heap. Each streaming pump drains the queue under a time and count budget. Dirty chunks are not dropped. They request a save and remain queued until persistence succeeds.

## Worker protocol

Every worker job carries:

- worker ID
- world session ID
- desired epoch
- coordinates
- ticket
- estimated input bytes

Workers return the same identity on success. Job exceptions return a serializable `JOB_ERROR`. Allocation-related errors reduce concurrency and restart only the affected worker. Heartbeats detect workers that stop responding.

The guard does not intentionally move normal generation or meshing onto the main thread. When no worker can be created, streaming pauses and reports the failure instead of running the same allocation-heavy work in the renderer.

## Compact meshing borders

The existing mesher receives four neighboring block arrays and four neighboring light arrays, but horizontal boundary checks use only one 16×384 plane from each neighboring chunk. Before posting a mesh job, the transfer guard extracts those eight planes.

The ordinary modeled mesh input changes from:

- 288 KiB of center blocks, metadata, and light
- 768 KiB of full neighboring arrays
- 1,056 KiB total

to:

- 288 KiB of center blocks, metadata, and light
- 48 KiB of neighboring boundary planes
- 336 KiB total

The worker expands the planes into sparse compatibility arrays before calling the unchanged mesher. This avoids changing meshing behavior in Stage 1 while reducing structured-clone traffic by about 68.2 percent. The section-based mesher should consume compact boundaries directly and remove the expansion.

## Stale results

Results from a previous world session are discarded. Results for chunks that have left the desired set are released before they enter world storage or the mesh cache. Ticket checks in the existing manager remain in place.

## Mesh ownership

When a mounted chunk subscriber receives a mesh result, the guard replaces the manager cache entry with a lightweight sentinel in a microtask. The mounted `BufferGeometry` remains the owner. Once the renderer unmounts and disposes the geometry, no manager cache reference keeps the transferred arrays alive.

This does not yet remove CPU attribute arrays after GPU upload. That requires a separate renderer change and context-loss policy.

## Diagnostics

`window.__ATLAS_PERF__` exposes:

- `snapshot()`
- `history()`
- `resetCapture()`
- `capture()`
- `downloadCapture(label)`
- `forceEviction()`
- `budget`

Stage 2 should replace this compatibility layer with first-class section records and explicit ownership inside `WorldManager`.
