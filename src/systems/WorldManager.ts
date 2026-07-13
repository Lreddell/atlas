
import { BlockType, ItemStack } from '../types';
import { BLOCKS } from '../data/blocks';
import * as WorldTypes from './world/worldTypes';
import * as WorldStore from './world/worldStore';
import * as WorldCoords from './world/worldCoords';
import * as WorldGen from './world/chunkGeneration';
import * as Lighting from './world/lighting';
import * as TileEntities from './world/tileEntities';
import * as Geometry from './world/geometry';
import * as Fluids from './world/fluids';
import { getBiome } from './world/biomes';
import { caveBiomeAt, type CaveBiome } from './world/caves';
import { GlobalNoise } from '../utils/noise';
import { needsSupport, hasSupportBelow } from './world/blockProps';
import { isStairs, resolveStairShape, stairBackDir, type StairNeighbor } from './world/blockShapes';
import { CHUNK_SIZE, MIN_Y, MAX_Y, WORKERS_ENABLED } from '../constants';
import { reseedGlobalNoise, getSpawnSearchCenter } from '../utils/noise';
import { WorldStorage } from './world/WorldStorage';
import { GenConfig } from './world/genConfig';
import { tickPlantGrowth } from './world/plantGrowth';
import { getRegionAt } from './world/regions';
import { MAGNETIC_FIELDS_REGION_ID, getMagneticCacheLoot } from './world/magneticFields';
import { SEALED_MINEABLE_BLOCKS } from './world/magneticFieldsBlocks';
import { progression } from './progression/ProgressionStore';
import { perf } from './perf/perfTelemetry';

// --- Types ---
enum ChunkStage {
    EMPTY = 0,
    REQUESTED = 1,
    GENERATING = 2,
    GENERATED = 3,
    MESH_QUEUED = 4,
    MESHING = 5,
    READY = 6
}

interface Job {
    cx: number;
    cz: number;
    priority: number;
}

// Optimized Queue class to avoid O(n) shift operations
class JobQueue {
    private _data: Job[] = [];
    private _head: number = 0;

    push(job: Job) {
        this._data.push(job);
    }

    shift(): Job | undefined {
        if (this._head >= this._data.length) return undefined;
        const item = this._data[this._head];
        this._data[this._head] = undefined as any; // Clear reference
        this._head++;
        
        // Compact only when significant space is wasted (>1000 items and >50% of array)
        if (this._head > 1000 && this._head * 2 > this._data.length) {
            this._data = this._data.slice(this._head);
            this._head = 0;
        }
        return item;
    }

    unshift(job: Job) {
        if (this._head > 0) {
            this._head--;
            this._data[this._head] = job;
        } else {
            this._data.unshift(job);
        }
    }

    get length(): number {
        return this._data.length - this._head;
    }

    forEach(callback: (job: Job) => void) {
        for (let i = this._head; i < this._data.length; i++) {
            callback(this._data[i]);
        }
    }

    find(predicate: (job: Job) => boolean): Job | undefined {
        for (let i = this._head; i < this._data.length; i++) {
            if (predicate(this._data[i])) return this._data[i];
        }
        return undefined;
    }

    sort(compareFn: (a: Job, b: Job) => number) {
        // Compact before sort to simplify logic
        if (this._head > 0) {
            this._data = this._data.slice(this._head);
            this._head = 0;
        }
        this._data.sort(compareFn);
    }

    clear() {
        this._data = [];
        this._head = 0;
    }
}

/**
 * One pooled worker plus its health bookkeeping. The slot survives restarts of
 * the underlying Worker so failure counters can apply backoff across restarts.
 */
interface WorkerSlot {
    id: number;
    worker: Worker;
    awaitingPong: boolean;
    missedPongs: number;
    /** Timestamps (ms) of recent restarts, pruned to the backoff window. */
    restartTimes: number[];
    jobErrors: number;
}

const WORKER_HEARTBEAT_INTERVAL_MS = 5000;
const WORKER_MAX_MISSED_PONGS = 2;
const WORKER_RESTART_WINDOW_MS = 60000;
const WORKER_MAX_RESTARTS_IN_WINDOW = 3;
const WORKER_RECOVERY_RETRY_MS = 15000;
/** Successful jobs required to restore one step of throttled concurrency. */
const THROTTLE_RECOVERY_SUCCESSES = 200;

export type LoadingProgressCallback = (phase: string, done: number, total: number, percent: number) => void;

type MessageCallback = (msg: string, type: 'info' | 'error' | 'success', clickAction?: string) => void;
type DropCallback = (stack: ItemStack, x: number, y: number, z: number) => void;
type ParticleCallback = (type: BlockType, x: number, y: number, z: number) => void;

export class WorldManager {
  private state: WorldTypes.WorldState;
  private spawnPoint: { x: number, y: number, z: number } | null = null;
  private worldSpawn: { x: number, y: number, z: number } | null = null;
  
  // Streaming & Pipeline
  private chunkStages = new Map<string, ChunkStage>();
  private meshCache = new Map<string, Geometry.GeometryResult>(); // Cached geometries for rendering
  private meshSubscribers = new Map<string, Set<(geo: Geometry.GeometryResult | null) => void>>();

  private pendingRemesh = new Map<string, number>();

  private genQueue = new JobQueue();
  private meshQueue = new JobQueue();
    private queuedGenKeys = new Set<string>();
    private queuedMeshKeys = new Set<string>();
  
  private inFlightGen = 0;
  private inFlightMesh = 0;
  
    private MAX_GEN_IN_FLIGHT = 3;
    private MAX_MESH_IN_FLIGHT = 2;
    private lastDesiredCenterKey: string | null = null;
    private lastDesiredCount = -1;
    private desiredUpdateCounter = 0;
    private desiredChunkKeys = new Set<string>();

  private workers: WorkerSlot[] = [];
  private nextWorkerIndex = 0;
  private nextWorkerId = 0;
  private workersEnabled = WORKERS_ENABLED;
  private workerStatusMessage = "Initializing...";
  private workerRecoveryTimer: ReturnType<typeof setTimeout> | null = null;
  // Which worker slot each in-flight job was dispatched to, so a crashed
  // worker's jobs can be requeued immediately instead of waiting for timeouts.
  private genDispatchedTo = new Map<string, number>();
  private meshDispatchedTo = new Map<string, number>();
  // Configured concurrency ceilings; MAX_*_IN_FLIGHT may be temporarily lowered
  // after allocation-related worker failures and recovers with successful jobs.
  private BASE_GEN_IN_FLIGHT = 3;
  private BASE_MESH_IN_FLIGHT = 2;
  private throttleRecoveryProgress = 0;
    private streamingPumpScheduled = false;
    private desiredChunkList: string[] = [];
    private desiredChunkCursor = 0;
    private desiredCenter = { cx: 0, cz: 0 };
    private genStartedAt = new Map<string, number>();
    private meshStartedAt = new Map<string, number>();
    private genTicketCounter = 0;
    private meshTicketCounter = 0;
    private activeGenTickets = new Map<string, number>();
    private activeMeshTickets = new Map<string, number>();
  
  private messageListeners = new Set<MessageCallback>();
  private dropListeners = new Set<DropCallback>();
  private particleListeners = new Set<ParticleCallback>();

  private activeSeed: number = 0;
  private activeWorldId: string | null = null; // ID of the currently loaded world
  private gcCounter: number = 0; // Counter for periodic garbage collection

  private queuesDirty = false;
  private knownMissingStorageChunks = new Set<string>();

  // Dark-face culling: chunks beyond this chebyshev distance are meshed without
  // fully-unlit (cave) faces, enclosed geometry is only visible from inside the
  // cave, i.e. when the chunk is near. Tracks which READY meshes were built
  // culled so they can be remeshed in full when the player approaches.
  // Kept large enough that caves render across the near/mid view (they were
  // vanishing just 3-4 chunks out); only the far ring gets the cheap cull.
  private static readonly DARK_CULL_DISTANCE = 8;
  private darkCulledMeshes = new Set<string>();
  private pendingMeshDark = new Map<string, boolean>();
  
  // Persistence Tracking
  private dirtyChunks = new Set<string>();
  // Per-chunk edit counter, bumped on every dirty-marking edit. The batch save
  // snapshots it per chunk and only clears the dirty flag when it is unchanged,
  // so an edit landing while the async flush is in flight keeps its chunk dirty
  // (and is re-saved next pass) instead of being silently lost.
  private dirtyEditVersion = new Map<string, number>();
  private saving = false; // guards processSaveQueue against overlapping runs

  constructor() {
    this.state = WorldTypes.createWorldState();

        const cpuCores = typeof navigator !== 'undefined' && navigator.hardwareConcurrency
            ? navigator.hardwareConcurrency
            : 4;
        this.MAX_GEN_IN_FLIGHT = Math.min(8, Math.max(3, Math.floor(cpuCores * 0.75)));
        this.MAX_MESH_IN_FLIGHT = Math.min(4, Math.max(2, Math.floor(cpuCores / 2)));
        this.BASE_GEN_IN_FLIGHT = this.MAX_GEN_IN_FLIGHT;
        this.BASE_MESH_IN_FLIGHT = this.MAX_MESH_IN_FLIGHT;

    if (this.workersEnabled) {
        this.initWorkers();
    } else {
        this.workerStatusMessage = "Workers Disabled";
    }

    // Heartbeat: catches silently hung workers (an onerror never fires for an
    // infinite loop). A worker missing consecutive pongs is restarted; its
    // in-flight jobs are requeued by restartWorker.
    setInterval(() => this.heartbeatWorkers(), WORKER_HEARTBEAT_INTERVAL_MS);

    // Auto-save every 3 seconds if dirty
    setInterval(() => this.processSaveQueue(), 3000);

    perf.registerProvider('streaming', () => this.getStreamingStats());
  }

  /**
   * Snapshot of streaming-pipeline residency and queue state for telemetry.
   * Byte figures are computed by summing actual array lengths so they stay
   * correct if storage layout changes.
   */
  public getStreamingStats(): Record<string, unknown> {
      let blockBytes = 0;
      for (const arr of this.state.chunks.values()) blockBytes += arr.byteLength;
      let lightBytes = 0;
      for (const arr of this.state.lights.values()) lightBytes += arr.byteLength;
      let metaBytes = 0;
      for (const arr of this.state.metadata.values()) metaBytes += arr.byteLength;

      let cpuMeshBytes = 0;
      for (const result of this.meshCache.values()) {
          for (const geo of [result.opaque, result.cutout, result.transparent]) {
              cpuMeshBytes += geo.positions.byteLength + geo.normals.byteLength
                  + geo.uvs.byteLength + geo.colors.byteLength + geo.indices.byteLength;
          }
      }

      return {
          residentChunks: this.state.chunks.size,
          chunkStageEntries: this.chunkStages.size,
          desiredChunks: this.desiredChunkKeys.size,
          blockBytes,
          lightBytes,
          metaBytes,
          rawChunkBytes: blockBytes + lightBytes + metaBytes,
          meshCacheEntries: this.meshCache.size,
          cpuMeshBytes,
          genQueue: this.genQueue.length,
          meshQueue: this.meshQueue.length,
          inFlightGen: this.inFlightGen,
          inFlightMesh: this.inFlightMesh,
          pendingRemesh: this.pendingRemesh.size,
          dirtyChunks: this.dirtyChunks.size,
          knownMissingStorageChunks: this.knownMissingStorageChunks.size,
          meshSubscribers: this.meshSubscribers.size,
          workers: this.workers.length,
          workersEnabled: this.workersEnabled,
          workerStatus: this.workerStatusMessage,
          workerRecoveryPending: this.workerRecoveryTimer !== null,
          maxGenInFlight: this.MAX_GEN_IN_FLIGHT,
          maxMeshInFlight: this.MAX_MESH_IN_FLIGHT,
          baseGenInFlight: this.BASE_GEN_IN_FLIGHT,
          baseMeshInFlight: this.BASE_MESH_IN_FLIGHT,
      };
  }

