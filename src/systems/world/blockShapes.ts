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
