import { BlockType } from '../../types';
import { CHUNK_SIZE, MIN_Y } from '../../constants';
import { isSaplingType, getTreeKindForSapling, generateTreeBlocks, isReplaceable, isValidSoil, getMinClearance } from './trees';

// Interval between growth ticks in world ticks (1 tick = 1 call to WorldManager.tick)
const GROWTH_TICK_INTERVAL = 60; // ~3 seconds at 20 tps
// Columns probed PER LOADED CHUNK per growth tick. The previous version probed 3
// columns across the ENTIRE world, which made a specific sapling's expected growth
// time ~100+ hours with a normal render distance. Per-chunk probing puts it at
// roughly half an hour regardless of how many chunks are loaded.
const PROBES_PER_CHUNK = 3;
const GROWTH_THRESHOLD = 7; // metadata stage threshold to trigger tree growth attempt
// Only tick chunks near the player (Minecraft-style random-tick range). At render
// distance 48 there are ~7,200 loaded chunks; scanning them all every growth tick
// is wasted work — saplings more than this far away can grow when you come back.
const GROWTH_TICK_RADIUS = 8;

interface WorldAccess {
    getBlock(x: number, y: number, z: number): BlockType;
    tryGetBlock(x: number, y: number, z: number): BlockType | null;
    setBlock(x: number, y: number, z: number, type: BlockType, rotation?: number): void;
    getMetadata(x: number, y: number, z: number): number;
    setMetadataAt(x: number, y: number, z: number, value: number): void;
    getLoadedChunkKeys(): string[];
    getChunkData(cx: number, cz: number): Uint8Array | null;
    getTickCenter(): { cx: number, cz: number };
    getSeed(): number;
}

let tickAccumulator = 0;

export function tickPlantGrowth(world: WorldAccess) {
    tickAccumulator++;
    if (tickAccumulator < GROWTH_TICK_INTERVAL) return;
    tickAccumulator = 0;

    const chunkKeys = world.getLoadedChunkKeys();
    if (chunkKeys.length === 0) return;

    const seed = world.getSeed();
    // Cheap LCG. Growth timing was always wall-clock random (Date.now-based), so this
    // weakens no determinism guarantee — tree SHAPE stays seed-deterministic via
    // generateTreeBlocks(kind, wx, groundY, wz, seed).
    let rng = ((Date.now() ^ seed) >>> 0) || 1;
    const nextRand = () => {
        rng = (rng * 1664525 + 1013904223) >>> 0;
        return rng;
    };

    const LAYER = CHUNK_SIZE * CHUNK_SIZE;
    const center = world.getTickCenter();

    for (const key of chunkKeys) {
        const comma = key.indexOf(',');
        const cx = parseInt(key.slice(0, comma), 10);
        const cz = parseInt(key.slice(comma + 1), 10);
        if (Math.max(Math.abs(cx - center.cx), Math.abs(cz - center.cz)) > GROWTH_TICK_RADIUS) continue;
        const chunk = world.getChunkData(cx, cz);
        if (!chunk) continue;
        const layers = chunk.length / LAYER;

        for (let i = 0; i < PROBES_PER_CHUNK; i++) {
            const r = nextRand();
            const lx = r & 0xF;
            const lz = (r >> 4) & 0xF;
            const colBase = lz * CHUNK_SIZE + lx;
            const wx = cx * CHUNK_SIZE + lx;
            const wz = cz * CHUNK_SIZE + lz;

            // Direct typed-array scan over the full world column — saplings can sit on
            // soil at any height (the old 64..199 window silently excluded everything else).
            for (let yi = 0; yi < layers; yi++) {
                const block = chunk[yi * LAYER + colBase] as BlockType;
                if (!isSaplingType(block)) continue;

                const y = yi + MIN_Y;

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
