import { generateChunk } from "../chunkGeneration";
import { generateGeometryData } from "../geometry";
import { mergeOpaqueGeometryQuads } from "../meshing/geometryPostprocess";
import { reseedGlobalNoise } from "../../../utils/noise";
import { loadGenConfig, resetGenConfig } from "../genConfig";
import {
  inflateNeighborBorders,
  neighborScratchBytes,
  type NeighborBorderMap,
  type NeighborBorderSide,
} from "./neighborBorders";

type JobType = "GEN" | "MESH";

interface JobIdentity {
  jobType?: JobType;
  worldSessionId?: number;
  desiredEpoch?: number;
  dataVersion?: number;
  uniqueTicket?: string;
  workerId?: number;
  inputByteCount?: number;
}

interface WorkerRequest extends JobIdentity {
  type: string;
  id?: string;
  cx?: number;
  cz?: number;
  seed?: number;
  config?: unknown;
  chunk?: Uint8Array;
  metaData?: Uint8Array;
  neighbors?: Partial<Record<NeighborBorderSide, Uint8Array>>;
  neighborBorders?: NeighborBorderMap;
  lightBorders?: NeighborBorderMap;
  lights?: { center: Uint8Array } & Partial<
    Record<NeighborBorderSide, Uint8Array>
  >;
  ticket?: number;
  cullDarkFaces?: boolean;
}

interface TiledGeometryAttributes {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
  tileUvs?: Float32Array;
  tileData?: Float32Array;
  mergedQuadCount?: number;
}

const ctx = self as unknown as Worker;
const neighborScratch: Partial<Record<NeighborBorderSide, Uint8Array>> = {};
const lightScratch: Partial<Record<NeighborBorderSide, Uint8Array>> = {};
const INITIAL_GEOMETRY_FACES = 8_192;
const MAX_GEOMETRY_FACES = 300_000;
const GEOMETRY_BYTES_PER_FACE = 200;
const geometryCapacityFaces = [
  INITIAL_GEOMETRY_FACES,
  INITIAL_GEOMETRY_FACES,
  INITIAL_GEOMETRY_FACES,
];

const nextGeometryCapacity = (current: number, required: number): number => {
  let capacity = current;
  while (capacity < required) capacity *= 2;
  return Math.min(capacity, MAX_GEOMETRY_FACES);
};

const updateGeometryScratchEstimate = (
  result: ReturnType<typeof generateGeometryData>,
): void => {
  [result.opaque, result.cutout, result.transparent].forEach(
    (geometry, index) => {
      const faceCount = Math.ceil(geometry.positions.length / 12);
      geometryCapacityFaces[index] = nextGeometryCapacity(
        geometryCapacityFaces[index],
        faceCount,
      );
    },
  );
};

const scratchCapacities = () => ({
  neighborCacheBytes:
    neighborScratchBytes(neighborScratch) + neighborScratchBytes(lightScratch),
  geometryScratchBytes:
    geometryCapacityFaces.reduce((sum, faces) => sum + faces, 0) *
    GEOMETRY_BYTES_PER_FACE,
  generationScratchBytes: 0,
});

const identityFrom = (request: WorkerRequest) => ({
  jobType: request.jobType,
  worldSessionId: request.worldSessionId,
  desiredEpoch: request.desiredEpoch,
  dataVersion: request.dataVersion,
  uniqueTicket: request.uniqueTicket,
  workerId: request.workerId,
  inputByteCount: request.inputByteCount ?? 0,
});

const isAllocationError = (error: unknown): boolean => {
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : String(error);
  return (
    name === "RangeError" ||
    /array buffer|allocation|out of memory/i.test(message)
  );
};

const sendHeartbeat = (workerId?: number) => {
  ctx.postMessage({
    type: "HEARTBEAT",
    workerId,
    timestamp: performance.now(),
    scratchCapacities: scratchCapacities(),
  });
};

