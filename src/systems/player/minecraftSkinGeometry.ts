import * as THREE from 'three';

export type SkinPart = 'head' | 'body' | 'rightArm' | 'leftArm' | 'rightLeg' | 'leftLeg';
// Layout reference: https://github.com/bs-community/skinview3d/blob/master/src/model.ts
const ORIGINS: Record<SkinPart, [number, number, number, number]> = {
    head: [0, 0, 32, 0], body: [16, 16, 16, 32], rightArm: [40, 16, 40, 32],
    leftArm: [32, 48, 48, 48], rightLeg: [0, 16, 0, 32], leftLeg: [16, 48, 0, 48],
};
/** Minecraft's six-face box net, rotated to Atlas's -Z forward. Split limbs
 * crop the side faces at the elbow/knee instead of stretching the whole skin. */
export function minecraftSkinGeometry(part: SkinPart, slim: boolean, outer = false, half?: 'upper' | 'lower') {
    const width = part === 'head' || part === 'body' ? 8 : part.endsWith('Arm') && slim ? 3 : 4;
    const height = part === 'head' ? 8 : 12;
    const depth = part === 'head' ? 8 : 4;
    const start = half === 'lower' ? height / 2 : 0;
    const length = half ? height / 2 : height;
    const origin = ORIGINS[part];
    const u = origin[outer ? 2 : 0], v = origin[outer ? 3 : 1];
    const pad = outer ? (part === 'head' ? 1 : 0.5) : 0;
    const geometry = new THREE.BoxGeometry((width + pad) / 16, (length + pad) / 16, (depth + pad) / 16);
    const sideY = v + depth + start;
    // BoxGeometry order: +X, -X, +Y, -Y, +Z, -Z (before the forward rotation).
    const faces = [
        [u + depth + width, sideY, depth, length], [u, sideY, depth, length],
        [u + depth, v, width, depth], [u + depth + width, v, width, depth],
        [u + depth, sideY, width, length], [u + 2 * depth + width, sideY, width, length],
    ];
    const uv = geometry.getAttribute('uv');
    faces.forEach(([x, y, w, h], face) => {
        const top = 1 - y / 64, bottom = 1 - (y + h) / 64;
        const corners = face === 3 ? [[x, bottom], [x + w, bottom], [x, top], [x + w, top]]
            : [[x, top], [x + w, top], [x, bottom], [x + w, bottom]];
        corners.forEach(([px, py], vertex) => uv.setXY(face * 4 + vertex, px / 64, py));
    });
    geometry.rotateY(Math.PI);
    return geometry;
}
