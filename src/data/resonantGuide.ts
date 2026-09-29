import { BlockType } from '../types';

/**
 * A line under the name for the vault content whose use you couldn't guess
 * from it: machinery, what a material is for, a weapon's trick. Masonry,
 * lamps, spikes and the crossbow's bolts say what they are already.
 */
export const RESONANT_ITEM_PURPOSES: Readonly<Record<number, readonly string[]>> = {
    [BlockType.ECHO_CRYSTAL]: ['Drops Echo Shards when mined with an iron pickaxe.'],
    [BlockType.RESONANCE_PYLON]: ['Responds to the Echo Tuning Fork.'],
    [BlockType.PULSE_CONDUIT]: ['Carries visible echo signals.'],
    [BlockType.PHASE_BLOCK]: ['Alternates with crossing echoes.'],
    [BlockType.RESONANCE_PLATE]: ['Pressure control for vault mechanisms.'],
    [BlockType.SENTINEL_CORE]: ['Opens after the Bell Titan falls.'],
    [BlockType.LISTENING_STONE]: ['The Echo Tuning Fork reveals the nearest vault.'],
    [BlockType.VAULT_SEAL]: ['Opens with vault progress.'],
    [BlockType.ECHO_SHARD]: ['Crafts Echo Dust.'],
    [BlockType.ECHO_DUST]: ['Vault crafting material.'],
    [BlockType.ECHO_CORE]: ['Rare vault cache material.'],
    [BlockType.FRACTURED_CORE]: ['Recycles into Echo Dust.'],
    [BlockType.VAULTSTEEL_SPEAR]: ['Long-reach weapon; strongest at the tip of its reach.'],
    [BlockType.BELLBREAKER_MAUL]: ['Heavy weapon; breaks guards and armored targets.'],
    [BlockType.ECHO_TUNING_FORK]: ['Activates marked vault machinery.'],
    [BlockType.TITAN_HAMMER]: ['Bell Titan weapon; heavy hits crush nearby enemies.'],
};

const RESONANT_HOTBAR_SUMMARIES: Readonly<Record<number, string>> = {
    [BlockType.ECHO_SHARD]: 'Crafting material',
    [BlockType.ECHO_DUST]: 'Vault crafting material',
    [BlockType.ECHO_CORE]: 'Rare cache material',
    [BlockType.FRACTURED_CORE]: 'Recycles into Echo Dust',
    [BlockType.VAULTSTEEL_SPEAR]: 'Long reach | tip strikes hit harder',
    [BlockType.VAULT_CROSSBOW]: 'Uses Vault Bolts',
    [BlockType.VAULT_BOLT]: 'Crossbow ammunition',
    [BlockType.BELLBREAKER_MAUL]: 'Heavy | breaks guards and armor',
    [BlockType.ECHO_TUNING_FORK]: 'Activates marked machinery',
    [BlockType.TITAN_HAMMER]: 'Heavy | crushing shock impact',
};

export function getResonantPurpose(type: number): readonly string[] {
    return RESONANT_ITEM_PURPOSES[type] ?? [];
}

export function getResonantHotbarSummary(type: number): string {
    return RESONANT_HOTBAR_SUMMARIES[type] ?? '';
}
