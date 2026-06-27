// World-folder persistence for the Electron main process.
//
//   <rootDir>/<worldId>/level.json        world metadata (atomic write)
//   <rootDir>/<worldId>/level.json.bak    previous metadata (crash rollback)
//   <rootDir>/<worldId>/session.lock      single-writer lock
//   <rootDir>/<worldId>/region/r.<rx>.<rz>.acr   chunk data
//
// worldId is the stable folder identity; the human name lives inside level.json,
// so rename never rewrites chunks. All chunk IO is delegated to RegionStore.
'use strict';

const fsp = require('fs/promises');
const path = require('path');
const { RegionStore } = require('./regionStore.cjs');

const WORLD_ID_RE = /^[A-Za-z0-9_-]+$/;

function assertSafeId(worldId) {
    const id = String(worldId || '');
    if (!id || !WORLD_ID_RE.test(id) || id === '.' || id === '..') {
        throw new Error(`Invalid world id: ${JSON.stringify(worldId)}`);
    }
    return id;
}

function isAlive(pid) {
    if (!pid || pid === process.pid) return pid === process.pid;
    try { process.kill(pid, 0); return true; } catch (e) { return e.code !== 'ESRCH'; }
}

class SavesManager {
    constructor(rootDir) {
        this.rootDir = rootDir;
        this.stores = new Map(); // worldId -> RegionStore
        this.locks = new Map();  // worldId -> FileHandle
    }

    _worldDir(worldId) {
        const id = assertSafeId(worldId);
        const dir = path.resolve(this.rootDir, id);
        // Defense in depth: the resolved path must stay inside rootDir.
        const root = path.resolve(this.rootDir);
        if (dir !== path.join(root, id) || !(dir === root || dir.startsWith(root + path.sep))) {
            throw new Error(`World path escapes saves root: ${worldId}`);
        }
        return dir;
    }

    /** Public accessor for the world's directory (used to open it in a file explorer). */
    worldDir(worldId) { return this._worldDir(worldId); }

    _store(worldId) {
        let s = this.stores.get(worldId);
        if (!s) { s = new RegionStore(this._worldDir(worldId)); this.stores.set(worldId, s); }
        return s;
    }

    // --- atomic metadata write (write tmp -> fsync -> rotate .bak -> rename -> fsync dir) ---
    async _writeJsonAtomic(filePath, obj) {
        const dir = path.dirname(filePath);
        await fsp.mkdir(dir, { recursive: true });
        const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
        const data = Buffer.from(JSON.stringify(obj, null, 2), 'utf8');
        const fh = await fsp.open(tmp, 'w');
        try { await fh.write(data, 0, data.length, 0); await fh.sync(); } finally { await fh.close(); }

        const backup = `${filePath}.bak`;
        try { await fsp.rename(filePath, backup); } catch (e) { if (e.code !== 'ENOENT') throw e; }
        await fsp.rename(tmp, filePath);
        // fsync the directory so the renames survive power loss.
        try { const dh = await fsp.open(dir, 'r'); try { await dh.sync(); } finally { await dh.close(); } } catch { /* best effort */ }
    }

    async _readJson(filePath) {
        const raw = await fsp.readFile(filePath, 'utf8');
        return JSON.parse(raw);
    }

    async _readMetaFrom(dir) {
        const primary = path.join(dir, 'level.json');
        try { return await this._readJson(primary); } catch (e) {
            if (e.code !== 'ENOENT' && !(e instanceof SyntaxError)) throw e;
        }
        // Fall back to the backup if the primary is missing or corrupt.
        try { return await this._readJson(path.join(dir, 'level.json.bak')); } catch { return undefined; }
    }

    // --- public API ---

    async list() {
        let entries = [];
        try { entries = await fsp.readdir(this.rootDir, { withFileTypes: true }); }
        catch (e) { if (e.code === 'ENOENT') return []; throw e; }
        const out = [];
        for (const ent of entries) {
            if (!ent.isDirectory() || !WORLD_ID_RE.test(ent.name)) continue;
            const meta = await this._readMetaFrom(path.join(this.rootDir, ent.name));
            if (meta && meta.id) out.push(meta);
        }
        return out;
    }

    async readMeta(worldId) {
        return this._readMetaFrom(this._worldDir(worldId));
    }

    async writeMeta(meta) {
        const dir = this._worldDir(meta.id);
        await this._writeJsonAtomic(path.join(dir, 'level.json'), meta);
    }

    async create(meta) {
        const dir = this._worldDir(meta.id);
        await fsp.mkdir(path.join(dir, 'region'), { recursive: true });
        await this._writeJsonAtomic(path.join(dir, 'level.json'), meta);
    }

    async rename(worldId, name) {
        const meta = await this.readMeta(worldId);
        if (!meta) throw new Error(`World not found: ${worldId}`);
        meta.name = name;
        await this.writeMeta(meta);
    }

    async deleteWorld(worldId) {
        await this.close(worldId);
        await fsp.rm(this._worldDir(worldId), { recursive: true, force: true });
    }

    async exists(worldId) {
        try { await fsp.access(path.join(this._worldDir(worldId), 'level.json')); return true; } catch { return false; }
    }

    async readChunk(worldId, cx, cz) { return this._store(worldId).readChunk(cx, cz); }
    async writeChunks(worldId, chunks) { return this._store(worldId).writeChunks(chunks); }
    async listAllChunks(worldId) { return this._store(worldId).listAllChunks(); }

    // --- session lock ---
    async open(worldId) {
        const dir = this._worldDir(worldId);
        await fsp.mkdir(dir, { recursive: true });
        const lockPath = path.join(dir, 'session.lock');
        if (this.locks.has(worldId)) return; // already held by us

        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                const fh = await fsp.open(lockPath, 'wx');
                await fh.write(Buffer.from(JSON.stringify({ pid: process.pid, startedAt: Date.now() }), 'utf8'), 0);
                await fh.sync();
                this.locks.set(worldId, fh);
                return;
            } catch (e) {
                if (e.code !== 'EEXIST') throw e;
                // Lock exists — is it stale (owner dead) or ours?
                let info = null;
                try { info = JSON.parse(await fsp.readFile(lockPath, 'utf8')); } catch { /* unreadable */ }
                if (info && info.pid === process.pid) return; // we already own it
                if (info && info.pid && !isAlive(info.pid)) {
                    await fsp.rm(lockPath, { force: true }); // stale -> reclaim and retry
                    continue;
                }
                const err = new Error(`World "${worldId}" is already open in another instance.`);
                err.code = 'LOCKED';
                throw err;
            }
        }
        const err = new Error(`Could not acquire lock for world "${worldId}".`);
        err.code = 'LOCKED';
        throw err;
    }

    async close(worldId) {
        const store = this.stores.get(worldId);
        if (store) { await store.closeAll(); this.stores.delete(worldId); }
        const fh = this.locks.get(worldId);
        if (fh) {
            this.locks.delete(worldId);
            await fh.close().catch(() => {});
            try { await fsp.rm(path.join(this._worldDir(worldId), 'session.lock'), { force: true }); } catch { /* ignore */ }
        }
    }

    async closeAll() {
        for (const worldId of [...this.locks.keys(), ...this.stores.keys()]) {
            await this.close(worldId);
        }
    }
}

module.exports = { SavesManager, assertSafeId, isAlive };
