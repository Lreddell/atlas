
import { WorldManager } from '../WorldManager';
import { BlockType } from '../../types';
import { BLOCKS } from '../../data/blocks';
import { CONTACT_EPS, GROUND_EPS } from './playerConstants';

// Helper to check solidity without generating chunks
// Now supports partial height blocks like Beds
function getBlockHeight(type: BlockType): number {
    if (type === BlockType.BED_FOOT || type === BlockType.BED_HEAD) return 0.5;
    // Standard solidity check for full blocks
    if (type === BlockType.AIR || type === BlockType.WATER || type === BlockType.LAVA) return 0;
    const def = BLOCKS[type];
    if (def && def.noCollision) return 0;
    return 1.0;
}

export function isSolid(wm: WorldManager, x: number, y: number, z: number): boolean {
    // Legacy support for basic checks
    const h = getBlockHeight(wm.getBlock(x, y, z, false));
    return h === 1.0;
}

// Check AABB intersection with world
export function checkCollision(wm: WorldManager, pos: {x:number, y:number, z:number}, width: number, height: number): boolean {
    const minX = Math.floor(pos.x - width / 2 + CONTACT_EPS);
    const maxX = Math.floor(pos.x + width / 2 - CONTACT_EPS);
    const minY = Math.floor(pos.y + CONTACT_EPS);
    const maxY = Math.floor(pos.y + height - CONTACT_EPS);
    const minZ = Math.floor(pos.z - width / 2 + CONTACT_EPS);
    const maxZ = Math.floor(pos.z + width / 2 - CONTACT_EPS);

    const playerMinY = pos.y;
    const playerMaxY = pos.y + height;

    for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
            for (let z = minZ; z <= maxZ; z++) {
                const cx = Math.floor(x / 16);
                const cz = Math.floor(z / 16);
                if (!wm.hasChunk(cx, cz)) return true; // Treat unloaded as solid wall

                const type = wm.getBlock(x, y, z, false);
                const blockH = getBlockHeight(type);
                
                if (blockH > 0) {
                    const blockTop = y + blockH;
                    // AABB Intersect: 
                    // (PlayerMinY < BlockTop) AND (PlayerMaxY > BlockBottom)
                    // BlockBottom is y.
                    if (playerMinY < blockTop && playerMaxY > y) {
                        return true;
                    }
                }
            }
        }
    }
    return false;
}

// Check if there is ground support directly beneath the player
export function hasGroundSupport(wm: WorldManager, pos: {x:number, y:number, z:number}, width: number): boolean {
    const yCheck = pos.y - GROUND_EPS;
    const blockY = Math.floor(yCheck);
    
    // Check 4 corners + center
    const r = width / 2;
    const points = [
        [pos.x - r, pos.z - r],
        [pos.x + r, pos.z - r],
        [pos.x + r, pos.z + r],
        [pos.x - r, pos.z + r],
        [pos.x, pos.z] 
    ];

    for (const [px, pz] of points) {
        const x = Math.floor(px);
        const z = Math.floor(pz);
        const type = wm.getBlock(x, blockY, z, false);
        const h = getBlockHeight(type);
        
        // Check if we are standing on the top of this block
        const blockTop = blockY + h;
        // If our feet (yCheck) are effectively at or slightly above the block top
        if (h > 0 && Math.abs(yCheck - blockTop) < 0.1) return true;
    }
    return false;
}
