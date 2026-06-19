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

    BlockType.POSITIVE_MAGNET,
    BlockType.NEGATIVE_MAGNET,
]);

export const isMagneticMetalItem = (type: BlockType): boolean =>
    MAGNETIC_METAL_ITEMS.has(type);
