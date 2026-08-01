import {
    getVaultCorridorRoute,
    getVaultEntranceConnectorRoute,
    getVaultEntranceRoute,
    getVaultRoomBounds,
    getVaultShaftCenter,
    type VaultLayout,
    type VaultRoom,
    type VaultRoomBounds,
} from './resonantVaults.ts';
import { getVaultEscapeRoutes } from './resonantVaultEscapes.ts';

const AIR = 0;
const VAULT_SEAL = 85;

export interface VaultLayoutValidation {
    valid: boolean;
    errors: string[];
}

export interface VaultVoxelReader {
    get(x: number, y: number, z: number): number;
}

export interface VaultVoxelValidation extends VaultLayoutValidation {
    reachedRoomIds: Set<string>;
}

export interface VaultReservedBox extends VaultRoomBounds {
    owner: string;
}

export interface VaultChunkCoordinate {
    cx: number;
    cz: number;
}

function overlaps(a: VaultRoomBounds, b: VaultRoomBounds, clearance = 2): boolean {
    return a.minX - clearance <= b.maxX && a.maxX + clearance >= b.minX
        && a.minY - clearance <= b.maxY && a.maxY + clearance >= b.minY
        && a.minZ - clearance <= b.maxZ && a.maxZ + clearance >= b.minZ;
}

function pointBounds(
    points: ReadonlyArray<{ x: number; y: number; z: number }>,
    horizontalPadding: number,
    below: number,
    above: number,
): VaultRoomBounds {
    return {
        minX: Math.min(...points.map(({ x }) => x)) - horizontalPadding,
        maxX: Math.max(...points.map(({ x }) => x)) + horizontalPadding,
        minY: Math.min(...points.map(({ y }) => y)) - below,
        maxY: Math.max(...points.map(({ y }) => y)) + above,
        minZ: Math.min(...points.map(({ z }) => z)) - horizontalPadding,
        maxZ: Math.max(...points.map(({ z }) => z)) + horizontalPadding,
    };
}

export function validateVaultLayout(layout: VaultLayout): VaultLayoutValidation {
    const errors: string[] = [];
    const ids = new Set<string>();
    for (const room of layout.rooms) {
        if (ids.has(room.id)) errors.push(`duplicate room id ${room.id}`);
        ids.add(room.id);
        if (room.width < 7 || room.height < 7 || room.depth < 7) errors.push(`room ${room.id} is undersized`);
    }

    const edgeKeys = new Set<string>();
    for (const [from, to] of layout.edges) {
        const key = `${from}>${to}`;
        if (edgeKeys.has(key)) errors.push(`duplicate edge ${key}`);
        edgeKeys.add(key);
        if (!ids.has(from)) errors.push(`edge ${key} missing ${from}`);
        if (!ids.has(to)) errors.push(`edge ${key} missing ${to}`);
    }

    const doorwayKeys = new Set(layout.doorways.map(({ from, to }) => `${from}>${to}`));
    for (const edge of edgeKeys) {
        if (!doorwayKeys.has(edge)) errors.push(`edge ${edge} lacks a doorway`);
    }
    for (const doorway of layout.doorways) {
        const key = `${doorway.from}>${doorway.to}`;
        if (!edgeKeys.has(key)) errors.push(`doorway ${key} lacks an edge`);
        if (doorway.opening.length !== 50) errors.push(`doorway ${key} has ${doorway.opening.length} opening cells`);
        if (doorway.roomOverlap.length !== 2 || doorway.corridorOverlap.length !== 2) {
            errors.push(`doorway ${key} lacks overlap ownership`);
        }
    }

    const underground = layout.rooms.filter(({ kind }) => ![
        'spire',
        'outlet_grand',
        'outlet_fracture',
    ].includes(kind));
    for (let left = 0; left < layout.rooms.length; left += 1) {
        for (let right = left + 1; right < layout.rooms.length; right += 1) {
            const a = layout.rooms[left];
            const b = layout.rooms[right];
            if (overlaps(getVaultRoomBounds(a), getVaultRoomBounds(b))) {
                errors.push(`room overlap ${a.id}/${b.id}`);
            }
        }
    }

    const byId = new Map(layout.rooms.map((room) => [room.id, room]));
    for (const [fromId, toId] of layout.edges) {
        const from = byId.get(fromId);
        const to = byId.get(toId);
        if (!from || !to) continue;
        const crossed = new Set<string>();
        for (const point of getVaultCorridorRoute(from, to).slice(1, -1)) {
            const corridorEnvelope = {
                minX: point.x - 4,
                maxX: point.x + 4,
                minY: point.y - 2,
                maxY: point.y + 8,
                minZ: point.z - 4,
                maxZ: point.z + 4,
            };
            for (const room of layout.rooms) {
                if (room.id === fromId || room.id === toId || crossed.has(room.id)) continue;
                const bounds = getVaultRoomBounds(room);
                if (overlaps(corridorEnvelope, bounds)) {
                    crossed.add(room.id);
                    errors.push(`route ${fromId}>${toId} crosses ${room.id}`);
                }
            }
        }
    }

    const validateEntrancePath = (owner: string, route: ReadonlyArray<{ x: number; y: number; z: number }>, padding: number): void => {
        const crossed = new Set<string>();
        for (const point of route) {
            for (const room of underground) {
                if (room.id === 'entrance' || crossed.has(room.id)) continue;
                const bounds = getVaultRoomBounds(room);
                if (point.x >= bounds.minX - padding && point.x <= bounds.maxX + padding
                    && point.y >= bounds.minY && point.y <= bounds.maxY
                    && point.z >= bounds.minZ - padding && point.z <= bounds.maxZ + padding) {
                    crossed.add(room.id);
                    errors.push(`${owner} crosses ${room.id}`);
                }
            }
        }
    };
    validateEntrancePath('entrance stair', getVaultEntranceRoute(layout), 2);
    validateEntrancePath('entrance connector', getVaultEntranceConnectorRoute(layout), 4);

    return { valid: errors.length === 0, errors };
}

