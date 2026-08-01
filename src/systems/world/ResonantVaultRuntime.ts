import { BlockType, type GameMode } from '../../types';
import { worldManager } from '../WorldManager';
import { progression } from '../progression/ProgressionStore';
import { gameEvents } from '../events/GameEvents';
import { particleFx } from '../fx/particleFx';
import { addTrauma } from '../player/cameraShake';
import { soundManager } from '../sound/SoundManager';
import { resonantEncounterDirector } from '../entities/ResonantEncounterDirector';
import { insetEncounterBounds, isPlayerInsideEncounter } from '../entities/resonantEncounterActivation';
import { bellTitanEncounter } from '../entities/BellTitanEncounter';
import type { BellTitanAction } from '../entities/BellTitanEncounterCore';
import { getTerrainHeight } from './chunkGeneration';
import {
    findNearestVaultCandidate,
    getTraversalPhaseCells,
    getVaultCorridorRoute,
    getVaultDoorwayRoomOpening,
    getVaultLayout,
    getVaultRoomAt,
    getVaultShaftCenter,
    getVaultSpirePosition,
    isVaultStructurePosition,
    RESONANT_VAULT_RUNTIME_RADIUS,
    type VaultCandidate,
    type VaultLayout,
    type VaultRoom,
    type VaultRoomKind,
    type VaultRoutePoint,
} from './resonantVaults';
import {
    getVaultPreSealRequiredRoomIds,
    getVaultRequiredRoomIds,
} from './resonantVaultProgression';
import {
    advanceMemoryInput,
    beginRelay,
    advanceRelayInput,
    getNextVaultEchoTarget,
    getVaultRoomPath,
    isPhaseLaneSolid,
    type MemoryState,
    type RelayState,
} from './resonantMachineryRules';
import { getCompletedEscapeRoute } from './resonantVaultEscapeRules';
import {
    getVaultEscapeRoutes,
    type VaultEscapeRoute,
    type VaultEscapeRouteDescriptor,
} from './resonantVaultEscapes';
import {
    advanceVaultEscape,
    createVaultEscapeState,
    getEscapeHazardTier,
    VAULT_ESCAPE_DURATION_SECONDS,
} from './resonantVaultEscapeRuntime';
import {
    getHazardFloorCells,
    resonantVaultHazards,
    type VaultHazardRenderState,
} from './resonantVaultHazards';
import { canEditSealedVaultCell, type VaultPlayerEdit } from './resonantVaultEditRules';
import { ECHO_PREVIEW_MILLISECONDS, ECHO_PREVIEW_SECONDS, ResonantEchoScheduler } from './resonantEchoTiming';
import {
    buildMemoryDemonstration,
    getMemoryEchoMarkers,
    type VaultEchoStep,
} from './resonantEchoSequence';
import {
    advanceTraversalCheckpoint,
    buildVaultPuzzleDescriptor,
    CROSSING_CHECKPOINT_IDS,
    getCrossingPitDescriptor,
    getCrossingStairRotation,
    isCrossingFinishReached,
    isInsideCrossingRecoveryVolume,
    type TraversalCheckpointState,
} from './resonantVaultPuzzles';

export { getCompletedEscapeRoute } from './resonantVaultEscapeRules';
export { getVaultPreSealRequiredRoomIds, getVaultRequiredRoomIds } from './resonantVaultProgression';
export type { VaultPlayerEdit } from './resonantVaultEditRules';

export interface ResonantUseInput {
    origin: { x: number; y: number; z: number };
    direction: { x: number; y: number; z: number };
    heldItem: BlockType;
    target?: { x: number; y: number; z: number; type: BlockType; metadata: number } | null;
    gameMode: GameMode;
}

export interface ResonantRuntimeSnapshot {
    vaultId: string | null;
    room: VaultRoomKind | null;
    discovered: boolean;
    entered: boolean;
    roomSolved: boolean;
    expeditionReady: boolean;
    memoryProgress: number;
    restoreProgress: number;
    restoreTotal: number;
    counterweightProgress: number;
    counterweightTotal: number;
    crossingPitActive: boolean;
    echoMode: 'idle' | 'listen' | 'repeat';
    echoProgress: number;
    echoLength: number;
    titanActive: boolean;
    titanCoreExposed: boolean;
    titanDefeated: boolean;
    titanAction: BellTitanAction | null;
    coreClaimed: boolean;
    escapeStarted: boolean;
    escapeCompleted: boolean;
    escapeRoute: VaultEscapeRoute | null;
    escapeHazardTier: 0 | 1 | 2 | 3;
    escapeCheckpoint: string | null;
    escapeRemaining: number;
    requiredCompleted: number;
    requiredTotal: number;
    preSealCompleted: number;
    preSealTotal: number;
    nearInnerSeal: boolean;
    guidanceActive: boolean;
}

type SnapshotListener = () => void;

interface ActiveMemoryDemonstration {
    vaultId: string;
    floorY: number;
    cells: VaultRoutePoint[];
    steps: VaultEchoStep[];
    startedAt: number;
    nextStep: number;
}

const DISCOVERY_DISTANCE = 42;
const VAULT_COMBAT_ROOM_KINDS = new Set<VaultRoomKind>([
    'guard_hall',
    'resonance_foundry',
    'inner_works',
    'bell_crypt',
    'grand_ascent',
]);
function roomBounds(room: VaultRoom) {
    const minX = room.x - Math.floor(room.width / 2);
    const minZ = room.z - Math.floor(room.depth / 2);
    return {
        minX,
        maxX: minX + room.width - 1,
        minY: room.y,
        maxY: room.y + room.height - 1,
        minZ,
        maxZ: minZ + room.depth - 1,
    };
}

function isInsideRoom(position: { x: number; y: number; z: number }, room: VaultRoom, margin = 0): boolean {
    const bounds = roomBounds(room);
    return position.x >= bounds.minX - margin && position.x <= bounds.maxX + margin
        && position.y >= bounds.minY - margin && position.y <= bounds.maxY + margin
        && position.z >= bounds.minZ - margin && position.z <= bounds.maxZ + margin;
}

function sameVaultCell(left: VaultRoutePoint, right: VaultRoutePoint): boolean {
    return left.x === right.x && left.y === right.y && left.z === right.z;
}

function getTitanConfirmationControl(room: VaultRoom): VaultRoutePoint {
    return { x: room.x, y: room.y, z: room.z };
}

class ResonantVaultRuntime {
    private candidate: VaultCandidate | null = null;
    private layout: VaultLayout | null = null;
    private activeRoom: VaultRoomKind | null = null;
    private memory = new Map<string, MemoryState>();
    private memoryInputOpen = new Set<string>();
    private demonstratedMemoryVaults = new Set<string>();
    private memoryDemonstration: ActiveMemoryDemonstration | null = null;
    private echoMode: ResonantRuntimeSnapshot['echoMode'] = 'idle';
    private echoProgress = 0;
    private echoLength = 0;
    private relay = new Map<string, RelayState>();
    private counterweightStages = new Map<string, number>();
    private traversalCheckpoints = new Map<string, TraversalCheckpointState>();
    private crossingPitActive = new Set<string>();
    private phaseBlocks = new Map<string, Array<{ x: number; y: number; z: number; lane: number }>>();
    private phaseApplied = new Map<string, Map<number, boolean>>();
    private escapePlatformSolid = new Map<string, boolean>();
    private enteredVaults = new Set<string>();
    private echoScheduler = new ResonantEchoScheduler();
    private runtimeClock = 0;
    private discoveryPulse = 0;
    private hazardCooldown = 0;
    private guidanceUntil = 0;
    private nearInnerSeal = false;
    private titanCinematicPending: string | null = null;
    private listeners = new Set<SnapshotListener>();
    private snapshot: ResonantRuntimeSnapshot = {
        vaultId: null,
        room: null,
        discovered: false,
        entered: false,
        roomSolved: false,
        expeditionReady: false,
        memoryProgress: 0,
        restoreProgress: 0,
        restoreTotal: 0,
        counterweightProgress: 0,
        counterweightTotal: 0,
        crossingPitActive: false,
        echoMode: 'idle',
        echoProgress: 0,
        echoLength: 0,
        titanActive: false,
        titanCoreExposed: false,
        titanDefeated: false,
        titanAction: null,
        coreClaimed: false,
        escapeStarted: false,
        escapeCompleted: false,
        escapeRoute: null,
        escapeHazardTier: 0,
        escapeCheckpoint: null,
        escapeRemaining: 0,
        requiredCompleted: 0,
        requiredTotal: 0,
        preSealCompleted: 0,
        preSealTotal: 0,
        nearInnerSeal: false,
        guidanceActive: false,
    };

    subscribe = (listener: SnapshotListener): (() => void) => {
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
    };

    getSnapshot = (): ResonantRuntimeSnapshot => this.snapshot;

    private notify(): void {
        for (const listener of this.listeners) listener();
    }

    getActiveVaultId(): string | null {
        return this.layout?.vaultId ?? null;
    }

