# Atlas Performance Overhaul Goal

This document is the execution specification for a staged, measurement-driven performance overhaul of Atlas.

## Operating rules

1. When enough information exists to act, act. Do not repeatedly summarize the task, re-derive settled facts, or produce a performance plan without implementing it.
2. Measure before and after. Do not claim that a change improves performance because it appears cleaner or is theoretically faster.
3. Preserve Atlas's gameplay, visual identity, procedural determinism, current worlds, save compatibility, browser support, Electron support, and mobile behavior.
4. Do the simplest change that solves the measured problem. Do not change engine, language, renderer framework, game direction, UI design, or unrelated systems.
5. Work in staged, reviewable commits. Do not combine every architectural change into one unreviewable rewrite.
6. Audit every completion claim against commands, tests, profiles, or benchmark output from the same session. Report failed or unverified work explicitly.
7. Pause only for destructive actions, inaccessible credentials, a genuine scope change, or information only the user can supply.
8. Never force-push, delete branches, merge to `main`, or remove save compatibility without explicit approval.
9. Lead final reporting with measured outcomes. Put implementation details after the results.

## Repository

- Repository: `Lreddell/atlas`
- Default branch: `main`
- Audit reference snapshot: `08ee5db4147dd755a7b1516c1f96d8ac40731d5c`
- Working branch: `perf/streaming-memory-overhaul` or another isolated performance branch

Fetch the latest `main`, record the actual starting commit, inspect the current code, and adapt this specification to the current repository state. Do not modify `main` directly.

## Project context

Atlas is a TypeScript voxel action-adventure game built with React, React Three Fiber, Three.js, Vite, Electron, and Web Workers. It supports browser and desktop play and includes mobile-specific behavior.

Current systems include:

- Procedural voxel worlds
- A 384-block vertical world
- Biomes and deep cave systems
- Mining, building, crafting, fluids, plant growth, and lighting
- Equipment and durability
- Boats
- Drops and particles
- Positional sound and biome music
- The Magnetic Fields region
- Polarity mechanics
- Magnetic walls and launch mechanics
- The Magnetic Warden boss
- Sealed and cleansed regions
- World Editor tools
- Local filesystem, OPFS, and IndexedDB world storage

The game is moving toward more authored boss regions, stronger combat, hostile creatures, region-specific mechanical rules, larger encounters, deeper exploration, and potentially additional worlds and multiplayer later. Performance work must preserve the current game and create a stronger foundation for those additions.

## Known failure

A prior runtime failure displayed:

- `Uncaught RangeError: Array buffer allocation failed`
- `WorldWorker Failed - Switching to Main Thread`

It happened after traveling far into the world.

Treat memory growth, chunk residency, mesh ownership, worker recovery, and streaming lifecycle as the highest-priority investigation. Do not assume the screenshot proves one exact cause. Reproduce and measure it.

## Primary outcome

Make Atlas sustain long-distance exploration without:

- Unbounded heap or ArrayBuffer growth
- Stale chunk accumulation
- Worker-pool collapse
- Main-thread generation or meshing fallback
- Progressively worsening frame times
- Large recurring chunk or cloud spikes
- Save corruption
- Procedural-generation changes

Then improve CPU frame time, GPU work, draw calls, worker throughput, and simulation cost across the rest of the game.

## Baseline first

Before changing production behavior, create a development-only performance harness.

Add an `npm run perf` workflow or equivalent that can run repeatable scenarios in Chromium or Electron.

The benchmark must capture:

- Starting Git commit
- Browser or Electron version
- Viewport and pixel ratio
- Graphics settings
- Render distance
- Shadows, clouds, antialiasing, mipmaps, chunk fade, and VSync
- Frame-time p50, p95, and p99
- Frames over 25 ms, 50 ms, and 100 ms
- Average FPS as secondary information
- Three renderer draw calls
- Triangles
- Geometries
- Textures
- Resident chunks
- Resident sections after section work exists
- Blocks, light, and metadata bytes
- CPU mesh bytes
- Estimated GPU mesh bytes
- Generation queue
- Mesh queue
- Eviction backlog
- In-flight jobs
- In-flight bytes
- Save backlog
- Worker job duration
- Worker errors and restarts
- Active entities
- Sleeping entities
- Drops
- Particles
- Cloud rebuild durations
- Heap or process-memory samples where available

Do not require one browser-specific memory API for the harness to function. Use optional APIs when available and label unavailable metrics.

