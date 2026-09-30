import * as THREE from 'three';

type Vec3 = [number, number, number];

/** Where the shadow grid turns about: a point on the grid, kept at the player. */
export interface ShadowSnap {
    pivot: Vec3;
    hasPivot: boolean;
}

export function createShadowSnap(): ShadowSnap {
    return { pivot: [0, 0, 0], hasPivot: false };
}

/**
 * Where to centre the key light's shadow camera so shadows hold still.
 *
 * The shadow map is a grid of texels fixed to the light, and two things move it:
 *  - The player. If the centre follows them freely, every step shifts the grid
 *    by a fraction of a texel and shadow edges shimmer. Snapping the centre to
 *    whole texels, in the light's own frame, keeps the grid still.
 *  - The sun, turning a little every frame. The grid turns with it, about
 *    whatever point it is snapped against. Snapped against the world origin, a
 *    player 5000 blocks out saw it slide by several texels a frame: fresh
 *    aliasing every frame, which is flicker. It turns about the player instead:
 *    each frame the snapped centre (a point on the grid, so nothing jumps)
 *    becomes the pivot, and the grid near the player only creeps as fast as the
 *    sun moves. The sun itself still moves smoothly.
 *
 * The frame is three's shadow camera frame for `up`: z along the light,
 * x = normalize(up x z), y = z x x. With `up` on the sun's orbit axis the y axis
 * never changes and the grid never spins about the light (with +Y up it spun
 * fastest around noon). Movement along z doesn't move the grid, so it is kept.
 */
export function snapShadowCenter(
    center: Readonly<Vec3>, lightDir: Readonly<Vec3>, up: Readonly<Vec3>, texel: number, snap: ShadowSnap, out: Vec3,
): Vec3 {
    let zx = lightDir[0], zy = lightDir[1], zz = lightDir[2];
    const zLen = Math.hypot(zx, zy, zz) || 1;
    zx /= zLen; zy /= zLen; zz /= zLen;
    // x = up x z
    let xx = up[1] * zz - up[2] * zy;
    let xy = up[2] * zx - up[0] * zz;
    let xz = up[0] * zy - up[1] * zx;
    const xLen = Math.hypot(xx, xy, xz);
    if (xLen < 1e-6) {
        // The light lies along up (never, with up on the orbit axis): any x across it.
        const alongX = Math.abs(zx) > 0.9;
        xx = alongX ? -zz : 0; xy = alongX ? 0 : zz; xz = alongX ? zx : -zy;
        const len = Math.hypot(xx, xy, xz) || 1;
        xx /= len; xy /= len; xz /= len;
    } else {
        xx /= xLen; xy /= xLen; xz /= xLen;
    }
    // y = z x x
    const yx = zy * xz - zz * xy;
    const yy = zz * xx - zx * xz;
    const yz = zx * xy - zy * xx;

    const pivot = snap.pivot;
    if (!snap.hasPivot) {
        pivot[0] = center[0]; pivot[1] = center[1]; pivot[2] = center[2];
        snap.hasPivot = true;
    }
    const dx = center[0] - pivot[0], dy = center[1] - pivot[1], dz = center[2] - pivot[2];
    const u = dx * xx + dy * xy + dz * xz;
    const v = dx * yx + dy * yy + dz * yz;
    const w = dx * zx + dy * zy + dz * zz;
    const su = Math.floor(u / texel) * texel;
    const sv = Math.floor(v / texel) * texel;
    out[0] = pivot[0] + xx * su + yx * sv + zx * w;
    out[1] = pivot[1] + xy * su + yy * sv + zy * w;
    out[2] = pivot[2] + xz * su + yz * sv + zz * w;
    // Re-anchor on the grid as it stands, at the player.
    pivot[0] = out[0]; pivot[1] = out[1]; pivot[2] = out[2];
    return out;
}

let installed = false;

/**
 * Fades every directional/spot shadow out over the outer edge of its shadow
 * map, so the boundary of the shadowed area never shows as a line on the
 * terrain. Idempotent; runs at import.
 */
export function installShadowEdgeFade(): void {
    if (installed) return;
    installed = true;
    const chunk = THREE.ShaderChunk.shadowmap_pars_fragment;
    const start = chunk.indexOf('float getShadow(');
    const end = start < 0 ? -1 : chunk.indexOf('return shadow;', start);
    if (end < 0) {
        console.warn('[shadows] three changed getShadow; shadow edge fade not installed');
        return;
    }
    THREE.ShaderChunk.shadowmap_pars_fragment = chunk.slice(0, end) + /* glsl */`vec2 atlasShadowEdge = abs( shadowCoord.xy - 0.5 ) * 2.0;
		return mix( shadow, 1.0, smoothstep( 0.82, 0.98, max( atlasShadowEdge.x, atlasShadowEdge.y ) ) );` + chunk.slice(end + 'return shadow;'.length);
}

installShadowEdgeFade();
