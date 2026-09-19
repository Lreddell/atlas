// Gate 0: Deterministic first-world campaign graph.
// Distinct concepts: Biome (local ecology) vs Campaign region (macro chapter
// domain) vs Encounter site (authored boss/location volume).
//
// New canonical worlds: Heartwood origin at (0,0) + later regions along a
// seed-dependent wandering chain in fixed type order. Boundaries are irregular
// low-frequency masks with transition belts. Reservations happen before
// decoration so caves/vegetation cannot cut apart critical volumes.

export const CAMPAIGN_SCHEMA_VERSION = 1;
export const WORLDGEN_VERSION = 1;

export type CampaignRegionType =
  | 'heartwood'
  | 'sunscar'
  | 'frostbound'
  | 'tidelost'
  | 'shattered_meridian'
  | 'meridian_engine';

export const CAMPAIGN_REGION_ORDER: CampaignRegionType[] = [
  'heartwood',
  'sunscar',
  'frostbound',
  'tidelost',
  'shattered_meridian',
  'meridian_engine',
];

export interface RegionAnchor {
  type: CampaignRegionType;
  /** World-space anchor in blocks. */
  x: number;
  z: number;
  /** Approximate domain radius in blocks. */
  radius: number;
  /** Seed-derived rotation/bearing in radians. */
  bearing: number;
  distanceFromPrevious: number;
}

export interface EncounterSiteReservation {
  id: string;
  region: CampaignRegionType;
  kind: 'required_boss' | 'optional_guardian' | 'landmark' | 'waystone' | 'transition';
  bossId?: string;
  x: number;
  y: number;
  z: number;
  radius: number;
  approachX: number;
  approachY: number;
  approachZ: number;
}

export interface CampaignGraph {
  schema: number;
  worldgenVersion: number;
  seedNum: number;
  isRetrofit: boolean;
  retrofitNote?: string;
  anchors: RegionAnchor[];
  sites: EncounterSiteReservation[];
  createdAt: number;
}

/** Persisted world-meta snapshot shape (mirrors WorldMetadata.campaignGraph). */
export interface CampaignGraphSnapshot {
  schema: number;
  worldgenVersion: number;
  seedNum: number;
  isRetrofit: boolean;
  anchors: { type: string; x: number; z: number; radius: number }[];
}

/** Lossless snapshot for world metadata (sites re-reserve at runtime). */
export function toSnapshot(graph: CampaignGraph): CampaignGraphSnapshot {
  return {
    schema: graph.schema,
    worldgenVersion: graph.worldgenVersion,
    seedNum: graph.seedNum,
    isRetrofit: graph.isRetrofit,
    anchors: graph.anchors.map((a) => ({ type: a.type, x: a.x, z: a.z, radius: a.radius })),
  };
}

/** Rehydrate a snapshot into a live graph (sites re-reserve deterministically). */
export function fromSnapshot(snapshot: CampaignGraphSnapshot): CampaignGraph {
  const graph = generateCampaignGraph(snapshot.seedNum, snapshot.isRetrofit);
  graph.schema = snapshot.schema;
  graph.worldgenVersion = snapshot.worldgenVersion;
  return graph;
}

function hashSeed(seedNum: number, salt: string): number {
  let h = seedNum >>> 0;
  for (let i = 0; i < salt.length; i++) {
    h = Math.imul(h ^ salt.charCodeAt(i), 2654435761);
    h = (h << 13) | (h >>> 19);
    h >>>= 0;
  }
  return h >>> 0;
}

function seededUnit(seedNum: number, salt: string): number {
  return hashSeed(seedNum, salt) / 4294967296;
}

/**
 * Deterministic wandering chain. Direction/distance vary by seed; region order
 * is fixed. Design targets: domains ~2500-4000 blocks across, useful-edge
 * spacing ~1500-3000 blocks (tuned by travel time, not sacred constants).
 */
