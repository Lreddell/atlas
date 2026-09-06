// Portable v3 saves use namespaced keys. Legacy imports use the frozen map and
// validate completely before publication; malformed chunks are never skipped.
import type { ChunkBatchEntry, ChunkStorageData, ExportedWorldData, WorldMetadata } from './types';
import { decodeBlockPalette, encodeBlockPalette, upgradeLegacyBlocks } from './contentCodec';
import { decodeWorldMetadata, encodeWorldMetadata, type WorldMetadataRecord } from './metadataCodec';

export function bytesToBase64(bytes: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
    if (typeof base64 !== 'string') throw new Error('Invalid base64 chunk section');
    const binary = atob(base64);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < out.length; i++) out[i] = binary.charCodeAt(i);
    return out;
}

export type RawChunk = ChunkBatchEntry;

export function encodeExportedWorld(meta: WorldMetadata, chunks: RawChunk[]): ExportedWorldData {
    const { id: _id, created: _created, lastPlayed: _lastPlayed, ...fields } = encodeWorldMetadata(meta);
    return {
        format: 'atlas-world-export', version: 3, exportedAt: Date.now(), meta: fields,
        chunks: chunks.map(chunk => {
            const upgraded = chunk.blocks instanceof Uint16Array ? chunk : { ...chunk, ...upgradeLegacyBlocks(chunk.blocks) };
            return {
                cx: chunk.cx, cz: chunk.cz, encoding: 'palette-v1',
                blocks: bytesToBase64(encodeBlockPalette(upgraded.blocks as Uint16Array, upgraded)),
                light: bytesToBase64(chunk.light), meta: bytesToBase64(chunk.meta),
                timestamp: chunk.timestamp ?? Date.now(),
            };
        }),
    };
}

export interface DecodedExport {
    metaFields: Omit<WorldMetadata, 'id' | 'created' | 'lastPlayed'>;
    chunks: ChunkBatchEntry[];
}

export function decodeExportedWorld(data: ExportedWorldData): DecodedExport {
    if (!data || data.format !== 'atlas-world-export' || ![1, 2, 3].includes(data.version)) throw new Error('Invalid world export format.');
    if (!data.meta || typeof data.meta !== 'object' || !Array.isArray(data.chunks)) throw new Error('Missing world metadata or chunks.');
    const raw = data.meta;
    const decoded = decodeWorldMetadata({ ...raw, id: '', created: 0, lastPlayed: 0 } as WorldMetadataRecord);
    const { id: _id, created: _created, lastPlayed: _lastPlayed, ...preserved } = decoded;
    const metaFields: DecodedExport['metaFields'] = {
        ...preserved,
        schemaVersion: 3,
        name: String(raw.name || 'Imported World').trim() || 'Imported World',
        seed: String(raw.seed || ''),
        seedNum: Number.isFinite(raw.seedNum) ? raw.seedNum : 1,
        gameMode: raw.gameMode || 'survival',
        time: Number.isFinite(raw.time) ? raw.time : 6000,
    };
    const seen = new Set<string>();
    const chunks = data.chunks.map(chunk => {
        if (!Number.isSafeInteger(chunk.cx) || !Number.isSafeInteger(chunk.cz)) throw new Error('Invalid chunk coordinate; import left unchanged.');
        const key = `${chunk.cx},${chunk.cz}`;
        if (seen.has(key)) throw new Error(`Duplicate chunk ${key}; import left unchanged.`);
        seen.add(key);
        if (data.version === 3 && chunk.encoding !== 'palette-v1') throw new Error('Unsupported chunk encoding.');
        const bytes = base64ToBytes(chunk.blocks);
        const volume = data.version === 3 ? decodeBlockPalette(bytes) : upgradeLegacyBlocks(bytes);
        return {
            ...volume, cx: chunk.cx, cz: chunk.cz,
            light: base64ToBytes(chunk.light), meta: base64ToBytes(chunk.meta),
            timestamp: chunk.timestamp ?? Date.now(),
        };
    });
    return { metaFields, chunks };
}

export function uniqueWorldName(base: string, existingNames: Iterable<string>): string {
    const taken = new Set(existingNames);
    const clean = (base || 'Imported World').trim() || 'Imported World';
    if (!taken.has(clean)) return clean;
    let attempt = 2;
    while (taken.has(`${clean} (${attempt})`)) attempt++;
    return `${clean} (${attempt})`;
}

export type { ChunkStorageData };
