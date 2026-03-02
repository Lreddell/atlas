import { BlockType } from '../../types';
import { BLOCKS } from '../../data/blocks';
import { CHUNK_SIZE, MIN_Y, MAX_Y } from '../../constants';
import { WorldState } from './worldTypes';
import { getChunkData, getLightData } from './worldStore';
import { worldToChunk, index3D, getChunkKey } from './worldCoords';
import { NEIGHBORS, QUEUE_SIZE, SHARED_SKY_Q, SHARED_BLOCK_Q } from './worldConstants';
import { getOpacity } from './blockProps';

function getBlock(state: WorldState, x: number, y: number, z: number): BlockType {
    if (y < MIN_Y || y > MAX_Y) return BlockType.AIR;
    const { cx, cz, lx, lz } = worldToChunk(x, z);
    const chunk = getChunkData(state, cx, cz);
    if (!chunk) return BlockType.AIR;
    return chunk[index3D(lx, y, lz)];
}

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
    const R = radius;
    const bounds = {
        minX: bx - R, maxX: bx + R,
        minY: Math.max(MIN_Y, by - R), maxY: Math.min(MAX_Y, by + R), 
        minZ: bz - R, maxZ: bz + R
    };
    
    let qSkyTail = 0;
    let qBlockTail = 0;
    const qSky = SHARED_SKY_Q; 
    const qBlock = SHARED_BLOCK_Q;

    for(let x=bounds.minX; x<=bounds.maxX; x++) {
        for(let z=bounds.minZ; z<=bounds.maxZ; z++) {
             // Optimized find first non-air block
             let maxHeight = MIN_Y;
             for (let h = MAX_Y; h >= MIN_Y; h--) {
                 if (getBlock(state, x, h, z) !== BlockType.AIR) {
                     maxHeight = h;
                     break;
                 }
             }

             // Everything above is sunlit
             for (let y = MAX_Y; y > maxHeight; y--) {
                 if (y >= bounds.minY && y <= bounds.maxY) {
                    setLight(state, x, y, z, 15, 0);
                 }
             }

             let sky = 15;
             // Scan from highest non-air downward
             for(let y=maxHeight; y>=MIN_Y; y--) {
                 const b = getBlock(state, x,y,z);
                 const opacity = getOpacity(b);
                 if (opacity >= 15) sky = 0;
                 else if (opacity > 0) sky = Math.max(0, sky - opacity);
                 
                 if (y >= bounds.minY && y <= bounds.maxY) {
                      const def = BLOCKS[b];
                      const emission = def ? (def.lightLevel || 0) : 0;
                      setLight(state, x,y,z, sky, emission);
                 }
             }
        }
    }

    for(let x=bounds.minX-1; x<=bounds.maxX+1; x++) {
        for(let z=bounds.minZ-1; z<=bounds.maxZ+1; z++) {
            for(let y=bounds.minY-1; y<=bounds.maxY+1; y++) {
                if (y < MIN_Y || y > MAX_Y) continue;
                const l = getLight(state, x,y,z);
                if (l.sky > 0 && qSkyTail < QUEUE_SIZE * 3) {
                    qSky[qSkyTail++] = x; qSky[qSkyTail++] = y; qSky[qSkyTail++] = z;
                }
                if (l.block > 0 && qBlockTail < QUEUE_SIZE * 3) {
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
                     if ((val >> 4) > 0 && sCount < QUEUE_SIZE * 3) {
                         qSky[sCount++] = worldX + lx; qSky[sCount++] = y; qSky[sCount++] = worldZ + lz;
                     }
                     if ((val & 0xF) > 0 && bCount < QUEUE_SIZE * 3) {
                         qBlock[bCount++] = worldX + lx; qBlock[bCount++] = y; qBlock[bCount++] = worldZ + lz;
                     }
                     
                     let nlx = lx; let nlz = lz;
                     if (dx === -1) nlx = CHUNK_SIZE - 1;
                     else if (dx === 1) nlx = 0;
                     else if (dz === -1) nlz = CHUNK_SIZE - 1;
                     else if (dz === 1) nlz = 0;
                     
                     const nIndex = index3D(nlx, y, nlz);
                     const nVal = nLight[nIndex];
                     if ((nVal >> 4) > 0 && sCount < QUEUE_SIZE * 3) {
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