import {
    getVaultCorridorRoute,
    type VaultLayout,
    type VaultRoom,
    type VaultRoutePoint,
} from './resonantVaults.ts';

export type VaultEscapeRoute = 'grand' | 'fracture';
export type VaultEscapeHazardKind = 'spikes' | 'crusher' | 'gap' | 'collapse';

export interface VaultEscapeHazardSlot {
    id: string;
    kind: VaultEscapeHazardKind;
    pathIndex: number;
}

export interface VaultEscapeCheckpoint extends VaultRoutePoint {
    id: string;
    afterHazardId: string;
}

export interface VaultProtectedOutlet {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    minZ: number;
    maxZ: number;
}

export interface VaultEscapeRouteDescriptor {
    route: VaultEscapeRoute;
    path: VaultRoutePoint[];
    pathLength: number;
    width: number;
    combatZones: number;
    requiredHazards: number;
    hazardSlots: VaultEscapeHazardSlot[];
    checkpoints: VaultEscapeCheckpoint[];
    surfaceY: number;
    surfaceLanding: VaultRoutePoint;
    protectedOutlet: VaultProtectedOutlet;
    tradeoff: { length: 'long' | 'short'; pressure: 'guarded' | 'hazardous' };
}

export interface VaultEscapeRoutes {
    grand: VaultEscapeRouteDescriptor;
    fracture: VaultEscapeRouteDescriptor;
}

export interface VaultEscapeBuildInput {
    seed: number;
    vaultBaseY: number;
    grandSurfaceY: number;
    fractureSurfaceY: number;
}

const FRACTURE_SLOT_KINDS = ['spikes', 'crusher', 'gap', 'collapse', 'spikes'] as const;

function pathDistance(path: readonly VaultRoutePoint[]): number {
    let distance = 0;
    for (let index = 1; index < path.length; index += 1) {
        const previous = path[index - 1];
        const point = path[index];
        distance += Math.abs(point.x - previous.x) + Math.abs(point.y - previous.y) + Math.abs(point.z - previous.z);
    }
    return distance;
}

function distributeRise(path: Array<{ x: number; z: number }>, startY: number, endY: number): VaultRoutePoint[] {
    const rise = endY - startY;
    const riseCount = Math.abs(rise);
    const sign = Math.sign(rise);
    const result: VaultRoutePoint[] = [];
    let y = startY;
    let applied = 0;
    for (let index = 0; index < path.length; index += 1) {
        const targetApplied = Math.min(riseCount, Math.floor(index * riseCount / Math.max(1, path.length - 1)));
        if (targetApplied > applied) {
            y += sign;
            applied += 1;
        }
        result.push({ ...path[index], y });
    }
    result[result.length - 1].y = endY;
    return result;
}

function serpentinePath(length: number, segment: number, startY: number, endY: number, side: -1 | 1): VaultRoutePoint[] {
    const horizontal: Array<{ x: number; z: number }> = [{ x: 0, z: 0 }];
    let direction = side;
    while (horizontal.length < length + 1) {
        const run = Math.min(segment, length + 1 - horizontal.length);
        for (let step = 0; step < run; step += 1) {
            const current = horizontal[horizontal.length - 1];
            horizontal.push({ x: current.x + direction, z: current.z });
        }
        if (horizontal.length >= length + 1) break;
        const current = horizontal[horizontal.length - 1];
        horizontal.push({ x: current.x, z: current.z - 1 });
        direction *= -1;
    }
    return distributeRise(horizontal.slice(0, length + 1), startY, endY);
}

function directionAt(path: readonly VaultRoutePoint[], index: number): string {
    const previous = path[Math.max(0, index - 1)];
    const next = path[Math.min(path.length - 1, index + 1)];
    return `${Math.sign(next.x - previous.x)},${Math.sign(next.z - previous.z)}`;
}

