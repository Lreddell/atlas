import type { ItemStats } from '../../types';

export interface ItemModifier { id: string; level: number }
export interface ItemModifierDefinition {
    id: string;
    apply(stats: ItemStats, level: number): ItemStats;
}

const definitions = new Map<string, ItemModifierDefinition>();
export function registerItemModifier(definition: ItemModifierDefinition): void { definitions.set(definition.id, definition); }
export function applyItemModifiers(base: ItemStats, modifiers: readonly ItemModifier[] | undefined): ItemStats {
    return (modifiers ?? []).reduce((stats, modifier) => definitions.get(modifier.id)?.apply(stats, modifier.level) ?? stats, { ...base });
}

registerItemModifier({ id: 'atlas:sharpness', apply: (stats, level) => ({ ...stats, attack: (stats.attack ?? 0) + level }) });
registerItemModifier({ id: 'atlas:protection', apply: (stats, level) => ({ ...stats, defense: (stats.defense ?? 0) + level }) });
registerItemModifier({ id: 'atlas:unbreaking', apply: (stats, level) => ({ ...stats, maxDurability: Math.round((stats.maxDurability ?? 0) * (1 + level * 0.25)) }) });