Create deterministic scenarios:

1. Stationary spawn at render distances 8, 16, and 24.
2. Continuous straight-line travel for at least 10,000 blocks.
3. A longer 20,000-block stress run when runtime permits.
4. Repeated long-distance teleports.
5. Travel away from an area and return to it.
6. Dense cave exploration.
7. Rapid block placement and breaking near chunk boundaries.
8. Water and lava propagation.
9. Tree growth or bulk structure placement.
10. Magnetic Warden combat with particles, projectiles, drops, music, clouds, and shadows.
11. World save, close, reload, and continue travel.
12. Clouds on/off and shadows on/off comparisons.

Store benchmark output as JSON and a readable Markdown summary. Commit the benchmark and telemetry separately before optimization.

## Architectural risks to verify

### Full-height chunk storage

The inspected code used:

- `CHUNK_SIZE = 16`
- `WORLD_HEIGHT = 384`
- Blocks as a full `Uint8Array`
- Light as a full `Uint8Array`
- Metadata as a full `Uint8Array`

That is 98,304 cells and 294,912 bytes of raw arrays per resident chunk.

At a circular render distance of 48, the desired set is approximately 7,213 chunks, meaning the raw arrays alone can approach two GiB before mesh data and overhead.

Verify the current implementation and reproduce the resident-memory curve.

### CPU mesh duplication

The inspected `WorldManager` retained `GeometryResult` arrays in `meshCache`. `ChunkMesh` wrapped the same arrays as `BufferAttribute`s and retained them after GPU upload so remounts could reuse them.

Measure this duplication and replace it with explicit ownership.

### Worker copy volume

The inspected mesh request sent:

- Full center blocks
- Center metadata
- Center light
- Four full neighboring block arrays
- Four full neighboring light arrays

This is approximately 1.03 MiB of cloned input per mesh job before geometry output.

Verify the current protocol and measure clone cost and peak memory.

### Worker failure behavior

The inspected worker error path disabled every worker, terminated the pool, reset the pipeline, and switched generation and meshing to main-thread `setTimeout` callbacks.

Remove this failure mode.

### Weak eviction

The inspected eviction pass ran only after several desired-set updates and unloaded at most 16 chunks per pass. Dirty chunks could remain fully resident while waiting for successful saves.

Reproduce whether fast travel outruns eviction.

### Whole-column meshing

The inspected mesher operated on full 384-block columns and edits could remesh an entire chunk plus neighboring chunks.

This must eventually become section-based.

### Incomplete greedy meshing

The inspected top and bottom "greedy" path detected rectangles but then emitted one quad per cell. Verify the current implementation and geometry counts.

### Scene-object count

Each chunk could create separate opaque, cutout, and transparent meshes. At high render distance this can produce thousands of scene objects and draw calls.

Measure actual counts before selecting batching or level-of-detail changes.

# Stage 1: Crash-proof streaming

Implement and verify these items before beginning the section rewrite.

## 1. Resident memory budget

Add a centralized budget model for:

- Raw chunk bytes
- CPU mesh bytes
- Estimated GPU mesh bytes
- Worker in-flight input bytes
- Worker scratch estimates
- Dirty save snapshots

Add configurable hard and soft limits.

At the soft limit:

- Stop low-priority prefetch
- Lower generation and mesh concurrency
- Prioritize eviction
- Disable unnecessary CPU mesh retention

At the hard limit:

- Reject low-priority work
- Evict far chunks immediately
- Reduce effective render distance if necessary
- Keep the active player area stable

Expose every budget value in development telemetry.

## 2. Continuous eviction

Replace occasional capped scanning with an explicit eviction queue.

Requirements:

- Enqueue a chunk when it leaves the retention set
- Cancel its queued work immediately
- Invalidate its in-flight tickets
- Prioritize farthest chunks
- Drain under a configurable time budget
- Guarantee progress every scheduler cycle
- Avoid square roots
- Avoid string parsing
- Respect dirty-save safety
- Prevent the resident set from exceeding the hard cap

Add tests for ordinary movement, fast movement, teleporting, dirty chunks, failed saves, and returning to a recently evicted location.

## 3. Stale-result rejection

Every generation and mesh job must carry:

- World session ID
- Chunk or section key
- Data version
- Desired epoch
- Unique ticket

Before accepting a result, verify all of them and confirm the result remains inside the active retention policy.

Discard stale outputs without inserting them into world storage or mesh caches.

Test world switching while jobs are in flight.

