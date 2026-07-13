import { worldManager, type WorldManager } from "../WorldManager";
import type { GeometryResult } from "../world/geometry";
import { GenConfig } from "../world/genConfig";
import { WORKERS_ENABLED } from "../../constants";
import {
  extractNeighborBorders,
  type NeighborBorderMap,
} from "../world/workers/neighborBorders";
import {
  MIB,
  RAW_CHUNK_BYTES,
  capDesiredChunks,
  compactQueuedChunkJobs,
  chunkKey,
  distanceSquared,
  drainEvictionQueue,
  estimateTransferBytes,
  isCurrentStreamingResult,
  residentChunkCapacity,
  selectAffinityWorker,
  totalBudgetBytes,
  workerRestartDelayMs,
  type BudgetSnapshot,
  type ChunkCoord,
} from "./streamingSafetyCore";

type JobType = "GEN" | "MESH";
type ChunkStageValue = 0 | 1 | 2 | 3 | 4 | 5 | 6;

interface WorkerJobEnvelope {
  type: JobType;
  id?: string;
  cx: number;
  cz: number;
  ticket: number;
  [key: string]: unknown;
}

interface WorkerResultEnvelope {
  type: "GEN_DONE" | "MESH_DONE" | "JOB_ERROR" | "HEARTBEAT";
  jobType?: JobType;
  cx?: number;
  cz?: number;
  ticket?: number;
  worldSessionId?: number;
  desiredEpoch?: number;
  dataVersion?: number;
  uniqueTicket?: string;
  workerId?: number;
  inputByteCount?: number;
  jobDurationMs?: number;
  allocationRelated?: boolean;
  errorName?: string;
  errorMessage?: string;
  result?: unknown;
  scratchCapacities?: {
    neighborCacheBytes?: number;
    geometryScratchBytes?: number;
    generationScratchBytes?: number;
  };
}

interface JobRecord {
  type: JobType;
  key: string;
  cx: number;
  cz: number;
  ticket: number;
  uniqueTicket: string;
  worldSessionId: number;
  desiredEpoch: number;
  dataVersion: number;
  inputByteCount: number;
  workerId: number;
  startedAt: number;
}

interface WorkerHealth {
  id: number;
  healthy: boolean;
  lastHeartbeatAt: number;
  restartCount: number;
  consecutiveFailures: number;
  backoffUntil: number;
}

interface RendererInfoLike {
  render: { calls: number; triangles: number; points: number; lines: number };
  memory: { geometries: number; textures: number };
}

interface RendererLike {
  info: RendererInfoLike;
}

interface WorldStateLike {
  chunks: Map<string, Uint8Array>;
  lights: Map<string, Uint8Array>;
  metadata: Map<string, Uint8Array>;
}

interface WorldManagerInternals {
  state: WorldStateLike;
  chunkStages: Map<string, ChunkStageValue>;
  meshCache: Map<string, GeometryResult>;
  meshSubscribers: Map<string, Set<(geo: GeometryResult | null) => void>>;
  desiredChunkKeys: Set<string>;
  desiredCenter: ChunkCoord;
  workers: Worker[];
  workersEnabled: boolean;
  workerStatusMessage: string;
  nextWorkerIndex: number;
  activeWorldId: string | null;
  activeSeed: number;
  inFlightGen: number;
  inFlightMesh: number;
  MAX_GEN_IN_FLIGHT: number;
  MAX_MESH_IN_FLIGHT: number;
  genQueue: {
    length: number;
    _data: Array<{ cx: number; cz: number; priority: number } | undefined>;
    _head: number;
  };
  meshQueue: {
    length: number;
    _data: Array<{ cx: number; cz: number; priority: number } | undefined>;
    _head: number;
  };
  queuedGenKeys: Set<string>;
  queuedMeshKeys: Set<string>;
  activeGenTickets: Map<string, number>;
  activeMeshTickets: Map<string, number>;
  genStartedAt: Map<string, number>;
  meshStartedAt: Map<string, number>;
  dirtyChunks: Set<string>;
  saving: boolean;
  initWorkers(): void;
  terminateWorkers(): void;
  syncWorkerWorldGenState(): void;
  postToPool(message: unknown): void;
  handleWorkerMessage(data: unknown): void;
  setStage(cx: number, cz: number, stage: ChunkStageValue): void;
  enqueueGen(cx: number, cz: number, priority: number): void;
  enqueueMesh(cx: number, cz: number, priority: number): void;
  queueMesh(cx: number, cz: number, priority: number): void;
  evict(cx: number, cz: number): boolean;
  processSaveQueue(): Promise<void>;
  setDesiredChunks(chunks: { cx: number; cz: number }[]): void;
  processStreamingJobs(): void;
  setWorldContext(worldId: string, seedNum: number): void;
  reset(): void;
  setWorkersEnabled(enabled: boolean): void;
  setLight(x: number, y: number, z: number, sky: number, block: number): void;
  updateLightingAround(x: number, y: number, z: number): void;
  setMetadataAt(x: number, y: number, z: number, value: number): void;
  setBlock: WorldManager["setBlock"];
  setBlocks: WorldManager["setBlocks"];
  subscribeMesh: WorldManager["subscribeMesh"];
}

export interface AtlasPerformanceSnapshot extends BudgetSnapshot {
  timestamp: number;
  telemetryMode: "observe" | "enforce";
  unavailableMetrics: string[];
  totalTrackedBytes: number;
  softLimitBytes: number;
  hardLimitBytes: number;
  budgetState: "normal" | "soft" | "hard";
  residentChunks: number;
  residentSections: number | null;
  generationQueue: number;
  meshQueue: number;
  evictionBacklog: number;
  inFlightJobs: number;
  inFlightBytes: number;
  saveBacklog: number;
  workerErrors: number;
  workerRestarts: number;
  staleResultsDiscarded: number;
  mainThreadFallbacks: number;
  workerJobDurationP95Ms: number | null;
  effectiveDesiredChunks: number;
  configuredDesiredChunks: number;
  renderer: {
    drawCalls: number | null;
    triangles: number | null;
    points: number | null;
    lines: number | null;
    geometries: number | null;
    textures: number | null;
  };
  heapUsedBytes: number | null;
  heapTotalBytes: number | null;
  workerStatus: string;
}

