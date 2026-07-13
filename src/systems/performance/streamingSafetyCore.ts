import { CHUNK_SIZE, WORLD_HEIGHT } from "../../constants";

export const MIB = 1024 * 1024;
export const RAW_CHUNK_BYTES = CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT * 3;

export interface ChunkCoord {
  cx: number;
  cz: number;
}

export interface BudgetSnapshot {
  rawChunkBytes: number;
  cpuMeshBytes: number;
  estimatedGpuMeshBytes: number;
  workerInFlightInputBytes: number;
  workerScratchEstimatedBytes: number;
  dirtySaveSnapshotBytes: number;
}

export interface FrameTimeSummary {
  sampleCount: number;
  averageFps: number | null;
  p50Ms: number | null;
  p95Ms: number | null;
  p99Ms: number | null;
  over25Ms: number;
  over50Ms: number;
  over100Ms: number;
}

export const totalBudgetBytes = (snapshot: BudgetSnapshot): number =>
  snapshot.rawChunkBytes +
  snapshot.cpuMeshBytes +
  snapshot.estimatedGpuMeshBytes +
  snapshot.workerInFlightInputBytes +
  snapshot.workerScratchEstimatedBytes +
  snapshot.dirtySaveSnapshotBytes;

export const chunkKey = (cx: number, cz: number): string => `${cx},${cz}`;

export const distanceSquared = (a: ChunkCoord, b: ChunkCoord): number => {
  const dx = a.cx - b.cx;
  const dz = a.cz - b.cz;
  return dx * dx + dz * dz;
};

export const residentChunkCapacity = (
  limitBytes: number,
  fixedBytes: number,
  estimatedBytesPerChunk: number,
): number => {
  if (!(limitBytes > 0) || !(estimatedBytesPerChunk > 0)) return 0;
  const available = Math.max(0, limitBytes - Math.max(0, fixedBytes));
  return Math.max(1, Math.floor(available / estimatedBytesPerChunk));
};

export const capDesiredChunks = (
  chunks: readonly ChunkCoord[],
  maxChunks: number,
): ChunkCoord[] => {
  if (maxChunks <= 0) return [];
  if (chunks.length <= maxChunks) return [...chunks];
  return chunks.slice(0, maxChunks);
};

export const prioritizeEvictions = (
  chunks: readonly ChunkCoord[],
  center: ChunkCoord,
): ChunkCoord[] =>
  [...chunks].sort(
    (a, b) => distanceSquared(b, center) - distanceSquared(a, center),
  );

export interface QueueStorage<T> {
  _data: Array<T | undefined>;
  _head: number;
}

export interface QueuedChunkJob extends ChunkCoord {
  priority: number;
}

export const compactQueuedChunkJobs = (
  queue: QueueStorage<QueuedChunkJob>,
  queuedKeys: Set<string>,
  retainedKeys: ReadonlySet<string>,
): void => {
  const next: QueuedChunkJob[] = [];
  for (let index = queue._head; index < queue._data.length; index += 1) {
    const job = queue._data[index];
    if (!job) continue;
    const key = chunkKey(job.cx, job.cz);
    if (retainedKeys.has(key)) next.push(job);
    else queuedKeys.delete(key);
  }
  queue._data = next;
  queue._head = 0;
};

export interface EvictionDrainOptions {
  force?: boolean;
  timeBudgetMs?: number;
  now?: () => number;
}

export interface EvictionDrainResult {
  attempted: number;
  evicted: number;
  deferred: number;
  skippedDesired: number;
}

export const drainEvictionQueue = (
  queue: ChunkCoord[],
  center: ChunkCoord,
  isDesired: (coord: ChunkCoord) => boolean,
  tryEvict: (coord: ChunkCoord) => boolean,
  options: EvictionDrainOptions = {},
): EvictionDrainResult => {
  if (queue.length === 0)
    return { attempted: 0, evicted: 0, deferred: 0, skippedDesired: 0 };
  queue.sort((a, b) => distanceSquared(b, center) - distanceSquared(a, center));
  const now = options.now ?? (() => performance.now());
  const force = options.force ?? false;
  const timeBudgetMs = options.timeBudgetMs ?? 2;
  const startedAt = now();
  const maxAttempts = queue.length;
  let attempted = 0;
  let evicted = 0;
  let deferred = 0;
  let skippedDesired = 0;

  while (
    queue.length > 0 &&
    attempted < maxAttempts &&
    (force || attempted === 0 || now() - startedAt < timeBudgetMs)
  ) {
    const coord = queue.shift();
    if (!coord) break;
    attempted += 1;
    if (isDesired(coord)) {
      skippedDesired += 1;
      continue;
    }
    if (tryEvict(coord)) evicted += 1;
    else {
      deferred += 1;
      queue.push(coord);
    }
  }

  return { attempted, evicted, deferred, skippedDesired };
};

