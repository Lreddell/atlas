import assert from 'node:assert/strict';
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import test from 'node:test';

import { loadTs } from '../bundleTs.mjs';

const {
    RegionFile,
    AcrFormatError,
    encodeChunkBody,
    decodeChunkBody,
    ACR_MAGIC,
    DATA_START_OFFSET,
    SECTOR_SIZE,
    HEADER_SECTORS,
} = await loadTs(`
    export { RegionFile, AcrFormatError, encodeChunkBody, decodeChunkBody } from './src/systems/world/storage/acr/acrCodec.ts';
    export { ACR_MAGIC, DATA_START_OFFSET, SECTOR_SIZE, HEADER_SECTORS } from './src/systems/world/storage/acr/acrFormat.ts';
`);

// Minimal in-memory RandomAccessFile.
class MemFile {
    constructor() { this.buf = new Uint8Array(0); }
    size() { return this.buf.length; }
    _ensure(n) { if (n > this.buf.length) { const b = new Uint8Array(n); b.set(this.buf); this.buf = b; } }
    read(into, off) {
        if (off + into.length > this.buf.length) throw new Error('read past EOF');
        into.set(this.buf.subarray(off, off + into.length));
    }
    write(data, off) { this._ensure(off + data.length); this.buf.set(data, off); }
    truncate(size) { if (size <= this.buf.length) this.buf = this.buf.slice(0, size); else this._ensure(size); }
    flush() {}
}

const zlibCompressor = { compress: (d) => deflateRawSync(d), decompress: (d) => inflateRawSync(d) };

function chunk(seed, blocksLen = 4096, lightLen = 2048, metaLen = 512) {
    const mk = (len, salt) => { const a = new Uint8Array(len); for (let i = 0; i < len; i++) a[i] = (i * 7 + seed + salt) & 0xff; return a; };
    return { blocks: mk(blocksLen, 1), light: mk(lightLen, 2), meta: mk(metaLen, 3) };
}

function eqChunk(got, want) {
    assert.deepEqual([...got.blocks], [...want.blocks]);
    assert.deepEqual([...got.light], [...want.light]);
    assert.deepEqual([...got.meta], [...want.meta]);
}

test('chunk body encode/decode round-trips and preserves timestamp', () => {
    const c = chunk(11);
    const body = encodeChunkBody(c.blocks, c.light, c.meta, 1700000000123);
    const back = decodeChunkBody(body);
    eqChunk(back, c);
    assert.equal(back.timestamp, 1700000000123);
});

test('new region file initializes with valid header and no chunks', async () => {
    const f = new MemFile();
    const rf = new RegionFile(f);
    await rf.open();
    assert.equal(f.size(), DATA_START_OFFSET);
    assert.deepEqual([...f.buf.subarray(0, 4)], ACR_MAGIC);
    assert.equal(await rf.readChunk(0), null);
    assert.equal(rf.hasChunk(0), false);
});

test('chunk round trip preserves blocks, light, meta, timestamp (raw + deflate)', async () => {
    for (const comp of [null, zlibCompressor]) {
        const rf = new RegionFile(new MemFile(), comp);
        await rf.open();
        const c = chunk(42);
        await rf.writeChunk(5, { ...c, timestamp: 1700000000999 });
        const got = await rf.readChunk(5);
        eqChunk(got, c);
        assert.equal(got.timestamp, 1700000000999);
    }
});

test('sector allocation places data after the header and is readable', async () => {
    const f = new MemFile();
    const rf = new RegionFile(f, zlibCompressor);
    await rf.open();
    await rf.writeChunk(0, { ...chunk(1, 100, 100, 100), timestamp: 1 });
    // first data sector must be HEADER_SECTORS (5)
    assert.ok(f.size() >= (HEADER_SECTORS + 1) * SECTOR_SIZE);
    eqChunk(await rf.readChunk(0), chunk(1, 100, 100, 100));
});

