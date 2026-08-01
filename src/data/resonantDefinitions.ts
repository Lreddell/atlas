import { BLOCKS } from './blocks';
import { BlockType, type BlockDef } from '../types';

const worldDefinitions: Readonly<Record<number, BlockDef>> = {
    [BlockType.ECHO_STONE]: { id: BlockType.ECHO_STONE, color: '#50595a', name: 'Echo Stone', textureSlot: 237, hardness: 2.8, preferredTool: 'pickaxe', minHarvestTier: 2, category: 'building' },
    [BlockType.ECHO_BRICKS]: { id: BlockType.ECHO_BRICKS, color: '#4b5557', name: 'Echo Bricks', textureSlot: 238, hardness: 3, preferredTool: 'pickaxe', minHarvestTier: 2, category: 'building' },
    [BlockType.CRACKED_ECHO_BRICKS]: { id: BlockType.CRACKED_ECHO_BRICKS, color: '#454e50', name: 'Cracked Echo Bricks', textureSlot: 239, hardness: 2.6, preferredTool: 'pickaxe', minHarvestTier: 2, category: 'building' },
    [BlockType.CHISELED_ECHO_STONE]: { id: BlockType.CHISELED_ECHO_STONE, color: '#4c5658', name: 'Chiseled Echo Stone', textureSlot: 240, hardness: 3, preferredTool: 'pickaxe', minHarvestTier: 2, category: 'building' },
    [BlockType.ECHO_MOSAIC]: { id: BlockType.ECHO_MOSAIC, color: '#424c4e', name: 'Echo Mosaic', textureSlot: 241, hardness: 2.8, preferredTool: 'pickaxe', minHarvestTier: 2, category: 'building' },
    [BlockType.ECHO_CRYSTAL]: { id: BlockType.ECHO_CRYSTAL, color: '#91b9b2', name: 'Echo Crystal', textureSlot: 242, hardness: 1.4, preferredTool: 'pickaxe', minHarvestTier: 2, transparent: true, noCollision: true, lightLevel: 7, category: 'natural', drops: [{ type: BlockType.ECHO_SHARD, chance: 1, min: 2, max: 4 }] },
    [BlockType.RESONANCE_PYLON]: { id: BlockType.RESONANCE_PYLON, color: '#556064', name: 'Resonance Pylon', textureSlot: 243, hardness: 4, preferredTool: 'pickaxe', minHarvestTier: 2, lightLevel: 3, category: 'functional' },
    [BlockType.PULSE_CONDUIT]: { id: BlockType.PULSE_CONDUIT, color: '#4b575a', name: 'Pulse Conduit', textureSlot: 245, hardness: 3.5, preferredTool: 'pickaxe', minHarvestTier: 2, lightLevel: 2, category: 'functional' },
    [BlockType.PHASE_BLOCK]: { id: BlockType.PHASE_BLOCK, color: '#56666a', name: 'Phase Block', textureSlot: 246, hardness: 4, preferredTool: 'pickaxe', minHarvestTier: 2, transparent: true, lightLevel: 2, category: 'functional' },
    [BlockType.RESONANCE_PLATE]: { id: BlockType.RESONANCE_PLATE, color: '#566164', name: 'Resonance Plate', textureSlot: 247, hardness: 2.5, preferredTool: 'pickaxe', minHarvestTier: 2, category: 'functional' },
    [BlockType.RESONANT_LAMP]: { id: BlockType.RESONANT_LAMP, color: '#d5eee8', name: 'Resonant Lamp', textureSlot: 248, hardness: 1.5, preferredTool: 'pickaxe', minHarvestTier: 1, lightLevel: 13, category: 'functional' },
    [BlockType.ECHO_SPIKES]: { id: BlockType.ECHO_SPIKES, color: '#768a8c', name: 'Echo Spikes', textureSlot: 249, hardness: 1.6, preferredTool: 'pickaxe', minHarvestTier: 2, transparent: true, noCollision: true, category: 'functional' },
    [BlockType.SENTINEL_CORE]: { id: BlockType.SENTINEL_CORE, color: '#75958f', name: 'Sentinel Core', textureSlot: 250, hardness: 5, preferredTool: 'pickaxe', minHarvestTier: 3, lightLevel: 6, category: 'functional', drops: [{ type: BlockType.FRACTURED_CORE, chance: 1, min: 1, max: 2 }] },
    [BlockType.LISTENING_STONE]: { id: BlockType.LISTENING_STONE, color: '#596466', name: 'Listening Stone', textureSlot: 251, hardness: 4.5, preferredTool: 'pickaxe', minHarvestTier: 2, lightLevel: 3, category: 'functional' },
    [BlockType.VAULT_SEAL]: { id: BlockType.VAULT_SEAL, color: '#252c2f', name: 'Vault Seal', textureSlot: 252, hardness: Infinity, lightLevel: 2, category: 'functional' },
    [BlockType.ECHO_STONE_SLAB]: { id: BlockType.ECHO_STONE_SLAB, color: '#59615d', name: 'Echo Stone Slab', textureSlot: 237, textureParent: BlockType.ECHO_STONE, shape: 'slab', transparent: true, hardness: 2.4, preferredTool: 'pickaxe', minHarvestTier: 1, category: 'building', drops: [{ type: BlockType.ECHO_STONE_SLAB, chance: 1, min: 1, max: 1 }] },
    [BlockType.ECHO_STONE_STAIRS]: { id: BlockType.ECHO_STONE_STAIRS, color: '#59615d', name: 'Echo Stone Stairs', textureSlot: 237, textureParent: BlockType.ECHO_STONE, shape: 'stairs', transparent: true, hardness: 2.4, preferredTool: 'pickaxe', minHarvestTier: 1, category: 'building', drops: [{ type: BlockType.ECHO_STONE_STAIRS, chance: 1, min: 1, max: 1 }] },
    [BlockType.ECHO_BRICK_SLAB]: { id: BlockType.ECHO_BRICK_SLAB, color: '#4f5854', name: 'Echo Brick Slab', textureSlot: 238, textureParent: BlockType.ECHO_BRICKS, shape: 'slab', transparent: true, hardness: 2.6, preferredTool: 'pickaxe', minHarvestTier: 1, category: 'building', drops: [{ type: BlockType.ECHO_BRICK_SLAB, chance: 1, min: 1, max: 1 }] },
    [BlockType.ECHO_BRICK_STAIRS]: { id: BlockType.ECHO_BRICK_STAIRS, color: '#4f5854', name: 'Echo Brick Stairs', textureSlot: 238, textureParent: BlockType.ECHO_BRICKS, shape: 'stairs', transparent: true, hardness: 2.6, preferredTool: 'pickaxe', minHarvestTier: 1, category: 'building', drops: [{ type: BlockType.ECHO_BRICK_STAIRS, chance: 1, min: 1, max: 1 }] },
};

