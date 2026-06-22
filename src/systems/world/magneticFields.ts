// Magnetic Fields biome — centralized constants and deterministic helpers.
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
// A future selector noise can pick WHICH boss biome activates at a center.
//
// This module stays enum-free (no BlockType import) so its math is unit-testable
// under Node's --experimental-strip-types runner. The noise is injected as a
// plain `noise2D(x, z) => ~[-1, 1]` sampler so callers pass NoiseSet.bossBiome and
// tests can pass a deterministic stub.

export const MAGNETIC_FIELDS_BIOME_ID = 'magnetic_fields';
export const MAGNETIC_FIELDS_REGION_ID = 'magnetic_fields';
export const MAGNETIC_WARDEN_BOSS_ID = 'magnetic_warden';

export type Noise2D = (x: number, z: number) => number;

// --- Rarity / size ---
// Size (radius) is intentionally compact and fixed. Rarity is tuned so boss biomes
// feel like a genuine expedition find: instances sit ~20k blocks apart on average.
export const MF_CELL = 2560;            // grid spacing between candidate centers (blocks)
export const MF_RADIUS = 256;           // base biome radius (warped per-edge); kept compact
export const MF_FIELD_FREQ = 0.0009;    // boss-biome noise frequency for center activation
export const MF_FIELD_THRESHOLD = 0.55; // center activates only where the field peaks (rare)

// --- Natural (non-circular) shaping ---
export const MF_EDGE_FREQ = 0.011;      // boundary wobble frequency
export const MF_EDGE_AMP = 0.28;        // boundary radius varies by ±28% → organic outline
export const MF_TIER_WARP_FREQ = 0.02;  // cliff-ring wobble frequency
export const MF_TIER_WARP_AMP = 16;     // cliff rings shift in/out by up to 16 blocks

// Gentle per-column surface variation so shelves read as natural rock, not a table.
export const MF_SHELF_JITTER_FREQ = 0.075;
export const MF_SHELF_JITTER_AMP = 1.8;  // ≈ ±2 blocks of bumpiness on shelves

// Outer apron: within this many blocks of the boundary, the outer shelf ramps down
// to the surrounding terrain so the biome blends in rather than ending in a wall.
// Kept just below sea level so an ocean edge becomes a soft rocky shore, not a cliff.
export const MF_APRON = 64;
export const MF_APRON_MIN_Y = 60;

// --- Central arena plateau ---
// The arena is a large generated structure (see magneticArena.ts), so the flat
// plateau it sits on must be sized to match its footprint. The tiers then lead up
// from the biome edge to this plateau.
export const MF_ARENA_RADIUS = 80;                       // flat plateau the arena sits on
export const MF_ARENA_FLOOR_Y = 132;                     // world Y of the plateau / arena base

// --- Tier (height-band) layout, outer rim inward to the arena plateau ---
export const MF_BASE_HEIGHT = 70;       // outer shelf surface (world Y of tier 0)
export const MF_TIER_HEIGHT = 12;       // vertical rise of each flat magnetite wall
export const MF_TIER_COUNT = 5;         // shelves: tier 0 (outer) .. tier 4 (plateau rim)
// Tiers occupy the radial band between the plateau edge and the biome boundary.
export const MF_TIER_BAND = (MF_RADIUS - MF_ARENA_RADIUS) / MF_TIER_COUNT;

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
    const jx = hash3(cx, 1, cz, worldSeed ^ 0x6669656c);
    const jz = hash3(cx, 2, cz, worldSeed ^ 0x6473);
    // Keep centers away from cell edges so warped regions never touch a neighbour.
    return {
        centerX: cx * MF_CELL + Math.floor((0.25 + jx * 0.5) * MF_CELL),
        centerZ: cz * MF_CELL + Math.floor((0.25 + jz * 0.5) * MF_CELL),
    };
};

/** A center activates only where the boss-biome field peaks (→ rare, natural). */
const isCenterActive = (inst: MagneticFieldInstance, noise2D: Noise2D): boolean =>
    noise2D(inst.centerX * MF_FIELD_FREQ, inst.centerZ * MF_FIELD_FREQ) > MF_FIELD_THRESHOLD;