    skipRequirementsBeforeBoss(player: { x: number; y: number; z: number }): {
        vaultId: string;
        completed: number;
        total: number;
    } | null {
        this.resolveVault(player);
        const layout = this.layout;
        if (!layout) return null;

        const requiredRoomIds = getVaultRequiredRoomIds(layout);
        const completed = requiredRoomIds.reduce(
            (count, roomId) => count + (progression.setVaultRoomSolved(layout.vaultId, roomId) ? 1 : 0),
            0,
        );
        this.openHubSeal(layout);
        this.updateSnapshot();
        return { vaultId: layout.vaultId, completed, total: requiredRoomIds.length };
    }

    prepareForPlayerRecovery(): void {
        this.restoreEscapePlatforms();
        this.titanCinematicPending = null;
    }

    canPlayerEditAt(x: number, y: number, z: number, edit: VaultPlayerEdit): boolean {
        if (!this.layout) return true;
        if (progression.getVaultProgress(this.layout.vaultId).escapeCompleted) return true;
        if (!isVaultStructurePosition(this.layout, { x, y, z })) return true;
        const gatePlaneCell = this.layout.doorways.some(({ gate, opening }) => gate
            && opening.some((cell) => cell.x === x && cell.y === y && cell.z === z));
        const traversal = this.layout.rooms.find(({ kind }) => kind === 'broken_crossing');
        const movingHazardCell = traversal
            ? getTraversalPhaseCells(traversal, this.layout.phaseTiming).some((cell) => cell.x === x && cell.y === y && cell.z === z)
            : false;
        const torchDeniedCell = gatePlaneCell || movingHazardCell;
        return canEditSealedVaultCell(edit, torchDeniedCell);
    }

    private resolveVault(player: { x: number; y: number; z: number }): void {
        const seed = worldManager.getSeed();
        const candidate = findNearestVaultCandidate(
            player.x,
            player.z,
            seed,
            RESONANT_VAULT_RUNTIME_RADIUS,
            (entry) => worldManager.getVaultCandidateStatus(entry) === 'rejected',
        );
        if (!candidate) {
            if (this.layout) this.leaveActiveVault();
            return;
        }
        // Only preflight-accepted vaults get a live controller. A rejected or
        // undecided candidate has no generated structure, and running vault
        // logic against bare terrain seals natural caves and spawns encounters
        // in the open world.
        const status = worldManager.getVaultCandidateStatus(candidate);
        if (status !== 'accepted') {
            if (status === 'unknown') worldManager.requestVaultCandidatePreflight(candidate);
            if (this.layout) this.leaveActiveVault();
            return;
        }
        const vaultId = `resonant:${candidate.gridX}:${candidate.gridZ}`;
        const currentPrefix = this.layout?.vaultId.split(':').slice(0, 3).join(':');
        if (this.layout && currentPrefix === vaultId) return;
        if (this.layout) this.leaveActiveVault();
        this.candidate = candidate;
        const layout = getVaultLayout(
            candidate,
            getTerrainHeight(candidate.centerX, candidate.centerZ),
            getTerrainHeight,
        );
        this.layout = layout;
        bellTitanEncounter.configureArena(
            layout.vaultId,
            layout,
            progression.getVaultProgress(layout.vaultId).titanDefeated,
        );
        resonantVaultHazards.configure(layout.vaultId, getVaultEscapeRoutes(layout));
        const progress = progression.getVaultProgress(layout.vaultId);
        if (progress.escapeStarted && !progress.escapeCompleted) {
            this.applyEscapeGateChoice(layout, progress.escapeRoute ?? null);
            this.setEntranceEscapeSeal(layout, true);
        } else if (progress.escapeCompleted) {
            this.setEntranceEscapeSeal(layout, false);
        }
        this.activeRoom = null;
    }

    private leaveActiveVault(): void {
        this.restoreEscapePlatforms();
        if (this.layout) {
            const vaultPrefix = `${this.layout.vaultId}:`;
            resonantEncounterDirector.resetVault(this.layout.vaultId);
            gameEvents.emit('vault:left', { vaultId: this.layout.vaultId });
            this.restorePhaseBlocks(this.layout.vaultId);
            for (const key of [...this.crossingPitActive]) {
                if (key.startsWith(vaultPrefix)) this.crossingPitActive.delete(key);
            }
        }
        bellTitanEncounter.cleanup();
        resonantVaultHazards.reset();
        this.echoScheduler.reset();
        this.cancelMemoryDemonstration();
        this.candidate = null;
        this.layout = null;
        this.activeRoom = null;
        this.guidanceUntil = 0;
        this.nearInnerSeal = false;
        this.titanCinematicPending = null;
    }

    tick(dt: number, player: { x: number; y: number; z: number }, gameMode: GameMode): number {
        const step = Math.max(0, Math.min(0.1, dt));
        this.discoveryPulse = Math.max(0, this.discoveryPulse - step);
        this.hazardCooldown = Math.max(0, this.hazardCooldown - step);
        this.resolveVault(player);
        this.runtimeClock += step;
        this.echoScheduler.tick(this.runtimeClock);
        this.tickMemoryDemonstration();
        let damage = gameMode === 'spectator' ? 0 : resonantEncounterDirector.tick(step, player);
        if (!this.layout || !this.candidate || gameMode === 'spectator') {
            this.updateSnapshot();
            return damage;
        }

        const layout = this.layout;
        const progress = progression.getVaultProgress(layout.vaultId);
        const spire = layout.rooms.find((room) => room.kind === 'spire')!;
        const spireDistance = Math.hypot(player.x - spire.x, player.z - spire.z);
        if (spireDistance <= DISCOVERY_DISTANCE && player.y >= layout.surfaceY - 8) {
            progression.setVaultDiscovered(layout.vaultId, { x: spire.x, y: layout.surfaceY + 1, z: spire.z });
            this.tickDiscoveryPulse(spire, layout);
        }

        const room = getVaultRoomAt(layout, player, 1);
        if (room?.kind === 'arena') {
            bellTitanEncounter.configureArena(layout.vaultId, layout, progress.titanDefeated);
        }
        const nextRoom = room?.kind ?? null;
        if (nextRoom !== this.activeRoom) {
            this.activeRoom = nextRoom;
            if (room) {
                gameEvents.emit('vault:entered', { vaultId: layout.vaultId });
                if (room.kind !== 'spire' && room.kind !== 'outlet_grand' && room.kind !== 'outlet_fracture') {
                    this.enteredVaults.add(layout.vaultId);
                }
                this.showRestoreGuidance(layout, room);
            }
        }
        if (room?.kind === 'acoustic_relay') this.tickRelayTimeout(layout, room);

        const traversalRoom = room?.kind === 'broken_crossing'
            ? room
            : layout.rooms.find((candidate) => isInsideCrossingRecoveryVolume(candidate, player));
        if (!room && traversalRoom) this.activeRoom = 'broken_crossing';
        if (traversalRoom) {
            const solved = progression.isVaultRoomSolved(layout.vaultId, traversalRoom.id);
            if (solved && this.crossingPitActive.has(this.puzzleKey(layout.vaultId, traversalRoom))) {
                this.deployCrossingRecoveryStair(traversalRoom);
            } else if (!solved) {
                this.tickPhaseBlocks(layout, traversalRoom);
                damage += this.tickBrokenCrossing(player, layout, traversalRoom);
            }
        }
        if (room && VAULT_COMBAT_ROOM_KINDS.has(room.kind)
            && isPlayerInsideEncounter(insetEncounterBounds(roomBounds(room), 1.5), player)
            && (room.kind !== 'grand_ascent' || progress.escapeStarted)) {
            resonantEncounterDirector.ensureRoomEncounter(layout.vaultId, layout, room, this.candidate.seed);
        }
        if (this.arePreSealRequirementsSolved(layout)) {
            this.openHubSeal(layout);
        }
        this.nearInnerSeal = this.isNearClosedInnerSeal(layout, player);
        const currentProgress = progression.getVaultProgress(layout.vaultId);
        if (currentProgress.escapeStarted && !currentProgress.escapeCompleted) {
            damage += this.tickEscape(step, player, layout);
        }
        damage += this.tickSpikes(player);
        this.updateSnapshot();
        return damage;
    }

    useTuningFork(input: ResonantUseInput): boolean {
        if (input.heldItem !== BlockType.ECHO_TUNING_FORK) return false;
        const target = input.target;
        if (!target || (target.type !== BlockType.RESONANCE_PYLON
            && target.type !== BlockType.RESONANCE_PLATE
            && target.type !== BlockType.LISTENING_STONE
            && target.type !== BlockType.SENTINEL_CORE)) return false;
        if (!this.isFunctionalForkTarget(target)) return false;
        gameEvents.emit('vault:resonance-pulse', { ...input.origin, radius: 4.5, source: 'echo_tuning_fork' });
        this.emitPulseFx(input.origin, input.direction, 4.5);
        if (target.type === BlockType.RESONANCE_PYLON) {
            this.activatePylon(target);
            this.activateRelayReceiver(target);
        }
        if (target.type === BlockType.RESONANCE_PLATE) {
            this.requestTitanConfirmation(target);
            this.activateMemoryReceiver(target);
            this.activatePuzzleControl(target);
        }
        if (target.type === BlockType.LISTENING_STONE) this.locateFromListeningStone(target);
        if (target.type === BlockType.SENTINEL_CORE) this.tryClaimCore(target);
        this.updateSnapshot();
        return true;
    }

