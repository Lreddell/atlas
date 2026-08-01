# Resonant Vault Production Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Resonant Vault as a connected, readable, production-quality Atlas expedition with environmental echo guidance, two real surface escapes, a distinct Vault Mason boss, restrained visuals, authored lighting, torch support, and fully licensed performed/recorded audio.

**Architecture:** Keep deterministic layout and chunk-local painting in the existing vault worldgen modules. Extract pure objective, doorway, echo-timing, arena-pattern, and edit-policy decisions for direct tests. Keep ordinary Sentinel behavior in `ResonantEncounterDirector`, but move the Vault Mason into a focused encounter state machine with reversible tagged arena edits and a dedicated renderer. Extend the existing runtime snapshot and HUD instead of scraping the DOM. Use the existing dual music decks as actual overlapping decks and make vault manifest entries fail silent instead of synthesizing placeholders.

**Tech Stack:** TypeScript, React 18, Three.js, react-three-fiber, Vite, Electron, Node's built-in test runner, FFmpeg/FFprobe, Ogg/Vorbis, Tailwind utility classes.

## Global Constraints

- Follow `AGENTS.md`. Use `atlas-worldgen-streaming-and-workers` for Tasks 1-4 and 7-9, `atlas-rendering-player-and-interaction` before Tasks 5-6 and 10-12, `atlas-persistence-and-feature-editor` before Tasks 9 and 15, and `atlas-build-run-and-smoke-test` for Task 15.
- Preserve all existing numeric block and item IDs. `BlockType.CUSTODIAN_SIGIL` may keep its enum/storage name, but its display name becomes `Mason Sigil`.
- Preserve `VaultProgressData.custodianDefeated` as the serialized compatibility field. New methods and player-facing events say Mason.
- Keep `src/App.tsx` changes to the two lifecycle calls required to repair temporary arena blocks before save/reset. Do not refactor `App` or `WorldManager`.
- Use `worldManager.setBlocks()` for Mason arena mutations so lighting, persistence, current chunks, and border-neighbor remeshing use the existing path.
- Never overwrite a player torch, mechanism, seal, authored shell block, player-occupied cell, or untagged player edit with a Mason pattern.
- Full architecture changes are guaranteed for newly generated vault chunks. Do not destructively regenerate persisted experimental chunks.
- Remove the branch-added MIDI files, procedural audio renderer, synthesis report, and generated Resonant Ogg files. Replacement music is genuinely composed/performed material; replacement SFX use recorded acoustic and Foley sources only.
- Use the `imagegen` skill in Task 11 to create the Mason diffuse texture. Do not substitute a flat color material or a procedural debug texture.
- Every implementation task follows red-green-refactor: write or update the focused test, run it and observe the intended failure, implement the smallest cohesive change, rerun the focused suite, then commit.
- Do not claim production completion until Task 15's automated, browser, Electron, visual, audio, save/load, and fresh-vault traversal gates pass.

---

## Task 1: Make layout doorways and surface outlets explicit

**Files:**

- Modify: `src/systems/world/resonantVaults.ts`
- Modify: `src/systems/world/resonantVaults.test.mjs`
- Modify: `src/systems/world/resonantVaultGeometry.test.mjs`

- [x] **Step 1: Write failing deterministic layout tests**

Add assertions for all four orientations that require:

- `VaultLayout.doorways` to contain one doorway descriptor for every graph edge.
- `VaultLayout.surfaceOutlets.west` and `.east` to have separate positions and sampled terrain heights.
- `escape_west -> outlet_west` and `escape_east -> outlet_east` graph edges.
- Every route to an outlet to change height by at most one block per horizontal step.
- Outlet thresholds to be inside `RESONANT_VAULT_HALF_EXTENT` and outside the central spire footprint.

Use terrain sampling that deliberately returns different heights at the west, center, and east positions so a copied center height fails.

Run:

```powershell
node --test src/systems/world/resonantVaults.test.mjs src/systems/world/resonantVaultGeometry.test.mjs
```

Expected: FAIL because doorways, surface outlets, and outlet room kinds do not exist.

- [x] **Step 2: Add exact layout types and sampling**

Extend `VaultRoomKind` with `outlet_west` and `outlet_east`. Add:

```ts
export interface VaultDoorway {
    from: VaultRoomKind;
    to: VaultRoomKind;
    roomOverlap: VaultRoutePoint[];
    opening: VaultRoutePoint[];
    corridorOverlap: VaultRoutePoint[];
    gate?: 'inner_seal' | 'escape_west' | 'escape_east';
}

export interface VaultSurfaceOutlet {
    side: 'west' | 'east';
    x: number;
    z: number;
    surfaceY: number;
    floorY: number;
    thresholdRadius: number;
    room: 'outlet_west' | 'outlet_east';
}
```

Change the signature to:

```ts
export function getVaultLayout(
    candidate: VaultCandidate,
    centerSurfaceY: number,
    getSurfaceY: (x: number, z: number) => number = () => centerSurfaceY,
): VaultLayout
```

Place outlets near local X `-122` and `122`, keep local Z aligned with the core route, and calculate each outlet's `surfaceY` from `getSurfaceY(outletX, outletZ)`. Give the long horizontal climb enough cells to absorb the approximately 59-block ascent without any two-block riser.

- [x] **Step 3: Derive doorway descriptors from the final graph**

Add `getVaultDoorways(layout)` and `getVaultSurfaceOutlet(layout, side)`. A doorway's `opening` must describe a five-block-wide, five-block-high clear plane centered on the relevant room port. Assign gate ownership only to `combat -> seal`, `core -> escape_west`, and `core -> escape_east`.

- [x] **Step 4: Update every live layout caller**

Pass `getTerrainHeight` from `ResonantVaultRuntime`. Pass `context.getSurfaceY` from `resonantVaultGeneration`. Remove the command-only layout caller when Task 6 deletes `resonantVaultCommands.ts`; until then, pass `getTerrainHeight` there too so this task typechecks independently.

- [x] **Step 5: Run the focused tests and commit**

```powershell
node --test src/systems/world/resonantVaults.test.mjs src/systems/world/resonantVaultGeometry.test.mjs
git add src/systems/world/resonantVaults.ts src/systems/world/resonantVaults.test.mjs src/systems/world/resonantVaultGeometry.test.mjs src/systems/world/ResonantVaultRuntime.ts src/systems/world/resonantVaultGeneration.ts src/systems/world/resonantVaultCommands.ts
git commit -m "feat: define vault doorways and surface outlets"
```

---

## Task 2: Test the generated voxels and permanently fix room connectivity