/** Warped (non-circular) effective radius for the region boundary at (wx, wz). */
const warpedRadius = (wx: number, wz: number, noise2D: Noise2D): number =>
    MF_RADIUS * (1 + MF_EDGE_AMP * noise2D(wx * MF_EDGE_FREQ, wz * MF_EDGE_FREQ));

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
    const baseCx = Math.floor(wx / MF_CELL);
    const baseCz = Math.floor(wz / MF_CELL);
    const maxReach = MF_RADIUS * (1 + MF_EDGE_AMP);
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
    const reach = MF_RADIUS * (1 + MF_EDGE_AMP);
    const c0x = Math.floor((minX - reach) / MF_CELL);
    const c1x = Math.floor((maxX + reach) / MF_CELL);
    const c0z = Math.floor((minZ - reach) / MF_CELL);
    const c1z = Math.floor((maxZ + reach) / MF_CELL);
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

/**
 * Tier index (0 = outer shelf .. MF_TIER_COUNT-1 = arena rim) for a radial
 * distance to the center. Closer to center = higher tier = taller/harder. This is
 * what makes terrain converge inward in stable height bands rather than a bowl.
 */
export function getMagneticFieldTier(distanceToCenter: number): number {
    const d = Math.max(0, distanceToCenter - MF_ARENA_RADIUS);
    const tier = MF_TIER_COUNT - 1 - Math.floor(d / MF_TIER_BAND);
    return Math.max(0, Math.min(MF_TIER_COUNT - 1, tier));
}

/** Flat shelf surface height (world Y) for a given tier. */
export function getMagneticFieldTierHeight(tier: number): number {
    return MF_BASE_HEIGHT + tier * MF_TIER_HEIGHT;
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
 * MF_TIER_HEIGHT, the band edges become vertical magnetite walls — natural shelves
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

    const dx = wx - instance.centerX;
    const dz = wz - instance.centerZ;
    const rawDist = Math.sqrt(dx * dx + dz * dz);
    const edgeDistance = Math.max(0, warpedRadius(wx, wz, noise2D) - rawDist);
    // Warp the radial distance so the cliff rings (and thus the walls) are organic
    // rather than perfectly concentric circles.
    const warpedDist = Math.max(
        0,
        rawDist + MF_TIER_WARP_AMP * noise2D(wx * MF_TIER_WARP_FREQ, wz * MF_TIER_WARP_FREQ),
    );

    if (warpedDist <= MF_ARENA_RADIUS) {
        // The arena floor stays perfectly flat for the boss fight.
        return { instance, distance: warpedDist, tier: MF_TIER_COUNT - 1, surfaceY: MF_ARENA_FLOOR_Y, isArena: true, edgeDistance };
    }
    const tier = getMagneticFieldTier(warpedDist);
    const jitter = Math.round(noise2D(wx * MF_SHELF_JITTER_FREQ, wz * MF_SHELF_JITTER_FREQ) * MF_SHELF_JITTER_AMP);
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

export type ShelfDecoration = 'none' | 'crystal_pos' | 'crystal_neg';

/**
 * A deliberate, sparse Magnetic Fields feature rooted at (rootWx, rootWz), or null.
 * Currently only resource crystal clusters — the spike/spire/launch-pad formations
 * are deferred (to be redesigned later). Magnets on the cliff walls and the tiered
 * terrain remain the structural traversal content.
 */
export type MagneticFeature =
    | { kind: 'crystals'; polarity: number; count: number }
    | null;

export function getMagneticFeature(rootWx: number, rootWz: number, worldSeed: number): MagneticFeature {
    const r = hash3(rootWx, 41, rootWz, worldSeed ^ 0x66656174);
    const h = (salt: number) => hash3(rootWx, salt, rootWz, worldSeed ^ 0x66656174);
    if (r < 0.0030) return { kind: 'crystals', polarity: h(45) < 0.5 ? 1 : -1, count: 1 + Math.floor(h(46) * 3) };
    return null;
}

/** Active instance centers within `margin` of the box (for the arena build pass). */
export function getActiveCenters(
    minX: number, minZ: number, maxX: number, maxZ: number,
    worldSeed: number, noise2D: Noise2D, margin: number,
): MagneticFieldInstance[] {
    const out: MagneticFieldInstance[] = [];
    const c0x = Math.floor((minX - margin) / MF_CELL);
    const c1x = Math.floor((maxX + margin) / MF_CELL);
    const c0z = Math.floor((minZ - margin) / MF_CELL);
    const c1z = Math.floor((maxZ + margin) / MF_CELL);
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
    return { x: inst.centerX, y: MF_ARENA_FLOOR_Y, z: inst.centerZ };
}
