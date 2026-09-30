// Farming: tilled soil, crops, and the random ticks that water and grow them.
//
// Tilled soil (farmland) is DIRT with the TILLED bit in its block data, bits
// 0-2 its moisture (0 dry .. 7 soaked), so it needs no block id of its own.
// Water within four blocks (level with it or one above) keeps it soaked; dry,
// empty farmland turns back to dirt. A crop is the seed item planted: the
// block id is the seed's, its block data the growth stage (0..7). Crops grow
// on random ticks while lit (light 9+), much faster on moist soil, and drop
// more when ripe. Rules follow Minecraft's, scaled to Atlas's tick.

import { BlockType } from '../../types';
import { CHUNK_SIZE, MIN_Y } from '../../constants';

export { HOE_TYPES, isHoe } from './farmingItems';

/** Set in a DIRT block's data when it is tilled farmland. */
export const TILLED_BIT = 0x08;
export const MAX_MOISTURE = 7;
export const MAX_CROP_STAGE = 7;
/** A crop needs at least this much light (sky or block) to grow. */
export const CROP_MIN_LIGHT = 9;
/** How far (blocks, sideways) water reaches to keep farmland moist. */
export const WATER_REACH = 4;
/** Chance a crop grows a stage on a random tick, on moist and on dry soil. */
export const GROWTH_CHANCE_MOIST = 0.45;
export const GROWTH_CHANCE_DRY = 0.12;
/** A fall at least this long tramples farmland (a normal jump falls ~1.1 blocks). */
export const TRAMPLE_FALL = 1.5;

/** First atlas slot of the wheat stages (eight in a row). */
export const WHEAT_STAGE_SLOT = 127;
export const FARMLAND_DRY_SLOT = 125;
export const FARMLAND_WET_SLOT = 126;

export const isFarmland = (type: BlockType, meta: number): boolean =>
    type === BlockType.DIRT && (meta & TILLED_BIT) !== 0;

export const farmlandMeta = (moisture: number): number =>
    TILLED_BIT | (Math.max(0, Math.min(MAX_MOISTURE, moisture)) & 7);

export const moistureOf = (meta: number): number => meta & 7;

/** Crops: the seed item is the planted crop. */
export const CROP_TYPES: ReadonlySet<BlockType> = new Set([BlockType.WHEAT_SEEDS]);

export const isCrop = (type: BlockType): boolean => CROP_TYPES.has(type);

export const cropStage = (meta: number): number => Math.min(MAX_CROP_STAGE, meta & 7);

/** The atlas tile a crop shows at its stage. */
export function cropTextureSlot(type: BlockType, meta: number): number {
    if (type === BlockType.WHEAT_SEEDS) return WHEAT_STAGE_SLOT + cropStage(meta);
    return 0;
}

/** The farmland top face's tile: wet soil reads darker. */
export const farmlandTopSlot = (meta: number): number =>
    moistureOf(meta) > 0 ? FARMLAND_WET_SLOT : FARMLAND_DRY_SLOT;

export interface CropDrop {
    type: BlockType;
    count: number;
}

/** Successes out of `trials` at chance `p` (Minecraft's bonus-seed roll). */
function binomial(trials: number, p: number, random: () => number): number {
    let n = 0;
    for (let i = 0; i < trials; i++) if (random() < p) n++;
    return n;
}

/**
 * What a crop drops when broken or washed away: ripe wheat gives a wheat and
 * one to four seeds (its own back, and up to three more); an unripe crop
 * gives back its seed.
 */
export function cropDrops(type: BlockType, stage: number, random: () => number = Math.random): CropDrop[] {
    if (type !== BlockType.WHEAT_SEEDS) return [{ type, count: 1 }];
    if (stage < MAX_CROP_STAGE) return [{ type: BlockType.WHEAT_SEEDS, count: 1 }];
    const drops: CropDrop[] = [{ type: BlockType.WHEAT, count: 1 }];
    const seeds = 1 + binomial(3, 4 / 7, random);
    drops.push({ type: BlockType.WHEAT_SEEDS, count: seeds });
    return drops;
}

