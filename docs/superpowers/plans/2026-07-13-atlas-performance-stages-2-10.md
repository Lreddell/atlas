# Atlas Performance Stages 2–10 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the remaining measured performance stages while preserving gameplay, deterministic generation, current worlds, save compatibility, browser/Electron/mobile behavior, and Atlas’s visual identity.

**Architecture:** Keep the current public `WorldManager` surface stable while moving storage, meshing, rendering, and simulation behind focused runtime services. Persist the existing full-column format at the storage boundary until migration evidence justifies a save-format change. Each stage must land as an independently reviewable commit with focused regression tests and explicit telemetry.

**Tech Stack:** TypeScript, React, React Three Fiber, Three.js, Vite, Electron, Web Workers, Node test runner, esbuild test bundling.

## Global Constraints

- Never modify `main` directly; continue on `perf/streaming-memory-overhaul`.
- Preserve procedural determinism and verify representative chunk hashes.
- Preserve existing save files by flattening section data at persistence boundaries.
- Do not intentionally move generation or meshing to the renderer thread.
- Do not change engine, language, renderer framework, game direction, UI design, or unrelated systems.
- Every production behavior change begins with a failing focused test.
- Report runtime metrics as unavailable when the current environment cannot execute Chromium/Electron.

---

### Task 1: Section storage and persistence boundary

**Files:**
- Create: `src/systems/world/sections/chunkSection.ts`
- Create: `src/systems/world/sections/chunkColumn.ts`
- Create: `src/systems/world/sections/sectionedColumnMap.ts`
- Create: `src/systems/world/sections/chunkColumn.test.mjs`
- Modify: `src/systems/world/worldTypes.ts`
- Modify: `src/systems/world/worldStore.ts`
- Modify: `src/systems/performance/streamingSafety.ts`

**Interfaces:**
- `ChunkSection`: lazy `blocks`, `light`, optional `metadata`, versions, dirty/save/render state, occupancy bounds.
- `ChunkColumn`: 24 optional sections and `flattenBlocks/flattenLight/flattenMetadata` compatibility methods.
- `SectionedColumnMap`: `Map<string, Uint8Array>`-compatible boundary used by existing manager code without retaining flattened columns.
- `getBlockAt/setBlockAt/getLightAt/setLightAt/getMetadataAt/setMetadataAt` direct section accessors.

- [ ] Write tests proving empty sections remain implicit, metadata is lazy, negative/minimum-Y indexing is exact, old full arrays round-trip byte-for-byte, and section bytes are lower for ordinary sparse terrain.
- [ ] Run the focused tests and confirm they fail because section types/accessors do not exist.
- [ ] Implement section records, occupancy tracking, flatten/split helpers, and compatibility views.
- [ ] Install section-backed maps on every new/reset world state and teach Stage 1 accounting to use allocated section bytes rather than logical column length.
- [ ] Run focused tests, typecheck, bundle, and existing storage tests.
- [ ] Commit: `perf: introduce section-based chunk storage`.

### Task 2: Section dirty propagation and bulk edit transactions

**Files:**
- Create: `src/systems/world/sections/sectionDirty.ts`
- Create: `src/systems/world/worldEditTransaction.ts`
- Create: `src/systems/world/sections/sectionDirty.test.mjs`
- Create: `src/systems/world/worldEditTransaction.test.mjs`
- Modify: `src/systems/performance/streamingSafety.ts`
- Modify: `src/systems/world/plantGrowth.ts`
- Modify: `src/systems/world/fluids.ts`

**Interfaces:**
- `affectedSectionsForEdit(x,y,z): SectionKey[]`.
- `WorldEditTransaction.apply(edits)` deduplicates section remesh, lighting bounds, tile/drop updates, and notifications.
- Additive world-manager methods: `beginWorldEditTransaction()` and `setBlocksTransactional(edits)`.

- [ ] Write tests for interior, vertical-boundary, horizontal-boundary, corner, tree, fluid, and repeated-edit propagation.
- [ ] Verify tests fail before implementation.
- [ ] Implement numeric section keys and one-notification/one-remesh-per-section batching.
- [ ] Route structural `setBlocks`, trees, and fluid batches through the transaction API without changing fluid/tree outcomes.
- [ ] Run focused tests and compatibility tests.
- [ ] Commit: `perf: dirty and batch individual world sections`.