    private isFunctionalForkTarget(target: ResonantUseInput['target'] & object): boolean {
        const layout = this.layout;
        if (!layout) return false;
        if (target.type === BlockType.RESONANCE_PYLON) {
            return layout.rooms.some((room) => {
                if (room.kind !== 'memory_choir' && room.kind !== 'acoustic_relay') return false;
                return buildVaultPuzzleDescriptor(room).responseCells.some((cell) => cell.x === target.x && cell.z === target.z);
            });
        }
        if (target.type === BlockType.RESONANCE_PLATE) {
            const arena = layout.rooms.find((room) => room.kind === 'arena');
            if (arena && sameVaultCell(target, getTitanConfirmationControl(arena))) return true;
            return layout.rooms.some((room) => {
                if (room.kind === 'broken_crossing') return false;
                if (!['memory_choir', 'counterweight_gallery', 'acoustic_relay'].includes(room.kind)) return false;
                const puzzle = buildVaultPuzzleDescriptor(room);
                return sameVaultCell(target, puzzle.activation)
                    || sameVaultCell(target, puzzle.completion)
                    || sameVaultCell(target, puzzle.fallbackControl)
                    || puzzle.mechanismControls.some((control) => sameVaultCell(target, control));
            });
        }
        if (target.type === BlockType.SENTINEL_CORE) {
            const core = layout.rooms.find((room) => room.kind === 'core');
            return !!core && sameVaultCell(target, { x: core.x, y: core.y + 4, z: core.z });
        }
        const room = getVaultRoomAt(layout, target, 1);
        return !!room && ['spire', 'entrance', 'tuning_hall', 'hub'].includes(room.kind);
    }

    private requestTitanConfirmation(target: { x: number; y: number; z: number }): void {
        const layout = this.layout;
        if (!layout || this.titanCinematicPending === layout.vaultId) return;
        const room = layout.rooms.find((candidate) => candidate.kind === 'arena' && isInsideRoom(target, candidate, 1));
        const progress = progression.getVaultProgress(layout.vaultId);
        const confirmationControl = room ? getTitanConfirmationControl(room) : null;
        if (!room || !confirmationControl || !sameVaultCell(target, confirmationControl)
            || !this.isExpeditionReady(layout) || progress.titanDefeated
            || bellTitanEncounter.getSnapshot().entityId !== null) return;
        this.titanCinematicPending = layout.vaultId;
        gameEvents.emit('vault:titan-confirm-request', {
            vaultId: layout.vaultId,
            x: room.x,
            y: confirmationControl.y,
            z: room.z,
        });
    }

    cancelTitanConfirmation(vaultId: string): void {
        if (this.titanCinematicPending === vaultId) this.titanCinematicPending = null;
    }

    beginTitanAwakening(vaultId: string): { x: number; y: number; z: number } | null {
        const layout = this.layout;
        if (!layout || layout.vaultId !== vaultId || this.titanCinematicPending !== vaultId) return null;
        const progress = progression.getVaultProgress(vaultId);
        if (!this.isExpeditionReady(layout) || progress.titanDefeated || bellTitanEncounter.getSnapshot().entityId !== null) {
            this.titanCinematicPending = null;
            return null;
        }
        const arena = layout.rooms.find((room) => room.kind === 'arena');
        return arena ? { x: arena.x + 0.5, y: arena.y + 1, z: arena.z + 0.5 } : null;
    }

    spawnConfirmedTitan(vaultId: string): number | null {
        const layout = this.layout;
        if (!layout || layout.vaultId !== vaultId || this.titanCinematicPending !== vaultId) return null;
        this.titanCinematicPending = null;
        if (!this.isExpeditionReady(layout) || progression.getVaultProgress(vaultId).titanDefeated) return null;
        return resonantEncounterDirector.ensureTitan(vaultId, layout);
    }

    private locateFromListeningStone(target: { x: number; y: number; z: number }): void {
        gameEvents.emit('vault:listening-stone-activated', {
            vaultId: this.layout?.vaultId ?? 'unresolved',
            x: target.x,
            y: target.y,
            z: target.z,
        });
        if (this.layout) {
            progression.setVaultDiscovered(this.layout.vaultId, target);
            const currentRoom = getVaultRoomAt(this.layout, target, 2) ?? this.layout.rooms.find((room) => room.kind === this.activeRoom) ?? null;
            if (currentRoom) {
                const progress = progression.getVaultProgress(this.layout.vaultId);
                const destination = getNextVaultEchoTarget(
                    this.layout,
                    {
                        rooms: progress.rooms,
                        titanDefeated: progress.titanDefeated,
                        coreClaimed: progress.coreClaimed,
                        escapeStarted: progress.escapeStarted,
                    },
                    currentRoom.id,
                );
                const cells = this.getRouteEchoCells(this.layout, currentRoom.id, destination);
                this.guidanceUntil = this.runtimeClock + 5;
                this.scheduleEcho(`route:${this.layout.vaultId}`, this.layout.vaultId, 'route', cells);
            } else {
                const spire = this.layout.rooms.find((room) => room.kind === 'spire')!;
                const distanceToSpire = Math.hypot(spire.x - target.x, spire.z - target.z);
                const cells = distanceToSpire > 3
                    ? this.getDirectionalEchoCells(target, spire.x, spire.z)
                    : this.getSpireDescentEchoCells(this.layout, target);
                this.scheduleEcho(`route:${this.layout.vaultId}`, this.layout.vaultId, 'route', cells);
            }
            return;
        }
        void worldManager.resolveNearestAcceptedVaultCandidate(target.x, target.z, 18000).then((candidate) => {
            // Only point at vaults that actually generate; a rejected candidate
            // would send the player digging toward empty terrain.
            if (!candidate || this.layout) return;
            const spire = getVaultSpirePosition(candidate);
            const cells = this.getDirectionalEchoCells(target, spire.x, spire.z);
            this.scheduleEcho(`locator:${target.x}:${target.y}:${target.z}`, `resonant:${candidate.gridX}:${candidate.gridZ}`, 'route', cells);
        });
    }

    private getDirectionalEchoCells(
        origin: { x: number; y: number; z: number },
        destinationX: number,
        destinationZ: number,
    ): VaultRoutePoint[] {
        const dx = destinationX - origin.x;
        const dz = destinationZ - origin.z;
        const distance = Math.hypot(dx, dz) || 1;
        const cells: VaultRoutePoint[] = [];
        for (let step = 0; step <= 12; step += 1) {
            cells.push({
                x: Math.round(origin.x + dx / distance * step),
                y: origin.y - 1,
                z: Math.round(origin.z + dz / distance * step),
            });
        }
        return cells;
    }

    private getSpireDescentEchoCells(layout: VaultLayout, target: { x: number; y: number; z: number }): VaultRoutePoint[] {
        const cells: VaultRoutePoint[] = [];
        for (let y = target.y - 1; y >= layout.surfaceY; y -= 2) cells.push({ x: target.x + 2, y, z: target.z });
        const shaft = getVaultShaftCenter(layout);
        const surfaceOrigin = { x: target.x + 2, y: layout.surfaceY + 1, z: target.z };
        cells.push(...this.getDirectionalEchoCells(surfaceOrigin, shaft.x, shaft.z));
        return cells;
    }

    private getRouteEchoCells(layout: VaultLayout, fromId: string, toId: string): VaultRoutePoint[] {
        const byId = new Map(layout.rooms.map((room) => [room.id, room]));
        const roomPath = getVaultRoomPath(layout.edges, fromId, toId);
        const cells: VaultRoutePoint[] = [];
        const pushUnique = (point: VaultRoutePoint) => {
            const previous = cells[cells.length - 1];
            if (!previous || previous.x !== point.x || previous.y !== point.y || previous.z !== point.z) cells.push(point);
        };
        for (let index = 0; index < roomPath.length; index += 1) {
            const room = byId.get(roomPath[index]);
            if (!room) continue;
            pushUnique({ x: room.x, y: room.y, z: room.z });
            const next = byId.get(roomPath[index + 1]);
            if (!next) continue;
            const route = getVaultCorridorRoute(room, next);
            route.forEach((point, routeIndex) => {
                if (routeIndex % 3 === 0 || routeIndex === route.length - 1) pushUnique(point);
            });
        }
        return cells;
    }

    private scheduleEcho(
        receiver: string,
        vaultId: string,
        kind: 'route' | 'pattern' | 'crossing',
        cells: VaultRoutePoint[],
        resolve: () => void = () => undefined,
    ): boolean {
        if (cells.length === 0) return false;
        const resolvesAt = this.runtimeClock + ECHO_PREVIEW_SECONDS;
        return this.echoScheduler.schedule(
            receiver,
            this.runtimeClock,
            () => gameEvents.emit('vault:echo-preview', {
                vaultId,
                kind,
                cells,
                resolvesAt,
                stepDurationMs: ECHO_PREVIEW_MILLISECONDS,
                pass: 1,
            }),
            () => {
                gameEvents.emit('vault:echo-resolved', { vaultId, kind, cells });
                resolve();
            },
        );
    }

