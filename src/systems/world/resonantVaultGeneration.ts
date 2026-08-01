import '../../data/resonantDefinitions';
import { BLOCKS } from '../../data/blocks';
import { BlockType, type BlockDef } from '../../types';
import { CHUNK_SIZE, MAX_Y, MIN_Y } from '../../constants';
import { index3D } from './worldCoords';
import {
    getRoomPort,
    getTraversalPhaseCells,
    getVaultCandidatesTouchingBox,
    getVaultCorridorRoute,
    getVaultEntranceConnectorRoute,
    getVaultEntranceRoute,
    getVaultLayout,
    getVaultRoomBounds,
    getVaultShaftCenter,
    getVaultSpirePosition,
    rotateVaultOffset,
    vaultHash,
    type VaultCandidate,
    type VaultDoorway,
    type VaultLayout,
    type VaultRoom,
    type VaultRoomKind,
    type VaultRoutePoint,
} from './resonantVaults';
import { paintVaultEntrance, paintVaultRoomArchitecture } from './resonantVaultArchitecture';
import { buildVaultPuzzleDescriptor, getCrossingPitDescriptor } from './resonantVaultPuzzles';
import { encodeVaultCacheMetadata, getVaultCacheDescriptors } from './resonantVaultLoot';
import { getVaultEscapeRoutes, type VaultEscapeRouteDescriptor } from './resonantVaultEscapes';
import { buildVaultHazards, getHazardFloorCells, type VaultHazardDescriptor } from './resonantVaultHazards';

export interface GeneratedChunkData {
    blocks: Uint8Array;
    light: Uint8Array;
    meta: Uint8Array;
}

export interface ResonantGenerationContext {
    seed: number;
    getSurfaceY(x: number, z: number): number;
    getSurfaceBiomeId?(x: number, z: number): string;
    isCandidateAllowed?(candidate: VaultCandidate): boolean;
}

export interface ResonantStructureWriter {
    set(x: number, y: number, z: number, type: BlockType, meta?: number, onlyReplace?: ReadonlySet<number>): void;
    get(x: number, y: number, z: number): BlockType | null;
}

interface ChunkWriter extends ResonantStructureWriter {
    cx: number;
    cz: number;
    worldX: number;
    worldZ: number;
    chunk: GeneratedChunkData;
    changed: Set<number>;
}

const definitions = BLOCKS as Record<number, BlockDef>;
const NATURAL_REPLACEABLE = new Set<number>([
    BlockType.STONE,
    BlockType.DEEPSLATE,
    BlockType.COBBLESTONE,
    BlockType.COBBLED_DEEPSLATE,
    BlockType.DIRT,
    BlockType.GRASS,
    BlockType.SAND,
]);

function makeWriter(cx: number, cz: number, chunk: GeneratedChunkData): ChunkWriter {
    const worldX = cx * CHUNK_SIZE;
    const worldZ = cz * CHUNK_SIZE;
    const changed = new Set<number>();
    const getIndex = (x: number, y: number, z: number): number | null => {
        const lx = x - worldX;
        const lz = z - worldZ;
        if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE || y < MIN_Y || y > MAX_Y) return null;
        return index3D(lx, y, lz);
    };
    return {
        cx,
        cz,
        worldX,
        worldZ,
        chunk,
        changed,
        set(x, y, z, type, metadata = 0, onlyReplace) {
            const index = getIndex(x, y, z);
            if (index === null) return;
            if (onlyReplace && !onlyReplace.has(chunk.blocks[index])) return;
            chunk.blocks[index] = type;
            chunk.meta[index] = metadata & 0xff;
            changed.add(index);
        },
        get(x, y, z) {
            const index = getIndex(x, y, z);
            return index === null ? null : chunk.blocks[index] as BlockType;
        },
    };
}

function routeAlongX(route: VaultRoutePoint[], index: number): boolean {
    const previous = route[Math.max(0, index - 1)];
    const next = route[Math.min(route.length - 1, index + 1)];
    return previous.x !== next.x;
}

function paintCorridorSlice(writer: ResonantStructureWriter, point: VaultRoutePoint, alongX: boolean): void {
    for (let cross = -3; cross <= 3; cross += 1) {
        const x = point.x + (alongX ? 0 : cross);
        const z = point.z + (alongX ? cross : 0);
        writer.set(x, point.y - 1, z, BlockType.ECHO_STONE);
        writer.set(x, point.y, z, cross === 0 ? BlockType.ECHO_MOSAIC : BlockType.ECHO_BRICKS);
        writer.set(x, point.y + 6, z, BlockType.ECHO_BRICKS);
        writer.set(x, point.y + 7, z, BlockType.ECHO_STONE);
        for (let y = point.y + 1; y <= point.y + 5; y += 1) {
            writer.set(x, y, z, Math.abs(cross) === 3 ? BlockType.ECHO_BRICKS : BlockType.AIR);
        }
    }
}

function paintPortalFrame(writer: ResonantStructureWriter, point: VaultRoutePoint, alongX: boolean): void {
    for (let cross = -3; cross <= 3; cross += 1) {
        const x = point.x + (alongX ? 0 : cross);
        const z = point.z + (alongX ? cross : 0);
        writer.set(x, point.y + 5, z, BlockType.CHISELED_ECHO_STONE);
    }
    for (const cross of [-3, 3]) {
        const x = point.x + (alongX ? 0 : cross);
        const z = point.z + (alongX ? cross : 0);
        for (let y = point.y + 1; y <= point.y + 5; y += 1) writer.set(x, y, z, BlockType.CHISELED_ECHO_STONE);
        writer.set(x, point.y + 3, z, BlockType.RESONANT_LAMP);
    }
}

function paintCorridorRib(writer: ResonantStructureWriter, point: VaultRoutePoint, alongX: boolean, lampSide: -1 | 1): void {
    for (let cross = -3; cross <= 3; cross += 1) {
        const x = point.x + (alongX ? 0 : cross);
        const z = point.z + (alongX ? cross : 0);
        writer.set(x, point.y + 6, z, BlockType.CHISELED_ECHO_STONE);
    }
    for (const side of [-3, 3] as const) {
        const x = point.x + (alongX ? 0 : side);
        const z = point.z + (alongX ? side : 0);
        for (let y = point.y + 1; y <= point.y + 5; y += 1) writer.set(x, y, z, BlockType.CHISELED_ECHO_STONE);
        if (side === lampSide * 3) writer.set(x, point.y + 3, z, BlockType.RESONANT_LAMP);
    }
}

