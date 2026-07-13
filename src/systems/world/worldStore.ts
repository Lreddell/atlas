import type { ChunkUpdateCallback, WorldState } from './worldTypes';
import { getChunkKey } from './worldCoords';
import { CHUNK_SIZE, MAX_Y, MIN_Y } from '../../constants';
import {
  ChunkColumn,
  COLUMN_VOLUME,
  materializeColumnArray,
  type ColumnArrayKind,
} from './sections/chunkColumn';
import {
  allocatedBytesOfArray,
  materializeUint8Array,
} from './sections/sectionedColumnMap';

export function getChunkColumn(state: WorldState, cx: number, cz: number): ChunkColumn | undefined {
  return state.columns.get(getChunkKey(cx, cz));
}

export function getChunkData(state: WorldState, cx: number, cz: number): Uint8Array | undefined {
  return state.chunks.get(getChunkKey(cx, cz));
}

export function setChunkData(state: WorldState, cx: number, cz: number, data: Uint8Array): void {
  state.chunks.set(getChunkKey(cx, cz), data);
}

export function getLightData(state: WorldState, cx: number, cz: number): Uint8Array | undefined {
  return state.lights.get(getChunkKey(cx, cz));
}

export function setLightData(state: WorldState, cx: number, cz: number, data: Uint8Array): void {
  state.lights.set(getChunkKey(cx, cz), data);
}

export function getMetadataData(state: WorldState, cx: number, cz: number): Uint8Array | undefined {
  return state.metadata.get(getChunkKey(cx, cz));
}

export function setMetadataData(state: WorldState, cx: number, cz: number, data: Uint8Array): void {
  state.metadata.set(getChunkKey(cx, cz), data);
}

export function ensureMetadata(state: WorldState, cx: number, cz: number): Uint8Array {
  const key = getChunkKey(cx, cz);
  let metadata = state.metadata.get(key);
  if (metadata) return metadata;
  if (!state.columns.has(key)) state.chunks.set(key, new Uint8Array(COLUMN_VOLUME));
  metadata = state.metadata.get(key);
  if (!metadata) throw new Error(`Failed to create metadata view for ${key}`);
  return metadata;
}

export function getBlockAt(
  state: WorldState,
  cx: number,
  cz: number,
  lx: number,
  y: number,
  lz: number,
): number | undefined {
  if (y < MIN_Y || y > MAX_Y || lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE) return undefined;
  return state.columns.get(getChunkKey(cx, cz))?.getBlock(lx, y, lz);
}

export function setBlockAt(
  state: WorldState,
  cx: number,
  cz: number,
  lx: number,
  y: number,
  lz: number,
  value: number,
): boolean {
  const column = state.columns.get(getChunkKey(cx, cz));
  if (!column) return false;
  column.setBlock(lx, y, lz, value);
  return true;
}

export function getLightAt(
  state: WorldState,
  cx: number,
  cz: number,
  lx: number,
  y: number,
  lz: number,
): number | undefined {
  if (y < MIN_Y || y > MAX_Y) return undefined;
  return state.columns.get(getChunkKey(cx, cz))?.getLight(lx, y, lz);
}

export function setLightAt(
  state: WorldState,
  cx: number,
  cz: number,
  lx: number,
  y: number,
  lz: number,
  value: number,
): boolean {
  const column = state.columns.get(getChunkKey(cx, cz));
  if (!column) return false;
  column.setLight(lx, y, lz, value);
  return true;
}

export function getMetadataAt(
  state: WorldState,
  cx: number,
  cz: number,
  lx: numer,
  y: number,
  lz: number,
): number | undefined {
  if (y < MIN_Y || y > MAX_Y) return undefined;
  return state.columns.get(getChunkKey(cx, cz))?.getMetadata(lx, y, lz);
}

export function setMetadataAt(
  state: WorldState,
  cx: number,
  cz: number,
  lx: number,
  y: number,
  lz: number,
  value: number,
):
 boolean {
  const column = state.columns.get(getChunkKey(cx, cz));
  if (!column) return false;
  column.setMetadata(lx, y, lz, value);
  return true;
}

export function materializeChunkKind(
  state: WorldState,
  cx: number,
  cz: number,
  kind: ColumnArrayKind,
):
 Uint8Array | undefined {
  const column = state.columns.get(getChunkKey(cx, cz));
  return column ? materializeColumnArray(column, kind) : undefined;
}

export function materializeStorageArray(data: Uint8Array): Uint8Array {
  return materializeUint8Array(data);
}

export function allocatedArrayBytes(data: Uint8Array): number {
  return allocatedBytesOfArray(data);
}

export function allocatedWorldBytes(state: WorldState): number {
  let total = 0;
  for (const column of state.columns.values()) total += column.allocatedBytes;
  return total;
}

export function residentSectionCount(state: WorldState): number {
  let total = 0;
  for (const column of state.columns.values()) total += column.allocatedSectionCount;
  return total;
}

export function subscribe(state: WorldState, cx: number, cz: number, callback: ChunkUpdateCallback): () => void {
  const key = getChunkKey(cx, cz);
  if (!state.listeners.has(key)) state.listeners.set(key, new Set());
  state.listeners.get(key)?.add(callback);
  return () => {
    const set = state.listeners.get(key);
    if (!set) return;
    set.delete(callback);
    if (set.size === 0) state.listeners.delete(key);
  };
}

export function notifyChunk(state: WorldState, cx: number, cz: number): void {
  state.listeners.get(getChunkKey(cx, cz))?.forEach((callback) => callback());
}

export function evictChunk(state: WorldState, cx: number, cz: number): void {
  const key = getChunkKey(cx, cz);
  state.chunks.delete(key);
  state.listeners.delete(key);
}