**Files:**

- Modify: `src/systems/world/resonantVaultGeneration.ts`
- Modify: `src/systems/world/resonantVaultGeometry.test.mjs`

- [x] **Step 1: Replace route-only checks with a sparse generated-block fixture**

Export the writer contract and the shared painter:

```ts
export interface ResonantStructureWriter {
    set(x: number, y: number, z: number, type: BlockType, meta?: number, onlyReplace?: ReadonlySet<number>): void;
    get(x: number, y: number, z: number): BlockType | null;
}

export function paintResonantVaultStructure(
    writer: ResonantStructureWriter,
    candidate: VaultCandidate,
    layout: VaultLayout,
    context: ResonantGenerationContext,
): void
```

In the test, implement a `Map<string, { type, meta }>` writer whose default is solid `STONE`. Run the same production painter once, then flood-fill a two-block-wide by three-block-high player volume through final AIR/walkable cells.

- [x] **Step 2: Write failing voxel connectivity assertions**

For four orientations and two terrain-height profiles, assert:

- Every intended adjacent-room navigation anchor is connected in final generated blocks.
- All intended room anchors are connected to the entrance.
- The descent connects the surface spire door to the underground entrance in both directions.
- Both outlet threshold anchors connect to the core after treating the two escape gate planes as open.
- With gates present, only the inner seal and two escape gates block progress.
- Every doorway opening remains at least three blocks wide and four blocks high after furnishings.

Run the geometry test and observe failures at room shell endpoints and outlet routes.

- [x] **Step 3: Paint explicit doorways after room shells and corridors**

Add `paintDoorwayOpening(writer, doorway, gateState)`. Paint order becomes:

1. Room shells.
2. Corridor and stair volumes.
3. Structural frames.
4. Furnishings.
5. Final doorway clear-volume reassertion.
6. Only the doorway-owned gate planes.
7. Local emission refresh.

The final pass must clear only the descriptor's opening cells and must never clear the frame, floor, or ceiling.

- [x] **Step 4: Replace the vertical shaft stepping illusion with a real returnable stair**

Add a deterministic spiral or switchback route generator whose consecutive walk cells have Manhattan-adjacent horizontal positions and a Y delta of `0` or `1`. Paint a solid floor, four clear blocks of headroom, guarded outside edges, and landings every eight vertical blocks. Remove the current floating mosaic bands as the traversal surface.

- [x] **Step 5: Paint both surface outlet climbs and ruins**

Use the graph routes from `escape_west/east` to `outlet_west/east`. The west route is the shorter shifting route; the east route is the longer stable gallery route. Both get a final terrain-reconciling stair and a small roofed ruin with a clear exterior threshold at its sampled surface height.

- [x] **Step 6: Run focused tests and commit**

```powershell
node --test src/systems/world/resonantVaultGeometry.test.mjs
git add src/systems/world/resonantVaultGeneration.ts src/systems/world/resonantVaultGeometry.test.mjs
git commit -m "fix: generate connected vault rooms and exits"
```

---

## Task 3: Author the architecture, navigation language, and lighting

**Files:**

- Modify: `src/systems/world/resonantVaultGeneration.ts`
- Modify: `src/systems/world/resonantVaultGeometry.test.mjs`
- Modify: `src/systems/world/resonantVaults.ts`

- [x] **Step 1: Add failing architectural and lighting invariants**

Extend the sparse fixture to collect `RESONANT_LAMP` cells. Test that:

- No primary route walk cell is more than eight horizontal blocks from a lamp.
- Every room objective anchor has a lamp within eight blocks.
- Every descent and outlet landing has a lamp.
- Decoration never occupies the player navigation envelope or a doorway opening.
- Each major room kind has a distinct furnishing signature, not only a rectangular shell.

- [x] **Step 2: Replace the uniform corridor tube**

Make straight corridor slices five clear blocks wide with four clear head blocks, a ribbed/stepped ceiling, recessed alternating wall lamps, and chiseled support ribs every eight route cells. At turns, paint a nine-by-nine landing volume before the final doorway pass.

- [x] **Step 3: Give each room a production silhouette**

Keep collision-safe details outside the navigation envelope:

- Gallery: paired wall bays, benches, and a central listening plinth.
- Hub: high ribbed crown, three framed wing portals, and physical floor glyph routes.
- Pattern wing: four shaped pylon dais assemblies with matching floor inlays.
- Crossing wing: permanent checkpoint strips, recessed phase pits, and preview receivers.
- Combat wing: cover piers and Conductor link anchors, not an empty cross floor.
- Antechamber: compressed threshold, Mason relief, and sightline into the arena.
- Arena: structural wall sockets that exactly match Mason-owned cells.
- Core: raised mechanical cradle and two visible locked escape gates.
- Outlets: small weathered surface ruins with different silhouettes.

- [x] **Step 4: Integrate authored fixtures**

Place lamps in wall alcoves, support columns, machinery, door frames, and landings. Remove open-floor lamp spam and keep functional emissive blocks a minority of the visible surfaces.

- [x] **Step 5: Validate and commit**

```powershell
node --test src/systems/world/resonantVaultGeometry.test.mjs
git add src/systems/world/resonantVaultGeneration.ts src/systems/world/resonantVaultGeometry.test.mjs src/systems/world/resonantVaults.ts
git commit -m "feat: author vault architecture and lighting"
```

---

## Task 4: Make escape completion happen at the real surface

**Files:**

- Modify: `src/systems/world/ResonantVaultRuntime.ts`
- Create: `src/systems/world/resonantVaultEscapeRules.ts`
- Modify: `src/systems/world/resonantRewardLoop.test.mjs`
- Modify: `src/systems/events/GameEvents.ts`
- Modify: `src/systems/progression/ProgressionStore.ts`
- Modify: `src/systems/progression/resonantVaultProgress.test.mjs`

- [x] **Step 1: Write failing surface-threshold tests**

Extract and test:

```ts
export function getCompletedEscapeSide(
    layout: VaultLayout,
    player: { x: number; y: number; z: number },
): 'west' | 'east' | null
```

Require `escapeStarted`, horizontal threshold inclusion, player feet at or above `outlet.floorY`, and the actual outlet room. Assert that standing in `escape_west` or `escape_east` underground returns `null`.

- [x] **Step 2: Open only the two escape gate planes on core claim**

Replace the current underground-room success check. On `coreClaimed`, clear doorway descriptors with `gate === 'escape_west'` or `'escape_east'`, start the timer, and leave all permanent architecture untouched.

- [x] **Step 3: Complete and reward at the surface threshold**

