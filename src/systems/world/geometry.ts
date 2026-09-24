
import { CHUNK_SIZE, WORLD_HEIGHT, MIN_Y, MAX_Y } from '../../constants';
import { FACE_DATA } from './worldConstants';
import { BlockType } from '../../types';
import { BLOCKS, ATLAS_COLS } from '../../data/blocks';
import { CROSS_RENDERED_BLOCKS } from '../../data/spriteBlocks';
import { index3D } from './worldCoords';
import { resolveTexture, resolveTile } from './textureResolver';
import { getOpacity } from './blockProps';
import { isShaped, getShapeBoxes } from './blockShapes';
import { getAtlasDimensions, ATLAS_RAW_TILE_SIZE, ATLAS_PADDING, ATLAS_STRIDE } from '../../utils/textures';
import { AO_BYTES, FACE_INDEX, SWAY_BIT, VoxelClass, applyUvVariant, isFluidBlock, lightByte, uvVariantFor, uvVariationMode, voxelAlphaOf, voxelClassOf } from './voxelVertex';

export interface NeighborData {
    left?: Uint8Array;
    right?: Uint8Array;
    front?: Uint8Array;
    back?: Uint8Array;
}

export interface NeighborLight {
    center: Uint8Array;
    left?: Uint8Array;
    right?: Uint8Array;
    front?: Uint8Array;
    back?: Uint8Array;
}

export interface GeometryAttributes {
    positions: Float32Array;
    normals: Float32Array;
    /** Atlas UVs; on a tiled face (see tiles), UVs in blocks across the face. */
    uvs: Float32Array;
    /** Four bytes a vertex: sky light, block light, AO, class | emission | sway (see voxelVertex.ts). */
    colors: Uint8Array;
    /** One a vertex: TILE_RAW, or a tiled face's packed tile (packTile). */
    tiles: Uint16Array;
    indices: Uint32Array;
}

/** A face whose uvs are atlas UVs already: sprites, fluids, beds, slabs and stairs. */
export const TILE_RAW = 0x8000;

/**
 * A tiled face (a greedy-merged run of full blocks): its atlas slot (10 bits),
 * quarter turns (2 bits) and texture variation mode (2 bits, voxelVertex.ts).
 * The shader repeats the tile once per block across the face.
 */
export const packTile = (texIdx: number, uvRot: number, variation: number): number =>
    (texIdx & 1023) | ((uvRot & 3) << 10) | ((variation & 3) << 12);

export interface GeometryResult {
    opaque: GeometryAttributes;
    cutout: GeometryAttributes;
    transparent: GeometryAttributes;
}

// Reusable scratch buffers that grow on demand. Starting small matters: these are
// module-level in every context that imports this file (main thread + each pooled
// worker), and the previous fixed 100k-face buffers cost ~60MB per context.
const INITIAL_FACES = 8192;
// Absolute ceiling as a runaway guard (~3x the old fixed size).
const HARD_MAX_FACES = 300000;

class GeometryBuffer {
    capacityVerts = INITIAL_FACES * 4;
    positions = new Float32Array(this.capacityVerts * 3);
    normals = new Float32Array(this.capacityVerts * 3);
    uvs = new Float32Array(this.capacityVerts * 2);
    colors = new Uint8Array(this.capacityVerts * 4);
    tiles = new Uint16Array(this.capacityVerts);
    indices = new Uint32Array((this.capacityVerts / 4) * 6);

    vCount = 0;
    iCount = 0;

    reset() {
        this.vCount = 0;
        this.iCount = 0;
    }

    /** Grows backing arrays so at least extraFaces more quads fit. Returns false only at the hard cap. */
    ensureCapacity(extraFaces: number): boolean {
        const needed = this.vCount + extraFaces * 4;
        if (needed <= this.capacityVerts) return true;
        if (needed > HARD_MAX_FACES * 4) return false;

        let newCapacity = this.capacityVerts;
        while (newCapacity < needed) newCapacity *= 2;
        newCapacity = Math.min(newCapacity, HARD_MAX_FACES * 4);

        const growF32 = (old: Float32Array, perVert: number) => {
            const next = new Float32Array(newCapacity * perVert);
            next.set(old);
            return next;
        };
        this.positions = growF32(this.positions, 3);
        this.normals = growF32(this.normals, 3);
        this.uvs = growF32(this.uvs, 2);
        const nextColors = new Uint8Array(newCapacity * 4);
        nextColors.set(this.colors);
        this.colors = nextColors;
        const nextTiles = new Uint16Array(newCapacity);
        nextTiles.set(this.tiles);
        this.tiles = nextTiles;
        const nextIndices = new Uint32Array((newCapacity / 4) * 6);
        nextIndices.set(this.indices);
        this.indices = nextIndices;
        this.capacityVerts = newCapacity;
        return true;
    }

