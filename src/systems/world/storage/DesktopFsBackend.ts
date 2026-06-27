// Electron desktop filesystem backend. All filesystem IO happens in the main
// process; this renderer-side class just calls the window.atlasDesktop.saves IPC
// bridge. It also owns the legacy IndexedDbBackend so it can (a) migrate old
// IndexedDB worlds into filesystem saves on first run, and (b) keep any world
// that hasn't been migrated yet fully visible and playable from IndexedDB.

import type { StorageBackend } from './StorageBackend';
import type { AtlasDesktopSavesApi, SavesResult } from './desktopSavesApi';
import type { IndexedDbBackend } from './IndexedDbBackend';
import { migrateWorlds } from './migration';
import type {
    ChunkBatchEntry,
    ChunkStorageData,
    ExportedWorldData,
    WorldMetadata,
} from './types';
import {
    decodeExportedWorld,
    encodeExportedWorld,
    uniqueWorldName,
} from './worldExport';

const MIGRATION_BATCH = 64; // chunks per writeChunks IPC during migration/import

function ensureOk(result: SavesResult | undefined, op: string): void {
    if (!result || !result.ok) {
        const err = new Error(`Desktop saves "${op}" failed: ${result?.error || 'unknown error'}`);
        if (result?.code) (err as Error & { code?: string }).code = result.code;
        throw err;
    }
}

export class DesktopFsBackend implements StorageBackend {
    readonly kind = 'desktop-fs' as const;
    private api: AtlasDesktopSavesApi;
    private legacy: IndexedDbBackend;
    private fsIds = new Set<string>(); // world ids known to live on the filesystem

    constructor(api: AtlasDesktopSavesApi, legacy: IndexedDbBackend) {
        this.api = api;
        this.legacy = legacy;
    }

    async init(): Promise<void> {
        await this.legacy.init();
        await this.refreshFsIds();
        await this.runMigration();
        await this.refreshFsIds();
    }

    private async refreshFsIds(): Promise<void> {
        const res = await this.api.list();
        ensureOk(res, 'list');
        this.fsIds = new Set((res.worlds || []).map((w) => w.id));
    }

    private async runMigration(): Promise<void> {
        const result = await migrateWorlds<WorldMetadata>({
            listLegacy: () => this.legacy.listWorlds(),
            listExisting: async () => Array.from(this.fsIds),
            migrateOne: async (world) => {
                // Write chunks FIRST, then level.json LAST as the commit point. If
                // anything fails mid-way, no level.json exists, so the world is still
                // considered IndexedDB-only (visible + loadable from the legacy source)
                // and is cleanly re-migrated next launch. This avoids a half-migrated
                // fs world shadowing the intact IndexedDB copy.
                const chunks = await this.legacy.readAllChunks(world.id);
                for (let i = 0; i < chunks.length; i += MIGRATION_BATCH) {
                    ensureOk(await this.api.writeChunks(world.id, chunks.slice(i, i + MIGRATION_BATCH)), 'migrate.writeChunks');
                }
                ensureOk(await this.api.create(world), 'migrate.create');
                this.fsIds.add(world.id);
            },
        });
        if (result.migrated.length || result.failed.length) {
            console.log(`[Saves] Migrated ${result.migrated.length} world(s) to filesystem; ${result.skipped.length} already present; ${result.failed.length} failed.`);
            for (const f of result.failed) console.warn(`[Saves] Migration kept IndexedDB intact for "${f.id}": ${f.error}`);
        }
    }

    /** True if the world lives on the filesystem; false => still IndexedDB-only. */
    private async onFs(worldId: string): Promise<boolean> {
        if (this.fsIds.has(worldId)) return true;
        const res = await this.api.readMeta(worldId);
        if (res.ok && res.meta) { this.fsIds.add(worldId); return true; }
        return false;
    }

    // --- metadata ---