## 4. Worker error containment

Wrap every worker job in `try/catch`.

Return a structured `JOB_ERROR` message containing:

- Worker ID
- Job type
- Key
- Ticket
- Error name
- Error message
- Whether it appears allocation-related
- Job input byte count
- Worker scratch capacities when available

On error:

- Do not disable the whole pool
- Do not move the workload permanently to the main thread
- Restart only the failed worker
- Requeue only valid desired jobs
- Reduce concurrency after allocation failures
- Back off repeated failures
- Surface a useful development diagnostic

Add worker heartbeats or another health mechanism.

## 5. Eliminate normal main-thread generation and meshing fallback

Generation and meshing must remain off the renderer thread.

A spawn-critical emergency path may exist only when:

- The workload is tightly bounded
- It is measured
- It cannot recursively trigger large work
- It does not become the default after a worker error

## 6. Reduce worker transfer volume

Recommended first implementation:

- Assign chunks to workers with stable affinity
- Retain versioned chunk data in each worker
- Send full chunk data once
- Send block, light, and metadata patches after edits
- Send `EVICT` when no longer needed
- Mesh using local center and neighbor caches

When that is too invasive for the first stage, send only neighbor border planes instead of full neighbor arrays.

Do not transfer authoritative main-thread arrays if the main thread still needs them.

Evaluate `SharedArrayBuffer` only after checking cross-origin isolation, Electron behavior, mobile browser behavior, and synchronization complexity.

## 7. Fix mesh ownership

Define one owner for each mesh buffer.

Preferred flow:

1. Worker creates result.
2. Worker transfers result.
3. Renderer creates `BufferGeometry`.
4. `WorldManager` releases ordinary CPU geometry arrays.
5. A small bounded least-recently-used cache may retain selected meshes only when measurements justify it.
6. Geometry disposal updates accounting immediately.

Do not leave ownership dependent on garbage collection.

## Stage 1 acceptance

- No `Array buffer allocation failed` during the long-distance benchmark.
- A worker error does not disable the entire pool.
- No permanent generation or meshing on the main thread.
- Resident raw and mesh bytes plateau during continuous travel.
- Moving away and returning does not produce unbounded growth.
- Stale results are counted and discarded.
- Saves remain valid.
- Existing deterministic chunk hashes remain unchanged.

Commit Stage 1 independently.

# Stage 2: Section-based world and meshing

Migrate from full 16×384×16 runtime chunks to 16×16×16 vertical sections.

There are 24 possible vertical sections per chunk column.

## Requirements

- Allocate a section only when needed.
- Represent empty-air sections implicitly.
- Consider implicit uniform-solid sections only when it remains simple and safe.
- Allocate metadata lazily.
- Preserve the existing public `WorldManager` behavior where practical.
- Do not force every caller to understand storage internals.
- Introduce a `ChunkColumn` containing section records.

Each section should track:

- Blocks
- Light
- Optional metadata
- Data version
- Mesh version
- Dirty state
- Occupancy bounds
- Render state
- Save state

## Save compatibility

Do not break existing worlds.

Use one of:

- Flatten sections to the current persisted arrays at the storage boundary
- Version the save format with tested migration and rollback

Prefer boundary flattening first because it reduces migration risk.

Add round-trip tests for:

- Old save to new runtime
- New runtime back to compatible persisted form
- Blocks
- Light
- Metadata
- Tile entities
- Boss progression
- Boats
- Inventory and equipment
- World time
- Edited chunks

## Section dirty propagation

A block edit should dirty:

- Its own section
- An adjacent section only when touching a section boundary
- Horizontal neighbor sections only when touching chunk boundaries

Do not remesh an entire 384-block column for one block edit.

## Bulk world-edit transaction

Create a transaction API used by:

- Fluids
- Tree growth
- Structure placement
- Arena creation
- Boss environmental effects
- Fill and set commands
- Lighting cascades

The transaction should:

1. Apply block and metadata changes.
2. Collect affected sections.
3. Collect lighting bounds.
4. Update tile entities and drops.
5. Deduplicate remesh work.
6. Queue each affected section once.
7. Emit notifications after the batch.

## Stage 2 acceptance

- Existing saves load identically.
- Deterministic generation output is unchanged unless an explicitly approved optimization has equivalence tests.
- A single interior block edit remeshes one section.
- A section-boundary edit remeshes only required neighbors.
- Tree and fluid batches do not enqueue duplicate whole-column meshes.
- Raw resident memory is substantially lower in ordinary terrain.
- Long travel remains bounded.

