import {
    getVaultOpenAirSurfaceY,
    getVaultRoomBounds,
    RESONANT_VAULT_SPIRE_LOCAL_Z,
    rotateVaultOffset,
    vaultHash,
    type VaultCandidate,
    type VaultRoom,
    type VaultRoomId,
    type VaultRoomKind,
    type VaultSurfaceOutlet,
} from './resonantVaults.ts';

export type VaultMajorKind =
    | 'guard_hall'
    | 'resonance_foundry'
    | 'memory_choir'
    | 'counterweight_gallery'
    | 'acoustic_relay'
    | 'broken_crossing'
    | 'fractured_archive';

export type VaultAnnexKind = 'bell_crypt' | 'fractured_archive';

export interface VaultModuleSelection {
    majors: Array<{ id: `major_${number}`; kind: VaultMajorKind; variant: number }>;
    annexes: Array<{ id: `annex_${number}`; kind: VaultAnnexKind; variant: number }>;
}

export interface PlacedVaultRooms {
    rooms: VaultRoom[];
    edges: Array<[VaultRoomId, VaultRoomId]>;
    surfaceOutlets: {
        grand: VaultSurfaceOutlet;
        fracture: VaultSurfaceOutlet;
    };
}

interface RoomTemplate {
    id: VaultRoomId;
    kind: VaultRoomKind;
    localX: number;
    localY: number;
    localZ: number;
    width: number;
    height: number;
    depth: number;
    salt: number;
    variant?: number;
}

// Every vault keeps the Memory Choir (the teaching room) but draws its other
// two rotating chambers from this pool, so different vaults genuinely contain
// different rooms rather than the same fixed set in shuffled positions. Every
// major kind stays unique within one vault (runtime state and lookups treat
// puzzle kinds as per-vault singletons).
const ROTATING_POOL: VaultMajorKind[] = [
    'counterweight_gallery',
    'acoustic_relay',
    'fractured_archive',
];

const SLOT_CENTERS = {
    entrance: [0, 112],
    processional: [0, 88],
    tuning: [0, 64],
    hub: [0, 36],
    major_0: [-62, 48],
    major_1: [-112, 10],
    major_2: [62, 48],
    major_3: [112, 10],
    major_4: [-112, -36],
    major_5: [112, -48],
    inner_works: [-112, -86],
    antechamber: [0, -8],
    arena: [0, -76],
    core: [0, -138],
    grand_ascent: [-72, -218],
    fracture_stair: [72, -218],
    outlet_grand: [-178, -226],
    outlet_fracture: [178, -226],
    annex_0: [-154, 10],
    annex_1: [154, 10],
    annex_2: [154, -48],
} as const;

export const FIXED_VAULT_EDGES: ReadonlyArray<readonly [VaultRoomId, VaultRoomId]> = [
    ['entrance', 'processional'],
    ['processional', 'tuning'],
    ['tuning', 'hub'],
    ['hub', 'major_0'],
    ['major_0', 'major_1'],
    ['major_1', 'major_4'],
    ['major_4', 'inner_works'],
    ['inner_works', 'hub'],
    ['hub', 'major_2'],
    ['major_2', 'major_3'],
    ['major_3', 'major_5'],
    ['major_5', 'hub'],
    ['hub', 'antechamber'],
    ['antechamber', 'arena'],
    ['arena', 'core'],
    ['core', 'grand_ascent'],
    ['core', 'fracture_stair'],
    ['grand_ascent', 'outlet_grand'],
    ['fracture_stair', 'outlet_fracture'],
];

