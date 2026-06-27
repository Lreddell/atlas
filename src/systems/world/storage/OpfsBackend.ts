// Web backend over the Origin Private File System (a real per-origin filesystem,
// no database). A dedicated SaveWorker owns OPFS and runs the .acr region codec;
// this renderer-side class adapts the worker's request/response protocol into the
// NormalizedSavesApi and lets RegionBackendBase handle routing + IndexedDB
// migration. On any init/round-trip failure it terminates the worker and rethrows
// so WorldStorage transparently falls back to IndexedDB.

import { RegionBackendBase, type NormalizedSavesApi } from './RegionBackendBase';
import type { IndexedDbBackend } from './IndexedDbBackend';
import type { ChunkStorageData, WorldMetadata } from './types';

interface Pending { resolve: (value: unknown) => void; reject: (error: Error) => void; }

/** True when this context can host the OPFS SaveWorker (the worker also self-tests). */
export function opfsBackendSupported(): boolean {
    return typeof window !== 'undefined'
        && typeof Worker !== 'undefined'
        && typeof navigator !== 'undefined'
        && !!navigator.storage
        && typeof navigator.storage.getDirectory === 'function';
}

export class OpfsBackend extends RegionBackendBase {
    readonly kind = 'opfs' as const;
    private worker: Worker;
    private seq = 0;
    private pending = new Map<number, Pending>();

    constructor(legacy: IndexedDbBackend) {
        super(legacy);
        this.worker = new Worker(new URL('./opfs/saveWorker.ts', import.meta.url), { type: 'module' });
        this.worker.onmessage = (e: MessageEvent) => {
            const { id, ok, result, error, code } = (e.data || {}) as { id: number; ok: boolean; result?: unknown; error?: string; code?: string };
            const p = this.pending.get(id);
            if (!p) return;
            this.pending.delete(id);
            if (ok) p.resolve(result);
            else { const err = new Error(error || 'SaveWorker error') as Error & { code?: string }; if (code) err.code = code; p.reject(err); }
        };
        this.worker.onerror = (e) => {
            const err = new Error(`SaveWorker crashed: ${e.message}`);
            for (const p of this.pending.values()) p.reject(err);
            this.pending.clear();
        };
        this.api = this.makeApi();
    }

    private call<T>(op: string, ...args: unknown[]): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            const id = ++this.seq;
            this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
            this.worker.postMessage({ id, op, args });
        });
    }

    private makeApi(): NormalizedSavesApi {
        return {
            list: () => this.call('list'),
            readMeta: (id) => this.call('readMeta', id),
            writeMeta: (meta) => this.call('writeMeta', meta),
            create: (meta) => this.call('create', meta),
            delete: (id) => this.call('delete', id),
            rename: (id, name) => this.call('rename', id, name),
            readChunk: (id, cx, cz) => this.call('readChunk', id, cx, cz),
            writeChunks: (id, chunks) => this.call('writeChunks', id, chunks),
            readChunksAll: (id) => this.call('readChunksAll', id),
            open: (id) => this.call('open', id),
            close: (id) => this.call('close', id),
        };
    }

    async init(): Promise<void> {
        try {
            await this.legacy.init();
            await this.selfTest(); // prove a full OPFS round-trip works before trusting it
            await this.initMigrating();
        } catch (e) {
            this.worker.terminate();
            throw e;
        }
    }

    /** Create -> write -> read -> delete a probe world through the worker. Throws if
     *  OPFS (or createSyncAccessHandle) is unusable, triggering the IndexedDB fallback. */
    private async selfTest(): Promise<void> {
        const id = '__opfs_selftest__';
        const probe = new Uint8Array([1, 2, 3, 4, 5]);
        const meta: WorldMetadata = { id, name: 'selftest', seed: '', seedNum: 1, created: 0, lastPlayed: 0, gameMode: 'survival', time: 0 };
        await this.call('create', meta);
        await this.call('writeChunks', id, [{ cx: 0, cz: 0, blocks: probe, light: probe, meta: probe, timestamp: 1 }]);
        const back = await this.call<ChunkStorageData | null>('readChunk', id, 0, 0);
        await this.call('delete', id);
        if (!back || back.blocks.length !== probe.length || back.blocks[2] !== 3) {
            throw new Error('OPFS self-test round-trip failed');
        }
    }
}
