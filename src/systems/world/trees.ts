import { BlockType } from '../../types';

export type TreeKind = 'oak' | 'spruce' | 'birch' | 'cherry' | 'jungle' | 'dark_oak' | 'acacia';

const SAPLING_TYPES = new Set<BlockType>([
    BlockType.SAPLING,
    BlockType.SPRUCE_SAPLING,
    BlockType.BIRCH_SAPLING,
    BlockType.CHERRY_SAPLING,
    BlockType.JUNGLE_SAPLING,
    BlockType.DARK_OAK_SAPLING,
    BlockType.ACACIA_SAPLING
]);

const LEAF_TYPES = new Set<BlockType>([
    BlockType.LEAVES,
    BlockType.SPRUCE_LEAVES,
    BlockType.BIRCH_LEAVES,
    BlockType.CHERRY_LEAVES,
    BlockType.JUNGLE_LEAVES,
    BlockType.DARK_OAK_LEAVES,
    BlockType.ACACIA_LEAVES
]);

export function isSaplingType(type: BlockType): boolean {
    return SAPLING_TYPES.has(type);
}

export function isLeafType(type: BlockType): boolean {
    return LEAF_TYPES.has(type);
}

export function isReplaceable(type: BlockType): boolean {
    return type === BlockType.AIR || LEAF_TYPES.has(type);
}

export function getTreeKindForSapling(type: BlockType): TreeKind | null {
    switch (type) {
        case BlockType.SAPLING: return 'oak';
        case BlockType.SPRUCE_SAPLING: return 'spruce';
        case BlockType.BIRCH_SAPLING: return 'birch';
        case BlockType.CHERRY_SAPLING: return 'cherry';
        case BlockType.JUNGLE_SAPLING: return 'jungle';
        case BlockType.DARK_OAK_SAPLING: return 'dark_oak';
        case BlockType.ACACIA_SAPLING: return 'acacia';
        default: return null;
    }
}

export function getSaplingForLeaves(type: BlockType): BlockType | null {
    switch (type) {
        case BlockType.LEAVES: return BlockType.SAPLING;
        case BlockType.SPRUCE_LEAVES: return BlockType.SPRUCE_SAPLING;
        case BlockType.BIRCH_LEAVES: return BlockType.BIRCH_SAPLING;
        case BlockType.CHERRY_LEAVES: return BlockType.CHERRY_SAPLING;
        case BlockType.JUNGLE_LEAVES: return BlockType.JUNGLE_SAPLING;
        case BlockType.DARK_OAK_LEAVES: return BlockType.DARK_OAK_SAPLING;
        case BlockType.ACACIA_LEAVES: return BlockType.ACACIA_SAPLING;
        default: return null;
    }
}

export function getLogForTreeKind(kind: TreeKind): BlockType {
    switch (kind) {
        case 'oak': return BlockType.LOG;
        case 'spruce': return BlockType.SPRUCE_LOG;
        case 'birch': return BlockType.BIRCH_LOG;
        case 'cherry': return BlockType.CHERRY_LOG;
        case 'jungle': return BlockType.JUNGLE_LOG;
        case 'dark_oak': return BlockType.DARK_OAK_LOG;
        case 'acacia': return BlockType.ACACIA_LOG;
    }
}

export function getLeavesForTreeKind(kind: TreeKind): BlockType {
    switch (kind) {
        case 'oak': return BlockType.LEAVES;
        case 'spruce': return BlockType.SPRUCE_LEAVES;
        case 'birch': return BlockType.BIRCH_LEAVES;
        case 'cherry': return BlockType.CHERRY_LEAVES;
        case 'jungle': return BlockType.JUNGLE_LEAVES;
        case 'dark_oak': return BlockType.DARK_OAK_LEAVES;
        case 'acacia': return BlockType.ACACIA_LEAVES;
    }
}