export interface StreamingSafetyInstallOptions {
  enforce?: boolean;
}

export interface AtlasPerformanceApi {
  sample(): AtlasPerformanceSnapshot;
  configureBudget(limits: {
    softLimitBytes?: number;
    hardLimitBytes?: number;
  }): void;
  registerRenderer(renderer: RendererLike | null): void;
  getRecentWorkerErrors(): readonly WorkerResultEnvelope[];
}

declare global {
  interface Window {
    __ATLAS_PERFORMANCE__?: AtlasPerformanceApi;
  }
}

const INSTALLED_MARK = "__atlasStreamingSafetyInstalled";
const OBSERVER_MARK = "__atlasStreamingObserverInstalled";
const DEFAULT_SOFT_LIMIT = 512 * MIB;
const DEFAULT_HARD_LIMIT = 768 * MIB;
const HEARTBEAT_INTERVAL_MS = 5_000;
const HEARTBEAT_TIMEOUT_MS = 20_000;
const EVICTION_BUDGET_MS = 2;
const EMPTY_CACHE_MARKER = Symbol("uploaded-mesh-marker");

const geometryBytes = (result: GeometryResult | undefined): number => {
  if (!result) return 0;
  return estimateTransferBytes(result);
};

const percentile95 = (samples: readonly number[]): number | null => {
  if (samples.length === 0) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] ?? null;
};

const getHeapSample = (): { used: number | null; total: number | null } => {
  const memory = (
    performance as Performance & {
      memory?: { usedJSHeapSize: number; totalJSHeapSize: number };
    }
  ).memory;
  return {
    used: memory?.usedJSHeapSize ?? null,
    total: memory?.totalJSHeapSize ?? null,
  };
};

const installStreamingObserver = (
  manager: WorldManagerInternals & Record<string, unknown>,
): AtlasPerformanceApi => {
  const existing = manager[OBSERVER_MARK] as AtlasPerformanceApi | undefined;
  if (existing) return existing;

  let softLimitBytes = DEFAULT_SOFT_LIMIT;
  let hardLimitBytes = DEFAULT_HARD_LIMIT;
  let renderer: RendererLike | null = null;
  const legacyMeshInputBytes = RAW_CHUNK_BYTES + 8 * (RAW_CHUNK_BYTES / 3);

  const api: AtlasPerformanceApi = {
    sample: () => {
      let rawChunkBytes = 0;
      for (const value of manager.state.chunks.values())
        rawChunkBytes += value.byteLength;
      for (const value of manager.state.lights.values())
        rawChunkBytes += value.byteLength;
      for (const value of manager.state.metadata.values())
        rawChunkBytes += value.byteLength;

      let cpuMeshBytes = 0;
      for (const value of manager.meshCache.values())
        cpuMeshBytes += geometryBytes(value);

      let dirtySaveSnapshotBytes = 0;
      for (const key of manager.dirtyChunks) {
        dirtySaveSnapshotBytes +=
          manager.state.chunks.get(key)?.byteLength ?? 0;
        dirtySaveSnapshotBytes +=
          manager.state.lights.get(key)?.byteLength ?? 0;
        dirtySaveSnapshotBytes +=
          manager.state.metadata.get(key)?.byteLength ?? 0;
      }

      const budget: BudgetSnapshot = {
        rawChunkBytes,
        cpuMeshBytes,
        estimatedGpuMeshBytes: cpuMeshBytes,
        workerInFlightInputBytes: manager.inFlightMesh * legacyMeshInputBytes,
        workerScratchEstimatedBytes: 0,
        dirtySaveSnapshotBytes,
      };
      const heap = getHeapSample();
      const total = totalBudgetBytes(budget);
      return {
        timestamp: Date.now(),
        telemetryMode: "observe",
        unavailableMetrics: [
          "worker scratch bytes",
          "worker job duration",
          "worker structured errors/restarts",
          "stale-result count",
          "main-thread fallback count",
          "resident sections",
        ],
        ...budget,
        totalTrackedBytes: total,
        softLimitBytes,
        hardLimitBytes,
        budgetState:
          total >= hardLimitBytes
            ? "hard"
            : total >= softLimitBytes
              ? "soft"
              : "normal",
        residentChunks: manager.state.chunks.size,
        residentSections: null,
        generationQueue: manager.genQueue.length,
        meshQueue: manager.meshQueue.length,
        evictionBacklog: 0,
        inFlightJobs: manager.inFlightGen + manager.inFlightMesh,
        inFlightBytes: manager.inFlightMesh * legacyMeshInputBytes,
        saveBacklog: manager.dirtyChunks.size,
        workerErrors: 0,
        workerRestarts: 0,
        staleResultsDiscarded: 0,
        mainThreadFallbacks: 0,
        workerJobDurationP95Ms: null,
        effectiveDesiredChunks: manager.desiredChunkKeys.size,
        configuredDesiredChunks: manager.desiredChunkKeys.size,
        renderer: {
          drawCalls: renderer?.info.render.calls ?? null,
          triangles: renderer?.info.render.triangles ?? null,
          points: renderer?.info.render.points ?? null,
          lines: renderer?.info.render.lines ?? null,
          geometries: renderer?.info.memory.geometries ?? null,
          textures: renderer?.info.memory.textures ?? null,
        },
        heapUsedBytes: heap.used,
        heapTotalBytes: heap.total,
        workerStatus: manager.workerStatusMessage,
      };
    },
    configureBudget: (limits) => {
      const nextSoft = limits.softLimitBytes ?? softLimitBytes;
      const nextHard = limits.hardLimitBytes ?? hardLimitBytes;
      if (!(nextSoft > 0) || !(nextHard > nextSoft)) {
        throw new Error(
          "Streaming memory budget requires 0 < softLimitBytes < hardLimitBytes.",
        );
      }
      softLimitBytes = nextSoft;
      hardLimitBytes = nextHard;
    },
    registerRenderer: (nextRenderer) => {
      renderer = nextRenderer;
    },
    getRecentWorkerErrors: () => [],
  };

  manager[OBSERVER_MARK] = api;
  if (typeof window !== "undefined") window.__ATLAS_PERFORMANCE__ = api;
  return api;
};

