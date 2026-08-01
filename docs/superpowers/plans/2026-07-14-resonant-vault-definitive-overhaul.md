# Resonant Vault Definitive Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Do not use subagent-driven execution unless the user separately authorizes subagents. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current Resonant Vault MVP with a deterministic 45 to 70 minute expedition featuring a ground-up architectural rebuild, conventional weapons, one echo artifact, intelligent animated enemies, the Bell Titan, two genuinely different surface escapes, and reliable looping and interruptible music.

**Architecture:** Keep vault candidate discovery and chunk-local painting in the existing world-generation boundary, but split room selection, architecture, puzzles, loot, navigation, encounters, and the Bell Titan into focused modules with pure testable cores. Preserve existing numeric IDs and serialized fields while making the new topology and player-facing progression apply to newly generated vaults. Integrate through narrow hooks in `WorldManager`, `InteractionController`, `EntityManager`, `MusicController`, and existing HUD/render mounts.

**Tech Stack:** TypeScript 5.3, React 18, Three.js 0.160, react-three-fiber 8, Vite 5, Electron 40, Node's built-in test runner, esbuild-backed runtime tests, Web Audio, Ogg/Vorbis, Atlas block metadata and tile entities.

## Global Constraints

- The binding design is `docs/superpowers/specs/2026-07-14-resonant-vault-definitive-overhaul-design.md`.
- Do not use FL Studio, edit FL projects, use installed VSTs, remaster music, or render replacement music until the user explicitly lifts the hold.
- Do not claim the optional music remaster complete while the FL Studio gate is held. Recorded/foley SFX cleanup may proceed without FL Studio.
- Do not declare the feature fully production-complete while the approved final performed-audio/mastering phase remains held; code-side audio reliability and non-FL recorded/foley replacement may still be completed and published.
- Keep current registered numeric IDs exact; leave retired prototype holes `172` and `174-176` unregistered, and leave `188-189` unused.
- Keep `BlockType` byte-compatible and reject inventory-only IDs from voxel writes.
- Guarantee the full topology and visual rebuild for newly generated vault footprints; do not destructively regenerate persisted chunks.
- Use only the current room, Titan, core, route, timer, and checkpoint progression fields; do not convert prototype fields.
- Remove the Mason temporary-arena repair path and all obsolete boss aliases.
- Do not broadly refactor `src/App.tsx` or `src/systems/WorldManager.ts`; additions there must be narrow integration hooks.
- Preserve existing controls, inventory flow, base-game bosses, and non-vault music behavior.
- Use environmental teaching and compact Atlas-native objectives; no prose tutorials, lore walls, neon HUD, gradients, scanlines, holographic panels, or debug guidance.
- Keep restrained luminous accents only on functional vault blocks; all critical routes, enemies, and boss states remain readable without player torches.
- Allow valid torch placement while the vault remains sealed.
- Missing vault SFX fail silent with diagnostics; no vault event may invoke synthesized fallback audio.
- Active one-shots retain their complete tails across room, phase, boss, music-context, death, and escape changes.
- Use TDD for every behavior change: failing test, observed failure, minimal implementation, passing test, then commit.
- Do not weaken an acceptance test to make an implementation pass.
- Do not spawn subagents during execution unless the user explicitly authorizes subagent work.

## File and responsibility map

### Existing files retained as public boundaries

- `src/systems/world/resonantVaults.ts`: candidate discovery, public layout types, room graph assembly, surface descriptors.
- `src/systems/world/resonantVaultGeneration.ts`: chunk-local orchestration and final doorway reassertion.
- `src/systems/world/ResonantVaultRuntime.ts`: active layout, progression, puzzle dispatch, gates, escape, snapshots.
- `src/systems/entities/EntityManager.ts`: authoritative entity collision, gravity, knockback, damage, generic movement integration.
- `src/components/controllers/InteractionController.tsx`: normal player use, melee, crossbow, chest, and placement entry points.
- `src/systems/sound/MusicController.ts`: music-context priority and transitions.
- `src/systems/sound/SoundManager.ts`: deck playback, loop scheduling, crossfades, one-shot lifetime.

### Focused files created by this plan

- `src/systems/world/resonantVaultRooms.ts`: authored room-module definitions, deterministic constrained selection, slot placement.
- `src/systems/world/resonantVaultConnectivity.ts`: socket expansion, actual-voxel walkability and layout validation.
- `src/systems/world/resonantVaultArchitecture.ts`: shells, arches, ribs, stairs, slabs, lamps, landmarks, and room-specific furnishing.
- `src/systems/world/resonantVaultPuzzles.ts`: memory markers, relay/counterweight descriptors, traversal checkpoints and fallback controls.
- `src/systems/world/resonantVaultLoot.ts`: cache metadata, deterministic contents, guaranteed equipment, repeat loot.
- `src/systems/combat/vaultWeapons.ts`: spear, crossbow, bolt, maul, hammer, armor-pressure, and reload rules.
- `src/systems/combat/VaultProjectileSystem.ts`: player-fired physical bolt simulation and collision.
- `src/systems/entities/navigation/VoxelNavigator.ts`: bounded voxel A-star, standability, movement profiles, and caching inputs.
- `src/systems/entities/navigation/EntityLocomotion.ts`: waypoint following, authored movement actions, and stuck recovery.
- `src/systems/entities/resonantVaultEnemies.ts`: Guard, Marksman, Bell Hound, and Tollkeeper attack decisions.
- `src/components/ResonantVaultEnemyRenderer.tsx`: articulated vault enemy models and animation playback.
- `src/components/resonantVaultEnemyModels.ts`: pure part definitions and pose selection.
- `src/systems/entities/BellTitanEncounterCore.ts`: pure boss state machine, attacks, exposure, phases, shockwaves.
- `src/systems/entities/BellTitanEncounter.ts`: runtime adapter, entity ownership, damage and event bridge.
- `src/components/BellTitanRenderer.tsx`: textured articulated model, armor break, physical telegraphs and debris.
- `src/components/bellTitanModel.ts`: pure Bell Titan part and animation-pose definitions.
- `src/systems/world/resonantVaultEscapes.ts`: route geometry, surface stair continuation, and outlet validation.
- `src/systems/world/resonantVaultHazards.ts`: route-specific collapse cells, crushers, spikes, and hazard timing.
- `src/systems/sound/musicLoops.ts`: typed loop metadata, sample scheduling, and dual-deck overlap.

---

### Task 1: Reserve the definitive content family and remove prototype gadgets

**Files:**
- Modify: `src/types.ts`
- Modify: `src/data/resonantDefinitions.ts`
- Modify: `src/data/resonantRecipes.ts`
- Modify: `src/systems/registry/worldBlockCatalog.ts`
- Modify: `src/systems/registry/itemCatalog.ts`
- Modify: `src/systems/registry/itemStats.ts`
- Modify: `src/systems/registry/blockFamilies.ts`
- Modify: `src/systems/textures/resonantTexturePixels.ts`
- Modify: `src/data/resonantContent.test.mjs`
- Modify: `src/systems/registry/resonantCatalogs.test.mjs`
- Create: `src/systems/registry/resonantDefinitiveContent.test.mjs`

**Interfaces:**
- Produces: `BlockType.ECHO_STONE_SLAB` through `BlockType.TITAN_HAMMER` at exact IDs `178-187`.
- Produces: `isVaultWeapon(type: BlockType): boolean` and `isVaultRangedWeapon(type: BlockType): boolean` from `itemStats.ts`.
- Produces: shaped block-family entries for Echo Stone and Echo Bricks.
- Preserves: current definitions and numeric meanings, removes prototype item definitions and recipes, and leaves their numeric holes unregistered.

- [ ] **Step 1: Write the failing definitive content test**

```js
// src/systems/registry/resonantDefinitiveContent.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { BlockType } from '../../types.ts';
import { BLOCKS } from '../../data/blocks.ts';
import { RESONANT_RECIPES } from '../../data/resonantRecipes.ts';
import { getItemCatalogEntry, isInventoryOnlyItemId } from './itemCatalog.ts';
import { isWorldBlockId } from './worldBlockCatalog.ts';
import { getItemStats, isVaultRangedWeapon, isVaultWeapon } from './itemStats.ts';

const expected = {
  ECHO_STONE_SLAB: 178,
  ECHO_STONE_STAIRS: 179,
  ECHO_BRICK_SLAB: 180,
  ECHO_BRICK_STAIRS: 181,
  VAULTSTEEL_SPEAR: 182,
  VAULT_CROSSBOW: 183,
  VAULT_BOLT: 184,
  BELLBREAKER_MAUL: 185,
  ECHO_TUNING_FORK: 186,
  TITAN_HAMMER: 187,
};

test('definitive vault IDs, classification, shapes, and weapon stats are exact', () => {
  for (const [name, id] of Object.entries(expected)) assert.equal(BlockType[name], id);
  for (const id of [178, 179, 180, 181]) {
    assert.equal(isWorldBlockId(id), true);
    assert.equal(isInventoryOnlyItemId(id), false);
  }
  for (const id of [182, 183, 184, 185, 186, 187]) {
    assert.equal(isInventoryOnlyItemId(id), true);
    assert.equal(isWorldBlockId(id), false);
    assert.ok(getItemCatalogEntry(id));
  }
  assert.equal(BLOCKS[BlockType.ECHO_STONE_SLAB].shape, 'slab');
  assert.equal(BLOCKS[BlockType.ECHO_STONE_STAIRS].shape, 'stairs');
  assert.equal(BLOCKS[BlockType.ECHO_BRICK_SLAB].textureParent, BlockType.ECHO_BRICKS);
  assert.equal(isVaultWeapon(BlockType.VAULTSTEEL_SPEAR), true);
  assert.equal(isVaultWeapon(BlockType.VAULT_CROSSBOW), true);
  assert.equal(isVaultRangedWeapon(BlockType.VAULT_CROSSBOW), true);
  assert.ok(getItemStats({ type: BlockType.BELLBREAKER_MAUL, count: 1 })?.attack);
  assert.equal(RESONANT_RECIPES.some(({ output }) => output.type === BlockType.RESONATOR), false);
  assert.equal(RESONANT_RECIPES.some(({ output }) => output.type === BlockType.PULSE_BRACER), false);
});
```

- [ ] **Step 2: Run the test and observe the missing definitive IDs**

Run: `node --test src/systems/registry/resonantDefinitiveContent.test.mjs`

Expected: FAIL because `ECHO_STONE_SLAB`, vault weapons, and the new catalog entries do not exist.

- [ ] **Step 3: Add the approved numeric IDs and definitions**

```ts
// src/types.ts, inside namespace BlockType
export const ECHO_STONE_SLAB = 178 as BlockType;
export const ECHO_STONE_STAIRS = 179 as BlockType;
export const ECHO_BRICK_SLAB = 180 as BlockType;
export const ECHO_BRICK_STAIRS = 181 as BlockType;
export const VAULTSTEEL_SPEAR = 182 as BlockType;
export const VAULT_CROSSBOW = 183 as BlockType;
export const VAULT_BOLT = 184 as BlockType;
export const BELLBREAKER_MAUL = 185 as BlockType;
export const ECHO_TUNING_FORK = 186 as BlockType;
export const TITAN_HAMMER = 187 as BlockType;
```

```ts
// src/data/resonantDefinitions.ts
[BlockType.ECHO_STONE_SLAB]: { id: BlockType.ECHO_STONE_SLAB, color: '#59615d', name: 'Echo Stone Slab', textureSlot: 237, textureParent: BlockType.ECHO_STONE, shape: 'slab', transparent: true, hardness: 2.4, preferredTool: 'pickaxe', minHarvestTier: 1, category: 'building', drops: [{ type: BlockType.ECHO_STONE_SLAB, chance: 1, min: 1, max: 1 }] },
[BlockType.ECHO_STONE_STAIRS]: { id: BlockType.ECHO_STONE_STAIRS, color: '#59615d', name: 'Echo Stone Stairs', textureSlot: 237, textureParent: BlockType.ECHO_STONE, shape: 'stairs', transparent: true, hardness: 2.4, preferredTool: 'pickaxe', minHarvestTier: 1, category: 'building', drops: [{ type: BlockType.ECHO_STONE_STAIRS, chance: 1, min: 1, max: 1 }] },
[BlockType.ECHO_BRICK_SLAB]: { id: BlockType.ECHO_BRICK_SLAB, color: '#4f5854', name: 'Echo Brick Slab', textureSlot: 238, textureParent: BlockType.ECHO_BRICKS, shape: 'slab', transparent: true, hardness: 2.6, preferredTool: 'pickaxe', minHarvestTier: 1, category: 'building', drops: [{ type: BlockType.ECHO_BRICK_SLAB, chance: 1, min: 1, max: 1 }] },
[BlockType.ECHO_BRICK_STAIRS]: { id: BlockType.ECHO_BRICK_STAIRS, color: '#4f5854', name: 'Echo Brick Stairs', textureSlot: 238, textureParent: BlockType.ECHO_BRICKS, shape: 'stairs', transparent: true, hardness: 2.6, preferredTool: 'pickaxe', minHarvestTier: 1, category: 'building', drops: [{ type: BlockType.ECHO_BRICK_STAIRS, chance: 1, min: 1, max: 1 }] },
[BlockType.VAULTSTEEL_SPEAR]: { id: BlockType.VAULTSTEEL_SPEAR, color: '#8c8b7e', name: 'Vaultsteel Spear', textureSlot: 261, hardness: 0, isItem: true, category: 'tools' },
[BlockType.VAULT_CROSSBOW]: { id: BlockType.VAULT_CROSSBOW, color: '#6f5d47', name: 'Vault Crossbow', textureSlot: 262, hardness: 0, isItem: true, category: 'tools' },
[BlockType.VAULT_BOLT]: { id: BlockType.VAULT_BOLT, color: '#a9a89b', name: 'Vault Bolt', textureSlot: 263, hardness: 0, isItem: true, category: 'tools' },
[BlockType.BELLBREAKER_MAUL]: { id: BlockType.BELLBREAKER_MAUL, color: '#716f66', name: 'Bellbreaker Maul', textureSlot: 264, hardness: 0, isItem: true, category: 'tools' },
[BlockType.ECHO_TUNING_FORK]: { id: BlockType.ECHO_TUNING_FORK, color: '#9c9276', name: 'Echo Tuning Fork', textureSlot: 265, hardness: 0, isItem: true, category: 'tools' },
[BlockType.TITAN_HAMMER]: { id: BlockType.TITAN_HAMMER, color: '#81735c', name: 'Titan Hammer', textureSlot: 266, hardness: 0, isItem: true, category: 'tools' },
```

- [ ] **Step 4: Extend catalogs, block families, stats, recipes, and pixel icons**

```ts
// src/systems/registry/itemCatalog.ts
export type ItemUseBehavior =
    | 'material' | 'resonator' | 'pulse_bracer' | 'vault_key' | 'reward_component'
    | 'melee_weapon' | 'crossbow' | 'ammunition' | 'echo_tuning_fork';

export const RESONANT_ITEM_IDS = [170, 171, 172, 173, 174, 175, 176, 177, 182, 183, 184, 185, 186, 187] as const;

// Add to ITEM_CATALOG
182: { id: BlockType.VAULTSTEEL_SPEAR, maxStack: 1, useBehavior: 'melee_weapon', placedBlock: null },
183: { id: BlockType.VAULT_CROSSBOW, maxStack: 1, useBehavior: 'crossbow', placedBlock: null },
184: { id: BlockType.VAULT_BOLT, maxStack: 64, useBehavior: 'ammunition', placedBlock: null },
185: { id: BlockType.BELLBREAKER_MAUL, maxStack: 1, useBehavior: 'melee_weapon', placedBlock: null },
186: { id: BlockType.ECHO_TUNING_FORK, maxStack: 1, useBehavior: 'echo_tuning_fork', placedBlock: null },
187: { id: BlockType.TITAN_HAMMER, maxStack: 1, useBehavior: 'melee_weapon', placedBlock: null },
```

```ts
// src/systems/registry/itemStats.ts
ITEM_STATS[BlockType.VAULTSTEEL_SPEAR] = { attack: 6, maxDurability: 420 };
ITEM_STATS[BlockType.VAULT_CROSSBOW] = { attack: 7, maxDurability: 360 };
ITEM_STATS[BlockType.BELLBREAKER_MAUL] = { attack: 9, maxDurability: 480 };
ITEM_STATS[BlockType.TITAN_HAMMER] = { attack: 11, maxDurability: 720 };

const VAULT_WEAPONS = new Set<BlockType>([
    BlockType.VAULTSTEEL_SPEAR,
    BlockType.VAULT_CROSSBOW,
    BlockType.BELLBREAKER_MAUL,
    BlockType.TITAN_HAMMER,
]);
export const isVaultWeapon = (type: BlockType): boolean => VAULT_WEAPONS.has(type);
export const isVaultRangedWeapon = (type: BlockType): boolean => type === BlockType.VAULT_CROSSBOW;
```

Add Echo Stone and Echo Brick entries to `BLOCK_FAMILIES`, add slab/stair crafting patterns using the existing family recipe helpers, remove the prototype gadget registrations and recipes, and paint slots `261-266` as recognizable spear, crossbow, bolt, maul, tuning fork, and hammer silhouettes.

- [ ] **Step 5: Run focused content tests**

Run: `node --test src/systems/registry/resonantDefinitiveContent.test.mjs src/systems/registry/resonantCatalogs.test.mjs src/data/resonantContent.test.mjs`

Expected: PASS with no ID collision, classification, definition, shape, texture-slot, or retired-ID registration.

- [ ] **Step 6: Run static validation**

Run: `npm run typecheck`

Expected: exit code 0.

- [ ] **Step 7: Commit**

```powershell
git add src/types.ts src/data/resonantDefinitions.ts src/data/resonantRecipes.ts src/systems/registry/worldBlockCatalog.ts src/systems/registry/itemCatalog.ts src/systems/registry/itemStats.ts src/systems/registry/blockFamilies.ts src/systems/textures/resonantTexturePixels.ts src/data/resonantContent.test.mjs src/systems/registry/resonantCatalogs.test.mjs src/systems/registry/resonantDefinitiveContent.test.mjs
git commit -m "feat: replace vault gadgets with weapons"
```

### Task 2: Build the constrained seeded room graph

**Files:**
- Create: `src/systems/world/resonantVaultRooms.ts`
- Create: `src/systems/world/resonantVaultRooms.test.mjs`
- Modify: `src/systems/world/resonantVaults.ts`
- Modify: `src/systems/world/resonantVaults.test.mjs`

**Interfaces:**
- Produces: `VaultRoomId = string` and definitive `VaultRoomKind` values.
- Produces: `selectVaultModules(candidate: VaultCandidate): VaultModuleSelection`.
- Produces: `placeVaultRooms(candidate, centerSurfaceY, getSurfaceY): { rooms, edges, surfaceOutlets }`.
- Changes: `VaultDoorway.from`, `VaultDoorway.to`, and `VaultLayout.edges` to use room IDs while `VaultRoom.kind` remains the gameplay role.

- [ ] **Step 1: Write failing constrained-selection tests**

