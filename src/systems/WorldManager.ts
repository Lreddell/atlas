
import { BlockType, ItemStack } from '../types';
import * as WorldTypes from './world/worldTypes';
import * as WorldStore from './world/worldStore';
import * as WorldCoords from './world/worldCoords';
import * as WorldGen from './world/chunkGeneration';
import * as Lighting from './world/lighting';
import * as TileEntities from './world/tileEntities';
import * as Geometry from './world/geometry';
import * as Fluids from './world/fluids';
import { getBiome } from './world/biomes';
import { CHUNK_SIZE, MIN_Y, MAX_Y, WORKERS_ENABLED } from '../constants';
import { reseedGlobalNoise, getSpawnSearchCenter } from '../utils/noise';
import { WorldStorage } from './world/WorldStorage';
import { GenConfig } from './world/genConfig';

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
type DropCallback = (type: BlockType, x: number, y: number, z: number) => void;
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

  private worker: Worker | null = null;
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
  
  // Persistence Tracking
  private dirtyChunks = new Set<string>();

  constructor() {
    this.state = WorldTypes.createWorldState();

        const cpuCores = typeof navigator !== 'undefined' && navigator.hardwareConcurrency
            ? navigator.hardwareConcurrency
            : 4;
        this.MAX_GEN_IN_FLIGHT = Math.min(8, Math.max(3, Math.floor(cpuCores * 0.75)));
        this.MAX_MESH_IN_FLIGHT = Math.min(4, Math.max(2, Math.floor(cpuCores / 2)));
    
    if (this.workersEnabled) {
        this.initWorker();
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
      
      if (this.worker) {
          this.worker.terminate();
          this.initWorker();
          this.syncWorkerWorldGenState();
      }
      
      this.log("World State Reset", 'success');
  }

  private initWorker() {
      try {
            this.worker = new Worker(
                new URL("./world/workers/world.worker.ts", import.meta.url),
                { type: "module" }
            );
            
            this.worker.onerror = (e) => {
                console.error("WorldWorker Error (Disabling Workers):", e);
                this.log("WorldWorker Failed - Switching to Main Thread", 'error');
                
                this.workersEnabled = false;
                if (this.worker) {
                    this.terminateWorker();
                }
                this.workerStatusMessage = "Workers Disabled (Error)";
                this.resetPipeline(); 
            };
            
            this.worker.onmessage = (e) => this.handleWorkerMessage(e.data);
            this.syncWorkerWorldGenState();
            this.workerStatusMessage = "Workers Active";
            console.log("Unified World Worker Initialized");
      } catch (e) {
            console.error("Failed to init worker", e);
            this.workersEnabled = false;
            this.worker = null;
            this.workerStatusMessage = "Worker Init Failed";
      }
  }

  private terminateWorker() {
    if (this.worker) {
        this.worker.terminate();
        this.worker = null;
    }
  }

    private syncWorkerWorldGenState() {
            if (!this.worker) return;

            this.worker.postMessage({ type: 'SET_SEED', seed: this.activeSeed });
            this.worker.postMessage({
                    type: 'SET_GEN_CONFIG',
                    config: JSON.parse(JSON.stringify(GenConfig))
            });
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

  private enqueueGen(cx: number, cz: number, priority: number) {
      const key = WorldCoords.getChunkKey(cx, cz);
      if (this.queuedGenKeys.has(key)) {
          const existing = this.genQueue.find(j => j.cx === cx && j.cz === cz);
          if (existing) existing.priority = Math.min(existing.priority, priority);
          return;
      }
      this.queuedGenKeys.add(key);
      this.genQueue.push({ cx, cz, priority });
  }

  private enqueueMesh(cx: number, cz: number, priority: number) {
      const key = WorldCoords.getChunkKey(cx, cz);
      if (this.queuedMeshKeys.has(key)) {
          const existing = this.meshQueue.find(j => j.cx === cx && j.cz === cz);
          if (existing) existing.priority = Math.min(existing.priority, priority);
          return;
      }
      this.queuedMeshKeys.add(key);
      this.meshQueue.push({ cx, cz, priority });
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
          if (job) {
              job.priority = Math.min(job.priority, priority);
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
          }
      }

      this.desiredChunkKeys = wantedKeys;
      this.desiredChunkList = Array.from(wantedKeys);
      if (this.desiredChunkCursor >= this.desiredChunkList.length) {
          this.desiredChunkCursor = 0;
      }

      // Keep queue ordering strongly center-first to avoid near-player holes.
      this.genQueue.sort((a, b) => a.priority - b.priority);
      this.meshQueue.sort((a, b) => a.priority - b.priority);

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
          const maxEvictionsPerPass = 16;
          const unloadRadius = Math.sqrt(maxDesiredDistSq) + 2;

          for (const [key, _stage] of this.chunkStages) {
              if (!wantedKeys.has(key)) {
                  const [kcx, kcz] = key.split(',').map(Number);
                  const dist = Math.sqrt((kcx - center.cx)**2 + (kcz - center.cz)**2);
                  if (dist > unloadRadius) {
                      this.evict(kcx, kcz);
                      evicted++;
                      if (evicted >= maxEvictionsPerPass) break;
                  }
              }
          }
      }
  }

  public processStreamingJobs() {
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
              WorldStorage.loadChunk(this.activeWorldId, job.cx, job.cz).then(data => {
                  if (this.activeGenTickets.get(key) !== ticket) return;
                  if (data) {
                      // Found in storage, use it directly (skip worker)
                      this.handleWorkerMessage({ 
                          type: 'GEN_DONE', 
                          cx: job.cx, 
                          cz: job.cz, 
                          ticket,
                          result: { blocks: data.blocks, light: data.light, meta: data.meta } 
                      });
                  } else {
                      // Not found, proceed to generate
                      this.triggerWorkerGen(job.cx, job.cz, ticket);
                  }
              }).catch((error) => {
                  console.warn(`[WorldManager] Failed to load chunk ${job.cx},${job.cz} from storage. Falling back to generation.`, error);
                  if (this.activeGenTickets.get(key) === ticket) {
                      this.triggerWorkerGen(job.cx, job.cz, ticket);
                  }
              });
          } else {
              // No persistence context, just generate (e.g. menu background)
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

              if (this.workersEnabled && this.worker) {
                  this.worker.postMessage({ 
                      type: 'MESH', 
                      id: `mesh-${job.cx}-${job.cz}`, 
                      cx: job.cx, 
                      cz: job.cz,
                      ticket,
                      chunk: c,
                      metaData: m,
                      neighbors,
                      lights: neighborLights
                  });
              } else {
                  setTimeout(() => {
                      if (this.activeMeshTickets.get(key) !== ticket) return;
                      const res = Geometry.generateGeometryData(job.cx, job.cz, c, m, neighbors, neighborLights);
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

  private triggerWorkerGen(cx: number, cz: number, ticket: number) {
      const key = WorldCoords.getChunkKey(cx, cz);
      if (this.workersEnabled && this.worker) {
          this.worker.postMessage({ type: 'GEN', id: `gen-${cx}-${cz}`, cx, cz, ticket });
      } else {
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

  private async processSaveQueue() {
      if (this.dirtyChunks.size === 0 || !this.activeWorldId) return;

      const chunksToSave = Array.from(this.dirtyChunks);
      this.dirtyChunks.clear();

      for (const key of chunksToSave) {
          const [cx, cz] = key.split(',').map(Number);
          const blocks = WorldStore.getChunkData(this.state, cx, cz);
          const light = WorldStore.getLightData(this.state, cx, cz);
          const meta = WorldStore.getMetadataData(this.state, cx, cz);

          if (blocks && light && meta) {
              await WorldStorage.saveChunk(this.activeWorldId, cx, cz, { blocks, light, meta });
          }
      }
  }

  private evict(cx: number, cz: number) {
      const key = WorldCoords.getChunkKey(cx, cz);
      
      // Force save if dirty before eviction
      if (this.dirtyChunks.has(key) && this.activeWorldId) {
          const blocks = WorldStore.getChunkData(this.state, cx, cz);
          const light = WorldStore.getLightData(this.state, cx, cz);
          const meta = WorldStore.getMetadataData(this.state, cx, cz);
          if (blocks && light && meta) {
              void WorldStorage.saveChunk(this.activeWorldId, cx, cz, { blocks, light, meta });
          }
          this.dirtyChunks.delete(key);
      }

      WorldStore.evictChunk(this.state, cx, cz);
      this.chunkStages.delete(key);
      this.meshCache.delete(key);
      this.pendingRemesh.delete(key);
      this.meshSubscribers.delete(key);
      this.queuedGenKeys.delete(key);
      this.queuedMeshKeys.delete(key);
      this.genStartedAt.delete(key);
      this.meshStartedAt.delete(key);
      this.activeGenTickets.delete(key);
      this.activeMeshTickets.delete(key);
      
      if (this.worker) {
          this.worker.postMessage({ type: 'EVICT', cx, cz });
      }
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
  public findSafeSpawnPosition(targetX: number, targetZ: number): { x: number, y: number, z: number } {
      const seaLevel = GenConfig.height.seaLevel;
      const { safeSearchRadius, safeSearchStep } = GenConfig.spawn;
      
      // Force Ensure Center Chunk exists so collision works immediately
      const centerCx = Math.floor(targetX / CHUNK_SIZE);
      const centerCz = Math.floor(targetZ / CHUNK_SIZE);
      this.ensureChunk(centerCx, centerCz);

      // Three buckets: scored > land > water
      let scored: { x: number, z: number, y: number, score: number } | null = null;
      let land: { x: number, z: number, y: number } | null = null;

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
                  } else if (h > seaLevel && !land) {
                      land = { x, z, y: h };
                  }
              }
          }
      }

      // Priority: scored land > any land > water surface
      const pick = scored ?? land;
      if (pick) {
          this.ensureChunk(Math.floor(pick.x / CHUNK_SIZE), Math.floor(pick.z / CHUNK_SIZE));
          console.log(`[Spawn] Found land at ${pick.x},${pick.y},${pick.z}${scored ? ` (score: ${scored.score})` : ' (fallback land)'}`);
          return { x: pick.x + 0.5, y: pick.y + 2, z: pick.z + 0.5 };
      }

      // No land found at all — spawn on water surface
      console.warn("[Spawn] No land found, spawning on water surface.");
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

              // Good enough — stop early
              if (bestScore >= GenConfig.spawn.earlyAcceptScore) {
                  return this.findSafeSpawnPosition(bestX, bestZ);
              }
          }
      }

      return this.findSafeSpawnPosition(bestX, bestZ);
  }

  // Helper to synchronously force generation if missing (prevents falling through world on start)
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
  
  tick(delta: number) {
      this.state.time++;
      TileEntities.tickTileEntities(this.state, delta, (x,y,z) => this.getBlock(x,y,z,false), (x,y,z,t,r) => { this.setBlock(x,y,z,t,r); }, (x,y,z) => this.getMetadata(x,y,z));
      Fluids.processFluids(this.state);
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
  spawnDrop(type: BlockType, x: number, y: number, z: number) { this.dropListeners.forEach(cb => cb(type, x, y, z)); }
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
    const { cx, cz, lx, lz } = WorldCoords.worldToChunk(x, z);
    const chunk = this.getChunkData(cx, cz, true);
    if (!chunk) return [];
    const index = WorldCoords.index3D(lx, y, lz);
    const oldType = chunk[index];
    const oldRotation = WorldStore.getMetadataData(this.state, cx, cz)?.[index] ?? 0;
    chunk[index] = type;
    const meta = WorldStore.ensureMetadata(this.state, cx, cz);
    meta[index] = rotation;
    const droppedItems = TileEntities.handleBlockReplaced(this.state, x, y, z, oldType, type);
    droppedItems.forEach(item => { for(let i=0; i<item.count; i++) this.spawnDrop(item.type, x, y, z); });
    if (type === BlockType.WATER || type === BlockType.LAVA) { Fluids.scheduleFluidUpdate(x, y, z, type, type === BlockType.LAVA ? 30 : 5); }
    [ [0,1,0], [0,-1,0], [1,0,0], [-1,0,0], [0,0,1], [0,0,-1] ].forEach(([dx, dy, dz]) => {
         const nx = x+dx; const ny = y+dy; const nz = z+dz;
         const nBlock = this.getBlock(nx, ny, nz, false);
         if (nBlock === BlockType.WATER || nBlock === BlockType.LAVA) { Fluids.scheduleFluidUpdate(nx, ny, nz, nBlock, nBlock === BlockType.LAVA ? 10 : 5); }
    });
    if (oldType !== type || oldRotation !== rotation) {
        this.updateLightingAround(x, y, z);
        this.queueMesh(cx, cz, -1000);

        // If editing at chunk borders, prioritize neighbor remesh immediately too.
        if (lx === 0) this.queueMesh(cx - 1, cz, -900);
        else if (lx === CHUNK_SIZE - 1) this.queueMesh(cx + 1, cz, -900);
        if (lz === 0) this.queueMesh(cx, cz - 1, -900);
        else if (lz === CHUNK_SIZE - 1) this.queueMesh(cx, cz + 1, -900);

        this.meshQueue.sort((a, b) => a.priority - b.priority);
        this.processStreamingJobs();
    } else {
        WorldStore.notifyChunk(this.state, cx, cz);
        this.queueMesh(cx, cz, -500);
        this.meshQueue.sort((a, b) => a.priority - b.priority);
        this.processStreamingJobs();
    }
    
    // Mark dirty for persistence
    this.dirtyChunks.add(WorldCoords.getChunkKey(cx, cz));

    return droppedItems;
  }
  setWorkersEnabled(val: boolean) { 
      if(val !== this.workersEnabled) {
          this.workersEnabled = val; 
          this.resetPipeline(); 
          if(val) {
              this.initWorker();
              this.syncWorkerWorldGenState();
          } 
          else { this.terminateWorker(); this.workerStatusMessage = "Workers Disabled"; }
          this.scheduleStreamingPump();
      }
  }
  public locateBiome(biomeId: string, startX: number, startZ: number) {
      this.log(`Locating biome: ${biomeId}...`, 'info');
      const SEARCH_RADIUS = 5000;
      const STEP = 64;
      let found = false;
      let closestX = 0; let closestZ = 0;
      for (let r = 0; r < SEARCH_RADIUS; r += STEP) {
          const circumference = r === 0 ? 1 : Math.floor(2 * Math.PI * r / STEP);
          for (let i = 0; i < circumference; i++) {
              const angle = (i / circumference) * Math.PI * 2;
              const wx = startX + Math.cos(angle) * r;
              const wz = startZ + Math.sin(angle) * r;
              const b = getBiome(wx, wz);
              if (b.id === biomeId) { closestX = wx; closestZ = wz; found = true; break; }
          }
          if (found) break;
      }
      if (found) {
          const y = this.getTerrainHeight(closestX, closestZ) + 5;
          const tx = Math.floor(closestX); const ty = Math.floor(y); const tz = Math.floor(closestZ);
          this.log(`Found ${biomeId} at X=${tx}, Z=${tz}`, 'success', `/tp ${tx} ${ty} ${tz}`);
      } else { this.log(`Could not find ${biomeId} within ${SEARCH_RADIUS} blocks.`, 'error'); }
  }
}

export const worldManager = new WorldManager();
