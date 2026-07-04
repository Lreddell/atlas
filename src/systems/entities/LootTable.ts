import type { ItemStack } from '../../types';
import { DeterministicRng } from '../world/simulation/DeterministicRng';

export interface LootEntry {
    item: ItemStack;
    chance?: number;
    min?: number;
    max?: number;
    weight?: number;
}

export interface LootTable { rolls: number; entries: LootEntry[] }

export function rollLoot(table: LootTable, seed: number): ItemStack[] {
    const rng = new DeterministicRng(seed);
    const output: ItemStack[] = [];
    const weighted = table.entries.filter((entry) => (entry.weight ?? 1) > 0);
    const totalWeight = weighted.reduce((sum, entry) => sum + (entry.weight ?? 1), 0);
    for (let roll = 0; roll < table.rolls && weighted.length > 0; roll++) {
        let cursor = rng.nextFloat() * totalWeight;
        const selected = weighted.find((entry) => (cursor -= entry.weight ?? 1) <= 0) ?? weighted[weighted.length - 1];
        if (selected.chance !== undefined && rng.nextFloat() > selected.chance) continue;
        const min = selected.min ?? selected.item.count;
        const max = Math.max(min, selected.max ?? min);
        output.push({ ...selected.item, count: min + rng.nextInt(max - min + 1), instance: selected.item.instance ? structuredClone(selected.item.instance) : undefined });
    }
    return output;
}
