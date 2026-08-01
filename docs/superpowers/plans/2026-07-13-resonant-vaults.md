# Resonant Vaults Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete deterministic Atlas expedition with surface discovery, resource preparation, a multi-wing buried vault, puzzle and combat systems, a miniboss, an escape sequence, persistent per-vault state, and a reusable Pulse Bracer reward.

**Architecture:** Preserve Atlas's current numeric `BlockType` compatibility while adding validated block/item classification catalogs. Deterministic pure modules define vault placement, room graph, glyph sequences, phase timing, and loot. Runtime systems integrate machinery, chamber state, enemies, boss behavior, reward acquisition, and escape state through existing world, entity, event, progression, texture, inventory, sound, particle, and HUD systems.

**Tech Stack:** TypeScript, React, React Three Fiber, Three.js, Atlas `WorldManager`, procedural atlas canvas, Node test runner, Vite, Vercel preview validation.

## Global Constraints

- Work only in private `Lreddell/atlas-lab` on `codex/daily-2026-07-13-resonant-vaults`.
- Preserve all existing numeric IDs and save meanings.
- Use block IDs `70-85` and inventory-only item IDs `170-177` exactly as defined by the approved design.
- Keep `BLOCKS` authoritative while adding validated `worldBlockCatalog`, `itemCatalog`, and `contentCatalog` access boundaries.
- Do not widen chunk storage or complete the repository-wide ID migration.
- Do not add a quest log, map marker, puzzle HUD, custom boss HUD, detached badge, or mismatched screen-space visual language.
- Reuse Atlas inventory, hotbar, boss bar, message, texture-atlas, sound, particle, lighting, camera, and input conventions.
- All generation, puzzle order, loot, and room variants must be deterministic from stable world/vault coordinates and seed.
- New saved data must be optional and additive with safe defaults for old worlds.
- The complete normal gameplay path must not depend on debug commands.
- Test-first development is required for each production layer.

---

### Task 1: Content IDs and compatibility catalogs

**Files:**
- Test: `src/systems/registry/resonantCatalogs.test.mjs`
- Modify: `src/types.ts`
- Create: `src/systems/registry/worldBlockCatalog.ts`
- Create: `src/systems/registry/itemCatalog.ts`
- Create: `src/systems/registry/contentCatalog.ts`

**Interfaces:**
- Produces `RESONANT_WORLD_BLOCK_IDS`, `RESONANT_ITEM_IDS`, `isWorldBlockId(id)`, `assertWorldBlockId(id)`, `isInventoryOnlyItemId(id)`, `getItemCatalogEntry(id)`, `getContentDefinition(id)`, and `assertContentCatalogIntegrity()`.

- [ ] Write failing tests asserting the exact 16 block IDs, exact 8 item IDs, no collisions, all values within `0..255`, inventory-only IDs rejected by world-block validation, and catalog files present.
- [ ] Run the focused test remotely and verify it fails because the IDs/catalogs are absent.
- [ ] Add enum values without moving any existing value.
- [ ] Implement catalog classification backed by existing `BLOCKS` compatibility definitions.
- [ ] Run focused tests and typecheck.
- [ ] Commit as `feat: reserve Resonant Vault content ids`.

### Task 2: Block/item definitions, recipes, and Atlas-native textures

**Files:**
- Test: `src/data/resonantContent.test.mjs`
- Modify: `src/data/blocks.ts`
- Modify: `src/recipes.ts`
- Modify: `src/utils/textures.ts`
- Modify: `src/systems/textures/textureMapping.ts` only if external override names are warranted.
- Create: `src/systems/textures/resonantTexturePixels.ts`

**Interfaces:**
- Produces complete `BlockDef` records for IDs `70-85` and `170-177`, procedural pixel painters for every new texture slot, Echo Dust and Resonator recipes, first-clear Pulse Bracer recipe, creative categories, drops, hardness, light, collision, and item stack/use metadata.

- [ ] Write failing source and behavior tests for definitions, texture slots, no slot collisions, canonical recipes, Echo Crystal drops, and inventory-only flags.
- [ ] Run focused tests to verify red.
- [ ] Implement pixel-art textures with 16×16 integer pixels and Atlas palette/contrast conventions.
- [ ] Add content definitions and recipes.
- [ ] Run focused tests, typecheck, lint, atlas texture consistency tests.
- [ ] Commit as `feat: add Resonant Vault blocks and items`.

### Task 3: Deterministic vault domain and room graph

**Files:**
- Test: `src/systems/world/resonantVaults.test.mjs`
- Create: `src/systems/world/resonantVaults.ts`
- Modify: `src/systems/world/chunkGeneration.ts`

