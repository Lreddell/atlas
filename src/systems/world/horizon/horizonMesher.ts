import { BlockType } from '../../../types';
import { resolveTile, type FaceName } from '../textureResolver';
import { packTile, type GeometryAttributes } from '../geometry';
import { AO_BYTES, lightByte, uvVariationMode, voxelAlphaOf } from '../voxelVertex';
import { SEA_LEVEL, wallBlock, type Column } from './horizonColumns';
import { WATER_SURFACE } from './horizonTiles';

// A horizon tile's mesh (buildHorizonTile.ts samples the cells it meshes), in
// the chunk mesher's vertex layout, so the voxel material textures, lights and
// fogs it as it does the chunks. Each cell is a few solid spans: its ground,
// and at the finest level a tree's trunk and leaves floating over it. A face
// shows wherever a span meets open air beside, above or below it; walls keep
// their layers (the top block's side, then what lies under it); tops merge
// into rectangles; corners darken as the chunks' do; and under the sea, faces
// dim with depth as the chunks' sky light does through water. The sea itself
// (and ice) is a separate see-through mesh over the floor.

/** A cell of a tile, at the tile's level (cells are 2^level blocks wide). */
export interface HorizonCell {
    /** The top of its ground (terrain, or merged canopy at coarse levels). */
    height: number;
    /** The block on top of the ground. */
    top: BlockType;
    /** At coarse levels, canopy merged into the ground rises from here (its terrain height); else === height. */
    groundHeight: number;
    /** The column its layers and sea come from. */
    column: Column;
    fluid: BlockType;
    /** The height its top is lit as (a flattened sea floor keeps its real depth's light); else its height. */
    lightHeight?: number;
    /** A floating tree over the ground (the finest level only): its leaves' span and a trunk. */
    leafTop: number;
    leafBottom: number;
    leaves: BlockType;
    trunkTop: number;
    log: BlockType;
}


// A span of solid blocks [from, to] in a column, and what its sides show.
const GROUND = 0;
const TRUNK = 1;
const LEAVES = 2;
interface Span { from: number; to: number; kind: number }

function spansOf(cell: HorizonCell): Span[] {
    const spans: Span[] = [{ from: -1e9, to: cell.height, kind: GROUND }];
    let above = cell.height;
    if (cell.leafTop >= cell.leafBottom) {
        const trunkTo = Math.min(cell.trunkTop, cell.leafBottom - 1);
        if (trunkTo > above) {
            spans.push({ from: above + 1, to: trunkTo, kind: TRUNK });
            above = trunkTo;
        }
        const from = Math.max(cell.leafBottom, above + 1);
        if (cell.leafTop >= from) spans.push({ from, to: cell.leafTop, kind: LEAVES });
    } else if (cell.trunkTop > above) {
        spans.push({ from: above + 1, to: cell.trunkTop, kind: TRUNK });
    }
    return spans;
}

const solidAt = (spans: Span[], y: number): boolean => spans.some((s) => y >= s.from && y <= s.to);

/** The parts of [from, to] no span of `other` fills. */
function exposed(from: number, to: number, other: Span[]): [number, number][] {
    let pieces: [number, number][] = [[from, to]];
    for (const s of other) {
        const next: [number, number][] = [];
        for (const [a, b] of pieces) {
            if (s.to < a || s.from > b) { next.push([a, b]); continue; }
            if (s.from > a) next.push([a, s.from - 1]);
            if (s.to < b) next.push([s.to + 1, b]);
        }
        pieces = next;
        if (pieces.length === 0) break;
    }
    return pieces;
}

/**
 * How many of a cliff's layers a level draws: every one (the top block's
 * side, what lies under it, stone), the top side and one more, or a single
 * face, as far out as a layer is thinner than a pixel.
 */
export type WallLayers = 'all' | 'two' | 'one';

