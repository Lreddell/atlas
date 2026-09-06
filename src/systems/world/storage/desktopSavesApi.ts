// Shape of window.atlasDesktop.saves (the preload bridge). Declared here so both
// DesktopFsBackend and the global Window augmentation reference one definition.

import type { ChunkBatchEntry, ChunkStorageData } from './types';
import type { WorldMetadataRecord } from './metadataCodec';
import type { RawChunk } from './worldExport';

export interface SavesResult {
    ok: boolean;
    error?: string;
    code?: string;
}

export interface AtlasDesktopSavesApi {
    list(): Promise<SavesResult & { worlds?: WorldMetadataRecord[] }>;
    readMeta(worldId: string): Promise<SavesResult & { meta?: WorldMetadataRecord }>;
    writeMeta(meta: WorldMetadataRecord): Promise<SavesResult>;
    create(meta: WorldMetadataRecord): Promise<SavesResult>;
    delete(worldId: string): Promise<SavesResult>;
    rename(worldId: string, name: string): Promise<SavesResult>;
    readChunk(worldId: string, cx: number, cz: number): Promise<SavesResult & { chunk?: ChunkStorageData | null }>;
    writeChunks(worldId: string, chunks: ChunkBatchEntry[]): Promise<SavesResult>;
    readChunksAll(worldId: string): Promise<SavesResult & { chunks?: RawChunk[] }>;
    open(worldId: string): Promise<SavesResult>;
    close(worldId: string): Promise<SavesResult>;
    openFolder(worldId: string): Promise<SavesResult>;
}
