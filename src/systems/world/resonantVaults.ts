import { placeVaultRooms } from './resonantVaultRooms.ts';

export const RESONANT_VAULT_GRID = 1536;
export const RESONANT_VAULT_ACTIVE_DENOMINATOR = 4;
export const RESONANT_VAULT_MIN_ORIGIN_DISTANCE = 1200;
export const RESONANT_VAULT_HALF_EXTENT = 256;
// Runtime ownership uses radial distance while generation reserves a square.
// Cover the square's corners plus a small transition margin so surface outlets
// near a corner cannot unload the expedition before the escape completes.
export const RESONANT_VAULT_RUNTIME_RADIUS = Math.ceil(Math.SQRT2 * (RESONANT_VAULT_HALF_EXTENT + 4));
export const RESONANT_VAULT_VERTICAL_EXTENT = 128;
export const RESONANT_VAULT_SPIRE_LOCAL_Z = 144;
export const RESONANT_VAULT_WATER_SURFACE_Y = 63;

export type VaultRoomKind =
    | 'spire'
    | 'entrance'
    | 'processional'
    | 'tuning_hall'
    | 'hub'
    | 'guard_hall'
    | 'resonance_foundry'
    | 'memory_choir'
    | 'counterweight_gallery'
    | 'acoustic_relay'
    | 'broken_crossing'
    | 'bell_crypt'
    | 'fractured_archive'
    | 'inner_works'
    | 'antechamber'
    | 'arena'
    | 'core'
    | 'grand_ascent'
    | 'fracture_stair'
    | 'outlet_grand'
    | 'outlet_fracture';

export type VaultRoomId = string;

export interface VaultCandidate {
    gridX: number;
    gridZ: number;
    centerX: number;
    centerZ: number;
    seed: number;
    active: boolean;
    orientation: 0 | 1 | 2 | 3;
}

export interface VaultRoom {
    id: VaultRoomId;
    kind: VaultRoomKind;
    x: number;
    y: number;
    z: number;
    width: number;
    height: number;
    depth: number;
    variant: number;
    /** World rotation of this authored room; omitted fixtures use orientation 0. */
    orientation?: 0 | 1 | 2 | 3;
}

export interface VaultRoutePoint {
    x: number;
    y: number;
    z: number;
}

export interface VaultDoorway {
    from: VaultRoomId;
    to: VaultRoomId;
    roomOverlap: VaultRoutePoint[];
    opening: VaultRoutePoint[];
    corridorOverlap: VaultRoutePoint[];
    gate?: 'inner_seal' | 'grand_ascent' | 'fracture_stair';
}

/** Returns the five-by-five doorway plane that lies on the requested room wall. */
export function getVaultDoorwayRoomOpening(doorway: VaultDoorway, roomId: VaultRoomId): VaultRoutePoint[] {
    if (doorway.from === roomId) return doorway.opening.slice(0, 25);
    if (doorway.to === roomId) return doorway.opening.slice(25);
    return [];
}

export interface VaultSurfaceOutlet {
    route: 'grand' | 'fracture';
    x: number;
    z: number;
    surfaceY: number;
    floorY: number;
    thresholdRadius: number;
    room: 'outlet_grand' | 'outlet_fracture';
}

export interface VaultLayout {
    vaultId: string;
    centerX: number;
    centerZ: number;
    surfaceY: number;
    vaultY: number;
    orientation: 0 | 1 | 2 | 3;
    rooms: VaultRoom[];
    edges: Array<[VaultRoomId, VaultRoomId]>;
    doorways: VaultDoorway[];
    surfaceOutlets: {
        grand: VaultSurfaceOutlet;
        fracture: VaultSurfaceOutlet;
    };
    glyphSequence: number[];
    phaseTiming: VaultPhaseTiming;
}

export interface VaultPhaseTiming {
    periodTicks: number;
    solidTicks: number;
    offsetTicks: number;
}

export interface VaultRoomBounds {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    minZ: number;
    maxZ: number;
}

export function floorDiv(value: number, divisor: number): number {
    if (!Number.isFinite(value) || !Number.isFinite(divisor) || divisor <= 0) {
        throw new Error('floorDiv requires finite input and a positive divisor');
    }
    return Math.floor(value / divisor);
}