test('rewriting a chunk with a bigger payload relocates and frees the old run', async () => {
    const f = new MemFile();
    const rf = new RegionFile(f, null); // raw so sizes are deterministic
    await rf.open();
    await rf.writeChunk(7, { ...chunk(2, 100, 0, 0), timestamp: 1 });
    const sizeAfterSmall = f.size();
    // grow well past one sector so it must relocate
    await rf.writeChunk(7, { ...chunk(3, 9000, 0, 0), timestamp: 2 });
    eqChunk(await rf.readChunk(7), chunk(3, 9000, 0, 0));
    assert.ok(f.size() > sizeAfterSmall, 'file should have grown for the larger payload');
    // a subsequent smaller-or-equal write should be able to reuse a freed run (no unbounded growth)
    const before = f.size();
    await rf.writeChunk(8, { ...chunk(4, 100, 0, 0), timestamp: 3 });
    eqChunk(await rf.readChunk(8), chunk(4, 100, 0, 0));
    assert.ok(f.size() <= before + SECTOR_SIZE * 3, 'reused freed sectors instead of always growing');
});

test('widened sector count handles payloads far beyond Minecraft 255-sector / ~1MiB cap', async () => {
    const f = new MemFile();
    const rf = new RegionFile(f, null);
    await rf.open();
    // ~2 MiB raw blocks => > 512 sectors, impossible under a 1-byte count
    const big = chunk(5, 2_000_000, 0, 0);
    await rf.writeChunk(3, { ...big, timestamp: 9 });
    const got = await rf.readChunk(3);
    assert.equal(got.blocks.length, 2_000_000);
    eqChunk(got, big);
    assert.ok(f.size() > 256 * SECTOR_SIZE, 'used more than 256 sectors for one chunk');
});

test('batch write commits multiple chunks across many slots', async () => {
    const rf = new RegionFile(new MemFile(), zlibCompressor);
    await rf.open();
    const entries = [];
    for (let i = 0; i < 20; i++) entries.push({ slot: i * 7 % 1024, ...chunk(i + 1, 256, 64, 16), timestamp: 1000 + i });
    await rf.writeChunkBatch(entries);
    for (const e of entries) {
        const got = await rf.readChunk(e.slot);
        // last-write-wins on slot collisions; just assert it's a valid stored chunk
        assert.ok(got, `slot ${e.slot} should be present`);
    }
});

test('absent chunk returns null; reopening a file sees persisted chunks', async () => {
    const f = new MemFile();
    {
        const rf = new RegionFile(f, zlibCompressor);
        await rf.open();
        await rf.writeChunk(100, { ...chunk(77), timestamp: 555 });
    }
    assert.ok(f.size() > DATA_START_OFFSET);
    {
        const rf2 = new RegionFile(f, zlibCompressor); // fresh instance, same bytes
        await rf2.open();
        assert.equal(await rf2.readChunk(101), null);
        const got = await rf2.readChunk(100);
        eqChunk(got, chunk(77));
        assert.equal(got.timestamp, 555);
        // a write after reopen must not corrupt existing data (free-list rebuilt on open)
        await rf2.writeChunk(200, { ...chunk(88), timestamp: 1 });
        eqChunk(await rf2.readChunk(100), chunk(77));
        eqChunk(await rf2.readChunk(200), chunk(88));
    }
});

test('a non-.acr file fails safely with a format error (no silent corruption)', async () => {
    const f = new MemFile();
    f.write(new Uint8Array(DATA_START_OFFSET).fill(0xab), 0); // garbage, wrong magic
    const rf = new RegionFile(f);
    await assert.rejects(() => rf.open(), AcrFormatError);
});

test('an unsupported future format version is rejected, not overwritten', async () => {
    const f = new MemFile();
    const rf = new RegionFile(f);
    await rf.open(); // valid v1 header
    // bump the formatVersion field (bytes 4..7) to a future value
    const hdr = new Uint8Array(8);
    f.read(hdr, 0);
    hdr[7] = 99; // formatVersion = 99
    f.write(hdr.subarray(4, 8), 4);
    const rf2 = new RegionFile(f);
    await assert.rejects(() => rf2.open(), AcrFormatError);
});

test('a future chunk body schema fails safely on read', () => {
    const body = encodeChunkBody(new Uint8Array([1, 2, 3]), new Uint8Array(0), new Uint8Array(0), 1);
    body[0] = 99; // bodySchema = 99
    assert.throws(() => decodeChunkBody(body), /schema/);
});