function paintTurnLanding(writer: ResonantStructureWriter, point: VaultRoutePoint): void {
    for (let dx = -4; dx <= 4; dx += 1) {
        for (let dz = -4; dz <= 4; dz += 1) {
            const edge = Math.abs(dx) === 4 || Math.abs(dz) === 4;
            const sideOpening = (Math.abs(dx) === 4 && Math.abs(dz) <= 2)
                || (Math.abs(dz) === 4 && Math.abs(dx) <= 2);
            const wall = edge && !sideOpening;
            writer.set(point.x + dx, point.y - 1, point.z + dz, BlockType.ECHO_STONE);
            writer.set(point.x + dx, point.y, point.z + dz, Math.max(Math.abs(dx), Math.abs(dz)) <= 2 ? BlockType.ECHO_MOSAIC : BlockType.ECHO_BRICKS);
            writer.set(point.x + dx, point.y + 6, point.z + dz, edge ? BlockType.CHISELED_ECHO_STONE : BlockType.ECHO_BRICKS);
            for (let y = point.y + 1; y <= point.y + 5; y += 1) {
                writer.set(point.x + dx, y, point.z + dz, wall ? BlockType.ECHO_BRICKS : BlockType.AIR);
            }
        }
    }
    writer.set(point.x + 4, point.y + 3, point.z + 3, BlockType.RESONANT_LAMP);
    writer.set(point.x - 3, point.y + 3, point.z - 4, BlockType.RESONANT_LAMP);
}

function paintCorridorRoute(writer: ResonantStructureWriter, route: VaultRoutePoint[]): void {
    if (route.length === 0) return;
    const flatTurns: VaultRoutePoint[] = [];
    for (let index = 0; index < route.length; index += 1) {
        const alongX = routeAlongX(route, index);
        paintCorridorSlice(writer, route[index], alongX);
        const previousAlongX = index > 0 ? routeAlongX(route, index - 1) : alongX;
        if (previousAlongX !== alongX) {
            const flatTurn = route[index - 1]?.y === route[index].y && route[index + 1]?.y === route[index].y;
            if (flatTurn) flatTurns.push(route[index]);
            else paintCorridorSlice(writer, route[index], previousAlongX);
        }
        if (index > 0 && index < route.length - 1 && index % 8 === 0) {
            paintCorridorRib(writer, route[index], alongX, index % 16 === 0 ? -1 : 1);
        }
    }
    for (const point of flatTurns) paintTurnLanding(writer, point);
    paintPortalFrame(writer, route[0], routeAlongX(route, 0));
    paintPortalFrame(writer, route[route.length - 1], routeAlongX(route, route.length - 1));

}

function paintCorridor(writer: ResonantStructureWriter, from: VaultRoom, to: VaultRoom): void {
    paintCorridorRoute(writer, getVaultCorridorRoute(from, to));
}

export function paintDoorwayOpening(
    writer: ResonantStructureWriter,
    doorway: VaultDoorway,
    gateState: 'open' | 'closed',
): void {
    for (const point of doorway.corridorOverlap) {
        for (let y = point.y + 1; y <= point.y + 5; y += 1) {
            writer.set(point.x, y, point.z, BlockType.AIR);
        }
    }
    doorway.roomOverlap.forEach((point, index) => {
        const corridor = doorway.corridorOverlap[index];
        const dx = Math.sign(point.x - corridor.x);
        const dz = Math.sign(point.z - corridor.z);
        const lateralX = dz === 0 ? 0 : 1;
        const lateralZ = dx === 0 ? 0 : 1;
        for (let depth = 0; depth <= 2; depth += 1) {
            for (let lateral = -2; lateral <= 2; lateral += 1) {
                const x = point.x + dx * depth + lateralX * lateral;
                const z = point.z + dz * depth + lateralZ * lateral;
                for (let y = point.y + 1; y <= point.y + 5; y += 1) writer.set(x, y, z, BlockType.AIR);
            }
        }
    });
    for (const cell of doorway.opening) writer.set(cell.x, cell.y, cell.z, BlockType.AIR);
    if (!doorway.gate || gateState === 'open') return;
    for (const cell of doorway.opening.slice(25)) writer.set(cell.x, cell.y, cell.z, BlockType.VAULT_SEAL);
}

function spireFront(orientation: number): { dx: number; dz: number } {
    if (orientation === 1) return { dx: -1, dz: 0 };
    if (orientation === 2) return { dx: 0, dz: -1 };
    if (orientation === 3) return { dx: 1, dz: 0 };
    return { dx: 0, dz: 1 };
}

export function getVaultShaftStairRoute(layout: VaultLayout): VaultRoutePoint[] {
    return getVaultEntranceRoute(layout);
}

