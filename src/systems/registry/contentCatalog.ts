import '../../data/resonantDefinitions';
import { BLOCKS } from '../../data/blocks';
import { BlockType, type BlockDef } from '../../types';
import { getItemCatalogEntry, RESONANT_ITEM_IDS } from './itemCatalog';
import { isWorldBlockId, RESONANT_WORLD_BLOCK_IDS } from './worldBlockCatalog';

const definitionsById = BLOCKS as Record<number, BlockDef>;

export interface ContentDefinition {
    id: BlockType;
    definition: BlockDef;
    classification: 'world_block' | 'inventory_item';
}

export function getContentDefinition(id: number): ContentDefinition | undefined {
    if (!Number.isInteger(id) || id < 0 || id > 65535) return undefined;
    const definition = definitionsById[id];
    if (!definition) return undefined;
    if (getItemCatalogEntry(id)) return { id: id as BlockType, definition, classification: 'inventory_item' };
    if (isWorldBlockId(id)) return { id: id as BlockType, definition, classification: 'world_block' };
    return undefined;
}

export function assertContentCatalogIntegrity(): void {
    const numericIds = Object.values(BlockType).filter((v): v is number => typeof v === 'number');
    const maxId = numericIds.length > 0 ? Math.max(...numericIds) : 0;
    // Voxel storage is Uint16Array (0-65535). The legacy enum range must stay
    // frozen at/below 255 (locked by legacyIds.json); new content allocates
    // >= 256 through the block registry, never by extending the enum.
    if (maxId > 255) throw new Error(`Legacy BlockType ceiling exceeded: max=${maxId} (legacy ids must stay 0-255; use the block registry for new content).`);
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
