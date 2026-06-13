
import { BlockType } from '../../types';
import { BLOCKS } from '../../data/blocks';
import { isSaplingType } from './trees';

const LEAF_TYPES = new Set<BlockType>([
    BlockType.LEAVES,
    BlockType.SPRUCE_LEAVES,
    BlockType.BIRCH_LEAVES,
    BlockType.CHERRY_LEAVES
]);

// getOpacity is called per voxel in the lighting BFS and the mesher AO loops —
// precompute every block id into a flat typed array so the hot path is one load.
const MAX_OPACITY_ID = Math.max(
    ...Object.values(BlockType).filter((v): v is number => typeof v === 'number')
);
const OPACITY_TABLE = new Uint8Array(MAX_OPACITY_ID + 1);
for (let id = 0; id <= MAX_OPACITY_ID; id++) {
    OPACITY_TABLE[id] = computeOpacity(id as BlockType);
}

export function getOpacity(type: BlockType): number {
    return type <= MAX_OPACITY_ID ? OPACITY_TABLE[type] : 15;
}

function computeOpacity(type: BlockType): number {
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