function paintSpireAndShaft(writer: ResonantStructureWriter, layout: VaultLayout, spire: VaultRoom): void {
    const entrance = layout.rooms.find((room) => room.kind === 'entrance')!;
    const surfaceY = layout.surfaceY;
    const sx = spire.x;
    const sz = spire.z;
    const shaft = getVaultShaftCenter(layout);
    const front = spireFront(layout.orientation);

    for (let dx = -7; dx <= 7; dx += 1) {
        for (let dz = -7; dz <= 7; dz += 1) {
            const distance = Math.max(Math.abs(dx), Math.abs(dz));
            if (distance <= 7) writer.set(sx + dx, surfaceY, sz + dz, distance <= 4 ? BlockType.ECHO_MOSAIC : BlockType.ECHO_STONE);
        }
    }

    for (let y = surfaceY + 1; y <= surfaceY + 24; y += 1) {
        const level = y - surfaceY;
        const radius = level < 6 ? 7 : level < 15 ? 5 : level < 21 ? 3 : 2;
        for (let x = sx - radius; x <= sx + radius; x += 1) {
            for (let z = sz - radius; z <= sz + radius; z += 1) {
                const shell = Math.abs(x - sx) === radius || Math.abs(z - sz) === radius;
                if (!shell) {
                    writer.set(x, y, z, BlockType.AIR);
                    continue;
                }
                const relX = x - sx;
                const relZ = z - sz;
                const frontDistance = relX * front.dx + relZ * front.dz;
                const sideDistance = relX * front.dz - relZ * front.dx;
                const doorway = level <= 5 && frontDistance === radius && Math.abs(sideDistance) <= 2;
                writer.set(x, y, z, doorway ? BlockType.AIR : (level % 5 === 0 ? BlockType.CHISELED_ECHO_STONE : BlockType.ECHO_STONE));
            }
        }
        if (level === 6 || level === 14 || level === 21) {
            writer.set(sx + radius, y, sz, BlockType.RESONANT_LAMP);
            writer.set(sx - radius, y, sz, BlockType.RESONANT_LAMP);
            writer.set(sx, y, sz + radius, BlockType.RESONANT_LAMP);
            writer.set(sx, y, sz - radius, BlockType.RESONANT_LAMP);
        }
    }
    writer.set(sx, surfaceY + 24, sz, BlockType.LISTENING_STONE, layout.orientation);

    // Deep slab cornices and corner buttresses give the surface landmark a
    // finished civic silhouette instead of a tapered terrain-generation tower.
    for (const [height, radius] of [[6, 6], [15, 4], [21, 3]] as const) {
        for (let offset = -radius; offset <= radius; offset += 1) {
            for (const [dx, dz] of [[-radius, offset], [radius, offset], [offset, -radius], [offset, radius]] as const) {
                writer.set(sx + dx, surfaceY + height, sz + dz, BlockType.ECHO_STONE_SLAB);
            }
        }
    }
    for (const sideX of [-1, 1]) {
        for (const sideZ of [-1, 1]) {
            const x = sx + sideX * 6;
            const z = sz + sideZ * 6;
            for (let rise = 1; rise <= 5; rise += 1) writer.set(x, surfaceY + rise, z, BlockType.ECHO_BRICKS);
            writer.set(x - sideX, surfaceY + 1, z - sideZ, BlockType.ECHO_BRICK_STAIRS, sideX < 0 ? 2 : 3);
            writer.set(x, surfaceY + 6, z, BlockType.ECHO_BRICK_SLAB);
        }
    }

    // A five-wide lit forecourt makes the intended entrance legible from the
    // landscape and provides a safe threshold before the descent.
    for (let forward = 1; forward <= 12; forward += 1) {
        for (let lateral = -3; lateral <= 3; lateral += 1) {
            const x = sx + front.dx * forward + front.dz * lateral;
            const z = sz + front.dz * forward - front.dx * lateral;
            writer.set(x, surfaceY, z, Math.abs(lateral) === 3 ? BlockType.ECHO_STONE_SLAB : BlockType.ECHO_MOSAIC);
            for (let y = surfaceY + 1; y <= surfaceY + 5; y += 1) writer.set(x, y, z, BlockType.AIR);
        }
        if (forward === 4 || forward === 10) {
            for (const lateral of [-4, 4]) {
                const x = sx + front.dx * forward + front.dz * lateral;
                const z = sz + front.dz * forward - front.dx * lateral;
                writer.set(x, surfaceY + 1, z, BlockType.CHISELED_ECHO_STONE);
                writer.set(x, surfaceY + 2, z, BlockType.RESONANT_LAMP, layout.orientation);
            }
        }
    }

    const shaftBottom = getVaultShaftStairRoute(layout)[0]?.y ?? entrance.y;
    for (let y = shaftBottom; y <= surfaceY + 1; y += 1) {
        for (let dx = -7; dx <= 7; dx += 1) {
            for (let dz = -7; dz <= 7; dz += 1) {
                const edge = Math.abs(dx) >= 7 || Math.abs(dz) >= 7;
                const longitudinal = dx * front.dx + dz * front.dz;
                const lateral = dx * front.dz - dz * front.dx;
                const hallOpening = longitudinal === -7
                    && Math.abs(lateral) <= 2
                    && y > shaftBottom
                    && y <= shaftBottom + 5;
                writer.set(shaft.x + dx, y, shaft.z + dz, edge && !hallOpening ? BlockType.ECHO_STONE : BlockType.AIR);
            }
        }
        if ((y - shaftBottom) % 8 === 4) {
            writer.set(shaft.x + front.dz * 3, y + 2, shaft.z - front.dx * 3, BlockType.RESONANT_LAMP);
        }
    }
    for (let dx = -6; dx <= 6; dx += 1) {
        for (let dz = -6; dz <= 6; dz += 1) writer.set(shaft.x + dx, shaftBottom, shaft.z + dz, BlockType.ECHO_MOSAIC);
    }
}

function addSurfaceCrystalOutcrops(writer: ResonantStructureWriter, candidate: VaultCandidate, context: ResonantGenerationContext): void {
    const spire = getVaultSpirePosition(candidate);
    const positions = [
        [-14, -8], [-9, 14], [13, 10], [16, -6],
        [-19, 4], [5, 19], [20, 4], [2, -19],
    ];
    positions.forEach(([dx, dz], index) => {
        const x = spire.x + dx;
        const z = spire.z + dz;
        const y = context.getSurfaceY(x, z);
        for (let bx = -1; bx <= 1; bx += 1) {
            for (let bz = -1; bz <= 1; bz += 1) writer.set(x + bx, y, z + bz, bx === 0 && bz === 0 ? BlockType.CHISELED_ECHO_STONE : BlockType.ECHO_STONE);
        }
        const height = 2 + (vaultHash(candidate.seed, candidate.gridX + index, candidate.gridZ, 701 + index) % 3);
        for (let dy = 1; dy <= height; dy += 1) writer.set(x, y + dy, z, BlockType.ECHO_CRYSTAL, index & 3);
        if (index % 2 === 0) writer.set(x + 1, y + 1, z, BlockType.ECHO_CRYSTAL, (index + 1) & 3);
    });
}

function paintColumn(
    writer: ResonantStructureWriter,
    x: number,
    z: number,
    floorY: number,
    height: number,
    cap: BlockType = BlockType.CHISELED_ECHO_STONE,
): void {
    for (let y = floorY + 1; y < floorY + height; y += 1) writer.set(x, y, z, BlockType.ECHO_BRICKS);
    writer.set(x, floorY + height, z, cap);
}

function furnishHub(writer: ResonantStructureWriter, room: VaultRoom, layout: VaultLayout): void {
    writer.set(room.x, room.y + 1, room.z, BlockType.LISTENING_STONE);
    writer.set(room.x, room.y, room.z, BlockType.ECHO_MOSAIC);
    const byId = new Map(layout.rooms.map((candidate) => [candidate.id, candidate]));
    const routeMarkers = ['major_0', 'major_2', 'major_4'] as const;
    routeMarkers.forEach((id, index) => {
        const target = byId.get(id)!;
        const port = getRoomPort(room, target);
        const dx = Math.sign(port.x - room.x);
        const dz = Math.sign(port.z - room.z);
        for (let step = 1; step <= 7; step += 1) writer.set(room.x + dx * step, room.y, room.z + dz * step, BlockType.ECHO_MOSAIC, index);
        const markerX = room.x + dx * 8 + (dz !== 0 ? 2 : 0);
        const markerZ = room.z + dz * 8 + (dx !== 0 ? 2 : 0);
        const markerType = index === 0 ? BlockType.CHISELED_ECHO_STONE
            : index === 1 ? BlockType.PULSE_CONDUIT
                : BlockType.ECHO_STONE_SLAB;
        writer.set(markerX, room.y + 1, markerZ, markerType, index);
        writer.set(markerX, room.y + 2, markerZ, BlockType.RESONANT_LAMP, index);
    });
    const crownY = room.y + room.height - 2;
    for (let offset = -8; offset <= 8; offset += 4) {
        for (let span = -10; span <= 10; span += 1) {
            writer.set(room.x + offset, crownY, room.z + span, BlockType.CHISELED_ECHO_STONE);
            writer.set(room.x + span, crownY - 1, room.z + offset, BlockType.ECHO_BRICKS);
        }
    }
}