Commit Stage 2 independently.

# Stage 3: Mesher

## Genuine greedy face merging

Replace any path that detects rectangles but still emits one quad per block with real merging.

Build a face signature including:

- Block material or texture tile
- Face direction
- Rotation
- Transparency class
- Ambient-occlusion corner values
- Sky-light corner values
- Block-light corner values
- Any shader-relevant state

Merge only compatible faces.

Do not merge:

- Shaped blocks
- Stairs
- Slabs
- Beds
- Fluids when heights differ
- Cross plants
- Special boss geometry
- Faces requiring distinct transparency ordering

## Tiled atlas sampling

A merged face must repeat its 16×16 block texture rather than stretch it.

Pass:

- Tile index
- Local face coordinates
- Rotation

Use shader-local wrapping to sample repeated tiles while respecting atlas padding.

Add visual regression screenshots for:

- Grass
- Stone
- Ores
- Logs
- Leaves
- Water
- Glass
- Stairs
- Slabs
- Beds
- Magnetite
- Polarity blocks
- Caves
- Ambient occlusion
- Torch light
- Sunlight transitions

## Packed attributes

Measure and implement safe compact formats:

- Normalized `Uint8` colors
- Compact normals or face IDs
- Local section positions in `Uint16` or another exact format
- `Uint16` indices whenever possible
- `Uint32` indices only when needed

Do not reduce visible precision.

## Scratch-buffer bounds

- Track capacities.
- Set realistic section-level ceilings.
- Add shrink behavior for rare outliers.
- Prevent one pathological mesh from permanently inflating every worker.
- Avoid holding scratch and multiple full result copies simultaneously where practical.

## Precomputed lookup tables

Replace hot-path allocations and branch chains with precomputed tables for:

- Block rendering class
- Texture tile by block, face, and metadata
- Shape boxes
- Opacity and occlusion flags
- Collision flags
- Directional face behavior

Do not alter special-case behavior without tests.

## Stage 3 acceptance

- Representative chunk and section vertex/index counts decrease.
- Worker peak memory decreases.
- Visual screenshot tests pass.
- Lighting and ambient occlusion remain correct.
- Transparent blocks remain correct.
- Mesh generation p95 improves.
- No new hard face-cap failures.

# Stage 4: Renderer

## Metrics first

Use `renderer.info` to capture:

- Calls
- Triangles
- Points
- Lines
- Geometries
- Textures

Record counts at render distances 8, 16, and 24.

## Chunk and section object strategy

Avoid one React component and up to three Three meshes for every distant chunk when a coarser representation is sufficient.

Evaluate:

- Persistent render records managed imperatively
- `BatchedMesh` for compatible static opaque sections
- Regional batching for distant terrain
- Separate near, middle, and far representations
- Surface-only far meshes
- Simplified far lighting
- Hiding rather than mounting and unmounting where appropriate

Keep editable near sections independent.

## Shadows

- Restrict shadow casters to a near radius.
- Do not let every visible chunk cast shadows.
- Update the shadow map only when camera or light movement crosses a threshold when possible.
- Verify boss and entity shadows remain readable.

## Transparency

- Separate water from other transparent blocks if it improves sorting and overdraw.
- Use `FrontSide` where the geometry permits it.
- Avoid transparent fade materials on thousands of chunks simultaneously.
- Put a strict cap on concurrent chunk fades during teleport or rapid travel.

## Level of detail

Near:

- Full geometry
- Caves
- Transparent content
- Shadows
- Exact lighting

Middle:

- Ordinary surface geometry
- Reduced cave interior work
- Limited shadows

Far:

- Simplified surface representation
- No cave interiors
- No dynamic shadows
- Bounded draw calls

Do not make distant terrain visibly pop. Preserve fog and fade behavior.

# Stage 5: Clouds

Profile current cloud rebuild cost and replace full main-thread geometry reconstruction.

Preferred design:

- Fixed reusable cloud field
- Shader-driven scrolling
- One or a small number of draw calls
- No full rebuild when the player crosses a cloud-grid cell
- Cloud coverage independent from extreme terrain render distance
- Correct fades and weather coloration

Acceptable alternative:

- Fixed instanced tiles
- Incremental strip updates
- Typed reusable buffers
- Valid culling bounds

Do not remove the current visual character of clouds merely to gain FPS.

# Stage 6: Entities and combat foundation

## Spatial hash

