import type { VaultRoom, VaultRoutePoint } from './resonantVaults.ts';
import {
    getTraversalSafeRows,
    getVaultRoomBounds,
    getVaultRoomProgressionSign,
    isVaultRoomLongitudinalAlongX,
} from './resonantVaults.ts';
import { MEMORY_PYLON_OFFSETS } from './resonantEchoSequence.ts';

export type VaultPuzzleKind =
    | 'memory_choir'
    | 'counterweight_gallery'
    | 'acoustic_relay'
    | 'broken_crossing';

export interface TraversalCheckpointState {
    nextIndex: number;
    completed: boolean;
    lastSafeCheckpoint: string;
}

export interface VaultPuzzleRecoveryAnchor extends VaultRoutePoint {
    id: string;
}

export interface VaultPuzzleDescriptor {
    roomId: string;
    kind: VaultPuzzleKind;
    activation: VaultRoutePoint;
    /** Deliberate, authored interaction points; decorative machinery is never included. */
    mechanismControls: VaultRoutePoint[];
    responseCells: VaultRoutePoint[];
    fallbackControl: VaultRoutePoint;
    recoveryAnchors: VaultPuzzleRecoveryAnchor[];
    completion: VaultRoutePoint;
    alongX: boolean;
}

export interface VaultCrossingPitDescriptor {
    floorY: number;
    bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
    spawnAnchors: VaultRoutePoint[];
    stairCells: VaultRoutePoint[];
    landingCells: VaultRoutePoint[];
}

export const CROSSING_CHECKPOINT_IDS = [
    'crossing_0',
    'crossing_1',
    'crossing_2',
    'crossing_3',
] as const;

export function advanceTraversalCheckpoint(
    state: TraversalCheckpointState,
    checkpointId: string,
): TraversalCheckpointState {
    if (state.completed || CROSSING_CHECKPOINT_IDS[state.nextIndex] !== checkpointId) return state;
    const nextIndex = state.nextIndex + 1;
    return {
        nextIndex,
        completed: nextIndex === CROSSING_CHECKPOINT_IDS.length,
        lastSafeCheckpoint: checkpointId,
    };
}

function pointOnAxis(
    room: VaultRoom,
    alongX: boolean,
    longitudinal: number,
    cross: number,
    y: number,
): VaultRoutePoint {
    return alongX
        ? { x: longitudinal, y, z: room.z + cross }
        : { x: room.x + cross, y, z: longitudinal };
}

function getLongBounds(room: VaultRoom, alongX: boolean): { min: number; max: number } {
    const bounds = getVaultRoomBounds(room);
    return alongX
        ? { min: bounds.minX, max: bounds.maxX }
        : { min: bounds.minZ, max: bounds.maxZ };
}

function evenlySpaced(min: number, max: number, count: number): number[] {
    return Array.from({ length: count }, (_, index) => Math.round(min + (max - min) * ((index + 1) / (count + 1))));
}

