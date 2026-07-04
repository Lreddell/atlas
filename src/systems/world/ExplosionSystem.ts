import { BlockType } from '../../types';
import { DeterministicRng } from './simulation/DeterministicRng';

export interface ExplosionWorld {
    getBlock(x: number, y: number, z: number): BlockType;
    setBlock(x: number, y: number, z: number, type: BlockType): void;
}

export interface ExplosionResult { destroyed: Array<{ x: number; y: number; z: number; type: BlockType }> }

/** Deterministic voxel blast with distance falloff. Entity damage can consume the result separately. */
export function explode(world: ExplosionWorld, x: number, y: number, z: number, radius: number, seed: number, destroyBlocks = true): ExplosionResult {
    const rng = new DeterministicRng(seed);
    const destroyed: ExplosionResult['destroyed'] = [];
    const r = Math.max(0, Math.ceil(radius));
    for (let dz = -r; dz <= r; dz++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const distance = Math.hypot(dx, dy, dz);
        if (distance > radius || rng.nextFloat() > 1 - distance / Math.max(radius, 0.001)) continue;
        const bx = Math.floor(x + dx), by = Math.floor(y + dy), bz = Math.floor(z + dz);
        const type = world.getBlock(bx, by, bz);
        if (type === BlockType.AIR || type === BlockType.BEDROCK) continue;
        destroyed.push({ x: bx, y: by, z: bz, type });
        if (destroyBlocks) world.setBlock(bx, by, bz, BlockType.AIR);
    }
    return { destroyed };
}
