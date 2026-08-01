import { BlockType } from '../../types.ts';
import { ProgressionStore } from '../progression/ProgressionStore.ts';
import {
    advanceBellTitan,
    createBellTitanState,
    getBellTitanActionDuration,
    type BellTitanState,
} from '../entities/BellTitanEncounterCore.ts';
import {
    findNearestVaultCandidate,
    getVaultLayout,
    type VaultLayout,
} from './resonantVaults.ts';
import { getMeaningfulVaultRoomCount } from './resonantVaultRooms.ts';
import {
    getVaultLayoutSignature,
    validateVaultLayout,
} from './resonantVaultConnectivity.ts';
import {
    getVaultEscapeRoutes,
    validateSurfaceOutlet,
    type VaultEscapeRoute,
} from './resonantVaultEscapes.ts';
import { getVaultCacheLoot, type VaultCacheId } from './resonantVaultLoot.ts';
import {
    buildMemoryDemonstration,
    getMemoryEchoMarkers,
    MEMORY_ECHO_SOUND_EVENT,
} from './resonantEchoSequence.ts';

export interface SimulatedVaultJourney {
    locateCommandFoundVault: boolean;
    allRequiredRoomsConnected: boolean;
    meaningfulRooms: number;
    optionalAnnexes: number;
    guaranteedWeapons: Array<'spear' | 'crossbow' | 'maul'>;
    unusualArtifacts: number;
    echoDemonstrationVisibleAndAudible: boolean;
    bellTitanDefeated: boolean;
    escapeFinishedAboveSurface: boolean;
    estimatedFirstClearMinutes: number;
    layoutSignature: string;
    escapePathLength: number;
}

function deterministicSurface(seed: number, x: number, z: number): number {
    const folded = Math.abs(Math.imul(Math.floor(x), 31) + Math.imul(Math.floor(z), 17) + seed);
    return 76 + (folded % 23);
}

function allJourneyRoomsReachable(layout: VaultLayout): boolean {
    if (!validateVaultLayout(layout).valid) return false;
    const adjacency = new Map<string, Set<string>>();
    for (const room of layout.rooms) adjacency.set(room.id, new Set());
    for (const [from, to] of layout.edges) {
        adjacency.get(from)?.add(to);
        adjacency.get(to)?.add(from);
    }
    const reached = new Set<string>(['entrance']);
    const queue = ['entrance'];
    while (queue.length > 0) {
        const current = queue.shift()!;
        for (const next of adjacency.get(current) ?? []) {
            if (reached.has(next)) continue;
            reached.add(next);
            queue.push(next);
        }
    }
    return layout.rooms
        .filter(({ kind }) => kind !== 'spire')
        .every(({ id }) => reached.has(id));
}

function getGuaranteedWeapons(vaultId: string): Array<'spear' | 'crossbow' | 'maul'> {
    const caches: VaultCacheId[] = ['armory', 'ranged', 'heavy'];
    const items = caches.flatMap((cacheId) => getVaultCacheLoot(vaultId, cacheId, false));
    const weapons: Array<'spear' | 'crossbow' | 'maul'> = [];
    if (items.some(({ itemId }) => itemId === BlockType.VAULTSTEEL_SPEAR)) weapons.push('spear');
    if (items.some(({ itemId }) => itemId === BlockType.VAULT_CROSSBOW)) weapons.push('crossbow');
    if (items.some(({ itemId }) => itemId === BlockType.BELLBREAKER_MAUL)) weapons.push('maul');
    return weapons;
}

function countUnusualArtifacts(vaultId: string): number {
    const caches: VaultCacheId[] = [
        'tuning', 'armory', 'ranged', 'heavy', 'antechamber', 'core', 'ascent',
    ];
    return caches
        .flatMap((cacheId) => getVaultCacheLoot(vaultId, cacheId, true))
        .reduce((count, entry) => count + (entry.itemId === BlockType.ECHO_TUNING_FORK ? entry.count : 0), 0);
}

function defeatBellTitan(): BellTitanState {
    let state = advanceBellTitan(createBellTitanState(), { type: 'wake' }).state;
    for (let iteration = 0; iteration < 240 && state.action !== 'death'; iteration += 1) {
        if (state.action === 'core_open') {
            state = advanceBellTitan(state, { type: 'damage', amount: 140, hitZone: 'core' }).state;
            continue;
        }
        const remaining = Math.max(0.01, getBellTitanActionDuration(state.action, state.phase) - state.actionTime + 0.01);
        state = advanceBellTitan(state, { type: 'tick', dt: remaining, playerDistance: 6 }).state;
    }
    return state;
}

