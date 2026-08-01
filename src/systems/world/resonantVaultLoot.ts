import { BlockType } from '../../types';
import type { ChestState } from './worldTypes';
import type { VaultLayout, VaultRoom, VaultRoutePoint } from './resonantVaults';

export const VAULT_CACHE_FLAG = 0x80;
export const VAULT_CACHE_INDEX_SHIFT = 2;
export const VAULT_CACHE_INDEX_MASK = 0x3c;

export type VaultCacheId =
    | 'tuning'
    | 'armory'
    | 'ranged'
    | 'heavy'
    | 'antechamber'
    | 'core'
    | 'ascent'
    | `annex_${number}`;

export interface VaultCacheEntry {
    slot: number;
    itemId: BlockType;
    count: number;
}

export interface VaultCacheDescriptor extends VaultRoutePoint {
    id: VaultCacheId;
    roomId: string;
    rotation: 0 | 1 | 2 | 3;
    approach: VaultRoutePoint[];
    teachingTarget?: VaultRoutePoint & { kind: 'fork_receiver' | 'ranged_target' };
}

const CACHE_IDS = [
    'tuning',
    'armory',
    'ranged',
    'heavy',
    'antechamber',
    'core',
    'ascent',
    'annex_0',
    'annex_1',
    'annex_2',
] as const satisfies readonly VaultCacheId[];

const CACHE_INDEX = new Map<VaultCacheId, number>(CACHE_IDS.map((id, index) => [id, index]));

function hashText(value: string): number {
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    hash ^= hash >>> 16;
    return hash >>> 0;
}

function seededValue(vaultId: string, cacheId: VaultCacheId, salt: number): number {
    let value = hashText(`${vaultId}|${cacheId}|${salt}`);
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    return (value >>> 0) / 0x1_0000_0000;
}

interface WeightedVaultLoot {
    itemId: BlockType;
    weight: number;
    min: number;
    max: number;
}

const PROVISION_POOL: readonly WeightedVaultLoot[] = [
    { itemId: BlockType.TORCH, weight: 16, min: 8, max: 20 },
    { itemId: BlockType.APPLE, weight: 8, min: 2, max: 6 },
    { itemId: BlockType.BANANA, weight: 7, min: 2, max: 5 },
    { itemId: BlockType.LUMEN_BERRY, weight: 10, min: 3, max: 8 },
    { itemId: BlockType.FORAGERS_BOWL, weight: 4, min: 1, max: 2 },
];

const MASONRY_POOL: readonly WeightedVaultLoot[] = [
    { itemId: BlockType.ECHO_BRICKS, weight: 9, min: 6, max: 18 },
    { itemId: BlockType.CHISELED_ECHO_STONE, weight: 5, min: 4, max: 12 },
    { itemId: BlockType.ECHO_STONE_SLAB, weight: 6, min: 6, max: 16 },
    { itemId: BlockType.ECHO_BRICK_SLAB, weight: 6, min: 6, max: 16 },
];

const ARMORY_POOL: readonly WeightedVaultLoot[] = [
    { itemId: BlockType.VAULT_BOLT, weight: 18, min: 8, max: 22 },
    { itemId: BlockType.IRON_SWORD, weight: 9, min: 1, max: 1 },
    { itemId: BlockType.IRON_PICKAXE, weight: 5, min: 1, max: 1 },
    { itemId: BlockType.IRON_HELMET, weight: 6, min: 1, max: 1 },
    { itemId: BlockType.IRON_CHESTPLATE, weight: 4, min: 1, max: 1 },
    { itemId: BlockType.IRON_LEGGINGS, weight: 5, min: 1, max: 1 },
    { itemId: BlockType.IRON_BOOTS, weight: 6, min: 1, max: 1 },
    { itemId: BlockType.IRON_INGOT, weight: 12, min: 2, max: 7 },
];

const RELIC_POOL: readonly WeightedVaultLoot[] = [
    { itemId: BlockType.ECHO_DUST, weight: 15, min: 2, max: 7 },
    { itemId: BlockType.GOLD_INGOT, weight: 8, min: 1, max: 4 },
    { itemId: BlockType.DIAMOND, weight: 2, min: 1, max: 2 },
    { itemId: BlockType.LUMEN_BERRY, weight: 8, min: 4, max: 10 },
    { itemId: BlockType.CHISELED_ECHO_STONE, weight: 7, min: 5, max: 14 },
    { itemId: BlockType.VAULT_BOLT, weight: 7, min: 6, max: 16 },
];

