// Static item-stats registry: the single source of truth for combat-relevant
// item properties (attack, durability now; defense/slot for armor). This is the
// data layer the build-archetype system grows into — add a weapon/armor's stats
// here, or override per-instance via ItemStack.instance.stats.

import { BlockType, type ItemStats, type ItemStack } from '../../types';

const FIST_ATTACK = 1;

// Tool material tiers. Durability and attack use exact Minecraft values; COPPER
// is not a vanilla tier, so it sits between stone and iron (user-confirmed).
type Tier = 'wood' | 'stone' | 'copper' | 'iron' | 'gold' | 'diamond';
const DURABILITY: Record<Tier, number> = {
    wood: 59, stone: 131, copper: 190, iron: 250, gold: 32, diamond: 1561,
};

const tool = (attack: number, tier: Tier): ItemStats => ({ attack, maxDurability: DURABILITY[tier] });

// Exact Minecraft attack values (copper = between stone and iron).
// Sword: 4/5/6/7 (gold 4) · Axe: 7/9/9/9 (gold 7) · Pickaxe: 2/3/4/5 (gold 2)
// Shovel: 2.5/3.5/4.5/5.5 (gold 2.5) · Hoe: 1 across all tiers.
export const ITEM_STATS: Partial<Record<BlockType, ItemStats>> = {
    // Swords
    [BlockType.WOOD_SWORD]: tool(4, 'wood'),
    [BlockType.STONE_SWORD]: tool(5, 'stone'),
    [BlockType.COPPER_SWORD]: tool(5, 'copper'),
    [BlockType.IRON_SWORD]: tool(6, 'iron'),
    [BlockType.GOLD_SWORD]: tool(4, 'gold'),
    [BlockType.DIAMOND_SWORD]: tool(7, 'diamond'),
    // Axes
    [BlockType.WOOD_AXE]: tool(7, 'wood'),
    [BlockType.STONE_AXE]: tool(9, 'stone'),
    [BlockType.COPPER_AXE]: tool(9, 'copper'),
    [BlockType.IRON_AXE]: tool(9, 'iron'),
    [BlockType.GOLD_AXE]: tool(7, 'gold'),
    [BlockType.DIAMOND_AXE]: tool(9, 'diamond'),
    // Pickaxes
    [BlockType.WOOD_PICKAXE]: tool(2, 'wood'),
    [BlockType.STONE_PICKAXE]: tool(3, 'stone'),
    [BlockType.COPPER_PICKAXE]: tool(3, 'copper'),
    [BlockType.IRON_PICKAXE]: tool(4, 'iron'),
    [BlockType.GOLD_PICKAXE]: tool(2, 'gold'),
    [BlockType.DIAMOND_PICKAXE]: tool(5, 'diamond'),
    // Shovels
    [BlockType.WOOD_SHOVEL]: tool(2.5, 'wood'),
    [BlockType.STONE_SHOVEL]: tool(3.5, 'stone'),
    [BlockType.COPPER_SHOVEL]: tool(3.5, 'copper'),
    [BlockType.IRON_SHOVEL]: tool(4.5, 'iron'),
    [BlockType.GOLD_SHOVEL]: tool(2.5, 'gold'),
    [BlockType.DIAMOND_SHOVEL]: tool(5.5, 'diamond'),
    // Hoes (attack 1 at every tier; still have tier durability)
    [BlockType.WOOD_HOE]: tool(1, 'wood'),
    [BlockType.STONE_HOE]: tool(1, 'stone'),
    [BlockType.COPPER_HOE]: tool(1, 'copper'),
    [BlockType.IRON_HOE]: tool(1, 'iron'),
    [BlockType.GOLD_HOE]: tool(1, 'gold'),
    [BlockType.DIAMOND_HOE]: tool(1, 'diamond'),

    // Armor — Minecraft defense points + per-piece durability (factor × 11/16/15/13
    // for helmet/chestplate/leggings/boots). Copper is non-vanilla: between gold
    // and iron. Polarity boots are unbreakable (key traversal item).
    // Iron (factor 15)
    [BlockType.IRON_HELMET]:     { defense: 2, slot: 'helmet',     maxDurability: 165 },
    [BlockType.IRON_CHESTPLATE]: { defense: 6, slot: 'chestplate', maxDurability: 240 },
    [BlockType.IRON_LEGGINGS]:   { defense: 5, slot: 'leggings',   maxDurability: 225 },
    [BlockType.IRON_BOOTS]:      { defense: 2, slot: 'boots',      maxDurability: 195 },
    // Gold (factor 7)
    [BlockType.GOLD_HELMET]:     { defense: 2, slot: 'helmet',     maxDurability: 77 },
    [BlockType.GOLD_CHESTPLATE]: { defense: 5, slot: 'chestplate', maxDurability: 112 },
    [BlockType.GOLD_LEGGINGS]:   { defense: 3, slot: 'leggings',   maxDurability: 105 },
    [BlockType.GOLD_BOOTS]:      { defense: 1, slot: 'boots',      maxDurability: 91 },
    // Diamond (factor 33)
    [BlockType.DIAMOND_HELMET]:     { defense: 3, slot: 'helmet',     maxDurability: 363 },
    [BlockType.DIAMOND_CHESTPLATE]: { defense: 8, slot: 'chestplate', maxDurability: 528 },
    [BlockType.DIAMOND_LEGGINGS]:   { defense: 6, slot: 'leggings',   maxDurability: 495 },
    [BlockType.DIAMOND_BOOTS]:      { defense: 3, slot: 'boots',      maxDurability: 429 },
    // Copper (factor 11; defense between gold and iron)
    [BlockType.COPPER_HELMET]:     { defense: 2, slot: 'helmet',     maxDurability: 121 },
    [BlockType.COPPER_CHESTPLATE]: { defense: 4, slot: 'chestplate', maxDurability: 176 },
    [BlockType.COPPER_LEGGINGS]:   { defense: 4, slot: 'leggings',   maxDurability: 165 },
    [BlockType.COPPER_BOOTS]:      { defense: 1, slot: 'boots',      maxDurability: 143 },
    // Polarity boots — controllable polarity; unbreakable.
    [BlockType.POLARITY_BOOTS]: { defense: 1, slot: 'boots' },
    // Upgraded polarity boots — adds an on/off toggle (N); unbreakable.
    [BlockType.UPGRADED_POLARITY_BOOTS]: { defense: 1, slot: 'boots' },
};

/** True for swords (durability-cost rules differ from other tools). */
const SWORDS = new Set<BlockType>([
    BlockType.WOOD_SWORD, BlockType.STONE_SWORD, BlockType.COPPER_SWORD,
    BlockType.IRON_SWORD, BlockType.GOLD_SWORD, BlockType.DIAMOND_SWORD,
]);
export const isSword = (type: BlockType): boolean => SWORDS.has(type);

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

/** Max durability for an item type, or undefined if it is unbreakable. */
export function getMaxDurability(type: BlockType): number | undefined {
    return ITEM_STATS[type]?.maxDurability;
}
