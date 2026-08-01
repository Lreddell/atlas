import { BlockType } from '../../types.ts';
import {
    getVaultEntranceRoute,
    getVaultRoomBounds,
    isVaultRoomLongitudinalAlongX,
    type VaultLayout,
    type VaultRoom,
    type VaultRoutePoint,
} from './resonantVaults.ts';
import { buildVaultPuzzleDescriptor } from './resonantVaultPuzzles.ts';

export interface VaultArchitectureWriter {
    set(x: number, y: number, z: number, type: BlockType, meta?: number, onlyReplace?: ReadonlySet<number>): void;
    get(x: number, y: number, z: number): BlockType | null;
}

export interface VaultArchitectureFeatures {
    ceilingProfile: 'flat' | 'ribbed' | 'vaulted' | 'stepped' | 'broken';
    floorLevels: number;
    landmarks: string[];
    lampOffsets: Array<readonly [number, number, number]>;
    materialBands: string[];
    walkWidth: number;
    maximumRise: number;
    landings: number;
    landingLampInterval: number;
    guardedEdges: boolean;
}

type ArchitectureSpec = Pick<
    VaultArchitectureFeatures,
    'ceilingProfile' | 'floorLevels' | 'landmarks' | 'lampOffsets' | 'materialBands'
>;

const BASE_NAVIGATION = {
    walkWidth: 3,
    maximumRise: 1,
    landings: 0,
    landingLampInterval: 1,
    guardedEdges: true,
} as const;

function completeFeatures(room: VaultRoom, spec: ArchitectureSpec): VaultArchitectureFeatures {
    const variantShift = (room.variant & 1) === 0 ? -1 : 1;
    return {
        ...BASE_NAVIGATION,
        ...spec,
        landmarks: [...spec.landmarks, `${room.id}_variant_${room.variant}`],
        lampOffsets: spec.lampOffsets.map(([x, y, z], index) => (
            [x + (index % 2 === 0 ? variantShift : 0), y, z + (index % 2 === 1 ? variantShift : 0)]
        )),
        landings: room.kind === 'entrance' ? 8 : BASE_NAVIGATION.landings,
    };
}