Move completion and the repeat-clear Echo Brick reward to the surface result. Emit `vault:escape-completed` once. Use short feedback only; remove the collapse-harmony paragraph.

- [x] **Step 4: Preserve compatibility**

Keep progression storage fields and existing completed saves unchanged. Add `markVaultMasonDefeated()` as the new method and retain `markVaultCustodianDefeated()` as a compatibility alias until all live callers move in Task 9.

- [x] **Step 5: Run focused tests and commit**

```powershell
node --test src/systems/world/resonantRewardLoop.test.mjs src/systems/progression/resonantVaultProgress.test.mjs
git add src/systems/world/ResonantVaultRuntime.ts src/systems/world/resonantVaultEscapeRules.ts src/systems/world/resonantRewardLoop.test.mjs src/systems/events/GameEvents.ts src/systems/progression/ProgressionStore.ts src/systems/progression/resonantVaultProgress.test.mjs
git commit -m "fix: complete vault escape at the surface"
```

---

## Task 5: Allow torches through an action-aware sealed-vault policy

**Files:**

- Modify: `src/systems/world/ResonantVaultRuntime.ts`
- Create: `src/systems/world/resonantVaultEditRules.ts`
- Modify: `src/components/controllers/InteractionController.tsx`
- Modify: `src/systems/world/resonantInteraction.test.mjs`
- Modify: `src/systems/world/regionEditPolicy.ts`
- Modify: `src/systems/world/regionEditPolicy.test.mjs`

- [x] **Step 1: Write failing action-policy tests**

Define the intended input:

```ts
export type VaultPlayerEdit =
    | { kind: 'break'; currentBlock: BlockType }
    | { kind: 'place'; currentBlock: BlockType; placedBlock: BlockType };
```

Test sealed-vault behavior for masonry breaking, ordinary placement, torch placement into AIR, attempted torch replacement of a mechanism/seal/wall, tagged Mason cells, and post-escape full edit permission.

- [x] **Step 2: Replace `canEditAt` with the action-aware decision**

Implement `canPlayerEditAt(x, y, z, edit)`. Before escape:

- Allow mining natural `ECHO_CRYSTAL` only where the existing rule allows it.
- Allow `place` only when `placedBlock === BlockType.TORCH`, `currentBlock === BlockType.AIR`, the position is inside the vault, and the cell is not a functional or Mason-owned protected cell.
- Deny every other structure edit.

- [x] **Step 3: Pass the real action from interaction code**

Change the local helper to accept the edit union. Every mining call passes `kind: 'break'`. Every placement path passes the held block type before inventory consumption, including slab merging and bed halves. Keep the existing player collision, support, consumption, placement sound, `setBlock`, lighting, remesh, and dirty-save paths unchanged.

- [x] **Step 4: Run tests and commit**

```powershell
node --test src/systems/world/resonantInteraction.test.mjs src/systems/world/regionEditPolicy.test.mjs
git add src/systems/world/ResonantVaultRuntime.ts src/systems/world/resonantVaultEditRules.ts src/components/controllers/InteractionController.tsx src/systems/world/resonantInteraction.test.mjs src/systems/world/regionEditPolicy.ts src/systems/world/regionEditPolicy.test.mjs
git commit -m "feat: allow safe torch placement in sealed vaults"
```

---

## Task 6: Replace prose guidance and DOM injection with the real HUD

**Files:**

- Create: `src/systems/world/resonantVaultObjectives.ts`
- Create: `src/systems/world/resonantVaultObjectives.test.mjs`
- Create: `src/components/ui/ResonantObjectiveHUD.tsx`
- Modify: `src/systems/world/ResonantVaultRuntime.ts`
- Modify: `src/components/ResonantVaultController.tsx`
- Modify: `src/components/ui/HUD.tsx`
- Modify: `src/components/ui/Slot.tsx`
- Modify: `src/components/ui/Chat.tsx`
- Modify: `src/data/resonantGuide.ts`
- Modify: `src/systems/registry/itemTooltips.ts`
- Modify: `src/data/commands.ts`
- Delete: `src/systems/world/resonantVaultCommands.ts`
- Rewrite: `src/systems/world/resonantVaultGuidance.test.mjs`
- Modify: `src/systems/world/resonantInteraction.test.mjs`

- [x] **Step 1: Write the pure objective matrix first**

Add:

```ts
export interface VaultObjectiveContext {
    discovered: boolean;
    entered: boolean;
    room: VaultRoomKind | null;
    hasResonator: boolean;
    wings: Record<ResonantVaultWing, boolean>;
    memoryProgress: number;
    masonActive: boolean;
    masonVulnerable: boolean;
    masonDefeated: boolean;
    coreClaimed: boolean;
    escapeStarted: boolean;
    escapeCompleted: boolean;
    escapeRemaining: number;
}

export interface VaultObjective {
    label: 'VAULT' | 'ESCAPE';
    text: string;
    progress?: string;
}
```

Cover discovery, Resonator crafting, entry, hub wing count, each wing, inner seal, Mason, core, and formatted escape time. Require `null` outside a relevant objective and after completion.

- [x] **Step 2: Make the runtime snapshot stable and complete**

Return the cached snapshot object from `getSnapshot()` so `useSyncExternalStore` can compare it safely. Include the current room kind, wing flags, memory progress, Mason state, core/escape flags, cooldown fraction, and remaining time. Remove `shownGuidance`, `showGuidance`, `showRoomGuidance`, `replayGuide`, and all automatic instruction/lore log writes.

- [x] **Step 3: Build the one-line neutral HUD**

`ResonantObjectiveHUD` uses `useSyncExternalStore(resonantVaultRuntime.subscribe, resonantVaultRuntime.getSnapshot)` and the current inventory to call the pure selector. Render one top-center line with existing `font-pixel`, white text, gray progress, `bg-black/55`, the existing text shadow, and square/lightly rounded geometry. Do not use gradients, glow, cyan, purple, scanlines, or animated panels.

Mount it inside `HUD` so it automatically follows the existing HUD visibility gates.

- [x] **Step 4: Move the bracer cooldown into `Slot` props**

Add `cooldownFraction?: number` to `SlotProps` and render a neutral `bg-black/65` bottom-up mask inside the selected Pulse Bracer slot. `HUD` reads the runtime snapshot and passes the fraction to the selected Bracer. Delete every `querySelector`, texture-slot inspection, `createElement`, and injected overlay function from `ResonantVaultController`.

- [x] **Step 5: Remove player-facing vault commands and confusing copy**