  /**
   * Sets the active world.
   * Call this BEFORE generating any chunks.
   */
  public setWorldContext(worldId: string, seedNum: number) {
    this.knownMissingStorageChunks.clear();
      this.activeWorldId = worldId;
      this.activeSeed = seedNum;
      
      reseedGlobalNoise(this.activeSeed);

      this.syncWorkerWorldGenState();
      
      console.log(`[WorldManager] Context set: ID=${worldId}, Seed=${this.activeSeed}`);
  }

  public getSeed(): number {
      return this.activeSeed;
  }

  public reset() {
    this.queuesDirty = false;
    this.knownMissingStorageChunks.clear();
      this.state = WorldTypes.createWorldState();
      this.chunkStages.clear();
      this.meshCache.clear();
      this.meshSubscribers.clear();
      this.pendingRemesh.clear();
      this.genQueue.clear();
      this.meshQueue.clear();
    this.queuedGenKeys.clear();
    this.queuedMeshKeys.clear();
      this.spawnPoint = null;
      this.worldSpawn = null;
      this.inFlightGen = 0;
      this.inFlightMesh = 0;
      this.gcCounter = 0;
      this.dirtyChunks.clear();
      this.dirtyEditVersion.clear();
      this.activeWorldId = null; // Clear context
    this.lastDesiredCenterKey = null;
    this.lastDesiredCount = -1;
    this.desiredUpdateCounter = 0;
    this.desiredChunkList = [];
    this.desiredChunkCursor = 0;
    this.activeGenTickets.clear();
    this.activeMeshTickets.clear();
    this.genStartedAt.clear();
    this.meshStartedAt.clear();
    this.darkCulledMeshes.clear();
    this.pendingMeshDark.clear();

      if (this.workersEnabled) {
          this.terminateWorkers();
          this.initWorkers();
      }

      this.log("World State Reset", 'success');
  }

  private initWorkers() {
      try {
            const cores = typeof navigator !== 'undefined' && navigator.hardwareConcurrency
                ? navigator.hardwareConcurrency
                : 4;
            const poolSize = Math.min(4, Math.max(2, Math.floor(cores / 2)));

            for (let i = 0; i < poolSize; i++) {
                this.workers.push(this.spawnWorkerSlot());
            }

            this.workerStatusMessage = `Workers Active (${this.workers.length})`;
            console.log(`World Worker Pool Initialized (${this.workers.length} workers)`);
      } catch (e) {
            // Worker construction itself failed (e.g. module load). Do NOT fall
            // back to main-thread generation: keep jobs queued and retry.
            console.error("Failed to init worker pool", e);
            this.workerStatusMessage = "Worker Init Failed - Retrying";
            this.scheduleWorkerRecovery();
      }
  }

  private spawnWorkerSlot(existing?: WorkerSlot): WorkerSlot {
      const worker = new Worker(
          new URL("./world/workers/world.worker.ts", import.meta.url),
          { type: "module" }
      );
      const slot: WorkerSlot = existing ?? {
          id: this.nextWorkerId++,
          worker,
          awaitingPong: false,
          missedPongs: 0,
          restartTimes: [],
          jobErrors: 0,
      };
      slot.worker = worker;
      slot.awaitingPong = false;
      slot.missedPongs = 0;

      // An uncaught worker error (not a per-job failure, those arrive as
      // JOB_ERROR) restarts only THIS worker. The rest of the pool keeps
      // running; workloads never permanently move to the main thread.
      worker.onerror = (e) => {
          console.error(`WorldWorker ${slot.id} error:`, e);
          this.restartWorker(slot, 'uncaught error');
      };
      worker.onmessage = (e) => this.handleWorkerMessage(e.data);

      worker.postMessage({ type: 'INIT', workerId: slot.id });
      const config = JSON.parse(JSON.stringify(GenConfig));
      worker.postMessage({ type: 'SET_SEED', seed: this.activeSeed });
      worker.postMessage({ type: 'SET_GEN_CONFIG', config });
      return slot;
  }

  /**
   * Requeue every in-flight job that was dispatched to `slotId` (used after a
   * worker restart — those jobs can never complete). Only jobs still inside
   * the desired set are requeued; others just release their pipeline slot.
   */
  private requeueJobsForWorker(slotId: number) {
      for (const [key, sid] of this.genDispatchedTo) {
          if (sid !== slotId) continue;
          this.genDispatchedTo.delete(key);
          if (!this.activeGenTickets.has(key)) continue;
          this.activeGenTickets.delete(key);
          this.genStartedAt.delete(key);
          this.inFlightGen = Math.max(0, this.inFlightGen - 1);
          const [cx, cz] = key.split(',').map(Number);
          if (this.desiredChunkKeys.has(key)) {
              this.setStage(cx, cz, ChunkStage.REQUESTED);
              this.enqueueGen(cx, cz, this.distancePriority(cx, cz));
          } else {
              this.setStage(cx, cz, ChunkStage.EMPTY);
          }
      }
      for (const [key, sid] of this.meshDispatchedTo) {
          if (sid !== slotId) continue;
          this.meshDispatchedTo.delete(key);
          if (!this.activeMeshTickets.has(key)) continue;
          this.activeMeshTickets.delete(key);
          this.meshStartedAt.delete(key);
          this.inFlightMesh = Math.max(0, this.inFlightMesh - 1);
          const [cx, cz] = key.split(',').map(Number);
          if (this.desiredChunkKeys.has(key) && this.getStage(cx, cz) >= ChunkStage.GENERATED) {
              this.setStage(cx, cz, ChunkStage.MESH_QUEUED);
              this.enqueueMesh(cx, cz, this.distancePriority(cx, cz));
          } else if (this.getStage(cx, cz) >= ChunkStage.GENERATED) {
              this.setStage(cx, cz, ChunkStage.GENERATED);
          }
      }
      this.markQueuesDirty();
      this.scheduleStreamingPump();
  }

  private distancePriority(cx: number, cz: number): number {
      const dx = cx - this.desiredCenter.cx;
      const dz = cz - this.desiredCenter.cz;
      return dx * dx + dz * dz;
  }

  /**
   * Restart a single failed/hung worker. Repeated restarts inside the backoff
   * window drop the worker from the pool instead (the pool shrinks); if the
   * pool empties entirely, jobs stay queued and pool recovery retries on a
   * timer. Generation/meshing never silently migrate to the main thread.
   */
  private restartWorker(slot: WorkerSlot, reason: string) {
      const idx = this.workers.indexOf(slot);
      if (idx === -1) return; // already removed
      perf.count('worker.restart');

      try { slot.worker.terminate(); } catch { /* already dead */ }

      const now = Date.now();
      slot.restartTimes = slot.restartTimes.filter(t => now - t < WORKER_RESTART_WINDOW_MS);
      slot.restartTimes.push(now);

      if (slot.restartTimes.length > WORKER_MAX_RESTARTS_IN_WINDOW) {
          console.error(`[WorldManager] Worker ${slot.id} failed ${slot.restartTimes.length} times in ${WORKER_RESTART_WINDOW_MS}ms (${reason}); removing it from the pool.`);
          perf.count('worker.removed');
          this.workers.splice(idx, 1);
          if (this.nextWorkerIndex >= this.workers.length) this.nextWorkerIndex = 0;
          this.requeueJobsForWorker(slot.id);
          if (this.workers.length === 0) {
              this.workerStatusMessage = "Workers Down - Recovering";
              this.log("World workers crashed - recovering in background", 'error');
              this.scheduleWorkerRecovery();
          } else {
              this.workerStatusMessage = `Workers Active (${this.workers.length})`;
          }
          return;
      }

      console.warn(`[WorldManager] Restarting worker ${slot.id} (${reason}).`);
      this.spawnWorkerSlot(slot);
      this.requeueJobsForWorker(slot.id);
      this.workerStatusMessage = `Workers Active (${this.workers.length})`;
  }

  /** Periodically try to rebuild an empty pool (never gives up while enabled). */
  private scheduleWorkerRecovery() {
      if (this.workerRecoveryTimer !== null) return;
      this.workerRecoveryTimer = setTimeout(() => {
          this.workerRecoveryTimer = null;
          if (!this.workersEnabled || this.workers.length > 0) return;
          perf.count('worker.recoveryAttempt');
          console.warn('[WorldManager] Attempting worker pool recovery...');
          this.initWorkers();
          if (this.workers.length > 0) {
              this.log(`Workers recovered (${this.workers.length})`, 'success');
              this.resetPipeline();
          } else {
              this.scheduleWorkerRecovery();
          }
      }, WORKER_RECOVERY_RETRY_MS);
  }

  /**
   * Test/benchmark hook: instructs every pooled worker to fail its next
   * `count` jobs (optionally as allocation errors). Lets the harness verify
   * error containment against the real pool. No effect on game behavior
   * unless explicitly invoked.
   */
  public devInjectWorkerFault(count: number = 1, kind: 'alloc' | 'generic' = 'generic') {
      for (const slot of this.workers) {
          slot.worker.postMessage({ type: 'DEBUG_FAIL_NEXT', count, kind });
      }
  }

  private heartbeatWorkers() {
      if (!this.workersEnabled) return;
      // Iterate over a copy: restartWorker may splice the array.
      for (const slot of [...this.workers]) {
          if (slot.awaitingPong) {
              slot.missedPongs++;
              if (slot.missedPongs >= WORKER_MAX_MISSED_PONGS) {
                  this.restartWorker(slot, `missed ${slot.missedPongs} heartbeats`);
                  continue;
              }
          }
          slot.awaitingPong = true;
          try {
              slot.worker.postMessage({ type: 'PING' });
          } catch {
              this.restartWorker(slot, 'postMessage failed');
          }
      }
  }

  private terminateWorkers() {
    for (const slot of this.workers) {
        slot.worker.terminate();
    }
    this.workers = [];
    this.nextWorkerIndex = 0;
    this.genDispatchedTo.clear();
    this.meshDispatchedTo.clear();
    if (this.workerRecoveryTimer !== null) {
        clearTimeout(this.workerRecoveryTimer);
        this.workerRecoveryTimer = null;
    }
  }

