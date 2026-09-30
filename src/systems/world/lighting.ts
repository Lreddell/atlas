import { BlockType } from '../../types';
import { BLOCKS } from '../../data/blocks';
import { CHUNK_SIZE, MIN_Y, MAX_Y } from '../../constants';
import { WorldState } from './worldTypes';
import { getChunkData, getLightData, getMetadataData } from './worldStore';
import { worldToChunk, index3D, getChunkKey } from './worldCoords';
import { NEIGHBORS, QUEUE_SIZE, SHARED_SKY_Q, SHARED_BLOCK_Q } from './worldConstants';
import { getDirectionalOpacity, getPairedFaceOcclusion } from './blockProps';

const LAYER_CELLS = CHUNK_SIZE * CHUNK_SIZE;

export function getLight(state: WorldState, x: number, y: number, z: number): { sky: number, block: number } {
    if (y < MIN_Y || y > MAX_Y) return { sky: 15, block: 0 };
    const { cx, cz, lx, lz } = worldToChunk(x, z);
    
    const lightData = getLightData(state, cx, cz);
    if (!lightData) return { sky: 15, block: 0 };
    
    const val = lightData[index3D(lx, y, lz)];
    return { sky: (val >> 4) & 0xF, block: val & 0xF };
}

export function setLight(state: WorldState, x: number, y: number, z: number, sky: number, block: number) {
    if (y < MIN_Y || y > MAX_Y) return;
    const { cx, cz, lx, lz } = worldToChunk(x, z);
    
    const lightData = getLightData(state, cx, cz);
    if (!lightData) return;

    lightData[index3D(lx, y, lz)] = (sky << 4) | (block & 0xF);
}

/**
 * Relights the cells within `radius` of an edit and tells notifyFn about each
 * chunk whose mesh the change reaches: the chunks whose light changed, and a
 * side neighbour wherever a changed cell sits on the border it meshes against
 * (meshBorders.ts). A chunk whose light came out the same isn't remeshed, so
 * an edit usually remeshes one chunk or two rather than all nine around it.
 */
export function updateLightingAround(state: WorldState, x: number, y: number, z: number, notifyFn: (cx: number, cz: number) => void, radius: number = 15) {
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const reached = floodLightLocal(state, x, y, z, Math.min(15, radius));
    for (let dx = -REACH_SPAN; dx <= REACH_SPAN; dx++) {
        for (let dz = -REACH_SPAN; dz <= REACH_SPAN; dz++) {
            if (reached & reachBit(dx, dz)) notifyFn(cx + dx, cz + dz);
        }
    }
}

// Which chunks a relight reached: a bit per chunk within REACH_SPAN of the
// edited one. A radius of at most 15 (and its one-cell rim) stays inside the
// chunks next to it, and their border cells reach one chunk further.
const REACH_SPAN = 2;
const reachBit = (dx: number, dz: number) => 1 << ((dx + REACH_SPAN) * (REACH_SPAN * 2 + 1) + (dz + REACH_SPAN));

// A relight's working copies, for the largest box (radius 15) and its rim:
// the light before, and each column's highest block.
const RELIGHT_SPAN = 33;
const relightBefore = new Uint8Array(RELIGHT_SPAN * RELIGHT_SPAN * RELIGHT_SPAN);
const relightTops = new Int16Array(RELIGHT_SPAN * RELIGHT_SPAN);
const relightNeighbourTops = new Int16Array(RELIGHT_SPAN * RELIGHT_SPAN);

/** The height of a column's highest non-air block, or MIN_Y - 1 for an empty one. */
function columnTop(chunk: Uint8Array, colBase: number, LAYER: number): number {
    for (let y = MAX_Y; y >= MIN_Y; y--) {
        if (chunk[(y - MIN_Y) * LAYER + colBase] !== 0) return y;
    }
    return MIN_Y - 1;
}

