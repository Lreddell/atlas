import { BlockType } from '../../types';
import { BLOCKS } from '../../data/blocks';
import { WorldState } from './worldTypes';
import { getChunkData, getMetadataData } from './worldStore';
import { worldToChunk, index3D } from './worldCoords';
import { MIN_Y, MAX_Y } from '../../constants';
import { worldManager } from '../WorldManager';
import { isWashable } from './blockProps';
import { cropDrops, cropStage, isCrop } from './farming';

// Water and lava flow, on the world's tick.
//
// Each fluid cell that may need to move is scheduled for a tick; the tick it
// comes due, it takes the level its neighbours give it (or dries up), falls,
// and spreads toward the nearest way down; lava and water meeting make stone.
// The rules are Minecraft's (FlowingFluid, LiquidBlock). The machinery is kept cheap:
// cells are keyed by number, due cells sit in per-tick buckets (no scan of
// the whole queue), reads allocate nothing, and a level-only change skips
// the relighting a new or removed fluid block needs (WorldManager.setFluidLevel).

// Minecraft's Overworld numbers: water loses a level a block (so runs 7
// blocks), ticks every 5 game ticks and looks 4 blocks for a way down; lava
// loses two (so runs 3), ticks every 30 and looks 2.
const WATER_DROP_OFF = 1;
const LAVA_DROP_OFF = 2;
const WATER_SLOPE_FIND = 4;
const LAVA_SLOPE_FIND = 2;
const WATER_DELAY = 5;
const LAVA_DELAY = 30;
/** Game ticks between a fluid cell's moves (its spread delay). */
export const fluidDelay = (type: BlockType) => (type === BlockType.LAVA ? LAVA_DELAY : WATER_DELAY);
/** Cells moved per tick at most; the rest wait for the next tick, first come first served. */
const MAX_UPDATES_PER_TICK = 160;

const HORIZONTAL: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const ALL_SIX: readonly (readonly [number, number, number])[] = [[0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]];

// A cell's key: exact for |x|, |z| < 2^20 and every y in the world.
const OFFSET = 1 << 20;
const keyOf = (x: number, y: number, z: number) => ((x + OFFSET) * 1024 + (y - MIN_Y)) * 2 * OFFSET + (z + OFFSET);
const xOf = (key: number) => Math.floor(key / (2 * OFFSET) / 1024) - OFFSET;
const yOf = (key: number) => (Math.floor(key / (2 * OFFSET)) % 1024) + MIN_Y;
const zOf = (key: number) => (key % (2 * OFFSET)) - OFFSET;

/** The fluid tick (advanced once a world tick). */
let fluidTick = 0;
/** Each scheduled cell's due tick (its earliest). */
const dueAt = new Map<number, number>();
/** Cells by the tick they come due. A cell rescheduled earlier leaves a stale entry, skipped when it no longer matches dueAt. */
const buckets = new Map<number, number[]>();

export function scheduleFluidUpdate(x: number, y: number, z: number, _type: BlockType, delayTicks: number) {
    const key = keyOf(x, y, z);
    const tick = fluidTick + Math.max(1, delayTicks);
    const existing = dueAt.get(key);
    if (existing !== undefined && existing <= tick) return;
    dueAt.set(key, tick);
    let bucket = buckets.get(tick);
    if (!bucket) buckets.set(tick, bucket = []);
    bucket.push(key);
}

/** How many cells are waiting to move (for tests and debugging). */
export function pendingFluidUpdates(): number {
    return dueAt.size;
}

// --- Reads, with the last chunk looked up kept at hand. ---
let readState: WorldState | null = null;
let readCx = NaN, readCz = NaN, readLx = 0, readLz = 0;
let readBlocks: Uint8Array | undefined;
let readMeta: Uint8Array | undefined;

function locate(state: WorldState, x: number, z: number): void {
    const { cx, cz, lx, lz } = worldToChunk(x, z);
    readLx = lx;
    readLz = lz;
    if (state !== readState || cx !== readCx || cz !== readCz) {
        readState = state;
        readCx = cx;
        readCz = cz;
        readBlocks = getChunkData(state, cx, cz);
        readMeta = getMetadataData(state, cx, cz);
    }
}

function typeAt(state: WorldState, x: number, y: number, z: number): BlockType {
    if (y < MIN_Y || y > MAX_Y) return BlockType.BEDROCK;
    locate(state, x, z);
    return readBlocks ? readBlocks[index3D(readLx, y, readLz)] as BlockType : BlockType.AIR;
}

function metaAt(state: WorldState, x: number, y: number, z: number): number {
    if (y < MIN_Y || y > MAX_Y) return 0;
    locate(state, x, z);
    return readMeta ? readMeta[index3D(readLx, y, readLz)] : 0;
}

/** Forget the cached chunk (its arrays may be replaced when the world changes). */
function resetReads() {
    readState = null;
    readBlocks = undefined;
    readMeta = undefined;
}

