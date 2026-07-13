import { worldManager } from '../WorldManager';
import { GenConfig } from './genConfig';
import * as WorldCoords from './worldCoords';
import type { GeometryResult } from './geometry';
import {
  RAW_BYTES_PER_CHUNK,
  byteLengthOfGeometryResult,
  estimateTransferBytes,
  getDefaultStreamingBudget,
  type StreamingBudget,
} from './streamingBudget';
import { EvictionQueue } from './streamingEviction';
import { StreamingGuardState, type StreamingAssignment } from './streamingGuardState';
import { summarizeFrameTimes } from './streamingMetrics';
import {
  getRetryDelayMs,
  type WorkerJobErrorMessage,
  type WorkerJobType,
  type WorkerPongMessage,
} from './workers/streamingProtocol';

const CHUNK_STAGE_EMPTY = 0;
const CHUNK_STAGE_GENERATED = 3;
const CHUNK_STAGE_READY = 6;
const HEARTBEAT_INTERVAL_MS = 5000;
const HEARTBEAT_TIMEOUT_MS = 15000;
const NORMAL_EVICTION_BUDGET_MS = 1.5;
const PRESSURE_EVICTION_BUDGET_MS = 4;
const NORMAL_EVICTIONS_PER_PUMP = 32;
const PRESSURE_EVICTIONS_PER_PUMP = 128;
const MAX_HISTORY_SAMPLES = 600;
const MAX_FRAME_SAMPLES = 3600;

interface GeometryResultWithReleaseMarker extends GeometryResult {
  __atlasReleased?: boolean;
}

interface ManagerInternals {
  state: {
    chunks: Map<string, Uint8Array>;
    lights: Map<string, Uint8Array>;
    metadata: Map<string, Uint8Array>;
  };
  chunkStages: Map<string, number>;
  meshCache: Map<string, GeometryResultWithReleaseMarker>;
  meshSubscribers: Map<string, Set<(geo: GeometryResult | null) => void>>;
  desiredChunkKeys: Set<string>;
  desiredCenter: { cx: number; cz: number };
  workers: Worker[];
  nextWorkerIndex: number;
  workersEnabled: boolean;
  workerStatusMessage: string;
  MAX_GEN_IN_FLIGHT: number;
  MAX_MESH_IN_FLIGHT: number;
  inFlightGen: number;
  inFlightMesh: number;
  activeGenTickets: Map<string, number>;
  activeMeshTickets: Map<string, number>;
  genStartedAt: Map<string, number>;
  meshStartedAt: Map<string, number>;
  dirtyChunks: Set<string>;
  activeSeed: number;
  activeWorldId: string | null;
  handleWorkerMessage: (data: unknown) => void;
  postToPool: (message: unknown) => void;
  initWorkers: () => void;
  terminateWorkers: () => void;
  setDesiredChunks: (chunks: Array<{ cx: number; cz: number }>) => void;
  processStreamingJobs: () => void;
  setWorldContext: (worldId: string, seedNum: number) => void;
  reset: () => void;
  setWorkersEnabled: (value: boolean) => void;
  subscribeMesh: (
    cx: number,
    cz: number,
    callback: (geo: GeometryResult | null) => void,
  ) => () => void;
  setStage: (cx: number, cz: number, stage: number) => void;
  queueGen: (cx: number, cz: number, priority: number) => void;
  queueMesh: (cx: number, cz: number, priority: number) => void;
  scheduleStreamingPump: () => void;
  evict: (cx: number, cz: number) => boolean;
  forceSave: () => Promise<void>;
  log: (message: string, type: 'info' | 'error' | 'success') => void;
}

export interface StreamingDiagnosticsSnapshot {
  timestamp: number;
  requestedDesiredChunks: number;
  effectiveDesiredChunks: number;
  residentChunks: number;
  residentLights: number;
  residentMetadata: number;
  rawChunkBytes: number;
  cachedMeshBytes: number;
  rendererOwnedMeshBytes: number;
  estimatedGpuMeshBytes: number;
  workerInFlightBytes: number;
  dirtyResidentBytes: number;
  managedJsBytes: number;
  softBudgetBytes: number;
  hardBudgetBytes: number;
  maxResidentChunks: number;
  evictionBacklog: number;
  inFlightGeneration: number;
  inFlightMeshing: number;
  workerCount: number;
  workerRestarts: number;
  workerJobErrors: number;
  allocationErrors: number;
  staleResultsDiscarded: number;
  budgetClamped: boolean;
  pressure: 'normal' | 'soft' | 'hard';
  frameSamples: number;
  averageFrameMs: number;
  frameP50Ms: number;
  frameP95Ms: number;
  frameP99Ms: number;
  framesOver25Ms: number;
  framesOver50Ms: number;
  framesOver100Ms: number;
}