Create a spatial index for entities and projectiles.

Use it for:

- Melee candidate queries
- Interaction raycasts
- Projectile collision
- Magnetic-field sources
- Nearby simulation
- Rendering visibility

## Simulation levels

Suggested starting policy:

- Active bosses and nearby combat: full tick rate
- Nearby passive entities: reduced rate
- Distant passive entities: low rate or sleep
- Unloaded entities: persistence only

Validate behavior before selecting exact radii and rates.

## Rendering

- Share geometry and materials by entity kind.
- Instance repeated simple entities.
- Instance or batch projectiles where possible.
- Pool shockwaves and temporary effects.
- Refactor the boat model to shared geometry and material resources.
- Keep unique bosses as individual objects when appropriate.

## Allocation cleanup

- Do not allocate entity arrays every frame.
- Use stable iterators or dense storage.
- Reuse magnetic-field result buffers.
- Use squared distances when exact length is unnecessary.
- Pool projectile and effect records.

# Stage 7: Drops and particles

## Drops

- Reduce ordinary physics to 20–30 Hz.
- Sleep settled drops.
- Wake for player proximity, motion, fluid changes, or magnetic forces.
- Cache block light until a drop changes cell or the section lighting version changes.
- Cache 2D and 3D visual classification.
- Upload only changed instance ranges.
- Restore culling with correct bounds or spatial groups.
- Add a global drop budget and graceful overflow behavior.

## Block particles

- Use pooled structure-of-arrays storage.
- Use integer IDs.
- Add a global particle cap.
- Use swap-remove.
- Sample light at spawn or low frequency.
- Group by render mode and per-instance tile index rather than producing many material groups.
- Reduce or remove collision for tiny debris.
- Use adaptive quality based on measured frame-time pressure.

## Ambient and effect particles

- Pool storage.
- Avoid splice-based removal.
- Update only active buffer ranges.
- Cache biome and weather state until the player crosses a relevant boundary.
- Keep one or a few draw calls.
- Add dynamic budgets.

# Stage 8: Fluids and plants

## Fluids

Replace string-keyed due-time scanning with either a game-tick timing wheel or an indexed min-heap.

Requirements:

- Packed numeric keys
- No `Date.now` scheduling
- Reusable breadth-first-search arrays
- Visitation stamps instead of `Set<string>`
- Static neighbor offsets
- Strict time budget
- Active simulation radius
- Batch block edits
- One remesh per dirty section after the batch

Preserve all current source, falling, draining, water, lava, cobblestone, and obsidian behavior.

Add focused fluid regression tests.

## Plant growth

Maintain a per-chunk sapling index.

Update it during:

- Generation
- Load
- Placement
- Breaking
- Tree growth
- Chunk eviction

Randomly tick indexed saplings rather than scanning full vertical columns.

Place trees through the bulk-edit transaction.

# Stage 9: Player, interaction, audio, and environment

## Player

- Reuse movement-intent objects.
- Reuse vectors and collision structures.
- Cache current and neighboring chunk arrays for one physics step.
- Avoid duplicate block conversions and Map lookups.
- Only call React setters on value changes.
- Only update camera projection when FOV changes materially.
- Preserve exact movement feel, wall interaction, boats, magnetism, fall damage, swimming, crouching, and collision.

Create movement replay tests when practical.

## Interaction

- Cache voxel-raycast results until camera, player, or world version changes, or test a 30 Hz highlight update.
- Keep click attacks immediate.
- Use the entity spatial hash for entity raycasts.
- Use numeric target signatures.
- Preserve shaped-block outlines and mining behavior.

## Audio

- Update listener transforms at a measured lower rate or on transform thresholds.
- Replace duplicate music polling with event-driven state.
- Keep positional audio accurate.
- Profile decoded-buffer retention before adding eviction.

## Day/night and environment

- Compute expensive environment state at 10–20 Hz.
- Interpolate visual values.
- Cache biome until crossing a boundary.
- Skip invisible aurora or atmospheric objects.
- Update shadow state only as needed.
- Keep music, moon phases, blood moons, fog, lighting, and biome ambience correct.

## Canvas capture

Investigate Electron's always-on `preserveDrawingBuffer`.

Prefer:

- Normal renderer with preservation disabled
- Explicit render-target or capture path for panoramas

Change it only after panorama tests and measured comparison.

# Stage 10: React and startup

Do this after world, mesh, renderer, and simulation bottlenecks.