function isReplaceable(type: BlockType) {
    if (type === BlockType.AIR) return true;
    if (type === BlockType.WATER || type === BlockType.LAVA) return false;
    if (isWashable(type)) return true;
    // Non-solid decoration blocks (flowers, etc.) can be flooded; guard against
    // unknown ids so a bad block type can't crash the fluid tick.
    const def = BLOCKS[type];
    return !!def && !!def.noCollision;
}

// --- Minecraft's flowing-fluid rules (FlowingFluid). Levels are stored as
// metadata: 0 a source, 1-7 flowing (amount 8 - level), 8 falling. ---

/** How much fluid a cell holds, Minecraft's "amount": 8 for a source or a falling column. */
const amountOf = (meta: number) => (meta === 0 || meta >= 8 ? 8 : 8 - meta);
const dropOff = (type: BlockType) => (type === BlockType.LAVA ? LAVA_DROP_OFF : WATER_DROP_OFF);
const slopeFind = (type: BlockType) => (type === BlockType.LAVA ? LAVA_SLOPE_FIND : WATER_SLOPE_FIND);

/** The fluid can run through this cell: open, or the same fluid short of a source. */
function canPass(state: WorldState, type: BlockType, x: number, y: number, z: number): boolean {
    const t = typeAt(state, x, y, z);
    return isReplaceable(t) || (t === type && metaAt(state, x, y, z) !== 0);
}

/** The fluid could fall into this cell: open, or the same fluid already. */
function isHole(state: WorldState, type: BlockType, x: number, y: number, z: number): boolean {
    const t = typeAt(state, x, y, z);
    return t === type || isReplaceable(t);
}

/**
 * The level this cell should hold, from what feeds it (FlowingFluid.getNewLiquid):
 * a source between two sources on firm ground (water only), falling under the
 * same fluid, else the strongest side less the drop-off; -1 when nothing feeds it.
 */
function newLevel(state: WorldState, type: BlockType, x: number, y: number, z: number): number {
    let most = 0, sources = 0;
    for (const [dx, dz] of HORIZONTAL) {
        if (typeAt(state, x + dx, y, z + dz) !== type) continue;
        const m = metaAt(state, x + dx, y, z + dz);
        if (m === 0) sources++;
        most = Math.max(most, amountOf(m));
    }
    if (type === BlockType.WATER && sources >= 2) {
        const below = typeAt(state, x, y - 1, z);
        const firm = below !== BlockType.WATER && below !== BlockType.LAVA && !isReplaceable(below);
        if (firm || (below === type && metaAt(state, x, y - 1, z) === 0)) return 0;
    }
    if (typeAt(state, x, y + 1, z) === type) return 8;
    const amount = most - dropOff(type);
    return amount <= 0 ? -1 : 8 - amount;
}

/** Fewest steps from (x, z) to a hole it could run down, never turning back (FlowingFluid.getSlopeDistance); 1000 if none. */
function slopeDistance(state: WorldState, type: BlockType, x: number, y: number, z: number, depth: number, from: number): number {
    let best = 1000;
    for (let i = 0; i < 4; i++) {
        if (i === from) continue;
        const nx = x + HORIZONTAL[i][0], nz = z + HORIZONTAL[i][1];
        if (!canPass(state, type, nx, y, nz)) continue;
        if (isHole(state, type, nx, y - 1, nz)) return depth;
        if (depth < slopeFind(type)) best = Math.min(best, slopeDistance(state, type, nx, y, nz, depth + 1, i ^ 1));
    }
    return best;
}

/** Lava hardens where water meets it: a source to obsidian, flowing lava to cobblestone. */
function harden(state: WorldState, x: number, y: number, z: number) {
    const source = metaAt(state, x, y, z) === 0;
    worldManager.setBlock(x, y, z, source ? BlockType.OBSIDIAN : BlockType.COBBLESTONE);
    resetReads();
}

/**
 * Where lava and water touch (LiquidBlock.shouldSpreadLiquid): lava with water
 * above or beside it hardens. Returns whether this cell (lava) hardened.
 */
function meetOtherFluid(state: WorldState, type: BlockType, x: number, y: number, z: number): boolean {
    if (type === BlockType.LAVA) {
        for (const [dx, dy, dz] of ALL_SIX) {
            if (dy === -1) continue;
            if (typeAt(state, x + dx, y + dy, z + dz) === BlockType.WATER) {
                harden(state, x, y, z);
                return true;
            }
        }
        return false;
    }
    for (const [dx, dy, dz] of ALL_SIX) {
        if (dy === 1) continue;
        if (typeAt(state, x + dx, y + dy, z + dz) === BlockType.LAVA) harden(state, x + dx, y + dy, z + dz);
    }
    return false;
}

