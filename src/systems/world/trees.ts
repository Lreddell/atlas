import { BlockType } from '../../types';

export type TreeKind = 'oak' | 'spruce' | 'birch' | 'cherry';

const SAPLING_TYPES = new Set<BlockType>([
    BlockType.SAPLING,
    BlockType.SPRUCE_SAPLING,
    BlockType.BIRCH_SAPLING,
    BlockType.CHERRY_SAPLING
]);

const LEAF_TYPES = new Set<BlockType>([
    BlockType.LEAVES,
    BlockType.SPRUCE_LEAVES,
    BlockType.BIRCH_LEAVES,
    BlockType.CHERRY_LEAVES
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
        default: return null;
    }
}

export function getSaplingForLeaves(type: BlockType): BlockType | null {
    switch (type) {
        case BlockType.LEAVES: return BlockType.SAPLING;
        case BlockType.SPRUCE_LEAVES: return BlockType.SPRUCE_SAPLING;
        case BlockType.BIRCH_LEAVES: return BlockType.BIRCH_SAPLING;
        case BlockType.CHERRY_LEAVES: return BlockType.CHERRY_SAPLING;
        default: return null;
    }
}

export function getLogForTreeKind(kind: TreeKind): BlockType {
    switch (kind) {
        case 'oak': return BlockType.LOG;
        case 'spruce': return BlockType.SPRUCE_LOG;
        case 'birch': return BlockType.BIRCH_LOG;
        case 'cherry': return BlockType.CHERRY_LOG;
    }
}

export function getLeavesForTreeKind(kind: TreeKind): BlockType {
    switch (kind) {
        case 'oak': return BlockType.LEAVES;
        case 'spruce': return BlockType.SPRUCE_LEAVES;
        case 'birch': return BlockType.BIRCH_LEAVES;
        case 'cherry': return BlockType.CHERRY_LEAVES;
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
    }
}

/**
 * Checks whether valid soil exists under a sapling for growth.
 */
export function isValidSoil(type: BlockType): boolean {
    return type === BlockType.GRASS || type === BlockType.DIRT ||
           type === BlockType.SNOWY_GRASS;
}
