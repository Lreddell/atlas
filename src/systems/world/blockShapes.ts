import { BlockType } from '../../types';

// Local-space axis-aligned box within a single voxel cell: [x0,y0,z0, x1,y1,z1]
// with each component in [0,1]. A full cube is [0,0,0,1,1,1].
export type ShapeBox = [number, number, number, number, number, number];

const SLAB_TYPES: ReadonlySet<BlockType> = new Set([
    BlockType.OAK_SLAB, BlockType.SPRUCE_SLAB, BlockType.BIRCH_SLAB, BlockType.CHERRY_SLAB,
    BlockType.COBBLESTONE_SLAB, BlockType.STONE_SLAB, BlockType.SANDSTONE_SLAB,
    BlockType.RED_SANDSTONE_SLAB, BlockType.BRICK_SLAB,
]);

const STAIR_TYPES: ReadonlySet<BlockType> = new Set([
    BlockType.OAK_STAIRS, BlockType.SPRUCE_STAIRS, BlockType.BIRCH_STAIRS, BlockType.CHERRY_STAIRS,
    BlockType.COBBLESTONE_STAIRS, BlockType.STONE_STAIRS, BlockType.SANDSTONE_STAIRS,
    BlockType.RED_SANDSTONE_STAIRS, BlockType.BRICK_STAIRS,
]);

export const isSlab = (t: BlockType): boolean => SLAB_TYPES.has(t);
export const isStairs = (t: BlockType): boolean => STAIR_TYPES.has(t);
export const isShaped = (t: BlockType): boolean => SLAB_TYPES.has(t) || STAIR_TYPES.has(t);

// Metadata layout for shaped blocks:
//   Slab:   bit0 = half (0 = bottom, 1 = top)
//   Stairs: bits0-1 = facing of the LOW/open side (0:+Z 1:-Z 2:+X 3:-X)
//           bit2    = upside-down (placed against a ceiling)
export const STAIR_FACE_POS_Z = 0;
export const STAIR_FACE_NEG_Z = 1;
export const STAIR_FACE_POS_X = 2;
export const STAIR_FACE_NEG_X = 3;

const SLAB_BOTTOM: ShapeBox[] = [[0, 0, 0, 1, 0.5, 1]];
const SLAB_TOP: ShapeBox[] = [[0, 0.5, 0, 1, 1, 1]];

/**
 * The set of partial boxes that make up a shaped block, given its metadata.
 * Shared by the mesher (geometry.ts) and collision (playerCollision.ts) so the
 * visible shape and the collidable shape never drift apart.
 */
export function getShapeBoxes(type: BlockType, meta: number): ShapeBox[] {
    if (isSlab(type)) {
        return (meta & 1) === 1 ? SLAB_TOP : SLAB_BOTTOM;
    }
    // Stairs: a full half-height base + a quarter "step" on the far half.
    const facing = meta & 3;
    const upside = (meta & 4) === 4;
    const base: ShapeBox = upside ? [0, 0.5, 0, 1, 1, 1] : [0, 0, 0, 1, 0.5, 1];
    const yLo = upside ? 0 : 0.5;
    const yHi = upside ? 0.5 : 1;
    let step: ShapeBox;
    if (facing === STAIR_FACE_POS_Z) step = [0, yLo, 0, 1, yHi, 0.5];       // low +Z -> tall at -Z half
    else if (facing === STAIR_FACE_NEG_Z) step = [0, yLo, 0.5, 1, yHi, 1];  // low -Z -> tall at +Z half
    else if (facing === STAIR_FACE_POS_X) step = [0, yLo, 0, 0.5, yHi, 1];  // low +X -> tall at -X half
    else step = [0.5, yLo, 0, 1, yHi, 1];                                   // low -X -> tall at +X half
    return [base, step];
}

// Cross-rendered plants (kept in sync with IS_CROSS in geometry.ts). Their billboards
// span the whole cell, so a full-cube selection box reads as a solid block — give them
// a smaller, plant-sized box instead.
const CROSS_PLANT_TYPES: ReadonlySet<BlockType> = new Set([
    BlockType.SAPLING, BlockType.SPRUCE_SAPLING, BlockType.BIRCH_SAPLING, BlockType.CHERRY_SAPLING,
    BlockType.DEAD_BUSH, BlockType.GRASS_PLANT, BlockType.ROSE, BlockType.DANDELION,
    BlockType.DEBUG_CROSS, BlockType.PINK_FLOWER,
]);

// Flowers get a slim box; leafy plants (grass, ferns, saplings, dead bush) get a
// wider one that better matches their spread.
const FLOWER_TYPES: ReadonlySet<BlockType> = new Set([
    BlockType.ROSE, BlockType.DANDELION, BlockType.PINK_FLOWER,
]);

const FULL_CUBE_BOXES: ShapeBox[] = [[0, 0, 0, 1, 1, 1]];
const BED_BOXES: ShapeBox[] = [[0, 0, 0, 1, 0.5, 1]];
const TORCH_BOXES: ShapeBox[] = [[0.4, 0, 0.4, 0.6, 0.6, 0.6]];
const FLOWER_BOXES: ShapeBox[] = [[0.3, 0, 0.3, 0.7, 0.8, 0.7]];
const PLANT_BOXES: ShapeBox[] = [[0.1, 0, 0.1, 0.9, 0.8, 0.9]];

/**
 * The boxes the targeting outline should trace for a block, so the highlight
 * follows the real shape instead of always being a full cube. The voxel raycast
 * uses the same boxes, so what you can select matches what the outline shows.
 */
export function getSelectionBoxes(type: BlockType, meta: number): ShapeBox[] {
    if (isShaped(type)) return getShapeBoxes(type, meta);
    if (type === BlockType.TORCH) return TORCH_BOXES;
    if (FLOWER_TYPES.has(type)) return FLOWER_BOXES;
    if (CROSS_PLANT_TYPES.has(type)) return PLANT_BOXES;
    if (type === BlockType.BED_FOOT || type === BlockType.BED_HEAD) return BED_BOXES;
    return FULL_CUBE_BOXES;
}

/**
 * True when a block fills its whole cell for targeting (the common case). Lets the
 * raycast keep its fast full-cell hit and only do ray/box tests for partial shapes.
 */
export function isFullCubeSelection(type: BlockType): boolean {
    return !isShaped(type)
        && type !== BlockType.TORCH
        && !CROSS_PLANT_TYPES.has(type)
        && type !== BlockType.BED_FOOT
        && type !== BlockType.BED_HEAD;
}
