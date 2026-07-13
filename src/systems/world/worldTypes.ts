import type { ItemStack } from '../../types';
import type { ChunkColumn } from './sections/chunkColumn';
import { createSectionedColumnMaps } from './sections/sectionedColumnMap';

export type ChunkUpdateCallback = () => void;

export interface FurnaceState {
  input: ItemStack | null;
  fuel: ItemStack | null;
  output: ItemStack | null;
  burnTime: number;
  maxBurnTime: number;
  cookTime: number;
  maxCookTime: number;
  lastUpdate: number;
}

export interface ChestState {
  items: (ItemStack | null)[];
}

export interface WorldState {
  columns: Map<string, ChunkColumn>;
  chunks: Map<string, Uint8Array>;
  lights: Map<string, Uint8Array>;
  metadata: Map<string, Uint8Array>;
  listeners: Map<string, Set<ChunkUpdateCallback>>;
  furnaces: Map<string, FurnaceState>;
  chests: Map<string, ChestState>;
  time: number;
}

export const createWorldState = (): WorldState => {
  const legacyColumns = !!(globalThis as typeof globalThis & { __ATLAS_LEGACY_COLUMNS__?: boolean }).__ATLAS_LEGACY_COLUMNS__;
  if (legacyColumns) {
    return {
      columns: new Map(),
      chunks: new Map(),
      lights: new Map(),
      metadata: new Map(),
      listeners: new Map(),
      furnaces: new Map(),
      chests: new Map(),
      time: 1000,
    };
  }
  const sectioned = createSectionedColumnMaps();
  return {
    columns: sectioned.columns,
    chunks: sectioned.chunks as unknown as Map<string, Uint8Array>,
    lights: sectioned.lights as unknown as Map<string, Uint8Array>,
    metadata: sectioned.metadata as unknown as Map<string, Uint8Array>,
    listeners: new Map(),
    furnaces: new Map(),
    chests: new Map(),
    time: 1000,
  };
};