const mix32 = (value: number): number => {
  let x = value | 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
};

export const selectAffinityWorker = (
  cx: number,
  cz: number,
  healthyWorkerIds: readonly number[],
): number | null => {
  if (healthyWorkerIds.length === 0) return null;
  const mixed = mix32(
    Math.imul(cx | 0, 73856093) ^ Math.imul(cz | 0, 19349663),
  );
  return healthyWorkerIds[mixed % healthyWorkerIds.length] ?? null;
};

const percentile = (
  sorted: readonly number[],
  fraction: number,
): number | null => {
  if (sorted.length === 0) return null;
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * fraction) - 1),
  );
  return sorted[index] ?? null;
};

export const summarizeFrameTimes = (
  samples: readonly number[],
): FrameTimeSummary => {
  const finite = samples
    .filter((value) => Number.isFinite(value) && value >= 0)
    .sort((a, b) => a - b);
  const totalMs = finite.reduce((sum, value) => sum + value, 0);
  return {
    sampleCount: finite.length,
    averageFps: totalMs > 0 ? (finite.length * 1000) / totalMs : null,
    p50Ms: percentile(finite, 0.5),
    p95Ms: percentile(finite, 0.95),
    p99Ms: percentile(finite, 0.99),
    over25Ms: finite.filter((value) => value > 25).length,
    over50Ms: finite.filter((value) => value > 50).length,
    over100Ms: finite.filter((value) => value > 100).length,
  };
};

export interface StreamingResultIdentityCheck {
  activeTicket: number | undefined;
  resultTicket: number;
  desired: boolean;
  currentSessionId: number;
  currentDesiredEpoch: number | undefined;
  currentDataVersion: number;
  recordSessionId?: number;
  recordDesiredEpoch?: number;
  recordDataVersion?: number;
  recordUniqueTicket?: string;
  resultSessionId?: number;
  resultDesiredEpoch?: number;
  resultDataVersion?: number;
  resultUniqueTicket?: string;
}

export const isCurrentStreamingResult = (
  check: StreamingResultIdentityCheck,
): boolean => {
  if (check.activeTicket !== check.resultTicket || !check.desired) return false;
  if (
    check.recordSessionId !== undefined &&
    check.recordSessionId !== check.currentSessionId
  )
    return false;
  if (
    check.recordDesiredEpoch !== undefined &&
    check.recordDesiredEpoch !== check.currentDesiredEpoch
  )
    return false;
  if (
    check.recordDataVersion !== undefined &&
    check.recordDataVersion !== check.currentDataVersion
  )
    return false;
  if (
    check.resultSessionId !== undefined &&
    check.resultSessionId !== check.currentSessionId
  )
    return false;
  if (
    check.resultDesiredEpoch !== undefined &&
    check.resultDesiredEpoch !== check.currentDesiredEpoch
  )
    return false;
  if (
    check.resultDataVersion !== undefined &&
    check.resultDataVersion !== check.currentDataVersion
  )
    return false;
  if (check.resultUniqueTicket !== undefined) {
    return (
      check.recordUniqueTicket !== undefined &&
      check.resultUniqueTicket === check.recordUniqueTicket
    );
  }
  return true;
};

export const workerRestartDelayMs = (consecutiveFailures: number): number => {
  const failures = Math.max(1, Math.floor(consecutiveFailures));
  return Math.min(8_000, 250 * 2 ** Math.min(5, failures - 1));
};

export const estimateTransferBytes = (value: unknown): number => {
  const seenObjects = new Set<object>();
  const seenBuffers = new Set<ArrayBufferLike>();

  const visit = (current: unknown): number => {
    if (current === null || current === undefined) return 0;
    if (typeof current !== "object") return 0;

    if (ArrayBuffer.isView(current)) {
      const buffer = current.buffer;
      if (seenBuffers.has(buffer)) return 0;
      seenBuffers.add(buffer);
      return current.byteLength;
    }

    if (current instanceof ArrayBuffer) {
      if (seenBuffers.has(current)) return 0;
      seenBuffers.add(current);
      return current.byteLength;
    }

    const objectValue = current as object;
    if (seenObjects.has(objectValue)) return 0;
    seenObjects.add(objectValue);

    if (Array.isArray(current)) {
      return current.reduce((sum, item) => sum + visit(item), 0);
    }

    return Object.values(current as Record<string, unknown>).reduce<number>(
      (sum, item) => sum + visit(item),
      0,
    );
  };

  return visit(value);
};
