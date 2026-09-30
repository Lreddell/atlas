import { BlockType } from '../../../types';
import type { NoiseSet } from '../../../utils/noise';
import { getBiome, getGenerationParams, type Biome } from '../biomes';
import { getResolvedSurface, getStrataBlock, getTerrainHeight, getTerrainInfo } from '../baseChunkGeneration';
import { GenConfig } from '../genConfig';
import { generateTreeBlocks, getLeavesForTreeKind, getLogForTreeKind, isValidSoil, type TreeKind } from '../trees';

// The world's columns as the horizon draws them, from the world generator's
// own functions (baseChunkGeneration.ts) without generating chunks: each
// column's height, its exact top block (the terrain pass's rules: beaches,
// mesa bands, mountain stone and snow, volcanic lava), what its cliffs show
// below that, the sea over it, and the trees the tree pass would grow there,
// rasterised from the very same roots and shapes. So where the full chunks
// stop, the horizon carries on block for block. Caves breaking the surface,
// flowers and structures are left out.

export const SEA_LEVEL = 63;

/** One column: its terrain, and the sea (or ice, or lava) standing over it. */
export interface Column {
    /** The y of the column's top terrain block. */
    height: number;
    /** The terrain pass's base height (mesa bands start above it). */
    baseHeight: number;
    biome: Biome;
    /** The top terrain block, exactly as the terrain pass sets it. */
    top: BlockType;
    /** At sea level over a column below it: WATER, ICE (over water) or LAVA; AIR on land. */
    fluid: BlockType;
    /** In a beach zone: sand for three layers, then sandstone. */
    beach: boolean;
}