function paintPuzzlePlatform(
    writer: ResonantStructureWriter,
    point: VaultRoutePoint,
    floorY: number,
    radius: number,
): void {
    for (let dx = -radius; dx <= radius; dx += 1) {
        for (let dz = -radius; dz <= radius; dz += 1) {
            const edge = Math.max(Math.abs(dx), Math.abs(dz)) === radius;
            writer.set(point.x + dx, floorY, point.z + dz, edge ? BlockType.ECHO_BRICK_SLAB : BlockType.ECHO_MOSAIC);
        }
    }
}

function furnishCounterweightPuzzle(writer: ResonantStructureWriter, room: VaultRoom): void {
    const puzzle = buildVaultPuzzleDescriptor(room);
    // Three visibly connected brake plates raise the stair in thirds. This is a
    // mechanism the player can read in the room, not a single switch disguised
    // as a puzzle or an unlabelled decorative tuning-fork target.
    puzzle.mechanismControls.forEach((control, index) => {
        paintPuzzlePlatform(writer, control, room.y, 2);
        writer.set(control.x, control.y, control.z, BlockType.RESONANCE_PLATE, 0x10 | index);
    });
    for (const cell of puzzle.responseCells) writer.set(cell.x, cell.y, cell.z, BlockType.AIR);
    writer.set(puzzle.completion.x, puzzle.completion.y, puzzle.completion.z, BlockType.RESONANCE_PLATE, 0x20 | room.variant);
}

function furnishRelayPuzzle(writer: ResonantStructureWriter, room: VaultRoom): void {
    const puzzle = buildVaultPuzzleDescriptor(room);
    const conduitPath = [puzzle.activation, ...puzzle.responseCells];
    for (let index = 1; index < conduitPath.length; index += 1) {
        let { x, z } = conduitPath[index - 1];
        const target = conduitPath[index];
        while (x !== target.x) {
            x += Math.sign(target.x - x);
            writer.set(x, room.y, z, BlockType.PULSE_CONDUIT, index - 1);
        }
        while (z !== target.z) {
            z += Math.sign(target.z - z);
            writer.set(x, room.y, z, BlockType.PULSE_CONDUIT, index - 1);
        }
    }
    paintPuzzlePlatform(writer, puzzle.activation, room.y, 2);
    writer.set(puzzle.activation.x, puzzle.activation.y, puzzle.activation.z, BlockType.RESONANCE_PLATE, 0x10 | room.variant);
    puzzle.responseCells.forEach((cell, index) => {
        paintPuzzlePlatform(writer, cell, room.y, 2);
        for (let y = room.y + 1; y <= room.y + 5; y += 1) writer.set(cell.x, y, cell.z, BlockType.RESONANCE_PYLON, index);
        writer.set(cell.x, room.y + 6, cell.z, BlockType.RESONANT_LAMP, index);
    });
    writer.set(puzzle.fallbackControl.x, room.y, puzzle.fallbackControl.z, BlockType.ECHO_MOSAIC);
    writer.set(puzzle.fallbackControl.x, puzzle.fallbackControl.y, puzzle.fallbackControl.z, BlockType.RESONANCE_PLATE, 0x40 | room.variant);
}

function furnishBrokenCrossingPuzzle(writer: ResonantStructureWriter, room: VaultRoom, layout: VaultLayout): void {
    const puzzle = buildVaultPuzzleDescriptor(room);
    const pit = getCrossingPitDescriptor(room);
    const bounds = getVaultRoomBounds(room);
    // Remove the complete walk-around apron. Only stages, checkpoint islands,
    // and the timed five-wide center lane are restored below.
    for (let x = bounds.minX + 1; x <= bounds.maxX - 1; x += 1) {
        for (let z = bounds.minZ + 1; z <= bounds.maxZ - 1; z += 1) {
            const pitWall = x <= pit.bounds.minX || x >= pit.bounds.maxX
                || z <= pit.bounds.minZ || z >= pit.bounds.maxZ;
            writer.set(x, room.y, z, BlockType.AIR);
            for (let y = room.y - 1; y >= pit.floorY; y -= 1) {
                writer.set(x, y, z, pitWall ? BlockType.ECHO_BRICKS : y === pit.floorY ? BlockType.ECHO_MOSAIC : BlockType.AIR);
            }
        }
    }
    for (const anchor of pit.spawnAnchors) {
        const lampX = anchor.x < room.x ? pit.bounds.minX : pit.bounds.maxX;
        const lampZ = anchor.z < room.z ? pit.bounds.minZ : pit.bounds.maxZ;
        writer.set(lampX, pit.floorY + 2, lampZ, BlockType.RESONANT_LAMP, room.variant);
    }
    for (const cell of pit.stairCells) writer.set(cell.x, cell.y, cell.z, BlockType.AIR);
    for (const cell of pit.landingCells) writer.set(cell.x, cell.y, cell.z, BlockType.AIR);
    paintPuzzlePlatform(writer, puzzle.activation, room.y, 4);
    paintPuzzlePlatform(writer, puzzle.completion, room.y, 4);
    for (const cell of getTraversalPhaseCells(room, layout.phaseTiming)) {
        writer.set(cell.x, room.y, cell.z, BlockType.PHASE_BLOCK, cell.lane);
    }
    puzzle.responseCells.forEach((cell, index) => {
        paintPuzzlePlatform(writer, cell, room.y, 2);
        writer.set(cell.x, room.y, cell.z, BlockType.PULSE_CONDUIT, index);
        const lampCross = index % 2 === 0 ? -5 : 5;
        const lampX = puzzle.alongX ? cell.x : room.x + lampCross;
        const lampZ = puzzle.alongX ? room.z + lampCross : cell.z;
        writer.set(lampX, room.y, lampZ, BlockType.CHISELED_ECHO_STONE);
        writer.set(lampX, room.y + 1, lampZ, BlockType.RESONANT_LAMP, index);
    });
    writer.set(puzzle.activation.x, puzzle.activation.y, puzzle.activation.z, BlockType.CHISELED_ECHO_STONE, 0x10 | room.variant);
    writer.set(puzzle.completion.x, puzzle.completion.y, puzzle.completion.z, BlockType.ECHO_MOSAIC, 0x20 | room.variant);
    writer.set(puzzle.fallbackControl.x, room.y, puzzle.fallbackControl.z, BlockType.ECHO_MOSAIC);
    writer.set(puzzle.fallbackControl.x, puzzle.fallbackControl.y, puzzle.fallbackControl.z, BlockType.ECHO_STONE_SLAB, 0x40 | room.variant);
}