```js
// src/systems/world/resonantVaultRooms.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { getVaultCandidateForCell } from './resonantVaults.ts';
import { getMeaningfulVaultRoomCount, selectVaultModules, placeVaultRooms } from './resonantVaultRooms.ts';

const combatKinds = new Set(['guard_hall', 'resonance_foundry']);
const puzzleKinds = new Set(['memory_choir', 'counterweight_gallery', 'acoustic_relay', 'broken_crossing']);

test('every seed selects six constrained majors and two or three annexes deterministically', () => {
  for (let index = 0; index < 256; index += 1) {
    const candidate = { ...getVaultCandidateForCell(index - 128, 17 - index, 91357), active: true };
    const first = selectVaultModules(candidate);
    const second = selectVaultModules(candidate);
    assert.deepEqual(first, second);
    assert.equal(first.majors.length, 6);
    assert.ok(first.annexes.length === 2 || first.annexes.length === 3);
    assert.equal(combatKinds.has(first.majors[0].kind), true);
    assert.equal(combatKinds.has(first.majors[1].kind), true);
    assert.ok(first.majors.filter(({ kind }) => puzzleKinds.has(kind)).length >= 2);
    assert.equal(new Set(first.majors.map(({ kind }) => kind)).size, first.majors.length);
    assert.equal(first.annexes.filter(({ kind }) => kind === 'bell_crypt').length, 1);
  }
});

test('room placement creates fixed spine, two outer loops, deep chain, annexes, boss, and distinct exits', () => {
  const candidate = { ...getVaultCandidateForCell(5, -7, 91357), active: true, orientation: 2 };
  const placed = placeVaultRooms(candidate, 104, (x) => x < candidate.centerX ? 88 : 116);
  const ids = new Set(placed.rooms.map(({ id }) => id));
  for (const id of ['spire','entrance','processional','tuning','hub','major_0','major_1','major_2','major_3','major_4','major_5','inner_works','antechamber','arena','core','grand_ascent','fracture_stair','outlet_grand','outlet_fracture']) {
    assert.equal(ids.has(id), true, `missing ${id}`);
  }
  assert.ok(ids.has('annex_0') && ids.has('annex_1'));
  assert.notDeepEqual(placed.surfaceOutlets.grand, placed.surfaceOutlets.fracture);
  assert.ok(placed.rooms.length >= 21 && placed.rooms.length <= 22);
  assert.ok(getMeaningfulVaultRoomCount(placed.rooms) >= 12 && getMeaningfulVaultRoomCount(placed.rooms) <= 16);
});
```

- [ ] **Step 2: Run the test and observe the missing room module**

Run: `node --test src/systems/world/resonantVaultRooms.test.mjs`

Expected: FAIL with module-not-found for `resonantVaultRooms.ts`.

- [ ] **Step 3: Define definitive room kinds and module selection**

```ts
// src/systems/world/resonantVaultRooms.ts
import { rotateVaultOffset, vaultHash, type VaultCandidate, type VaultRoom } from './resonantVaults';

export type VaultMajorKind =
    | 'guard_hall' | 'resonance_foundry'
    | 'memory_choir' | 'counterweight_gallery' | 'acoustic_relay' | 'broken_crossing';
export type VaultAnnexKind = 'bell_crypt' | 'fractured_archive';

export interface VaultModuleSelection {
    majors: Array<{ id: `major_${number}`; kind: VaultMajorKind; variant: number }>;
    annexes: Array<{ id: `annex_${number}`; kind: VaultAnnexKind; variant: number }>;
}

const PUZZLES: VaultMajorKind[] = ['memory_choir', 'counterweight_gallery', 'acoustic_relay', 'broken_crossing'];

export function selectVaultModules(candidate: VaultCandidate): VaultModuleSelection {
    const offset = vaultHash(candidate.seed, candidate.gridX, candidate.gridZ, 701) % PUZZLES.length;
    const ordered = PUZZLES.map((_, index) => PUZZLES[(index + offset) % PUZZLES.length]);
    const majors: VaultModuleSelection['majors'] = [
        { id: 'major_0', kind: 'guard_hall', variant: vaultHash(candidate.seed, candidate.gridX, candidate.gridZ, 711) % 4 },
        { id: 'major_1', kind: 'resonance_foundry', variant: vaultHash(candidate.seed, candidate.gridX, candidate.gridZ, 713) % 4 },
        ...ordered.map((kind, index) => ({ id: `major_${index + 2}` as const, kind, variant: vaultHash(candidate.seed, candidate.gridX, candidate.gridZ, 719 + index) % 4 })),
    ];
    const annexCount = 2 + (vaultHash(candidate.seed, candidate.gridX, candidate.gridZ, 733) & 1);
    const combatAnnexIndex = vaultHash(candidate.seed, candidate.gridX, candidate.gridZ, 737) % annexCount;
    const annexes = Array.from({ length: annexCount }, (_, index) => ({
        id: `annex_${index}` as const,
        kind: index === combatAnnexIndex ? 'bell_crypt' as const : 'fractured_archive' as const,
        variant: vaultHash(candidate.seed, candidate.gridX, candidate.gridZ, 739 + index) % 4,
    }));
    return { majors, annexes };
}
```

- [ ] **Step 4: Place fixed slots, selected modules, and graph edges**

Use maximum-reservation slot centers before orientation:

```ts
const SLOT_CENTERS = {
    entrance: [0, 112], processional: [0, 88], tuning: [0, 64], hub: [0, 36],
    major_0: [-54, 34], major_1: [-54, -8], major_2: [54, 34], major_3: [54, -8],
    major_4: [0, -22], major_5: [0, -64], inner_works: [0, -104],
    antechamber: [0, -136], arena: [0, -176], core: [0, -218],
    grand_ascent: [-72, -218], fracture_stair: [72, -218],
    outlet_grand: [-178, -226], outlet_fracture: [178, -226],
} as const;

const FIXED_EDGES: Array<[string, string]> = [
    ['entrance', 'processional'], ['processional', 'tuning'], ['tuning', 'hub'],
    ['hub', 'major_0'], ['major_0', 'major_1'], ['major_1', 'hub'],
    ['hub', 'major_2'], ['major_2', 'major_3'], ['major_3', 'hub'],
    ['hub', 'major_4'], ['major_4', 'major_5'], ['major_5', 'inner_works'],
    ['inner_works', 'antechamber'], ['antechamber', 'arena'], ['arena', 'core'],
    ['core', 'grand_ascent'], ['core', 'fracture_stair'],
    ['grand_ascent', 'outlet_grand'], ['fracture_stair', 'outlet_fracture'],
];
```

Attach `annex_0`, `annex_1`, and optional `annex_2` to `major_1`, `major_3`, and `major_5` respectively. Increase `RESONANT_VAULT_HALF_EXTENT` to `256` and `RESONANT_VAULT_VERTICAL_EXTENT` to `128`; the 1536-block grid continues to leave more than 1000 blocks between reservations.

- [ ] **Step 5: Adapt the public layout types and doorway lookup to room IDs**

```ts
// src/systems/world/resonantVaults.ts
export type VaultRoomId = string;

export interface VaultRoom {
    id: VaultRoomId;
    kind: VaultRoomKind;
    x: number; y: number; z: number;
    width: number; height: number; depth: number;
    variant: number;
}

export interface VaultDoorway {
    from: VaultRoomId;
    to: VaultRoomId;
    roomOverlap: VaultRoutePoint[];
    opening: VaultRoutePoint[];
    corridorOverlap: VaultRoutePoint[];
    gate?: 'inner_seal' | 'grand_ascent' | 'fracture_stair';
}
```

Replace `Map(room.kind)` lookups with `Map(room.id)`. Gate `hub -> major_4` as `inner_seal`, `core -> grand_ascent` as `grand_ascent`, and `core -> fracture_stair` as `fracture_stair`.

- [ ] **Step 6: Run layout tests**

Run: `node --test src/systems/world/resonantVaultRooms.test.mjs src/systems/world/resonantVaults.test.mjs`

Expected: PASS for 256 constrained selections, all four orientations, deterministic layout, distinct outlets, and exact gate ownership.

- [ ] **Step 7: Commit**

```powershell
git add src/systems/world/resonantVaultRooms.ts src/systems/world/resonantVaultRooms.test.mjs src/systems/world/resonantVaults.ts src/systems/world/resonantVaults.test.mjs
git commit -m "feat: expand vaults into seeded expeditions"
```

### Task 3: Validate real voxel connectivity and protect the complete footprint

**Files:**
- Create: `src/systems/world/resonantVaultConnectivity.ts`
- Create: `src/systems/world/resonantVaultConnectivity.test.mjs`
- Create: `src/systems/world/resonantVaultGeometry.testSupport.mjs`
- Modify: `src/systems/world/resonantVaultGeneration.ts`
- Modify: `src/systems/world/resonantVaultGeometry.test.mjs`
- Modify: `src/systems/world/chunkGeneration.ts`
- Modify: `src/systems/world/workers/world.worker.ts`
- Modify: `src/systems/world/WorldStorage.ts`
- Modify: `src/systems/world/storage/StorageBackend.ts`
- Modify: `src/systems/world/storage/IndexedDbBackend.ts`
- Modify: `src/systems/world/storage/RegionBackendBase.ts`
- Modify: `src/systems/world/storage/types.ts`
- Modify: `src/systems/WorldManager.ts`

**Interfaces:**
- Consumes: room IDs, edges, doorways, and slots from Task 2.
- Produces: `validateVaultLayout(layout): VaultLayoutValidation` for room overlap and graph rules.
- Produces: `validatePaintedVault(layout, reader): VaultVoxelValidation` for actual player-sized reachability.
- Produces: `getVaultReservedBoxes(layout): VaultReservedBox[]` for terrain/cave/ore/feature suppression.
- Produces: atomic `preflightVaultCandidate(worldId, candidate): Promise<VaultCandidateDecision>` before any footprint chunk generates.
- Changes: world metadata gains optional additive accepted-vault signatures; old metadata is not rewritten on read.

- [ ] **Step 1: Write failing overlap, doorway, and flood-fill tests**

```js
// src/systems/world/resonantVaultConnectivity.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { getVaultCandidateForCell, getVaultLayout } from './resonantVaults.ts';
import { validateVaultLayout, validatePaintedVault } from './resonantVaultConnectivity.ts';
import { makeSparseVaultFixture } from './resonantVaultGeometry.testSupport.mjs';

test('hundreds of definitive layouts have no room overlap and every graph endpoint exists', () => {
  for (let seedIndex = 0; seedIndex < 256; seedIndex += 1) {
    for (let orientation = 0; orientation < 4; orientation += 1) {
      const candidate = { ...getVaultCandidateForCell(seedIndex - 128, 31 - seedIndex, 60013 + seedIndex), active: true, orientation };
      const layout = getVaultLayout(candidate, 98, (x, z) => 82 + (Math.abs(x * 3 + z * 5) % 37));
      assert.deepEqual(validateVaultLayout(layout), { valid: true, errors: [] });
    }
  }
});

test('painted voxels connect entrance, mandatory rooms, boss, both exits, and surface thresholds', async () => {
  const fixture = await makeSparseVaultFixture({ seed: 77123, orientation: 3, centerSurfaceY: 104, grandSurfaceY: 87, fractureSurfaceY: 119 });
  const result = validatePaintedVault(fixture.layout, fixture.reader);
  assert.equal(result.valid, true, result.errors.join('\n'));
  assert.equal(result.reachedRoomIds.has('arena'), true);
  assert.equal(result.reachedRoomIds.has('outlet_grand'), true);
  assert.equal(result.reachedRoomIds.has('outlet_fracture'), true);
});

test('a candidate is rejected when any unowned persisted chunk intersects its complete footprint', async () => {
  const fixture = await makeSparseVaultFixture({ seed: 1123, orientation: 0, persistedChunks: ['-2,4'] });
  const decision = await fixture.preflight();
  assert.deepEqual(decision, { accepted: false, reason: 'persisted-footprint-conflict' });
  assert.equal(fixture.generatedChunkCount, 0);
});
```

Extract the reusable sparse writer and esbuild loader currently embedded in `resonantVaultGeometry.test.mjs` into `resonantVaultGeometry.testSupport.mjs` as part of this test change.

- [ ] **Step 2: Run and observe missing connectivity module**

Run: `node --test src/systems/world/resonantVaultConnectivity.test.mjs`

Expected: FAIL because `validateVaultLayout` and `validatePaintedVault` do not exist.

- [ ] **Step 3: Implement graph and reservation validation**

```ts
// src/systems/world/resonantVaultConnectivity.ts
import { getVaultRoomBounds, type VaultLayout, type VaultRoomBounds } from './resonantVaults';

export interface VaultLayoutValidation { valid: boolean; errors: string[]; }
export interface VaultVoxelReader { get(x: number, y: number, z: number): number; }
export interface VaultVoxelValidation extends VaultLayoutValidation { reachedRoomIds: Set<string>; }
export interface VaultReservedBox extends VaultRoomBounds { owner: string; }

function overlaps(a: VaultRoomBounds, b: VaultRoomBounds, clearance = 4): boolean {
    return a.minX - clearance <= b.maxX && a.maxX + clearance >= b.minX
        && a.minY - clearance <= b.maxY && a.maxY + clearance >= b.minY
        && a.minZ - clearance <= b.maxZ && a.maxZ + clearance >= b.minZ;
}

export function validateVaultLayout(layout: VaultLayout): VaultLayoutValidation {
    const errors: string[] = [];
    const ids = new Set(layout.rooms.map(({ id }) => id));
    for (const [from, to] of layout.edges) {
        if (!ids.has(from)) errors.push(`edge ${from}>${to} missing ${from}`);
        if (!ids.has(to)) errors.push(`edge ${from}>${to} missing ${to}`);
    }
    const underground = layout.rooms.filter(({ kind }) => !['spire', 'outlet_grand', 'outlet_fracture'].includes(kind));
    for (let left = 0; left < underground.length; left += 1) {
        for (let right = left + 1; right < underground.length; right += 1) {
            const a = underground[left];
            const b = underground[right];
            if (overlaps(getVaultRoomBounds(a), getVaultRoomBounds(b), 2)) errors.push(`room overlap ${a.id}/${b.id}`);
        }
    }
    return { valid: errors.length === 0, errors };
}

export function getVaultReservedBoxes(layout: VaultLayout): VaultReservedBox[] {
    return layout.rooms.map((room) => ({ ...getVaultRoomBounds(room), owner: room.id }));
}
```

Implement `validatePaintedVault` using the existing three-block-high, side-clear standability rule and a bounded breadth-first search from the entrance anchor. Treat only owned gate planes as passable for the full-completion validation.

- [ ] **Step 4: Reassert openings after every architecture and furnishing pass**

```ts
// at the end of paintResonantVaultStructure in resonantVaultGeneration.ts
for (const doorway of layout.doorways) {
    paintDoorwayOpening(writer, doorway, doorway.gate ? 'closed' : 'open');
}
```

Ensure `paintDoorwayOpening` clears the two 5-by-5 planes and room/corridor overlap cells, then restores only the owned 5-by-5 gate plane. No decoration pass runs afterward.

- [ ] **Step 5: Apply reservations before destructive terrain features**

In `chunkGeneration.ts` and the worker payload path, query the active vault layouts touching the chunk and skip cave, fluid, ore, and unrelated feature writes when a candidate cell lies inside a `VaultReservedBox`. Use the same deterministic candidate resolution already used by `paintResonantVaultStructure`; do not copy vault layout formulas into the worker.

```ts
const isProtectedVaultCell = (x: number, y: number, z: number): boolean =>
    vaultReservations.some((box) => x >= box.minX && x <= box.maxX
        && y >= box.minY && y <= box.maxY
        && z >= box.minZ && z <= box.maxZ);
```

- [ ] **Step 6: Preflight the complete footprint before generating any part of a vault**

Add a batch `hasAnyChunk(worldId, coordinates)` query to the stable `WorldStorage` facade and every backend. Before `WorldManager` queues generation for a chunk intersecting an unreviewed vault candidate, gather every chunk coordinate touched by its spire, entrance, underground rooms/corridors, both escape routes, and both outlets. Wait for one candidate-scoped preflight promise:

```ts
// additive field in storage/types.ts
resonantVaultReservations?: Record<string, {
    layoutSignature: string;
    acceptedAtVersion: 1;
}>;
```

1. If world metadata contains the same accepted vault ID and layout signature, allow generation.
2. Otherwise, reject if any touched chunk already exists in memory or storage.
3. If no touched chunk exists, write the optional accepted ID/signature to world metadata, then allow generation.
4. Cache rejected candidates for the world session and pass that rejection set to `/locate vault` so it advances deterministically.

Do not mark a candidate accepted after even one footprint chunk has begun generating. The optional metadata registry is written only at acceptance, never during read normalization, and old worlds need no schema rewrite.

- [ ] **Step 7: Run connectivity, storage-backend, and worker tests**

Run: `node --test src/systems/world/resonantVaultConnectivity.test.mjs src/systems/world/resonantVaultGeometry.test.mjs src/systems/world/resonantVaults.test.mjs src/systems/world/storage/desktopFsBackend.test.mjs src/systems/world/storage/opfs/opfsSavesCore.test.mjs src/systems/world/storage/storageWiring.test.mjs`

Expected: PASS for 1024 layout samples, representative painted-voxel profiles, atomic new-candidate acceptance, persisted-footprint rejection, backend parity, and deterministic locator skip.

- [ ] **Step 8: Run typecheck**

Run: `npm run typecheck`

Expected: exit code 0.

- [ ] **Step 9: Commit**

```powershell
git add src/systems/world/resonantVaultConnectivity.ts src/systems/world/resonantVaultConnectivity.test.mjs src/systems/world/resonantVaultGeometry.testSupport.mjs src/systems/world/resonantVaultGeneration.ts src/systems/world/resonantVaultGeometry.test.mjs src/systems/world/chunkGeneration.ts src/systems/world/workers/world.worker.ts src/systems/world/WorldStorage.ts src/systems/world/storage/StorageBackend.ts src/systems/world/storage/IndexedDbBackend.ts src/systems/world/storage/RegionBackendBase.ts src/systems/world/storage/types.ts src/systems/WorldManager.ts
git commit -m "fix: guarantee complete vault connectivity"
```

### Task 4: Rebuild the architecture, lighting, and entrance staircase

**Files:**
- Create: `src/systems/world/resonantVaultArchitecture.ts`
- Create: `src/systems/world/resonantVaultArchitecture.test.mjs`
- Modify: `src/systems/world/resonantVaultGeneration.ts`
- Modify: `src/systems/world/resonantVaultGeometry.test.mjs`
- Modify: `src/systems/world/resonantVaultEditRules.ts`
- Modify: `src/systems/world/resonantInteraction.test.mjs`
- Modify: `src/systems/world/ResonantVaultRuntime.ts`
- Modify: `src/systems/textures/resonantTexturePixels.ts`

**Interfaces:**
- Consumes: `VaultRoom`, definitive kinds, and `ResonantStructureWriter`.
- Produces: `paintVaultRoomArchitecture(writer, room, layout): void`.
- Produces: `paintVaultEntrance(writer, layout): VaultRoutePoint[]`.
- Produces: architecture feature descriptors for deterministic tests without coupling tests to screenshots.
- Changes: sealed-vault torch placement distinguishes valid empty cells from gate/mechanism/hazard reservation cells.