const FORGE_POOL: readonly WeightedVaultLoot[] = [
    { itemId: BlockType.IRON_INGOT, weight: 14, min: 3, max: 8 },
    { itemId: BlockType.GOLD_INGOT, weight: 5, min: 1, max: 3 },
    { itemId: BlockType.ECHO_DUST, weight: 12, min: 2, max: 6 },
    { itemId: BlockType.VAULT_BOLT, weight: 12, min: 8, max: 20 },
    { itemId: BlockType.CHISELED_ECHO_STONE, weight: 6, min: 4, max: 10 },
];

function pickWeightedLoot(pool: readonly WeightedVaultLoot[], roll: number): WeightedVaultLoot {
    const total = pool.reduce((sum, entry) => sum + entry.weight, 0);
    let cursor = roll * total;
    for (const entry of pool) {
        cursor -= entry.weight;
        if (cursor <= 0) return entry;
    }
    return pool[pool.length - 1];
}

function getLootPools(vaultId: string, cacheId: VaultCacheId): readonly (readonly WeightedVaultLoot[])[] {
    const chooseKit = (
        kits: readonly (readonly (readonly WeightedVaultLoot[])[])[],
        salt: number,
    ): readonly (readonly WeightedVaultLoot[])[] => kits[
        Math.floor(seededValue(vaultId, cacheId, salt) * kits.length) % kits.length
    ];
    if (cacheId === 'tuning') return chooseKit([
        [PROVISION_POOL, MASONRY_POOL],
        [MASONRY_POOL, RELIC_POOL],
    ], 7);
    if (cacheId === 'armory') return chooseKit([
        [ARMORY_POOL, PROVISION_POOL],
        [ARMORY_POOL, FORGE_POOL],
    ], 11);
    if (cacheId === 'ranged') return chooseKit([
        [ARMORY_POOL, PROVISION_POOL, FORGE_POOL],
        [ARMORY_POOL, RELIC_POOL],
    ], 13);
    if (cacheId === 'heavy') return chooseKit([
        [FORGE_POOL, ARMORY_POOL],
        [FORGE_POOL, PROVISION_POOL, RELIC_POOL],
    ], 17);
    if (cacheId === 'core') return [RELIC_POOL, FORGE_POOL, ARMORY_POOL];
    if (cacheId === 'ascent') return chooseKit([
        [PROVISION_POOL, ARMORY_POOL],
        [PROVISION_POOL, FORGE_POOL],
    ], 19);
    if (cacheId.startsWith('annex_')) return chooseKit([
        [RELIC_POOL, PROVISION_POOL],
        [ARMORY_POOL, RELIC_POOL],
        [FORGE_POOL, MASONRY_POOL, RELIC_POOL],
    ], 23);
    return chooseKit([
        [PROVISION_POOL, RELIC_POOL],
        [FORGE_POOL, PROVISION_POOL],
        [MASONRY_POOL, RELIC_POOL, PROVISION_POOL],
    ], 29);
}

function getSeededCacheLoot(vaultId: string, cacheId: VaultCacheId): VaultCacheEntry[] {
    const used = new Set<number>();
    const slots = [4, 10, 16, 22, 2, 6, 20, 24, 0, 8, 18, 26];
    const slot = (salt: number): number => {
        const start = Math.floor(seededValue(vaultId, cacheId, salt) * slots.length);
        for (let index = 0; index < slots.length; index += 1) {
            const candidate = slots[(start + index) % slots.length];
            if (!used.has(candidate)) {
                used.add(candidate);
                return candidate;
            }
        }
        return 0;
    };
    const pools = getLootPools(vaultId, cacheId);
    const rolls = 5 + Math.floor(seededValue(vaultId, cacheId, 41) * 3);
    const selected = new Map<BlockType, number>();
    for (let index = 0; index < rolls; index += 1) {
        const pool = pools[index % pools.length];
        const picked = pickWeightedLoot(pool, seededValue(vaultId, cacheId, 100 + index * 11));
        const count = picked.min + Math.floor(seededValue(vaultId, cacheId, 105 + index * 11) * (picked.max - picked.min + 1));
        selected.set(picked.itemId, picked.max === 1 ? 1 : (selected.get(picked.itemId) ?? 0) + count);
    }
    return [...selected.entries()].map(([itemId, count], index) => ({
        slot: slot(201 + index * 7),
        itemId,
        count,
    }));
}

