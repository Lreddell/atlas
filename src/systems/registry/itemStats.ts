// Static item-stats registry: the single source of truth for combat-relevant
// item properties (attack now; defense/slot when armor content is added). This
// is the data layer the build-archetype system will grow into — add a weapon or
// armor's stats here, or override per-instance via ItemStack.instance.stats.

import { BlockType, type ItemStats, type ItemStack } from '../../types';

const FIST_ATTACK = 1;

// Swords are the dedicated melee weapon (highest per-hit). Axes can fight but
// are worse than the matching sword. Other tools fall back to fist-level damage.
export const ITEM_STATS: Partial<Record<BlockType, ItemStats>> = {
    [BlockType.WOOD_SWORD]: { attack: 4, slot: undefined },
    [BlockType.STONE_SWORD]: { attack: 5 },
    [BlockType.COPPER_SWORD]: { attack: 5 },
    [BlockType.IRON_SWORD]: { attack: 6 },
    [BlockType.GOLD_SWORD]: { attack: 5 },
    [BlockType.DIAMOND_SWORD]: { attack: 7 },

    [BlockType.WOOD_AXE]: { attack: 3 },
    [BlockType.STONE_AXE]: { attack: 4 },
    [BlockType.COPPER_AXE]: { attack: 4 },
    [BlockType.IRON_AXE]: { attack: 5 },
    [BlockType.GOLD_AXE]: { attack: 4 },
    [BlockType.DIAMOND_AXE]: { attack: 6 },
};

/** Effective stats for a stack: per-instance overrides win over the registry. */
export function getItemStats(stack: ItemStack | null | undefined): ItemStats | undefined {
    if (!stack) return undefined;
    const base = ITEM_STATS[stack.type];
    const override = stack.instance?.stats;
    if (base && override) return { ...base, ...override };
    return override ?? base;
}

/** Melee damage for the item currently held (fist if none/unarmed). */
export function getAttackDamage(stack: ItemStack | null | undefined): number {
    return getItemStats(stack)?.attack ?? FIST_ATTACK;
}
