import { BlockType } from '../../../types';
import { MAX_Y, MIN_Y } from '../../../constants';
import { worldManager, type WorldManager } from '../../WorldManager';
import { WorldStorage } from '../WorldStorage';
import * as WorldStore from '../worldStore';
import { worldToChunk } from '../worldCoords';
import { materializeUint8Array } from './sectionedColumnMap';
import type { ChunkColumn } from './chunkColumn';
import { affectedSectionsForEdit, unpackSectionKey, type SectionKey } from './sectionDirty';
import type { WorldBlockEdit, WorldEditTransactionResult } from '../worldEditTransaction';

export interface WorldEditTransactionHandle {
  setBlock(x: number, y: number, z: number, type: BlockType, rotation?: number): void;
  commit(): WorldEditTransactionResult;
}

interface SectionWorldManager extends WorldManager {
  getChunkColumn(cx: number, cz: number): ChunkColumn | undefined;
  getResidentSectionCount(): number;
  getAllocatedWorldBytes(): number;
  beginWorldEditTransaction(): WorldEditTransactionHandle;
  setBlocksTransactional(edits: WorldBlockEdit[]): WorldEditTransactionResult;
  consumeDirtySectionKeys(): SectionKey[];
  getDirtySectionCount(): number;
}

interface ManagerInternals {
  state: Parameters<typeof WorldStore.allocatedWorldBytes>[0];
  postToPool(message: unknown): void;
  getBlock(x: number, y: number, z: number, autoGenerate?: boolean): BlockType;
  tryGetBlock(x: number, y: number, z: number): BlockType | null;
  getMetadata(x: number, y: number, z: number): number;
  getLight(x: number, y: number, z: number): { sky: number; block: number };
  getChunkData(cx: number, cz: number, autoGenerate?: boolean): Uint8Array | null;
  setBlock(x: number, y: number, z: number, type: BlockType, rotation?: number): unknown;
  setBlocks(edits: Array<{ x: number; y: number; z: number; type: BlockType; rotation?: number }>): void;
  updateLightingAround(x: number, y: number, z: number): void;
  queueMesh(cx: number, cz: number, priority: number): void;
  processStreamingJobs(): void;
}

interface PerformanceSample {
  rawChunkBytes: number;
  totalTrackedBytes: number;
  residentSections: number | null;
  dirtySections?: number;
  [key: string]: unknown;
}

interface PerformanceApi {
  sample(): PerformanceSample;
  [key: string]: unknown;
}

interface ActiveTransaction {
  depth: number;
  editCount: number;
  sectionKeys: Set<SectionKey>;
  chunkKeys: Set<string>;
  relightPoints: Array<{ x: number; y: number; z: number }>;
  meshPriorities: Map<string, number>;
  originalUpdateLighting: ManagerInternals['updateLightingAround'];
  originalQueueMesh: ManagerInternals['queueMesh'];
  originalProcessStreamingJobs: ManagerInternals['processStreamingJobs'];
  result: WorldEditTransactionResult | null;
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
  const originalSetBlock = manager.setBlock.bind(manager);
  const originalSetBlocks = manager.setBlocks.bind(manager);
  const originalSaveChunks = WorldStorage.saveChunks.bind(WorldStorage);
  const dirtySectionKeys = new Set<SectionKey>();
  let activeTransaction: ActiveTransaction | null = null;

  const markAffectedSections = (x: number, y: number, z: number): void => {
    if (y < MIN_Y || y > MAX_Y) return;
    for (const key of affectedSectionsForEdit(x, y, z)) {
      dirtySectionKeys.add(key);
      activeTransaction?.sectionKeys.add(key);
      const { cx, cz, sectionY } = unpackSectionKey(key);
      activeTransaction?.chunkKeys.add(`${cx},${cz}`);
      const section = WorldStore.getChunkColumn(manager.state, cx, cz)?.getSection(sectionY);
      if (section) {
        section.meshVersion += 1;
        section.dirty = true;
        section.renderState = 'queued';
      }
    }
  };

