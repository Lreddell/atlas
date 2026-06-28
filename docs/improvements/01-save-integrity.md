# Save Integrity and Batched Persistence

Status: In progress
Priority: Critical

Progress note, 2026-06-28:

- Atlas now batches chunk writes, retains dirty chunks after a failed write,
  refuses to evict dirty chunks, supports `.acr` OPFS/desktop backends, and performs
  a best-effort final save on quit/close.
- Remaining correctness work includes per-chunk revisions/immutable save snapshots
  so an edit made during an active async save cannot be marked clean by the older
  write. The versioned chunk/block-entity plan is documented in
  [`../minecraft-source-study/02-chunk-storage-and-persistence.md`](../minecraft-source-study/02-chunk-storage-and-persistence.md).

## Problem

Chunk persistence can silently lose pending writes:

- `WorldManager.processSaveQueue()` copies `dirtyChunks` and clears the set before
  attempting writes.
- Each chunk is written through a separate IndexedDB transaction.
- `WorldStorage.saveChunk()` catches write errors and only logs them.
- The manager therefore cannot distinguish success from failure and does not
  restore failed chunks to the dirty set.
- Eviction starts a fire-and-forget write and immediately removes the dirty key.

A temporary quota, transaction, shutdown, or browser storage failure can make the
game believe data was saved when it was not.

## Goals

- Never discard dirty state until its write transaction succeeds.
- Save multiple chunks in one transaction where practical.
- Prevent overlapping save passes from losing edits made during an active save.
- Surface failures to the caller and retain data for retry.
- Keep force-save and shutdown behavior bounded and observable.

## Non-Goals

- Replacing IndexedDB with another database.
- Redesigning the world export format.
- Adding cloud synchronization.

## Proposed Design

### 1. Add a batch storage API

Add a method similar to:

```ts
saveChunks(
  worldId: string,
  chunks: Array<{
    cx: number;
    cz: number;
    blocks: Uint8Array;
    light: Uint8Array;
    meta: Uint8Array;
  }>
): Promise<void>
```

The method should:

- create one `readwrite` transaction for the chunk store
- issue all `put` operations in that transaction
- resolve only from `tx.oncomplete`
- reject from `tx.onerror` or `tx.onabort`
- not catch and suppress the error

### 2. Snapshot without forgetting

At the beginning of a save pass:

1. Snapshot the current dirty keys.
2. Build immutable save records from the current chunk arrays.
3. Start the batch transaction.
4. Remove a key from `dirtyChunks` only if the transaction succeeds and the chunk
   was not modified again during the write.

Use per-chunk revision counters or a dirty generation number. A plain set is not
enough because a block can change after the snapshot but before commit.

### 3. Serialize save passes

Keep one active save promise in `WorldManager`. A new autosave request should
either:

- await the current pass and start another if dirty revisions remain, or
- set a follow-up flag consumed when the active pass completes.

This avoids concurrent transactions racing over the same chunks.

### 4. Handle eviction safely

Do not remove dirty state immediately after starting an eviction write. Options:

- delay final chunk-data eviction until the batch commits, or
- copy the chunk arrays into a pending-save record that survives memory eviction.

The second option keeps streaming responsive while preserving data.

### 5. Report failure

Expose the last save error and save status to the existing UI/logging path:

- saving
- saved
- retry pending
- storage unavailable

Do not spam repeated errors every autosave interval. Rate-limit visible messages
while retaining detailed console diagnostics.

## Implementation Phases

1. Make `saveChunk()` reject errors instead of swallowing them.
2. Add `saveChunks()` and migrate the normal save queue to one transaction.
3. Add revision tracking and serialized save passes.
4. Make eviction retain failed or pending writes.
5. Add UI status and retry behavior.

## Tests

- A successful batch removes only the saved revisions from the dirty queue.
- A rejected transaction leaves every affected chunk dirty.
- Editing a chunk during an active save leaves its newer revision dirty.
- Two autosave triggers do not run conflicting save passes.
- Force-save waits for the current pass and drains remaining dirty revisions.
- Eviction during a failed save does not lose the pending chunk data.
- Empty save batches do not open a transaction.

Use a fake IndexedDB implementation or a small storage adapter interface so
transaction completion, failure, and abort can be controlled deterministically.

## Acceptance Criteria

- No storage-layer write error is swallowed.
- Dirty keys survive failed and aborted transactions.
- A save of multiple chunks uses one transaction per batch.
- A newer edit cannot be marked clean by an older save.
- Force-save reports failure to its caller.
- Existing worlds load without migration.

## Risks

- Retaining copied arrays for pending evictions can temporarily increase memory.
- Very large batches may create long transactions; cap batch size if profiling
  shows browser-specific stalls.
- Shutdown time is limited by the runtime. The close handler remains best effort,
  so frequent reliable autosaves are still required.