**Interfaces:**
- Produces `RESONANT_VAULT_GRID`, `getVaultCandidateForCell`, `getNearestVaultCandidates`, `getVaultId`, `getVaultLayout`, `resonantVaultTouchesBox`, `applyResonantVaultToColumn`, and deterministic room/glyph/timing variants.

- [ ] Write failing pure tests for positive/negative coordinates, stable candidate centers, minimum spacing, biome exclusions, fixed feasible room graph, deterministic room orientation, deterministic four-glyph sequence, and chunk-order independence.
- [ ] Run focused tests to verify red.
- [ ] Implement pure placement/layout helpers without `BlockType` imports where practical.
- [ ] Integrate the surface spire, entrance shaft, hub, three wings, seal, arena, core chamber, and two exits into chunk generation with bounded reserved volumes.
- [ ] Add generation source tests proving the structure uses only reserved world-block catalog IDs.
- [ ] Run focused generation tests, typecheck, and existing determinism suite.
- [ ] Commit as `feat: generate deterministic Resonant Vaults`.

### Task 4: Persistent vault state and typed events

**Files:**
- Test: `src/systems/progression/resonantVaultProgress.test.mjs`
- Modify: `src/systems/progression/ProgressionStore.ts`
- Modify: `src/systems/events/GameEvents.ts`
- Create: `src/systems/world/ResonantVaultState.ts`

**Interfaces:**
- Produces `VaultProgressData`, `getVaultProgress(vaultId)`, `setWingSolved`, `markCustodianDefeated`, `claimVaultCore`, `completeVaultEscape`, `hasClaimedFirstVaultReward`, and typed vault lifecycle events.

- [ ] Write failing tests for old-save defaults, per-vault separation, idempotent wing solve, one-time core claim, first-clear global reward status, serialization round trip, and world reset.
- [ ] Run focused tests to verify red.
- [ ] Add optional additive `resonantVaults` progression data.
- [ ] Implement immutable/copy-safe runtime access and event emission.
- [ ] Run focused tests and full progression tests.
- [ ] Commit as `feat: persist Resonant Vault progress`.

### Task 5: Resonator, machinery, memory puzzle, and phase traversal

**Files:**
- Test: `src/systems/world/resonantMachinery.test.mjs`
- Create: `src/systems/world/ResonantMachinerySystem.ts`
- Create: `src/systems/world/resonantMachineryRules.ts`
- Create: `src/components/ResonantMachineryController.tsx`
- Modify: `src/components/controllers/InteractionController.tsx`
- Modify: `src/components/AudioListenerUpdater.tsx` or the existing world-context mount point.

**Interfaces:**
- Produces contextual Resonator use, pylon activation, recoverable four-step memory sequence, phase-block timing, pressure plate activation, shockwave failure response, and world-space glyph/pulse feedback.

- [ ] Write failing pure tests for sequence order, wrong-input reset, solved idempotency, phase timing, plate activation, close-range interrupt timing, and Echo Bolt reflection eligibility.
- [ ] Run focused tests to verify red.
- [ ] Implement pure rules and runtime system.
- [ ] Integrate use input without adding a new keyboard-only binding.
- [ ] Add particles, existing sound groups/custom synthesized tones where supported, camera feedback, and existing message styling.
- [ ] Run tests, typecheck, lint, and build.
- [ ] Commit as `feat: make Resonant Vault machinery playable`.

### Task 6: Echo Sentinel roster and encounter director

**Files:**
- Test: `src/systems/entities/resonantSentinels.test.mjs`
- Modify: `src/systems/entities/Entity.ts`
- Modify: `src/systems/entities/EntityManager.ts`
- Modify: `src/components/EntityRenderer.tsx`
- Create: `src/systems/entities/ResonantEncounterDirector.ts`

**Interfaces:**
- Produces `echo_sentinel`, `shielded_echo_sentinel`, `conductor_sentinel`, `echo_bolt` behavior, chamber-bound encounter activation/reset, pylon interruption, shield links, Conductor buffs, drops, and distinct Atlas-native silhouettes.

- [ ] Write failing tests for registrations, roles, shield interruption, Conductor range/link removal, deterministic encounter composition, chamber leash/reset, and resource drops.
- [ ] Run focused tests to verify red.
- [ ] Add entity definitions and bounded AI extensions.
- [ ] Add renderer geometry/emissive cues using existing materials and no custom HUD.
- [ ] Integrate chamber activation and reset.
- [ ] Run focused tests, typecheck, lint, build.
- [ ] Commit as `feat: add Resonant Vault sentinels`.

### Task 7: Vault Custodian miniboss

**Files:**
- Test: `src/systems/entities/vaultCustodian.test.mjs`
- Modify: `src/systems/entities/Entity.ts`
- Modify: `src/systems/entities/EntityManager.ts`
- Modify: `src/components/EntityRenderer.tsx`
- Modify: `src/components/ui/BossBar.tsx` only through existing generic event paths.
- Create: `src/systems/entities/VaultCustodianController.ts`