    pushQuad(
        p1x: number, p1y: number, p1z: number,
        p2x: number, p2y: number, p2z: number,
        p3x: number, p3y: number, p3z: number,
        p4x: number, p4y: number, p4z: number,
        nx: number, ny: number, nz: number,
        uMin: number, uMax: number, vMin: number, vMax: number,
        sky: number, block: number, ao: number, alphaBottom: number, alphaTop: number
    ) {
        if (!this.ensureCapacity(1)) return;

        let vp = this.vCount * 3;
        let up = this.vCount * 2;
        let cp = this.vCount * 4;
        let ip = this.iCount;
        const vBase = this.vCount;
        const colors = this.colors;

        // Vertex 1
        this.positions[vp] = p1x; this.positions[vp+1] = p1y; this.positions[vp+2] = p1z;
        this.normals[vp] = nx; this.normals[vp+1] = ny; this.normals[vp+2] = nz;
        colors[cp] = sky; colors[cp+1] = block; colors[cp+2] = ao; colors[cp+3] = alphaBottom;
        this.uvs[up] = uMin; this.uvs[up+1] = vMin; // 0,0

        // Vertex 2
        vp += 3; up += 2; cp += 4;
        this.positions[vp] = p2x; this.positions[vp+1] = p2y; this.positions[vp+2] = p2z;
        this.normals[vp] = nx; this.normals[vp+1] = ny; this.normals[vp+2] = nz;
        colors[cp] = sky; colors[cp+1] = block; colors[cp+2] = ao; colors[cp+3] = alphaBottom;
        this.uvs[up] = uMax; this.uvs[up+1] = vMin; // 1,0

        // Vertex 3
        vp += 3; up += 2; cp += 4;
        this.positions[vp] = p3x; this.positions[vp+1] = p3y; this.positions[vp+2] = p3z;
        this.normals[vp] = nx; this.normals[vp+1] = ny; this.normals[vp+2] = nz;
        colors[cp] = sky; colors[cp+1] = block; colors[cp+2] = ao; colors[cp+3] = alphaTop;
        this.uvs[up] = uMax; this.uvs[up+1] = vMax; // 1,1

        // Vertex 4
        vp += 3; up += 2; cp += 4;
        this.positions[vp] = p4x; this.positions[vp+1] = p4y; this.positions[vp+2] = p4z;
        this.normals[vp] = nx; this.normals[vp+1] = ny; this.normals[vp+2] = nz;
        colors[cp] = sky; colors[cp+1] = block; colors[cp+2] = ao; colors[cp+3] = alphaTop;
        this.uvs[up] = uMin; this.uvs[up+1] = vMax; // 0,1

        this.tiles.fill(TILE_RAW, vBase, vBase + 4);

        // Indices (0, 1, 2,  0, 2, 3)
        this.indices[ip] = vBase;
        this.indices[ip+1] = vBase + 1;
        this.indices[ip+2] = vBase + 2;
        this.indices[ip+3] = vBase;
        this.indices[ip+4] = vBase + 2;
        this.indices[ip+5] = vBase + 3;

        this.vCount += 4;
        this.iCount += 6;
    }

    // Creates copies of the active region to send back
    slice(): GeometryAttributes {
        return {
            positions: this.positions.slice(0, this.vCount * 3),
            normals: this.normals.slice(0, this.vCount * 3),
            uvs: this.uvs.slice(0, this.vCount * 2),
            colors: this.colors.slice(0, this.vCount * 4),
            tiles: this.tiles.slice(0, this.vCount),
            indices: this.indices.slice(0, this.iCount)
        };
    }
}

// Global scratch buffers reused across calls (safe because synchronous per-worker)
const opaqueBuffer = new GeometryBuffer();
const cutoutBuffer = new GeometryBuffer();
const transparentBuffer = new GeometryBuffer();
// One slice's merge keys for the greedy pass, sized for the tallest slice (a side
// face runs the chunk's width by its full height).
const greedyKeys = new Float64Array(CHUNK_SIZE * WORLD_HEIGHT);

const MAX_BLOCK_ID = Math.max(
    ...Object.values(BlockType).filter((v): v is number => typeof v === 'number')
);

const IS_CUTOUT = new Uint8Array(MAX_BLOCK_ID + 1);
const IS_TRANSPARENT = new Uint8Array(MAX_BLOCK_ID + 1);
const IS_CROSS = new Uint8Array(MAX_BLOCK_ID + 1);

// Every cross-rendered sprite block (single shared list) plus the cutout cubes
// (leaves, lava sheets, beds). A cutout block left out of this table meshes
// into the solid buffer, whose material has no alpha test, so its transparent
// texels render as black.
[
    BlockType.LEAVES,
    BlockType.SPRUCE_LEAVES,
    BlockType.CHERRY_LEAVES,
    BlockType.BIRCH_LEAVES,
    BlockType.JUNGLE_LEAVES,
    BlockType.DARK_OAK_LEAVES,
    BlockType.ACACIA_LEAVES,
    BlockType.LAVA,
    BlockType.BED_FOOT,
    BlockType.BED_HEAD,
    ...CROSS_RENDERED_BLOCKS,
].forEach(t => { IS_CUTOUT[t] = 1; });

[
    BlockType.WATER,
    BlockType.GLASS,
    BlockType.ICE
].forEach(t => { IS_TRANSPARENT[t] = 1; });

for (const t of CROSS_RENDERED_BLOCKS) IS_CROSS[t] = 1;

// Slabs / stairs: rendered as partial boxes, never as full cubes or greedy quads.
const IS_SHAPED = new Uint8Array(MAX_BLOCK_ID + 1);
for (let id = 0; id <= MAX_BLOCK_ID; id++) {
    if (isShaped(id as BlockType)) IS_SHAPED[id] = 1;
}

function isOpaqueGreedyCandidate(type: BlockType): boolean {
    if (type === BlockType.AIR) return false;
    if (IS_CUTOUT[type] || IS_TRANSPARENT[type] || IS_CROSS[type] || IS_SHAPED[type]) return false;
    const def = BLOCKS[type];
    return !!def && !def.transparent;
}

/** Full opaque cubes: every face of one is drawn by the greedy pass (a byte a block id). */
const IS_GREEDY = new Uint8Array(Math.max(256, MAX_BLOCK_ID + 1));
for (let id = 0; id <= MAX_BLOCK_ID; id++) {
    if (isOpaqueGreedyCandidate(id as BlockType)) IS_GREEDY[id] = 1;
}

type FaceName = 'right' | 'left' | 'top' | 'bottom' | 'front' | 'back';

/**
 * How a face direction's quads lie in the chunk: the axis it faces along (n),
 * the axes its BL->BR (u) and BL->TL (v) edges run along, and each corner's
 * 0/1 offset on those three axes, so a merged run of w x h faces is the same
 * quad stretched.
 */
interface GreedyLayout {
    name: FaceName;
    dir: number[];
    nAxis: number;
    uAxis: number;
    vAxis: number;
    corners: number[][];
    aoVectors: number[][][];
}