export function vaultHash(seed: number, x: number, z: number, salt = 0): number {
    let h = (seed | 0) ^ Math.imul(x | 0, 0x45d9f3b) ^ Math.imul(z | 0, 0x119de1f3) ^ Math.imul(salt | 0, 0x27d4eb2d);
    h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
    h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
    h ^= h >>> 16;
    return h >>> 0;
}

function hashUnit(seed: number, x: number, z: number, salt: number): number {
    return vaultHash(seed, x, z, salt) / 0xffffffff;
}

export function rotateVaultOffset(x: number, z: number, orientation: number): { x: number; z: number } {
    switch (orientation & 3) {
        case 1: return { x: -z, z: x };
        case 2: return { x: -x, z: -z };
        case 3: return { x: z, z: -x };
        default: return { x, z };
    }
}

export function getVaultCandidateForCell(gridX: number, gridZ: number, seed: number): VaultCandidate {
    const margin = RESONANT_VAULT_HALF_EXTENT + 32;
    const usable = RESONANT_VAULT_GRID - margin * 2;
    const centerX = gridX * RESONANT_VAULT_GRID + margin + Math.floor(hashUnit(seed, gridX, gridZ, 11) * usable);
    const centerZ = gridZ * RESONANT_VAULT_GRID + margin + Math.floor(hashUnit(seed, gridX, gridZ, 17) * usable);
    const activityRoll = vaultHash(seed, gridX, gridZ, 23);
    const farEnoughFromOrigin = Math.hypot(centerX, centerZ) >= RESONANT_VAULT_MIN_ORIGIN_DISTANCE;
    return {
        gridX,
        gridZ,
        centerX,
        centerZ,
        seed,
        active: farEnoughFromOrigin && activityRoll % RESONANT_VAULT_ACTIVE_DENOMINATOR === 0,
        orientation: (vaultHash(seed, gridX, gridZ, 29) & 3) as 0 | 1 | 2 | 3,
    };
}

export function getVaultId(candidate: VaultCandidate): string {
    return `resonant:${candidate.gridX}:${candidate.gridZ}:${vaultHash(candidate.seed, candidate.gridX, candidate.gridZ, 41).toString(36)}`;
}

export function getVaultGlyphSequence(candidate: VaultCandidate): number[] {
    const sequence: number[] = [];
    for (let index = 0; index < 4; index += 1) {
        let symbol = vaultHash(candidate.seed, candidate.gridX + index, candidate.gridZ - index, 101 + index) & 3;
        if (index > 0 && symbol === sequence[index - 1]) symbol = (symbol + 1 + (index & 1)) & 3;
        sequence.push(symbol);
    }
    return sequence;
}

export function getVaultPhaseTiming(candidate: VaultCandidate): VaultPhaseTiming {
    const periodTicks = 88 + (vaultHash(candidate.seed, candidate.gridX, candidate.gridZ, 131) % 33);
    const solidTicks = 42 + (vaultHash(candidate.seed, candidate.gridX, candidate.gridZ, 137) % Math.max(1, periodTicks - 60));
    const offsetTicks = vaultHash(candidate.seed, candidate.gridX, candidate.gridZ, 139) % periodTicks;
    return { periodTicks, solidTicks, offsetTicks };
}

export function getVaultLayout(
    candidate: VaultCandidate,
    centerSurfaceY: number,
    getSurfaceY: (x: number, z: number) => number = () => centerSurfaceY,
): VaultLayout {
    const spire = getVaultSpirePosition(candidate);
    const surfaceY = getVaultOpenAirSurfaceY(getSurfaceY(spire.x, spire.z));
    const vaultY = Math.max(-34, Math.min(38, surfaceY - 64));
    const placed = placeVaultRooms(candidate, surfaceY, getSurfaceY);
    const layout: VaultLayout = {
        vaultId: getVaultId(candidate),
        centerX: candidate.centerX,
        centerZ: candidate.centerZ,
        surfaceY,
        vaultY,
        orientation: candidate.orientation,
        rooms: placed.rooms,
        edges: placed.edges,
        doorways: [],
        surfaceOutlets: {
            grand: placed.surfaceOutlets.grand,
            fracture: placed.surfaceOutlets.fracture,
        },
        glyphSequence: getVaultGlyphSequence(candidate),
        phaseTiming: getVaultPhaseTiming(candidate),
    };
    layout.doorways = getVaultDoorways(layout);
    return layout;
}