export function getArchitectureFeatures(room: VaultRoom): VaultArchitectureFeatures {
    switch (room.kind) {
        case 'spire': return completeFeatures(room, { ceilingProfile: 'stepped', floorLevels: 4, landmarks: ['listening_crown', 'ruined_forecourt'], lampOffsets: [[-5, 4, 0], [5, 4, 0], [0, 10, -3], [0, 10, 3]], materialBands: ['weathered_stone', 'chiseled_crown'] });
        case 'entrance': return completeFeatures(room, { ceilingProfile: 'stepped', floorLevels: 8, landmarks: ['processional_switchback', 'threshold_guard'], lampOffsets: [[-5, 3, -4], [5, 3, -4], [-5, 3, 4], [5, 3, 4]], materialBands: ['ashlar', 'stair_trim', 'landing_mosaic'] });
        case 'processional': return completeFeatures(room, { ceilingProfile: 'ribbed', floorLevels: 2, landmarks: ['paired_colonnades', 'arrival_oculus'], lampOffsets: [[-7, 4, -5], [7, 4, -5], [-7, 4, 5], [7, 4, 5]], materialBands: ['brick_bays', 'chiseled_arches', 'mosaic_axis'] });
        case 'tuning_hall': return completeFeatures(room, { ceilingProfile: 'vaulted', floorLevels: 3, landmarks: ['four_resonance_apses', 'listening_dais'], lampOffsets: [[-9, 4, 0], [9, 4, 0], [0, 4, -6], [0, 4, 6]], materialBands: ['stone_apse', 'brick_vault', 'conduit_inlay'] });
        case 'hub': return completeFeatures(room, { ceilingProfile: 'vaulted', floorLevels: 3, landmarks: ['central_bell_dais', 'four_arch_gallery'], lampOffsets: [[-9, 4, -8], [9, 4, -8], [-9, 4, 8], [9, 4, 8]], materialBands: ['octagonal_floor', 'gallery_brick', 'ribbed_crown'] });
        case 'guard_hall': return completeFeatures(room, { ceilingProfile: 'ribbed', floorLevels: 3, landmarks: ['watch_balconies', 'shield_piers'], lampOffsets: [[-8, 4, -6], [8, 4, -6], [-8, 4, 6], [8, 4, 6]], materialBands: ['fortified_base', 'brick_merlons', 'stone_parapet'] });
        case 'resonance_foundry': return completeFeatures(room, { ceilingProfile: 'stepped', floorLevels: 4, landmarks: ['twin_crucibles', 'overhead_gantry'], lampOffsets: [[-8, 5, -5], [8, 5, -5], [-8, 5, 5], [8, 5, 5]], materialBands: ['soot_brick', 'mosaic_channels', 'gantry_slab'] });
        case 'memory_choir': return completeFeatures(room, { ceilingProfile: 'ribbed', floorLevels: 2, landmarks: ['choir_apse', 'four_pylon_daises'], lampOffsets: [[-9, 4, 0], [9, 4, 0], [0, 4, -8], [0, 4, 8]], materialBands: ['apse_stone', 'choir_brick', 'symbol_mosaic'] });
        case 'counterweight_gallery': return completeFeatures(room, { ceilingProfile: 'stepped', floorLevels: 4, landmarks: ['counterweight_towers', 'service_balcony'], lampOffsets: [[-8, 5, -6], [8, 5, -6], [-8, 7, 6], [8, 7, 6]], materialBands: ['tower_ashlar', 'chain_conduit', 'balcony_slab'] });
        case 'acoustic_relay': return completeFeatures(room, { ceilingProfile: 'vaulted', floorLevels: 3, landmarks: ['relay_dishes', 'focusing_ring'], lampOffsets: [[-8, 4, 0], [8, 4, 0], [0, 5, -7], [0, 5, 7]], materialBands: ['radial_mosaic', 'relay_brick', 'chiseled_focus'] });
        case 'broken_crossing': return completeFeatures(room, { ceilingProfile: 'broken', floorLevels: 4, landmarks: ['collapsed_chasm', 'checkpoint_islands'], lampOffsets: [[-10, 5, -6], [0, 6, 6], [10, 5, -6]], materialBands: ['fractured_stone', 'bridge_slab', 'rubble_brick'] });
        case 'bell_crypt': return completeFeatures(room, { ceilingProfile: 'ribbed', floorLevels: 2, landmarks: ['bell_sarcophagi', 'chain_apse'], lampOffsets: [[-7, 3, -6], [7, 3, -6], [-7, 3, 6], [7, 3, 6]], materialBands: ['crypt_ashlar', 'sarcophagus_slab', 'dark_mosaic'] });
        case 'fractured_archive': return completeFeatures(room, { ceilingProfile: 'broken', floorLevels: 3, landmarks: ['collapsed_shelves', 'catalogue_dais'], lampOffsets: [[-8, 4, -6], [8, 4, -6], [-6, 5, 6], [6, 5, 6]], materialBands: ['archive_brick', 'shelf_slab', 'fracture_stone'] });
        case 'inner_works': return completeFeatures(room, { ceilingProfile: 'stepped', floorLevels: 4, landmarks: ['gear_ring', 'service_trenches'], lampOffsets: [[-10, 4, -7], [10, 4, -7], [-10, 4, 7], [10, 4, 7]], materialBands: ['machine_brick', 'conduit_floor', 'service_slab'] });
        case 'antechamber': return completeFeatures(room, { ceilingProfile: 'vaulted', floorLevels: 3, landmarks: ['titan_relief', 'oath_dais'], lampOffsets: [[-7, 4, -5], [7, 4, -5], [-7, 4, 5], [7, 4, 5]], materialBands: ['monumental_ashlar', 'relief_chisel', 'oath_mosaic'] });
        case 'arena': return completeFeatures(room, { ceilingProfile: 'vaulted', floorLevels: 5, landmarks: ['bell_titan_dais', 'stepped_spectator_ring'], lampOffsets: [[-16, 6, -12], [16, 6, -12], [-16, 6, 12], [16, 6, 12], [0, 8, -17], [0, 8, 17]], materialBands: ['arena_mosaic', 'seating_slab', 'monumental_rib'] });
        case 'core': return completeFeatures(room, { ceilingProfile: 'stepped', floorLevels: 4, landmarks: ['resonance_well', 'crown_walk'], lampOffsets: [[-9, 5, -7], [9, 5, -7], [-9, 5, 7], [9, 5, 7]], materialBands: ['core_mosaic', 'crown_brick', 'well_chisel'] });
        case 'grand_ascent': return completeFeatures(room, { ceilingProfile: 'vaulted', floorLevels: 5, landmarks: ['honor_stair', 'safe_supply_alcoves'], lampOffsets: [[-8, 4, -7], [8, 4, -7], [-8, 6, 7], [8, 6, 7]], materialBands: ['formal_stair', 'banner_bay', 'bright_ashlar'] });
        case 'fracture_stair': return completeFeatures(room, { ceilingProfile: 'broken', floorLevels: 6, landmarks: ['hazard_switchbacks', 'fracture_overlook'], lampOffsets: [[-10, 4, -7], [10, 5, -3], [-8, 7, 7], [8, 8, 7]], materialBands: ['broken_stair', 'rubble_parapet', 'warning_mosaic'] });
        case 'outlet_grand': return completeFeatures(room, { ceilingProfile: 'broken', floorLevels: 3, landmarks: ['triumphal_surface_ruin', 'beacon_pair'], lampOffsets: [[-5, 3, -4], [5, 3, -4], [-5, 3, 4], [5, 3, 4]], materialBands: ['weathered_ashlar', 'formal_mosaic'] });
        case 'outlet_fracture': return completeFeatures(room, { ceilingProfile: 'broken', floorLevels: 4, landmarks: ['collapsed_surface_cleft', 'warning_beacon'], lampOffsets: [[-6, 3, -5], [6, 4, -2], [-4, 5, 5], [5, 3, 5]], materialBands: ['fracture_rubble', 'broken_brick'] });
    }
}

function palette(room: VaultRoom, x: number, y: number, z: number): BlockType {
    const pattern = Math.abs(x * 31 + y * 17 + z * 13 + room.variant * 19) % 37;
    if (y === room.y) return pattern % 7 === 0 ? BlockType.ECHO_MOSAIC : BlockType.ECHO_BRICKS;
    if (pattern === 0) return BlockType.CRACKED_ECHO_BRICKS;
    if (pattern <= 2) return BlockType.CHISELED_ECHO_STONE;
    return pattern <= 7 ? BlockType.ECHO_STONE : BlockType.ECHO_BRICKS;
}

function paintStructuralEnvelope(writer: VaultArchitectureWriter, room: VaultRoom, features: VaultArchitectureFeatures): void {
    if (room.kind === 'spire') return;
    const bounds = getVaultRoomBounds(room);
    for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
        for (let z = bounds.minZ; z <= bounds.maxZ; z += 1) {
            writer.set(x, bounds.minY - 1, z, BlockType.ECHO_STONE);
            writer.set(x, bounds.maxY + 1, z, BlockType.ECHO_STONE);
            for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
                const shell = x === bounds.minX || x === bounds.maxX
                    || z === bounds.minZ || z === bounds.maxZ
                    || y === bounds.minY || y === bounds.maxY;
                writer.set(x, y, z, shell ? palette(room, x, y, z) : BlockType.AIR);
            }
        }
    }

    // Chamfered masonry masses break the rectangular silhouette without touching
    // the five-wide doorway or central navigation envelopes.
    const cornerDepth = Math.min(3, Math.floor(Math.min(room.width, room.depth) / 6));
    for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
            for (let dx = 1; dx <= cornerDepth; dx += 1) {
                for (let dz = 1; dz <= cornerDepth + 1 - dx; dz += 1) {
                    const x = room.x + sx * (Math.floor(room.width / 2) - dx);
                    const z = room.z + sz * (Math.floor(room.depth / 2) - dz);
                    for (let y = room.y + 1; y <= room.y + Math.min(7, room.height - 2); y += 1) {
                        writer.set(x, y, z, y % 4 === 0 ? BlockType.CHISELED_ECHO_STONE : BlockType.ECHO_BRICKS);
                    }
                }
            }
        }
    }

    for (const [dx, dy, dz] of features.lampOffsets) {
        const x = Math.max(bounds.minX + 2, Math.min(bounds.maxX - 2, room.x + dx));
        const y = Math.max(room.y + 2, Math.min(bounds.maxY - 2, room.y + dy));
        const z = Math.max(bounds.minZ + 2, Math.min(bounds.maxZ - 2, room.z + dz));
        writer.set(x, y - 1, z, BlockType.CHISELED_ECHO_STONE);
        writer.set(x, y, z, BlockType.RESONANT_LAMP, room.variant);
    }
}