- [ ] **Step 1: Write failing architecture-quality tests**

```js
// src/systems/world/resonantVaultArchitecture.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { getVaultCandidateForCell, getVaultLayout } from './resonantVaults.ts';
import { getArchitectureFeatures } from './resonantVaultArchitecture.ts';

test('every major room has a unique non-box architectural feature set', () => {
  const candidate = { ...getVaultCandidateForCell(8, -3, 44119), active: true };
  const layout = getVaultLayout(candidate, 101);
  const gameplayRooms = layout.rooms.filter(({ kind }) => !['spire','outlet_grand','outlet_fracture'].includes(kind));
  for (const room of gameplayRooms) {
    const features = getArchitectureFeatures(room);
    assert.ok(features.ceilingProfile !== 'flat' || features.floorLevels >= 2, `${room.id} still reads as a flat box`);
    assert.ok(features.landmarks.length >= 1, `${room.id} lacks a landmark`);
    assert.ok(features.lampOffsets.length >= 2, `${room.id} lacks authored light`);
  }
  const signatures = gameplayRooms.map((room) => JSON.stringify(getArchitectureFeatures(room)));
  assert.equal(new Set(signatures).size, gameplayRooms.length, 'each room instance needs a distinct spatial signature');
});

test('entrance route is three blocks wide, one-step traversable, guarded, and lit at every landing', () => {
  const candidate = { ...getVaultCandidateForCell(8, -3, 44119), active: true };
  const layout = getVaultLayout(candidate, 112);
  const features = getArchitectureFeatures(layout.rooms.find(({ id }) => id === 'entrance'));
  assert.equal(features.walkWidth, 3);
  assert.equal(features.maximumRise, 1);
  assert.ok(features.landings >= 6);
  assert.equal(features.landingLampInterval, 1);
  assert.equal(features.guardedEdges, true);
});
```

- [ ] **Step 2: Run and observe missing architecture descriptors**

Run: `node --test src/systems/world/resonantVaultArchitecture.test.mjs`

Expected: FAIL because `resonantVaultArchitecture.ts` does not exist.

- [ ] **Step 3: Define deterministic architecture features and reusable painters**

```ts
// src/systems/world/resonantVaultArchitecture.ts
export interface VaultArchitectureFeatures {
    ceilingProfile: 'ribbed' | 'vaulted' | 'stepped' | 'broken';
    floorLevels: number;
    landmarks: string[];
    lampOffsets: Array<readonly [number, number, number]>;
    walkWidth: number;
    maximumRise: number;
    landings: number;
    landingLampInterval: number;
    guardedEdges: boolean;
}

export function getArchitectureFeatures(room: VaultRoom): VaultArchitectureFeatures {
    const base = { walkWidth: 3, maximumRise: 1, landings: 0, landingLampInterval: 1, guardedEdges: true };
    switch (room.kind) {
        case 'hub': return { ...base, ceilingProfile: 'vaulted', floorLevels: 3, landmarks: ['central_bell_dais','four_arch_gallery'], lampOffsets: [[-8,3,-8],[8,3,-8],[-8,3,8],[8,3,8]] };
        case 'memory_choir': return { ...base, ceilingProfile: 'ribbed', floorLevels: 2, landmarks: ['choir_apse','four_pylon_daises'], lampOffsets: [[-9,3,0],[9,3,0],[0,3,-9],[0,3,9]] };
        case 'broken_crossing': return { ...base, ceilingProfile: 'broken', floorLevels: 4, landmarks: ['collapsed_chasm','checkpoint_islands'], lampOffsets: [[-12,4,-5],[0,5,5],[12,4,-5]] };
        case 'entrance': return { ...base, ceilingProfile: 'stepped', floorLevels: 8, landmarks: ['processional_switchback'], lampOffsets: [[-2,3,0],[2,3,0]], landings: 8 };
        default: return { ...base, ceilingProfile: 'ribbed', floorLevels: 2, landmarks: [`${room.kind}_primary`], lampOffsets: [[-6,3,-6],[6,3,6]] };
    }
}
```

Add reusable `paintArch`, `paintButtressBay`, `paintCeilingRib`, `paintBalcony`, `paintParapet`, `paintStairRun`, `paintLandingLamp`, and `paintRubbleOutsideEnvelope` helpers. All helpers accept explicit bounds and never infer room connections.

- [ ] **Step 4: Replace the generic room shell with room-specific architecture**

Route each definitive room kind through `paintVaultRoomArchitecture`. Use Echo Stone/Brick slabs and stairs for all walking stairs and architectural trim. Give the spire, entrance, Processional Gallery, Tuning Hall, hub, all six major chamber kinds, both annex kinds, Inner Works, antechamber, arena, core, both escape staging rooms, and both surface outlets explicit painters. Each room's `variant` changes at least two substantial spatial features such as gallery side, floor elevation, landmark placement, stair run, alcove layout, or ceiling profile. Do not preserve the current box shells and do not use a palette switch or generic fallback as the final painter for any player-accessible room.

```ts
export function paintVaultRoomArchitecture(writer: ResonantStructureWriter, room: VaultRoom, layout: VaultLayout): void {
    paintStructuralEnvelope(writer, room, getArchitectureFeatures(room));
    switch (room.kind) {
        case 'spire': paintListeningSpire(writer, room); break;
        case 'entrance': paintEntranceArchitecture(writer, room); break;
        case 'processional': paintProcessionalGallery(writer, room); break;
        case 'tuning_hall': paintTuningHallArchitecture(writer, room); break;
        case 'hub': paintHubLandmark(writer, room, layout); break;
        case 'memory_choir': paintMemoryChoirArchitecture(writer, room); break;
        case 'counterweight_gallery': paintCounterweightArchitecture(writer, room); break;
        case 'acoustic_relay': paintAcousticRelayArchitecture(writer, room); break;
        case 'guard_hall': paintGuardHallArchitecture(writer, room); break;
        case 'resonance_foundry': paintFoundryArchitecture(writer, room); break;
        case 'broken_crossing': paintBrokenCrossingArchitecture(writer, room); break;
        case 'bell_crypt': paintBellCryptArchitecture(writer, room); break;
        case 'fractured_archive': paintFracturedArchiveArchitecture(writer, room); break;
        case 'inner_works': paintInnerWorksArchitecture(writer, room); break;
        case 'antechamber': paintTitanAntechamberArchitecture(writer, room); break;
        case 'arena': paintBellTitanArenaArchitecture(writer, room); break;
        case 'core': paintCoreArchitecture(writer, room); break;
        case 'grand_ascent': paintGrandAscentStaging(writer, room); break;
        case 'fracture_stair': paintFractureStairStaging(writer, room); break;
        case 'outlet_grand': paintGrandSurfaceRuin(writer, room); break;
        case 'outlet_fracture': paintFractureSurfaceRuin(writer, room); break;
        default: assertNeverVaultRoomKind(room.kind);
    }
}
```

- [ ] **Step 5: Replace the narrow helix with a finished three-wide entrance stair**

Generate switchback runs with one-block rises, five-block headroom, a landing every eight rises, slab/stair walking surfaces, parapets on exposed edges, and one lamp pair per landing. `paintVaultEntrance` returns every centerline point so the connectivity test can prove two-way traversal from the surface threshold to the Processional Gallery.

- [ ] **Step 6: Raise ambient readability without neon**

Increase the base-value pixels of Echo Stone and Echo Bricks, keep emissive pixels below 15 percent of each functional tile, and place authored lamps so no main-route anchor exceeds the eight-block horizontal spacing requirement. Do not raise enemy emissive materials or add UI glow.

- [ ] **Step 7: Allow normal torch placement while the vault is sealed**

Change the edit-rule input from the ambiguous `protectedCell` boolean to `torchDeniedCell`. A torch may be placed in any valid empty cell, including ordinary protected architecture space, when it has normal support. Deny cells occupied or reserved by a gate plane, receptive mechanism, moving platform, spike/crusher swept volume, chest, or progression trigger. Keep breaking and all other block placement denied until escape completion.

Extend `resonantInteraction.test.mjs` with:

```js
assert.equal(canEditSealedVaultCell({ kind: 'place', currentBlock: EditBlock.AIR, placedBlock: EditBlock.TORCH }, false), true);
assert.equal(canEditSealedVaultCell({ kind: 'place', currentBlock: EditBlock.AIR, placedBlock: EditBlock.TORCH }, true), false);
assert.equal(canEditSealedVaultCell({ kind: 'place', currentBlock: EditBlock.VAULT_SEAL, placedBlock: EditBlock.TORCH }, false), false);
```

Verify the existing placement path still consumes inventory, updates block and sunlight, remeshes the owning and bordering chunks when needed, marks persistence dirty, and restores the torch after save/reload.

- [ ] **Step 8: Run architecture, geometry, edit, and texture tests**

Run: `node --test src/systems/world/resonantVaultArchitecture.test.mjs src/systems/world/resonantVaultGeometry.test.mjs src/systems/world/resonantInteraction.test.mjs src/systems/textures/textureAssets.test.mjs src/data/resonantContent.test.mjs`

Expected: PASS for architecture features, stair traversal, doorway clearances, lighting spacing, texture uniqueness, valid sealed-vault torch placement, protected hazard cells, and generated-voxel connectivity.

- [ ] **Step 9: Commit**

```powershell
git add src/systems/world/resonantVaultArchitecture.ts src/systems/world/resonantVaultArchitecture.test.mjs src/systems/world/resonantVaultGeneration.ts src/systems/world/resonantVaultGeometry.test.mjs src/systems/world/resonantVaultEditRules.ts src/systems/world/resonantInteraction.test.mjs src/systems/world/ResonantVaultRuntime.ts src/systems/textures/resonantTexturePixels.ts
git commit -m "art: rebuild the Resonant Vault architecture"
```

### Task 5: Make the echo demonstration visible, audible, replayable, and compactly guided

**Files:**
- Create: `src/systems/world/resonantEchoSequence.ts`
- Create: `src/systems/world/resonantEchoSequence.test.mjs`
- Modify: `src/systems/world/resonantEchoTiming.ts`
- Modify: `src/systems/world/resonantEchoTiming.test.mjs`
- Modify: `src/systems/world/ResonantVaultRuntime.ts`
- Modify: `src/systems/events/GameEvents.ts`
- Modify: `src/components/ResonantEffectsRenderer.tsx`
- Modify: `src/components/ui/ResonantObjectiveHUD.tsx`
- Modify: `src/systems/sound/ResonantVaultAudio.ts`
- Modify: `src/systems/sound/resonantVaultAudio.test.mjs`

**Interfaces:**
- Produces: `buildMemoryDemonstration(sequence, markerCells, firstActivation): VaultEchoStep[]`.
- Produces: snapshot fields `echoMode: 'idle' | 'listen' | 'repeat'`, `echoProgress`, and `echoLength`.
- Produces: typed per-step event `vault:echo-step` with visible marker position and symbol.
- Changes: `vault:echo-preview` to carry `stepDurationMs`, `pass`, and world-surface marker cells.

- [ ] **Step 1: Write failing echo sequencing tests**

```js
// src/systems/world/resonantEchoSequence.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMemoryDemonstration } from './resonantEchoSequence.ts';

const sequence = [2, 0, 3, 1];
const markers = [
  { x: 10, y: 25, z: 0 }, { x: 0, y: 25, z: -10 },
  { x: -10, y: 25, z: 0 }, { x: 0, y: 25, z: 10 },
];

test('first memory activation plays two complete visible passes at a readable cadence', () => {
  const steps = buildMemoryDemonstration(sequence, markers, true);
  assert.equal(steps.length, 8);
  assert.deepEqual(steps.map(({ symbol }) => symbol), [...sequence, ...sequence]);
  assert.deepEqual(steps.slice(0, 4).map(({ pass }) => pass), [1, 1, 1, 1]);
  assert.deepEqual(steps.slice(4).map(({ pass }) => pass), [2, 2, 2, 2]);
  assert.ok(steps.every(({ durationMs }) => durationMs >= 550 && durationMs <= 750));
  assert.ok(steps.every(({ marker }) => marker.y === 25));
});

test('manual replay plays one pass and preserves exact symbol positions', () => {
  const steps = buildMemoryDemonstration(sequence, markers, false);
  assert.equal(steps.length, 4);
  assert.deepEqual(steps.map(({ marker }) => marker), sequence.map((symbol) => markers[symbol]));
});
```

- [ ] **Step 2: Run and observe the missing scheduler**

Run: `node --test src/systems/world/resonantEchoSequence.test.mjs`

Expected: FAIL because `buildMemoryDemonstration` is undefined.

- [ ] **Step 3: Implement one-source cadence and marker scheduling**

```ts
// src/systems/world/resonantEchoSequence.ts
export const MEMORY_ECHO_STEP_MS = 650;
export const MEMORY_ECHO_PASS_PAUSE_MS = 850;

export interface VaultEchoStep {
    symbol: number;
    marker: { x: number; y: number; z: number };
    pass: 1 | 2;
    startsAtMs: number;
    durationMs: number;
}

export function buildMemoryDemonstration(
    sequence: readonly number[],
    markers: readonly { x: number; y: number; z: number }[],
    firstActivation: boolean,
): VaultEchoStep[] {
    const passes = firstActivation ? 2 : 1;
    const steps: VaultEchoStep[] = [];
    for (let pass = 0; pass < passes; pass += 1) {
        const passOffset = pass * (sequence.length * MEMORY_ECHO_STEP_MS + MEMORY_ECHO_PASS_PAUSE_MS);
        sequence.forEach((symbol, index) => steps.push({
            symbol,
            marker: markers[symbol],
            pass: (pass + 1) as 1 | 2,
            startsAtMs: passOffset + index * MEMORY_ECHO_STEP_MS,
            durationMs: MEMORY_ECHO_STEP_MS,
        }));
    }
    return steps;
}
```

- [ ] **Step 4: Move marker cells onto visible pylon caps and floor glyph faces**

In `ResonantVaultRuntime.startMemoryDemo`, resolve marker positions from the room's generated puzzle descriptor rather than the pylon base block. Pylon markers use `room.y + 7`; floor glyph markers use `room.y + 1`. Emit one `vault:echo-step` at the exact scheduled time and one combined preview event for renderer lifetime management.

```ts
'vault:echo-step': { vaultId: string; symbol: number; index: number; pass: 1 | 2; x: number; y: number; z: number; durationMs: number };
```

- [ ] **Step 5: Replace buried chips with sustained world-lit markers and particles**

In `ResonantEffectsRenderer`, render a low-profile cap halo at the provided world position, a matching floor-glyph inset, and a dust stream toward the next sequence marker. Keep each marker visible for its complete `durationMs`, leave low-intensity indices visible during `repeat`, and remove the old `cell.y + 1.015` inference and 1100 ms whole-sequence expiry.

- [ ] **Step 6: Drive concise HUD and positional audio from typed events**

```ts
// snapshot and objective shape
echoMode: 'idle' | 'listen' | 'repeat';
echoProgress: number;
echoLength: number;

// objective selection
if (context.echoMode === 'listen') return { label: 'LISTEN', text: 'Watch the echo', progress: `${context.echoProgress}/${context.echoLength}` };
if (context.echoMode === 'repeat') return { label: 'REPEAT', text: 'Strike the matching bells', progress: `${context.echoProgress}/${context.echoLength}` };
```

Map `vault:echo-step` to `sound.playAt('vault.echo_step', { x, y, z }, { pitch: [0.92, 1, 1.08, 1.19][symbol] })`. Set the event manifest's `fallback: false`; the event may remain silent until the held audio-production phase supplies an authored file.

- [ ] **Step 7: Run echo, audio-director, HUD, and guidance tests**

Run: `node --test src/systems/world/resonantEchoSequence.test.mjs src/systems/world/resonantEchoTiming.test.mjs src/systems/sound/resonantVaultAudio.test.mjs src/systems/world/resonantVaultObjectives.test.mjs src/systems/world/resonantVaultGuidance.test.mjs`

Expected: PASS with two first-use passes, one replay pass, visible marker coordinates, contextual HUD states, and a positional typed sound event.

- [ ] **Step 8: Commit**

```powershell
git add src/systems/world/resonantEchoSequence.ts src/systems/world/resonantEchoSequence.test.mjs src/systems/world/resonantEchoTiming.ts src/systems/world/resonantEchoTiming.test.mjs src/systems/world/ResonantVaultRuntime.ts src/systems/events/GameEvents.ts src/components/ResonantEffectsRenderer.tsx src/components/ui/ResonantObjectiveHUD.tsx src/systems/sound/ResonantVaultAudio.ts src/systems/sound/resonantVaultAudio.test.mjs
git commit -m "fix: make vault echoes readable"
```

### Task 6: Implement the definitive puzzles and remove traversal bypasses

**Files:**
- Create: `src/systems/world/resonantVaultPuzzles.ts`
- Create: `src/systems/world/resonantVaultPuzzles.test.mjs`
- Modify: `src/systems/world/resonantVaultGeneration.ts`
- Modify: `src/systems/world/resonantMachineryRules.ts`
- Modify: `src/systems/world/resonantMachineryRules.test.mjs`
- Modify: `src/systems/world/ResonantVaultRuntime.ts`
- Modify: `src/systems/progression/ProgressionStore.ts`
- Modify: `src/systems/progression/resonantVaultProgress.test.mjs`

**Interfaces:**
- Consumes: definitive room kinds and Echo Tuning Fork pulses.
- Produces: `VaultPuzzleDescriptor` for memory, counterweight, relay, and crossing rooms.
- Produces: `advanceTraversalCheckpoint(state, checkpointId): TraversalCheckpointState`.
- Produces: required current `rooms: Record<string, boolean>` progression with no wing adapter.

- [ ] **Step 1: Write failing puzzle-descriptor and checkpoint tests**

```js
// src/systems/world/resonantVaultPuzzles.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { advanceTraversalCheckpoint, buildVaultPuzzleDescriptor } from './resonantVaultPuzzles.ts';

test('broken crossing requires four checkpoints in order', () => {
  let state = { nextIndex: 0, completed: false, lastSafeCheckpoint: 'start' };
  state = advanceTraversalCheckpoint(state, 'crossing_0');
  assert.equal(state.nextIndex, 1);
  state = advanceTraversalCheckpoint(state, 'crossing_3');
  assert.equal(state.nextIndex, 1, 'skipping ahead must not complete the room');
  for (const id of ['crossing_1', 'crossing_2', 'crossing_3']) state = advanceTraversalCheckpoint(state, id);
  assert.equal(state.completed, true);
  assert.equal(state.lastSafeCheckpoint, 'crossing_3');
});

test('every selected puzzle has visible cause, response, fallback, and recovery anchors', () => {
  for (const kind of ['memory_choir','counterweight_gallery','acoustic_relay','broken_crossing']) {
    const descriptor = buildVaultPuzzleDescriptor({ id: 'test', kind, x: 0, y: 20, z: 0, width: 37, height: 17, depth: 31, variant: 2 });
    assert.ok(descriptor.activation);
    assert.ok(descriptor.responseCells.length > 0);
    assert.ok(descriptor.fallbackControl);
    assert.ok(descriptor.recoveryAnchors.length > 0);
  }
});
```

