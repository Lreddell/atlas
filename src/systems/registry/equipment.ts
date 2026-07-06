// Equipment model + derived stats. Equipment is a fixed map of slots to items;
// it aggregates defense and exposes the magnetic-susceptibility flags the
// magnetism system reads (iron armor = ferromagnetic; polarity boots = control).

import { BlockType, type EquipmentSlot, type ItemStack } from '../../types';
import { getItemStats, getMaxDurability } from './itemStats';

export type Equipment = Record<EquipmentSlot, ItemStack | null>;

export const EQUIPMENT_SLOTS: EquipmentSlot[] = ['helmet', 'chestplate', 'leggings', 'boots', 'accessory'];

export const createEmptyEquipment = (): Equipment => ({
    helmet: null, chestplate: null, leggings: null, boots: null, accessory: null,
});

const IRON_ARMOR = new Set<BlockType>([
    BlockType.IRON_HELMET, BlockType.IRON_CHESTPLATE, BlockType.IRON_LEGGINGS, BlockType.IRON_BOOTS,
]);

/** The slot an item can be equipped into, or undefined if it is not equippable. */
export function slotForItem(type: BlockType): EquipmentSlot | undefined {
    return getItemStats({ type, count: 1 })?.slot;
}

/** Total armor points from all equipped pieces. */
export function totalDefense(eq: Equipment): number {
    let d = 0;
    for (const slot of EQUIPMENT_SLOTS) {
        const item = eq[slot];
        if (item) d += getItemStats(item)?.defense ?? 0;
    }
    return d;
}

/** Incoming damage after armor reduction (each point ≈ 4%, capped at 80%). */
export function applyArmor(damage: number, eq: Equipment): number {
    const points = Math.min(20, totalDefense(eq));
    return damage * (1 - points * 0.04);
}

/** Ferromagnetic: any iron armor piece is worn (passively attracted to magnets). */
export function isWearingIronArmor(eq: Equipment): boolean {
    return EQUIPMENT_SLOTS.some((s) => {
        const it = eq[s];
        return !!it && IRON_ARMOR.has(it.type);
    });
}

/** Polarity boots (or the upgraded pair) equipped → the player controls polarity. */
export function hasPolarityBoots(eq: Equipment): boolean {
    return eq.boots?.type === BlockType.POLARITY_BOOTS
        || eq.boots?.type === BlockType.UPGRADED_POLARITY_BOOTS;
}

/** Upgraded polarity boots: same control plus an on/off toggle (the N key). */
export function hasUpgradedPolarityBoots(eq: Equipment): boolean {
    return eq.boots?.type === BlockType.UPGRADED_POLARITY_BOOTS;
}

/**
 * Wear down equipped armor from an incoming hit. Each piece loses
 * max(1, floor(incomingDamage / 4)) durability; unbreakable pieces (no max) are
 * skipped; a piece that hits 0 breaks (removed). Returns new equipment if any
 * piece changed, otherwise the same reference. Durability lazy-inits from the
 * registry on first hit.
 */
export function damageArmor(eq: Equipment, incomingDamage: number): Equipment {
    if (incomingDamage <= 0) return eq;
    const loss = Math.max(1, Math.floor(incomingDamage / 4));
    let changed = false;
    const next: Equipment = { ...eq };
    for (const slot of EQUIPMENT_SLOTS) {
        const item = eq[slot];
        if (!item) continue;
        const max = getMaxDurability(item.type);
        if (max === undefined) continue; // unbreakable (e.g. polarity boots, accessories)
        const current = item.instance?.durability ?? max;
        const left = current - loss;
        changed = true;
        next[slot] = left <= 0
            ? null
            : { ...item, instance: { ...(item.instance ?? {}), durability: left, maxDurability: max } };
    }
    return changed ? next : eq;
}
