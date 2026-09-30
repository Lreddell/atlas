// The farming items, apart from the farm rules (farming.ts), so the item
// registries can name them without the world constants.

import { BlockType } from '../../types';

export const HOE_TYPES: ReadonlySet<BlockType> = new Set([
    BlockType.WOOD_HOE, BlockType.STONE_HOE, BlockType.COPPER_HOE,
    BlockType.IRON_HOE, BlockType.GOLD_HOE, BlockType.DIAMOND_HOE,
]);

export const isHoe = (type: BlockType): boolean => HOE_TYPES.has(type);