  /**
   * Round-robin dispatch for chunk jobs. Control messages should use broadcast
   * instead. Returns the chosen slot id (or null when no worker is available).
   */
  private postToPool(msg: unknown): number | null {
      if (this.workers.length === 0) return null;
      const slot = this.workers[this.nextWorkerIndex];
      this.nextWorkerIndex = (this.nextWorkerIndex + 1) % this.workers.length;
      slot.worker.postMessage(msg);
      return slot.id;
  }

    private syncWorkerWorldGenState() {
            if (this.workers.length === 0) return;

            const config = JSON.parse(JSON.stringify(GenConfig));
            for (const slot of this.workers) {
                slot.worker.postMessage({ type: 'SET_SEED', seed: this.activeSeed });
                slot.worker.postMessage({ type: 'SET_GEN_CONFIG', config });
            }
    }

    private scheduleStreamingPump() {
            if (this.streamingPumpScheduled) return;
            this.streamingPumpScheduled = true;
            setTimeout(() => {
                    this.streamingPumpScheduled = false;
                    this.processStreamingJobs();
          }, 0);
    }

  private resetPipeline() {
    this.queuesDirty = true;
      this.inFlightGen = 0;
      this.inFlightMesh = 0;
      this.genStartedAt.clear();
      this.meshStartedAt.clear();
      this.activeGenTickets.clear();
      this.activeMeshTickets.clear();
      this.queuedGenKeys.clear();
      this.queuedMeshKeys.clear();
      
      for (const [key, stage] of this.chunkStages) {
          if (stage === ChunkStage.GENERATING) {
              const [cx, cz] = key.split(',').map(Number);
              this.setStage(cx, cz, ChunkStage.REQUESTED);
              this.enqueueGen(cx, cz, 0);
          } else if (stage === ChunkStage.MESHING) {
              const [cx, cz] = key.split(',').map(Number);
              this.setStage(cx, cz, ChunkStage.MESH_QUEUED);
              this.enqueueMesh(cx, cz, 0);
          }
      }

      this.scheduleStreamingPump();
  }

  private getStage(cx: number, cz: number): ChunkStage {
      return this.chunkStages.get(WorldCoords.getChunkKey(cx, cz)) || ChunkStage.EMPTY;
  }

  private setStage(cx: number, cz: number, stage: ChunkStage) {
      const key = WorldCoords.getChunkKey(cx, cz);
      this.chunkStages.set(key, stage);
  }

  private handleWorkerMessage(data: any) {
      const { type, cx, cz, result, ticket } = data;

      if (type === 'PONG') {
          const slot = this.workers.find(s => s.id === data.workerId);
          if (slot) {
              slot.awaitingPong = false;
              slot.missedPongs = 0;
          }
          return;
      }
      if (type === 'JOB_ERROR') {
          this.handleJobError(data);
          return;
      }

      const key = WorldCoords.getChunkKey(cx, cz);

      if (type === 'GEN_DONE') {
          const activeTicket = this.activeGenTickets.get(key);
          if (activeTicket === undefined || ticket !== activeTicket) {
              perf.count('streaming.staleGenDiscarded');
              return;
          }
          this.activeGenTickets.delete(key);
          this.genDispatchedTo.delete(key);
          this.inFlightGen = Math.max(0, this.inFlightGen - 1);
          this.genStartedAt.delete(key);
          perf.count('streaming.genDone');
          if (typeof data.durMs === 'number') perf.duration('worker.gen', data.durMs);
          this.noteJobSuccess();
          
          WorldStore.setChunkData(this.state, cx, cz, result.blocks);
          WorldStore.setLightData(this.state, cx, cz, result.light);
          WorldStore.setMetadataData(this.state, cx, cz, result.meta);
          
          Lighting.reconcileChunkBorders(this.state, cx, cz, (ncx, ncz) => {
              if (this.getStage(ncx, ncz) >= ChunkStage.GENERATED) {
                  this.queueMesh(ncx, ncz, 10);
              }
          });

          this.setStage(cx, cz, ChunkStage.GENERATED);
          this.queueMesh(cx, cz, 0); 
          this.scheduleStreamingPump();
      }
      else if (type === 'MESH_DONE') {
          const activeTicket = this.activeMeshTickets.get(key);
          if (activeTicket === undefined || ticket !== activeTicket) {
              perf.count('streaming.staleMeshDiscarded');
              return;
          }
          this.activeMeshTickets.delete(key);
          this.meshDispatchedTo.delete(key);
          this.inFlightMesh = Math.max(0, this.inFlightMesh - 1);
          this.meshStartedAt.delete(key);
          perf.count('streaming.meshDone');
          if (typeof data.durMs === 'number') perf.duration('worker.mesh', data.durMs);
          this.noteJobSuccess();

          if (!result) {
              this.setStage(cx, cz, ChunkStage.GENERATED);
              this.queueMesh(cx, cz, 0);
              this.scheduleStreamingPump();
              return;
          }

          const wasDarkCulled = this.pendingMeshDark.get(key);
          this.pendingMeshDark.delete(key);
          if (wasDarkCulled) this.darkCulledMeshes.add(key);
          else this.darkCulledMeshes.delete(key);

          this.meshCache.set(key, result);
          this.setStage(cx, cz, ChunkStage.READY);
          
          const subs = this.meshSubscribers.get(key);
          if (subs) subs.forEach(cb => cb(result));

          const pendingPriority = this.pendingRemesh.get(key);
          if (pendingPriority !== undefined) {
              this.pendingRemesh.delete(key);
              this.queueMesh(cx, cz, pendingPriority);
              this.meshQueue.sort((a, b) => a.priority - b.priority);
          }
          this.scheduleStreamingPump();
      }
  }

  /**
   * A job failed inside a worker (caught there, reported as JOB_ERROR). The
   * worker itself is still healthy — release the pipeline slot, requeue the
   * job if it is still wanted, and throttle concurrency after allocation
   * failures. Only repeated failures restart the worker (via restartWorker's
   * own backoff); the pool is never disabled and work never permanently moves
   * to the main thread.
   */
  private handleJobError(data: {
      jobType: 'GEN' | 'MESH';
      cx: number; cz: number;
      ticket: number;
      workerId: number;
      errorName: string;
      errorMessage: string;
      allocationRelated: boolean;
      inputBytes: number;
  }) {
      const { jobType, cx, cz, ticket, workerId, errorName, errorMessage, allocationRelated, inputBytes } = data;
      const key = WorldCoords.getChunkKey(cx, cz);
      perf.count('worker.jobError');
      if (allocationRelated) perf.count('worker.allocationError');
      console.error(
          `[WorldWorker ${workerId}] ${jobType} failed for ${key}: ${errorName}: ${errorMessage}`
          + ` (input ${inputBytes} B, allocation=${allocationRelated})`
      );

      if (jobType === 'GEN') {
          if (this.activeGenTickets.get(key) === ticket) {
              this.activeGenTickets.delete(key);
              this.genDispatchedTo.delete(key);
              this.genStartedAt.delete(key);
              this.inFlightGen = Math.max(0, this.inFlightGen - 1);
              if (this.desiredChunkKeys.has(key)) {
                  this.setStage(cx, cz, ChunkStage.REQUESTED);
                  this.enqueueGen(cx, cz, this.distancePriority(cx, cz));
              } else {
                  this.setStage(cx, cz, ChunkStage.EMPTY);
              }
          }
      } else if (jobType === 'MESH') {
          if (this.activeMeshTickets.get(key) === ticket) {
              this.activeMeshTickets.delete(key);
              this.meshDispatchedTo.delete(key);
              this.meshStartedAt.delete(key);
              this.inFlightMesh = Math.max(0, this.inFlightMesh - 1);
              this.pendingMeshDark.delete(key);
              if (this.getStage(cx, cz) >= ChunkStage.GENERATED) {
                  if (this.desiredChunkKeys.has(key)) {
                      this.setStage(cx, cz, ChunkStage.MESH_QUEUED);
                      this.enqueueMesh(cx, cz, this.distancePriority(cx, cz));
                  } else {
                      this.setStage(cx, cz, ChunkStage.GENERATED);
                  }
              }
          }
      }

      if (allocationRelated) {
          // Memory pressure: halve concurrency (recovers with successful jobs)
          // and restart the reporting worker to release its scratch buffers.
          this.MAX_GEN_IN_FLIGHT = Math.max(1, this.MAX_GEN_IN_FLIGHT >> 1);
          this.MAX_MESH_IN_FLIGHT = Math.max(1, this.MAX_MESH_IN_FLIGHT >> 1);
          this.throttleRecoveryProgress = 0;
          console.warn(`[WorldManager] Allocation failure in worker ${workerId}; concurrency now gen=${this.MAX_GEN_IN_FLIGHT} mesh=${this.MAX_MESH_IN_FLIGHT}.`);
          const slot = this.workers.find(s => s.id === workerId);
          if (slot) this.restartWorker(slot, 'allocation failure');
      } else {
          const slot = this.workers.find(s => s.id === workerId);
          if (slot) {
              slot.jobErrors++;
              // A worker drowning in job errors is likely corrupted state;
              // restart it (backoff inside restartWorker caps the churn).
              if (slot.jobErrors % 5 === 0) this.restartWorker(slot, `${slot.jobErrors} job errors`);
          }
      }

      this.markQueuesDirty();
      this.scheduleStreamingPump();
  }

  /** Gradually restores concurrency lowered after allocation failures. */
  private noteJobSuccess() {
      if (this.MAX_GEN_IN_FLIGHT >= this.BASE_GEN_IN_FLIGHT && this.MAX_MESH_IN_FLIGHT >= this.BASE_MESH_IN_FLIGHT) return;
      this.throttleRecoveryProgress++;
      if (this.throttleRecoveryProgress >= THROTTLE_RECOVERY_SUCCESSES) {
          this.throttleRecoveryProgress = 0;
          if (this.MAX_GEN_IN_FLIGHT < this.BASE_GEN_IN_FLIGHT) this.MAX_GEN_IN_FLIGHT++;
          if (this.MAX_MESH_IN_FLIGHT < this.BASE_MESH_IN_FLIGHT) this.MAX_MESH_IN_FLIGHT++;
      }
  }

  private enqueueGen(cx: number, cz: number, priority: number) {
    const key = WorldCoords.getChunkKey(cx, cz);
    if (this.queuedGenKeys.has(key)) {
        const existing = this.genQueue.find(j => j.cx === cx && j.cz === cz);
        if (existing && priority < existing.priority) {
            existing.priority = priority;
            this.markQueuesDirty();
        }
        return;
    }
    this.queuedGenKeys.add(key);
    this.genQueue.push({ cx, cz, priority });
    this.markQueuesDirty();
  }