export function selectVaultModules(candidate: VaultCandidate): VaultModuleSelection {
    // Draw two distinct pool rooms, then deal memory + picks across the three
    // rotating slots by a deterministic offset.
    const firstPick = vaultHash(candidate.seed, candidate.gridX, candidate.gridZ, 751) % ROTATING_POOL.length;
    const secondPick = (firstPick + 1
        + vaultHash(candidate.seed, candidate.gridX, candidate.gridZ, 757) % (ROTATING_POOL.length - 1))
        % ROTATING_POOL.length;
    const rotating: VaultMajorKind[] = ['memory_choir', ROTATING_POOL[firstPick], ROTATING_POOL[secondPick]];
    const offset = vaultHash(candidate.seed, candidate.gridX, candidate.gridZ, 701) % rotating.length;
    const ordered = rotating.map((_, index) => rotating[(index + offset) % rotating.length]);
    // The Crossing owns the straight outer leg of the left circuit. Its two
    // doorways remain opposite one another while the boss axis stays clear.
    const puzzleSlots: Array<{ id: `major_${number}`; kind: VaultMajorKind }> = [
        { id: 'major_2', kind: ordered[0] },
        { id: 'major_3', kind: ordered[1] },
        { id: 'major_4', kind: 'broken_crossing' },
        { id: 'major_5', kind: ordered[2] },
    ];
    const majors: VaultModuleSelection['majors'] = [
        {
            id: 'major_0',
            kind: 'guard_hall',
            variant: vaultHash(candidate.seed, candidate.gridX, candidate.gridZ, 711) % 4,
        },
        {
            id: 'major_1',
            kind: 'resonance_foundry',
            variant: vaultHash(candidate.seed, candidate.gridX, candidate.gridZ, 713) % 4,
        },
        ...puzzleSlots.map(({ id, kind }, index) => ({
            id,
            kind,
            variant: vaultHash(candidate.seed, candidate.gridX, candidate.gridZ, 719 + index) % 4,
        })),
    ];
    const annexCount = 2 + (vaultHash(candidate.seed, candidate.gridX, candidate.gridZ, 733) & 1);
    const combatAnnexIndex = vaultHash(candidate.seed, candidate.gridX, candidate.gridZ, 737) % annexCount;
    const annexes = Array.from({ length: annexCount }, (_, index) => ({
        id: `annex_${index}` as const,
        kind: index === combatAnnexIndex ? 'bell_crypt' as const : 'fractured_archive' as const,
        variant: vaultHash(candidate.seed, candidate.gridX, candidate.gridZ, 739 + index) % 4,
    }));
    return { majors, annexes };
}

function createRoom(candidate: VaultCandidate, vaultY: number, template: RoomTemplate): VaultRoom {
    const rotated = rotateVaultOffset(template.localX, template.localZ, candidate.orientation);
    return {
        id: template.id,
        kind: template.kind,
        x: candidate.centerX + rotated.x,
        y: vaultY + template.localY,
        z: candidate.centerZ + rotated.z,
        width: candidate.orientation % 2 === 0 ? template.width : template.depth,
        height: template.height,
        depth: candidate.orientation % 2 === 0 ? template.depth : template.width,
        variant: template.variant
            ?? vaultHash(candidate.seed, candidate.gridX, candidate.gridZ, template.salt) % 4,
        orientation: candidate.orientation,
    };
}

function outletThreshold(candidate: VaultCandidate, room: VaultRoom): { x: number; z: number } {
    const bounds = getVaultRoomBounds(room);
    const dx = room.x - candidate.centerX;
    const dz = room.z - candidate.centerZ;
    if (Math.abs(dx) >= Math.abs(dz)) {
        return { x: dx > 0 ? bounds.maxX : bounds.minX, z: room.z };
    }
    return { x: room.x, z: dz > 0 ? bounds.maxZ : bounds.minZ };
}

function fixedTemplates(centerSurfaceY: number, vaultY: number): RoomTemplate[] {
    const at = (id: keyof typeof SLOT_CENTERS): readonly [number, number] => SLOT_CENTERS[id];
    return [
        { id: 'spire', kind: 'spire', localX: 0, localY: centerSurfaceY - vaultY + 1, localZ: RESONANT_VAULT_SPIRE_LOCAL_Z, width: 17, height: 30, depth: 17, salt: 201 },
        { id: 'entrance', kind: 'entrance', localX: at('entrance')[0], localY: 0, localZ: at('entrance')[1], width: 23, height: 17, depth: 21, salt: 203 },
        { id: 'processional', kind: 'processional', localX: at('processional')[0], localY: 0, localZ: at('processional')[1], width: 25, height: 17, depth: 19, salt: 205 },
        { id: 'tuning', kind: 'tuning_hall', localX: at('tuning')[0], localY: 0, localZ: at('tuning')[1], width: 29, height: 19, depth: 17, salt: 207 },
        { id: 'hub', kind: 'hub', localX: at('hub')[0], localY: 0, localZ: at('hub')[1], width: 39, height: 23, depth: 33, salt: 211 },
        { id: 'inner_works', kind: 'inner_works', localX: at('inner_works')[0], localY: 0, localZ: at('inner_works')[1], width: 37, height: 19, depth: 31, salt: 223 },
        { id: 'antechamber', kind: 'antechamber', localX: at('antechamber')[0], localY: 0, localZ: at('antechamber')[1], width: 29, height: 17, depth: 23, salt: 227 },
        { id: 'arena', kind: 'arena', localX: at('arena')[0], localY: -2, localZ: at('arena')[1], width: 55, height: 25, depth: 51, salt: 229 },
        { id: 'core', kind: 'core', localX: at('core')[0], localY: 0, localZ: at('core')[1], width: 35, height: 21, depth: 29, salt: 233 },
        { id: 'grand_ascent', kind: 'grand_ascent', localX: at('grand_ascent')[0], localY: 4, localZ: at('grand_ascent')[1], width: 31, height: 19, depth: 27, salt: 239 },
        { id: 'fracture_stair', kind: 'fracture_stair', localX: at('fracture_stair')[0], localY: 4, localZ: at('fracture_stair')[1], width: 33, height: 23, depth: 29, salt: 241 },
    ];
}

