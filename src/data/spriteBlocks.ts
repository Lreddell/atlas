import { BlockType } from '../types';
import { BLOCKS } from './blocks';

/**
 * Blocks the world mesher draws as cross-planes (two intersecting quads on a
 * transparent-background tile). This is the single source of truth: the chunk
 * mesher builds its cross/cutout tables from it, and the held-item, drop, and
 * particle renderers use it to decide sprite vs cube presentation. A cutout
 * block missing from here renders as a full cube whose transparent texels
 * come out black, so every new sprite block must be added exactly once.
 */
export const CROSS_RENDERED_BLOCKS: ReadonlySet<BlockType> = new Set([
    BlockType.TORCH,
    BlockType.SAPLING,
    BlockType.SPRUCE_SAPLING,
    BlockType.BIRCH_SAPLING,
    BlockType.CHERRY_SAPLING,
    BlockType.JUNGLE_SAPLING,
    BlockType.DARK_OAK_SAPLING,
    BlockType.ACACIA_SAPLING,
    BlockType.DEAD_BUSH,
    BlockType.GRASS_PLANT,
    BlockType.ROSE,
    BlockType.DANDELION,
    BlockType.DEBUG_CROSS,
    BlockType.PINK_FLOWER,
    BlockType.POSITIVE_MAGNETITE_CRYSTAL,
    BlockType.NEGATIVE_MAGNETITE_CRYSTAL,
    BlockType.MAGNETIC_SPIKE,
    BlockType.MAGNETIC_SHIELD_CRYSTAL,
    BlockType.MAGNETITE_SHARD,
    BlockType.POINTED_DRIPSTONE,
    BlockType.GLOW_LICHEN,
    BlockType.AMETHYST_CLUSTER,
    // Resonant Vault crystal and hazard sprites (transparent-background tiles).
    BlockType.ECHO_CRYSTAL,
    BlockType.ECHO_SPIKES,
]);

export function isCrossRenderedBlock(type: BlockType): boolean {
    return CROSS_RENDERED_BLOCKS.has(type);
}

/**
 * True when a stack of this type presents as a flat sprite (held in hand,
 * dropped on the ground, in break particles) rather than a miniature cube.
 */
export function isSpriteRenderedType(type: BlockType): boolean {
    const def = BLOCKS[type];
    if (!def) return false;
    return !!def.isItem
        || CROSS_RENDERED_BLOCKS.has(type)
        || type === BlockType.BED_ITEM
        || type === BlockType.WHEAT_SEEDS;
}
