import { CHUNK_SIZE, WORLD_HEIGHT } from '../../constants';
import type { NeighborData, NeighborLight } from './geometry';

// The mesher reads a side chunk only on the plane of cells facing this chunk:
// faces, ambient occlusion, smooth light and fluid slopes all look one cell
// over, and corners clamp onto that plane (geometry.ts, getTypeFast and
// getLightFast). So a mesh job carries just those planes, 6 KB a side instead
// of a 98 KB chunk: the main thread copies each job into the worker as it
// sends it, and the four side chunks with their light were most of the copy.
// meshBorders.test.mjs meshes real chunks both ways and compares.

export type Side = 'left' | 'right' | 'back' | 'front';

const SIDES: readonly Side[] = ['left', 'right', 'back', 'front'];
const LAYER = CHUNK_SIZE * CHUNK_SIZE;
const PLANE = WORLD_HEIGHT * CHUNK_SIZE;
const CHUNK_CELLS = LAYER * WORLD_HEIGHT;

/** The side chunks' facing planes (blocks, light, metadata), as a mesh job carries them. */
export interface MeshBorders {
    blocks: Partial<Record<Side, Uint8Array>>;
    light: Partial<Record<Side, Uint8Array>>;
    meta: Partial<Record<Side, Uint8Array>>;
}

/**
 * Where a side chunk's facing plane lies in it: the chunk to the left (-x)
 * faces with its x = 15 cells, the one to the right with x = 0, the one
 * behind (-z) with z = 15, the one in front with z = 0.
 */
const facingCoord = (side: Side): number => (side === 'left' || side === 'back' ? CHUNK_SIZE - 1 : 0);

/**
 * A side chunk's facing plane, row by row from the bottom: 16 cells a row.
 * Plain loops: a subarray a row (384 of them a plane, twelve planes a mesh
 * job) made packing a job's borders cost 0.4 ms of main thread.
 */
export function borderPlane(data: Uint8Array, side: Side): Uint8Array {
    const plane = new Uint8Array(PLANE);
    const at = facingCoord(side);
    let o = 0;
    if (side === 'left' || side === 'right') {
        // x fixed: every 16th cell of each layer.
        for (let base = at; o < PLANE; base += LAYER) {
            for (let i = base, end = base + LAYER; i < end; i += CHUNK_SIZE) plane[o++] = data[i];
        }
    } else {
        // z fixed: a run of 16 cells a layer.
        for (let start = at * CHUNK_SIZE; o < PLANE; start += LAYER) {
            for (let i = start, end = start + CHUNK_SIZE; i < end; i++) plane[o++] = data[i];
        }
    }
    return plane;
}

/** Writes a facing plane back into a chunk-sized array; every other cell reads 0. */
export function expandBorderPlane(plane: Uint8Array, side: Side, into: Uint8Array): Uint8Array {
    into.fill(0);
    const at = facingCoord(side);
    if (side === 'left' || side === 'right') {
        for (let row = 0, o = 0; row < WORLD_HEIGHT; row++) {
            const base = row * LAYER + at;
            for (let z = 0; z < CHUNK_SIZE; z++) into[base + z * CHUNK_SIZE] = plane[o++];
        }
    } else {
        for (let row = 0; row < WORLD_HEIGHT; row++) {
            into.set(plane.subarray(row * CHUNK_SIZE, (row + 1) * CHUNK_SIZE), row * LAYER + at * CHUNK_SIZE);
        }
    }
    return into;
}

/** The borders a mesh job needs, from the side chunks' full blocks, light and metadata. */
export function packMeshBorders(neighbors: NeighborData, lights: NeighborLight, metas: NeighborData = {}): MeshBorders {
    const borders: MeshBorders = { blocks: {}, light: {}, meta: {} };
    for (const side of SIDES) {
        const blocks = neighbors[side];
        if (blocks) borders.blocks[side] = borderPlane(blocks, side);
        const light = lights[side];
        if (light) borders.light[side] = borderPlane(light, side);
        const meta = metas[side];
        if (meta) borders.meta[side] = borderPlane(meta, side);
    }
    return borders;
}

/** Chunk-sized arrays to expand borders into, reused job after job (one set per worker). */
export interface BorderScratch {
    blocks: Record<Side, Uint8Array>;
    light: Record<Side, Uint8Array>;
    meta: Record<Side, Uint8Array>;
}

export function createBorderScratch(): BorderScratch {
    const set = (): Record<Side, Uint8Array> => ({
        left: new Uint8Array(CHUNK_CELLS),
        right: new Uint8Array(CHUNK_CELLS),
        back: new Uint8Array(CHUNK_CELLS),
        front: new Uint8Array(CHUNK_CELLS),
    });
    return { blocks: set(), light: set(), meta: set() };
}

/** The mesher's inputs back from a mesh job's borders (a missing side stays missing). */
export function unpackMeshBorders(
    borders: MeshBorders,
    centerLight: Uint8Array,
    scratch: BorderScratch,
): { neighbors: NeighborData; lights: NeighborLight; neighborMeta: NeighborData } {
    const neighbors: NeighborData = {};
    const lights: NeighborLight = { center: centerLight };
    const neighborMeta: NeighborData = {};
    for (const side of SIDES) {
        const blocks = borders.blocks[side];
        if (blocks) neighbors[side] = expandBorderPlane(blocks, side, scratch.blocks[side]);
        const light = borders.light[side];
        if (light) lights[side] = expandBorderPlane(light, side, scratch.light[side]);
        const meta = borders.meta?.[side];
        if (meta) neighborMeta[side] = expandBorderPlane(meta, side, scratch.meta[side]);
    }
    return { neighbors, lights, neighborMeta };
}
