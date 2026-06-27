// World-folder persistence over the Origin Private File System, run inside the
// SaveWorker. The web analog of electron/saves/savesManager.cjs: same folder
// layout (worlds/<id>/{level.json, level.json.bak, session.lock, region/r.X.Z.acr}),
// the same .acr codec, atomic level.json writes (OPFS createWritable commits on
// close), a sync-access-handle session lock, and an LRU of open region handles.
//
// It operates on injectable OPFS handles (opfsTypes) so it can be unit-tested in
// Node against an in-memory fake — the real Web Worker passes the live OPFS root.

import { RegionFile, type Compressor } from '../acr/acrCodec';
import { REGION_EDGE } from '../acr/acrFormat';
import { OpfsRandomAccessFile } from '../acr/opfsFile';
import { regionFileName, slotForChunk } from '../regionMath';
import type { ChunkBatchEntry, ChunkStorageData, WorldMetadata } from '../types';
import type { RawChunk } from '../worldExport';
import type { OpfsDirHandle, OpfsFileHandle, OpfsSyncAccessHandle } from './opfsTypes';

const WORLD_ID_RE = /^[A-Za-z0-9_-]+$/;
const REGION_NAME_RE = /^r\.(-?\d+)\.(-?\d+)\.acr$/;
const enc = new TextEncoder();
const dec = new TextDecoder();

function assertSafeId(worldId: string): string {
    const id = String(worldId || '');
    if (!id || !WORLD_ID_RE.test(id) || id === '.' || id === '..') {
        throw new Error(`Invalid world id: ${JSON.stringify(worldId)}`);
    }
    return id;
}

interface RegionEntry { key: string; handle: OpfsSyncAccessHandle; rf: RegionFile; lastUsed: number; }

export class OpfsSavesCore {
    private root: OpfsDirHandle;
    private compressor: Compressor | null;
    private regions = new Map<string, RegionEntry>(); // "<worldId>/<rx>.<rz>" -> entry
    private locks = new Map<string, OpfsSyncAccessHandle>();
    private maxOpenRegions: number;

    constructor(root: OpfsDirHandle, compressor: Compressor | null, maxOpenRegions = 24) {
        this.root = root;
        this.compressor = compressor;
        this.maxOpenRegions = maxOpenRegions;
    }

    private async worldDir(worldId: string, create: boolean): Promise<OpfsDirHandle | null> {
        const id = assertSafeId(worldId);
        try { return await this.root.getDirectoryHandle(id, { create }); }
        catch (e) { if (create) throw e; return null; }
    }

    private async readBytes(dir: OpfsDirHandle, name: string): Promise<Uint8Array | null> {
        let fh: OpfsFileHandle;
        try { fh = await dir.getFileHandle(name); } catch { return null; }
        const file = await fh.getFile();
        return new Uint8Array(await file.arrayBuffer());
    }

    private async writeBytes(dir: OpfsDirHandle, name: string, bytes: Uint8Array): Promise<void> {
        const fh = await dir.getFileHandle(name, { create: true });
        const w = await fh.createWritable();
        await w.write(bytes);
        await w.close(); // OPFS commits atomically on close
    }

    private async readMetaFrom(dir: OpfsDirHandle): Promise<WorldMetadata | undefined> {
        const primary = await this.readBytes(dir, 'level.json');
        if (primary) { try { return JSON.parse(dec.decode(primary)); } catch { /* fall through to backup */ } }
        const backup = await this.readBytes(dir, 'level.json.bak');
        if (backup) { try { return JSON.parse(dec.decode(backup)); } catch { return undefined; } }
        return undefined;
    }

    // --- metadata ---

    async list(): Promise<WorldMetadata[]> {
        const out: WorldMetadata[] = [];
        for await (const [name, handle] of this.root.entries()) {
            if (handle.kind !== 'directory' || !WORLD_ID_RE.test(name)) continue;
            const meta = await this.readMetaFrom(handle as OpfsDirHandle);
            if (meta && meta.id) out.push(meta);
        }
        return out;
    }

    async readMeta(worldId: string): Promise<WorldMetadata | undefined> {
        const dir = await this.worldDir(worldId, false);
        if (!dir) return undefined;
        return this.readMetaFrom(dir);
    }

    async writeMeta(meta: WorldMetadata): Promise<void> {
        const dir = await this.worldDir(meta.id, true);
        if (!dir) throw new Error(`Cannot open world dir: ${meta.id}`);
        // Rotate the previous level.json into the .bak backup, then write the new one.
        const existing = await this.readBytes(dir, 'level.json');
        if (existing) await this.writeBytes(dir, 'level.json.bak', existing);
        await this.writeBytes(dir, 'level.json', enc.encode(JSON.stringify(meta, null, 2)));
    }

    async create(meta: WorldMetadata): Promise<void> {
        const dir = await this.worldDir(meta.id, true);
        if (!dir) throw new Error(`Cannot create world dir: ${meta.id}`);
        await dir.getDirectoryHandle('region', { create: true });
        await this.writeMeta(meta);
    }

    async rename(worldId: string, name: string): Promise<void> {
        const meta = await this.readMeta(worldId);
        if (!meta) throw new Error(`World not found: ${worldId}`);
        meta.name = name;
        await this.writeMeta(meta);
    }

    async exists(worldId: string): Promise<boolean> {
        const dir = await this.worldDir(worldId, false);
        if (!dir) return false;
        return (await this.readBytes(dir, 'level.json')) != null;
    }

