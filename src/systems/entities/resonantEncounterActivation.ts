export interface EncounterBounds {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    minZ: number;
    maxZ: number;
}

export interface EncounterPosition {
    x: number;
    y: number;
    z: number;
}

export interface EncounterActivationInput {
    player: EncounterPosition;
    room: EncounterBounds;
    entranceCrossed: boolean;
    gateOpen: boolean;
}

export interface EncounterActivationResult {
    active: boolean;
    lockRoomId: boolean;
}

export interface EncounterActivationRoom {
    id: string;
    bounds: EncounterBounds;
    cleared: boolean;
    chunksLoaded: boolean;
}

export function isPlayerInsideEncounter(
    room: EncounterBounds,
    position: EncounterPosition,
    margin = 0,
): boolean {
    const safeMargin = Number.isFinite(margin) ? Math.max(0, margin) : 0;
    return position.x >= room.minX - safeMargin && position.x <= room.maxX + safeMargin
        && position.y >= room.minY - safeMargin && position.y <= room.maxY + safeMargin
        && position.z >= room.minZ - safeMargin && position.z <= room.maxZ + safeMargin;
}

export function insetEncounterBounds(room: EncounterBounds, horizontalInset: number): EncounterBounds {
    const inset = Number.isFinite(horizontalInset) ? Math.max(0, horizontalInset) : 0;
    const xInset = Math.min(inset, Math.max(0, (room.maxX - room.minX) * 0.5));
    const zInset = Math.min(inset, Math.max(0, (room.maxZ - room.minZ) * 0.5));
    return {
        ...room,
        minX: room.minX + xInset,
        maxX: room.maxX - xInset,
        minZ: room.minZ + zInset,
        maxZ: room.maxZ - zInset,
    };
}

export function getEncounterActivation(input: EncounterActivationInput): EncounterActivationResult {
    const active = input.entranceCrossed
        && isPlayerInsideEncounter(input.room, input.player);
    return {
        active,
        lockRoomId: active && input.gateOpen,
    };
}

export function selectActivatedRoomId(input: {
    player: EncounterPosition;
    lockedRoomId: string | null;
    rooms: readonly EncounterActivationRoom[];
}): string | null {
    if (input.lockedRoomId) return input.lockedRoomId;
    return input.rooms.find((room) => !room.cleared
        && room.chunksLoaded
        && isPlayerInsideEncounter(room.bounds, input.player))?.id ?? null;
}
