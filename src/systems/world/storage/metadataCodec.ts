import { decodeItemStack, encodeItemStack, type StoredItemStack } from './contentCodec';
import type { PlayerData, WorldMetadata } from './types';

export type StoredPlayerData = Omit<PlayerData, 'inventory' | 'equipment' | 'cursorStack' | 'craftingGrid2x2' | 'craftingGrid3x3'> & {
    inventory: (StoredItemStack | null)[];
    equipment?: Partial<Record<string, StoredItemStack | null>>;
    cursorStack?: StoredItemStack | null;
    craftingGrid2x2?: (StoredItemStack | null)[];
    craftingGrid3x3?: (StoredItemStack | null)[];
};
export type StoredWorldMetadata = Omit<WorldMetadata, 'player'> & {
    schemaVersion: 3;
    player?: StoredPlayerData;
};
export type WorldMetadataRecord = WorldMetadata | StoredWorldMetadata;

export function encodeWorldMetadata(meta: WorldMetadata): StoredWorldMetadata {
    const copy = structuredClone(meta);
    const player = copy.player;
    return {
        ...copy,
        schemaVersion: 3,
        player: player ? {
            ...player,
            inventory: player.inventory.map(encodeItemStack),
            ...(player.craftingGrid2x2 ? { craftingGrid2x2: player.craftingGrid2x2.map(encodeItemStack) } : {}),
            ...(player.craftingGrid3x3 ? { craftingGrid3x3: player.craftingGrid3x3.map(encodeItemStack) } : {}),
            ...(player.equipment ? { equipment: Object.fromEntries(Object.entries(player.equipment).map(([slot, stack]) => [slot, encodeItemStack(stack ?? null)])) } : {}),
            ...(player.cursorStack !== undefined ? { cursorStack: encodeItemStack(player.cursorStack) } : {}),
        } : undefined,
    } as StoredWorldMetadata;
}

export function decodeWorldMetadata(value: WorldMetadataRecord): WorldMetadata {
    if (!value || typeof value !== 'object') throw new Error('Missing world metadata');
    if (value.schemaVersion !== undefined && ![1, 2, 3].includes(value.schemaVersion)) throw new Error(`Unsupported world schema ${value.schemaVersion}; original data was not changed`);
    const copy = structuredClone(value);
    const player = copy.player;
    return {
        ...copy,
        player: player ? {
            ...player,
            inventory: player.inventory.map(decodeItemStack),
            ...(player.craftingGrid2x2 ? { craftingGrid2x2: player.craftingGrid2x2.map(decodeItemStack) } : {}),
            ...(player.craftingGrid3x3 ? { craftingGrid3x3: player.craftingGrid3x3.map(decodeItemStack) } : {}),
            ...(player.equipment ? { equipment: Object.fromEntries(Object.entries(player.equipment).map(([slot, stack]) => [slot, decodeItemStack(stack)])) } : {}),
            ...(player.cursorStack !== undefined ? { cursorStack: decodeItemStack(player.cursorStack) } : {}),
        } : undefined,
    } as WorldMetadata;
}