export function generateCampaignGraph(seedNum: number, isRetrofit = false): CampaignGraph {
  const anchors: RegionAnchor[] = [];
  let x = 0;
  let z = 0;
  let bearing = seededUnit(seedNum, 'origin-bearing') * Math.PI * 2;

  CAMPAIGN_REGION_ORDER.forEach((type, index) => {
    if (index === 0) {
      anchors.push({
        type,
        x: 0,
        z: 0,
        radius: 1600,
        bearing: 0,
        distanceFromPrevious: 0,
      });
      return;
    }
    // Wander: bearing drifts, distance stays in useful-edge band.
    const drift = (seededUnit(seedNum, `drift-${type}`) - 0.5) * 1.6;
    bearing += drift;
    const distance = 1800 + seededUnit(seedNum, `dist-${type}`) * 1200;
    x += Math.cos(bearing) * distance;
    z += Math.sin(bearing) * distance;
    anchors.push({
      type,
      x: Math.round(x),
      z: Math.round(z),
      radius: type === 'meridian_engine' ? 500 : 1500,
      bearing,
      distanceFromPrevious: Math.round(distance),
    });
  });

  return {
    schema: CAMPAIGN_SCHEMA_VERSION,
    worldgenVersion: WORLDGEN_VERSION,
    seedNum,
    isRetrofit,
    anchors,
    sites: [],
    createdAt: Date.now(),
  };
}

export function getRegionAnchor(graph: CampaignGraph, type: CampaignRegionType): RegionAnchor | undefined {
  return graph.anchors.find((a) => a.type === type);
}

/**
 * Query macro region membership by position without forcing biome logic to
 * know the campaign. Nearest-anchor-wins with irregular low-frequency wobble
 * so boundaries are porous, not perfect rings.
 */
export function getCampaignRegionAt(
  graph: CampaignGraph,
  x: number,
  z: number,
): CampaignRegionType {
  let best: RegionAnchor | null = null;
  let bestScore = Infinity;
  for (const anchor of graph.anchors) {
    const dx = x - anchor.x;
    const dz = z - anchor.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    // Low-frequency wobble: deterministic per position, +/- 12%.
    const wobble =
      1 +
      0.12 *
        Math.sin(x * 0.0011 + anchor.bearing) *
        Math.cos(z * 0.0009 - anchor.bearing);
    const score = dist / (anchor.radius * wobble);
    if (score < bestScore) {
      bestScore = score;
      best = anchor;
    }
  }
  return best ? best.type : 'heartwood';
}

export function reserveEncounterSite(
  graph: CampaignGraph,
  site: EncounterSiteReservation,
): void {
  if (graph.sites.some((s) => s.id === site.id)) {
    throw new Error(`Duplicate encounter site id: ${site.id}`);
  }
  graph.sites.push({ ...site });
}

export interface GraphValidationIssue {
  siteId?: string;
  message: string;
}

export function validateCampaignGraph(graph: CampaignGraph): GraphValidationIssue[] {
  const issues: GraphValidationIssue[] = [];
  if (graph.schema !== CAMPAIGN_SCHEMA_VERSION) {
    issues.push({ message: `Unsupported campaign schema: ${graph.schema}` });
  }
  const anchorTypes = graph.anchors.map((a) => a.type).join(',');
  const expected = CAMPAIGN_REGION_ORDER.join(',');
  if (anchorTypes !== expected) {
    issues.push({ message: `Region order must be ${expected}, got ${anchorTypes}` });
  }
  const heartwood = getRegionAnchor(graph, 'heartwood');
  if (!graph.isRetrofit && heartwood && (heartwood.x !== 0 || heartwood.z !== 0)) {
    issues.push({ message: 'Canonical Heartwood origin must be at (0,0).' });
  }
  // Protected volumes must not illegally overlap.
  for (let i = 0; i < graph.sites.length; i++) {
    for (let j = i + 1; j < graph.sites.length; j++) {
      const a = graph.sites[i];
      const b = graph.sites[j];
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const dz = a.z - b.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist < a.radius + b.radius) {
        issues.push({
          siteId: `${a.id}<->${b.id}`,
          message: `Encounter volumes overlap: ${a.id} and ${b.id}`,
        });
      }
    }
  }
  return issues;
}