    async listWorlds(): Promise<WorldMetadata[]> {
        const res = await this.api.list();
        ensureOk(res, 'list');
        const fsWorlds = res.worlds || [];
        this.fsIds = new Set(fsWorlds.map((w) => w.id));
        // Surface any not-yet-migrated worlds from IndexedDB so they stay visible.
        const legacyWorlds = await this.legacy.listWorlds();
        const merged = [...fsWorlds];
        for (const w of legacyWorlds) if (!this.fsIds.has(w.id)) merged.push(w);
        return merged;
    }

    async readMeta(worldId: string): Promise<WorldMetadata | undefined> {
        if (await this.onFs(worldId)) {
            const res = await this.api.readMeta(worldId);
            ensureOk(res, 'readMeta');
            return res.meta;
        }
        return this.legacy.readMeta(worldId);
    }

    async writeMeta(meta: WorldMetadata): Promise<void> {
        if (await this.onFs(meta.id)) { ensureOk(await this.api.writeMeta(meta), 'writeMeta'); return; }
        return this.legacy.writeMeta(meta);
    }

    async createWorld(meta: WorldMetadata): Promise<void> {
        ensureOk(await this.api.create(meta), 'create');
        this.fsIds.add(meta.id);
    }

    async renameWorld(worldId: string, name: string): Promise<void> {
        if (await this.onFs(worldId)) { ensureOk(await this.api.rename(worldId, name), 'rename'); return; }
        return this.legacy.renameWorld(worldId, name);
    }

    async deleteWorld(worldId: string): Promise<void> {
        if (this.fsIds.has(worldId)) {
            ensureOk(await this.api.delete(worldId), 'delete');
            this.fsIds.delete(worldId);
        }
        // Also remove any legacy copy so it can't reappear on next launch.
        await this.legacy.deleteWorld(worldId).catch(() => {});
    }

    // --- session lifecycle ---

    async openWorld(worldId: string): Promise<void> {
        if (await this.onFs(worldId)) ensureOk(await this.api.open(worldId), 'open');
        // legacy (IndexedDB) worlds have no cross-process lock.
    }

    async closeWorld(worldId: string): Promise<void> {
        if (this.fsIds.has(worldId)) await this.api.close(worldId).catch(() => {});
    }

    // --- chunks ---

    async readChunk(worldId: string, cx: number, cz: number): Promise<ChunkStorageData | null> {
        if (await this.onFs(worldId)) {
            const res = await this.api.readChunk(worldId, cx, cz);
            ensureOk(res, 'readChunk');
            return res.chunk ?? null;
        }
        return this.legacy.readChunk(worldId, cx, cz);
    }

    async writeChunks(worldId: string, chunks: ChunkBatchEntry[]): Promise<void> {
        if (chunks.length === 0) return;
        if (await this.onFs(worldId)) { ensureOk(await this.api.writeChunks(worldId, chunks), 'writeChunks'); return; }
        return this.legacy.writeChunks(worldId, chunks);
    }

    // --- export / import (portable Atlas format; same on every backend) ---

    async exportWorld(worldId: string): Promise<ExportedWorldData> {
        if (await this.onFs(worldId)) {
            const metaRes = await this.api.readMeta(worldId);
            ensureOk(metaRes, 'export.readMeta');
            if (!metaRes.meta) throw new Error('World metadata not found.');
            const chunksRes = await this.api.readChunksAll(worldId);
            ensureOk(chunksRes, 'export.readChunksAll');
            return encodeExportedWorld(metaRes.meta, chunksRes.chunks || []);
        }
        return this.legacy.exportWorld(worldId);
    }

    async importWorld(data: ExportedWorldData): Promise<WorldMetadata> {
        const { metaFields, chunks } = decodeExportedWorld(data);
        const existing = await this.listWorlds();
        const now = Date.now();
        const meta: WorldMetadata = {
            ...metaFields,
            id: crypto.randomUUID(),
            name: uniqueWorldName(metaFields.name, existing.map((w) => w.name)),
            created: now,
            lastPlayed: now,
        };
        await this.createWorld(meta);
        for (let i = 0; i < chunks.length; i += MIGRATION_BATCH) {
            ensureOk(await this.api.writeChunks(meta.id, chunks.slice(i, i + MIGRATION_BATCH)), 'import.writeChunks');
        }
        return meta;
    }
}
