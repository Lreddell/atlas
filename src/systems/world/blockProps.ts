
import { BlockType } from '../../types';
import { BLOCKS } from '../../data/blocks';
import { isSaplingType, isValidSoil } from './trees';
import { isShaped, getShapeBoxes, type ShapeBox } from './blockShapes';

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
    // Slabs/stairs only fill part of their cell. getOpacity is type-only and so can't
    // express that, so lighting routes shaped blocks through getDirectionalOpacity
    // instead (which is shape/face aware). The value here is just a sane fallback for
    // any type-only caller: treat the cell as the underlying full material (opaque).
    if (isShaped(type)) {
        const sdef = BLOCKS[type];
        return sdef && sdef.transparent ? 0 : 15;
    }

    const def = BLOCKS[type];
    if (!def) return 15; // Fallback: Treat unknown blocks as opaque

    if (def.transparent) return 0;
    return 15;
}

// --- Shape-aware (direction/face) light occlusion -------------------------------
//
// The per-cell lighting model stores one light value per voxel, but slabs/stairs
// only fill part of their cell. Whether they block light depends on which face the
// light crosses: a top slab seals its +Y face (skylight can't pass down through it)
// while leaving its sides/bottom open. getDirectionalOpacity answers, for light
// moving in a given direction into a cell, how much that cell attenuates it — using
// the same shape boxes the mesher and collision use, so visuals/physics/light agree.

// Fast "is this a shaped block" lookup mirroring OPACITY_TABLE (lighting hot path).
const SHAPED_TABLE = new Uint8Array(MAX_OPACITY_ID + 1);
for (let id = 0; id <= MAX_OPACITY_ID; id++) {
    if (isShaped(id as BlockType)) SHAPED_TABLE[id] = 1;
}

// A fully-covered entry face blocks like the underlying solid material; an open or
// partially-open face lets light seep through with the same gentle one-step falloff
// a near-transparent block gets (so a slab/stair column still dims going down rather
// than acting like a free sky-light shaft).
const FACE_SOLID_ATTEN = 15;
const FACE_OPEN_ATTEN = 1;

// Face bit order, indexed by outward normal: 0:+X 1:-X 2:+Y 3:-Y 4:+Z 5:-Z.
function faceBitFromNormal(nx: number, ny: number, nz: number): number {
    if (nx === 1) return 0;
    if (nx === -1) return 1;
    if (ny === 1) return 2;
    if (ny === -1) return 3;
    if (nz === 1) return 4;
    return 5;
}

// True if the projected rects (a0,b0,a1,b1 in face-plane coords) fully tile [0,1]^2.
// Runs only on cache miss (a handful of unique shape+meta combos), so the small
// allocations here never touch the lighting hot path.
function rectsCoverUnitSquare(rects: [number, number, number, number][]): boolean {
    const xs = new Set<number>([0, 1]);
    const ys = new Set<number>([0, 1]);
    for (const r of rects) { xs.add(r[0]); xs.add(r[2]); ys.add(r[1]); ys.add(r[3]); }
    const xa = [...xs].sort((a, b) => a - b);
    const ya = [...ys].sort((a, b) => a - b);
    for (let i = 0; i < xa.length - 1; i++) {
        const mx = (xa[i] + xa[i + 1]) / 2;
        for (let j = 0; j < ya.length - 1; j++) {
            const my = (ya[j] + ya[j + 1]) / 2;
            let covered = false;
            for (const r of rects) {
                if (mx > r[0] && mx < r[2] && my > r[1] && my < r[3]) { covered = true; break; }
            }
            if (!covered) return false;
        }
    }
    return true;
}

// Push the projected rects of every box touching `face` (outward-normal index
// 0:+X 1:-X 2:+Y 3:-Y 4:+Z 5:-Z) onto `out`, in the face plane's 2D coords. Opposite
// faces (e.g. +X and -X) share the same projection, so source-exit and target-entry
// rects land in one comparable coordinate space for paired coverage.
function collectFaceRects(boxes: ShapeBox[], face: number, out: [number, number, number, number][]): void {
    let touchIdx: number, touchVal: number, aMin: number, aMax: number, bMin: number, bMax: number;
    switch (face) {
        case 0: touchIdx = 3; touchVal = 1; aMin = 1; aMax = 4; bMin = 2; bMax = 5; break; // +X -> (y,z)
        case 1: touchIdx = 0; touchVal = 0; aMin = 1; aMax = 4; bMin = 2; bMax = 5; break; // -X -> (y,z)
        case 2: touchIdx = 4; touchVal = 1; aMin = 0; aMax = 3; bMin = 2; bMax = 5; break; // +Y -> (x,z)
        case 3: touchIdx = 1; touchVal = 0; aMin = 0; aMax = 3; bMin = 2; bMax = 5; break; // -Y -> (x,z)
        case 4: touchIdx = 5; touchVal = 1; aMin = 0; aMax = 3; bMin = 1; bMax = 4; break; // +Z -> (x,y)
        default: touchIdx = 2; touchVal = 0; aMin = 0; aMax = 3; bMin = 1; bMax = 4; break; // -Z -> (x,y)
    }
    for (const box of boxes) {
        if (box[touchIdx] !== touchVal) continue;
        out.push([box[aMin], box[bMin], box[aMax], box[bMax]]);
    }
}

