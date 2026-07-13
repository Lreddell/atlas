import { BlockType } from '../../../types';
import { CHUNK_SIZE, MAX_Y, MIN_Y } from '../../../constants';
import { worldManager, type WorldManager } from '../../WorldManager';
import { WorldStorage } from '../WorldStorage';
import * as WorldStore from '../worldStore';
import { worldToChunk } from '../worldCoords';
import { materializeUint8Array } from './sectionedColumnMap';
import type { ChunkColumn } from './chunkColumn';

interface SectionWorldManager extends WorldManager {
  getChunkColumn(cx: number, cz: number): ChunkColumn | undefined;
  getResidentSectionCount(): number;
  getAllocatedWorldBytes(): number;
}

interface ManagerInternals {
  state: Parameters<typeof WorldStore.allocatedWorldBytes>[0];
  postToPool(message: unknown): void;
  getBlock(x: number, y: number, z: number, autoGenerate?: boolean): BlockType;
  tryGetBlock(x: number, y: number, z: number): BlockType | null;
  getMetadata(x: number, y: number, z: number): number;
  getLight(x: number, y: number, z: number): { sky: number; block: number };
  getChunkData(cx: number, cz: number, autoGenerate?: boolean): Uint8Array | null;
}

interface PerformanceSample {
  rawChunkBytes: number;
  totalTrackedBytes: number;
  residentSections: number | null;
  [key: string]: unknown;
}

interface PerformanceApi {
  sample(): PerformanceSample;
  [key: string]: unknown;
}

const INSTALL_MARK = Symbol.for('atlas.section-runtime-installed');

export const installSectionRuntime = (): SectionWorldManager => {
  const manager = worldManager as unknown as ManagerInternals & Record<PropertyKey, unknown>;
  if (manager[INSTALL_MARK]) return worldManager as SectionWorldManager;

  const originalGetBlock = manager.getBlock.bind(manager);
  const originalTryGetBlock = manager.tryGetBlock.bind(manager);
  const originalGetMetadata = manager.getMetadata.bind(manager);
  const originalGetLight = manager.getLight.bind(manager);
  const originalPostToPool = manager.postToPool.bind(manager);
  const originalSaveChunks = WorldStorage.saveChunks.bind(WorldStorage);

  manager.getBlock = (x, y, z, autoGenerate = true) => {
    if (y < MIN_Y || y > MAX_Y) return BlockType.AIR;
    const { cx, cz, lx, lz } = worldToChunk(x, z);
    const value = WorldStore.getBlockAt(manager.state, cx, cz, lx, y, lz);
    return value === undefined ? originalGetBlock(x, y, z, autoGenerate) : value as BlockType;
  };

  manager.tryGetBlock = (x, y, z) => {
    if (y < MIN_Y || y > MAX_Y) return BlockType.AIR;
    const { cx, cz, lx, lz } = worldToChunk(x, z);
    const value = WorldStore.getBlockAt(manager.state, cx, cz, lx, y, lz);
    return value === undefined ? originalTryGetBlock(x, y, z) : value as BlockType;
  };

  manager.getMetadata = (x, y, z) => {
    if (y < MIN_Y || y > MAX_Y) return 0;
    const { cx, cz, lx, lz } = worldToChunk(x, z);
    return WorldStore.getMetadataAt(manager.state, cx, cz, lx, y, lz) ?? originalGetMetadata(x, y, z);
  };

  manager.getLight = (x, y, z) => {
    if (y < MIN_Y || y > MAX_Y) return { sky: 15, block: 0 };
    const { cx, cz, lx, lz } = worldToChunk(x, z);
    const packed = WorldStore.getLightAt(manager.state, cx, cz, lx, y, lz);
    if (packed === undefined) return originalGetLight(x, y, z);
    return { sky: packed >> 4, block: packed & 0x0f };
  };

  manager.postToPool = (message: unknown) => {
    if (!message || typeof message !== 'object') {
      originalPostToPool(message);
      return;
    }
    const source = message as Record<string, unknown>;
    if (source.type !== 'MESH') {
      originalPostToPool(message);
      return;
    }
    const lights = source.lights as ({ center?: Uint8Array } & Record<string, unknown>) | undefined;
    originalPostToPool({
      ...source,
      chunk: source.chunk instanceof Uint8Array ? source.chunk : materializeUint8Array(source.chunk as Uint8Array),
      metaData: source.metaData ? materializeUint8Array(source.metaData as Uint8Array) : source.metaData,
      lights: lights ? { ...lights, center: lights.center ? materializeUint8Array(lights.center) : lights.center } : lights,
    });
  };

  WorldStorage.saveChunks = async (worldId, chunks) => originalSaveChunks(
    worldId,
    chunks.map((chunk) => ({
      ...chunk,
      blocks: materializeUint8Array(chunk.blocks),
      light: materializeUint8Array(chunk.light),
      meta: materializeUint8Array(chunk.meta),
    })),
  );

  const extended = manager as unknown as SectionWorldManager;
  extended.getChunkColumn = (cx, cz) => WorldStore.getChunkColumn(manager.state, cx, cz);
  extended.getResidentSectionCount = () => WorldStore.residentSectionCount(manager.state);
  extended.getAllocatedWorldBytes = () => WorldStore.allocatedWorldBytes(manager.state);

  if (typeof window !== 'undefined') {
    const api = (window as Window & { __ATLAS_PERFORMANCE__?: PerformanceApi }).__ATLAS_PERFORMANCE__;
    if (api) {
      const originalSample = api.sample.bind(api);
      api.sample = () => {
        const sample = originalSample();
        const rawChunkBytes = WorldStore.allocatedWorldBytes(manager.state);
        return {
          ...sample,
          rawChunkBytes,
          residentSections: WorldStore.residentSectionCount(manager.state),
          totalTrackedBytes: sample.totalTrackedBytes - sample.rawChunkBytes + rawChunkBytes,
        };
      };
    }
  }

  manager[INSTALL_MARK] = true;
  return extended;
};