  private enqueueMesh(cx: number, cz: number, priority: number) {
    const key = WorldCoords.getChunkKey(cx, cz);
    if (this.queuedMeshKeys.has(key)) {
        const existing = this.meshQueue.find(j => j.cx === cx && j.cz === cz);
        if (existing && priority < existing.priority) {
            existing.priority = priority;
            this.markQueuesDirty();
        }
        return;
    }
    this.queuedMeshKeys.add(key);
    this.meshQueue.push({ cx, cz, priority });
    this.markQueuesDirty();
  }

  private queueGen(cx: number, cz: number, priority: number) {
      if (this.getStage(cx, cz) >= ChunkStage.REQUESTED) return;
      this.setStage(cx, cz, ChunkStage.REQUESTED);
      this.enqueueGen(cx, cz, priority);
  }

  private queueMesh(cx: number, cz: number, priority: number) {
      const stage = this.getStage(cx, cz);
      if (stage < ChunkStage.GENERATED) return; 
      
      const key = WorldCoords.getChunkKey(cx, cz);

      if (stage === ChunkStage.MESHING) {
          const prev = this.pendingRemesh.get(key);
          if (prev === undefined || priority < prev) {
              this.pendingRemesh.set(key, priority);
          }
          return;
      }

      if (stage === ChunkStage.MESH_QUEUED) {
          // Using .find() instead of array.find()
          const job = this.meshQueue.find(j => j.cx === cx && j.cz === cz);
          if (job && priority < job.priority) {
            job.priority = priority;
            this.markQueuesDirty();
          }
          return;
      }
      
      this.setStage(cx, cz, ChunkStage.MESH_QUEUED);
      this.enqueueMesh(cx, cz, priority);
  }

  public setDesiredChunks(chunks: {cx: number, cz: number}[]) {
      const center = chunks.length > 0 ? chunks[0] : { cx: 0, cz: 0 };
      const centerKey = WorldCoords.getChunkKey(center.cx, center.cz);

      if (this.lastDesiredCenterKey === centerKey && this.lastDesiredCount === chunks.length) {
          return;
      }

      this.lastDesiredCenterKey = centerKey;
      this.lastDesiredCount = chunks.length;
      this.desiredUpdateCounter++;
    this.desiredCenter = { cx: center.cx, cz: center.cz };

      const wantedKeys = new Set<string>();
      for (let i = 0; i < chunks.length; i++) {
          const { cx, cz } = chunks[i];
          const priority = i;
          const key = WorldCoords.getChunkKey(cx, cz);
          
          wantedKeys.add(key);

          let stage = this.getStage(cx, cz);
          const hasChunkData = !!WorldStore.getChunkData(this.state, cx, cz);

          if (!hasChunkData && stage >= ChunkStage.GENERATED) {
              this.setStage(cx, cz, ChunkStage.EMPTY);
              stage = ChunkStage.EMPTY;
          }

          if (stage === ChunkStage.EMPTY) {
              this.queueGen(cx, cz, priority);
          } else if (stage === ChunkStage.REQUESTED) {
              this.enqueueGen(cx, cz, priority);
          } else if (stage >= ChunkStage.GENERATED && stage < ChunkStage.READY) {
              this.queueMesh(cx, cz, priority);
          } else if (stage === ChunkStage.READY && !this.meshCache.has(key)) {
              this.queueMesh(cx, cz, priority);
          } else if (stage === ChunkStage.READY && this.darkCulledMeshes.has(key)) {
              // Player approached a chunk meshed with dark-face culling, rebuild the
              // full mesh (with cave interiors) before they can see inside.
              const distCheb = Math.max(Math.abs(cx - center.cx), Math.abs(cz - center.cz));
              if (distCheb <= WorldManager.DARK_CULL_DISTANCE - 1) {
                  this.queueMesh(cx, cz, priority);
              }
          }
      }

      this.desiredChunkKeys = wantedKeys;
      this.desiredChunkList = Array.from(wantedKeys);
      if (this.desiredChunkCursor >= this.desiredChunkList.length) {
          this.desiredChunkCursor = 0;
      }

      let maxDesiredDistSq = 0;
      for (const c of chunks) {
          const dx = c.cx - center.cx;
          const dz = c.cz - center.cz;
          const dSq = dx * dx + dz * dz;
          if (dSq > maxDesiredDistSq) maxDesiredDistSq = dSq;
      }

      const shouldRunEvictionScan = this.desiredUpdateCounter % 6 === 0;
      if (shouldRunEvictionScan && this.chunkStages.size > chunks.length) {
          let evicted = 0;
          let deferredDirty = false;
          const maxEvictionsPerPass = 16;
          const unloadRadius = Math.sqrt(maxDesiredDistSq) + 2;

          for (const [key, _stage] of this.chunkStages) {
              if (!wantedKeys.has(key)) {
                  const [kcx, kcz] = key.split(',').map(Number);
                  const dist = Math.sqrt((kcx - center.cx)**2 + (kcz - center.cz)**2);
                  if (dist > unloadRadius) {
                      // evict() returns false for a still-dirty chunk (it stays loaded);
                      // only count real unloads toward the per-pass budget.
                      if (this.evict(kcx, kcz)) {
                          evicted++;
                          if (evicted >= maxEvictionsPerPass) break;
                      } else {
                          deferredDirty = true;
                      }
                  }
              }
          }
          // Persist any chunks we couldn't evict because they were dirty, so they
          // become evictable on a later pass instead of lingering in memory.
          if (deferredDirty && this.activeWorldId) void this.processSaveQueue();
      }
  }

  public processStreamingJobs() {
    this.sortQueuesIfDirty();
      this.repairDesiredChunks(64);

      // Pool down (workers enabled but every worker crashed): keep jobs queued
      // until recovery restores the pool. Generation/meshing must not silently
      // migrate to the main thread — that was the old failure mode that froze
      // the game after a single worker error.
      const poolDown = this.workersEnabled && this.workers.length === 0;

      while (!poolDown && this.inFlightGen < this.MAX_GEN_IN_FLIGHT && this.genQueue.length > 0) {
          const job = this.genQueue.shift();
          if (!job) break;
          this.queuedGenKeys.delete(WorldCoords.getChunkKey(job.cx, job.cz));
          
          if (this.getStage(job.cx, job.cz) !== ChunkStage.REQUESTED) continue;

          const key = WorldCoords.getChunkKey(job.cx, job.cz);
          if (!this.desiredChunkKeys.has(key)) {
              this.setStage(job.cx, job.cz, ChunkStage.EMPTY);
              continue;
          }

          this.inFlightGen++;
          this.setStage(job.cx, job.cz, ChunkStage.GENERATING);
          this.genStartedAt.set(key, Date.now());
          const ticket = ++this.genTicketCounter;
          this.activeGenTickets.set(key, ticket);
          
          // Persistence Check: Try load from DB before asking worker to generate
          // MUST have an active world ID to load
        if (this.activeWorldId) {
            if (this.knownMissingStorageChunks.has(key)) {
                this.triggerWorkerGen(job.cx, job.cz, ticket);
            } else {
                WorldStorage.loadChunk(this.activeWorldId, job.cx, job.cz).then(data => {
                    if (this.activeGenTickets.get(key) !== ticket) return;

                    if (data) {
                        this.knownMissingStorageChunks.delete(key);
                        this.handleWorkerMessage({
                            type: 'GEN_DONE',
                            cx: job.cx,
                            cz: job.cz,
                            ticket,
                            result: { blocks: data.blocks, light: data.light, meta: data.meta }
                        });
                    } else {
                        this.knownMissingStorageChunks.add(key);
                        this.triggerWorkerGen(job.cx, job.cz, ticket);
                    }
                }).catch((error) => {
                    console.warn(`[WorldManager] Failed to load chunk ${job.cx},${job.cz} from storage. Falling back to generation.`, error);
                    if (this.activeGenTickets.get(key) === ticket) {
                        this.triggerWorkerGen(job.cx, job.cz, ticket);
                    }
                });
            }
        } else {
            this.triggerWorkerGen(job.cx, job.cz, ticket);
        }
      }

      while (!poolDown && this.inFlightMesh < this.MAX_MESH_IN_FLIGHT && this.meshQueue.length > 0) {
          const job = this.meshQueue.shift();
          if (!job) break;
          this.queuedMeshKeys.delete(WorldCoords.getChunkKey(job.cx, job.cz));

          const stage = this.getStage(job.cx, job.cz);
          if (stage !== ChunkStage.MESH_QUEUED) continue; 

          const key = WorldCoords.getChunkKey(job.cx, job.cz);
          if (!this.desiredChunkKeys.has(key)) {
              this.setStage(job.cx, job.cz, ChunkStage.GENERATED);
              continue;
          }

          const c = WorldStore.getChunkData(this.state, job.cx, job.cz);
          if (!c) {
              this.setStage(job.cx, job.cz, ChunkStage.REQUESTED);
              this.queueGen(job.cx, job.cz, job.priority);
              continue;
          }

          let m = WorldStore.getMetadataData(this.state, job.cx, job.cz);
          if (!m) {
              m = new Uint8Array(c.length);
              WorldStore.setMetadataData(this.state, job.cx, job.cz, m);
          }

          let l = WorldStore.getLightData(this.state, job.cx, job.cz);
          if (!l) {
              l = new Uint8Array(c.length);
              l.fill(15 << 4);
              WorldStore.setLightData(this.state, job.cx, job.cz, l);
          }

          this.inFlightMesh++;
          this.setStage(job.cx, job.cz, ChunkStage.MESHING);
          this.meshStartedAt.set(key, Date.now());
          const ticket = ++this.meshTicketCounter;
          this.activeMeshTickets.set(key, ticket);

          const cullDark = Math.max(
              Math.abs(job.cx - this.desiredCenter.cx),
              Math.abs(job.cz - this.desiredCenter.cz)
          ) > WorldManager.DARK_CULL_DISTANCE;
          this.pendingMeshDark.set(key, cullDark);

              const neighbors = {
                  left: WorldStore.getChunkData(this.state, job.cx-1, job.cz),
                  right: WorldStore.getChunkData(this.state, job.cx+1, job.cz),
                  front: WorldStore.getChunkData(this.state, job.cx, job.cz+1),
                  back: WorldStore.getChunkData(this.state, job.cx, job.cz-1)
              };
              const neighborLights = {
                  center: l,
                  left: WorldStore.getLightData(this.state, job.cx-1, job.cz),
                  right: WorldStore.getLightData(this.state, job.cx+1, job.cz),
                  front: WorldStore.getLightData(this.state, job.cx, job.cz+1),
                  back: WorldStore.getLightData(this.state, job.cx, job.cz-1)
              };

              if (this.workersEnabled && this.workers.length > 0) {
                  let inputBytes = c.byteLength + m.byteLength + l.byteLength;
                  for (const n of [neighbors.left, neighbors.right, neighbors.front, neighbors.back]) {
                      if (n) inputBytes += n.byteLength;
                  }
                  for (const n of [neighborLights.left, neighborLights.right, neighborLights.front, neighborLights.back]) {
                      if (n) inputBytes += n.byteLength;
                  }
                  perf.count('streaming.meshInputBytes', inputBytes);
                  const slotId = this.postToPool({
                      type: 'MESH',
                      id: `mesh-${job.cx}-${job.cz}`,
                      cx: job.cx,
                      cz: job.cz,
                      ticket,
                      chunk: c,
                      metaData: m,
                      neighbors,
                      lights: neighborLights,
                      cullDarkFaces: cullDark
                  });
                  if (slotId !== null) this.meshDispatchedTo.set(key, slotId);
              } else {
                  perf.count('streaming.mainThreadMesh');
                  setTimeout(() => {
                      if (this.activeMeshTickets.get(key) !== ticket) return;
                      const res = Geometry.generateGeometryData(job.cx, job.cz, c, m, neighbors, neighborLights, cullDark);
                      this.handleWorkerMessage({ type: 'MESH_DONE', cx: job.cx, cz: job.cz, ticket, result: res });
                  }, 0);
              }
      }

      // Garbage Collection Sweep
      this.gcCounter++;
      if (this.gcCounter >= 200) {
          this.gcCounter = 0;
          for (const key of this.meshSubscribers.keys()) {
              if (!this.chunkStages.has(key)) {
                  this.meshSubscribers.delete(key);
              }
          }
      }
  }