const emptyAttributes = () => ({
  positions: new Float32Array(0),
  normals: new Float32Array(0),
  uvs: new Float32Array(0),
  colors: new Float32Array(0),
  indices: new Uint32Array(0),
});

const RELEASED_MESH_SENTINEL: GeometryResultWithReleaseMarker = Object.freeze({
  opaque: emptyAttributes(),
  cutout: emptyAttributes(),
  transparent: emptyAttributes(),
  __atlasReleased: true,
});

const parseChunkKey = (key: string): { cx: number; cz: number } | null => {
  const comma = key.indexOf(',');
  if (comma <= 0 || comma >= key.length - 1) return null;
  const cx = Number(key.slice(0, comma));
  const cz = Number(key.slice(comma + 1));
  if (!Number.isFinite(cx) || !Number.isFinite(cz)) return null;
  return { cx, cz };
};

const sumMapBytes = (map: Map<string, Uint8Array>): number => {
  let total = 0;
  for (const value of map.values()) total += value.byteLength;
  return total;
};

const detectMobile = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
};

const readBudgetOverride = (fallback: StreamingBudget): StreamingBudget => {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem('atlas.performance.streamingBudgetMiB');
    const hardMiB = raw == null ? NaN : Number(raw);
    if (!Number.isFinite(hardMiB) || hardMiB < 192) return fallback;
    const hardBytes = Math.floor(hardMiB * 1024 * 1024);
    return {
      ...fallback,
      hardBytes,
      softBytes: Math.floor(hardBytes * 0.75),
      maxResidentChunks: Math.max(
        fallback.protectedMinimum,
        Math.floor((hardBytes * 0.65) / RAW_BYTES_PER_CHUNK),
      ),
    };
  } catch {
    return fallback;
  }
};

const isReleasedMesh = (value: GeometryResultWithReleaseMarker | undefined): boolean =>
  value?.__atlasReleased === true;