export function getVaultReservedBoxes(layout: VaultLayout): VaultReservedBox[] {
    const byId = new Map(layout.rooms.map((room) => [room.id, room]));
    const roomBoxes = layout.rooms.map((room) => ({
        ...getVaultRoomBounds(room),
        minY: getVaultRoomBounds(room).minY - 1,
        maxY: getVaultRoomBounds(room).maxY + 1,
        owner: `room:${room.id}`,
    }));
    const routeBoxes = layout.edges.map(([fromId, toId]) => {
        const from = byId.get(fromId);
        const to = byId.get(toId);
        if (!from || !to) throw new Error(`Cannot reserve missing vault route ${fromId}>${toId}`);
        return {
            ...pointBounds(getVaultCorridorRoute(from, to), 4, 2, 8),
            owner: `route:${fromId}>${toId}`,
        };
    });
    const shaft = getVaultShaftCenter(layout);
    const entrance = byId.get('entrance');
    if (!entrance) throw new Error('Cannot reserve a vault without its entrance');
    const shaftBox: VaultReservedBox = {
        minX: shaft.x - 8,
        maxX: shaft.x + 8,
        minY: entrance.y - 1,
        maxY: layout.surfaceY + 26,
        minZ: shaft.z - 8,
        maxZ: shaft.z + 8,
        owner: 'shaft',
    };
    const entranceConnectorBox: VaultReservedBox = {
        ...pointBounds(getVaultEntranceConnectorRoute(layout), 4, 2, 8),
        owner: 'route:shaft>entrance',
    };
    const escapes = getVaultEscapeRoutes(layout);
    const outletBoxes: VaultReservedBox[] = ([escapes.grand, escapes.fracture]).map((route) => ({
        ...route.protectedOutlet,
        owner: `outlet:${route.route}`,
    }));
    return [...roomBoxes, ...routeBoxes, shaftBox, entranceConnectorBox, ...outletBoxes];
}

