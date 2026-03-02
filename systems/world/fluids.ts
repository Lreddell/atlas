
import { BlockType } from '../../types';
import { BLOCKS } from '../../data/blocks';
import { WorldState } from './worldTypes';
import { getChunkData, getMetadataData } from './worldStore';
import { worldToChunk, index3D } from './worldCoords';
import { MIN_Y, MAX_Y } from '../../constants';
import { worldManager } from '../WorldManager';
import { isWashable } from './blockProps';

const MAX_WATER_SPREAD = 7;
const MAX_LAVA_SPREAD = 3;

interface FluidUpdate {
    x: number; y: number; z: number;
    type: BlockType;
    tickAt: number;
}

const fluidQueueMap = new Map<string, FluidUpdate>();

export function scheduleFluidUpdate(x: number, y: number, z: number, type: BlockType, delayTicks: number) {
    const key = `${x},${y},${z}`;
    const tickAt = Date.now() + (delayTicks * 50);
    
    const existing = fluidQueueMap.get(key);
    if (!existing || tickAt < existing.tickAt) {
        fluidQueueMap.set(key, { x, y, z, type, tickAt });
    }
}

function getBlockAndMeta(state: WorldState, x: number, y: number, z: number) {
    if (y < MIN_Y || y > MAX_Y) return { type: BlockType.BEDROCK, meta: 0 };
    const { cx, cz, lx, lz } = worldToChunk(x, z);
    const chunk = getChunkData(state, cx, cz);
    if (!chunk) return { type: BlockType.AIR, meta: 0 };
    
    const idx = index3D(lx, y, lz);
    const type = chunk[idx];
    const metaArr = getMetadataData(state, cx, cz);
    const meta = metaArr ? metaArr[idx] : 0;
    
    return { type, meta };
}

function isReplaceable(type: BlockType) {
    return type === BlockType.AIR || isWashable(type) || (type !== BlockType.WATER && type !== BlockType.LAVA && !BLOCKS[type].noCollision === false);
}

function calculateFlowCost(state: WorldState, sx: number, sy: number, sz: number): number {
    const q = [{x: sx, z: sz, dist: 0}];
    const visited = new Set<string>();
    visited.add(`${sx},${sz}`);
    
    let head = 0;
    while(head < q.length) {
        const {x, z, dist} = q[head++];
        
        const { type: downType } = getBlockAndMeta(state, x, sy - 1, z);
        if (isReplaceable(downType)) {
            return dist;
        }
        
        if (dist >= 4) continue;

        const neighbors = [[1,0], [-1,0], [0,1], [0,-1]];
        for(const [dx, dz] of neighbors) {
            const nx = x + dx; const nz = z + dz;
            if (visited.has(`${nx},${nz}`)) continue;
            
            const { type: t } = getBlockAndMeta(state, nx, sy, nz);
            if (isReplaceable(t) || t === BlockType.WATER || t === BlockType.LAVA) {
                visited.add(`${nx},${nz}`);
                q.push({x: nx, z: nz, dist: dist + 1});
            }
        }
    }
    return 1000;
}

function trySpreadTo(state: WorldState, x: number, y: number, z: number, type: BlockType, newMeta: number) {
    const { type: targetType } = getBlockAndMeta(state, x, y, z);
    
    if (isWashable(targetType)) {
        worldManager.spawnDrop(targetType, x, y, z);
    }

    worldManager.setBlock(x, y, z, type, newMeta);
    const delay = type === BlockType.LAVA ? 30 : 5;
    scheduleFluidUpdate(x, y, z, type, delay);
}