const axisOf = (v: readonly number[]): number => (v[0] !== 0 ? 0 : v[1] !== 0 ? 1 : 2);
const GREEDY_LAYOUTS: GreedyLayout[] = (['right', 'left', 'top', 'bottom', 'front', 'back'] as const).map((name) => {
    const face = FACE_DATA[name];
    const c = face.corners;
    const nAxis = axisOf(face.dir);
    const uAxis = axisOf([c[1][0] - c[0][0], c[1][1] - c[0][1], c[1][2] - c[0][2]]);
    const vAxis = axisOf([c[3][0] - c[0][0], c[3][1] - c[0][1], c[3][2] - c[0][2]]);
    return {
        name, dir: face.dir, nAxis, uAxis, vAxis,
        corners: c.map(k => [k[nAxis], k[uAxis], k[vAxis]]),
        aoVectors: face.aoVectors,
    };
});

// Face descriptors for the partial-box (slab/stair) emitter.
const SHAPED_FACES: { name: 'right' | 'left' | 'top' | 'bottom' | 'front' | 'back', dx: number, dy: number, dz: number }[] = [
    { name: 'right', dx: 1, dy: 0, dz: 0 },
    { name: 'left', dx: -1, dy: 0, dz: 0 },
    { name: 'top', dx: 0, dy: 1, dz: 0 },
    { name: 'bottom', dx: 0, dy: -1, dz: 0 },
    { name: 'front', dx: 0, dy: 0, dz: 1 },
    { name: 'back', dx: 0, dy: 0, dz: -1 },
];