    async deleteWorld(worldId: string): Promise<void> {
        await this.close(worldId);
        const id = assertSafeId(worldId);
        try { await this.root.removeEntry(id, { recursive: true }); } catch { /* already gone */ }
    }

    // --- chunks ---

    private async getRegion(worldId: string, rx: number, rz: number, create: boolean): Promise<RegionEntry | null> {
        const key = `${worldId}/${rx}.${rz}`;
        const cached = this.regions.get(key);
        if (cached) { cached.lastUsed = Date.now(); return cached; }

        const worldDir = await this.worldDir(worldId, create);
        if (!worldDir) return null;
        let regionDir: OpfsDirHandle;
        try { regionDir = await worldDir.getDirectoryHandle('region', { create }); }
        catch { if (create) throw new Error('Cannot open region dir'); return null; }

        const name = regionFileName(rx, rz);
        let fileHandle: OpfsFileHandle;
        try { fileHandle = await regionDir.getFileHandle(name, { create }); }
        catch { if (create) throw new Error(`Cannot open region file ${name}`); return null; }

        const handle = await fileHandle.createSyncAccessHandle();
        const rf = new RegionFile(new OpfsRandomAccessFile(handle), this.compressor);
        await rf.open();
        const entry: RegionEntry = { key, handle, rf, lastUsed: Date.now() };
        this.regions.set(key, entry);
        await this.evictRegionsIfNeeded();
        return entry;
    }

    private async evictRegionsIfNeeded(): Promise<void> {
        while (this.regions.size > this.maxOpenRegions) {
            let oldest: RegionEntry | null = null;
            for (const e of this.regions.values()) if (!oldest || e.lastUsed < oldest.lastUsed) oldest = e;
            if (!oldest) break;
            this.regions.delete(oldest.key);
            try { oldest.handle.flush(); oldest.handle.close(); } catch { /* ignore */ }
        }
    }

    async readChunk(worldId: string, cx: number, cz: number): Promise<ChunkStorageData | null> {
        const { rx, rz, slot } = slotForChunk(cx, cz);
        const entry = await this.getRegion(worldId, rx, rz, false);
        if (!entry) return null;
        entry.lastUsed = Date.now();
        return entry.rf.readChunk(slot);
    }

    async writeChunks(worldId: string, chunks: ChunkBatchEntry[]): Promise<void> {
        if (chunks.length === 0) return;
        const groups = new Map<string, { rx: number; rz: number; entries: Array<{ slot: number } & ChunkBatchEntry> }>();
        for (const c of chunks) {
            const { rx, rz, slot } = slotForChunk(c.cx, c.cz);
            const k = `${rx}.${rz}`;
            if (!groups.has(k)) groups.set(k, { rx, rz, entries: [] });
            groups.get(k)!.entries.push({ slot, ...c });
        }
        for (const g of groups.values()) {
            const entry = await this.getRegion(worldId, g.rx, g.rz, true);
            if (!entry) throw new Error('Failed to open region for write');
            entry.lastUsed = Date.now();
            await entry.rf.writeChunkBatch(g.entries.map((e) => ({ slot: e.slot, blocks: e.blocks, light: e.light, meta: e.meta, timestamp: e.timestamp })));
        }
    }

    async listAllChunks(worldId: string): Promise<RawChunk[]> {
        const worldDir = await this.worldDir(worldId, false);
        if (!worldDir) return [];
        let regionDir: OpfsDirHandle;
        try { regionDir = await worldDir.getDirectoryHandle('region'); } catch { return []; }
        const out: RawChunk[] = [];
        for await (const [name, handle] of regionDir.entries()) {
            const m = REGION_NAME_RE.exec(name);
            if (!m || handle.kind !== 'file') continue;
            const rx = Number(m[1]);
            const rz = Number(m[2]);
            const entry = await this.getRegion(worldId, rx, rz, false);
            if (!entry) continue;
            for (const slot of entry.rf.presentSlots()) {
                const data = await entry.rf.readChunk(slot);
                if (!data) continue;
                const localX = slot % REGION_EDGE;
                const localZ = Math.floor(slot / REGION_EDGE);
                out.push({ cx: rx * REGION_EDGE + localX, cz: rz * REGION_EDGE + localZ, blocks: data.blocks, light: data.light, meta: data.meta, timestamp: data.timestamp });
            }
        }
        return out;
    }

    // --- session lock (a held sync-access handle is exclusive per file/origin) ---

    async open(worldId: string): Promise<void> {
        if (this.locks.has(worldId)) return;
        const dir = await this.worldDir(worldId, true);
        if (!dir) throw new Error(`Cannot open world: ${worldId}`);
        const fh = await dir.getFileHandle('session.lock', { create: true });
        try {
            const handle = await fh.createSyncAccessHandle();
            this.locks.set(worldId, handle);
        } catch {
            const err = new Error(`World "${worldId}" is already open in another tab.`) as Error & { code?: string };
            err.code = 'LOCKED';
            throw err;
        }
    }

    async close(worldId: string): Promise<void> {
        for (const [key, entry] of [...this.regions]) {
            if (key.startsWith(`${worldId}/`)) {
                this.regions.delete(key);
                try { entry.handle.flush(); entry.handle.close(); } catch { /* ignore */ }
            }
        }
        const lock = this.locks.get(worldId);
        if (lock) { this.locks.delete(worldId); try { lock.close(); } catch { /* ignore */ } }
    }
}