function mergeCacheEntries(primary: VaultCacheEntry[], supplies: VaultCacheEntry[]): VaultCacheEntry[] {
    const occupied = new Set(primary.map(({ slot }) => slot));
    return [
        ...primary,
        ...supplies.filter(({ slot }) => !occupied.has(slot)),
    ];
}

export function getVaultCacheLoot(vaultId: string, cacheId: VaultCacheId, firstClear: boolean): VaultCacheEntry[] {
    const supplies = getSeededCacheLoot(vaultId, cacheId);
    if (cacheId === 'tuning') {
        return mergeCacheEntries([{ slot: 13, itemId: BlockType.ECHO_TUNING_FORK, count: 1 }], supplies);
    }
    if (cacheId === 'armory') {
        return mergeCacheEntries([{ slot: 13, itemId: BlockType.VAULTSTEEL_SPEAR, count: 1 }], supplies);
    }
    if (cacheId === 'ranged') {
        return mergeCacheEntries([
            { slot: 12, itemId: BlockType.VAULT_CROSSBOW, count: 1 },
            { slot: 14, itemId: BlockType.VAULT_BOLT, count: 24 },
        ], supplies);
    }
    if (cacheId === 'heavy') {
        return mergeCacheEntries([{ slot: 13, itemId: BlockType.BELLBREAKER_MAUL, count: 1 }], supplies);
    }
    if (cacheId === 'core') {
        // The claimed Echo Core is delivered here (the claim itself spawns no
        // drops), so a repeat clear still pays out and a first clear cannot
        // double-collect core rewards.
        const rewards: VaultCacheEntry[] = [
            { slot: 11, itemId: BlockType.ECHO_CORE, count: 1 },
            { slot: 15, itemId: BlockType.ECHO_DUST, count: firstClear ? 8 : 5 },
        ];
        return mergeCacheEntries(rewards, supplies);
    }
    return supplies;
}

export function encodeVaultCacheMetadata(cacheId: VaultCacheId, rotation: number): number {
    const index = CACHE_INDEX.get(cacheId);
    if (index === undefined || index > 0x0f) throw new Error(`Unsupported vault cache id: ${cacheId}`);
    return VAULT_CACHE_FLAG | ((index << VAULT_CACHE_INDEX_SHIFT) & VAULT_CACHE_INDEX_MASK) | (rotation & 0x3);
}

export function decodeVaultCacheMetadata(metadata: number): { cacheId: VaultCacheId; rotation: number } | null {
    if ((metadata & VAULT_CACHE_FLAG) === 0) return null;
    const index = (metadata & VAULT_CACHE_INDEX_MASK) >> VAULT_CACHE_INDEX_SHIFT;
    const cacheId = CACHE_IDS[index];
    return cacheId ? { cacheId, rotation: metadata & 0x3 } : null;
}

export function seedVaultCache(chest: ChestState, entries: readonly VaultCacheEntry[]): number {
    let seeded = 0;
    for (const entry of entries) {
        if (!Number.isInteger(entry.slot) || entry.slot < 0 || entry.slot >= chest.items.length) continue;
        if (!Number.isFinite(entry.count) || entry.count <= 0 || chest.items[entry.slot]) continue;
        chest.items[entry.slot] = { type: entry.itemId, count: Math.max(1, Math.floor(entry.count)) };
        seeded += 1;
    }
    return seeded;
}

function axisToward(from: VaultRoom, to: VaultRoom): { x: -1 | 0 | 1; z: -1 | 0 | 1 } {
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    if (Math.abs(dx) >= Math.abs(dz)) return { x: dx >= 0 ? 1 : -1, z: 0 };
    return { x: 0, z: dz >= 0 ? 1 : -1 };
}

function rotationFacing(direction: { x: number; z: number }): 0 | 1 | 2 | 3 {
    if (direction.z > 0) return 0;
    if (direction.z < 0) return 1;
    if (direction.x > 0) return 2;
    return 3;
}