Delete `/vault` and its argument entries from autocomplete. Remove the Resonant import and interception from `Chat`. Delete `resonantVaultCommands.ts`. Reduce item tooltips to one concrete control or crafting role; change every player-facing Custodian name to Mason while retaining compatibility identifiers in code/storage.

- [x] **Step 6: Run tests and commit**

```powershell
node --test src/systems/world/resonantVaultObjectives.test.mjs src/systems/world/resonantVaultGuidance.test.mjs src/systems/world/resonantInteraction.test.mjs src/systems/registry/itemTooltips.test.mjs
npm run typecheck
git add -A src/systems/world src/components/ResonantVaultController.tsx src/components/ui src/data/resonantGuide.ts src/data/commands.ts src/systems/registry/itemTooltips.ts
git commit -m "feat: teach vault objectives through the world and HUD"
```

---

## Task 7: Establish pulse-preview-echo across the structure

**Files:**

- Create: `src/systems/world/resonantEchoTiming.ts`
- Create: `src/systems/world/resonantEchoTiming.test.mjs`
- Modify: `src/systems/world/ResonantVaultRuntime.ts`
- Modify: `src/systems/world/resonantMachineryRules.ts`
- Modify: `src/systems/world/resonantMachineryRules.test.mjs`
- Modify: `src/systems/events/GameEvents.ts`
- Modify: `src/components/ResonantEffectsRenderer.tsx`

- [x] **Step 1: Write deterministic scheduler tests**

Add a small pure scheduler with a fixed preview-to-echo delay of `0.85` seconds and ordered callbacks. Test that preview always precedes resolution, a reset cancels stale callbacks, and repeated pulses debounce the same receiver without cancelling an already resolved echo.

Add typed events:

```ts
'vault:echo-preview': { vaultId: string; kind: 'route' | 'pattern' | 'crossing' | 'mason'; cells: VaultRoutePoint[]; resolvesAt: number };
'vault:echo-resolved': { vaultId: string; kind: 'route' | 'pattern' | 'crossing' | 'mason'; cells: VaultRoutePoint[] };
```

- [x] **Step 2: Convert the hub and route response**

Pulsing a Listening Stone sends a timed sequence through floor markers toward the first unfinished wing, the Mason route, the core, or the nearest open escape. It no longer prints coordinates, status paragraphs, or guide text.

- [x] **Step 3: Convert the pattern wing**

Pulsing the center receiver starts the four-symbol preview. After the echo delay, the pylons demonstrate the sequence and open the input window. A correct pylon produces only local confirmation; a wrong pylon schedules a low reset response and restarts the demonstration. Keep symbols shape-readable without relying on color.

- [x] **Step 4: Convert crossing changes into preview then movement**

Before each phase-lane state change, emit a preview traveling across the affected cells. Apply `PHASE_BLOCK`/AIR changes only after the fixed delay. Permanent mosaic checkpoint rows remain unchanged. Objective progress comes from snapshot state, not logs.

- [x] **Step 5: Render physical previews**

Replace neon mesh-basic pulse spheres with small world-lit dust/chip markers and brief restrained receptive seams at the exact preview cells. Color may support the signal, but position, sequence, and shape must remain sufficient.

- [x] **Step 6: Run tests and commit**

```powershell
node --test src/systems/world/resonantEchoTiming.test.mjs src/systems/world/resonantMachineryRules.test.mjs src/systems/world/resonantRewardLoop.test.mjs
git add src/systems/world/resonantEchoTiming.ts src/systems/world/resonantEchoTiming.test.mjs src/systems/world/ResonantVaultRuntime.ts src/systems/world/resonantMachineryRules.ts src/systems/world/resonantMachineryRules.test.mjs src/systems/events/GameEvents.ts src/components/ResonantEffectsRenderer.tsx
git commit -m "feat: unify vault mechanics around echoes"
```

---

## Task 8: Rework the Sentinel wing around the Conductor link

**Files:**

- Modify: `src/systems/entities/ResonantEncounterDirector.ts`
- Modify: `src/systems/entities/resonantEntities.ts`
- Modify: `src/systems/world/resonantMachineryRules.ts`
- Modify: `src/systems/world/resonantMachineryRules.test.mjs`
- Modify: `src/components/ResonantEffectsRenderer.tsx`
- Modify: `src/systems/events/GameEvents.ts`

- [x] **Step 1: Write failing encounter-rule tests**

Test that a Conductor forms positional links to nearby Sentinels, a Resonator pulse interrupts all linked targets for a fixed window, exposed Sentinels take normal damage, and ordinary Sentinel shards never become player-owned reflected boss projectiles.

- [x] **Step 2: Replace the reflection-centric loop**

Keep compact physical shard attacks for ordinary enemies, but remove `owner: 'player'` and return-to-source logic from this director. Pulse interruption becomes the tool interaction. Add short telegraphs before shard release and ensure the Conductor visibly/audibly links before it accelerates allies.

- [x] **Step 3: Remove generic boss code from this director**

Delete Custodian phase, spread-shot, reflected-bolt damage, and Magnetic Warden sound calls. Task 9 will attach the focused Mason encounter. `RESONANT_KINDS` in this file contains only the three Sentinel kinds.

- [x] **Step 4: Replace neon Sentinel presentation**

Use small articulated stone/metal forms or world-lit blocky meshes, compact physical shard projectiles, and a restrained link ribbon/sequence that follows world lighting. Remove wireframes, orbiting octahedrons, cyan unlit bodies, and purple identity accents.

- [x] **Step 5: Run tests and commit**

```powershell
node --test src/systems/world/resonantMachineryRules.test.mjs src/systems/world/resonantInteraction.test.mjs
npm run typecheck
git add src/systems/entities/ResonantEncounterDirector.ts src/systems/entities/resonantEntities.ts src/systems/world/resonantMachineryRules.ts src/systems/world/resonantMachineryRules.test.mjs src/components/ResonantEffectsRenderer.tsx src/systems/events/GameEvents.ts
git commit -m "feat: make Sentinel combat about breaking the link"
```

---

## Task 9: Build safe, reversible Vault Mason arena state

**Files:**

- Create: `src/systems/entities/VaultMasonArena.ts`
- Create: `src/systems/entities/vaultMasonArena.test.mjs`
- Create: `src/systems/entities/VaultMasonEncounter.ts`
- Create: `src/systems/entities/vaultMasonEncounter.test.mjs`
- Modify: `src/systems/world/ResonantVaultRuntime.ts`
- Modify: `src/systems/WorldManager.ts`
- Modify: `src/components/ResonantVaultController.tsx`
- Modify: `src/App.tsx`

