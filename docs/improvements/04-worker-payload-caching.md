# Worker Payload Caching

Status: Proposed  
Priority: High

## Problem

Every mesh job currently posts:

- the center chunk block array
- center metadata
- center light data
- up to four neighboring block arrays
- up to four neighboring light arrays

Because these arrays remain owned by the main thread, `postMessage` structured
clones them for the selected worker. Repeated remeshes resend mostly unchanged
megabytes of neighborhood data.

The existing worker pool dispatches round-robin, so no worker can currently assume
it has the latest copy of a particular chunk.

## Goals

- Avoid resending complete chunk neighborhoods for routine remeshes.
- Preserve the current ticket and stale-result behavior.
- Keep main-thread fallback behavior available.
- Bound worker memory and make cache ownership observable.
- Support block, light, metadata, load, and eviction updates.

## Proposed Architecture

### 1. Assign chunk affinity

Choose a stable worker for each chunk coordinate:

```text
workerIndex = hash(cx, cz) % workerCount
```

Mesh work for a chunk always goes to its owner. Generation may remain balanced
separately if generation does not depend on the cache.

### 2. Maintain worker chunk caches

Each worker stores:

- block data
- light data
- metadata
- revision numbers
- last-used timestamp or generation

The cache message protocol should include:

- `CHUNK_PUT`
- `CHUNK_PATCH`
- `CHUNK_EVICT`
- `MESH`
- `CACHE_RESET`
- world seed/config reset messages

### 3. Synchronize neighbors

A worker meshing chunk A also needs A's horizontal neighbors. Two reasonable
designs exist:

- replicate boundary-neighbor chunks to the owner of A
- route chunks in spatial regions so most neighbors share an owner

Start with replication because it is simpler and explicit. Send a full chunk once
when first required, then send revisioned patches or replacements after changes.

### 4. Use revisions

Every cached data plane should carry a revision. A `MESH` request names the
required center and neighbor revisions. The worker must reject or request missing
data rather than silently mesh stale state.

Worker results should echo:

- ticket
- center revision
- neighbor revision set
- dark-culling mode

The main thread accepts the result only if the ticket and relevant revisions are
still current.

### 5. Bound memory

Use an LRU or desired-set-based eviction policy. When a chunk leaves the streaming
window:

- remove its main ownership record when no longer needed
- invalidate replicated neighbor copies
- allow a short grace period to avoid churn at the render-distance boundary

Expose worker cache bytes and entry counts in development diagnostics.

## Incremental Delivery

1. Add stable worker affinity without changing payloads.
2. Add protocol types and full `CHUNK_PUT` cache population.
3. Mesh by coordinate and revision instead of attached arrays.
4. Send full replacement updates after edits.
5. Add compact patches only if profiling shows full replacement updates remain
   expensive.
6. Add bounded cache eviction and diagnostics.

Full replacements after edits are an acceptable first version. The major win is
avoiding resending unchanged neighbors for every mesh.

## Failure Handling

On worker error or restart:

- discard that worker's cache state
- mark its assigned chunks unsynchronized
- repopulate required data before new mesh requests
- preserve main-thread fallback

Changing world seed or generation configuration must reset every worker cache.

## Tests

- the same coordinates always route to the same live worker
- a mesh request cannot run with missing required revisions
- stale mesh results are rejected after a block or lighting update
- neighbor changes invalidate affected border meshes
- worker restart repopulates data before meshing
- cache eviction does not affect chunks still in the desired set
- world reset cannot reuse data from the previous world

## Acceptance Criteria

- Routine remesh messages contain coordinates, revisions, and options rather than
  full chunk neighborhoods.
- Profiling shows a large reduction in main-to-worker cloned bytes.
- Mesh output remains identical for the same inputs.
- Worker memory stays bounded during long-distance travel.
- Worker failure still recovers through reset or main-thread fallback.

## Risks

- Cache coherence bugs can create missing or stale border faces.
- Replicating neighbors increases worker memory even while reducing bandwidth.
- Fine-grained patches add protocol complexity; introduce them only after the
  full-replacement cache design is correct.
- Affinity can create load imbalance if one region generates unusually expensive
  chunks. Track queue depth per worker before adding work stealing.
