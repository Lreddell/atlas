/**
 * Section-based chunk column storage.
 *
 * A column stores 24 vertical sections of 16×16×16 cells for each data plane
 * (blocks, light, metadata). A section is either:
 *   - a `number`: every cell in the section holds that value (implicit uniform
 *     section — covers empty air, deep solid stone, open sky light, unset
 *     metadata, ocean water, ...), or
 *   - a `Uint8Array(4096)`: materialized cell data.
 *
 * Sections are materialized lazily on the first write that actually changes a
 * value, and uniform sections are detected on ingest. Metadata is therefore
 * effectively lazy (almost always uniform 0), and air/solid/sky sections cost
 * no arrays at all.
 *
 * LAYOUT — the section-local index is the low 12 bits of the classic column
 * index (worldCoords.index3D): idx = (y - MIN_Y) * 256 + lz * 16 + lx, so
 * section i owns the contiguous byte range [i*4096, (i+1)*4096) of the legacy
 * full array. Ingest/flatten are pure slice copies, and any code holding a
 * flat idx can address a section with (idx >> 12) / (idx & 4095).
 *
 * This module is deliberately dependency-free (and free of non-erasable TS
 * syntax) so `node --test` can import it directly. The dimension constants
 * mirror src/constants.ts; a test asserts they stay in sync.
 */

// Mirrors constants.ts: CHUNK_SIZE = 16, WORLD_HEIGHT = 384, MIN_Y = -64.
export const SECTION_HEIGHT = 16;
export const SECTIONS_PER_COLUMN = 24; // WORLD_HEIGHT / SECTION_HEIGHT
export const SECTION_VOLUME = 4096; // 16 * 16 * SECTION_HEIGHT
export const SECTION_SHIFT = 12; // log2(SECTION_VOLUME)
export const SECTION_MASK = SECTION_VOLUME - 1;
export const COLUMN_VOLUME = SECTION_VOLUME * SECTIONS_PER_COLUMN; // 98304
export const ALL_SECTIONS_MASK = (1 << SECTIONS_PER_COLUMN) - 1;

/** A section's storage: uniform fill value, or materialized cells. */
export type SectionPlane = Uint8Array | number;

/** Returns the uniform value if every byte of `sub` is equal, else null. */
export function uniformValueOf(sub: Uint8Array): number | null {
    const v = sub[0];
    // Probe a few spread positions first: non-uniform sections (terrain
    // surface) exit here almost immediately.
    if (sub[SECTION_VOLUME - 1] !== v || sub[SECTION_VOLUME >> 1] !== v) return null;
    for (let i = 1; i < SECTION_VOLUME; i++) {
        if (sub[i] !== v) return null;
    }
    return v;
}

let nextColumnId = 1;

export class ChunkColumn {
    /** Stable per-instance id (used to key cells across columns in write logs). */
    readonly colId = nextColumnId++;
    blocks: SectionPlane[];
    light: SectionPlane[];
    meta: SectionPlane[];

    /** Per-section data version: bumped on every effective write (any plane). */
    dataVersion = new Uint32Array(SECTIONS_PER_COLUMN);
    /** Data version last handed to the renderer (owned by the streaming layer). */
    meshVersion = new Uint32Array(SECTIONS_PER_COLUMN);
    /** Bitmask of sections changed since the mask was last consumed. */
    dirtyMask = 0;
    /** Section occupancy bounds over non-air blocks; -1 when the column is all air. */
    minOccSection = -1;
    maxOccSection = -1;
    /** Bytes held in materialized section arrays across all three planes. */
    materializedBytes = 0;

    constructor() {
        this.blocks = new Array(SECTIONS_PER_COLUMN).fill(0);
        this.light = new Array(SECTIONS_PER_COLUMN).fill(0);
        this.meta = new Array(SECTIONS_PER_COLUMN).fill(0);
    }

