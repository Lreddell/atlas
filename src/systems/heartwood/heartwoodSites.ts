// Heartwood Marches site layout + sub-biome classification (Stage 3).
//
// Deterministic from (seed) only: every site position, bearing, and volume
// derives from integer hashes, so main thread, worker, queries, and tests
// agree exactly. Terrain height overrides are pure functions of (x, z) so
// generation and gameplay queries can never disagree at chunk borders.
//
// Sub-biomes (surface classification):
// - meadow: Founder's Meadow disc around the origin (spawn basin).
// - downs: Furrow Downs around the amphitheater.
// - briar: Briarwall Woods around the Keep.
// - grove: Crownroot Grove around the stag amphitheater.
// - underwood: depth overlay (y-based) beneath the Heartwood disc.
// Outside all volumes the classifier returns null (ordinary biomes rule).

export type HeartwoodSubBiome = 'meadow' | 'downs' | 'briar' | 'grove';

export interface HeartwoodSiteVolume {
  id: string;
  kind: 'required_boss' | 'optional_guardian' | 'landmark' | 'waystone' | 'transition' | 'amphitheater' | 'keep' | 'outpost' | 'shrine' | 'cairn' | 'ringing_stone' | 'bell_tower' | 'farm' | 'grove_stand' | 'vault_entrance' | 'waystone_hub' | 'hunting_ground' | 'mill' | 'spire' | 'gate' | 'marker';
  x: number;
  z: number;
  radius: number;
}

export interface HeartwoodLayout {
  seedNum: number;
  meadowRadius: number;
  amphitheater: { x: number; z: number; radius: number; floorY: number };
  stagAmphitheater: { x: number; z: number; radius: number; floorY: number };
  keep: {
    x: number; z: number; half: number; gateX: number; gateZ: number;
    /** Wall side the gate pierces, offset along it, and the 3 wall cells. */
    gateSide: 'n' | 's' | 'e' | 'w';
    gateAt: number;
    gateCells: { x: number; z: number }[];
  };
  bellTower: { x: number; z: number };
  cairns: { x: number; z: number }[];
  ringingStones: { x: number; z: number }[];
  farm: { x: number; z: number };
  groveStands: { x: number; z: number }[];
  outposts: { x: number; z: number }[];
  shrines: { x: number; z: number }[];
  spires: { x: number; z: number }[];
  vaultEntrance: { x: number; z: number };
  waystoneHub: { x: number; z: number };
  huntingGrounds: { x: number; z: number }[];
  mill: { x: number; z: number };
  routes: { x: number; z: number }[][];
}

function hwHash(seedNum: number, salt: string): number {
  let h = seedNum >>> 0;
  for (let i = 0; i < salt.length; i++) {
    h = Math.imul(h ^ salt.charCodeAt(i), 2654435761);
    h = (h << 13) | (h >>> 19);
    h >>>= 0;
  }
  return h >>> 0;
}

function hwUnit(seedNum: number, salt: string): number {
  return hwHash(seedNum, salt) / 4294967296;
}

function polar(cx: number, cz: number, bearing: number, dist: number): { x: number; z: number } {
  return { x: Math.round(cx + Math.cos(bearing) * dist), z: Math.round(cz + Math.sin(bearing) * dist) };
}

const layoutCache = new Map<number, HeartwoodLayout>();