/**
 * Recomputes light in the box within `radius` of (bx, by, bz): straight-down
 * skylight and emission column by column, then a flood from every cell that
 * can light a neighbour. Returns the chunks it reached (reachBit, relative to
 * the edited one's).
 *
 * The flood leaves out cells that can't brighten anything: open sky above a
 * column's top already holds 15, and so does the air beside it at that height
 * unless the neighbouring column rises that high. So a sunlit cell above its
 * column seeds the flood only up to its neighbours' tops. Cells at or under a
 * top (water, leaves, caves) and anything with block light still all seed it.
 */
export function floodLightLocal(state: WorldState, bx: number, by: number, bz: number, radius: number = 15): number {
    // Hot path: runs on the main thread for EVERY block edit (and fluid level change).
    // Uses direct chunk/light array access, the previous getBlock/getLight/setLight
    // version allocated ~800k temporary objects+strings per flood.
    const R = radius;
    const minX = bx - R, maxX = bx + R;
    const minZ = bz - R, maxZ = bz + R;
    const minY = Math.max(MIN_Y, by - R), maxY = Math.min(MAX_Y, by + R);
    const LAYER = CHUNK_SIZE * CHUNK_SIZE;
    // The box and a one-cell rim: the cells the flood reads, seeds from and may change.
    const rimMinX = minX - 1, rimMinZ = minZ - 1;
    const spanX = maxX - minX + 3, spanZ = maxZ - minZ + 3;
    const seedMinY = Math.max(MIN_Y, minY - 1);
    const seedMaxY = Math.min(MAX_Y, maxY + 1);
    const spanY = seedMaxY - seedMinY + 1;
    const ccx = Math.floor(bx / CHUNK_SIZE);
    const ccz = Math.floor(bz / CHUNK_SIZE);

    let qSkyTail = 0;
    let qBlockTail = 0;
    const qSky = SHARED_SKY_Q;
    const qBlock = SHARED_BLOCK_Q;

    let cxCache = -999999999;
    let czCache = -999999999;
    let chunkCache: Uint8Array | undefined;
    let lightCache: Uint8Array | undefined;
    let metaCache: Uint8Array | undefined;
    const refreshCache = (cx: number, cz: number) => {
        if (cx !== cxCache || cz !== czCache) {
            cxCache = cx; czCache = cz;
            chunkCache = getChunkData(state, cx, cz);
            lightCache = getLightData(state, cx, cz);
            metaCache = getMetadataData(state, cx, cz);
        }
    };

    // Before anything changes: the light of the box and its rim, and every column's top.
    for (let i = 0; i < spanX; i++) {
        const x = rimMinX + i;
        const cx = Math.floor(x / CHUNK_SIZE);
        const lx = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        for (let k = 0; k < spanZ; k++) {
            const z = rimMinZ + k;
            const cz = Math.floor(z / CHUNK_SIZE);
            refreshCache(cx, cz);
            const column = i * spanZ + k;
            if (!chunkCache || !lightCache) { relightTops[column] = MIN_Y - 1; continue; }
            const lz = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
            const colBase = lz * CHUNK_SIZE + lx;
            const base = column * spanY;
            for (let y = seedMinY; y <= seedMaxY; y++) relightBefore[base + y - seedMinY] = lightCache[(y - MIN_Y) * LAYER + colBase];
            relightTops[column] = columnTop(chunkCache, colBase, LAYER);
        }
    }
    // The highest of each column's side neighbours (within the rim).
    for (let i = 0; i < spanX; i++) {
        for (let k = 0; k < spanZ; k++) {
            let top = MIN_Y - 1;
            if (i > 0) top = Math.max(top, relightTops[(i - 1) * spanZ + k]);
            if (i < spanX - 1) top = Math.max(top, relightTops[(i + 1) * spanZ + k]);
            if (k > 0) top = Math.max(top, relightTops[i * spanZ + k - 1]);
            if (k < spanZ - 1) top = Math.max(top, relightTops[i * spanZ + k + 1]);
            relightNeighbourTops[i * spanZ + k] = top;
        }
    }

    // Pass 1: recompute vertical skylight + emission for each column in the area.
    for (let x = minX; x <= maxX; x++) {
        const cx = Math.floor(x / CHUNK_SIZE);
        const lx = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        for (let z = minZ; z <= maxZ; z++) {
            const cz = Math.floor(z / CHUNK_SIZE);
            refreshCache(cx, cz);
            if (!chunkCache || !lightCache) continue;
            const chunk = chunkCache;
            const light = lightCache;
            const meta = metaCache;
            const lz = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
            const colBase = lz * CHUNK_SIZE + lx;

            // Highest non-air block in the column
            const maxHeight = relightTops[(x - rimMinX) * spanZ + (z - rimMinZ)];

            // Everything above is sunlit (only write inside the edit bounds)
            for (let y = maxY; y > Math.max(maxHeight, minY - 1); y--) {
                light[(y - MIN_Y) * LAYER + colBase] = 15 << 4;
            }

            let sky = 15;
            // Scan from highest non-air downward; stop once below the writable bounds
            for (let y = maxHeight; y >= minY; y--) {
                const idx = (y - MIN_Y) * LAYER + colBase;
                const b = chunk[idx];
                // Skylight scans straight down, so probe the cell's downward-entry
                // (top) face: a top slab seals it (sky=0 below), a bottom slab leaves
                // it open (sky dims by 1 and keeps falling).
                const opacity = getDirectionalOpacity(b, meta ? meta[idx] : 0, 0, -1, 0);
                if (opacity >= 15) sky = 0;
                else if (opacity > 0) sky = Math.max(0, sky - opacity);

                if (y <= maxY) {
                    const def = BLOCKS[b as BlockType];
                    const emission = def ? (def.lightLevel || 0) : 0;
                    light[idx] = (sky << 4) | (emission & 0xF);
                }
            }
        }
    }

    // Pass 2: seed the flood from every cell in (and one beyond) the recomputed
    // region that can light a neighbour.
    cxCache = -999999999; czCache = -999999999;
    chunkCache = undefined; lightCache = undefined;
    for (let x = rimMinX; x <= maxX + 1; x++) {
        const cx = Math.floor(x / CHUNK_SIZE);
        const lx = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        for (let z = rimMinZ; z <= maxZ + 1; z++) {
            const cz = Math.floor(z / CHUNK_SIZE);
            refreshCache(cx, cz);
            if (!lightCache) continue; // unloaded chunk: propagation would skip it anyway
            const light = lightCache;
            const lz = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
            const colBase = lz * CHUNK_SIZE + lx;
            const column = (x - rimMinX) * spanZ + (z - rimMinZ);
            // Sunlit cells above this height light nothing new.
            const skySeedTop = Math.max(relightTops[column], relightNeighbourTops[column]);
            for (let y = seedMinY; y <= seedMaxY; y++) {
                const val = light[(y - MIN_Y) * LAYER + colBase];
                if (val === 0) continue;
                if ((val >> 4) > 0 && y <= skySeedTop && qSkyTail < QUEUE_SIZE * 3) {
                    qSky[qSkyTail++] = x; qSky[qSkyTail++] = y; qSky[qSkyTail++] = z;
                }
                if ((val & 0xF) > 0 && qBlockTail < QUEUE_SIZE * 3) {
                    qBlock[qBlockTail++] = x; qBlock[qBlockTail++] = y; qBlock[qBlockTail++] = z;
                }
            }
        }
    }

    lightWrites.minX = lightWrites.minZ = Infinity;
    lightWrites.maxX = lightWrites.maxZ = -Infinity;
    propagateLightTyped(state, qSky, qSkyTail, qBlock, qBlockTail);

    // Which chunks' meshes the new light reaches.
    let reached = 0;
    // Light that spread past the rim (a relight box round a spread of fluid
    // changes can send it further): every chunk it may have touched.
    if (lightWrites.minX < rimMinX || lightWrites.maxX > maxX + 1 || lightWrites.minZ < rimMinZ || lightWrites.maxZ > maxZ + 1) {
        const x0 = Math.max(ccx - REACH_SPAN, Math.floor((lightWrites.minX - 1) / CHUNK_SIZE));
        const x1 = Math.min(ccx + REACH_SPAN, Math.floor((lightWrites.maxX + 1) / CHUNK_SIZE));
        const z0 = Math.max(ccz - REACH_SPAN, Math.floor((lightWrites.minZ - 1) / CHUNK_SIZE));
        const z1 = Math.min(ccz + REACH_SPAN, Math.floor((lightWrites.maxZ + 1) / CHUNK_SIZE));
        for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) reached |= reachBit(cx - ccx, cz - ccz);
    }
    cxCache = -999999999; czCache = -999999999;
    chunkCache = undefined; lightCache = undefined;
    for (let i = 0; i < spanX; i++) {
        const x = rimMinX + i;
        const cx = Math.floor(x / CHUNK_SIZE);
        const lx = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        for (let k = 0; k < spanZ; k++) {
            const z = rimMinZ + k;
            const cz = Math.floor(z / CHUNK_SIZE);
            refreshCache(cx, cz);
            if (!lightCache) continue;
            const lz = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
            const colBase = lz * CHUNK_SIZE + lx;
            const base = (i * spanZ + k) * spanY;
            let changed = false;
            for (let y = seedMinY; y <= seedMaxY; y++) {
                if (lightCache[(y - MIN_Y) * LAYER + colBase] !== relightBefore[base + y - seedMinY]) { changed = true; break; }
            }
            if (!changed) continue;
            const dx = cx - ccx, dz = cz - ccz;
            reached |= reachBit(dx, dz);
            if (lx === 0) reached |= reachBit(dx - 1, dz);
            else if (lx === CHUNK_SIZE - 1) reached |= reachBit(dx + 1, dz);
            if (lz === 0) reached |= reachBit(dx, dz - 1);
            else if (lz === CHUNK_SIZE - 1) reached |= reachBit(dx, dz + 1);
        }
    }
    return reached;
}

