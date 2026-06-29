// Electron desktop filesystem backend. All filesystem IO happens in the main
// process; this renderer-side class adapts the window.atlasDesktop.saves IPC
// bridge ({ok,...} results) into the NormalizedSavesApi and lets RegionBackendBase
// handle routing, migration, and export/import.

import { RegionBackendBase, type NormalizedSavesApi } from './RegionBackendBase';
import type { AtlasDesktopSavesApi, SavesResult } from './desktopSavesApi';
import type { IndexedDbBackend } from './IndexedDbBackend';

function ensureOk<T extends SavesResult>(result: T | undefined, op: string): T {
    if (!result || !result.ok) {
        const err = new Error(`Desktop saves "${op}" failed: ${result?.error || 'unknown error'}`) as Error & { code?: string };
        if (result?.code) err.code = result.code;
        throw err;
    }
    return result;
}

function ipcToNormalized(api: AtlasDesktopSavesApi): NormalizedSavesApi {
    return {
        list: async () => ensureOk(await api.list(), 'list').worlds || [],
        readMeta: async (id) => ensureOk(await api.readMeta(id), 'readMeta').meta,
        writeMeta: async (meta) => { ensureOk(await api.writeMeta(meta), 'writeMeta'); },
        create: async (meta) => { ensureOk(await api.create(meta), 'create'); },
        delete: async (id) => { ensureOk(await api.delete(id), 'delete'); },
        rename: async (id, name) => { ensureOk(await api.rename(id, name), 'rename'); },
        readChunk: async (id, cx, cz) => ensureOk(await api.readChunk(id, cx, cz), 'readChunk').chunk ?? null,
        writeChunks: async (id, chunks) => { ensureOk(await api.writeChunks(id, chunks), 'writeChunks'); },
        readChunksAll: async (id) => ensureOk(await api.readChunksAll(id), 'readChunksAll').chunks || [],
        open: async (id) => { ensureOk(await api.open(id), 'open'); },
        close: async (id) => { ensureOk(await api.close(id), 'close'); },
    };
}

export class DesktopFsBackend extends RegionBackendBase {
    readonly kind = 'desktop-fs' as const;

    constructor(rawApi: AtlasDesktopSavesApi, legacy: IndexedDbBackend) {
        super(legacy);
        this.api = ipcToNormalized(rawApi);
    }

    async init(): Promise<void> {
        await this.initMigrating();
    }
}