export function buildVaultPuzzleDescriptor(room: VaultRoom): VaultPuzzleDescriptor {
    const kind = room.kind as VaultPuzzleKind;
    const alongX = isVaultRoomLongitudinalAlongX(room);
    const long = getLongBounds(room, alongX);

    if (kind === 'memory_choir') {
        const responseCells = MEMORY_PYLON_OFFSETS.map(([dx, dz]) => ({
            x: room.x + dx,
            y: room.y + 1,
            z: room.z + dz,
        }));
        return {
            roomId: room.id,
            kind,
            activation: { x: room.x, y: room.y + 1, z: room.z },
            mechanismControls: [{ x: room.x, y: room.y + 1, z: room.z }],
            responseCells,
            fallbackControl: pointOnAxis(room, alongX, alongX ? room.x : room.z, -4, room.y + 1),
            recoveryAnchors: [{ id: 'center', x: room.x, y: room.y + 1, z: room.z }],
            completion: responseCells[responseCells.length - 1],
            alongX,
        };
    }

    if (kind === 'counterweight_gallery') {
        const bankLong = evenlySpaced(long.min + 5, long.max - 5, 8);
        const bankCenters = bankLong.flatMap((value, index) => [
            pointOnAxis(room, alongX, value, -3, room.y + 1 + Math.min(4, index)),
            pointOnAxis(room, alongX, value, 3, room.y + 1 + Math.min(4, bankLong.length - 1 - index)),
        ]);
        const responseCells = bankCenters.flatMap((center) => [-1, 0, 1].map((offset) => ({
            x: center.x + (alongX ? 0 : offset),
            y: center.y,
            z: center.z + (alongX ? offset : 0),
        })));
        const bridgeLong = bankLong[Math.floor(bankLong.length / 2)];
        for (let cross = -2; cross <= 2; cross += 1) {
            responseCells.push(pointOnAxis(room, alongX, bridgeLong, cross, room.y + 5));
        }
        const highFinish = bankCenters[bankCenters.length - 2];
        const completion = { x: highFinish.x, y: highFinish.y + 1, z: highFinish.z };
        const mechanismControls = [
            pointOnAxis(room, alongX, long.min + 4, -5, room.y + 1),
            pointOnAxis(room, alongX, Math.round((long.min + long.max) / 2), 5, room.y + 1),
            pointOnAxis(room, alongX, long.max - 4, -5, room.y + 1),
        ];
        return {
            roomId: room.id,
            kind,
            activation: mechanismControls[0],
            mechanismControls,
            responseCells,
            fallbackControl: mechanismControls[0],
            recoveryAnchors: [
                { id: 'start', ...pointOnAxis(room, alongX, long.min + 4, 0, room.y + 1) },
                { id: 'landing', ...pointOnAxis(room, alongX, Math.round((long.min + long.max) / 2), 0, room.y + 1) },
                { id: 'finish', x: completion.x, y: completion.y + 1, z: completion.z },
            ],
            completion,
            alongX,
        };
    }

    if (kind === 'acoustic_relay') {
        const receiverLong = evenlySpaced(long.min + 5, long.max - 5, 6);
        const mirror = room.variant % 2 === 0 ? 1 : -1;
        const crosses = [-5, 4, -4, 5, -3, 3].map((cross) => cross * mirror);
        const responseCells = receiverLong.map((value, index) => pointOnAxis(room, alongX, value, crosses[index], room.y + 1));
        return {
            roomId: room.id,
            kind,
            // Doorways clear five-wide volumes several cells into a room during
            // the final generation pass. Six cells of inset keeps the striker
            // visible beside the first receiver instead of letting that pass
            // erase the block while its world-space cue remains behind.
            activation: pointOnAxis(room, alongX, long.min + 6, 0, room.y + 1),
            mechanismControls: [pointOnAxis(room, alongX, long.min + 6, 0, room.y + 1)],
            responseCells,
            fallbackControl: pointOnAxis(room, alongX, long.min + 4, 5, room.y + 1),
            recoveryAnchors: [
                { id: 'start', ...pointOnAxis(room, alongX, long.min + 6, 0, room.y + 1) },
                { id: 'finish', ...pointOnAxis(room, alongX, long.max - 3, 0, room.y + 1) },
            ],
            completion: responseCells[responseCells.length - 1],
            alongX,
        };
    }

    if (kind === 'broken_crossing') {
        const progressionSign = getVaultRoomProgressionSign(room);
        const checkpointLong = getTraversalSafeRows(room);
        if (progressionSign < 0) checkpointLong.reverse();
        const responseCells = checkpointLong.map((value, index) => pointOnAxis(
            room,
            alongX,
            value,
            index % 2 === 0 ? -2 : 2,
            room.y,
        ));
        const start = pointOnAxis(room, alongX, progressionSign > 0 ? long.min + 3 : long.max - 3, 0, room.y);
        const finish = pointOnAxis(room, alongX, progressionSign > 0 ? long.max - 3 : long.min + 3, 0, room.y);
        return {
            roomId: room.id,
            kind,
            activation: start,
            mechanismControls: [],
            responseCells,
            fallbackControl: pointOnAxis(room, alongX, long.min + 3, 5, room.y + 1),
            recoveryAnchors: [
                { id: 'start', ...start, y: room.y + 1 },
                ...responseCells.map((cell, index) => ({
                    id: CROSSING_CHECKPOINT_IDS[index],
                    x: cell.x,
                    y: room.y + 1,
                    z: cell.z,
                })),
            ],
            completion: finish,
            alongX,
        };
    }

    throw new Error(`Unsupported Resonant Vault puzzle room: ${room.kind}`);
}

export function getPuzzleResponseIndex(
    descriptor: VaultPuzzleDescriptor,
    cell: VaultRoutePoint,
): number {
    return descriptor.responseCells.findIndex((candidate) => candidate.x === cell.x
        && candidate.y === cell.y
        && candidate.z === cell.z);
}

