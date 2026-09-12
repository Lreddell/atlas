// Content identity is resolved here, before/after the byte-only storage boundary.
// Electron main and OPFS region I/O never carry a duplicate game registry.
import { decodeBlockPalette, encodeBlockPalette, upgradeLegacyBlocks } from './contentCodec';
import type { ChunkBatchEntry, ChunkStorageData } from './types';

export function decodeStoredChunk<T extends ChunkBatchEntry | ChunkStorageData>(chunk: T): T & { blocks: Uint16Array } {
    if (!(chunk.light instanceof Uint8Array) || !(chunk.meta instanceof Uint8Array)) throw new Error('Invalid saved light or metadata arrays');
    if (chunk.encoding === 'palette-v1') {
        if (!(chunk.blocks instanceof Uint8Array)) throw new Error('Invalid palette byte storage');
        const decoded = decodeBlockPalette(chunk.blocks);
        return { ...chunk, ...decoded, encoding: undefined };
    }
    if (chunk.encoding !== undefined) throw new Error(`Unsupported saved chunk encoding ${chunk.encoding}`);
    if (chunk.blocks instanceof Uint8Array) return { ...chunk, ...upgradeLegacyBlocks(chunk.blocks) };
    if (chunk.blocks instanceof Uint16Array) return { ...chunk, blocks: chunk.blocks };
    throw new Error('Invalid saved voxel array');
}

export function encodeStoredChunk<T extends ChunkBatchEntry | ChunkStorageData>(chunk: T): T & { blocks: Uint8Array } {
    if (chunk.encoding === 'palette-v1') {
        // Already-framed transport data: validate without introducing runtime identity into the backend.
        decodeStoredChunk(chunk);
        return chunk as T & { blocks: Uint8Array };
    }
    const runtime = decodeStoredChunk(chunk);
    return { ...chunk, blocks: encodeBlockPalette(runtime.blocks, runtime), encoding: 'palette-v1', tileEntities: undefined };
}