function flatSlotIndex(path: readonly VaultRoutePoint[], fraction: number): number {
    const target = Math.max(8, Math.min(path.length - 9, Math.round((path.length - 1) * fraction)));
    for (let offset = 0; offset <= 8; offset += 1) {
        for (const candidate of [target + offset, target - offset]) {
            if (candidate < 8 || candidate > path.length - 9) continue;
            if (directionAt(path, candidate - 2) !== directionAt(path, candidate + 2)) continue;
            if (Math.abs(path[candidate - 2].y - path[candidate + 2].y) > 1) continue;
            return candidate;
        }
    }
    return target;
}

function slotsFor(route: VaultEscapeRoute, path: readonly VaultRoutePoint[]): VaultEscapeHazardSlot[] {
    const kinds = route === 'grand' ? ['crusher', 'crusher'] as const : FRACTURE_SLOT_KINDS;
    return kinds.map((kind, index) => {
        const fraction = route === 'grand' ? [0.34, 0.71][index] : [0.17, 0.34, 0.52, 0.69, 0.84][index];
        return { id: `${route}:${kind}:${index}`, kind, pathIndex: flatSlotIndex(path, fraction) };
    });
}

function protectedOutlet(landing: VaultRoutePoint, surfaceY: number): VaultProtectedOutlet {
    return {
        minX: landing.x - 6,
        maxX: landing.x + 6,
        minY: surfaceY - 8,
        maxY: surfaceY + 8,
        minZ: landing.z - 6,
        maxZ: landing.z + 6,
    };
}

function descriptor(
    route: VaultEscapeRoute,
    path: VaultRoutePoint[],
    surfaceY: number,
): VaultEscapeRouteDescriptor {
    const hazardSlots = slotsFor(route, path);
    const checkpoints = hazardSlots.map((slot, index) => {
        const point = path[Math.min(path.length - 2, slot.pathIndex + 5)];
        return { ...point, id: `${route}:checkpoint:${index}`, afterHazardId: slot.id };
    });
    const surfaceLanding = { ...path[path.length - 1] };
    return {
        route,
        path,
        pathLength: pathDistance(path),
        width: route === 'grand' ? 6 : 5,
        combatZones: route === 'grand' ? 2 : 0,
        requiredHazards: hazardSlots.length,
        hazardSlots,
        checkpoints,
        surfaceY,
        surfaceLanding,
        protectedOutlet: protectedOutlet(surfaceLanding, surfaceY),
        tradeoff: route === 'grand'
            ? { length: 'long', pressure: 'guarded' }
            : { length: 'short', pressure: 'hazardous' },
    };
}

function fixtureRoute(route: VaultEscapeRoute, vaultBaseY: number, surfaceY: number): VaultEscapeRouteDescriptor {
    const startY = vaultBaseY + 5;
    const endY = surfaceY + 1;
    const rise = Math.max(1, endY - startY);
    const length = route === 'grand'
        ? Math.ceil(rise * 2.35 + 90)
        : Math.ceil(rise * 1.12 + 26);
    return descriptor(route, serpentinePath(length, route === 'grand' ? 26 : 18, startY, endY, route === 'grand' ? -1 : 1), surfaceY);
}

export function buildVaultEscapeRoutes(input: VaultEscapeBuildInput): VaultEscapeRoutes {
    return {
        grand: fixtureRoute('grand', input.vaultBaseY, input.grandSurfaceY),
        fracture: fixtureRoute('fracture', input.vaultBaseY, input.fractureSurfaceY),
    };
}

function room(layout: VaultLayout, id: string): VaultRoom {
    const result = layout.rooms.find((candidate) => candidate.id === id);
    if (!result) throw new Error(`Vault ${layout.vaultId} is missing ${id}`);
    return result;
}

function courseTurnIndices(path: ReadonlyArray<{ x: number; z: number }>): number[] {
    const turns: number[] = [];
    for (let index = 1; index < path.length - 1; index += 1) {
        const previous = path[index - 1];
        const point = path[index];
        const next = path[index + 1];
        const enteredAlongX = previous.x !== point.x;
        const exitsAlongX = point.x !== next.x;
        if (enteredAlongX !== exitsAlongX) turns.push(index);
    }
    return turns;
}

