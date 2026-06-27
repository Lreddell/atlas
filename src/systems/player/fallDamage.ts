// Fall-damage multipliers keyed by the block a player lands ON.
//
// Centralized so any future hazard surface can adjust fall damage in one place.
// Normal blocks return 1 (no change). Magnetic Spikes amplify the impact.

import { BlockType } from '../../types';
import { MAGNETIC_SPIKE_FALL_MULTIPLIER } from '../world/magneticFields';

/**
 * Multiplier applied to already-computed fall damage based on the landing block.
 * Applied exactly once per landing event (see Player.tsx). Returns 1 for any
 * ordinary block so existing fall behavior is unchanged everywhere else.
 */
export function getFallDamageMultiplierForLandingBlock(blockType: BlockType): number {
    if (blockType === BlockType.MAGNETIC_SPIKE) return MAGNETIC_SPIKE_FALL_MULTIPLIER;
    return 1;
}