- [ ] **Step 2: Run and observe missing puzzle module**

Run: `node --test src/systems/world/resonantVaultPuzzles.test.mjs`

Expected: FAIL because the definitive descriptor and checkpoint functions do not exist.

- [ ] **Step 3: Implement pure puzzle descriptors and ordered crossing state**

```ts
export interface TraversalCheckpointState {
    nextIndex: number;
    completed: boolean;
    lastSafeCheckpoint: string;
}

const CROSSING_IDS = ['crossing_0', 'crossing_1', 'crossing_2', 'crossing_3'] as const;

export function advanceTraversalCheckpoint(state: TraversalCheckpointState, checkpointId: string): TraversalCheckpointState {
    if (state.completed || CROSSING_IDS[state.nextIndex] !== checkpointId) return state;
    const nextIndex = state.nextIndex + 1;
    return { nextIndex, completed: nextIndex === CROSSING_IDS.length, lastSafeCheckpoint: checkpointId };
}

export interface VaultPuzzleDescriptor {
    activation: VaultRoutePoint;
    responseCells: VaultRoutePoint[];
    fallbackControl: VaultRoutePoint;
    recoveryAnchors: Array<VaultRoutePoint & { id: string }>;
}
```

Build all positions from room bounds and orientation. Do not store absolute puzzle coordinates in progression.

- [ ] **Step 4: Paint the puzzle architecture and enforce required paths**

- Memory Choir: four raised pylon daises, matching floor glyphs, center striker, and accessible replay lever.
- Counterweight Gallery: visible chains/weights, two moving stair banks, safe first movement, and a manual reset crank.
- Acoustic Relay: four aligned receivers, visible response path, local reset, and no text panel.
- Broken Crossing: remove perimeter floor, add enclosing side structure, four stable checkpoint islands, and a final plate reachable only through the ordered route.

Use the descriptor's `responseCells`, `fallbackControl`, and `recoveryAnchors`; do not duplicate puzzle positions inside the painter.

- [ ] **Step 5: Extend runtime room progression additively**

```ts
export interface VaultProgressData {
    discovered: boolean;
    rooms: Record<string, boolean>;
    titanDefeated: boolean;
    coreClaimed: boolean;
    escapeStarted: boolean;
    escapeCompleted: boolean;
    coreRewardClaimed: boolean;
}
```

Validate `rooms` as the only room-completion map. Discard unknown prototype fields rather than translating them. Save after every mandatory room completion.

- [ ] **Step 6: Add safe failure recovery**

When the player falls below the Broken Crossing recovery plane, move them to the center of `lastSafeCheckpoint` only after confirming a player-sized collision-free volume. Apply normal fall consequence once, clear downward velocity through the existing player bridge, and never teleport during ordinary path traversal.

- [ ] **Step 7: Run puzzle and progression tests**

Run: `node --test src/systems/world/resonantVaultPuzzles.test.mjs src/systems/world/resonantMachineryRules.test.mjs src/systems/progression/resonantVaultProgress.test.mjs src/systems/world/resonantVaultGeometry.test.mjs`

Expected: PASS for ordered checkpoints, additive saves, fallback controls, recovery, and non-bypassable painted geometry.

- [ ] **Step 8: Commit**

```powershell
git add src/systems/world/resonantVaultPuzzles.ts src/systems/world/resonantVaultPuzzles.test.mjs src/systems/world/resonantVaultGeneration.ts src/systems/world/resonantMachineryRules.ts src/systems/world/resonantMachineryRules.test.mjs src/systems/world/ResonantVaultRuntime.ts src/systems/progression/ProgressionStore.ts src/systems/progression/resonantVaultProgress.test.mjs
git commit -m "feat: add definitive vault puzzles"
```

### Task 7: Seed deterministic vault chests and teach equipment through placement

**Files:**
- Create: `src/systems/world/resonantVaultLoot.ts`
- Create: `src/systems/world/resonantVaultLoot.test.mjs`
- Modify: `src/systems/world/resonantVaultGeneration.ts`
- Modify: `src/systems/WorldManager.ts`
- Modify: `src/components/controllers/InteractionController.tsx`
- Modify: `src/systems/world/textureResolver.ts`
- Modify: `src/systems/progression/ProgressionStore.ts`

**Interfaces:**
- Produces: `VAULT_CACHE_FLAG = 0x80`, cache IDs encoded in metadata bits `2-5`, and rotation in bits `0-1`.
- Produces: `getVaultCacheLoot(vaultId, cacheId, firstClear): VaultCacheEntry[]`.
- Produces: `seedVaultCache(chest, entries): void` with idempotent first-open behavior.

- [ ] **Step 1: Write failing deterministic and guaranteed-loot tests**

```js
// src/systems/world/resonantVaultLoot.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { BlockType } from '../../types.ts';
import { getVaultCacheLoot } from './resonantVaultLoot.ts';

test('critical caches guarantee the item before its first mandatory use', () => {
  const tuning = getVaultCacheLoot('resonant:4:-2:test', 'tuning', true);
  const armory = getVaultCacheLoot('resonant:4:-2:test', 'armory', true);
  const ranged = getVaultCacheLoot('resonant:4:-2:test', 'ranged', true);
  const core = getVaultCacheLoot('resonant:4:-2:test', 'core', true);
  assert.equal(tuning.some(({ itemId }) => itemId === BlockType.ECHO_TUNING_FORK), true);
  assert.equal(armory.some(({ itemId }) => itemId === BlockType.VAULTSTEEL_SPEAR), true);
  assert.equal(ranged.some(({ itemId }) => itemId === BlockType.VAULT_CROSSBOW), true);
  assert.ok(ranged.find(({ itemId }) => itemId === BlockType.VAULT_BOLT)?.count >= 16);
  assert.equal(core.some(({ itemId }) => itemId === BlockType.TITAN_HAMMER), true);
});

test('optional cache loot is deterministic and repeat core loot does not guarantee another Titan Hammer', () => {
  const first = getVaultCacheLoot('resonant:9:8:test', 'annex_1', false);
  assert.deepEqual(first, getVaultCacheLoot('resonant:9:8:test', 'annex_1', false));
  assert.equal(getVaultCacheLoot('resonant:9:8:test', 'core', false).some(({ itemId }) => itemId === BlockType.TITAN_HAMMER), false);
});
```

- [ ] **Step 2: Run and observe the missing loot table**

Run: `node --test src/systems/world/resonantVaultLoot.test.mjs`

Expected: FAIL because `getVaultCacheLoot` does not exist.

- [ ] **Step 3: Implement deterministic cache contents**

```ts
export const VAULT_CACHE_FLAG = 0x80;
export type VaultCacheId = 'tuning' | 'armory' | 'ranged' | 'heavy' | 'antechamber' | 'core' | `annex_${number}`;
export interface VaultCacheEntry { slot: number; itemId: BlockType; count: number; }

export function getVaultCacheLoot(vaultId: string, cacheId: VaultCacheId, firstClear: boolean): VaultCacheEntry[] {
    if (cacheId === 'tuning') return [{ slot: 13, itemId: BlockType.ECHO_TUNING_FORK, count: 1 }];
    if (cacheId === 'armory') return [{ slot: 13, itemId: BlockType.VAULTSTEEL_SPEAR, count: 1 }];
    if (cacheId === 'ranged') return [
        { slot: 12, itemId: BlockType.VAULT_CROSSBOW, count: 1 },
        { slot: 14, itemId: BlockType.VAULT_BOLT, count: 24 },
    ];
    if (cacheId === 'heavy') return [{ slot: 13, itemId: BlockType.BELLBREAKER_MAUL, count: 1 }];
    if (cacheId === 'core' && firstClear) return [{ slot: 13, itemId: BlockType.TITAN_HAMMER, count: 1 }];
    return getSeededSupplyLoot(vaultId, cacheId);
}
```

`getSeededSupplyLoot` hashes `vaultId + cacheId`, chooses fixed slots, and draws only ammunition, ordinary armor, food, torches, Echo building blocks, and non-critical weapon variants.

- [ ] **Step 4: Paint and identify caches**

Place:

- `tuning` in the Tuning Hall with its receiver visible from the chest.
- `armory` before Guard Hall.
- `ranged` before Resonance Foundry with a safe physical target in the same sightline.
- `heavy` before Bell Crypt or armor-heavy Inner Works.
- `antechamber` before the Bell Titan.
- `core` after the boss.
- Annex caches behind their optional challenge.

Encode rotation in bits `0-1`, cache index in bits `2-5`, and `VAULT_CACHE_FLAG` in bit `7`. Preserve the Magnetic cache `0x40` path.

- [ ] **Step 5: Add the narrow WorldManager seeding branch**

In `WorldManager.ensureChest`, after creating the tile entity, inspect `meta & VAULT_CACHE_FLAG`. Resolve the active layout and cache descriptor through `resonantVaultRuntime` or the deterministic candidate helper, call `getVaultCacheLoot`, write only into empty chest slots, then clear bit `7` while preserving rotation. Do not change general chest storage or UI.

- [ ] **Step 6: Keep the Tuning Fork fallback recoverable**

The Tuning Hall chest remains physically reachable after opening. Mandatory echo mechanisms also retain the adjacent striker/replay control from Task 6, so losing the fork cannot soft-lock progression.

- [ ] **Step 7: Run loot, chest, save, and interaction tests**

Run: `node --test src/systems/world/resonantVaultLoot.test.mjs src/systems/world/resonantInteraction.test.mjs src/systems/progression/resonantVaultProgress.test.mjs src/components/ui/inventoryInteractions.test.mjs`

Expected: PASS for deterministic first-open seeding, guarantees, repeat behavior, metadata preservation, and existing chest interaction.

- [ ] **Step 8: Commit**

```powershell
git add src/systems/world/resonantVaultLoot.ts src/systems/world/resonantVaultLoot.test.mjs src/systems/world/resonantVaultGeneration.ts src/systems/WorldManager.ts src/components/controllers/InteractionController.tsx src/systems/world/textureResolver.ts src/systems/progression/ProgressionStore.ts
git commit -m "feat: stock vault armories and reliquaries"
```

### Task 8: Implement conventional vault weapons and physical crossbow bolts

**Files:**
- Create: `src/systems/combat/vaultWeapons.ts`
- Create: `src/systems/combat/vaultWeapons.test.mjs`
- Create: `src/systems/combat/VaultProjectileSystem.ts`
- Create: `src/systems/combat/vaultProjectiles.test.mjs`
- Modify: `src/components/controllers/InteractionController.tsx`
- Modify: `src/components/HeldItem.tsx`
- Modify: `src/components/ResonantEffectsRenderer.tsx`
- Modify: `src/systems/entities/EntityManager.ts`
- Modify: `src/systems/world/ResonantVaultRuntime.ts`

**Interfaces:**
- Produces: `getVaultWeaponProfile(type): VaultWeaponProfile | null`.
- Produces: `resolveVaultMeleeHit(type, targetTraits): VaultWeaponHit`.
- Produces: singleton `vaultProjectileSystem` with `fire`, `tick`, `getRenderState`, and `clear`; projectile ownership supports `player` and `enemy` without duplicating world collision.
- Changes: runtime `useTuningFork` accepts only `ECHO_TUNING_FORK` and current marked machinery/core targets.

- [ ] **Step 1: Write failing weapon profile tests**

```js
// src/systems/combat/vaultWeapons.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { BlockType } from '../../types.ts';
import { getVaultWeaponProfile, resolveVaultMeleeHit } from './vaultWeapons.ts';

test('vault weapons have distinct conventional tradeoffs', () => {
  assert.deepEqual(getVaultWeaponProfile(BlockType.VAULTSTEEL_SPEAR), { kind: 'spear', damage: 6, reach: 5.4, cooldownSeconds: 0.58, stagger: 0.35, durabilityCost: 1 });
  assert.deepEqual(getVaultWeaponProfile(BlockType.VAULT_CROSSBOW), { kind: 'crossbow', damage: 7, reach: 64, cooldownSeconds: 1.15, stagger: 0.25, durabilityCost: 1 });
  assert.deepEqual(getVaultWeaponProfile(BlockType.BELLBREAKER_MAUL), { kind: 'maul', damage: 9, reach: 4.2, cooldownSeconds: 1.05, stagger: 1, durabilityCost: 1 });
  assert.equal(resolveVaultMeleeHit(BlockType.BELLBREAKER_MAUL, { armored: true }).armorMultiplier, 1.5);
  assert.equal(resolveVaultMeleeHit(BlockType.VAULTSTEEL_SPEAR, { armored: true }).armorMultiplier, 1);
});
```

- [ ] **Step 2: Write failing projectile-world collision tests**

```js
// src/systems/combat/vaultProjectiles.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { VaultProjectileSystem } from './VaultProjectileSystem.ts';

test('a physical bolt stops at a wall before damaging an entity behind it', () => {
  const hits = [];
  const system = new VaultProjectileSystem({
    getBlock: (x) => x >= 3 ? 3 : 0,
    raycastEntity: () => ({ id: 9, distance: 6 }),
    damageEntity: (id, damage) => hits.push([id, damage]),
  });
  system.fire({ x: 0, y: 2, z: 0 }, { x: 1, y: 0, z: 0 }, 7);
  for (let i = 0; i < 20; i += 1) system.tick(0.05);
  assert.deepEqual(hits, []);
  assert.equal(system.getRenderState().length, 0);
});
```

- [ ] **Step 3: Run and observe missing combat modules**

Run: `node --test src/systems/combat/vaultWeapons.test.mjs src/systems/combat/vaultProjectiles.test.mjs`

Expected: FAIL because the weapon and projectile modules do not exist.

- [ ] **Step 4: Implement weapon profiles and armor pressure**

```ts
export interface VaultWeaponProfile {
    kind: 'spear' | 'crossbow' | 'maul' | 'hammer';
    damage: number;
    reach: number;
    cooldownSeconds: number;
    stagger: number;
    durabilityCost: number;
}

const PROFILES = new Map<BlockType, VaultWeaponProfile>([
    [BlockType.VAULTSTEEL_SPEAR, { kind: 'spear', damage: 6, reach: 5.4, cooldownSeconds: 0.58, stagger: 0.35, durabilityCost: 1 }],
    [BlockType.VAULT_CROSSBOW, { kind: 'crossbow', damage: 7, reach: 64, cooldownSeconds: 1.15, stagger: 0.25, durabilityCost: 1 }],
    [BlockType.BELLBREAKER_MAUL, { kind: 'maul', damage: 9, reach: 4.2, cooldownSeconds: 1.05, stagger: 1, durabilityCost: 1 }],
    [BlockType.TITAN_HAMMER, { kind: 'hammer', damage: 11, reach: 4.4, cooldownSeconds: 1.1, stagger: 1.25, durabilityCost: 1 }],
]);
```

Add `armored?: boolean` and `staggerResistance?: number` to entity-kind traits, not live Warden-specific state. Mauls multiply damage against `armored` by `1.5`; spear and ordinary swords do not.

- [ ] **Step 5: Implement crossbow reload, ammunition, and bolt simulation**

Right-click with a Vault Crossbow:

1. Reject while reload cooldown is active.
2. Consume one `VAULT_BOLT` in survival through the existing inventory controller callback.
3. Fire from camera origin at 28 blocks/second with slight gravity, 64-block maximum travel, and world-first occlusion.
4. Damage the first visible entity and apply profile stagger.
5. Charge one durability.

`VaultProjectileSystem.tick` substeps at a maximum segment length of `0.35` blocks so thin walls cannot be tunneled through.

- [ ] **Step 6: Integrate melee reach and held animations**

Use the selected weapon profile's reach and cooldown in `tryMeleeAttack`. Dispatch `atlas:weapon-used` with the weapon kind only after a valid attack or bolt fire. In `HeldItem`, use distinct thrust, reload, and heavy-swing curves while retaining ordinary item bob and lighting.

- [ ] **Step 7: Limit the Tuning Fork to echo machinery**

Replace the new progression branch in `InteractionController` with `heldForUse.type === BlockType.ECHO_TUNING_FORK`. Call `resonantVaultRuntime.useTuningFork` with the normal raycast target. It may activate receptive machinery or replay a demonstration; it does not damage, knock back, reflect, reveal ore, or interact with the Bell Titan.

- [ ] **Step 8: Run weapon, interaction, occlusion, and held-item tests**

Run: `node --test src/systems/combat/vaultWeapons.test.mjs src/systems/combat/vaultProjectiles.test.mjs src/systems/entities/meleeOcclusion.test.mjs src/systems/world/resonantInteraction.test.mjs src/components/ui/uiInteractionFixes.test.mjs`

Expected: PASS for distinct weapon tradeoffs, ammo, reload, occlusion, durability, artifact boundary, and normal interaction priority.

- [ ] **Step 9: Commit**

```powershell
git add src/systems/combat/vaultWeapons.ts src/systems/combat/vaultWeapons.test.mjs src/systems/combat/VaultProjectileSystem.ts src/systems/combat/vaultProjectiles.test.mjs src/components/controllers/InteractionController.tsx src/components/HeldItem.tsx src/components/ResonantEffectsRenderer.tsx src/systems/entities/EntityManager.ts src/systems/world/ResonantVaultRuntime.ts
git commit -m "feat: arm vault explorers with real weapons"
```

### Task 9: Build deterministic voxel navigation for ground entities

**Files:**
- Create: `src/systems/entities/navigation/VoxelNavigator.ts`
- Create: `src/systems/entities/navigation/VoxelNavigator.test.mjs`
- Create: `src/systems/entities/navigation/NavigationPlanner.ts`
- Create: `src/systems/entities/navigation/navigationPlanner.test.mjs`
- Create: `src/systems/entities/navigation/navigationTypes.ts`
- Create: `src/systems/entities/navigation/navigationFixtures.ts`
- Modify: `src/systems/entities/Entity.ts`

**Interfaces:**
- Produces: `VoxelNavigator.findPath(request): NavigationPath | null`.
- Produces: `VoxelNavigator.validateSegment(from, to, profile): SegmentResult`.
- Produces: `NavigationPlanner.request`, `tickBudget`, and `invalidateRegion` for incremental per-frame work.
- Produces: `NavigationProfile`, `NavigationNode`, `NavigationPath`, and `NavigationFailureReason`.
- Changes: `EntityMovementAbility` gains explicit step, jump, drop, width, height, and preferred-range data while retaining `canStep` as a compatibility alias.

- [ ] **Step 1: Write failing fixtures for ledges, stairs, jumps, and safe drops**