export function getVaultFootprintChunks(layout: VaultLayout, chunkSize = 16): VaultChunkCoordinate[] {
    const coordinates = new Map<string, VaultChunkCoordinate>();
    for (const box of getVaultReservedBoxes(layout)) {
        const minCx = Math.floor(box.minX / chunkSize);
        const maxCx = Math.floor(box.maxX / chunkSize);
        const minCz = Math.floor(box.minZ / chunkSize);
        const maxCz = Math.floor(box.maxZ / chunkSize);
        for (let cx = minCx; cx <= maxCx; cx += 1) {
            for (let cz = minCz; cz <= maxCz; cz += 1) coordinates.set(`${cx},${cz}`, { cx, cz });
        }
    }
    return [...coordinates.values()].sort((a, b) => a.cx - b.cx || a.cz - b.cz);
}

export function getVaultLayoutSignature(layout: VaultLayout): string {
    const payload = JSON.stringify({
        version: 1,
        rooms: layout.rooms.map(({ id, kind, x, y, z, width, height, depth, variant }) => (
            [id, kind, x, y, z, width, height, depth, variant]
        )),
        edges: layout.edges,
        outlets: [layout.surfaceOutlets.grand, layout.surfaceOutlets.fracture].map((outlet) => (
            [outlet.room, outlet.x, outlet.z, outlet.surfaceY, outlet.floorY]
        )),
    });
    let hash = 0x811c9dc5;
    for (let index = 0; index < payload.length; index += 1) {
        hash ^= payload.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return `v1:${(hash >>> 0).toString(36)}`;
}

function key(x: number, y: number, z: number): string {
    return `${x},${y},${z}`;
}

function findRoomAnchor(
    room: VaultRoom,
    canStand: (x: number, y: number, z: number) => boolean,
): { x: number; y: number; z: number } | null {
    const bounds = getVaultRoomBounds(room);
    const maxRadius = Math.max(Math.floor(room.width / 2), Math.floor(room.depth / 2));
    for (let radius = 0; radius <= maxRadius; radius += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
            for (let dz = -radius; dz <= radius; dz += 1) {
                if (Math.max(Math.abs(dx), Math.abs(dz)) !== radius) continue;
                const x = room.x + dx;
                const z = room.z + dz;
                if (x <= bounds.minX || x >= bounds.maxX || z <= bounds.minZ || z >= bounds.maxZ) continue;
                for (let y = room.y + 1; y <= Math.min(room.y + 5, bounds.maxY - 2); y += 1) {
                    if (canStand(x, y, z)) return { x, y, z };
                }
            }
        }
    }
    return null;
}

