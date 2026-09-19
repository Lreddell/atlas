// Portable Atlas world export/import format (NOT an external-game format). This
// is the existing `atlas-world-export` JSON representation, factored out so every
// backend produces and consumes byte-for-byte the same thing, so a world
// exported from the web (IndexedDB) imports on desktop (filesystem) and vice
// versa. The wire format is unchanged from the original WorldStorage so existing
// .atlasworld.json files keep working.

import type {
    ChunkBatchEntry,
    ChunkStorageData,
    ExportedWorldData,
    WorldMetadata,
} from './types';
import { copyUpLegacyBlocks } from '../../registry/blockRegistry';

export function bytesToBase64(bytes: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
    const binary = atob(base64);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
}

/** Little-endian uint16 voxels <-> base64 bytes (export v3 blocks plane). */
export function blocksToBase64(blocks: Uint16Array): string {
    return bytesToBase64(new Uint8Array(blocks.buffer, blocks.byteOffset, blocks.byteLength));
}

export function base64ToBlocks(base64: string): Uint16Array {
    const bytes = base64ToBytes(base64);
    if (bytes.length % 2 !== 0) throw new Error('Invalid exported blocks plane (odd byte length).');
    const out = new Uint16Array(bytes.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = bytes[i * 2] | (bytes[i * 2 + 1] << 8);
    return out;
}

/** A chunk read from storage, paired with its coordinates. */
export interface RawChunk { cx: number; cz: number; blocks: Uint16Array | Uint8Array; light: Uint8Array; meta: Uint8Array; timestamp?: number; }

/** Faithful width copy for the encode path (no remap: memory is already valid). */
function toVoxelBlocks(blocks: Uint16Array | Uint8Array): Uint16Array {
    if (blocks instanceof Uint16Array) return blocks;
    const out = new Uint16Array(blocks.length);
    out.set(blocks);
    return out;
}

export function encodeExportedWorld(meta: WorldMetadata, chunks: RawChunk[]): ExportedWorldData {
    return {
        format: 'atlas-world-export',
        version: 3,
        exportedAt: Date.now(),
        meta: {
            name: meta.name,
            seed: meta.seed,
            seedNum: meta.seedNum,
            gameMode: meta.gameMode,
            time: meta.time,
            player: meta.player,
            spawnPoint: meta.spawnPoint ?? null,
            worldSpawn: meta.worldSpawn ?? null,
            worldGenConfig: meta.worldGenConfig,
            worldGenPresetId: meta.worldGenPresetId ?? null,
            worldGenPresetName: meta.worldGenPresetName ?? null,
            progression: meta.progression,
            boats: meta.boats,
            resonantVaultReservations: meta.resonantVaultReservations,
            campaignGraph: meta.campaignGraph,
            provenance: meta.provenance,
            previewRegion: meta.previewRegion,
            registrySnapshot: meta.registrySnapshot,
            tileEntities: meta.tileEntities,
        },
        chunks: chunks.map((c) => ({
            cx: c.cx,
            cz: c.cz,
            blocks: blocksToBase64(toVoxelBlocks(c.blocks)),
            light: bytesToBase64(c.light),
            meta: bytesToBase64(c.meta),
            timestamp: Number(c.timestamp) || Date.now(),
        })),
    };
}

export interface DecodedExport {
    metaFields: Omit<WorldMetadata, 'id' | 'created' | 'lastPlayed'>;
    chunks: ChunkBatchEntry[];
}

export function decodeExportedWorld(data: ExportedWorldData): DecodedExport {
    if (!data || data.format !== 'atlas-world-export' || (data.version !== 1 && data.version !== 2 && data.version !== 3)) {
        throw new Error('Invalid world export format.');
    }
    const m = data.meta || ({} as ExportedWorldData['meta']);
    const metaFields: Omit<WorldMetadata, 'id' | 'created' | 'lastPlayed'> = {
        name: String(m?.name || 'Imported World').trim() || 'Imported World',
        seed: String(m?.seed || ''),
        seedNum: Number(m?.seedNum) || 1,
        gameMode: m?.gameMode || 'survival',
        time: Number(m?.time) || 6000,
        player: m?.player,
        spawnPoint: m?.spawnPoint ?? null,
        worldSpawn: m?.worldSpawn ?? null,
        worldGenConfig: m?.worldGenConfig,
        worldGenPresetId: m?.worldGenPresetId ?? null,
        worldGenPresetName: m?.worldGenPresetName ?? null,
        progression: m?.progression,
        boats: m?.boats,
        resonantVaultReservations: m?.resonantVaultReservations,
        campaignGraph: m?.campaignGraph,
        provenance: m?.provenance,
        previewRegion: m?.previewRegion,
        registrySnapshot: m?.registrySnapshot,
        tileEntities: m?.tileEntities,
    };

    const chunks: ChunkBatchEntry[] = [];
    const list = Array.isArray(data.chunks) ? data.chunks : [];
    for (const chunk of list) {
        if (!Number.isFinite(chunk.cx) || !Number.isFinite(chunk.cz)) continue;
        try {
            // v3 stores u16LE blocks; v1/v2 stored uint8 (copied up + remapped).
            const blocks = data.version === 3
                ? copyUpLegacyBlocks(base64ToBlocks(chunk.blocks))
                : copyUpLegacyBlocks(base64ToBytes(chunk.blocks));
            chunks.push({
                cx: chunk.cx,
                cz: chunk.cz,
                blocks,
                light: base64ToBytes(chunk.light),
                meta: base64ToBytes(chunk.meta),
                timestamp: Number(chunk.timestamp) || Date.now(),
            });
        } catch {
            // Skip malformed chunk entries (matches the original importer).
        }
    }
    return { metaFields, chunks };
}

/** Disambiguate an imported world name against existing names (e.g. "World (2)"). */
export function uniqueWorldName(base: string, existingNames: Iterable<string>): string {
    const taken = new Set(existingNames);
    const clean = (base || 'Imported World').trim() || 'Imported World';
    if (!taken.has(clean)) return clean;
    let attempt = 2;
    let candidate = `${clean} (${attempt})`;
    while (taken.has(candidate)) { attempt += 1; candidate = `${clean} (${attempt})`; }
    return candidate;
}

export type { ChunkStorageData };