    /**
     * Entering an unsolved mechanism room plays a one-shot echo along the
     * machine's operating order (relay receivers in strike order; base plate,
     * pier line, crest plate for the counterweight), so the objective copy has
     * a matching world-space demonstration.
     */
    private showRestoreGuidance(layout: VaultLayout, room: VaultRoom): void {
        if (room.kind !== 'acoustic_relay' && room.kind !== 'counterweight_gallery') return;
        if (progression.isVaultRoomSolved(layout.vaultId, room.id)) return;
        const puzzle = buildVaultPuzzleDescriptor(room);
        const cells = room.kind === 'acoustic_relay'
            ? [puzzle.activation, puzzle.responseCells[0]]
            : [...puzzle.mechanismControls, puzzle.completion];
        this.scheduleEcho(`restore:${layout.vaultId}:${room.id}`, layout.vaultId, 'route', cells);
    }

    private activateMemoryReceiver(target: { x: number; y: number; z: number }): void {
        if (!this.layout) return;
        const room = this.layout.rooms.find((candidate) => candidate.kind === 'memory_choir');
        if (!room || !isInsideRoom(target, room, 1)) return;
        const puzzle = buildVaultPuzzleDescriptor(room);
        if (!sameVaultCell(target, puzzle.activation) && !sameVaultCell(target, puzzle.fallbackControl)) return;
        if (progression.isVaultRoomSolved(this.layout.vaultId, room.id)) return;
        this.startMemoryDemo(this.layout, room);
    }

    private startMemoryDemo(layout: VaultLayout, room: VaultRoom): void {
        if (this.memoryDemonstration?.vaultId === layout.vaultId) return;
        this.memoryInputOpen.delete(layout.vaultId);
        const firstActivation = !this.demonstratedMemoryVaults.has(layout.vaultId);
        this.demonstratedMemoryVaults.add(layout.vaultId);
        const markers = getMemoryEchoMarkers(room);
        const steps = buildMemoryDemonstration(layout.glyphSequence, markers, firstActivation);
        const cells = markers.map(({ x, z }) => ({ x, y: room.y + 1, z }));
        const finalStep = steps[steps.length - 1];
        const durationMs = finalStep ? finalStep.startsAtMs + finalStep.durationMs : 0;
        this.memoryDemonstration = {
            vaultId: layout.vaultId,
            floorY: room.y + 1,
            cells,
            steps,
            startedAt: this.runtimeClock,
            nextStep: 0,
        };
        this.echoMode = 'listen';
        this.echoProgress = 0;
        this.echoLength = layout.glyphSequence.length;
        gameEvents.emit('vault:echo-preview', {
            vaultId: layout.vaultId,
            kind: 'pattern',
            cells,
            resolvesAt: this.runtimeClock + durationMs / 1000,
            stepDurationMs: finalStep?.durationMs ?? 0,
            pass: firstActivation ? 2 : 1,
        });
    }

    private tickMemoryDemonstration(): void {
        const demo = this.memoryDemonstration;
        if (!demo) return;
        const elapsedMs = (this.runtimeClock - demo.startedAt) * 1000;
        while (demo.nextStep < demo.steps.length && demo.steps[demo.nextStep].startsAtMs <= elapsedMs) {
            const step = demo.steps[demo.nextStep];
            const nextStep = demo.steps[demo.nextStep + 1];
            const next = nextStep && nextStep.pass === step.pass ? { ...nextStep.marker } : undefined;
            gameEvents.emit('vault:echo-step', {
                vaultId: demo.vaultId,
                symbol: step.symbol,
                index: step.sequenceIndex,
                pass: step.pass,
                ...step.marker,
                floorY: demo.floorY,
                durationMs: step.durationMs,
                next,
            });
            particleFx.burst({
                x: step.marker.x + 0.5,
                y: step.marker.y + 1.1,
                z: step.marker.z + 0.5,
                color: [0.55, 0.63, 0.58],
                color2: [0.72, 0.67, 0.52],
                count: 16,
                speed: 3.1,
                upBias: 2.2,
                spread: 0.8,
                size: 0.16,
                life: 1.05,
                gravity: 0.15,
                drag: 1.8,
            });
            this.echoProgress = step.sequenceIndex + 1;
            demo.nextStep += 1;
        }
        const finalStep = demo.steps[demo.steps.length - 1];
        if (!finalStep || elapsedMs < finalStep.startsAtMs + finalStep.durationMs) return;
        gameEvents.emit('vault:echo-resolved', { vaultId: demo.vaultId, kind: 'pattern', cells: demo.cells });
        if (this.layout?.vaultId === demo.vaultId) {
            this.memoryInputOpen.add(demo.vaultId);
            this.echoMode = 'repeat';
            this.echoProgress = this.memory.get(demo.vaultId)?.progress ?? 0;
        } else {
            this.echoMode = 'idle';
            this.echoProgress = 0;
        }
        this.memoryDemonstration = null;
    }

    private cancelMemoryDemonstration(): void {
        this.memoryDemonstration = null;
        this.echoMode = 'idle';
        this.echoProgress = 0;
        this.echoLength = 0;
    }

    private activatePylon(target: { x: number; y: number; z: number; metadata: number }): void {
        if (!this.layout) return;
        const memoryRoom = this.layout.rooms.find((room) => room.kind === 'memory_choir');
        if (!memoryRoom || !isInsideRoom(target, memoryRoom, 2)) return;
        if (!this.memoryInputOpen.has(this.layout.vaultId)) return;
        const current = this.memory.get(this.layout.vaultId) ?? { progress: 0, solved: false };
        const symbol = target.metadata & 3;
        const result = advanceMemoryInput(this.layout.glyphSequence, current, symbol);
        this.memory.set(this.layout.vaultId, result.state);
        this.echoProgress = result.state.progress;
        gameEvents.emit('vault:memory-input', {
            vaultId: this.layout.vaultId,
            symbol,
            progress: result.state.progress,
            correct: result.correct,
            x: target.x,
            y: target.y,
            z: target.z,
        });
        particleFx.burst({ x: target.x + 0.5, y: target.y + 2, z: target.z + 0.5, color: result.correct ? [0.47, 0.58, 0.55] : [0.56, 0.3, 0.27], color2: [0.72, 0.69, 0.59], count: result.correct ? 14 : 20, speed: result.correct ? 5 : 9, upBias: 3, spread: 1, size: 0.17, life: 0.8, gravity: 1, drag: 1.2 });
        addTrauma(result.correct ? 0.08 : 0.25);
        if (result.completed) {
            this.memoryInputOpen.delete(this.layout.vaultId);
            this.echoMode = 'idle';
            this.completePuzzleRoom(this.layout, memoryRoom);
        } else if (!result.correct) {
            resonantEncounterDirector.queueResonanceBacklash(
                this.layout.vaultId,
                { x: target.x + 0.5, y: target.y, z: target.z + 0.5 },
                3.4,
                4,
            );
            this.memoryInputOpen.delete(this.layout.vaultId);
            this.startMemoryDemo(this.layout, memoryRoom);
        }
    }

    private puzzleKey(vaultId: string, room: VaultRoom): string {
        return `${vaultId}:${room.id}`;
    }

    private completePuzzleRoom(layout: VaultLayout, room: VaultRoom): void {
        progression.setVaultRoomSolved(layout.vaultId, room.id);
    }

    private isPuzzleRoomSolved(layout: VaultLayout, room: VaultRoom): boolean {
        return progression.isVaultRoomSolved(layout.vaultId, room.id);
    }

    private arePreSealRequirementsSolved(layout: VaultLayout): boolean {
        return getVaultPreSealRequiredRoomIds(layout)
            .every((roomId) => progression.isVaultRoomSolved(layout.vaultId, roomId));
    }

    private isExpeditionReady(layout: VaultLayout): boolean {
        return getVaultRequiredRoomIds(layout)
            .every((roomId) => progression.isVaultRoomSolved(layout.vaultId, roomId));
    }

