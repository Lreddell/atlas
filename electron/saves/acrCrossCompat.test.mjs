// Guards that the Electron main-process CJS codec (acrCore.cjs) stays byte-for-byte
// identical to the pure-TS codec (src/systems/world/storage/acr/). If these drift,
// a world written on desktop could be unreadable by the TS/OPFS path (and vice
// versa). Uses RAW compression so output is fully deterministic across impls.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

import { loadTs } from '../../src/systems/world/storage/bundleTs.mjs';

const require = createRequire(import.meta.url);
const cjs = require('./acrCore.cjs');

const ts = await loadTs(`
    export { RegionFile, encodeChunkBody, decodeChunkBody } from './src/systems/world/storage/acr/acrCodec.ts';
    export { regionForChunk, slotForChunk, regionFileName } from './src/systems/world/storage/regionMath.ts';
`);

class MemFile {
    constructor(initial) { this.buf = initial ? initial.slice() : new Uint8Array(0); }
    size() { return this.buf.length; }
    _ensure(n) { if (n > this.buf.length) { const b = new Uint8Array(n); b.set(this.buf); this.buf = b; } }
    read(into, off) { if (off + into.length > this.buf.length) throw new Error('read past EOF'); into.set(this.buf.subarray(off, off + into.length)); }
    write(data, off) { this._ensure(off + data.length); this.buf.set(data, off); }
    truncate(size) { if (size <= this.buf.length) this.buf = this.buf.slice(0, size); else this._ensure(size); }
    flush() {}
}

function chunk(seed, bl = 300, li = 120, me = 40) {
    const mk = (len, salt) => { const a = new Uint8Array(len); for (let i = 0; i < len; i++) a[i] = (i * 13 + seed + salt) & 0xff; return a; };
    return { blocks: mk(bl, 1), light: mk(li, 2), meta: mk(me, 3) };
}
const eq = (a, b) => assert.deepEqual([...a], [...b]);

test('region/slot math agrees between TS and CJS', () => {
    for (const [cx, cz] of [[0, 0], [31, 31], [32, 0], [-1, -1], [-33, 5], [100, -100]]) {
        assert.deepEqual(ts.regionForChunk(cx, cz), cjs.regionForChunk(cx, cz));
        assert.deepEqual(ts.slotForChunk(cx, cz), cjs.slotForChunk(cx, cz));
    }
    assert.equal(ts.regionFileName(-1, 2), cjs.regionFileName(-1, 2));
});

test('encodeChunkBody produces identical bytes in TS and CJS', () => {
    const c = chunk(7, 500, 250, 99);
    const a = ts.encodeChunkBody(c.blocks, c.light, c.meta, 1700000000123);
    const b = cjs.encodeChunkBody(c.blocks, c.light, c.meta, 1700000000123);
    eq(a, b);
});

test('an identical write sequence yields byte-identical .acr files (TS vs CJS)', async () => {
    const ops = [
        { slot: 0, ...chunk(1), ts: 100 },
        { slot: 500, ...chunk(2, 9000), ts: 200 },
        { slot: 0, ...chunk(3, 50), ts: 300 }, // rewrite (relocate/shrink)
        { slot: 1023, ...chunk(4), ts: 400 },
    ];

    const fa = new MemFile();
    const ra = new ts.RegionFile(fa, null); // RAW
    await ra.open();
    for (const o of ops) await ra.writeChunk(o.slot, { blocks: o.blocks, light: o.light, meta: o.meta, timestamp: o.ts });

    const fb = new MemFile();
    const rb = new cjs.RegionFile(fb, null); // RAW
    await rb.open();
    for (const o of ops) await rb.writeChunk(o.slot, { blocks: o.blocks, light: o.light, meta: o.meta, timestamp: o.ts });

    assert.equal(fa.buf.length, fb.buf.length, 'file sizes differ');
    eq(fa.buf, fb.buf);
});

test('TS-written world is readable by CJS, and vice versa', async () => {
    // TS writes
    const f = new MemFile();
    const rw = new ts.RegionFile(f, null);
    await rw.open();
    await rw.writeChunk(10, { ...chunk(11), timestamp: 555 });
    await rw.writeChunk(700, { ...chunk(22, 7000), timestamp: 556 });

    // CJS reads the same bytes
    const rr = new cjs.RegionFile(new MemFile(f.buf), null);
    await rr.open();
    let got = await rr.readChunk(10); eq(got.blocks, chunk(11).blocks); assert.equal(got.timestamp, 555);
    got = await rr.readChunk(700); eq(got.blocks, chunk(22, 7000).blocks); assert.equal(got.timestamp, 556);
    assert.equal(await rr.readChunk(11), null);

    // CJS writes, TS reads
    const g = new MemFile();
    const cw = new cjs.RegionFile(g, null);
    await cw.open();
    await cw.writeChunk(42, { ...chunk(33), timestamp: 777 });
    const tr = new ts.RegionFile(new MemFile(g.buf), null);
    await tr.open();
    const back = await tr.readChunk(42);
    eq(back.blocks, chunk(33).blocks);
    assert.equal(back.timestamp, 777);
});
