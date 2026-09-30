import { BlockType } from '../../types';
import { CHUNK_SIZE } from '../../constants';
import { GlobalNoise } from '../../utils/noise';
import { getResolvedSurface, getTerrainHeight } from './baseChunkGeneration';
import { getBiome } from './biomes';
import { resolveTile, type FaceName } from './textureResolver';
import { packTile, type GeometryAttributes } from './geometry';
import { AO_BYTES, lightByte, uvVariationMode, voxelAlphaOf } from './voxelVertex';
import { generateTreeBlocks, getLeavesForTreeKind, isValidSoil, type TreeKind } from './trees';

// Far terrain: the world past the full-detail chunks, out to the render
// distance, drawn from the world generator's own height and surface functions
// without generating those chunks. Chunks cost about 0.6 MB each (blocks,
// light and mesh), so full detail stops at FULL_DETAIL_MAX chunks; beyond, a
// tile samples one column per cell and draws it as a block-stepped surface in
// the chunks' own vertex format, textured, lit and fogged by the same voxel
// material. Pure and deterministic: a worker builds tiles (world.worker.ts).

/** Render distances past this draw far terrain beyond it instead of more full chunks. */
export const FULL_DETAIL_MAX = 32;
/** The farthest render distance, in chunks. */
export const MAX_RENDER_DISTANCE = 128;
/** The smallest render distance, in chunks. */
export const MIN_RENDER_DISTANCE = 4;

export interface FarLevel {
    /** Chunks a tile spans along x and z. */
    tileChunks: number;
    /** Blocks a cell spans: one sampled column per cell. */
    cell: number;
}

/** Near tiles sample every 4 blocks, far ones every 8: 32 x 32 cells either way. */
export const FAR_LEVELS: readonly FarLevel[] = [
    { tileChunks: 8, cell: 4 },
    { tileChunks: 16, cell: 8 },
];
/** Level-1 tiles whose centre is within this many chunks split into level-0 tiles. */
export const FAR_NEAR_LEVEL_CHUNKS = 64;

const SEA_LEVEL = 63;
/** Tile-edge walls reach at least this far down, hiding cracks against a neighbour of the other level. */
const EDGE_SKIRT = 6;

export interface FarTileKey {
    level: number;
    tx: number;
    tz: number;
}

export const farTileKey = (level: number, tx: number, tz: number): string => `${level}:${tx},${tz}`;

/** A tile's origin in blocks. */
export function farTileOrigin(level: number, tx: number, tz: number): { x: number; z: number } {
    const size = FAR_LEVELS[level].tileChunks * CHUNK_SIZE;
    return { x: tx * size, z: tz * size };
}

/** How far chunk (cx, cz) is from the centre chunk, squared, as the chunk streaming measures it. */
const chunkDistSq = (cx: number, cz: number, ccx: number, ccz: number) => (cx - ccx) ** 2 + (cz - ccz) ** 2;

/**
 * The tiles to draw around centre chunk (ccx, ccz): every tile reaching into
 * the render distance and not wholly inside the full-detail disc, nearest
 * first. Level-1 tiles near the centre split into their four level-0 tiles.
 * Where a tile overlaps the full-detail disc the shader cuts it away there.
 */