    private activateRelayReceiver(target: { x: number; y: number; z: number }): void {
        if (!this.layout) return;
        const room = this.layout.rooms.find((candidate) => candidate.kind === 'acoustic_relay' && isInsideRoom(target, candidate, 1));
        if (!room || this.isPuzzleRoomSolved(this.layout, room)) return;
        const puzzle = buildVaultPuzzleDescriptor(room);
        const receiver = puzzle.responseCells.findIndex((cell) => cell.x === target.x && cell.z === target.z);
        if (receiver < 0) return;
        const key = this.puzzleKey(this.layout.vaultId, room);
        const current = this.relay.get(key) ?? { progress: 0, solved: false, active: false, deadlineSeconds: Number.POSITIVE_INFINITY };
        const result = advanceRelayInput(current, receiver, puzzle.responseCells.length, this.runtimeClock);
        this.relay.set(key, result.state);
        gameEvents.emit('vault:memory-input', {
            vaultId: this.layout.vaultId,
            symbol: receiver,
            progress: result.state.progress,
            correct: result.correct,
            x: target.x,
            y: target.y,
            z: target.z,
        });
        particleFx.burst({
            x: target.x + 0.5,
            y: room.y + 6.4,
            z: target.z + 0.5,
            color: result.correct ? [0.55, 0.63, 0.58] : [0.56, 0.3, 0.27],
            color2: [0.72, 0.67, 0.52],
            count: result.correct ? 10 : 16,
            speed: result.correct ? 2.5 : 5,
            upBias: 1,
            spread: 0.7,
            size: 0.12,
            life: 0.7,
            gravity: 0.2,
            drag: 1.6,
        });
        const next = puzzle.responseCells[result.state.progress];
        if (result.correct && next && !result.completed) {
            gameEvents.emit('vault:echo-step', {
                vaultId: this.layout.vaultId,
                symbol: result.state.progress,
                index: result.state.progress,
                pass: 1,
                x: next.x,
                y: room.y + 1,
                z: next.z,
                floorY: room.y + 1,
                durationMs: Math.round(Math.max(0, result.state.deadlineSeconds - this.runtimeClock) * 1000),
            });
            particleFx.burst({ x: next.x + 0.5, y: room.y + 2.4, z: next.z + 0.5, color: [0.76, 0.64, 0.39], color2: [0.88, 0.82, 0.62], count: 14, speed: 3.2, upBias: 2.2, spread: 0.75, size: 0.16, life: 1.15, gravity: 0.2, drag: 1.5 });
        }
        if (result.completed) this.completePuzzleRoom(this.layout, room);
    }

    private tickRelayTimeout(layout: VaultLayout, room: VaultRoom): void {
        if (this.isPuzzleRoomSolved(layout, room)) return;
        const puzzle = buildVaultPuzzleDescriptor(room);
        const key = this.puzzleKey(layout.vaultId, room);
        const state = this.relay.get(key);
        if (!state?.active || this.runtimeClock <= state.deadlineSeconds) return;
        const missed = puzzle.responseCells[Math.min(state.progress, puzzle.responseCells.length - 1)];
        this.relay.set(key, {
            progress: 0,
            solved: false,
            active: false,
            deadlineSeconds: Number.POSITIVE_INFINITY,
        });
        if (!missed) return;
        gameEvents.emit('vault:memory-input', {
            vaultId: layout.vaultId,
            symbol: state.progress,
            progress: 0,
            correct: false,
            x: missed.x,
            y: missed.y,
            z: missed.z,
        });
        particleFx.burst({
            x: missed.x + 0.5,
            y: missed.y + 2.3,
            z: missed.z + 0.5,
            color: [0.56, 0.3, 0.27],
            color2: [0.72, 0.52, 0.38],
            count: 14,
            speed: 4.2,
            upBias: 1.4,
            spread: 0.8,
            size: 0.14,
            life: 0.72,
            gravity: 0.7,
            drag: 1.4,
        });
    }

    private activatePuzzleControl(target: { x: number; y: number; z: number }): void {
        if (!this.layout) return;
        const room = this.layout.rooms.find((candidate) => [
            'counterweight_gallery',
            'acoustic_relay',
            'broken_crossing',
        ].includes(candidate.kind) && isInsideRoom(target, candidate, 1));
        if (!room || this.isPuzzleRoomSolved(this.layout, room)) return;
        const puzzle = buildVaultPuzzleDescriptor(room);
        const sameCell = (point: VaultRoutePoint) => point.x === target.x && point.y === target.y && point.z === target.z;
        const key = this.puzzleKey(this.layout.vaultId, room);

        if (room.kind === 'counterweight_gallery') {
            const controlIndex = puzzle.mechanismControls.findIndex(sameCell);
            const stage = this.counterweightStages.get(key) ?? 0;
            if (controlIndex >= 0) {
                const correct = controlIndex === stage;
                const nextStage = correct ? Math.min(puzzle.mechanismControls.length, stage + 1) : 0;
                this.setCounterweightStage(this.layout, room, nextStage);
                gameEvents.emit('vault:memory-input', {
                    vaultId: this.layout.vaultId,
                    symbol: controlIndex,
                    progress: nextStage,
                    correct,
                    x: target.x,
                    y: target.y,
                    z: target.z,
                });
                if (!correct) {
                    resonantEncounterDirector.queueResonanceBacklash(
                        this.layout.vaultId,
                        { x: target.x + 0.5, y: target.y, z: target.z + 0.5 },
                        4.5,
                        6,
                    );
                }
                return;
            }
            if (sameCell(puzzle.completion)) {
                if (stage >= puzzle.mechanismControls.length) {
                    this.completePuzzleRoom(this.layout, room);
                } else {
                    this.setCounterweightStage(this.layout, room, 0);
                    gameEvents.emit('vault:memory-input', {
                        vaultId: this.layout.vaultId,
                        symbol: puzzle.mechanismControls.length,
                        progress: 0,
                        correct: false,
                        x: target.x,
                        y: target.y,
                        z: target.z,
                    });
                    resonantEncounterDirector.queueResonanceBacklash(
                        this.layout.vaultId,
                        { x: target.x + 0.5, y: target.y, z: target.z + 0.5 },
                        5,
                        7,
                    );
                }
                return;
            }
        }

        if (sameCell(puzzle.fallbackControl)) {
            if (room.kind === 'acoustic_relay') this.relay.set(key, { progress: 0, solved: false, active: false, deadlineSeconds: Number.POSITIVE_INFINITY });
            if (room.kind === 'broken_crossing') this.traversalCheckpoints.set(key, {
                nextIndex: 0,
                completed: false,
                lastSafeCheckpoint: 'start',
            });
            soundManager.playAt('vault.pylon_wrong', { x: target.x + 0.5, y: target.y + 0.5, z: target.z + 0.5 }, { pitch: 0.86, fallback: false });
            return;
        }

        if (room.kind === 'acoustic_relay' && sameCell(puzzle.activation)) {
            const state = beginRelay(
                this.relay.get(key) ?? { progress: 0, solved: false, active: false, deadlineSeconds: Number.POSITIVE_INFINITY },
                this.runtimeClock,
                puzzle.responseCells.length,
            );
            this.relay.set(key, state);
            const first = puzzle.responseCells[0];
            gameEvents.emit('vault:echo-step', {
                vaultId: this.layout.vaultId,
                symbol: 0,
                index: 0,
                pass: 1,
                x: first.x,
                y: room.y + 1,
                z: first.z,
                floorY: room.y + 1,
                durationMs: Math.round((state.deadlineSeconds - this.runtimeClock) * 1000),
            });
            particleFx.burst({ x: first.x + 0.5, y: room.y + 2.4, z: first.z + 0.5, color: [0.76, 0.64, 0.39], color2: [0.88, 0.82, 0.62], count: 14, speed: 3.2, upBias: 2.2, spread: 0.75, size: 0.16, life: 1.15, gravity: 0.2, drag: 1.5 });
            return;
        }

    }

    private setCounterweightStage(layout: VaultLayout, room: VaultRoom, requestedStage: number): void {
        const puzzle = buildVaultPuzzleDescriptor(room);
        const key = this.puzzleKey(layout.vaultId, room);
        const total = Math.max(1, puzzle.mechanismControls.length);
        const stage = Math.max(0, Math.min(total, Math.floor(requestedStage)));
        const raisedCells = Math.ceil(puzzle.responseCells.length * stage / total);
        const stairRotation = puzzle.alongX ? 3 : 1;
        worldManager.setBlocks(puzzle.responseCells.map((cell, index) => ({
            ...cell,
            type: index < raisedCells ? BlockType.ECHO_BRICK_STAIRS : BlockType.AIR,
            rotation: stairRotation,
        })));
        if (stage > 0) this.counterweightStages.set(key, stage);
        else this.counterweightStages.delete(key);
        gameEvents.emit('vault:phase-changed', {
            vaultId: layout.vaultId,
            solid: stage > 0,
            cycle: stage,
        });
        const origin = stage > 0
            ? puzzle.mechanismControls[Math.min(stage - 1, puzzle.mechanismControls.length - 1)]
            : puzzle.activation;
        particleFx.burst({
            x: origin.x + 0.5,
            y: origin.y + 0.8,
            z: origin.z + 0.5,
            color: stage > 0 ? [0.55, 0.58, 0.52] : [0.56, 0.3, 0.27],
            color2: [0.67, 0.58, 0.4],
            count: 18,
            speed: 4.2,
            upBias: 1.5,
            spread: 0.9,
            size: 0.14,
            life: 0.8,
            gravity: 1.2,
            drag: 1.3,
        });
        const next = puzzle.mechanismControls[stage];
        if (next) particleFx.burst({
            x: next.x + 0.5,
            y: next.y + 1.1,
            z: next.z + 0.5,
            color: [0.72, 0.67, 0.52],
            color2: [0.55, 0.58, 0.52],
            count: 9,
            speed: 2.2,
            upBias: 1.8,
            spread: 0.45,
            size: 0.12,
            life: 0.9,
            gravity: 0.25,
            drag: 1.7,
        });
    }

