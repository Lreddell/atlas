
import { BlockType } from '../../types';
import { BLOCKS } from '../../data/blocks';
import { isSaplingType, isValidSoil } from './trees';
import { isShaped } from './blockShapes';

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
    // Slabs/stairs only fill part of their cell, so light must still reach the empty
    // cut-out side — they shouldn't block like a full cube. The per-cell lighting model
    // can't shade by sub-shape, so use an attenuation of 1: light propagates through
    // (no longer a free sky-light column like opacity 0, so it dims gently going down)
    // while still passing to the open side. The block's solid look comes from its AO
    // shading, not from blocking light.
    if (isShaped(type)) return 1;

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

// Decorations that fall/break if the block they sit on is removed.
const SUPPORT_DEPENDENT = new Set<BlockType>([
    BlockType.TORCH,
    BlockType.GRASS_PLANT, BlockType.ROSE, BlockType.DANDELION, BlockType.PINK_FLOWER,
    BlockType.DEAD_BUSH, BlockType.DEBUG_CROSS,
    BlockType.SAPLING, BlockType.SPRUCE_SAPLING, BlockType.BIRCH_SAPLING, BlockType.CHERRY_SAPLING,
]);

export function needsSupport(type: BlockType): boolean {
    return SUPPORT_DEPENDENT.has(type);
}

// Whether a support-dependent block can rest on the given block beneath it.
export function hasSupportBelow(type: BlockType, belowType: BlockType): boolean {
    if (type === BlockType.TORCH) {
        // Any solid, collidable, non-fluid block can hold a torch.
        const def = BLOCKS[belowType];
        return !!def && !def.noCollision && belowType !== BlockType.WATER && belowType !== BlockType.LAVA;
    }
    // Plants and saplings need soil.
    return isValidSoil(belowType);
}

// Blocks a placed block may overwrite. Grass and dead bushes pop off like in
// Minecraft; flowers, torches and saplings are NOT replaceable (place beside them).
const PLACEMENT_REPLACEABLE = new Set<BlockType>([
    BlockType.GRASS_PLANT, BlockType.DEAD_BUSH,
]);

export function isPlacementReplaceable(type: BlockType): boolean {
    return type === BlockType.AIR || type === BlockType.WATER || type === BlockType.LAVA
        || PLACEMENT_REPLACEABLE.has(type);
}
