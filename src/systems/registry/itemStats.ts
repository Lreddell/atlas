// Static item-stats registry: the single source of truth for combat-relevant
// item properties (attack, durability now; defense/slot for armor). This is the
// data layer the build-archetype system grows into, add a weapon/armor's stats
// here, or override per-instance via ItemStack.instance.stats.

import { ItemType, type ItemStats, type ItemStack } from '../../types';

const FIST_ATTACK = 1;

// Tool material tiers. Durability and attack use the genre-standard reference
// values; COPPER is not a standard tier, so it sits between stone and iron.
type Tier = 'wood' | 'stone' | 'copper' | 'iron' | 'gold' | 'diamond';
const DURABILITY: Record<Tier, number> = {
    wood: 59, stone: 131, copper: 190, iron: 250, gold: 32, diamond: 1561,
};

const tool = (attack: number, tier: Tier): ItemStats => ({ attack, maxDurability: DURABILITY[tier] });

// Reference attack values (copper = between stone and iron).
// Sword: 4/5/6/7 (gold 4) · Axe: 7/9/9/9 (gold 7) · Pickaxe: 2/3/4/5 (gold 2)
// Shovel: 2.5/3.5/4.5/5.5 (gold 2.5) · Hoe: 1 across all tiers.
export const ITEM_STATS: Partial<Record<ItemType, ItemStats>> = {
    // Swords
    [ItemType.WOOD_SWORD]: tool(4, 'wood'),
    [ItemType.STONE_SWORD]: tool(5, 'stone'),
    [ItemType.COPPER_SWORD]: tool(5, 'copper'),
    [ItemType.IRON_SWORD]: tool(6, 'iron'),
    [ItemType.GOLD_SWORD]: tool(4, 'gold'),
    [ItemType.DIAMOND_SWORD]: tool(7, 'diamond'),
    // Axes
    [ItemType.WOOD_AXE]: tool(7, 'wood'),
    [ItemType.STONE_AXE]: tool(9, 'stone'),
    [ItemType.COPPER_AXE]: tool(9, 'copper'),
    [ItemType.IRON_AXE]: tool(9, 'iron'),
    [ItemType.GOLD_AXE]: tool(7, 'gold'),
    [ItemType.DIAMOND_AXE]: tool(9, 'diamond'),
    // Pickaxes
    [ItemType.WOOD_PICKAXE]: tool(2, 'wood'),
    [ItemType.STONE_PICKAXE]: tool(3, 'stone'),
    [ItemType.COPPER_PICKAXE]: tool(3, 'copper'),
    [ItemType.IRON_PICKAXE]: tool(4, 'iron'),
    [ItemType.GOLD_PICKAXE]: tool(2, 'gold'),
    [ItemType.DIAMOND_PICKAXE]: tool(5, 'diamond'),
    // Shovels
    [ItemType.WOOD_SHOVEL]: tool(2.5, 'wood'),
    [ItemType.STONE_SHOVEL]: tool(3.5, 'stone'),
    [ItemType.COPPER_SHOVEL]: tool(3.5, 'copper'),
    [ItemType.IRON_SHOVEL]: tool(4.5, 'iron'),
    [ItemType.GOLD_SHOVEL]: tool(2.5, 'gold'),
    [ItemType.DIAMOND_SHOVEL]: tool(5.5, 'diamond'),
    // Hoes (attack 1 at every tier; still have tier durability)
    [ItemType.WOOD_HOE]: tool(1, 'wood'),
    [ItemType.STONE_HOE]: tool(1, 'stone'),
    [ItemType.COPPER_HOE]: tool(1, 'copper'),
    [ItemType.IRON_HOE]: tool(1, 'iron'),
    [ItemType.GOLD_HOE]: tool(1, 'gold'),
    [ItemType.DIAMOND_HOE]: tool(1, 'diamond'),

    // Armor, reference defense points + per-piece durability (factor × 11/16/15/13
    // for helmet/chestplate/leggings/boots). Copper is non-standard: between gold
    // and iron. Polarity boots are unbreakable (key traversal item).
    // Iron (factor 15)
    [ItemType.IRON_HELMET]:     { defense: 2, slot: 'helmet',     maxDurability: 165 },
    [ItemType.IRON_CHESTPLATE]: { defense: 6, slot: 'chestplate', maxDurability: 240 },
    [ItemType.IRON_LEGGINGS]:   { defense: 5, slot: 'leggings',   maxDurability: 225 },
    [ItemType.IRON_BOOTS]:      { defense: 2, slot: 'boots',      maxDurability: 195 },
    // Gold (factor 7)
    [ItemType.GOLD_HELMET]:     { defense: 2, slot: 'helmet',     maxDurability: 77 },
    [ItemType.GOLD_CHESTPLATE]: { defense: 5, slot: 'chestplate', maxDurability: 112 },
    [ItemType.GOLD_LEGGINGS]:   { defense: 3, slot: 'leggings',   maxDurability: 105 },
    [ItemType.GOLD_BOOTS]:      { defense: 1, slot: 'boots',      maxDurability: 91 },
    // Diamond (factor 33)
    [ItemType.DIAMOND_HELMET]:     { defense: 3, slot: 'helmet',     maxDurability: 363 },
    [ItemType.DIAMOND_CHESTPLATE]: { defense: 8, slot: 'chestplate', maxDurability: 528 },
    [ItemType.DIAMOND_LEGGINGS]:   { defense: 6, slot: 'leggings',   maxDurability: 495 },
    [ItemType.DIAMOND_BOOTS]:      { defense: 3, slot: 'boots',      maxDurability: 429 },
    // Copper (factor 11; defense between gold and iron)
    [ItemType.COPPER_HELMET]:     { defense: 2, slot: 'helmet',     maxDurability: 121 },
    [ItemType.COPPER_CHESTPLATE]: { defense: 4, slot: 'chestplate', maxDurability: 176 },
    [ItemType.COPPER_LEGGINGS]:   { defense: 4, slot: 'leggings',   maxDurability: 165 },
    [ItemType.COPPER_BOOTS]:      { defense: 1, slot: 'boots',      maxDurability: 143 },
    // Polarity boots, controllable polarity; unbreakable.
    [ItemType.POLARITY_BOOTS]: { defense: 1, slot: 'boots' },
    // Upgraded polarity boots, adds an on/off toggle (N); unbreakable.
    [ItemType.UPGRADED_POLARITY_BOOTS]: { defense: 1, slot: 'boots' },

    // Resonant Vault conventional weapons. Task-specific reach, recovery, and
    // stagger live in vaultWeapons.ts; this shared registry owns base damage and durability.
    [ItemType.VAULTSTEEL_SPEAR]: { attack: 6, maxDurability: 420 },
    [ItemType.VAULT_CROSSBOW]: { attack: 7, maxDurability: 360 },
    [ItemType.BELLBREAKER_MAUL]: { attack: 9, maxDurability: 480 },
    [ItemType.TITAN_HAMMER]: { attack: 11, maxDurability: 720 },
};

const VAULT_WEAPONS = new Set<ItemType>([
    ItemType.VAULTSTEEL_SPEAR,
    ItemType.VAULT_CROSSBOW,
    ItemType.BELLBREAKER_MAUL,
    ItemType.TITAN_HAMMER,
]);

export const isVaultWeapon = (type: ItemType): boolean => VAULT_WEAPONS.has(type);
export const isVaultRangedWeapon = (type: ItemType): boolean => type === ItemType.VAULT_CROSSBOW;

/** True for swords (durability-cost rules differ from other tools). */
const SWORDS = new Set<ItemType>([
    ItemType.WOOD_SWORD, ItemType.STONE_SWORD, ItemType.COPPER_SWORD,
    ItemType.IRON_SWORD, ItemType.GOLD_SWORD, ItemType.DIAMOND_SWORD,
]);
export const isSword = (type: ItemType): boolean => SWORDS.has(type);

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
export function getMaxDurability(type: ItemType): number | undefined {
    return ITEM_STATS[type]?.maxDurability;
}
