// The farming items, apart from the farm rules (farming.ts), so the item
// registries and tooltips can name them without the world constants.

import { BlockType } from '../../types';

export const HOE_TYPES: ReadonlySet<BlockType> = new Set([
    BlockType.WOOD_HOE, BlockType.STONE_HOE, BlockType.COPPER_HOE,
    BlockType.IRON_HOE, BlockType.GOLD_HOE, BlockType.DIAMOND_HOE,
]);

export const isHoe = (type: BlockType): boolean => HOE_TYPES.has(type);

/** What the inventory tooltip says a farming item is for. */
export function farmingPurpose(type: BlockType): string | null {
    if (isHoe(type)) return 'Right-click grass or dirt to till it into farmland.';
    if (type === BlockType.WHEAT_SEEDS) return 'Plant on farmland. Water within four blocks speeds it up.';
    if (type === BlockType.WHEAT) return 'Three in a row at a Crafting Table bake a loaf of bread.';
    return null;
}
