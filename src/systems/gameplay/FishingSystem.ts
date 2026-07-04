import { BlockType, type ItemStack } from '../../types';
import { rollLoot } from '../entities/LootTable';

export function rollFishingLoot(seed: number, luck = 0): ItemStack[] {
    return rollLoot({
        rolls: 1,
        entries: [
            { item: { type: BlockType.APPLE, count: 1 }, weight: 55 + luck * 2 },
            { item: { type: BlockType.COAL, count: 1 }, weight: 25 },
            { item: { type: BlockType.IRON_INGOT, count: 1 }, weight: 12 + luck },
            { item: { type: BlockType.EMERALD, count: 1 }, weight: 3 + luck * 2 },
            { item: { type: BlockType.DIAMOND, count: 1 }, weight: 1 + luck },
        ],
    }, seed);
}
