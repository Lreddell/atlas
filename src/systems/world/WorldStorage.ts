// WorldStorage is the stable facade the rest of the app talks to. It owns the
// backend SELECTION (filesystem on desktop, OPFS in supported browsers, IndexedDB
// fallback) and delegates every
// operation to the active StorageBackend. The public surface is unchanged from
// the original IndexedDB-only implementation (plus a few additive methods:
// saveChunks, openWorld, closeWorld, renameWorld), so existing callers in
// WorldManager / App.tsx / the world menu keep working untouched.

import { DesktopFsBackend } from './storage/DesktopFsBackend';
import { normalizeGenConfigSnapshot } from './genConfig';
import { IndexedDbBackend } from './storage/IndexedDbBackend';
import { OpfsBackend, opfsBackendSupported } from './storage/OpfsBackend';
import type { StorageBackend } from './storage/StorageBackend';
import { upgradeLegacyBlocks, type ChunkExtras } from './storage/contentCodec';
import type {
    ChunkBatchEntry,
    ChunkCoordinate,
    ChunkStorageData,
    ExportedWorldData,
    WorldMetadata,
} from './storage/types';

// Re-export the public storage types from their original import path so existing
// `import { WorldMetadata, ExportedWorldData } from '.../WorldStorage'` keep working.
export type {
    PlayerData,
    WorldMetadata,
    ChunkStorageData,
    ExportedChunkData,
    ExportedWorldData,
    ChunkBatchEntry,
    ChunkCoordinate,
} from './storage/types';

class WorldStorageSystem {
    private backendPromise: Promise<StorageBackend> | null = null;
    private migrations = new Map<string, Promise<void>>();

    private async prepareWritableWorld(id: string): Promise<void> {
        const pending = this.migrations.get(id);
        if (pending) return pending;
        const operation = (async () => {
            const backend = await this.getBackend();
            const meta = await backend.readMeta(id);
            if (!meta) throw new Error('World metadata not found');
            if (meta.recoverySourceId) throw new Error('Recovery copies are protected. Export this copy, then import it to restore a playable world.');
            if (meta.schemaVersion === 3) return;
            const backupId = `${id}_pre_v3`;
            const backup = await backend.readMeta(backupId);
            if (backup && backup.recoverySourceId !== id) throw new Error('Recovery identifier already belongs to another world');
            if (!backup) await backend.createRecoveryCopy(id, backupId);
            await backend.writeMeta({ ...meta, schemaVersion: 3, recoveryBackupId: backupId });
        })();
        this.migrations.set(id, operation);
        try { await operation; }
        catch (error) { this.migrations.delete(id); throw error; }
    }

    /** Pick + initialize the backend once. Desktop filesystem when the bridge
     *  exists, OPFS in supported browsers, and IndexedDB otherwise. Feature
     *  detection only, never a userAgent sniff. */
    private getBackend(): Promise<StorageBackend> {
        if (this.backendPromise) return this.backendPromise;
        this.backendPromise = (async () => {
            const legacy = new IndexedDbBackend();
            await legacy.init();
            // 1. Electron desktop: real filesystem saves.
            const savesApi = (typeof window !== 'undefined') ? window.atlasDesktop?.saves : undefined;
            if (savesApi) {
                try {
                    const fs = new DesktopFsBackend(savesApi, legacy);
                    await fs.init();
                    console.log('[WorldStorage] Using desktop filesystem backend.');
                    return fs;
                } catch (e) {
                    console.error('[WorldStorage] Desktop filesystem backend failed to init; falling back to IndexedDB.', e);
                    return legacy;
                }
            }
            // 2. Web: the Origin Private File System (a real per-origin filesystem, no
            //    database). Self-tests a round-trip on init; any failure falls back.
            if (opfsBackendSupported()) {
                try {
                    const opfs = new OpfsBackend(legacy);
                    await opfs.init();
                    console.log('[WorldStorage] Using OPFS (browser filesystem) backend.');
                    return opfs;
                } catch (e) {
                    console.error('[WorldStorage] OPFS backend failed to init; falling back to IndexedDB.', e);
                    return legacy;
                }
            }
            // 3. Fallback: IndexedDB.
            console.log('[WorldStorage] Using IndexedDB backend.');
            return legacy;
        })();
        return this.backendPromise;
    }

    /** Human-readable name of the active storage backend (for the save-info UI). */
    public async getBackendKind(): Promise<'desktop-fs' | 'indexeddb' | 'opfs'> {
        return (await this.getBackend()).kind;
    }

    // --- META API (unchanged signatures) ---

    public async getAllWorlds(): Promise<WorldMetadata[]> {
        return (await this.getBackend()).listWorlds();
    }

    public async getWorldMeta(id: string): Promise<WorldMetadata | undefined> {
        return (await this.getBackend()).readMeta(id);
    }

    public async saveWorldMeta(meta: WorldMetadata): Promise<void> {
        await this.prepareWritableWorld(meta.id);
        const backend = await this.getBackend();
        const existing = await backend.readMeta(meta.id);
        return backend.writeMeta({
            ...(existing ?? {}),
            ...meta,
            schemaVersion: 3,
            recoveryBackupId: existing?.recoveryBackupId ?? meta.recoveryBackupId,
            resonantVaultReservations: meta.resonantVaultReservations
                ?? existing?.resonantVaultReservations,
        });
    }