function paintPillar(writer: VaultArchitectureWriter, x: number, z: number, floorY: number, height: number, lamp = false): void {
    writer.set(x, floorY, z, BlockType.ECHO_STONE_SLAB);
    for (let y = floorY + 1; y < floorY + height; y += 1) {
        writer.set(x, y, z, y % 4 === 0 ? BlockType.CHISELED_ECHO_STONE : BlockType.ECHO_BRICKS);
    }
    writer.set(x, floorY + height, z, lamp ? BlockType.RESONANT_LAMP : BlockType.ECHO_BRICK_SLAB);
}

function paintArch(writer: VaultArchitectureWriter, room: VaultRoom, alongX: boolean, offset: number, halfSpan = 4): void {
    const y = room.y;
    for (const side of [-halfSpan, halfSpan]) {
        for (let rise = 1; rise <= 5; rise += 1) {
            writer.set(alongX ? room.x + offset : room.x + side, y + rise, alongX ? room.z + side : room.z + offset, BlockType.CHISELED_ECHO_STONE);
        }
    }
    for (let span = -halfSpan; span <= halfSpan; span += 1) {
        const crownDrop = Math.abs(span) === halfSpan ? 0 : Math.abs(span) >= halfSpan - 2 ? 1 : 2;
        writer.set(alongX ? room.x + offset : room.x + span, y + 5 + crownDrop, alongX ? room.z + span : room.z + offset, BlockType.ECHO_BRICK_STAIRS, alongX ? 2 : 0);
    }
}

function paintCeilingRib(writer: VaultArchitectureWriter, room: VaultRoom, alongX: boolean, offset: number): void {
    const bounds = getVaultRoomBounds(room);
    const halfSpan = Math.min(10, Math.floor((alongX ? room.depth : room.width) / 2) - 2);
    for (let cross = -halfSpan; cross <= halfSpan; cross += 1) {
        const drop = Math.max(0, Math.floor(Math.abs(cross) / 4));
        const x = alongX ? room.x + offset : room.x + cross;
        const z = alongX ? room.z + cross : room.z + offset;
        writer.set(x, bounds.maxY - 1 - drop, z, cross % 4 === 0 ? BlockType.ECHO_BRICK_STAIRS : BlockType.CHISELED_ECHO_STONE, alongX ? 3 : 1);
    }
}

function paintBalcony(writer: VaultArchitectureWriter, room: VaultRoom, side: -1 | 1, alongX: boolean, height: number): void {
    // Balconies hug the wall (two rows deep) and stand on wall-mounted corbels,
    // so nothing reads as a floating strip of masonry hanging in the room.
    const bounds = getVaultRoomBounds(room);
    const longMin = (alongX ? bounds.minX : bounds.minZ) + 4;
    const longMax = (alongX ? bounds.maxX : bounds.maxZ) - 4;
    const crossHalf = alongX ? Math.floor(room.depth / 2) : Math.floor(room.width / 2);
    for (let value = longMin; value <= longMax; value += 1) {
        for (const inset of [1, 2]) {
            const cross = side * (crossHalf - inset);
            const x = alongX ? value : room.x + cross;
            const z = alongX ? room.z + cross : value;
            writer.set(x, room.y + height, z, value % 3 === 0 ? BlockType.ECHO_BRICK_SLAB : BlockType.ECHO_STONE_SLAB);
            // Corbels beneath the outer row, every third block: an upside-down
            // stair bracket rooted against the wall face.
            if (inset === 2 && value % 3 === 0) {
                writer.set(x, room.y + height - 1, z, BlockType.ECHO_BRICK_STAIRS, 4 | (alongX ? (side < 0 ? 0 : 1) : (side < 0 ? 2 : 3)));
            }
            if (inset === 1 && value % 4 === 0) writer.set(x, room.y + height + 1, z, BlockType.CHISELED_ECHO_STONE);
        }
    }
}

function paintDais(writer: VaultArchitectureWriter, room: VaultRoom, radius: number, levels: number, centerType: BlockType): void {
    for (let level = 0; level < levels; level += 1) {
        const currentRadius = Math.max(1, radius - level * 2);
        for (let dx = -currentRadius; dx <= currentRadius; dx += 1) {
            for (let dz = -currentRadius; dz <= currentRadius; dz += 1) {
                if (Math.abs(dx) + Math.abs(dz) > currentRadius + Math.floor(currentRadius / 2)) continue;
                const edge = Math.max(Math.abs(dx), Math.abs(dz)) === currentRadius;
                writer.set(room.x + dx, room.y + level, room.z + dz, edge ? BlockType.ECHO_BRICK_STAIRS : BlockType.ECHO_MOSAIC, (dx === -currentRadius ? 2 : dx === currentRadius ? 3 : dz === -currentRadius ? 0 : 1));
            }
        }
    }
    writer.set(room.x, room.y + levels, room.z, centerType, room.variant);
}

