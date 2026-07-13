const CHUNK_SIZE = 16;
const WORLD_HEIGHT = 384;

export const MIB = 1024 * 1024;
export const RAW_BYTES_PER_CHUNK = CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE * 3;

export interface StreamingBudget {
  softBytes: number;
  hardBytes: number;
  maxResidentChunks: number;
  protectedMinimum: number;
}

interface GeometryAttributesLike {
  positions?: ArrayBufferView;
  normals?: ArrayBufferView;
  uvs?: ArrayBufferView;
  colors?: ArrayBufferView;
  indices?: ArrayBufferView;
}

export interface GeometryResultLike {
  opaque?: GeometryAttributesLike | null;
  cutout?: GeometryAttributesLike | null;
  transparent?: GeometryAttributesLike | null;
}

const isArrayBufferView = (value: unknown): value is ArrayBufferView => ArrayBuffer.isView(value);

const sumUniqueBuffers = (value: unknown, seen: Set<ArrayBufferLike>, seenObjects: Set<object>): number => {
  if (value == null) return 0;

  if (value instanceof ArrayBuffer) {
    if (seen.has(value)) return 0;
    seen.add(value);
    return value.byteLength;
  }

  if (isArrayBufferView(value)) {
    const buffer = value.buffer;
    if (seen.has(buffer)) return 0;
    seen.add(buffer);
    return buffer.byteLength;
  }

  if (typeof value !== 'object') return 0;
  if (seenObjects.has(value)) return 0;
  seenObjects.add(value);

  if (Array.isArray(value)) {
    let total = 0;
    for (const entry of value) total += sumUniqueBuffers(entry, seen, seenObjects);
    return total;
  }

  let total = 0;
  for (const entry of Object.values(value as Record<string, unknown>)) {
    total += sumUniqueBuffers(entry, seen, seenObjects);
  }
  return total;
};

export const estimateTransferBytes = (value: unknown): number =>
  sumUniqueBuffers(value, new Set<ArrayBufferLike>(), new Set<object>());

export const byteLengthOfGeometryResult = (result: GeometryResultLike | null | undefined): number =>
  estimateTransferBytes(result);

export const getResidentChunkCap = ({
  hardBytes,
  protectedMinimum = 197,
  rawBytesPerChunk = RAW_BYTES_PER_CHUNK,
  chunkMemoryFraction = 0.65,
}: {
  hardBytes: number;
  protectedMinimum?: number;
  rawBytesPerChunk?: number;
  chunkMemoryFraction?: number;
}): number => {
  if (!Number.isFinite(hardBytes) || hardBytes <= 0) return protectedMinimum;
  const usable = Math.max(0, hardBytes * Math.min(0.9, Math.max(0.1, chunkMemoryFraction)));
  return Math.max(protectedMinimum, Math.floor(usable / Math.max(1, rawBytesPerChunk)));
};

export const getDefaultStreamingBudget = (
  deviceMemoryGiB?: number,
  isMobile = false,
): StreamingBudget => {
  const memory = Number.isFinite(deviceMemoryGiB) ? Math.max(1, deviceMemoryGiB as number) : 8;

  let hardMiB: number;
  if (memory <= 2) hardMiB = 256;
  else if (isMobile || memory <= 4) hardMiB = 384;
  else if (memory <= 8) hardMiB = 768;
  else hardMiB = 1024;

  if (isMobile) hardMiB = Math.min(hardMiB, 512);

  const hardBytes = hardMiB * MIB;
  const softBytes = Math.floor(hardBytes * 0.75);
  const protectedMinimum = 197;

  return {
    softBytes,
    hardBytes,
    protectedMinimum,
    maxResidentChunks: getResidentChunkCap({ hardBytes, protectedMinimum }),
  };
};
