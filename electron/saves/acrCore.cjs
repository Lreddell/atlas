// CommonJS port of the pure-TS .acr codec (src/systems/world/storage/acr/).
// The Electron main process can't import the TS sources (no transpile step), so
// this mirrors the EXACT byte layout from acrFormat.ts / acrCodec.ts. They are
// kept byte-identical by acrCrossCompat.test.mjs — if you change one, change both.
//
// See src/systems/world/storage/acr/acrFormat.ts for the authoritative layout.

'use strict';

const ACR_MAGIC = [0x41, 0x43, 0x52, 0x31]; // "ACR1"
const ACR_FORMAT_VERSION = 1;
const SECTOR_SIZE = 4096;
const REGION_EDGE = 32;
const SLOTS_PER_REGION = REGION_EDGE * REGION_EDGE; // 1024

const HEADER_SECTORS = 5;
const LOCATION_TABLE_OFFSET = 1 * SECTOR_SIZE; // 4096
const TIMESTAMP_TABLE_OFFSET = 3 * SECTOR_SIZE; // 12288
const DATA_START_OFFSET = HEADER_SECTORS * SECTOR_SIZE; // 20480

const LOCATION_ENTRY_BYTES = 8;
const CHUNK_SLOT_HEADER_BYTES = 5;
const BODY_SCHEMA_VERSION = 1;
const BODY_HEADER_BYTES = 21;
const COMPRESSION_RAW = 0;
const COMPRESSION_DEFLATE = 1;

function sectorsFor(byteLength) { return Math.ceil(byteLength / SECTOR_SIZE); }

function putU32(buf, off, v) {
    buf[off] = (v >>> 24) & 0xff;
    buf[off + 1] = (v >>> 16) & 0xff;
    buf[off + 2] = (v >>> 8) & 0xff;
    buf[off + 3] = v & 0xff;
}
function getU32(buf, off) {
    return ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0;
}
function putU64(buf, off, v) {
    const hi = Math.floor(v / 0x100000000);
    const lo = v >>> 0;
    putU32(buf, off, hi);
    putU32(buf, off + 4, lo);
}
function getU64(buf, off) {
    return getU32(buf, off) * 0x100000000 + getU32(buf, off + 4);
}