function furnishAntechamber(writer: ResonantStructureWriter, room: VaultRoom, orientation: number): void {
    for (const offset of [-6, 6]) {
        const position = rotateVaultOffset(offset, 0, orientation);
        writer.set(room.x + position.x, room.y + 1, room.z + position.z, BlockType.CHISELED_ECHO_STONE);
        writer.set(room.x + position.x, room.y + 2, room.z + position.z, BlockType.RESONANT_LAMP);
    }
    const side = rotateVaultOffset(-1, 0, orientation);
    const forward = rotateVaultOffset(0, 1, orientation);
    const wallDistance = (side.x !== 0 ? Math.floor(room.width / 2) : Math.floor(room.depth / 2)) - 1;
    const reliefX = room.x + side.x * wallDistance;
    const reliefZ = room.z + side.z * wallDistance;
    for (let offset = -2; offset <= 2; offset += 1) {
        const height = offset === 0 ? 5 : Math.abs(offset) === 1 ? 4 : 2;
        for (let y = 1; y <= height; y += 1) {
            writer.set(reliefX + forward.x * offset, room.y + y, reliefZ + forward.z * offset, BlockType.CHISELED_ECHO_STONE);
        }
    }
    // paintAntechamber already owns the single raised confirmation plate.
}

function furnishArena(writer: ResonantStructureWriter, room: VaultRoom): void {
    // The full combat disc is deliberately level and empty. The Titan's authored
    // advance and every reinforcement kind share this space, so decorative
    // columns or a raised spawn dais turn directly into AI traps.
    for (let dx = -18; dx <= 18; dx += 1) {
        for (let dz = -18; dz <= 18; dz += 1) {
            const distance = Math.hypot(dx, dz);
            if (distance > 18) continue;
            writer.set(
                room.x + dx,
                room.y,
                room.z + dz,
                distance >= 16.5 ? BlockType.CHISELED_ECHO_STONE : BlockType.ECHO_MOSAIC,
            );
            for (let y = room.y + 1; y <= room.y + 8; y += 1) {
                writer.set(room.x + dx, y, room.z + dz, BlockType.AIR);
            }
        }
    }
    // The exact arena centre is the only boss confirmation control. It remains
    // flush with the walking plane so neither the Titan nor its adds can snag on it.
    writer.set(room.x, room.y, room.z, BlockType.RESONANCE_PLATE, room.variant);
    for (const [radius, count] of [[8, 8], [16, 12]] as const) {
        for (let index = 0; index < count; index += 1) {
            const angle = index / count * Math.PI * 2;
            const dx = Math.round(Math.cos(angle) * radius);
            const dz = Math.round(Math.sin(angle) * radius);
            writer.set(room.x + dx, room.y, room.z + dz, BlockType.RESONANT_LAMP, room.variant);
        }
    }
}

function furnishCore(writer: ResonantStructureWriter, room: VaultRoom): void {
    for (let dx = -3; dx <= 3; dx += 1) {
        for (let dz = -3; dz <= 3; dz += 1) {
            const distance = Math.abs(dx) + Math.abs(dz);
            writer.set(room.x + dx, room.y + (distance <= 1 ? 2 : 1), room.z + dz, distance % 2 === 0 ? BlockType.CHISELED_ECHO_STONE : BlockType.ECHO_MOSAIC);
        }
    }
    // paintCore owns the core at y+4. Never cap it with a lamp: the fork ray must
    // be able to reach it after victory or the reward chest can never unlock.
    writer.set(room.x, room.y + 4, room.z, BlockType.SENTINEL_CORE);
    writer.set(room.x, room.y + 5, room.z, BlockType.AIR);
    writer.set(room.x, room.y + 6, room.z, BlockType.AIR);
    for (const dx of [-5, 5]) {
        for (const dz of [-3, 3]) paintColumn(writer, room.x + dx, room.z + dz, room.y, 4);
    }
}

function furnishOutlet(writer: ResonantStructureWriter, room: VaultRoom, formal: boolean): void {
    const direction = formal ? -1 : 1;
    const pillarHeights = formal ? [5, 3, 2] : [2, 4, 6];
    pillarHeights.forEach((height, index) => {
        const x = room.x + direction * (index * 2 - 2);
        const z = room.z - 4 + index * 4;
        paintColumn(writer, x, z, room.y, height, index === 1 ? BlockType.RESONANT_LAMP : BlockType.CHISELED_ECHO_STONE);
    });
    if (formal) {
        writer.set(room.x + 3, room.y + 1, room.z, BlockType.CHISELED_ECHO_STONE);
        writer.set(room.x + 3, room.y + 2, room.z, BlockType.RESONANT_LAMP);
    } else {
        for (let y = room.y + 1; y <= room.y + 3; y += 1) writer.set(room.x - 3, y, room.z, BlockType.PULSE_CONDUIT, y - room.y);
    }
}

function furnishEscape(writer: ResonantStructureWriter, room: VaultRoom): void {
    const bounds = getVaultRoomBounds(room);
    const alongX = room.width >= room.depth;
    const longMin = (alongX ? bounds.minX : bounds.minZ) + 2;
    const longMax = (alongX ? bounds.maxX : bounds.maxZ) - 2;
    for (let value = longMin; value <= longMax; value += 1) {
        for (let cross = -1; cross <= 1; cross += 1) {
            const x = alongX ? value : room.x + cross;
            const z = alongX ? room.z + cross : value;
            writer.set(x, room.y, z, BlockType.ECHO_MOSAIC);
        }
        if (value % 5 === 0) {
            for (const cross of [-3, 3]) {
                const x = alongX ? value : room.x + cross;
                const z = alongX ? room.z + cross : value;
                writer.set(x, room.y, z, BlockType.ECHO_SPIKES);
            }
        }
    }
    const exitValue = longMax;
    writer.set(alongX ? exitValue : room.x, room.y, alongX ? room.z : exitValue, BlockType.PULSE_CONDUIT);
}

