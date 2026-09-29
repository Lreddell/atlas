
import { BlockType, ItemStack } from '../types';
import { BLOCKS } from '../data/blocks';
import * as WorldTypes from './world/worldTypes';
import * as WorldStore from './world/worldStore';
import * as WorldCoords from './world/worldCoords';
import * as WorldGen from './world/chunkGeneration';
import * as Lighting from './world/lighting';
import * as TileEntities from './world/tileEntities';
import * as Geometry from './world/geometry';
import { packMeshBorders } from './world/meshBorders';
import * as Fluids from './world/fluids';
import { getBiome } from './world/biomes';
import { caveBiomeAt, type CaveBiome } from './world/caves';
import { GlobalNoise } from '../utils/noise';
import { needsSupport, hasSupportBelow, getOpacity } from './world/blockProps';
import { clearFarmIndex, cropDrops, cropStage, isCrop, isFarmland, noteFarmland, tickFarms, untillFarmland, type FarmWorld } from './world/farming';
import { CROSS_RENDERED_BLOCKS } from '../data/spriteBlocks';
import { clearLeafDecay, noteLogRemoved, tickLeafDecay, type LeafWorld } from './world/leafDecay';
import { isLogBlock } from './registry/blockFamilies';
import { isLeafType } from './world/trees';
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
import {
    findNearestVaultCandidate,
    getVaultCandidatesTouchingBox,
    getVaultId,
    getVaultLayout,
    getVaultOpenAirSurfaceY,
    getVaultSpirePosition,
    getVaultSurfaceApproach,
    type VaultCandidate,
} from './world/resonantVaults';
import { preflightVaultCandidate } from './world/resonantVaultPreflight';
import {
    VAULT_CACHE_FLAG,
    decodeVaultCacheMetadata,
    findVaultCacheDescriptor,
    getVaultCacheLoot,
    seedVaultCache,
    type VaultCacheDescriptor,
} from './world/resonantVaultLoot';

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

export type LoadingProgressCallback = (phase: string, done: number, total: number, percent: number) => void;

type MessageCallback = (msg: string, type: 'info' | 'error' | 'success', clickAction?: string) => void;
type DropCallback = (stack: ItemStack, x: number, y: number, z: number) => void;
type ParticleCallback = (type: BlockType, x: number, y: number, z: number) => void;

const FLUID_NEIGHBOURS: readonly (readonly [number, number, number])[] = [[0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]];