/** Deterministic seeded random matching chunkGeneration's seededRand01. */
function seededRand01(x: number, y: number, z: number, salt: number, worldSeed: number): number {
    let h = Math.imul((x | 0) ^ worldSeed, 374761393);
    h = Math.imul(h ^ ((y | 0) + salt), 668265263);
    h = Math.imul(h ^ ((z | 0) - salt), 2147483647);
    h ^= h >>> 13;
    h = Math.imul(h, 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
}

/** Block position produced by a tree shape generator. */
export interface TreeBlock {
    wx: number;
    wy: number;
    wz: number;
    type: BlockType;
    isTrunk: boolean; // true = log (strict), false = leaf (permissive)
}

/**
 * Generates the list of blocks for a tree of the given kind rooted at world coordinates.
 * Uses a worldSeed for deterministic randomness. The salts match chunkGeneration's tree salts.
 */
export function generateTreeBlocks(kind: TreeKind, rootWx: number, groundY: number, rootWz: number, worldSeed: number): TreeBlock[] {
    const blocks: TreeBlock[] = [];
    const logType = getLogForTreeKind(kind);
    const leafType = getLeavesForTreeKind(kind);

    if (kind === 'oak') {
        const treeH = 4 + Math.floor(seededRand01(rootWx, groundY, rootWz, 203, worldSeed) * 3);
        for (let h = 1; h <= treeH; h++) {
            blocks.push({ wx: rootWx, wy: groundY + h, wz: rootWz, type: logType, isTrunk: true });
        }
        const leafStart = groundY + treeH - 2;
        const leafEnd = groundY + treeH + 1;
        for (let ly = leafStart; ly <= leafEnd; ly++) {
            const leafRange = ly === leafEnd ? 1 : 2;
            for (let lx = rootWx - leafRange; lx <= rootWx + leafRange; lx++) {
                for (let lz = rootWz - leafRange; lz <= rootWz + leafRange; lz++) {
                    if (Math.abs(lx - rootWx) + Math.abs(lz - rootWz) <= leafRange) {
                        blocks.push({ wx: lx, wy: ly, wz: lz, type: leafType, isTrunk: false });
                    }
                }
            }
        }
    } else if (kind === 'birch') {
        const treeH = 5 + Math.floor(seededRand01(rootWx, groundY, rootWz, 204, worldSeed) * 2);
        for (let h = 1; h <= treeH; h++) {
            blocks.push({ wx: rootWx, wy: groundY + h, wz: rootWz, type: logType, isTrunk: true });
        }
        const leafStart = groundY + treeH - 2;
        const leafEnd = groundY + treeH + 1;
        for (let ly = leafStart; ly <= leafEnd; ly++) {
            const leafRange = ly === leafEnd ? 1 : 2;
            for (let lx = rootWx - leafRange; lx <= rootWx + leafRange; lx++) {
                for (let lz = rootWz - leafRange; lz <= rootWz + leafRange; lz++) {
                    if (Math.abs(lx - rootWx) + Math.abs(lz - rootWz) <= leafRange) {
                        blocks.push({ wx: lx, wy: ly, wz: lz, type: leafType, isTrunk: false });
                    }
                }
            }
        }
    } else if (kind === 'spruce') {
        const treeH = 6 + Math.floor(seededRand01(rootWx, groundY, rootWz, 205, worldSeed) * 4);
        for (let h = 1; h <= treeH; h++) {
            blocks.push({ wx: rootWx, wy: groundY + h, wz: rootWz, type: logType, isTrunk: true });
        }
        for (let h = 3; h <= treeH + 1; h++) {
            const radius = Math.floor((treeH - h + 1) * 0.4);
            for (let lx = rootWx - radius; lx <= rootWx + radius; lx++) {
                for (let lz = rootWz - radius; lz <= rootWz + radius; lz++) {
                    if (Math.abs(lx - rootWx) + Math.abs(lz - rootWz) <= radius + 0.5) {
                        blocks.push({ wx: lx, wy: groundY + h, wz: lz, type: leafType, isTrunk: false });
                    }
                }
            }
        }
        blocks.push({ wx: rootWx, wy: groundY + treeH + 1, wz: rootWz, type: leafType, isTrunk: false });
    } else if (kind === 'cherry') {
        const treeH = 5 + Math.floor(seededRand01(rootWx, groundY, rootWz, 206, worldSeed) * 2);
        let tx = rootWx, tz = rootWz;
        for (let h = 1; h <= treeH; h++) {
            if (h > 2 && seededRand01(rootWx, groundY + h, rootWz, 207, worldSeed) > 0.5) {
                tx += seededRand01(rootWx + h, groundY, rootWz, 208, worldSeed) > 0.5 ? 1 : -1;
            }
            if (h > 2 && seededRand01(rootWx, groundY + h, rootWz, 209, worldSeed) > 0.5) {
                tz += seededRand01(rootWx, groundY, rootWz + h, 210, worldSeed) > 0.5 ? 1 : -1;
            }
            blocks.push({ wx: tx, wy: groundY + h, wz: tz, type: logType, isTrunk: true });
        }
        const canopyCenterY = groundY + treeH;
        for (let ly = canopyCenterY - 2; ly <= canopyCenterY + 1; ly++) {
            const leafRange = ly === canopyCenterY + 1 ? 1 : (ly === canopyCenterY ? 3 : 2);
            for (let lx = tx - leafRange; lx <= tx + leafRange; lx++) {
                for (let lz = tz - leafRange; lz <= tz + leafRange; lz++) {
                    const dist = Math.sqrt((lx - tx) ** 2 + (lz - tz) ** 2);
                    if (dist <= leafRange + 0.5) {
                        blocks.push({ wx: lx, wy: ly, wz: lz, type: leafType, isTrunk: false });
                    }
                }
            }
        }
    } else if (kind === 'jungle') {
        // Jungle: tall straight trunk (8-14), wide bushy canopy + leaf clusters along trunk
        const treeH = 8 + Math.floor(seededRand01(rootWx, groundY, rootWz, 220, worldSeed) * 7);
        for (let h = 1; h <= treeH; h++) {
            blocks.push({ wx: rootWx, wy: groundY + h, wz: rootWz, type: logType, isTrunk: true });
        }
        // Large bushy canopy at top (3 layers, radius 2-3)
        const canopyY = groundY + treeH;
        for (let ly = canopyY - 1; ly <= canopyY + 2; ly++) {
 const leafRange = ly >= canopyY + 1 ? 2 : 3;
            for (let lx = rootWx - leafRange; lx <= rootWx + leafRange; lx++) {
                for (let lz = rootWz - leafRange; lz <= rootWz + leafRange; lz++) {
                    const dist = Math.abs(lx - rootWx) + Math.abs(lz - rootWz);
                    if (dist <= leafRange + 0.5 && !(lx === rootWx && lz === rootWz && ly <= canopyY)) {
                        blocks.push({ wx: lx, wy: ly, wz: lz, type: leafType, isTrunk: false });
                    }
                }
            }
        }
        // A few leaf clusters on the trunk for a vine-like feel
        for (let h = 3; h < treeH - 2; h += 3) {
            if (seededRand01(rootWx, groundY + h, rootWz, 221, worldSeed) > 0.5) {
                const side = Math.floor(seededRand01(rootWx, groundY, rootWz + h, 222, worldSeed) * 4);
                const dx = [1, -1, 0, 0][side], dz = [0, 0, 1, -1][side];
                blocks.push({ wx: rootWx + dx, wy: groundY + h, wz: rootWz + dz, type: leafType, isTrunk: false });
            }
        }
    } else if (kind === 'dark_oak') {
        // Dark Oak: medium-dark trunk (6-9), dense canopy (radius 2-3), 2x2 trunk feel
        const treeH = 6 + Math.floor(seededRand01(rootWx, groundY, rootWz, 223, worldSeed) * 4);
        for (let h = 1; h <= treeH; h++) {
            blocks.push({ wx: rootWx, wy: groundY + h, wz: rootWz, type: logType, isTrunk: true });
            // second trunk block for a 2x2 feel
            if (seededRand01(rootWx + h, groundY, rootWz, 224, worldSeed) > 0.5) {
                blocks.push({ wx: rootWx + 1, wy: groundY + h, wz: rootWz, type: logType, isTrunk: true });
            }
        }
        // Dense dark canopy
        const canopyY = groundY + treeH;
        for (let ly = canopyY - 1; ly <= canopyY + 1; ly++) {
            const leafRange = ly === canopyY + 1 ? 2 : 3;
            for (let lx = rootWx - leafRange; lx <= rootWx + leafRange; lx++) {
                for (let lz = rootWz - leafRange; lz <= rootWz + leafRange; lz++) {
                    if (Math.abs(lx - rootWx) + Math.abs(lz - rootWz) <= leafRange + 1) {
                        blocks.push({ wx: lx, wy: ly, wz: lz, type: leafType, isTrunk: false });
                    }
                }
            }
        }
    } else if (kind === 'acacia') {
        // Acacia: short crooked trunk that bends sharply, flat-topped canopy
        const treeH = 4 + Math.floor(seededRand01(rootWx, groundY, rootWz, 225, worldSeed) * 3);
        let tx = rootWx, tz = rootWz;
        for (let h = 1; h <= treeH; h++) {
            // sharp bend at midpoint
            if (h === Math.ceil(treeH / 2)) {
                tx += seededRand01(rootWx + h, groundY, rootWz, 226, worldSeed) > 0.5 ? 1 : -1;
                tz += seededRand01(rootWx, groundY, rootWz + h, 227, worldSeed) > 0.5 ? 1 : -1;
            }
            blocks.push({ wx: tx, wy: groundY + h, wz: tz, type: logType, isTrunk: true });
        }
        // Flat-topped canopy (2 layers, wide radius)
        const canopyY = groundY + treeH;
        for (let ly = canopyY; ly <= canopyY + 1; ly++) {
            const leafRange = 2;
            for (let lx = tx - leafRange; lx <= tx + leafRange; lx++) {
                for (let lz = tz - leafRange; lz <= tz + leafRange; lz++) {
                    if (Math.abs(lx - tx) + Math.abs(lz - tz) <= leafRange + 0.5) {
                        blocks.push({ wx: lx, wy: ly, wz: lz, type: leafType, isTrunk: false });
                    }
                }
            }
        }
    }

    return blocks;
}

/**
 * Returns the minimum vertical clearance needed for a tree kind (conservative).
 */
export function getMinClearance(kind: TreeKind): number {
    switch (kind) {
        case 'oak': return 6;    // 4-6 trunk + 1 leaf above
        case 'birch': return 8;  // 5-6 trunk + 1 leaf above
        case 'spruce': return 11; // 6-9 trunk + 2 leaf tiers above
        case 'cherry': return 8; // 5-6 trunk + 1 leaf above
        case 'jungle': return 16; // 8-14 trunk + 2 leaf above
        case 'dark_oak': return 11; // 6-9 trunk + 1 leaf above
        case 'acacia': return 7;  // 4-6 trunk + 1 leaf above
    }
}

/**
 * Checks whether valid soil exists under a sapling for growth.
 * Accepts all grass-topped biome surface blocks + dirt/soil variants so trees
 * can root in every biome (birch forest mossy grass, taiga podzol, etc).
 */
export function isValidSoil(type: BlockType): boolean {
    return type === BlockType.GRASS || type === BlockType.DIRT ||
           type === BlockType.SNOWY_GRASS ||
           type === BlockType.MOSSY_GRASS || type === BlockType.LUSH_GRASS ||
           type === BlockType.DARK_GRASS || type === BlockType.MEADOW_GRASS ||
           type === BlockType.SAVANNA_GRASS || type === BlockType.JUNGLE_GRASS ||
           type === BlockType.PODZOL || type === BlockType.COARSE_DIRT ||
           type === BlockType.MUD;
}