const MAJOR_DIMENSIONS: Record<VaultMajorKind, readonly [number, number, number]> = {
    guard_hall: [35, 17, 31],
    resonance_foundry: [37, 19, 33],
    memory_choir: [33, 19, 35],
    counterweight_gallery: [37, 23, 31],
    acoustic_relay: [31, 21, 37],
    broken_crossing: [39, 25, 35],
    // As a major-slot room the archive uses the same envelope class as the
    // other rotating chambers; a smaller box shifts its corridor elbow into
    // the crossing room's reservation.
    fractured_archive: [33, 15, 31],
};

export function getMeaningfulVaultRoomCount(rooms: readonly VaultRoom[]): number {
    const transitKinds = new Set<VaultRoomKind>([
        'spire',
        'entrance',
        'processional',
        'tuning_hall',
        'hub',
        'grand_ascent',
        'fracture_stair',
        'outlet_grand',
        'outlet_fracture',
    ]);
    return rooms.filter(({ kind }) => !transitKinds.has(kind)).length;
}

export function placeVaultRooms(
    candidate: VaultCandidate,
    centerSurfaceY: number,
    getSurfaceY: (x: number, z: number) => number = () => centerSurfaceY,
): PlacedVaultRooms {
    const vaultY = Math.max(-34, Math.min(38, centerSurfaceY - 64));
    const selection = selectVaultModules(candidate);
    const rooms = fixedTemplates(centerSurfaceY, vaultY).map((template) => createRoom(candidate, vaultY, template));

    for (const major of selection.majors) {
        const [localX, localZ] = SLOT_CENTERS[major.id as keyof typeof SLOT_CENTERS];
        const [width, height, depth] = MAJOR_DIMENSIONS[major.kind];
        rooms.push(createRoom(candidate, vaultY, {
            id: major.id,
            kind: major.kind,
            localX,
            localY: major.kind === 'broken_crossing' ? -2 : 0,
            localZ,
            width,
            height,
            depth,
            salt: 301,
            variant: major.variant,
        }));
    }

    for (const annex of selection.annexes) {
        const [localX, localZ] = SLOT_CENTERS[annex.id as keyof typeof SLOT_CENTERS];
        rooms.push(createRoom(candidate, vaultY, {
            id: annex.id,
            kind: annex.kind,
            localX,
            localY: annex.kind === 'bell_crypt' ? -2 : 1,
            localZ,
            width: annex.kind === 'bell_crypt' ? 27 : 25,
            height: annex.kind === 'bell_crypt' ? 17 : 15,
            depth: 23,
            salt: 307,
            variant: annex.variant,
        }));
    }

    const makeOutlet = (
        id: 'outlet_grand' | 'outlet_fracture',
        route: 'grand' | 'fracture',
        salt: number,
    ): { room: VaultRoom; outlet: VaultSurfaceOutlet } => {
        const [localX, localZ] = SLOT_CENTERS[id];
        const probe = createRoom(candidate, vaultY, {
            id,
            kind: id,
            localX,
            localY: centerSurfaceY - vaultY,
            localZ,
            width: 19,
            height: 15,
            depth: 19,
            salt,
        });
        const threshold = outletThreshold(candidate, probe);
        const surfaceY = getVaultOpenAirSurfaceY(getSurfaceY(threshold.x, threshold.z));
        const room = createRoom(candidate, vaultY, {
            id,
            kind: id,
            localX,
            localY: surfaceY - vaultY,
            localZ,
            width: 19,
            height: 15,
            depth: 19,
            salt,
        });
        return {
            room,
            outlet: {
                route,
                x: threshold.x,
                z: threshold.z,
                surfaceY,
                floorY: room.y,
                thresholdRadius: 4,
                room: id,
            },
        };
    };

    const grand = makeOutlet('outlet_grand', 'grand', 311);
    const fracture = makeOutlet('outlet_fracture', 'fracture', 313);
    rooms.push(grand.room, fracture.room);

    const edges = FIXED_VAULT_EDGES.map(([from, to]) => [from, to] as [VaultRoomId, VaultRoomId]);
    const annexHosts = ['major_1', 'major_3', 'major_5'] as const;
    selection.annexes.forEach((annex, index) => edges.push([annexHosts[index], annex.id]));

    return {
        rooms,
        edges,
        surfaceOutlets: { grand: grand.outlet, fracture: fracture.outlet },
    };
}