/** Blocks the fluid tick has changed, waiting to be relit together. */
interface RelightBox { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number; margin: number }
/** Relit around a change that only dims or brightens light a little (water opacity 2, no light of its own). */
const FAINT_RELIGHT_MARGIN = 5;
/** Relit around anything else (lava's glow, stone, obsidian): the full reach of light. */
const FULL_RELIGHT_MARGIN = 15;
/** Widest a box of changes grows before it starts another. */
const RELIGHT_BOX_SPAN = 8;
/** Milliseconds of relighting a tick at most (at least one box always runs). */
const RELIGHT_BUDGET_MS = 3;
const lightFaint = (type: BlockType) => getOpacity(type) <= 2 && !(BLOCKS[type]?.lightLevel);

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

  private workers: Worker[] = [];
  /** Jobs sent to each worker and not yet answered. */
  private workerJobs: number[] = [];
  private nextWorkerIndex = 0;
  /**
   * Finished chunks waiting to be applied, oldest first (applyWorkerResults).
   * A dozen or more can finish between two frames; applied as each arrived,
   * all their border lighting, React updates and GPU uploads landed in the
   * next frame, which then ran long.
   */
  private workerInbox: any[] = [];
  private inboxTimer: ReturnType<typeof setTimeout> | null = null;
  private lastInboxFrameAt = 0;
  /** Mesh jobs for the player's own block edits: shown as soon as they are back, not queued. */
  private urgentMeshTickets = new Set<number>();
  /** Told when a chunk gains its first mesh or loses it (null: every chunk's changed). */
  private meshPresenceListeners = new Set<(key: string | null, present: boolean) => void>();
  private workersEnabled = WORKERS_ENABLED;
  private workerStatusMessage = "Initializing...";
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
  private vaultPreflightPromises = new Map<string, Promise<boolean>>();
  private acceptedVaultCandidates = new Set<string>();
  private rejectedVaultCandidates = new Set<string>();
  private vaultPreflightSerial: Promise<void> = Promise.resolve();

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

        // Two jobs of each kind per worker keeps every worker busy between the
        // main thread's dispatches.
        const poolSize = WorldManager.workerPoolSize();
        this.MAX_GEN_IN_FLIGHT = poolSize * 2;
        this.MAX_MESH_IN_FLIGHT = poolSize * 2;
    
    if (this.workersEnabled) {
        this.initWorkers();
    } else {
        this.workerStatusMessage = "Workers Disabled";
    }

    // Auto-save every 3 seconds if dirty
    setInterval(() => this.processSaveQueue(), 3000);
  }

  /**
   * Sets the active world.
   * Call this BEFORE generating any chunks.
   */
  public setWorldContext(worldId: string, seedNum: number) {
    this.knownMissingStorageChunks.clear();
      this.vaultPreflightPromises.clear();
      this.acceptedVaultCandidates.clear();
      this.rejectedVaultCandidates.clear();
      this.vaultPreflightSerial = Promise.resolve();
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
      this.vaultPreflightPromises.clear();
      this.acceptedVaultCandidates.clear();
      this.rejectedVaultCandidates.clear();
      this.vaultPreflightSerial = Promise.resolve();
      this.state = WorldTypes.createWorldState();
      this.chunkStages.clear();
      this.meshCache.clear();
      this.notifyMeshPresence(null, false);
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
    this.workerInbox = [];
    this.urgentMeshTickets.clear();
    this.darkCulledMeshes.clear();
    this.pendingMeshDark.clear();
    // Water still flowing in the last world must not flow on in the next.
    Fluids.clearFluidUpdates();
    clearFarmIndex();
    clearLeafDecay();
    this.pendingRelight = [];
    this.fluidJobsWaiting = false;

      if (this.workers.length > 0) {
          this.terminateWorkers();
          this.initWorkers();
      }

      this.log("World State Reset", 'success');
  }

  /**
   * One chunk worker per spare core: all but two, which the main thread and
   * the browser's GPU process need. Generation and meshing run here, so on a
   * 16-thread CPU eight workers load chunks about twice as fast as four.
   */
  private static workerPoolSize(): number {
      const cores = typeof navigator !== 'undefined' && navigator.hardwareConcurrency
          ? navigator.hardwareConcurrency
          : 4;
      return Math.min(8, Math.max(2, cores - 2));
  }

  private initWorkers() {
      try {
            const poolSize = WorldManager.workerPoolSize();

            for (let i = 0; i < poolSize; i++) {
                const worker = new Worker(
                    new URL("./world/workers/world.worker.ts", import.meta.url),
                    { type: "module" }
                );

                worker.onerror = (e) => {
                    console.error("WorldWorker Error (Disabling Workers):", e);
                    this.log("WorldWorker Failed - Switching to Main Thread", 'error');

                    this.workersEnabled = false;
                    this.terminateWorkers();
                    this.workerStatusMessage = "Workers Disabled (Error)";
                    this.resetPipeline();
                };

                const workerIndex = this.workers.length;
                worker.onmessage = (e) => {
                    // Every job gets exactly one reply.
                    this.workerJobs[workerIndex] = Math.max(0, (this.workerJobs[workerIndex] ?? 0) - 1);
                    this.receiveResult(e.data);
                };
                this.workers.push(worker);
                this.workerJobs.push(0);
            }

            this.syncWorkerWorldGenState();
            this.workerStatusMessage = `Workers Active (${this.workers.length})`;
            console.log(`World Worker Pool Initialized (${this.workers.length} workers)`);
      } catch (e) {
            console.error("Failed to init worker pool", e);
            this.workersEnabled = false;
            this.terminateWorkers();
            this.workerStatusMessage = "Worker Init Failed";
      }
  }

  private terminateWorkers() {
    for (const worker of this.workers) {
        worker.terminate();
    }
    this.workers = [];
    this.workerJobs = [];
    this.nextWorkerIndex = 0;
    this.workerInbox = [];
    this.urgentMeshTickets.clear();
  }

  /** Queues a finished chunk (generated, loaded or meshed) for applyWorkerResults. */
  private receiveResult(msg: any) {
      // A block the player just broke or placed shows at once, a frame sooner.
      if (msg?.type === 'MESH_DONE' && this.urgentMeshTickets.delete(msg.ticket)) {
          this.handleWorkerMessage(msg);
          return;
      }
      this.workerInbox.push(msg);
      this.armInboxTimer();
  }

  /**
   * Frames stop while the page is hidden or no world is on screen, and with
   * them applyWorkerResults: then this timer applies the results instead, so
   * streaming never stalls.
   */
  private armInboxTimer() {
      if (this.inboxTimer !== null) return;
      this.inboxTimer = setTimeout(() => {
          this.inboxTimer = null;
          if (this.workerInbox.length === 0) return;
          if (performance.now() - this.lastInboxFrameAt > 100) this.drainInbox(8, 16);
          if (this.workerInbox.length > 0) this.armInboxTimer();
      }, 100);
  }

  /**
   * Applies finished chunks, oldest first, until `budgetMs` has gone or
   * `maxMeshes` meshes are in (each mesh also costs a React update and a GPU
   * upload after this). Called once a frame by the streamer, so a burst of
   * results spreads over a few frames instead of stalling one. Results waiting
   * here still count as in flight, which holds back new jobs meanwhile.
   */
  public applyWorkerResults(budgetMs: number, maxMeshes: number) {
      this.lastInboxFrameAt = performance.now();
      this.drainInbox(budgetMs, maxMeshes);
  }

  private drainInbox(budgetMs: number, maxMeshes: number) {
      const inbox = this.workerInbox;
      if (inbox.length === 0) return;
      const start = performance.now();
      let meshes = 0;
      let applied = 0;
      while (applied < inbox.length) {
          const msg = inbox[applied];
          if (applied > 0 && performance.now() - start > budgetMs) break;
          if (msg?.type === 'MESH_DONE') {
              if (meshes >= maxMeshes) break;
              meshes++;
          }
          applied++;
          this.handleWorkerMessage(msg);
          // A world reset from inside a handler replaces the inbox.
          if (this.workerInbox !== inbox) return;
      }
      inbox.splice(0, applied);
  }

  /**
   * Sends a chunk job to the worker with the fewest jobs waiting (ties go
   * round the pool), so a slow generation job never holds up a queue of
   * meshes behind it. Control messages use broadcast instead.
   */
  private postToPool(msg: unknown) {
      if (this.workers.length === 0) return;
      let best = this.nextWorkerIndex % this.workers.length;
      for (let step = 1; step < this.workers.length; step++) {
          const i = (this.nextWorkerIndex + step) % this.workers.length;
          if (this.workerJobs[i] < this.workerJobs[best]) best = i;
      }
      this.nextWorkerIndex = (best + 1) % this.workers.length;
      this.workerJobs[best]++;
      this.workers[best].postMessage(msg);
  }

    private syncWorkerWorldGenState() {
            if (this.workers.length === 0) return;

            const config = JSON.parse(JSON.stringify(GenConfig));
            for (const worker of this.workers) {
                worker.postMessage({ type: 'SET_SEED', seed: this.activeSeed });
                worker.postMessage({ type: 'SET_GEN_CONFIG', config });
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
      const key = WorldCoords.getChunkKey(cx, cz);
      
      if (type === 'GEN_DONE') {
          const activeTicket = this.activeGenTickets.get(key);
          if (activeTicket === undefined || ticket !== activeTicket) return;
          this.activeGenTickets.delete(key);
          this.inFlightGen = Math.max(0, this.inFlightGen - 1);
          this.genStartedAt.delete(key);
          
          WorldStore.setChunkData(this.state, cx, cz, result.blocks);
          WorldStore.setLightData(this.state, cx, cz, result.light);
          WorldStore.setMetadataIfAny(this.state, cx, cz, result.meta);
          this.wakeFlowingFluids(cx, cz, result.blocks, result.meta);
          
          Lighting.reconcileChunkBorders(this.state, cx, cz, (ncx, ncz) => {
              // Side chunks with a mesh (or one on the way) remesh against this one;
              // those still waiting for their first mesh are re-checked below.
              if (this.getStage(ncx, ncz) > ChunkStage.GENERATED) {
                  this.queueMesh(ncx, ncz, 10);
              }
          });

          this.setStage(cx, cz, ChunkStage.GENERATED);
          this.queueFirstMesh(cx, cz, 0);
          // This chunk may be the last side chunk a neighbour was waiting for.
          for (const [dx, dz] of WorldManager.SIDE_NEIGHBOURS) this.queueFirstMesh(cx + dx, cz + dz, 5);
          this.scheduleStreamingPump();
      }
      else if (type === 'MESH_DONE') {
          const activeTicket = this.activeMeshTickets.get(key);
          if (activeTicket === undefined || ticket !== activeTicket) return;
          this.activeMeshTickets.delete(key);
          this.inFlightMesh = Math.max(0, this.inFlightMesh - 1);
          this.meshStartedAt.delete(key);

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

          const hadMesh = this.meshCache.has(key);
          this.meshCache.set(key, result);
          this.setStage(cx, cz, ChunkStage.READY);

          const subs = this.meshSubscribers.get(key);
          if (subs) subs.forEach(cb => cb(result));
          if (!hadMesh) this.notifyMeshPresence(key, true);

          const pendingPriority = this.pendingRemesh.get(key);
          if (pendingPriority !== undefined) {
              this.pendingRemesh.delete(key);
              this.queueMesh(cx, cz, pendingPriority);
              this.meshQueue.sort((a, b) => a.priority - b.priority);
          }
          this.scheduleStreamingPump();
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

  private static readonly SIDE_NEIGHBOURS: readonly (readonly [number, number])[] = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  /**
   * A mesh reads the four side chunks (their blocks for the faces between them,
   * their light for the light across the border). A chunk meshed before they
   * arrive only has to be meshed again as each one does: over twice the meshing
   * work of the whole load, and four geometry swaps per chunk on the main
   * thread. So a chunk's first mesh waits until every side chunk is generated
   * or isn't wanted at all (the edge of the view distance, which never fills in).
   */
  private sideChunksReady(cx: number, cz: number): boolean {
      for (const [dx, dz] of WorldManager.SIDE_NEIGHBOURS) {
          const ncx = cx + dx;
          const ncz = cz + dz;
          if (this.getStage(ncx, ncz) >= ChunkStage.GENERATED) continue;
          if (!this.desiredChunkKeys.has(WorldCoords.getChunkKey(ncx, ncz))) continue;
          return false;
      }
      return true;
  }

  /** Queues a chunk's mesh, holding a first mesh until its side chunks are there. */
  private queueFirstMesh(cx: number, cz: number, priority: number) {
      if (this.getStage(cx, cz) === ChunkStage.GENERATED
          && !this.meshCache.has(WorldCoords.getChunkKey(cx, cz))
          && !this.sideChunksReady(cx, cz)) return;
      this.queueMesh(cx, cz, priority);
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
              this.queueFirstMesh(cx, cz, priority);
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

      while (this.inFlightGen < this.MAX_GEN_IN_FLIGHT && this.genQueue.length > 0) {
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
                void this.preflightThenGenerate(job.cx, job.cz, ticket);
            } else {
                WorldStorage.loadChunk(this.activeWorldId, job.cx, job.cz).then(async data => {
                    if (this.activeGenTickets.get(key) !== ticket) return;

                    await this.ensureVaultCandidatesPreflighted(job.cx, job.cz);
                    if (this.activeGenTickets.get(key) !== ticket) return;

                    if (data) {
                        this.knownMissingStorageChunks.delete(key);
                        this.receiveResult({
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

      while (this.inFlightMesh < this.MAX_MESH_IN_FLIGHT && this.meshQueue.length > 0) {
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

          // Absent metadata means none (setMetadataIfAny); the mesher reads it as zeros.
          const m = WorldStore.getMetadataData(this.state, job.cx, job.cz);

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
          // Block edits queue at -1000 to -800 (setBlock, refreshStairShapes).
          if (job.priority <= -800) this.urgentMeshTickets.add(ticket);

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
              // Their fluid levels, so a flowing surface slopes evenly across the border.
              const neighborMeta = {
                  left: WorldStore.getMetadataData(this.state, job.cx-1, job.cz),
                  right: WorldStore.getMetadataData(this.state, job.cx+1, job.cz),
                  front: WorldStore.getMetadataData(this.state, job.cx, job.cz+1),
                  back: WorldStore.getMetadataData(this.state, job.cx, job.cz-1)
              };

              if (this.workersEnabled && this.workers.length > 0) {
                  this.postToPool({
                      type: 'MESH',
                      id: `mesh-${job.cx}-${job.cz}`,
                      cx: job.cx,
                      cz: job.cz,
                      ticket,
                      chunk: c,
                      metaData: m,
                      light: l,
                      // Only the planes facing this chunk (meshBorders.ts).
                      borders: packMeshBorders(neighbors, neighborLights, neighborMeta),
                      cullDarkFaces: cullDark
                  });
              } else {
                  setTimeout(() => {
                      if (this.activeMeshTickets.get(key) !== ticket) return;
                      const res = Geometry.generateGeometryData(job.cx, job.cz, c, m, neighbors, neighborLights, cullDark, neighborMeta);
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
                  if (this.meshCache.delete(key)) this.notifyMeshPresence(key, false);
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
              this.queueFirstMesh(cx, cz, priority);
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
                  this.setStage(cx, cz, ChunkStage.REQUESTED);
                  this.enqueueGen(cx, cz, priority);
              }
          } else if (stage === ChunkStage.MESHING) {
              const startedAt = this.meshStartedAt.get(key) ?? now;
              if (now - startedAt > 10000) {
                  this.inFlightMesh = Math.max(0, this.inFlightMesh - 1);
                  this.meshStartedAt.delete(key);
                  this.activeMeshTickets.delete(key);
                  this.setStage(cx, cz, ChunkStage.MESH_QUEUED);
                  this.enqueueMesh(cx, cz, priority);
              }
          }
      }
  }

  private async preflightThenGenerate(cx: number, cz: number, ticket: number): Promise<void> {
      await this.ensureVaultCandidatesPreflighted(cx, cz);
      const key = WorldCoords.getChunkKey(cx, cz);
      if (this.activeGenTickets.get(key) === ticket) this.triggerWorkerGen(cx, cz, ticket);
  }

  private async ensureVaultCandidatesPreflighted(cx: number, cz: number): Promise<void> {
      const worldId = this.activeWorldId;
      if (!worldId) return;
      const minX = cx * CHUNK_SIZE;
      const minZ = cz * CHUNK_SIZE;
      const candidates = getVaultCandidatesTouchingBox(
          minX,
          minZ,
          minX + CHUNK_SIZE - 1,
          minZ + CHUNK_SIZE - 1,
          this.activeSeed,
      );
      await Promise.all(candidates.map((candidate) => this.ensureVaultCandidatePreflighted(worldId, candidate)));
  }

  /**
   * Preflight status for a vault candidate this session. 'unknown' means no
   * decision has been made yet (its chunks were never approached); callers
   * that need an answer can request one with requestVaultCandidatePreflight.
   */
  public getVaultCandidateStatus(candidate: VaultCandidate): 'accepted' | 'rejected' | 'unknown' {
      const vaultId = getVaultId(candidate);
      if (this.acceptedVaultCandidates.has(vaultId)) return 'accepted';
      if (this.rejectedVaultCandidates.has(vaultId)) return 'rejected';
      return 'unknown';
  }

  public requestVaultCandidatePreflight(candidate: VaultCandidate): void {
      const worldId = this.activeWorldId;
      if (!worldId || this.getVaultCandidateStatus(candidate) !== 'unknown') return;
      void this.ensureVaultCandidatePreflighted(worldId, candidate);
  }

  /**
   * Nearest candidate that passes (or has passed) preflight. Unlike the raw
   * grid lookup this never points at a vault that will be rejected and thus
   * never generated - a rejected candidate has no structure to find.
   */
  public async resolveNearestAcceptedVaultCandidate(
      startX: number,
      startZ: number,
      maxDistance = 18000,
  ): Promise<VaultCandidate | null> {
      const worldId = this.activeWorldId;
      if (!worldId) return null;
      const excluded = new Set<string>();
      for (let attempt = 0; attempt < 96; attempt += 1) {
          if (this.activeWorldId !== worldId) return null;
          const candidate = findNearestVaultCandidate(
              startX,
              startZ,
              this.activeSeed,
              maxDistance,
              (entry) => excluded.has(getVaultId(entry)) || this.rejectedVaultCandidates.has(getVaultId(entry)),
          );
          if (!candidate) return null;
          const vaultId = getVaultId(candidate);
          if (this.acceptedVaultCandidates.has(vaultId)) return candidate;
          if (await this.ensureVaultCandidatePreflighted(worldId, candidate)) return candidate;
          excluded.add(vaultId);
      }
      return null;
  }

  private ensureVaultCandidatePreflighted(worldId: string, candidate: VaultCandidate): Promise<boolean> {
      const vaultId = getVaultId(candidate);
      const existing = this.vaultPreflightPromises.get(vaultId);
      if (existing) return existing;

      let resolveDecision!: (accepted: boolean) => void;
      const decisionPromise = new Promise<boolean>((resolve) => { resolveDecision = resolve; });
      this.vaultPreflightPromises.set(vaultId, decisionPromise);
      const run = async () => {
          try {
              if (this.activeWorldId !== worldId) {
                  resolveDecision(false);
                  return;
              }
              const spire = getVaultSpirePosition(candidate);
              const biomeId = getBiome(spire.x, spire.z, GlobalNoise).id;
              if (biomeId === 'magnetic_fields' || biomeId === 'ocean' || biomeId === 'deep_ocean') {
                  this.rejectedVaultCandidates.add(vaultId);
                  resolveDecision(false);
                  return;
              }
              const centerSurfaceY = WorldGen.getTerrainHeight(spire.x, spire.z);
              const layout = getVaultLayout(
                  candidate,
                  centerSurfaceY,
                  (x, z) => WorldGen.getTerrainHeight(x, z),
              );
              const decision = await preflightVaultCandidate({
                  worldId,
                  candidate,
                  layout,
                  hasMemoryChunk: ({ cx: footprintCx, cz: footprintCz }) => (
                      !!WorldStore.getChunkData(this.state, footprintCx, footprintCz)
                  ),
                  hasAnyPersistedChunk: (id, coordinates) => WorldStorage.hasAnyChunk(id, coordinates),
                  readMeta: (id) => WorldStorage.getWorldMeta(id),
                  writeMeta: async (meta) => {
                      // A synchronous spawn chunk may have generated inside this
                      // footprint (and suppressed the vault) while preflight was
                      // awaiting storage; never persist a reservation for it.
                      if (this.activeWorldId !== worldId) throw new Error('stale vault preflight context');
                      if (this.rejectedVaultCandidates.has(vaultId)) throw new Error('vault suppressed by synchronous chunk generation');
                      await WorldStorage.saveWorldMeta(meta);
                  },
              });
              if (decision.accepted && this.rejectedVaultCandidates.has(vaultId)) {
                  // The suppression landed after the reservation write: undo it so
                  // later sessions do not generate a vault this session's persisted
                  // chunks lack (a torn structure).
                  const meta = await WorldStorage.getWorldMeta(worldId);
                  if (meta?.resonantVaultReservations?.[vaultId]) {
                      const reservations = { ...meta.resonantVaultReservations };
                      delete reservations[vaultId];
                      await WorldStorage.saveWorldMeta({ ...meta, resonantVaultReservations: reservations });
                  }
                  resolveDecision(false);
                  return;
              }
              if (decision.accepted) this.acceptedVaultCandidates.add(vaultId);
              else this.rejectedVaultCandidates.add(vaultId);
              resolveDecision(decision.accepted);
          } catch (error) {
              this.rejectedVaultCandidates.add(vaultId);
              this.acceptedVaultCandidates.delete(vaultId);
              console.warn(`[WorldManager] Rejected ${vaultId} because its footprint preflight failed.`, error);
              resolveDecision(false);
          }
      };
      this.vaultPreflightSerial = this.vaultPreflightSerial.then(run, run);
      return decisionPromise;
  }

  private triggerWorkerGen(cx: number, cz: number, ticket: number) {
      const key = WorldCoords.getChunkKey(cx, cz);
      const rejectedVaultIds = [...this.rejectedVaultCandidates];
      if (this.workersEnabled && this.workers.length > 0) {
          this.postToPool({ type: 'GEN', id: `gen-${cx}-${cz}`, cx, cz, ticket, rejectedVaultIds });
      } else {
          setTimeout(() => {
              if (this.activeGenTickets.get(key) !== ticket) return;
              const res = WorldGen.generateChunk(cx, cz, { rejectedVaultIds });
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

  /**
   * Read-only streaming snapshot for diagnostics and the dev visual tour: how many
   * of the desired chunks already have a mesh, and how much work is still queued.
   */
  public getStreamingStatus(): { desired: number; meshed: number; queued: number; inFlight: number } {
      let meshed = 0;
      for (const key of this.desiredChunkKeys) {
          if (this.chunkStages.get(key) === ChunkStage.READY && this.meshCache.has(key)) meshed++;
      }
      return {
          desired: this.desiredChunkKeys.size,
          meshed,
          queued: this.genQueue.length + this.meshQueue.length,
          inFlight: this.inFlightGen + this.inFlightMesh,
      };
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
              if (blocks && light) {
                  // Saves keep their full layout: a chunk without metadata writes zeros.
                  const meta = WorldStore.getMetadataData(this.state, cx, cz) ?? new Uint8Array(blocks.length);
                  batch.push({ cx, cz, blocks, light, meta });
                  savedKeys.push({ key, version: this.dirtyEditVersion.get(key) ?? 0 });
              }
          }
          if (batch.length === 0) return;

          await WorldStorage.saveChunks(worldId, batch);

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
          return false; // defer, keep the dirty key + chunk data until confirmed persisted
      }

      WorldStore.evictChunk(this.state, cx, cz);
      this.chunkStages.delete(key);
      if (this.meshCache.delete(key)) this.notifyMeshPresence(key, false);
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

  public findSafeSpawnPosition(targetX: number, targetZ: number, firstSpawn = false): { x: number, y: number, z: number } {
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

                  const score = this.scoreSpawnCandidate(x, z, firstSpawn);
                  if (score > 0 && (!scored || score > scored.score)) {
                      scored = { x, z, y: h, score };
                  } else if (h > seaLevel && !this.isSealedSpawnColumn(x, z)) {
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
      const found = scored ?? land;
      if (found) {
          const pick = this.groundColumnNear(found.x, found.z);
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

  /**
   * The nearest column within a few blocks of (x, z) that stands on the
   * ground, dry. Candidates are scored on the noise height, which knows
   * nothing of trees, and a column under one resolves onto its canopy
   * (resolveClearStandY): a new player began up a tree, five or more blocks
   * above the ground. (x, z) itself when nothing near qualifies.
   */
  private groundColumnNear(x: number, z: number): { x: number; z: number } {
      const seaLevel = GenConfig.height.seaLevel;
      for (let r = 0; r <= 6; r++) {
          for (let dx = -r; dx <= r; dx++) {
              for (let dz = -r; dz <= r; dz++) {
                  if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
                  const cx = x + dx;
                  const cz = z + dz;
                  const ground = WorldGen.getTerrainHeight(cx, cz);
                  if (ground <= seaLevel) continue;
                  const y = this.resolveClearStandY(cx, cz);
                  if (y !== ground + 1 || this.getBlock(cx, y, cz, false) === BlockType.WATER) continue;
                  return { x: cx, z: cz };
              }
          }
      }
      return { x, z };
  }

  public getSeaLevel(): number {
      return GenConfig.height.seaLevel;
  }

  /**
   * A still-sealed region (the Magnetic Fields before its Warden falls): no
   * mining or building, so never a place to start or respawn.
   */
  private isSealedSpawnColumn(x: number, z: number): boolean {
      const region = getRegionAt(x, 0, z);
      return !!region && region.sealedByDefault && !progression.isRegionCleansed(region.id);
  }

  public scoreSpawnCandidate(x: number, z: number, firstSpawn = false): number {
      const seaLevel = GenConfig.height.seaLevel;
      const biome = getBiome(x, z);
      const height = WorldGen.getTerrainHeight(x, z);

      // Reject ocean, river, volcanic, and sealed regions
      if (biome.id === 'ocean' || biome.id === 'frozen_ocean') return -1;
      if (biome.id === 'river' || biome.id === 'frozen_river') return -1;
      if (biome.id === 'volcanic') return -1;
      if (height <= seaLevel) return -1;
      if (this.isSealedSpawnColumn(x, z)) return -1;

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

      // A new world's first spawn also steers clear of closed canopy and
      // wetland, where a new player starts in the dark or in water. Respawns
      // keep the scoring above, so existing worlds respawn where they did.
      if (firstSpawn) {
          if (biome.id === 'dark_forest') score -= 25;
          else if (biome.id === 'swamp' || biome.id === 'jungle') score -= 15;
      }

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

              const score = this.scoreSpawnCandidate(x, z, true);
              if (score > bestScore) {
                  bestScore = score;
                  bestX = x;
                  bestZ = z;
              }

              // Good enough, stop early
              if (bestScore >= GenConfig.spawn.earlyAcceptScore) {
                  return this.findSafeSpawnPosition(bestX, bestZ, true);
              }
          }
      }

      return this.findSafeSpawnPosition(bestX, bestZ, true);
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
          const minX = cx * CHUNK_SIZE;
          const minZ = cz * CHUNK_SIZE;
          for (const candidate of getVaultCandidatesTouchingBox(
              minX,
              minZ,
              minX + CHUNK_SIZE - 1,
              minZ + CHUNK_SIZE - 1,
              this.activeSeed,
          )) {
              const vaultId = getVaultId(candidate);
              if (this.acceptedVaultCandidates.has(vaultId)) continue;
              // A synchronous spawn/respawn query cannot await storage preflight.
              // Reject unknown candidates for this session rather than stamping
              // authored terrain over chunks preflight might have refused.
              this.rejectedVaultCandidates.add(vaultId);
              if (!this.vaultPreflightPromises.has(vaultId)) {
                  this.vaultPreflightPromises.set(vaultId, Promise.resolve(false));
              }
          }
          const result = WorldGen.generateChunk(cx, cz, { rejectedVaultIds: [...this.rejectedVaultCandidates] });
          WorldStore.setChunkData(this.state, cx, cz, result.blocks);
          WorldStore.setLightData(this.state, cx, cz, result.light);
          WorldStore.setMetadataIfAny(this.state, cx, cz, result.meta);
          this.wakeFlowingFluids(cx, cz, result.blocks, result.meta);
          this.setStage(cx, cz, ChunkStage.GENERATED);
          // We don't mesh here, just ensure data exists for collision/spawn checks
      }
  }

  /**
   * Flowing water or lava saved mid-flow moves on once its chunk is loaded
   * again, as Minecraft saves a chunk's scheduled fluid ticks with it (the
   * tick queue here is not saved). Generation only places sources.
   */
  private wakeFlowingFluids(cx: number, cz: number, blocks: Uint8Array, meta: Uint8Array | undefined) {
      if (!meta) return;
      const layer = CHUNK_SIZE * CHUNK_SIZE;
      for (let i = 0; i < blocks.length; i++) {
          const type = blocks[i];
          if (meta[i] === 0 || (type !== BlockType.WATER && type !== BlockType.LAVA)) continue;
          const column = i % layer;
          Fluids.scheduleFluidUpdate(cx * CHUNK_SIZE + (column % CHUNK_SIZE), Math.floor(i / layer) + MIN_Y, cz * CHUNK_SIZE + Math.floor(column / CHUNK_SIZE), type, Fluids.fluidDelay(type));
      }
  }

  /**
   * Whether a chunk has a mesh to draw, and a cue whenever that changes: the
   * scene mounts a chunk only once it does (ChunkField in ChunkMesh.tsx).
   */
  public hasMesh(key: string): boolean {
      return this.meshCache.has(key);
  }

  public subscribeMeshPresence(listener: (key: string | null, present: boolean) => void): () => void {
      this.meshPresenceListeners.add(listener);
      return () => {
          this.meshPresenceListeners.delete(listener);
      };
  }

  private notifyMeshPresence(key: string | null, present: boolean) {
      for (const listener of this.meshPresenceListeners) listener(key, present);
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

  private resolveGeneratedVaultCache(
      x: number,
      y: number,
      z: number,
      metadata: number,
  ): { vaultId: string; descriptor: VaultCacheDescriptor } | null {
      const decoded = decodeVaultCacheMetadata(metadata);
      if (!decoded) return null;
      const candidates = getVaultCandidatesTouchingBox(x, z, x, z, this.activeSeed);
      for (const candidate of candidates) {
          if (this.rejectedVaultCandidates.has(getVaultId(candidate))) continue;
          const layout = getVaultLayout(
              candidate,
              WorldGen.getTerrainHeight(candidate.centerX, candidate.centerZ),
              (surfaceX, surfaceZ) => WorldGen.getTerrainHeight(surfaceX, surfaceZ),
          );
          const descriptor = findVaultCacheDescriptor(layout, decoded.cacheId, { x, y, z });
          if (descriptor) return { vaultId: layout.vaultId, descriptor };
      }
      return null;
  }

  /**
   * Chest state for (x, y, z), created on demand. Worldgen-placed chests have no
   * tile-entity state until first opened; natural loot caches additionally carry
   * the 0x40 metadata bit, which seeds deterministic Magnetic Fields cache loot.
   * Resonant Vault caches use the separate 0x80 flag and an authored cache id;
   * both paths clear only their unopened flag so re-opening never re-rolls.
   */
  ensureChest(x: number, y: number, z: number) {
      const meta = this.getMetadata(x, y, z);
      const pendingVaultCache = this.resolveGeneratedVaultCache(x, y, z, meta);
      if (pendingVaultCache?.descriptor.id === 'core'
          && !progression.getVaultProgress(pendingVaultCache.vaultId).coreClaimed) {
          // The vault's final reward stays sealed until the core is claimed, so
          // the unique first-clear loot cannot be lifted before the fight.
          this.log('The core cache remains sealed until the Bell Titan is defeated and the core is claimed.', 'error');
          return null;
      }
      let chest = TileEntities.getChest(this.state, x, y, z);
      if (!chest) {
          TileEntities.createChest(this.state, x, y, z);
          chest = TileEntities.getChest(this.state, x, y, z);
      }
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
      const vaultCache = chest ? pendingVaultCache : null;
      if (chest && vaultCache) {
          const firstClear = vaultCache.descriptor.id === 'core';
          const entries = getVaultCacheLoot(vaultCache.vaultId, vaultCache.descriptor.id, firstClear);
          seedVaultCache(chest, entries);
          this.setMetadataAt(x, y, z, meta & ~VAULT_CACHE_FLAG);
      }
      return chest;
  }
  
  tick(delta: number) {
      this.state.time++;
      TileEntities.tickTileEntities(this.state, delta, (x,y,z) => this.getBlock(x,y,z,false), (x,y,z,t,r) => { this.setBlock(x,y,z,t,r); }, (x,y,z) => this.getMetadata(x,y,z));
      // Water and falling leaves change many blocks a tick: their relights are
      // batched together (see beginFluidTick).
      this.leafClock += 1 / 20;
      this.beginFluidTick();
      try {
          Fluids.processFluids(this.state);
          tickLeafDecay(this.leafWorld, this.leafClock);
      } finally {
          this.endFluidTick();
      }
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
      tickFarms(this.farmWorld);
  }

  /** Seconds of world ticks, for leaf decay's timing (the world clock can jump with /time). */
  private leafClock = 0;

  /** What leaf decay sees of the world (built once; leafDecay.ts owns the rules). */
  private readonly leafWorld: LeafWorld = {
      tryGetBlock: (x, y, z) => this.tryGetBlock(x, y, z),
      getMetadata: (x, y, z) => this.getMetadata(x, y, z),
      setBlock: (x, y, z, type) => { this.setBlock(x, y, z, type); },
      spawnDrop: (type, x, y, z) => this.spawnDrop(type, x, y, z),
      isLeaf: (type) => isLeafType(type),
      isLog: (type) => isLogBlock(type),
      leafDrops: (type) => (BLOCKS[type]?.drops ?? []).filter((d) => Math.random() < d.chance).map((d) => d.type),
      getChunkData: (cx, cz) => WorldStore.getChunkData(this.state, cx, cz) ?? null,
      getTickCenter: () => this.desiredCenter,
  };

  /** A hard landing on farmland packs it back to dirt and knocks its crop off. */
  trampleFarmland(x: number, y: number, z: number): void {
      if (!isFarmland(this.getBlock(x, y, z, false), this.getMetadata(x, y, z))) return;
      untillFarmland(this.farmWorld, x, y, z);
  }

  /** What the farm tick sees of the world (built once; farming.ts owns the rules). */
  private readonly farmWorld: FarmWorld = {
      tryGetBlock: (x, y, z) => this.tryGetBlock(x, y, z),
      getMetadata: (x, y, z) => this.getMetadata(x, y, z),
      setBlockData: (x, y, z, meta) => this.setBlockData(x, y, z, meta),
      setBlock: (x, y, z, type, meta) => { this.setBlock(x, y, z, type, meta ?? 0); },
      spawnDrop: (type, x, y, z) => this.spawnDrop(type, x, y, z),
      getLight: (x, y, z) => this.getLight(x, y, z),
      getChunkData: (cx, cz) => WorldStore.getChunkData(this.state, cx, cz) ?? null,
      getChunkMetadata: (cx, cz) => WorldStore.getMetadataData(this.state, cx, cz) ?? null,
      getTickCenter: () => this.desiredCenter,
      isOpenPlant: (type) => CROSS_RENDERED_BLOCKS.has(type) && !!BLOCKS[type]?.noCollision && !isCrop(type),
  };

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
  updateLightingAround(x: number, y: number, z: number, radius: number = 15) {
      Lighting.updateLightingAround(this.state, x, y, z, (cx, cz) => {
          WorldStore.notifyChunk(this.state, cx, cz);
          if (this.getStage(cx, cz) >= ChunkStage.GENERATED) this.queueMesh(cx, cz, 10);
      }, radius);
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
    } else if (oldType === BlockType.CHEST && type !== BlockType.CHEST && (oldRotation & VAULT_CACHE_FLAG) !== 0) {
        this.ensureChest(x, y, z);
    }
    chunk[index] = type;
    const meta = WorldStore.ensureMetadata(this.state, cx, cz);
    meta[index] = rotation;
    if (isFarmland(type, rotation)) noteFarmland(x, y, z);
    // A log gone: the leaves it held up may fall.
    if (oldType !== type && isLogBlock(oldType as BlockType) && !isLogBlock(type)) noteLogRemoved(x, y, z);
    const droppedItems = TileEntities.handleBlockReplaced(this.state, x, y, z, oldType, type);
    droppedItems.forEach(item => this.spawnDrop(item, x, y, z));
    if (type === BlockType.WATER || type === BlockType.LAVA) { Fluids.scheduleFluidUpdate(x, y, z, type, Fluids.fluidDelay(type)); }
    [ [0,1,0], [0,-1,0], [1,0,0], [-1,0,0], [0,0,1], [0,0,-1] ].forEach(([dx, dy, dz]) => {
         const nx = x+dx; const ny = y+dy; const nz = z+dz;
         const nBlock = this.getBlock(nx, ny, nz, false);
         if (nBlock === BlockType.WATER || nBlock === BlockType.LAVA) { Fluids.scheduleFluidUpdate(nx, ny, nz, nBlock, Fluids.fluidDelay(nBlock)); }
    });
    if (oldType !== type || oldRotation !== rotation) {
        // Re-resolve stair corner shapes for this cell and its horizontal neighbors
        // BEFORE relighting, so the lighting flood (radius 15) sees the updated
        // occlusion. A placed/removed stair can turn neighbors into inner/outer corners.
        this.refreshStairShapes(x, y, z);

        if (this.fluidRelight) this.deferRelight(x, y, z, lightFaint(oldType as BlockType) && lightFaint(type) ? FAINT_RELIGHT_MARGIN : FULL_RELIGHT_MARGIN);
        else this.updateLightingAround(x, y, z);
        this.queueMesh(cx, cz, -1000);

        // If editing at chunk borders, prioritize neighbor remesh immediately too.
        if (lx === 0) this.queueMesh(cx - 1, cz, -900);
        else if (lx === CHUNK_SIZE - 1) this.queueMesh(cx + 1, cz, -900);
        if (lz === 0) this.queueMesh(cx, cz - 1, -900);
        else if (lz === CHUNK_SIZE - 1) this.queueMesh(cx, cz + 1, -900);

        this.markQueuesDirty();
        this.runStreamingJobs();
    } else {
        WorldStore.notifyChunk(this.state, cx, cz);
        this.queueMesh(cx, cz, -500);
        this.markQueuesDirty();
        this.runStreamingJobs();
    }

    // A type change here may have pulled the support out from a decoration above it.
    if (oldType !== type) this.breakUnsupported(x, y + 1, z);

    // Mark dirty for persistence
    this.markDirty(WorldCoords.getChunkKey(cx, cz));

    return droppedItems;
  }

  /**
   * While the fluid tick runs, the blocks it adds or removes wait to be relit
   * together, as Minecraft's light engine batches its updates: changes close
   * together share one box, relit once, and water (which only dims light a
   * little) is relit only a few blocks around the box rather than light's full
   * reach. Boxes are relit under a time budget a tick, oldest first, and the
   * chunk jobs the changes queue are started once a tick, not once a block.
   */
  private fluidRelight: RelightBox[] | null = null;
  private pendingRelight: RelightBox[] = [];
  private fluidJobsWaiting = false;

  private deferRelight(x: number, y: number, z: number, margin: number) {
    for (const box of this.pendingRelight) {
        if (box.margin !== margin) continue;
        const minX = Math.min(box.minX, x), maxX = Math.max(box.maxX, x);
        const minY = Math.min(box.minY, y), maxY = Math.max(box.maxY, y);
        const minZ = Math.min(box.minZ, z), maxZ = Math.max(box.maxZ, z);
        if (maxX - minX > RELIGHT_BOX_SPAN || maxY - minY > RELIGHT_BOX_SPAN || maxZ - minZ > RELIGHT_BOX_SPAN) continue;
        box.minX = minX; box.maxX = maxX; box.minY = minY; box.maxY = maxY; box.minZ = minZ; box.maxZ = maxZ;
        return;
    }
    this.pendingRelight.push({ minX: x, maxX: x, minY: y, maxY: y, minZ: z, maxZ: z, margin });
  }

  private runStreamingJobs() {
    if (this.fluidRelight) this.fluidJobsWaiting = true;
    else this.processStreamingJobs();
  }

  beginFluidTick() {
    this.fluidRelight = this.pendingRelight;
  }

  endFluidTick() {
    this.fluidRelight = null;
    const start = performance.now();
    let done = 0;
    for (; done < this.pendingRelight.length; done++) {
        if (done > 0 && performance.now() - start > RELIGHT_BUDGET_MS) break;
        const box = this.pendingRelight[done];
        const half = Math.ceil(Math.max(box.maxX - box.minX, box.maxY - box.minY, box.maxZ - box.minZ) / 2);
        this.updateLightingAround(
            Math.round((box.minX + box.maxX) / 2), Math.round((box.minY + box.maxY) / 2), Math.round((box.minZ + box.maxZ) / 2),
            half + box.margin,
        );
    }
    this.pendingRelight.splice(0, done);
    if (this.fluidJobsWaiting) {
        this.fluidJobsWaiting = false;
        this.processStreamingJobs();
    }
  }

  /**
   * A block's data changing in place, its type the same: a crop growing a
   * stage, farmland drying or soaking, farmland packed back to plain dirt.
   * Nothing about the cell's light changes, so it skips setBlock's relight,
   * stair and support checks: new data, a remesh, and a save.
   */
  setBlockData(x: number, y: number, z: number, value: number): void {
    if (y < MIN_Y || y > MAX_Y) return;
    const { cx, cz, lx, lz } = WorldCoords.worldToChunk(x, z);
    const chunk = this.getChunkData(cx, cz, true);
    if (!chunk) return;
    const index = WorldCoords.index3D(lx, y, lz);
    const meta = WorldStore.ensureMetadata(this.state, cx, cz);
    if (meta[index] === value) return;
    meta[index] = value;
    if (isFarmland(chunk[index] as BlockType, value)) noteFarmland(x, y, z);
    WorldStore.notifyChunk(this.state, cx, cz);
    this.queueMesh(cx, cz, -500);
    this.markQueuesDirty();
    this.markDirty(WorldCoords.getChunkKey(cx, cz));
  }

  /**
   * A fluid's level changing in place (water or lava already there, only its
   * flow level differs): no relight, no stair or support checks, just the
   * level, a remesh, and a nudge to the fluid next to it. Anything else takes
   * the full setBlock path.
   */
  setFluidLevel(x: number, y: number, z: number, type: BlockType, level: number): void {
    if (y < MIN_Y || y > MAX_Y) return;
    const { cx, cz, lx, lz } = WorldCoords.worldToChunk(x, z);
    const chunk = this.getChunkData(cx, cz, true);
    if (!chunk) return;
    const index = WorldCoords.index3D(lx, y, lz);
    if (chunk[index] !== type) { this.setBlock(x, y, z, type, level); return; }
    const meta = WorldStore.ensureMetadata(this.state, cx, cz);
    if (meta[index] === level) return;
    meta[index] = level;
    Fluids.scheduleFluidUpdate(x, y, z, type, Fluids.fluidDelay(type));
    for (const [dx, dy, dz] of FLUID_NEIGHBOURS) {
        const nBlock = this.getBlock(x + dx, y + dy, z + dz, false);
        if (nBlock === BlockType.WATER || nBlock === BlockType.LAVA) {
            Fluids.scheduleFluidUpdate(x + dx, y + dy, z + dz, nBlock, Fluids.fluidDelay(nBlock));
        }
    }
    // The surface slopes toward its neighbours' levels, across chunk borders too.
    WorldStore.notifyChunk(this.state, cx, cz);
    this.queueMesh(cx, cz, -500);
    if (lx === 0) this.queueMesh(cx - 1, cz, -400);
    else if (lx === CHUNK_SIZE - 1) this.queueMesh(cx + 1, cz, -400);
    if (lz === 0) this.queueMesh(cx, cz - 1, -400);
    else if (lz === CHUNK_SIZE - 1) this.queueMesh(cx, cz + 1, -400);
    this.markQueuesDirty();
    this.markDirty(WorldCoords.getChunkKey(cx, cz));
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
    if (hasSupportBelow(t, below) && (!isCrop(t) || isFarmland(below, this.getMetadata(x, y - 1, z)))) return;
    if (isCrop(t)) {
        for (const drop of cropDrops(t, cropStage(this.getMetadata(x, y, z)))) {
            for (let i = 0; i < drop.count; i++) this.spawnDrop(drop.type, x, y, z);
        }
    } else {
        this.spawnDrop(t, x, y, z);
    }
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

      // Rare sealed boss biomes (e.g. Magnetic Fields) sit a few thousand blocks
      // apart (more with rarer World Editor settings), so they need a wider
      // search than ordinary biomes to stay reliably findable.
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
  public async locateVault(startX: number, startZ: number): Promise<void> {
      this.log('Locating Resonant Vault...', 'info');
      const candidate = await this.resolveNearestAcceptedVaultCandidate(startX, startZ, 18000);
      if (!candidate) {
          this.log('Could not find an accepted Resonant Vault within 18000 blocks.', 'error');
          return;
      }
      const spire = getVaultSpirePosition(candidate);
      const surfaceY = getVaultOpenAirSurfaceY(this.getTerrainHeight(spire.x, spire.z));
      const approach = getVaultSurfaceApproach(candidate, surfaceY);
      const tx = approach.x;
      const ty = approach.y;
      const tz = approach.z;
      this.log(`Found Resonant Vault at X=${tx}, Z=${tz}`, 'success', `/tp ${tx} ${ty} ${tz}`);
  }
}

export const worldManager = new WorldManager();