function distributeCourseRise(
    route: VaultEscapeRoute,
    horizontal: ReadonlyArray<{ x: number; z: number }>,
    startY: number,
    endY: number,
    fullPathLength = horizontal.length,
): VaultRoutePoint[] {
    const protectedIndices = new Set<number>();
    const hazardFractions = route === 'grand' ? [0.34, 0.71] : [0.17, 0.34, 0.52, 0.69, 0.84];
    for (const fraction of hazardFractions) {
        // Hazard placement is calculated against the complete course, including
        // the flat outlet-room approach. Reserve those exact cells while the
        // underground rise is distributed so a gap never gains an impossible
        // vertical step and a timed obstacle always owns a level platform.
        const center = Math.round((fullPathLength - 1) * fraction);
        for (let offset = -2; offset <= 2; offset += 1) protectedIndices.add(center + offset);
    }
    for (const turn of courseTurnIndices(horizontal)) {
        for (let offset = -1; offset <= 1; offset += 1) protectedIndices.add(turn + offset);
    }
    for (let index = 0; index <= 2; index += 1) {
        protectedIndices.add(index);
        protectedIndices.add(horizontal.length - 1 - index);
    }

    const rise = endY - startY;
    const stepCount = Math.abs(rise);
    const eligible = horizontal
        .map((_, index) => index)
        .filter((index) => index > 0 && !protectedIndices.has(index));
    if (eligible.length < stepCount) {
        throw new Error(`Vault ${route} escape lacks ${stepCount - eligible.length} stair cells`);
    }
    const stepIndices = new Set<number>();
    for (let step = 0; step < stepCount; step += 1) {
        stepIndices.add(eligible[Math.floor((step + 1) * eligible.length / stepCount) - 1]);
    }

    let y = startY;
    const sign = Math.sign(rise);
    return horizontal.map((point, index) => {
        if (stepIndices.has(index)) y += sign;
        return { ...point, y };
    });
}

function actualRoute(layout: VaultLayout, route: VaultEscapeRoute): VaultEscapeRouteDescriptor {
    const ascent = room(layout, route === 'grand' ? 'grand_ascent' : 'fracture_stair');
    const outletRoom = room(layout, route === 'grand' ? 'outlet_grand' : 'outlet_fracture');
    const outlet = layout.surfaceOutlets[route];
    const floorRoute = getVaultCorridorRoute(ascent, outletRoom);
    const horizontal = floorRoute.map(({ x, z }) => ({ x, z }));
    while (horizontal[horizontal.length - 1].x !== outlet.x) {
        const previous = horizontal[horizontal.length - 1];
        horizontal.push({ x: previous.x + Math.sign(outlet.x - previous.x), z: previous.z });
    }
    while (horizontal[horizontal.length - 1].z !== outlet.z) {
        const previous = horizontal[horizontal.length - 1];
        horizontal.push({ x: previous.x, z: previous.z + Math.sign(outlet.z - previous.z) });
    }
    const corridorLength = floorRoute.length;
    const risingCourse = distributeCourseRise(
        route,
        horizontal.slice(0, corridorLength),
        floorRoute[0].y + 1,
        outlet.surfaceY + 1,
        horizontal.length,
    );
    const path = [
        ...risingCourse,
        ...horizontal.slice(corridorLength).map((point) => ({ ...point, y: outlet.surfaceY + 1 })),
    ];
    return descriptor(route, path, outlet.surfaceY);
}

export function getVaultEscapeRoutes(layout: VaultLayout): VaultEscapeRoutes {
    return { grand: actualRoute(layout, 'grand'), fracture: actualRoute(layout, 'fracture') };
}

export function validateSurfaceOutlet(
    route: VaultEscapeRouteDescriptor,
    actualSurfaceY: number,
): { reachesSurface: boolean; openToSky: boolean } {
    return {
        reachesSurface: route.surfaceLanding.y >= actualSurfaceY + 1,
        openToSky: route.protectedOutlet.maxY >= actualSurfaceY + 5
            && route.surfaceLanding.y >= actualSurfaceY + 1,
    };
}
