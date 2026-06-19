import { BlockType } from '../../types';

const MAGNETIC_METAL_ITEMS = new Set<BlockType>([
    BlockType.RAW_IRON,
    BlockType.IRON_INGOT,
    BlockType.IRON_BLOCK,
    BlockType.IRON_PICKAXE,
    BlockType.IRON_AXE,
    BlockType.IRON_SHOVEL,
    BlockType.IRON_SWORD,
    BlockType.IRON_HOE,
    BlockType.IRON_HELMET,
    BlockType.IRON_CHESTPLATE,
    BlockType.IRON_LEGGINGS,
    BlockType.IRON_BOOTS,

    BlockType.RAW_COPPER,
    BlockType.COPPER_INGOT,
    BlockType.COPPER_PICKAXE,
    BlockType.COPPER_AXE,
    BlockType.COPPER_SHOVEL,
    BlockType.COPPER_SWORD,
    BlockType.COPPER_HOE,
    BlockType.COPPER_HELMET,
    BlockType.COPPER_CHESTPLATE,
    BlockType.COPPER_LEGGINGS,
    BlockType.COPPER_BOOTS,

    BlockType.RAW_GOLD,
    BlockType.GOLD_INGOT,
    BlockType.GOLD_PICKAXE,
    BlockType.GOLD_AXE,
    BlockType.GOLD_SHOVEL,
    BlockType.GOLD_SWORD,
    BlockType.GOLD_HOE,
    BlockType.GOLD_HELMET,
    BlockType.GOLD_CHESTPLATE,
    BlockType.GOLD_LEGGINGS,
    BlockType.GOLD_BOOTS,

    BlockType.POSITIVE_MAGNET,
    BlockType.NEGATIVE_MAGNET,
]);

export const isMagneticMetalItem = (type: BlockType): boolean =>
    MAGNETIC_METAL_ITEMS.has(type);
