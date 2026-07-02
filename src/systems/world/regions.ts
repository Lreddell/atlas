// Region system: maps world positions to named "regions" that the progression
// layer can seal/cleanse. A sealed region cannot be edited (place/break) until
// its boss is defeated.
//
// MVP: a region is derived directly from the biome at a position (deterministic,
// needs no per-chunk storage — biomes are noise-derived via getBiome). The
// REGION_DEFS table marks which biomes are sealed-by-default and ties each to a
// boss. This is intentionally pluggable: a future version can resolve regions
// from authored bounding boxes / structures instead of biome id without changing
// callers of getRegionAt().

import { getBiome } from './biomes';

export interface RegionDef {
    /** Stable id used as the key in ProgressionStore. */
    id: string;
    /** Boss whose defeat cleanses this region. */
    bossId: string;
    displayName: string;
    /** Hex color for a future sealed-region world tint overlay. */
    tintColor: number;
    /** If true, the region starts sealed and must be cleansed to edit. */
    sealedByDefault: boolean;
}

// Keyed by biome id (see getBiome().id). Biomes without an entry are ordinary,
// freely-editable terrain (getRegionAt returns null for them).
//
// NOTE: Volcanic Crags is deliberately NOT a region. It used to be declared as a
// sealed "Cinder Reach" boss region, but no Cinder boss or summoner altar ever
// generated there, which left the biome permanently unmineable. It is now an
// ordinary climate/terrain biome; a future volcanic boss can re-add an entry
// here (old worlds that carry a stale 'volcanic' progression key simply ignore it).
const REGION_DEFS: Record<string, RegionDef> = {
    magnetic_fields: {
        id: 'magnetic_fields',
        bossId: 'magnetic_warden',
        displayName: 'Magnetic Fields',
        tintColor: 0x7b5bd6,
        sealedByDefault: true,
    },
};

/** All declared regions (for HUD/codex listing and debug commands). */
export function getAllRegions(): RegionDef[] {
    return Object.values(REGION_DEFS);
}

export function getRegionById(id: string): RegionDef | undefined {
    return REGION_DEFS[id];
}

/**
 * The region a world position belongs to, or null for ordinary terrain.
 * y is accepted for future vertical regions but unused in the biome-based MVP.
 */
export function getRegionAt(x: number, _y: number, z: number): RegionDef | null {
    const biome = getBiome(Math.floor(x), Math.floor(z));
    return REGION_DEFS[biome.id] ?? null;
}