// Whether the shape's geometry fully seals one of the 6 cell faces.
function faceCovered(boxes: ShapeBox[], face: number): boolean {
    const rects: [number, number, number, number][] = [];
    collectFaceRects(boxes, face, rects);
    if (rects.length === 0) return false;
    return rectsCoverUnitSquare(rects);
}

// 6-bit per-face coverage mask, cached per (type, meta). getShapeBoxes (which can
// allocate for stairs) is only hit on the first lookup of each combo; after warmup
// this is a single Map.get on the BFS path.
const faceCoverCache = new Map<number, number>();
function getFaceCoverMask(type: BlockType, meta: number): number {
    const key = (type << 8) | (meta & 0xFF);
    let mask = faceCoverCache.get(key);
    if (mask === undefined) {
        const boxes = getShapeBoxes(type, meta);
        mask = 0;
        for (let face = 0; face < 6; face++) {
            if (faceCovered(boxes, face)) mask |= (1 << face);
        }
        faceCoverCache.set(key, mask);
    }
    return mask;
}

/**
 * Attenuation a cell applies to light entering it as that light moves in
 * direction (dx,dy,dz) — exactly one of which is ±1. For ordinary blocks this is
 * direction-independent and delegates to getOpacity. For slabs/stairs it depends on
 * the entry face: light enters through the face whose outward normal is -(dx,dy,dz),
 * so if the shape fully seals that face the light is blocked like the solid material,
 * otherwise it passes through the open part with a one-step falloff.
 */
export function getDirectionalOpacity(type: BlockType, meta: number, dx: number, dy: number, dz: number): number {
    if (type > MAX_OPACITY_ID || SHAPED_TABLE[type] === 0) return getOpacity(type);
    const face = faceBitFromNormal(-dx, -dy, -dz);
    const mask = getFaceCoverMask(type, meta);
    return (mask & (1 << face)) !== 0 ? FACE_SOLID_ATTEN : FACE_OPEN_ATTEN;
}

// True if the shaped block seals the face whose outward normal is (nx,ny,nz).
function shapedFaceSealed(type: BlockType, meta: number, nx: number, ny: number, nz: number): boolean {
    if (type > MAX_OPACITY_ID || SHAPED_TABLE[type] === 0) return false;
    const mask = getFaceCoverMask(type, meta);
    return (mask & (1 << faceBitFromNormal(nx, ny, nz))) !== 0;
}

// Cached "do the source-exit and target-entry faces together seal the crossing?"
// test. Only consulted when both blocks are shaped. Keyed by a packed integer so the
// BFS hot path never allocates; getShapeBoxes (which may allocate) runs on miss only.
const pairedSealCache = new Map<number, number>();
function pairedFaceSealed(
    srcType: BlockType, srcMeta: number,
    tgtType: BlockType, tgtMeta: number,
    dx: number, dy: number, dz: number
): boolean {
    const srcFace = faceBitFromNormal(dx, dy, dz);
    const key = ((((srcType * 256 + srcMeta) * 256 + tgtType) * 256 + tgtMeta) * 6 + srcFace);
    let v = pairedSealCache.get(key);
    if (v === undefined) {
        const rects: [number, number, number, number][] = [];
        collectFaceRects(getShapeBoxes(srcType, srcMeta), srcFace, rects);
        collectFaceRects(getShapeBoxes(tgtType, tgtMeta), faceBitFromNormal(-dx, -dy, -dz), rects);
        v = rects.length > 0 && rectsCoverUnitSquare(rects) ? 1 : 0;
        pairedSealCache.set(key, v);
    }
    return v === 1;
}

/**
 * Attenuation for light crossing from a source cell into a target cell moving in
 * direction (dx,dy,dz) — the BFS propagation rule. Extends getDirectionalOpacity
 * (target entry face) with the SOURCE's exit face and, when both blocks are shaped,
 * with PAIRED coverage: two partial faces whose projections together tile the shared
 * boundary seal it even though neither does alone (e.g. a bottom slab beside a top
 * slab across their vertical edge). A shaped cell therefore can't leak light it
 * holds from an open side back out through a sealed/jointly-sealed side.
 *
 * Rule: fully sealed source exit OR target entry OR jointly-sealed crossing -> blocked
 * (15); otherwise the target's normal one-step falloff.
 */
export function getPairedFaceOcclusion(
    srcType: BlockType, srcMeta: number,
    tgtType: BlockType, tgtMeta: number,
    dx: number, dy: number, dz: number
): number {
    const base = getDirectionalOpacity(tgtType, tgtMeta, dx, dy, dz);
    if (base >= FACE_SOLID_ATTEN) return FACE_SOLID_ATTEN; // target already fully blocks

    const srcShaped = srcType <= MAX_OPACITY_ID && SHAPED_TABLE[srcType] === 1;
    if (!srcShaped) return base; // a non-shaped source contributes no extra occlusion

    const tgtShaped = tgtType <= MAX_OPACITY_ID && SHAPED_TABLE[tgtType] === 1;
    if (!tgtShaped) {
        // Shaped source into a transparent/non-shaped target: only a fully sealed
        // source exit face blocks (no partner geometry to combine with).
        return shapedFaceSealed(srcType, srcMeta, dx, dy, dz) ? FACE_SOLID_ATTEN : base;
    }
    // Both shaped: combine partial source-exit and target-entry coverage.
    return pairedFaceSealed(srcType, srcMeta, tgtType, tgtMeta, dx, dy, dz) ? FACE_SOLID_ATTEN : base;
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
