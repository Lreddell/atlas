// Which ambient particles fill the air around the camera, as shares of the two
// particle pools (glowing and matte). Pure, so the rules stay testable; the
// renderer (components/world/AmbientParticles.tsx) eases toward these values.

export interface AmbientEnvironment {
    biomeId: string;
    /** The biome carries the 'snowy' tag. */
    snowyTag: boolean;
    /** Light at the camera cell, 0..15. */
    skyLight: number;
    blockLight: number;
    /** Sun direction's height, -1..1 (atlasSunDir.y). */
    sunHeight: number;
    /** The camera is inside water or lava. */
    inFluid: boolean;
}

export interface AmbientMix {
    /** Glowing pool. */
    fireflies: number;
    embers: number;
    sparks: number;
    /** Matte pool. */
    pollen: number;
    snow: number;
    dust: number;
}

const FIREFLY_BIOMES = new Set(['plains', 'forest', 'flower_forest', 'meadow', 'swamp', 'jungle', 'birch_forest', 'dark_forest', 'cherry_grove', 'savanna']);
const POLLEN_BIOMES = new Set(['plains', 'flower_forest', 'meadow', 'cherry_grove', 'savanna', 'jungle', 'forest', 'birch_forest']);
const SNOW_BIOMES = new Set(['tundra', 'ice_spikes', 'frozen_ocean', 'frozen_river', 'taiga']);
const MAGNETIC_FIELDS = 'magnetic_fields';

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

export function ambientMix(env: AmbientEnvironment): AmbientMix {
    if (env.inFluid) return { fireflies: 0, embers: 0, sparks: 0, pollen: 0, snow: 0, dust: 0 };
    const night = clamp01((-env.sunHeight - 0.02) / 0.1);
    const day = clamp01((env.sunHeight - 0.05) / 0.1);
    const openSky = env.skyLight >= 12 ? 1 : 0;
    const underground = env.skyLight < 6;
    return {
        fireflies: FIREFLY_BIOMES.has(env.biomeId) ? 0.35 * night * openSky : 0,
        embers: env.biomeId === 'volcanic' && env.skyLight >= 8 ? 0.7 : 0,
        sparks: env.biomeId === MAGNETIC_FIELDS ? 0.55 : 0,
        pollen: POLLEN_BIOMES.has(env.biomeId) ? 0.25 * day * openSky : 0,
        snow: (SNOW_BIOMES.has(env.biomeId) || env.snowyTag) && env.skyLight >= 10 ? 0.85 : 0,
        // Dust hangs in the dark underground, and shows best near a light.
        dust: underground ? (env.blockLight >= 6 ? 0.4 : 0.15) : 0,
    };
}