function paintWallBays(writer: VaultArchitectureWriter, room: VaultRoom, alongX: boolean, count: number, raised = false): void {
    const bounds = getVaultRoomBounds(room);
    const longHalf = Math.floor((alongX ? room.width : room.depth) / 2) - 4;
    const crossHalf = Math.floor((alongX ? room.depth : room.width) / 2) - 2;
    for (let bay = 0; bay < count; bay += 1) {
        const t = count === 1 ? 0 : bay / (count - 1);
        const long = Math.round(-longHalf + t * longHalf * 2);
        for (const side of [-1, 1]) {
            const x = alongX ? room.x + long : room.x + side * crossHalf;
            const z = alongX ? room.z + side * crossHalf : room.z + long;
            paintPillar(writer, x, z, room.y + (raised ? 2 : 0), Math.min(6, bounds.maxY - room.y - 3), bay % 2 === room.variant % 2);
        }
    }
}

function paintFloorAxis(writer: VaultArchitectureWriter, room: VaultRoom, width: number, type: BlockType = BlockType.ECHO_MOSAIC): void {
    const bounds = getVaultRoomBounds(room);
    const alongX = room.width >= room.depth;
    for (let value = (alongX ? bounds.minX : bounds.minZ) + 2; value <= (alongX ? bounds.maxX : bounds.maxZ) - 2; value += 1) {
        for (let cross = -Math.floor(width / 2); cross <= Math.floor(width / 2); cross += 1) {
            writer.set(alongX ? value : room.x + cross, room.y, alongX ? room.z + cross : value, type, room.variant);
        }
    }
}

function paintProcessional(writer: VaultArchitectureWriter, room: VaultRoom): void {
    paintFloorAxis(writer, room, 3);
    paintWallBays(writer, room, room.width >= room.depth, 5);
    for (const offset of [-6, 0, 6]) paintArch(writer, room, room.width >= room.depth, offset);
}

function paintEntranceChamber(writer: VaultArchitectureWriter, room: VaultRoom): void {
    paintFloorAxis(writer, room, 5);
    paintWallBays(writer, room, room.width >= room.depth, 3);
    for (const offset of [-5, 5]) paintArch(writer, room, room.width >= room.depth, offset, 4);
    paintDaisAt(writer, room.x, room.y, room.z, 3, BlockType.LISTENING_STONE, room.variant);
}

function paintVariantSignature(writer: VaultArchitectureWriter, room: VaultRoom): void {
    const roomAlongX = room.width >= room.depth;
    const alongX = (room.variant & 2) === 0 ? roomAlongX : !roomAlongX;
    const side = (room.variant & 1) === 0 ? -1 : 1;
    paintBalcony(writer, room, side, alongX, 3 + ((room.variant >> 1) & 1));
    const longHalf = Math.floor((alongX ? room.width : room.depth) / 2);
    const offset = side * Math.max(3, Math.floor(longHalf / 2));
    paintArch(writer, room, alongX, offset, Math.min(4, Math.floor((alongX ? room.depth : room.width) / 2) - 3));
}

function paintTuningHall(writer: VaultArchitectureWriter, room: VaultRoom): void {
    paintDais(writer, room, 5, 2, BlockType.LISTENING_STONE);
    for (const [dx, dz] of [[-8, 0], [8, 0], [0, -6], [0, 6]]) {
        paintPillar(writer, room.x + dx, room.z + dz, room.y, 5, true);
        for (let step = 1; step <= 3; step += 1) writer.set(room.x + Math.sign(dx) * step, room.y, room.z + Math.sign(dz) * step, BlockType.PULSE_CONDUIT, room.variant);
    }
    for (const offset of [-8, 0, 8]) paintCeilingRib(writer, room, room.width >= room.depth, offset);
}

function paintHub(writer: VaultArchitectureWriter, room: VaultRoom): void {
    paintDais(writer, room, 7, 3, BlockType.LISTENING_STONE);
    for (const side of [-1, 1] as const) paintBalcony(writer, room, side, true, 5);
    for (const offset of [-10, 0, 10]) paintCeilingRib(writer, room, true, offset);
    for (const offset of [-8, 8]) paintArch(writer, room, false, offset, 5);
}

function paintGuardHall(writer: VaultArchitectureWriter, room: VaultRoom): void {
    const alongX = room.width >= room.depth;
    paintFloorAxis(writer, room, 5);
    paintWallBays(writer, room, alongX, 4, true);
    paintBalcony(writer, room, room.variant % 2 === 0 ? -1 : 1, alongX, 4);
    for (const dx of [-6, 6]) for (const dz of [-5, 5]) paintPillar(writer, room.x + dx, room.z + dz, room.y, 3, false);
    // Formal shield reliefs and opposing floor chevrons make this read as a
    // garrison hall while preserving one uninterrupted navigation field for the
    // guard/marksman formations.
    const bounds = getVaultRoomBounds(room);
    const wallCross = (alongX ? Math.floor(room.depth / 2) : Math.floor(room.width / 2)) - 1;
    for (const long of [-8, 0, 8]) for (const side of [-1, 1]) {
        for (let dy = 2; dy <= 6; dy += 1) {
            const halfWidth = dy === 2 || dy === 6 ? 0 : dy === 3 || dy === 5 ? 1 : 2;
            for (let lateral = -halfWidth; lateral <= halfWidth; lateral += 1) {
                const x = alongX ? room.x + long + lateral : room.x + side * wallCross;
                const z = alongX ? room.z + side * wallCross : room.z + long + lateral;
                writer.set(x, room.y + dy, z, dy === 4 ? BlockType.ECHO_MOSAIC : BlockType.CHISELED_ECHO_STONE, side < 0 ? 1 : 3);
            }
        }
    }
    const longMin = (alongX ? bounds.minX : bounds.minZ) + 5;
    const longMax = (alongX ? bounds.maxX : bounds.maxZ) - 5;
    for (let value = longMin; value <= longMax; value += 4) {
        const direction = ((value - longMin) / 4 + room.variant) % 2 === 0 ? -1 : 1;
        for (let wing = 2; wing <= 4; wing += 1) {
            const x = alongX ? value + direction * (wing - 2) : room.x + direction * wing;
            const z = alongX ? room.z + direction * wing : value + direction * (wing - 2);
            writer.set(x, room.y, z, wing === 4 ? BlockType.ECHO_STONE_SLAB : BlockType.ECHO_MOSAIC, direction < 0 ? 1 : 3);
        }
    }
}