export function getVaultRoomBounds(room: VaultRoom): VaultRoomBounds {
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

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

export function getRoomPort(room: VaultRoom, target: VaultRoom): VaultRoutePoint {
    const bounds = getVaultRoomBounds(room);
    const dx = target.x - room.x;
    const dz = target.z - room.z;
    const sideCircuitPair = (room.id === 'hub' && (target.id === 'inner_works' || target.id === 'major_5'))
        || (target.id === 'hub' && (room.id === 'inner_works' || room.id === 'major_5'));
    if (sideCircuitPair) {
        const sideRunsAlongX = ((room.orientation ?? target.orientation ?? 0) & 1) === 0;
        if (sideRunsAlongX) {
            return {
                x: dx >= 0 ? bounds.maxX : bounds.minX,
                y: room.y,
                z: clamp(target.z, bounds.minZ + 3, bounds.maxZ - 3),
            };
        }
        return {
            x: clamp(target.x, bounds.minX + 3, bounds.maxX - 3),
            y: room.y,
            z: dz >= 0 ? bounds.maxZ : bounds.minZ,
        };
    }
    if (Math.abs(dx) >= Math.abs(dz)) {
        return {
            x: dx >= 0 ? bounds.maxX : bounds.minX,
            y: room.y,
            z: clamp(target.z, bounds.minZ + 3, bounds.maxZ - 3),
        };
    }
    return {
        x: clamp(target.x, bounds.minX + 3, bounds.maxX - 3),
        y: room.y,
        z: dz >= 0 ? bounds.maxZ : bounds.minZ,
    };
}

function appendAxisSteps(points: Array<{ x: number; z: number }>, axis: 'x' | 'z', target: number): void {
    let current = points[points.length - 1];
    while (current[axis] !== target) {
        const next = { ...current, [axis]: current[axis] + Math.sign(target - current[axis]) };
        points.push(next);
        current = next;
    }
}

function isOutletConnection(from: VaultRoom, to: VaultRoom): boolean {
    return from.kind.startsWith('outlet_') || to.kind.startsWith('outlet_');
}

function appendOutletDetour(
    horizontal: Array<{ x: number; z: number }>,
    from: VaultRoom,
    to: VaultRoom,
    end: VaultRoutePoint,
): void {
    const escape = from.kind.startsWith('outlet_') ? to : from;
    const outlet = from.kind.startsWith('outlet_') ? from : to;
    const side = outlet.kind === 'outlet_grand' ? 'west' : 'east';
    const dx = outlet.x - escape.x;
    const dz = outlet.z - escape.z;
    // The two exits are intentionally asymmetric: the Grand Ascent takes a long
    // ceremonial switchback, while the Fracture Stair cuts almost straight up.
    const detour = side === 'west' ? 82 : 36;
    if (Math.abs(dx) >= Math.abs(dz)) {
        const sign = side === 'west' ? -Math.sign(dx || 1) : Math.sign(dx || 1);
        appendAxisSteps(horizontal, 'z', horizontal[horizontal.length - 1].z + sign * detour);
        appendAxisSteps(horizontal, 'x', end.x);
        appendAxisSteps(horizontal, 'z', end.z);
    } else {
        const sign = side === 'west' ? Math.sign(dz || 1) : -Math.sign(dz || 1);
        appendAxisSteps(horizontal, 'x', horizontal[horizontal.length - 1].x + sign * detour);
        appendAxisSteps(horizontal, 'z', end.z);
        appendAxisSteps(horizontal, 'x', end.x);
    }
}

function assignOutletElevations(
    horizontal: Array<{ x: number; z: number }>,
    startY: number,
    endY: number,
): VaultRoutePoint[] {
    const turnIndices: number[] = [];
    for (let index = 1; index < horizontal.length - 1; index += 1) {
        const previous = horizontal[index - 1];
        const point = horizontal[index];
        const next = horizontal[index + 1];
        const enteredAlongX = previous.x !== point.x;
        const exitsAlongX = point.x !== next.x;
        if (enteredAlongX !== exitsAlongX) turnIndices.push(index);
    }
    const eligible = new Set<number>();
    for (let index = 1; index < horizontal.length; index += 1) {
        if (turnIndices.every((turn) => Math.abs(index - turn) > 5)) eligible.add(index);
    }
    eligible.add(horizontal.length - 1);
    const ordered = [...eligible].sort((a, b) => a - b);
    const rise = endY - startY;
    if (ordered.length < Math.abs(rise)) {
        return horizontal.map((point, index) => ({
            ...point,
            y: Math.round(startY + rise * (index / Math.max(1, horizontal.length - 1))),
        }));
    }
    const yAt = new Map<number, number>();
    ordered.forEach((index, order) => {
        yAt.set(index, Math.round(startY + rise * ((order + 1) / ordered.length)));
    });
    let y = startY;
    return horizontal.map((point, index) => {
        y = yAt.get(index) ?? y;
        return { ...point, y };
    });
}

export function getVaultCorridorRoute(from: VaultRoom, to: VaultRoom): VaultRoutePoint[] {
    const start = getRoomPort(from, to);
    const end = getRoomPort(to, from);
    const horizontal: Array<{ x: number; z: number }> = [{ x: start.x, z: start.z }];
    if (isOutletConnection(from, to)) {
        appendOutletDetour(horizontal, from, to, end);
        return assignOutletElevations(horizontal, start.y, end.y);
    }
    const loopReturn = (from.id === 'inner_works' || from.id === 'major_5') && to.id === 'hub';
    if (loopReturn) {
        const sideRunsAlongX = ((from.orientation ?? 0) & 1) === 0;
        if (sideRunsAlongX) {
            appendAxisSteps(horizontal, 'x', start.x + Math.sign(end.x - start.x) * 34);
            appendAxisSteps(horizontal, 'z', end.z);
            appendAxisSteps(horizontal, 'x', end.x);
        } else {
            appendAxisSteps(horizontal, 'z', start.z + Math.sign(end.z - start.z) * 34);
            appendAxisSteps(horizontal, 'x', end.x);
            appendAxisSteps(horizontal, 'z', end.z);
        }
        return horizontal.map((point) => ({ ...point, y: start.y }));
    }
    const xFirst = loopReturn
        ? Math.abs(to.x - from.x) >= Math.abs(to.z - from.z)
        : Math.abs(end.x - start.x) >= Math.abs(end.z - start.z)
            ? true
            : ((from.variant + to.variant) & 1) === 0;
    if (xFirst) {
        appendAxisSteps(horizontal, 'x', end.x);
        appendAxisSteps(horizontal, 'z', end.z);
    } else {
        appendAxisSteps(horizontal, 'z', end.z);
        appendAxisSteps(horizontal, 'x', end.x);
    }
    const denominator = Math.max(1, horizontal.length - 1);
    return horizontal.map((point, index) => ({
        ...point,
        y: Math.round(start.y + (end.y - start.y) * (index / denominator)),
    }));
}

export function getVaultShaftCenter(layout: VaultLayout): { x: number; z: number } {
    const spire = layout.rooms.find((room) => room.kind === 'spire');
    if (!spire) throw new Error('Cannot locate a vault shaft without its spire');
    const rotated = rotateVaultOffset(0, -3, layout.orientation);
    return { x: spire.x + rotated.x, z: spire.z + rotated.z };
}

function pointToward(point: VaultRoutePoint, target: VaultRoutePoint): VaultRoutePoint {
    const dx = target.x - point.x;
    const dz = target.z - point.z;
    if (Math.abs(dx) >= Math.abs(dz)) return { x: point.x + Math.sign(dx), y: point.y, z: point.z };
    return { x: point.x, y: point.y, z: point.z + Math.sign(dz) };
}

function doorwayOpening(port: VaultRoutePoint, corridorPoint: VaultRoutePoint): VaultRoutePoint[] {
    const alongX = corridorPoint.x !== port.x;
    const cells: VaultRoutePoint[] = [];
    for (let vertical = 1; vertical <= 5; vertical += 1) {
        for (let lateral = -2; lateral <= 2; lateral += 1) {
            cells.push({
                x: alongX ? port.x : port.x + lateral,
                y: port.y + vertical,
                z: alongX ? port.z + lateral : port.z,
            });
        }
    }
    return cells;
}

function doorwayGate(from: VaultRoomId, to: VaultRoomId): VaultDoorway['gate'] {
    if (from === 'hub' && to === 'antechamber') return 'inner_seal';
    if (from === 'core' && to === 'grand_ascent') return 'grand_ascent';
    if (from === 'core' && to === 'fracture_stair') return 'fracture_stair';
    return undefined;
}

function entranceRoutePoint(layout: VaultLayout, localX: number, y: number, localZ: number): VaultRoutePoint {
    const shaft = getVaultShaftCenter(layout);
    const rotated = rotateVaultOffset(localX, localZ, layout.orientation);
    return { x: shaft.x + rotated.x, y, z: shaft.z + rotated.z };
}

export function getVaultEntranceRoute(layout: VaultLayout): VaultRoutePoint[] {
    const entrance = layout.rooms.find((room) => room.kind === 'entrance');
    if (!entrance) throw new Error('Cannot author a vault entrance without its entrance room');
    const route: VaultRoutePoint[] = [entranceRoutePoint(layout, 0, entrance.y, 0)];
    let y = entrance.y;
    for (let localX = -1; localX >= -4 && y < layout.surfaceY; localX -= 1) {
        y += 1;
        route.push(entranceRoutePoint(layout, localX, y, 0));
    }
    route.push(
        entranceRoutePoint(layout, -4, y, -1),
        entranceRoutePoint(layout, -4, y, -2),
        entranceRoutePoint(layout, -4, y, -3),
    );
    let direction: 1 | -1 = 1;
    let localX = -4;
    let localZ = -3;
    while (y < layout.surfaceY) {
        for (let step = 0; step < 8 && y < layout.surfaceY; step += 1) {
            localX += direction;
            y += 1;
            route.push(entranceRoutePoint(layout, localX, y, localZ));
        }
        if (y >= layout.surfaceY) break;
        const targetZ = localZ === -3 ? 3 : -3;
        while (localZ !== targetZ) {
            localZ += Math.sign(targetZ - localZ);
            route.push(entranceRoutePoint(layout, localX, y, localZ));
        }
        direction = direction === 1 ? -1 : 1;
    }
    return route;
}

export function getVaultEntranceConnectorRoute(layout: VaultLayout): VaultRoutePoint[] {
    const entrance = layout.rooms.find((room) => room.kind === 'entrance');
    const spire = layout.rooms.find((room) => room.kind === 'spire');
    if (!entrance || !spire) throw new Error('Cannot connect a vault entrance without its entrance and spire');
    const start = { ...getVaultShaftCenter(layout), y: entrance.y };
    const end = getRoomPort(entrance, spire);
    const route: VaultRoutePoint[] = [start];
    let current = start;
    while (current.x !== end.x) {
        current = { x: current.x + Math.sign(end.x - current.x), y: entrance.y, z: current.z };
        route.push(current);
    }
    while (current.z !== end.z) {
        current = { x: current.x, y: entrance.y, z: current.z + Math.sign(end.z - current.z) };
        route.push(current);
    }
    return route;
}

export function getVaultSpirePosition(candidate: VaultCandidate): { x: number; z: number } {
    const offset = rotateVaultOffset(0, RESONANT_VAULT_SPIRE_LOCAL_Z, candidate.orientation);
    return { x: candidate.centerX + offset.x, z: candidate.centerZ + offset.z };
}

export function getVaultOpenAirSurfaceY(terrainY: number): number {
    return Math.max(RESONANT_VAULT_WATER_SURFACE_Y, Math.floor(terrainY));
}

/** Player-safe point on the center of the generated twelve-block forecourt. */
export function getVaultSurfaceApproach(candidate: VaultCandidate, surfaceY: number): VaultRoutePoint {
    const spire = getVaultSpirePosition(candidate);
    const front = rotateVaultOffset(0, 12, candidate.orientation);
    return {
        x: spire.x + front.x,
        y: Math.floor(surfaceY) + 2,
        z: spire.z + front.z,
    };
}

export function getVaultDoorways(layout: VaultLayout): VaultDoorway[] {
    const byId = new Map(layout.rooms.map((entry) => [entry.id, entry]));
    return layout.edges.map(([fromId, toId]) => {
        const from = byId.get(fromId);
        const to = byId.get(toId);
        if (!from || !to) throw new Error(`Vault edge ${fromId}>${toId} references a missing room`);
        const route = getVaultCorridorRoute(from, to);
        const start = route[0];
        const afterStart = route[1] ?? pointToward(start, { x: to.x, y: start.y, z: to.z });
        const end = route[route.length - 1];
        const beforeEnd = route[route.length - 2] ?? pointToward(end, { x: from.x, y: end.y, z: from.z });
        return {
            from: fromId,
            to: toId,
            roomOverlap: [
                pointToward(start, { x: from.x, y: start.y, z: from.z }),
                pointToward(end, { x: to.x, y: end.y, z: to.z }),
            ],
            opening: [
                ...doorwayOpening(start, afterStart),
                ...doorwayOpening(end, beforeEnd),
            ],
            corridorOverlap: [afterStart, beforeEnd],
            gate: doorwayGate(fromId, toId),
        };
    });
}

export function getVaultSurfaceOutlet(
    layout: VaultLayout,
    route: 'grand' | 'fracture',
): VaultSurfaceOutlet {
    return layout.surfaceOutlets[route];
}


export interface VaultPhaseCell extends VaultRoutePoint {
    lane: number;
}

export function isVaultRoomLongitudinalAlongX(room: VaultRoom): boolean {
    if (room.kind === 'broken_crossing') return ((room.orientation ?? 0) & 1) === 1;
    return room.width >= room.depth;
}

export function getVaultRoomProgressionSign(room: VaultRoom): -1 | 1 {
    if (room.kind !== 'broken_crossing') return 1;
    return [ -1, 1, 1, -1 ][room.orientation ?? 0] as -1 | 1;
}

export function getTraversalSafeRows(room: VaultRoom): number[] {
    const bounds = getVaultRoomBounds(room);
    const alongX = isVaultRoomLongitudinalAlongX(room);
    const longMin = (alongX ? bounds.minX : bounds.minZ) + 4;
    const longMax = (alongX ? bounds.maxX : bounds.maxZ) - 4;
    const span = longMax - longMin + 1;
    return [1, 2, 3, 4].map((part) => longMin + Math.floor(span * part / 5));
}

export function getTraversalPhaseCells(room: VaultRoom, _timing: VaultPhaseTiming): VaultPhaseCell[] {
    const bounds = getVaultRoomBounds(room);
    const alongX = isVaultRoomLongitudinalAlongX(room);
    const longMin = (alongX ? bounds.minX : bounds.minZ) + 4;
    const longMax = (alongX ? bounds.maxX : bounds.maxZ) - 4;
    const span = longMax - longMin + 1;
    const crossCenter = alongX ? room.z : room.x;
    const safeRows = new Set(getTraversalSafeRows(room));
    const cells: VaultPhaseCell[] = [];
    for (let longitudinal = longMin; longitudinal <= longMax; longitudinal += 1) {
        if (safeRows.has(longitudinal)) continue;
        const lane = Math.min(3, Math.floor((longitudinal - longMin) * 4 / span));
        for (let cross = -2; cross <= 2; cross += 1) {
            const x = alongX ? longitudinal : crossCenter + cross;
            const z = alongX ? crossCenter + cross : longitudinal;
            cells.push({ x, y: room.y, z, lane });
        }
    }
    return cells;
}

export function getVaultRoomAt(
    layout: VaultLayout,
    position: { x: number; y: number; z: number },
    margin = 0,
): VaultRoom | null {
    for (const room of layout.rooms) {
        if (room.kind === 'spire') continue;
        const bounds = getVaultRoomBounds(room);
        if (position.x >= bounds.minX - margin && position.x <= bounds.maxX + margin
            && position.y >= bounds.minY - margin && position.y <= bounds.maxY + margin
            && position.z >= bounds.minZ - margin && position.z <= bounds.maxZ + margin) return room;
    }
    return null;
}

export function isVaultStructurePosition(
    layout: VaultLayout,
    position: { x: number; y: number; z: number },
    margin = 0,
): boolean {
    const inside = (bounds: VaultRoomBounds): boolean => position.x >= bounds.minX - margin
        && position.x <= bounds.maxX + margin
        && position.y >= bounds.minY - margin
        && position.y <= bounds.maxY + margin
        && position.z >= bounds.minZ - margin
        && position.z <= bounds.maxZ + margin;

    for (const room of layout.rooms) {
        if (inside(getVaultRoomBounds(room))) return true;
    }

    const entrance = layout.rooms.find((room) => room.kind === 'entrance');
    if (entrance) {
        const shaftRadius = 4 + margin;
        const shaft = getVaultShaftCenter(layout);
        if (Math.abs(position.x - shaft.x) <= shaftRadius
            && Math.abs(position.z - shaft.z) <= shaftRadius
            && position.y >= entrance.y - 1 - margin
            && position.y <= layout.surfaceY + 25 + margin) return true;
    }

    const byId = new Map(layout.rooms.map((room) => [room.id, room]));
    for (const [fromId, toId] of layout.edges) {
        const from = byId.get(fromId);
        const to = byId.get(toId);
        if (!from || !to) continue;
        for (const point of getVaultCorridorRoute(from, to)) {
            if (Math.abs(position.x - point.x) <= 4 + margin
                && Math.abs(position.z - point.z) <= 4 + margin
                && position.y >= point.y - 2 - margin
                && position.y <= point.y + 8 + margin) return true;
        }
    }
    return false;
}

export function resonantVaultTouchesBox(
    candidate: VaultCandidate,
    minX: number,
    minZ: number,
    maxX: number,
    maxZ: number,
): boolean {
    const vaultMinX = candidate.centerX - RESONANT_VAULT_HALF_EXTENT;
    const vaultMaxX = candidate.centerX + RESONANT_VAULT_HALF_EXTENT;
    const vaultMinZ = candidate.centerZ - RESONANT_VAULT_HALF_EXTENT;
    const vaultMaxZ = candidate.centerZ + RESONANT_VAULT_HALF_EXTENT;
    return !(maxX < vaultMinX || minX > vaultMaxX || maxZ < vaultMinZ || minZ > vaultMaxZ);
}

export function getVaultCandidatesTouchingBox(
    minX: number,
    minZ: number,
    maxX: number,
    maxZ: number,
    seed: number,
): VaultCandidate[] {
    const minGridX = floorDiv(minX - RESONANT_VAULT_HALF_EXTENT, RESONANT_VAULT_GRID) - 1;
    const maxGridX = floorDiv(maxX + RESONANT_VAULT_HALF_EXTENT, RESONANT_VAULT_GRID) + 1;
    const minGridZ = floorDiv(minZ - RESONANT_VAULT_HALF_EXTENT, RESONANT_VAULT_GRID) - 1;
    const maxGridZ = floorDiv(maxZ + RESONANT_VAULT_HALF_EXTENT, RESONANT_VAULT_GRID) + 1;
    const found: VaultCandidate[] = [];
    for (let gx = minGridX; gx <= maxGridX; gx += 1) {
        for (let gz = minGridZ; gz <= maxGridZ; gz += 1) {
            const candidate = getVaultCandidateForCell(gx, gz, seed);
            if (candidate.active && resonantVaultTouchesBox(candidate, minX, minZ, maxX, maxZ)) found.push(candidate);
        }
    }
    return found;
}

export function findNearestVaultCandidate(
    x: number,
    z: number,
    seed: number,
    maxDistance = 18000,
    reject?: (candidate: VaultCandidate) => boolean,
): VaultCandidate | null {
    const centerGridX = floorDiv(x, RESONANT_VAULT_GRID);
    const centerGridZ = floorDiv(z, RESONANT_VAULT_GRID);
    const maxRing = Math.ceil(maxDistance / RESONANT_VAULT_GRID) + 1;
    let best: VaultCandidate | null = null;
    let bestDistance = maxDistance;
    for (let ring = 0; ring <= maxRing; ring += 1) {
        for (let dx = -ring; dx <= ring; dx += 1) {
            for (let dz = -ring; dz <= ring; dz += 1) {
                if (ring > 0 && Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
                const candidate = getVaultCandidateForCell(centerGridX + dx, centerGridZ + dz, seed);
                if (!candidate.active || reject?.(candidate)) continue;
                const distance = Math.hypot(candidate.centerX - x, candidate.centerZ - z);
                if (distance < bestDistance) {
                    best = candidate;
                    bestDistance = distance;
                }
            }
        }
        if (best && ring * RESONANT_VAULT_GRID > bestDistance + RESONANT_VAULT_GRID) break;
    }
    return best;
}