- [x] **Step 1: Define and test deterministic owned cells**

Add:

```ts
export const MASON_TEMP_META = 0x80;
export type MasonPatternId = 'measure_bar' | 'offset_bays' | 'cross_lanes' | 'broken_ring';

export interface MasonPatternStage {
    previewCells: Array<{ x: number; y: number; z: number }>;
    wallCells: Array<{ x: number; y: number; z: number; type: BlockType }>;
    echoCells: Array<{ x: number; y: number; z: number; type: BlockType }>;
}
```

Tests must prove every pattern stays in the arena-owned set, preserves entrance/core reachability, leaves a route around each wall group, and has a valid primary and echo stage.

- [x] **Step 2: Test protected-cell and occupancy filtering**

Write pure validation for current blocks, metadata, torch cells, mechanisms, gate cells, permanent shell cells, player AABB, and an airborne player's cell below. Unsafe cells are omitted; if omission invalidates navigation, reject the whole pattern and select the next deterministic pattern.

- [x] **Step 3: Implement tagged batched edits and repair**

Use existing masonry types with metadata `MASON_TEMP_META | patternIndex`, never a new persistent block ID. Capture original `{ type, metadata }` before a first write. Apply with `worldManager.setBlocks()`. Restore the captured originals on normal cleanup. On loading an unfinished encounter without in-memory originals, scan only the deterministic owned set and restore cells whose metadata contains `MASON_TEMP_META` to the generated AIR state.

Add only the minimal `WorldManager` helper needed to batch-read metadata if current `getMetadata` is insufficient; do not change the save format.

- [x] **Step 4: Wire all lifecycle repair points**

Call Mason cleanup:

- Before a new arena encounter.
- On boss defeat.
- On player death via a `ResonantVaultController` effect.
- On `vault:left` and runtime reset.
- In `App.handleQuitToTitle` before `saveGame({ force: true })`.
- In `App.handleStartGame` before resetting the previous `WorldManager`.

The two `App.tsx` calls are direct lifecycle safety calls, not a refactor.

- [x] **Step 5: Run focused save/repair tests and commit**

```powershell
node --test src/systems/entities/vaultMasonArena.test.mjs src/systems/entities/vaultMasonEncounter.test.mjs src/systems/progression/resonantVaultProgress.test.mjs
npm run typecheck
git add src/systems/entities/VaultMasonArena.ts src/systems/entities/vaultMasonEncounter.test.mjs src/systems/entities/vaultMasonArena.test.mjs src/systems/entities/VaultMasonEncounter.ts src/systems/world/ResonantVaultRuntime.ts src/systems/WorldManager.ts src/components/ResonantVaultController.tsx src/App.tsx
git commit -m "feat: make Mason arena changes safe and reversible"
```

---

## Task 10: Implement the Vault Mason's distinct combat state machine

**Files:**

- Modify: `src/systems/entities/VaultMasonEncounter.ts`
- Create: `src/systems/entities/VaultMasonEncounterCore.ts`
- Modify: `src/systems/entities/vaultMasonEncounter.test.mjs`
- Modify: `src/systems/entities/resonantEntities.ts`
- Modify: `src/systems/entities/Entity.ts`
- Modify: `src/systems/entities/EntityManager.ts`
- Modify: `src/systems/entities/ResonantEncounterDirector.ts`
- Modify: `src/systems/progression/ProgressionStore.ts`
- Modify: `src/systems/events/GameEvents.ts`
- Modify: `src/systems/world/ResonantVaultRuntime.ts`
- Modify: `src/data/blocks.ts`
- Modify: `src/data/resonantGuide.ts`

- [x] **Step 1: Write the combat state transition tests**

Use a fake world/entity sink and fake clock. Cover:

- Phase 1 `measure`, phase 2 `rebuild`, phase 3 `break` thresholds.
- Construct preview, primary movement, delayed echo movement.
- Pulse interrupt only during construction wind-up.
- Successful interrupt cancelling the echo and opening the chest vulnerability window.
- Closed-body damage multiplier and exposed-core multiplier.
- Masonry throw arc, breach charge line, and bounded tool sweep arc.
- Phase changes changing patterns/animation, not adding a generic tint/frenzy-only speed bump.
- Death cleanup and compatibility progression write.

- [x] **Step 2: Add focused render/gameplay state**

Expose:

```ts
export type MasonAction =
    | 'idle' | 'walk' | 'construct_windup' | 'construct_followthrough'
    | 'throw_windup' | 'throw_release' | 'charge' | 'sweep'
    | 'interrupted' | 'core_exposed' | 'phase_shed' | 'recover' | 'death';

export interface VaultMasonSnapshot {
    entityId: number | null;
    phase: 1 | 2 | 3;
    action: MasonAction;
    actionStartedAt: number;
    actionDuration: number;
    coreOpen: boolean;
    activePattern: MasonPatternId | null;
    previewCells: readonly MasonCell[];
}
```

Add Mason-owned physical projectile state separately from `EntityManager`'s Magnetic Warden projectiles.

- [x] **Step 3: Define a Mason entity without Warden mechanics**

Rename the kind to `vault_mason`. Its definition may use max HP, dimensions, speed, contact damage, leash radius, boss status, and drops. It must not set `polaritySwapInterval`, `shieldCrystals`, `magneticFieldRange`, `projectileInterval`, `slamThreshold`, or `frenzyThreshold`.

Add a generic `damageMultiplier` field to live `Entity` state and apply it once inside `EntityManager.damageEntity`; the Mason encounter controls that value. Do not add Mason pattern logic to `EntityManager`.

- [x] **Step 4: Integrate spawn, pulse, damage, and death**

`ResonantEncounterDirector` delegates arena spawn/tick/pulse/death handling to `VaultMasonEncounter` while retaining Sentinel ownership. Emit `vault:mason-spawned`, `vault:mason-phase`, `vault:mason-action`, `vault:mason-interrupted`, `vault:mason-core`, and `vault:mason-defeated`. Use `markVaultMasonDefeated()` to write `custodianDefeated`.

Change display copy and item names to `Vault Mason` and `Mason Sigil`. Keep enum and serialization identifiers intact.

- [x] **Step 5: Prove the Warden clone is gone and commit**

Add a source assertion that the Mason definition and encounter contain no Warden sound ID, polarity, shield crystal, slam ring, reflected boss bolt, or magnetic field behavior.

