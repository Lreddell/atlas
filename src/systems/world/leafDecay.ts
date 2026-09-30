// Leaf decay: leaves left without a tree fall away, dropping what breaking them
// would (saplings, apples, sticks), so a felled tree no longer leaves a floating
// canopy and orchards give apples on their own.
//
// A leaf stays while any log is within LEAF_LOG_REACH blocks of it (a cube, not
// a path through leaves): every leaf of every generated tree is within 3 of a
// log, so standing trees never lose a leaf, and cherry trees' hanging leaves,
// which touch no other leaf, stay as long as their tree does. Leaves a player
// placed carry LEAF_PLACED_BIT and never decay. Removing a log checks the
// leaves around it; a slow random sweep catches leaves orphaned before a check
// could run (older saves, unloaded chunks).

import { BlockType } from '../../types';
import { CHUNK_SIZE, MIN_Y } from '../../constants';

/** Set in a leaf's block data when a player placed it: it never decays. */
export const LEAF_PLACED_BIT = 0x80;
/** A leaf stays while a log is within this many blocks (cube distance). */
export const LEAF_LOG_REACH = 4;
/** Orphaned leaves fall this long after the check (seconds), spread out like Minecraft's. */
const DECAY_DELAY_MIN = 0.5;
const DECAY_DELAY_MAX = 7;
/** Leaves decayed per world tick at most; the rest wait a tick. */
const DECAYS_PER_TICK = 4;
/** Log-removal checks run per world tick at most. */
const CHECKS_PER_TICK = 2;
/** Random columns the sweep looks at each world tick. */
const SWEEP_COLUMNS_PER_TICK = 1;
const SWEEP_RADIUS_CHUNKS = 8;

export interface LeafWorld {
    tryGetBlock(x: number, y: number, z: number): BlockType | null;
    getMetadata(x: number, y: number, z: number): number;
    setBlock(x: number, y: number, z: number, type: BlockType): void;
    spawnDrop(type: BlockType, x: number, y: number, z: number): void;
    isLeaf(type: BlockType): boolean;
    isLog(type: BlockType): boolean;
    /** The chance-rolled drops of a leaf block (saplings, apples, sticks). */
    leafDrops(type: BlockType): BlockType[];
    getChunkData(cx: number, cz: number): Uint8Array | null;
    getTickCenter(): { cx: number; cz: number };
}

interface Pending { x: number; y: number; z: number; due: number }

let checks: { x: number; y: number; z: number }[] = [];
let decays: Pending[] = [];
const scheduled = new Set<string>();

const key = (x: number, y: number, z: number) => `${x},${y},${z}`;

/** Forget queued checks and decays (a world was closed or opened). */
export function clearLeafDecay(): void {
    checks = [];
    decays = [];
    scheduled.clear();
}

/** A log was removed here: the leaves around it may have lost their tree. */
export function noteLogRemoved(x: number, y: number, z: number): void {
    // One check covers every leaf near its log, so neighbouring removals share one.
    if (checks.some((c) => Math.abs(c.x - x) <= 1 && Math.abs(c.y - y) <= 1 && Math.abs(c.z - z) <= 1)) return;
    checks.push({ x, y, z });
}

/** How many checks and decays are waiting (for tests and debugging). */
export function pendingLeafDecay(): { checks: number; decays: number } {
    return { checks: checks.length, decays: decays.length };
}

/** Whether a log stands within LEAF_LOG_REACH of this block. */
export function hasLogNear(world: LeafWorld, x: number, y: number, z: number): boolean {
    const r = LEAF_LOG_REACH;
    for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
            for (let dz = -r; dz <= r; dz++) {
                const t = world.tryGetBlock(x + dx, y + dy, z + dz);
                if (t !== null && world.isLog(t)) return true;
            }
        }
    }
    return false;
}

const isNaturalLeaf = (world: LeafWorld, type: BlockType | null, x: number, y: number, z: number): boolean =>
    type !== null && world.isLeaf(type) && (world.getMetadata(x, y, z) & LEAF_PLACED_BIT) === 0;

function schedule(x: number, y: number, z: number, now: number, random: () => number): void {
    const k = key(x, y, z);
    if (scheduled.has(k)) return;
    scheduled.add(k);
    decays.push({ x, y, z, due: now + DECAY_DELAY_MIN + random() * (DECAY_DELAY_MAX - DECAY_DELAY_MIN) });
}

