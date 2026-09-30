import type { BlockType, DropEntry } from '../../types';

/**
 * What a block's drop table yields for one break: each entry rolls its chance,
 * then drops a whole number of items from min to max (inclusive), as
 * Minecraft's loot tables do. Copper ore gives 2 to 5 raw copper, lapis 4 to 9.
 * One entry per item, for spawning them one by one.
 */
export function rollDrops(drops: readonly DropEntry[] | undefined, random: () => number = Math.random): BlockType[] {
    const items: BlockType[] = [];
    if (!drops) return items;
    for (const drop of drops) {
        if (random() >= drop.chance) continue;
        const min = Math.max(0, Math.floor(drop.min ?? 1));
        const max = Math.max(min, Math.floor(drop.max ?? min));
        const count = min + Math.floor(random() * (max - min + 1));
        for (let i = 0; i < count; i++) items.push(drop.type);
    }
    return items;
}