- Split large `App` state into narrowly subscribed stores or components where profiles show broad reconciliation.
- Keep high-frequency gameplay values outside React render flow.
- Avoid new objects in `useFrame`.
- Reuse Three objects.
- Prefer visibility changes over expensive remounting for persistent scene content.
- Analyze the Vite production bundle.
- Lazy-load World Editor, atlas viewer, and other non-gameplay tools when this measurably improves startup.
- Do not trade runtime correctness for cosmetic React refactors.

# Data-structure cleanup

Where profiling supports it:

- Replace string chunk keys with packed numeric keys or nested Maps.
- Avoid `split(',').map(Number)` in hot paths.
- Consolidate separate chunk, light, metadata, and stage maps into a coherent chunk-column record.
- Precompute section and local indices.
- Store occupancy bounds in the section rather than rescanning the full vertical range for each mesh.
- Avoid allocating temporary neighbor arrays and closures inside high-frequency loops.

Packed keys must support negative coordinates safely and include tests for extreme world positions.

# Testing requirements

Run and pass:

- Existing tests
- Typecheck
- Lint where currently clean
- Production build
- Electron build or smoke test where practical
- Storage tests
- Worker tests
- World-generation determinism tests
- Mesh visual regression tests
- Chunk-key tests
- Queue tests
- Eviction tests
- Stale-ticket tests
- Worker restart tests
- Section dirty-propagation tests
- Save round-trip tests
- Fluid tests
- Movement tests
- Long-travel benchmark

Do not fix failing tests by weakening assertions unless the previous assertion is proven wrong.

# Performance acceptance

Do not invent universal FPS targets because hardware varies.

Use the same machine and settings for before and after comparisons.

Required outcomes:

- Long-distance memory reaches a stable plateau.
- No ArrayBuffer allocation failure.
- No whole-pool worker shutdown.
- No normal main-thread generation or meshing.
- No stale result retained after leaving the desired region.
- Lower p95 and p99 frame times in the relevant benchmark.
- Lower peak resident memory.
- Lower worker transfer bytes.
- Lower chunk-mesh CPU retention.
- Lower draw calls or triangles where the renderer stages target them.
- No procedural-generation hash changes unless explicitly documented and approved.
- Existing worlds load.
- Saves round-trip.
- Magnetic Fields, the Warden fight, caves, fluids, boats, particles, lighting, and world editing remain functional.

For every stage, provide a table:

| Metric | Before | After | Change | Scenario |
|---|---:|---:|---:|---|

Include unsuccessful experiments and revert them rather than keeping speculative changes.

# Commit structure

Use small commits such as:

1. `perf: add deterministic benchmark and telemetry`
2. `perf: enforce resident chunk memory budget`
3. `perf: add continuous chunk eviction`
4. `fix: reject stale streaming results`
5. `fix: contain and restart worker failures`
6. `perf: reduce mesh worker transfer volume`
7. `perf: release CPU mesh buffers after upload`
8. `perf: introduce section-based chunk storage`
9. `perf: mesh and dirty individual sections`
10. `perf: implement true greedy face merging`
11. `perf: pack mesh attributes`
12. `perf: batch distant section rendering`
13. `perf: replace cloud geometry rebuilds`
14. `perf: add entity spatial indexing and sleep`
15. `perf: optimize drops and particle pools`
16. `perf: batch fluid and tree world edits`
17. `perf: remove remaining hot-loop allocations`
18. `docs: add final performance report`

Adapt the commits to the code found. Do not make empty or artificial commits.

# Required documentation

Create:

- `docs/performance/PERFORMANCE_BASELINE.md`
- `docs/performance/PERFORMANCE_RESULTS.md`
- `docs/performance/ARCHITECTURE.md`

Document:

- Actual starting commit
- Benchmark hardware and software
- Scenarios
- Measurements
- Changes made
- Memory ownership
- Worker protocol
- Section layout
- Save compatibility
- Known limits
- Remaining bottlenecks
- Reverted experiments
- Exact commands to reproduce results

# Final reporting

Lead with the measured result.

Then include:

1. Starting and ending commit
2. Branch name
3. Files changed
4. Tests and builds run
5. Before and after metric table
6. Memory plateau result
7. Worker failure result
8. Long-distance benchmark result
9. Save compatibility result
10. Visual or gameplay regressions found
11. Work that remains
12. Commits created

Do not say the game is optimized, fixed, stable, faster, crash-proof, or passing unless evidence from the same session supports that exact claim.