```js
// src/systems/entities/navigation/VoxelNavigator.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { VoxelNavigator } from './VoxelNavigator.ts';
import { makeNavigationWorld } from './navigationFixtures.ts';

test('routes around an unsafe ledge instead of freezing at it', () => {
  const world = makeNavigationWorld([
    '#########',
    '#S..   G#',
    '#.#####.#',
    '#.......#',
    '#########',
  ]);
  const path = new VoxelNavigator(world).findPath({
    start: world.start,
    goal: world.goal,
    profile: { width: 0.6, height: 1.8, maxStep: 1, maxJump: 1, maxDrop: 2 },
    maxExpandedNodes: 2048,
  });
  assert.ok(path);
  assert.ok(path.nodes.some((node) => node.z >= 3));
});

test('uses a one-block stair and rejects a three-block blind drop', () => {
  const navigator = new VoxelNavigator(makeNavigationWorld(['S^..G']));
  assert.equal(navigator.validateSegment({ x: 0, y: 1, z: 0 }, { x: 1, y: 2, z: 0 }, {
    width: 0.6, height: 1.8, maxStep: 1, maxJump: 1, maxDrop: 2,
  }).traversable, true);
  assert.equal(navigator.validateSegment({ x: 2, y: 4, z: 0 }, { x: 3, y: 1, z: 0 }, {
    width: 0.6, height: 1.8, maxStep: 1, maxJump: 1, maxDrop: 2,
  }).traversable, false);
});
```

- [ ] **Step 2: Run and observe missing navigation modules**

Run: `node --test src/systems/entities/navigation/VoxelNavigator.test.mjs`

Expected: FAIL because the navigation modules do not exist.

- [ ] **Step 3: Implement bounded 3D A-star over walkable voxel columns**

```ts
export interface NavigationProfile {
    width: number;
    height: number;
    maxStep: number;
    maxJump: number;
    maxDrop: number;
    avoidHazards?: ReadonlySet<BlockType>;
}

export interface NavigationRequest {
    start: Vector3Like;
    goal: Vector3Like;
    profile: NavigationProfile;
    maxExpandedNodes: number;
}
```

Search cardinal and diagonal neighbors only when the entity's swept width and head clearance fit. Resolve each horizontal neighbor to the nearest supported foot height between `-maxDrop` and `max(maxStep, maxJump)`. Reject lava, spikes, crushers, unsupported landings, closed vault gates, and nodes whose owning chunks are not loaded. Use deterministic tie-breaking `(f, h, x, y, z)` so the same world state yields the same path.

- [ ] **Step 4: Smooth only line-of-sight-safe path segments**

After A-star, remove intermediate nodes only when the complete swept capsule has support, clearance, and a legal height delta. Preserve explicit `step`, `jump`, and `drop` action nodes so locomotion never guesses from a visually smoothed line.

- [ ] **Step 5: Add bounded incremental planning and cache invalidation**

Keep `VoxelNavigator` pure for tests, but run live searches through `NavigationPlanner` as resumable A-star jobs. Expand at most 600 nodes and at most two new search jobs per frame; carry unfinished jobs forward. Coalesce requests that share body profile, target region, and local world revision. Cache by `(startCell, goalRegion, profileKey, localWorldRevision)` for at most `0.75` seconds. Increment local revisions when blocks change within the path corridor, a vault gate moves, or a remesh-affecting hazard changes. Cancel jobs whose entity owner is unloaded or dead. Do not persist paths or planner jobs in world saves.

- [ ] **Step 6: Run navigation tests**

Run: `node --test src/systems/entities/navigation/VoxelNavigator.test.mjs src/systems/entities/navigation/navigationPlanner.test.mjs`

Expected: PASS for detours, stairs, head clearance, jumps, safe drops, hazard rejection, unloaded-chunk rejection, deterministic ties, smoothing, per-frame budgets, request coalescing, cancellation, and cache invalidation.

- [ ] **Step 7: Commit**

```powershell
git add src/systems/entities/navigation src/systems/entities/Entity.ts
git commit -m "feat: add voxel-aware entity navigation"
```

### Task 10: Integrate navigation, locomotion, and stuck recovery into ordinary mobs

**Files:**
- Create: `src/systems/entities/navigation/EntityLocomotion.ts`
- Create: `src/systems/entities/navigation/entityLocomotion.test.mjs`
- Create: `src/systems/entities/navigation/entityNavigationIntegration.test.mjs`
- Modify: `src/systems/entities/EntityManager.ts`
- Modify: `src/systems/entities/Entity.ts`

**Interfaces:**
- Produces: `EntityLocomotion.tick(entity, path, world, dt): LocomotionResult`.
- Produces: `NavigationRuntimeState` on live entities only; it is excluded from serialization.
- Changes: every ground entity definition provides a navigation and locomotion profile instead of inheriting one direct-line behavior.

- [ ] **Step 1: Write failing integration tests for recovery and per-mob motion**

```js
// src/systems/entities/navigation/entityNavigationIntegration.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { simulateGroundEntity } from './navigationFixtures.ts';

test('a blocked zombie replans and walks around a ledge', () => {
  const result = simulateGroundEntity({ kind: 'zombie', seconds: 8, fixture: 'ledge_detour' });
  assert.equal(result.fell, false);
  assert.ok(result.distanceToTarget < 2.5);
  assert.ok(result.replans >= 1);
});

test('a ranged skeleton stops at a visible preferred range', () => {
  const result = simulateGroundEntity({ kind: 'skeleton', seconds: 8, fixture: 'open_range' });
  assert.ok(result.distanceToTarget >= 9);
  assert.ok(result.distanceToTarget <= 13);
  assert.equal(result.hasLineOfSight, true);
});
```

- [ ] **Step 2: Run and observe direct-line behavior fail**

Run: `node --test src/systems/entities/navigation/entityLocomotion.test.mjs src/systems/entities/navigation/entityNavigationIntegration.test.mjs`

Expected: FAIL because entities still push directly toward the player and stop at ledges.

- [ ] **Step 3: Add live navigation state without changing saves**

```ts
export interface NavigationRuntimeState {
    path: NavigationPath | null;
    waypointIndex: number;
    goalCellKey: string;
    repathAt: number;
    lastProgressPosition: Vector3Like;
    lastProgressAt: number;
    recoveryAttempts: number;
}
```

Create the state when an entity becomes active. Never include it in entity snapshot/save payloads. Existing saves load with state absent and initialize normally.

- [ ] **Step 4: Replace direct-line chase with path requests and locomotion actions**

Keep existing collision as the final authority, but feed it a waypoint velocity. A `step` node uses normal collision stepping; a `jump` node applies a kind-specific vertical impulse only when grounded; a `drop` node reduces forward acceleration until its landing is still valid. Do not teleport as ordinary locomotion.

- [ ] **Step 5: Define movement identities**

| Kind | Movement behavior |
|---|---|
| Zombie | Persistent close-range route, 1-block step/jump, 2-block safe drop |
| Skeleton | Seeks 9–13 block visible firing band, strafes between attacks |
| Creeper | Chooses a clear approach lane, slows during fuse, cancels on lost path |
| Spider | Faster turns, 2-block jump, may climb a one-block lip but not walls |
| Passive ground mobs | Wander on supported local routes and avoid hazards |

Preserve existing speeds unless a profile explicitly changes acceleration/turn rate. Animation speed derives from actual horizontal displacement, not desired velocity.

- [ ] **Step 6: Add tiered stuck recovery**

If progress is below `0.15` blocks for `1.25` seconds while a route exists:

1. Repath with the current goal.
2. Try a short legal sidestep and repath.
3. Repath to the nearest visible node within four blocks.
4. After three failed recovery cycles, disengage to its encounter anchor rather than jittering forever.

Never teleport ordinary mobs through walls or across pits. Vault enemies may use only authored recovery anchors covered by Task 11.

- [ ] **Step 7: Run navigation and existing entity regression tests**

Run: `node --test src/systems/entities/navigation/VoxelNavigator.test.mjs src/systems/entities/navigation/navigationPlanner.test.mjs src/systems/entities/navigation/entityLocomotion.test.mjs src/systems/entities/navigation/entityNavigationIntegration.test.mjs src/systems/entities/meleeOcclusion.test.mjs src/systems/entities/entityBehavior.test.mjs`

Expected: PASS, including no ledge freezing, correct ranged spacing, legal jumps/drops, deterministic recovery, and preserved attack occlusion.

- [ ] **Step 8: Commit**

```powershell
git add src/systems/entities/navigation src/systems/entities/EntityManager.ts src/systems/entities/Entity.ts
git commit -m "feat: make ground mobs navigate voxel terrain"
```

### Task 11: Replace room-leaking sentinels with authored vault enemy encounters

**Files:**
- Create: `src/systems/entities/resonantVaultEnemies.ts`
- Create: `src/systems/entities/resonantVaultEnemies.test.mjs`
- Create: `src/systems/entities/resonantEncounterActivation.ts`
- Create: `src/systems/entities/resonantEncounterActivation.test.mjs`
- Modify: `src/systems/entities/ResonantEncounterDirector.ts`
- Modify: `src/systems/entities/EntityManager.ts`
- Modify: `src/systems/entities/Entity.ts`
- Modify: `src/systems/world/ResonantVaultRuntime.ts`
- Modify: `src/systems/events/GameEvents.ts`

**Interfaces:**
- Produces: enemy profiles for `vault_guard`, `vault_marksman`, `bell_hound`, and `tollkeeper`.
- Produces: `isPlayerInsideEncounter(roomBounds, position)` and room-scoped activation state.
- Produces: `vault:encounter-started`, `vault:encounter-progress`, and `vault:encounter-cleared` typed events.
- Changes: sentinel activation is room-bound and gate-aware instead of a 30-block radius check.

- [ ] **Step 1: Write failing room-isolation and enemy-identity tests**

```js
// src/systems/entities/resonantEncounterActivation.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { getEncounterActivation } from './resonantEncounterActivation.ts';

test('an enemy in the next sealed room does not activate through the wall', () => {
  const result = getEncounterActivation({
    player: { x: 0, y: 10, z: 0 },
    room: { minX: 20, maxX: 40, minY: 4, maxY: 20, minZ: -10, maxZ: 10 },
    entranceCrossed: false,
    gateOpen: false,
  });
  assert.equal(result.active, false);
});

test('crossing the authored threshold activates exactly one room encounter', () => {
  const result = getEncounterActivation({
    player: { x: 21, y: 10, z: 0 },
    room: { minX: 20, maxX: 40, minY: 4, maxY: 20, minZ: -10, maxZ: 10 },
    entranceCrossed: true,
    gateOpen: true,
  });
  assert.equal(result.active, true);
  assert.equal(result.lockRoomId, true);
});
```

```js
// src/systems/entities/resonantVaultEnemies.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { getVaultEnemyProfile } from './resonantVaultEnemies.ts';

test('vault enemy types have different roles and movement', () => {
  assert.equal(getVaultEnemyProfile('vault_guard').role, 'frontline');
  assert.equal(getVaultEnemyProfile('vault_marksman').role, 'ranged');
  assert.equal(getVaultEnemyProfile('bell_hound').role, 'flanker');
  assert.equal(getVaultEnemyProfile('tollkeeper').role, 'elite');
  assert.notDeepEqual(getVaultEnemyProfile('bell_hound').navigation, getVaultEnemyProfile('tollkeeper').navigation);
});
```

- [ ] **Step 2: Run and observe missing encounter modules**

Run: `node --test src/systems/entities/resonantEncounterActivation.test.mjs src/systems/entities/resonantVaultEnemies.test.mjs`

Expected: FAIL because the authored activation and enemy profile modules do not exist.

- [ ] **Step 3: Author four readable combat roles**

| Enemy | Silhouette and locomotion | Combat role | Counterplay |
|---|---|---|---|
| Vault Guard | Armored humanoid with spear or sword; deliberate stairs and one-block steps | Formation melee with guard, fixed arcs, and no attack skating | Read the committed arc, use spacing, or break guard with the maul |
| Vault Marksman | Crossbow humanoid that braces, visibly fires/reloads, and seeks legal firing positions | Ranged pressure and relocation when its lane is blocked | Use cover or the Vault Crossbow; pressure during reload |
| Bell Hound | Low fast bronze-and-stone quadruped with distinct leap/fall/land motion | Flanks around allies and crosses small legal gaps | Spear reach controls its committed leap |
| Tollkeeper | Large slow hammer elite requiring wide clearance and preferring ramps/broad stairs | Sparse high-stagger pressure with long wind-ups | Dodge the telegraph; maul rewards armor pressure |

No enemy copies Magnetic Warden attacks, sound IDs, shader colors, or geometry. Every damaging action has anticipation, active, and recovery durations in its data profile.

Marksman shots use the same swept world-occlusion kernel as Task 8's physical bolts with `owner: 'enemy'`, a separate damage profile, and no player-ammunition consumption. A blocked lane causes relocation; a bolt never damages through a wall. Guards stop translating during committed attack arcs, Hounds choose an unoccupied flank destination before leaping, and Tollkeepers reject corridors narrower than their body-clearance profile.

- [ ] **Step 4: Scope activation and persistence to room IDs**

Spawn dormant enemies only after the room's chunks are loaded. Activate when the player crosses the authored entrance threshold, close only that room's combat gates, and keep neighboring rooms dormant. Save only the encounter's cleared boolean in `VaultProgressData.rooms`; respawn active uncleared rooms on reload from deterministic definitions.

- [ ] **Step 5: Add room compositions and pacing**

- `guard_hall`: two Guards, then two Guards with offset approach lanes.
- `resonance_foundry`: one Guard plus one Marksman, then two Hounds entering from visible doors.
- `inner_works`: one Marksman plus two Hounds, then one Tollkeeper with a Guard.
- `bell_crypt`: one optional Tollkeeper guarding a high-value cache.
- Grand Ascent: two short mixed waves separated by a supply landing.

Cap concurrent non-boss vault enemies at six per encounter and at twelve live across the loaded vault. Inactive rooms do not tick distant combat AI. The Bell Titan arena retains no ordinary encounter enemies. Gate reopening waits for the last death/recovery animation, then emits one clear bell response and a warm architectural light cue.

- [ ] **Step 6: Integrate navigation and recovery anchors**

Each combat room provides at least four supported recovery anchors verified by the geometry validator. Enemies route within their room bounds. If navigation fails three recovery cycles, move the enemy only to the nearest visible, unoccupied authored anchor and play a short re-form animation; never move it across a closed gate or to another room.

- [ ] **Step 7: Run encounter, navigation, progression, and leak tests**

Run: `node --test src/systems/entities/resonantEncounterActivation.test.mjs src/systems/entities/resonantVaultEnemies.test.mjs src/systems/entities/navigation/VoxelNavigator.test.mjs src/systems/entities/navigation/entityLocomotion.test.mjs src/systems/entities/navigation/entityNavigationIntegration.test.mjs src/systems/progression/resonantVaultProgress.test.mjs`

Expected: PASS for room isolation, deterministic waves, six-per-encounter and twelve-loaded caps, role-specific movement, recovery bounds, gate release, inactive-room suspension, and reload behavior.

- [ ] **Step 8: Commit**

```powershell
git add src/systems/entities/resonantVaultEnemies.ts src/systems/entities/resonantVaultEnemies.test.mjs src/systems/entities/resonantEncounterActivation.ts src/systems/entities/resonantEncounterActivation.test.mjs src/systems/entities/ResonantEncounterDirector.ts src/systems/entities/EntityManager.ts src/systems/entities/Entity.ts src/systems/world/ResonantVaultRuntime.ts src/systems/events/GameEvents.ts
git commit -m "feat: author room-scoped vault encounters"
```

### Task 12: Give every vault enemy a textured model, authored animation, and unique feedback

**Files:**
- Create: `src/components/resonantVaultEnemyModels.ts`
- Create: `src/components/resonantVaultEnemyModels.test.mjs`
- Create: `src/components/ResonantVaultEnemyRenderer.tsx`
- Create: `src/systems/textures/resonantEntityTexturePixels.ts`
- Modify: `src/components/EntityRenderer.tsx`
- Modify: `src/components/ResonantEffectsRenderer.tsx`
- Modify: `src/systems/sound/ResonantVaultAudio.ts`
- Modify: `public/assets/rvx/sounds.json`
- Create: `public/assets/rvx/textures/entities/vault_guard.png`
- Create: `public/assets/rvx/textures/entities/vault_marksman.png`
- Create: `public/assets/rvx/textures/entities/bell_hound.png`
- Create: `public/assets/rvx/textures/entities/tollkeeper.png`
- Create: `public/assets/rvx/sounds/resonant_vault/guard_step_1.ogg`
- Create: `public/assets/rvx/sounds/resonant_vault/guard_step_2.ogg`
- Create: `public/assets/rvx/sounds/resonant_vault/guard_swing.ogg`
- Create: `public/assets/rvx/sounds/resonant_vault/marksman_brace.ogg`
- Create: `public/assets/rvx/sounds/resonant_vault/marksman_fire.ogg`
- Create: `public/assets/rvx/sounds/resonant_vault/marksman_reload.ogg`
- Create: `public/assets/rvx/sounds/resonant_vault/hound_leap.ogg`
- Create: `public/assets/rvx/sounds/resonant_vault/hound_land.ogg`
- Create: `public/assets/rvx/sounds/resonant_vault/tollkeeper_windup.ogg`
- Create: `public/assets/rvx/sounds/resonant_vault/tollkeeper_impact.ogg`

**Interfaces:**
- Produces: declarative segmented model definitions and clip samplers for all four vault enemies.
- Produces: one renderer selected by vault enemy kind from `EntityRenderer`.
- Changes: gameplay events select registered recorded/edited assets with `fallback: false`.

- [ ] **Step 1: Write failing model-completeness tests**

```js
// src/components/resonantVaultEnemyModels.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { VAULT_ENEMY_MODELS, sampleVaultEnemyAnimation } from './resonantVaultEnemyModels.ts';

for (const kind of ['vault_guard', 'vault_marksman', 'bell_hound', 'tollkeeper']) {
  test(`${kind} has textured geometry and complete combat clips`, () => {
    const model = VAULT_ENEMY_MODELS[kind];
    assert.ok(model.parts.length >= 6);
    assert.match(model.texture, /\.png$/);
    for (const clip of ['idle', 'alert', 'turn', 'move', 'anticipation', 'attack', 'recovery', 'hurt', 'stagger', 'death']) {
      assert.ok(sampleVaultEnemyAnimation(kind, clip, 0.5));
    }
  });
}
```

- [ ] **Step 2: Run and observe missing enemy model module**

Run: `node --test src/components/resonantVaultEnemyModels.test.mjs`

Expected: FAIL because the model data does not exist.

- [ ] **Step 3: Build distinct segmented models and opaque pixel textures**

Create low-resolution Atlas-native textures with stone, oxidized bronze, cloth, and warm bell-metal accents. The Guard and Marksman are distinct articulated humanoids, the Hound is a low quadruped, and the Tollkeeper is a broad hammer elite. Keep emissive pixels below 8% of each texture and only on readable weak points or functional equipment. Use texture filtering and material setup already used by Atlas mobs; do not use a neon bloom material.

- [ ] **Step 4: Sample animation from authoritative encounter phases**

Render animation must use the current authoritative action plus normalized action time, not infer attacks from distance. Blend locomotion from measured displacement. Add Guard block, Marksman aim/fire/reload, Hound jump/fall/land, and Tollkeeper heavy follow-through clips. Ensure attack anticipation remains visible under low frame rates by clamping the displayed wind-up pose for at least one rendered frame.

- [ ] **Step 5: Register unique non-synthesized sounds**

Use only checked-in edited field/foley recordings or existing license-compatible recorded sources. Normalize peaks below `-1 dBFS`, trim leading silence, retain natural tails, and add entries to `sounds.json`. All new vault event calls pass `{ fallback: false }`; missing files fail silent and log once in development.

