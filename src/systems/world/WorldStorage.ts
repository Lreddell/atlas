// WorldStorage is the stable facade the rest of the app talks to. It owns the
// backend SELECTION (filesystem on desktop, IndexedDB on web) and delegates every
// operation to the active StorageBackend. The public surface is unchanged from
// the original IndexedDB-only implementation (plus a few additive methods:
// saveChunks, openWorld, closeWorld, renameWorld), so existing callers in
// WorldManager / App.tsx / the world menu keep working untouched.

import { DesktopFsBackend } from './storage/DesktopFsBackend';
import { IndexedDbBackend } from './storage/IndexedDbBackend';
import { OpfsBackend, opfsBackendSupported } from './storage/OpfsBackend';
import type { StorageBackend } from './storage/StorageBackend';
import type {
    ChunkBatchEntry,
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
} from './storage/types';

class WorldStorageSystem {
    private backendPromise: Promise<StorageBackend> | null = null;

    /** Pick + initialize the backend once. Desktop (filesystem) when the bridge
     *  exists; IndexedDB otherwise. Feature detection — never a userAgent sniff. */
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

    // --- META API (unchanged signatures) ---

    public async getAllWorlds(): Promise<WorldMetadata[]> {
        return (await this.getBackend()).listWorlds();
    }

    public async getWorldMeta(id: string): Promise<WorldMetadata | undefined> {
        return (await this.getBackend()).readMeta(id);
    }

    public async saveWorldMeta(meta: WorldMetadata): Promise<void> {
        return (await this.getBackend()).writeMeta(meta);
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
        // Seed hashing is part of the world's deterministic identity — unchanged.
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

        const worldGenConfigSnapshot = worldGenConfig == null ? undefined : JSON.parse(JSON.stringify(worldGenConfig));

        const meta: WorldMetadata = {
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
        return (await this.getBackend()).deleteWorld(id);
    }

    /** Rename a world (updates metadata name only; id + chunks unchanged). */
    public async renameWorld(id: string, name: string): Promise<void> {
        return (await this.getBackend()).renameWorld(id, name);
    }

    // --- WORLD SESSION LIFECYCLE (additive) ---

    public async openWorld(id: string): Promise<void> {
        return (await this.getBackend()).openWorld(id);
    }

    public async closeWorld(id: string): Promise<void> {
        return (await this.getBackend()).closeWorld(id);
    }

    // --- CHUNK API ---

    /** Persist a batch of chunks (grouped per region by the backend). */
    public async saveChunks(worldId: string, chunks: ChunkBatchEntry[]): Promise<void> {
        return (await this.getBackend()).writeChunks(worldId, chunks);
    }

    /** Back-compat single-chunk write (wraps the batch path). */
    public async saveChunk(worldId: string, cx: number, cz: number, data: { blocks: Uint8Array, light: Uint8Array, meta: Uint8Array }): Promise<void> {
        if (!worldId) return;
        return this.saveChunks(worldId, [{ cx, cz, blocks: data.blocks, light: data.light, meta: data.meta }]);
    }

    public async loadChunk(worldId: string, cx: number, cz: number): Promise<ChunkStorageData | null> {
        if (!worldId) return null;
        return (await this.getBackend()).readChunk(worldId, cx, cz);
    }

    // --- EXPORT / IMPORT (portable Atlas world file; unchanged format) ---

    public async exportWorld(worldId: string): Promise<ExportedWorldData> {
        return (await this.getBackend()).exportWorld(worldId);
    }

    public async importWorld(data: ExportedWorldData): Promise<WorldMetadata> {
        return (await this.getBackend()).importWorld(data);
    }
}

export const WorldStorage = new WorldStorageSystem();