**Interfaces:**
- Produces boss spawn after three solved wings, phase thresholds, telegraphed pulse rings, Echo Bolts, rotating exposed cores, Resonator interruption windows, arena leash/reset, persistent defeat, Custodian Sigil drop, and existing boss HUD integration.

- [ ] Write failing tests for spawn gate, phase progression, attack cadence, core vulnerability, Resonator counterplay, death/reset, one-time sigil reward, and boss event payloads.
- [ ] Run focused tests to verify red.
- [ ] Implement the boss controller and bounded projectile/attack state.
- [ ] Add rendering and existing boss bar events.
- [ ] Run focused tests, typecheck, lint, build.
- [ ] Commit as `feat: add the Vault Custodian`.

### Task 8: Core claim, escape sequence, caches, and repeat-vault loot

**Files:**
- Test: `src/systems/world/resonantVaultEscape.test.mjs`
- Create: `src/systems/world/ResonantVaultEscapeSystem.ts`
- Modify: `src/systems/world/ResonantMachinerySystem.ts`
- Modify: `src/systems/WorldManager.ts` only through existing edit/drop APIs.

**Interfaces:**
- Produces core-dais interaction, one-time Echo Core, first-clear Resonant Lens, deterministic cache loot, exit route activation, phase-path changes, hazard escalation, surviving-enemy pursuit, completion detection, and repeat-vault reward tables.

- [ ] Write failing tests for claim idempotency, first-clear versus repeat loot, deterministic cache rolls, 90-second escape state, two viable exits, completion trigger, and reload behavior.
- [ ] Run focused tests to verify red.
- [ ] Implement claim and escape state machines.
- [ ] Use existing block edits, drops, particles, sounds, and messages.
- [ ] Run focused tests, typecheck, lint, build.
- [ ] Commit as `feat: add Resonant Vault core escape`.

### Task 9: Pulse Bracer reward and normal-world utility

**Files:**
- Test: `src/systems/player/pulseBracer.test.mjs`
- Create: `src/systems/player/PulseBracerSystem.ts`
- Modify: `src/components/controllers/InteractionController.tsx`
- Modify: `src/components/ui/Hotbar.tsx` or the existing selected-slot overlay component.
- Modify: projectile compatibility registries where needed.

**Interfaces:**
- Produces line-of-sight cone pulse, cooldown, knockback, registered projectile deflection, resonance interrupt/activation, Echo Crystal reveal shimmer, and selected-slot cooldown overlay matching existing durability/stack styling.

- [ ] Write failing tests for cone geometry, line of sight, cooldown, no self-hit, compatible target registration, projectile ownership reversal, machinery activation, reveal radius, and persistence-free cooldown reset.
- [ ] Run focused tests to verify red.
- [ ] Implement pure pulse targeting and runtime integration.
- [ ] Add the minimal hotbar-slot overlay using current border, pixel font, and dark fill conventions.
- [ ] Run focused tests, typecheck, lint, build.
- [ ] Commit as `feat: add the Pulse Bracer`.

### Task 10: Commands, onboarding, final integration, and validation

**Files:**
- Test: `src/systems/world/resonantVaultIntegration.test.mjs`
- Modify: `src/data/commands.ts`
- Modify: `src/App.tsx` command routing only where required.
- Modify: `src/components/ui/LoadingScreen.tsx` for one rotating Atlas-style tip only if existing tip infrastructure supports it.
- Modify: spec/decision docs only when implementation changed a binding detail.

**Interfaces:**
- Adds `/vault locate`, `/vault teleport`, `/vault reset`, `/vault solve <memory|traversal|combat>`, `/vault spawncustodian`, `/vault claimcore`, and `/vault escape`, all routed through existing messages.

- [ ] Write failing source/integration tests for command registration, normal gameplay reachability, all catalog IDs, generation hooks, progression hooks, machinery mount, enemies, boss, escape, reward, no custom quest HUD, and no public-repository writes.
- [ ] Run focused tests to verify red.
- [ ] Implement commands and restrained onboarding.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run lint`.
- [ ] Run `node --test` and record totals.
- [ ] Run `npm run build` and record module count, duration, and bundle output.
- [ ] Remove temporary validation configuration.
- [ ] Verify the final clean-head deployment and HTTP response.
- [ ] Inspect final diff for ID collisions, save incompatibility, generation nondeterminism, detached UI, and unrelated changes.
- [ ] Open a private draft PR targeting `atlas-lab/main`, label it `daily-experiment`, and document exact executed checks, known playtest gaps, design risks, and recommendation.
- [ ] Commit final validation fixes separately.