export function validatePaintedVault(layout: VaultLayout, reader: VaultVoxelReader): VaultVoxelValidation {
    const errors = [...validateVaultLayout(layout).errors];
    const ownedGateCells = new Set(
        layout.doorways
            .filter(({ gate }) => gate)
            .flatMap(({ opening }) => opening.slice(25))
            .map(({ x, y, z }) => key(x, y, z)),
    );
    const passable = (x: number, y: number, z: number): boolean => {
        const type = reader.get(x, y, z);
        return type === AIR || (type === VAULT_SEAL && ownedGateCells.has(key(x, y, z)));
    };
    const canStand = (x: number, y: number, z: number): boolean => {
        if (passable(x, y - 1, z)) return false;
        for (let dy = 0; dy < 3; dy += 1) {
            if (!passable(x, y + dy, z)) return false;
        }
        return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => {
            if (passable(x + dx, y - 1, z + dz)) return false;
            for (let dy = 0; dy < 3; dy += 1) {
                if (!passable(x + dx, y + dy, z + dz)) return false;
            }
            return true;
        });
    };

    const entrance = layout.rooms.find(({ id }) => id === 'entrance');
    const start = entrance ? findRoomAnchor(entrance, canStand) : null;
    if (!entrance) errors.push('missing entrance room');
    if (entrance && !start) errors.push('entrance has no standable anchor');
    if (!start) return { valid: false, errors, reachedRoomIds: new Set() };

    const reservations = getVaultReservedBoxes(layout);
    const minX = Math.min(...reservations.map(({ minX: value }) => value)) - 2;
    const maxX = Math.max(...reservations.map(({ maxX: value }) => value)) + 2;
    const minY = Math.min(...reservations.map(({ minY: value }) => value)) - 2;
    const maxY = Math.max(...reservations.map(({ maxY: value }) => value)) + 2;
    const minZ = Math.min(...reservations.map(({ minZ: value }) => value)) - 2;
    const maxZ = Math.max(...reservations.map(({ maxZ: value }) => value)) + 2;
    const queue = [start];
    const visited = new Set([key(start.x, start.y, start.z)]);
    let head = 0;
    while (head < queue.length) {
        const point = queue[head++];
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            let advanced = false;
            for (const dy of [0, 1, -1]) {
                const x = point.x + dx;
                const y = point.y + dy;
                const z = point.z + dz;
                if (x < minX || x > maxX || y < minY || y > maxY || z < minZ || z > maxZ) continue;
                const nextKey = key(x, y, z);
                if (visited.has(nextKey) || !canStand(x, y, z)) continue;
                visited.add(nextKey);
                queue.push({ x, y, z });
                advanced = true;
                break;
            }
            if (advanced) continue;
            // The Fracture Stair contains authored three-cell gaps. Validate the
            // same four-block running jump the player can make, while requiring
            // the entire raised body arc to remain clear so walls and gates can
            // never be bypassed by this connectivity allowance.
            for (let distance = 2; distance <= 4 && !advanced; distance += 1) {
                for (const dy of [0, 1, -1]) {
                    const x = point.x + dx * distance;
                    const y = point.y + dy;
                    const z = point.z + dz * distance;
                    if (x < minX || x > maxX || y < minY || y > maxY || z < minZ || z > maxZ) continue;
                    const nextKey = key(x, y, z);
                    if (visited.has(nextKey) || !canStand(x, y, z)) continue;
                    let arcClear = true;
                    for (let step = 1; step < distance && arcClear; step += 1) {
                        const arcX = point.x + dx * step;
                        const arcZ = point.z + dz * step;
                        const arcY = Math.max(point.y + 1, Math.round(point.y + dy * step / distance));
                        for (let body = 0; body < 3; body += 1) {
                            if (!passable(arcX, arcY + body, arcZ)) {
                                arcClear = false;
                                break;
                            }
                        }
                    }
                    if (!arcClear) continue;
                    visited.add(nextKey);
                    queue.push({ x, y, z });
                    advanced = true;
                    break;
                }
            }
        }
    }

    const reachedRoomIds = new Set<string>();
    for (const room of layout.rooms) {
        if (room.kind === 'spire') continue;
        const anchor = findRoomAnchor(room, canStand);
        if (!anchor) {
            errors.push(`room ${room.id} has no standable anchor`);
            continue;
        }
        if (visited.has(key(anchor.x, anchor.y, anchor.z))) reachedRoomIds.add(room.id);
        else errors.push(`room ${room.id} is unreachable`);
    }

    for (const [route, outlet] of [
        ['grand', layout.surfaceOutlets.grand],
        ['fracture', layout.surfaceOutlets.fracture],
    ] as const) {
        let reached = false;
        for (let x = outlet.x - outlet.thresholdRadius; x <= outlet.x + outlet.thresholdRadius && !reached; x += 1) {
            for (let z = outlet.z - outlet.thresholdRadius; z <= outlet.z + outlet.thresholdRadius && !reached; z += 1) {
                for (let y = outlet.floorY + 1; y <= outlet.floorY + 3; y += 1) {
                    if (visited.has(key(x, y, z))) {
                        reached = true;
                        break;
                    }
                }
            }
        }
        if (!reached) errors.push(`${route} surface threshold is unreachable`);
    }

    const shaft = getVaultShaftCenter(layout);
    let reachedSurfaceDescent = false;
    for (let x = shaft.x - 4; x <= shaft.x + 4 && !reachedSurfaceDescent; x += 1) {
        for (let z = shaft.z - 4; z <= shaft.z + 4 && !reachedSurfaceDescent; z += 1) {
            for (let y = layout.surfaceY + 1; y <= layout.surfaceY + 5; y += 1) {
                if (visited.has(key(x, y, z))) {
                    reachedSurfaceDescent = true;
                    break;
                }
            }
        }
    }
    if (!reachedSurfaceDescent) errors.push('surface descent is unreachable');

    return { valid: errors.length === 0, errors, reachedRoomIds };
}