export function desiredFarTiles(ccx: number, ccz: number, fullDetail: number, renderDistance: number): (FarTileKey & { d: number })[] {
    const out: (FarTileKey & { d: number })[] = [];
    if (renderDistance <= fullDetail) return out;
    const rd2 = renderDistance * renderDistance;
    const fd2 = fullDetail * fullDetail;
    // A tile is wanted if some chunk in it is past full detail and within the render distance.
    const wanted = (level: number, tx: number, tz: number): boolean => {
        const n = FAR_LEVELS[level].tileChunks;
        const x0 = tx * n, z0 = tz * n, x1 = x0 + n - 1, z1 = z0 + n - 1;
        const nx = Math.max(x0, Math.min(ccx, x1)), nz = Math.max(z0, Math.min(ccz, z1));
        if (chunkDistSq(nx, nz, ccx, ccz) > rd2) return false;
        const fx = Math.abs(x0 - ccx) > Math.abs(x1 - ccx) ? x0 : x1;
        const fz = Math.abs(z0 - ccz) > Math.abs(z1 - ccz) ? z0 : z1;
        return chunkDistSq(fx, fz, ccx, ccz) > fd2;
    };
    const n1 = FAR_LEVELS[1].tileChunks;
    const lo = (v: number) => Math.floor((v - renderDistance) / n1);
    const hi = (v: number) => Math.floor((v + renderDistance) / n1);
    for (let tx = lo(ccx); tx <= hi(ccx); tx++) {
        for (let tz = lo(ccz); tz <= hi(ccz); tz++) {
            if (!wanted(1, tx, tz)) continue;
            const cxm = tx * n1 + n1 / 2, czm = tz * n1 + n1 / 2;
            const centre = Math.sqrt(chunkDistSq(cxm, czm, ccx, ccz));
            if (centre <= FAR_NEAR_LEVEL_CHUNKS) {
                const n0 = FAR_LEVELS[0].tileChunks;
                for (let sx = 0; sx < 2; sx++) {
                    for (let sz = 0; sz < 2; sz++) {
                        const t0x = tx * 2 + sx, t0z = tz * 2 + sz;
                        if (!wanted(0, t0x, t0z)) continue;
                        const d = Math.sqrt(chunkDistSq(t0x * n0 + n0 / 2, t0z * n0 + n0 / 2, ccx, ccz));
                        out.push({ level: 0, tx: t0x, tz: t0z, d });
                    }
                }
            } else {
                out.push({ level: 1, tx, tz, d: centre });
            }
        }
    }
    out.sort((a, b) => a.d - b.d);
    return out;
}

// --- Sampling -----------------------------------------------------------------

