
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
}

export interface ChunkStorageData {
    blocks: Uint8Array;
    light: Uint8Array;
    meta: Uint8Array;
    timestamp: number;
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

    public async createWorld(name: string, seedInput: string, gameMode: 'survival' | 'creative' | 'spectator'): Promise<WorldMetadata> {
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

        const meta: WorldMetadata = {
            id,
            name: name || "New World",
            seed: seedInput,
            seedNum,
            created: Date.now(),
            lastPlayed: Date.now(),
            gameMode,
            time: 6000 // Start at Noon
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
