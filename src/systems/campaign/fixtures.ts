// Gate 0: Deterministic fixture worlds + dev harness hooks.
// Fixtures represent new world, retrofit world, each region unlocked,
// all keystones, and post-finale state without console gymnastics.

import type { CampaignGraph } from './campaignGraph';
import { generateCampaignGraph } from './campaignGraph';
import type { PreviewScenario } from './previewScenarios';

export type FixtureKind =
  | 'new_world'
  | 'retrofit_world'
  | 'region_unlocked'
  | 'all_keystones'
  | 'post_finale';

export interface CampaignFixture {
  kind: FixtureKind;
  seedNum: number;
  graph: CampaignGraph;
  preview?: PreviewScenario;
  notes: string;
}

export function createFixture(kind: FixtureKind, seedNum: number): CampaignFixture {
  const isRetrofit = kind === 'retrofit_world';
  const graph = generateCampaignGraph(seedNum, isRetrofit);
  const notes: Record<FixtureKind, string> = {
    new_world: 'Canonical origin at (0,0), no progression.',
    retrofit_world: 'Retrofit exception: frontier beyond explored envelope.',
    region_unlocked: 'Target region unlocked with prior keystones intact.',
    all_keystones: 'All five regional keystones owned; Engine convergence ready.',
    post_finale: 'First Surveyor defeated; Atlas Seal owned; world gate dormant/active.',
  };
  return { kind, seedNum, graph, notes: notes[kind] };
}

export function listFixtureKinds(): FixtureKind[] {
  return ['new_world', 'retrofit_world', 'region_unlocked', 'all_keystones', 'post_finale'];
}
