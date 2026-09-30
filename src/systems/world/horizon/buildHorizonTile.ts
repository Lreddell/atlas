import { BlockType } from '../../../types';
import { GlobalNoise, type NoiseSet } from '../../../utils/noise';
import type { GeometryAttributes } from '../geometry';
import { coarseCanopy, rasterizeTrees, sampleColumn, type Column } from './horizonColumns';
import { meshHorizonCells, type HorizonCell } from './horizonMesher';
import { TILE_CELLS, cellSize, tileOrigin } from './horizonTiles';

// One horizon tile, sampled and meshed (a world worker runs this). Level 0
// reads every column exactly, trees included, to meet the full chunks block
// for block; level 1 takes each 2 x 2 of columns into a cell and merges tree
// crowns into it; further out a cell takes four samples (one past 8 blocks)
// and grows its canopy from how thickly its biome is wooded.
//
// Past level 0 less is drawn than is sampled, where the difference is under a
// pixel: the sea floor steps 2 to 8 blocks at a time (lit for its real depth,
// which is all that shows of it through the water: how dark it is), cliffs
// lose their thin layers, and from level 3 the land steps by a quarter cell.
// The floor keeps its real depth, near enough: a line of sight entering the
// sea over one tile's floor and passing on under the next must still meet a
// floor there, never the void under a shallower one.

export interface HorizonTileMeshes {
    /** Terrain, trees, sea floor and lava. */
    opaque: GeometryAttributes | null;
    /** The surface of the sea and of ice. */
    transparent: GeometryAttributes | null;
}

/** Many samples in one cell into one: the sea's floor where the sea covers most of it, else its highest ground. */
function aggregate(samples: Column[]): { column: Column; height: number } {
    let wet = 0;
    for (const s of samples) if (s.fluid !== BlockType.AIR) wet++;
    if (wet * 2 >= samples.length) {
        let sum = 0;
        for (const s of samples) if (s.fluid !== BlockType.AIR) sum += s.height;
        const mean = sum / wet;
        let best = samples[0];
        let bestGap = Infinity;
        for (const s of samples) {
            if (s.fluid === BlockType.AIR) continue;
            const gap = Math.abs(s.height - mean);
            if (gap < bestGap) { best = s; bestGap = gap; }
        }
        return { column: best, height: Math.round(mean) };
    }
    let best: Column | null = null;
    for (const s of samples) if (s.fluid === BlockType.AIR && (!best || s.height > best.height)) best = s;
    return { column: best!, height: best!.height };
}

const cellFrom = (column: Column, height = column.height): HorizonCell => ({
    height,
    top: column.top,
    groundHeight: height,
    column,
    fluid: height < 63 ? column.fluid || column.biome.waterBlock : BlockType.AIR,
    leafTop: -Infinity,
    leafBottom: Infinity,
    leaves: BlockType.LEAVES,
    trunkTop: -Infinity,
    log: BlockType.LOG,
});

/** Past level 0 the sea floor steps a few blocks at a time (keeping its depth's light), and from level 3 the land by a quarter cell. */
function simplify(cell: HorizonCell, level: number): void {
    if (cell.fluid === BlockType.WATER || cell.fluid === BlockType.ICE) {
        const step = Math.min(8, 1 << level);
        cell.lightHeight = cell.height;
        cell.height = cell.groundHeight = Math.min(62, Math.floor(cell.height / step) * step);
        return;
    }
    if (level < 3) return;
    const step = 1 << (level - 2);
    const snap = (y: number) => Math.max(63, Math.floor(y / step) * step);
    const ground = snap(cell.groundHeight);
    cell.height = cell.height === cell.groundHeight ? ground : Math.max(ground + 1, snap(cell.height));
    cell.groundHeight = ground;
}

export function buildHorizonTile(level: number, tx: number, tz: number, noise: NoiseSet = GlobalNoise, worldSeed: number = noise.seed | 0): HorizonTileMeshes {
    const n = TILE_CELLS;
    const size = cellSize(level);
    const origin = tileOrigin(level, tx, tz);
    const stride = n + 2;
    const cells: HorizonCell[] = new Array(stride * stride);

    if (level <= 1) {
        // Every column of the tile and its rim, and the trees over them.
        const x0 = origin.x - size;
        const z0 = origin.z - size;
        const span = stride * size;
        const columns: Column[] = new Array(span * span);
        for (let dz = 0; dz < span; dz++) {
            for (let dx = 0; dx < span; dx++) columns[dz * span + dx] = sampleColumn(x0 + dx, z0 + dz, noise);
        }
        const heightAt = (x: number, z: number) => columns[(z - z0) * span + (x - x0)].height;
        const trees = rasterizeTrees(x0, z0, span, span, heightAt, noise, worldSeed);
        for (let j = 0; j < stride; j++) {
            for (let i = 0; i < stride; i++) {
                if (level === 0) {
                    const column = columns[j * span + i];
                    const cell = cellFrom(column);
                    const tree = trees.get(i * span + j);
                    if (tree) {
                        cell.leafTop = tree.leafTop;
                        cell.leafBottom = tree.leafBottom;
                        cell.leaves = tree.leaves;
                        cell.trunkTop = tree.trunkTop;
                        cell.log = tree.log;
                    }
                    cells[j * stride + i] = cell;
                    continue;
                }
                // A 2 x 2 of columns; tree crowns over half of it or more merge into its ground.
                const samples: Column[] = [];
                let crowned = 0;
                let crownTop = -Infinity;
                let leaves = BlockType.LEAVES;
                for (let sz = 0; sz < 2; sz++) {
                    for (let sx = 0; sx < 2; sx++) {
                        const cx = i * 2 + sx, cz = j * 2 + sz;
                        samples.push(columns[cz * span + cx]);
                        const tree = trees.get(cx * span + cz);
                        if (tree && tree.leafTop >= tree.leafBottom) {
                            crowned++;
                            if (tree.leafTop > crownTop) { crownTop = tree.leafTop; leaves = tree.leaves; }
                        }
                    }
                }
                const { column, height } = aggregate(samples);
                const cell = cellFrom(column, height);
                if (crowned >= 2 && crownTop > height) {
                    cell.height = crownTop;
                    cell.top = leaves;
                    cell.groundHeight = height;
                }
                cells[j * stride + i] = cell;
            }
        }
    } else {
        // Four samples a cell (at its quarters), or one past 16-block cells.
        const offsets = size <= 8 ? [0.25, 0.75] : [0.5];
        for (let j = 0; j < stride; j++) {
            for (let i = 0; i < stride; i++) {
                const cx0 = origin.x + (i - 1) * size;
                const cz0 = origin.z + (j - 1) * size;
                const samples: Column[] = [];
                for (const oz of offsets) for (const ox of offsets) samples.push(sampleColumn(Math.floor(cx0 + ox * size), Math.floor(cz0 + oz * size), noise));
                const { column, height } = aggregate(samples);
                const cell = cellFrom(column, height);
                const canopy = cell.fluid === BlockType.AIR ? coarseCanopy(cx0, cz0, size, column.biome, height, column.top, worldSeed) : null;
                if (canopy && canopy.top > height) {
                    cell.height = canopy.top;
                    cell.top = canopy.leaves;
                    cell.groundHeight = height;
                }
                cells[j * stride + i] = cell;
            }
        }
    }

    if (level > 0) for (const cell of cells) simplify(cell, level);
    return meshHorizonCells(cells, n, size, {
        skirt: Math.max(4, size * 2),
        ao: level <= 1,
        wallLayers: level === 0 ? 'all' : level === 1 ? 'two' : 'one',
    });
}