function furnishVault(writer: ResonantStructureWriter, layout: VaultLayout): void {
    for (const room of layout.rooms) {
        if (room.kind === 'hub') furnishHub(writer, room, layout);
        if (room.kind === 'counterweight_gallery') furnishCounterweightPuzzle(writer, room);
        if (room.kind === 'acoustic_relay') furnishRelayPuzzle(writer, room);
        if (room.kind === 'broken_crossing') furnishBrokenCrossingPuzzle(writer, room, layout);
        if (room.kind === 'antechamber') furnishAntechamber(writer, room, layout.orientation);
        if (room.kind === 'arena') furnishArena(writer, room);
        if (room.kind === 'core') furnishCore(writer, room);
        if (room.kind === 'grand_ascent' || room.kind === 'fracture_stair') furnishEscape(writer, room);
        if (room.kind === 'outlet_grand') furnishOutlet(writer, room, true);
        if (room.kind === 'outlet_fracture') furnishOutlet(writer, room, false);
    }
}

function paintCacheSightline(
    writer: ResonantStructureWriter,
    from: VaultRoutePoint,
    to: VaultRoutePoint,
    floorY: number,
): void {
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const steps = Math.max(Math.abs(dx), Math.abs(dz));
    if (steps <= 0) return;
    for (let step = 1; step < steps; step += 1) {
        const x = Math.round(from.x + dx * step / steps);
        const z = Math.round(from.z + dz * step / steps);
        writer.set(x, floorY, z, step % 3 === 0 ? BlockType.CHISELED_ECHO_STONE : BlockType.PULSE_CONDUIT);
    }
}

function paintVaultCaches(writer: ResonantStructureWriter, layout: VaultLayout): void {
    for (const cache of getVaultCacheDescriptors(layout)) {
        const floorY = cache.y - 1;
        writer.set(cache.x, floorY, cache.z, BlockType.ECHO_MOSAIC);
        writer.set(cache.x, cache.y, cache.z, BlockType.CHEST, encodeVaultCacheMetadata(cache.id, cache.rotation));
        writer.set(cache.x, cache.y + 1, cache.z, BlockType.AIR);
        writer.set(cache.x, cache.y + 2, cache.z, BlockType.AIR);
        for (const cell of cache.approach) {
            writer.set(cell.x, floorY, cell.z, BlockType.ECHO_MOSAIC);
            writer.set(cell.x, cell.y, cell.z, BlockType.AIR);
            writer.set(cell.x, cell.y + 1, cell.z, BlockType.AIR);
        }
        if (!cache.teachingTarget) continue;
        paintCacheSightline(writer, cache.approach[cache.approach.length - 1], cache.teachingTarget, floorY);
        if (cache.teachingTarget.kind === 'ranged_target') {
            writer.set(cache.teachingTarget.x, floorY, cache.teachingTarget.z, BlockType.ECHO_MOSAIC);
            writer.set(cache.teachingTarget.x, floorY + 1, cache.teachingTarget.z, BlockType.CHISELED_ECHO_STONE);
            writer.set(cache.teachingTarget.x, floorY + 2, cache.teachingTarget.z, BlockType.PULSE_CONDUIT, 0x20);
            writer.set(cache.teachingTarget.x, floorY + 3, cache.teachingTarget.z, BlockType.RESONANT_LAMP);
        }
    }
}

function paintVaultReadabilityLights(writer: ResonantStructureWriter, layout: VaultLayout): void {
    const bespokeCourseKinds = new Set<VaultRoomKind>([
        'spire', 'broken_crossing', 'grand_ascent', 'fracture_stair',
        'outlet_grand', 'outlet_fracture',
    ]);
    for (const room of layout.rooms) {
        if (bespokeCourseKinds.has(room.kind)) continue;
        // Four recessed floor fixtures lift the playable center while leaving
        // walls, UI, and most masonry dark and restrained. Applying this after
        // furnishing prevents decorative passes from accidentally blacking out
        // the interaction space.
        for (const dx of [-4, 4]) {
            for (const dz of [-4, 4]) {
                writer.set(room.x + dx, room.y, room.z + dz, BlockType.RESONANT_LAMP, room.variant);
            }
        }
    }
}

function paintSurfaceOutletThreshold(
    writer: ResonantStructureWriter,
    layout: VaultLayout,
    room: VaultRoom,
): void {
    const bounds = getVaultRoomBounds(room);
    const dx = room.x - layout.centerX;
    const dz = room.z - layout.centerZ;
    const alongX = Math.abs(dx) >= Math.abs(dz);
    const direction = alongX ? Math.sign(dx) : Math.sign(dz);
    const wallX = alongX ? (direction > 0 ? bounds.maxX : bounds.minX) : room.x;
    const wallZ = alongX ? room.z : (direction > 0 ? bounds.maxZ : bounds.minZ);
    for (let outward = 0; outward <= 3; outward += 1) {
        for (let lateral = -2; lateral <= 2; lateral += 1) {
            const x = wallX + (alongX ? direction * outward : lateral);
            const z = wallZ + (alongX ? lateral : direction * outward);
            writer.set(x, room.y, z, outward === 0 ? BlockType.ECHO_MOSAIC : BlockType.ECHO_STONE);
            for (let y = room.y + 1; y <= room.y + 5; y += 1) writer.set(x, y, z, BlockType.AIR);
        }
    }
}

function escapeDirection(route: VaultEscapeRouteDescriptor, index: number): { dx: number; dz: number; rotation: number } {
    const previous = route.path[Math.max(0, index - 1)];
    const next = route.path[Math.min(route.path.length - 1, index + 1)];
    const dx = Math.abs(next.x - previous.x) >= Math.abs(next.z - previous.z) ? Math.sign(next.x - previous.x || 1) : 0;
    const dz = dx === 0 ? Math.sign(next.z - previous.z || 1) : 0;
    return { dx, dz, rotation: dx !== 0 ? (dx > 0 ? 3 : 2) : (dz > 0 ? 1 : 0) };
}

