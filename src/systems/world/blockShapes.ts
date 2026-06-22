import { BlockType } from '../../types';

// Local-space axis-aligned box within a single voxel cell: [x0,y0,z0, x1,y1,z1]
// with each component in [0,1]. A full cube is [0,0,0,1,1,1].
export type ShapeBox = [number, number, number, number, number, number];

const SLAB_TYPES: ReadonlySet<BlockType> = new Set([
    BlockType.OAK_SLAB, BlockType.SPRUCE_SLAB, BlockType.BIRCH_SLAB, BlockType.CHERRY_SLAB,
    BlockType.COBBLESTONE_SLAB, BlockType.STONE_SLAB, BlockType.SANDSTONE_SLAB,
    BlockType.RED_SANDSTONE_SLAB, BlockType.BRICK_SLAB,
    BlockType.JUNGLE_SLAB, BlockType.DARK_OAK_SLAB, BlockType.ACACIA_SLAB,
]);

const STAIR_TYPES: ReadonlySet<BlockType> = new Set([
    BlockType.OAK_STAIRS, BlockType.SPRUCE_STAIRS, BlockType.BIRCH_STAIRS, BlockType.CHERRY_STAIRS,
    BlockType.COBBLESTONE_STAIRS, BlockType.STONE_STAIRS, BlockType.SANDSTONE_STAIRS,
    BlockType.RED_SANDSTONE_STAIRS, BlockType.BRICK_STAIRS,
    BlockType.JUNGLE_STAIRS, BlockType.DARK_OAK_STAIRS, BlockType.ACACIA_STAIRS,
]);

export const isSlab = (t: BlockType): boolean => SLAB_TYPES.has(t);
export const isStairs = (t: BlockType): boolean => STAIR_TYPES.has(t);
export const isShaped = (t: BlockType): boolean => SLAB_TYPES.has(t) || STAIR_TYPES.has(t);

// Metadata layout for shaped blocks (8-bit value per voxel). Backwards compatible
// with worlds saved before double slabs / stair corners existed — the bits added
// here default to 0, which is exactly the old bottom-slab / straight-stair state.
//
//   Slab:   bit0  = half (0 = bottom, 1 = top)
//           bit1  = double slab (1 = fills the whole cell like a full cube)
//
//   Stairs: bits0-1 = facing of the LOW/open side (0:+Z 1:-Z 2:+X 3:-X)
//           bit2    = upside-down (placed against a ceiling)
//           bits3-5 = corner shape (0 straight, 1 inner-left, 2 inner-right,
//                                   3 outer-left, 4 outer-right) — RESOLVED from
//                                   neighboring stairs and stored, so getShapeBoxes
//                                   stays a pure local lookup for every consumer.
export const STAIR_FACE_POS_Z = 0;
export const STAIR_FACE_NEG_Z = 1;
export const STAIR_FACE_POS_X = 2;
export const STAIR_FACE_NEG_X = 3;

// Slab metadata flags.
export const SLAB_DOUBLE = 2; // bit1

// Stair corner shapes (stored in meta bits 3-5).
export const STAIR_SHAPE_STRAIGHT = 0;
export const STAIR_SHAPE_INNER_LEFT = 1;
export const STAIR_SHAPE_INNER_RIGHT = 2;
export const STAIR_SHAPE_OUTER_LEFT = 3;
export const STAIR_SHAPE_OUTER_RIGHT = 4;

const SLAB_BOTTOM: ShapeBox[] = [[0, 0, 0, 1, 0.5, 1]];
const SLAB_TOP: ShapeBox[] = [[0, 0.5, 0, 1, 1, 1]];
const DOUBLE_SLAB: ShapeBox[] = [[0, 0, 0, 1, 1, 1]];