function paintFoundry(writer: VaultArchitectureWriter, room: VaultRoom): void {
    const alongX = room.width >= room.depth;
    for (const side of [-1, 1]) {
        const cx = room.x + (alongX ? side * 7 : 0);
        const cz = room.z + (alongX ? 0 : side * 7);
        for (let dx = -3; dx <= 3; dx += 1) for (let dz = -3; dz <= 3; dz += 1) {
            const edge = Math.max(Math.abs(dx), Math.abs(dz)) === 3;
            writer.set(cx + dx, room.y, cz + dz, edge ? BlockType.ECHO_BRICK_STAIRS : BlockType.CHISELED_ECHO_STONE, edge ? (dx < 0 ? 2 : dx > 0 ? 3 : dz < 0 ? 0 : 1) : 0);
        }
        writer.set(cx, room.y + 1, cz, BlockType.CHISELED_ECHO_STONE, room.variant);
    }
    paintBalcony(writer, room, room.variant % 2 === 0 ? -1 : 1, alongX, 6);
    paintFloorAxis(writer, room, 3, BlockType.PULSE_CONDUIT);
}

function paintMemoryChoir(writer: VaultArchitectureWriter, room: VaultRoom): void {
    const puzzle = buildVaultPuzzleDescriptor(room);
    puzzle.responseCells.forEach((cell, index) => {
        paintDaisAt(writer, cell.x, room.y, cell.z, 2, BlockType.RESONANCE_PYLON, index);
        for (let y = room.y + 2; y <= room.y + 6; y += 1) {
            writer.set(cell.x, y, cell.z, BlockType.RESONANCE_PYLON, index);
        }
        writer.set(cell.x, room.y + 7, cell.z, BlockType.RESONANT_LAMP, index);
        // A restrained floor sigil makes each receiver readable even before its
        // cap sounds. The metadata rotates the four motifs without bright paint.
        const [markX, markZ] = index % 2 === 0 ? [1, 0] : [0, 1];
        writer.set(cell.x + markX, room.y + 1, cell.z + markZ, BlockType.CHISELED_ECHO_STONE, index);
        writer.set(cell.x - markX, room.y + 1, cell.z - markZ, BlockType.ECHO_STONE_SLAB, index);
    });
    paintDaisAt(writer, puzzle.activation.x, room.y, puzzle.activation.z, 3, BlockType.RESONANCE_PLATE, room.variant);
    paintDaisAt(writer, puzzle.fallbackControl.x, room.y, puzzle.fallbackControl.z, 1, BlockType.RESONANCE_PLATE, 0x40 | room.variant);
    paintFloorAxis(writer, room, 3, BlockType.PULSE_CONDUIT);
    for (const offset of [-7, 0, 7]) paintCeilingRib(writer, room, room.width >= room.depth, offset);
}

function paintDaisAt(writer: VaultArchitectureWriter, x: number, y: number, z: number, radius: number, center: BlockType, meta = 0): void {
    for (let dx = -radius; dx <= radius; dx += 1) for (let dz = -radius; dz <= radius; dz += 1) {
        writer.set(x + dx, y, z + dz, Math.max(Math.abs(dx), Math.abs(dz)) === radius ? BlockType.ECHO_STONE_SLAB : BlockType.ECHO_MOSAIC);
    }
    writer.set(x, y + 1, z, center, meta);
}

function paintCounterweights(writer: VaultArchitectureWriter, room: VaultRoom): void {
    const alongX = room.width >= room.depth;
    for (const side of [-1, 1]) {
        const x = room.x + (alongX ? side * 8 : 0);
        const z = room.z + (alongX ? 0 : side * 8);
        for (let y = room.y + 1; y <= room.y + 8; y += 1) writer.set(x, y, z, y % 3 === 0 ? BlockType.CHISELED_ECHO_STONE : BlockType.ECHO_BRICKS);
        for (let y = room.y + 9; y <= room.y + Math.min(13, room.height - 3); y += 1) writer.set(x, y, z, BlockType.PULSE_CONDUIT, room.variant);
    }
    // Masonry piers rise to just beneath every stair-bank cell the counterweight
    // deploys onto. Undeployed, the pier line telegraphs the broken mechanism's
    // path; deployed, the stairs land on solid supports instead of floating.
    const puzzle = buildVaultPuzzleDescriptor(room);
    for (const cell of puzzle.responseCells) {
        for (let y = room.y + 1; y < cell.y; y += 1) {
            writer.set(cell.x, y, cell.z, y === cell.y - 1 ? BlockType.CHISELED_ECHO_STONE : BlockType.CRACKED_ECHO_BRICKS);
        }
    }
    // Each brake plate has its own inlaid run to the stair-bank section it
    // raises. The cause-and-effect remains legible from the floor even before a
    // player experiments with the first control.
    puzzle.mechanismControls.forEach((control, index) => {
        const targetIndex = Math.min(
            puzzle.responseCells.length - 1,
            Math.floor(index * puzzle.responseCells.length / puzzle.mechanismControls.length),
        );
        const target = puzzle.responseCells[targetIndex];
        let cx = control.x;
        let cz = control.z;
        for (let step = 0; step < 48 && (cx !== target.x || cz !== target.z); step += 1) {
            if (cx !== target.x) cx += Math.sign(target.x - cx);
            else if (cz !== target.z) cz += Math.sign(target.z - cz);
            writer.set(cx, room.y, cz, BlockType.PULSE_CONDUIT, index);
        }
        // Heavy suspended brake blocks give each circuit an unmistakable
        // physical counterpart without narrowing the central traversal lane.
        const weightY = room.y + 8 + index;
        for (let y = weightY + 1; y <= room.y + Math.min(13, room.height - 3); y += 1) {
            writer.set(control.x, y, control.z, BlockType.PULSE_CONDUIT, index);
        }
        writer.set(control.x, weightY, control.z, BlockType.CHISELED_ECHO_STONE, index);
    });
    paintBalcony(writer, room, room.variant % 2 === 0 ? -1 : 1, alongX, 6);
    paintFloorAxis(writer, room, 3);
}