function encodeChunkBody(blocks, light, meta, timestampMs) {
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

function decodeChunkBody(body) {
    const schema = body[0];
    if (schema !== BODY_SCHEMA_VERSION) {
        throw new Error(`Unsupported .acr chunk body schema ${schema} (expected ${BODY_SCHEMA_VERSION})`);
    }
    const timestamp = getU64(body, 1);
    const blocksLen = getU32(body, 9);
    const lightLen = getU32(body, 13);
    const metaLen = getU32(body, 17);
    let p = BODY_HEADER_BYTES;
    const blocks = body.slice(p, p + blocksLen); p += blocksLen;
    const light = body.slice(p, p + lightLen); p += lightLen;
    const meta = body.slice(p, p + metaLen);
    return { blocks, light, meta, timestamp };
}

class AcrFormatError extends Error {}

/**
 * RegionFile over an abstract async handle: { size(), read(into,off), write(data,off),
 * truncate(size), flush() }. compressor = { compress, decompress } | null.
 */
class RegionFile {
    constructor(handle, compressor) {
        this.file = handle;
        this.compressor = compressor || null;
        this.offsets = new Uint32Array(SLOTS_PER_REGION);
        this.counts = new Uint32Array(SLOTS_PER_REGION);
        this.timestamps = new Array(SLOTS_PER_REGION).fill(0);
        this.free = [];
        this.opened = false;
    }

    async open() {
        const size = await this.file.size();
        if (size < DATA_START_OFFSET) await this._initEmpty();
        else await this._readHeader(size);
        this.opened = true;
    }

    async _initEmpty() {
        const header = new Uint8Array(DATA_START_OFFSET);
        header[0] = ACR_MAGIC[0]; header[1] = ACR_MAGIC[1];
        header[2] = ACR_MAGIC[2]; header[3] = ACR_MAGIC[3];
        putU32(header, 4, ACR_FORMAT_VERSION);
        putU32(header, 8, SECTOR_SIZE);
        putU32(header, 12, REGION_EDGE);
        putU32(header, 16, HEADER_SECTORS);
        await this.file.write(header, 0);
        await this.file.truncate(DATA_START_OFFSET);
        await this.file.flush();
        this.offsets.fill(0);
        this.counts.fill(0);
        this.timestamps.fill(0);
        this.free = new Array(HEADER_SECTORS).fill(false);
    }

    async _readHeader(size) {
        const header = new Uint8Array(DATA_START_OFFSET);
        await this.file.read(header, 0);
        if (header[0] !== ACR_MAGIC[0] || header[1] !== ACR_MAGIC[1]
            || header[2] !== ACR_MAGIC[2] || header[3] !== ACR_MAGIC[3]) {
            throw new AcrFormatError('Not an .acr file (bad magic).');
        }
        const version = getU32(header, 4);
        if (version !== ACR_FORMAT_VERSION) {
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

    hasChunk(slot) { return this.offsets[slot] !== 0 && this.counts[slot] !== 0; }

    async readChunk(slot) {
        this._ensureOpen();
        const offset = this.offsets[slot];
        const count = this.counts[slot];
        if (offset === 0 || count === 0) return null;
        const region = new Uint8Array(count * SECTOR_SIZE);
        await this.file.read(region, offset * SECTOR_SIZE);
        const length = getU32(region, 0);
        if (length < 1 || (CHUNK_SLOT_HEADER_BYTES - 1 + length) > region.length) {
            throw new AcrFormatError(`Corrupt .acr chunk slot ${slot}: bad payload length ${length}.`);
        }
        const compression = region[4];
        const payload = region.subarray(CHUNK_SLOT_HEADER_BYTES, CHUNK_SLOT_HEADER_BYTES + length - 1);
        let body;
        if (compression === COMPRESSION_RAW) body = payload;
        else if (compression === COMPRESSION_DEFLATE) {
            if (!this.compressor) throw new AcrFormatError('Compressed .acr chunk but no decompressor provided.');
            body = this.compressor.decompress(payload);
        } else throw new AcrFormatError(`Unknown .acr compression type ${compression}.`);
        return decodeChunkBody(body);
    }

    _encodePayload(blocks, light, meta, timestampMs) {
        const body = encodeChunkBody(blocks, light, meta, timestampMs);
        let compType = COMPRESSION_RAW;
        let payload = body;
        if (this.compressor) {
            const compressed = this.compressor.compress(body);
            if (compressed.length < body.length) { compType = COMPRESSION_DEFLATE; payload = compressed; }
        }
        const out = new Uint8Array(CHUNK_SLOT_HEADER_BYTES + payload.length);
        putU32(out, 0, payload.length + 1);
        out[4] = compType;
        out.set(payload, CHUNK_SLOT_HEADER_BYTES);
        return out;
    }

    _allocate(need) {
        let runStart = -1; let runLen = 0;
        for (let i = HEADER_SECTORS; i < this.free.length; i++) {
            if (this.free[i]) {
                if (runStart < 0) { runStart = i; runLen = 1; } else { runLen++; }
                if (runLen === need) {
                    for (let s = runStart; s < runStart + need; s++) this.free[s] = false;
                    return runStart;
                }
            } else { runStart = -1; runLen = 0; }
        }
        let start = this.free.length;
        for (let i = this.free.length - 1; i >= HEADER_SECTORS && this.free[i]; i--) start = i;
        while (this.free.length < start + need) this.free.push(false);
        for (let s = start; s < start + need; s++) this.free[s] = false;
        return start;
    }

    _freeRun(offset, count) {
        if (offset < HEADER_SECTORS) return;
        for (let s = offset; s < offset + count; s++) this.free[s] = true;
    }

    async _writePayloadSectors(slot, blocks, light, meta, timestampMs) {
        const payload = this._encodePayload(blocks, light, meta, timestampMs);
        const need = Math.max(1, sectorsFor(payload.length));
        const oldOffset = this.offsets[slot];
        const oldCount = this.counts[slot];
        let target; let freeOffset = 0; let freeCount = 0;
        if (oldOffset >= HEADER_SECTORS && oldCount === need) {
            target = oldOffset;
        } else {
            target = this._allocate(need);
            if (oldOffset >= HEADER_SECTORS && oldCount > 0) { freeOffset = oldOffset; freeCount = oldCount; }
        }
        const sectorBuf = new Uint8Array(need * SECTOR_SIZE);
        sectorBuf.set(payload, 0);
        await this.file.write(sectorBuf, target * SECTOR_SIZE);
        return { slot, offset: target, count: need, timestamp: timestampMs, freeOffset, freeCount };
    }

    async writeChunk(slot, data) {
        await this.writeChunkBatch([Object.assign({ slot }, data)]);
    }

    async writeChunkBatch(entries) {
        this._ensureOpen();
        if (entries.length === 0) return;
        const bySlot = new Map();
        for (const e of entries) bySlot.set(e.slot, e);
        const placed = [];
        for (const e of bySlot.values()) {
            const ts = (e.timestamp == null) ? Date.now() : e.timestamp;
            placed.push(await this._writePayloadSectors(e.slot, e.blocks, e.light, e.meta, ts));
        }
        await this.file.flush(); // payloads durable
        for (const p of placed) {
            const loc = new Uint8Array(LOCATION_ENTRY_BYTES);
            putU32(loc, 0, p.offset);
            putU32(loc, 4, p.count);
            const ts = new Uint8Array(8);
            putU64(ts, 0, p.timestamp);
            await this.file.write(loc, LOCATION_TABLE_OFFSET + p.slot * LOCATION_ENTRY_BYTES);
            await this.file.write(ts, TIMESTAMP_TABLE_OFFSET + p.slot * 8);
        }
        await this.file.flush(); // commit point
        for (const p of placed) {
            this.offsets[p.slot] = p.offset;
            this.counts[p.slot] = p.count;
            this.timestamps[p.slot] = p.timestamp;
            if (p.freeCount > 0) this._freeRun(p.freeOffset, p.freeCount);
        }
    }

    /** All present slot indices (for export/enumeration). */
    presentSlots() {
        const out = [];
        for (let s = 0; s < SLOTS_PER_REGION; s++) if (this.hasChunk(s)) out.push(s);
        return out;
    }

    _ensureOpen() { if (!this.opened) throw new Error('RegionFile.open() must be called first.'); }
}

module.exports = {
    ACR_MAGIC,
    ACR_FORMAT_VERSION,
    SECTOR_SIZE,
    REGION_EDGE,
    SLOTS_PER_REGION,
    HEADER_SECTORS,
    DATA_START_OFFSET,
    COMPRESSION_RAW,
    COMPRESSION_DEFLATE,
    sectorsFor,
    encodeChunkBody,
    decodeChunkBody,
    AcrFormatError,
    RegionFile,
    // chunk coordinate math (mirror of regionMath.ts)
    regionForChunk: (cx, cz) => ({ rx: Math.floor(cx / REGION_EDGE), rz: Math.floor(cz / REGION_EDGE) }),
    localCoord: (c) => ((c % REGION_EDGE) + REGION_EDGE) % REGION_EDGE,
    slotForChunk: (cx, cz) => {
        const localX = ((cx % REGION_EDGE) + REGION_EDGE) % REGION_EDGE;
        const localZ = ((cz % REGION_EDGE) + REGION_EDGE) % REGION_EDGE;
        return {
            rx: Math.floor(cx / REGION_EDGE),
            rz: Math.floor(cz / REGION_EDGE),
            localX, localZ, slot: localX + localZ * REGION_EDGE,
        };
    },
    regionFileName: (rx, rz) => `r.${rx}.${rz}.acr`,
};
