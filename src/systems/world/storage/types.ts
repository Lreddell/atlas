// Shared world-storage types. These were originally declared inline in
// WorldStorage.ts; they live here so the StorageBackend interface and every
// backend implementation can depend on them without importing the WorldStorage
// facade (which would create a cycle). WorldStorage re-exports the public ones,
// so existing import sites (`import { WorldMetadata } from '.../WorldStorage'`)
// keep working unchanged.

import type { ItemStack } from '../../../types';
import type { ProgressionData } from '../../progression/ProgressionStore';

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
    /** Equipped armor/accessory by slot (Phase 4). Absent on older saves. */
    equipment?: Partial<Record<string, ItemStack | null>>;
    /**
     * Item held on the cursor while an inventory/container is open. Previously
     * dropped silently on reload because it was never persisted; saving it
     * (optional, so older saves still load) prevents that item loss.
     */
    cursorStack?: ItemStack | null;
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
    // Action-adventure progression (bosses defeated, cleansed regions, unlocked
    // abilities/recipes). Absent on worlds created before this feature -> treated
    // as empty progression on load.
    progression?: ProgressionData;
}

export interface ChunkStorageData {
    blocks: Uint8Array;
    light: Uint8Array;
    meta: Uint8Array;
    timestamp: number;
}

/** A chunk plus its coordinates, used for batched writes. */
export interface ChunkBatchEntry {
    cx: number;
    cz: number;
    blocks: Uint8Array;
    light: Uint8Array;
    meta: Uint8Array;
    timestamp?: number;
}

export interface ExportedChunkData {
    cx: number;
    cz: number;
    blocks: string;
    light: string;
    meta: string;
    timestamp: number;
}

export interface ExportedWorldData {
    format: 'atlas-world-export';
    // v2 adds optional meta.progression. v1 files import fine (progression
    // defaults to empty), so both versions are accepted on import.
    version: 1 | 2;
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