const itemDefinitions: Readonly<Record<number, BlockDef>> = {
    [BlockType.ECHO_SHARD]: { id: BlockType.ECHO_SHARD, color: '#91b9b2', name: 'Echo Shard', textureSlot: 253, hardness: 0, isItem: true, lightLevel: 2, category: 'ingredients' },
    [BlockType.ECHO_DUST]: { id: BlockType.ECHO_DUST, color: '#b9cec8', name: 'Echo Dust', textureSlot: 254, hardness: 0, isItem: true, category: 'ingredients' },
    [BlockType.ECHO_CORE]: { id: BlockType.ECHO_CORE, color: '#93b5ae', name: 'Echo Core', textureSlot: 256, hardness: 0, isItem: true, lightLevel: 5, category: 'ingredients' },
    [BlockType.FRACTURED_CORE]: { id: BlockType.FRACTURED_CORE, color: '#617c77', name: 'Fractured Core', textureSlot: 260, hardness: 0, isItem: true, category: 'ingredients' },
    [BlockType.VAULTSTEEL_SPEAR]: { id: BlockType.VAULTSTEEL_SPEAR, color: '#8c8b7e', name: 'Vaultsteel Spear', textureSlot: 261, hardness: 0, isItem: true, category: 'tools' },
    [BlockType.VAULT_CROSSBOW]: { id: BlockType.VAULT_CROSSBOW, color: '#6f5d47', name: 'Vault Crossbow', textureSlot: 262, hardness: 0, isItem: true, category: 'tools' },
    [BlockType.VAULT_BOLT]: { id: BlockType.VAULT_BOLT, color: '#a9a89b', name: 'Vault Bolt', textureSlot: 263, hardness: 0, isItem: true, category: 'tools' },
    [BlockType.BELLBREAKER_MAUL]: { id: BlockType.BELLBREAKER_MAUL, color: '#716f66', name: 'Bellbreaker Maul', textureSlot: 264, hardness: 0, isItem: true, category: 'tools' },
    [BlockType.ECHO_TUNING_FORK]: { id: BlockType.ECHO_TUNING_FORK, color: '#9c9276', name: 'Echo Tuning Fork', textureSlot: 265, hardness: 0, isItem: true, category: 'tools' },
    [BlockType.TITAN_HAMMER]: { id: BlockType.TITAN_HAMMER, color: '#81735c', name: 'Titan Hammer', textureSlot: 266, hardness: 0, isItem: true, category: 'tools' },
};

export const RESONANT_DEFINITIONS: Readonly<Record<number, BlockDef>> = {
    ...worldDefinitions,
    ...itemDefinitions,
};

let registered = false;
export function registerResonantDefinitions(): void {
    if (registered) return;
    const target = BLOCKS as Record<number, BlockDef>;
    for (const [key, definition] of Object.entries(RESONANT_DEFINITIONS)) target[Number(key)] = definition;
    registered = true;
}

registerResonantDefinitions();