```powershell
node --test src/systems/entities/vaultMasonEncounter.test.mjs src/systems/entities/vaultMasonArena.test.mjs src/systems/progression/resonantVaultProgress.test.mjs
npm run typecheck
git add src/systems/entities src/systems/progression/ProgressionStore.ts src/systems/events/GameEvents.ts src/systems/world/ResonantVaultRuntime.ts src/data/blocks.ts src/data/resonantGuide.ts
git commit -m "feat: give the Vault Mason unique combat mechanics"
```

---

## Task 11: Give the Mason a textured articulated model and complete animations

**Files:**

- Create: `src/components/VaultMasonRenderer.tsx`
- Create: `src/components/vaultMasonModel.ts`
- Create: `src/components/vaultMasonModel.test.mjs`
- Create: `public/assets/rvx/textures/entities/vault_mason.png`
- Modify: `src/components/EntityRenderer.tsx`
- Modify: `src/components/ResonantEffectsRenderer.tsx`
- Modify: `src/systems/entities/VaultMasonEncounter.ts`
- Modify: `src/systems/entities/VaultMasonEncounterCore.ts`

- [x] **Step 1: Write renderer-contract tests**

Assert the dedicated texture file exists and decodes as a nontrivial PNG. Assert the model declares separate torso, head, shoulders, upper arms, forearms/tools, pelvis, thighs, shins, feet, chest doors, and core. Assert every `MasonAction` maps to an animation function and the generic entity box path excludes `vault_mason`.

- [x] **Step 2: Create the production diffuse texture with `imagegen`**

Use the required `imagegen` skill to create a square Atlas-style diffuse sheet: dark blue-gray stone plates, aged iron joints, chipped edges, dust-dark recesses, a small muted sea-glass receptive seam, and no neon glow baked into the image. The image must contain authored material variation and be suitable for nearest-filtered UV regions.

- [x] **Step 3: Build the articulated hierarchy**

`vaultMasonModel.ts` defines named box proportions and UV rectangles. `VaultMasonRenderer` loads the PNG once, sets `SRGBColorSpace`, `NearestFilter`, and a world-lit `meshLambertMaterial`, then builds the approximately four-block-tall asymmetric shaping/bracing silhouette. The chest uses two physical door meshes that reveal a separate core mesh.

- [x] **Step 4: Drive all explicit animation states**

Use encounter timestamps and eased interpolation for idle weight shift, planted walk, construction wind-up/follow-through, throw wind-up/release, charge, sweep, pulse interruption, exposed stagger, phase plate shedding, recovery, and death collapse. Keep a settled death pose long enough for the defeat cue tail before despawn.

- [x] **Step 5: Render physical fight feedback**

Render Mason masonry projectiles as world-lit textured chunks. Render wall previews at owned sockets with dust and subtle seam response. Use debris particles on wall moves and charges. Remove the Mason from generic neon/orbiting effects and never render a shield bubble, torus, or slam ring.

- [x] **Step 6: Run tests and commit**

```powershell
node --test src/components/vaultMasonModel.test.mjs src/systems/entities/vaultMasonEncounter.test.mjs
npm run typecheck
git add src/components/VaultMasonRenderer.tsx src/components/vaultMasonModel.ts src/components/vaultMasonModel.test.mjs src/components/EntityRenderer.tsx src/components/ResonantEffectsRenderer.tsx src/systems/entities/VaultMasonEncounter.ts public/assets/rvx/textures/entities/vault_mason.png
git commit -m "feat: render the articulated Vault Mason"
```

---

## Task 12: Restrain block textures and remove neon presentation

**Files:**

- Modify: `src/systems/textures/resonantTexturePixels.ts`
- Modify: `src/systems/registry/resonantPresentation.test.mjs`
- Modify: `src/systems/textures/textureAssets.test.mjs`
- Modify: `src/components/ResonantEffectsRenderer.tsx`
- Modify: `src/data/resonantDefinitions.ts`

- [x] **Step 1: Write quantitative texture constraints**

Decode the generated 16-by-16 tiles in tests and assert:

- Base masonry uses mostly muted blue-gray/dark stone pixels.
- Bright teal pixels occupy less than 15 percent of any non-lamp/non-crystal tile.
- Purple identity pixels are absent.
- Seal, lamp, moving block, chiseled block, and item tiles have distinct pixel signatures.
- Large full-tile luminous crosses and generic repeated circuit grids are absent.

- [x] **Step 2: Author each important tile**

Replace the shared pattern treatment with specific joints, chips, insets, edge wear, glyphs, fixture housing, and tool silhouettes. Keep limited luminous accents on `ECHO_CRYSTAL`, `RESONANT_LAMP`, receptive pylon insets, `PHASE_BLOCK` edges, and `VAULT_SEAL` seams only.

- [x] **Step 3: Match definitions and effects**

Reduce light levels where required to keep functional glow restrained while maintaining Task 3's navigability. Replace remaining unlit cyan/purple effect primitives with world-lit dust, stone chips, metal contact sparks, and brief low-opacity receptive seams.

- [x] **Step 4: Run tests and commit**

```powershell
node --test src/systems/registry/resonantPresentation.test.mjs src/systems/textures/textureAssets.test.mjs
npm run typecheck
git add src/systems/textures/resonantTexturePixels.ts src/systems/registry/resonantPresentation.test.mjs src/systems/textures/textureAssets.test.mjs src/components/ResonantEffectsRenderer.tsx src/data/resonantDefinitions.ts
git commit -m "art: give the Resonant Vault a restrained material language"
```

---

## Task 13: Produce an original FL Studio score and recorded-source sound package

**Files:**

- Delete: `scripts/render_resonant_audio.py`
- Delete: `assets/source/audio/resonant_vault/*.mid`
- Delete: `assets/source/audio/resonant_vault/render_report.json`
- Replace: `public/assets/rvx/sounds/resonant_vault/*.ogg`
- Replace: `public/assets/rvx/sounds/music/resonant_vault/*.ogg`
- Replace: `public/assets/rvx/sounds/music/resonant_combat/*.ogg`
- Delete: `public/assets/rvx/sounds/music/boss_resonant_custodian/`
- Create: `public/assets/rvx/sounds/music/resonant_approach/listening_spire.ogg`
- Create: `public/assets/rvx/sounds/music/resonant_vault/the_first_echo.ogg`
- Create: `public/assets/rvx/sounds/music/resonant_combat/measured_stone.ogg`
- Create: `public/assets/rvx/sounds/music/boss_vault_mason/the_vault_mason.ogg`
- Create: `public/assets/rvx/sounds/music/resonant_escape/answer_the_surface.ogg`
- Create: `assets/source/audio/resonant_vault/resonant_vault_score.flp`
- Create: `assets/source/audio/resonant_vault/resonant_vault_sound_design.flp`
- Create: `assets/source/audio/resonant_vault/PRODUCTION.md`
- Create: `assets/source/audio/resonant_vault/ATTRIBUTION.md`
- Create: `scripts/validate_resonant_audio.mjs`
- Rewrite: `src/systems/sound/resonantVaultAudio.test.mjs`

