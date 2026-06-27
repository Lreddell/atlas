// Pure-TypeScript .acr region codec. No Node, DOM, React, or Electron deps — it
// drives an abstract RandomAccessFile and an injectable Compressor, so the same
// code can run over a Node file handle, an OPFS sync-access handle (future), or
// an in-memory buffer (tests). The Electron main process ships a byte-identical
// CommonJS port (electron/saves/acrCore.cjs); acrCrossCompat.test.mjs guards them.
//
// See acrFormat.ts for the authoritative byte layout.

import {
    ACR_FORMAT_VERSION,
    ACR_MAGIC,
    BODY_HEADER_BYTES,
    BODY_SCHEMA_VERSION,
    CHUNK_SLOT_HEADER_BYTES,
    COMPRESSION_DEFLATE,
    COMPRESSION_RAW,
    DATA_START_OFFSET,
    HEADER_SECTORS,
    LOCATION_ENTRY_BYTES,
    LOCATION_TABLE_OFFSET,
    SECTOR_SIZE,
    SLOTS_PER_REGION,
    TIMESTAMP_TABLE_OFFSET,
    sectorsFor,
} from './acrFormat';
import type { ChunkStorageData } from '../types';

/** Random-access binary file primitive. All offsets/lengths are byte counts. */
export interface RandomAccessFile {
    size(): Promise<number> | number;
    /** Read exactly `into.length` bytes starting at fileOffset into `into`. */
    read(into: Uint8Array, fileOffset: number): Promise<void> | void;
    /** Write all of `data` starting at fileOffset. */
    write(data: Uint8Array, fileOffset: number): Promise<void> | void;
    truncate(size: number): Promise<void> | void;
    flush(): Promise<void> | void;
}

/** Optional payload compression. Omit to store raw (compression type 0). */
export interface Compressor {
    compress(data: Uint8Array): Uint8Array;
    decompress(data: Uint8Array): Uint8Array;
}

// --- Big-endian scalar helpers (Number-safe: ms timestamps stay < 2^53) ---

function putU32(buf: Uint8Array, off: number, v: number): void {
    buf[off] = (v >>> 24) & 0xff;
    buf[off + 1] = (v >>> 16) & 0xff;
    buf[off + 2] = (v >>> 8) & 0xff;
    buf[off + 3] = v & 0xff;
}

function getU32(buf: Uint8Array, off: number): number {
    return ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0;
}

function putU64(buf: Uint8Array, off: number, v: number): void {
    const hi = Math.floor(v / 0x100000000);
    const lo = v >>> 0;
    putU32(buf, off, hi);
    putU32(buf, off + 4, lo);
}

function getU64(buf: Uint8Array, off: number): number {
    return getU32(buf, off) * 0x100000000 + getU32(buf, off + 4);
}

// --- Chunk body framing (pure, compression-independent) -------------------

/** Frame {blocks, light, meta, timestamp} into the uncompressed chunk body. */
export function encodeChunkBody(
    blocks: Uint8Array,
    light: Uint8Array,
    meta: Uint8Array,
    timestampMs: number,
): Uint8Array {
    const out = new Uint8Array(BODY_HEADER_BYTES + blocks.length + light.length + meta.length);
    out[0] = BODY_SCHEMA_VERSION;
    putU64(out, 1, timestampMs);
    putU32(out, 9, blocks.length);
    putU32(out, 13, light.length);
    putU32(out, 17, meta.length);
    let p = BODY_HEADER_BYTES;
    out.set(blocks, p); p += blocks.length;
    out.set(light, p); p += light.length;
    out.set(meta, p);
    return out;
}

/**
 * Parse a chunk body back into ChunkStorageData with STRICT framing: the body
 * must be at least the header size, carry a supported schema, and be EXACTLY the
 * length its declared section sizes imply — no missing bytes, no trailing
 * garbage. Anything else throws rather than silently returning wrong/short data.
 */
