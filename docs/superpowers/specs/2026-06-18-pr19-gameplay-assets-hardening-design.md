# PR 19 Gameplay And Asset Hardening Design

## Goal

Finish PR #19 by correcting inventory, equipment, region, entity, combat, boss HUD, naming, and texture regressions without changing existing world generation or unrelated gameplay.

## Item And Equipment Rules

- Durable tools and all equippable armor have a maximum stack size of one.
- Stack compatibility requires equal item type and equal instance data.
- Durable or equippable items never merge, even when their instance data matches.
- Item drops carry complete `ItemStack` data, including durability, stat overrides, and tags.
- Inventory transfers, cursor returns, death drops, equipment swaps, and pickups preserve instance data.
- New worlds reset equipment to an empty set.
- Death drops and clears all equipped items.
- Creative inventory shows the five equipment slots and lists magnets and all armor in the Tools tab.
- Creative picking respects each item's stack limit.

## Regions And Beds

- Bed placement validates edit permission for both foot and head positions before changing either block.
- Bed breaking validates both positions before removing either half.
- Internal world simulation remains exempt from player edit restrictions.

## Entities And Combat

- Enemies acquire and damage players only in Survival mode.
- Switching to Creative or Spectator clears all current aggro and combat state.
- Aggro clears after a player leaves the entity's forget radius.
- Entity knockback uses a short steering-lock interval so AI movement cannot immediately overwrite the impulse.
- Player contact knockback is applied through the existing Player component.
- Melee attacks compare entity distance with the nearest block hit and cannot pass through blocks.

## Boss HUD

- Boss events identify a specific `entityId`.
- The HUD tracks the active boss by entity ID, not only boss type.
- Damage events update current and maximum health.
- The bar includes numeric health text so every successful hit is visible.
- Defeat and world reset clear the HUD.

## Naming

- Internal boss ID: `cinder_warden`.
- Player-facing boss name: `Cinder Warden`.
- Region name: `Cinder Reach`.
- Legacy guardian progression data is not migrated.
- Equipment slot labels use complete readable names.
- Commands, autocomplete, events, tests, and registries use the same identifiers.

## Textures

Reserve seven unique atlas slots for:

1. Positive Magnet
2. Negative Magnet
3. Iron Helmet
4. Iron Chestplate
5. Iron Leggings
6. Iron Boots
7. Polarity Boots

Each asset is an original 16x16 PNG in Atlas's crisp pixel-art style. Magnet blocks use full opaque tiles. Armor items use transparent backgrounds. Every asset is registered in `textureMapping.ts` and also has a procedural fallback in the atlas generator.

## Validation

- Targeted Node tests cover stack policy, item-instance preservation, equipment reset/death extraction, game-mode aggro, aggro forgetting, melee occlusion, bed region checks, boss HUD state reduction, naming, and unique texture assignments.
- Run `npm run typecheck`, `npm run lint`, and `npm run build`.
- Browser smoke tests cover Survival and Creative equipment layouts, new-world equipment reset, commands, boss health updates, and texture rendering.