- [ ] **Step 6: Remove old primitive sentinel rendering paths**

Route the four new kinds through `ResonantVaultEnemyRenderer`. Delete old Sentinel primitive geometry and skip paths from `ResonantEffectsRenderer` and `EntityRenderer`; keep the effects component for particles, shockwaves, projectiles, and room effects only. `EntityRenderer` must no longer skip a live kind without a corresponding dedicated renderer.

- [ ] **Step 7: Validate model clips, texture constraints, and audio registry**

Run: `node --test src/components/resonantVaultEnemyModels.test.mjs src/systems/registry/resonantPresentation.test.mjs src/systems/sound/resonantVaultAudio.test.mjs`

Expected: PASS for model completeness, animation phase coverage, texture registration, restrained emissive area, sound file existence, unique event IDs, and `fallback: false`.

- [ ] **Step 8: Commit**

```powershell
git add src/components/resonantVaultEnemyModels.ts src/components/resonantVaultEnemyModels.test.mjs src/components/ResonantVaultEnemyRenderer.tsx src/components/EntityRenderer.tsx src/components/ResonantEffectsRenderer.tsx src/systems/textures/resonantEntityTexturePixels.ts src/systems/sound/ResonantVaultAudio.ts public/assets/rvx/textures/entities public/assets/rvx/sounds.json public/assets/rvx/sounds/resonant_vault
git commit -m "feat: give vault enemies distinct presentation"
```

### Task 13: Replace the Vault Mason with the Bell Titan encounter state machine

**Files:**
- Create: `src/systems/entities/BellTitanEncounterCore.ts`
- Create: `src/systems/entities/BellTitanEncounter.ts`
- Create: `src/systems/entities/bellTitanEncounter.test.mjs`
- Create: `src/systems/entities/BellTitanArena.ts`
- Create: `src/systems/entities/bellTitanArena.test.mjs`
- Modify: `src/systems/entities/resonantEntities.ts`
- Modify: `src/systems/entities/EntityManager.ts`
- Modify: `src/systems/world/ResonantVaultRuntime.ts`
- Modify: `src/systems/events/GameEvents.ts`
- Delete: `src/systems/entities/VaultMasonEncounterCore.ts`
- Delete: `src/systems/entities/VaultMasonEncounter.ts`
- Delete: `src/systems/entities/VaultMasonArena.ts`
- Delete: `src/systems/entities/vaultMasonEncounter.test.mjs`
- Delete: `src/systems/entities/vaultMasonArena.test.mjs`

**Interfaces:**
- Produces: pure `advanceBellTitan(state, input): BellTitanTransition`.
- Produces: singleton `bellTitanEncounter` with `spawn`, `tick`, `applyHit`, `getSnapshot`, and `reset`.
- Produces: `BellTitanArena` for deterministic shockwaves and breakaway shell debris.
- Changes: entity kind `bell_titan` and the current `titanDefeated` progression field are authoritative.
- Changes: removes Mason event imports and adds typed `vault:titan-*` events.

- [ ] **Step 1: Write failing phase, telegraph, and damage-window tests**

```js
// src/systems/entities/bellTitanEncounter.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { createBellTitanState, advanceBellTitan } from './BellTitanEncounterCore.ts';

test('the Titan cannot attack until the arena illumination finishes', () => {
  let state = createBellTitanState();
  state = advanceBellTitan(state, { type: 'wake' }).state;
  state = advanceBellTitan(state, { type: 'tick', dt: 7.9, playerDistance: 10 }).state;
  assert.equal(state.action, 'awaken');
  assert.equal(state.canDamagePlayer, false);
  state = advanceBellTitan(state, { type: 'tick', dt: 0.2, playerDistance: 10 }).state;
  assert.notEqual(state.action, 'awaken');
});

test('a completed slam creates a clear bell-core damage window', () => {
  let state = createBellTitanState({ action: 'slam_recovery', actionTime: 0.89 });
  state = advanceBellTitan(state, { type: 'tick', dt: 0.02, playerDistance: 8 }).state;
  assert.equal(state.coreExposed, true);
  assert.ok(state.coreExposureRemaining >= 2.74);
});

test('armor breaks at two readable phase thresholds', () => {
  let state = createBellTitanState({ action: 'core_open', coreExposed: true, coreExposureRemaining: 3 });
  state = advanceBellTitan(state, { type: 'damage', amount: 135, hitZone: 'core' }).state;
  assert.equal(state.phase, 2);
  assert.equal(state.shellStage, 1);
  state = { ...state, action: 'core_open', coreExposed: true, coreExposureRemaining: 3 };
  state = advanceBellTitan(state, { type: 'damage', amount: 135, hitZone: 'core' }).state;
  assert.equal(state.phase, 3);
  assert.equal(state.shellStage, 2);
});
```

- [ ] **Step 2: Write failing shockwave readability tests**

```js
// src/systems/entities/bellTitanArena.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { BellTitanArena } from './BellTitanArena.ts';

test('slam rings expand once and damage a player only when crossing them', () => {
  const arena = new BellTitanArena();
  arena.spawnShockwave({ x: 0, y: 4, z: 0 }, { startRadius: 3, endRadius: 19, speed: 8, damage: 8 });
  assert.equal(arena.tick(0.5, { x: 10, y: 4, z: 0 }).playerDamage, 0);
  assert.equal(arena.tick(0.5, { x: 10, y: 4, z: 0 }).playerDamage, 8);
  assert.equal(arena.tick(0.5, { x: 10, y: 4, z: 0 }).playerDamage, 0);
});
```

- [ ] **Step 3: Run and observe missing Bell Titan modules**

Run: `node --test src/systems/entities/bellTitanEncounter.test.mjs src/systems/entities/bellTitanArena.test.mjs`

Expected: FAIL because the Bell Titan encounter does not exist.

- [ ] **Step 4: Implement a pure, deterministic encounter timeline**

```ts
export type BellTitanAction =
    | 'dormant' | 'awaken' | 'idle'
    | 'sweep_windup' | 'sweep_active' | 'sweep_recovery'
    | 'slam_windup' | 'slam_active' | 'slam_recovery'
    | 'advance_windup' | 'advance_active' | 'advance_recovery'
    | 'double_toll_windup' | 'double_toll_active' | 'double_toll_recovery'
    | 'core_open' | 'shell_break' | 'stagger' | 'death';

export interface BellTitanState {
    hp: number;
    maxHp: 390;
    phase: 1 | 2 | 3;
    shellStage: 0 | 1 | 2;
    action: BellTitanAction;
    actionTime: number;
    coreExposed: boolean;
    coreExposureRemaining: number;
    canDamagePlayer: boolean;
    attackIndex: number;
}
```

Awakening lasts 8 seconds and cannot damage the player. Attack selection is deterministic and avoids immediate repeats. All timers advance from `dt`; render frame rate cannot skip anticipation or deal damage twice.

- [ ] **Step 5: Author a clear three-phase moveset**

| Move | Telegraph | Active | Recovery / opening |
|---|---:|---:|---:|
| Hammer sweep | 1.20 s, raised shoulder and floor arc | 0.28 s, one 150-degree sweep | 0.95 s; no bell opening |
| Bell slam | 1.55 s, both arms overhead and floor target | impact plus one 8 blocks/s ground ring | 0.90 s plus 2.75 s core opening |
| Advancing strike | 1.00 s, planted forward lean and fixed floor lane | short committed advance, never a full-arena homing charge | 1.00 s; no bell opening |
| Double toll, phase 2+ | 1.80 s, chain draw plus two previewed floor disturbances | two established shockwave timings | 1.00 s plus 3.00 s core opening |

Phase one, Armored March, establishes sweep, slam, advancing strike, and the longest opening. Phase two, Cracked Bell, permanently removes the first armor layer and adds the double toll using already learned shockwave cues. Phase three, Last Toll, removes most armor and uses only limited authored combinations of established attacks. Closed stone/bronze shell takes 20% chip damage and emits a dull deflection response; exposed bell core takes normal damage. Bellbreaker Maul retains its armored multiplier. At 67% and 34% HP, break away authored outer-shell sections, pause hostile actions for 2 seconds, permanently brighten the core, and continue with a visibly leaner silhouette. Do not move arena walls, cover, doors, or floor topology during combat.

- [ ] **Step 6: Implement world collision and hit-zone resolution**

Sweep, advancing strike, and slam damage use authored world-space volumes derived from the Titan root and current facing. Shockwaves stop at arena boundary and never pass through sealed arena walls. `applyHit` distinguishes shell and hanging-bell core from renderer-provided hit boxes, but the encounter remains authoritative about whether the core is open.

- [ ] **Step 7: Replace Mason runtime/event wiring**

Add:

```ts
'vault:titan-awakened': { vaultId: string; entityId: number };
'vault:titan-action': { vaultId: string; entityId: number; action: BellTitanAction; durationSeconds: number };
'vault:titan-core': { vaultId: string; entityId: number; open: boolean; durationSeconds: number };
'vault:titan-shell-broken': { vaultId: string; entityId: number; stage: 1 | 2 };
'vault:titan-defeated': { vaultId: string; entityId: number };
```

Remove Mason imports, handlers, entity registration, stored-field aliases, and temporary-arena repair behavior. Bell Titan defeat writes only `titanDefeated`.

- [x] **Step 8: Run boss, world-collision, and current progression tests**

Run: `node --test src/systems/entities/bellTitanEncounter.test.mjs src/systems/entities/bellTitanArena.test.mjs src/systems/progression/resonantVaultProgress.test.mjs src/systems/entities/meleeOcclusion.test.mjs`

Expected: PASS for telegraphs, exposure windows, phase transitions, one-hit rings, wall occlusion, death, reload, and current Titan completion.

- [ ] **Step 9: Commit**

```powershell
git add src/systems/entities/BellTitanEncounterCore.ts src/systems/entities/BellTitanEncounter.ts src/systems/entities/bellTitanEncounter.test.mjs src/systems/entities/BellTitanArena.ts src/systems/entities/bellTitanArena.test.mjs src/systems/entities/resonantEntities.ts src/systems/entities/EntityManager.ts src/systems/world/ResonantVaultRuntime.ts src/systems/events/GameEvents.ts
git rm src/systems/entities/VaultMasonEncounterCore.ts src/systems/entities/VaultMasonEncounter.ts src/systems/entities/VaultMasonArena.ts src/systems/entities/vaultMasonEncounter.test.mjs src/systems/entities/vaultMasonArena.test.mjs
git commit -m "feat: replace Vault Mason with the Bell Titan"
```

### Task 14: Build the Bell Titan model, texture, animations, lighting, and unique sound set

**Files:**
- Create: `src/components/bellTitanModel.ts`
- Create: `src/components/bellTitanModel.test.mjs`
- Create: `src/components/BellTitanRenderer.tsx`
- Modify: `src/components/EntityRenderer.tsx`
- Modify: `src/components/ResonantEffectsRenderer.tsx`
- Modify: `src/components/ResonantVaultController.tsx`
- Modify: `src/systems/sound/ResonantVaultAudio.ts`
- Modify: `public/assets/rvx/sounds.json`
- Create: `public/assets/rvx/textures/entities/bell_titan.png`
- Delete: `public/assets/rvx/textures/entities/vault_mason.png`
- Create: `public/assets/rvx/sounds/resonant_vault/titan_awaken.ogg`
- Create: `public/assets/rvx/sounds/resonant_vault/titan_step_1.ogg`
- Create: `public/assets/rvx/sounds/resonant_vault/titan_step_2.ogg`
- Create: `public/assets/rvx/sounds/resonant_vault/titan_chain_1.ogg`
- Create: `public/assets/rvx/sounds/resonant_vault/titan_chain_2.ogg`
- Create: `public/assets/rvx/sounds/resonant_vault/titan_sweep.ogg`
- Create: `public/assets/rvx/sounds/resonant_vault/titan_slam.ogg`
- Create: `public/assets/rvx/sounds/resonant_vault/titan_toll.ogg`
- Create: `public/assets/rvx/sounds/resonant_vault/titan_core_open.ogg`
- Create: `public/assets/rvx/sounds/resonant_vault/titan_shell_break.ogg`
- Create: `public/assets/rvx/sounds/resonant_vault/titan_hurt_1.ogg`
- Create: `public/assets/rvx/sounds/resonant_vault/titan_hurt_2.ogg`
- Create: `public/assets/rvx/sounds/resonant_vault/titan_death.ogg`
- Delete: `public/assets/rvx/sounds/resonant_vault/custodian_spawn.ogg`
- Delete: `public/assets/rvx/sounds/resonant_vault/custodian_phase.ogg`
- Delete: `public/assets/rvx/sounds/resonant_vault/custodian_defeat.ogg`

**Interfaces:**
- Produces: `BELL_TITAN_MODEL`, `sampleBellTitanPose`, and phase-specific visible-part masks.
- Produces: dedicated hit zones for shell and hanging bell core.
- Changes: arena lights subscribe to Titan awakening and phase events; sound selection uses unique `bell_titan.*` IDs only.

- [ ] **Step 1: Write failing silhouette, clip, and phase-break tests**

```js
// src/components/bellTitanModel.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { BELL_TITAN_MODEL, getBellTitanVisibleParts, sampleBellTitanPose } from './bellTitanModel.ts';

test('the Titan has a bell, chains, hammer arms, and no Mason part names', () => {
  const names = BELL_TITAN_MODEL.parts.map((part) => part.name);
  assert.ok(names.includes('hanging_bell'));
  assert.ok(names.includes('left_chain'));
  assert.ok(names.includes('right_hammer'));
  assert.equal(names.some((name) => /mason|wall|remesh/i.test(name)), false);
});

test('shell stages permanently remove outer armor and expose more bell', () => {
  const stage0 = getBellTitanVisibleParts(0);
  const stage2 = getBellTitanVisibleParts(2);
  assert.ok(stage0.length > stage2.length);
  assert.ok(sampleBellTitanPose('slam_windup', 0.75).rightHammer.rotation.x < -1);
});
```

- [ ] **Step 2: Run and observe the missing Titan presentation**

Run: `node --test src/components/bellTitanModel.test.mjs`

Expected: FAIL because only the old Mason renderer/model exists.

- [ ] **Step 3: Build a new readable 6.5-block silhouette**

Use a broad stone torso, bronze shoulders, two asymmetric hammer forearms, four visible chain runs, and a cracked bell suspended inside an open chest cage. The bell core must remain identifiable at 20 blocks. The model must not share the Magnetic Warden's floating crystal, polarity, shield, or squat humanoid silhouette.

- [ ] **Step 4: Author renderer clips and shell break transitions**

Provide `dormant`, `awaken`, `idle`, `walk`, `turn`, `sweep`, `slam`, `advance`, `double_toll`, `core_open`, `core_close`, `shell_break_1`, `shell_break_2`, `hurt`, `heavy_stagger`, `death`, and `settled` poses with wind-up/contact/follow-through/recovery subdivisions where the action needs them. Shell fragments animate from encounter events, settle as non-colliding debris, and fade only after their sound tail ends. The hanging bell continues a damped physical swing through recovery instead of snapping to rest. Death reaches a complete stable collapsed pose before encounter cleanup.

- [ ] **Step 5: Create a complete opaque pixel texture**

Paint stone, worn bronze, blackened chain, cracked bell metal, and a warm internal reflection. Keep emissive pixels inside the bell crack/core and below 6% of the sheet. Use nearest filtering and Atlas mob materials; no bloom layer or transparent body faces.

- [ ] **Step 6: Fully illuminate the arena before combat**

During the 8-second awakening, ignite perimeter braziers in four audible groups, raise warm ambient fill, and enable two non-neon overhead shafts. At 8 seconds, the arena floor, Titan silhouette, hammer arcs, and bell core must all exceed the vault readability floor used by the visual test. Lighting stays on after the fight and restores correctly after reload.

- [ ] **Step 7: Register a unique recorded/edited Titan sound palette**

Use recorded metal, chain, stone, bell, and processed vocal-metal strain sources. Do not reuse Magnetic Warden or Mason asset paths and do not call synthesis fallbacks. Preserve tails on toll, shell break, and death; concurrent tail voices are allowed after the next action begins. Register all IDs in `sounds.json` with `{ fallback: false }` from event calls.

- [ ] **Step 8: Remove all Mason presentation and reference paths**

Delete `VaultMasonRenderer.tsx`, `vaultMasonModel.ts`, `vaultMasonModel.test.mjs`, the Mason texture, and obsolete Custodian one-shots once all imports are replaced. Scan tracked runtime code and player-visible copy for `Mason`, `Custodian`, `custodian_spawn`, and Magnetic Warden sound IDs in the Resonant Vault flow. No Vault runtime or progression exception is permitted.

- [x] **Step 9: Run presentation, audio, and obsolete-reference tests**

Run: `node --test src/components/bellTitanModel.test.mjs src/systems/registry/resonantPresentation.test.mjs src/systems/sound/resonantVaultAudio.test.mjs src/systems/progression/resonantVaultProgress.test.mjs`

Run: `rg -n "VaultMason|vault_mason|mason-|custodian_spawn|magnetic_warden" src public/assets/rvx/sounds.json public/assets/rvx/sounds/resonant_vault`

Expected: tests PASS. The scan returns no active runtime, presentation, or persistence reference.

- [ ] **Step 10: Commit**

```powershell
git add src/components/bellTitanModel.ts src/components/bellTitanModel.test.mjs src/components/BellTitanRenderer.tsx src/components/EntityRenderer.tsx src/components/ResonantEffectsRenderer.tsx src/components/ResonantVaultController.tsx src/systems/sound/ResonantVaultAudio.ts public/assets/rvx/sounds.json public/assets/rvx/sounds/resonant_vault public/assets/rvx/textures/entities/bell_titan.png
git rm src/components/VaultMasonRenderer.tsx src/components/vaultMasonModel.ts src/components/vaultMasonModel.test.mjs public/assets/rvx/textures/entities/vault_mason.png
git commit -m "feat: give the Bell Titan a complete identity"
```

### Task 15: Build two physically different, surface-reaching escape routes

**Files:**
- Create: `src/systems/world/resonantVaultEscapes.ts`
- Create: `src/systems/world/resonantVaultEscapes.test.mjs`
- Create: `src/systems/world/resonantVaultHazards.ts`
- Create: `src/systems/world/resonantVaultHazards.test.mjs`
- Modify: `src/systems/world/resonantVaultGeneration.ts`
- Modify: `src/systems/world/resonantVaultConnectivity.ts`
- Modify: `src/systems/world/resonantVaultArchitecture.ts`
- Modify: `src/systems/world/resonantVaults.ts`
- Modify: `src/systems/world/workers/world.worker.ts`
- Create: `src/components/ResonantVaultHazardRenderer.tsx`
- Modify: `src/components/ResonantEffectsRenderer.tsx`

**Interfaces:**
- Produces: `VaultEscapeRoute = 'grand' | 'fracture'` and two route descriptors.
- Produces: `buildGrandAscent`, `buildFractureStair`, and `validateSurfaceOutlet`.
- Produces: hazard descriptors for spikes, crushers, collapsible landings, and gaps.
- Changes: `VaultSurfaceOutlets` exposes only `grand` and `fracture`.

