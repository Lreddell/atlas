// IndexedDB StorageBackend, the original AtlasDB persistence, unchanged on the
// wire (same DB name/version, same object stores, same key scheme) so worlds
// saved before this refactor load exactly as before. It is the web backend and
// the migration source for the desktop filesystem backend.

import type { StorageBackend } from './StorageBackend';
import { encodeChunkBody, decodeChunkBody } from './acr/acrCodec';
import { encodeWorldMetadata, decodeWorldMetadata, type WorldMetadataRecord } from './metadataCodec';
import type {
    ChunkBatchEntry,
    ChunkCoordinate,
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

const DB_NAME = 'AtlasDB';
const STORE_NAME = 'Chunks'; // key = "chunk_<worldId>_<cx>_<cz>"
const META_STORE = 'Metadata'; // keyPath 'id'
const DB_VERSION = 2;

export class IndexedDbBackend implements StorageBackend {
    readonly kind = 'indexeddb' as const;
    private dbPromise: Promise<IDBDatabase> | null = null;

    async init(): Promise<void> {
        await this.getDB();
    }

    private getDB(): Promise<IDBDatabase> {
        if (this.dbPromise) return this.dbPromise;
        this.dbPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;
                if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
                if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE, { keyPath: 'id' });
            };
            request.onsuccess = (event) => resolve((event.target as IDBOpenDBRequest).result);
            request.onerror = (event) => { console.error('IndexedDB Error:', event); reject((event.target as IDBOpenDBRequest).error); };
        });
        return this.dbPromise;
    }

    private chunkKey(worldId: string, cx: number, cz: number): string {
        return `chunk_${worldId}_${cx}_${cz}`;
    }

    private parseChunkKey(key: string, worldId: string): { cx: number; cz: number } | null {
        const prefix = `chunk_${worldId}_`;
        if (!key.startsWith(prefix)) return null;
        const parts = key.slice(prefix.length).split('_');
        if (parts.length !== 2) return null;
        const cx = Number(parts[0]);
        const cz = Number(parts[1]);
        if (!Number.isFinite(cx) || !Number.isFinite(cz)) return null;
        return { cx, cz };
    }

    // --- metadata ---

    async listWorlds(): Promise<WorldMetadata[]> {
        const db = await this.getDB();
        return new Promise((resolve, reject) => {
            const req = db.transaction(META_STORE, 'readonly').objectStore(META_STORE).getAll();
            req.onsuccess = () => {
                try { resolve((req.result as WorldMetadataRecord[]).map(decodeWorldMetadata)); }
                catch (error) { reject(error); }
            };
            req.onerror = () => reject(req.error);
        });
    }

    async readMeta(worldId: string): Promise<WorldMetadata | undefined> {
        const db = await this.getDB();
        return new Promise((resolve, reject) => {
            const req = db.transaction(META_STORE, 'readonly').objectStore(META_STORE).get(worldId);
            req.onsuccess = () => {
                try { resolve(req.result ? decodeWorldMetadata(req.result) : undefined); }
                catch (error) { reject(error); }
            };
            req.onerror = () => reject(req.error);
        });
    }

    async writeMeta(meta: WorldMetadata): Promise<void> {
        const db = await this.getDB();
        const tx = db.transaction(META_STORE, 'readwrite');
        tx.objectStore(META_STORE).put(encodeWorldMetadata(meta));
        return this.txDone(tx);
    }

    async createWorld(meta: WorldMetadata): Promise<void> {
        await this.writeMeta(meta);
    }

    async renameWorld(worldId: string, name: string): Promise<void> {
        const meta = await this.readMeta(worldId);
        if (!meta) throw new Error(`World not found: ${worldId}`);
        meta.name = name;
        await this.writeMeta(meta);
    }

    async deleteWorld(worldId: string): Promise<void> {
        const db = await this.getDB();
        const tx = db.transaction([META_STORE, STORE_NAME], 'readwrite');
        tx.objectStore(META_STORE).delete(worldId);
        tx.objectStore(STORE_NAME).delete(IDBKeyRange.bound(`chunk_${worldId}_`, `chunk_${worldId}_￿`));
        return this.txDone(tx);
    }

    // IndexedDB has no cross-process lock; these are no-ops.
    async openWorld(): Promise<void> { /* no lock for IndexedDB */ }
    async closeWorld(): Promise<void> { /* nothing to flush */ }

    // --- chunks ---

    async readChunk(worldId: string, cx: number, cz: number): Promise<ChunkStorageData | null> {
        if (!worldId) return null;
        const db = await this.getDB();
        return new Promise((resolve, reject) => {
            const req = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(this.chunkKey(worldId, cx, cz));
            req.onsuccess = () => {
                try { resolve(this.decodeChunkRecord(req.result)); }
                catch (error) { reject(error); }
            };
            req.onerror = () => reject(req.error);
        });
    }

    private decodeChunkRecord(value: unknown): ChunkStorageData | null {
        if (value === undefined || value === null) return null;
        const record = value as { schema?: number; body?: Uint8Array } & ChunkStorageData;
        if (record.schema !== undefined) {
            if (record.schema !== 2 || !(record.body instanceof Uint8Array)) throw new Error('Unsupported IndexedDB chunk record');
            return decodeChunkBody(record.body);
        }
        if (!(record.blocks instanceof Uint8Array) || !(record.light instanceof Uint8Array) || !(record.meta instanceof Uint8Array)) throw new Error('Invalid legacy IndexedDB chunk');
        return record;
    }

    async createRecoveryCopy(worldId: string, backupId: string): Promise<void> {
        const db = await this.getDB();
        const tx = db.transaction([META_STORE, STORE_NAME], 'readwrite');
        const done = this.txDone(tx);
        const metadata = tx.objectStore(META_STORE);
        const chunks = tx.objectStore(STORE_NAME);
        const read = metadata.get(worldId);
        read.onsuccess = () => {
            if (!read.result) { tx.abort(); return; }
            const source = read.result;
            const cursorRequest = chunks.openCursor(IDBKeyRange.bound(`chunk_${worldId}_`, `chunk_${worldId}_￿`));
            cursorRequest.onsuccess = () => {
                const cursor = cursorRequest.result;
                if (!cursor) {
                    metadata.put({ ...source, id: backupId, name: `${source.name} (pre-migration recovery)`, recoverySourceId: worldId });
                    return;
                }
                const coordinate = this.parseChunkKey(String(cursor.key), worldId);
                if (coordinate) chunks.put(cursor.value, this.chunkKey(backupId, coordinate.cx, coordinate.cz));
                cursor.continue();
            };
        };
        await done;
    }

    async hasAnyChunk(worldId: string, coordinates: readonly ChunkCoordinate[]): Promise<boolean> {
        if (!worldId || coordinates.length === 0) return false;
        const db = await this.getDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            let pending = coordinates.length;
            let settled = false;
            for (const { cx, cz } of coordinates) {
                const request = store.getKey(this.chunkKey(worldId, cx, cz));
                request.onsuccess = () => {
                    if (settled) return;
                    if (request.result !== undefined) {
                        settled = true;
                        resolve(true);
                        return;
                    }
                    pending -= 1;
                    if (pending === 0) {
                        settled = true;
                        resolve(false);
                    }
                };
                request.onerror = () => {
                    if (settled) return;
                    settled = true;
                    reject(request.error);
                };
            }
        });
    }

    async writeChunks(worldId: string, chunks: ChunkBatchEntry[]): Promise<void> {
        if (!worldId || chunks.length === 0) return;
        const db = await this.getDB();
        const tx = db.transaction(STORE_NAME, 'readwrite'); // whole batch in ONE transaction
        const store = tx.objectStore(STORE_NAME);
        for (const c of chunks) {
            const data = { schema: 2, body: encodeChunkBody(c.blocks, c.light, c.meta, c.timestamp ?? Date.now(), c) };
            store.put(data, this.chunkKey(worldId, c.cx, c.cz));
        }
        return this.txDone(tx);
    }

    /** Read every stored chunk for a world (export + migration source). */
    async readAllChunks(worldId: string): Promise<RawChunk[]> {
        const db = await this.getDB();
        return new Promise((resolve, reject) => {
            const store = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME);
            const range = IDBKeyRange.bound(`chunk_${worldId}_`, `chunk_${worldId}_￿`);
            const req = store.openCursor(range);
            const out: RawChunk[] = [];
            req.onsuccess = () => {
                const cursor = req.result;
                if (!cursor) { resolve(out); return; }
                const parsed = this.parseChunkKey(String(cursor.key || ''), worldId);
                try {
                    const value = this.decodeChunkRecord(cursor.value);
                    if (!parsed || !value) throw new Error('Invalid saved chunk entry');
                    out.push({ ...parsed, ...value });
                } catch (error) { reject(error); return; }
                cursor.continue();
            };
            req.onerror = () => reject(req.error);
        });
    }

    // --- export / import ---

    async exportWorld(worldId: string): Promise<ExportedWorldData> {
        const meta = await this.readMeta(worldId);
        if (!meta) throw new Error('World metadata not found.');
        const chunks = await this.readAllChunks(worldId);
        return encodeExportedWorld(meta, chunks);
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
        // Chunks first, metadata last as the commit point (matches the region
        // backends): a failure mid-import leaves no visible half-imported world.
        await this.writeChunks(meta.id, chunks);
        await this.createWorld(meta);
        return meta;
    }

    private txDone(tx: IDBTransaction): Promise<void> {
        return new Promise((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error);
        });
    }
}