    /**
     * Ingests legacy full-column arrays (generation output / persisted saves),
     * detecting uniform sections and copying the rest. The inputs are not
     * retained.
     */
    static fromArrays(blocks: Uint8Array, light: Uint8Array, meta?: Uint8Array | null): ChunkColumn {
        const col = new ChunkColumn();
        for (let s = 0; s < SECTIONS_PER_COLUMN; s++) {
            const from = s << SECTION_SHIFT;
            const to = from + SECTION_VOLUME;
            col.blocks[s] = ChunkColumn.ingestSection(blocks.subarray(from, to), col);
            col.light[s] = ChunkColumn.ingestSection(light.subarray(from, to), col);
            if (meta) col.meta[s] = ChunkColumn.ingestSection(meta.subarray(from, to), col);

            const b = col.blocks[s];
            if (typeof b !== 'number' || b !== 0) {
                if (col.minOccSection === -1) col.minOccSection = s;
                col.maxOccSection = s;
            }
        }
        return col;
    }

    private static ingestSection(sub: Uint8Array, col: ChunkColumn): SectionPlane {
        const uniform = uniformValueOf(sub);
        if (uniform !== null) return uniform;
        col.materializedBytes += SECTION_VOLUME;
        return sub.slice();
    }

    // --- Flat-index accessors (idx = worldCoords.index3D layout) ---

    getB(idx: number): number {
        const p = this.blocks[idx >> SECTION_SHIFT];
        return typeof p === 'number' ? p : p[idx & SECTION_MASK];
    }

    getL(idx: number): number {
        const p = this.light[idx >> SECTION_SHIFT];
        return typeof p === 'number' ? p : p[idx & SECTION_MASK];
    }

    getM(idx: number): number {
        const p = this.meta[idx >> SECTION_SHIFT];
        return typeof p === 'number' ? p : p[idx & SECTION_MASK];
    }

    /** Write a block; returns true when the value actually changed. */
    setB(idx: number, v: number): boolean {
        const s = idx >> SECTION_SHIFT;
        if (!this.writePlane(this.blocks, s, idx & SECTION_MASK, v)) return false;
        this.noteWrite(s);
        if (v !== 0) {
            if (this.minOccSection === -1) { this.minOccSection = s; this.maxOccSection = s; }
            else {
                if (s < this.minOccSection) this.minOccSection = s;
                if (s > this.maxOccSection) this.maxOccSection = s;
            }
        }
        return true;
    }

    setL(idx: number, v: number): boolean {
        const s = idx >> SECTION_SHIFT;
        if (!this.writePlane(this.light, s, idx & SECTION_MASK, v)) return false;
        this.noteWrite(s);
        return true;
    }

    /**
     * Light write WITHOUT dirty marking, for lighting floods that reset and
     * re-propagate a region: they produce transient writes with zero net
     * change (a cave cell zeroed then restored), which must not dirty the
     * section. The flood logs old values and calls markSectionDirty() only
     * for cells whose value NET-changed.
     */
    writeLightRaw(idx: number, v: number): void {
        this.writePlane(this.light, idx >> SECTION_SHIFT, idx & SECTION_MASK, v);
    }

    /** Explicit dirty marking for net-change commits (see writeLightRaw). */
    markSectionDirty(s: number): void {
        this.noteWrite(s);
    }

    setM(idx: number, v: number): boolean {
        const s = idx >> SECTION_SHIFT;
        if (!this.writePlane(this.meta, s, idx & SECTION_MASK, v)) return false;
        this.noteWrite(s);
        return true;
    }

    private writePlane(plane: SectionPlane[], s: number, off: number, v: number): boolean {
        const cur = plane[s];
        if (typeof cur === 'number') {
            if (cur === v) return false; // no-op write on a uniform section
            const arr = new Uint8Array(SECTION_VOLUME);
            if (cur !== 0) arr.fill(cur);
            arr[off] = v;
            plane[s] = arr;
            this.materializedBytes += SECTION_VOLUME;
            return true;
        }
        if (cur[off] === v) return false;
        cur[off] = v;
        return true;
    }

    private noteWrite(s: number) {
        this.dataVersion[s]++;
        this.dirtyMask |= 1 << s;
    }

    /** Returns and clears the dirty-section mask. */
    consumeDirtyMask(): number {
        const m = this.dirtyMask;
        this.dirtyMask = 0;
        return m;
    }