- [ ] **Step 1: Write failing route-choice and surface-invariant tests**

```js
// src/systems/world/resonantVaultEscapes.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildVaultEscapeRoutes, validateSurfaceOutlet } from './resonantVaultEscapes.ts';

test('the two exits have measurably different risk and length', () => {
  const routes = buildVaultEscapeRoutes({ seed: 4242, vaultBaseY: -44, grandSurfaceY: 71, fractureSurfaceY: 68 });
  assert.ok(routes.grand.pathLength >= routes.fracture.pathLength * 1.55);
  assert.ok(routes.grand.combatZones >= 2);
  assert.equal(routes.fracture.combatZones, 0);
  assert.ok(routes.fracture.requiredHazards >= 5);
});

test('both final stair volumes open above actual terrain', () => {
  const routes = buildVaultEscapeRoutes({ seed: 99, vaultBaseY: -36, grandSurfaceY: 84, fractureSurfaceY: 77 });
  assert.deepEqual(validateSurfaceOutlet(routes.grand, 84), { reachesSurface: true, openToSky: true });
  assert.deepEqual(validateSurfaceOutlet(routes.fracture, 77), { reachesSurface: true, openToSky: true });
});
```

- [ ] **Step 2: Write failing unavoidable-hazard geometry tests**

```js
// src/systems/world/resonantVaultHazards.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { validateHazardCourse } from './resonantVaultHazards.ts';

test('the Fracture Stair has no walkable perimeter bypass', () => {
  const result = validateHazardCourse('fixture:fracture_stair');
  assert.equal(result.safeBypassPaths, 0);
  assert.ok(result.legalTimedPaths >= 1);
});

test('spikes occupy three-dimensional swept collision volume', () => {
  const result = validateHazardCourse('fixture:spike_lane');
  assert.ok(result.spikeTriangles >= 16);
  assert.ok(result.spikeCollisionHeight > 0.65);
  assert.equal(result.spikesAreCubes, false);
});
```

- [ ] **Step 3: Run and observe current identical underground outlets fail**

Run: `node --test src/systems/world/resonantVaultEscapes.test.mjs src/systems/world/resonantVaultHazards.test.mjs`

Expected: FAIL because the current outlets are mirrored, underground, and lack unavoidable hazards.

- [ ] **Step 4: Author the Grand Ascent**

Build a 6-block-wide ceremonial stair with alternating straight runs and switchback landings. It is at least 1.55 times the Fracture Stair route length, has two gated mixed-enemy waves, permanent warm route lighting, defensible cover, and one clearly visible supply cache at the midpoint. Hazards are limited to broad delayed crushers so this route trades time and combat for reliable traversal.

- [ ] **Step 5: Author the Fracture Stair**

Build a narrower broken stair with at least five mandatory hazard beats: two real spike lanes, one crusher timing gate, one gap sequence, and one collapsing landing. Rails, collapsed walls, and pits close all perimeter walkarounds. Every timed obstacle has a visible pre-motion, positional mechanical sound, and a recoverable checkpoint behind the previous completed beat.

- [ ] **Step 6: Build real three-dimensional hazards**

Render each spike bank as 4-sided tapered prisms with matching swept collision, not a textured cube or crossed 2D plane. Crushers have separate frame and moving head geometry. Collapsing landings shake, drop their top collision only after the telegraph, and restore after the player falls or respawns at the route checkpoint.

- [ ] **Step 7: Extend both final staircases to sampled terrain surfaces**

Sample stable surface height at each outlet column before painting. Continue a roofed staircase until the final landing floor is `surfaceY + 1`, clear headroom to `surfaceY + 5`, and add drainage/retaining walls where terrain is higher on adjacent columns. Register the outlet volume as protected so later terrain, cave, fluid, and ore passes cannot reseal it.

- [ ] **Step 8: Validate flood fill, hazards, and terrain protection across seeds**

Run: `node --test src/systems/world/resonantVaultEscapes.test.mjs src/systems/world/resonantVaultHazards.test.mjs src/systems/world/resonantVaultGeometry.test.mjs src/systems/world/resonantVaultConnectivity.test.mjs`

Expected: PASS across at least 128 deterministic seeds for surface reachability, route distinction, zero perimeter bypasses, legal hazard timing paths, route checkpoints, and protected outlet clearance.

- [ ] **Step 9: Commit**

```powershell
git add src/systems/world/resonantVaultEscapes.ts src/systems/world/resonantVaultEscapes.test.mjs src/systems/world/resonantVaultHazards.ts src/systems/world/resonantVaultHazards.test.mjs src/systems/world/resonantVaultGeneration.ts src/systems/world/resonantVaultConnectivity.ts src/systems/world/resonantVaultArchitecture.ts src/systems/world/resonantVaults.ts src/systems/world/workers/world.worker.ts src/components/ResonantVaultHazardRenderer.tsx src/components/ResonantEffectsRenderer.tsx
git commit -m "feat: build meaningful surface escape routes"
```

### Task 16: Make escape choice, escalation, recovery, and surface completion authoritative

**Files:**
- Create: `src/systems/world/resonantVaultEscapeRuntime.ts`
- Create: `src/systems/world/resonantVaultEscapeRuntime.test.mjs`
- Modify: `src/systems/world/ResonantVaultRuntime.ts`
- Modify: `src/systems/world/resonantVaultEscapeRules.ts`
- Modify: `src/systems/events/GameEvents.ts`
- Modify: `src/systems/progression/ProgressionStore.ts`
- Modify: `src/components/ResonantVaultController.tsx`
- Modify: `src/components/ui/ResonantObjectiveHUD.tsx`

**Interfaces:**
- Produces: pure `advanceVaultEscape(state, input): VaultEscapeTransition`.
- Produces: `getEscapeHazardTier(remainingSeconds): 0 | 1 | 2 | 3`.
- Changes: escape starts at 420 seconds and completes only inside a route's surface completion volume.
- Changes: `vault:escape-completed.exit` accepts only the current `VaultEscapeRoute` values.

- [ ] **Step 1: Write failing timer, route lock, and surface-completion tests**

```js
// src/systems/world/resonantVaultEscapeRuntime.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { createVaultEscapeState, advanceVaultEscape } from './resonantVaultEscapeRuntime.ts';

test('choosing one route locks the other only after crossing its threshold', () => {
  let state = createVaultEscapeState();
  state = advanceVaultEscape(state, { type: 'core_claimed' }).state;
  assert.equal(state.chosenRoute, null);
  state = advanceVaultEscape(state, { type: 'route_threshold', route: 'fracture' }).state;
  assert.equal(state.chosenRoute, 'fracture');
  assert.equal(state.closedRoute, 'grand');
});

test('zero time maximizes hazards but never permanently locks the chosen route', () => {
  let state = createVaultEscapeState({ remainingSeconds: 0.05, chosenRoute: 'grand' });
  state = advanceVaultEscape(state, { type: 'tick', dt: 1 }).state;
  assert.equal(state.remainingSeconds, 0);
  assert.equal(state.hazardTier, 3);
  assert.equal(state.routeOpen, true);
});

test('an underground outlet threshold cannot complete the escape', () => {
  let state = createVaultEscapeState({ chosenRoute: 'grand', remainingSeconds: 200 });
  state = advanceVaultEscape(state, { type: 'player_position', route: 'grand', y: 50, surfaceY: 72, insideCompletionVolume: false, connectedToOpenAir: false }).state;
  assert.equal(state.completed, false);
  state = advanceVaultEscape(state, { type: 'player_position', route: 'grand', y: 73, surfaceY: 72, insideCompletionVolume: true, connectedToOpenAir: true }).state;
  assert.equal(state.completed, true);
});
```

- [ ] **Step 2: Run and observe current 90-second underground completion fail**

Run: `node --test src/systems/world/resonantVaultEscapeRuntime.test.mjs`

Expected: FAIL because the authoritative escape module does not exist.

- [ ] **Step 3: Implement the 7-minute state machine and meaningful choice**

Claiming the core opens both route vestibules and starts `420` seconds. Display stable route symbols and short tradeoff labels at the fork: `GRAND ASCENT · LONG · GUARDED` and `FRACTURE STAIR · SHORT · HAZARDOUS`. Commit the choice only when the player crosses an authored threshold far enough inside to prevent accidental selection.

- [ ] **Step 4: Escalate hazards without creating a hard fail**

| Remaining | Tier | Change |
|---|---:|---|
| 420–181 s | 0 | Base route behavior |
| 180–91 s | 1 | Shorter crusher rest; first warning response |
| 90–31 s | 2 | Faster hazard reset; additional Grand Ascent reinforcements |
| 30–0 s | 3 | Maximum authored rates, red-orange practical warning lights, persistent urgency |

At zero, keep `remainingSeconds = 0`, tier 3, the chosen route open, checkpoints active, and all timing cycles solvable. Do not kill the player merely because the timer expired.

- [ ] **Step 5: Complete only at actual surface volumes**

The completion volume begins above the sampled surface landing and is tied to the selected route ID. Crossing an underground gate, reaching the final underground stair, switching to spectator, or unloading the vault does not complete it. On completion, stop vault hazards, save `escapeCompleted`, record the route in a new optional `escapeRoute?: VaultEscapeRoute` field, and restore ambient world music context.

- [ ] **Step 6: Add route checkpoints and reload recovery**

Persist the chosen route, remaining time, and latest completed authored checkpoint. On death or reload, resume from the last safe checkpoint only through the existing respawn/load flow; do not teleport a live player. Old saves without fields derive safe defaults from `escapeStarted` and `escapeCompleted`.

- [ ] **Step 7: Update concise HUD states**

Use one objective line and one secondary timer/route line only during escape. Do not use descriptive paragraphs. Examples: `Reach the surface` and `3:18 · Grand Ascent`. At zero: `Reach the surface · hazards at maximum`.

- [ ] **Step 8: Run runtime, progression, route, and objective tests**

Run: `node --test src/systems/world/resonantVaultEscapeRuntime.test.mjs src/systems/world/resonantVaultEscapes.test.mjs src/systems/world/resonantVaultHazards.test.mjs src/systems/progression/resonantVaultProgress.test.mjs src/systems/world/resonantVaultObjectives.test.mjs`

Expected: PASS for threshold selection, seven-minute countdown, non-locking tier 3, save/reload, route checkpoints, real-surface completion, and concise HUD text.

- [ ] **Step 9: Commit**

```powershell
git add src/systems/world/resonantVaultEscapeRuntime.ts src/systems/world/resonantVaultEscapeRuntime.test.mjs src/systems/world/ResonantVaultRuntime.ts src/systems/world/resonantVaultEscapeRules.ts src/systems/events/GameEvents.ts src/systems/progression/ProgressionStore.ts src/components/ResonantVaultController.tsx src/components/ui/ResonantObjectiveHUD.tsx
git commit -m "feat: make vault escape choice and completion authoritative"
```

### Task 17: Replace confusing exposition with environmental guidance and compact Atlas-native UI

**Files:**
- Modify: `src/systems/world/resonantVaultObjectives.ts`
- Modify: `src/systems/world/resonantVaultObjectives.test.mjs`
- Modify: `src/systems/world/ResonantVaultRuntime.ts`
- Modify: `src/components/ui/ResonantObjectiveHUD.tsx`
- Create: `src/components/ui/resonantObjectiveHud.test.mjs`
- Modify: `src/components/ResonantVaultController.tsx`
- Modify: `src/data/resonantGuide.ts`
- Modify: `src/data/resonantDefinitions.ts`
- Modify: `src/data/resonantRecipes.ts`
- Modify: `src/systems/world/resonantVaultGuidance.test.mjs`
- Modify: `src/systems/world/resonantVaultArchitecture.ts`
- Modify: `src/systems/world/resonantVaultPuzzles.ts`

**Interfaces:**
- Produces: `VaultObjectiveState` with one imperative objective, optional compact progress, and optional route/timer status.
- Produces: environmental cue descriptors for path light, route symbol, receptive device, hazard, cache, and completion response.
- Changes: removes player-facing lore paragraphs and system-like jargon from active vault progression.

- [ ] **Step 1: Write failing objective-density and language tests**

```js
// src/components/ui/resonantObjectiveHud.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { formatVaultObjective } from '../../systems/world/resonantVaultObjectives.ts';

test('normal objectives are one short imperative line', () => {
  const view = formatVaultObjective({ phase: 'echo_repeat', progress: 2, total: 4 });
  assert.equal(view.primary, 'Repeat the echo');
  assert.equal(view.secondary, '2 / 4');
  assert.ok(view.primary.length <= 32);
});

test('objectives contain no internal system language', () => {
  const forbidden = /resonator|phase lattice|wing solved|custodian|mason|telemetry|synchronize|calibrate/i;
  for (const phase of ['enter', 'echo_listen', 'echo_repeat', 'combat', 'boss', 'choose_exit', 'escape']) {
    const view = formatVaultObjective({ phase, progress: 0, total: 0 });
    assert.doesNotMatch(`${view.primary} ${view.secondary ?? ''}`, forbidden);
  }
});
```

- [ ] **Step 2: Run and observe current descriptive copy fail**

Run: `node --test src/components/ui/resonantObjectiveHud.test.mjs src/systems/world/resonantVaultObjectives.test.mjs src/systems/world/resonantVaultGuidance.test.mjs`

Expected: FAIL until the objective formatter and copy are simplified.

- [ ] **Step 3: Define the complete objective vocabulary**

Use only these active primary lines:

- `Descend into the vault`
- `Search the hall`
- `Listen`
- `Repeat the echo`
- `Cross the chamber`
- `Restore the mechanism`
- `Defeat the guardians`
- `Enter the bell chamber`
- `Strike the exposed bell`
- `Claim the hammer`
- `Choose an ascent`
- `Reach the surface`

Secondary text is limited to numeric puzzle progress, enemy count, boss health already in the established boss bar, or route/timer status. Remove toast paragraphs and guide prose that restate the objective.

- [ ] **Step 4: Teach actions through placed evidence**

| Player question | Environmental answer |
|---|---|
| Where do I go? | Warm lamps, floor inlay, and open sightline continue toward the active doorway |
| What plays the pattern? | Pylon cap lights and positional notes demonstrate in order |
| What can I press? | Receptive machinery has the same brass fork mark used on the Tuning Fork chest |
| How do I use a weapon? | Weapon cache faces a matching enemy lane or armored target; no instruction card |
| Is this route dangerous? | Hazard is visible before commitment, with moving test cycle and warning sound |
| Did it work? | Device settles, light changes from cool to warm, gate physically opens, one response sound plays |

Do not add floating text labels inside the world. Symbols are block/pixel motifs integrated into the architecture.

- [ ] **Step 5: Restyle the HUD with existing Atlas tokens**

Reuse the current in-game panel background, border, font, shadow, spacing, and transition patterns. Keep the panel at the top center, at most two lines and `360px` wide, with no glow, scanlines, neon strokes, lore card, or bespoke sci-fi typography. Hide it when the environment alone is sufficient for more than four seconds, and restore it on state change or objective-key input.

- [x] **Step 6: Remove prototype gadgets and boss copy from all Vault catalogs**

Remove the retired item registrations, conversion paths, recipes, textures, HUD behavior, and event aliases entirely. Leave their numeric holes unregistered. Replace Custodian/Mason names with Bell Titan, and remove long descriptive text whose only purpose was explaining a mechanic now shown environmentally.

- [ ] **Step 7: Run copy, UI, guidance, and recipe tests**

Run: `node --test src/components/ui/resonantObjectiveHud.test.mjs src/systems/world/resonantVaultObjectives.test.mjs src/systems/world/resonantVaultGuidance.test.mjs src/data/resonantContent.test.mjs src/systems/registry/resonantCatalogs.test.mjs`

Run: `rg -n "phase lattice|wing solved|custodian|Vault Mason|pulse bracer|portable resonator|synchronize|calibrate" src`

Expected: tests PASS. Runtime and active catalog searches contain no prototype item, room, route, or boss identifiers.

- [ ] **Step 8: Commit**

```powershell
git add src/systems/world/resonantVaultObjectives.ts src/systems/world/resonantVaultObjectives.test.mjs src/systems/world/ResonantVaultRuntime.ts src/components/ui/ResonantObjectiveHUD.tsx src/components/ui/resonantObjectiveHud.test.mjs src/components/ResonantVaultController.tsx src/data/resonantGuide.ts src/data/resonantDefinitions.ts src/data/resonantRecipes.ts src/systems/world/resonantVaultGuidance.test.mjs src/systems/world/resonantVaultArchitecture.ts src/systems/world/resonantVaultPuzzles.ts
git commit -m "feat: teach the vault through play and place"
```

### Task 18: Make vault music priority, interruption, looping, and sound tails production-safe

**Files:**
- Create: `src/systems/sound/musicLoops.ts`
- Create: `src/systems/sound/musicLoops.test.mjs`
- Create: `src/systems/sound/resonantMusicTransitions.test.mjs`
- Modify: `src/systems/sound/MusicController.ts`
- Modify: `src/systems/sound/SoundManager.ts`
- Modify: `src/systems/sound/ResonantVaultAudio.ts`
- Modify: `src/systems/sound/musicStability.test.mjs`
- Modify: `src/systems/sound/resonantVaultAudio.test.mjs`
- Modify: `public/assets/rvx/sounds/music-index.json`
- Create: `public/assets/rvx/sounds/music-loops.json`
- Create: `public/assets/rvx/sounds/resonant_vault/audio-provenance.json`
- Create: `public/assets/rvx/sounds/music/boss_bell_titan/bell_titan.ogg`
- Delete: `public/assets/rvx/sounds/music/boss_resonant_custodian/custodian_of_the_chord.ogg`

**Interfaces:**
- Produces: `MusicLoopDefinition` with sample-rate, start sample, end sample, and crossfade samples.
- Produces: interruptible music requests with explicit priority and resume context.
- Produces: independent one-shot voices whose natural release is not owned by music context.
- Changes: Bell Titan awakening starts the boss cue immediately and reliably.

- [ ] **Step 1: Write failing priority, resume, and loop-scheduling tests**

```js
// src/systems/sound/resonantMusicTransitions.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { createMusicState, reduceMusicRequest } from './MusicController.ts';

test('Bell Titan music interrupts vault ambience without a silent stop state', () => {
  let state = createMusicState({ context: 'VAULT', track: 'echoes_below' });
  state = reduceMusicRequest(state, { context: 'BOSS_RESONANT', reason: 'vault:titan-awakened' });
  assert.equal(state.context, 'BOSS_RESONANT');
  assert.equal(state.outgoingTrack, 'echoes_below');
  assert.equal(state.silenceGapMs, 0);
});

test('leaving the vault mid-song restores the live world context', () => {
  let state = createMusicState({ context: 'VAULT_ESCAPE', track: 'the_vault_unravels' });
  state = reduceMusicRequest(state, { context: 'CAVE', reason: 'vault:left' });
  assert.equal(state.context, 'CAVE');
  assert.equal(state.resumePreviousVaultTrack, false);
});
```

