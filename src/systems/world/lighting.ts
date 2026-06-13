import { BlockType } from '../../types';
import { BLOCKS } from '../../data/blocks';
import { CHUNK_SIZE, MIN_Y, MAX_Y } from '../../constants';
import { WorldState } from './worldTypes';
import { getChunkData, getLightData } from './worldStore';
import { worldToChunk, index3D, getChunkKey } from './worldCoords';
import { NEIGHBORS, QUEUE_SIZE, SHARED_SKY_Q, SHARED_BLOCK_Q } from './worldConstants';
import { getOpacity } from './blockProps';

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

export function updateLightingAround(state: WorldState, x: number, y: number, z: number, notifyFn: (cx: number, cz: number) => void) {
    floodLightLocal(state, x, y, z, 15);
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    for(let dx=-1; dx<=1; dx++) {
        for(let dz=-1; dz<=1; dz++) {
            notifyFn(cx+dx, cz+dz);
        }
    }
}

export function floodLightLocal(state: WorldState, bx: number, by: number, bz: number, radius: number = 15) {
    // Hot path: runs on the main thread for EVERY block edit (and fluid level change).
    // Uses direct chunk/light array access — the previous getBlock/getLight/setLight
    // version allocated ~800k temporary objects+strings per flood.
    const R = radius;
    const minX = bx - R, maxX = bx + R;
    const minZ = bz - R, maxZ = bz + R;
    const minY = Math.max(MIN_Y, by - R), maxY = Math.min(MAX_Y, by + R);
    const LAYER = CHUNK_SIZE * CHUNK_SIZE;

    let qSkyTail = 0;
    let qBlockTail = 0;
    const qSky = SHARED_SKY_Q;
    const qBlock = SHARED_BLOCK_Q;

    let cxCache = -999999999;
    let czCache = -999999999;
    let chunkCache: Uint8Array | undefined;
    let lightCache: Uint8Array | undefined;
    const refreshCache = (cx: number, cz: number) => {
        if (cx !== cxCache || cz !== czCache) {
            cxCache = cx; czCache = cz;
            chunkCache = getChunkData(state, cx, cz);
            lightCache = getLightData(state, cx, cz);
        }
    };

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
            const lz = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
            const colBase = lz * CHUNK_SIZE + lx;

            // Highest non-air block in the column
            let maxHeight = MIN_Y - 1;
            for (let y = MAX_Y; y >= MIN_Y; y--) {
                if (chunk[(y - MIN_Y) * LAYER + colBase] !== 0) { maxHeight = y; break; }
            }

            // Everything above is sunlit (only write inside the edit bounds)
            for (let y = maxY; y > Math.max(maxHeight, minY - 1); y--) {
                light[(y - MIN_Y) * LAYER + colBase] = 15 << 4;
            }

            let sky = 15;
            // Scan from highest non-air downward; stop once below the writable bounds
            for (let y = maxHeight; y >= minY; y--) {
                const idx = (y - MIN_Y) * LAYER + colBase;
                const b = chunk[idx];
                const opacity = getOpacity(b);
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

    // Pass 2: seed BFS from every lit cell in (and one beyond) the recomputed region.
    cxCache = -999999999; czCache = -999999999;
    chunkCache = undefined; lightCache = undefined;
    const seedMinY = Math.max(MIN_Y, minY - 1);
    const seedMaxY = Math.min(MAX_Y, maxY + 1);
    for (let x = minX - 1; x <= maxX + 1; x++) {
        const cx = Math.floor(x / CHUNK_SIZE);
        const lx = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        for (let z = minZ - 1; z <= maxZ + 1; z++) {
            const cz = Math.floor(z / CHUNK_SIZE);
            refreshCache(cx, cz);
            if (!lightCache) continue; // unloaded chunk: propagation would skip it anyway
            const light = lightCache;
            const lz = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
            const colBase = lz * CHUNK_SIZE + lx;
            for (let y = seedMinY; y <= seedMaxY; y++) {
                const val = light[(y - MIN_Y) * LAYER + colBase];
                if (val === 0) continue;
                if ((val >> 4) > 0 && qSkyTail < QUEUE_SIZE * 3) {
                    qSky[qSkyTail++] = x; qSky[qSkyTail++] = y; qSky[qSkyTail++] = z;
                }
                if ((val & 0xF) > 0 && qBlockTail < QUEUE_SIZE * 3) {
                    qBlock[qBlockTail++] = x; qBlock[qBlockTail++] = y; qBlock[qBlockTail++] = z;
                }
            }
        }
    }

    propagateLightTyped(state, qSky, qSkyTail, qBlock, qBlockTail);
}

export function propagateLightTyped(state: WorldState, qSky: Int32Array, skyCount: number, qBlock: Int32Array, blockCount: number) {
    let cxCache = -999999999;
    let czCache = -999999999;
    let chunkCache: Uint8Array | undefined;
    let lightCache: Uint8Array | undefined;

    const refreshCache = (cx: number, cz: number) => {
        if (cx !== cxCache || cz !== czCache) {
            cxCache = cx; czCache = cz;
            chunkCache = getChunkData(state, cx, cz);
            lightCache = getLightData(state, cx, cz);
        }
    };

    // BFS Block Light
    let head = 0;
    while (head < blockCount) {
        const x = qBlock[head++]; const y = qBlock[head++]; const z = qBlock[head++];
        
        const cx = Math.floor(x / CHUNK_SIZE);
        const cz = Math.floor(z / CHUNK_SIZE);
        refreshCache(cx, cz);
        
        if (!lightCache) continue;
        const curLight = lightCache as Uint8Array;

        const lx = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        const lz = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        const index = index3D(lx, y, lz);
        const lvl = curLight[index] & 0xF;

        if (lvl <= 0) continue;

        for(let i=0; i<6; i++) {
            const nx=x+NEIGHBORS[i][0]; const ny=y+NEIGHBORS[i][1]; const nz=z+NEIGHBORS[i][2];
            if (ny < MIN_Y || ny > MAX_Y) continue;
            
            const ncx = Math.floor(nx / CHUNK_SIZE);
            const ncz = Math.floor(nz / CHUNK_SIZE);
            refreshCache(ncx, ncz);
            
            if (!chunkCache || !lightCache) continue;
            const neighborLight = lightCache as Uint8Array;

            const nlx = ((nx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
            const nlz = ((nz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
            const nIndex = index3D(nlx, ny, nlz);

            const nType = chunkCache[nIndex];
            const atten = Math.max(1, getOpacity(nType));
            const nextLvl = lvl - atten;
            
            const currentNLvl = neighborLight[nIndex] & 0xF;
            if (nextLvl > currentNLvl) {
                neighborLight[nIndex] = (neighborLight[nIndex] & 0xF0) | (nextLvl & 0xF);
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

        const cx = Math.floor(x / CHUNK_SIZE);
        const cz = Math.floor(z / CHUNK_SIZE);
        refreshCache(cx, cz);

        if (!lightCache) continue;
        const curLight = lightCache as Uint8Array;

        const lx = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        const lz = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        const index = index3D(lx, y, lz);
        const lvl = (curLight[index] >> 4) & 0xF;

        if (lvl <= 0) continue;

        for(let i=0; i<6; i++) {
            const nx=x+NEIGHBORS[i][0]; const ny=y+NEIGHBORS[i][1]; const nz=z+NEIGHBORS[i][2];
            if (ny < MIN_Y || ny > MAX_Y) continue;
            
            const ncx = Math.floor(nx / CHUNK_SIZE);
            const ncz = Math.floor(nz / CHUNK_SIZE);
            refreshCache(ncx, ncz);

            if (!chunkCache || !lightCache) continue;
            const neighborLight = lightCache as Uint8Array;
            
            const nlx = ((nx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
            const nlz = ((nz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
            const nIndex = index3D(nlx, ny, nlz);

            const nType = chunkCache[nIndex];
            const opacity = getOpacity(nType);
            let nextLvl = lvl - Math.max(1, opacity);
            
            if (NEIGHBORS[i][1] === -1 && lvl === 15 && opacity === 0) nextLvl = 15;

            const currentNSky = (neighborLight[nIndex] >> 4) & 0xF;
            if (nextLvl > currentNSky) {
                neighborLight[nIndex] = (nextLvl << 4) | (neighborLight[nIndex] & 0xF);
                if (skyCount < QUEUE_SIZE * 3) {
                    qSky[skyCount++] = nx; qSky[skyCount++] = ny; qSky[skyCount++] = nz;
                }
            }
        }
    }
}

export function reconcileChunkBorders(state: WorldState, cx: number, cz: number, notifyFn: (cx: number, cz: number) => void) {
    const neighbors = [
        { dx: -1, dz: 0 }, { dx: 1, dz: 0 },
        { dx: 0, dz: -1 }, { dx: 0, dz: 1 }
    ];

    const qSky = SHARED_SKY_Q;
    const qBlock = SHARED_BLOCK_Q;
    let sCount = 0;
    let bCount = 0;

    const currentLight = getLightData(state, cx, cz);
    if(!currentLight) return;
    const worldX = cx * CHUNK_SIZE;
    const worldZ = cz * CHUNK_SIZE;

    neighbors.forEach(({dx, dz}) => {
        const ncx = cx + dx;
        const ncz = cz + dz;
        const nLight = getLightData(state, ncx, ncz);
        if (!nLight) return;

        const nWorldX = ncx * CHUNK_SIZE;
        const nWorldZ = ncz * CHUNK_SIZE;

        let currXStart = dx === -1 ? 0 : CHUNK_SIZE - 1; 
        let currXEnd = dx === -1 ? 0 : CHUNK_SIZE - 1;
        let currZStart = dz === -1 ? 0 : CHUNK_SIZE - 1;
        let currZEnd = dz === -1 ? 0 : CHUNK_SIZE - 1;
        
        if (dx !== 0) { 
           currZStart = 0; currZEnd = CHUNK_SIZE - 1;
        } else { 
           currXStart = 0; currXEnd = CHUNK_SIZE - 1;
        }

        for (let y = MIN_Y; y <= MAX_Y; y++) {
            for (let lx = currXStart; lx <= currXEnd; lx++) {
                for (let lz = currZStart; lz <= currZEnd; lz++) {
                     const cIndex = index3D(lx, y, lz);
                     const val = currentLight[cIndex];

                     let nlx = lx; let nlz = lz;
                     if (dx === -1) nlx = CHUNK_SIZE - 1;
                     else if (dx === 1) nlx = 0;
                     else if (dz === -1) nlz = CHUNK_SIZE - 1;
                     else if (dz === 1) nlz = 0;

                     const nIndex = index3D(nlx, y, nlz);
                     const nVal = nLight[nIndex];

                     // When both sides of the border are fully sunlit (sky=15), neither can
                     // improve the other — this is the overwhelmingly common open-air case
                     // and skipping it removes tens of thousands of no-op BFS seeds per
                     // chunk load on the main thread.
                     const curSky = val >> 4;
                     const nSky = nVal >> 4;
                     const bothSaturated = curSky === 15 && nSky === 15;

                     if (curSky > 0 && !bothSaturated && sCount < QUEUE_SIZE * 3) {
                         qSky[sCount++] = worldX + lx; qSky[sCount++] = y; qSky[sCount++] = worldZ + lz;
                     }
                     if ((val & 0xF) > 0 && bCount < QUEUE_SIZE * 3) {
                         qBlock[bCount++] = worldX + lx; qBlock[bCount++] = y; qBlock[bCount++] = worldZ + lz;
                     }

                     if (nSky > 0 && !bothSaturated && sCount < QUEUE_SIZE * 3) {
                         qSky[sCount++] = nWorldX + nlx; qSky[sCount++] = y; qSky[sCount++] = nWorldZ + nlz;
                     }
                     if ((nVal & 0xF) > 0 && bCount < QUEUE_SIZE * 3) {
                         qBlock[bCount++] = nWorldX + nlx; qBlock[bCount++] = y; qBlock[bCount++] = nWorldZ + nlz;
                     }
                }
            }
        }
    });

    propagateLightTyped(state, qSky, sCount, qBlock, bCount);
    
    neighbors.forEach(({dx, dz}) => {
        if (state.chunks.has(getChunkKey(cx+dx, cz+dz))) notifyFn(cx+dx, cz+dz);
    });
    notifyFn(cx, cz);
}