// The world generator's tree root test (baseChunkGeneration.ts, salt 201).
function treeRootRand(x: number, z: number, worldSeed: number): number {
    let h = Math.imul((x | 0) ^ worldSeed, 374761393);
    h = Math.imul(h ^ (0 + 201), 668265263);
    h = Math.imul(h ^ ((z | 0) - 201), 2147483647);
    h ^= h >>> 13;
    h = Math.imul(h, 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
}

/** A tree kind's canopy: how far its top leaves stand above the ground, and their block. */
const canopyCache = new Map<TreeKind, { height: number; leaves: BlockType }>();
function canopyOf(kind: TreeKind): { height: number; leaves: BlockType } {
    let canopy = canopyCache.get(kind);
    if (!canopy) {
        // The median top of a few real trees of this kind.
        const tops: number[] = [];
        for (let i = 0; i < 7; i++) {
            let top = 0;
            for (const block of generateTreeBlocks(kind, i * 97, 0, i * 53, 12345)) if (!block.isTrunk && block.wy > top) top = block.wy;
            tops.push(top);
        }
        tops.sort((a, b) => a - b);
        canopy = { height: Math.max(3, tops[3]), leaves: getLeavesForTreeKind(kind) };
        canopyCache.set(kind, canopy);
    }
    return canopy;
}

interface FarCell {
    /** The y of the cell's top block (its top face is at top + 1). */
    top: number;
    type: BlockType;
    /** The block under the top one, shown on the walls below its first block. */
    under: BlockType;
}

/**
 * One cell's column, sampled at its centre: sea (water, ice or lava) below sea
 * level, else the generator's own resolved surface block, or, where a tree of
 * the biome roots anywhere in the cell, that tree's canopy.
 */
export function sampleFarCell(x0: number, z0: number, cell: number, worldSeed: number): FarCell {
    const cx = x0 + (cell >> 1), cz = z0 + (cell >> 1);
    const height = getTerrainHeight(cx, cz, GlobalNoise);
    const biome = getBiome(cx, cz, GlobalNoise);
    if (height < SEA_LEVEL) {
        const water = biome.waterBlock;
        return { top: SEA_LEVEL, type: water, under: water === BlockType.ICE ? BlockType.WATER : water };
    }
    const surface = getResolvedSurface(cx, cz, GlobalNoise);
    if (biome.treeType !== 'none' && biome.treeChance > 0 && isValidSoil(surface)) {
        for (let dx = 0; dx < cell; dx++) {
            for (let dz = 0; dz < cell; dz++) {
                if (treeRootRand(x0 + dx, z0 + dz, worldSeed) >= biome.treeChance) continue;
                const kind: TreeKind = biome.treeType === 'mixed_forest' ? 'oak' : biome.treeType as TreeKind;
                const canopy = canopyOf(kind);
                return { top: height + canopy.height, type: canopy.leaves, under: canopy.leaves };
            }
        }
    }
    return { top: height, type: surface, under: underOf(surface, biome.subBlock) };
}

/** What shows on a cliff below a surface block's first layer. */
function underOf(surface: BlockType, subBlock: BlockType): BlockType {
    switch (surface) {
        case BlockType.SAND:
        case BlockType.RED_SAND:
        case BlockType.SNOW_BLOCK:
        case BlockType.MAGNETITE_BLOCK:
        case BlockType.ANDESITE:
        case BlockType.STONE:
            return surface === BlockType.SNOW_BLOCK ? BlockType.STONE : surface;
        default:
            return subBlock ?? BlockType.DIRT;
    }
}

// --- Meshing ------------------------------------------------------------------

class FarBuffer {
    positions: number[] = [];
    normals: number[] = [];
    uvs: number[] = [];
    colors: number[] = [];
    tiles: number[] = [];
    indices: number[] = [];
    vCount = 0;

    /**
     * One tiled quad: four corners (bottom-left, bottom-right, top-right,
     * top-left as the mesher orders a face), w x h blocks of the tile.
     */
    quad(corners: number[], normal: [number, number, number], w: number, h: number, type: BlockType, face: FaceName) {
        const choice = resolveTile(type, face, normal[0], normal[1], normal[2], 0);
        const tile = packTile(choice.texIdx, choice.uvRot, uvVariationMode(type));
        const alpha = voxelAlphaOf(type);
        const sky = lightByte(15), ao = AO_BYTES[0];
        const base = this.vCount;
        for (let k = 0; k < 4; k++) {
            this.positions.push(corners[k * 3], corners[k * 3 + 1], corners[k * 3 + 2]);
            this.normals.push(normal[0] * 127, normal[1] * 127, normal[2] * 127, 0);
            this.uvs.push(k === 1 || k === 2 ? w : 0, k >= 2 ? h : 0);
            this.colors.push(sky, 0, ao, alpha);
            this.tiles.push(tile);
        }
        this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
        this.vCount += 4;
    }

    finish(): GeometryAttributes {
        const positions = new Float32Array(this.positions);
        let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
        for (let i = 0; i < positions.length; i += 3) {
            minX = Math.min(minX, positions[i]); maxX = Math.max(maxX, positions[i]);
            minY = Math.min(minY, positions[i + 1]); maxY = Math.max(maxY, positions[i + 1]);
            minZ = Math.min(minZ, positions[i + 2]); maxZ = Math.max(maxZ, positions[i + 2]);
        }
        return {
            positions,
            normals: new Int8Array(this.normals),
            uvs: new Float32Array(this.uvs),
            colors: new Uint8Array(this.colors),
            tiles: new Uint16Array(this.tiles),
            indices: this.vCount <= 65535 ? new Uint16Array(this.indices) : new Uint32Array(this.indices),
            bounds: positions.length > 0 ? [minX, minY, minZ, maxX, maxY, maxZ] : undefined,
        };
    }
}

/** A wall on one side of a cell, from y0 to y1 (block tops), `side` naming its face. */
function wall(buffer: FarBuffer, side: 'left' | 'right' | 'back' | 'front', x0: number, z0: number, size: number, y0: number, y1: number, type: BlockType) {
    if (y1 <= y0) return;
    const x1 = x0 + size, z1 = z0 + size, h = y1 - y0;
    switch (side) {
        case 'right': buffer.quad([x1, y0, z1, x1, y0, z0, x1, y1, z0, x1, y1, z1], [1, 0, 0], size, h, type, 'right'); break;
        case 'left': buffer.quad([x0, y0, z0, x0, y0, z1, x0, y1, z1, x0, y1, z0], [-1, 0, 0], size, h, type, 'left'); break;
        case 'front': buffer.quad([x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1], [0, 0, 1], size, h, type, 'front'); break;
        case 'back': buffer.quad([x1, y0, z0, x0, y0, z0, x0, y1, z0, x1, y1, z0], [0, 0, -1], size, h, type, 'back'); break;
    }
}

/**
 * A far tile's mesh, in blocks from the tile's origin (farTileOrigin): each
 * cell's top face (runs of equal cells merged), and walls down to each lower
 * neighbour, the first block in the surface block's side and the rest in the
 * block beneath. Walls on the tile's edges always reach EDGE_SKIRT deep.
 */
export function buildFarTile(level: number, tx: number, tz: number, worldSeed: number = GlobalNoise.seed | 0): GeometryAttributes {
    const { cell, tileChunks } = FAR_LEVELS[level];
    const n = (tileChunks * CHUNK_SIZE) / cell;
    const origin = farTileOrigin(level, tx, tz);
    // Cells with a one-cell border, so edge cells know their outside neighbours.
    const stride = n + 2;
    const cells: FarCell[] = new Array(stride * stride);
    for (let j = -1; j <= n; j++) {
        for (let i = -1; i <= n; i++) {
            cells[(j + 1) * stride + (i + 1)] = sampleFarCell(origin.x + i * cell, origin.z + j * cell, cell, worldSeed);
        }
    }
    const at = (i: number, j: number) => cells[(j + 1) * stride + (i + 1)];
    const buffer = new FarBuffer();

    // Tops, merged into runs along x of cells at one height and block.
    for (let j = 0; j < n; j++) {
        for (let i = 0; i < n;) {
            const c = at(i, j);
            let run = 1;
            while (i + run < n && at(i + run, j).top === c.top && at(i + run, j).type === c.type) run++;
            const x0 = i * cell, x1 = (i + run) * cell, z0 = j * cell, z1 = z0 + cell, y = c.top + 1;
            buffer.quad([x0, y, z1, x1, y, z1, x1, y, z0, x0, y, z0], [0, 1, 0], x1 - x0, cell, c.type, 'top');
            i += run;
        }
    }

    // Walls down to lower neighbours (and skirts along the tile's edges).
    const sides = [
        { side: 'right' as const, di: 1, dj: 0 },
        { side: 'left' as const, di: -1, dj: 0 },
        { side: 'front' as const, di: 0, dj: 1 },
        { side: 'back' as const, di: 0, dj: -1 },
    ];
    for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
            const c = at(i, j);
            const x0 = i * cell, z0 = j * cell;
            for (const { side, di, dj } of sides) {
                const ni = i + di, nj = j + dj;
                const edge = ni < 0 || nj < 0 || ni >= n || nj >= n;
                let bottom = at(ni, nj).top + 1;
                if (edge) bottom = Math.min(bottom, c.top + 1 - EDGE_SKIRT);
                if (bottom > c.top) continue;
                // The top block's own side for its first layer, what lies beneath below it.
                wall(buffer, side, x0, z0, cell, Math.max(bottom, c.top), c.top + 1, c.type);
                wall(buffer, side, x0, z0, cell, bottom, c.top, c.under);
            }
        }
    }
    return buffer.finish();
}