  private repairDesiredChunks(budget: number) {
      const total = this.desiredChunkList.length;
      if (total === 0) return;

      const now = Date.now();
      const maxChecks = Math.max(1, Math.min(budget, total));

      for (let i = 0; i < maxChecks; i++) {
          const idx = this.desiredChunkCursor % total;
          this.desiredChunkCursor = (this.desiredChunkCursor + 1) % total;

          const key = this.desiredChunkList[idx];
          if (!this.desiredChunkKeys.has(key)) continue;

          const [cx, cz] = key.split(',').map(Number);
          const stage = this.getStage(cx, cz);
          const chunk = WorldStore.getChunkData(this.state, cx, cz);
          const priority = (cx - this.desiredCenter.cx) * (cx - this.desiredCenter.cx) + (cz - this.desiredCenter.cz) * (cz - this.desiredCenter.cz);

          if (!chunk) {
              if (stage >= ChunkStage.GENERATED) {
                  this.setStage(cx, cz, ChunkStage.EMPTY);
                  this.meshCache.delete(key);
                  this.pendingRemesh.delete(key);
                  this.genStartedAt.delete(key);
                  this.meshStartedAt.delete(key);
              }

              if (this.getStage(cx, cz) === ChunkStage.EMPTY) {
                  this.queueGen(cx, cz, priority);
              } else if (this.getStage(cx, cz) === ChunkStage.REQUESTED) {
                  this.enqueueGen(cx, cz, priority);
              }
              continue;
          }

          if (stage === ChunkStage.GENERATED) {
              this.queueMesh(cx, cz, priority);
          } else if (stage === ChunkStage.MESH_QUEUED) {
              this.enqueueMesh(cx, cz, priority);
          } else if (stage === ChunkStage.READY && !this.meshCache.has(key)) {
              this.queueMesh(cx, cz, priority);
          }

          if (stage === ChunkStage.GENERATING) {
              const startedAt = this.genStartedAt.get(key) ?? now;
              if (now - startedAt > 10000) {
                  this.inFlightGen = Math.max(0, this.inFlightGen - 1);
                  this.genStartedAt.delete(key);
                  this.activeGenTickets.delete(key);
                  this.genDispatchedTo.delete(key);
                  this.setStage(cx, cz, ChunkStage.REQUESTED);
                  this.enqueueGen(cx, cz, priority);
              }
          } else if (stage === ChunkStage.MESHING) {
              const startedAt = this.meshStartedAt.get(key) ?? now;
              if (now - startedAt > 10000) {
                  this.inFlightMesh = Math.max(0, this.inFlightMesh - 1);
                  this.meshStartedAt.delete(key);
                  this.activeMeshTickets.delete(key);
                  this.meshDispatchedTo.delete(key);
                  this.setStage(cx, cz, ChunkStage.MESH_QUEUED);
                  this.enqueueMesh(cx, cz, priority);
              }
          }
      }
  }

  private triggerWorkerGen(cx: number, cz: number, ticket: number) {
      const key = WorldCoords.getChunkKey(cx, cz);
      if (this.workersEnabled && this.workers.length > 0) {
          const slotId = this.postToPool({ type: 'GEN', id: `gen-${cx}-${cz}`, cx, cz, ticket });
          if (slotId !== null) this.genDispatchedTo.set(key, slotId);
      } else if (this.workersEnabled) {
          // Pool is down (async storage-miss callback raced a pool crash):
          // roll the job back into the queue and let pool recovery re-dispatch.
          if (this.activeGenTickets.get(key) === ticket) {
              this.activeGenTickets.delete(key);
              this.genStartedAt.delete(key);
              this.inFlightGen = Math.max(0, this.inFlightGen - 1);
              this.setStage(cx, cz, ChunkStage.REQUESTED);
              this.enqueueGen(cx, cz, this.distancePriority(cx, cz));
          }
      } else {
          // Workers explicitly disabled by the user/config: main-thread path.
          perf.count('streaming.mainThreadGen');
          setTimeout(() => {
              if (this.activeGenTickets.get(key) !== ticket) return;
              const res = WorldGen.generateChunk(cx, cz);
              this.handleWorkerMessage({ type: 'GEN_DONE', cx, cz, ticket, result: res });
          }, 0);
      }
  }

  public async forceSave() {
      await this.processSaveQueue();
  }

  /** True when there are unsaved chunk edits (lets callers skip no-op autosaves). */
  public hasUnsavedChunks(): boolean {
      return this.dirtyChunks.size > 0;
  }

  private markDirty(key: string): void {
      this.dirtyChunks.add(key);
      this.dirtyEditVersion.set(key, (this.dirtyEditVersion.get(key) ?? 0) + 1);
  }

  private async processSaveQueue() {
      // Re-entrancy guard: the 3s timer and an explicit forceSave can overlap.
      if (this.saving) return;
      if (this.dirtyChunks.size === 0 || !this.activeWorldId) return;

      this.saving = true;
      const worldId = this.activeWorldId;
      try {
          // Snapshot the dirty set and build ONE batch. The backend groups chunks
          // by region and commits per region (payload-before-header). Dirty flags
          // are cleared only AFTER the write succeeds; on failure they remain dirty
          // so the chunks are retried on the next pass (no silent data loss).
          const keys = Array.from(this.dirtyChunks);
          const batch: Array<{ cx: number; cz: number; blocks: Uint8Array; light: Uint8Array; meta: Uint8Array }> = [];
          const savedKeys: Array<{ key: string; version: number }> = [];
          for (const key of keys) {
              const [cx, cz] = key.split(',').map(Number);
              const blocks = WorldStore.getChunkData(this.state, cx, cz);
              const light = WorldStore.getLightData(this.state, cx, cz);
              const meta = WorldStore.getMetadataData(this.state, cx, cz);
              if (blocks && light && meta) {
                  batch.push({ cx, cz, blocks, light, meta });
                  savedKeys.push({ key, version: this.dirtyEditVersion.get(key) ?? 0 });
              }
          }
          if (batch.length === 0) return;

          const saveStart = performance.now();
          await WorldStorage.saveChunks(worldId, batch);
          perf.duration('storage.saveBatch', performance.now() - saveStart);
          perf.count('storage.chunksSaved', batch.length);

          for (const s of savedKeys) {
              this.knownMissingStorageChunks.delete(s.key); // now known to exist on disk
              // Clear the flag only if no NEW edit landed while the write was in
              // flight, an edit made after the snapshot may have missed the
              // backend's copy, so the chunk stays dirty and re-saves next pass.
              if ((this.dirtyEditVersion.get(s.key) ?? 0) === s.version) {
                  this.dirtyChunks.delete(s.key);
                  this.dirtyEditVersion.delete(s.key);
              }
          }
      } catch (e) {
          perf.count('storage.saveBatchFailed');
          console.error('[WorldManager] Chunk batch save failed; chunks stay dirty for retry.', e);
      } finally {
          this.saving = false;
      }
  }

  /**
   * Unload a chunk from memory. Returns false (and unloads NOTHING) if the chunk
   * still has unsaved edits, we never drop a dirty chunk, because a failed save
   * would then lose those edits with no copy left in memory to retry from. The
   * chunk stays loaded + dirty; processSaveQueue() persists it (clearing the dirty
   * flag only on success, exactly like the normal batch path), after which a later
   * eviction pass can safely drop it.
   */
  private evict(cx: number, cz: number): boolean {
      const key = WorldCoords.getChunkKey(cx, cz);

      if (this.dirtyChunks.has(key)) {
          perf.count('streaming.evictDeferredDirty');
          return false; // defer, keep the dirty key + chunk data until confirmed persisted
      }

      perf.count('streaming.evicted');
      WorldStore.evictChunk(this.state, cx, cz);
      this.chunkStages.delete(key);
      this.meshCache.delete(key);
      this.pendingRemesh.delete(key);
      this.meshSubscribers.delete(key);
      this.queuedGenKeys.delete(key);
      this.queuedMeshKeys.delete(key);
      this.genStartedAt.delete(key);
      this.meshStartedAt.delete(key);
      // An in-flight gen/mesh for this chunk can never complete once its ticket
      // is deleted (handleWorkerMessage early-returns before its decrement), so
      // release the worker slot here, mirroring the repair-timeout path. Without
      // this, every eviction of an in-flight chunk permanently burned a slot and
      // fast traversal eventually stalled streaming at MAX_*_IN_FLIGHT.
      if (this.activeGenTickets.delete(key)) this.inFlightGen = Math.max(0, this.inFlightGen - 1);
      if (this.activeMeshTickets.delete(key)) this.inFlightMesh = Math.max(0, this.inFlightMesh - 1);
      this.genDispatchedTo.delete(key);
      this.meshDispatchedTo.delete(key);
      this.knownMissingStorageChunks.delete(key);
      this.darkCulledMeshes.delete(key);
      this.pendingMeshDark.delete(key);
      // Workers are stateless, no per-chunk eviction message needed.
      return true;
  }

