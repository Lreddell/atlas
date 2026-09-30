// Item drops (ground item entities) saved with the world.
//
// Drops live in React state while playing; this module turns them into a small
// plain-JSON list for WorldMetadata.drops and back. Physics state (velocity,
// pickup delay) is not saved: a restored drop starts at rest and can be picked
// up straight away. Its age carries over so the despawn timer resumes where it
// stopped instead of restarting on every reload.

import type { Drop, ItemInstance } from '../../types';

export interface SavedDrop {
    type: number;
    count: number;
    instance?: ItemInstance;
    x: number;
    y: number;
    z: number;
    /** Milliseconds of despawn timer already used. */
    age: number;
}

/** A save never carries more drops than this (the oldest are left behind). */
export const MAX_SAVED_DROPS = 2000;

// Collected drops are parked far below the world until state catches up.
const MIN_SAVED_Y = -1000;

const round = (v: number): number => Math.round(v * 100) / 100;

export function serializeDrops(drops: readonly Drop[], lifetimeMs: number): SavedDrop[] {
    const out: SavedDrop[] = [];
    for (const d of drops) {
        const [x, y, z] = d.position;
        if (!(d.count > 0) || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
        if (y < MIN_SAVED_Y) continue;
        const age = Number.isFinite(d.age) ? Math.max(0, d.age) : 0;
        if (age >= lifetimeMs) continue;
        const saved: SavedDrop = { type: d.type, count: d.count, x: round(x), y: round(y), z: round(z), age: Math.round(age) };
        if (d.instance) saved.instance = structuredClone(d.instance);
        out.push(saved);
    }
    if (out.length > MAX_SAVED_DROPS) {
        out.sort((a, b) => a.age - b.age);
        out.length = MAX_SAVED_DROPS;
    }
    return out;
}

/** Rebuild drops from a save, skipping anything malformed. */
export function restoreDrops(saved: unknown, lifetimeMs: number, now: number, makeId: () => string): Drop[] {
    if (!Array.isArray(saved)) return [];
    const out: Drop[] = [];
    for (const entry of saved) {
        if (out.length >= MAX_SAVED_DROPS) break;
        if (!entry || typeof entry !== 'object') continue;
        const { type, count, instance, x, y, z, age } = entry as Partial<SavedDrop>;
        if (typeof type !== 'number' || !Number.isInteger(type)) continue;
        if (typeof count !== 'number' || !Number.isInteger(count) || count <= 0) continue;
        if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number'
            || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
        const savedAge = typeof age === 'number' && Number.isFinite(age) ? Math.max(0, age) : 0;
        if (savedAge >= lifetimeMs) continue;
        out.push({
            id: makeId(),
            type,
            count,
            instance: instance && typeof instance === 'object' ? structuredClone(instance) : undefined,
            position: [x, y, z],
            velocity: [0, 0, 0],
            createdAt: now,
            pickupDelay: now,
            age: savedAge,
        });
    }
    return out;
}
