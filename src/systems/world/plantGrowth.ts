import { BlockType } from '../../types';
import { CHUNK_SIZE } from '../../constants';
import { isSaplingType, getTreeKindForSapling, generateTreeBlocks, isReplaceable, isValidSoil, getMinClearance } from './trees';

// Interval between growth ticks in world ticks (1 tick = 1 call to WorldManager.tick)
const GROWTH_TICK_INTERVAL = 60; // ~3 seconds at 20 tps
const RANDOM_POSITIONS_PER_TICK = 3;
const GROWTH_THRESHOLD = 7; // metadata stage threshold to trigger tree growth attempt

interface WorldAccess {
    getBlock(x: number, y: number, z: number): BlockType;
    tryGetBlock(x: number, y: number, z: number): BlockType | null;
    setBlock(x: number, y: number, z: number, type: BlockType, rotation?: number): void;
    getMetadata(x: number, y: number, z: number): number;
    setMetadataAt(x: number, y: number, z: number, value: number): void;
    getLoadedChunkKeys(): string[];
    getSeed(): number;
}

let tickAccumulator = 0;

export function tickPlantGrowth(world: WorldAccess) {
    tickAccumulator++;
    if (tickAccumulator < GROWTH_TICK_INTERVAL) return;
    tickAccumulator = 0;

    const chunkKeys = world.getLoadedChunkKeys();
    if (chunkKeys.length === 0) return;

    // Pick a random loaded chunk and probe random positions
    const seed = world.getSeed();
    const time = Date.now();
    for (let i = 0; i < RANDOM_POSITIONS_PER_TICK; i++) {
        // Simple deterministic-ish selection using time + index
        const chunkIdx = ((time * 7 + i * 13 + seed) >>> 0) % chunkKeys.length;
        const key = chunkKeys[chunkIdx];
        const parts = key.split(',');
        const cx = parseInt(parts[0], 10);
        const cz = parseInt(parts[1], 10);

        // Pick a random column in the chunk
        const lx = ((time * 31 + i * 17 + seed) >>> 0) % CHUNK_SIZE;
        const lz = ((time * 53 + i * 23 + seed) >>> 0) % CHUNK_SIZE;
        const wx = cx * CHUNK_SIZE + lx;
        const wz = cz * CHUNK_SIZE + lz;

        // Scan a limited vertical range for saplings (above sea level, ground range)
        for (let y = 64; y < 200; y++) {
            const block = world.tryGetBlock(wx, y, wz);
            if (block === null) break;
            if (!isSaplingType(block)) continue;

            // Found a sapling — process growth
            const stage = world.getMetadata(wx, y, wz);
            
            // Check valid soil below
            const below = world.tryGetBlock(wx, y - 1, wz);
            if (below === null || !isValidSoil(below)) continue;

            if (stage < GROWTH_THRESHOLD) {
                // Increment growth stage
                world.setMetadataAt(wx, y, wz, stage + 1);
            } else {
                // Attempt to grow tree
                attemptTreeGrowth(world, block, wx, y, wz);
            }
            break; // Only one sapling per column per tick
        }
    }
}

function attemptTreeGrowth(world: WorldAccess, saplingType: BlockType, wx: number, wy: number, wz: number) {
    const kind = getTreeKindForSapling(saplingType);
    if (!kind) return;

    const groundY = wy - 1; // sapling sits on top of soil, tree root is at that level
    const clearance = getMinClearance(kind);

    // Quick vertical clearance check
    for (let h = 1; h <= clearance; h++) {
        const above = world.tryGetBlock(wx, wy + h, wz);
        if (above === null) return; // chunk not loaded above — skip
        if (!isReplaceable(above)) return; // blocked — give up this attempt
    }

    const seed = world.getSeed();
    const treeBlocks = generateTreeBlocks(kind, wx, groundY, wz, seed);

    // Phase 1: validate all trunk blocks
    for (const tb of treeBlocks) {
        if (!tb.isTrunk) continue;
        const existing = world.tryGetBlock(tb.wx, tb.wy, tb.wz);
        if (existing === null) return; // chunk boundary not loaded
        if (!isReplaceable(existing)) return; // trunk blocked — abort entirely
    }

    // Phase 2: remove sapling and place tree
    world.setBlock(wx, wy, wz, BlockType.AIR);

    for (const tb of treeBlocks) {
        const existing = world.tryGetBlock(tb.wx, tb.wy, tb.wz);
        if (existing === null) continue; // skip unloaded areas
        if (tb.isTrunk) {
            if (isReplaceable(existing)) {
                world.setBlock(tb.wx, tb.wy, tb.wz, tb.type);
            }
        } else {
            // Leaf — permissive, only place in air or existing leaves
            if (isReplaceable(existing)) {
                world.setBlock(tb.wx, tb.wy, tb.wz, tb.type);
            }
        }
    }
}
