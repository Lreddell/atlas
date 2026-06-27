// Shared logic for the two region-file backends (DesktopFsBackend over Electron
// IPC, OpfsBackend over a SaveWorker). Both own the legacy IndexedDbBackend to
// migrate old worlds into region files on init, and route per-world between the
// region store (once migrated) and IndexedDB (for not-yet-migrated worlds), so a
// failed/partial migration never hides or loses a world. Subclasses only provide
// a NormalizedSavesApi (methods that return data / throw) and an init().

import type { StorageBackend } from './StorageBackend';
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
    type RawChunk,
} from './worldExport';

const MIGRATION_BATCH = 64; // chunks per writeChunks call during migration/import

/** A region store's operations, normalized to "return data / throw on error". */
export interface NormalizedSavesApi {
    list(): Promise<WorldMetadata[]>;
    readMeta(worldId: string): Promise<WorldMetadata | undefined>;
    writeMeta(meta: WorldMetadata): Promise<void>;
    create(meta: WorldMetadata): Promise<void>;
    delete(worldId: string): Promise<void>;
    rename(worldId: string, name: string): Promise<void>;
    readChunk(worldId: string, cx: number, cz: number): Promise<ChunkStorageData | null>;
    writeChunks(worldId: string, chunks: ChunkBatchEntry[]): Promise<void>;
    readChunksAll(worldId: string): Promise<RawChunk[]>;
    open(worldId: string): Promise<void>;
    close(worldId: string): Promise<void>;
}

export abstract class RegionBackendBase implements StorageBackend {
    abstract readonly kind: 'desktop-fs' | 'opfs';
    protected api!: NormalizedSavesApi; // assigned by the subclass constructor
    protected legacy: IndexedDbBackend;
    private fsIds = new Set<string>(); // world ids known to live in the region store

    constructor(legacy: IndexedDbBackend) {
        this.legacy = legacy;
    }

    abstract init(): Promise<void>;

    /** Subclasses call this from init() once `api` is ready (after any self-test). */
    protected async initMigrating(): Promise<void> {
        await this.legacy.init();
        await this.refreshFsIds();
        await this.runMigration();
        await this.refreshFsIds();
    }

    private async refreshFsIds(): Promise<void> {
        this.fsIds = new Set((await this.api.list()).map((w) => w.id));
    }

    private async runMigration(): Promise<void> {
        const result = await migrateWorlds<WorldMetadata>({
            listLegacy: () => this.legacy.listWorlds(),
            listExisting: async () => Array.from(this.fsIds),
            migrateOne: async (world) => {
                // Chunks FIRST, level.json (via create) LAST = the commit point. If
                // anything fails, no level.json exists, so the world stays
                // IndexedDB-only (visible + loadable) and re-migrates next launch.
                const chunks = await this.legacy.readAllChunks(world.id);
                for (let i = 0; i < chunks.length; i += MIGRATION_BATCH) {
                    await this.api.writeChunks(world.id, chunks.slice(i, i + MIGRATION_BATCH));
                }
                await this.api.create(world);
                this.fsIds.add(world.id);
            },
        });
        if (result.migrated.length || result.failed.length) {
            console.log(`[Saves:${this.kind}] Migrated ${result.migrated.length} world(s); ${result.skipped.length} already present; ${result.failed.length} failed.`);
            for (const f of result.failed) console.warn(`[Saves:${this.kind}] Kept IndexedDB intact for "${f.id}": ${f.error}`);
        }
    }

    private async onFs(worldId: string): Promise<boolean> {
        if (this.fsIds.has(worldId)) return true;
        if (await this.api.readMeta(worldId)) { this.fsIds.add(worldId); return true; }
        return false;
    }

    // --- metadata ---

    async listWorlds(): Promise<WorldMetadata[]> {
        const fsWorlds = await this.api.list();
        this.fsIds = new Set(fsWorlds.map((w) => w.id));
        const merged = [...fsWorlds];
        for (const w of await this.legacy.listWorlds()) if (!this.fsIds.has(w.id)) merged.push(w);
        return merged;
    }

    async readMeta(worldId: string): Promise<WorldMetadata | undefined> {
        return (await this.onFs(worldId)) ? this.api.readMeta(worldId) : this.legacy.readMeta(worldId);
    }

    async writeMeta(meta: WorldMetadata): Promise<void> {
        return (await this.onFs(meta.id)) ? this.api.writeMeta(meta) : this.legacy.writeMeta(meta);
    }

    async createWorld(meta: WorldMetadata): Promise<void> {
        await this.api.create(meta);
        this.fsIds.add(meta.id);
    }

    async renameWorld(worldId: string, name: string): Promise<void> {
        return (await this.onFs(worldId)) ? this.api.rename(worldId, name) : this.legacy.renameWorld(worldId, name);
    }

    async deleteWorld(worldId: string): Promise<void> {
        if (this.fsIds.has(worldId)) { await this.api.delete(worldId); this.fsIds.delete(worldId); }
        await this.legacy.deleteWorld(worldId).catch(() => {}); // also drop any legacy copy
    }

    // --- session lifecycle ---

    async openWorld(worldId: string): Promise<void> {
        if (await this.onFs(worldId)) await this.api.open(worldId);
    }

    async closeWorld(worldId: string): Promise<void> {
        if (this.fsIds.has(worldId)) await this.api.close(worldId).catch(() => {});
    }

    // --- chunks ---

    async readChunk(worldId: string, cx: number, cz: number): Promise<ChunkStorageData | null> {
        return (await this.onFs(worldId)) ? this.api.readChunk(worldId, cx, cz) : this.legacy.readChunk(worldId, cx, cz);
    }

    async writeChunks(worldId: string, chunks: ChunkBatchEntry[]): Promise<void> {
        if (chunks.length === 0) return;
        return (await this.onFs(worldId)) ? this.api.writeChunks(worldId, chunks) : this.legacy.writeChunks(worldId, chunks);
    }

    // --- export / import (portable Atlas format) ---

    async exportWorld(worldId: string): Promise<ExportedWorldData> {
        if (await this.onFs(worldId)) {
            const meta = await this.api.readMeta(worldId);
            if (!meta) throw new Error('World metadata not found.');
            return encodeExportedWorld(meta, await this.api.readChunksAll(worldId));
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
            await this.api.writeChunks(meta.id, chunks.slice(i, i + MIGRATION_BATCH));
        }
        return meta;
    }
}