    // --- Flattening back to legacy full arrays (storage/worker boundaries) ---

    flattenBlocks(out?: Uint8Array): Uint8Array {
        return ChunkColumn.flattenPlane(this.blocks, out);
    }

    flattenLight(out?: Uint8Array): Uint8Array {
        return ChunkColumn.flattenPlane(this.light, out);
    }

    flattenMeta(out?: Uint8Array): Uint8Array {
        return ChunkColumn.flattenPlane(this.meta, out);
    }

    static flattenPlane(plane: SectionPlane[], out?: Uint8Array): Uint8Array {
        const arr = out ?? new Uint8Array(COLUMN_VOLUME);
        for (let s = 0; s < SECTIONS_PER_COLUMN; s++) {
            const p = plane[s];
            const from = s << SECTION_SHIFT;
            if (typeof p === 'number') {
                if (p !== 0 || out) arr.fill(p, from, from + SECTION_VOLUME);
            } else {
                arr.set(p, from);
            }
        }
        return arr;
    }

    /**
     * Copies one border column of this chunk into a neighbor plane (the mesh
     * worker's input format; layout plane[(y - MIN_Y) * 16 + tangent]).
     * `side` names the RELATION of this chunk to the meshed one: this column
     * is the meshed chunk's `left` neighbor → share our lx=15 column, etc.
     */
    fillBorderPlane(target: Uint8Array, plane: 'blocks' | 'light', side: 'left' | 'right' | 'front' | 'back'): void {
        const src = plane === 'blocks' ? this.blocks : this.light;
        const alongX = side === 'left' || side === 'right';
        // left → lx = 15, right → lx = 0, back → lz = 15, front → lz = 0
        const fixed = (side === 'left' || side === 'back') ? 15 : 0;
        for (let s = 0; s < SECTIONS_PER_COLUMN; s++) {
            const p = src[s];
            const yBase = s * SECTION_HEIGHT;
            if (typeof p === 'number') {
                target.fill(p, yBase * 16, (yBase + SECTION_HEIGHT) * 16);
                continue;
            }
            for (let sy = 0; sy < SECTION_HEIGHT; sy++) {
                const rowBase = sy << 8; // sy * 256
                const dstBase = (yBase + sy) * 16;
                if (alongX) {
                    for (let lz = 0; lz < 16; lz++) {
                        target[dstBase + lz] = p[rowBase + (lz << 4) + fixed];
                    }
                } else {
                    const srcBase = rowBase + (fixed << 4);
                    for (let lx = 0; lx < 16; lx++) {
                        target[dstBase + lx] = p[srcBase + lx];
                    }
                }
            }
        }
    }

    /**
     * Mesh-worker payload: uniform sections travel as plain numbers,
     * materialized sections as fresh copies whose buffers can be transferred.
     */
    toSectionPayload(): {
        planes: { blocks: SectionPlane[]; light: SectionPlane[]; meta: SectionPlane[] };
        transfer: ArrayBuffer[];
        bytes: number;
    } {
        const transfer: ArrayBuffer[] = [];
        let bytes = 0;
        const pack = (src: SectionPlane[]): SectionPlane[] => {
            const out: SectionPlane[] = new Array(SECTIONS_PER_COLUMN);
            for (let s = 0; s < SECTIONS_PER_COLUMN; s++) {
                const p = src[s];
                if (typeof p === 'number') {
                    out[s] = p;
                } else {
                    const copy = p.slice();
                    out[s] = copy;
                    transfer.push(copy.buffer);
                    bytes += SECTION_VOLUME;
                }
            }
            return out;
        };
        return {
            planes: { blocks: pack(this.blocks), light: pack(this.light), meta: pack(this.meta) },
            transfer,
            bytes,
        };
    }

    /** Sections (indices) that currently hold any non-air block. */
    occupiedSectionMask(): number {
        if (this.minOccSection === -1) return 0;
        let mask = 0;
        for (let s = this.minOccSection; s <= this.maxOccSection; s++) {
            const b = this.blocks[s];
            if (typeof b !== 'number' || b !== 0) mask |= 1 << s;
        }
        return mask;
    }
}
