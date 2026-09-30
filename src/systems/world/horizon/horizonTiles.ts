import { CHUNK_SIZE } from '../../../constants';

// Which tiles of distant terrain to draw (the horizon: the world past the
// full-detail chunks, out to the Horizon Distance), as a quadtree like CDLOD's
// (Strugar 2010): every tile is 32 x 32 cells, a cell at level L is 2^L blocks
// wide, and a tile splits into its four children of the level below while
// it is nearer than that level's range. So detail follows distance: single
// blocks right where the full chunks stop, so the two meet block for block,
// then 2, 4, 8... blocks a cell further out, each level about as many pixels
// wide on screen as the last. Pure and deterministic.

/** The sea's surface: a source block of water sits 0.88 of the way up its cell (geometry.ts), at sea level 63. */
export const WATER_SURFACE = 63.88;

/** Cells a tile spans along x and z, at every level. */
export const TILE_CELLS = 32;
/** The coarsest level: 128-block cells, 4096-block tiles. */
export const MAX_LEVEL = 7;
/** Chunks inside the full-detail edge that horizon tiles still cover, so a chunk streaming in or out always has terrain behind it. */
export const HORIZON_OVERLAP_CHUNKS = 2;

export interface HorizonTile {
    level: number;
    tx: number;
    tz: number;
}

export interface WantedTile extends HorizonTile {
    /** Distance from the centre chunk's middle to the tile's nearest point, in blocks. */
    distance: number;
}

/** Blocks a cell spans at a level. */
export const cellSize = (level: number): number => 1 << level;
/** Blocks a tile spans at a level. */
export const tileSize = (level: number): number => TILE_CELLS << level;
export const tileKey = (level: number, tx: number, tz: number): string => `${level}:${tx},${tz}`;

/** A tile's origin in blocks. */
export function tileOrigin(level: number, tx: number, tz: number): { x: number; z: number } {
    const size = tileSize(level);
    return { x: tx * size, z: tz * size };
}

/**
 * How far out each level reaches (blocks): level k covers distances up to
 * ranges[k]. Right past the full chunks (fullDetail blocks) come single
 * blocks, then each level doubles its reach; `quality` is how many blocks
 * away a 1-block cell may be before 2-block cells take over (so a cell is
 * about 900 / quality pixels wide at 1080p when a level begins).
 */
export function levelRanges(fullDetailBlocks: number, quality: number): number[] {
    const ranges: number[] = [];
    for (let level = 0; level <= MAX_LEVEL; level++) {
        const cell = cellSize(level);
        ranges.push(Math.max(fullDetailBlocks + 32 * cell, quality * cell));
    }
    return ranges;
}

/** The nearest point of a square to (x, z): its distance. */
function nearestDistance(x0: number, z0: number, size: number, x: number, z: number): number {
    const dx = Math.max(x0 - x, 0, x - (x0 + size));
    const dz = Math.max(z0 - z, 0, z - (z0 + size));
    return Math.hypot(dx, dz);
}

/** The farthest point of a square from (x, z): its distance. */
function farthestDistance(x0: number, z0: number, size: number, x: number, z: number): number {
    const dx = Math.max(Math.abs(x - x0), Math.abs(x - (x0 + size)));
    const dz = Math.max(Math.abs(z - z0), Math.abs(z - (z0 + size)));
    return Math.hypot(dx, dz);
}

/**
 * The tiles to draw around centre chunk (ccx, ccz), nearest first: every leaf
 * of the quadtree that reaches into the horizon and isn't wholly inside the
 * full-detail chunks (less HORIZON_OVERLAP_CHUNKS). fullDetail and horizon are
 * in chunks.
 */
export function wantedTiles(ccx: number, ccz: number, fullDetail: number, horizon: number, quality: number): WantedTile[] {
    const out: WantedTile[] = [];
    if (horizon <= fullDetail) return out;
    // Distances from the middle of the centre chunk, as the chunk streaming measures them.
    const x = (ccx + 0.5) * CHUNK_SIZE;
    const z = (ccz + 0.5) * CHUNK_SIZE;
    const inner = Math.max(0, (fullDetail - HORIZON_OVERLAP_CHUNKS) * CHUNK_SIZE);
    const outer = (horizon + 1) * CHUNK_SIZE;
    const ranges = levelRanges(fullDetail * CHUNK_SIZE, quality);

    const visit = (level: number, tx: number, tz: number) => {
        const size = tileSize(level);
        const x0 = tx * size;
        const z0 = tz * size;
        const near = nearestDistance(x0, z0, size, x, z);
        if (near > outer) return;
        if (farthestDistance(x0, z0, size, x, z) < inner) return;
        if (level > 0 && near < ranges[level - 1]) {
            for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) visit(level - 1, tx * 2 + i, tz * 2 + j);
            return;
        }
        out.push({ level, tx, tz, distance: near });
    };

    const rootSize = tileSize(MAX_LEVEL);
    const lo = (v: number) => Math.floor((v - outer) / rootSize);
    const hi = (v: number) => Math.floor((v + outer) / rootSize);
    for (let tx = lo(x); tx <= hi(x); tx++) {
        for (let tz = lo(z); tz <= hi(z); tz++) visit(MAX_LEVEL, tx, tz);
    }
    out.sort((a, b) => a.distance - b.distance);
    return out;
}

/** Whether two tiles (of any levels) cover any of the same ground. */
export function tilesOverlap(a: HorizonTile, b: HorizonTile): boolean {
    if (a.level === b.level) return a.tx === b.tx && a.tz === b.tz;
    const [fine, coarse] = a.level < b.level ? [a, b] : [b, a];
    const shift = coarse.level - fine.level;
    return (fine.tx >> shift) === coarse.tx && (fine.tz >> shift) === coarse.tz;
}

/** Blocks a sector (one set of GPU buffers, culled as one) spans: tiles this size or smaller share them. */
export const SECTOR_SIZE = 1024;

/** The sector a tile's geometry goes into: its 1024-block square, or the tile itself when it is larger. */
export function sectorOf(tile: HorizonTile): { key: string; x: number; z: number } {
    const size = tileSize(tile.level);
    if (size >= SECTOR_SIZE) {
        const origin = tileOrigin(tile.level, tile.tx, tile.tz);
        return { key: `t${tile.level}:${tile.tx},${tile.tz}`, x: origin.x, z: origin.z };
    }
    const per = SECTOR_SIZE / size;
    const sx = Math.floor(tile.tx / per);
    const sz = Math.floor(tile.tz / per);
    return { key: `s${sx},${sz}`, x: sx * SECTOR_SIZE, z: sz * SECTOR_SIZE };
}
