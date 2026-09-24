import type { BlockType } from '../../types';

// A few chips knocked off a block's face each time a mining swing lands, so
// breaking reads as work being done rather than a timer. Presentation only:
// InteractionController emits at the strike of each chop, ParticleManager draws.

export type BlockChipListener = (type: BlockType, x: number, y: number, z: number, nx: number, ny: number, nz: number) => void;

const listeners = new Set<BlockChipListener>();

export const blockChips = {
    /** (x, y, z) is the block's cell; (nx, ny, nz) the struck face's outward normal. */
    emit(type: BlockType, x: number, y: number, z: number, nx: number, ny: number, nz: number): void {
        for (const listener of listeners) listener(type, x, y, z, nx, ny, nz);
    },
    subscribe(listener: BlockChipListener): () => void {
        listeners.add(listener);
        return () => { listeners.delete(listener); };
    },
};

export type BlockDustListener = (type: BlockType, x: number, y: number, z: number, radius: number) => void;

const dustListeners = new Set<BlockDustListener>();

/** A low puff of dust kicked up off the ground, e.g. where a body lands. */
export const blockDust = {
    /** (x, y, z) is the ground point (top of the floor block); dust spreads over `radius`. */
    emit(type: BlockType, x: number, y: number, z: number, radius: number): void {
        for (const listener of dustListeners) listener(type, x, y, z, radius);
    },
    subscribe(listener: BlockDustListener): () => void {
        dustListeners.add(listener);
        return () => { dustListeners.delete(listener); };
    },
};

/** Seconds per mining swing (the chop cycle shared by both views). */
export const MINING_SWING_SECONDS = 0.25;
/** Where in the swing (0..1) the strike lands. */
export const MINING_STRIKE_AT = 0.5;

/** True when a swing's strike happened between the previous elapsed time and now. */
export function swingStruck(previousElapsed: number, elapsed: number): boolean {
    if (!(elapsed > previousElapsed)) return false;
    const strike = (n: number) => Math.floor(n / MINING_SWING_SECONDS - MINING_STRIKE_AT);
    return strike(elapsed) > strike(previousElapsed);
}
