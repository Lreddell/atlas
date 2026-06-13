import { BlockType } from '../../types';
import { worldManager } from '../WorldManager';

export interface VoxelHit {
    /** Coordinates of the solid block that was hit. */
    bx: number; by: number; bz: number;
    /** Normal of the face the ray entered through (unit axis). */
    nx: number; ny: number; nz: number;
    /** Distance along the ray to the entry face. */
    distance: number;
}

const EPS = 1e-8;

/**
 * Amanatides & Woo voxel traversal against world block data.
 *
 * Replaces Three.js whole-scene raycasting for block targeting: with thousands
 * of chunk meshes mounted at high render distances, `intersectObjects(scene.children)`
 * bounding-sphere-tested every mesh per frame. Stepping voxels reads at most
 * ~3 × reach blocks and also lets chunk geometry drop its CPU-side arrays.
 *
 * Semantics match the old mesh raycast for gameplay purposes: the first non-air
 * voxel along the ray is the target (water/lava included — callers filter them,
 * as before). Unloaded chunks are passed through, like missing meshes were.
 * The starting voxel is never reported.
 */
export function voxelRaycast(
    ox: number, oy: number, oz: number,
    dx: number, dy: number, dz: number,
    maxDist: number
): VoxelHit | null {
    let vx = Math.floor(ox);
    let vy = Math.floor(oy);
    let vz = Math.floor(oz);

    const stepX = dx > EPS ? 1 : dx < -EPS ? -1 : 0;
    const stepY = dy > EPS ? 1 : dy < -EPS ? -1 : 0;
    const stepZ = dz > EPS ? 1 : dz < -EPS ? -1 : 0;
    if (stepX === 0 && stepY === 0 && stepZ === 0) return null;

    const tDeltaX = stepX !== 0 ? Math.abs(1 / dx) : Infinity;
    const tDeltaY = stepY !== 0 ? Math.abs(1 / dy) : Infinity;
    const tDeltaZ = stepZ !== 0 ? Math.abs(1 / dz) : Infinity;

    let tMaxX = stepX !== 0 ? (stepX > 0 ? (vx + 1 - ox) : (ox - vx)) * tDeltaX : Infinity;
    let tMaxY = stepY !== 0 ? (stepY > 0 ? (vy + 1 - oy) : (oy - vy)) * tDeltaY : Infinity;
    let tMaxZ = stepZ !== 0 ? (stepZ > 0 ? (vz + 1 - oz) : (oz - vz)) * tDeltaZ : Infinity;

    // Each iteration crosses exactly one voxel boundary; bound generously.
    const maxSteps = Math.ceil(maxDist * 3) + 3;
    for (let i = 0; i < maxSteps; i++) {
        let t: number;
        let nx = 0, ny = 0, nz = 0;
        if (tMaxX < tMaxY && tMaxX < tMaxZ) {
            t = tMaxX;
            tMaxX += tDeltaX;
            vx += stepX;
            nx = -stepX;
        } else if (tMaxY < tMaxZ) {
            t = tMaxY;
            tMaxY += tDeltaY;
            vy += stepY;
            ny = -stepY;
        } else {
            t = tMaxZ;
            tMaxZ += tDeltaZ;
            vz += stepZ;
            nz = -stepZ;
        }
        if (t > maxDist) return null;

        const type = worldManager.tryGetBlock(vx, vy, vz);
        if (type === null) continue; // unloaded chunk — pass through, like a missing mesh
        if (type !== BlockType.AIR) {
            return { bx: vx, by: vy, bz: vz, nx, ny, nz, distance: t };
        }
    }
    return null;
}
