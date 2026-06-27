# PR 19 Gameplay And Asset Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct PR #19's inventory, equipment, combat, region, boss HUD, naming, and texture regressions while preserving existing saves except for the explicitly unmigrated boss identifier.

**Architecture:** Add focused pure helpers for item policy, combat targeting, equipment lifecycle, and boss HUD state so behavior is testable outside React. Keep orchestration in existing components, pass complete `ItemStack` objects through drops, and register dedicated texture slots through the existing atlas pipeline.

**Tech Stack:** TypeScript, React, Three.js, react-three-fiber, Node test runner, Canvas texture atlas, PNG assets.

---

### Task 1: Item Stack Policy And Instance Preservation

**Files:**
- Create: `src/systems/inventory/itemStackPolicy.ts`
- Create: `src/systems/inventory/itemStackPolicy.test.mjs`
- Modify: `src/types.ts`
- Modify: `src/hooks/useInventoryController.ts`
- Modify: `src/App.tsx`
- Modify: `src/components/DropManager.tsx`
- Modify: `src/systems/WorldManager.ts`

- [ ] **Step 1: Write failing tests**

Test that durable tools and equippable armor return a stack limit of one, ordinary blocks return 64, item instances must match to stack, and cloning/transfers preserve `instance`.

- [ ] **Step 2: Run tests and verify failure**

Run:

```powershell
node --no-warnings --test --experimental-strip-types src/systems/inventory/itemStackPolicy.test.mjs
```

Expected: FAIL because `itemStackPolicy.ts` does not exist.

- [ ] **Step 3: Implement item policy**

Export:

```ts
getItemStackLimit(type: BlockType): number
canStacksMerge(a: ItemStack, b: ItemStack): boolean
cloneItemStack(stack: ItemStack, count?: number): ItemStack
```

Durable and equippable items return `1`; merge compatibility includes deep instance equality.

- [ ] **Step 4: Route inventory and drops through complete stacks**

Change drops to store `stack: ItemStack`. Preserve compatibility for existing type/count consumers through helper accessors where needed. Update pickup, Q-drop, death drops, cursor returns, world drops, and container transfers to preserve instance data and stack limits.

- [ ] **Step 5: Run targeted tests**

Run the Task 1 test command and expect PASS.

### Task 2: Equipment Lifecycle And Creative Inventory

**Files:**
- Create: `src/systems/registry/equipmentLifecycle.test.mjs`
- Modify: `src/systems/registry/equipment.ts`
- Modify: `src/App.tsx`
- Modify: `src/components/ui/InventoryUI.tsx`
- Modify: `src/hooks/useInventoryController.ts`

- [ ] **Step 1: Write failing tests**

Test that extracting equipment returns complete stacks and an empty equipment map, and that armor item types are classified as equippable singleton items.

- [ ] **Step 2: Run tests and verify failure**

```powershell
node --no-warnings --test --experimental-strip-types src/systems/registry/equipmentLifecycle.test.mjs
```

Expected: FAIL because lifecycle helpers are missing.

- [ ] **Step 3: Implement lifecycle helpers**

Add:

```ts
extractEquipmentItems(equipment: Equipment): { items: ItemStack[]; equipment: Equipment }
```

- [ ] **Step 4: Fix world and death transitions**

Reset equipment in the new-world branch. Include equipped items in death drops, then clear equipment. Preserve equipment on normal save/load.

- [ ] **Step 5: Expand Creative inventory**

Render equipment slots for `inventory` and `creative`. Add magnets and all armor to `ITEM_SORT_ORDER` in the Tools section. Creative picking produces one item for singleton types and 64 for ordinary items.

- [ ] **Step 6: Run targeted tests**

Run the Task 2 test command and expect PASS.

### Task 3: Region-Safe Beds

**Files:**
- Create: `src/systems/world/regionEditPolicy.ts`
- Create: `src/systems/world/regionEditPolicy.test.mjs`
- Modify: `src/components/controllers/InteractionController.tsx`

- [ ] **Step 1: Write failing tests**

Test that a multi-block edit is allowed only when every position is editable.

- [ ] **Step 2: Run tests and verify failure**

```powershell
node --no-warnings --test --experimental-strip-types src/systems/world/regionEditPolicy.test.mjs
```

- [ ] **Step 3: Implement and integrate**

Add a pure `canEditAllPositions` helper. Check both bed positions before placement and before removing either half. Emit one denied event for the first blocked position.

- [ ] **Step 4: Run targeted tests**

Expect PASS.

### Task 4: Entity Aggro, Knockback, And Game Modes

**Files:**
- Create: `src/systems/entities/entityBehavior.ts`
- Create: `src/systems/entities/entityBehavior.test.mjs`
- Modify: `src/systems/entities/Entity.ts`
- Modify: `src/systems/entities/EntityManager.ts`
- Modify: `src/components/GameLoop.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/Player.tsx`

- [ ] **Step 1: Write failing tests**

Test Survival-only targeting, Creative/Spectator aggro clearing, forget-radius behavior, and knockback steering lock.

- [ ] **Step 2: Run tests and verify failure**

```powershell
node --no-warnings --test --experimental-strip-types src/systems/entities/entityBehavior.test.mjs
```

