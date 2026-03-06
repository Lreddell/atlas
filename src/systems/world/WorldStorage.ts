
import { ItemStack } from '../../types';

const DB_NAME = 'AtlasDB';
const STORE_NAME = 'Chunks'; // Stores chunks: key = "chunk_<worldId>_<cx>_<cz>"
const META_STORE = 'Metadata'; // Stores world info: key = "meta_<worldId>"
const DB_VERSION = 2; // Incremented for new store

export interface PlayerData {
    position: { x: number, y: number, z: number };
    rotation: { x: number, y: number };
    inventory: (ItemStack | null)[];
    health: number;
    hunger: number;
    saturation: number;
    breath: number;
    gameMode: 'survival' | 'creative' | 'spectator';
    selectedSlot: number;
}

export interface WorldMetadata {
    id: string;
    name: string;
    seed: string; // The string input
    seedNum: number; // The numeric hash
    created: number;
    lastPlayed: number;
    gameMode: 'survival' | 'creative' | 'spectator';
    player?: PlayerData; // Last known player state
    spawnPoint?: { x: number, y: number, z: number } | null;
    worldSpawn?: { x: number, y: number, z: number } | null;
    time: number; // World time
    worldGenConfig?: unknown;
    worldGenPresetId?: string | null;
    worldGenPresetName?: string | null;
}

export interface ChunkStorageData {
    blocks: Uint8Array;
    light: Uint8Array;
    meta: Uint8Array;
    timestamp: number;
}

interface ExportedChunkData {
    cx: number;
    cz: number;
    blocks: string;
    light: string;
    meta: string;
    timestamp: number;
}

export interface ExportedWorldData {
    format: 'atlas-world-export';
    version: 1;
    exportedAt: number;
    meta: Omit<WorldMetadata, 'id' | 'created' | 'lastPlayed'> & {
        name: string;
        seed: string;
        seedNum: number;
        gameMode: 'survival' | 'creative' | 'spectator';
        time: number;
    };
    chunks: ExportedChunkData[];
}

class WorldStorageSystem {
    private dbPromise: Promise<IDBDatabase> | null = null;