export const installStreamingSafety = (
  options: StreamingSafetyInstallOptions = {},
): AtlasPerformanceApi => {
  const manager = worldManager as unknown as WorldManagerInternals &
    Record<string, unknown>;
  if (options.enforce === false) return installStreamingObserver(manager);
  const existing = manager[INSTALLED_MARK] as AtlasPerformanceApi | undefined;
  if (existing) return existing;

  const original = {
    setDesiredChunks: manager.setDesiredChunks.bind(manager),
    processStreamingJobs: manager.processStreamingJobs.bind(manager),
    setWorldContext: manager.setWorldContext.bind(manager),
    reset: manager.reset.bind(manager),
    setBlock: manager.setBlock.bind(manager),
    setBlocks: manager.setBlocks.bind(manager),
    subscribeMesh: manager.subscribeMesh.bind(manager),
    initWorkers: manager.initWorkers.bind(manager),
    evict: manager.evict.bind(manager),
    handleWorkerMessage: manager.handleWorkerMessage.bind(manager),
    setLight: manager.setLight.bind(manager),
    updateLightingAround: manager.updateLightingAround.bind(manager),
    setMetadataAt: manager.setMetadataAt.bind(manager),
  };

  let sessionId = 1;
  let desiredEpochCounter = 0;
  let softLimitBytes = DEFAULT_SOFT_LIMIT;
  let hardLimitBytes = DEFAULT_HARD_LIMIT;
  let configuredDesiredChunks = 0;
  let effectiveDesiredChunks = 0;
  let renderer: RendererLike | null = null;
  let singleWorkerCompatibilityMode = false;
  let workerPoolEpoch = 0;
  let lastConfiguredChunks: ChunkCoord[] = [];
  let heartbeatTimer: number | null = null;
  let saveRequestedForEviction = false;

  const normalGenConcurrency = manager.MAX_GEN_IN_FLIGHT;
  const normalMeshConcurrency = manager.MAX_MESH_IN_FLIGHT;
  const desiredEpochByKey = new Map<string, number>();
  const knownCoords = new Map<string, ChunkCoord>();
  const dataVersions = new Map<string, number>();
  const jobs = new Map<string, JobRecord>();
  const workerHealth = new Map<number, WorkerHealth>();
  const evictionQueue: ChunkCoord[] = [];
  const evictionQueuedKeys = new Set<string>();
  const uploadedMeshKeys = new Set<string>();
  const uploadedCpuMeshBytesByKey = new Map<string, number>();
  const gpuMeshBytesByKey = new Map<string, number>();
  const workerDurations: number[] = [];
  const workerScratchBytesById = new Map<number, number>();
  const recentWorkerErrors: WorkerResultEnvelope[] = [];

  let inFlightInputBytes = 0;
  let workerErrors = 0;
  let workerRestarts = 0;
  let staleResultsDiscarded = 0;
  let mainThreadFallbacks = 0;

  const jobMapKey = (type: JobType, ticket: number): string =>
    `${type}:${ticket}`;

  const getBudgetSnapshot = (): BudgetSnapshot => {
    let rawChunkBytes = 0;
    for (const value of manager.state.chunks.values())
      rawChunkBytes += value.byteLength;
    for (const value of manager.state.lights.values())
      rawChunkBytes += value.byteLength;
    for (const value of manager.state.metadata.values())
      rawChunkBytes += value.byteLength;

    let cpuMeshBytes = 0;
    for (const [key, value] of manager.meshCache) {
      if (
        value !== (EMPTY_CACHE_MARKER as unknown as GeometryResult) &&
        !uploadedCpuMeshBytesByKey.has(key)
      ) {
        cpuMeshBytes += geometryBytes(value);
      }
    }
    for (const value of uploadedCpuMeshBytesByKey.values())
      cpuMeshBytes += value;

    let estimatedGpuMeshBytes = 0;
    for (const value of gpuMeshBytesByKey.values())
      estimatedGpuMeshBytes += value;

    let dirtySaveSnapshotBytes = 0;
    for (const key of manager.dirtyChunks) {
      dirtySaveSnapshotBytes += manager.state.chunks.get(key)?.byteLength ?? 0;
      dirtySaveSnapshotBytes += manager.state.lights.get(key)?.byteLength ?? 0;
      dirtySaveSnapshotBytes +=
        manager.state.metadata.get(key)?.byteLength ?? 0;
    }

    return {
      rawChunkBytes,
      cpuMeshBytes,
      estimatedGpuMeshBytes,
      workerInFlightInputBytes: inFlightInputBytes,
      workerScratchEstimatedBytes: [...workerScratchBytesById.values()].reduce(
        (sum, value) => sum + value,
        0,
      ),
      dirtySaveSnapshotBytes,
    };
  };

  const currentBudgetState = (): "normal" | "soft" | "hard" => {
    const total = totalBudgetBytes(getBudgetSnapshot());
    if (total >= hardLimitBytes) return "hard";
    if (total >= softLimitBytes) return "soft";
    return "normal";
  };

  const applyBudgetPressure = (): void => {
    const state = currentBudgetState();
    if (state === "normal" && !singleWorkerCompatibilityMode) {
      manager.MAX_GEN_IN_FLIGHT = normalGenConcurrency;
      manager.MAX_MESH_IN_FLIGHT = normalMeshConcurrency;
      return;
    }

    manager.MAX_GEN_IN_FLIGHT = 1;
    manager.MAX_MESH_IN_FLIGHT = 1;
  };

  const registerCoord = (cx: number, cz: number): string => {
    const key = chunkKey(cx, cz);
    knownCoords.set(key, { cx, cz });
    return key;
  };

  const queueEviction = (coord: ChunkCoord): void => {
    const key = chunkKey(coord.cx, coord.cz);
    if (evictionQueuedKeys.has(key)) return;
    evictionQueuedKeys.add(key);
    evictionQueue.push(coord);
  };

  const cleanJobAccounting = (record: JobRecord): void => {
    jobs.delete(jobMapKey(record.type, record.ticket));
    inFlightInputBytes = Math.max(
      0,
      inFlightInputBytes - record.inputByteCount,
    );
  };

  const releaseManagerSlot = (record: JobRecord): void => {
    if (record.type === "GEN") {
      if (manager.activeGenTickets.get(record.key) === record.ticket) {
        manager.activeGenTickets.delete(record.key);
        manager.inFlightGen = Math.max(0, manager.inFlightGen - 1);
      }
      manager.genStartedAt.delete(record.key);
    } else {
      if (manager.activeMeshTickets.get(record.key) === record.ticket) {
        manager.activeMeshTickets.delete(record.key);
        manager.inFlightMesh = Math.max(0, manager.inFlightMesh - 1);
      }
      manager.meshStartedAt.delete(record.key);
    }
  };

  const requeueRecord = (record: JobRecord): void => {
    if (!manager.desiredChunkKeys.has(record.key)) {
      manager.evict(record.cx, record.cz);
      return;
    }

    const newerTicket =
      record.type === "GEN"
        ? manager.activeGenTickets.get(record.key)
        : manager.activeMeshTickets.get(record.key);
    if (newerTicket !== undefined && newerTicket !== record.ticket) return;

    const priority = distanceSquared(
      { cx: record.cx, cz: record.cz },
      manager.desiredCenter,
    );
    if (record.type === "GEN") {
      manager.setStage(record.cx, record.cz, 1);
      manager.enqueueGen(record.cx, record.cz, priority);
    } else {
      manager.setStage(record.cx, record.cz, 3);
      manager.queueMesh(record.cx, record.cz, priority);
    }
  };

  const handleJobFailure = (
    record: JobRecord,
    error: WorkerResultEnvelope,
    recordDiagnostic = true,
  ): void => {
    cleanJobAccounting(record);
    workerDurations.push(performance.now() - record.startedAt);
    if (workerDurations.length > 512)
      workerDurations.splice(0, workerDurations.length - 512);
    releaseManagerSlot(record);
    if (recordDiagnostic) {
      workerErrors += 1;
      recentWorkerErrors.push(error);
      if (recentWorkerErrors.length > 32) recentWorkerErrors.shift();
    }

    if (error.allocationRelated) {
      manager.MAX_GEN_IN_FLIGHT = 1;
      manager.MAX_MESH_IN_FLIGHT = 1;
    }
    requeueRecord(record);
  };

  const attachWorker = (worker: Worker, workerId: number): void => {
    const previous = workerHealth.get(workerId);
    workerHealth.set(workerId, {
      id: workerId,
      healthy: true,
      lastHeartbeatAt: performance.now(),
      restartCount: previous?.restartCount ?? 0,
      consecutiveFailures: previous?.consecutiveFailures ?? 0,
      backoffUntil: previous?.backoffUntil ?? 0,
    });

    worker.onmessage = (event: MessageEvent<WorkerResultEnvelope>) => {
      const data = event.data;
      const health = workerHealth.get(workerId);
      if (health) {
        health.lastHeartbeatAt = performance.now();
        health.healthy = true;
        if (data.type !== "JOB_ERROR") health.consecutiveFailures = 0;
      }
      const capacities = data.scratchCapacities;
      if (capacities) {
        const scratchBytes =
          (capacities.neighborCacheBytes ?? 0) +
          (capacities.geometryScratchBytes ?? 0) +
          (capacities.generationScratchBytes ?? 0);
        if (Number.isFinite(scratchBytes)) {
          workerScratchBytesById.set(workerId, Math.max(0, scratchBytes));
        }
      }
      if (data.type === "HEARTBEAT") return;
      manager.handleWorkerMessage(data);
    };

    worker.onerror = (event) => {
      event.preventDefault();
      const message = event.message || "Unhandled worker error";
      const assigned = [...jobs.values()].filter(
        (record) => record.workerId === workerId,
      );
      for (let index = 0; index < assigned.length; index += 1) {
        const record = assigned[index];
        handleJobFailure(
          record,
          {
            type: "JOB_ERROR",
            jobType: record.type,
            cx: record.cx,
            cz: record.cz,
            ticket: record.ticket,
            worldSessionId: record.worldSessionId,
            desiredEpoch: record.desiredEpoch,
            dataVersion: record.dataVersion,
            uniqueTicket: record.uniqueTicket,
            workerId,
            inputByteCount: record.inputByteCount,
            allocationRelated: /array buffer|allocation|out of memory/i.test(
              message,
            ),
            errorName: "WorkerError",
            errorMessage: message,
          },
          index === 0,
        );
      }
      if (assigned.length === 0) {
        workerErrors += 1;
        recentWorkerErrors.push({
          type: "JOB_ERROR",
          workerId,
          allocationRelated: /array buffer|allocation|out of memory/i.test(
            message,
          ),
          errorName: "WorkerError",
          errorMessage: message,
        });
        if (recentWorkerErrors.length > 32) recentWorkerErrors.shift();
      }
      restartWorker(workerId, message);
    };
  };

  const healthyWorkerIds = (): number[] => {
    const now = performance.now();
    const ids: number[] = [];
    for (let index = 0; index < manager.workers.length; index += 1) {
      const health = workerHealth.get(index);
      if (
        health?.healthy &&
        health.backoffUntil <= now &&
        manager.workers[index]
      )
        ids.push(index);
    }
    return ids;
  };

  function restartWorker(workerId: number, reason: string): void {
    const restartEpoch = workerPoolEpoch;
    const previous = workerHealth.get(workerId);
    if (
      previous &&
      !previous.healthy &&
      previous.backoffUntil > performance.now()
    )
      return;
    const current = previous ?? {
      id: workerId,
      healthy: false,
      lastHeartbeatAt: 0,
      restartCount: 0,
      consecutiveFailures: 0,
      backoffUntil: 0,
    };
    current.healthy = false;
    current.consecutiveFailures += 1;
    current.restartCount += 1;
    const delay = workerRestartDelayMs(current.consecutiveFailures);
    current.backoffUntil = performance.now() + delay;
    workerHealth.set(workerId, current);
    workerRestarts += 1;

    manager.workers[workerId]?.terminate();
    workerScratchBytesById.delete(workerId);
    manager.workerStatusMessage = `Worker ${workerId} restarting: ${reason}`;

    window.setTimeout(() => {
      if (
        restartEpoch !== workerPoolEpoch ||
        workerId >= manager.workers.length
      )
        return;
      try {
        const replacement = new Worker(
          new URL("../world/workers/world.worker.ts", import.meta.url),
          { type: "module" },
        );
        manager.workers[workerId] = replacement;
        attachWorker(replacement, workerId);
        replacement.postMessage({ type: "SET_SEED", seed: manager.activeSeed });
        replacement.postMessage({
          type: "SET_GEN_CONFIG",
          config: JSON.parse(JSON.stringify(GenConfig)),
        });
        manager.workersEnabled = true;
        manager.workerStatusMessage = `Workers Active (${healthyWorkerIds().length}/${manager.workers.length})`;
        manager.processStreamingJobs();
      } catch (error) {
        restartWorker(
          workerId,
          error instanceof Error ? error.message : String(error),
        );
      }
    }, delay);
  }

  const installWorkerHandlers = (): void => {
    manager.workers.forEach((worker, index) => attachWorker(worker, index));
    if (heartbeatTimer !== null) window.clearInterval(heartbeatTimer);
    heartbeatTimer = window.setInterval(() => {
      const now = performance.now();
      for (const [workerId, health] of workerHealth) {
        if (!health.healthy) continue;
        if (now - health.lastHeartbeatAt > HEARTBEAT_TIMEOUT_MS) {
          restartWorker(workerId, "heartbeat timeout");
          continue;
        }
        manager.workers[workerId]?.postMessage({ type: "PING", workerId });
      }
    }, HEARTBEAT_INTERVAL_MS);
  };

  const drainEvictions = (force = false): void => {
    const result = drainEvictionQueue(
      evictionQueue,
      manager.desiredCenter,
      (coord) => manager.desiredChunkKeys.has(chunkKey(coord.cx, coord.cz)),
      (coord) => manager.evict(coord.cx, coord.cz),
      { force, timeBudgetMs: EVICTION_BUDGET_MS },
    );
    evictionQueuedKeys.clear();
    for (const coord of evictionQueue)
      evictionQueuedKeys.add(chunkKey(coord.cx, coord.cz));

    if (result.deferred > 0 && !saveRequestedForEviction) {
      saveRequestedForEviction = true;
      void manager.processSaveQueue().finally(() => {
        saveRequestedForEviction = false;
        manager.processStreamingJobs();
      });
    }
  };

  manager.initWorkers = () => {
    original.initWorkers();
    installWorkerHandlers();
  };

  manager.postToPool = (message: unknown) => {
    const envelope = message as WorkerJobEnvelope;
    if (envelope.type !== "GEN" && envelope.type !== "MESH") return;

    let outbound: Record<string, unknown> = envelope;
    const transferables: Transferable[] = [];
    if (envelope.type === "MESH") {
      const source = envelope as WorkerJobEnvelope & {
        neighbors?: Partial<
          Record<"left" | "right" | "front" | "back", Uint8Array>
        >;
        lights?: { center: Uint8Array } & Partial<
          Record<"left" | "right" | "front" | "back", Uint8Array>
        >;
      };
      const { neighbors, lights, ...rest } = source;
      const neighborBorders: NeighborBorderMap =
        extractNeighborBorders(neighbors);
      const lightBorders: NeighborBorderMap = extractNeighborBorders(lights);
      for (const plane of [
        ...Object.values(neighborBorders),
        ...Object.values(lightBorders),
      ]) {
        if (plane) transferables.push(plane.buffer);
      }
      outbound = {
        ...rest,
        neighborBorders,
        lightBorders,
        lights: lights ? { center: lights.center } : undefined,
      };
    }

    const key = registerCoord(envelope.cx, envelope.cz);
    const ids = healthyWorkerIds();
    const workerId = selectAffinityWorker(envelope.cx, envelope.cz, ids);
    const desiredEpoch = desiredEpochByKey.get(key) ?? -1;
    const dataVersion = dataVersions.get(key) ?? 0;
    const uniqueTicket = `${sessionId}:${envelope.type}:${envelope.ticket}`;
    const inputByteCount = estimateTransferBytes(outbound);
    const record: JobRecord = {
      type: envelope.type,
      key,
      cx: envelope.cx,
      cz: envelope.cz,
      ticket: envelope.ticket,
      uniqueTicket,
      worldSessionId: sessionId,
      desiredEpoch,
      dataVersion,
      inputByteCount,
      workerId: workerId ?? -1,
      startedAt: performance.now(),
    };

    if (workerId === null) {
      handleJobFailure(record, {
        type: "JOB_ERROR",
        jobType: record.type,
        cx: record.cx,
        cz: record.cz,
        ticket: record.ticket,
        worldSessionId: record.worldSessionId,
        desiredEpoch: record.desiredEpoch,
        dataVersion: record.dataVersion,
        uniqueTicket: record.uniqueTicket,
        workerId: -1,
        inputByteCount,
        allocationRelated: false,
        errorName: "WorkerUnavailableError",
        errorMessage:
          "No healthy world worker was available; job was requeued without main-thread fallback.",
      });
      return;
    }

    record.workerId = workerId;
    jobs.set(jobMapKey(record.type, record.ticket), record);
    inFlightInputBytes += inputByteCount;

    try {
      manager.workers[workerId].postMessage(
        {
          ...outbound,
          jobType: envelope.type,
          worldSessionId: sessionId,
          desiredEpoch,
          dataVersion,
          uniqueTicket,
          workerId,
          inputByteCount,
        },
        transferables,
      );
    } catch (error) {
      handleJobFailure(record, {
        type: "JOB_ERROR",
        jobType: record.type,
        cx: record.cx,
        cz: record.cz,
        ticket: record.ticket,
        worldSessionId: record.worldSessionId,
        desiredEpoch: record.desiredEpoch,
        dataVersion: record.dataVersion,
        uniqueTicket: record.uniqueTicket,
        workerId,
        inputByteCount,
        allocationRelated:
          error instanceof RangeError ||
          /array buffer|allocation|out of memory/i.test(String(error)),
        errorName: error instanceof Error ? error.name : "PostMessageError",
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      restartWorker(workerId, "postMessage failed");
    }
  };

  manager.handleWorkerMessage = (message: unknown) => {
    const data = message as WorkerResultEnvelope;
    if (data.type === "JOB_ERROR") {
      const type = data.jobType;
      const ticket = data.ticket;
      if (!type || ticket === undefined) return;
      const record = jobs.get(jobMapKey(type, ticket));
      if (!record) {
        staleResultsDiscarded += 1;
        return;
      }
      const failedWorkerId = data.workerId ?? record.workerId;
      const assigned = [...jobs.values()].filter(
        (candidate) => candidate.workerId === failedWorkerId,
      );
      for (const assignedRecord of assigned) {
        handleJobFailure(
          assignedRecord,
          assignedRecord === record
            ? data
            : {
                type: "JOB_ERROR",
                jobType: assignedRecord.type,
                cx: assignedRecord.cx,
                cz: assignedRecord.cz,
                ticket: assignedRecord.ticket,
                worldSessionId: assignedRecord.worldSessionId,
                desiredEpoch: assignedRecord.desiredEpoch,
                dataVersion: assignedRecord.dataVersion,
                uniqueTicket: assignedRecord.uniqueTicket,
                workerId: failedWorkerId,
                inputByteCount: assignedRecord.inputByteCount,
                allocationRelated: data.allocationRelated,
                errorName: "WorkerRestartedError",
                errorMessage:
                  "Job requeued because its assigned worker restarted after another job failed.",
              },
          assignedRecord === record,
        );
      }
      if (failedWorkerId >= 0)
        restartWorker(
          failedWorkerId,
          data.errorMessage ?? "structured worker error",
        );
      return;
    }

    if (data.type !== "GEN_DONE" && data.type !== "MESH_DONE") {
      original.handleWorkerMessage(message);
      return;
    }

    const type: JobType = data.type === "GEN_DONE" ? "GEN" : "MESH";
    const ticket = data.ticket;
    const cx = data.cx;
    const cz = data.cz;
    if (ticket === undefined || cx === undefined || cz === undefined) return;
    const key = registerCoord(cx, cz);
    const record = jobs.get(jobMapKey(type, ticket));

    if (record) cleanJobAccounting(record);

    const activeTicket =
      type === "GEN"
        ? manager.activeGenTickets.get(key)
        : manager.activeMeshTickets.get(key);
    const expectedEpoch = desiredEpochByKey.get(key);
    const expectedVersion = dataVersions.get(key) ?? 0;
    const valid = isCurrentStreamingResult({
      activeTicket,
      resultTicket: ticket,
      desired: manager.desiredChunkKeys.has(key),
      currentSessionId: sessionId,
      currentDesiredEpoch: expectedEpoch,
      currentDataVersion: expectedVersion,
      recordSessionId: record?.worldSessionId,
      recordDesiredEpoch: record?.desiredEpoch,
      recordDataVersion: record?.dataVersion,
      recordUniqueTicket: record?.uniqueTicket,
      resultSessionId: data.worldSessionId,
      resultDesiredEpoch: data.desiredEpoch,
      resultDataVersion: data.dataVersion,
      resultUniqueTicket: data.uniqueTicket,
    });

    if (!valid) {
      staleResultsDiscarded += 1;
      if (record) {
        releaseManagerSlot(record);
        requeueRecord(record);
      }
      return;
    }

    const measuredDuration =
      typeof data.jobDurationMs === "number" &&
      Number.isFinite(data.jobDurationMs)
        ? data.jobDurationMs
        : record
          ? performance.now() - record.startedAt
          : null;
    if (measuredDuration !== null) {
      workerDurations.push(measuredDuration);
      if (workerDurations.length > 512)
        workerDurations.splice(0, workerDurations.length - 512);
    }

    original.handleWorkerMessage(message);

    if (data.type === "GEN_DONE") {
      for (const [dx, dz] of [
        [0, 0],
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ] as const) {
        const affectedKey = registerCoord(cx + dx, cz + dz);
        if ((manager.chunkStages.get(affectedKey) ?? 0) >= 3) {
          dataVersions.set(
            affectedKey,
            (dataVersions.get(affectedKey) ?? 0) + 1,
          );
        }
      }
    }
  };

  manager.evict = (cx: number, cz: number): boolean => {
    const key = chunkKey(cx, cz);
    const didEvict = original.evict(cx, cz);
    if (didEvict) {
      knownCoords.delete(key);
      desiredEpochByKey.delete(key);
      dataVersions.delete(key);
      uploadedMeshKeys.delete(key);
      uploadedCpuMeshBytesByKey.delete(key);
      gpuMeshBytesByKey.delete(key);
      evictionQueuedKeys.delete(key);
      for (const [jobKey, record] of jobs) {
        if (record.key === key) {
          cleanJobAccounting(record);
          releaseManagerSlot(record);
          jobs.delete(jobKey);
        }
      }
    }
    return didEvict;
  };

  manager.subscribeMesh = (cx, cz, callback) => {
    const key = registerCoord(cx, cz);
    const wrapped = (geometry: GeometryResult | null) => {
      callback(geometry);
      if (!geometry) {
        uploadedCpuMeshBytesByKey.delete(key);
        gpuMeshBytesByKey.delete(key);
        return;
      }
      const bytes = geometryBytes(geometry);
      uploadedMeshKeys.add(key);
      uploadedCpuMeshBytesByKey.set(key, bytes);
      gpuMeshBytesByKey.set(key, bytes);
      queueMicrotask(() => {
        if (manager.meshCache.get(key) === geometry)
          manager.meshCache.delete(key);
      });
    };
    const unsubscribe = original.subscribeMesh(cx, cz, wrapped);
    if (uploadedMeshKeys.has(key) && !manager.meshCache.has(key)) {
      manager.queueMesh(cx, cz, -1000);
      manager.processStreamingJobs();
    }
    return () => {
      unsubscribe();
      if (!manager.meshSubscribers.has(key)) {
        uploadedCpuMeshBytesByKey.delete(key);
        gpuMeshBytesByKey.delete(key);
      }
    };
  };

  const invalidateInFlightForKey = (key: string): void => {
    const genTicket = manager.activeGenTickets.get(key);
    if (genTicket !== undefined) {
      manager.activeGenTickets.delete(key);
      manager.genStartedAt.delete(key);
      manager.inFlightGen = Math.max(0, manager.inFlightGen - 1);
    }
    const meshTicket = manager.activeMeshTickets.get(key);
    if (meshTicket !== undefined) {
      manager.activeMeshTickets.delete(key);
      manager.meshStartedAt.delete(key);
      manager.inFlightMesh = Math.max(0, manager.inFlightMesh - 1);
    }
  };

  const maxDesiredChunksForBudget = (limitBytes: number): number => {
    const budget = getBudgetSnapshot();
    const meshAverage =
      gpuMeshBytesByKey.size > 0
        ? [...gpuMeshBytesByKey.values()].reduce(
            (sum, value) => sum + value,
            0,
          ) / gpuMeshBytesByKey.size
        : 128 * 1024;
    const bytesPerChunk = RAW_CHUNK_BYTES + meshAverage;
    const fixedBytes =
      budget.cpuMeshBytes +
      budget.workerInFlightInputBytes +
      budget.workerScratchEstimatedBytes +
      budget.dirtySaveSnapshotBytes;
    return residentChunkCapacity(limitBytes, fixedBytes, bytesPerChunk);
  };

  const applyDesiredChunks = (
    chunks: readonly { cx: number; cz: number }[],
    maxChunks: number,
  ): void => {
    desiredEpochCounter += 1;
    const effective = capDesiredChunks(chunks, maxChunks);
    effectiveDesiredChunks = effective.length;

    const currentKeys = new Set<string>();
    for (const coord of effective) {
      const key = registerCoord(coord.cx, coord.cz);
      currentKeys.add(key);
      if (!desiredEpochByKey.has(key))
        desiredEpochByKey.set(key, desiredEpochCounter);
    }

    for (const [key, coord] of knownCoords) {
      if (!currentKeys.has(key)) {
        desiredEpochByKey.delete(key);
        invalidateInFlightForKey(key);
        queueEviction(coord);
      }
    }
    compactQueuedChunkJobs(
      manager.genQueue,
      manager.queuedGenKeys,
      currentKeys,
    );
    compactQueuedChunkJobs(
      manager.meshQueue,
      manager.queuedMeshKeys,
      currentKeys,
    );

    const markers: string[] = [];
    for (const key of uploadedMeshKeys) {
      if (currentKeys.has(key) && !manager.meshCache.has(key)) {
        manager.meshCache.set(
          key,
          EMPTY_CACHE_MARKER as unknown as GeometryResult,
        );
        markers.push(key);
      }
    }

    original.setDesiredChunks(effective);
    for (const key of markers) {
      if (
        manager.meshCache.get(key) ===
        (EMPTY_CACHE_MARKER as unknown as GeometryResult)
      ) {
        manager.meshCache.delete(key);
      }
    }

    applyBudgetPressure();
    drainEvictions(currentBudgetState() === "hard");
  };

  manager.setDesiredChunks = (chunks: { cx: number; cz: number }[]) => {
    configuredDesiredChunks = chunks.length;
    lastConfiguredChunks = chunks.map(({ cx, cz }) => ({ cx, cz }));
    applyDesiredChunks(
      lastConfiguredChunks,
      maxDesiredChunksForBudget(softLimitBytes),
    );
  };

  manager.processStreamingJobs = () => {
    applyBudgetPressure();
    const budgetState = currentBudgetState();
    if (budgetState !== "normal" && lastConfiguredChunks.length > 0) {
      const budgetMax = maxDesiredChunksForBudget(softLimitBytes);
      if (effectiveDesiredChunks > budgetMax) {
        applyDesiredChunks(lastConfiguredChunks, budgetMax);
      }
    }
    drainEvictions(budgetState === "hard");

    if (
      currentBudgetState() === "hard" &&
      (evictionQueue.length > 0 || manager.dirtyChunks.size > 0)
    ) {
      manager.workerStatusMessage =
        "Hard memory limit reached; draining eviction/save backlog";
      return;
    }

    if (healthyWorkerIds().length === 0) {
      manager.workerStatusMessage =
        "No healthy workers; streaming jobs are queued";
      return;
    }

    original.processStreamingJobs();
    drainEvictions(currentBudgetState() === "hard");
  };

  manager.setWorldContext = (worldId: string, seedNum: number) => {
    sessionId += 1;
    desiredEpochCounter += 1;
    for (const record of jobs.values()) releaseManagerSlot(record);
    desiredEpochByKey.clear();
    dataVersions.clear();
    jobs.clear();
    manager.activeGenTickets.clear();
    manager.activeMeshTickets.clear();
    manager.genStartedAt.clear();
    manager.meshStartedAt.clear();
    manager.inFlightGen = 0;
    manager.inFlightMesh = 0;
    inFlightInputBytes = 0;
    original.setWorldContext(worldId, seedNum);
  };

  manager.reset = () => {
    workerPoolEpoch += 1;
    sessionId += 1;
    desiredEpochCounter += 1;
    desiredEpochByKey.clear();
    knownCoords.clear();
    dataVersions.clear();
    lastConfiguredChunks = [];
    configuredDesiredChunks = 0;
    effectiveDesiredChunks = 0;
    evictionQueue.length = 0;
    evictionQueuedKeys.clear();
    uploadedMeshKeys.clear();
    uploadedCpuMeshBytesByKey.clear();
    gpuMeshBytesByKey.clear();
    jobs.clear();
    workerScratchBytesById.clear();
    inFlightInputBytes = 0;
    original.reset();
    installWorkerHandlers();
  };

  manager.setWorkersEnabled = (enabled: boolean) => {
    singleWorkerCompatibilityMode = !enabled;
    manager.workersEnabled = true;

    if (manager.workers.length === 0) {
      manager.initWorkers();
    }

    const requeueForPoolChange = (records: readonly JobRecord[]): void => {
      for (const record of records) {
        handleJobFailure(
          record,
          {
            type: "JOB_ERROR",
            jobType: record.type,
            cx: record.cx,
            cz: record.cz,
            ticket: record.ticket,
            workerId: record.workerId,
            errorName: "WorkerPoolReconfigured",
            errorMessage: "Job requeued while reconfiguring the worker pool.",
            allocationRelated: false,
          },
          false,
        );
      }
    };

    if (!enabled && manager.workers.length > 1) {
      workerPoolEpoch += 1;
      requeueForPoolChange(
        [...jobs.values()].filter((record) => record.workerId >= 1),
      );
      for (let index = manager.workers.length - 1; index >= 1; index -= 1) {
        manager.workers[index]?.terminate();
        workerHealth.delete(index);
        workerScratchBytesById.delete(index);
      }
      manager.workers.length = 1;
      manager.nextWorkerIndex = 0;
    } else if (enabled && manager.workers.length < 2) {
      workerPoolEpoch += 1;
      requeueForPoolChange([...jobs.values()]);
      manager.terminateWorkers();
      workerHealth.clear();
      workerScratchBytesById.clear();
      manager.workersEnabled = true;
      manager.initWorkers();
    }

    installWorkerHandlers();
    applyBudgetPressure();
    manager.workerStatusMessage = !enabled
      ? "Workers Active (single-worker compatibility mode; main-thread fallback disabled)"
      : `Workers Active (${manager.workers.length})`;
    manager.processStreamingJobs();
  };

  const bumpDataVersionAt = (x: number, z: number): void => {
    const cx = Math.floor(x / 16);
    const cz = Math.floor(z / 16);
    const key = registerCoord(cx, cz);
    dataVersions.set(key, (dataVersions.get(key) ?? 0) + 1);
  };

  manager.setLight = (x, y, z, sky, block) => {
    bumpDataVersionAt(x, z);
    original.setLight(x, y, z, sky, block);
  };

  manager.updateLightingAround = (x, y, z) => {
    const centerCx = Math.floor(x / 16);
    const centerCz = Math.floor(z / 16);
    for (let dz = -1; dz <= 1; dz += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const key = registerCoord(centerCx + dx, centerCz + dz);
        if ((manager.chunkStages.get(key) ?? 0) >= 3) {
          dataVersions.set(key, (dataVersions.get(key) ?? 0) + 1);
        }
      }
    }
    original.updateLightingAround(x, y, z);
  };

  manager.setMetadataAt = (x, y, z, value) => {
    bumpDataVersionAt(x, z);
    original.setMetadataAt(x, y, z, value);
  };

  manager.setBlock = (...args: Parameters<WorldManager["setBlock"]>) => {
    const [x, , z] = args;
    bumpDataVersionAt(x, z);
    return original.setBlock(...args);
  };

  manager.setBlocks = (...args: Parameters<WorldManager["setBlocks"]>) => {
    const [edits] = args;
    const touched = new Set<string>();
    for (const edit of edits) {
      const cx = Math.floor(edit.x / 16);
      const cz = Math.floor(edit.z / 16);
      touched.add(registerCoord(cx, cz));
    }
    for (const key of touched)
      dataVersions.set(key, (dataVersions.get(key) ?? 0) + 1);
    return original.setBlocks(...args);
  };

  installWorkerHandlers();
  if (manager.workers.length === 0) {
    manager.workersEnabled = true;
    manager.initWorkers();
  }
  if (!WORKERS_ENABLED) manager.setWorkersEnabled(false);

  const api: AtlasPerformanceApi = {
    sample: () => {
      const budget = getBudgetSnapshot();
      const heap = getHeapSample();
      const state = currentBudgetState();
      return {
        timestamp: Date.now(),
        telemetryMode: "enforce",
        unavailableMetrics: ["resident sections"],
        ...budget,
        totalTrackedBytes: totalBudgetBytes(budget),
        softLimitBytes,
        hardLimitBytes,
        budgetState: state,
        residentChunks: manager.state.chunks.size,
        residentSections: null,
        generationQueue: manager.genQueue.length,
        meshQueue: manager.meshQueue.length,
        evictionBacklog: evictionQueue.length,
        inFlightJobs: manager.inFlightGen + manager.inFlightMesh,
        inFlightBytes: inFlightInputBytes,
        saveBacklog: manager.dirtyChunks.size,
        workerErrors,
        workerRestarts,
        staleResultsDiscarded,
        mainThreadFallbacks,
        workerJobDurationP95Ms: percentile95(workerDurations),
        effectiveDesiredChunks,
        configuredDesiredChunks,
        renderer: {
          drawCalls: renderer?.info.render.calls ?? null,
          triangles: renderer?.info.render.triangles ?? null,
          points: renderer?.info.render.points ?? null,
          lines: renderer?.info.render.lines ?? null,
          geometries: renderer?.info.memory.geometries ?? null,
          textures: renderer?.info.memory.textures ?? null,
        },
        heapUsedBytes: heap.used,
        heapTotalBytes: heap.total,
        workerStatus: manager.workerStatusMessage,
      };
    },
    configureBudget: (limits) => {
      const nextSoft = limits.softLimitBytes ?? softLimitBytes;
      const nextHard = limits.hardLimitBytes ?? hardLimitBytes;
      if (!(nextSoft > 0) || !(nextHard > nextSoft)) {
        throw new Error(
          "Streaming memory budget requires 0 < softLimitBytes < hardLimitBytes.",
        );
      }
      softLimitBytes = nextSoft;
      hardLimitBytes = nextHard;
      applyBudgetPressure();
      if (lastConfiguredChunks.length > 0) {
        applyDesiredChunks(
          lastConfiguredChunks,
          maxDesiredChunksForBudget(softLimitBytes),
        );
      }
    },
    registerRenderer: (nextRenderer) => {
      renderer = nextRenderer;
    },
    getRecentWorkerErrors: () => recentWorkerErrors,
  };

  manager[INSTALLED_MARK] = api;
  if (typeof window !== "undefined") window.__ATLAS_PERFORMANCE__ = api;
  return api;
};