function paintAcousticRelay(writer: VaultArchitectureWriter, room: VaultRoom): void {
    paintDais(writer, room, 6, 2, BlockType.CHISELED_ECHO_STONE);
    for (let spoke = 0; spoke < 4; spoke += 1) {
        const [dx, dz] = [[1, 0], [0, 1], [-1, 0], [0, -1]][spoke];
        for (let step = 3; step <= 9; step += 1) writer.set(room.x + dx * step, room.y, room.z + dz * step, step % 2 === 0 ? BlockType.PULSE_CONDUIT : BlockType.ECHO_MOSAIC, spoke);
        paintPillar(writer, room.x + dx * 9, room.z + dz * 9, room.y, 4 + (spoke % 2), true);
    }
}

function paintBrokenCrossing(writer: VaultArchitectureWriter, room: VaultRoom): void {
    const alongX = isVaultRoomLongitudinalAlongX(room);
    const bounds = getVaultRoomBounds(room);
    const longMin = (alongX ? bounds.minX : bounds.minZ) + 3;
    const longMax = (alongX ? bounds.maxX : bounds.maxZ) - 3;
    for (let value = longMin; value <= longMax; value += 1) {
        for (let cross = -1; cross <= 1; cross += 1) {
            const x = alongX ? value : room.x + cross;
            const z = alongX ? room.z + cross : value;
            writer.set(x, room.y, z, value % 5 === 0 ? BlockType.ECHO_STONE_SLAB : BlockType.ECHO_BRICK_SLAB);
            for (let y = room.y + 1; y <= room.y + 4; y += 1) writer.set(x, y, z, BlockType.AIR);
        }
        if ((value - longMin) % 7 === 0) {
            const side = ((value + room.variant) & 1) === 0 ? -1 : 1;
            paintPillar(writer, alongX ? value : room.x + side * 5, alongX ? room.z + side * 5 : value, room.y, 3, true);
        }
    }
    paintRubble(writer, room, room.variant % 2 === 0 ? -1 : 1);
}

function paintCrypt(writer: VaultArchitectureWriter, room: VaultRoom): void {
    // Biers line the crypt walls; the whole centre stays open so the Tollkeeper
    // can actually stride and swing (its footprint could not path between the
    // old mid-floor biers, which left it stuck in place).
    const alongX = room.width >= room.depth;
    const wallCross = (alongX ? Math.floor(room.depth / 2) : Math.floor(room.width / 2)) - 3;
    for (const dLong of [-7, 0, 7]) for (const side of [-1, 1]) {
        const cx = room.x + (alongX ? dLong : side * wallCross);
        const cz = room.z + (alongX ? side * wallCross : dLong);
        for (let a = -2; a <= 2; a += 1) for (let b = -1; b <= 1; b += 1) {
            writer.set(cx + (alongX ? a : b), room.y + 1, cz + (alongX ? b : a), BlockType.ECHO_BRICK_SLAB, 1);
        }
        writer.set(cx, room.y + 2, cz, BlockType.CHISELED_ECHO_STONE);
    }
    for (const offset of [-6, 0, 6]) paintCeilingRib(writer, room, room.width >= room.depth, offset);
}

function paintArchive(writer: VaultArchitectureWriter, room: VaultRoom): void {
    const alongX = room.width >= room.depth;
    for (const aisle of [-7, -3, 3, 7]) {
        for (let value = -7; value <= 7; value += 1) {
            const x = alongX ? room.x + value : room.x + aisle;
            const z = alongX ? room.z + aisle : room.z + value;
            const broken = Math.abs((value * 7 + aisle * 3 + room.variant) % 11) <= 1;
            if (!broken) for (let y = room.y + 1; y <= room.y + 4; y += 1) writer.set(x, y, z, y % 2 === 0 ? BlockType.ECHO_BRICK_SLAB : BlockType.ECHO_BRICKS);
        }
    }
    paintDaisAt(writer, room.x, room.y, room.z, 3, BlockType.CHISELED_ECHO_STONE, room.variant);
}

function paintInnerWorks(writer: VaultArchitectureWriter, room: VaultRoom): void {
    paintFloorAxis(writer, room, 5, BlockType.PULSE_CONDUIT);
    for (let index = 0; index < 12; index += 1) {
        const angle = index / 12 * Math.PI * 2;
        const x = room.x + Math.round(Math.cos(angle) * 10);
        const z = room.z + Math.round(Math.sin(angle) * 8);
        paintPillar(writer, x, z, room.y, index % 3 === 0 ? 6 : 3, index % 3 === 0);
    }
    for (const side of [-1, 1] as const) paintBalcony(writer, room, side, true, 5);
}

function paintAntechamber(writer: VaultArchitectureWriter, room: VaultRoom): void {
    paintFloorAxis(writer, room, 5);
    for (const offset of [-7, 0, 7]) paintArch(writer, room, room.width >= room.depth, offset, 4);
    const reliefSide = room.variant % 2 === 0 ? -1 : 1;
    const wallX = room.x + reliefSide * (Math.floor(room.width / 2) - 2);
    for (let dz = -3; dz <= 3; dz += 1) for (let dy = 1; dy <= 7 - Math.abs(dz); dy += 1) writer.set(wallX, room.y + dy, room.z + dz, BlockType.CHISELED_ECHO_STONE);
    paintDais(writer, room, 4, 2, BlockType.CHISELED_ECHO_STONE);
}

