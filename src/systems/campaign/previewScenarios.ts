// Gate 0: Campaign preview / scenario provenance.
// A region must be playable before earlier chapters exist. Preview scenarios
// use production content with curated loadouts and explicit provenance that
// never fabricates canonical clears or contaminates Standard saves.

import type { CampaignRegionType } from './campaignGraph';

export type WorldProvenance = 'standard' | 'preview';

export interface PreviewScenario {
  id: string;
  targetRegion: CampaignRegionType;
  provenance: Extract<WorldProvenance, 'preview'>;
  /** Curated, versioned loadout equivalent to normal arrival state. */
  loadoutVersion: number;
  loadoutItems: { itemId: string; count: number }[];
  /** Canonical boss clears are always false in preview for missing priors. */
  fabricatedPriorClears: false;
  /** Preview grants cannot be exported into Standard worlds. */
  nonExportable: true;
  startX: number;
  startY: number;
  startZ: number;
}

export function createPreviewScenario(
  targetRegion: CampaignRegionType,
  loadoutVersion: number,
  loadoutItems: { itemId: string; count: number }[],
  start: { x: number; y: number; z: number },
): PreviewScenario {
  return {
    id: `${targetRegion}-preview`,
    targetRegion,
    provenance: 'preview',
    loadoutVersion,
    loadoutItems: [...loadoutItems],
    fabricatedPriorClears: false,
    nonExportable: true,
    startX: start.x,
    startY: start.y,
    startZ: start.z,
  };
}

export function isPreviewProvenance(provenance: WorldProvenance | undefined): boolean {
  return provenance === 'preview';
}

/** Preview progress must never mark missing earlier bosses canonically done. */
export function sanitizePreviewBossRecord(
  targetRegionBosses: string[],
  attemptedMarks: Record<string, boolean>,
): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const bossId of targetRegionBosses) {
    out[bossId] = attemptedMarks[bossId] === true;
  }
  return out;
}

export const PREVIEW_LOADOUT_VERSION = 1;