ctx.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  const {
    type,
    id,
    cx,
    cz,
    seed,
    config,
    chunk,
    metaData,
    neighbors: legacyNeighbors,
    neighborBorders,
    lightBorders,
    lights,
    ticket,
    cullDarkFaces,
  } = request;

  if (type === "PING") {
    sendHeartbeat(request.workerId);
    return;
  }

  if (type === "SET_SEED") {
    if (typeof seed === "number") reseedGlobalNoise(seed);
    sendHeartbeat(request.workerId);
    return;
  }

  if (type === "SET_GEN_CONFIG") {
    resetGenConfig();
    if (config) loadGenConfig(config as Parameters<typeof loadGenConfig>[0]);
    sendHeartbeat(request.workerId);
    return;
  }

  if (type === "EVICT") {
    sendHeartbeat(request.workerId);
    return;
  }

  const jobType: JobType | null =
    type === "GEN" || type === "MESH" ? type : null;
  if (!jobType || cx === undefined || cz === undefined || ticket === undefined)
    return;

  const startedAt = performance.now();
  try {
    if (jobType === "GEN") {
      const result = generateChunk(cx, cz);
      ctx.postMessage(
        {
          type: "GEN_DONE",
          id,
          cx,
          cz,
          ticket,
          ...identityFrom(request),
          jobDurationMs: performance.now() - startedAt,
          scratchCapacities: scratchCapacities(),
          result: {
            blocks: result.blocks,
            light: result.light,
            meta: result.meta,
          },
        },
        [result.blocks.buffer, result.light.buffer, result.meta.buffer],
      );
      return;
    }

    if (!chunk || !lights) {
      ctx.postMessage({
        type: "MESH_DONE",
        id,
        cx,
        cz,
        ticket,
        ...identityFrom(request),
        jobDurationMs: performance.now() - startedAt,
        scratchCapacities: scratchCapacities(),
        result: null,
      });
      return;
    }

    const neighbors = neighborBorders
      ? inflateNeighborBorders(neighborBorders, chunk.length, neighborScratch)
      : (legacyNeighbors ?? {});
    const neighborLights = lightBorders
      ? {
          center: lights.center,
          ...inflateNeighborBorders(lightBorders, chunk.length, lightScratch),
        }
      : lights;
    const result = generateGeometryData(
      cx,
      cz,
      chunk,
      metaData,
      neighbors,
      neighborLights,
      !!cullDarkFaces,
    );
    // Scratch accounting tracks the legacy output before compaction because the
    // source mesher still fills those buffers in this stage.
    updateGeometryScratchEstimate(result);
    const opaqueBefore = result.opaque.positions.length / 12;
    const mergedOpaque = mergeOpaqueGeometryQuads(result.opaque) as TiledGeometryAttributes;
    result.opaque = mergedOpaque;
    const opaqueAfter = mergedOpaque.positions.length / 12;

    const buffers: Transferable[] = [];
    [result.opaque, result.cutout, result.transparent].forEach((geometry) => {
      const tiled = geometry as TiledGeometryAttributes;
      buffers.push(
        geometry.positions.buffer,
        geometry.normals.buffer,
        geometry.uvs.buffer,
        geometry.colors.buffer,
        geometry.indices.buffer,
      );
      if (tiled.tileUvs) buffers.push(tiled.tileUvs.buffer);
      if (tiled.tileData) buffers.push(tiled.tileData.buffer);
    });

    ctx.postMessage(
      {
        type: "MESH_DONE",
        id,
        cx,
        cz,
        ticket,
        ...identityFrom(request),
        jobDurationMs: performance.now() - startedAt,
        scratchCapacities: scratchCapacities(),
        meshStats: {
          opaqueQuadsBefore: opaqueBefore,
          opaqueQuadsAfter: opaqueAfter,
          opaqueQuadsMerged: mergedOpaque.mergedQuadCount ?? 0,
        },
        result,
      },
      buffers,
    );
  } catch (error) {
    // Backward compatibility for commits/configurations that load this worker before
    // the Stage 1 main-thread protocol is installed: preserve the legacy onerror path.
    if (request.worldSessionId === undefined) throw error;
    ctx.postMessage({
      type: "JOB_ERROR",
      id,
      ...identityFrom(request),
      jobType,
      cx,
      cz,
      ticket,
      jobDurationMs: performance.now() - startedAt,
      errorName: error instanceof Error ? error.name : "UnknownError",
      errorMessage: error instanceof Error ? error.message : String(error),
      allocationRelated: isAllocationError(error),
      scratchCapacities: scratchCapacities(),
    });
  }
};

setInterval(() => sendHeartbeat(), 5_000);