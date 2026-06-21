// Magnetic Fields biome — centralized constants and deterministic helpers.
//
// The Magnetic Fields biome is a RARE, HUGE, TIERED magnetic-convergence biome.
// It is NOT a crater. Terrain organizes inward toward a single deterministic
// center and coalesces there through flat height tiers (shelves) separated by
// tall flat magnetite walls, leading to one grand central boss arena.
//
// Everything here is pure + deterministic (seeded by world seed only) so that
// generation, /locate, arena placement, and tests all agree without storage.
// This module is intentionally enum-free (no BlockType import) so its math can be
// unit-tested under Node's --experimental-strip-types runner. Block-type sets that
// need the enum live in ./magneticFieldsBlocks.

export const MAGNETIC_FIELDS_BIOME_ID = 'magnetic_fields';
export const MAGNETIC_FIELDS_REGION_ID = 'magnetic_fields';
export const MAGNETIC_WARDEN_BOSS_ID = 'magnetic_warden';

/**
 * Rarity / size. Magnetic Fields instances are placed on a very low-frequency
 * deterministic grid: at most one candidate center per CELL × CELL cells, and a
 * per-cell hash gate keeps only a small fraction of cells. Each surviving
 * instance is RADIUS blocks across — very large — so the biome is rare but huge
 * and coherent (not scattered fragments).
 */
export const MF_CELL = 4096;          // grid spacing between candidate centers (blocks)
export const MF_SPAWN_CHANCE = 0.18;  // fraction of cells that actually host an instance
export const MF_RADIUS = 720;         // biome influence radius from center (blocks)

/** Tier (height-band) layout, from outer rim inward to the central arena. */
export const MF_BASE_HEIGHT = 70;     // outer shelf height (world Y of tier 0 surface)
export const MF_TIER_HEIGHT = 18;     // vertical rise of each flat magnetite wall
export const MF_TIER_COUNT = 5;       // shelves: tier 0 (outer) .. tier 4 (arena rim)
export const MF_TIER_BAND = MF_RADIUS / MF_TIER_COUNT; // radial width of each shelf

/** Central arena footprint (radius, in blocks, around the deterministic center). */
export const MF_ARENA_RADIUS = 40;
export const MF_ARENA_FLOOR_Y = MF_BASE_HEIGHT + MF_TIER_HEIGHT * MF_TIER_COUNT;

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

/**
 * The deterministic Magnetic Fields instance whose influence covers (wx, wz),
 * or null if none. Each grid cell may host one center, jittered within the cell
 * and gated by a per-cell hash so only ~MF_SPAWN_CHANCE of cells qualify.
 *
 * Because spacing (MF_CELL) is far larger than the influence radius (MF_RADIUS),
 * instances never overlap and each covered position resolves to exactly one
 * center — giving every biome instance ONE coherent center (and one arena).
 */
export function getMagneticFieldInstanceAt(
    wx: number,
    wz: number,
    worldSeed: number,
): MagneticFieldInstance | null {
    const baseCx = Math.floor(wx / MF_CELL);
    const baseCz = Math.floor(wz / MF_CELL);
    // Check the home cell and neighbours (a center near a cell edge can still
    // reach across into this position).
    for (let dcx = -1; dcx <= 1; dcx++) {
        for (let dcz = -1; dcz <= 1; dcz++) {
            const cx = baseCx + dcx;
            const cz = baseCz + dcz;
            if (hash3(cx, 0, cz, worldSeed ^ 0x4d61676e) >= MF_SPAWN_CHANCE) continue;
            const jx = hash3(cx, 1, cz, worldSeed ^ 0x6669656c);
            const jz = hash3(cx, 2, cz, worldSeed ^ 0x6473) ;
            const centerX = cx * MF_CELL + Math.floor(jx * MF_CELL);
            const centerZ = cz * MF_CELL + Math.floor(jz * MF_CELL);
            const dx = wx - centerX;
            const dz = wz - centerZ;
            if (dx * dx + dz * dz <= MF_RADIUS * MF_RADIUS) {
                return { centerX, centerZ };
            }
        }
    }
    return null;
}

/** True if (wx, wz) lies inside any Magnetic Fields instance. */
export function isInMagneticFields(wx: number, wz: number, worldSeed: number): boolean {
    return getMagneticFieldInstanceAt(wx, wz, worldSeed) !== null;
}

/**
 * Tier index (0 = outer shelf .. MF_TIER_COUNT-1 = arena rim) for a position,
 * derived purely from radial distance to the instance center. Closer to center
 * = higher tier = taller/harder. This is what makes terrain "converge inward"
 * in stable height bands rather than forming a bowl/crater.
 */
export function getMagneticFieldTier(distanceToCenter: number): number {
    const tier = MF_TIER_COUNT - 1 - Math.floor(distanceToCenter / MF_TIER_BAND);
    return Math.max(0, Math.min(MF_TIER_COUNT - 1, tier));
}

/** Flat shelf surface height (world Y) for a given tier. */
export function getMagneticFieldTierHeight(tier: number): number {
    return MF_BASE_HEIGHT + tier * MF_TIER_HEIGHT;
}

/** True only at the single arena center column of the covering instance. */
export function getArenaCenter(
    wx: number,
    wz: number,
    worldSeed: number,
): { x: number; y: number; z: number } | null {
    const inst = getMagneticFieldInstanceAt(wx, wz, worldSeed);
    if (!inst) return null;
    return { x: inst.centerX, y: MF_ARENA_FLOOR_Y, z: inst.centerZ };
}
