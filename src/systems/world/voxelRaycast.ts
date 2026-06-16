import { BlockType } from '../../types';
import { worldManager } from '../WorldManager';
import { getSelectionBoxes, isFullCubeSelection } from './blockShapes';

export interface VoxelHit {
    /** Coordinates of the solid block that was hit. */
    bx: number; by: number; bz: number;
    /** Normal of the face the ray entered through (unit axis). */
    nx: number; ny: number; nz: number;
    /** Distance along the ray to the entry face. */
    distance: number;
}

const EPS = 1e-8;

interface BoxHit { t: number; nx: number; ny: number; nz: number; }

/**
 * Nearest entry intersection of a ray with the selection boxes of the block in
 * cell (vx,vy,vz). Boxes are in [0,1] cell-local space; they're offset into world
 * space here. Returns the closest entry within (EPS, maxDist], with the normal of
 * the face the ray crossed, or null if the ray misses every box.
 */
function nearestBoxHit(
    ox: number, oy: number, oz: number,
    dx: number, dy: number, dz: number,
    vx: number, vy: number, vz: number,
    boxes: readonly (readonly number[])[],
    maxDist: number
): BoxHit | null {
    let best: BoxHit | null = null;
    for (let bi = 0; bi < boxes.length; bi++) {
        const b = boxes[bi];
        const minX = vx + b[0], minY = vy + b[1], minZ = vz + b[2];
        const maxX = vx + b[3], maxY = vy + b[4], maxZ = vz + b[5];

        // Slab method, tracking which axis produced the entry (tmin).
        let tmin = -Infinity, tmax = Infinity;
        let axis = -1, sign = 0;

        // X
        if (Math.abs(dx) < EPS) { if (ox < minX || ox > maxX) continue; }
        else {
            const inv = 1 / dx;
            let t1 = (minX - ox) * inv, t2 = (maxX - ox) * inv, s = -1;
            if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; s = 1; }
            if (t1 > tmin) { tmin = t1; axis = 0; sign = s; }
            if (t2 < tmax) tmax = t2;
            if (tmin > tmax) continue;
        }
        // Y
        if (Math.abs(dy) < EPS) { if (oy < minY || oy > maxY) continue; }
        else {
            const inv = 1 / dy;
            let t1 = (minY - oy) * inv, t2 = (maxY - oy) * inv, s = -1;
            if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; s = 1; }
            if (t1 > tmin) { tmin = t1; axis = 1; sign = s; }
            if (t2 < tmax) tmax = t2;
            if (tmin > tmax) continue;
        }
        // Z
        if (Math.abs(dz) < EPS) { if (oz < minZ || oz > maxZ) continue; }
        else {
            const inv = 1 / dz;
            let t1 = (minZ - oz) * inv, t2 = (maxZ - oz) * inv, s = -1;
            if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; s = 1; }
            if (t1 > tmin) { tmin = t1; axis = 2; sign = s; }
            if (t2 < tmax) tmax = t2;
            if (tmin > tmax) continue;
        }

        if (tmin <= EPS || tmin > maxDist) continue; // behind origin, inside, or out of reach
        if (best && tmin >= best.t) continue;
        best = {
            t: tmin,
            nx: axis === 0 ? sign : 0,
            ny: axis === 1 ? sign : 0,
            nz: axis === 2 ? sign : 0,
        };
    }
    return best;
}

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
            // Full-cell blocks (the common case): the cell boundary the DDA crossed
            // is the hit, with the entry-face normal.
            if (isFullCubeSelection(type)) {
                return { bx: vx, by: vy, bz: vz, nx, ny, nz, distance: t };
            }
            // Partial shapes (slabs/stairs/torches/plants/beds): only a hit if the ray
            // actually intersects one of the block's selection boxes — otherwise the ray
            // passes through the empty part of the cell to whatever is behind it.
            const boxes = getSelectionBoxes(type, worldManager.getMetadata(vx, vy, vz));
            const bh = nearestBoxHit(ox, oy, oz, dx, dy, dz, vx, vy, vz, boxes, maxDist);
            if (bh) {
                return { bx: vx, by: vy, bz: vz, nx: bh.nx, ny: bh.ny, nz: bh.nz, distance: bh.t };
            }
            // missed the shape — keep stepping
        }
    }
    return null;
}