    private tryClaimCore(target: { x: number; y: number; z: number }): void {
        if (!this.layout) return;
        const coreRoom = this.layout.rooms.find((room) => room.kind === 'core');
        if (!coreRoom || !isInsideRoom(target, coreRoom, 2)) return;
        const progress = progression.getVaultProgress(this.layout.vaultId);
        if (!progress.titanDefeated) {
            worldManager.log('The Bell Titan still guards the core.', 'error');
            return;
        }
        const worldFirstClear = !progression.hasClaimedFirstVaultReward();
        if (!progression.claimVaultCore(this.layout.vaultId)) return;
        worldManager.setBlock(target.x, target.y, target.z, BlockType.AIR);
        if (worldFirstClear) progression.claimFirstVaultReward();
        progression.startVaultEscape(this.layout.vaultId);
        // The Echo Core and dust land in the now-unlocked core cache instead of
        // free drops, so a claim never double-pays (cache loot plus drops) and
        // dying mid-escape cannot scatter the reward into hazards.
        this.setEntranceEscapeSeal(this.layout, true);
        this.openEscapeGates(this.layout);
        worldManager.log('The core cache is unlocked. Take the Echo Core, then choose an ascent route.', 'success');
        addTrauma(0.65);
    }

    private tickDiscoveryPulse(spire: VaultRoom, layout: VaultLayout): void {
        if (this.discoveryPulse > 0) return;
        this.discoveryPulse = 3.2;
        particleFx.burst({ x: spire.x + 0.5, y: layout.surfaceY + 20.5, z: spire.z + 0.5, color: [0.47, 0.58, 0.55], color2: [0.72, 0.69, 0.59], count: 28, speed: 8, upBias: -2, dir: [0, -1, 0], spread: 0.75, size: 0.16, life: 1, gravity: 2, drag: 0.8 });
        soundManager.playAt('block.amethyst.hit', { x: spire.x + 0.5, y: layout.surfaceY + 8, z: spire.z + 0.5 }, { volume: 0.65, pitch: 0.72 });
    }

    private getPhasePositions(layout: VaultLayout, room: VaultRoom) {
        const existing = this.phaseBlocks.get(layout.vaultId);
        if (existing) return existing;
        const positions = getTraversalPhaseCells(room, layout.phaseTiming);
        this.phaseBlocks.set(layout.vaultId, positions);
        return positions;
    }

    private tickPhaseBlocks(layout: VaultLayout, room: VaultRoom): void {
        const ticks = worldManager.getTime();
        const positions = this.getPhasePositions(layout, room);
        let applied = this.phaseApplied.get(layout.vaultId);
        if (!applied) {
            applied = new Map<number, boolean>();
            this.phaseApplied.set(layout.vaultId, applied);
        }
        for (let lane = 0; lane < 4; lane += 1) {
            const cells = positions.filter((position) => position.lane === lane);
            if (cells.length === 0) continue;
            const firstBlock = worldManager.tryGetBlock(cells[0].x, cells[0].y, cells[0].z);
            if (firstBlock === null) continue;
            if (!applied.has(lane)) applied.set(lane, firstBlock === BlockType.PHASE_BLOCK);
            const solid = isPhaseLaneSolid(ticks, layout.phaseTiming, lane);
            if (applied.get(lane) === solid) continue;
            this.scheduleEcho(`crossing:${layout.vaultId}:${lane}`, layout.vaultId, 'crossing', cells, () => {
                if (this.layout?.vaultId !== layout.vaultId || progression.isVaultRoomSolved(layout.vaultId, room.id)) return;
                // The echo preview delays this write; the lane's authored state may
                // have flipped again meanwhile. Re-derive it at resolve time so the
                // placed blocks always match the schedule players read.
                const desiredSolid = isPhaseLaneSolid(worldManager.getTime(), layout.phaseTiming, lane);
                if (applied!.get(lane) === desiredSolid) return;
                const desired = desiredSolid ? BlockType.PHASE_BLOCK : BlockType.AIR;
                worldManager.setBlocks(cells.map(({ x, y, z }) => ({ x, y, z, type: desired, rotation: lane })));
                applied!.set(lane, desiredSolid);
                gameEvents.emit('vault:phase-changed', {
                    vaultId: layout.vaultId,
                    solid: desiredSolid,
                    cycle: Math.floor(worldManager.getTime() / layout.phaseTiming.periodTicks),
                });
            });
        }
    }

    private tickBrokenCrossing(
        player: { x: number; y: number; z: number },
        layout: VaultLayout,
        room: VaultRoom,
    ): number {
        const puzzle = buildVaultPuzzleDescriptor(room);
        const key = this.puzzleKey(layout.vaultId, room);
        let state = this.traversalCheckpoints.get(key) ?? {
            nextIndex: 0,
            completed: false,
            lastSafeCheckpoint: 'start',
        };
        const floor = {
            x: Math.floor(player.x),
            y: Math.floor(player.y - 0.1),
            z: Math.floor(player.z),
        };
        const checkpointIndex = puzzle.responseCells.findIndex((cell) => cell.x === floor.x && cell.y === floor.y && cell.z === floor.z);
        if (checkpointIndex >= 0 && CROSSING_CHECKPOINT_IDS[state.nextIndex] === CROSSING_CHECKPOINT_IDS[checkpointIndex]) {
            state = advanceTraversalCheckpoint(state, CROSSING_CHECKPOINT_IDS[checkpointIndex]);
            this.traversalCheckpoints.set(key, state);
            gameEvents.emit('vault:memory-input', {
                vaultId: layout.vaultId,
                symbol: checkpointIndex,
                progress: state.nextIndex,
                correct: true,
                x: floor.x,
                y: floor.y,
                z: floor.z,
            });
            particleFx.burst({ x: floor.x + 0.5, y: floor.y + 1.1, z: floor.z + 0.5, color: [0.55, 0.63, 0.58], color2: [0.72, 0.67, 0.52], count: 20, speed: 2.8, upBias: 1, spread: 0.6, size: 0.12, life: 0.65, gravity: 0.3, drag: 1.7 });
        }
        if (isCrossingFinishReached(puzzle, floor)) {
            this.completePuzzleRoom(layout, room);
            for (let lane = 0; lane < 4; lane += 1) this.echoScheduler.cancel(`crossing:${layout.vaultId}:${lane}`);
            this.restorePhaseBlocks(layout.vaultId);
            return 0;
        }
        if (player.y >= room.y - 4) return 0;

        const pit = getCrossingPitDescriptor(room);
        const wasActive = this.crossingPitActive.has(key);
        this.crossingPitActive.add(key);
        resonantEncounterDirector.ensureCrossingFailureEncounter(layout.vaultId, layout, room, this.candidate?.seed ?? 0);
        if (wasActive) return 0;
        particleFx.burst({ x: player.x, y: pit.floorY + 1.2, z: player.z, color: [0.34, 0.32, 0.28], color2: [0.68, 0.52, 0.3], count: 34, speed: 5, upBias: 2, spread: 0.9, size: 0.14, life: 0.8, gravity: 1.4, drag: 1.2 });
        soundManager.playAt('vault.enemy.tollkeeper_impact', { x: room.x, y: pit.floorY + 2, z: room.z }, { volume: 0.82, pitch: 0.72, fallback: false });
        addTrauma(0.42);
        return 8;
    }

    private deployCrossingRecoveryStair(room: VaultRoom): void {
        const pit = getCrossingPitDescriptor(room);
        const edits = [
            ...pit.landingCells.map(({ x, y, z }) => ({ x, y, z, type: BlockType.ECHO_BRICK_SLAB, rotation: 0 })),
            ...pit.stairCells
            .filter(({ x, y, z }) => worldManager.tryGetBlock(x, y, z) === BlockType.AIR)
            .map(({ x, y, z }) => ({ x, y, z, type: BlockType.ECHO_BRICK_STAIRS, rotation: getCrossingStairRotation(room) })),
        ];
        if (edits.length > 0) worldManager.setBlocks(edits);
    }

    private restorePhaseBlocks(vaultId: string): void {
        const positions = this.phaseBlocks.get(vaultId);
        if (!positions) return;
        worldManager.setBlocks(positions
            .filter((position) => worldManager.tryGetBlock(position.x, position.y, position.z) === BlockType.AIR)
            .map(({ x, y, z, lane }) => ({ x, y, z, type: BlockType.PHASE_BLOCK, rotation: lane })));
        this.phaseApplied.delete(vaultId);
    }

    private openHubSeal(layout: VaultLayout): void {
        if (this.openGatePlanes(layout, (gate) => gate === 'inner_seal')) {
            gameEvents.emit('vault:unsealed', { vaultId: layout.vaultId });
        }
    }

