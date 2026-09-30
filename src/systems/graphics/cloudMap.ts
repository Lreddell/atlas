// The cloud layer's map (cloudLayer.ts): which cells of the sky hold cloud,
// and what the shaders need to know about each one. The map tiles the sky in
// both directions, so every neighbourhood below wraps round its edges.
//
// One RGBA byte texel per cell:
//   r  cloud (255) or clear sky (0): the layer is traced cell by cell on this,
//      and read between cell centres it is the soft-edged shadow they cast.
//   g  how deep inside its cloud the cell sits: 0 on the rim, 255 from
//      CLOUD_DEPTH_CELLS in. Little light gets into the middle of a big cloud,
//      so its base is darker there, while a small cloud is all bright rim.
//   b, a  unused (0, 255).

export interface CloudMap {
    width: number;
    height: number;
    /** Row-major RGBA, row 0 first. */
    rgba: Uint8Array<ArrayBuffer>;
}

/** How many cells in from a cloud's rim its middle reaches full depth. */
export const CLOUD_DEPTH_CELLS = 4;

const wrap = (i: number, n: number) => ((i % n) + n) % n;

// Every offset out to the depth that matters, nearest first: the first clear
// cell found among them is the nearest one.
const SEARCH_OFFSETS: readonly (readonly [number, number, number])[] = (() => {
    const reach = CLOUD_DEPTH_CELLS + 1;
    const offsets: [number, number, number][] = [];
    for (let dy = -reach; dy <= reach; dy++) {
        for (let dx = -reach; dx <= reach; dx++) {
            const distance = Math.hypot(dx, dy);
            if (distance > 0 && distance <= reach) offsets.push([dx, dy, distance]);
        }
    }
    return offsets.sort((a, b) => a[2] - b[2]);
})();

/** Builds the map from one byte per cell (non-zero = cloud), row-major. */
export function buildCloudMap(width: number, height: number, cover: Uint8Array): CloudMap {
    const cells = width * height;
    const rgba = new Uint8Array(cells * 4);
    const filled = (x: number, y: number) => cover[wrap(y, height) * width + wrap(x, width)] !== 0;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = y * width + x;
            let depth = 0;
            if (filled(x, y)) {
                // Distance to the nearest clear cell: 1 on the rim.
                let nearest = CLOUD_DEPTH_CELLS + 1;
                for (const [dx, dy, distance] of SEARCH_OFFSETS) {
                    if (!filled(x + dx, y + dy)) { nearest = distance; break; }
                }
                depth = Math.min(1, (nearest - 1) / CLOUD_DEPTH_CELLS);
            }
            rgba[i * 4] = filled(x, y) ? 255 : 0;
            rgba[i * 4 + 1] = Math.round(depth * 255);
            rgba[i * 4 + 3] = 255;
        }
    }
    return { width, height, rgba };
}

/**
 * The cover (0..1) at a point on the map, in cells: each cell's value sits at
 * its centre and blends linearly between centres, as the GPU samples it.
 */
export function sampleCloudCover(map: CloudMap, cellX: number, cellY: number): number {
    const fx = cellX - 0.5;
    const fy = cellY - 0.5;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = fx - x0;
    const ty = fy - y0;
    const at = (x: number, y: number) => map.rgba[(wrap(y, map.height) * map.width + wrap(x, map.width)) * 4] / 255;
    const top = at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx;
    const bottom = at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx;
    return top * (1 - ty) + bottom * ty;
}