export function processFluids(state: WorldState) {
    const now = Date.now();
    const updatesToProcess: FluidUpdate[] = [];
    let processCount = 0;
    const MAX_UPDATES_PER_TICK = 32; 
    
    for (const [key, update] of fluidQueueMap) {
        if (now >= update.tickAt) {
            updatesToProcess.push(update);
            fluidQueueMap.delete(key);
            processCount++;
            if (processCount >= MAX_UPDATES_PER_TICK) break;
        }
    }

    for (const { x, y, z, type } of updatesToProcess) {
        const { type: currentType, meta: currentMeta } = getBlockAndMeta(state, x, y, z);
        if (currentType !== type) continue;

        const neighbors = [[0,1,0], [0,-1,0], [1,0,0], [-1,0,0], [0,0,1], [0,0,-1]];
        let turnedToStone = false;
        
        for(const [dx, dy, dz] of neighbors) {
            const { type: nt } = getBlockAndMeta(state, x+dx, y+dy, z+dz);
            if (type === BlockType.LAVA && nt === BlockType.WATER) {
                 worldManager.setBlock(x, y, z, BlockType.COBBLESTONE);
                 turnedToStone = true;
                 break;
            }
            if (type === BlockType.WATER && nt === BlockType.LAVA) {
                 const { meta: nm } = getBlockAndMeta(state, x+dx, y+dy, z+dz);
                 if (nm === 0) { 
                     worldManager.setBlock(x+dx, y+dy, z+dz, BlockType.OBSIDIAN);
                 } else {
                     worldManager.setBlock(x+dx, y+dy, z+dz, BlockType.COBBLESTONE);
                 }
            }
        }
        if (turnedToStone) continue;

        const isSource = currentMeta === 0;
        const decay = isSource ? 0 : currentMeta;
        
        const down = getBlockAndMeta(state, x, y - 1, z);
        const canFlowDown = isReplaceable(down.type) || (down.type === type && down.meta !== 8);
        
        if (canFlowDown) {
             if (down.type !== type || down.meta !== 8) {
                 trySpreadTo(state, x, y - 1, z, type, 8); 
             }
             if (!isSource) continue; 
        }

        const maxSpread = type === BlockType.LAVA ? MAX_LAVA_SPREAD : MAX_WATER_SPREAD;
        const newMeta = decay + 1;
        
        if (newMeta <= maxSpread) {
             const horiz = [[1,0], [-1,0], [0,1], [0,-1]];
             
             let flowMask = [true, true, true, true]; 
             
             if (type === BlockType.WATER) {
                 const costs = horiz.map(([dx, dz]) => {
                     const nx = x+dx; const nz = z+dz;
                     const target = getBlockAndMeta(state, nx, y, nz);
                     if (isReplaceable(target.type) || (target.type === type && target.meta > newMeta)) {
                         return calculateFlowCost(state, nx, y, nz);
                     }
                     return 10000; 
                 });
                 
                 const minCost = Math.min(...costs);
                 if (minCost < 10000) {
                     flowMask = costs.map(c => c === minCost);
                 }
             }

             horiz.forEach(([dx, dz], i) => {
                 if (!flowMask[i]) return;
                 
                 const nx = x+dx; const nz = z+dz;
                 const target = getBlockAndMeta(state, nx, y, nz);
                 
                 if (isReplaceable(target.type)) {
                     trySpreadTo(state, nx, y, nz, type, newMeta);
                 } else if (target.type === type && target.meta > newMeta) {
                     trySpreadTo(state, nx, y, nz, type, newMeta);
                 }
             });
        }

        if (type === BlockType.WATER && currentMeta !== 0) {
            let sourceNeighbors = 0;
            [[1,0], [-1,0], [0,1], [0,-1]].forEach(([dx, dz]) => {
                const { type: nt, meta: nm } = getBlockAndMeta(state, x + dx, y, z + dz);
                if (nt === type && nm === 0) sourceNeighbors++;
            });
            if (sourceNeighbors >= 2) {
                const downSup = getBlockAndMeta(state, x, y - 1, z);
                if (!isReplaceable(downSup.type) || (downSup.type === type && downSup.meta === 0)) {
                    worldManager.setBlock(x, y, z, type, 0); 
                }
            }
        }
    }
}