  public async preloadSpawnArea(centerCx: number, centerCz: number, radius: number, onProgress: LoadingProgressCallback) {
      const chunks: {cx: number, cz: number}[] = [];
      for (let r = 0; r <= radius; r++) {
          for (let x = -r; x <= r; x++) {
              for (let z = -r; z <= r; z++) {
                  if (Math.abs(x) === r || Math.abs(z) === r) {
                      chunks.push({ cx: centerCx + x, cz: centerCz + z });
                  }
              }
          }
      }
      if (chunks.length === 0) chunks.push({ cx: centerCx, cz: centerCz });
      
      let genDone = 0;
      const total = chunks.length;

      // Preload requires these chunks to be considered desired; otherwise processStreamingJobs
      // can discard REQUESTED jobs before they are generated.
      this.setDesiredChunks(chunks);

      onProgress('Terrain', 0, total, 0);
      await new Promise<void>(resolve => {
          const check = () => {
              genDone = 0;
              let allGen = true;
              for (const c of chunks) {
                  const s = this.getStage(c.cx, c.cz);
                  if (s >= ChunkStage.GENERATED) genDone++;
                  else allGen = false;
              }
              onProgress('Terrain', genDone, total, Math.floor((genDone / total) * 100));
              if (allGen) resolve();
              else setTimeout(check, 50);
          };
          check();
      });

      const meshTargets = chunks.filter(c => 
          Math.abs(c.cx - centerCx) < radius && Math.abs(c.cz - centerCz) < radius
      );
      const meshTotal = meshTargets.length;
      let meshDone = 0;
      onProgress('Meshing', 0, meshTotal, 0);
      if (meshTotal === 0) {
          onProgress('Meshing', 0, 0, 100);
          return;
      }
      await new Promise<void>(resolve => {
          const check = () => {
              meshDone = 0;
              let allMeshed = true;
              for (const c of meshTargets) {
                  const s = this.getStage(c.cx, c.cz);
                  if (s === ChunkStage.READY) meshDone++;
                  else allMeshed = false;
              }
              onProgress('Meshing', meshDone, meshTotal, Math.floor((meshDone / meshTotal) * 100));
              if (allMeshed) resolve();
              else setTimeout(check, 50);
          };
          check();
      });
  }

  /**
   * Scans the generated world using deterministic noise to find the exact surface height.
   * This guarantees a valid spawn Y regardless of chunk load state or race conditions.
   * 
   * It prioritizes finding land (height > 63) in a spiral. 
   * If only water is found, it spawns on the water surface (64).
   */
  /**
   * Resolve a genuine standing Y from the ACTUAL placed blocks at a column (not
   * just the noise height), so a spawn never lands inside a tree, structure, or
   * overhang. Finds the highest collidable block that has two non-solid cells
   * above it and returns the cell on top of it. Falls back to noiseHeight+2.
   * Shared by every spawn (world entry + respawn) so they behave identically.
   */
  public resolveClearStandY(x: number, z: number): number {
      const bx = Math.floor(x), bz = Math.floor(z);
      this.ensureChunk(Math.floor(bx / CHUNK_SIZE), Math.floor(bz / CHUNK_SIZE));
      const isSolid = (t: BlockType): boolean => {
          if (t === BlockType.AIR || t === BlockType.WATER || t === BlockType.LAVA) return false;
          const d = BLOCKS[t];
          return !!d && !d.noCollision;
      };
      // A cell the player can occupy: air, or a non-solid non-hazard (plants).
      const isFree = (t: BlockType): boolean => {
          if (t === BlockType.LAVA) return false;
          if (t === BlockType.AIR || t === BlockType.WATER) return true;
          const d = BLOCKS[t];
          return !!d && !!d.noCollision;
      };
      const noiseH = WorldGen.getTerrainHeight(bx, bz);
      const top = Math.min(MAX_Y - 3, noiseH + 48);
      for (let y = top; y > MIN_Y + 1; y--) {
          if (isSolid(this.getBlock(bx, y, bz, false))
              && isFree(this.getBlock(bx, y + 1, bz, false))
              && isFree(this.getBlock(bx, y + 2, bz, false))) {
              return y + 1;
          }
      }
      return noiseH + 2;
  }

  public findSafeSpawnPosition(targetX: number, targetZ: number): { x: number, y: number, z: number } {
      const seaLevel = GenConfig.height.seaLevel;
      const { safeSearchRadius, safeSearchStep } = GenConfig.spawn;
      
      // Force Ensure Center Chunk exists so collision works immediately
      const centerCx = Math.floor(targetX / CHUNK_SIZE);
      const centerCz = Math.floor(targetZ / CHUNK_SIZE);
      this.ensureChunk(centerCx, centerCz);

      // Three buckets: scored > land > water
      let scored: { x: number, z: number, y: number, score: number } | null = null;
      let land: { x: number, z: number, y: number, landScore: number } | null = null;
      let water: { x: number, z: number, dist2: number } | null = null;

      // Lightweight fallback land ranking: prefer flat, close, moderate elevation.
      // Returns a higher value for better candidates. Does NOT call scoreSpawnCandidate.
      const scoreFallbackLand = (x: number, z: number, h: number): number => {
          const slopeStep = Math.max(1, Math.min(4, safeSearchStep));
          const slope = Math.max(
              Math.abs(h - WorldGen.getTerrainHeight(x + slopeStep, z)),
              Math.abs(h - WorldGen.getTerrainHeight(x - slopeStep, z)),
              Math.abs(h - WorldGen.getTerrainHeight(x, z + slopeStep)),
              Math.abs(h - WorldGen.getTerrainHeight(x, z - slopeStep))
          );
          const dist2 = (x - targetX) * (x - targetX) + (z - targetZ) * (z - targetZ);
          const elevAboveSea = h - seaLevel;
          const preferredMin = GenConfig.spawn.preferredElevationMin;
          const preferredMax = GenConfig.spawn.preferredElevationMax;

          // Prefer elevation inside the configured band.
          // Outside the band, penalize distance from the nearest edge.
          let elevPenalty = 0;
          if (elevAboveSea < preferredMin) {
              elevPenalty = preferredMin - elevAboveSea;
          } else if (elevAboveSea > preferredMax) {
              elevPenalty = elevAboveSea - preferredMax;
          }
          // Lower slope and distance are better; negate them so higher = better
          return -(slope * 4) - Math.sqrt(dist2) * 0.5 - elevPenalty;
      };

      for (let r = 0; r <= safeSearchRadius; r += safeSearchStep) { 
          for (let dx = -r; dx <= r; dx += safeSearchStep) {
              for (let dz = -r; dz <= r; dz += safeSearchStep) {
                  if (r > 0 && Math.abs(dx) !== r && Math.abs(dz) !== r) continue;

                  const x = Math.floor(targetX + dx);
                  const z = Math.floor(targetZ + dz);
                  const h = WorldGen.getTerrainHeight(x, z);

                  const score = this.scoreSpawnCandidate(x, z);
                  if (score > 0 && (!scored || score > scored.score)) {
                      scored = { x, z, y: h, score };
                  } else if (h > seaLevel) {
                      const ls = scoreFallbackLand(x, z, h);
                      if (!land || ls > land.landScore) {
                          land = { x, z, y: h, landScore: ls };
                      }
                  } else {
                      const d2 = (x - targetX) * (x - targetX) + (z - targetZ) * (z - targetZ);
                      if (!water || d2 < water.dist2 || (d2 === water.dist2 && h > WorldGen.getTerrainHeight(water.x, water.z))) {
                          water = { x, z, dist2: d2 };
                      }
                  }
              }
          }
      }

      // Priority: scored land > any land > nearest water > emergency fallback
      const pick = scored ?? land;
      if (pick) {
          this.ensureChunk(Math.floor(pick.x / CHUNK_SIZE), Math.floor(pick.z / CHUNK_SIZE));
          // Snap to a real air gap on top of the actual surface blocks (avoids
          // spawning inside trees / structures / overhangs the noise height misses).
          const y = this.resolveClearStandY(pick.x, pick.z);
          console.log(`[Spawn] Found land at ${pick.x},${y},${pick.z}${scored ? ` (score: ${scored.score})` : ' (fallback land)'}`);
          return { x: pick.x + 0.5, y, z: pick.z + 0.5 };
      }

      if (water) {
          this.ensureChunk(Math.floor(water.x / CHUNK_SIZE), Math.floor(water.z / CHUNK_SIZE));
          console.warn(`[Spawn] No land found, spawning on water at ${water.x},${water.z}`);
          return { x: water.x + 0.5, y: seaLevel + 1.5, z: water.z + 0.5 };
      }

      // Emergency fallback, nothing scanned at all
      console.warn("[Spawn] No candidates found, emergency fallback to target.");
      return { x: targetX, y: seaLevel + 1.5, z: targetZ };
  }

  public getSeaLevel(): number {
      return GenConfig.height.seaLevel;
  }

  public scoreSpawnCandidate(x: number, z: number): number {
      const seaLevel = GenConfig.height.seaLevel;
      const biome = getBiome(x, z);
      const height = WorldGen.getTerrainHeight(x, z);

      // Reject ocean, river, and volcanic
      if (biome.id === 'ocean' || biome.id === 'frozen_ocean') return -1;
      if (biome.id === 'river' || biome.id === 'frozen_river') return -1;
      if (biome.id === 'volcanic') return -1;
      if (height <= seaLevel) return -1;

      let score = 100;

      // Prefer elevation within configured range
      const { preferredElevationMin, preferredElevationMax } = GenConfig.spawn;
      if (height >= preferredElevationMin && height <= preferredElevationMax) score += 20;
      else {
          const dist = height < preferredElevationMin
              ? preferredElevationMin - height
              : height - preferredElevationMax;
          score -= Math.min(dist, 30);
      }

      // Penalize steep slope
      const sr = GenConfig.spawn.slopePenaltyRadius;
      const h0 = height;
      const maxSlope = Math.max(
          Math.abs(h0 - WorldGen.getTerrainHeight(x + sr, z)),
          Math.abs(h0 - WorldGen.getTerrainHeight(x - sr, z)),
          Math.abs(h0 - WorldGen.getTerrainHeight(x, z + sr)),
          Math.abs(h0 - WorldGen.getTerrainHeight(x, z - sr))
      );
      score -= Math.min(maxSlope * 2, GenConfig.spawn.maxSlopePenalty);

      // Prefer friendly biomes
      if (biome.id === 'plains') score += 15;
      else if (biome.id === 'forest') score += 10;
      else if (biome.id === 'cherry_grove') score += 10;
      else if (biome.id === 'desert') score -= 5;
      else if (biome.id === 'red_mesa' || biome.id === 'mesa_bryce') score -= 5;

      return score;
  }

  public findBestInitialSpawn(): { x: number, y: number, z: number } {
      const center = getSpawnSearchCenter(this.activeSeed);
      const searchRadius = GenConfig.spawn.searchRadius;

      let bestX = center.x;
      let bestZ = center.z;
      let bestScore = -Infinity;

      // Spiral outward from seed-derived center
      for (let r = 0; r <= searchRadius; r += 32) {
          const steps = Math.max(8, Math.floor(2 * Math.PI * r / 16));
          for (let i = 0; i < steps; i++) {
              const angle = (i / steps) * Math.PI * 2;
              const x = Math.floor(center.x + Math.cos(angle) * r);
              const z = Math.floor(center.z + Math.sin(angle) * r);

              const score = this.scoreSpawnCandidate(x, z);
              if (score > bestScore) {
                  bestScore = score;
                  bestX = x;
                  bestZ = z;
              }

              // Good enough, stop early
              if (bestScore >= GenConfig.spawn.earlyAcceptScore) {
                  return this.findSafeSpawnPosition(bestX, bestZ);
              }
          }
      }

      return this.findSafeSpawnPosition(bestX, bestZ);
  }

