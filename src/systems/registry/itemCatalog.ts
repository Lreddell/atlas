import { BlockType, type ItemStats } from '../../types';

export type ItemUseBehavior =
    | 'material'
    | 'vault_key'
    | 'reward_component'
    | 'melee_weapon'
    | 'crossbow'
    | 'ammunition'
    | 'echo_tuning_fork';

export interface ItemCatalogEntry {
    id: BlockType;
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
    170: { id: BlockType.ECHO_SHARD, maxStack: 64, useBehavior: 'material', placedBlock: null },
    171: { id: BlockType.ECHO_DUST, maxStack: 64, useBehavior: 'material', placedBlock: null },
    173: { id: BlockType.ECHO_CORE, maxStack: 16, useBehavior: 'vault_key', placedBlock: null },
    177: { id: BlockType.FRACTURED_CORE, maxStack: 64, useBehavior: 'material', placedBlock: null },
    182: { id: BlockType.VAULTSTEEL_SPEAR, maxStack: 1, useBehavior: 'melee_weapon', placedBlock: null },
    183: { id: BlockType.VAULT_CROSSBOW, maxStack: 1, useBehavior: 'crossbow', placedBlock: null },
    184: { id: BlockType.VAULT_BOLT, maxStack: 64, useBehavior: 'ammunition', placedBlock: null },
    185: { id: BlockType.BELLBREAKER_MAUL, maxStack: 1, useBehavior: 'melee_weapon', placedBlock: null },
    186: { id: BlockType.ECHO_TUNING_FORK, maxStack: 1, useBehavior: 'echo_tuning_fork', placedBlock: null },
    187: { id: BlockType.TITAN_HAMMER, maxStack: 1, useBehavior: 'melee_weapon', placedBlock: null },
};

const resonantItemSet: ReadonlySet<number> = new Set(RESONANT_ITEM_IDS);

export function isInventoryOnlyItemId(id: number): id is ResonantItemId {
    return resonantItemSet.has(id);
}

export function getItemCatalogEntry(id: number): ItemCatalogEntry | undefined {
    if (!isInventoryOnlyItemId(id)) return undefined;
    return ITEM_CATALOG[id];
}