// --- Horizontal direction helpers (canonical order: 0=N(-Z) 1=E(+X) 2=S(+Z) 3=W(-X))
const DIR_VEC: ReadonlyArray<readonly [number, number]> = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const DIR_CCW = [3, 0, 1, 2];   // counter-clockwise (N->W->S->E)
const DIR_CW = [1, 2, 3, 0];    // clockwise
const DIR_AXIS = [0, 1, 0, 1];  // 0 = Z axis, 1 = X axis
const DIR_OPP = [2, 3, 0, 1];
// Atlas stair facing (low/open side) -> the canonical TALL-side direction (Java's
// stair "facing"), and the inverse mapping.
const FACING_TO_BACK = [0, 2, 3, 1]; // POS_Z->N, NEG_Z->S, POS_X->W, NEG_X->E

// Build a box from per-axis half selectors: -1 -> [0,0.5], +1 -> [0.5,1], 0 -> [0,1].
function makeBox(xh: number, zh: number, yLo: number, yHi: number): ShapeBox {
    const x0 = xh < 0 ? 0 : (xh > 0 ? 0.5 : 0);
    const x1 = xh < 0 ? 0.5 : 1;
    const z0 = zh < 0 ? 0 : (zh > 0 ? 0.5 : 0);
    const z1 = zh < 0 ? 0.5 : 1;
    return [x0, yLo, z0, x1, yHi, z1];
}
// Half-cell box on the side of canonical direction D (full along the other axis).
function halfBox(D: number, yLo: number, yHi: number): ShapeBox {
    return DIR_AXIS[D] === 1 ? makeBox(DIR_VEC[D][0], 0, yLo, yHi) : makeBox(0, DIR_VEC[D][1], yLo, yHi);
}
// Quarter-cell box at the corner where perpendicular directions Da and Db meet.
function quadBox(Da: number, Db: number, yLo: number, yHi: number): ShapeBox {
    const xh = DIR_VEC[Da][0] || DIR_VEC[Db][0];
    const zh = DIR_VEC[Da][1] || DIR_VEC[Db][1];
    return makeBox(xh, zh, yLo, yHi);
}

// The upper-portion boxes of a stair (above/below its half-cell base), given the
// Atlas facing and resolved corner shape. Straight = a half bar on the tall side;
// outer = a single corner quarter; inner = the half bar plus an extra quarter.
function stairTopBoxes(facing: number, shape: number, yLo: number, yHi: number): ShapeBox[] {
    const B = FACING_TO_BACK[facing];     // tall side
    const L = DIR_OPP[B];                 // low/open side
    const left = DIR_CCW[B];
    const right = DIR_CW[B];
    switch (shape) {
        case STAIR_SHAPE_OUTER_LEFT: return [quadBox(B, left, yLo, yHi)];
        case STAIR_SHAPE_OUTER_RIGHT: return [quadBox(B, right, yLo, yHi)];
        case STAIR_SHAPE_INNER_LEFT: return [halfBox(B, yLo, yHi), quadBox(L, left, yLo, yHi)];
        case STAIR_SHAPE_INNER_RIGHT: return [halfBox(B, yLo, yHi), quadBox(L, right, yLo, yHi)];
        default: return [halfBox(B, yLo, yHi)]; // straight
    }
}

/**
 * The set of partial boxes that make up a shaped block, given its metadata.
 * Shared by the mesher (geometry.ts), collision (playerCollision.ts), selection
 * (voxelRaycast.ts) and lighting occlusion (blockProps.ts) so the visible shape and
 * every derived shape never drift apart. Purely local: the resolved stair corner is
 * already baked into `meta`, so no neighbor access is needed here.
 */
export function getShapeBoxes(type: BlockType, meta: number): ShapeBox[] {
    if (isSlab(type)) {
        if ((meta & SLAB_DOUBLE) !== 0) return DOUBLE_SLAB; // double slab = full cube
        return (meta & 1) === 1 ? SLAB_TOP : SLAB_BOTTOM;
    }
    // Stairs: a full half-height base + the resolved top boxes for its corner shape.
    const facing = meta & 3;
    const upside = (meta & 4) === 4;
    const shape = (meta >> 3) & 7;
    const base: ShapeBox = upside ? [0, 0.5, 0, 1, 1, 1] : [0, 0, 0, 1, 0.5, 1];
    const yLo = upside ? 0 : 0.5;
    const yHi = upside ? 0.5 : 1;
    const tops = stairTopBoxes(facing, shape, yLo, yHi);
    tops.push(base);
    return tops;
}