const TILLABLE: ReadonlySet<BlockType> = new Set([
    BlockType.GRASS, BlockType.DIRT,
    BlockType.MOSSY_GRASS, BlockType.LUSH_GRASS, BlockType.DARK_GRASS,
    BlockType.MEADOW_GRASS, BlockType.SAVANNA_GRASS, BlockType.JUNGLE_GRASS,
]);

/**
 * What a hoe turns a block into: grass and dirt become farmland, coarse dirt
 * becomes plain dirt (as in Minecraft); null for anything else, or soil
 * already tilled. Frozen (snowy) ground, podzol and mud don't till.
 */
export function tillResult(type: BlockType, meta: number): { type: BlockType; meta: number } | null {
    if (type === BlockType.COARSE_DIRT) return { type: BlockType.DIRT, meta: 0 };
    if (!TILLABLE.has(type)) return null;
    if (isFarmland(type, meta)) return null;
    return { type: BlockType.DIRT, meta: farmlandMeta(0) };
}

/** Water within WATER_REACH sideways, level with the soil or one above it. */
export function hasWaterNearby(getBlock: (x: number, y: number, z: number) => BlockType | null, x: number, y: number, z: number): boolean {
    for (let dy = 0; dy <= 1; dy++) {
        for (let dx = -WATER_REACH; dx <= WATER_REACH; dx++) {
            for (let dz = -WATER_REACH; dz <= WATER_REACH; dz++) {
                if (getBlock(x + dx, y + dy, z + dz) === BlockType.WATER) return true;
            }
        }
    }
    return false;
}

/** Blocks that may sit on farmland without packing it back to dirt. */
export function keepsFarmland(above: BlockType, isOpenPlant: (type: BlockType) => boolean): boolean {
    return above === BlockType.AIR || isCrop(above) || isOpenPlant(above);
}

// --- The farm tick ----------------------------------------------------------

export interface FarmWorld {
    tryGetBlock(x: number, y: number, z: number): BlockType | null;
    getMetadata(x: number, y: number, z: number): number;
    /** Changes a block's data only (moisture, a stage): remesh, no relight. */
    setBlockData(x: number, y: number, z: number, meta: number): void;
    setBlock(x: number, y: number, z: number, type: BlockType, meta?: number): void;
    spawnDrop(type: BlockType, x: number, y: number, z: number): void;
    getLight(x: number, y: number, z: number): { sky: number; block: number };
    getChunkData(cx: number, cz: number): Uint8Array | null;
    getChunkMetadata(cx: number, cz: number): Uint8Array | null;
    getTickCenter(): { cx: number; cz: number };
    /** Plants that let air through (grass, flowers): farmland stays under them. */
    isOpenPlant(type: BlockType): boolean;
}

/** Chunks around the player whose farms tick (as for saplings). */
export const FARM_TICK_RADIUS = 8;
/** Each chunk's farms tick once per this many world ticks (3 s at 20 tps). */
const FARM_TICK_PERIOD = 60;
/** Columns sampled per chunk visit: each column comes up about once a minute. */
const SAMPLES_PER_VISIT = 12;

interface FarmRange { minY: number; maxY: number }

/** Per chunk: the Y range farmland was found in, or null when a scan found none. */
const farmIndex = new Map<string, FarmRange | null>();
let visitCursor = 0;

const chunkKey = (cx: number, cz: number) => `${cx},${cz}`;

/** Farmland was just made at this block: its chunk has farms to tick. */
export function noteFarmland(x: number, y: number, z: number): void {
    const key = chunkKey(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE));
    const range = farmIndex.get(key);
    if (range) {
        range.minY = Math.min(range.minY, y);
        range.maxY = Math.max(range.maxY, y);
    } else {
        farmIndex.set(key, { minY: y, maxY: y });
    }
}

/** Forget every chunk's farms (a world was closed or opened). */
export function clearFarmIndex(): void {
    farmIndex.clear();
    visitCursor = 0;
}