/** A wall's layers from y0 up to y1 (block rows, inclusive), as runs of one block each: [from, to, block]. */
function bands(cell: HorizonCell, span: Span, y0: number, y1: number, layers: WallLayers, out: [number, number, BlockType][]): void {
    out.length = 0;
    const push = (y: number, type: BlockType) => {
        const last = out[out.length - 1];
        if (last && last[2] === type && last[1] === y - 1) last[1] = y;
        else out.push([y, y, type]);
    };
    if (span.kind === LEAVES) { out.push([y0, y1, cell.leaves]); return; }
    if (span.kind === TRUNK) { out.push([y0, y1, cell.log]); return; }
    // Ground: merged canopy above the terrain, the top block's side for its
    // first layer, then the terrain's layering (at most a few runs, more in a mesa).
    const groundTop = cell.groundHeight === cell.height ? cell.top : groundTopOf(cell);
    if (layers !== 'all') {
        if (y1 > cell.groundHeight) out.push([Math.max(y0, cell.groundHeight + 1), y1, cell.top]);
        const to = Math.min(y1, cell.groundHeight);
        if (to < y0) return;
        if (layers === 'two') {
            if (to === cell.groundHeight) out.unshift([cell.groundHeight, cell.groundHeight, groundTop]);
            if (to - 1 >= y0) out.unshift([y0, Math.min(to, cell.groundHeight - 1), wallBlock(cell.column, cell.groundHeight - 1)]);
        } else {
            out.unshift([y0, to, to - y0 < 2 ? groundTop : wallBlock(cell.column, cell.groundHeight - 2)]);
        }
        return;
    }
    for (let y = y0; y <= y1; y++) {
        if (y > cell.groundHeight) push(y, cell.top);
        else if (y === cell.groundHeight) push(y, groundTop);
        else push(y, wallBlock(cell.column, y));
    }
}

/** A cell's terrain top block where canopy stands on it. */
const groundTopOf = (cell: HorizonCell): BlockType => cell.column.top;

const skyByte15 = lightByte(15);
/** Sky light at height y seen from beside or above a cell (the chunks' light: water dims it 2 a block, ice not at all). */
function skyAt(fluid: BlockType, y: number): number {
    if (fluid === BlockType.WATER) return lightByte(Math.max(0, Math.min(15, 15 - 2 * (SEA_LEVEL + 1 - y))));
    if (fluid === BlockType.ICE) return lightByte(Math.max(0, Math.min(15, 15 - 2 * (SEA_LEVEL - y))));
    return skyByte15;
}

// --- Geometry ---------------------------------------------------------------

class QuadBuffer {
    positions = new Float32Array(1 << 14);
    normals = new Int8Array(1 << 14);
    uvs = new Float32Array(1 << 13);
    colors = new Uint8Array(1 << 14);
    tiles = new Uint16Array(1 << 12);
    indices = new Uint32Array(6 << 10);
    vertices = 0;
    indexCount = 0;
    min = [Infinity, Infinity, Infinity];
    max = [-Infinity, -Infinity, -Infinity];

    private grow(): void {
        const more = <T extends Float32Array | Int8Array | Uint8Array | Uint16Array | Uint32Array>(a: T): T => {
            const b = new (a.constructor as { new (n: number): T })(a.length * 2);
            b.set(a);
            return b;
        };
        this.positions = more(this.positions);
        this.normals = more(this.normals);
        this.uvs = more(this.uvs);
        this.colors = more(this.colors);
        this.tiles = more(this.tiles);
        this.indices = more(this.indices);
    }