- [ ] **Step 3: Implement behavior helpers**

Add pure helpers for targeting eligibility and aggro transitions. Add `knockbackTicks` to entities.

- [ ] **Step 4: Integrate game mode and player knockback**

Pass `gameMode` into `entityManager.tick`. Clear aggro outside Survival. Apply player knockback through a new `PlayerHandle.applyImpulse` method. Do not overwrite entity horizontal velocity while knockback is active.

- [ ] **Step 5: Run targeted tests**

Expect PASS.

### Task 5: Melee Occlusion

**Files:**
- Create: `src/systems/entities/meleeTargeting.ts`
- Create: `src/systems/entities/meleeTargeting.test.mjs`
- Modify: `src/components/controllers/InteractionController.tsx`

- [ ] **Step 1: Write failing tests**

Test that an entity is hittable only when its ray distance is less than the nearest block distance.

- [ ] **Step 2: Run tests and verify failure**

```powershell
node --no-warnings --test --experimental-strip-types src/systems/entities/meleeTargeting.test.mjs
```

- [ ] **Step 3: Implement and integrate**

Add `isEntityHitUnoccluded(entityDistance, blockDistance)` and compare the entity raycast with `castFromCamera` before damage.

- [ ] **Step 4: Run targeted tests**

Expect PASS.

### Task 6: Boss HUD State And Cinder Naming

**Files:**
- Create: `src/components/ui/bossBarState.ts`
- Create: `src/components/ui/bossBarState.test.mjs`
- Modify: `src/components/ui/BossBar.tsx`
- Modify: `src/systems/entities/Entity.ts`
- Modify: `src/systems/entities/EntityManager.ts`
- Modify: `src/systems/world/regions.ts`
- Modify: `src/App.tsx`
- Modify: `src/data/commands.test.mjs`

- [ ] **Step 1: Write failing tests**

Test spawn/damage/defeat state reduction by `entityId` and assert `cinder_warden` is the only boss identifier.

- [ ] **Step 2: Run tests and verify failure**

```powershell
node --no-warnings --test --experimental-strip-types src/components/ui/bossBarState.test.mjs src/data/commands.test.mjs
```

- [ ] **Step 3: Implement boss reducer**

Use:

```ts
type BossBarAction =
  | { type: 'spawned'; entityId: number; bossId: string; name: string; hp: number; maxHp: number }
  | { type: 'damaged'; entityId: number; hp: number; maxHp: number }
  | { type: 'defeated'; entityId: number }
  | { type: 'cleared' };
```

Render `current / max` health text. Clear on world reset.

- [ ] **Step 4: Rename identifiers**

Use `cinder_warden`, `Cinder Warden`, and `Cinder Reach` consistently. Do not add legacy migration.

- [ ] **Step 5: Run targeted tests**

Expect PASS.

### Task 7: Original Texture Assets

**Files:**
- Create: `public/assets/textures/blocks/positive_magnet.png`
- Create: `public/assets/textures/blocks/negative_magnet.png`
- Create: `public/assets/textures/items/iron_helmet.png`
- Create: `public/assets/textures/items/iron_chestplate.png`
- Create: `public/assets/textures/items/iron_leggings.png`
- Create: `public/assets/textures/items/iron_boots.png`
- Create: `public/assets/textures/items/polarity_boots.png`
- Modify: `src/data/blocks.ts`
- Modify: `src/systems/textures/textureMapping.ts`
- Modify: `src/utils/textures.ts`
- Modify: `src/utils/atlasTileFamilies.ts`
- Create: `src/systems/textures/pr19TextureAssignments.test.mjs`

- [ ] **Step 1: Write failing assignment tests**

Assert all seven block types use unique slots and every slot has a mapped PNG path.

- [ ] **Step 2: Run tests and verify failure**

```powershell
node --no-warnings --test --experimental-strip-types src/systems/textures/pr19TextureAssignments.test.mjs
```

- [ ] **Step 3: Generate original source art**

Use the built-in image generation workflow for seven Atlas-style pixel-art concepts. Convert the selected concepts into crisp 16x16 PNGs, preserving transparency for armor items.

- [ ] **Step 4: Register slots and fallbacks**

Assign seven unused slots, add `TEXTURE_PATHS`, and draw deterministic procedural equivalents in the atlas generator.

- [ ] **Step 5: Inspect assets**

Verify each file is 16x16, magnets are opaque, armor has transparent corners, and no slot is reused.

- [ ] **Step 6: Run targeted tests**

Expect PASS.

### Task 8: Full Validation And PR Update

**Files:**
- Modify only if validation reveals defects.

- [ ] **Step 1: Run all targeted tests**

```powershell
node --no-warnings --test --experimental-strip-types src/**/*.test.mjs
```

- [ ] **Step 2: Run static checks**

```powershell
npm run typecheck
npm run lint
npm run build
```

- [ ] **Step 3: Browser smoke test**

Verify Creative and Survival equipment slots, singleton armor/tools, world reset, death equipment handling, boss damage updates, no Creative/Spectator aggro, bed restrictions, naming, and textures.

- [ ] **Step 4: Commit and push**

Use the repository's configured Git identity. Do not add assistant attribution or PR comments.