  // Helper to synchronously force generation if missing (prevents falling through world on start)
  private markQueuesDirty() {
      this.queuesDirty = true;
  }

  private sortQueuesIfDirty() {
      if (!this.queuesDirty) return;
      this.genQueue.sort((a, b) => a.priority - b.priority);
      this.meshQueue.sort((a, b) => a.priority - b.priority);
      this.queuesDirty = false;
  }

  public ensureChunk(cx: number, cz: number) {
      if (!WorldStore.getChunkData(this.state, cx, cz)) {
          console.warn(`[WorldManager] Force-generating missing spawn chunk ${cx},${cz} synchronously.`);
          const result = WorldGen.generateChunk(cx, cz);
          WorldStore.setChunkData(this.state, cx, cz, result.blocks);
          WorldStore.setLightData(this.state, cx, cz, result.light);
          WorldStore.setMetadataData(this.state, cx, cz, result.meta);
          this.setStage(cx, cz, ChunkStage.GENERATED);
          // We don't mesh here, just ensure data exists for collision/spawn checks
      }
  }

  public subscribeMesh(cx: number, cz: number, cb: (geo: Geometry.GeometryResult | null) => void) {
      const key = WorldCoords.getChunkKey(cx, cz);
      if (!this.meshSubscribers.has(key)) {
          this.meshSubscribers.set(key, new Set());
      }
      this.meshSubscribers.get(key)!.add(cb);
      const current = this.meshCache.get(key);
      if (current) cb(current);
      return () => {
          const set = this.meshSubscribers.get(key);
          if (set) {
              set.delete(cb);
              if (set.size === 0) this.meshSubscribers.delete(key);
          }
      };
  }

  getFurnace(x: number, y: number, z: number) { return TileEntities.getFurnace(this.state, x, y, z); }
  createFurnace(x: number, y: number, z: number) { TileEntities.createFurnace(this.state, x, y, z); }
  removeFurnace(x: number, y: number, z: number) { TileEntities.removeFurnace(this.state, x, y, z); }
  getChest(x: number, y: number, z: number) { return TileEntities.getChest(this.state, x, y, z); }
  createChest(x: number, y: number, z: number) { TileEntities.createChest(this.state, x, y, z); }
  removeChest(x: number, y: number, z: number) { TileEntities.removeChest(this.state, x, y, z); }

  /**
   * Chest state for (x, y, z), created on demand. Worldgen-placed chests have no
   * tile-entity state until first opened; natural loot caches additionally carry
   * the 0x40 metadata bit, which seeds deterministic Magnetic Fields cache loot
   * exactly once (the bit is cleared so re-opening never re-rolls).
   */
  ensureChest(x: number, y: number, z: number) {
      let chest = TileEntities.getChest(this.state, x, y, z);
      if (!chest) {
          TileEntities.createChest(this.state, x, y, z);
          chest = TileEntities.getChest(this.state, x, y, z);
      }
      const meta = this.getMetadata(x, y, z);
      if (chest && (meta & 0x40) !== 0) {
          const loot = getMagneticCacheLoot(x, y, z, this.activeSeed | 0, {
              magnetiteBlock: BlockType.MAGNETITE_BLOCK,
              magnetiteBricks: BlockType.MAGNETITE_BRICKS,
              positiveCrystal: BlockType.POSITIVE_MAGNETITE_CRYSTAL,
              negativeCrystal: BlockType.NEGATIVE_MAGNETITE_CRYSTAL,
              shard: BlockType.MAGNETITE_SHARD,
              chargedMagnetite: BlockType.CHARGED_MAGNETITE,
              ironIngot: BlockType.IRON_INGOT,
              goldIngot: BlockType.GOLD_INGOT,
              diamond: BlockType.DIAMOND,
          });
          for (const entry of loot) {
              chest.items[entry.slot] = { type: entry.itemId as BlockType, count: entry.count };
          }
          this.setMetadataAt(x, y, z, meta & ~0x40);
      }
      return chest;
  }
  
  tick(delta: number) {
      this.state.time++;
      TileEntities.tickTileEntities(this.state, delta, (x,y,z) => this.getBlock(x,y,z,false), (x,y,z,t,r) => { this.setBlock(x,y,z,t,r); }, (x,y,z) => this.getMetadata(x,y,z));
      Fluids.processFluids(this.state);
      tickPlantGrowth({
          getBlock: (x, y, z) => this.getBlock(x, y, z, false),
          tryGetBlock: (x, y, z) => this.tryGetBlock(x, y, z),
          setBlock: (x, y, z, t, r) => { this.setBlock(x, y, z, t, r ?? 0); },
          getMetadata: (x, y, z) => this.getMetadata(x, y, z),
          setMetadataAt: (x, y, z, v) => this.setMetadataAt(x, y, z, v),
          getChunkData: (cx, cz) => WorldStore.getChunkData(this.state, cx, cz) ?? null,
          getTickCenter: () => this.desiredCenter,
          getSeed: () => this.activeSeed
      });
  }

  getTime(): number { return this.state.time; }
  setTime(t: number) { this.state.time = t; }
  setSpawnPoint(x: number, y: number, z: number, announce: boolean = true, message: string = "Respawn point set") {
      this.spawnPoint = { x, y, z };
      if (announce) this.log(message, 'success');
  }
  clearSpawnPoint(message: string = "Respawn point reset", type: 'info'|'error'|'success' = 'error') {
      this.spawnPoint = null;
      if (message) this.log(message, type);
  }
  getSpawnPoint() { return this.spawnPoint; }
  setWorldSpawn(x: number, y: number, z: number) { this.worldSpawn = { x, y, z }; }
  getWorldSpawn() { return this.worldSpawn; }
  
  subscribeToMessages(cb: MessageCallback) { this.messageListeners.add(cb); cb(`System: ${this.workerStatusMessage}`, this.workersEnabled ? 'success' : 'info'); return () => { this.messageListeners.delete(cb); }; }
  log(msg: string, type: 'info'|'error'|'success' = 'info', clickAction?: string) { this.messageListeners.forEach(cb => cb(msg, type, clickAction)); }
  spawnDrop(stackOrType: ItemStack | BlockType, x: number, y: number, z: number) {
      const stack = typeof stackOrType === 'number' ? { type: stackOrType, count: 1 } : stackOrType;
      this.dropListeners.forEach(cb => cb(stack, x, y, z));
  }
  subscribeToDrops(cb: DropCallback) { this.dropListeners.add(cb); return () => { this.dropListeners.delete(cb); }; }
  
  spawnParticles(type: BlockType, x: number, y: number, z: number) { this.particleListeners.forEach(cb => cb(type, x, y, z)); }
  subscribeToParticles(cb: ParticleCallback) { this.particleListeners.add(cb); return () => { this.particleListeners.delete(cb); }; }

  getTerrainHeight(x: number, z: number): number { return WorldGen.getTerrainHeight(x, z); }
  hasChunk(cx: number, cz: number): boolean { return !!WorldStore.getChunkData(this.state, cx, cz); }
  tryGetBlock(x: number, y: number, z: number): BlockType | null {
    if (y < MIN_Y || y > MAX_Y) return BlockType.AIR; 
    const { cx, cz, lx, lz } = WorldCoords.worldToChunk(x, z);
    const chunk = WorldStore.getChunkData(this.state, cx, cz);
    if (!chunk) return null; 
    return chunk[WorldCoords.index3D(lx, y, lz)];
  }
  getBlock(x: number, y: number, z: number, autoGenerate: boolean = true): BlockType {
    if (y < MIN_Y || y > MAX_Y) return BlockType.AIR; 
    const { cx, cz, lx, lz } = WorldCoords.worldToChunk(x, z);
    const chunk = this.getChunkData(cx, cz, autoGenerate);
    if (!chunk) return BlockType.AIR;
    return chunk[WorldCoords.index3D(lx, y, lz)];
  }
  getChunkData(cx: number, cz: number, autoGenerate: boolean = true): Uint8Array | null {
    const chunk = WorldStore.getChunkData(this.state, cx, cz);
    if (chunk) return chunk;
    if (autoGenerate && this.getStage(cx, cz) === ChunkStage.EMPTY) { this.queueGen(cx, cz, 0); }
    return null;
  }
  getMetadata(x: number, y: number, z: number): number {
      if (y < MIN_Y || y > MAX_Y) return 0;
      const { cx, cz, lx, lz } = WorldCoords.worldToChunk(x, z);
      const meta = WorldStore.getMetadataData(this.state, cx, cz);
      if (!meta) return 0;
      return meta[WorldCoords.index3D(lx, y, lz)];
  }
  setMetadataAt(x: number, y: number, z: number, value: number) {
      if (y < MIN_Y || y > MAX_Y) return;
      const { cx, cz, lx, lz } = WorldCoords.worldToChunk(x, z);
      const meta = WorldStore.ensureMetadata(this.state, cx, cz);
      meta[WorldCoords.index3D(lx, y, lz)] = value;
      this.markDirty(WorldCoords.getChunkKey(cx, cz));
  }
  getLoadedChunkKeys(): string[] {
      return Array.from(this.state.chunks.keys());
  }
  /**
   * Whether the player may place/break at this position. A sealed region (one
   * whose boss has not been defeated / which has not been cleansed) is read-only
   * for terrain edits; world interaction (chests, doors) is unaffected.
   */
  canEditBlock(x: number, y: number, z: number): boolean {
      const region = getRegionAt(x, y, z);
      if (!region || !region.sealedByDefault) return true;
      if (progression.isRegionCleansed(region.id)) return true;
      // Sealed-region exception: in the Magnetic Fields, the two magnetite
      // crystals are the only blocks a player may mine while the region is still
      // sealed (so Polarity Boots can be crafted before the boss). This targets
      // BREAKING a crystal, placement targets are AIR (never a crystal), so
      // placing stays denied, and other sealed regions are unaffected.
      if (region.id === MAGNETIC_FIELDS_REGION_ID) {
          const here = this.getBlock(x, y, z);
          if (SEALED_MINEABLE_BLOCKS.has(here)) return true;
      }
      return false;
  }
  getLight(x: number, y: number, z: number): { sky: number, block: number } { return Lighting.getLight(this.state, x, y, z); }
  setLight(x: number, y: number, z: number, sky: number, block: number) { Lighting.setLight(this.state, x, y, z, sky, block); }
  updateLightingAround(x: number, y: number, z: number) {
      Lighting.updateLightingAround(this.state, x, y, z, (cx, cz) => {
          WorldStore.notifyChunk(this.state, cx, cz);
          if (this.getStage(cx, cz) >= ChunkStage.GENERATED) this.queueMesh(cx, cz, 10);
      });
  }
  setBlock(x: number, y: number, z: number, type: BlockType, rotation: number = 0): ItemStack[] {
    if (y < MIN_Y || y > MAX_Y) return [];
    // NOTE: the sealed-region edit check is enforced at the player-interaction
    // layer (InteractionController), NOT here, setBlock is also the chokepoint
    // for internal world simulation (fluids, plant growth, support cascades),
    // which must keep running inside sealed regions.
    const { cx, cz, lx, lz } = WorldCoords.worldToChunk(x, z);
    const chunk = this.getChunkData(cx, cz, true);
    if (!chunk) return [];
    const index = WorldCoords.index3D(lx, y, lz);
    const oldType = chunk[index];
    const oldRotation = WorldStore.getMetadataData(this.state, cx, cz)?.[index] ?? 0;
    // Breaking an unopened natural loot cache (chest with the 0x40 meta bit):
    // seed its contents first so handleBlockReplaced spills the loot as drops
    // instead of silently discarding it.
    if (oldType === BlockType.CHEST && type !== BlockType.CHEST && (oldRotation & 0x40) !== 0) {
        this.ensureChest(x, y, z);
    }
    chunk[index] = type;
    const meta = WorldStore.ensureMetadata(this.state, cx, cz);
    meta[index] = rotation;
    const droppedItems = TileEntities.handleBlockReplaced(this.state, x, y, z, oldType, type);
    droppedItems.forEach(item => this.spawnDrop(item, x, y, z));
    if (type === BlockType.WATER || type === BlockType.LAVA) { Fluids.scheduleFluidUpdate(x, y, z, type, type === BlockType.LAVA ? 30 : 5); }
    [ [0,1,0], [0,-1,0], [1,0,0], [-1,0,0], [0,0,1], [0,0,-1] ].forEach(([dx, dy, dz]) => {
         const nx = x+dx; const ny = y+dy; const nz = z+dz;
         const nBlock = this.getBlock(nx, ny, nz, false);
         if (nBlock === BlockType.WATER || nBlock === BlockType.LAVA) { Fluids.scheduleFluidUpdate(nx, ny, nz, nBlock, nBlock === BlockType.LAVA ? 10 : 5); }
    });
    if (oldType !== type || oldRotation !== rotation) {
        // Re-resolve stair corner shapes for this cell and its horizontal neighbors
        // BEFORE relighting, so the lighting flood (radius 15) sees the updated
        // occlusion. A placed/removed stair can turn neighbors into inner/outer corners.
        this.refreshStairShapes(x, y, z);

        this.updateLightingAround(x, y, z);
        this.queueMesh(cx, cz, -1000);

        // If editing at chunk borders, prioritize neighbor remesh immediately too.
        if (lx === 0) this.queueMesh(cx - 1, cz, -900);
        else if (lx === CHUNK_SIZE - 1) this.queueMesh(cx + 1, cz, -900);
        if (lz === 0) this.queueMesh(cx, cz - 1, -900);
        else if (lz === CHUNK_SIZE - 1) this.queueMesh(cx, cz + 1, -900);

        this.markQueuesDirty();
        this.processStreamingJobs();
    } else {
        WorldStore.notifyChunk(this.state, cx, cz);
        this.queueMesh(cx, cz, -500);
        this.markQueuesDirty();
        this.processStreamingJobs();
    }

    // A type change here may have pulled the support out from a decoration above it.
    if (oldType !== type) this.breakUnsupported(x, y + 1, z);

    // Mark dirty for persistence
    this.markDirty(WorldCoords.getChunkKey(cx, cz));

    return droppedItems;
  }