    private isNearClosedInnerSeal(
        layout: VaultLayout,
        player: { x: number; y: number; z: number },
    ): boolean {
        return layout.doorways
            .filter(({ gate }) => gate === 'inner_seal')
            .flatMap(({ opening }) => opening.slice(25))
            .some(({ x, y, z }) => worldManager.tryGetBlock(x, y, z) === BlockType.VAULT_SEAL
                && Math.hypot(player.x - (x + 0.5), player.z - (z + 0.5)) <= 5.5
                && Math.abs(player.y + 1 - (y + 0.5)) <= 3.5);
    }

    /**
     * The escape leaves through one of the two ascent routes; the way the
     * player came in is sealed while the collapse runs so backtracking out the
     * front door cannot bypass the authored finale. It reopens on completion.
     */
    private setEntranceEscapeSeal(layout: VaultLayout, sealed: boolean): void {
        const doorway = layout.doorways.find(({ from, to }) => (
            (from === 'entrance' && to === 'processional')
            || (from === 'processional' && to === 'entrance')
        ));
        if (!doorway) return;
        const cells = getVaultDoorwayRoomOpening(doorway, 'entrance');
        const desired = sealed ? BlockType.VAULT_SEAL : BlockType.AIR;
        const edits = cells
            .filter(({ x, y, z }) => {
                const current = worldManager.tryGetBlock(x, y, z);
                return current !== null && current !== desired
                    && (current === BlockType.AIR || current === BlockType.VAULT_SEAL);
            })
            .map(({ x, y, z }) => ({ x, y, z, type: desired }));
        if (edits.length > 0) worldManager.setBlocks(edits);
    }

    private openEscapeGates(layout: VaultLayout): void {
        this.openGatePlanes(layout, (gate) => gate === 'grand_ascent' || gate === 'fracture_stair');
    }

    private applyEscapeGateChoice(layout: VaultLayout, chosenRoute: VaultEscapeRoute | null): void {
        this.openGatePlanes(layout, (gate) => chosenRoute === null
            ? gate === 'grand_ascent' || gate === 'fracture_stair'
            : gate === (chosenRoute === 'grand' ? 'grand_ascent' : 'fracture_stair'));
        if (!chosenRoute) return;
        const closedGate = chosenRoute === 'grand' ? 'fracture_stair' : 'grand_ascent';
        const edits = layout.doorways
            .filter(({ gate }) => gate === closedGate)
            .flatMap(({ opening }) => opening.slice(25))
            .filter(({ x, y, z }) => worldManager.tryGetBlock(x, y, z) === BlockType.AIR)
            .map(({ x, y, z }) => ({ x, y, z, type: BlockType.VAULT_SEAL }));
        if (edits.length > 0) worldManager.setBlocks(edits);
    }

    private openGatePlanes(layout: VaultLayout, matches: (gate: string | undefined) => boolean): boolean {
        const edits = layout.doorways
            .filter(({ gate }) => matches(gate))
            .flatMap(({ opening }) => opening.slice(25))
            .filter(({ x, y, z }) => worldManager.tryGetBlock(x, y, z) === BlockType.VAULT_SEAL)
            .map(({ x, y, z }) => ({ x, y, z, type: BlockType.AIR }));
        if (edits.length === 0) return false;
        worldManager.setBlocks(edits);
        return true;
    }

    private tickEscape(dt: number, player: { x: number; y: number; z: number }, layout: VaultLayout): number {
        const session = progression.getVaultEscapeSession(layout.vaultId);
        this.applyEscapeGateChoice(layout, session.route);
        let transition = advanceVaultEscape(createVaultEscapeState({
            started: true,
            remainingSeconds: session.remainingSeconds,
            chosenRoute: session.route,
            latestCheckpoint: session.checkpoint?.id ?? null,
        }), { type: 'tick', dt });
        progression.updateVaultEscapeRemaining(layout.vaultId, transition.state.remainingSeconds);
        const routes = getVaultEscapeRoutes(layout);
        if (!transition.state.chosenRoute) {
            const chosen = this.getCrossedEscapeThreshold(layout, player);
            if (chosen) {
                transition = advanceVaultEscape(transition.state, { type: 'route_threshold', route: chosen });
                if (transition.routeChosen && progression.chooseVaultEscapeRoute(layout.vaultId, transition.routeChosen)) {
                    this.applyEscapeGateChoice(layout, transition.routeChosen);
                    progression.setVaultEscapeCheckpoint(layout.vaultId, {
                        id: `${transition.routeChosen}:checkpoint:start`,
                        route: transition.routeChosen,
                        x: player.x,
                        y: player.y,
                        z: player.z,
                    });
                }
            }
        }
        const chosenRoute = transition.state.chosenRoute;
        if (chosenRoute) this.recordReachedEscapeCheckpoint(layout.vaultId, routes[chosenRoute], player);

        const tier = transition.state.hazardTier;
        if (tier >= 2 && chosenRoute === 'grand') {
            const grandRoom = layout.rooms.find(({ kind }) => kind === 'grand_ascent');
            if (grandRoom) resonantEncounterDirector.queueGrandAscentReinforcement(layout.vaultId, grandRoom.id);
        }
        let damage = this.tickEscapeHazards(dt, player, tier);
        const remaining = transition.state.remainingSeconds;
        if (Math.floor(remaining * 2) !== Math.floor((remaining + dt) * 2)) gameEvents.emit('vault:escape-tick', {
            vaultId: layout.vaultId,
            remainingSeconds: remaining,
            hazardTier: tier,
        });
        if (Math.floor(remaining) % 8 === 0 && Math.floor(remaining + dt) % 8 !== 0) {
            addTrauma(0.18);
            particleFx.burst({ x: player.x, y: player.y + 1, z: player.z, color: [0.42, 0.55, 0.52], color2: [0.72, 0.69, 0.59], count: 18, speed: 6, upBias: 4, spread: 1, size: 0.12, life: 0.6, gravity: 3, drag: 1 });
        }
        const exit = getCompletedEscapeRoute(layout, player, chosenRoute, this.isPlayerConnectedToOpenAir(player, layout, chosenRoute));
        if (exit) {
            transition = advanceVaultEscape(transition.state, {
                type: 'player_position',
                route: exit,
                y: player.y,
                surfaceY: layout.surfaceOutlets[exit].surfaceY,
                insideCompletionVolume: true,
                connectedToOpenAir: true,
            });
        }
        if (transition.completedNow && exit && progression.completeVaultEscape(layout.vaultId, exit)) {
            for (let index = 0; index < 6; index += 1) {
                worldManager.spawnDrop(BlockType.ECHO_BRICKS, player.x, player.y + 1, player.z);
            }
            this.setEntranceEscapeSeal(layout, false);
            this.restoreEscapePlatforms();
            resonantVaultHazards.reset();
            return damage;
        }
        return damage;
    }

    private getCrossedEscapeThreshold(
        layout: VaultLayout,
        player: { x: number; y: number; z: number },
    ): VaultEscapeRoute | null {
        for (const [route, kind] of [
            ['grand', 'grand_ascent'],
            ['fracture', 'fracture_stair'],
        ] as const) {
            const room = layout.rooms.find((candidate) => candidate.kind === kind);
            if (!room) continue;
            const bounds = roomBounds(room);
            if (player.x >= bounds.minX + 3 && player.x <= bounds.maxX - 3
                && player.z >= bounds.minZ + 3 && player.z <= bounds.maxZ - 3
                && player.y >= room.y + 1 && player.y <= bounds.maxY - 2) return route;
        }
        return null;
    }

    private recordReachedEscapeCheckpoint(
        vaultId: string,
        route: VaultEscapeRouteDescriptor,
        player: { x: number; y: number; z: number },
    ): void {
        const session = progression.getVaultEscapeSession(vaultId);
        const previousIndex = route.checkpoints.findIndex(({ id }) => id === session.checkpoint?.id);
        const next = route.checkpoints[previousIndex + 1];
        if (!next || Math.hypot(player.x - (next.x + 0.5), player.z - (next.z + 0.5)) > 2.25
            || Math.abs(player.y - next.y) > 2) return;
        progression.setVaultEscapeCheckpoint(vaultId, {
            id: next.id,
            route: route.route,
            x: next.x + 0.5,
            y: next.y,
            z: next.z + 0.5,
        });
    }

    private isPlayerConnectedToOpenAir(
        player: { x: number; y: number; z: number },
        layout: VaultLayout,
        route: VaultEscapeRoute | null,
    ): boolean {
        if (!route || player.y < layout.surfaceOutlets[route].surfaceY + 1) return false;
        const x = Math.floor(player.x);
        const z = Math.floor(player.z);
        for (let y = Math.floor(player.y); y <= Math.floor(player.y) + 3; y += 1) {
            if (worldManager.tryGetBlock(x, y, z) !== BlockType.AIR) return false;
        }
        return true;
    }