function estimateFirstClearMinutes(layout: VaultLayout, route: VaultEscapeRoute): number {
    const meaningfulRooms = getMeaningfulVaultRoomCount(layout.rooms);
    const combatRooms = layout.rooms.filter(({ kind }) => [
        'guard_hall', 'resonance_foundry', 'inner_works', 'bell_crypt',
    ].includes(kind)).length;
    const puzzleRooms = layout.rooms.filter(({ kind }) => [
        'memory_choir', 'counterweight_gallery', 'acoustic_relay', 'broken_crossing',
    ].includes(kind)).length;
    const routeMinutes = getVaultEscapeRoutes(layout)[route].pathLength / 80;
    return Number((
        8
        + meaningfulRooms * 2.25
        + combatRooms * 1.75
        + puzzleRooms * 1.25
        + 6.5
        + routeMinutes
    ).toFixed(1));
}

export async function simulateVaultJourney(input: {
    seed: number;
    route: VaultEscapeRoute;
}): Promise<SimulatedVaultJourney> {
    const candidate = findNearestVaultCandidate(0, 0, input.seed, 18000);
    if (!candidate) throw new Error(`No Resonant Vault found for seed ${input.seed}`);
    const getSurfaceY = (x: number, z: number) => deterministicSurface(input.seed, x, z);
    const layout = getVaultLayout(candidate, getSurfaceY(candidate.centerX, candidate.centerZ), getSurfaceY);
    const memoryRoom = layout.rooms.find(({ kind }) => kind === 'memory_choir');
    if (!memoryRoom) throw new Error(`Vault ${layout.vaultId} is missing its Memory Choir`);
    const echoSteps = buildMemoryDemonstration(
        layout.glyphSequence,
        getMemoryEchoMarkers(memoryRoom),
        true,
    );
    const echoVisible = echoSteps.length === layout.glyphSequence.length * 2
        && echoSteps.every(({ marker }) => [marker.x, marker.y, marker.z].every(Number.isFinite));
    const echoAudible = MEMORY_ECHO_SOUND_EVENT === 'vault.echo_step';

    const titan = defeatBellTitan();
    const progress = new ProgressionStore();
    progress.setVaultDiscovered(layout.vaultId);
    for (const room of layout.rooms.filter(({ kind }) => [
        'guard_hall', 'resonance_foundry', 'memory_choir', 'counterweight_gallery',
        'acoustic_relay', 'broken_crossing', 'inner_works',
    ].includes(kind))) progress.setVaultRoomSolved(layout.vaultId, room.id);
    if (titan.action === 'death') progress.markVaultTitanDefeated(layout.vaultId);
    progress.claimVaultCore(layout.vaultId);
    progress.startVaultEscape(layout.vaultId);
    progress.chooseVaultEscapeRoute(layout.vaultId, input.route);

    const escapeRoutes = getVaultEscapeRoutes(layout);
    const selectedRoute = escapeRoutes[input.route];
    const surfaceValidation = validateSurfaceOutlet(selectedRoute, layout.surfaceOutlets[input.route].surfaceY);
    if (surfaceValidation.reachesSurface && surfaceValidation.openToSky) {
        const lastCheckpoint = selectedRoute.checkpoints[selectedRoute.checkpoints.length - 1];
        if (lastCheckpoint) progress.setVaultEscapeCheckpoint(layout.vaultId, {
            ...lastCheckpoint,
            route: input.route,
        });
        progress.updateVaultEscapeRemaining(layout.vaultId, 0);
        progress.completeVaultEscape(layout.vaultId, input.route);
    }

    return {
        locateCommandFoundVault: true,
        allRequiredRoomsConnected: allJourneyRoomsReachable(layout),
        meaningfulRooms: getMeaningfulVaultRoomCount(layout.rooms),
        optionalAnnexes: layout.rooms.filter(({ id }) => id.startsWith('annex_')).length,
        guaranteedWeapons: getGuaranteedWeapons(layout.vaultId),
        unusualArtifacts: countUnusualArtifacts(layout.vaultId),
        echoDemonstrationVisibleAndAudible: echoVisible && echoAudible,
        bellTitanDefeated: progress.getVaultProgress(layout.vaultId).titanDefeated,
        escapeFinishedAboveSurface: progress.getVaultProgress(layout.vaultId).escapeCompleted
            && surfaceValidation.reachesSurface
            && surfaceValidation.openToSky
            && selectedRoute.surfaceLanding.y >= selectedRoute.surfaceY + 1,
        estimatedFirstClearMinutes: estimateFirstClearMinutes(layout, input.route),
        layoutSignature: getVaultLayoutSignature(layout),
        escapePathLength: selectedRoute.pathLength,
    };
}
