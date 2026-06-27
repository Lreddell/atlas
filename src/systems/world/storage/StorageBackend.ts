// The pluggable persistence seam. WorldStorage delegates every operation to the
// active StorageBackend, chosen once at boot by feature detection:
//   - DesktopFsBackend  when window.atlasDesktop?.saves exists (Electron)
//   - IndexedDbBackend  otherwise (web, and the migration source on desktop)
//
// Everything above WorldStorage (WorldManager, App.tsx, the world menu) is
// unaware of which backend is active. Adding OPFS/worker backends later means
// implementing this interface — nothing else changes.

import type {
    ChunkBatchEntry,
    ChunkStorageData,
    ExportedWorldData,
    WorldMetadata,
} from './types';

export interface StorageBackend {
    readonly kind: 'desktop-fs' | 'indexeddb' | 'opfs';

    /** Called once after construction. May run migration / open the DB. */
    init(): Promise<void>;

    // --- World metadata ---
    listWorlds(): Promise<WorldMetadata[]>;
    readMeta(worldId: string): Promise<WorldMetadata | undefined>;
    writeMeta(meta: WorldMetadata): Promise<void>;
    createWorld(meta: WorldMetadata): Promise<void>;
    deleteWorld(worldId: string): Promise<void>;
    /** Rename a world: updates only the name in metadata. ID and chunks are untouched. */
    renameWorld(worldId: string, name: string): Promise<void>;

    // --- World session lifecycle ---
    /** Acquire the world for writing (e.g. a session lock). Throws/reports on conflict. */
    openWorld(worldId: string): Promise<void>;
    /** Flush + release the world (drops the session lock, closes file handles). */
    closeWorld(worldId: string): Promise<void>;

    // --- Chunks ---
    readChunk(worldId: string, cx: number, cz: number): Promise<ChunkStorageData | null>;
    /** Persist a batch of chunks. Backends group by region and commit per region. */
    writeChunks(worldId: string, chunks: ChunkBatchEntry[]): Promise<void>;

    // --- Portable Atlas export/import (NOT Minecraft / external-game format) ---
    exportWorld(worldId: string): Promise<ExportedWorldData>;
    importWorld(data: ExportedWorldData): Promise<WorldMetadata>;
}