- [ ] **Step 1: Audit the available FL Studio production environment**

Open FL Studio 2025 through the Windows-control workflow and verify the installed plugins before arranging. Prefer the user's visible sample-based and physically performed instruments (including LABS, Kontakt 7, UVI Workstation, and suitable FL Studio instruments/effects) for the audible core. Omnisphere, Serum 2, ZENOLOGY, and synthetic layers may be used only as restrained intentional support, never as placeholder sound design.

Record the exact FL Studio version, plugin names and versions, presets or self-made patches, sample/source provenance, channel routing, buses, export settings, and any unavailable-plugin substitution notes in `PRODUCTION.md`. Confirm from each vendor's official license that rendered audio may be redistributed. Do not commit proprietary plugin libraries, factory samples, or third-party presets; commit only project state that is legally redistributable and the final renders.

- [ ] **Step 2: Compose and arrange one original five-state score**

Create `resonant_vault_score.flp` with five rendered arrangements that share one concise pulse-and-answer motif:

- `listening_spire`: exposed acoustic texture, air, and distant answers.
- `the_first_echo`: patient interior pulse with enough negative space for navigation cues.
- `measured_stone`: clearer construction rhythm and percussion without trailer-music bombast.
- `the_vault_mason`: three authored sections aligned to wall building, path compression, and core exposure.
- `answer_the_surface`: the same motif under forward motion, resolving only at the surface.

Humanize parts through deliberate performance, articulation, dynamics, and phrase shaping rather than random pitch or timing. Render full intros, bodies, transition-safe musical endings, and natural room/reverb tails. The existing Alba MacKenna CC BY 4.0 source set remains an emergency fallback only if FL Studio production cannot meet the acceptance bar; do not silently mix the fallback album into the original score.

- [ ] **Step 3: Lock and document recorded SFX sources**

Use only the following recorded/public-domain sources:

- Versilian Studios VSCO 2 Community Edition, CC0, `https://github.com/sgossner/VSCO-2-CE`: exact Anvil, Brake Drum, Bass Drum, Bell Tree, Ratchet, Timpani, Glock, and experimental percussion WAVs listed in the attribution file.
- `Tomb Door Open, Stone Scrape`, Kinoton, Freesound 352829, CC0.
- `Heavy stone door opens`, PostProdDog, Freesound 578490, CC0.
- `Rocks.wav`, adamgryu, Freesound 336023, CC0.
- `Small Rock and Stone Hits 2.wav`, lolamadeus, Freesound 179360, CC0.
- `Gong (gong_hit_mf_3.wav)`, Sam Gossner/VSCO, Freesound 375535, CC0.

Keep source clips or source checksums/provenance where redistribution permits. Add any user-recorded Foley to `ATTRIBUTION.md` as original project material. No oscillator-only cue, generated-noise cue, text-to-audio output, or synthesized fallback may be accepted as a finished vault effect.

- [ ] **Step 4: Design the complete cue set in FL Studio**

Produce 48 kHz stereo Ogg/Vorbis outputs for:

- Discovery, route preview variants, vault entry, and Listening Stone.
- Resonator and Bracer pulse variants.
- Correct, wrong, completion, phase preview/move, and seal move.
- Sentinel spawn, steps, link, attack, hurt, and death.
- Mason wake, idle, steps, joint strain, construct preview, wall moves, throw, charge, sweep, interrupt, core open, hurt, phase shed, and death.
- Core open/claim, escape gate, warning, and surface completion.

Build `resonant_vault_sound_design.flp` from recorded stone, metal, mechanism, percussion, and room sources. Edits may trim, layer, EQ, pitch-shift, compress, convolve, automate, and spatialize. Synthesis may reinforce a recorded cue subtly, but no accepted effect may be an oscillator/noise placeholder. Every output must have an intentional fade or naturally captured tail after its last major transient, and repeated actions need enough variations to avoid obvious repetition.

- [ ] **Step 5: Normalize and validate the complete package**

Export 48 kHz, 24-bit WAV masters from FL Studio, then encode game Ogg/Vorbis assets. Target music around `-17 LUFS-I` within the design's `-18` to `-16` range and limit true peak to `-1 dBTP` or below. Level SFX by gameplay family rather than forcing every cue to one loudness. Preserve intros, bodies, and endings; do not hard-loop by deleting tails. Keep lossless masters outside the public runtime tree when repository size permits.

- [ ] **Step 6: Replace the old test with production gates**

`validate_resonant_audio.mjs` must use FFprobe to check codec, sample rate, channels, duration, integrated loudness, and true peak; inspect the trailing 250 ms to reject a hard discontinuity; and reject any file path referenced by the removed MIDI renderer. The Node test also asserts that the FL Studio production record and every source/license entry exist, and that all runtime filenames use the original score names.

Run:

```powershell
node scripts/validate_resonant_audio.mjs
node --test src/systems/sound/resonantVaultAudio.test.mjs
```

- [ ] **Step 7: Perform listening review and commit the replacement package**

Review every music state and high-frequency SFX family on headphones and speakers, then in browser and Electron at the game's default mix. Reject random-feeling attacks, brittle highs, frequency masking, abrupt ends, obvious stock-preset character, weak Mason weight, and transitions that do not feel like one score.

```powershell
git add -A scripts/render_resonant_audio.py scripts/validate_resonant_audio.mjs assets/source/audio/resonant_vault public/assets/rvx/sounds/resonant_vault public/assets/rvx/sounds/music
git commit -m "audio: produce the Resonant Vault score and sound package"
```

---

## Task 14: Make vault audio fail silent and music truly crossfade

**Files:**

- Modify: `src/systems/sound/soundTypes.ts`
- Modify: `src/systems/sound/SoundManager.ts`
- Modify: `src/systems/sound/soundDefaults.ts`
- Modify: `src/systems/sound/MusicController.ts`
- Modify: `src/systems/sound/ResonantVaultAudio.ts`
- Modify: `public/assets/rvx/sounds.json`
- Modify: `public/assets/rvx/sounds/music-index.json`
- Modify: `src/systems/sound/resonantVaultAudio.test.mjs`
- Modify: `src/systems/events/GameEvents.ts`

- [ ] **Step 1: Write failure-policy and transition tests**

