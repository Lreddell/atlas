
import { WorldState, ChunkUpdateCallback, VoxelBlocks } from './worldTypes';
import { getChunkKey } from './worldCoords';
import { CHUNK_SIZE, WORLD_HEIGHT } from '../../constants';

export function getChunkData(state: WorldState, cx: number, cz: number): VoxelBlocks | undefined {
    return state.chunks.get(getChunkKey(cx, cz));
}

export function setChunkData(state: WorldState, cx: number, cz: number, data: VoxelBlocks | Uint8Array) {
    state.chunks.set(getChunkKey(cx, cz), normalizeVoxelBlocks(data));
}

/**
 * Defensive copy-up: any legacy Uint8Array voxel plane becomes Uint16Array.
 * Values pass through unchanged (0-255); ids outside the registry are mapped
 * to the unknown placeholder by the storage decode paths, not here.
 */
export function normalizeVoxelBlocks(data: VoxelBlocks | Uint8Array): VoxelBlocks {
    if (data instanceof Uint16Array) return data;
    const out = new Uint16Array(data.length);
    out.set(data);
    return out;
}

export function getLightData(state: WorldState, cx: number, cz: number): Uint8Array | undefined {
    return state.lights.get(getChunkKey(cx, cz));
}

export function setLightData(state: WorldState, cx: number, cz: number, data: Uint8Array) {
    state.lights.set(getChunkKey(cx, cz), data);
}

export function getMetadataData(state: WorldState, cx: number, cz: number): Uint8Array | undefined {
    return state.metadata.get(getChunkKey(cx, cz));
}

export function setMetadataData(state: WorldState, cx: number, cz: number, data: Uint8Array) {
    state.metadata.set(getChunkKey(cx, cz), data);
}

export function ensureMetadata(state: WorldState, cx: number, cz: number): Uint8Array {
    const key = getChunkKey(cx, cz);
    if (!state.metadata.has(key)) {
        state.metadata.set(key, new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT));
    }
    return state.metadata.get(key)!;
}

export function subscribe(state: WorldState, cx: number, cz: number, callback: ChunkUpdateCallback) {
    const key = getChunkKey(cx, cz);
    if (!state.listeners.has(key)) state.listeners.set(key, new Set());
    state.listeners.get(key)!.add(callback);
    return () => {
      const set = state.listeners.get(key);
      if (set) {
        set.delete(callback);
        if (set.size === 0) state.listeners.delete(key);
      }
    };
}

export function notifyChunk(state: WorldState, cx: number, cz: number) {
    const key = getChunkKey(cx, cz);
    if (state.listeners.has(key)) state.listeners.get(key)!.forEach(cb => cb());
}

export function evictChunk(state: WorldState, cx: number, cz: number) {
    const key = getChunkKey(cx, cz);
    state.chunks.delete(key);
    state.lights.delete(key);
    state.metadata.delete(key);
    state.listeners.delete(key);
    // Tile entities are keyed by world position; drop any furnace/chest whose
    // block column belongs to the evicted chunk so a regenerated chunk cannot
    // resurrect stale container contents.
    const baseX = cx * CHUNK_SIZE;
    const baseZ = cz * CHUNK_SIZE;
    for (const map of [state.furnaces, state.chests] as const) {
        for (const posKey of Array.from(map.keys())) {
            const parts = posKey.split(',');
            if (parts.length !== 3) continue;
            const px = Number(parts[0]);
            const pz = Number(parts[2]);
            if (!Number.isFinite(px) || !Number.isFinite(pz)) continue;
            if (px >= baseX && px < baseX + CHUNK_SIZE && pz >= baseZ && pz < baseZ + CHUNK_SIZE) {
                map.delete(posKey);
            }
        }
    }
}
