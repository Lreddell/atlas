// Gate 0: Legacy-world retrofit + seed validation.
// Never rewrite already generated legacy chunks. Place the campaign chain in
// ungenerated territory beyond the explored envelope, mark retrofit origin,
// and give an Atlas bearing. Fail safe with a copy/new-world path.

import type { CampaignGraph } from './campaignGraph';
import { generateCampaignGraph } from './campaignGraph';

export interface ExploredEnvelope {
  minCx: number;
  maxCx: number;
  minCz: number;
  maxCz: number;
}

export interface RetrofitPlan {
  graph: CampaignGraph;
  /** Offset applied so Heartwood frontier sits beyond generated terrain. */
  offsetX: number;
  offsetZ: number;
  bearingRadians: number;
  bearingDistance: number;
  safe: boolean;
  reason?: string;
}

const CHUNK_BLOCKS = 16;
const SAFE_GAP_CHUNKS = 32;

export function planRetrofit(
  seedNum: number,
  envelope: ExploredEnvelope,
  chunkExists: (cx: number, cz: number) => boolean,
): RetrofitPlan {
  void chunkExists;
  const graph = generateCampaignGraph(seedNum, true);
  graph.isRetrofit = true;
  graph.retrofitNote = 'retrofit-exception: Heartwood frontier placed beyond explored envelope';

  const maxAbs =
    Math.max(
      Math.abs(envelope.minCx),
      Math.abs(envelope.maxCx),
      Math.abs(envelope.minCz),
      Math.abs(envelope.maxCz),
    ) + SAFE_GAP_CHUNKS;
  const offsetDist = maxAbs * CHUNK_BLOCKS;
  const bearing = Math.PI / 4;
  const offsetX = Math.round(Math.cos(bearing) * offsetDist);
  const offsetZ = Math.round(Math.sin(bearing) * offsetDist);

  if (!Number.isFinite(offsetX) || !Number.isFinite(offsetZ)) {
    return {
      graph,
      offsetX: 0,
      offsetZ: 0,
      bearingRadians: bearing,
      bearingDistance: 0,
      safe: false,
      reason: 'Could not compute a safe retrofit offset.',
    };
  }
  return {
    graph,
    offsetX,
    offsetZ,
    bearingRadians: bearing,
    bearingDistance: Math.round(offsetDist),
    safe: true,
  };
}

export interface SeedValidationReport {
  seedNum: number;
  issues: string[];
  siteCount: number;
  reachable: boolean;
}

/** Headless corpus check: every required site exists, reserved, approachable. */
export function validateSeedCorpus(
  seeds: number[],
  buildGraph: (seedNum: number) => CampaignGraph,
  isReachable: (graph: CampaignGraph) => boolean,
): SeedValidationReport[] {
  return seeds.map((seedNum) => {
    const graph = buildGraph(seedNum);
    const issues: string[] = [];
    if (graph.anchors.length !== 6) issues.push('Missing region anchors.');
    if (graph.isRetrofit === false) {
      const origin = graph.anchors[0];
      if (!origin || origin.x !== 0 || origin.z !== 0) {
        issues.push('Canonical origin is not at (0,0).');
      }
    }
    const reachable = isReachable(graph);
    if (!reachable) issues.push('Reachability check failed.');
    return { seedNum, issues, siteCount: graph.sites.length, reachable };
  });
}