export function decodeChunkBody(body: Uint8Array): ChunkStorageData {
    if (body.length < BODY_HEADER_BYTES) {
        throw new AcrFormatError(`Truncated .acr chunk body: ${body.length} bytes < ${BODY_HEADER_BYTES}-byte header`);
    }
    const schema = body[0];
    if (schema !== BODY_SCHEMA_VERSION) {
        throw new AcrFormatError(`Unsupported .acr chunk body schema ${schema} (expected ${BODY_SCHEMA_VERSION})`);
    }
    const timestamp = getU64(body, 1);
    const blocksLen = getU32(body, 9);
    const lightLen = getU32(body, 13);
    const metaLen = getU32(body, 17);
    const expectedLength = BODY_HEADER_BYTES + blocksLen + lightLen + metaLen;
    if (body.length !== expectedLength) {
        throw new AcrFormatError(`Corrupt .acr chunk body: declared ${expectedLength} bytes (header + ${blocksLen}+${lightLen}+${metaLen}) but body is ${body.length}`);
    }
    let p = BODY_HEADER_BYTES;
    const blocks = body.slice(p, p + blocksLen); p += blocksLen;
    const light = body.slice(p, p + lightLen); p += lightLen;
    const meta = body.slice(p, p + metaLen);
    return { blocks, light, meta, timestamp };
}

// --- RegionFile -----------------------------------------------------------

export class AcrFormatError extends Error {}

export class RegionFile {
    private file: RandomAccessFile;
    private compressor: Compressor | null;
    // location[slot] = {offset, count} in sectors; offset 0 = absent.
    private offsets = new Uint32Array(SLOTS_PER_REGION);
    private counts = new Uint32Array(SLOTS_PER_REGION);
    private timestamps: number[] = new Array(SLOTS_PER_REGION).fill(0);
    // free[i] === true means sector i is allocatable.
    private free: boolean[] = [];
    private opened = false;

    constructor(file: RandomAccessFile, compressor: Compressor | null = null) {
        this.file = file;
        this.compressor = compressor;
    }

    /** Initialize (new file) or read + validate (existing) the header and tables. */
    async open(): Promise<void> {
        const size = await this.file.size();
        if (size < DATA_START_OFFSET) {
            await this.initEmpty();
        } else {
            await this.readHeaderAndTables(size);
        }
        this.opened = true;
    }

    private async initEmpty(): Promise<void> {
        const header = new Uint8Array(DATA_START_OFFSET); // header sector + both tables, zeroed
        header[0] = ACR_MAGIC[0]; header[1] = ACR_MAGIC[1];
        header[2] = ACR_MAGIC[2]; header[3] = ACR_MAGIC[3];
        putU32(header, 4, ACR_FORMAT_VERSION);
        putU32(header, 8, SECTOR_SIZE);
        putU32(header, 12, 32);
        putU32(header, 16, HEADER_SECTORS);
        await this.file.write(header, 0);
        await this.file.truncate(DATA_START_OFFSET);
        await this.file.flush();
        this.offsets.fill(0);
        this.counts.fill(0);
        this.timestamps.fill(0);
        this.free = new Array(HEADER_SECTORS).fill(false); // header sectors reserved
    }

    private async readHeaderAndTables(size: number): Promise<void> {
        const header = new Uint8Array(DATA_START_OFFSET);
        await this.file.read(header, 0);
        if (header[0] !== ACR_MAGIC[0] || header[1] !== ACR_MAGIC[1]
            || header[2] !== ACR_MAGIC[2] || header[3] !== ACR_MAGIC[3]) {
            throw new AcrFormatError('Not an .acr file (bad magic).');
        }
        const version = getU32(header, 4);
        if (version !== ACR_FORMAT_VERSION) {
            // Forward-compat guard: refuse to touch a newer format rather than corrupt it.
            throw new AcrFormatError(`Unsupported .acr format version ${version} (this build understands ${ACR_FORMAT_VERSION}).`);
        }

        const totalSectors = Math.max(HEADER_SECTORS, Math.floor(size / SECTOR_SIZE));
        this.free = new Array(totalSectors).fill(true);
        for (let i = 0; i < HEADER_SECTORS; i++) this.free[i] = false;

        for (let slot = 0; slot < SLOTS_PER_REGION; slot++) {
            const lo = LOCATION_TABLE_OFFSET + slot * LOCATION_ENTRY_BYTES;
            const offset = getU32(header, lo);
            const count = getU32(header, lo + 4);
            const ts = getU64(header, TIMESTAMP_TABLE_OFFSET + slot * 8);
            this.offsets[slot] = offset;
            this.counts[slot] = count;
            this.timestamps[slot] = ts;
            if (offset >= HEADER_SECTORS && count > 0) {
                for (let s = offset; s < offset + count && s < totalSectors; s++) this.free[s] = false;
            }
        }
    }