  /**
   * Batch structural edits (the arena dais / shield crystals): write every block,
   * then relight and remesh ONCE rather than per block, restoring the ~100-block
   * dais was triggering ~100 full chunk remeshes and lighting floods, which lagged.
   * Skips fluid / tile-entity / support cascades, so it is for solid structural
   * blocks only, not interactive or fluid edits.
   */
  setBlocks(edits: Array<{ x: number; y: number; z: number; type: BlockType; rotation?: number }>): void {
    if (edits.length === 0) return;
    const meshChunks = new Set<string>();
    const relit: { x: number; y: number; z: number }[] = [];
    let changed = false;
    for (const e of edits) {
      if (e.y < MIN_Y || e.y > MAX_Y) continue;
      const { cx, cz, lx, lz } = WorldCoords.worldToChunk(e.x, e.z);
      const chunk = this.getChunkData(cx, cz, true);
      if (!chunk) continue;
      const index = WorldCoords.index3D(lx, e.y, lz);
      const rot = e.rotation ?? 0;
      const oldType = chunk[index];
      const oldRot = WorldStore.getMetadataData(this.state, cx, cz)?.[index] ?? 0;
      if (oldType === e.type && oldRot === rot) continue;
      chunk[index] = e.type;
      WorldStore.ensureMetadata(this.state, cx, cz)[index] = rot;
      this.markDirty(WorldCoords.getChunkKey(cx, cz));
      meshChunks.add(`${cx},${cz}`);
      if (lx === 0) meshChunks.add(`${cx - 1},${cz}`); else if (lx === CHUNK_SIZE - 1) meshChunks.add(`${cx + 1},${cz}`);
      if (lz === 0) meshChunks.add(`${cx},${cz - 1}`); else if (lz === CHUNK_SIZE - 1) meshChunks.add(`${cx},${cz + 1}`);
      // One relight flood per ~radius-13 cluster (a flood covers radius 15, and it
      // reads the final block state below, so clustered edits share one flood).
      if (!relit.some((p) => Math.abs(p.x - e.x) <= 13 && Math.abs(p.y - e.y) <= 13 && Math.abs(p.z - e.z) <= 13)) {
        relit.push({ x: e.x, y: e.y, z: e.z });
      }
      changed = true;
    }
    if (!changed) return;
    for (const p of relit) this.updateLightingAround(p.x, p.y, p.z);
    for (const key of meshChunks) {
      const [cx, cz] = key.split(',').map(Number);
      this.queueMesh(cx, cz, -1000);
    }
    this.markQueuesDirty();
    this.processStreamingJobs();
  }


  // Re-derive the corner shape (bits 3-5 of meta) of any stair at (x,y,z) and its
  // four horizontal neighbors from the current world, and store it back. Mirrors how
  // Java recomputes stair shapes on neighbor changes. Only meta bits change (never the
  // block type), so this can't recurse into setBlock; it just nudges meshing.
  private refreshStairShapes(x: number, y: number, z: number) {
    const cells = [[x, y, z], [x + 1, y, z], [x - 1, y, z], [x, y, z + 1], [x, y, z - 1]];
    for (const [cxw, cyw, czw] of cells) {
      const t = this.getBlock(cxw, cyw, czw, false);
      if (!isStairs(t)) continue;
      const m = this.getMetadata(cxw, cyw, czw);
      const facing = m & 3;
      const upside = (m & 4) === 4;
      const getNeighbor = (dx: number, dz: number): StairNeighbor | null => {
        const nt = this.getBlock(cxw + dx, cyw, czw + dz, false);
        if (!isStairs(nt)) return null;
        const nm = this.getMetadata(cxw + dx, cyw, czw + dz);
        return { back: stairBackDir(nm), upside: (nm & 4) === 4 };
      };
      const shape = resolveStairShape(facing, upside, getNeighbor);
      const newMeta = (m & 0x07) | (shape << 3); // keep facing + upside, replace shape
      if (newMeta !== m) {
        this.setMetadataAt(cxw, cyw, czw, newMeta);
        const ncx = Math.floor(cxw / CHUNK_SIZE);
        const ncz = Math.floor(czw / CHUNK_SIZE);
        if (this.getStage(ncx, ncz) >= ChunkStage.GENERATED) this.queueMesh(ncx, ncz, -800);
      }
    }
  }

  // If the block at (x,y,z) is a decoration that has lost its support, remove it
  // (dropping the item) and let the removal cascade to whatever rests on it.
  private breakUnsupported(x: number, y: number, z: number) {
    const t = this.getBlock(x, y, z, false);
    if (t === BlockType.AIR || !needsSupport(t)) return;
    const below = this.getBlock(x, y - 1, z, false);
    if (hasSupportBelow(t, below)) return;
    this.spawnDrop(t, x, y, z);
    this.setBlock(x, y, z, BlockType.AIR);
  }
  setWorkersEnabled(val: boolean) {
      if(val !== this.workersEnabled) {
          this.workersEnabled = val;
          this.resetPipeline();
          if(val) {
              this.initWorkers();
          }
          else { this.terminateWorkers(); this.workerStatusMessage = "Workers Disabled"; }
          this.scheduleStreamingPump();
      }
  }
  public locateBiome(biomeId: string, startX: number, startZ: number) {
      this.log(`Locating biome: ${biomeId}...`, 'info');
      // Cave biomes are underground region overlays (caveBiomeAt), not surface
      // climate biomes, so they're located by their region field and reported at
      // the surface above the region (dig straight down to reach the cave).
      const CAVE_REGION: Record<string, CaveBiome> = {
          lush_caves: 'lush', dripstone_caves: 'dripstone', caves: 'plain',
      };
      const caveTarget: CaveBiome | undefined = CAVE_REGION[biomeId];
      const caveNoise2D = (a: number, b: number) => GlobalNoise.cave.noise2D(a, b);
      const caveOx = GlobalNoise.offsets.cave.x, caveOz = GlobalNoise.offsets.cave.z;

      // Rare sealed boss biomes (e.g. Magnetic Fields) sit ~10k blocks apart, so
      // they need a wider search than ordinary biomes to stay reliably findable.
      const isRareBossBiome = biomeId === 'magnetic_fields';
      const SEARCH_RADIUS = isRareBossBiome ? 36000 : 5000;
      const STEP = isRareBossBiome ? 128 : 64;
      let found = false;
      let closestX = 0; let closestZ = 0;
      for (let r = 0; r < SEARCH_RADIUS; r += STEP) {
          const circumference = r === 0 ? 1 : Math.floor(2 * Math.PI * r / STEP);
          for (let i = 0; i < circumference; i++) {
              const angle = (i / circumference) * Math.PI * 2;
              const wx = startX + Math.cos(angle) * r;
              const wz = startZ + Math.sin(angle) * r;
              const match = caveTarget
                  ? caveBiomeAt(wx + caveOx, wz + caveOz, caveNoise2D, GenConfig.caves) === caveTarget
                  : getBiome(wx, wz).id === biomeId;
              if (match) { closestX = wx; closestZ = wz; found = true; break; }
          }
          if (found) break;
      }
      if (found) {
          const y = this.getTerrainHeight(closestX, closestZ) + 5;
          const tx = Math.floor(closestX); const ty = Math.floor(y); const tz = Math.floor(closestZ);
          const note = caveTarget ? ' (dig down)' : '';
          this.log(`Found ${biomeId} at X=${tx}, Z=${tz}${note}`, 'success', `/tp ${tx} ${ty} ${tz}`);
      } else { this.log(`Could not find ${biomeId} within ${SEARCH_RADIUS} blocks.`, 'error'); }
  }
}

export const worldManager = new WorldManager();