function paintArena(writer: VaultArchitectureWriter, room: VaultRoom): void {
    const maxRing = Math.min(Math.floor(room.width / 2), Math.floor(room.depth / 2)) - 3;
    const combatRadius = maxRing - 5;
    // The combat floor is deliberately flat. Concentric masonry bands teach the
    // travelling-ring language before the first toll, while eight radial seams
    // make the later cage lanes readable without filling the arena with props.
    for (let dx = -combatRadius; dx <= combatRadius; dx += 1) {
        for (let dz = -combatRadius; dz <= combatRadius; dz += 1) {
            const radius = Math.hypot(dx, dz);
            if (radius > combatRadius + 0.25) continue;
            const ringBand = [5, 9, 13].some((ring) => Math.abs(radius - ring) < 0.48);
            const radialBand = (Math.abs(dx) <= 1 || Math.abs(dz) <= 1 || Math.abs(Math.abs(dx) - Math.abs(dz)) <= 0.35)
                && radius >= 3.5;
            if (ringBand) writer.set(room.x + dx, room.y, room.z + dz, BlockType.ECHO_MOSAIC);
            else if (radialBand && (Math.abs(dx) + Math.abs(dz)) % 2 === 0) {
                writer.set(room.x + dx, room.y, room.z + dz, BlockType.CHISELED_ECHO_STONE);
            }
        }
    }
    for (let index = 0; index < 12; index += 1) {
        const angle = index / 12 * Math.PI * 2;
        const radius = index % 2 === 0 ? 8 : 13;
        const x = room.x + Math.round(Math.cos(angle) * radius);
        const z = room.z + Math.round(Math.sin(angle) * radius);
        writer.set(x, room.y, z, BlockType.RESONANT_LAMP, (room.variant + index) % 4);
    }
    for (let ring = maxRing; ring >= maxRing - 5; ring -= 1) {
        const level = Math.floor((maxRing - ring) / 2) + 1;
        for (let dx = -ring; dx <= ring; dx += 1) for (let dz = -ring; dz <= ring; dz += 1) {
            if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
            writer.set(room.x + dx, room.y + level, room.z + dz, (ring + dx + dz) % 3 === 0 ? BlockType.ECHO_BRICK_STAIRS : BlockType.ECHO_STONE_SLAB, dx === -ring ? 2 : dx === ring ? 3 : dz === -ring ? 0 : 1);
        }
    }
    // Four processional aisles keep the spectator terraces from becoming an
    // accidental retaining wall around the combat floor.
    for (let distance = maxRing - 5; distance <= maxRing; distance += 1) {
        for (let width = -2; width <= 2; width += 1) {
            for (const side of [-1, 1]) {
                for (const [x, z] of [
                    [room.x + width, room.z + side * distance],
                    [room.x + side * distance, room.z + width],
                ]) {
                    writer.set(x, room.y, z, BlockType.ECHO_MOSAIC);
                    for (let y = room.y + 1; y <= room.y + 5; y += 1) writer.set(x, y, z, BlockType.AIR);
                }
            }
        }
    }
    for (let offset = -16; offset <= 16; offset += 8) paintCeilingRib(writer, room, true, offset);
}

function paintCore(writer: VaultArchitectureWriter, room: VaultRoom): void {
    paintDais(writer, room, 8, 4, BlockType.SENTINEL_CORE);
    for (let index = 0; index < 8; index += 1) {
        const angle = index / 8 * Math.PI * 2;
        paintPillar(writer, room.x + Math.round(Math.cos(angle) * 10), room.z + Math.round(Math.sin(angle) * 8), room.y, 5, index % 2 === 0);
    }
    paintBalcony(writer, room, room.variant % 2 === 0 ? -1 : 1, true, 6);
}

function paintAscent(writer: VaultArchitectureWriter, room: VaultRoom, fractured: boolean): void {
    const alongX = room.width >= room.depth;
    const bounds = getVaultRoomBounds(room);
    paintFloorAxis(writer, room, 5);
    // The real surface course is carved later from terrain-sampled route data.
    // This room used to paint a second staircase through its middle, producing
    // the floating, disconnected steps seen during the grand escape. A broad
    // masonry barricade now closes that false shortcut; the authored side course
    // cuts its own opening through the wall afterward.
    const crossMin = (alongX ? bounds.minZ : bounds.minX) + 3;
    const crossMax = (alongX ? bounds.maxZ : bounds.maxX) - 3;
    for (let cross = crossMin; cross <= crossMax; cross += 1) {
        const x = alongX ? room.x : cross;
        const z = alongX ? cross : room.z;
        const fracturedGap = fractured && (cross + room.variant) % 5 === 0;
        for (let height = 1; height <= (fracturedGap ? 2 : 4); height += 1) {
            writer.set(x, room.y + height, z, fractured && height === 2
                ? BlockType.CRACKED_ECHO_BRICKS
                : BlockType.ECHO_BRICKS);
        }
        writer.set(x, room.y + (fracturedGap ? 3 : 5), z, BlockType.ECHO_STONE_SLAB);
        if ((cross - crossMin) % 7 === 3) {
            writer.set(x, room.y + 3, z, BlockType.RESONANT_LAMP, room.variant);
        }
    }
}

function paintOutlet(writer: VaultArchitectureWriter, room: VaultRoom, fractured: boolean): void {
    paintFloorAxis(writer, room, 5);
    const heights = fractured ? [2, 6, 3, 5] : [6, 8, 8, 6];
    const positions = [[-5, -5], [5, -5], [-5, 5], [5, 5]];
    positions.forEach(([dx, dz], index) => paintPillar(writer, room.x + dx, room.z + dz, room.y, heights[index], index % 2 === 0));
    if (fractured) paintRubble(writer, room, room.variant % 2 === 0 ? -1 : 1);
    else for (const offset of [-5, 5]) paintArch(writer, room, room.width >= room.depth, offset, 4);
}

function paintRubble(writer: VaultArchitectureWriter, room: VaultRoom, side: -1 | 1): void {
    const bounds = getVaultRoomBounds(room);
    const baseX = side < 0 ? bounds.minX + 3 : bounds.maxX - 3;
    for (let dx = -2; dx <= 2; dx += 1) for (let dz = -5; dz <= 5; dz += 2) {
        const height = 1 + Math.abs((dx * 5 + dz * 3 + room.variant) % 3);
        for (let dy = 0; dy < height; dy += 1) writer.set(baseX + dx, room.y + dy, room.z + dz, dy === height - 1 ? BlockType.ECHO_STONE_SLAB : BlockType.CRACKED_ECHO_BRICKS);
    }
}