function paintEscapeWalkingRoute(writer: ResonantStructureWriter, route: VaultEscapeRouteDescriptor): void {
    const walkingCells = new Map<string, {
        x: number;
        z: number;
        floorY: number;
        floorType: BlockType;
        floorMeta: number;
    }>();
    for (let index = 0; index < route.path.length; index += 1) {
        const point = route.path[index];
        const direction = escapeDirection(route, index);
        const next = route.path[Math.min(route.path.length - 1, index + 1)];
        for (let cross = -2; cross <= 2; cross += 1) {
            const x = point.x + direction.dz * cross;
            const z = point.z - direction.dx * cross;
            const floorY = point.y - 1;
            const rising = next.y > point.y;
            const floorType = rising ? BlockType.ECHO_BRICK_STAIRS
                : route.route === 'grand' ? (cross === 0 ? BlockType.ECHO_MOSAIC : BlockType.ECHO_BRICKS)
                    : ((index + cross) % 4 === 0 ? BlockType.ECHO_STONE_SLAB : BlockType.CRACKED_ECHO_BRICKS);
            walkingCells.set(`${x},${z}`, {
                x,
                z,
                floorY,
                floorType,
                floorMeta: rising ? direction.rotation : 0,
            });
        }
    }
    // Author a continuous sealed shell before clearing the shared interior.
    // This keeps caves and aquifers from opening shortcuts into the expedition.
    for (let index = 0; index < route.path.length; index += 1) {
        const point = route.path[index];
        const direction = escapeDirection(route, index);
        const floorY = point.y - 1;
        for (const side of [-3, 3]) {
            const x = point.x + direction.dz * side;
            const z = point.z - direction.dx * side;
            if (walkingCells.has(`${x},${z}`)) continue;
            for (let y = floorY; y <= floorY + 6; y += 1) {
                writer.set(x, y, z, route.route === 'grand' ? BlockType.ECHO_BRICKS : BlockType.CRACKED_ECHO_BRICKS);
            }
        }
        for (let cross = -3; cross <= 3; cross += 1) {
            const x = point.x + direction.dz * cross;
            const z = point.z - direction.dx * cross;
            writer.set(x, floorY + 6, z, route.route === 'grand' ? BlockType.ECHO_BRICKS : BlockType.CRACKED_ECHO_BRICKS);
        }
    }
    // Treat the stair as one swept course. Clearing after the shell prevents a
    // later corner or rising cross-section from stealing headroom or a tread.
    for (const cell of walkingCells.values()) {
        for (let y = cell.floorY + 1; y <= cell.floorY + 5; y += 1) writer.set(cell.x, y, cell.z, BlockType.AIR);
    }
    for (const cell of walkingCells.values()) {
        writer.set(cell.x, cell.floorY - 1, cell.z, BlockType.ECHO_STONE);
        writer.set(cell.x, cell.floorY, cell.z, cell.floorType, cell.floorMeta);
    }

    for (let index = 0; index < route.path.length; index += 1) {
        const point = route.path[index];
        const direction = escapeDirection(route, index);
        for (const side of [-3, 3]) {
            const x = point.x + direction.dz * side;
            const z = point.z - direction.dx * side;
            if (walkingCells.has(`${x},${z}`)) continue;
            writer.set(x, point.y - 1, z, route.route === 'grand' ? BlockType.CHISELED_ECHO_STONE : BlockType.CRACKED_ECHO_BRICKS);
            if (index % (route.route === 'grand' ? 10 : 14) === 5) {
                writer.set(x, point.y + 2, z, BlockType.RESONANT_LAMP, direction.rotation);
            }
        }
    }
}

function paintCrusherFrame(writer: ResonantStructureWriter, hazard: VaultHazardDescriptor): void {
    for (const across of [-3, 3]) {
        const x = Math.floor(hazard.x + hazard.rightX * across);
        const z = Math.floor(hazard.z + hazard.rightZ * across);
        for (let y = Math.floor(hazard.y); y <= Math.floor(hazard.y + 5); y += 1) {
            writer.set(x, y, z, y === Math.floor(hazard.y + 3) ? BlockType.RESONANT_LAMP : BlockType.CHISELED_ECHO_STONE);
        }
    }
    for (let across = -3; across <= 3; across += 1) {
        const x = Math.floor(hazard.x + hazard.rightX * across);
        const z = Math.floor(hazard.z + hazard.rightZ * across);
        writer.set(x, Math.floor(hazard.y + 5), z, BlockType.ECHO_BRICKS);
    }
}

function paintEscapeHazard(writer: ResonantStructureWriter, hazard: VaultHazardDescriptor): void {
    const floorCells = getHazardFloorCells(hazard);
    if (hazard.kind === 'gap') {
        for (const cell of floorCells) {
            for (let depth = 0; depth <= 5; depth += 1) writer.set(cell.x, cell.y - depth, cell.z, BlockType.AIR);
            writer.set(cell.x, cell.y - 6, cell.z, BlockType.CRACKED_ECHO_BRICKS);
        }
        return;
    }
    if (hazard.kind === 'collapse') {
        for (const cell of floorCells) {
            writer.set(cell.x, cell.y - 1, cell.z, BlockType.ECHO_STONE);
            writer.set(cell.x, cell.y, cell.z, BlockType.CRACKED_ECHO_BRICKS);
        }
        return;
    }
    if (hazard.kind === 'spikes') {
        for (const cell of floorCells) writer.set(cell.x, cell.y, cell.z, BlockType.PULSE_CONDUIT, 0x30);
        return;
    }
    paintCrusherFrame(writer, hazard);
}

export function paintVaultEscapeCourses(writer: ResonantStructureWriter, layout: VaultLayout): void {
    const routes = getVaultEscapeRoutes(layout);
    paintEscapeWalkingRoute(writer, routes.grand);
    paintEscapeWalkingRoute(writer, routes.fracture);
    for (const hazard of buildVaultHazards(routes)) paintEscapeHazard(writer, hazard);
    for (const route of [routes.grand, routes.fracture]) {
        route.checkpoints.forEach((checkpoint, checkpointIndex) => {
            writer.set(checkpoint.x, checkpoint.y - 1, checkpoint.z, BlockType.PULSE_CONDUIT);
            const pathIndex = Math.min(
                route.path.length - 1,
                (route.hazardSlots[checkpointIndex]?.pathIndex ?? 0) + 5,
            );
            const direction = escapeDirection(route, pathIndex);
            writer.set(
                checkpoint.x + direction.dz * 3,
                checkpoint.y + 2,
                checkpoint.z - direction.dx * 3,
                BlockType.RESONANT_LAMP,
                direction.rotation,
            );
        });
        const landing = route.surfaceLanding;
        for (let dx = -3; dx <= 3; dx += 1) {
            for (let dz = -3; dz <= 3; dz += 1) {
                const edge = Math.max(Math.abs(dx), Math.abs(dz)) === 3;
                writer.set(landing.x + dx, route.surfaceY, landing.z + dz, edge ? BlockType.ECHO_STONE_SLAB : BlockType.ECHO_MOSAIC);
                for (let y = route.surfaceY + 1; y <= route.surfaceY + 5; y += 1) writer.set(landing.x + dx, y, landing.z + dz, BlockType.AIR);
            }
        }
    }
}

