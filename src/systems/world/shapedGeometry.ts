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

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const pointOnAxis = (axis: number, av: number, p1: number, p2: number): [number, number, number] =>
    axis === 0 ? [av, p1, p2] : axis === 1 ? [p1, av, p2] : [p1, p2, av];

/**
 * Line-segment edge geometry tracing the OUTER silhouette of the given boxes, in
 * [0,1] block-local space (so the mesh sits at the block's min corner).
 *
 * Drawing every box's 12 edges leaves internal seams where boxes meet (e.g. the
 * step of a stair sitting on its base). Instead we group edges by the line they
 * lie on and XOR their intervals: a span survives only if an odd number of boxes
 * cover it, so shared/internal edges cancel and only the true outline remains.
 * Each surviving edge is then nudged `eps` outward (into the empty side) so it
 * floats just off the surface and doesn't z-fight.
 */
export function buildSelectionEdges(boxes: ShapeBox[], eps = 0.002): THREE.BufferGeometry {
    // 1. Group every box edge by the infinite line it lies on (axis + the two
    //    perpendicular coordinates). Edges on one line are 1-D intervals.
    const lines = new Map<string, { axis: number; p1: number; p2: number; intervals: [number, number][] }>();
    const addEdge = (axis: number, p1: number, p2: number, lo: number, hi: number) => {
        const key = `${axis}|${r3(p1)}|${r3(p2)}`;
        let L = lines.get(key);
        if (!L) { L = { axis, p1, p2, intervals: [] }; lines.set(key, L); }
        L.intervals.push(lo < hi ? [lo, hi] : [hi, lo]);
    };
    for (const b of boxes) {
        const [x0, y0, z0, x1, y1, z1] = b;
        addEdge(0, y0, z0, x0, x1); addEdge(0, y1, z0, x0, x1); addEdge(0, y0, z1, x0, x1); addEdge(0, y1, z1, x0, x1);
        addEdge(1, x0, z0, y0, y1); addEdge(1, x1, z0, y0, y1); addEdge(1, x0, z1, y0, y1); addEdge(1, x1, z1, y0, y1);
        addEdge(2, x0, y0, z0, z1); addEdge(2, x1, y0, z0, z1); addEdge(2, x0, y1, z0, z1); addEdge(2, x1, y1, z0, z1);
    }

    // 2. XOR the intervals on each line into surviving (odd-coverage) sub-segments.
    const segs: { axis: number; p1: number; p2: number; lo: number; hi: number }[] = [];
    for (const L of lines.values()) {
        const bounds = [...new Set(L.intervals.flat())].sort((m, n) => m - n);
        for (let i = 0; i < bounds.length - 1; i++) {
            const lo = bounds[i], hi = bounds[i + 1], mid = (lo + hi) / 2;
            let cover = 0;
            for (const iv of L.intervals) if (iv[0] < mid && mid < iv[1]) cover++;
            if (cover % 2 === 1) segs.push({ axis: L.axis, p1: L.p1, p2: L.p2, lo, hi });
        }
    }

    // 3. Emit, nudging each segment toward whichever side the box union leaves empty.
    const covers = (x: number, y: number, z: number) =>
        boxes.some(b => x > b[0] && x < b[3] && y > b[1] && y < b[4] && z > b[2] && z < b[5]);
    const pts: number[] = [];
    const d = 1e-3;
    for (const s of segs) {
        const mid = (s.lo + s.hi) / 2;
        let ob = 0, oc = 0;
        for (const sb of [-1, 1]) for (const sc of [-1, 1]) {
            const p = pointOnAxis(s.axis, mid, s.p1 + sb * d, s.p2 + sc * d);
            if (covers(p[0], p[1], p[2])) { ob -= sb; oc -= sc; }
        }
        const op1 = s.p1 + Math.sign(ob) * eps;
        const op2 = s.p2 + Math.sign(oc) * eps;
        const a = pointOnAxis(s.axis, s.lo - eps, op1, op2);
        const b = pointOnAxis(s.axis, s.hi + eps, op1, op2);
        pts.push(a[0], a[1], a[2], b[0], b[1], b[2]);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return geo;
}
