import { BlockType, ItemType, type BlockId, type ItemId } from '../../types';

// Compile-time regression gate: an inventory handle must never reach terrain
// mutation without the placement adapter, even when its numeric value matches.
const world: BlockId = BlockType.STONE;
const item: ItemId = ItemType.STONE;
// @ts-expect-error Different identity domains.
const invalidBlock: BlockId = item;
// @ts-expect-error Different identity domains.
const invalidItem: ItemId = world;
void invalidBlock;
void invalidItem;
