// Item tooltip/stat lines for the inventory UI and hotbar readout.
//
// Single source of truth: everything here is DERIVED from the same registries
// the gameplay code reads — ITEM_STATS (attack/defense/durability, via
// getItemStats) and BLOCKS (tool type/tier/speed, food, fuel) — so the numbers
// shown always match actual combat/mining/armor behavior. No magic numbers.

import { BlockType, type ItemStack } from '../../types';
import { BLOCKS } from '../../data/blocks';
import { getItemStats, getMaxDurability } from './itemStats';
import { MAGNET_RANGE } from '../player/magneticField';
import { MAGNETIC_SPIKE_FALL_MULTIPLIER } from '../world/magneticFields';

export interface TooltipLine {
    text: string;
    /** 'stat' = gameplay number (bright), 'info' = flavor/how-to (dim italic). */
    tone: 'stat' | 'info';
}

export interface ItemTooltip {
    name: string;
    lines: TooltipLine[];
}

/** Player-facing names for harvest tiers (BLOCKS[].toolTier semantics). */
const TIER_NAMES: Record<number, string> = {
    1: 'Wood tier',
    2: 'Stone tier',
    3: 'Iron tier',
    4: 'Diamond tier',
};

// Mining-tool display names. Hoes are deliberately absent: Atlas has no
// tilling/farmland system, so hoes carry no toolType/toolSpeed in BLOCKS and
// have no mining stat to show — they still display Attack and Durability via
// ITEM_STATS like any other weapon-ish tool.
const TOOL_NAMES: Record<string, string> = {
    pickaxe: 'Pickaxe',
    axe: 'Axe',
    shovel: 'Shovel',
};

// How-to/flavor lines for special gear. Kept here (not in BLOCKS) so the block
// registry stays pure data and the strings sit next to the stat derivation.
const ITEM_DESCRIPTIONS: Partial<Record<BlockType, string>> = {
    [BlockType.POLARITY_BOOTS]: 'R flips your polarity: matching magnets repel, opposites attract.',
    [BlockType.UPGRADED_POLARITY_BOOTS]: 'R flips polarity; N switches the ability on/off entirely.',
    [BlockType.POLARITY_BOOTS_UPGRADE]: 'Combine with Polarity Boots in a crafting grid to upgrade them.',
    [BlockType.BOAT]: 'Use on water to set afloat; right-click to board, Sneak to hop out.',
    [BlockType.POSITIVE_MAGNET]: `Projects a positive field ~${MAGNET_RANGE} blocks — polarity gear reacts to it.`,
    [BlockType.NEGATIVE_MAGNET]: `Projects a negative field ~${MAGNET_RANGE} blocks — polarity gear reacts to it.`,
    [BlockType.MAGNETIC_SPIKE]: `Hazard: landing on it multiplies fall damage ×${MAGNETIC_SPIKE_FALL_MULTIPLIER}.`,
    [BlockType.CHARGED_MAGNETITE]: 'Emissive magnetite — a craftable light source.',
    [BlockType.MAGNETITE_SHARD]: 'Bright crystal light; also crafts Charged Magnetite and spikes.',
    [BlockType.MAGNETIC_BOSS_SUMMONER]: 'Right-click at the arena altar to summon the Magnetic Warden.',
    [BlockType.BED_ITEM]: 'Sleep at night to skip to morning and set your respawn point.',
};

/**
 * Full tooltip for an item stack: name plus compact stat/description lines.
 * Empty `lines` for plain blocks (the tooltip then shows just the name).
 */
export function getItemTooltip(stack: ItemStack): ItemTooltip {
    const def = BLOCKS[stack.type];
    const name = def?.name ?? 'Unknown';
    const lines: TooltipLine[] = [];
    if (!def) return { name, lines };

    const stats = getItemStats(stack);

    // Combat: melee attack damage (half-hearts, same value damageEntity uses).
    if (stats?.attack !== undefined) {
        lines.push({ text: `Attack: ${stats.attack}`, tone: 'stat' });
    }

    // Mining: tool class, harvest tier, and mining power (the raw registry
    // toolSpeed the break-speed math uses — presented as a stat, not a "×N"
    // multiplier, which wrongly implied "times some baseline").
    if (def.toolType && def.toolType !== 'none') {
        const tier = TIER_NAMES[def.toolTier ?? 0];
        const parts = [TOOL_NAMES[def.toolType] ?? def.toolType];
        if (tier) parts.push(tier);
        if (def.toolSpeed) parts.push(`Mining power ${def.toolSpeed.toFixed(1)}`);
        lines.push({ text: parts.join(' · '), tone: 'stat' });
    }

    // Armor: defense points (the same points applyArmor converts to reduction).
    if (stats?.defense !== undefined && stats.slot) {
        lines.push({ text: `Defense: +${stats.defense}`, tone: 'stat' });
    }

    // Durability: current/max for tools, weapons, and armor; special gear
    // without a max (Polarity Boots) reads as unbreakable.
    const maxDurability = stats?.maxDurability ?? getMaxDurability(stack.type);
    if (maxDurability !== undefined) {
        const current = stack.instance?.durability ?? maxDurability;
        lines.push({ text: `Durability: ${current} / ${maxDurability}`, tone: 'stat' });
    } else if (stats?.slot || stats?.attack !== undefined) {
        lines.push({ text: 'Unbreakable', tone: 'stat' });
    }

    // Food: hunger + saturation restored (matches the eating code).
    // (Fuel burn time is deliberately NOT shown — furnace behavior is unchanged,
    // it's just not a player-facing tooltip stat.)
    if (def.nutrition) {
        const saturation = def.nutrition * (def.saturationModifier ?? 0) * 2;
        lines.push({ text: `Food: +${def.nutrition} hunger, +${Math.round(saturation * 10) / 10} saturation`, tone: 'stat' });
    }

    const description = ITEM_DESCRIPTIONS[stack.type];
    if (description) lines.push({ text: description, tone: 'info' });

    return { name, lines };
}

/**
 * One-line stat summary for the hotbar name plate (kept very short so it never
 * clutters). Empty string when the item has nothing worth summarizing.
 */
export function summarizeItemStats(stack: ItemStack): string {
    const def = BLOCKS[stack.type];
    if (!def) return '';
    const stats = getItemStats(stack);
    const parts: string[] = [];
    if (stats?.attack !== undefined) parts.push(`ATK ${stats.attack}`);
    if (def.toolType && def.toolType !== 'none' && def.toolSpeed) parts.push(`Power ${def.toolSpeed.toFixed(1)}`);
    if (stats?.defense !== undefined && stats.slot) parts.push(`DEF +${stats.defense}`);
    const max = stats?.maxDurability ?? getMaxDurability(stack.type);
    if (max !== undefined) {
        const current = stack.instance?.durability ?? max;
        parts.push(`${current}/${max}`);
    }
    return parts.join(' · ');
}