/** The chunk's farmland Y range, scanning its blocks once the first time it is asked for. */
function farmRange(world: FarmWorld, cx: number, cz: number): FarmRange | null {
    const key = chunkKey(cx, cz);
    const known = farmIndex.get(key);
    if (known !== undefined) return known;
    const blocks = world.getChunkData(cx, cz);
    if (!blocks) return null; // not loaded: ask again later
    const meta = world.getChunkMetadata(cx, cz);
    let range: FarmRange | null = null;
    if (meta) {
        const layer = CHUNK_SIZE * CHUNK_SIZE;
        for (let i = 0; i < blocks.length; i++) {
            if (blocks[i] !== BlockType.DIRT || (meta[i] & TILLED_BIT) === 0) continue;
            const y = Math.floor(i / layer) + MIN_Y;
            if (!range) range = { minY: y, maxY: y };
            else { range.minY = Math.min(range.minY, y); range.maxY = Math.max(range.maxY, y); }
        }
    }
    farmIndex.set(key, range);
    return range;
}

/**
 * Farmland goes back to dirt (trampled, dried out, or covered): its crop, if
 * any, pops off with what it would drop.
 */
export function untillFarmland(world: FarmWorld, x: number, y: number, z: number, random: () => number = Math.random): void {
    const above = world.tryGetBlock(x, y + 1, z);
    if (above !== null && isCrop(above)) {
        for (const drop of cropDrops(above, cropStage(world.getMetadata(x, y + 1, z)), random)) {
            for (let i = 0; i < drop.count; i++) world.spawnDrop(drop.type, x, y + 1, z);
        }
        world.setBlock(x, y + 1, z, BlockType.AIR);
    }
    world.setBlockData(x, y, z, 0);
}

/** One random tick of a farmland block and the crop on it. */
export function tickFarmland(world: FarmWorld, x: number, y: number, z: number, meta: number, random: () => number): void {
    const above = world.tryGetBlock(x, y + 1, z);
    if (above === null) return;
    if (!keepsFarmland(above, world.isOpenPlant)) {
        untillFarmland(world, x, y, z, random);
        return;
    }
    const moisture = moistureOf(meta);
    let next = moisture;
    if (hasWaterNearby((bx, by, bz) => world.tryGetBlock(bx, by, bz), x, y, z)) next = MAX_MOISTURE;
    else if (moisture > 0) next = moisture - 1;
    else if (!isCrop(above)) {
        untillFarmland(world, x, y, z, random);
        return;
    }
    if (next !== moisture) world.setBlockData(x, y, z, farmlandMeta(next));

    if (isCrop(above)) {
        const cropMeta = world.getMetadata(x, y + 1, z);
        const stage = cropStage(cropMeta);
        if (stage >= MAX_CROP_STAGE) return;
        const light = world.getLight(x, y + 1, z);
        if (Math.max(light.sky, light.block) < CROP_MIN_LIGHT) return;
        if (random() < (next > 0 ? GROWTH_CHANCE_MOIST : GROWTH_CHANCE_DRY)) {
            world.setBlockData(x, y + 1, z, stage + 1);
        }
    }
}

/**
 * Called every world tick: visits a slice of the chunks around the player,
 * so each comes up once every FARM_TICK_PERIOD ticks, and random-ticks a
 * few columns of each chunk that has farmland. Chunks without farms cost a
 * map lookup.
 */
export function tickFarms(world: FarmWorld, random: () => number = Math.random): void {
    const center = world.getTickCenter();
    const side = 2 * FARM_TICK_RADIUS + 1;
    const total = side * side;
    const perTick = Math.ceil(total / FARM_TICK_PERIOD);
    for (let n = 0; n < perTick; n++) {
        const i = visitCursor;
        visitCursor = (visitCursor + 1) % total;
        const cx = center.cx - FARM_TICK_RADIUS + (i % side);
        const cz = center.cz - FARM_TICK_RADIUS + Math.floor(i / side);
        const range = farmRange(world, cx, cz);
        if (!range) continue;
        for (let s = 0; s < SAMPLES_PER_VISIT; s++) {
            const lx = Math.floor(random() * CHUNK_SIZE);
            const lz = Math.floor(random() * CHUNK_SIZE);
            const x = cx * CHUNK_SIZE + lx;
            const z = cz * CHUNK_SIZE + lz;
            for (let y = range.minY; y <= range.maxY; y++) {
                if (world.tryGetBlock(x, y, z) !== BlockType.DIRT) continue;
                const meta = world.getMetadata(x, y, z);
                if ((meta & TILLED_BIT) === 0) continue;
                tickFarmland(world, x, y, z, meta, random);
            }
        }
    }
}
