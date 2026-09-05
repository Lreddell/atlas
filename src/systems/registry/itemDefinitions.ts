import '../../data/resonantDefinitions';
import { BLOCKS } from '../../data/blocks';
import { ItemType, type BlockDef, type ItemId } from '../../types';
import { allItemIdentities, itemIdentity, type ItemIdentity } from './contentIds';

export type ItemDefinition = Omit<BlockDef, 'id'> & ItemIdentity;

/** Presentation adapter for the legacy combined data file. Inventory identity
 * and placement are owned by the item registry, never inferred from isItem. */
export function getItemDefinition(id: ItemId): ItemDefinition {
    const identity = itemIdentity(id) ?? itemIdentity(ItemType.UNKNOWN)!;
    const presentation = BLOCKS[id] ?? BLOCKS[ItemType.UNKNOWN];
    return { ...presentation, ...identity };
}

export function getItemDefinitions(): ItemDefinition[] {
    return allItemIdentities().filter(entry => entry.id !== ItemType.UNKNOWN).map(entry => getItemDefinition(entry.id));
}