// The world generator's per-position hash (baseChunkGeneration.ts seededRand01).
export function seededRand01(x: number, y: number, z: number, salt: number, worldSeed: number): number {
    let h = Math.imul((x | 0) ^ worldSeed, 374761393);
    h = Math.imul(h ^ ((y | 0) + salt), 668265263);
    h = Math.imul(h ^ ((z | 0) - salt), 2147483647);
    h ^= h >>> 13;
    h = Math.imul(h, 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
}

const NO_SAND_BEACH = new Set(['volcanic', 'red_mesa', 'mesa_bryce', 'stone_shore', 'mountains']);

/** Whether a column lies in a beach zone, by the terrain pass's test. */
function inBeachZone(wx: number, wz: number, height: number, noise: NoiseSet): boolean {
    const params = getGenerationParams(wx, wz, noise);
    const cont = params.continentalness;
    const river = Math.abs(params.riverVal);
    const coastal = cont > -0.55 && cont < GenConfig.biomes.ocean.continentalnessMax + 0.15;
    const bank = river > GenConfig.biomes.river.width - 0.002 && river < GenConfig.biomes.river.width * 7.0;
    if (coastal || bank) return true;
    if (height < 60 || height > 65) return false;
    for (const [ox, oz] of [[4, 0], [-4, 0], [0, 4], [0, -4]]) {
        const nh = getTerrainHeight(wx + ox, wz + oz, noise);
        if ((height >= SEA_LEVEL && nh < SEA_LEVEL) || (height < SEA_LEVEL && nh >= SEA_LEVEL)) return true;
    }
    return false;
}

export function sampleColumn(wx: number, wz: number, noise: NoiseSet): Column {
    const biome = getBiome(wx, wz, noise);
    const { height, baseHeight } = getTerrainInfo(wx, wz, noise);
    const beach = height >= 60 && height <= 65 && inBeachZone(wx, wz, height, noise);
    const cwx = wx + noise.offsets.cave.x;
    const cwz = wz + noise.offsets.cave.z;

    // The top block, rule for rule as the terrain pass sets y == height.
    let top = biome.surfaceBlock;
    if (biome.id === 'magnetic_fields') top = BlockType.MAGNETITE_BLOCK;
    if (biome.id === 'red_mesa' || biome.id === 'mesa_bryce') top = height > baseHeight + 1 ? getStrataBlock(height) : BlockType.RED_SAND;
    if (biome.id === 'volcanic') {
        const lava = noise.cave.noise2D(cwx * 0.08, cwz * 0.08);
        if (lava > 0.6) top = BlockType.LAVA;
        else if (lava > 0.3) top = BlockType.MAGMA;
    }
    if (biome.id === 'mountains') {
        if (height > 150) top = BlockType.SNOW_BLOCK;
        else if (height > 110) {
            const stone = noise.cave.noise2D(cwx * 0.1, cwz * 0.1);
            top = stone > 0.33 ? BlockType.GRANITE : stone < -0.33 ? BlockType.DIORITE : BlockType.ANDESITE;
        } else top = BlockType.GRASS;
    }
    if (beach && !NO_SAND_BEACH.has(biome.id)) top = BlockType.SAND;
    if (height < SEA_LEVEL && top === BlockType.GRASS) top = BlockType.DIRT;

    const fluid = height < SEA_LEVEL ? biome.waterBlock : BlockType.AIR;
    return { height, baseHeight, biome, top, fluid, beach };
}

/** The block at height y inside a column (y below its top), by the terrain pass's layering, caves and ores aside. */
export function wallBlock(column: Column, y: number): BlockType {
    const { biome, height, baseHeight } = column;
    if (biome.id === 'magnetic_fields') return BlockType.MAGNETITE_BLOCK;
    if (biome.id === 'red_mesa' || biome.id === 'mesa_bryce') {
        if (y > baseHeight + 1) return getStrataBlock(y);
        if (y >= height - 3) return BlockType.RED_SANDSTONE;
    }
    let type = y < height - 4 ? BlockType.STONE : biome.subBlock;
    if (column.beach && !NO_SAND_BEACH.has(biome.id) && height - y < 4) {
        type = height - y === 3 ? BlockType.SANDSTONE : BlockType.SAND;
    }
    if (y < SEA_LEVEL && type === BlockType.GRASS) type = BlockType.DIRT;
    return type;
}

// --- Trees ------------------------------------------------------------------

/** Blocks the tree pass reaches beyond a root: cherry lean plus canopy radius, and a margin. */
export const TREE_REACH = 8;

/** What trees put in one column: their leaves' span, and a trunk's. */
export interface TreeColumn {
    leafTop: number;
    leafBottom: number;
    leaves: BlockType;
    /** The top of a trunk standing in this column, or -Infinity. */
    trunkTop: number;
    log: BlockType;
}

/**
 * The trees over the area [x0, x0 + width) x [z0, z0 + depth), from every root
 * the tree pass would grow (itself hashed, soil-checked and shaped exactly as
 * there), as each column's span of leaves and trunk. Leaves only fill air: not
 * under the terrain nor the sea.
 */
export function rasterizeTrees(
    x0: number, z0: number, width: number, depth: number,
    columnTop: (x: number, z: number) => number,
    noise: NoiseSet, worldSeed: number,
): Map<number, TreeColumn> {
    const out = new Map<number, TreeColumn>();
    const keyOf = (x: number, z: number) => (x - x0) * depth + (z - z0);
    for (let rx = x0 - TREE_REACH; rx < x0 + width + TREE_REACH; rx++) {
        for (let rz = z0 - TREE_REACH; rz < z0 + depth + TREE_REACH; rz++) {
            const biome = getBiome(rx, rz, noise);
            if (biome.treeType === 'none') continue;
            if (seededRand01(rx, 0, rz, 201, worldSeed) >= biome.treeChance) continue;
            const ground = getTerrainHeight(rx, rz, noise);
            if (ground <= SEA_LEVEL) continue;
            if (!isValidSoil(getResolvedSurface(rx, rz, noise))) continue;
            const kind: TreeKind = biome.treeType === 'mixed_forest'
                ? (seededRand01(rx, ground, rz, 202, worldSeed) < 0.2 ? 'birch' : 'oak')
                : biome.treeType as TreeKind;
            const leaves = getLeavesForTreeKind(kind);
            const log = getLogForTreeKind(kind);
            for (const block of generateTreeBlocks(kind, rx, ground, rz, worldSeed)) {
                if (block.wx < x0 || block.wx >= x0 + width || block.wz < z0 || block.wz >= z0 + depth) continue;
                // Leaves only fill air: never the terrain, nor the sea over a low column.
                const floor = Math.max(columnTop(block.wx, block.wz), SEA_LEVEL);
                if (!block.isTrunk && block.wy <= floor) continue;
                const key = keyOf(block.wx, block.wz);
                let column = out.get(key);
                if (!column) {
                    column = { leafTop: -Infinity, leafBottom: Infinity, leaves, trunkTop: -Infinity, log };
                    out.set(key, column);
                }
                if (block.isTrunk) {
                    column.trunkTop = Math.max(column.trunkTop, block.wy);
                    column.log = block.type;
                } else {
                    if (block.wy > column.leafTop) column.leaves = block.type;
                    column.leafTop = Math.max(column.leafTop, block.wy);
                    column.leafBottom = Math.min(column.leafBottom, block.wy);
                }
            }
        }
    }
    return out;
}

/** A tree kind's typical canopy height above the ground (the median of a few real ones). */
const canopyHeights = new Map<TreeKind, number>();
export function canopyHeight(kind: TreeKind): number {
    let height = canopyHeights.get(kind);
    if (height === undefined) {
        const tops: number[] = [];
        for (let i = 0; i < 7; i++) {
            let top = 0;
            for (const block of generateTreeBlocks(kind, i * 97, 0, i * 53, 12345)) if (!block.isTrunk && block.wy > top) top = block.wy;
            tops.push(top);
        }
        tops.sort((a, b) => a - b);
        height = Math.max(3, tops[3]);
        canopyHeights.set(kind, height);
    }
    return height;
}

/** Leaves covering this much of a cell or more make it a canopy cell at the coarse levels. */
const CANOPY_AREA = 20;

/**
 * Whether a coarse cell of `size` blocks at (x0, z0) reads as canopy, and how
 * high: its biome's trees cover about treeChance x CANOPY_AREA of the ground,
 * so a cell is canopy with that chance (hashed from its place, so it holds
 * still), standing the kind's usual canopy height above the ground.
 */
export function coarseCanopy(x0: number, z0: number, size: number, biome: Biome, ground: number, top: BlockType, worldSeed: number): { top: number; leaves: BlockType } | null {
    if (biome.treeType === 'none' || biome.treeChance <= 0 || ground <= SEA_LEVEL || !isValidSoil(top)) return null;
    const cover = Math.min(1, biome.treeChance * CANOPY_AREA);
    if (seededRand01(x0, size, z0, 233, worldSeed) >= cover) return null;
    const kind: TreeKind = biome.treeType === 'mixed_forest' ? 'oak' : biome.treeType as TreeKind;
    return { top: ground + canopyHeight(kind), leaves: getLeavesForTreeKind(kind) };
}