// Neighbor descriptor for stair-corner resolution: the canonical tall-side direction
// and the half (upside-down state). `null` means "not a connectable stair".
export interface StairNeighbor { back: number; upside: boolean; }

/**
 * Resolve a stair's corner shape from its neighbors, mirroring Minecraft Java's
 * StairBlock.getStairsShape conceptually. A perpendicular stair sharing the same
 * half on the tall side makes an OUTER corner; one on the low/open side makes an
 * INNER corner; left/right is decided by counter-clockwise orientation.
 *
 * `getNeighbor(dx, dz)` returns the stair at that horizontal offset (or null). The
 * caller supplies world access; this stays a pure function for easy testing.
 */
export function resolveStairShape(
    facing: number,
    upside: boolean,
    getNeighbor: (dx: number, dz: number) => StairNeighbor | null
): number {
    const back = FACING_TO_BACK[facing]; // this stair's tall side (Java "facing")

    const canTakeShape = (dir: number): boolean => {
        const v = DIR_VEC[dir];
        const s = getNeighbor(v[0], v[1]);
        // A corner is only taken if the block that side is NOT an identically-oriented
        // stair (otherwise the run reads as straight, like Java's canTakeShape).
        return !s || s.back !== back || s.upside !== upside;
    };

    // Tall-side neighbor -> outer corner.
    const fv = DIR_VEC[back];
    const front = getNeighbor(fv[0], fv[1]);
    if (front && front.upside === upside && DIR_AXIS[front.back] !== DIR_AXIS[back]
        && canTakeShape(DIR_OPP[front.back])) {
        return front.back === DIR_CCW[back] ? STAIR_SHAPE_OUTER_LEFT : STAIR_SHAPE_OUTER_RIGHT;
    }

    // Low-side neighbor -> inner corner.
    const bv = DIR_VEC[DIR_OPP[back]];
    const rear = getNeighbor(bv[0], bv[1]);
    if (rear && rear.upside === upside && DIR_AXIS[rear.back] !== DIR_AXIS[back]
        && canTakeShape(rear.back)) {
        return rear.back === DIR_CCW[back] ? STAIR_SHAPE_INNER_LEFT : STAIR_SHAPE_INNER_RIGHT;
    }

    return STAIR_SHAPE_STRAIGHT;
}

// Decode the stored facing meta into the canonical tall-side direction (for use by
// resolveStairShape's getNeighbor callback). Kept here so the facing<->direction
// convention lives in one place.
export function stairBackDir(meta: number): number {
    return FACING_TO_BACK[meta & 3];
}

// Cross-rendered plants (kept in sync with IS_CROSS in geometry.ts). Their billboards
// span the whole cell, so a full-cube selection box reads as a solid block — give them
// a smaller, plant-sized box instead.
const CROSS_PLANT_TYPES: ReadonlySet<BlockType> = new Set([
    BlockType.SAPLING, BlockType.SPRUCE_SAPLING, BlockType.BIRCH_SAPLING, BlockType.CHERRY_SAPLING,
    BlockType.JUNGLE_SAPLING, BlockType.DARK_OAK_SAPLING, BlockType.ACACIA_SAPLING,
    BlockType.DEAD_BUSH, BlockType.GRASS_PLANT, BlockType.ROSE, BlockType.DANDELION,
    BlockType.DEBUG_CROSS, BlockType.PINK_FLOWER,
    // Magnetic Fields resource/objective crystals (cross-plane, slim hitbox).
    BlockType.POSITIVE_MAGNETITE_CRYSTAL, BlockType.NEGATIVE_MAGNETITE_CRYSTAL,
    BlockType.MAGNETIC_SHIELD_CRYSTAL, BlockType.MAGNETITE_SHARD,
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
