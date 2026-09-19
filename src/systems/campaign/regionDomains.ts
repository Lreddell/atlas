// Gate 0: Region domain generation + existing-biome preservation.
// The campaign-region layer is macro geography; existing local biome identity
// remains useful inside it. This file maps macro affinity without replacing
// the biome catalog or rewriting old chunks.

import type { CampaignRegionType } from './campaignGraph';

export const MACRO_BIOME_AFFINITY: Record<CampaignRegionType, string[]> = {
  heartwood: [
    'plains',
    'forest',
    'birch_forest',
    'flower_forest',
    'dark_forest',
    'meadow',
    'cherry_grove',
    'river',
    'mountains',
    'stone_shore',
  ],
  sunscar: [
    'desert',
    'savanna',
    'red_mesa',
    'mesa_bryce',
    'volcanic_crags',
    'beach',
    'stone_shore',
  ],
  frostbound: [
    'tundra',
    'taiga',
    'ice_spikes',
    'mountains',
    'frozen_river',
    'frozen_ocean',
    'stone_shore',
  ],
  tidelost: ['jungle', 'swamp', 'river', 'ocean', 'beach', 'stone_shore'],
  shattered_meridian: ['magnetic_fields', 'mountains', 'stone_shore'],
  meridian_engine: [],
};

export interface DomainQuery {
  region: CampaignRegionType;
  /** 0 at anchor center, ~1 at domain edge, >1 in transition/wilderness. */
  normalizedDistance: number;
  /** True when inside a transition belt between two regions. */
  inTransitionBelt: boolean;
  /** Local biome id (preserved) alongside macro membership. */
  localBiomeId?: string;
}

export function isBiomeAffinityMatch(region: CampaignRegionType, biomeId: string): boolean {
  return MACRO_BIOME_AFFINITY[region].includes(biomeId);
}

/**
 * Classify a world position into macro + micro identity. Wilderness pockets
 * off the intended route remain valid explorer space; this only labels them.
 */
export function classifyDomainPosition(
  region: CampaignRegionType,
  normalizedDistance: number,
  localBiomeId?: string,
): DomainQuery {
  return {
    region,
    normalizedDistance,
    inTransitionBelt: normalizedDistance > 0.85 && normalizedDistance < 1.25,
    localBiomeId,
  };
}

/** Transition belts introduce destination mechanics at reduced complexity. */
export function getTransitionHint(
  from: CampaignRegionType,
  to: CampaignRegionType,
): string {
  const hints: Record<string, string> = {
    'heartwood-sunscar': 'Dry winds carry grit. Shade and water matter ahead.',
    'sunscar-frostbound': 'Steam hisses where hot stone meets cold air.',
    'frostbound-tidelost': 'Meltwater runs green. The canopy drinks the thaw.',
    'tidelost-shattered_meridian': 'Compass needles tremble near black sand.',
    'shattered_meridian-meridian_engine': 'Field lines converge. The Engine hums below.',
  };
  return hints[`${from}-${to}`] ?? 'The land changes. Old rules thin out.';
}