/** Where the last flood wrote light, in world x and z (floodLightLocal reads it). */
const lightWrites = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
const noteLightWrite = (x: number, z: number) => {
    if (x < lightWrites.minX) lightWrites.minX = x;
    if (x > lightWrites.maxX) lightWrites.maxX = x;
    if (z < lightWrites.minZ) lightWrites.minZ = z;
    if (z > lightWrites.maxZ) lightWrites.maxZ = z;
};

export function propagateLightTyped(state: WorldState, qSky: Int32Array, skyCount: number, qBlock: Int32Array, blockCount: number) {
    // Chunks are 16 wide (CHUNK_SIZE): a world coordinate's chunk is x >> 4 and
    // its place in the chunk x & 15, negatives included, with no division.
    let cxCache = -999999999;
    let czCache = -999999999;
    let chunkCache: Uint8Array | undefined;
    let lightCache: Uint8Array | undefined;
    let metaCache: Uint8Array | undefined;

    const refreshCache = (cx: number, cz: number) => {
        if (cx !== cxCache || cz !== czCache) {
            cxCache = cx; czCache = cz;
            chunkCache = getChunkData(state, cx, cz);
            lightCache = getLightData(state, cx, cz);
            metaCache = getMetadataData(state, cx, cz);
        }
    };

    // BFS Block Light
    let head = 0;
    while (head < blockCount) {
        const x = qBlock[head++]; const y = qBlock[head++]; const z = qBlock[head++];

        refreshCache(x >> 4, z >> 4);

        if (!lightCache) continue;
        const curLight = lightCache as Uint8Array;

        const index = (y - MIN_Y) * LAYER_CELLS + ((z & 15) << 4) + (x & 15);
        const lvl = curLight[index] & 0xF;

        if (lvl <= 0) continue;

        // Source block/meta (cache currently holds the source chunk), used so a
        // shaped source can't emit light back out through one of its sealed faces.
        const srcType = chunkCache ? chunkCache[index] : 0;
        const srcMeta = metaCache ? metaCache[index] : 0;

        for(let i=0; i<6; i++) {
            const dir = NEIGHBORS[i];
            const nx = x + dir[0]; const ny = y + dir[1]; const nz = z + dir[2];
            if (ny < MIN_Y || ny > MAX_Y) continue;

            refreshCache(nx >> 4, nz >> 4);

            if (!chunkCache || !lightCache) continue;
            const neighborLight = lightCache as Uint8Array;

            const nIndex = (ny - MIN_Y) * LAYER_CELLS + ((nz & 15) << 4) + (nx & 15);

            const nType = chunkCache[nIndex];
            const nMeta = metaCache ? metaCache[nIndex] : 0;
            const atten = Math.max(1, getPairedFaceOcclusion(srcType, srcMeta, nType, nMeta, dir[0], dir[1], dir[2]));
            const nextLvl = lvl - atten;

            const currentNLvl = neighborLight[nIndex] & 0xF;
            if (nextLvl > currentNLvl) {
                neighborLight[nIndex] = (neighborLight[nIndex] & 0xF0) | (nextLvl & 0xF);
                noteLightWrite(nx, nz);
                if (blockCount < QUEUE_SIZE * 3) {
                    qBlock[blockCount++] = nx; qBlock[blockCount++] = ny; qBlock[blockCount++] = nz;
                }
            }
        }
    }

    // BFS Sky Light
    head = 0;
    cxCache = -999999999; czCache = -999999999;
    chunkCache = undefined; lightCache = undefined;

    while (head < skyCount) {
        const x = qSky[head++]; const y = qSky[head++]; const z = qSky[head++];

        refreshCache(x >> 4, z >> 4);

        if (!lightCache) continue;
        const curLight = lightCache as Uint8Array;

        const index = (y - MIN_Y) * LAYER_CELLS + ((z & 15) << 4) + (x & 15);
        const lvl = (curLight[index] >> 4) & 0xF;

        if (lvl <= 0) continue;

        const srcType = chunkCache ? chunkCache[index] : 0;
        const srcMeta = metaCache ? metaCache[index] : 0;

        for(let i=0; i<6; i++) {
            const dir = NEIGHBORS[i];
            const nx = x + dir[0]; const ny = y + dir[1]; const nz = z + dir[2];
            if (ny < MIN_Y || ny > MAX_Y) continue;

            refreshCache(nx >> 4, nz >> 4);

            if (!chunkCache || !lightCache) continue;
            const neighborLight = lightCache as Uint8Array;

            const nIndex = (ny - MIN_Y) * LAYER_CELLS + ((nz & 15) << 4) + (nx & 15);

            const nType = chunkCache[nIndex];
            const nMeta = metaCache ? metaCache[nIndex] : 0;
            const opacity = getPairedFaceOcclusion(srcType, srcMeta, nType, nMeta, dir[0], dir[1], dir[2]);
            let nextLvl = lvl - Math.max(1, opacity);

            if (dir[1] === -1 && lvl === 15 && opacity === 0) nextLvl = 15;

            const currentNSky = (neighborLight[nIndex] >> 4) & 0xF;
            if (nextLvl > currentNSky) {
                neighborLight[nIndex] = (nextLvl << 4) | (neighborLight[nIndex] & 0xF);
                noteLightWrite(nx, nz);
                if (skyCount < QUEUE_SIZE * 3) {
                    qSky[skyCount++] = nx; qSky[skyCount++] = ny; qSky[skyCount++] = nz;
                }
            }
        }
    }
}