function addNearbyCrystalVeins(writer: ResonantStructureWriter, candidate: VaultCandidate, layout: VaultLayout): void {
    for (let vein = 0; vein < 18; vein += 1) {
        const hx = vaultHash(candidate.seed, candidate.gridX + vein, candidate.gridZ, 401 + vein);
        const hz = vaultHash(candidate.seed, candidate.gridX, candidate.gridZ - vein, 503 + vein);
        const centerX = candidate.centerX + 24 + (hx % 58) * (vein % 2 === 0 ? 1 : -1);
        const centerZ = candidate.centerZ + 24 + (hz % 58) * (vein % 3 === 0 ? 1 : -1);
        const centerY = layout.vaultY + 2 + (vaultHash(candidate.seed, vein, candidate.gridZ, 601) % 24);
        for (let dx = -1; dx <= 1; dx += 1) {
            for (let dy = -1; dy <= 1; dy += 1) {
                for (let dz = -1; dz <= 1; dz += 1) {
                    if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) > 2) continue;
                    writer.set(centerX + dx, centerY + dy, centerZ + dz, BlockType.ECHO_CRYSTAL, vein & 3, NATURAL_REPLACEABLE);
                }
            }
        }
    }
}

export function paintResonantVaultStructure(
    writer: ResonantStructureWriter,
    candidate: VaultCandidate,
    layout: VaultLayout,
    context: ResonantGenerationContext,
): void {
    for (const room of layout.rooms) paintVaultRoomArchitecture(writer, room, layout);
    const byId = new Map(layout.rooms.map((room) => [room.id, room]));
    paintSpireAndShaft(writer, layout, byId.get('spire')!);
    paintCorridorRoute(writer, getVaultEntranceConnectorRoute(layout));
    for (const [from, to] of layout.edges) paintCorridor(writer, byId.get(from)!, byId.get(to)!);
    // Corridors cut through their owning room walls first; furniture and the
    // authored entrance staircase then finish the shared volumes in that order.
    furnishVault(writer, layout);
    // Furniture frames the stair, but the final entrance pass owns its walking
    // volume and landing lamps so no landmark can obstruct the ascent.
    paintVaultEntrance(writer, layout);
    paintSurfaceOutletThreshold(writer, layout, byId.get('outlet_grand')!);
    paintSurfaceOutletThreshold(writer, layout, byId.get('outlet_fracture')!);
    addSurfaceCrystalOutcrops(writer, candidate, context);
    addNearbyCrystalVeins(writer, candidate, layout);
    for (const doorway of layout.doorways) {
        paintDoorwayOpening(writer, doorway, doorway.gate ? 'closed' : 'open');
    }
    // Escape courses own their stair treads and outlet doorways after the
    // generic corridor/gate pass, so the final geometry cannot erase them.
    paintVaultEscapeCourses(writer, layout);
    paintVaultReadabilityLights(writer, layout);
    // The final authored layer keeps caches and their approaches recoverable
    // after every architecture, furniture, stair, and doorway pass.
    paintVaultCaches(writer, layout);
}

function refreshLocalEmission(writer: ChunkWriter): void {
    const queue: number[] = [];
    for (const index of writer.changed) {
        const type = writer.chunk.blocks[index];
        const emission = definitions[type]?.lightLevel ?? 0;
        const sky = writer.chunk.light[index] & 0xf0;
        writer.chunk.light[index] = sky | (emission & 0x0f);
        if (emission > 1) queue.push(index);
    }
    const plane = CHUNK_SIZE * CHUNK_SIZE;
    const offsets = [-1, 1, -CHUNK_SIZE, CHUNK_SIZE, -plane, plane];
    let head = 0;
    while (head < queue.length && queue.length < 18000) {
        const index = queue[head++];
        const level = writer.chunk.light[index] & 0x0f;
        if (level <= 1) continue;
        const x = index % CHUNK_SIZE;
        const yz = Math.floor(index / CHUNK_SIZE);
        const z = yz % CHUNK_SIZE;
        const yIndex = Math.floor(yz / CHUNK_SIZE);
        for (let direction = 0; direction < offsets.length; direction += 1) {
            if (direction === 0 && x === 0) continue;
            if (direction === 1 && x === CHUNK_SIZE - 1) continue;
            if (direction === 2 && z === 0) continue;
            if (direction === 3 && z === CHUNK_SIZE - 1) continue;
            if (direction === 4 && yIndex === 0) continue;
            if (direction === 5 && yIndex === Math.floor(writer.chunk.blocks.length / plane) - 1) continue;
            const next = index + offsets[direction];
            if (next < 0 || next >= writer.chunk.blocks.length) continue;
            const nextType = writer.chunk.blocks[next];
            const def = definitions[nextType];
            if (nextType !== BlockType.AIR && !def?.transparent && !def?.noCollision) continue;
            const nextLevel = level - 1;
            if ((writer.chunk.light[next] & 0x0f) >= nextLevel) continue;
            writer.chunk.light[next] = (writer.chunk.light[next] & 0xf0) | nextLevel;
            queue.push(next);
        }
    }
}

export function applyResonantVaultsToChunk(cx: number, cz: number, chunk: GeneratedChunkData, context: ResonantGenerationContext): GeneratedChunkData {
    const worldX = cx * CHUNK_SIZE;
    const worldZ = cz * CHUNK_SIZE;
    const candidates = getVaultCandidatesTouchingBox(worldX, worldZ, worldX + CHUNK_SIZE - 1, worldZ + CHUNK_SIZE - 1, context.seed);
    if (candidates.length === 0) return chunk;
    const writer = makeWriter(cx, cz, chunk);
    for (const candidate of candidates) {
        if (context.isCandidateAllowed && !context.isCandidateAllowed(candidate)) continue;
        const spire = getVaultSpirePosition(candidate);
        const biomeId = context.getSurfaceBiomeId?.(spire.x, spire.z);
        if (biomeId === 'magnetic_fields' || biomeId === 'ocean' || biomeId === 'deep_ocean') continue;
        const surfaceY = context.getSurfaceY(spire.x, spire.z);
        const layout = getVaultLayout(candidate, surfaceY, context.getSurfaceY);
        paintResonantVaultStructure(writer, candidate, layout, context);
    }
    refreshLocalEmission(writer);
    return chunk;
}