    public async createWorld(
        name: string,
        seedInput: string,
        gameMode: 'survival' | 'creative' | 'spectator',
        worldGenConfig?: unknown,
        worldGenPresetId?: string | null,
        worldGenPresetName?: string | null,
    ): Promise<WorldMetadata> {
        const id = crypto.randomUUID();
        // Seed hashing is part of the world's deterministic identity, unchanged.
        let seedNum = 0;
        if (!seedInput || seedInput.trim() === '') {
            const randomSeed = new Uint32Array(1);
            crypto.getRandomValues(randomSeed);
            seedNum = randomSeed[0] & 0x7fffffff;
            if (seedNum === 0) seedNum = 1;
        } else {
            for (let i = 0; i < seedInput.length; i++) {
                seedNum = ((seedNum << 5) - seedNum) + seedInput.charCodeAt(i);
                seedNum |= 0;
            }
            seedNum = Math.abs(seedNum);
        }

        const worldGenConfigSnapshot = worldGenConfig == null
            ? undefined
            : normalizeGenConfigSnapshot(worldGenConfig) ?? undefined;

        const meta: WorldMetadata = {
            schemaVersion: 3,
            id,
            name: name || 'New World',
            seed: seedInput,
            seedNum,
            created: Date.now(),
            lastPlayed: Date.now(),
            gameMode,
            time: 1000,
            ...(worldGenConfigSnapshot ? { worldGenConfig: worldGenConfigSnapshot } : {}),
            ...(worldGenPresetId ? { worldGenPresetId } : {}),
            ...(worldGenPresetName ? { worldGenPresetName } : {}),
        };

        await (await this.getBackend()).createWorld(meta);
        return meta;
    }

    public async deleteWorld(id: string): Promise<void> {
        this.migrations.delete(id);
        return (await this.getBackend()).deleteWorld(id);
    }

    /** Rename a world (updates metadata name only; id + chunks unchanged). */
    public async renameWorld(id: string, name: string): Promise<void> {
        await this.prepareWritableWorld(id);
        return (await this.getBackend()).renameWorld(id, name);
    }

    // --- WORLD SESSION LIFECYCLE (additive) ---

    public async openWorld(id: string): Promise<void> {
        const backend = await this.getBackend();
        await backend.openWorld(id);
        try { await this.prepareWritableWorld(id); }
        catch (error) { await backend.closeWorld(id); throw error; }
    }

    public async closeWorld(id: string): Promise<void> {
        return (await this.getBackend()).closeWorld(id);
    }

    // --- CHUNK API ---

    /** Persist a batch of chunks (grouped per region by the backend). */
    public async saveChunks(worldId: string, chunks: ChunkBatchEntry[]): Promise<void> {
        await this.prepareWritableWorld(worldId);
        return (await this.getBackend()).writeChunks(worldId, chunks);
    }

    /** Back-compat single-chunk write (wraps the batch path). */
    public async saveChunk(worldId: string, cx: number, cz: number, data: { blocks: Uint16Array, light: Uint8Array, meta: Uint8Array } & ChunkExtras): Promise<void> {
        if (!worldId) return;
        return this.saveChunks(worldId, [{ ...data, cx, cz }]);
    }

    public async loadChunk(worldId: string, cx: number, cz: number): Promise<(ChunkStorageData & { blocks: Uint16Array }) | null> {
        if (!worldId) return null;
        const stored = await (await this.getBackend()).readChunk(worldId, cx, cz);
        if (!stored) return null;
        if (stored.blocks instanceof Uint16Array) return { ...stored, blocks: stored.blocks };
        return { ...stored, ...upgradeLegacyBlocks(stored.blocks) };
    }

    public async hasAnyChunk(worldId: string, coordinates: readonly ChunkCoordinate[]): Promise<boolean> {
        if (!worldId || coordinates.length === 0) return false;
        return (await this.getBackend()).hasAnyChunk(worldId, coordinates);
    }

    // --- EXPORT / IMPORT (portable Atlas world file; unchanged format) ---

    public async exportWorld(worldId: string): Promise<ExportedWorldData> {
        return (await this.getBackend()).exportWorld(worldId);
    }

    public async importWorld(data: ExportedWorldData): Promise<WorldMetadata> {
        // An imported recovery copy becomes a separate playable world; the
        // protected source is never overwritten or consumed by restoration.
        const copy = structuredClone(data);
        delete copy.meta.recoverySourceId;
        delete copy.meta.recoveryBackupId;
        return (await this.getBackend()).importWorld(copy);
    }
}

export const WorldStorage = new WorldStorageSystem();

// Dev-only: expose the storage facade so end-to-end OPFS / IndexedDB behavior can
// be driven from a real browser (e.g. Playwright) without going through the full
// 3D game UI. Stripped from production builds (import.meta.env.DEV is false).
try {
    const env = (import.meta as unknown as { env?: { DEV?: boolean } }).env;
    if (env?.DEV && typeof window !== 'undefined') {
        (window as unknown as { __atlasStorage?: unknown }).__atlasStorage = WorldStorage;
    }
} catch { /* non-vite environment (unit tests) */ }