const BORDER_SIDES: readonly (readonly [number, number])[] = [[-1, 0], [1, 0], [0, -1], [0, 1]];

/**
 * Lets light across a newly arrived chunk's four borders, both ways, and
 * tells notifyFn about each chunk whose mesh the new light reaches.
 *
 * Each side of a border is already lit consistently within itself (the
 * worker lit the new chunk, and its neighbours were reconciled as they came),
 * so light only moves where one side can raise the other: a border cell
 * seeds the flood only if its light is at least 2 above the cell facing it
 * (light loses at least 1 a cell). Seeding every lit cell, as before, gave
 * the same light, but under water and trees, where neither side is fully
 * sunlit, thousands of seeds a chunk flooded nothing: half a millisecond a
 * chunk while the world streams in. Only the chunks the light was written in
 * (and the side chunk of a border it was written on) are remeshed.
 */
export function reconcileChunkBorders(state: WorldState, cx: number, cz: number, notifyFn: (cx: number, cz: number) => void) {
    const currentLight = getLightData(state, cx, cz);
    if (!currentLight) return;

    const qSky = SHARED_SKY_Q;
    const qBlock = SHARED_BLOCK_Q;
    const cap = QUEUE_SIZE * 3;
    let sCount = 0;
    let bCount = 0;
    const worldX = cx * CHUNK_SIZE;
    const worldZ = cz * CHUNK_SIZE;

    for (const [dx, dz] of BORDER_SIDES) {
        const nLight = getLightData(state, cx + dx, cz + dz);
        if (!nLight) continue;
        const nWorldX = (cx + dx) * CHUNK_SIZE;
        const nWorldZ = (cz + dz) * CHUNK_SIZE;
        // This chunk's cells along the border, and the side chunk's facing them.
        const lx = dx === -1 ? 0 : CHUNK_SIZE - 1;
        const nlx = dx === -1 ? CHUNK_SIZE - 1 : 0;
        const lz = dz === -1 ? 0 : CHUNK_SIZE - 1;
        const nlz = dz === -1 ? CHUNK_SIZE - 1 : 0;
        for (let y = MIN_Y; y <= MAX_Y; y++) {
            for (let t = 0; t < CHUNK_SIZE; t++) {
                const ax = dx !== 0 ? lx : t;
                const az = dx !== 0 ? t : lz;
                const bx = dx !== 0 ? nlx : t;
                const bz = dx !== 0 ? t : nlz;
                const val = currentLight[index3D(ax, y, az)];
                const nVal = nLight[index3D(bx, y, bz)];
                const sky = val >> 4;
                const nSky = nVal >> 4;
                const block = val & 0xF;
                const nBlock = nVal & 0xF;
                if (sky > nSky + 1 && sCount < cap) {
                    qSky[sCount++] = worldX + ax; qSky[sCount++] = y; qSky[sCount++] = worldZ + az;
                } else if (nSky > sky + 1 && sCount < cap) {
                    qSky[sCount++] = nWorldX + bx; qSky[sCount++] = y; qSky[sCount++] = nWorldZ + bz;
                }
                if (block > nBlock + 1 && bCount < cap) {
                    qBlock[bCount++] = worldX + ax; qBlock[bCount++] = y; qBlock[bCount++] = worldZ + az;
                } else if (nBlock > block + 1 && bCount < cap) {
                    qBlock[bCount++] = nWorldX + bx; qBlock[bCount++] = y; qBlock[bCount++] = nWorldZ + bz;
                }
            }
        }
    }

    if (sCount === 0 && bCount === 0) return;
    lightWrites.minX = lightWrites.minZ = Infinity;
    lightWrites.maxX = lightWrites.maxZ = -Infinity;
    propagateLightTyped(state, qSky, sCount, qBlock, bCount);
    if (lightWrites.minX === Infinity) return;

    // Every chunk light was written in, and the side chunk of any border cell it was written on.
    const x0 = Math.floor((lightWrites.minX - 1) / CHUNK_SIZE);
    const x1 = Math.floor((lightWrites.maxX + 1) / CHUNK_SIZE);
    const z0 = Math.floor((lightWrites.minZ - 1) / CHUNK_SIZE);
    const z1 = Math.floor((lightWrites.maxZ + 1) / CHUNK_SIZE);
    for (let ncx = x0; ncx <= x1; ncx++) {
        for (let ncz = z0; ncz <= z1; ncz++) {
            if (state.chunks.has(getChunkKey(ncx, ncz))) notifyFn(ncx, ncz);
        }
    }
}