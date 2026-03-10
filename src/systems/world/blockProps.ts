
import { BlockType } from '../../types';
import { BLOCKS } from '../../data/blocks';
import { isSaplingType } from './trees';

const LEAF_TYPES = new Set<BlockType>([
    BlockType.LEAVES,
    BlockType.SPRUCE_LEAVES,
    BlockType.BIRCH_LEAVES,
    BlockType.CHERRY_LEAVES
]);

export function getOpacity(type: BlockType): number {
    if (type === BlockType.AIR || type === BlockType.TORCH || type === BlockType.GLASS) return 0;
    if (type === BlockType.WATER || LEAF_TYPES.has(type)) return 2;
    if (type === BlockType.LAVA) return 15; // Lava is opaque light-wise
    
    const def = BLOCKS[type];
    if (!def) return 15; // Fallback: Treat unknown blocks as opaque

    if (def.transparent) return 0;
    return 15; 
}

export function isWashable(type: BlockType): boolean {
    if (type === BlockType.AIR) return false;
    // Wash away Torches, Saplings, Grass (if added), etc.
    if (type === BlockType.TORCH || isSaplingType(type)) return true;
    
    const def = BLOCKS[type];
    if (!def) return false; // Fallback: Unknown blocks are stable

    // General rule: noCollision items that are not fluids are likely washable
    if (def.noCollision && type !== BlockType.WATER && type !== BlockType.LAVA) return true;
    
    return false;
}
