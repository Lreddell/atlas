// Magnetic Fields biome, config-driven deterministic helpers.
//
// The Magnetic Fields biome is a RARE, HUGE, TIERED magnetic-convergence biome.
// It is NOT a crater. Terrain organizes inward toward a single deterministic
// center and coalesces there through flat height tiers (shelves) separated by
// tall flat magnetite walls, leading to one grand central boss arena.
//
// Placement is driven by a dedicated low-frequency "boss biome" noise channel:
// candidate centers sit on a sparse grid and only ACTIVATE where that noise peaks,
// so instances are rare and naturally placed. The biome boundary and tier rings
// are warped by the same noise so the region reads as organic rock, not a circle.
//
// All tunables live in GenConfig.bossDomains.magneticFields (editable from the
// World Editor, saved with presets/worlds). The MF_* constants exported below are
// the immutable DEFAULTS, kept for compatibility and for callers that want the
// stock values. Everything here reads the LIVE config so the editor previews and
// the worker generation stay in sync.
//
// This module stays enum-free (no BlockType import) so its math is unit-testable
// under Node's --experimental-strip-types runner. The noise is injected as a
// plain `noise2D(x, z) => ~[-1, 1]` sampler so callers pass NoiseSet.bossBiome and
// tests can pass a deterministic stub.

// Imported with an explicit .ts extension so Node's type-stripping test runner
// can resolve it (the bundler resolves it identically).
import { GenConfig, DEFAULTS } from './genConfig.ts';

export const MAGNETIC_FIELDS_BIOME_ID = 'magnetic_fields';
export const MAGNETIC_FIELDS_REGION_ID = 'magnetic_fields';
export const MAGNETIC_WARDEN_BOSS_ID = 'magnetic_warden';

export type Noise2D = (x: number, z: number) => number;

export type MagneticFieldsConfig = typeof DEFAULTS.bossDomains.magneticFields;

/** Live tunables (mutated by the World Editor / preset loading). */
export const getMagneticFieldsConfig = (): MagneticFieldsConfig => GenConfig.bossDomains.magneticFields;

// --- Compatibility defaults (the stock config values) ---
const D = DEFAULTS.bossDomains.magneticFields;
export const MF_CELL = D.cell;
export const MF_RADIUS = D.radius;
export const MF_FIELD_FREQ = D.fieldFreq;
export const MF_FIELD_THRESHOLD = D.fieldThreshold;
export const MF_EDGE_FREQ = D.edgeFreq;
export const MF_EDGE_AMP = D.edgeAmp;
export const MF_TIER_WARP_FREQ = D.tierWarpFreq;
export const MF_TIER_WARP_AMP = D.tierWarpAmp;
export const MF_SHELF_JITTER_FREQ = D.shelfJitterFreq;
export const MF_SHELF_JITTER_AMP = D.shelfJitterAmp;
export const MF_APRON = D.apron;
export const MF_APRON_MIN_Y = D.apronMinY;
export const MF_ARENA_RADIUS = D.arenaRadius;
export const MF_ARENA_FLOOR_Y = D.arenaFloorY;
export const MF_BASE_HEIGHT = D.baseHeight;
export const MF_TIER_HEIGHT = D.tierHeight;
export const MF_TIER_COUNT = D.tierCount;

/** Fall-damage multiplier when a player lands on a Magnetic Spike. */
export const MAGNETIC_SPIKE_FALL_MULTIPLIER = 2.5;

// --- Deterministic hashing (matches the worldgen seeded-hash style) ---