const installStreamingGuards = (): void => {
  if (typeof window === 'undefined' || typeof Worker === 'undefined') return;

  const manager = worldManager as unknown as ManagerInternals;
  const installedKey = '__atlasStreamingGuardsInstalled';
  if ((manager as unknown as Record<string, unknown>)[installedKey]) return;
  (manager as unknown as Record<string, unknown>)[installedKey] = true;

  const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const budget = readBudgetOverride(getDefaultStreamingBudget(deviceMemory, detectMobile()));
  const guardState = new StreamingGuardState();
  const evictionQueue = new EvictionQueue();
  const coordinateCache = new Map<string, { cx: number; cz: number }>();
  const rendererOwnedMeshBytes = new Map<string, number>();
  const heartbeatAt = new Map<number, number>();
  const restartingWorkers = new Set<number>();
  const history: StreamingDiagnosticsSnapshot[] = [];
  const frameTimes: number[] = [];
  let lastFrameAt = performance.now();
  let captureStartedAt = Date.now();

  let requestedDesiredChunks = 0;
  let effectiveDesiredChunks = 0;
  let budgetClamped = false;
  let workerRestarts = 0;
  let workerJobErrors = 0;
  let allocationErrors = 0;
  let staleResultsDiscarded = 0;
  let saveRequestedForEviction = false;

  const baseGenerationConcurrency = Math.max(1, manager.MAX_GEN_IN_FLIGHT);
  const baseMeshConcurrency = Math.max(1, manager.MAX_MESH_IN_FLIGHT);

  const originals = {
    handleWorkerMessage: manager.handleWorkerMessage.bind(manager),
    postToPool: manager.postToPool.bind(manager),
    setDesiredChunks: manager.setDesiredChunks.bind(manager),
    processStreamingJobs: manager.processStreamingJobs.bind(manager),
    setWorldContext: manager.setWorldContext.bind(manager),
    reset: manager.reset.bind(manager),
    subscribeMesh: manager.subscribeMesh.bind(manager),
  };

  const getCoords = (key: string): { cx: number; cz: number } | null => {
    const cached = coordinateCache.get(key);
    if (cached) return cached;
    const parsed = parseChunkKey(key);
    if (parsed) coordinateCache.set(key, parsed);
    return parsed;
  };

  const getPriority = (cx: number, cz: number): number => {
    const dx = cx - manager.desiredCenter.cx;
    const dz = cz - manager.desiredCenter.cz;
    return dx * dx + dz * dz;
  };

  const releaseTicket = (assignment: StreamingAssignment): boolean => {
    const key = WorldCoords.getChunkKey(assignment.cx, assignment.cz);
    if (assignment.jobType === 'GEN') {
      if (manager.activeGenTickets.get(key) !== assignment.ticket) return false;
      manager.activeGenTickets.delete(key);
      manager.genStartedAt.delete(key);
      manager.inFlightGen = Math.max(0, manager.inFlightGen - 1);
      return true;
    }

    if (manager.activeMeshTickets.get(key) !== assignment.ticket) return false;
    manager.activeMeshTickets.delete(key);
    manager.meshStartedAt.delete(key);
    manager.inFlightMesh = Math.max(0, manager.inFlightMesh - 1);
    return true;
  };

  const requeueAssignment = (assignment: StreamingAssignment, attempt: number): void => {
    const key = WorldCoords.getChunkKey(assignment.cx, assignment.cz);
    const delay = getRetryDelayMs(attempt);
    window.setTimeout(() => {
      if (!guardState.isDesired(key)) return;
      const priority = getPriority(assignment.cx, assignment.cz);
      if (assignment.jobType === 'GEN') {
        manager.setStage(assignment.cx, assignment.cz, CHUNK_STAGE_EMPTY);
        manager.queueGen(assignment.cx, assignment.cz, priority);
      } else {
        manager.setStage(assignment.cx, assignment.cz, CHUNK_STAGE_GENERATED);
        manager.queueMesh(assignment.cx, assignment.cz, priority);
      }
      manager.scheduleStreamingPump();
    }, delay);
  };

  const handleAssignmentFailure = (
    assignment: StreamingAssignment,
    allocationRelated: boolean,
  ): void => {
    releaseTicket(assignment);
    const attempt = guardState.recordFailure(assignment.jobType, assignment.cx, assignment.cz);
    if (allocationRelated) {
      allocationErrors += 1;
      manager.MAX_GEN_IN_FLIGHT = 1;
      manager.MAX_MESH_IN_FLIGHT = 1;
    }
    requeueAssignment(assignment, attempt);
  };

  const createWorker = (workerId: number): Worker => {
    const worker = new Worker(new URL('./workers/world.worker.ts', import.meta.url), { type: 'module' });
    heartbeatAt.set(workerId, performance.now());
    worker.onmessage = (event) => manager.handleWorkerMessage(event.data);
    worker.onerror = (event) => {
      event.preventDefault?.();
      void restartWorker(workerId, event.message || 'Uncaught worker error');
    };
    worker.postMessage({ type: 'SET_SEED', seed: manager.activeSeed });
    worker.postMessage({ type: 'SET_GEN_CONFIG', config: JSON.parse(JSON.stringify(GenConfig)) });
    return worker;
  };

  const restartWorker = async (workerId: number, reason: string): Promise<void> => {
    if (restartingWorkers.has(workerId)) return;
    restartingWorkers.add(workerId);

    const assignments = guardState.assignmentsForWorker(workerId);
    for (const assignment of assignments) {
      guardState.complete(assignment.jobType, assignment.cx, assignment.cz, assignment.ticket);
      handleAssignmentFailure(assignment, /alloc|memory|array buffer/i.test(reason));
    }

    try {
      manager.workers[workerId]?.terminate();
      manager.workers[workerId] = createWorker(workerId);
      workerRestarts += 1;
      manager.workerStatusMessage = `Workers Active (${manager.workers.filter(Boolean).length}), restarts ${workerRestarts}`;
      manager.log(`World worker ${workerId + 1} restarted after an isolated failure.`, 'error');
    } catch (error) {
      console.error(`[WorldManager] Failed to restart worker ${workerId}`, error);
      manager.workerStatusMessage = 'Worker recovery pending';
      window.setTimeout(() => void restartWorker(workerId, 'restart retry'), 1000);
    } finally {
      restartingWorkers.delete(workerId);
    }
  };

  const attachExistingWorkers = (): void => {
    manager.workers.forEach((worker, workerId) => {
      heartbeatAt.set(workerId, performance.now());
      worker.onmessage = (event) => manager.handleWorkerMessage(event.data);
      worker.onerror = (event) => {
        event.preventDefault?.();
        void restartWorker(workerId, event.message || 'Uncaught worker error');
      };
    });
  };

  const ensureWorkerPool = (): boolean => {
    manager.workersEnabled = true;
    if (manager.workers.length > 0) return true;
    try {
      manager.initWorkers();
      return manager.workers.length > 0;
    } catch (error) {
      console.error('[WorldManager] Worker pool unavailable; streaming paused instead of falling back to the main thread.', error);
      manager.workerStatusMessage = 'Workers unavailable, streaming paused';
      return false;
    }
  };

  const estimateSnapshot = (): StreamingDiagnosticsSnapshot => {
    const blocksBytes = sumMapBytes(manager.state.chunks);
    const lightsBytes = sumMapBytes(manager.state.lights);
    const metadataBytes = sumMapBytes(manager.state.metadata);
    const rawChunkBytes = blocksBytes + lightsBytes + metadataBytes;

    let cachedMeshBytes = 0;
    for (const mesh of manager.meshCache.values()) {
      if (!isReleasedMesh(mesh)) cachedMeshBytes += byteLengthOfGeometryResult(mesh);
    }

    let ownedMeshBytes = 0;
    for (const bytes of rendererOwnedMeshBytes.values()) ownedMeshBytes += bytes;

    const workerInFlightBytes = guardState.inFlightBytes;
    const dirtyResidentBytes = manager.dirtyChunks.size * RAW_BYTES_PER_CHUNK;
    const managedJsBytes = rawChunkBytes + cachedMeshBytes + ownedMeshBytes + workerInFlightBytes;
    const pressure = managedJsBytes >= budget.hardBytes
      ? 'hard'
      : managedJsBytes >= budget.softBytes
        ? 'soft'
        : 'normal';

    const frameSummary = summarizeFrameTimes(frameTimes);

    return {
      timestamp: Date.now(),
      requestedDesiredChunks,
      effectiveDesiredChunks,
      residentChunks: manager.state.chunks.size,
      residentLights: manager.state.lights.size,
      residentMetadata: manager.state.metadata.size,
      rawChunkBytes,
      cachedMeshBytes,
      rendererOwnedMeshBytes: ownedMeshBytes,
      estimatedGpuMeshBytes: ownedMeshBytes,
      workerInFlightBytes,
      dirtyResidentBytes,
      managedJsBytes,
      softBudgetBytes: budget.softBytes,
      hardBudgetBytes: budget.hardBytes,
      maxResidentChunks: budget.maxResidentChunks,
      evictionBacklog: evictionQueue.size,
      inFlightGeneration: manager.inFlightGen,
      inFlightMeshing: manager.inFlightMesh,
      workerCount: manager.workers.length,
      workerRestarts,
      workerJobErrors,
      allocationErrors,
      staleResultsDiscarded,
      budgetClamped,
      pressure,
      frameSamples: frameSummary.samples,
      averageFrameMs: frameSummary.averageMs,
      frameP50Ms: frameSummary.p50Ms,
      frameP95Ms: frameSummary.p95Ms,
      frameP99Ms: frameSummary.p99Ms,
      framesOver25Ms: frameSummary.framesOver25Ms,
      framesOver50Ms: frameSummary.framesOver50Ms,
      framesOver100Ms: frameSummary.framesOver100Ms,
    };
  };

  const applyPressurePolicy = (snapshot: StreamingDiagnosticsSnapshot): void => {
    if (snapshot.pressure === 'hard') {
      manager.MAX_GEN_IN_FLIGHT = 1;
      manager.MAX_MESH_IN_FLIGHT = 1;
      return;
    }
    if (snapshot.pressure === 'soft') {
      manager.MAX_GEN_IN_FLIGHT = Math.min(baseGenerationConcurrency, 2);
      manager.MAX_MESH_IN_FLIGHT = 1;
      return;
    }
    manager.MAX_GEN_IN_FLIGHT = baseGenerationConcurrency;
    manager.MAX_MESH_IN_FLIGHT = baseMeshConcurrency;
  };

  const enqueueEvictions = (): void => {
    let maxDesiredDistSq = 0;
    for (const key of manager.desiredChunkKeys) {
      const coords = getCoords(key);
      if (!coords) continue;
      const distSq = getPriority(coords.cx, coords.cz);
      if (distSq > maxDesiredDistSq) maxDesiredDistSq = distSq;
      evictionQueue.remove(key);
    }

    const retentionRadius = Math.sqrt(maxDesiredDistSq) + 2;
    const retentionRadiusSq = retentionRadius * retentionRadius;
    for (const key of manager.chunkStages.keys()) {
      if (manager.desiredChunkKeys.has(key)) continue;
      const coords = getCoords(key);
      if (!coords) continue;
      const distSq = getPriority(coords.cx, coords.cz);
      if (distSq <= retentionRadiusSq) continue;
      evictionQueue.upsert({ key, cx: coords.cx, cz: coords.cz, distSq });
    }
  };

  const drainEvictions = (pressure: StreamingDiagnosticsSnapshot['pressure']): void => {
    const start = performance.now();
    const budgetMs = pressure === 'normal' ? NORMAL_EVICTION_BUDGET_MS : PRESSURE_EVICTION_BUDGET_MS;
    const maxCount = pressure === 'normal' ? NORMAL_EVICTIONS_PER_PUMP : PRESSURE_EVICTIONS_PER_PUMP;
    let count = 0;
    let deferredDirty = false;

    while (count < maxCount && performance.now() - start < budgetMs) {
      const candidate = evictionQueue.pop();
      if (!candidate) break;
      if (manager.desiredChunkKeys.has(candidate.key)) continue;

      if (manager.evict(candidate.cx, candidate.cz)) {
        rendererOwnedMeshBytes.delete(candidate.key);
        coordinateCache.delete(candidate.key);
        count += 1;
      } else {
        deferredDirty = true;
        evictionQueue.upsert({ ...candidate, attempts: (candidate.attempts ?? 0) + 1 });
        break;
      }
    }

    if (deferredDirty && !saveRequestedForEviction && manager.activeWorldId) {
      saveRequestedForEviction = true;
      void manager.forceSave().finally(() => {
        saveRequestedForEviction = false;
        manager.scheduleStreamingPump();
      });
    }
  };

  manager.handleWorkerMessage = (data: unknown): void => {
    if (!data || typeof data !== 'object') {
      originals.handleWorkerMessage(data);
      return;
    }

    const message = data as Record<string, unknown>;
    const type = message.type;

    if (type === 'PONG') {
      const pong = message as unknown as WorkerPongMessage;
      heartbeatAt.set(pong.workerId, performance.now());
      return;
    }

    if (type === 'JOB_ERROR') {
      const error = message as unknown as WorkerJobErrorMessage;
      workerJobErrors += 1;
      const assignment = guardState.complete(error.jobType, error.cx, error.cz, error.ticket);
      if (assignment) handleAssignmentFailure(assignment, error.allocationRelated);
      const failedWorkerId = error.workerId ?? -1;
      console.error(
        `[WorldWorker ${failedWorkerId}] ${error.jobType} ${error.cx},${error.cz} failed: ${error.errorName}: ${error.errorMessage}`,
      );
      if (error.allocationRelated && failedWorkerId >= 0) {
        void restartWorker(failedWorkerId, error.errorMessage);
      }
      return;
    }

    if (type !== 'GEN_DONE' && type !== 'MESH_DONE') {
      originals.handleWorkerMessage(data);
      return;
    }

    const jobType: WorkerJobType = type === 'GEN_DONE' ? 'GEN' : 'MESH';
    const cx = Number(message.cx);
    const cz = Number(message.cz);
    const ticket = Number(message.ticket);
    const key = WorldCoords.getChunkKey(cx, cz);
    const completedAssignment = guardState.complete(jobType, cx, cz, ticket);

    const messageWorldSession = typeof message.worldSessionId === 'number' ? message.worldSessionId : undefined;
    if (messageWorldSession !== undefined && messageWorldSession !== guardState.worldSessionId) {
      if (completedAssignment) releaseTicket(completedAssignment);
      staleResultsDiscarded += 1;
      return;
    }

    if (!guardState.isDesired(key) && message.workerId !== undefined) {
      const assignment: StreamingAssignment = completedAssignment ?? {
        workerId: Number(message.workerId),
        jobType,
        cx,
        cz,
        ticket,
        inputBytes: Number(message.jobInputBytes) || 0,
      };
      releaseTicket(assignment);
      manager.setStage(cx, cz, jobType === 'GEN' ? CHUNK_STAGE_EMPTY : CHUNK_STAGE_GENERATED);
      staleResultsDiscarded += 1;
      return;
    }

    originals.handleWorkerMessage(data);
    guardState.recordSuccess(jobType, cx, cz);
  };

  manager.postToPool = (message: unknown): void => {
    if (!ensureWorkerPool()) return;
    if (!message || typeof message !== 'object') {
      originals.postToPool(message);
      return;
    }

    const payload = message as Record<string, unknown>;
    const type = payload.type;
    if (type !== 'GEN' && type !== 'MESH') {
      originals.postToPool(message);
      return;
    }

    const workerId = manager.nextWorkerIndex % manager.workers.length;
    manager.nextWorkerIndex = (manager.nextWorkerIndex + 1) % manager.workers.length;
    const worker = manager.workers[workerId];
    const cx = Number(payload.cx);
    const cz = Number(payload.cz);
    const ticket = Number(payload.ticket);
    const inputBytes = estimateTransferBytes(payload);

    guardState.assign({
      workerId,
      jobType: type,
      cx,
      cz,
      ticket,
      inputBytes,
    });

    try {
      worker.postMessage({
        ...payload,
        workerId,
        worldSessionId: guardState.worldSessionId,
        desiredEpoch: guardState.desiredEpoch,
        jobInputBytes: inputBytes,
      });
    } catch (error) {
      const assignment = guardState.complete(type, cx, cz, ticket);
      if (assignment) handleAssignmentFailure(assignment, /alloc|memory|array buffer/i.test(String(error)));
      void restartWorker(workerId, error instanceof Error ? error.message : String(error));
    }
  };

  manager.initWorkers = (): void => {
    if (manager.workers.length > 0) return;
    const cores = navigator.hardwareConcurrency || 4;
    const poolSize = Math.min(4, Math.max(2, Math.floor(cores / 2)));
    manager.workersEnabled = true;
    manager.workers = [];
    manager.nextWorkerIndex = 0;

    for (let workerId = 0; workerId < poolSize; workerId += 1) {
      manager.workers.push(createWorker(workerId));
    }
    manager.workerStatusMessage = `Workers Active (${manager.workers.length})`;
  };

  manager.setWorkersEnabled = (value: boolean): void => {
    if (!value) {
      manager.log('Chunk workers are required for crash-safe streaming and remain enabled.', 'info');
    }
    manager.workersEnabled = true;
    ensureWorkerPool();
    manager.scheduleStreamingPump();
  };

  manager.setWorldContext = (worldId: string, seedNum: number): void => {
    guardState.beginWorldSession();
    evictionQueue.clear();
    coordinateCache.clear();
    rendererOwnedMeshBytes.clear();
    originals.setWorldContext(worldId, seedNum);
  };

  manager.reset = (): void => {
    guardState.beginWorldSession();
    evictionQueue.clear();
    coordinateCache.clear();
    rendererOwnedMeshBytes.clear();
    originals.reset();
    manager.workersEnabled = true;
    attachExistingWorkers();
  };

  manager.setDesiredChunks = (chunks: Array<{ cx: number; cz: number }>): void => {
    requestedDesiredChunks = chunks.length;
    const limited = chunks.length > budget.maxResidentChunks
      ? chunks.slice(0, budget.maxResidentChunks)
      : chunks;
    effectiveDesiredChunks = limited.length;
    budgetClamped = limited.length !== chunks.length;

    const keys = limited.map(({ cx, cz }) => {
      const key = WorldCoords.getChunkKey(cx, cz);
      coordinateCache.set(key, { cx, cz });
      return key;
    });
    guardState.updateDesired(keys);
    originals.setDesiredChunks(limited);
    enqueueEvictions();

    const snapshot = estimateSnapshot();
    applyPressurePolicy(snapshot);
    drainEvictions(snapshot.pressure);
  };

  manager.processStreamingJobs = (): void => {
    if (!ensureWorkerPool()) return;
    const before = estimateSnapshot();
    applyPressurePolicy(before);
    drainEvictions(before.pressure);
    originals.processStreamingJobs();
    const after = estimateSnapshot();
    if (after.pressure !== 'normal' || manager.state.chunks.size > budget.maxResidentChunks) {
      enqueueEvictions();
      drainEvictions(after.pressure === 'normal' ? 'soft' : after.pressure);
    }
  };

  manager.subscribeMesh = (
    cx: number,
    cz: number,
    callback: (geo: GeometryResult | null) => void,
  ): (() => void) => {
    const key = WorldCoords.getChunkKey(cx, cz);
    coordinateCache.set(key, { cx, cz });

    const wrapped = (geo: GeometryResult | null): void => {
      if (!geo || isReleasedMesh(geo as GeometryResultWithReleaseMarker)) return;
      const bytes = byteLengthOfGeometryResult(geo);
      rendererOwnedMeshBytes.set(key, bytes);
      callback(geo);

      queueMicrotask(() => {
        if (manager.meshCache.get(key) === geo) manager.meshCache.set(key, RELEASED_MESH_SENTINEL);
      });
    };

    const unsubscribe = originals.subscribeMesh(cx, cz, wrapped);
    const current = manager.meshCache.get(key);
    if (isReleasedMesh(current) && manager.chunkStages.get(key) === CHUNK_STAGE_READY) {
      manager.setStage(cx, cz, CHUNK_STAGE_GENERATED);
      manager.queueMesh(cx, cz, getPriority(cx, cz));
      manager.scheduleStreamingPump();
    }

    return () => {
      unsubscribe();
      if (!manager.meshSubscribers.get(key)?.size) rendererOwnedMeshBytes.delete(key);
    };
  };

  attachExistingWorkers();
  manager.workersEnabled = true;
  ensureWorkerPool();
  guardState.beginWorldSession();

  const sampleFrame = (now: number): void => {
    if (document.visibilityState === 'visible') {
      const delta = now - lastFrameAt;
      if (delta > 0 && delta < 1000) {
        frameTimes.push(delta);
        if (frameTimes.length > MAX_FRAME_SAMPLES) frameTimes.shift();
      }
    }
    lastFrameAt = now;
    window.requestAnimationFrame(sampleFrame);
  };
  window.requestAnimationFrame(sampleFrame);

  window.setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    const now = performance.now();
    manager.workers.forEach((worker, workerId) => {
      const last = heartbeatAt.get(workerId) ?? now;
      if (now - last > HEARTBEAT_TIMEOUT_MS) {
        void restartWorker(workerId, 'heartbeat timeout');
        return;
      }
      worker.postMessage({ type: 'PING', workerId, sentAt: Date.now() });
    });
  }, HEARTBEAT_INTERVAL_MS);

  window.setInterval(() => {
    const snapshot = estimateSnapshot();
    history.push(snapshot);
    if (history.length > MAX_HISTORY_SAMPLES) history.shift();
  }, 1000);

  const buildCapture = () => ({
    schemaVersion: 1,
    startedAt: captureStartedAt,
    endedAt: Date.now(),
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    viewport: { width: window.innerWidth, height: window.innerHeight, pixelRatio: window.devicePixelRatio },
    budget: { ...budget },
    latest: estimateSnapshot(),
    samples: history.slice(),
  });

  (window as unknown as Record<string, unknown>).__ATLAS_PERF__ = {
    snapshot: estimateSnapshot,
    history: () => history.slice(),
    budget: { ...budget },
    resetCapture: () => {
      history.length = 0;
      frameTimes.length = 0;
      captureStartedAt = Date.now();
      lastFrameAt = performance.now();
    },
    capture: buildCapture,
    downloadCapture: (label = 'atlas-performance') => {
      const blob = new Blob([JSON.stringify(buildCapture(), null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${label}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    },
    forceEviction: () => {
      enqueueEvictions();
      drainEvictions('hard');
      return estimateSnapshot();
    },
  };
};

installStreamingGuards();
