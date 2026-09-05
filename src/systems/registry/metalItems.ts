import { ItemType } from '../../types';

const MAGNETIC_METAL_ITEMS = new Set<ItemType>([
    ItemType.RAW_IRON,
    ItemType.IRON_INGOT,
    ItemType.IRON_BLOCK,
    ItemType.IRON_PICKAXE,
    ItemType.IRON_AXE,
    ItemType.IRON_SHOVEL,
    ItemType.IRON_SWORD,
    ItemType.IRON_HOE,
    ItemType.IRON_HELMET,
    ItemType.IRON_CHESTPLATE,
    ItemType.IRON_LEGGINGS,
    ItemType.IRON_BOOTS,

    ItemType.POSITIVE_MAGNET,
    ItemType.NEGATIVE_MAGNET,
]);

export const isMagneticMetalItem = (type: ItemType): boolean =>
    MAGNETIC_METAL_ITEMS.has(type);
