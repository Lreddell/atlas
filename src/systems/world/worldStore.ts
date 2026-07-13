
import { WorldState, ChunkUpdateCallback } from './worldTypes';
import { getChunkKey } from './worldCoords';
import { ChunkColumn } from './chunkColumn';

export function getColumn(state: WorldState, cx: number, cz: number): ChunkColumn | undefined {
    return state.columns.get(getChunkKey(cx, cz));
}

export function setColumn(state: WorldState, cx: number, cz: number, column: ChunkColumn) {
    state.columns.set(getChunkKey(cx, cz), column);
}

/** Ingests legacy full-column arrays (generation output / persisted saves). */
export function setColumnFromArrays(
    state: WorldState,
    cx: number,
    cz: number,
    blocks: Uint8Array,
    light: Uint8Array,
    meta?: Uint8Array | null,
): ChunkColumn {
    const column = ChunkColumn.fromArrays(blocks, light, meta);
    state.columns.set(getChunkKey(cx, cz), column);
    return column;
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
    state.columns.delete(key);
    state.listeners.delete(key);
}
