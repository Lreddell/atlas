// Node-fs region IO for the Electron main process. Wraps acrCore's RegionFile
// with a real file handle, an LRU of open regions per world, a per-region write
// queue (overlapping positioned writes corrupt sectors), and zlib payload
// compression. Used by savesManager.cjs.
'use strict';

const fsp = require('fs/promises');
const path = require('path');
const zlib = require('zlib');
const {
    RegionFile,
    slotForChunk,
    regionFileName,
    REGION_EDGE,
} = require('./acrCore.cjs');

const zlibCompressor = {
    compress: (d) => zlib.deflateRawSync(d),
    decompress: (d) => zlib.inflateRawSync(d),
};

// Node FileHandle adapter implementing acrCore's abstract handle. Never opens
// with 'a' (append) — Linux ignores the position arg in append mode.
class NodeFileHandle {
    constructor(fh) { this.fh = fh; }
    async size() { const st = await this.fh.stat(); return st.size; }
    async read(into, off) {
        let read = 0;
        while (read < into.length) {
            const { bytesRead } = await this.fh.read(into, read, into.length - read, off + read);
            if (bytesRead === 0) throw new Error('Unexpected EOF reading .acr region');
            read += bytesRead;
        }
    }
    async write(data, off) {
        let written = 0;
        while (written < data.length) {
            const { bytesWritten } = await this.fh.write(data, written, data.length - written, off + written);
            written += bytesWritten;
        }
    }
    async truncate(size) { await this.fh.truncate(size); }
    async flush() { await this.fh.datasync(); }
}

const REGION_NAME_RE = /^r\.(-?\d+)\.(-?\d+)\.acr$/;

class RegionStore {
    constructor(worldDir, maxOpen = 24) {
        this.regionDir = path.join(worldDir, 'region');
        this.cache = new Map(); // key "rx.rz" -> { rf, fh, key, lastUsed, queue }
        this.maxOpen = maxOpen;
    }

    async _getRegion(rx, rz, createIfMissing) {
        const key = `${rx}.${rz}`;
        const cached = this.cache.get(key);
        if (cached) { cached.lastUsed = Date.now(); return cached; }

        const file = path.join(this.regionDir, regionFileName(rx, rz));
        let exists = true;
        try { await fsp.access(file); } catch { exists = false; }
        if (!exists && !createIfMissing) return null;

        await fsp.mkdir(this.regionDir, { recursive: true });
        const fh = await fsp.open(file, exists ? 'r+' : 'w+');
        const rf = new RegionFile(new NodeFileHandle(fh), zlibCompressor);
        await rf.open();
        const entry = { rf, fh, key, lastUsed: Date.now(), queue: Promise.resolve() };
        this.cache.set(key, entry);
        await this._evictIfNeeded();
        return entry;
    }

    // Serialize all operations on one region file.
    _run(entry, fn) {
        const p = entry.queue.then(fn, fn);
        entry.queue = p.then(() => undefined, () => undefined);
        return p;
    }

    async _evictIfNeeded() {
        while (this.cache.size > this.maxOpen) {
            let oldest = null;
            for (const e of this.cache.values()) if (!oldest || e.lastUsed < oldest.lastUsed) oldest = e;
            if (!oldest) break;
            this.cache.delete(oldest.key);
            await oldest.queue.catch(() => {});
            await oldest.fh.close().catch(() => {});
        }
    }

    async readChunk(cx, cz) {
        const { rx, rz, slot } = slotForChunk(cx, cz);
        const entry = await this._getRegion(rx, rz, false);
        if (!entry) return null;
        return this._run(entry, () => entry.rf.readChunk(slot));
    }

    async writeChunks(chunks) {
        const groups = new Map();
        for (const c of chunks) {
            const { rx, rz, slot } = slotForChunk(c.cx, c.cz);
            const k = `${rx}.${rz}`;
            if (!groups.has(k)) groups.set(k, { rx, rz, entries: [] });
            groups.get(k).entries.push({ slot, blocks: c.blocks, light: c.light, meta: c.meta, timestamp: c.timestamp });
        }
        for (const g of groups.values()) {
            const entry = await this._getRegion(g.rx, g.rz, true);
            await this._run(entry, () => entry.rf.writeChunkBatch(g.entries));
        }
    }

    // Enumerate every stored chunk across all region files (for export).
    async listAllChunks() {
        let names = [];
        try { names = await fsp.readdir(this.regionDir); } catch { return []; }
        const out = [];
        for (const name of names) {
            const m = REGION_NAME_RE.exec(name);
            if (!m) continue;
            const rx = Number(m[1]);
            const rz = Number(m[2]);
            const entry = await this._getRegion(rx, rz, false);
            if (!entry) continue;
            const slots = entry.rf.presentSlots();
            for (const slot of slots) {
                const data = await this._run(entry, () => entry.rf.readChunk(slot));
                if (!data) continue;
                const localX = slot % REGION_EDGE;
                const localZ = Math.floor(slot / REGION_EDGE);
                out.push({
                    cx: rx * REGION_EDGE + localX,
                    cz: rz * REGION_EDGE + localZ,
                    blocks: data.blocks, light: data.light, meta: data.meta, timestamp: data.timestamp,
                });
            }
        }
        return out;
    }

    async closeAll() {
        for (const e of this.cache.values()) {
            await e.queue.catch(() => {});
            await e.fh.close().catch(() => {});
        }
        this.cache.clear();
    }
}

module.exports = { RegionStore, NodeFileHandle, zlibCompressor };
