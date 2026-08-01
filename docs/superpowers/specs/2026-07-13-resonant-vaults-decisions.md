# Resonant Vaults Binding Design Decisions

This file records the Resonant Vaults spec self-review. It is part of the implementation contract and overrides any looser alternative language in `2026-07-13-resonant-vaults-design.md`.

## 1. First-Clear Reward Delivery

The Pulse Bracer is crafted. It is not placed directly in a cache and is not silently granted.

The first completed vault guarantees every vault-only component needed for one bracer:

- 1 Echo Core from the core dais.
- 1 Custodian Sigil from the Vault Custodian.
- 1 Resonant Lens from the first-clear core cache.
- Sufficient Echo Dust from wing/core caches.

Canonical 3×3 recipe:

```text
Copper Ingot | Echo Dust       | Copper Ingot
Resonator    | Echo Core       | Custodian Sigil
Iron Ingot   | Resonant Lens   | Iron Ingot
```

The recipe consumes the Resonator. The Pulse Bracer inherits and expands its functions, avoiding a redundant obsolete tool after the first clear.

Repeat vaults never grant another guaranteed Resonant Lens solely for the first-clear recipe. They use the repeat-vault loot table.

## 2. Required Sentinel Set

Three Sentinel roles are required for the complete experiment:

- Echo Sentinel: readable mid-range baseline enemy.
- Shielded Echo Sentinel: requires resonance interruption or environmental shield break.
- Conductor Sentinel: links to and strengthens nearby Sentinels until interrupted or defeated.

The Conductor is no longer optional. The combat chamber and later-vault encounter tables must use all three roles.

## 3. Resonator and Pulse Bracer Combat Boundary

The Resonator has a narrow, vault-specific defensive interaction so the Custodian remains defeatable before the Pulse Bracer exists.

Resonator:

- Can interrupt Echo Sentinel and Custodian charge states at close range.
- Can reflect only `echo_bolt` projectiles.
- Reflection requires a narrow timing window and direct targeting.
- Has no general knockback and does not affect ordinary projectiles outside the resonance family.

Pulse Bracer:

- Retains Resonator machinery activation and Echo Crystal reveal.
- Uses a cone rather than direct single-target timing.
- Knocks back compatible ordinary enemies.
- Interrupts resonance attacks with a more forgiving window.
- Deflects every projectile type explicitly registered as pulse-compatible, including Echo Bolts and existing boss projectiles where integration is safe.
- Remains cooldown-limited and line-of-sight constrained.

This distinction preserves pre-reward boss solvability while making the reward a meaningful expansion rather than a cosmetic replacement.

## 4. Echo Dust Production

Echo Dust is crafted, not smelted.

Canonical 2×2 recipe:

```text
Echo Shard | Echo Shard
empty      | empty
```

Output: 4 Echo Dust.

No furnace output-count extension is introduced for this feature.

## 5. Existing-World Structure Safety

Resonant Vaults may generate in existing worlds only when the complete reserved vault footprint is still ungenerated.

Before accepting a vault candidate for generation, the structure activation layer must check every chunk intersecting:

- The surface spire footprint.
- The entrance approach.
- The complete underground reserved volume.
- Both escape exits.

If any intersecting chunk already exists in persistent world storage and does not already identify the same vault, that candidate is disabled for that world. The locator skips it and returns the next valid candidate.

The disabled-candidate decision is deterministic from persisted chunk presence and vault identity. It must not produce a partially generated vault spanning old and new chunks.

A future retrofit system may deliberately place vaults into old terrain, but it is outside this experiment.

## 6. Catalog Migration Boundary

The experiment introduces classification and validated access boundaries, not a second parallel content database.

Required structure:

- `worldBlockCatalog.ts` defines and validates which existing numeric content IDs may enter voxel storage.
- `itemCatalog.ts` defines and validates inventory-only content IDs, stack limits, use behavior, and optional placed-block mapping.
- `contentCatalog.ts` exposes a unified lookup backed by the existing `BLOCKS` definitions during migration.
- `BLOCKS` remains the authoritative definition table for this branch.
- `BlockType` remains the compatibility numeric enum.

Prohibited in this branch:

- Duplicating every existing `BlockDef` into another registry.
- Renumbering old content.
- Changing chunk storage width.
- Converting existing save data to stable string keys.
- Allowing inventory-only IDs through new world-write APIs.

New Resonant Vault code must call the classification APIs instead of inferring world-placeability from `isItem` alone.

## 7. Boss HUD Decision

The Vault Custodian uses Atlas's existing boss HUD component and layout.

Allowed changes:

- Custodian name.
- Current/max health.
- Existing phase or shield indicator hooks where already supported.

No separate Custodian HUD, resonance meter, puzzle HUD, or custom screen-space frame is added.

## 8. Debug Command Decision

All commands listed in the main spec are required, including `/vault teleport`.

They remain development commands routed through Atlas's existing command and message systems. No normal player progression depends on them.

## 9. Research Basis

The design intentionally separates a reliable authored macro-graph from variable room furnishing. This follows procedural-dungeon research that separates architectural layout from challenge/reward furnishing and work combining graph grammar with room-level variation:

- Green et al., *Two-step Constructive Approaches for Dungeon Generation*: https://arxiv.org/abs/1906.04660
- Gutierrez and Schrum, *Generative Adversarial Network Rooms in Generative Graph Grammar Dungeons for The Legend of Zelda*: https://arxiv.org/abs/2001.05065

The player's progression is therefore built around a fixed feasible sequence—discovery, three wings, Custodian, core, escape—while room modules, orientations, hazards, enemy composition, and loot vary deterministically.

## 10. Self-Review Result

- Placeholder scan: no `TBD`, `TODO`, or unresolved placeholder remains.
- Internal consistency: first-clear acquisition, enemy scope, projectile behavior, and catalog ownership are now explicit.
- Scope: large but cohesive; every stage supports one expedition loop and one persistent reward.
- Ambiguity: implementation alternatives that could change player progression have been resolved above.