/** Fluid runs into an open cell (FlowingFluid.spreadTo), washing out what was there. */
function spreadTo(state: WorldState, x: number, y: number, z: number, type: BlockType, level: number) {
    const target = typeAt(state, x, y, z);
    if (type === BlockType.LAVA && target === BlockType.WATER) {
        // Lava pouring down into water turns it to stone.
        worldManager.setBlock(x, y, z, BlockType.STONE);
        resetReads();
        return;
    }
    if (isCrop(target)) {
        // A washed-out crop drops what breaking it would (ripe wheat and its seeds).
        for (const drop of cropDrops(target, cropStage(metaAt(state, x, y, z)))) {
            for (let i = 0; i < drop.count; i++) worldManager.spawnDrop(drop.type, x, y, z);
        }
    } else if (isWashable(target)) {
        worldManager.spawnDrop(target, x, y, z);
    }
    worldManager.setBlock(x, y, z, type, level); // schedules it and its neighbours
    resetReads();
    meetOtherFluid(state, type, x, y, z);
}

// Scratch for spreadToSides.
const sideCost = [0, 0, 0, 0];

/** Spread out sideways toward the nearest way down (FlowingFluid.spreadToSides / getSpread). */
function spreadToSides(state: WorldState, type: BlockType, x: number, y: number, z: number, level: number) {
    const amount = level === 8 ? 7 : amountOf(level) - dropOff(type);
    if (amount <= 0) return;
    let best = 1000;
    for (let i = 0; i < 4; i++) {
        const nx = x + HORIZONTAL[i][0], nz = z + HORIZONTAL[i][1];
        if (!canPass(state, type, nx, y, nz)) { sideCost[i] = Infinity; continue; }
        sideCost[i] = isHole(state, type, nx, y - 1, nz) ? 0 : slopeDistance(state, type, nx, y, nz, 1, i ^ 1);
        best = Math.min(best, sideCost[i]);
    }
    for (let i = 0; i < 4; i++) {
        if (sideCost[i] !== best) continue;
        const nx = x + HORIZONTAL[i][0], nz = z + HORIZONTAL[i][1];
        // Only into open cells: fluid already there sets its own level on its tick.
        if (isReplaceable(typeAt(state, nx, y, nz))) spreadTo(state, nx, y, nz, type, 8 - amount);
    }
}

function update(state: WorldState, x: number, y: number, z: number) {
    const type = typeAt(state, x, y, z);
    if (type !== BlockType.WATER && type !== BlockType.LAVA) return;
    if (meetOtherFluid(state, type, x, y, z)) return;
    let level = metaAt(state, x, y, z);

    // A flowing cell takes the level its neighbours give it, or dries up
    // (FlowingFluid.tick); a changed cell wakes its neighbours, so a cut-off
    // flow drains outward a level at a time.
    if (level !== 0) {
        const next = newLevel(state, type, x, y, z);
        if (next < 0) {
            worldManager.setBlock(x, y, z, BlockType.AIR, 0);
            resetReads();
            return;
        }
        if (next !== level) {
            worldManager.setFluidLevel(x, y, z, type, next);
            resetReads();
            level = next;
        }
    }

    // Down first (FlowingFluid.spread); sideways only where it cannot fall, or
    // from a source, or out over a pool of three sources about it.
    const belowType = typeAt(state, x, y - 1, z);
    if (isReplaceable(belowType) || (type === BlockType.LAVA && belowType === BlockType.WATER)) {
        spreadTo(state, x, y - 1, z, type, 8);
        let sources = 0;
        for (const [dx, dz] of HORIZONTAL) {
            if (typeAt(state, x + dx, y, z + dz) === type && metaAt(state, x + dx, y, z + dz) === 0) sources++;
        }
        if (sources >= 3) spreadToSides(state, type, x, y, z, level);
    } else if (level === 0 || !isHole(state, type, x, y - 1, z)) {
        spreadToSides(state, type, x, y, z, level);
    }
}

export function processFluids(state: WorldState) {
    fluidTick++;
    resetReads();
    let budget = MAX_UPDATES_PER_TICK;
    // Buckets come due in tick order; anything left over runs next tick, first.
    const due = [...buckets.keys()].filter(tick => tick <= fluidTick).sort((a, b) => a - b);
    for (const tick of due) {
        const bucket = buckets.get(tick)!;
        let i = 0;
        for (; i < bucket.length && budget > 0; i++) {
            const key = bucket[i];
            if (dueAt.get(key) !== tick) continue; // rescheduled earlier, already run
            dueAt.delete(key);
            budget--;
            update(state, xOf(key), yOf(key), zOf(key));
        }
        if (i >= bucket.length) {
            buckets.delete(tick);
        } else {
            // Out of budget: carry the rest to the next tick.
            const rest = bucket.slice(i);
            buckets.delete(tick);
            const nextTick = fluidTick + 1;
            let carry = buckets.get(nextTick);
            if (!carry) buckets.set(nextTick, carry = []);
            for (const key of rest) {
                if (dueAt.get(key) !== tick) continue;
                dueAt.set(key, nextTick);
                carry.push(key);
            }
            break;
        }
    }
}

/** Drops every pending update (a world was unloaded). */
export function clearFluidUpdates(): void {
    dueAt.clear();
    buckets.clear();
    resetReads();
}