  const finishTransaction = (transaction: ActiveTransaction): WorldEditTransactionResult => {
    if (transaction.result) return transaction.result;
    transaction.depth -= 1;
    if (transaction.depth > 0) {
      return {
        editCount: transaction.editCount,
        sectionKeys: transaction.sectionKeys,
        chunkKeys: transaction.chunkKeys,
      };
    }

    manager.updateLightingAround = transaction.originalUpdateLighting;
    manager.queueMesh = transaction.originalQueueMesh;
    manager.processStreamingJobs = transaction.originalProcessStreamingJobs;
    activeTransaction = null;

    for (const point of transaction.relightPoints) {
      transaction.originalUpdateLighting(point.x, point.y, point.z);
    }
    for (const [key, priority] of transaction.meshPriorities) {
      const comma = key.indexOf(',');
      transaction.originalQueueMesh(Number(key.slice(0, comma)), Number(key.slice(comma + 1)), priority);
    }
    transaction.originalProcessStreamingJobs();

    transaction.result = {
      editCount: transaction.editCount,
      sectionKeys: transaction.sectionKeys,
      chunkKeys: transaction.chunkKeys,
    };
    return transaction.result;
  };

  const beginTransaction = (): WorldEditTransactionHandle => {
    if (activeTransaction) {
      activeTransaction.depth += 1;
      const nested = activeTransaction;
      let closed = false;
      return {
        setBlock: (x, y, z, type, rotation = 0) => manager.setBlock(x, y, z, type, rotation),
        commit: () => {
          if (closed) return nested.result ?? {
            editCount: nested.editCount,
            sectionKeys: nested.sectionKeys,
            chunkKeys: nested.chunkKeys,
          };
          closed = true;
          return finishTransaction(nested);
        },
      };
    }

    const transaction: ActiveTransaction = {
      depth: 1,
      editCount: 0,
      sectionKeys: new Set(),
      chunkKeys: new Set(),
      relightPoints: [],
      meshPriorities: new Map(),
      originalUpdateLighting: manager.updateLightingAround.bind(manager),
      originalQueueMesh: manager.queueMesh.bind(manager),
      originalProcessStreamingJobs: manager.processStreamingJobs.bind(manager),
      result: null,
    };
    activeTransaction = transaction;

    manager.updateLightingAround = (x, y, z) => {
      if (!transaction.relightPoints.some((point) =>
        Math.abs(point.x - x) <= 13 && Math.abs(point.y - y) <= 13 && Math.abs(point.z - z) <= 13
      )) transaction.relightPoints.push({ x, y, z });
    };
    manager.queueMesh = (cx, cz, priority) => {
      const key = `${cx},${cz}`;
      const previous = transaction.meshPriorities.get(key);
      if (previous === undefined || priority < previous) transaction.meshPriorities.set(key, priority);
    };
    manager.processStreamingJobs = () => undefined;

    let closed = false;
    return {
      setBlock: (x, y, z, type, rotation = 0) => manager.setBlock(x, y, z, type, rotation),
      commit: () => {
        if (closed) return transaction.result ?? {
          editCount: transaction.editCount,
          sectionKeys: transaction.sectionKeys,
          chunkKeys: transaction.chunkKeys,
        };
        closed = true;
        return finishTransaction(transaction);
      },
    };
  };

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

  manager.setBlock = (x, y, z, type, rotation = 0) => {
    const result = originalSetBlock(x, y, z, type, rotation);
    markAffectedSections(x, y, z);
    if (activeTransaction) activeTransaction.editCount += 1;
    return result;
  };

  manager.setBlocks = (edits) => {
    const result = originalSetBlocks(edits);
    for (const edit of edits) markAffectedSections(edit.x, edit.y, edit.z);
    return result;
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
  extended.beginWorldEditTransaction = beginTransaction;
  extended.setBlocksTransactional = (edits) => {
    const transaction = beginTransaction();
    try {
      for (const edit of edits) transaction.setBlock(edit.x, edit.y, edit.z, edit.type as BlockType, edit.rotation ?? 0);
    } catch (error) {
      transaction.commit();
      throw error;
    }
    return transaction.commit();
  };
  extended.consumeDirtySectionKeys = () => {
    const keys = [...dirtySectionKeys];
    dirtySectionKeys.clear();
    return keys;
  };
  extended.getDirtySectionCount = () => dirtySectionKeys.size;

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
          dirtySections: dirtySectionKeys.size,
          totalTrackedBytes: sample.totalTrackedBytes - sample.rawChunkBytes + rawChunkBytes,
        };
      };
    }
  }

  manager[INSTALL_MARK] = true;
  return extended;
};