const hash3 = (x: number, y: number, z: number, seed: number): number => {
    let h = Math.imul((x | 0) ^ seed, 374761393);
    h = Math.imul(h ^ (y | 0), 668265263);
    h = Math.imul(h ^ (z | 0), 2147483647);
    h ^= h >>> 13;
    h = Math.imul(h, 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
};

export interface MagneticFieldInstance {
    centerX: number;
    centerZ: number;
}

/** Deterministic jittered center for a grid cell. */
const cellCenter = (cx: number, cz: number, worldSeed: number): MagneticFieldInstance => {
    const cell = getMagneticFieldsConfig().cell;
    const jx = hash3(cx, 1, cz, worldSeed ^ 0x6669656c);
    const jz = hash3(cx, 2, cz, worldSeed ^ 0x6473);
    // Keep centers away from cell edges so warped regions never touch a neighbour.
    return {
        centerX: cx * cell + Math.floor((0.25 + jx * 0.5) * cell),
        centerZ: cz * cell + Math.floor((0.25 + jz * 0.5) * cell),
    };
};

/** A center activates only where the boss-biome field peaks (→ rare, natural). */
const isCenterActive = (inst: MagneticFieldInstance, noise2D: Noise2D): boolean => {
    const c = getMagneticFieldsConfig();
    if (!c.enabled) return false;
    return noise2D(inst.centerX * c.fieldFreq, inst.centerZ * c.fieldFreq) > c.fieldThreshold;
};

/** Warped (non-circular) effective radius for the region boundary at (wx, wz). */
const warpedRadius = (wx: number, wz: number, noise2D: Noise2D): number => {
    const c = getMagneticFieldsConfig();
    return c.radius * (1 + c.edgeAmp * noise2D(wx * c.edgeFreq, wz * c.edgeFreq));
};

/**
 * The active Magnetic Fields instance covering (wx, wz), or null. Only the home
 * cell and immediate neighbours can reach a position (radius << cell spacing), and
 * the cheap hash/distance test short-circuits before any noise sampling for the
 * common far-from-everything case.
 */
export function getMagneticFieldInstanceAt(
    wx: number,
    wz: number,
    worldSeed: number,
    noise2D: Noise2D,
): MagneticFieldInstance | null {
    const c = getMagneticFieldsConfig();
    if (!c.enabled) return null;
    const baseCx = Math.floor(wx / c.cell);
    const baseCz = Math.floor(wz / c.cell);
    const maxReach = c.radius * (1 + c.edgeAmp);
    for (let dcx = -1; dcx <= 1; dcx++) {
        for (let dcz = -1; dcz <= 1; dcz++) {
            const inst = cellCenter(baseCx + dcx, baseCz + dcz, worldSeed);
            const dx = wx - inst.centerX;
            const dz = wz - inst.centerZ;
            const dist = Math.sqrt(dx * dx + dz * dz);
            if (dist > maxReach) continue;                 // far: no noise work
            if (!isCenterActive(inst, noise2D)) continue;  // center didn't activate
            if (dist <= warpedRadius(wx, wz, noise2D)) return inst;
        }
    }
    return null;
}

/** True if (wx, wz) lies inside any active Magnetic Fields instance. */
export function isInMagneticFields(wx: number, wz: number, worldSeed: number, noise2D: Noise2D): boolean {
    return getMagneticFieldInstanceAt(wx, wz, worldSeed, noise2D) !== null;
}

/**
 * Cheap chunk-level reject: does any active instance reach the axis-aligned box
 * [minX,maxX]×[minZ,maxZ]? Lets the (rare) biome's per-chunk feature passes
 * early-out for the vast majority of chunks without scanning every column.
 */
export function magneticFieldsTouchBox(
    minX: number, minZ: number, maxX: number, maxZ: number,
    worldSeed: number, noise2D: Noise2D,
): boolean {
    const c = getMagneticFieldsConfig();
    if (!c.enabled) return false;
    const reach = c.radius * (1 + c.edgeAmp);
    const c0x = Math.floor((minX - reach) / c.cell);
    const c1x = Math.floor((maxX + reach) / c.cell);
    const c0z = Math.floor((minZ - reach) / c.cell);
    const c1z = Math.floor((maxZ + reach) / c.cell);
    for (let cx = c0x; cx <= c1x; cx++) {
        for (let cz = c0z; cz <= c1z; cz++) {
            const inst = cellCenter(cx, cz, worldSeed);
            if (!isCenterActive(inst, noise2D)) continue;
            const dx = Math.max(minX - inst.centerX, 0, inst.centerX - maxX);
            const dz = Math.max(minZ - inst.centerZ, 0, inst.centerZ - maxZ);
            if (dx * dx + dz * dz <= reach * reach) return true;
        }
    }
    return false;
}

/** Radial width of one tier band (plateau edge → biome boundary, tierCount bands). */
export function getMagneticFieldTierBand(): number {
    const c = getMagneticFieldsConfig();
    return Math.max(1, (c.radius - c.arenaRadius) / Math.max(1, c.tierCount));
}

/**
 * Tier index (0 = outer shelf .. tierCount-1 = arena rim) for a radial
 * distance to the center. Closer to center = higher tier = taller/harder. This is
 * what makes terrain converge inward in stable height bands rather than a bowl.
 */
export function getMagneticFieldTier(distanceToCenter: number): number {
    const c = getMagneticFieldsConfig();
    const d = Math.max(0, distanceToCenter - c.arenaRadius);
    const tier = c.tierCount - 1 - Math.floor(d / getMagneticFieldTierBand());
    return Math.max(0, Math.min(c.tierCount - 1, tier));
}

/** Flat shelf surface height (world Y) for a given tier. */
export function getMagneticFieldTierHeight(tier: number): number {
    const c = getMagneticFieldsConfig();
    return c.baseHeight + tier * c.tierHeight;
}

export interface MagneticFieldColumn {
    instance: MagneticFieldInstance;
    distance: number;
    tier: number;
    surfaceY: number;
    isArena: boolean;
    /** Distance (blocks) from this column to the warped outer boundary (>= 0). */
    edgeDistance: number;
}

/**
 * Full per-column resolution for terrain generation: which instance, the warped
 * radial distance (for wavy cliff rings), the tier, the flat-but-bumpy shelf
 * surface Y, the central-arena flag, and how close the column is to the outer
 * boundary (for edge blending). Returns null outside the biome.
 *
 * Because each tier maps to one near-flat Y and adjacent tiers differ by
 * tierHeight, the band edges become vertical magnetite walls, natural shelves
 * separated by tall climb walls, converging on the arena.
 */
export function getMagneticFieldColumn(
    wx: number,
    wz: number,
    worldSeed: number,
    noise2D: Noise2D,
): MagneticFieldColumn | null {
    const instance = getMagneticFieldInstanceAt(wx, wz, worldSeed, noise2D);
    if (!instance) return null;
    const c = getMagneticFieldsConfig();

    const dx = wx - instance.centerX;
    const dz = wz - instance.centerZ;
    const rawDist = Math.sqrt(dx * dx + dz * dz);
    const edgeDistance = Math.max(0, warpedRadius(wx, wz, noise2D) - rawDist);
    // Warp the radial distance so the cliff rings (and thus the walls) are organic
    // rather than perfectly concentric circles.
    const warpedDist = Math.max(
        0,
        rawDist + c.tierWarpAmp * noise2D(wx * c.tierWarpFreq, wz * c.tierWarpFreq),
    );

    if (warpedDist <= c.arenaRadius) {
        // The arena floor stays perfectly flat for the boss fight.
        return { instance, distance: warpedDist, tier: c.tierCount - 1, surfaceY: c.arenaFloorY, isArena: true, edgeDistance };
    }
    const tier = getMagneticFieldTier(warpedDist);
    const jitter = Math.round(noise2D(wx * c.shelfJitterFreq, wz * c.shelfJitterFreq) * c.shelfJitterAmp);
    return { instance, distance: warpedDist, tier, surfaceY: getMagneticFieldTierHeight(tier) + jitter, isArena: false, edgeDistance };
}

// --- Wall magnetism + decoration placement (pure, hash-driven) ---

/**
 * Whether a magnetite cliff wall at (wx, wz) carries a climbable magnet, and its
 * polarity: 0 = bare magnetite, 1 = Positive Magnetite Block, -1 = Negative.
 * Magnets appear in coarse clusters covering only part of the walls, so the player
 * must wrap around a spire to find a route rather than climbing anywhere.
 */
export function getMagnetiteWallPolarity(wx: number, wz: number, worldSeed: number): number {
    const cx = Math.floor(wx / 6);
    const cz = Math.floor(wz / 6);
    if (hash3(cx, 11, cz, worldSeed ^ 0x77616c6c) >= 0.4) return 0; // ~40% of walls magnetized
    return hash3(cx, 12, cz, worldSeed ^ 0x706f6c) < 0.5 ? 1 : -1;
}

/**
 * A deliberate, sparse Magnetic Fields feature rooted at (rootWx, rootWz), or null.
 * The exploration content between the boundary and the arena:
 *   - crystals:   harvestable resource crystal clusters (crafting material)
 *   - shards:     bright emissive shard clusters (light + decoration + loot)
 *   - vein:       charged-magnetite decorative vein patches on the shelf
 *   - spikes:     hazard patches that multiply fall damage (avoid when launching)
 *   - launchPad:  3×3 polarity pad flush with the shelf: hold the SAME polarity
 *                 to be flung upward/away, the OPPOSITE to be pulled in, the
 *                 traversal lesson for the arena, taught tier by tier
 *   - pylon:      broken/intact magnetite-brick pylons with a charged beacon top
 *                 (landmarks that read as a route toward the center)
 *   - ruin:       collapsed magnetite-brick ruin, sometimes sheltering a cache
 *                 chest seeded with deterministic loot
 * Roots are hash-driven (deterministic, chunk-border safe).
 */
export type MagneticFeature =
    | { kind: 'crystals'; polarity: number; count: number }
    | { kind: 'shards'; count: number }
    | { kind: 'vein'; size: number }
    | { kind: 'spikes'; radius: number }
    | { kind: 'launchPad'; polarity: number }
    | { kind: 'pylon'; height: number; broken: boolean }
    | { kind: 'ruin'; size: number; withCache: boolean; rotation: number }
    | null;

export function getMagneticFeature(rootWx: number, rootWz: number, worldSeed: number): MagneticFeature {
    const r = hash3(rootWx, 41, rootWz, worldSeed ^ 0x66656174);
    const h = (salt: number) => hash3(rootWx, salt, rootWz, worldSeed ^ 0x66656174);
    // Cumulative rarity bands (per column root, so densities are per-block):
    if (r < 0.0030) return { kind: 'crystals', polarity: h(45) < 0.5 ? 1 : -1, count: 1 + Math.floor(h(46) * 3) };
    if (r < 0.0042) return { kind: 'shards', count: 1 + Math.floor(h(47) * 2) };
    if (r < 0.0058) return { kind: 'vein', size: 2 + Math.floor(h(48) * 3) };
    if (r < 0.0070) return { kind: 'spikes', radius: 1 + Math.floor(h(49) * 2) };
    if (r < 0.00745) return { kind: 'launchPad', polarity: h(50) < 0.5 ? 1 : -1 };
    if (r < 0.00765) return { kind: 'pylon', height: 6 + Math.floor(h(51) * 6), broken: h(52) < 0.45 };
    if (r < 0.00775) return { kind: 'ruin', size: 4 + Math.floor(h(53) * 3), withCache: h(54) < 0.6, rotation: Math.floor(h(55) * 4) };
    return null;
}

/**
 * Deterministic loot for a Magnetic Fields cache chest at (x, y, z). Returns
 * item ids/counts as plain numbers (no BlockType import), the caller maps them.
 * Slots are chosen deterministically so a cache always contains the same loot
 * for the same world seed.
 */
export interface CacheLootEntry { itemId: number; count: number; slot: number }

export function getMagneticCacheLoot(
    x: number, y: number, z: number, worldSeed: number,
    ids: {
        magnetiteBlock: number; magnetiteBricks: number; positiveCrystal: number;
        negativeCrystal: number; shard: number; chargedMagnetite: number;
        ironIngot: number; goldIngot: number; diamond: number;
    },
): CacheLootEntry[] {
    const h = (salt: number) => hash3(x ^ Math.imul(y, 31), salt, z, worldSeed ^ 0x63616368);
    const out: CacheLootEntry[] = [];
    const usedSlots = new Set<number>();
    const pickSlot = (salt: number): number => {
        for (let i = 0; i < 27; i++) {
            const s = Math.floor(h(salt + i * 7) * 27);
            if (!usedSlots.has(s)) { usedSlots.add(s); return s; }
        }
        return usedSlots.size % 27;
    };
    const add = (itemId: number, count: number, salt: number) => {
        if (count <= 0) return;
        out.push({ itemId, count, slot: pickSlot(salt) });
    };
    // Guaranteed magnetite building material + crystals of both polarities.
    add(ids.magnetiteBricks, 4 + Math.floor(h(1) * 9), 100);
    add(ids.magnetiteBlock, 3 + Math.floor(h(2) * 6), 110);
    add(ids.positiveCrystal, 1 + Math.floor(h(3) * 3), 120);
    add(ids.negativeCrystal, 1 + Math.floor(h(4) * 3), 130);
    // Common extras.
    if (h(5) < 0.7) add(ids.shard, 1 + Math.floor(h(6) * 2), 140);
    if (h(7) < 0.5) add(ids.chargedMagnetite, 1 + Math.floor(h(8) * 2), 150);
    if (h(9) < 0.6) add(ids.ironIngot, 2 + Math.floor(h(10) * 4), 160);
    // Rare treats.
    if (h(11) < 0.25) add(ids.goldIngot, 1 + Math.floor(h(12) * 3), 170);
    if (h(13) < 0.10) add(ids.diamond, 1, 180);
    return out;
}

/** Active instance centers within `margin` of the box (for the arena build pass). */
export function getActiveCenters(
    minX: number, minZ: number, maxX: number, maxZ: number,
    worldSeed: number, noise2D: Noise2D, margin: number,
): MagneticFieldInstance[] {
    const c = getMagneticFieldsConfig();
    if (!c.enabled) return [];
    const out: MagneticFieldInstance[] = [];
    const c0x = Math.floor((minX - margin) / c.cell);
    const c1x = Math.floor((maxX + margin) / c.cell);
    const c0z = Math.floor((minZ - margin) / c.cell);
    const c1z = Math.floor((maxZ + margin) / c.cell);
    for (let cx = c0x; cx <= c1x; cx++) {
        for (let cz = c0z; cz <= c1z; cz++) {
            const inst = cellCenter(cx, cz, worldSeed);
            if (!isCenterActive(inst, noise2D)) continue;
            if (inst.centerX >= minX - margin && inst.centerX <= maxX + margin
                && inst.centerZ >= minZ - margin && inst.centerZ <= maxZ + margin) {
                out.push(inst);
            }
        }
    }
    return out;
}

/** The single arena center of the instance covering (wx, wz), or null. */
export function getArenaCenter(
    wx: number,
    wz: number,
    worldSeed: number,
    noise2D: Noise2D,
): { x: number; y: number; z: number } | null {
    const inst = getMagneticFieldInstanceAt(wx, wz, worldSeed, noise2D);
    if (!inst) return null;
    return { x: inst.centerX, y: getMagneticFieldsConfig().arenaFloorY, z: inst.centerZ };
}

/**
 * The nearest ACTIVE Magnetic Fields center to (wx, wz) within `searchRadius`
 * blocks, or null. Scans candidate grid cells outward, cheap (one hash + one
 * noise sample per cell) even for very large search radii.
 */
export function findNearestMagneticField(
    wx: number, wz: number, worldSeed: number, noise2D: Noise2D,
    searchRadius = 50000,
): { centerX: number; centerZ: number; distance: number } | null {
    const c = getMagneticFieldsConfig();
    if (!c.enabled) return null;
    const baseCx = Math.floor(wx / c.cell);
    const baseCz = Math.floor(wz / c.cell);
    const maxRings = Math.max(1, Math.ceil(searchRadius / c.cell) + 1);
    let bestX = 0, bestZ = 0, bestDist = Infinity;
    for (let ring = 0; ring <= maxRings; ring++) {
        for (let dcx = -ring; dcx <= ring; dcx++) {
            for (let dcz = -ring; dcz <= ring; dcz++) {
                if (Math.max(Math.abs(dcx), Math.abs(dcz)) !== ring) continue; // ring shell only
                const inst = cellCenter(baseCx + dcx, baseCz + dcz, worldSeed);
                if (!isCenterActive(inst, noise2D)) continue;
                const dist = Math.hypot(wx - inst.centerX, wz - inst.centerZ);
                if (dist < bestDist) { bestX = inst.centerX; bestZ = inst.centerZ; bestDist = dist; }
            }
        }
        // A hit this ring can't be beaten by a later ring once the ring's inner
        // edge exceeds the best distance.
        if (bestDist < Infinity && (ring + 1) * c.cell - c.cell * 0.75 > bestDist) break;
    }
    return bestDist <= searchRadius ? { centerX: bestX, centerZ: bestZ, distance: bestDist } : null;
}