```js
// src/systems/sound/musicLoops.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { readMusicLoopManifest, scheduleLoopDecks } from './musicLoops.ts';

test('all four vault cues have sample-accurate overlapping loop schedules', () => {
  const manifest = readMusicLoopManifest();
  for (const id of ['echoes_below', 'three_wings', 'bell_titan', 'the_vault_unravels']) {
    const loop = manifest[id];
    assert.equal(loop.sampleRate, 48000);
    assert.ok(loop.endSample > loop.startSample);
    assert.ok(loop.crossfadeSamples >= 48000);
    const schedule = scheduleLoopDecks(loop, 0);
    assert.equal(schedule.nextStartSample, loop.endSample - loop.crossfadeSamples);
  }
});
```

- [ ] **Step 2: Run and observe current stop-first transitions fail**

Run: `node --test src/systems/sound/resonantMusicTransitions.test.mjs src/systems/sound/musicLoops.test.mjs src/systems/sound/musicStability.test.mjs`

Expected: FAIL because current transitions stop before requesting the next context and no loop manifest exists.

- [ ] **Step 3: Implement explicit context priority and direct transitions**

Use priority `DEATH/CINEMATIC > BOSS_RESONANT > VAULT_ESCAPE > VAULT_COMBAT > VAULT > live cave/biome`. A higher-priority request starts a `450ms` equal-power crossfade immediately; it never calls a stop-to-silence method first. When a vault context ends, query the current player depth/biome context and select that music normally rather than resuming a stale vault deck.

- [ ] **Step 4: Trigger boss music from the new authoritative event**

Subscribe to `vault:titan-awakened`, request `BOSS_RESONANT` in the same event turn, and assert the selected cue is the Bell Titan mapping. Do not subscribe to `vault:custodian-spawned`, Mason events, entity proximity, boss-bar visibility, or a delayed room tick.

- [ ] **Step 5: Add sample-based dual-deck loops without changing source masters**

Move the current boss composition to the Bell Titan asset path without decoding or re-encoding it. For the current 48 kHz stereo files, start with these decoded whole-file bounds and a 96,000-sample equal-power overlap:

| Cue | Start | End | Crossfade |
|---|---:|---:|---:|
| `echoes_below` | 0 | 3,580,235 | 96,000 |
| `three_wings` | 0 | 2,850,461 | 96,000 |
| `bell_titan` using the current boss composition | 0 | 2,984,727 | 96,000 |
| `the_vault_unravels` | 0 | 2,010,947 | 96,000 |

Decode once, schedule the next deck from sample time, and overlap with equal-power gain curves. Music master contents remain byte-for-byte unchanged while FL Studio is on hold; the existing boss composition is only renamed/reclassified for the Bell Titan. After implementation, inspect waveform continuity and adjust manifest loop points only at zero crossings if the full-file overlap is audible. An audible seam fails the task.

- [ ] **Step 6: Separate music ownership from one-shot lifetime**

Music context changes may fade/stop music decks only. Vault one-shots, footsteps, bell tails, chain tails, impacts, and reverb sends retain independent voices until their decoded buffer finishes. Re-triggering the same event creates a bounded overlapping voice instead of stopping the previous one; cap each event family at four voices by retiring the quietest completed-release voice.

- [ ] **Step 7: Enforce fail-silent vault audio and provenance**

Every vault sound event sets `fallback: false`. Inventory every active Resonant Vault cue, not only the new enemy and boss files, and replace any synthesized or untraceable active cue with a recorded, foley, or license-compatible recorded source before it can remain registered. Add a manifest entry for each active asset with `sourceKind: 'recorded' | 'foley' | 'licensed_music'`, license/source note, edit chain note, and final duration. Tests reject `sourceKind: 'synthesized'`, missing files, zero-byte files, decode failure, abrupt non-zero terminal samples for one-shots, and unregistered paths. Development logs a missing vault asset once; production remains silent.

- [ ] **Step 8: Run audio state, registry, decode, and tail tests**

Run: `node --test src/systems/sound/resonantMusicTransitions.test.mjs src/systems/sound/musicLoops.test.mjs src/systems/sound/musicStability.test.mjs src/systems/sound/resonantVaultAudio.test.mjs src/systems/sound/soundReload.test.mjs`

Expected: PASS for immediate boss start, no stop gap, correct world-context restoration, sample schedule continuity, natural one-shot tails, fail-silent behavior, and asset provenance.

- [ ] **Step 9: Commit**

```powershell
git add src/systems/sound/musicLoops.ts src/systems/sound/musicLoops.test.mjs src/systems/sound/resonantMusicTransitions.test.mjs src/systems/sound/MusicController.ts src/systems/sound/SoundManager.ts src/systems/sound/ResonantVaultAudio.ts src/systems/sound/musicStability.test.mjs src/systems/sound/resonantVaultAudio.test.mjs public/assets/rvx/sounds/music-index.json public/assets/rvx/sounds/music-loops.json public/assets/rvx/sounds/resonant_vault/audio-provenance.json public/assets/rvx/sounds/music/boss_bell_titan/bell_titan.ogg
git rm public/assets/rvx/sounds/music/boss_resonant_custodian/custodian_of_the_chord.ogg
git commit -m "fix: make Resonant Vault audio transitions continuous"
```

### Task 19: Integrate the rebuilt experience without broad App or WorldManager refactors

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/systems/WorldManager.ts`
- Modify: `src/components/ResonantVaultController.tsx`
- Modify: `src/systems/world/ResonantVaultRuntime.ts`
- Modify: `src/systems/events/GameEvents.ts`
- Create: `src/systems/world/resonantVaultExperience.test.mjs`
- Create: `src/systems/world/resonantVaultTestHarness.ts`
- Modify: `src/systems/world/resonantVaults.test.mjs`
- Modify: `src/systems/world/resonantVaultGeometry.test.mjs`
- Modify: `src/systems/progression/resonantVaultProgress.test.mjs`

**Interfaces:**
- Produces: one end-to-end test harness for discovery through surface completion.
- Changes: central files receive narrow adapter calls only; feature logic remains in the modules created above.
- Preserves: `/locate vault`, current numeric IDs, world streaming behavior, controls, inventory flow, and non-vault music/gameplay.

- [ ] **Step 1: Write a failing complete-journey test**

```js
// src/systems/world/resonantVaultExperience.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { simulateVaultJourney } from './resonantVaultTestHarness.ts';

test('a new vault supports a complete connected journey to the real surface', async () => {
  const journey = await simulateVaultJourney({ seed: 73014, route: 'fracture' });
  assert.equal(journey.locateCommandFoundVault, true);
  assert.equal(journey.allRequiredRoomsConnected, true);
  assert.ok(journey.meaningfulRooms >= 12 && journey.meaningfulRooms <= 16);
  assert.ok(journey.optionalAnnexes >= 2 && journey.optionalAnnexes <= 3);
  assert.deepEqual(journey.guaranteedWeapons, ['spear', 'crossbow', 'maul']);
  assert.equal(journey.unusualArtifacts, 1);
  assert.equal(journey.echoDemonstrationVisibleAndAudible, true);
  assert.equal(journey.bellTitanDefeated, true);
  assert.equal(journey.escapeFinishedAboveSurface, true);
  assert.ok(journey.estimatedFirstClearMinutes >= 45 && journey.estimatedFirstClearMinutes <= 70);
});
```

- [x] **Step 2: Write current-schema progression and gate-order tests**

```js
// src/systems/world/resonantVaultProgression.test.mjs
test('the inner seal requires only rooms reachable before it', () => {
  assert.deepEqual(getVaultPreSealRequiredRoomIds(layout), ['major_0', 'major_1', 'major_2', 'major_3']);
});
```

- [ ] **Step 3: Run and observe incomplete integration fail**

Run: `node --test src/systems/world/resonantVaultExperience.test.mjs src/systems/world/resonantVaultProgression.test.mjs src/systems/progression/resonantVaultProgress.test.mjs`

Expected: FAIL until every new subsystem is connected.

- [ ] **Step 4: Add narrow central adapters**

In `WorldManager`, add only the vault cache seeding callback, protected-footprint query, and navigation block-revision callback. In `App`, keep the existing controller mount and pass only required established state/callbacks. Do not move vault state into `App`, rewrite chunk streaming, or refactor unrelated manager responsibilities.

- [ ] **Step 5: Unify runtime lifecycle and cleanup**

On world load/unload, reset transient room encounters, projectile state, hazard cycles, Titan state, echo playback, audio subscriptions, and navigation caches exactly once. Restore persisted vault progression after layout resolution. Ensure Strict Mode or controller remount cannot duplicate listeners, timers, enemies, boss spawns, or music requests.

- [x] **Step 6: Prove new-generation and current-schema boundaries**

Newly generated vaults receive the full graph, rooms, loot, Titan, and escapes. Already-generated vault blocks are not silently rewritten. Current numeric block/item IDs do not move. Vault progress reads and writes one current schema; unknown prototype fields are discarded without conversion.

- [ ] **Step 7: Run the entire Resonant Vault test suite**

Run:

```powershell
$tests = @(rg --files src | rg '(resonant|Resonant|vault|Vault|bellTitan|BellTitan|musicLoops|musicStability|entityNavigation|VoxelNavigator|entityLocomotion).*\.test\.mjs$')
node --test $tests
```

Expected: PASS with no skipped tests.

- [ ] **Step 8: Run repository validation**

Run: `npm run typecheck`

Expected: exit 0 with no TypeScript errors.

Run: `npm run lint`

Expected: exit 0 with no ESLint errors.

Run: `npm run build`

Expected: Vite production build completes successfully.

- [ ] **Step 9: Run focused browser and Electron smoke scenarios**

Start: `npm run dev`

Exercise fixed-seed debug scenarios for:

1. `/locate vault`, exterior landmark, torch placement at the blocked seal, and entrance stairs.
2. Every room threshold/door pair, stair/slab collision, and wall/ceiling seam.
3. Echo demonstration visibility, positional sequence audio, replay, wrong input, and success response.
4. Parkour and Fracture Stair perimeter bypass attempts.
5. Every weapon from its cache, bolt/world occlusion, artifact machinery, and room enemy navigation.
6. Bell Titan awakening light, model/texture, every telegraph, damage window, phase break, music start, and defeat.
7. Both escape choices, route lock, hazard tiers, zero-timer solvability, checkpoint recovery, and surface completion.
8. Mid-song transitions from overworld/cave to vault/combat/boss/escape and back; listen across at least two full loop boundaries per cue.

Capture screenshots at exterior, entry stair, one example of every room type, echo puzzle, each combat room, lit Titan arena in each phase, both escape routes, and both surface exits. Compare at minimum and maximum brightness settings and at the two supported viewport aspect extremes. Time one normal fixed-seed first-clear route without debug skipping; it must fall within 45 to 70 minutes and must not derive that duration from repeated idle waits or excessive wave reuse. Then run `npm run electron:dev` and repeat discovery, boss-start audio, one escape, world save/reload, and return to overworld music in the packaged runtime path.

Expected: no inaccessible doorway, sealed passage, black room, untextured/primitive entity, cut-off sound tail, audible loop seam, neon UI, floating exposition, route bypass, stuck mob, duplicate encounter, or underground completion.

- [ ] **Step 10: Build the Windows package**

Run: `npm run electron:build`

Expected: NSIS build completes and the packaged application launches to the main menu.

- [x] **Step 11: Commit the integration and current-schema coverage**

```powershell
git add src/App.tsx src/systems/WorldManager.ts src/components/ResonantVaultController.tsx src/systems/world/ResonantVaultRuntime.ts src/systems/events/GameEvents.ts src/systems/world/resonantVaultExperience.test.mjs src/systems/world/resonantVaultProgression.test.mjs src/systems/world/resonantVaultTestHarness.ts src/systems/world/resonantVaults.test.mjs src/systems/world/resonantVaultGeometry.test.mjs src/systems/progression/resonantVaultProgress.test.mjs
git commit -m "test: verify the definitive Resonant Vault journey"
```

### Task 20: Perform final no-regression audit and publish every implementation commit to PR #4

**Files:**
- Modify only if needed by audit: files already listed in Tasks 1–19
- Modify: `docs/superpowers/specs/2026-07-14-resonant-vault-definitive-overhaul-design.md`
- Modify: `docs/superpowers/plans/2026-07-14-resonant-vault-definitive-overhaul.md`

- [x] **Step 1: Audit the approved no-regression matrix**

Check every row in the definitive design's no-regression matrix against code, automated evidence, and smoke evidence. Record the exact test, screenshot, or runtime scenario that proves each row. A row without evidence is unfinished work, not an accepted exception.

- [x] **Step 2: Scan for forbidden remnants and incomplete work**

Run:

```powershell
$vaultRuntimeFiles = @(rg --files src public/assets/rvx | rg '(resonant|Resonant|vault|Vault|bell_titan|BellTitan)' | rg -v '\.test\.mjs$')
rg -n "TODO|FIXME|TBD|temporary|implement later|placeholder|vibe|neon|Vault Mason|vault_mason|custodian_spawn|synthesi[sz]ed" $vaultRuntimeFiles
```

Expected: no incomplete work, active Mason runtime/presentation, prototype compatibility layer, neon UI treatment, or synthesized vault fallback.

- [x] **Step 3: Confirm file and ID integrity**

Run `git diff origin/codex/daily-2026-07-13-resonant-vaults...HEAD -- src/types.ts src/data/resonantDefinitions.ts src/data/resonantRecipes.ts src/systems/progression/ProgressionStore.ts` and verify current IDs are exact, retired prototype holes stay unregistered, 188–189 remain unused, and Vault persistence contains only current fields.

- [x] **Step 4: Repeat fresh validation after the last fix**

Run the complete Task 19 test command, `npm run typecheck`, `npm run lint`, `npm run build`, and `npm run electron:build` again after all audit fixes. Do not rely on an earlier green run.

- [x] **Step 5: Review the final diff and commit audit corrections**

Run: `git diff --check`

Run: `git status --short`

Run: `git diff --stat origin/codex/daily-2026-07-13-resonant-vaults...HEAD`

If the audit changed code or documentation:

```powershell
git add -A
git add -f docs/superpowers/specs/2026-07-14-resonant-vault-definitive-overhaul-design.md docs/superpowers/plans/2026-07-14-resonant-vault-definitive-overhaul.md
git commit -m "fix: close Resonant Vault production audit"
```

- [x] **Step 6: Push and verify PR #4 branch parity**

```powershell
git push origin codex/daily-2026-07-13-resonant-vaults
git fetch origin codex/daily-2026-07-13-resonant-vaults
git rev-parse HEAD
git rev-parse origin/codex/daily-2026-07-13-resonant-vaults
git status --short
```

Expected: local and remote hashes match; worktree is clean; every implementation commit is present on PR #4.

## Requirement coverage index

| Approved requirement | Implementation and proof |
|---|---|
| Rooms physically connect; no walls between intended spaces | Tasks 2–3 graph sockets, final doorway reassertion, actual-voxel flood fill, protected footprint |
| Ground-up visual overhaul of every room | Task 4 exhaustive room painters, structural variants, slabs/stairs, lighting and screenshot review |
| Better initial staircase | Task 4 three-wide switchback entrance, landings, parapets, lamps, bidirectional traversal test |
| 45–70 minute, 12–16 meaningful-room expedition | Tasks 2, 11, 19 deterministic room count, encounter pacing, automated estimate and timed normal clear |
| Two or three deterministic-random annexes | Task 2 seeded annex selection with one optional combat annex maximum |
| Echo sequence visibly/audibly demonstrates the pattern | Task 5 pylon-top markers, particles, positional events, two-pass first demonstration, replay, LISTEN/REPEAT HUD |
| More cohesive echo mechanics without boss artifact dependence | Tasks 5–6 one pulse/preview/answer rule; Task 13 physical bell resonance/double toll, never Tuning Fork damage |
| Parkour cannot be walked around | Tasks 6 and 15 ordered checkpoints, perimeter removal, hazard-course bypass search |
| Real weapons and only one unusual artifact | Tasks 1, 7–8 spear, physical crossbow/bolts, maul, Titan Hammer, sole Echo Tuning Fork |
| Items come from chests and teach through play | Task 7 existing chest UI, guaranteed placement before need, sightline targets, no tutorial card |
| Several enemy rooms with distinct enemies | Tasks 2, 11–12 three guaranteed combat encounters, optional Bell Crypt, four-role textured/animated roster |
| General smarter mob pathfinding and movement | Tasks 9–10 bounded incremental voxel paths, stairs/slabs, jump/drop, line-of-sight positioning, profiles, recovery |
| Bell Titan fully replaces the Mason/Warden-like fight | Tasks 13–14 new state machine, silhouette, model, texture, complete animation set, lighting, sounds, legacy cleanup |
| Brighter structure; torches usable while sealed | Task 4 light-spacing/readability tests and safe sealed-vault torch policy through normal lighting/remesh/persistence |
| Two different dangerous escapes with tradeoffs | Tasks 15–16 Grand Ascent combat/time tradeoff and Fracture Stair 3D traversal hazards |
| Both exits reach the actual surface and timer includes ascent | Tasks 15–16 sampled terrain stair continuation, open-sky predicate, seven-minute state, surface-only completion |
| Zero timer never permanently traps the player | Task 16 tier-3 maximum hazards with chosen route and checkpoints remaining solvable |
| Compact official Atlas-native UI; no neon UI or exposition | Task 17 existing UI tokens, two-line maximum, imperative copy, environmental cues, forbidden-copy scan |
| Boss music starts; all vault music interrupts/resumes and loops cleanly | Task 18 authoritative Titan event, priority reducer, zero-gap context switch, sample dual-deck loop schedule |
| One-shot tails do not cut and vault audio never synthesizes fallback | Tasks 12, 14, 18 independent voices, fail-silent calls, full active-cue provenance/decode/tail audit |
| FL Studio and VST work stays on hold | Global constraints and deferred gate; source masters remain unrendered until separate approval |
| Current IDs and Vault schema are authoritative; persisted terrain is not overwritten | Tasks 1, 3, 6, 16, 19 exact current IDs, unregistered prototype holes, current-only progress, and atomic candidate preflight |
| `/locate vault` remains available | Tasks 3 and 19 deterministic conflict skip plus end-to-end locator assertion |
| Everything lands on PR #4 | Task 20 push, fetch, hash parity, clean-worktree verification |

## Deferred FL Studio mastering gate

FL Studio, installed VSTs, and plugin-based music/SFX mastering remain explicitly out of scope until the user lifts the hold. Tasks 12, 14, and 18 may wire, validate, and use recorded/licensed assets without opening FL Studio, and Task 18 may make the existing compositions loop/interruption-safe without altering their masters. Do not claim the optional remaster complete, open FL Studio, render replacement masters, or overwrite the four music files before new approval.

When the hold is lifted, create a separate reviewed audio-production plan covering project backup, plugin availability, loudness/true-peak targets, loop renders, stems, A/B review, provenance, and in-game revalidation. That later pass must preserve the musical identity of the existing compositions unless the user approves a rewrite.

## Plan completion criteria

This implementation is complete only when all Tasks 1–20 are checked, the definitive design no-regression matrix has evidence, validation is freshly green, both surface exits and all music contexts are verified in the actual runtime, and PR #4 contains the matching commits. The deferred FL mastering gate does not block the code/experience overhaul, but no remaster claim may be made while it remains closed.
