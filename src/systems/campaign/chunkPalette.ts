// Gate 0: Versioned palette chunk encoding capable of >256 global blocks.
// Old saves (schema 1, raw Uint8Array) remain readable via dual-read.
// New palette payloads (schema 2+) store a string palette + packed indices.
//
// This module intentionally does NOT switch WorldManager storage yet; it
// provides the codec + migration + measurement so region prompts can add
// content without squeezing BlockType gaps. Wire-up happens per-world via
// campaign metadata (see campaignGraph.ts) with copy-on-write safety.

export const CHUNK_CODEC_RAW_U8 = 1;
export const CHUNK_CODEC_PALETTE_V1 = 2;

export interface PaletteChunk {
  schema: number;
  /** Palette of stable namespaced IDs, index 0 is always air. */
  palette: string[];
  /** One index per voxel, length must equal voxelCount. Uint16 to allow >256. */
  indices: Uint16Array;
  light: Uint8Array;
  meta: Uint8Array;
}

export interface RawChunk {
  schema: typeof CHUNK_CODEC_RAW_U8;
  blocks: Uint8Array;
  light: Uint8Array;
  meta: Uint8Array;
}

export function encodePaletteChunk(
  namespacedVoxels: string[],
  light: Uint8Array,
  meta: Uint8Array,
): PaletteChunk {
  const palette: string[] = ['minecraft:air'];
  const paletteIndex = new Map<string, number>([['minecraft:air', 0]]);
  const indices = new Uint16Array(namespacedVoxels.length);
  for (let i = 0; i < namespacedVoxels.length; i++) {
    const id = namespacedVoxels[i] || 'minecraft:air';
    let idx = paletteIndex.get(id);
    if (idx === undefined) {
      idx = palette.length;
      if (idx > 65535) throw new Error('Palette exceeds uint16 range.');
      palette.push(id);
      paletteIndex.set(id, idx);
    }
    indices[i] = idx;
  }
  return { schema: CHUNK_CODEC_PALETTE_V1, palette, indices, light, meta };
}

export function decodePaletteChunk(chunk: PaletteChunk): string[] {
  const out = new Array<string>(chunk.indices.length);
  for (let i = 0; i < chunk.indices.length; i++) {
    out[i] = chunk.palette[chunk.indices[i]] ?? 'minecraft:air';
  }
  return out;
}

/**
 * Dual-read: accept raw u8 chunks (legacy) or palette chunks.
 * Unknown palette IDs decode to a recoverable placeholder, never silent air.
 */
export function dualReadVoxel(
  chunk: RawChunk | PaletteChunk,
  index: number,
  legacyNames: Readonly<Record<number, string>>,
  unknownPlaceholder = 'atlas:unknown_placeholder',
): string {
  if (chunk.schema === CHUNK_CODEC_RAW_U8) {
    const raw = (chunk as RawChunk).blocks[index] ?? 0;
    return legacyNames[raw] ?? unknownPlaceholder;
  }
  const paletteChunk = chunk as PaletteChunk;
  const paletteId = paletteChunk.palette[paletteChunk.indices[index]];
  return paletteId ?? unknownPlaceholder;
}

export interface CodecMeasurement {
  rawBytes: number;
  paletteBytes: number;
  paletteEntries: number;
  voxelCount: number;
}

/** Evidence helper: compare raw u8 size vs palette size for a chunk. */
export function measureChunkCodecs(
  rawBlocks: Uint8Array,
  namespacedVoxels: string[],
): CodecMeasurement {
  const encoded = encodePaletteChunk(
    namespacedVoxels,
    new Uint8Array(rawBlocks.length),
    new Uint8Array(rawBlocks.length),
  );
  let paletteBytes = 0;
  for (const entry of encoded.palette) paletteBytes += entry.length + 1;
  paletteBytes += encoded.indices.byteLength;
  return {
    rawBytes: rawBlocks.byteLength,
    paletteBytes,
    paletteEntries: encoded.palette.length,
    voxelCount: rawBlocks.length,
  };
}

/** Serialize palette chunk to a compact JSON-safe form for export/migration. */
export function serializePaletteChunk(chunk: PaletteChunk): {
  schema: number;
  palette: string[];
  indices: number[];
} {
  return {
    schema: chunk.schema,
    palette: [...chunk.palette],
    indices: Array.from(chunk.indices),
  };
}