    private tickEscapeHazards(
        dt: number,
        player: { x: number; y: number; z: number },
        tier: 0 | 1 | 2 | 3,
    ): number {
        const tick = resonantVaultHazards.tick(dt, player, tier, true);
        for (const transition of tick.transitions) {
            if (transition.phase === 'telegraph') {
                soundManager.playAt('vault.hazard_warning', transition, { volume: 0.72, pitch: transition.kind === 'spikes' ? 1.06 : 0.92 });
            } else if (transition.phase === 'active' && transition.kind !== 'gap') {
                soundManager.playAt('vault.hazard_strike', transition, { volume: transition.kind === 'crusher' ? 0.9 : 0.72, pitch: transition.kind === 'spikes' ? 1.08 : 0.9 });
                if (transition.kind === 'crusher' || transition.kind === 'collapse') addTrauma(0.16);
            }
        }
        for (const state of tick.states) {
            if (state.kind === 'collapse') this.applyCollapsePlatform(state, player);
        }
        return tick.damage;
    }

    private applyCollapsePlatform(
        state: VaultHazardRenderState,
        player: { x: number; y: number; z: number },
    ): void {
        const current = this.escapePlatformSolid.get(state.id) ?? true;
        if (current === state.platformSolid) return;
        const dx = player.x - state.x;
        const dz = player.z - state.z;
        const along = Math.abs(dx * state.forwardX + dz * state.forwardZ);
        const across = Math.abs(dx * state.rightX + dz * state.rightZ);
        const playerInside = along <= state.length * 0.5 + 0.5
            && across <= state.width * 0.5 + 0.5
            && player.y <= state.y + 2;
        if (state.platformSolid && playerInside) return;
        const edits = getHazardFloorCells(state).flatMap((cell) => state.platformSolid
            ? [
                { x: cell.x, y: cell.y - 1, z: cell.z, type: BlockType.ECHO_STONE },
                { x: cell.x, y: cell.y, z: cell.z, type: BlockType.CRACKED_ECHO_BRICKS },
            ]
            : [
                { x: cell.x, y: cell.y, z: cell.z, type: BlockType.AIR },
                { x: cell.x, y: cell.y - 1, z: cell.z, type: BlockType.AIR },
            ]);
        worldManager.setBlocks(edits);
        this.escapePlatformSolid.set(state.id, state.platformSolid);
    }

    private restoreEscapePlatforms(): void {
        for (const state of resonantVaultHazards.getRenderState()) {
            if (state.kind !== 'collapse' || (this.escapePlatformSolid.get(state.id) ?? true)) continue;
            const edits = getHazardFloorCells(state).flatMap((cell) => [
                { x: cell.x, y: cell.y - 1, z: cell.z, type: BlockType.ECHO_STONE },
                { x: cell.x, y: cell.y, z: cell.z, type: BlockType.CRACKED_ECHO_BRICKS },
            ]);
            worldManager.setBlocks(edits);
        }
        this.escapePlatformSolid.clear();
    }

    private tickSpikes(player: { x: number; y: number; z: number }): number {
        if (this.hazardCooldown > 0) return 0;
        const feet = worldManager.tryGetBlock(Math.floor(player.x), Math.floor(player.y - 0.1), Math.floor(player.z));
        if (feet !== BlockType.ECHO_SPIKES) return 0;
        this.hazardCooldown = 0.8;
        addTrauma(0.2);
        return 3;
    }

    private emitPulseFx(origin: { x: number; y: number; z: number }, direction: { x: number; y: number; z: number }, radius: number): void {
        particleFx.burst({ x: origin.x + direction.x, y: origin.y + direction.y, z: origin.z + direction.z, color: [0.47, 0.58, 0.55], color2: [0.72, 0.69, 0.59], count: Math.round(20 + radius * 3), speed: radius, upBias: 0, dir: [direction.x, direction.y, direction.z], spread: 0.55, size: 0.16, life: 0.55, gravity: 0, drag: 1.5 });
        addTrauma(radius > 6 ? 0.14 : 0.06);
    }

    private updateSnapshot(): void {
        const progress = this.layout ? progression.getVaultProgress(this.layout.vaultId) : null;
        const currentRoom = this.layout?.rooms.find((room) => room.kind === this.activeRoom);
        const restoreKey = this.layout && currentRoom ? this.puzzleKey(this.layout.vaultId, currentRoom) : null;
        const relayState = restoreKey && currentRoom?.kind === 'acoustic_relay' ? this.relay.get(restoreKey) : null;
        const relayPuzzle = currentRoom?.kind === 'acoustic_relay' ? buildVaultPuzzleDescriptor(currentRoom) : null;
        const counterweightPuzzle = currentRoom?.kind === 'counterweight_gallery' ? buildVaultPuzzleDescriptor(currentRoom) : null;
        const counterweightProgress = restoreKey && counterweightPuzzle
            ? this.counterweightStages.get(restoreKey) ?? 0
            : 0;
        const crossingPitActive = !!(this.layout && currentRoom?.kind === 'broken_crossing'
            && this.crossingPitActive.has(this.puzzleKey(this.layout.vaultId, currentRoom)));
        const titan = bellTitanEncounter.getSnapshot();
        const titanActive = titan.entityId !== null && titan.action !== 'death' && !progress?.titanDefeated;
        const requiredRoomIds = this.layout ? getVaultRequiredRoomIds(this.layout) : [];
        const preSealRoomIds = this.layout ? getVaultPreSealRequiredRoomIds(this.layout) : [];
        const solvedCount = (roomIds: readonly string[]) => roomIds
            .filter((roomId) => progress?.rooms[roomId] === true).length;
        const next: ResonantRuntimeSnapshot = {
            vaultId: this.layout?.vaultId ?? null,
            room: this.activeRoom,
            discovered: progress?.discovered ?? false,
            entered: this.layout ? this.enteredVaults.has(this.layout.vaultId) : false,
            roomSolved: !!(this.layout && currentRoom && progression.isVaultRoomSolved(this.layout.vaultId, currentRoom.id)),
            expeditionReady: this.layout ? this.isExpeditionReady(this.layout) : false,
            memoryProgress: this.layout ? (this.memory.get(this.layout.vaultId)?.progress ?? 0) : 0,
            restoreProgress: relayState?.progress ?? 0,
            restoreTotal: relayPuzzle?.responseCells.length ?? 0,
            counterweightProgress,
            counterweightTotal: counterweightPuzzle?.mechanismControls.length ?? 0,
            crossingPitActive,
            echoMode: this.layout ? this.echoMode : 'idle',
            echoProgress: this.layout ? this.echoProgress : 0,
            echoLength: this.layout ? this.echoLength : 0,
            titanActive,
            titanCoreExposed: titanActive && titan.coreExposed,
            titanDefeated: progress?.titanDefeated ?? false,
            titanAction: titanActive ? titan.action : null,
            coreClaimed: progress?.coreClaimed ?? false,
            escapeStarted: progress?.escapeStarted ?? false,
            escapeCompleted: progress?.escapeCompleted ?? false,
            escapeRoute: progress?.escapeRoute ?? null,
            escapeHazardTier: progress?.escapeStarted && !progress.escapeCompleted
                ? getEscapeHazardTier(progress.escapeRemainingSeconds ?? VAULT_ESCAPE_DURATION_SECONDS)
                : 0,
            escapeCheckpoint: progress?.escapeCheckpoint?.id ?? null,
            escapeRemaining: progress?.escapeStarted && !progress.escapeCompleted
                ? progress.escapeRemainingSeconds ?? VAULT_ESCAPE_DURATION_SECONDS
                : 0,
            requiredCompleted: solvedCount(requiredRoomIds),
            requiredTotal: requiredRoomIds.length,
            preSealCompleted: solvedCount(preSealRoomIds),
            preSealTotal: preSealRoomIds.length,
            nearInnerSeal: !!this.layout && this.nearInnerSeal,
            guidanceActive: !!this.layout && this.runtimeClock < this.guidanceUntil,
        };
        if (JSON.stringify(next) === JSON.stringify(this.snapshot)) return;
        this.snapshot = next;
        this.notify();
    }

    reset(): void {
        const activeVaultId = this.layout?.vaultId ?? null;
        this.restoreEscapePlatforms();
        // World teardown skips leaveActiveVault; listeners (music, HUD) still
        // need to hear that the expedition ended.
        if (activeVaultId) gameEvents.emit('vault:left', { vaultId: activeVaultId });
        resonantVaultHazards.reset();
        bellTitanEncounter.cleanup();
        if (this.layout) this.restorePhaseBlocks(this.layout.vaultId);
        this.candidate = null;
        this.layout = null;
        this.activeRoom = null;
        this.memory.clear();
        this.memoryInputOpen.clear();
        this.relay.clear();
        this.counterweightStages.clear();
        this.traversalCheckpoints.clear();
        this.crossingPitActive.clear();
        this.titanCinematicPending = null;
        this.demonstratedMemoryVaults.clear();
        this.cancelMemoryDemonstration();
        this.phaseBlocks.clear();
        this.phaseApplied.clear();
        this.escapePlatformSolid.clear();
        this.enteredVaults.clear();
        this.echoScheduler.reset();
        this.runtimeClock = 0;
        this.discoveryPulse = 0;
        this.hazardCooldown = 0;
        this.guidanceUntil = 0;
        this.nearInnerSeal = false;
        resonantEncounterDirector.reset();
        this.updateSnapshot();
    }
}

export const resonantVaultRuntime = new ResonantVaultRuntime();