### Task 3: Section worker protocol and genuine greedy meshing

**Files:**
- Create: `src/systems/world/meshing/sectionMesher.ts`
- Create: `src/systems/world/meshing/faceSignature.ts`
- Create: `src/systems/world/meshing/sectionMesher.test.mjs`
- Modify: `src/systems/world/workers/world.worker.ts`
- Modify: `src/systems/performance/streamingSafety.ts`
- Modify: `src/components/ChunkMesh.tsx`

**Interfaces:**
- Worker messages `SECTION_SYNC`, `SECTION_PATCH`, `SECTION_MESH`, `SECTION_EVICT`.
- `SectionGeometryResult { sectionY, dataVersion, meshVersion, opaque, cutout, transparent }`.
- Face signature includes material/tile, direction, rotation, transparency class, AO, sky light, block light, and shader state.

- [ ] Write failing tests demonstrating a 16×16 planar surface emits one merged quad, incompatible lighting/materials do not merge, shaped/fluid/cross/special blocks remain unmerged, and repeated atlas coordinates tile instead of stretch.
- [ ] Implement true 3-axis greedy masks over 16³ sections with bounded reusable scratch.
- [ ] Pack normalized colors/face IDs/local positions and use `Uint16` indices unless a section exceeds the limit.
- [ ] Keep transparent ordering and special geometry on the legacy-safe path.
- [ ] Render/update/dispose individual section geometries in `ChunkMesh`.
- [ ] Run mesher counts, attribute exactness, lighting/AO fixtures, and bundle/typecheck.
- [ ] Commit: `perf: mesh and greedily merge individual sections`.

### Task 4: Renderer ownership, batching, LOD, shadows, and transparency

**Files:**
- Create: `src/systems/rendering/sectionRenderRegistry.ts`
- Create: `src/systems/rendering/terrainLod.ts`
- Create: `src/systems/rendering/terrainLod.test.mjs`
- Modify: `src/components/ChunkMesh.tsx`
- Modify: `src/App.tsx`
- Modify: `src/systems/performance/streamingSafety.ts`

**Interfaces:**
- `SectionRenderRegistry` owns persistent near/middle/far section records and disposal accounting.
- `classifyTerrainLod(distanceSq, settings)` returns near/middle/far without square roots.
- Strict caps for concurrent fades and shadow-casting radius.

- [ ] Write failing tests for LOD thresholds, fade cap, shadow radius, and stable ownership/disposal counts.
- [ ] Implement persistent records, near editable meshes, middle surface meshes, and far simplified surface records.
- [ ] Use batching only for compatible static opaque sections; keep water/transparent/special content separate.
- [ ] Restrict terrain shadow casting and shadow-map updates to threshold crossings.
- [ ] Register renderer metrics with the performance API.
- [ ] Commit: `perf: batch and level distant terrain rendering`.

### Task 5: Reusable cloud field

**Files:**
- Create: `src/components/world/cloudField.ts`
- Create: `src/components/world/cloudField.test.mjs`
- Modify: `src/components/world/Clouds.tsx`

**Interfaces:**
- Fixed typed cloud-cell field with deterministic coverage.
- Shader/time uniforms drive horizontal motion, weather color, fog, and fades.

- [ ] Write a failing test proving player grid movement does not rebuild geometry and cloud coverage remains deterministic.
- [ ] Replace player-cell rebuilds with one reusable geometry/instanced field and uniform-driven scroll.
- [ ] Record rebuild/update durations in telemetry.
- [ ] Commit: `perf: replace cloud geometry rebuilds`.

### Task 6: Entity spatial indexing, simulation levels, and shared rendering

**Files:**
- Create: `src/systems/entities/EntitySpatialHash.ts`
- Create: `src/systems/entities/EntitySpatialHash.test.mjs`
- Create: `src/systems/entities/entitySimulationLevel.ts`
- Modify: `src/systems/entities/EntityManager.ts`
- Modify: `src/components/EntityRenderer.tsx`

**Interfaces:**
- `EntitySpatialHash.upsert/remove/queryAabb/queryRadius/queryRay` with reusable result buffers.
- `simulationLevel(distanceSq,isBoss,inCombat): full|reduced|sleep`.