    private getDB(): Promise<IDBDatabase> {
        if (this.dbPromise) return this.dbPromise;

        this.dbPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME); 
                }
                if (!db.objectStoreNames.contains(META_STORE)) {
                    db.createObjectStore(META_STORE, { keyPath: 'id' }); 
                }
            };

            request.onsuccess = (event) => {
                resolve((event.target as IDBOpenDBRequest).result);
            };

            request.onerror = (event) => {
                console.error("IndexedDB Error:", event);
                reject((event.target as IDBOpenDBRequest).error);
            };
        });
        return this.dbPromise;
    }

    // --- META API ---

    public async getAllWorlds(): Promise<WorldMetadata[]> {
        const db = await this.getDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(META_STORE, 'readonly');
            const store = tx.objectStore(META_STORE);
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    public async getWorldMeta(id: string): Promise<WorldMetadata | undefined> {
        const db = await this.getDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(META_STORE, 'readonly');
            const store = tx.objectStore(META_STORE);
            const req = store.get(id);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
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
        // Simple hash for seed
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
            : JSON.parse(JSON.stringify(worldGenConfig));

        const meta: WorldMetadata = {
            id,
            name: name || "New World",
            seed: seedInput,
            seedNum,
            created: Date.now(),
            lastPlayed: Date.now(),
            gameMode,
            time: 1000, // Start at Day
            ...(worldGenConfigSnapshot ? { worldGenConfig: worldGenConfigSnapshot } : {}),
            ...(worldGenPresetId ? { worldGenPresetId } : {}),
            ...(worldGenPresetName ? { worldGenPresetName } : {}),
        };

        const db = await this.getDB();
        const tx = db.transaction(META_STORE, 'readwrite');
        tx.objectStore(META_STORE).put(meta);
        
        await new Promise<void>((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });

        return meta;
    }

    public async deleteWorld(id: string) {
        const db = await this.getDB();
        
        return new Promise<void>((resolve, reject) => {
            const tx = db.transaction([META_STORE, STORE_NAME], 'readwrite');
            
            tx.oncomplete = () => {
                console.log(`[WorldStorage] Successfully deleted world ${id}`);
                resolve();
            };
            tx.onerror = (e) => {
                console.error(`[WorldStorage] Error deleting world ${id}`, e);
                reject(tx.error);
            };

            // 1. Delete Meta
            const metaStore = tx.objectStore(META_STORE);
            metaStore.delete(id);

            // 2. Delete Chunks (Prefix scan)
            // Range: chunk_{id}_ ... chunk_{id}_\uffff
            const chunkStore = tx.objectStore(STORE_NAME);
            const range = IDBKeyRange.bound(`chunk_${id}_`, `chunk_${id}_\uffff`);
            chunkStore.delete(range);
        });
    }

    public async saveWorldMeta(meta: WorldMetadata) {
        const db = await this.getDB();
        const tx = db.transaction(META_STORE, 'readwrite');
        tx.objectStore(META_STORE).put(meta);
        return new Promise<void>((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    // --- CHUNK API ---

    private getChunkKey(worldId: string, cx: number, cz: number): string {
        return `chunk_${worldId}_${cx}_${cz}`;
    }

    private bytesToBase64(bytes: Uint8Array): string {
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    private base64ToBytes(base64: string): Uint8Array {
        const binary = atob(base64);
        const out = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            out[i] = binary.charCodeAt(i);
        }
        return out;
    }

    private parseChunkKey(key: string, worldId: string): { cx: number; cz: number } | null {
        const prefix = `chunk_${worldId}_`;
        if (!key.startsWith(prefix)) return null;
        const coordsPart = key.slice(prefix.length);
        const parts = coordsPart.split('_');
        if (parts.length !== 2) return null;

        const cx = Number(parts[0]);
        const cz = Number(parts[1]);
        if (!Number.isFinite(cx) || !Number.isFinite(cz)) return null;
        return { cx, cz };
    }

    public async exportWorld(worldId: string): Promise<ExportedWorldData> {
        const meta = await this.getWorldMeta(worldId);
        if (!meta) throw new Error('World metadata not found.');

        const db = await this.getDB();
        const chunks = await new Promise<ExportedChunkData[]>((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const range = IDBKeyRange.bound(`chunk_${worldId}_`, `chunk_${worldId}_\uffff`);
            const req = store.openCursor(range);
            const collected: ExportedChunkData[] = [];

            req.onsuccess = () => {
                const cursor = req.result;
                if (!cursor) {
                    resolve(collected);
                    return;
                }

                const key = String(cursor.key || '');
                const parsed = this.parseChunkKey(key, worldId);
                const value = cursor.value as ChunkStorageData | undefined;
                if (parsed && value?.blocks && value?.light && value?.meta) {
                    collected.push({
                        cx: parsed.cx,
                        cz: parsed.cz,
                        blocks: this.bytesToBase64(value.blocks),
                        light: this.bytesToBase64(value.light),
                        meta: this.bytesToBase64(value.meta),
                        timestamp: Number(value.timestamp) || Date.now(),
                    });
                }
                cursor.continue();
            };

            req.onerror = () => reject(req.error);
        });

        return {
            format: 'atlas-world-export',
            version: 1,
            exportedAt: Date.now(),
            meta: {
                name: meta.name,
                seed: meta.seed,
                seedNum: meta.seedNum,
                gameMode: meta.gameMode,
                time: meta.time,
                player: meta.player,
                spawnPoint: meta.spawnPoint ?? null,
                worldSpawn: meta.worldSpawn ?? null,
                worldGenConfig: meta.worldGenConfig,
                worldGenPresetId: meta.worldGenPresetId ?? null,
                worldGenPresetName: meta.worldGenPresetName ?? null,
            },
            chunks,
        };
    }

    public async importWorld(data: ExportedWorldData): Promise<WorldMetadata> {
        if (!data || data.format !== 'atlas-world-export' || data.version !== 1) {
            throw new Error('Invalid world export format.');
        }

        const worlds = await this.getAllWorlds();
        const existingNames = new Set(worlds.map((w) => w.name));
        const baseName = String(data.meta?.name || 'Imported World').trim() || 'Imported World';
        let finalName = baseName;
        let attempt = 2;
        while (existingNames.has(finalName)) {
            finalName = `${baseName} (${attempt})`;
            attempt += 1;
        }

        const newWorldId = crypto.randomUUID();
        const now = Date.now();
        const importedMeta: WorldMetadata = {
            id: newWorldId,
            name: finalName,
            seed: String(data.meta?.seed || ''),
            seedNum: Number(data.meta?.seedNum) || 1,
            created: now,
            lastPlayed: now,
            gameMode: data.meta?.gameMode || 'survival',
            time: Number(data.meta?.time) || 6000,
            player: data.meta?.player,
            spawnPoint: data.meta?.spawnPoint ?? null,
            worldSpawn: data.meta?.worldSpawn ?? null,
            worldGenConfig: data.meta?.worldGenConfig,
            worldGenPresetId: data.meta?.worldGenPresetId ?? null,
            worldGenPresetName: data.meta?.worldGenPresetName ?? null,
        };

        const db = await this.getDB();
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction([META_STORE, STORE_NAME], 'readwrite');
            tx.objectStore(META_STORE).put(importedMeta);

            const chunkStore = tx.objectStore(STORE_NAME);
            const chunks = Array.isArray(data.chunks) ? data.chunks : [];
            for (const chunk of chunks) {
                if (!Number.isFinite(chunk.cx) || !Number.isFinite(chunk.cz)) continue;
                try {
                    const blocks = this.base64ToBytes(chunk.blocks);
                    const light = this.base64ToBytes(chunk.light);
                    const meta = this.base64ToBytes(chunk.meta);
                    chunkStore.put({
                        blocks,
                        light,
                        meta,
                        timestamp: Number(chunk.timestamp) || now,
                    } as ChunkStorageData, this.getChunkKey(newWorldId, chunk.cx, chunk.cz));
                } catch {
                    // Skip malformed chunk entries.
                }
            }

            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error);
        });

        return importedMeta;
    }

    public async saveChunk(worldId: string, cx: number, cz: number, data: { blocks: Uint8Array, light: Uint8Array, meta: Uint8Array }) {
        if (!worldId) return;
        try {
            const db = await this.getDB();
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            
            const storageData: ChunkStorageData = {
                blocks: data.blocks,
                light: data.light,
                meta: data.meta,
                timestamp: Date.now()
            };

            store.put(storageData, this.getChunkKey(worldId, cx, cz));

            await new Promise<void>((resolve, reject) => {
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
                tx.onabort = () => reject(tx.error);
            });
        } catch (e) {
            console.error("Failed to save chunk", e);
        }
    }

    public async loadChunk(worldId: string, cx: number, cz: number): Promise<ChunkStorageData | null> {
        if (!worldId) return null;
        try {
            const db = await this.getDB();
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const request = store.get(this.getChunkKey(worldId, cx, cz));

            return new Promise((resolve, reject) => {
                request.onsuccess = () => resolve(request.result || null);
                request.onerror = () => reject(request.error);
            });
        } catch (e) {
            return null;
        }
    }
}

export const WorldStorage = new WorldStorageSystem();