/** Checks the leaves a removed log may have been holding up. */
function runCheck(world: LeafWorld, cx: number, cy: number, cz: number, now: number, random: () => number): void {
    // Only leaves within reach of the removed log could have depended on it.
    const r = LEAF_LOG_REACH;
    const logs: number[] = [];
    // Logs that could still hold those leaves lie within twice the reach.
    for (let dy = -2 * r; dy <= 2 * r; dy++) {
        for (let dx = -2 * r; dx <= 2 * r; dx++) {
            for (let dz = -2 * r; dz <= 2 * r; dz++) {
                const t = world.tryGetBlock(cx + dx, cy + dy, cz + dz);
                if (t !== null && world.isLog(t)) logs.push(cx + dx, cy + dy, cz + dz);
            }
        }
    }
    for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
            for (let dz = -r; dz <= r; dz++) {
                const x = cx + dx, y = cy + dy, z = cz + dz;
                if (!isNaturalLeaf(world, world.tryGetBlock(x, y, z), x, y, z)) continue;
                let held = false;
                for (let i = 0; i < logs.length && !held; i += 3) {
                    held = Math.max(Math.abs(logs[i] - x), Math.abs(logs[i + 1] - y), Math.abs(logs[i + 2] - z)) <= r;
                }
                if (!held) schedule(x, y, z, now, random);
            }
        }
    }
}

/** Looks down one random column near the player for orphaned leaves. */
function sweepColumn(world: LeafWorld, now: number, random: () => number): void {
    const center = world.getTickCenter();
    const side = 2 * SWEEP_RADIUS_CHUNKS + 1;
    const cx = center.cx - SWEEP_RADIUS_CHUNKS + Math.floor(random() * side);
    const cz = center.cz - SWEEP_RADIUS_CHUNKS + Math.floor(random() * side);
    const blocks = world.getChunkData(cx, cz);
    if (!blocks) return;
    const lx = Math.floor(random() * CHUNK_SIZE);
    const lz = Math.floor(random() * CHUNK_SIZE);
    const layer = CHUNK_SIZE * CHUNK_SIZE;
    const layers = blocks.length / layer;
    const x = cx * CHUNK_SIZE + lx, z = cz * CHUNK_SIZE + lz;
    for (let yi = layers - 1; yi >= 0; yi--) {
        const type = blocks[yi * layer + lz * CHUNK_SIZE + lx] as BlockType;
        if (!world.isLeaf(type)) continue;
        const y = yi + MIN_Y;
        if (isNaturalLeaf(world, type, x, y, z) && !hasLogNear(world, x, y, z)) schedule(x, y, z, now, random);
    }
}

/**
 * One world tick: a couple of log-removal checks, the leaves now due to fall
 * (each re-checked, since a log may have been put back), and a column of the
 * slow sweep. `now` is in seconds.
 */
export function tickLeafDecay(world: LeafWorld, now: number, random: () => number = Math.random): void {
    for (let i = 0; i < CHECKS_PER_TICK && checks.length > 0; i++) {
        const check = checks.shift()!;
        runCheck(world, check.x, check.y, check.z, now, random);
    }
    for (let i = 0; i < SWEEP_COLUMNS_PER_TICK; i++) sweepColumn(world, now, random);

    if (decays.length === 0) return;
    let fallen = 0;
    const waiting: Pending[] = [];
    for (const leaf of decays) {
        if (leaf.due > now || fallen >= DECAYS_PER_TICK) { waiting.push(leaf); continue; }
        scheduled.delete(key(leaf.x, leaf.y, leaf.z));
        const type = world.tryGetBlock(leaf.x, leaf.y, leaf.z);
        if (type === null || !isNaturalLeaf(world, type, leaf.x, leaf.y, leaf.z)) continue;
        if (hasLogNear(world, leaf.x, leaf.y, leaf.z)) continue;
        for (const drop of world.leafDrops(type)) world.spawnDrop(drop, leaf.x, leaf.y, leaf.z);
        world.setBlock(leaf.x, leaf.y, leaf.z, BlockType.AIR);
        fallen++;
    }
    decays = waiting;
}
