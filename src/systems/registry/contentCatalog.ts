import '../../data/resonantDefinitions';
import { BLOCKS } from '../../data/blocks';
import { type BlockId, type ItemId, type BlockDef } from '../../types';
import { itemIdentity } from './contentIds';
import { getItemCatalogEntry, RESONANT_ITEM_IDS } from './itemCatalog';
import { isWorldBlockId, RESONANT_WORLD_BLOCK_IDS } from './worldBlockCatalog';

const definitionsById = BLOCKS as Record<number, BlockDef>;

export interface ContentDefinition {
    id: BlockId | ItemId;
    definition: BlockDef;
    classification: 'world_block' | 'inventory_item';
}

export function getContentDefinition(id: number): ContentDefinition | undefined {
    if (!Number.isInteger(id) || id < 0) return undefined;
    const definition = definitionsById[id];
    if (!definition) return undefined;
    if (isWorldBlockId(id)) return { id, definition, classification: 'world_block' };
    const item = itemIdentity(id);
    if (item) return { id: item.id, definition, classification: 'inventory_item' };
    return undefined;
}

export function assertContentCatalogIntegrity(): void {
    const all = [...RESONANT_WORLD_BLOCK_IDS, ...RESONANT_ITEM_IDS];
    if (new Set(all).size !== all.length) throw new Error('Resonant content id collision.');
    for (const id of RESONANT_WORLD_BLOCK_IDS) {
        const definition = definitionsById[id];
        if (!definition || definition.isItem === true) throw new Error(`Resonant world block ${id} lacks a world-block definition.`);
    }
    for (const id of RESONANT_ITEM_IDS) {
        const definition = definitionsById[id];
        const item = getItemCatalogEntry(id);
        if (!definition || definition.isItem !== true || !item || item.placedBlock !== null) {
            throw new Error(`Resonant inventory item ${id} has an invalid definition.`);
        }
    }
}
