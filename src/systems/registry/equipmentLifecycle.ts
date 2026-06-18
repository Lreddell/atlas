import { cloneStack, type StackLike } from '../inventory/itemStackRules.ts';

const EQUIPMENT_SLOT_NAMES = ['helmet', 'chestplate', 'leggings', 'boots', 'accessory'] as const;

type EquipmentLike<T extends StackLike> = Record<(typeof EQUIPMENT_SLOT_NAMES)[number], T | null>;

export const extractEquipmentItems = <T extends StackLike>(
    equipment: EquipmentLike<T>,
): { items: T[]; equipment: EquipmentLike<T> } => {
    const items = EQUIPMENT_SLOT_NAMES.flatMap((slot) => {
        const item = equipment[slot];
        return item ? [cloneStack(item)] : [];
    });

    return {
        items,
        equipment: {
            helmet: null,
            chestplate: null,
            leggings: null,
            boots: null,
            accessory: null,
        },
    };
};
