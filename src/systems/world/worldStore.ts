
import { WorldState, ChunkUpdateCallback } from './worldTypes';
import { getChunkKey } from './worldCoords';
import { CHUNK_SIZE, WORLD_HEIGHT } from '../../constants';

export function getChunkData(state: WorldState, cx: number, cz: number): Uint8Array | undefined {
    return state.chunks.get(getChunkKey(cx, cz));
}

export function setChunkData(state: WorldState, cx: number, cz: number, data: Uint8Array) {
    state.chunks.set(getChunkKey(cx, cz), data);
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

/** Whether any cell holds metadata (scanned four bytes at a time where aligned). */
export function hasAnyMetadata(data: Uint8Array): boolean {
    if (data.byteOffset % 4 === 0 && data.byteLength % 4 === 0) {
        const words = new Uint32Array(data.buffer, data.byteOffset, data.byteLength / 4);
        for (let i = 0; i < words.length; i++) if (words[i] !== 0) return true;
        return false;
    }
    for (let i = 0; i < data.length; i++) if (data[i] !== 0) return true;
    return false;
}

/**
 * Keeps a chunk's metadata only if it holds any: most chunks have none (it
 * records rotations, fluid levels, growth stages), and a column's worth is
 * 96 KB, a third of a loaded chunk. Readers treat a missing array as all
 * zeros; writers go through ensureMetadata, which allocates on first use.
 */
export function setMetadataIfAny(state: WorldState, cx: number, cz: number, data: Uint8Array | undefined) {
    if (data && hasAnyMetadata(data)) state.metadata.set(getChunkKey(cx, cz), data);
    else state.metadata.delete(getChunkKey(cx, cz));
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
}
