
# Implementation Plan

This document outlines the technical strategy for implementing the remaining features listed in `BACKLOG.md` for the Atlas engine.

## 1. Core Systems & Optimization

### 1.1 Greedy Meshing (Critical)
**Context:** Currently, `systems/world/geometry.ts` generates two triangles (one quad) for every visible face. This results in high vertex counts.
**Goal:** Merge adjacent coplanar faces of the same type and lighting into single larger quads.

**Implementation Steps:**
1.  **Modify `systems/world/geometry.ts`:**
    *   Refactor `generateGeometryData` to stop iterating purely by voxel index.
    *   Implement a "Masking" approach for each of the 6 directions (Right, Left, Top, Bottom, Front, Back).
    *   **Algorithm:**
        1.  For a given normal direction (e.g., Up), iterate through the chunk slices (layers of Y).
        2.  Create a 2D array (Mask) representing faces on this slice that *should* be drawn (face culling logic).
        3.  Iterate the Mask rows. When a set face is found (`mask[n] != null`), search horizontally (width) to find how many identical faces exist.
        4.  From that width, search vertically (height) to see if that row extends down.
        5.  Generate **one** quad with dimensions `width * 16` and `height * 16`.
        6.  Clear the covered bits in the Mask.
    *   **Texture Handling:** Update UV calculation. Instead of `0..1` for a single block, UVs must repeat or stretch based on the new quad dimensions (`uMax = uMin + width`, etc.).
    *   **AO Handling:** Greedy meshing breaks per-vertex lighting if lighting varies across the merged face.
        *   *Constraint:* Only merge faces if they share the exact same light values at their corners.

### 1.2 Aggressive Infinite World Garbage Collection
**Context:** `WorldManager.ts` has basic eviction in `setDesiredChunks`, but it relies on React updates.
**Goal:** Implement a robust, periodic garbage collector to prevent memory leaks during long play sessions.

**Implementation Steps:**
1.  **Update `systems/WorldManager.ts`:**
    *   Add a `cleanupChunks()` method called periodically (e.g., every 5 seconds) inside `processStreamingJobs`.
    *   Calculate the distance from `playerPos` (converted to chunk coords) to every key in `chunkStages`.
    *   **Threshold:** If `distance > RENDER_DISTANCE + 2`:
        1.  Check if chunk is dirty. If yes, call `WorldStorage.saveChunk`.
        2.  Call `evict(cx, cz)`.
    *   **Memory:** Ensure `evict` properly dereferences geometry arrays to allow GC.

---

## 2. Gameplay Features

### 2.1 Entities & Mobs (Architecture)
**Context:** Currently, only `DropManager` exists using `InstancedMesh`. We need a system for active AI entities.
**Goal:** Support moving creatures (Animals, Zombies).

**Implementation Steps:**
1.  **Data Structure:**
    *   Create `systems/mobs/MobManager.ts`.
    *   Define interface `Entity`: `{ id: string, type: string, pos: Vector3, vel: Vector3, rot: Vector3, state: 'idle'|'walk' }`.
2.  **Physics:**
    *   Reuse `systems/player/playerCollision.ts` logic. Refactor `checkCollision` to accept arbitrary AABB dimensions (width, height) instead of assuming Player constants.
3.  **Game Loop Integration:**
    *   In `WorldManager.tick()`, iterate all registered Mobs.
    *   Apply Gravity and simplified AI (e.g., "Pick random target within 5 blocks, walk there").
4.  **Rendering:**
    *   Create `components/mobs/MobRenderer.tsx`.
    *   Unlike Drops (InstancedMesh), Mobs should likely use individual `THREE.Group`s initially to support limb animation (swinging legs).
    *   **Model:** Construct simple "Steve-like" hierarchies (Body, Head, ArmL, ArmR, LegL, LegR) using `THREE.BoxGeometry`.

### 2.2 Farming
**Context:** We have Seeds and Plants, but no Farmland block logic.
**Goal:** Hoe interaction, Farmland block, Crop growth ticks.

**Implementation Steps:**
1.  **New Blocks:**
    *   Add `FARMLAND` (BlockType 60+) to `types.ts` and `blocks.ts`.
    *   Model: `FARMLAND` should be slightly shorter (0.9375 height). Update `geometry.ts` to handle custom height for this block ID.
2.  **Interaction (`InteractionController.tsx`):**
    *   If holding `HOE` and clicking `GRASS`/`DIRT`:
    *   `worldManager.setBlock(x, y, z, BlockType.FARMLAND)`.
3.  **Growth Logic (`WorldManager.ts`):**
    *   Implement `randomTick` system.
    *   In `tick()`, pick 3 random blocks per chunk section (simulated).
    *   If block is `WHEAT_SEEDS` (Stage 0):
        *   Check light level > 9.
        *   Increment Metadata (Stage).
        *   If Stage == 7, it is fully grown.
    *   If block is `FARMLAND`:
        *   Check for water within radius 4 (simple distance check).
        *   If no water, revert to `DIRT` randomly.

---

## 3. Visual Polish & Performance

### 3.1 Geometric Ambient Occlusion
**Context:** `geometry.ts` currently calculates "Smooth Lighting" (interpolating light levels between neighbors). It does *not* calculate geometric occlusion (darkening corners based on physical geometry layout).
**Goal:** Add depth to corners where blocks meet.

**Implementation Steps:**
1.  **Modify `geometry.ts` -> `getAOColor`:**
    *   Currently, it samples light levels `getLightFast`.
    *   Add a check for **solidity** of the 3 neighbors forming the corner (`side1`, `side2`, `corner`).
    *   **Formula:** `aoValue = 0`.
    *   If `side1` is solid, `aoValue++`.
    *   If `side2` is solid, `aoValue++`.
    *   If `corner` is solid, `aoValue++`.
    *   Convert `aoValue` (0-3) into a shading multiplier (e.g., `0=1.0`, `1=0.8`, `2=0.6`, `3=0.4`).
    *   Multiply the existing light color by this AO multiplier.

### 3.2 Interaction Latency Fix (Worker Separation)
**Context:** At high render distances (16+), block placement/breaking lags significantly. This is because the single Web Worker is clogged with hundreds of "Chunk Generation" tasks, delaying the "Remesh" task needed for the block update. Additionally, the main thread throttles meshing jobs.
**Goal:** Ensure block updates are near-instant regardless of background loading.

**Implementation Steps:**
1.  **Split Workers in `WorldManager.ts`:**
    *   Instead of one `this.worker`, instantiate **two** workers from the same source (`world.worker.ts`):
        *   `this.genWorker`: Handles only `GEN` messages.
        *   `this.meshWorker`: Handles only `MESH` messages.
    *   This ensures that a backlog of 50 heavy generation tasks does not block the lightweight meshing task.
2.  **Priority Queue Bypass:**
    *   Modify `processStreamingJobs` in `WorldManager.ts`.
    *   Currently, it limits `inFlightMesh` to `MAX_MESH_IN_FLIGHT` (2).
    *   **Change:** Check if the next job in `meshQueue` has `priority === 0` (User Interaction).
    *   If `priority === 0`, **bypass the limit check** (allow up to `MAX + 2` concurrent jobs).
    *   This forces the update to be sent to `meshWorker` immediately.
3.  **Update Worker Logic:**
    *   Ensure `world.worker.ts` is stateless (it already is) so it can be instantiated multiple times safely.
    *   Ensure seed updates are sent to *both* workers.