Add `fallback?: 'synthesize' | 'silent'` to `SoundEventDefinition`, defaulting to `synthesize` for existing Atlas events. Test that every `vault.*` definition and all five vault music definitions use `fallback: 'silent'`. A missing vault file returns `null`, emits one diagnostic per URL, and never calls `createFallbackBuffer`.

Test transition policy for approach -> interior -> combat -> Mason -> escape -> world. Every vault boundary must start the incoming deck before the outgoing deck is paused/reset.

- [ ] **Step 2: Thread fallback policy into buffer loading**

Change `getBuffer(path)` to accept the definition's fallback policy. Permanent load/decode failure calls `createFallbackBuffer` only for `synthesize`; `silent` logs once and caches a silent failure sentinel without retry storms. Preload follows the same rule.

- [ ] **Step 3: Rename and map all audio events**

Replace Custodian event IDs with `vault.mason_*`, add wall/attack/core cues, and update `ResonantVaultAudio` to use positional playback for machinery, Sentinels, Mason actions, projectiles, and moving walls. Keep existing source concurrency limits so retriggers do not stop playing tails.

- [ ] **Step 4: Use the two decks as an overlap transition**

For any transition where either side is a Resonant context, `MusicController.switchContext` must call `playNextTrack(fadeIn, fadeOut)` immediately without first calling `stopMusic`. Use:

- Approach/interior: 3.0-second overlap.
- Interior/combat: 1.5-second overlap.
- Combat/Mason: 1.0-second overlap.
- Mason/escape: 1.0-second overlap.
- Vault/world: 4.0-second overlap.

Let `SoundManager.playMusic` retire the outgoing deck only after its gain reaches zero. Do not reset a deck that has become active again during a rapid transition. Keep death/menu behavior unchanged unless the shared deck safety test exposes a regression.

- [ ] **Step 5: Preserve one-shot tails**

Do not stop `AudioBufferSourceNode`s on room, phase, boss, music-context, or escape changes. Mason death waits for the settled animation and event tail before entity removal. The director may suppress duplicate new triggers but may not terminate an existing cue.

- [ ] **Step 6: Regenerate the static music index, test, and commit**

```powershell
node scripts/generate_music_index.mjs
node --test src/systems/sound/resonantVaultAudio.test.mjs
node scripts/validate_resonant_audio.mjs
npm run typecheck
git add src/systems/sound src/systems/events/GameEvents.ts public/assets/rvx/sounds.json public/assets/rvx/sounds/music-index.json
git commit -m "fix: crossfade vault music and preserve audio tails"
```

---

## Task 15: Production integration, save compatibility, and release validation

**Files:**

- Modify: `CHANGELOG.md`
- Modify: `src/data/changelog.ts`
- Modify: relevant tests discovered by the full suite
- Modify: only defects found by visual/audio/save validation

- [ ] **Step 1: Install dependencies and run the entire Node test inventory**

```powershell
npm install
node --test (Get-ChildItem -Recurse -Filter *.test.mjs src | ForEach-Object FullName)
```

Fix all failures at the owning boundary. Do not weaken the new production assertions to make the suite green.

- [ ] **Step 2: Run static and production builds**

```powershell
npm run typecheck
npm run lint
npm run build
npm run electron:build
```

The Electron packaging step may be skipped only if the environment cannot package Windows artifacts after the regular Electron runtime smoke test succeeds; report the exact external packaging blocker.

- [ ] **Step 3: Run a fresh-world browser traversal**

Use the Atlas smoke-test skill and browser automation to start Vite and verify a newly generated vault at gameplay resolution:

- Surface landmark and descent are readable.
- Descent works in both directions.
- Every room doorway is physically open.
- The one-line objective changes correctly without chat dumps.
- Pattern, crossing, combat, and hub echoes preview then resolve.
- Torch placement succeeds while mining/ordinary placement remain blocked.
- Mason model, core doors, animations, attacks, arena walls, interrupts, and phase shedding are visible and coherent.
- Both escape routes reach separate real surface ruins and complete only outside.

Capture screenshots of approach, hub, each wing, Mason phase 1/2/3, core, and both outlets. Compare normal and minimum supported brightness settings.

- [ ] **Step 4: Run save/load and cleanup scenarios**

Verify:

- Old metadata without `resonantVaults` loads.
- Existing wing/core/escape progress remains intact.
- `custodianDefeated: true` presents as Mason defeated.
- Saving during a Mason pattern and reloading repairs tagged cells before respawn.
- Death, leaving the vault, quitting to title, and runtime reset restore arena cells.
- A player torch is never removed by repair.
- Completed-vault player edits are never repaired as encounter state.

- [ ] **Step 5: Perform browser and Electron audio review**

Listen through approach, interior, wing combat, Mason phases, defeat, escape, and return to world music. Reject and repair any cue with masking, repetition fatigue, a hard end, clipped transient, missing positional read, synthetic placeholder character, or deck cutoff. Confirm browser Web Audio and Electron both decode every Ogg.

- [ ] **Step 6: Review the diff against every acceptance requirement**

Search for forbidden remnants:

```powershell
rg -n "vault_custodian|Custodian|/vault|querySelector|createElement|entity\.magnetic_warden|polarity|shieldCrystals|slamThreshold|render_resonant_audio|\.mid|synth" src public/assets/rvx/sounds assets/source/audio/resonant_vault scripts
rg -n "cyan|purple|gradient|glow|holog|scanline" src/components src/systems/textures
```

Classify each remaining match. Compatibility storage names and unrelated Magnetic Warden code are allowed; player-facing Custodian text, Resonant Warden reuse, generated-audio artifacts, DOM injection, or neon vault UI are not.

- [ ] **Step 7: Update current-facing release notes**

Describe the final player-visible experience, not the sequence of internal fixes. State that newly generated vaults receive the full rebuilt architecture and that existing experimental vault progress remains readable without destructive chunk regeneration.

- [ ] **Step 8: Request code review, rerun gates, commit, and push**

Use `superpowers:requesting-code-review`, address actionable findings, then rerun the affected focused suites plus:

```powershell
node --test (Get-ChildItem -Recurse -Filter *.test.mjs src | ForEach-Object FullName)
npm run typecheck
npm run lint
npm run build
node scripts/validate_resonant_audio.mjs
git status --short
```

Commit integration-only fixes and release notes:

```powershell
git add CHANGELOG.md src/data/changelog.ts
git commit -m "docs: describe the rebuilt Resonant Vault expedition"
git push origin codex/daily-2026-07-13-resonant-vaults
```

The branch is complete only when the remote contains all validated commits and the working tree is clean.
