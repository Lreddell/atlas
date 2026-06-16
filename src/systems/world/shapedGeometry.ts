import * as THREE from 'three';
import { BlockType } from '../../types';
import { resolveTexture } from './textureResolver';
import { FACE_DATA } from './worldConstants';
import { getShapeBoxes, STAIR_FACE_POS_Z, type ShapeBox } from './blockShapes';
import { BLOCKS } from '../../data/blocks';

const FACES: { name: 'right' | 'left' | 'top' | 'bottom' | 'front' | 'back'; d: [number, number, number] }[] = [
    { name: 'right', d: [1, 0, 0] }, { name: 'left', d: [-1, 0, 0] },
    { name: 'top', d: [0, 1, 0] }, { name: 'bottom', d: [0, -1, 0] },
    { name: 'front', d: [0, 0, 1] }, { name: 'back', d: [0, 0, -1] },
];

/**
 * Build a textured partial-box BufferGeometry for a shaped block (slab/stairs),
 * centered on the origin and scaled to `size`. UVs are sub-rect bilinear-sampled
 * from the parent block's atlas tiles so the cut faces show the correct slice.
 *
 * Shared by the in-hand model (HeldItem) and dropped-item rendering (DropManager)
 * so a slab/stair never falls back to a full cube anywhere.
 */
export function buildShapedBlockGeometry(itemType: BlockType, parentType: BlockType, size: number): THREE.BufferGeometry {
    const def = BLOCKS[itemType];
    const meta = def?.shape === 'stairs' ? STAIR_FACE_POS_Z : 0;
    const boxes = getShapeBoxes(itemType, meta);

    const positions: number[] = [], normals: number[] = [], uvList: number[] = [], indices: number[] = [];
    let vBase = 0;
    for (const box of boxes) {
        for (const f of FACES) {
            const fc = FACE_DATA[f.name];
            const { uvs } = resolveTexture(parentType, f.name, f.d[0], f.d[1], f.d[2], 0);
            const aAxis = [fc.corners[1][0] - fc.corners[0][0], fc.corners[1][1] - fc.corners[0][1], fc.corners[1][2] - fc.corners[0][2]];
            const bAxis = [fc.corners[3][0] - fc.corners[0][0], fc.corners[3][1] - fc.corners[0][1], fc.corners[3][2] - fc.corners[0][2]];
            const aIdx = aAxis[0] !== 0 ? 0 : (aAxis[1] !== 0 ? 1 : 2);
            const bIdx = bAxis[0] !== 0 ? 0 : (bAxis[1] !== 0 ? 1 : 2);
            const aPos = aAxis[aIdx] > 0, bPos = bAxis[bIdx] > 0;
            for (let k = 0; k < 4; k++) {
                const corner = fc.corners[k];
                const lx = corner[0] ? box[3] : box[0];
                const ly = corner[1] ? box[4] : box[1];
                const lz = corner[2] ? box[5] : box[2];
                const localA = aIdx === 0 ? lx : (aIdx === 1 ? ly : lz);
                const localB = bIdx === 0 ? lx : (bIdx === 1 ? ly : lz);
                const a = aPos ? localA : 1 - localA;
                const b = bPos ? localB : 1 - localB;
                const ia = 1 - a, ib = 1 - b;
                const u = uvs[0] * ia * ib + uvs[2] * a * ib + uvs[4] * a * b + uvs[6] * ia * b;
                const v = uvs[1] * ia * ib + uvs[3] * a * ib + uvs[5] * a * b + uvs[7] * ia * b;
                positions.push((lx - 0.5) * size, (ly - 0.5) * size, (lz - 0.5) * size);
                normals.push(f.d[0], f.d[1], f.d[2]);
                uvList.push(u, v);
            }
            indices.push(vBase, vBase + 1, vBase + 2, vBase, vBase + 2, vBase + 3);
            vBase += 4;
        }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvList, 2));
    geo.setIndex(indices);
    return geo;
}

// The 12 edges of a unit box, as pairs of corner indices (0=lo,1=hi per axis):
// corner index = (xHi?1:0) | (yHi?2:0) | (zHi?4:0)
const BOX_EDGES: [number, number][] = [
    [0, 1], [1, 3], [3, 2], [2, 0], // z0 face loop
    [4, 5], [5, 7], [7, 6], [6, 4], // z1 face loop
    [0, 4], [1, 5], [2, 6], [3, 7], // z connectors
];

/**
 * Line-segment edge geometry tracing the given boxes, in [0,1] block-local space
 * (so the mesh sits at the block's min corner). Each box is inflated by `eps` so
 * the outline floats just outside the surface and doesn't z-fight.
 */
export function buildSelectionEdges(boxes: ShapeBox[], eps = 0.002): THREE.BufferGeometry {
    const pts: number[] = [];
    for (const b of boxes) {
        const x0 = b[0] - eps, y0 = b[1] - eps, z0 = b[2] - eps;
        const x1 = b[3] + eps, y1 = b[4] + eps, z1 = b[5] + eps;
        const cx = [x0, x1], cy = [y0, y1], cz = [z0, z1];
        const cornerPos = (i: number): [number, number, number] => [cx[i & 1], cy[(i >> 1) & 1], cz[(i >> 2) & 1]];
        for (const [a, c] of BOX_EDGES) {
            const pa = cornerPos(a), pc = cornerPos(c);
            pts.push(pa[0], pa[1], pa[2], pc[0], pc[1], pc[2]);
        }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return geo;
}