- [ ] Write failing spatial-query and simulation-level tests, including negative coordinates and cell-boundary moves.
- [ ] Integrate the index into melee, interactions, projectiles, magnetic sources, nearby tick selection, and visibility.
- [ ] Tick sleeping/passive entities at reduced cadence without reducing boss/combat cadence.
- [ ] Share/instance repeated geometry/materials and pool projectile/shockwave records.
- [ ] Commit: `perf: index and sleep distant entities`.

### Task 7: Drop and particle pools

**Files:**
- Create: `src/systems/effects/structPool.ts`
- Create: `src/systems/effects/structPool.test.mjs`
- Modify: `src/components/DropManager.tsx`
- Modify: `src/components/ParticleManager.tsx`
- Modify: `src/components/FxParticles.tsx`

**Interfaces:**
- Dense struct-of-arrays pool with integer IDs and swap-remove.
- Global budgets, sleeping drops, changed-range instance uploads, and adaptive particle quality.

- [ ] Write failing pool/budget/sleep/wake tests.
- [ ] Move ordinary drop physics to 25 Hz and cache cell light/classification.
- [ ] Pool block/ambient/effect particles and update only active/changed ranges.
- [ ] Preserve visuals within the configured budget.
- [ ] Commit: `perf: pool drops and particle effects`.

### Task 8: Fluid timing wheel and sapling index

**Files:**
- Create: `src/systems/world/fluidTimingWheel.ts`
- Create: `src/systems/world/fluidTimingWheel.test.mjs`
- Create: `src/systems/world/saplingIndex.ts`
- Create: `src/systems/world/saplingIndex.test.mjs`
- Modify: `src/systems/world/fluids.ts`
- Modify: `src/systems/world/plantGrowth.ts`

**Interfaces:**
- Packed numeric fluid keys and game-tick timing wheel.
- Reusable BFS queues/visitation stamps.
- Per-chunk sapling index updated by load/generation/edit/growth/eviction.

- [ ] Write failing scheduling, deduplication, source/falling/draining/mixing, and sapling lifecycle tests.
- [ ] Replace `Date.now`/string-map scans and column scans.
- [ ] Apply fluid/tree changes through bulk section transactions.
- [ ] Commit: `perf: index fluid and plant simulation`.

### Task 9: Player, interaction, audio, environment, and capture cleanup

**Files:**
- Create: `src/systems/player/interactionCache.ts`
- Create: `src/systems/player/interactionCache.test.mjs`
- Modify: `src/components/Player.tsx`
- Modify: `src/components/controllers/InteractionController.tsx`
- Modify: `src/components/AudioListenerUpdater.tsx`
- Modify: `src/components/world/DayNightCycle.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Reused movement/collision scratch and per-step chunk cache.
- Raycast cache keyed by player/camera/world version.
- Thresholded listener/environment updates.
- Explicit panorama render-target capture path with normal renderer preservation disabled.

- [ ] Add replay/cache/threshold tests before behavior changes.
- [ ] Remove verified hot-loop allocations while preserving movement, boats, magnetism, wall interaction, fall damage, swimming, crouching, and shaped-block targeting.
- [ ] Replace duplicate music polling with state events.
- [ ] Validate panorama capture before disabling always-on `preserveDrawingBuffer`.
- [ ] Commit: `perf: remove player and environment hot-loop work`.

### Task 10: React/startup boundaries, final benchmarking, and documentation

**Files:**
- Modify: `src/index.tsx`
- Modify: `src/App.tsx`
- Modify: `src/perf/PerformanceHarness.tsx`
- Modify: `docs/performance/PERFORMANCE_RESULTS.md`
- Modify: `docs/performance/ARCHITECTURE.md`

**Interfaces:**
- Dynamic imports for World Editor/atlas viewer and other non-gameplay tools only when bundle evidence supports it.
- Harness scenarios produce comparable JSON/Markdown tables for every stage.

- [ ] Profile reconciliation/bundle boundaries before refactoring.
- [ ] Move only measured high-frequency values outside broad React reconciliation.
- [ ] Run complete tests, typecheck, lint, production build, Electron smoke, storage/hash/visual/gameplay regressions, and baseline/after harnesses where the environment permits.
- [ ] Populate before/after tables, reverted experiments, remaining bottlenecks, exact commands, and limitations.
- [ ] Commit: `docs: finalize performance results`.