    hasChunk(slot: number): boolean {
        return this.offsets[slot] !== 0 && this.counts[slot] !== 0;
    }

    /** Committed location-table entry for a slot (mirrors the on-disk header). */
    location(slot: number): { offset: number; count: number } {
        return { offset: this.offsets[slot], count: this.counts[slot] };
    }

    /** Read a chunk by slot index, or null if absent. */
    async readChunk(slot: number): Promise<ChunkStorageData | null> {
        this.ensureOpen();
        const offset = this.offsets[slot];
        const count = this.counts[slot];
        if (offset === 0 || count === 0) return null;

        const region = new Uint8Array(count * SECTOR_SIZE);
        await this.file.read(region, offset * SECTOR_SIZE);
        const length = getU32(region, 0);
        // payload occupies bytes [5 .. 4 + length); it must fit in the read sectors.
        if (length < 1 || (CHUNK_SLOT_HEADER_BYTES - 1 + length) > region.length) {
            throw new AcrFormatError(`Corrupt .acr chunk slot ${slot}: bad payload length ${length}.`);
        }
        const compression = region[4];
        const payload = region.subarray(CHUNK_SLOT_HEADER_BYTES, CHUNK_SLOT_HEADER_BYTES + length - 1);
        let body: Uint8Array;
        if (compression === COMPRESSION_RAW) {
            body = payload;
        } else if (compression === COMPRESSION_DEFLATE) {
            if (!this.compressor) throw new AcrFormatError('Compressed .acr chunk but no decompressor provided.');
            body = this.compressor.decompress(payload);
        } else {
            throw new AcrFormatError(`Unknown .acr compression type ${compression}.`);
        }
        return decodeChunkBody(body);
    }

    /** Encode a chunk body into its slot payload (length + compression + bytes). */
    private encodePayload(blocks: Uint8Array, light: Uint8Array, meta: Uint8Array, timestampMs: number): Uint8Array {
        const body = encodeChunkBody(blocks, light, meta, timestampMs);
        let compType = COMPRESSION_RAW;
        let payload = body;
        if (this.compressor) {
            const compressed = this.compressor.compress(body);
            // Only keep compression if it actually helps.
            if (compressed.length < body.length) { compType = COMPRESSION_DEFLATE; payload = compressed; }
        }
        const out = new Uint8Array(CHUNK_SLOT_HEADER_BYTES + payload.length);
        putU32(out, 0, payload.length + 1); // length counts the compression byte
        out[4] = compType;
        out.set(payload, CHUNK_SLOT_HEADER_BYTES);
        return out;
    }

    /** Find a contiguous run of `need` free sectors; grow the file if necessary. */
    private allocate(need: number): number {
        let runStart = -1;
        let runLen = 0;
        for (let i = HEADER_SECTORS; i < this.free.length; i++) {
            if (this.free[i]) {
                if (runStart < 0) { runStart = i; runLen = 1; } else { runLen++; }
                if (runLen === need) {
                    for (let s = runStart; s < runStart + need; s++) this.free[s] = false;
                    return runStart;
                }
            } else {
                runStart = -1; runLen = 0;
            }
        }
        // Grow at EOF. Reuse a trailing free run if one abuts the end.
        let start = this.free.length;
        let have = 0;
        for (let i = this.free.length - 1; i >= HEADER_SECTORS && this.free[i]; i--) { start = i; have++; }
        while (this.free.length < start + need) this.free.push(false);
        for (let s = start; s < start + need; s++) this.free[s] = false;
        void have;
        return start;
    }

    private freeRun(offset: number, count: number): void {
        if (offset < HEADER_SECTORS) return;
        for (let s = offset; s < offset + count; s++) this.free[s] = true;
    }