export function paintVaultRoomArchitecture(writer: VaultArchitectureWriter, room: VaultRoom, _layout: VaultLayout): void {
    const features = getArchitectureFeatures(room);
    paintStructuralEnvelope(writer, room, features);
    if (room.kind !== 'spire') paintVariantSignature(writer, room);
    switch (room.kind) {
        case 'spire': return;
        case 'entrance': paintEntranceChamber(writer, room); return;
        case 'processional': paintProcessional(writer, room); return;
        case 'tuning_hall': paintTuningHall(writer, room); return;
        case 'hub': paintHub(writer, room); return;
        case 'guard_hall': paintGuardHall(writer, room); return;
        case 'resonance_foundry': paintFoundry(writer, room); return;
        case 'memory_choir': paintMemoryChoir(writer, room); return;
        case 'counterweight_gallery': paintCounterweights(writer, room); return;
        case 'acoustic_relay': paintAcousticRelay(writer, room); return;
        case 'broken_crossing': paintBrokenCrossing(writer, room); return;
        case 'bell_crypt': paintCrypt(writer, room); return;
        case 'fractured_archive': paintArchive(writer, room); return;
        case 'inner_works': paintInnerWorks(writer, room); return;
        case 'antechamber': paintAntechamber(writer, room); return;
        case 'arena': paintArena(writer, room); return;
        case 'core': paintCore(writer, room); return;
        case 'grand_ascent': paintAscent(writer, room, false); return;
        case 'fracture_stair': paintAscent(writer, room, true); return;
        case 'outlet_grand': paintOutlet(writer, room, false); return;
        case 'outlet_fracture': paintOutlet(writer, room, true); return;
    }
}

function stairMeta(previous: VaultRoutePoint, point: VaultRoutePoint): number {
    const dx = point.x - previous.x;
    const dz = point.z - previous.z;
    if (dx > 0) return 3;
    if (dx < 0) return 2;
    if (dz > 0) return 1;
    return 0;
}

function routeDirection(route: VaultRoutePoint[], index: number): { dx: number; dz: number } {
    const previous = route[Math.max(0, index - 1)];
    const point = route[index];
    const next = route[Math.min(route.length - 1, index + 1)];
    // A stair at a corner still belongs to the flight it just climbed. Using a
    // diagonal previous-to-next vector would rotate its three-wide footprint
    // into the lower flight's headroom.
    if (point.y > previous.y) {
        return { dx: Math.sign(point.x - previous.x), dz: Math.sign(point.z - previous.z) };
    }
    if (next.y > point.y) {
        return { dx: Math.sign(next.x - point.x), dz: Math.sign(next.z - point.z) };
    }
    const nextDx = Math.sign(next.x - point.x);
    const nextDz = Math.sign(next.z - point.z);
    if (nextDx !== 0 || nextDz !== 0) return { dx: nextDx, dz: nextDz };
    return { dx: Math.sign(point.x - previous.x), dz: Math.sign(point.z - previous.z) };
}

function paintLanding(writer: VaultArchitectureWriter, point: VaultRoutePoint, direction: { dx: number; dz: number }, variant: number): void {
    const nx = direction.dz;
    const nz = -direction.dx;
    // The switchback's six-cell transverse run is already a three-wide landing.
    // Keep its lamp furniture outside that route instead of laying a raised 5x5
    // pad over the final two stair treads.
    for (const side of [-1, 1]) {
        const x = point.x + nx * side * 3;
        const z = point.z + nz * side * 3;
        writer.set(x, point.y + 1, z, BlockType.CHISELED_ECHO_STONE);
        writer.set(x, point.y + 2, z, BlockType.RESONANT_LAMP, variant);
    }
}

export function paintVaultEntrance(writer: VaultArchitectureWriter, layout: VaultLayout): VaultRoutePoint[] {
    const route = getVaultEntranceRoute(layout);
    const landingYs = new Set<number>();
    for (let index = 0; index < route.length; index += 1) {
        const point = route[index];
        const previous = route[Math.max(0, index - 1)];
        const direction = routeDirection(route, index);
        const normalX = direction.dz;
        const normalZ = -direction.dx;
        const rising = point.y > previous.y;
        for (let cross = -1; cross <= 1; cross += 1) {
            const x = point.x + normalX * cross;
            const z = point.z + normalZ * cross;
            writer.set(x, point.y - 1, z, BlockType.ECHO_STONE);
            writer.set(x, point.y, z, rising ? BlockType.ECHO_BRICK_STAIRS : BlockType.ECHO_STONE_SLAB, rising ? stairMeta(previous, point) : 0);
            for (let y = point.y + 1; y <= point.y + 5; y += 1) writer.set(x, y, z, BlockType.AIR);
        }
        if (rising) {
            for (const side of [-1, 1]) {
                const x = point.x + normalX * side * 2;
                const z = point.z + normalZ * side * 2;
                writer.set(x, point.y, z, BlockType.ECHO_BRICKS);
                writer.set(x, point.y + 1, z, index % 4 === 0 ? BlockType.CHISELED_ECHO_STONE : BlockType.ECHO_BRICK_SLAB);
            }
        }
        const bottomY = route[0]?.y ?? point.y;
        const twoBack = route[Math.max(0, index - 2)];
        const isLanding = point.y - bottomY >= 8
            && previous.y === point.y
            && twoBack.y < point.y;
        if (isLanding && !landingYs.has(point.y)) {
            landingYs.add(point.y);
            paintLanding(writer, point, direction, layout.orientation);
        }
    }

    const last = route[route.length - 1];
    if (last) {
        const direction = routeDirection(route, route.length - 1);
        for (const side of [-1, 1]) {
            const x = last.x + direction.dz * side * 3;
            const z = last.z - direction.dx * side * 3;
            writer.set(x, last.y + 1, z, BlockType.CHISELED_ECHO_STONE);
            writer.set(x, last.y + 2, z, BlockType.RESONANT_LAMP, layout.orientation);
        }
    }
    return route;
}