    /**
     * One face: four corners in the mesher's order for its direction (FACE_DATA),
     * w x h blocks of repeating tile, per-corner sky and AO bytes.
     */
    quad(c: readonly number[], face: FaceName, normal: readonly number[], w: number, h: number, type: BlockType, sky: readonly number[], ao: readonly number[]): void {
        if (this.vertices + 4 > this.tiles.length) this.grow();
        const choice = resolveTile(type, face, normal[0], normal[1], normal[2], 0);
        const tile = packTile(choice.texIdx, choice.uvRot, uvVariationMode(type));
        const alpha = voxelAlphaOf(type);
        const v = this.vertices;
        for (let k = 0; k < 4; k++) {
            const x = c[k * 3], y = c[k * 3 + 1], z = c[k * 3 + 2];
            this.positions[(v + k) * 3] = x;
            this.positions[(v + k) * 3 + 1] = y;
            this.positions[(v + k) * 3 + 2] = z;
            if (x < this.min[0]) this.min[0] = x;
            if (y < this.min[1]) this.min[1] = y;
            if (z < this.min[2]) this.min[2] = z;
            if (x > this.max[0]) this.max[0] = x;
            if (y > this.max[1]) this.max[1] = y;
            if (z > this.max[2]) this.max[2] = z;
            this.normals[(v + k) * 4] = normal[0] * 127;
            this.normals[(v + k) * 4 + 1] = normal[1] * 127;
            this.normals[(v + k) * 4 + 2] = normal[2] * 127;
            this.uvs[(v + k) * 2] = k === 1 || k === 2 ? w : 0;
            this.uvs[(v + k) * 2 + 1] = k >= 2 ? h : 0;
            this.colors[(v + k) * 4] = sky[k];
            this.colors[(v + k) * 4 + 1] = 0;
            this.colors[(v + k) * 4 + 2] = ao[k];
            this.colors[(v + k) * 4 + 3] = alpha;
            this.tiles[v + k] = tile;
        }
        const i = this.indexCount;
        this.indices[i] = v; this.indices[i + 1] = v + 1; this.indices[i + 2] = v + 2;
        this.indices[i + 3] = v; this.indices[i + 4] = v + 2; this.indices[i + 5] = v + 3;
        this.vertices += 4;
        this.indexCount += 6;
    }

    finish(): GeometryAttributes | null {
        if (this.vertices === 0) return null;
        const n = this.vertices;
        return {
            positions: this.positions.slice(0, n * 3),
            normals: this.normals.slice(0, n * 4),
            uvs: this.uvs.slice(0, n * 2),
            colors: this.colors.slice(0, n * 4),
            tiles: this.tiles.slice(0, n),
            indices: n <= 65535 ? Uint16Array.from(this.indices.subarray(0, this.indexCount)) : this.indices.slice(0, this.indexCount),
            bounds: [this.min[0], this.min[1], this.min[2], this.max[0], this.max[1], this.max[2]],
        };
    }
}

const N_TOP = [0, 1, 0], N_BOTTOM = [0, -1, 0], N_RIGHT = [1, 0, 0], N_LEFT = [-1, 0, 0], N_FRONT = [0, 0, 1], N_BACK = [0, 0, -1];
const OPEN = [AO_BYTES[0], AO_BYTES[0], AO_BYTES[0], AO_BYTES[0]];

// Faces of a box [x0, x1] x [y0, y1] x [z0, z1], corners in FACE_DATA order.
const topFace = (x0: number, x1: number, y: number, z0: number, z1: number) => [x0, y, z1, x1, y, z1, x1, y, z0, x0, y, z0];
const bottomFace = (x0: number, x1: number, y: number, z0: number, z1: number) => [x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1];

type Side = 'right' | 'left' | 'front' | 'back';
const SIDES: readonly { side: Side; di: number; dj: number; normal: number[] }[] = [
    { side: 'right', di: 1, dj: 0, normal: N_RIGHT },
    { side: 'left', di: -1, dj: 0, normal: N_LEFT },
    { side: 'front', di: 0, dj: 1, normal: N_FRONT },
    { side: 'back', di: 0, dj: -1, normal: N_BACK },
];

/** A side wall spanning cells along its edge from a to b (block offsets along that edge), rows y0..y1 (inclusive). */
function sideFace(side: Side, fixed: number, a: number, b: number, y0: number, y1: number): { corners: number[]; w: number } {
    const top = y1 + 1;
    switch (side) {
        case 'right': return { corners: [fixed, y0, b, fixed, y0, a, fixed, top, a, fixed, top, b], w: b - a };
        case 'left': return { corners: [fixed, y0, a, fixed, y0, b, fixed, top, b, fixed, top, a], w: b - a };
        case 'front': return { corners: [a, y0, fixed, b, y0, fixed, b, top, fixed, a, top, fixed], w: b - a };
        case 'back': return { corners: [b, y0, fixed, a, y0, fixed, a, top, fixed, b, top, fixed], w: b - a };
    }
}

