
import { BlockType } from '../../types';
import { BLOCKS } from '../../data/blocks';

export type SoundGroup = 'grass' | 'stone' | 'wood' | 'sand' | 'gravel' | 'glass' | 'metal' | 'cloth' | 'snow' | 'generic';

// Manual overrides or fallbacks if block definition lacks soundGroup
export function getBlockSoundGroup(type: BlockType): SoundGroup {
    const def = BLOCKS[type];
    if (!def) return 'generic';
    if (def.soundGroup) return def.soundGroup as SoundGroup;

    // Fallback logic based on name or ID
    const name = def.name.toLowerCase();

    if (name.includes('grass') || name.includes('leaves') || name.includes('sapling') || name.includes('plant') || name.includes('flower') || name.includes('rose') || name.includes('dandelion') || name.includes('podzol') || name.includes('mud')) return 'grass';
    if (name.includes('stone') || name.includes('rock') || name.includes('cobble') || name.includes('ore') || name.includes('brick') || name.includes('furnace') || name.includes('basalt') || name.includes('andesite') || name.includes('diorite') || name.includes('granite')) return 'stone';
    if (name.includes('wood') || name.includes('log') || name.includes('plank') || name.includes('chest') || name.includes('crafting') || name.includes('torch')) return 'wood';
    if (type === BlockType.DIRT) return 'grass'; // soft earth — must be checked before the name-based 'sand' branch below
    if (name.includes('sand') || name.includes('dirt') || name.includes('terracotta')) return 'sand';
    if (name.includes('glass') || name.includes('ice')) return 'glass';
    if (name.includes('iron') || name.includes('gold') || name.includes('copper')) return 'metal';
    if (name.includes('wool') || name.includes('bed')) return 'cloth';
    if (name.includes('snow')) return 'snow';

    return 'generic';
}
