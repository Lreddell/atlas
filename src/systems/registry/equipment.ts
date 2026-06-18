// Equipment model + derived stats. Equipment is a fixed map of slots to items;
// it aggregates defense and exposes the magnetic-susceptibility flags the
// magnetism system reads (iron armor = ferromagnetic; polarity boots = control).

import { BlockType, type EquipmentSlot, type ItemStack } from '../../types';
import { getItemStats } from './itemStats';

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

/** Total Minecraft-style armor points from all equipped pieces. */
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

/** Polarity boots equipped → the player can control their polarity. */
export function hasPolarityBoots(eq: Equipment): boolean {
    return eq.boots?.type === BlockType.POLARITY_BOOTS;
}