/** Full deterministic site layout for a world seed. Cached per seed. */
export function getHeartwoodLayout(seedNum: number): HeartwoodLayout {
  const cached = layoutCache.get(seedNum);
  if (cached) return cached;
  // Bearings spread around the compass with seed drift; sites chain outward
  // meadow -> downs -> keep -> grove -> vault so travel reads as a journey.
  const b1 = hwUnit(seedNum, 'hw-b1') * Math.PI * 2;
  const b2 = b1 + 1.1 + hwUnit(seedNum, 'hw-b2') * 0.8;
  const b3 = b2 + 1.1 + hwUnit(seedNum, 'hw-b3') * 0.8;
  const b4 = b3 + 1.2 + hwUnit(seedNum, 'hw-b4') * 0.7;
  const amphitheater = { ...polar(0, 0, b1, 500 + hwUnit(seedNum, 'hw-d1') * 80), radius: 42, floorY: 0 };
  const keepP = polar(0, 0, b2, 880 + hwUnit(seedNum, 'hw-d2') * 80);
  const groveP = polar(0, 0, b3, 1280 + hwUnit(seedNum, 'hw-d3') * 80);
  const stagAmphitheater = { ...groveP, radius: 36, floorY: 0 };
  const vaultEntrance = polar(groveP.x, groveP.z, b3 + 0.35, 150);
  const mill = polar(0, 0, b4, 1020 + hwUnit(seedNum, 'hw-d4') * 80);
  const bellTower = polar(0, 0, b1 + 2.4, 185);
  const farm = polar(0, 0, b1 - 0.5, 95);
  const waystoneHub = polar(0, 0, b2 - 0.6, 125);
  const cairns = [polar(0, 0, b4 + 0.4, 70), polar(0, 0, b2 + 2.8, 120)];
  const ringingStones = [polar(0, 0, b1 + 0.3, 140), polar(0, 0, b1 - 0.2, 300), polar(0, 0, b2 + 0.15, 620)];
  const groveStands = [polar(0, 0, b4 - 0.5, 150), polar(0, 0, b3 - 0.9, 420), polar(groveP.x, groveP.z, b3 + 2.2, 120)];
  const outposts = [polar(keepP.x, keepP.z, b2 + Math.PI, 220), polar(keepP.x, keepP.z, b2 + Math.PI - 0.4, 330), polar(keepP.x, keepP.z, b2 + Math.PI + 0.4, 330)];
  const shrines = [polar(groveP.x, groveP.z, b3 + 1.4, 90), polar(groveP.x, groveP.z, b3 - 1.4, 95), polar(groveP.x, groveP.z, b3 + 3.1, 80)];
  const spires = [polar(0, 0, b1 + 1.2, 640), polar(0, 0, b2 - 0.8, 700), polar(0, 0, b3 + 0.7, 1050), polar(0, 0, b4 + 1.6, 900)];
  const huntingGrounds = [polar(0, 0, b1 - 1.5, 760), polar(0, 0, b2 + 1.8, 1100), polar(0, 0, b4 - 1.1, 860)];
  // Keep gate faces back along the approach (toward the origin side).
  // The gate CELLS sit in the wall line (axis-aligned with the gap), while
  // gateX/gateZ marks the approach point just outside for navigation.
  const gateBearing = Math.atan2(0 - keepP.z, 0 - keepP.x);
  const gate = polar(keepP.x, keepP.z, gateBearing, 22);
  const gateSide: 'n' | 's' | 'e' | 'w' = Math.abs(gate.x - keepP.x) > Math.abs(gate.z - keepP.z)
    ? (gate.x > keepP.x ? 'e' : 'w')
    : (gate.z > keepP.z ? 's' : 'n');
  const gateAt = gateSide === 'e' || gateSide === 'w' ? gate.z - keepP.z : gate.x - keepP.x;
  const gateWall = ((): number => {
    if (gateSide === 'e') return keepP.x + 22;
    if (gateSide === 'w') return keepP.x - 22;
    if (gateSide === 's') return keepP.z + 22;
    return keepP.z - 22;
  })();
  const gateCells = (gateSide === 'e' || gateSide === 'w'
    ? [{ x: gateWall, z: keepP.z + gateAt - 1 }, { x: gateWall, z: keepP.z + gateAt }, { x: gateWall, z: keepP.z + gateAt + 1 }]
    : [{ x: keepP.x + gateAt - 1, z: gateWall }, { x: keepP.x + gateAt, z: gateWall }, { x: keepP.x + gateAt + 1, z: gateWall }]);
  const layout: HeartwoodLayout = {
    seedNum,
    meadowRadius: 220,
    amphitheater, stagAmphitheater,
    keep: { ...keepP, half: 22, gateX: gate.x, gateZ: gate.z, gateSide, gateAt, gateCells },
    bellTower, cairns, ringingStones, farm, groveStands, outposts, shrines,
    spires, vaultEntrance, waystoneHub, huntingGrounds, mill,
    routes: [
      [ { x: 0, z: 0 }, { x: amphitheater.x, z: amphitheater.z }, { x: keepP.x, z: keepP.z } ],
      [ { x: keepP.x, z: keepP.z }, { x: groveP.x, z: groveP.z }, { x: vaultEntrance.x, z: vaultEntrance.z } ],
      [ { x: 0, z: 0 }, { x: mill.x, z: mill.z } ],
    ],
  };
  layoutCache.set(seedNum, layout);
  return layout;
}

/** Surface sub-biome at a column, or null outside Heartwood volumes. */
export function getHeartwoodSubBiome(x: number, z: number, seedNum: number): HeartwoodSubBiome | null {
  const layout = getHeartwoodLayout(seedNum);
  if (Math.hypot(x, z) <= layout.meadowRadius) return 'meadow';
  if (Math.hypot(x - layout.amphitheater.x, z - layout.amphitheater.z) <= 260) return 'downs';
  if (Math.hypot(x - layout.keep.x, z - layout.keep.z) <= 320) return 'briar';
  if (Math.hypot(x - layout.stagAmphitheater.x, z - layout.stagAmphitheater.z) <= 300) return 'grove';
  return null;
}