    /**
     * Plan + write a single chunk's payload sectors WITHOUT touching the header.
     * Returns the new location and any old run to free after the header commits.
     * Crash-safe: a relocated chunk's old sectors stay valid until commit.
     */
    private async writePayloadSectors(
        slot: number, blocks: Uint8Array, light: Uint8Array, meta: Uint8Array, timestampMs: number,
    ): Promise<{ slot: number; offset: number; count: number; timestamp: number; freeOffset: number; freeCount: number }> {
        const payload = this.encodePayload(blocks, light, meta, timestampMs);
        const need = Math.max(1, sectorsFor(payload.length));
        const oldOffset = this.offsets[slot];
        const oldCount = this.counts[slot];

        // ALWAYS allocate a fresh sector run — never overwrite the sectors the
        // committed header currently points at, even when the sector count is
        // unchanged. The old run is freed only AFTER the header commit (see
        // writeChunkBatch), so a crash mid-write leaves the committed chunk fully
        // intact and the new sectors are simply orphaned. The old run stays marked
        // used during allocation here, guaranteeing a different offset.
        const target = this.allocate(need);
        let freeOffset = 0;
        let freeCount = 0;
        if (oldOffset >= HEADER_SECTORS && oldCount > 0) { freeOffset = oldOffset; freeCount = oldCount; }

        const sectorBuf = new Uint8Array(need * SECTOR_SIZE); // zero-padded tail
        sectorBuf.set(payload, 0);
        await this.file.write(sectorBuf, target * SECTOR_SIZE);
        return { slot, offset: target, count: need, timestamp: timestampMs, freeOffset, freeCount };
    }

    private headerEntryBuffers(offset: number, count: number, timestamp: number): { loc: Uint8Array; ts: Uint8Array } {
        const loc = new Uint8Array(LOCATION_ENTRY_BYTES);
        putU32(loc, 0, offset);
        putU32(loc, 4, count);
        const ts = new Uint8Array(8);
        putU64(ts, 0, timestamp);
        return { loc, ts };
    }

    /** Write a single chunk (payload sectors flushed before the header commit). */
    async writeChunk(slot: number, data: { blocks: Uint8Array; light: Uint8Array; meta: Uint8Array; timestamp?: number }): Promise<void> {
        await this.writeChunkBatch([{ slot, ...data }]);
    }

    /**
     * Write many chunks: all payload sectors first (flush), then all header
     * entries (flush), then free relocated old runs. The header flush is the
     * single commit point for the whole batch.
     */
    async writeChunkBatch(entries: Array<{ slot: number; blocks: Uint8Array; light: Uint8Array; meta: Uint8Array; timestamp?: number }>): Promise<void> {
        this.ensureOpen();
        if (entries.length === 0) return;

        // De-dupe slots (last write wins) so a batch never double-allocates a slot.
        const bySlot = new Map<number, { slot: number; blocks: Uint8Array; light: Uint8Array; meta: Uint8Array; timestamp?: number }>();
        for (const e of entries) bySlot.set(e.slot, e);

        const placed: Array<{ slot: number; offset: number; count: number; timestamp: number; freeOffset: number; freeCount: number }> = [];
        for (const e of bySlot.values()) {
            const ts = e.timestamp ?? Date.now();
            placed.push(await this.writePayloadSectors(e.slot, e.blocks, e.light, e.meta, ts));
        }
        await this.file.flush(); // (1) payloads durable

        for (const p of placed) {
            const { loc, ts } = this.headerEntryBuffers(p.offset, p.count, p.timestamp);
            await this.file.write(loc, LOCATION_TABLE_OFFSET + p.slot * LOCATION_ENTRY_BYTES);
            await this.file.write(ts, TIMESTAMP_TABLE_OFFSET + p.slot * 8);
        }
        await this.file.flush(); // (2) commit point

        for (const p of placed) {
            this.offsets[p.slot] = p.offset;
            this.counts[p.slot] = p.count;
            this.timestamps[p.slot] = p.timestamp;
            if (p.freeCount > 0) this.freeRun(p.freeOffset, p.freeCount);
        }
    }

    private ensureOpen(): void {
        if (!this.opened) throw new Error('RegionFile.open() must be called first.');
    }
}