/**
 * The meshes of a tile: `cells` is (n + 2) x (n + 2), the tile's n x n cells
 * with a rim of the neighbouring ones (so edge walls and corners know what's
 * next to them), row by row along x; cells are `size` blocks. `skirt` makes
 * the tile's outer walls reach that much further down, so a neighbour of
 * another level never leaves a crack. `ao` darkens the corners of tops.
 */
export function meshHorizonCells(cells: HorizonCell[], n: number, size: number, options: { skirt: number; ao: boolean; wallLayers: WallLayers }): { opaque: GeometryAttributes | null; transparent: GeometryAttributes | null } {
    const stride = n + 2;
    const at = (i: number, j: number) => cells[(j + 1) * stride + (i + 1)];
    const spans: Span[][] = cells.map(spansOf);
    const spansAt = (i: number, j: number) => spans[(j + 1) * stride + (i + 1)];
    const opaque = new QuadBuffer();
    const transparent = new QuadBuffer();

    // Tops of the ground, merged into rectangles of one height, block, light
    // and open corners; a cell with a darkened corner goes alone.
    const aoOf = (i: number, j: number, y: number): number[] | null => {
        if (!options.ao) return null;
        // Corners in top-face order: (-x,+z), (+x,+z), (+x,-z), (-x,-z).
        const out = [0, 0, 0, 0];
        let any = false;
        const corners = [[-1, 1], [1, 1], [1, -1], [-1, -1]];
        for (let k = 0; k < 4; k++) {
            const [dx, dz] = corners[k];
            const s1 = solidAt(spansAt(i + dx, j), y) ? 1 : 0;
            const s2 = solidAt(spansAt(i, j + dz), y) ? 1 : 0;
            const c = solidAt(spansAt(i + dx, j + dz), y) ? 1 : 0;
            const occluders = s1 && s2 ? 3 : s1 + s2 + c;
            out[k] = AO_BYTES[occluders];
            if (occluders > 0) any = true;
        }
        return any ? out : null;
    };
    const done = new Uint8Array(n * n);
    for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
            if (done[j * n + i]) continue;
            const cell = at(i, j);
            // Ground under lava never shows.
            if (cell.fluid === BlockType.LAVA) { done[j * n + i] = 1; continue; }
            const y = cell.height + 1;
            const sky = skyAt(cell.fluid, (cell.lightHeight ?? cell.height) + 1);
            const ao = aoOf(i, j, y);
            let w = 1, d = 1;
            if (!ao) {
                const same = (ii: number, jj: number) => {
                    if (done[jj * n + ii]) return false;
                    const other = at(ii, jj);
                    return other.height === cell.height && other.top === cell.top && other.fluid !== BlockType.LAVA
                        && skyAt(other.fluid, (other.lightHeight ?? other.height) + 1) === sky && !aoOf(ii, jj, y);
                };
                while (i + w < n && same(i + w, j)) w++;
                grow: while (j + d < n) {
                    for (let ii = i; ii < i + w; ii++) if (!same(ii, j + d)) break grow;
                    d++;
                }
            }
            for (let jj = j; jj < j + d; jj++) for (let ii = i; ii < i + w; ii++) done[jj * n + ii] = 1;
            const x0 = i * size, x1 = (i + w) * size, z0 = j * size, z1 = (j + d) * size;
            opaque.quad(topFace(x0, x1, y, z0, z1), 'top', N_TOP, x1 - x0, z1 - z0, cell.top, [sky, sky, sky, sky], ao ?? OPEN);
        }
    }

    // Tops and bottoms of trunks and floating leaves (the finest level).
    for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
            const cell = at(i, j);
            const own = spansAt(i, j);
            for (let s = 1; s < own.length; s++) {
                const span = own[s];
                const x0 = i * size, x1 = x0 + size, z0 = j * size, z1 = z0 + size;
                const type = span.kind === LEAVES ? cell.leaves : cell.log;
                if (!solidAt(own, span.to + 1)) opaque.quad(topFace(x0, x1, span.to + 1, z0, z1), 'top', N_TOP, size, size, type, [skyByte15, skyByte15, skyByte15, skyByte15], OPEN);
                if (!solidAt(own, span.from - 1)) opaque.quad(bottomFace(x0, x1, span.from, z0, z1), 'bottom', N_BOTTOM, size, size, type, [skyByte15, skyByte15, skyByte15, skyByte15], OPEN);
            }
        }
    }

    // Walls, merged along each edge where neighbouring cells show the same layers.
    const layers: [number, number, BlockType][] = [];
    for (const { side, di, dj, normal } of SIDES) {
        const alongX = dj !== 0;
        const lines = n;
        for (let line = 0; line < lines; line++) {
            let runStart = 0;
            let runKey = '';
            let runFaces: { y0: number; y1: number; type: BlockType; fluid: BlockType }[] = [];
            const flush = (end: number) => {
                if (runFaces.length === 0) return;
                for (const f of runFaces) {
                    const fixed = (side === 'right' || side === 'front' ? line + 1 : line) * size;
                    const { corners, w } = sideFace(side, fixed, runStart * size, end * size, f.y0, f.y1);
                    const bottomSky = skyAt(f.fluid, f.y0);
                    const topSky = skyAt(f.fluid, f.y1 + 1);
                    opaque.quad(corners, side, normal, w, f.y1 + 1 - f.y0, f.type, [bottomSky, bottomSky, topSky, topSky], OPEN);
                }
            };
            for (let k = 0; k <= n; k++) {
                let key = '';
                const faces: { y0: number; y1: number; type: BlockType; fluid: BlockType }[] = [];
                if (k < n) {
                    const i = alongX ? k : line;
                    const j = alongX ? line : k;
                    const cell = at(i, j);
                    const neighbour = at(i + di, j + dj);
                    const own = spansAt(i, j);
                    let other = spansAt(i + di, j + dj);
                    const edge = i + di < 0 || i + di >= n || j + dj < 0 || j + dj >= n;
                    if (edge && options.skirt > 0) {
                        // The tile's rim: the ground wall reaches down past the
                        // neighbour, as far as another level's may differ.
                        other = other.map((s) => s.kind === GROUND ? { ...s, to: Math.min(s.to, cell.height - options.skirt) } : s);
                    }
                    for (const span of own) {
                        for (const [a, b] of exposed(span.from, span.to, other)) {
                            const lo = Math.max(a, -64);
                            if (lo > b) continue;
                            bands(cell, span, lo, b, options.wallLayers, layers);
                            for (const [y0, y1, type] of layers) {
                                faces.push({ y0, y1, type, fluid: neighbour.fluid });
                                key += `${y0}:${y1}:${type}:${neighbour.fluid};`;
                            }
                        }
                    }
                }
                if (k === n || key !== runKey) {
                    flush(k);
                    runStart = k;
                    runKey = key;
                    runFaces = faces;
                }
            }
        }
    }

    // The sea's surface (water and ice see-through, lava solid), in rectangles.
    const seaDone = new Uint8Array(n * n);
    for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
            const cell = at(i, j);
            if (cell.fluid === BlockType.AIR || seaDone[j * n + i]) continue;
            let w = 1, d = 1;
            const same = (ii: number, jj: number) => !seaDone[jj * n + ii] && at(ii, jj).fluid === cell.fluid;
            while (i + w < n && same(i + w, j)) w++;
            grow: while (j + d < n) {
                for (let ii = i; ii < i + w; ii++) if (!same(ii, j + d)) break grow;
                d++;
            }
            for (let jj = j; jj < j + d; jj++) for (let ii = i; ii < i + w; ii++) seaDone[jj * n + ii] = 1;
            const x0 = i * size, x1 = (i + w) * size, z0 = j * size, z1 = (j + d) * size;
            const y = cell.fluid === BlockType.ICE ? SEA_LEVEL + 1 : WATER_SURFACE;
            const target = cell.fluid === BlockType.LAVA ? opaque : transparent;
            target.quad(topFace(x0, x1, y, z0, z1), 'top', N_TOP, x1 - x0, z1 - z0, cell.fluid, [skyByte15, skyByte15, skyByte15, skyByte15], OPEN);
        }
    }

    return { opaque: opaque.finish(), transparent: transparent.finish() };
}
