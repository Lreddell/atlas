// Gate 0 proving blocks: the first dynamically registered content.
//
// These three blocks are PRODUCTION content (not fixtures): they exercise the
// authoritative registry path end to end with numeric ids >= 256, past the
// legacy Uint8 ceiling. Allocation order is fixed and asserted, so every
// session resolves identical numerics:
//
//   atlas:gate0_proving_stone    -> 256 (opaque survey stone; mining drill)
//   atlas:gate0_proving_waystone -> 257 (interactive travel node)
//   atlas:gate0_proving_anchor   -> 258 (interactive respawn anchor)
//
// Registered once at startup via initCampaignContent(), before atlas init,
// so mesh/light/atlas/save paths all observe them.

import { allocateWorldBlockId } from '../../systems/registry/blockRegistry';
import { BlockType } from '../../types';

export const PROVING_STONE_NUMERIC = 256;
export const PROVING_WAYSTONE_NUMERIC = 257;
export const PROVING_ANCHOR_NUMERIC = 258;

export const PROVING_STONE_ID = 'atlas:gate0_proving_stone';
export const PROVING_WAYSTONE_ID = 'atlas:gate0_proving_waystone';
export const PROVING_ANCHOR_ID = 'atlas:gate0_proving_anchor';

let registered = false;

export function registerGate0ProvingBlocks(): { stone: number; waystone: number; anchor: number } {
  if (registered) {
    return { stone: PROVING_STONE_NUMERIC, waystone: PROVING_WAYSTONE_NUMERIC, anchor: PROVING_ANCHOR_NUMERIC };
  }
  registered = true;
  const stone = allocateWorldBlockId(PROVING_STONE_ID, {
    color: '#3f5a52',
    name: 'Gate0 Proving Stone',
    textureSlot: 267,
    hardness: 2,
    preferredTool: 'pickaxe',
    minHarvestTier: 1,
    category: 'building',
    drops: [{ type: PROVING_STONE_NUMERIC as BlockType, chance: 1, min: 1, max: 1 }],
  });
  const waystone = allocateWorldBlockId(PROVING_WAYSTONE_ID, {
    color: '#4a3a6e',
    name: 'Gate0 Proving Waystone',
    textureSlot: 268,
    hardness: 3,
    preferredTool: 'pickaxe',
    minHarvestTier: 1,
    lightLevel: 7,
    category: 'functional',
    drops: [{ type: PROVING_WAYSTONE_NUMERIC as BlockType, chance: 1, min: 1, max: 1 }],
  });
  const anchor = allocateWorldBlockId(PROVING_ANCHOR_ID, {
    color: '#6e4a2a',
    name: 'Gate0 Proving Anchor',
    textureSlot: 269,
    hardness: 3,
    preferredTool: 'pickaxe',
    minHarvestTier: 1,
    lightLevel: 5,
    category: 'functional',
    drops: [{ type: PROVING_ANCHOR_NUMERIC as BlockType, chance: 1, min: 1, max: 1 }],
  });
  // Deterministic allocation order is a save-compatibility invariant: worlds
  // persist numerics, so these must resolve identically every session.
  if (stone !== PROVING_STONE_NUMERIC || waystone !== PROVING_WAYSTONE_NUMERIC || anchor !== PROVING_ANCHOR_NUMERIC) {
    throw new Error(
      `Gate0 proving-block allocation drift: got ${stone}/${waystone}/${anchor}, ` +
      `expected ${PROVING_STONE_NUMERIC}/${PROVING_WAYSTONE_NUMERIC}/${PROVING_ANCHOR_NUMERIC}. ` +
      `Registration order changed; fix initCampaignContent() before shipping.`,
    );
  }
  return { stone, waystone, anchor };
}

export function resetGate0ProvingBlocksForTests(): void {
  registered = false;
}