function descriptorAtEdge(
    room: VaultRoom,
    direction: { x: -1 | 0 | 1; z: -1 | 0 | 1 },
    id: VaultCacheId,
    lateral: number,
): VaultCacheDescriptor {
    const perpendicular = { x: -direction.z, z: direction.x };
    const longHalf = direction.x !== 0 ? Math.floor(room.width / 2) : Math.floor(room.depth / 2);
    const distance = Math.max(3, longHalf - 4);
    const x = room.x + direction.x * distance + perpendicular.x * lateral;
    const z = room.z + direction.z * distance + perpendicular.z * lateral;
    const front = { x: -direction.x, z: -direction.z };
    return {
        id,
        roomId: room.id,
        x,
        y: room.y + 1,
        z,
        rotation: rotationFacing(front),
        approach: [1, 2].map((step) => ({ x: x + front.x * step, y: room.y + 1, z: z + front.z * step })),
    };
}

function roomById(layout: VaultLayout, id: string): VaultRoom {
    const room = layout.rooms.find((candidate) => candidate.id === id);
    if (!room) throw new Error(`Vault layout ${layout.vaultId} is missing room ${id}`);
    return room;
}

export function getVaultCacheDescriptors(layout: VaultLayout): VaultCacheDescriptor[] {
    const tuning = roomById(layout, 'tuning');
    const hub = roomById(layout, 'hub');
    const guard = roomById(layout, 'major_0');
    const foundry = roomById(layout, 'major_1');
    const leftFinal = roomById(layout, 'major_4');
    const innerWorks = roomById(layout, 'inner_works');
    const antechamber = roomById(layout, 'antechamber');
    const arena = roomById(layout, 'arena');
    const core = roomById(layout, 'core');
    const grandAscent = roomById(layout, 'grand_ascent');
    const side = (room: VaultRoom, amount: number) => (room.variant & 1) === 0 ? -amount : amount;

    const tuningCache = descriptorAtEdge(tuning, axisToward(tuning, roomById(layout, 'processional')), 'tuning', side(tuning, 5));
    tuningCache.teachingTarget = { x: tuning.x, y: tuning.y + 2, z: tuning.z, kind: 'fork_receiver' };
    const rangedCache = descriptorAtEdge(guard, axisToward(guard, foundry), 'ranged', side(guard, 5));
    const rangedFront = rangedCache.approach[1];
    rangedCache.teachingTarget = {
        x: rangedFront.x + (rangedFront.x - rangedCache.x) * 5,
        y: guard.y + 2,
        z: rangedFront.z + (rangedFront.z - rangedCache.z) * 5,
        kind: 'ranged_target',
    };

    const descriptors: VaultCacheDescriptor[] = [
        tuningCache,
        descriptorAtEdge(hub, axisToward(hub, guard), 'armory', side(hub, 6)),
        rangedCache,
        descriptorAtEdge(innerWorks, axisToward(innerWorks, leftFinal), 'heavy', side(innerWorks, 5)),
        descriptorAtEdge(antechamber, axisToward(antechamber, hub), 'antechamber', side(antechamber, 5)),
        descriptorAtEdge(core, axisToward(core, arena), 'core', side(core, 5)),
        descriptorAtEdge(grandAscent, axisToward(grandAscent, core), 'ascent', side(grandAscent, 5)),
    ];

    const annexHosts = ['major_1', 'major_3', 'major_5'];
    layout.rooms.filter(({ id }) => id.startsWith('annex_')).forEach((annex, index) => {
        const host = roomById(layout, annexHosts[index]);
        const towardHost = axisToward(annex, host);
        descriptors.push(descriptorAtEdge(
            annex,
            { x: -towardHost.x as -1 | 0 | 1, z: -towardHost.z as -1 | 0 | 1 },
            annex.id as `annex_${number}`,
            side(annex, 3),
        ));
    });
    return descriptors;
}

export function findVaultCacheDescriptor(
    layout: VaultLayout,
    cacheId: VaultCacheId,
    position: VaultRoutePoint,
): VaultCacheDescriptor | null {
    return getVaultCacheDescriptors(layout).find((descriptor) => descriptor.id === cacheId
        && descriptor.x === position.x
        && descriptor.y === position.y
        && descriptor.z === position.z) ?? null;
}