/** Underwood depth overlay: caves beneath the Heartwood disc. */
export function isHeartwoodUnderwood(x: number, z: number, y: number, _seedNum: number): boolean {
  if (y > 40) return false;
  return Math.hypot(x, z) <= 1500;
}

/**
 * Terrain height override for site footprints (level + plateau). Pure
 * function of (x, z): generation and queries always agree.
 *
 * Each site pulls columns toward a seed-derived datum by at most 3 blocks,
 * fading to zero pull over the outer 8 blocks (smooth rim blend, no seam
 * cliffs). Bounded pull keeps volumes embedded in all terrain instead of
 * floating above valleys or burying under hills, while still reading as
 * leveled arena/keep ground. Visible terracing comes from stamped walls.
 */
export function getHeartwoodHeightOverride(x: number, z: number, seedNum: number, naturalHeight: number): number | null {
  const layout = getHeartwoodLayout(seedNum);
  const datum = 68 + (hwHash(seedNum, 'hw-datum') % 8);
  const sites = [
    { x: layout.amphitheater.x, z: layout.amphitheater.z, radius: layout.amphitheater.radius },
    { x: layout.stagAmphitheater.x, z: layout.stagAmphitheater.z, radius: layout.stagAmphitheater.radius },
    { x: layout.keep.x, z: layout.keep.z, radius: 30 },
  ];
  for (const site of sites) {
    const d = Math.hypot(x - site.x, z - site.z);
    if (d > site.radius) continue;
    const edge = Math.max(0, Math.min(1, (d - (site.radius - 8)) / 8));
    const blend = edge * edge * (3 - 2 * edge);
    const pull = Math.max(-3, Math.min(3, datum - naturalHeight)) * (1 - blend);
    return Math.round(naturalHeight + pull);
  }
  return null;
}

/** All reserved site volumes (validation + reservation tooling). */
export function getHeartwoodSites(seedNum: number): HeartwoodSiteVolume[] {
  const layout = getHeartwoodLayout(seedNum);
  const sites: HeartwoodSiteVolume[] = [
    { id: 'hw:amphitheater', kind: 'amphitheater', x: layout.amphitheater.x, z: layout.amphitheater.z, radius: layout.amphitheater.radius },
    { id: 'hw:stag_amphitheater', kind: 'amphitheater', x: layout.stagAmphitheater.x, z: layout.stagAmphitheater.z, radius: layout.stagAmphitheater.radius },
    { id: 'hw:keep', kind: 'keep', x: layout.keep.x, z: layout.keep.z, radius: 30 },
    { id: 'hw:vault_entrance', kind: 'landmark', x: layout.vaultEntrance.x, z: layout.vaultEntrance.z, radius: 26 },
    { id: 'hw:waystone_hub', kind: 'waystone', x: layout.waystoneHub.x, z: layout.waystoneHub.z, radius: 18 },
    { id: 'hw:bell_tower', kind: 'bell_tower', x: layout.bellTower.x, z: layout.bellTower.z, radius: 12 },
    { id: 'hw:farm', kind: 'landmark', x: layout.farm.x, z: layout.farm.z, radius: 20 },
    { id: 'hw:mill', kind: 'landmark', x: layout.mill.x, z: layout.mill.z, radius: 24 },
  ];
  layout.cairns.forEach((c, i) => sites.push({ id: `hw:cairn_${i}`, kind: 'cairn', x: c.x, z: c.z, radius: 6 }));
  layout.ringingStones.forEach((c, i) => sites.push({ id: `hw:ringing_${i}`, kind: 'ringing_stone', x: c.x, z: c.z, radius: 6 }));
  layout.groveStands.forEach((c, i) => sites.push({ id: `hw:grove_${i}`, kind: 'grove_stand', x: c.x, z: c.z, radius: 30 }));
  layout.outposts.forEach((c, i) => sites.push({ id: `hw:outpost_${i}`, kind: 'outpost', x: c.x, z: c.z, radius: 16 }));
  layout.shrines.forEach((c, i) => sites.push({ id: `hw:shrine_${i}`, kind: 'shrine', x: c.x, z: c.z, radius: 10 }));
  layout.spires.forEach((c, i) => sites.push({ id: `hw:spire_${i}`, kind: 'landmark', x: c.x, z: c.z, radius: 10 }));
  layout.huntingGrounds.forEach((c, i) => sites.push({ id: `hw:hunt_${i}`, kind: 'landmark', x: c.x, z: c.z, radius: 30 }));
  return sites;
}

export function clearHeartwoodLayoutCacheForTests(): void {
  layoutCache.clear();
}
