import * as THREE from 'three';

type Vec3 = [number, number, number];

/**
 * Where to centre the key light's shadow camera so static shadows don't crawl.
 *
 * The shadow map is a grid of texels fixed to the light. If its centre follows
 * the player freely, every step shifts that grid by a fraction of a texel and
 * shadow edges shimmer. Snapping the centre to whole texels, in the light's own
 * frame, keeps the grid still relative to the world. The frame matches three's
 * shadow camera: z along the light direction, x = normalize(Y x z), y = z x x.
 * Movement along z (toward or away from the light) doesn't move the grid, so it
 * is kept as is.
 */
export function snapShadowCenter(center: Readonly<Vec3>, lightDir: Readonly<Vec3>, texel: number, out: Vec3): Vec3 {
    let zx = lightDir[0], zy = lightDir[1], zz = lightDir[2];
    const zLen = Math.hypot(zx, zy, zz) || 1;
    zx /= zLen; zy /= zLen; zz /= zLen;
    // x = Y x z = (zz, 0, -zx)
    let xx = zz, xz = -zx;
    const xLen = Math.hypot(xx, xz);
    if (xLen < 1e-6) { xx = 1; xz = 0; } else { xx /= xLen; xz /= xLen; }
    // y = z x x
    const yx = zy * xz;
    const yy = zz * xx - zx * xz;
    const yz = -zy * xx;
    const cx = center[0], cy = center[1], cz = center[2];
    const u = cx * xx + cz * xz;
    const v = cx * yx + cy * yy + cz * yz;
    const w = cx * zx + cy * zy + cz * zz;
    const su = Math.floor(u / texel) * texel;
    const sv = Math.floor(v / texel) * texel;
    out[0] = xx * su + yx * sv + zx * w;
    out[1] = yy * sv + zy * w;
    out[2] = xz * su + yz * sv + zz * w;
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
