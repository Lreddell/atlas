// Magnetic Fields block-type sets (kept separate from magneticFields.ts so that
// the pure geometry module stays enum-free and unit-testable).

import { BlockType } from '../../types';

/**
 * Blocks the player may still MINE while the Magnetic Fields region is sealed —
 * the two resource crystals only, so Polarity Boots can be crafted before the
 * Magnetic Warden is defeated. Everything else stays protected; placement stays
 * denied (placement targets are AIR, never a crystal).
 */
export const SEALED_MINEABLE_BLOCKS: ReadonlySet<BlockType> = new Set([
    BlockType.POSITIVE_MAGNETITE_CRYSTAL,
    BlockType.NEGATIVE_MAGNETITE_CRYSTAL,
]);
