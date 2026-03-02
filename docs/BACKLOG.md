
# Project Atlas Backlog

This backlog tracks the development progress of "Atlas", a voxel sandbox engine.

## Status Overview
- **Core Engine:** ✅ (React + Three.js + Web Workers)
- **World Generation:** ✅ (Biomes, Ores, Trees, Noise Editor)
- **Physics:** ✅ (AABB Collision, Fluids, Movement)
- **Persistence:** ✅ (IndexedDB Save/Load)
- **Inventory/Crafting:** ✅ (Drag & Drop, Recipes, Furnace)
- **Audio:** ✅ (Spatial, Music Streaming, Biome Tracks)

---

## 1. Core Systems & Optimization (Priority High)

### 1.1 Greedy Meshing (Critical)
**Goal:** Reduce vertex count and draw calls to allow higher render distances.
- [ ] Implement greedy meshing algorithm in `geometry.ts` (or worker).
- [ ] Combine adjacent faces of the same type/light level into single quads.
- [ ] Handle face culling alongside greedy meshing.

### 1.2 Infinite World Garbage Collection
**Goal:** Prevent memory leaks as the player explores.
- [ ] Implement aggressive chunk unloading for chunks far outside `RENDER_DISTANCE`.
- [ ] Ensure geometries are properly disposed from GPU memory.

### 1.3 Multithreading Polish
- [ ] Verify `SharedArrayBuffer` usage or `Transferable` optimization for geometry passing (Currently using Transferable).
- [ ] Offload collision checks to worker? (Maybe too much latency, keep on main thread for now).

---

## 2. Gameplay Features

### 2.1 Entities & Mobs (Next Major Feature)
**Goal:** Add life to the world.
- [ ] Create `EntityManager` system (distinct from `DropManager`).
- [ ] Implement basic mob rendering (Simple geometry or GLTF).
- [ ] Passive AI (Wander, Look at Player, Flee).
- [ ] Hostile AI (Chase, Attack, Pathfinding).
- [ ] Mob Spawning rules (Light level, Biome).

### 2.2 Fluid Dynamics Polish
**Goal:** Better water behavior.
- [ ] Add "Infinite Source" logic (3 adjacent sources create a new source).
- [ ] Fix visual "waterlogging" for non-full blocks (fences, slabs).

### 2.3 Farming
**Goal:** Sustainable food source.
- [ ] Add `Hoe` item functionality (Grass -> Farmland).
- [ ] Crop growth mechanics (Ticks, Hydration check).
- [ ] Seed drops from grass (Already exists, just need logic).

---

## 3. Visual Polish

### 3.1 Rendering
- [x] Fix Cloud Rendering Order (Clouds should be behind water).
- [ ] Smooth lighting (AO is implemented, but could be smoother).
- [ ] held item bobbing/swaying (Implemented, tune feel).
- [ ] Break cracking animation (Implemented).

### 3.2 Particles
- [x] Block break particles.
- [ ] Rain/Snow weather effects.
- [ ] Explosion particles.

---

## 4. Completed Features (Archive)

### Persistence
- ✅ Save/Load chunks to IndexedDB.
- ✅ Metadata storage (Seed, Player Pos, Inventory).
- ✅ World Management UI.

### Inventory & Items
- ✅ Hotbar, Inventory, Chests.
- ✅ Drag and Drop (Split, Single, Shift-Click).
- ✅ Crafting (2x2 and 3x3).
- ✅ Furnaces (Smelting logic, fuel).
- ✅ Tool tiers and durability.

### World Gen
- ✅ Biome system (Temp/Humidity maps).
- ✅ Ore generation (Height-based).
- ✅ Tree generation (Oak, Birch, Spruce, Cherry).
- ✅ Runtime Noise Editor (`ChunkBase`).

### Physics
- ✅ Player movement (Walk, Sprint, Sneak, Swim, Fly).
- ✅ AABB Collision.
- ✅ Fluid physics (Buoyancy, Drag).

### Audio
- ✅ Sound Manager (WebAudio API).
- ✅ Spatial Audio.
- ✅ Music Controller (Crossfading, Biome-specific tracks).
