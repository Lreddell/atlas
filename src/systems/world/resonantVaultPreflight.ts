import type { WorldMetadata } from './storage/types.ts';
import {
    getVaultFootprintChunks,
    getVaultLayoutSignature,
    validateVaultLayout,
    type VaultChunkCoordinate,
} from './resonantVaultConnectivity.ts';
import { getVaultId, type VaultCandidate, type VaultLayout } from './resonantVaults.ts';

export type VaultCandidateDecision =
    | { accepted: true; reason: 'existing-reservation' | 'new-reservation'; layoutSignature: string }
    | { accepted: false; reason: 'invalid-layout' | 'missing-world' | 'persisted-footprint-conflict' };

export interface VaultPreflightContext {
    worldId: string;
    candidate: VaultCandidate;
    layout: VaultLayout;
    hasMemoryChunk(coordinate: VaultChunkCoordinate): boolean;
    hasAnyPersistedChunk(worldId: string, coordinates: readonly VaultChunkCoordinate[]): Promise<boolean>;
    readMeta(worldId: string): Promise<WorldMetadata | undefined>;
    writeMeta(meta: WorldMetadata): Promise<void>;
}

export async function preflightVaultCandidate(context: VaultPreflightContext): Promise<VaultCandidateDecision> {
    const validation = validateVaultLayout(context.layout);
    if (!validation.valid) return { accepted: false, reason: 'invalid-layout' };

    const vaultId = getVaultId(context.candidate);
    const layoutSignature = getVaultLayoutSignature(context.layout);
    const meta = await context.readMeta(context.worldId);
    if (!meta) return { accepted: false, reason: 'missing-world' };
    if (meta.resonantVaultReservations?.[vaultId]?.layoutSignature === layoutSignature) {
        return { accepted: true, reason: 'existing-reservation', layoutSignature };
    }

    const coordinates = getVaultFootprintChunks(context.layout);
    if (coordinates.some((coordinate) => context.hasMemoryChunk(coordinate))
        || await context.hasAnyPersistedChunk(context.worldId, coordinates)) {
        return { accepted: false, reason: 'persisted-footprint-conflict' };
    }

    await context.writeMeta({
        ...meta,
        resonantVaultReservations: {
            ...(meta.resonantVaultReservations ?? {}),
            [vaultId]: { layoutSignature, acceptedAtVersion: 1 },
        },
    });
    return { accepted: true, reason: 'new-reservation', layoutSignature };
}
