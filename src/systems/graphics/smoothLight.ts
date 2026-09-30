// Voxel light at any point, blended from the eight cells around it, the way
// the mesher smooths light across block faces. A model walking past a torch
// or out of a cave brightens and darkens smoothly instead of stepping at every
// block boundary.

export interface VoxelLightReader {
    /** Stored light (0..15) of one cell. */
    light(x: number, y: number, z: number): { sky: number; block: number };
    /** Solid, opaque cells hold no light of their own and are left out of the blend. */
    opaque(x: number, y: number, z: number): boolean;
}

export interface SmoothLight {
    /** 0..1 */
    sky: number;
    /** 0..1 */
    block: number;
}

export function sampleSmoothLight(reader: VoxelLightReader, x: number, y: number, z: number, out: SmoothLight): SmoothLight {
    const fx = x - 0.5, fy = y - 0.5, fz = z - 0.5;
    const x0 = Math.floor(fx), y0 = Math.floor(fy), z0 = Math.floor(fz);
    const tx = fx - x0, ty = fy - y0, tz = fz - z0;
    let sky = 0;
    let block = 0;
    let weight = 0;
    for (let i = 0; i < 8; i++) {
        const dx = i & 1, dy = (i >> 1) & 1, dz = (i >> 2) & 1;
        const w = (dx ? tx : 1 - tx) * (dy ? ty : 1 - ty) * (dz ? tz : 1 - tz);
        if (w <= 0) continue;
        const cx = x0 + dx, cy = y0 + dy, cz = z0 + dz;
        if (reader.opaque(cx, cy, cz)) continue;
        const light = reader.light(cx, cy, cz);
        sky += light.sky * w;
        block += light.block * w;
        weight += w;
    }
    if (weight <= 1e-6) {
        // Inside a wall (or every neighbour solid): use the cell itself.
        const light = reader.light(Math.floor(x), Math.floor(y), Math.floor(z));
        out.sky = light.sky / 15;
        out.block = light.block / 15;
        return out;
    }
    out.sky = sky / weight / 15;
    out.block = block / weight / 15;
    return out;
}

/** Eases a light value toward a new sample (seconds-based, frame-rate independent). */
export function easeLight(current: SmoothLight, target: SmoothLight, dt: number, rate = 10): SmoothLight {
    const k = Number.isFinite(dt) && dt > 0 ? 1 - Math.exp(-rate * Math.min(dt, 0.25)) : 0;
    current.sky += (target.sky - current.sky) * k;
    current.block += (target.block - current.block) * k;
    return current;
}