export function generateGeometryData(
    _cx: number,
    _cz: number,
    chunk: Uint8Array,
    metaData: Uint8Array | undefined,
    neighbors: NeighborData,
    lights: NeighborLight,
    // When true (far chunks), faces whose facing cell has zero sky AND zero block
    // light are skipped entirely. Enclosed cave geometry is only ever visible from
    // inside the cave (i.e. when the chunk is near) so distant chunks don't need
    // it. This typically halves or better the triangle count of a full-depth chunk.
    cullDarkFaces: boolean = false
): GeometryResult {
    // Reset pointers
    opaqueBuffer.reset();
    cutoutBuffer.reset();
    transparentBuffer.reset();
    
    const getLightFast = (x: number, y: number, z: number): number => {
        if (y < MIN_Y || y > MAX_Y) return (15 << 4);
        if (x >= 0 && x < CHUNK_SIZE && z >= 0 && z < CHUNK_SIZE) {
            return lights.center[index3D(x, y, z)];
        }
        let t: Uint8Array | undefined;
        let lx = x; let lz = z;
        if (x < 0) { t = lights.left; lx += CHUNK_SIZE; }
        else if (x >= CHUNK_SIZE) { t = lights.right; lx -= CHUNK_SIZE; }
        else if (z < 0) { t = lights.back; lz += CHUNK_SIZE; }
        else if (z >= CHUNK_SIZE) { t = lights.front; lz -= CHUNK_SIZE; }
        if (t && y >= MIN_Y && y <= MAX_Y) {
            const clampedX = Math.max(0, Math.min(CHUNK_SIZE - 1, lx));
            const clampedZ = Math.max(0, Math.min(CHUNK_SIZE - 1, lz));
            return t[index3D(clampedX, y, clampedZ)];
        }
        return (15 << 4);
    };

    const directions = ['right', 'left', 'top', 'bottom', 'front', 'back'] as const;
    const { width: atlasWidth, height: atlasHeight } = getAtlasDimensions();
    // Four corner vertices x [sky, block, AO, class|emission] bytes.
    const cornerScratch = new Uint8Array(16);
    const uvScratch = new Float32Array(8);
    const worldX0 = _cx * CHUNK_SIZE;
    const worldZ0 = _cz * CHUNK_SIZE;

    const getTypeFast = (x: number, y: number, z: number): BlockType => {
        if (y < MIN_Y || y > MAX_Y) return BlockType.AIR;
        if (x >= 0 && x < CHUNK_SIZE && z >= 0 && z < CHUNK_SIZE) {
            return chunk[index3D(x, y, z)] as BlockType;
        }

        if (x < 0) {
            if (!neighbors.left) return BlockType.AIR;
            const lz = Math.max(0, Math.min(CHUNK_SIZE - 1, z));
            return neighbors.left[index3D(CHUNK_SIZE + x, y, lz)] as BlockType;
        }
        if (x >= CHUNK_SIZE) {
            if (!neighbors.right) return BlockType.AIR;
            const lz = Math.max(0, Math.min(CHUNK_SIZE - 1, z));
            return neighbors.right[index3D(x - CHUNK_SIZE, y, lz)] as BlockType;
        }
        if (z < 0) {
            if (!neighbors.back) return BlockType.AIR;
            const lx = Math.max(0, Math.min(CHUNK_SIZE - 1, x));
            return neighbors.back[index3D(lx, y, CHUNK_SIZE + z)] as BlockType;
        }
        if (z >= CHUNK_SIZE) {
            if (!neighbors.front) return BlockType.AIR;
            const lx = Math.max(0, Math.min(CHUNK_SIZE - 1, x));
            return neighbors.front[index3D(lx, y, z - CHUNK_SIZE)] as BlockType;
        }
        return BlockType.AIR;
    };

    // Slabs/stairs attenuate light by shape (getDirectionalOpacity), so getOpacity no
    // longer flags them as occluders, but they're still solid partial geometry, so
    // they must darken neighbouring AO corners. Treat any shaped block as an occluder.
    // Fluids never occlude: a sea floor or a shoreline is open space, not a crevice.
    const isAOOccluder = (type: BlockType) =>
        type !== BlockType.AIR && !isFluidBlock(type) && (IS_SHAPED[type] === 1 || getOpacity(type) >= 2);

    // Samples one face corner around the (outward) cell (cx, cy, cz): smooth sky and
    // block light over the four cells meeting at the corner, and AO from the
    // three solid neighbours, written as the corner's four vertex bytes.
    const writeCorner = (
        out: Uint8Array, offset: number, alpha: number,
        cx: number, cy: number, cz: number,
        a1x: number, a1y: number, a1z: number, a1Valid: boolean,
        a2x: number, a2y: number, a2z: number, a2Valid: boolean,
    ) => {
        const rc = getLightFast(cx, cy, cz);
        const rs1 = a1Valid ? getLightFast(cx + a1x, cy + a1y, cz + a1z) : rc;
        const rs2 = a2Valid ? getLightFast(cx + a2x, cy + a2y, cz + a2z) : rc;
        const rco = (a1Valid && a2Valid) ? getLightFast(cx + a1x + a2x, cy + a1y + a2y, cz + a1z + a2z) : rc;
        const s1Occ = a1Valid && isAOOccluder(getTypeFast(cx + a1x, cy + a1y, cz + a1z)) ? 1 : 0;
        const s2Occ = a2Valid && isAOOccluder(getTypeFast(cx + a2x, cy + a2y, cz + a2z)) ? 1 : 0;
        const cOcc = (a1Valid && a2Valid && isAOOccluder(getTypeFast(cx + a1x + a2x, cy + a1y + a2y, cz + a1z + a2z))) ? 1 : 0;
        const occluders = (s1Occ === 1 && s2Occ === 1) ? 3 : (s1Occ + s2Occ + cOcc);
        const sky = (((rc >> 4) & 0xF) + ((rs1 >> 4) & 0xF) + ((rs2 >> 4) & 0xF) + ((rco >> 4) & 0xF)) / 4.0;
        const block = ((rc & 0xF) + (rs1 & 0xF) + (rs2 & 0xF) + (rco & 0xF)) / 4.0;
        out[offset] = lightByte(sky);
        out[offset + 1] = lightByte(block);
        out[offset + 2] = AO_BYTES[occluders];
        out[offset + 3] = alpha;
    };

    const copyCorner = (buffer: GeometryBuffer, cp: number, offset: number) => {
        buffer.colors[cp] = cornerScratch[offset];
        buffer.colors[cp + 1] = cornerScratch[offset + 1];
        buffer.colors[cp + 2] = cornerScratch[offset + 2];
        buffer.colors[cp + 3] = cornerScratch[offset + 3];
    };

    // A quad's two triangles, split along its brighter diagonal (corners from
    // the colours just written at vBase). A lone dark corner then shades only
    // its own triangle instead of streaking across the face along whichever
    // diagonal the split happened to take.
    const writeQuadIndices = (buffer: GeometryBuffer, vBase: number) => {
        const c = buffer.colors;
        const o = vBase * 4;
        const diagonal02 = c[o] + c[o + 1] + c[o + 2] + c[o + 8] + c[o + 9] + c[o + 10];
        const diagonal13 = c[o + 4] + c[o + 5] + c[o + 6] + c[o + 12] + c[o + 13] + c[o + 14];
        const ip = buffer.iCount;
        const first = diagonal02 >= diagonal13 ? 0 : 1;
        buffer.indices[ip] = vBase + first;
        buffer.indices[ip + 1] = vBase + first + 1;
        buffer.indices[ip + 2] = vBase + first + 2;
        buffer.indices[ip + 3] = vBase + first;
        buffer.indices[ip + 4] = vBase + ((first + 2) & 3);
        buffer.indices[ip + 5] = vBase + ((first + 3) & 3);
        buffer.iCount += 6;
    };

    // Emits a slab/stairs block as a set of partial boxes. Each box face is drawn
    // unless it lies flush on the cell boundary against a full opaque cube. UVs are
    // sub-sampled from the parent block's texture so a half-height side shows the
    // matching half of the texture (not a squished full tile).
    const emitShapedBlock = (x: number, y: number, z: number, type: BlockType, meta: number) => {
        const def = BLOCKS[type];
        const parentType = (def.textureParent ?? type) as BlockType;
        const boxes = getShapeBoxes(type, meta);

        for (let bi = 0; bi < boxes.length; bi++) {
            const box = boxes[bi];
            const bx0 = box[0], by0 = box[1], bz0 = box[2];
            const bx1 = box[3], by1 = box[4], bz1 = box[5];

            for (let fi = 0; fi < 6; fi++) {
                const f = SHAPED_FACES[fi];
                const face = FACE_DATA[f.name];

                // Only a face flush with the cell edge can be hidden, and only by a
                // full opaque neighbour cube.
                let onBoundary: boolean;
                if (f.dx === 1) onBoundary = bx1 === 1;
                else if (f.dx === -1) onBoundary = bx0 === 0;
                else if (f.dy === 1) onBoundary = by1 === 1;
                else if (f.dy === -1) onBoundary = by0 === 0;
                else if (f.dz === 1) onBoundary = bz1 === 1;
                else onBoundary = bz0 === 0;

                if (onBoundary && isOpaqueGreedyCandidate(getTypeFast(x + f.dx, y + f.dy, z + f.dz))) {
                    continue;
                }

                // Note: shaped blocks intentionally ignore cullDarkFaces, they are
                // rare, player-placed, and small, so far-chunk dark-face culling would
                // risk punching visible holes in them for negligible triangle savings.
                //
                // Each face samples light/AO from the adjacent (outward) cell, like a
                // full block face. The shaped cell's own light is shape-attenuated by
                // getDirectionalOpacity, so the open side stays lit while the sealed
                // side reads dark. The outward cell:
                const nx = x + f.dx, ny = y + f.dy, nz = z + f.dz;

                const { uvs } = resolveTexture(parentType, f.name, f.dx, f.dy, f.dz, 0);
                const uBL = uvs[0], vBL = uvs[1];
                const uBR = uvs[2], vBR = uvs[3];
                const uTR = uvs[4], vTR = uvs[5];
                const uTL = uvs[6], vTL = uvs[7];

                // Texture parameter axes for this face (from the full-cube corners).
                const c = face.corners;
                const aAxis = [c[1][0] - c[0][0], c[1][1] - c[0][1], c[1][2] - c[0][2]];
                const bAxis = [c[3][0] - c[0][0], c[3][1] - c[0][1], c[3][2] - c[0][2]];
                const aIdx = aAxis[0] !== 0 ? 0 : (aAxis[1] !== 0 ? 1 : 2);
                const bIdx = bAxis[0] !== 0 ? 0 : (bAxis[1] !== 0 ? 1 : 2);
                const aPos = aAxis[aIdx] > 0;
                const bPos = bAxis[bIdx] > 0;

                if (!opaqueBuffer.ensureCapacity(1)) continue;
                let vp = opaqueBuffer.vCount * 3;
                let up = opaqueBuffer.vCount * 2;
                let cp = opaqueBuffer.vCount * 4;
                const vBase = opaqueBuffer.vCount;
                const alpha = voxelAlphaOf(type);

                for (let k = 0; k < 4; k++) {
                    const corner = c[k];
                    // Box-clamped local position: full-corner 1 -> box max, 0 -> box min.
                    const lx = corner[0] ? bx1 : bx0;
                    const ly = corner[1] ? by1 : by0;
                    const lz = corner[2] ? bz1 : bz0;
                    const localA = aIdx === 0 ? lx : (aIdx === 1 ? ly : lz);
                    const localB = bIdx === 0 ? lx : (bIdx === 1 ? ly : lz);
                    const a = aPos ? localA : 1 - localA;
                    const b = bPos ? localB : 1 - localB;
                    const ia = 1 - a, ib = 1 - b;
                    const u = uBL * ia * ib + uBR * a * ib + uTR * a * b + uTL * ia * b;
                    const v = vBL * ia * ib + vBR * a * ib + vTR * a * b + vTL * ia * b;

                    // Per-vertex AO + smooth light, same model as full-block faces, so
                    // slabs/stairs are shaded (not flat). Sampled around the outward cell.
                    //
                    // A perpendicular neighbour only borders this vertex if the box actually
                    // reaches the cell edge in that direction. A sub-box edge that stops
                    // mid-cell (e.g. a stair step's underside at y=0.5) has no neighbour
                    // there, so it must not pick up AO/dark light from the cell beyond :
                    // that over-reach was darkening the tops of stairs.
                    const av = face.aoVectors[k];
                    const a1 = av[0], a2 = av[1];
                    const reaches = (a: number[]): boolean =>
                        a[0] !== 0 ? (a[0] > 0 ? lx === 1 : lx === 0)
                      : a[1] !== 0 ? (a[1] > 0 ? ly === 1 : ly === 0)
                      :              (a[2] > 0 ? lz === 1 : lz === 0);
                    writeCorner(
                        cornerScratch, 0, alpha, nx, ny, nz,
                        a1[0], a1[1], a1[2], reaches(a1),
                        a2[0], a2[1], a2[2], reaches(a2),
                    );

                    opaqueBuffer.positions[vp] = x + lx;
                    opaqueBuffer.positions[vp + 1] = y + ly;
                    opaqueBuffer.positions[vp + 2] = z + lz;
                    opaqueBuffer.normals[vp] = f.dx;
                    opaqueBuffer.normals[vp + 1] = f.dy;
                    opaqueBuffer.normals[vp + 2] = f.dz;
                    copyCorner(opaqueBuffer, cp, 0);
                    opaqueBuffer.uvs[up] = u;
                    opaqueBuffer.uvs[up + 1] = v;
                    opaqueBuffer.tiles[vBase + k] = TILE_RAW;
                    vp += 3; up += 2; cp += 4;
                }

                writeQuadIndices(opaqueBuffer, vBase);
                opaqueBuffer.vCount += 4;
            }
        }
    };

    // Writes one quad of a tiled face: `w` faces along the layout's u axis by `h`
    // along v, from cell (u0, v0) of slice s, with corner bytes from cornerScratch.
    const emitTiledQuad = (layout: GreedyLayout, s: number, u0: number, v0: number, w: number, h: number, tile: number) => {
        if (!opaqueBuffer.ensureCapacity(1)) return;
        const vBase = opaqueBuffer.vCount;
        let vp = vBase * 3;
        let up = vBase * 2;
        let cp = vBase * 4;
        const { nAxis, uAxis, vAxis, corners, dir } = layout;
        for (let k = 0; k < 4; k++) {
            const corner = corners[k];
            opaqueBuffer.positions[vp + nAxis] = s + corner[0];
            opaqueBuffer.positions[vp + uAxis] = u0 + corner[1] * w;
            opaqueBuffer.positions[vp + vAxis] = v0 + corner[2] * h;
            opaqueBuffer.normals[vp] = dir[0];
            opaqueBuffer.normals[vp + 1] = dir[1];
            opaqueBuffer.normals[vp + 2] = dir[2];
            copyCorner(opaqueBuffer, cp, k * 4);
            // In blocks: BL (0, 0), BR (w, 0), TR (w, h), TL (0, h).
            opaqueBuffer.uvs[up] = k === 1 || k === 2 ? w : 0;
            opaqueBuffer.uvs[up + 1] = k >= 2 ? h : 0;
            opaqueBuffer.tiles[vBase + k] = tile;
            vp += 3; up += 2; cp += 4;
        }
        writeQuadIndices(opaqueBuffer, vBase);
        opaqueBuffer.vCount += 4;
    };

    // --- Greedy meshing: every face of a full opaque cube -------------------
    // Faces are gathered a slice at a time in each of the six directions. A face
    // whose four corners share one light and AO value (most faces in the open,
    // and most in deep shade) merges with its neighbours into one quad when they
    // show the same tile, turned the same way, under that same flat light, so the
    // merged quad looks exactly like the faces it replaces. Its UVs run in
    // blocks: the shader repeats the tile once per block and gives each block its
    // own texture variant (voxelMaterial.ts). A face with any light or AO gradient
    // stays a quad of its own, so shading never smears across a merge.
    const emitGreedyFaces = (meshMinY: number, meshMaxY: number) => {
        const lo = [0, meshMinY, 0];
        const hi = [CHUNK_SIZE - 1, meshMaxY, CHUNK_SIZE - 1];
        const cell = [0, 0, 0];
        for (const layout of GREEDY_LAYOUTS) {
            const { nAxis, uAxis, vAxis, aoVectors } = layout;
            const dx = layout.dir[0], dy = layout.dir[1], dz = layout.dir[2];
            const uLo = lo[uAxis], vLo = lo[vAxis];
            const U = hi[uAxis] - uLo + 1;
            const V = hi[vAxis] - vLo + 1;
            for (let s = lo[nAxis]; s <= hi[nAxis]; s++) {
                cell[nAxis] = s;
                let mergeable = false;
                for (let j = 0; j < V; j++) {
                    cell[vAxis] = vLo + j;
                    const row = j * U;
                    for (let i = 0; i < U; i++) {
                        greedyKeys[row + i] = 0;
                        cell[uAxis] = uLo + i;
                        const x = cell[0], y = cell[1], z = cell[2];
                        const index = index3D(x, y, z);
                        const type = chunk[index] as BlockType;
                        if (IS_GREEDY[type] !== 1) continue;
                        const nx = x + dx, ny = y + dy, nz = z + dz;
                        const nType = getTypeFast(nx, ny, nz);
                        if (IS_GREEDY[nType] === 1) continue;
                        // Only dark AIR is safely invisible from outside: dark water
                        // (a deep ocean floor) is seen through the water above it.
                        if (cullDarkFaces && nType === BlockType.AIR && getLightFast(nx, ny, nz) === 0) continue;

                        const alpha = voxelAlphaOf(type);
                        for (let k = 0; k < 4; k++) {
                            const a1 = aoVectors[k][0], a2 = aoVectors[k][1];
                            writeCorner(cornerScratch, k * 4, alpha, nx, ny, nz, a1[0], a1[1], a1[2], true, a2[0], a2[1], a2[2], true);
                        }
                        const choice = resolveTile(type, layout.name, dx, dy, dz, metaData ? metaData[index] : 0);
                        const tile = packTile(choice.texIdx, choice.uvRot, uvVariationMode(type));
                        const sky = cornerScratch[0], block = cornerScratch[1], ao = cornerScratch[2];
                        if (cornerScratch[4] === sky && cornerScratch[8] === sky && cornerScratch[12] === sky
                            && cornerScratch[5] === block && cornerScratch[9] === block && cornerScratch[13] === block
                            && cornerScratch[6] === ao && cornerScratch[10] === ao && cornerScratch[14] === ao) {
                            // Flat: tile, class and the one light value, all in one key (exact in a double).
                            greedyKeys[row + i] = 1 + tile + alpha * 0x10000 + sky * 0x1000000 + block * 0x100000000 + ao * 0x10000000000;
                            mergeable = true;
                        } else {
                            emitTiledQuad(layout, s, uLo + i, vLo + j, 1, 1, tile);
                        }
                    }
                }
                if (!mergeable) continue;

                // Grow each run along u, then down v while the whole row matches.
                for (let j = 0; j < V; j++) {
                    const row = j * U;
                    for (let i = 0; i < U;) {
                        const key = greedyKeys[row + i];
                        if (key === 0) { i++; continue; }
                        let w = 1;
                        while (i + w < U && greedyKeys[row + i + w] === key) w++;
                        let h = 1;
                        grow: while (j + h < V) {
                            const next = (j + h) * U + i;
                            for (let t = 0; t < w; t++) if (greedyKeys[next + t] !== key) break grow;
                            h++;
                        }
                        for (let t = 0; t < h; t++) greedyKeys.fill(0, (j + t) * U + i, (j + t) * U + i + w);

                        const packed = key - 1;
                        const tile = packed % 0x10000;
                        const alpha = Math.floor(packed / 0x10000) % 0x100;
                        const sky = Math.floor(packed / 0x1000000) % 0x100;
                        const block = Math.floor(packed / 0x100000000) % 0x100;
                        const ao = Math.floor(packed / 0x10000000000) % 0x100;
                        for (let k = 0; k < 16; k += 4) {
                            cornerScratch[k] = sky;
                            cornerScratch[k + 1] = block;
                            cornerScratch[k + 2] = ao;
                            cornerScratch[k + 3] = alpha;
                        }
                        emitTiledQuad(layout, s, uLo + i, vLo + j, w, h, tile);
                        i += w;
                    }
                }
            }
        }
    };

    // Bound meshing to the occupied Y range, skips the empty sky above terrain,
    // which is most of the 384-block column for typical chunks.
    const LAYER_SIZE = CHUNK_SIZE * CHUNK_SIZE;
    let minOccY = -1;
    let maxOccY = -1;
    for (let y = 0; y < WORLD_HEIGHT; y++) {
        const base = y * LAYER_SIZE;
        let occupied = false;
        for (let i = base; i < base + LAYER_SIZE; i++) {
            if (chunk[i] !== 0) { occupied = true; break; }
        }
        if (occupied) { minOccY = y; break; }
    }
    if (minOccY === -1) {
        // Entirely air, nothing to mesh.
        return {
            opaque: opaqueBuffer.slice(),
            cutout: cutoutBuffer.slice(),
            transparent: transparentBuffer.slice()
        };
    }
    for (let y = WORLD_HEIGHT - 1; y >= minOccY; y--) {
        const base = y * LAYER_SIZE;
        let occupied = false;
        for (let i = base; i < base + LAYER_SIZE; i++) {
            if (chunk[i] !== 0) { occupied = true; break; }
        }
        if (occupied) { maxOccY = y; break; }
    }
    const meshMinY = MIN_Y + minOccY;
    const meshMaxY = MIN_Y + maxOccY;

    emitGreedyFaces(meshMinY, meshMaxY);

    for (let y = meshMinY; y <= meshMaxY; y++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        for (let x = 0; x < CHUNK_SIZE; x++) {
          const index = index3D(x, y, z);
          const type = chunk[index] as BlockType;
          if (type === BlockType.AIR) continue;

          let targetBuffer = opaqueBuffer;
          const def = BLOCKS[type];

          if (!def) continue;
          // Full opaque cubes: the greedy pass drew every face.
          if (IS_GREEDY[type] === 1) continue;

          if (IS_SHAPED[type] === 1) {
              emitShapedBlock(x, y, z, type, metaData ? metaData[index] : 0);
              continue;
          }

          if (IS_CUTOUT[type] === 1) {
              targetBuffer = cutoutBuffer;
          } else if (IS_TRANSPARENT[type] === 1) {
              targetBuffer = transparentBuffer;
          }
          
          const isCross = IS_CROSS[type] === 1;

          if (isCross) {
              const raw = getLightFast(x, y, z);
              if (cullDarkFaces && raw === 0) continue;
              const sky = lightByte((raw >> 4) & 0xF);
              const blockLight = lightByte(raw & 0xF);
              const alphaBottom = voxelAlphaOf(type);
              // Plants bend from the root: only their top corners sway.
              const alphaTop = voxelClassOf(type) === VoxelClass.PLANT ? alphaBottom | SWAY_BIT : alphaBottom;
              
              const texIdx = def.textureSlot || 0;
              
              const col = texIdx % ATLAS_COLS;
              const row = Math.floor(texIdx / ATLAS_COLS);
              
              const pxX = col * ATLAS_STRIDE + ATLAS_PADDING;
              const pxY = row * ATLAS_STRIDE + ATLAS_PADDING;
              
              const u0 = pxX / atlasWidth;
              const u1 = (pxX + ATLAS_RAW_TILE_SIZE) / atlasWidth;
              const v1 = 1.0 - (pxY / atlasHeight);
              const v0 = 1.0 - ((pxY + ATLAS_RAW_TILE_SIZE) / atlasHeight);

              const min = 0.0;
              const max = 1.0;
              
              // Cross 1
              targetBuffer.pushQuad(
                  x+min, y, z+min,
                  x+max, y, z+max,
                  x+max, y+1, z+max,
                  x+min, y+1, z+min,
                  0, 1, 0,
                  u0, u1, v0, v1, sky, blockLight, 255, alphaBottom, alphaTop
              );
              // Cross 2
              targetBuffer.pushQuad(
                  x+min, y, z+max,
                  x+max, y, z+min,
                  x+max, y+1, z+min,
                  x+min, y+1, z+max,
                  0, 1, 0,
                  u0, u1, v0, v1, sky, blockLight, 255, alphaBottom, alphaTop
              );
              continue;
          }
          
          const rotation = metaData ? metaData[index] : 0;
          const isFluid = type === BlockType.WATER || type === BlockType.LAVA;
          const isBed = type === BlockType.BED_FOOT || type === BlockType.BED_HEAD;
          
          let blockHeight = 1.0;
          
          if (isBed) {
              blockHeight = 0.5; 
          } else if (isFluid) {
              let submerged = false;
              if (y < MAX_Y) {
                  const upIndex = index + (CHUNK_SIZE * CHUNK_SIZE);
                  if (upIndex < chunk.length && chunk[upIndex] === type) {
                      submerged = true;
                  }
              }

              if (submerged) {
                  blockHeight = 1.0;
              } else {
                  const level = rotation & 0xF; 
                  if (level === 0) blockHeight = 0.88; 
                  else if (level >= 8) blockHeight = 1.0; 
                  else blockHeight = (8 - level) / 9.0; 
              }
          }

          for (const dir of directions) {
             if (isBed && dir === 'bottom') continue;

             const face = FACE_DATA[dir];
             const dx = face.dir[0]; const dy = face.dir[1]; const dz = face.dir[2];

             let nType: BlockType = BlockType.AIR;
             const nx = x + dx; const ny = y + dy; const nz = z + dz;
             
             if (ny < MIN_Y || ny > MAX_Y) nType = BlockType.AIR;
             else if (nx >= 0 && nx < CHUNK_SIZE && nz >= 0 && nz < CHUNK_SIZE) {
                 nType = chunk[index3D(nx, ny, nz)] as BlockType;
             } else {
                 if (nx < 0) nType = neighbors.left ? neighbors.left[index3D(CHUNK_SIZE + nx, ny, nz)] as BlockType : BlockType.AIR;
                 else if (nx >= CHUNK_SIZE) nType = neighbors.right ? neighbors.right[index3D(nx - CHUNK_SIZE, ny, nz)] as BlockType : BlockType.AIR;
                 else if (nz < 0) nType = neighbors.back ? neighbors.back[index3D(nx, ny, CHUNK_SIZE + nz)] as BlockType : BlockType.AIR;
                 else if (nz >= CHUNK_SIZE) nType = neighbors.front ? neighbors.front[index3D(nx, ny, nz - CHUNK_SIZE)] as BlockType : BlockType.AIR;
             }
             
             const nDef = BLOCKS[nType];
             const nIsFluid = nType === BlockType.WATER || nType === BlockType.LAVA;

             let visible = false;

             if (isFluid) {
                 if (nType === type) visible = false;
                 else if ((nType as BlockType) === BlockType.AIR) visible = true;
                 else if (nIsFluid && nType !== type) visible = true;
                 else if (IS_CUTOUT[nType] === 1) visible = true;
                 else if (IS_TRANSPARENT[nType] === 1 && nType !== type) visible = true;
                 else if (IS_SHAPED[nType] === 1) visible = true;
                 else if (!nDef) visible = true;
                 else if (dir === 'top' && blockHeight < 1.0) visible = true;
                 else visible = false;

             } else {
                 // A slab/stair neighbour covers at most part of the shared boundary,
                 // so it can never seal this face. Without this, transparent-flagged
                 // full blocks (phase blocks, machinery) culled their face against a
                 // placed slab and opened an x-ray hole into the world.
                 if ((nType as BlockType) === BlockType.AIR) visible = true;
                 else if (nIsFluid) visible = true;
                 else if (!nDef) visible = true;
                 else if (IS_SHAPED[nType] === 1) visible = true;
                 else if (IS_CUTOUT[type] === 1 && IS_CUTOUT[nType] === 1 && type === nType) visible = false;
                 else if (def.transparent && IS_CUTOUT[nType] === 1 && type !== nType) visible = true;
                 else if (def.transparent && IS_TRANSPARENT[nType] === 1 && type !== nType) visible = true;
                 else if (def.transparent) visible = false;
                 else if (!def.transparent && nDef.transparent) visible = true;
                 else if (isBed && (nType as BlockType) === BlockType.AIR) visible = true;
             }
             
             if (visible) {
                 // As in the greedy pass: only dark AIR is safely invisible from
                 // outside. Dark water/fluid cells (deep oceans) show this face
                 // through the medium, so they are never dark-culled.
                 if (cullDarkFaces && getLightFast(nx, ny, nz) === 0
                     && nType === BlockType.AIR) continue;

                 const { uvs } = resolveTexture(type, dir, dx, dy, dz, rotation);

                 const c0 = face.corners[0];
                 const c1 = face.corners[1];
                 const c2 = face.corners[2];
                 const c3 = face.corners[3];

                 // Adjust height for fluids/beds
                 let cy0 = c0[1]; let cy1 = c1[1]; let cy2 = c2[1]; let cy3 = c3[1];
                 
                 if ((isFluid || isBed) && dir !== 'bottom') {
                     if (cy0 === 1) cy0 = blockHeight;
                     if (cy1 === 1) cy1 = blockHeight;
                     if (cy2 === 1) cy2 = blockHeight;
                     if (cy3 === 1) cy3 = blockHeight;
                 }

                 // Light and AO per corner, sampled around the outward cell.
                 const alpha = voxelAlphaOf(type);
                 for (let corner = 0; corner < 4; corner++) {
                     const ax1 = face.aoVectors[corner][0];
                     const ax2 = face.aoVectors[corner][1];
                     writeCorner(
                         cornerScratch, corner * 4, alpha, nx, ny, nz,
                         ax1[0], ax1[1], ax1[2], true,
                         ax2[0], ax2[1], ax2[2], true,
                     );
                 }

                 // Natural blocks get a per-position texture variant (voxelVertex.ts).
                 const variant = uvVariantFor(type, FACE_INDEX[dir], worldX0 + x, y, worldZ0 + z);
                 const faceUvs = variant === 0 ? uvs : (applyUvVariant(uvs, variant, uvScratch), uvScratch);

                 // Correct texture UVs
                 let u0 = faceUvs[0], v0 = faceUvs[1];
                 let u1 = faceUvs[2], v1 = faceUvs[3];
                 let u2 = faceUvs[4], v2 = faceUvs[5];
                 let u3 = faceUvs[6], v3 = faceUvs[7];

                 if (isBed && dir !== 'top' && dir !== 'bottom') {
                     // Simple bed side mapping adjustment
                     const vTop = uvs[1];
                     const vBottom = uvs[5];
                     const vMid = (vTop + vBottom) * 0.5;
                     
                     // If vertex is high, it maps to vMid or vTop?
                     // Standard cube side: BL(0), BR(1), TR(2), TL(3).
                     // BL(0) y=0 -> vBottom. BR(1) y=0 -> vBottom.
                     // TR(2) y=1 -> vTop. TL(3) y=1 -> vTop.
                     // Bed: y=0.5. 
                     if (cy0 > 0.1) v0 = vMid; else v0 = vBottom;
                     if (cy1 > 0.1) v1 = vMid; else v1 = vBottom;
                     if (cy2 > 0.1) v2 = vMid; else v2 = vBottom;
                     if (cy3 > 0.1) v3 = vMid; else v3 = vBottom;
                 }

                 // Push Quad with per-vertex colors
                 // Note: pushQuad expects uniform color, but we need AO per vertex.
                 // Optimization constraint: GeometryBuffer.pushQuad assumes 1 color for all 4 verts.
                 // To support AO, we need to modify pushQuad or manually push. 
                 // Let's modify pushQuad to take 4 colors or just write directly here for speed.
                 
                 // Manually push to support AO variations
                 if (targetBuffer.ensureCapacity(1)) {
                     let vp = targetBuffer.vCount * 3;
                     let up = targetBuffer.vCount * 2;
                     let cp = targetBuffer.vCount * 4;
                     const vBase = targetBuffer.vCount;

                     // V0
                     targetBuffer.positions[vp] = x + c0[0]; targetBuffer.positions[vp+1] = y + cy0; targetBuffer.positions[vp+2] = z + c0[2];
                     targetBuffer.normals[vp] = dx; targetBuffer.normals[vp+1] = dy; targetBuffer.normals[vp+2] = dz;
                     copyCorner(targetBuffer, cp, 0);
                     targetBuffer.uvs[up] = u0; targetBuffer.uvs[up+1] = v0;

                     // V1
                     vp+=3; up+=2; cp+=4;
                     targetBuffer.positions[vp] = x + c1[0]; targetBuffer.positions[vp+1] = y + cy1; targetBuffer.positions[vp+2] = z + c1[2];
                     targetBuffer.normals[vp] = dx; targetBuffer.normals[vp+1] = dy; targetBuffer.normals[vp+2] = dz;
                     copyCorner(targetBuffer, cp, 4);
                     targetBuffer.uvs[up] = u1; targetBuffer.uvs[up+1] = v1;

                     // V2
                     vp+=3; up+=2; cp+=4;
                     targetBuffer.positions[vp] = x + c2[0]; targetBuffer.positions[vp+1] = y + cy2; targetBuffer.positions[vp+2] = z + c2[2];
                     targetBuffer.normals[vp] = dx; targetBuffer.normals[vp+1] = dy; targetBuffer.normals[vp+2] = dz;
                     copyCorner(targetBuffer, cp, 8);
                     targetBuffer.uvs[up] = u2; targetBuffer.uvs[up+1] = v2;

                     // V3
                     vp+=3; up+=2; cp+=4;
                     targetBuffer.positions[vp] = x + c3[0]; targetBuffer.positions[vp+1] = y + cy3; targetBuffer.positions[vp+2] = z + c3[2];
                     targetBuffer.normals[vp] = dx; targetBuffer.normals[vp+1] = dy; targetBuffer.normals[vp+2] = dz;
                     copyCorner(targetBuffer, cp, 12);
                     targetBuffer.uvs[up] = u3; targetBuffer.uvs[up+1] = v3;

                     targetBuffer.tiles.fill(TILE_RAW, vBase, vBase + 4);
                     writeQuadIndices(targetBuffer, vBase);
                     targetBuffer.vCount += 4;
                 }
             }
          }
        }
      }
    }
    
    return {
        opaque: opaqueBuffer.slice(),
        cutout: cutoutBuffer.slice(),
        transparent: transparentBuffer.slice()
    };
}