export function getCrossingPitDescriptor(room: VaultRoom): VaultCrossingPitDescriptor {
    if (room.kind !== 'broken_crossing') throw new Error(`Room ${room.id} is not a broken crossing`);
    const roomBounds = getVaultRoomBounds(room);
    const bounds = {
        minX: roomBounds.minX + 2,
        maxX: roomBounds.maxX - 2,
        minZ: roomBounds.minZ + 2,
        maxZ: roomBounds.maxZ - 2,
    };
    const floorY = room.y - 8;
    const alongX = isVaultRoomLongitudinalAlongX(room);
    const progressionSign = getVaultRoomProgressionSign(room);
    const long = getLongBounds(room, alongX);
    const finish = progressionSign > 0 ? long.max - 4 : long.min + 4;
    const stairCells: VaultRoutePoint[] = [];
    // The lower route climbs a side aisle, not through the live center-lane
    // parkour. Starting one block above the pit floor preserves a solid landing.
    const crossOffset = ((room.variant & 1) === 0 ? -1 : 1)
        * Math.max(6, Math.floor((alongX ? room.depth : room.width) * 0.27));
    for (let level = 1; level <= 7; level += 1) {
        const longitudinal = finish - progressionSign * (7 - level);
        for (let cross = -1; cross <= 1; cross += 1) {
            stairCells.push(pointOnAxis(room, alongX, longitudinal, crossOffset + cross, floorY + level));
        }
    }
    const landingCells: VaultRoutePoint[] = [];
    // The completion platform already occupies cross offsets -4..4. Start the
    // latent bridge immediately outside it so generation cannot accidentally
    // reveal part of the alternate route before the judgment encounter clears.
    const landingEdge = Math.sign(crossOffset) * 5;
    const fallbackFloor = pointOnAxis(room, alongX, long.min + 3, 5, room.y);
    for (let cross = landingEdge; Math.sign(crossOffset) > 0 ? cross <= crossOffset : cross >= crossOffset; cross += Math.sign(crossOffset)) {
        for (let longOffset = 0; longOffset <= 1; longOffset += 1) {
            const cell = pointOnAxis(room, alongX, finish + progressionSign * longOffset, cross, room.y);
            // The visible fallback control is the first stepping stone into the
            // alternate route; it is functional and must not be erased as part
            // of the bridge's retracted state.
            if (cell.x !== fallbackFloor.x || cell.z !== fallbackFloor.z) landingCells.push(cell);
        }
    }
    const inset = 5;
    const spawnY = floorY + 1;
    const spawnAnchors = [
        { x: bounds.minX + inset, y: spawnY, z: bounds.minZ + inset },
        { x: bounds.maxX - inset, y: spawnY, z: bounds.minZ + inset },
        { x: bounds.minX + inset, y: spawnY, z: bounds.maxZ - inset },
        { x: bounds.maxX - inset, y: spawnY, z: bounds.maxZ - inset },
    ];
    return { floorY, bounds, spawnAnchors, stairCells, landingCells };
}

export function getCrossingStairRotation(room: VaultRoom): number {
    const sign = getVaultRoomProgressionSign(room);
    if (isVaultRoomLongitudinalAlongX(room)) return sign > 0 ? 3 : 2;
    return sign > 0 ? 1 : 0;
}

export function isCrossingFinishReached(
    descriptor: VaultPuzzleDescriptor,
    floorCell: VaultRoutePoint,
): boolean {
    return descriptor.kind === 'broken_crossing'
        && floorCell.x === descriptor.completion.x
        && floorCell.y === descriptor.completion.y
        && floorCell.z === descriptor.completion.z;
}

export function isInsideCrossingRecoveryVolume(
    room: VaultRoom,
    position: { x: number; y: number; z: number },
): boolean {
    if (room.kind !== 'broken_crossing') return false;
    const bounds = getVaultRoomBounds(room);
    const pit = getCrossingPitDescriptor(room);
    return position.x >= bounds.minX && position.x <= bounds.maxX
        && position.z >= bounds.minZ && position.z <= bounds.maxZ
        && position.y >= pit.floorY && position.y < room.y;
}

export function orderTraversalRecoveryAnchors(
    descriptor: VaultPuzzleDescriptor,
    state: TraversalCheckpointState,
): VaultPuzzleRecoveryAnchor[] {
    const preferred = descriptor.recoveryAnchors.find((anchor) => anchor.id === state.lastSafeCheckpoint);
    return [preferred, ...descriptor.recoveryAnchors]
        .filter((anchor): anchor is VaultPuzzleRecoveryAnchor => !!anchor)
        .filter((anchor, index, anchors) => anchors.findIndex((candidate) => candidate.id === anchor.id) === index);
}
