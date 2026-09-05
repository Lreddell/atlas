import { BlockType, ItemType, type ItemStats } from '../../types';
import { itemIdentity } from './contentIds';
import { BLOCKS } from '../../data/blocks';

export type ItemUseBehavior =
    | 'material'
    | 'place_block'
    | 'food'
    | 'tool'
    | 'vault_key'
    | 'reward_component'
    | 'melee_weapon'
    | 'crossbow'
    | 'ammunition'
    | 'echo_tuning_fork';

export interface ItemCatalogEntry {
    id: ItemType;
    maxStack: number;
    useBehavior: ItemUseBehavior;
    placedBlock: BlockType | null;
    stats?: ItemStats;
}

export const RESONANT_ITEM_IDS = [
    170, 171, 173, 177,
    182, 183, 184, 185, 186, 187,
] as const;
export type ResonantItemId = (typeof RESONANT_ITEM_IDS)[number];

export const ITEM_CATALOG: Readonly<Record<ResonantItemId, ItemCatalogEntry>> = {
    170: { id: ItemType.ECHO_SHARD, maxStack: 64, useBehavior: 'material', placedBlock: null },
    171: { id: ItemType.ECHO_DUST, maxStack: 64, useBehavior: 'material', placedBlock: null },
    173: { id: ItemType.ECHO_CORE, maxStack: 16, useBehavior: 'vault_key', placedBlock: null },
    177: { id: ItemType.FRACTURED_CORE, maxStack: 64, useBehavior: 'material', placedBlock: null },
    182: { id: ItemType.VAULTSTEEL_SPEAR, maxStack: 1, useBehavior: 'melee_weapon', placedBlock: null },
    183: { id: ItemType.VAULT_CROSSBOW, maxStack: 1, useBehavior: 'crossbow', placedBlock: null },
    184: { id: ItemType.VAULT_BOLT, maxStack: 64, useBehavior: 'ammunition', placedBlock: null },
    185: { id: ItemType.BELLBREAKER_MAUL, maxStack: 1, useBehavior: 'melee_weapon', placedBlock: null },
    186: { id: ItemType.ECHO_TUNING_FORK, maxStack: 1, useBehavior: 'echo_tuning_fork', placedBlock: null },
    187: { id: ItemType.TITAN_HAMMER, maxStack: 1, useBehavior: 'melee_weapon', placedBlock: null },
};

export function isInventoryOnlyItemId(id: number): id is ItemType {
    const item = itemIdentity(id);
    return item !== undefined && item.placedBlock === null;
}

export function getItemCatalogEntry(id: number): ItemCatalogEntry | undefined {
    const item = itemIdentity(id);
    if (!item) return undefined;
    const legacy = (ITEM_CATALOG as Partial<Record<number, ItemCatalogEntry>>)[id];
    if (legacy) return legacy;
    const definition = BLOCKS[id];
    return {
        id: item.id,
        placedBlock: item.placedBlock,
        maxStack: definition?.toolType ? 1 : 64,
        useBehavior: item.placedBlock !== null ? 'place_block'
            : definition?.nutrition ? 'food' : definition?.toolType ? 'tool' : 'material',
    };
}
