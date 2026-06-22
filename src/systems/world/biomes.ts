import { BlockType } from '../../types';
import { GlobalNoise, SimpleNoise, NoiseSet } from '../../utils/noise';
import * as THREE from 'three';
import { GenConfig, NoiseType } from './genConfig';
import { isInMagneticFields, MF_BASE_HEIGHT } from './magneticFields';

export interface Biome {
    id: string;
    name: string;
    surfaceBlock: BlockType;
    subBlock: BlockType;
    waterBlock: BlockType;
    // Legacy biome metadata. Runtime terrain height comes from getBiomeHeightInfo.
    terrainScale: number;
    terrainBase: number;
    treeChance: number;
    treeType: 'oak' | 'spruce' | 'cherry' | 'birch' | 'jungle' | 'dark_oak' | 'acacia' | 'mixed_forest' | 'none';
    vegetationChance: number;
    color: string;
    /**
     * Drives ground-decor placement (grass, flowers, cactus, dead bush) in a
     * data-driven way so new biomes do not each need a hardcoded id branch in
     * chunkGeneration. Defaults to 'none' for backward compatibility.
     */
    vegetationType?: VegetationType;
    /**
     * Optional behavioral tags. 'snowy' triggers aurora rendering at night
     * (see DayNightCycle). Future tags can drive footstep sounds, etc.
     */
    tags?: string[];
}

export type VegetationType =
    | 'none'
    | 'forest'      // grass plant / dandelion / rose on grass
    | 'flowers'     // dense mixed flowers on grass
    | 'sparse'      // mostly tall grass, few flowers
    | 'desert'      // cactus + dead bush on sand
    | 'cherry'      // pink petals + grass on grass
    | 'savanna'     // tall grass + occasional dead bush on grass
    | 'jungle'      // dense grass + flowers, lush
    | 'taiga'       // dead bush + sparse grass on snowy grass
    | 'swamp';      // dead bush + grass on dirt

// Sea Level is 63
export const BIOMES: Record<string, Biome> = {
    OCEAN: {
        id: 'ocean', name: 'Ocean', surfaceBlock: BlockType.SAND, subBlock: BlockType.STONE, waterBlock: BlockType.WATER,
        terrainScale: 10, terrainBase: 45, treeChance: 0, treeType: 'none', vegetationChance: 0, color: '#000080', vegetationType: 'none'
    },
    FROZEN_OCEAN: {
        id: 'frozen_ocean', name: 'Frozen Ocean', surfaceBlock: BlockType.SNOWY_GRASS, subBlock: BlockType.STONE, waterBlock: BlockType.ICE,
        terrainScale: 10, terrainBase: 45, treeChance: 0, treeType: 'none', vegetationChance: 0, color: '#90caf9', vegetationType: 'none', tags: ['snowy']
    },
    RIVER: {
        id: 'river', name: 'River', surfaceBlock: BlockType.DIRT, subBlock: BlockType.DIRT, waterBlock: BlockType.WATER,
        terrainScale: 5, terrainBase: 58, treeChance: 0, treeType: 'none', vegetationChance: 0, color: '#304ffe', vegetationType: 'none'
    },
    FROZEN_RIVER: {
        id: 'frozen_river', name: 'Frozen River', surfaceBlock: BlockType.DIRT, subBlock: BlockType.DIRT, waterBlock: BlockType.ICE,
        terrainScale: 5, terrainBase: 58, treeChance: 0, treeType: 'none', vegetationChance: 0, color: '#a7c6ff', vegetationType: 'none', tags: ['snowy']
    },
    PLAINS: {
        id: 'plains', name: 'Plains', surfaceBlock: BlockType.GRASS, subBlock: BlockType.DIRT, waterBlock: BlockType.WATER,
        terrainScale: 20, terrainBase: 70, treeChance: 0.0009, treeType: 'oak', vegetationChance: 0.25, color: '#8db360', vegetationType: 'forest'
    },
    FOREST: {
        id: 'forest', name: 'Forest', surfaceBlock: BlockType.GRASS, subBlock: BlockType.DIRT, waterBlock: BlockType.WATER,
        terrainScale: 25, terrainBase: 72, treeChance: 0.035, treeType: 'mixed_forest', vegetationChance: 0.15, color: '#056621', vegetationType: 'forest'
    },
    DESERT: {
        id: 'desert', name: 'Desert', surfaceBlock: BlockType.SAND, subBlock: BlockType.SANDSTONE, waterBlock: BlockType.WATER,
        terrainScale: 15, terrainBase: 72, treeChance: 0, treeType: 'none', vegetationChance: 0.015, color: '#fa9418', vegetationType: 'desert'
    },
    TUNDRA: {
        id: 'tundra', name: 'Tundra', surfaceBlock: BlockType.SNOWY_GRASS, subBlock: BlockType.DIRT, waterBlock: BlockType.ICE,
        terrainScale: 35, terrainBase: 75, treeChance: 0.016, treeType: 'spruce', vegetationChance: 0.05, color: '#ffffff', vegetationType: 'none', tags: ['snowy']
    },
    CHERRY_GROVE: {
        id: 'cherry_grove', name: 'Cherry Grove', surfaceBlock: BlockType.GRASS, subBlock: BlockType.DIRT, waterBlock: BlockType.WATER,
        terrainScale: 45, terrainBase: 85, treeChance: 0.02, treeType: 'cherry', vegetationChance: 0.3, color: '#ffc0cb', vegetationType: 'cherry'
    },
    RED_MESA: {
        id: 'red_mesa', name: 'Red Mesa', surfaceBlock: BlockType.RED_SAND, subBlock: BlockType.RED_SANDSTONE, waterBlock: BlockType.WATER,
        terrainScale: 10, terrainBase: 72, treeChance: 0.0, treeType: 'none', vegetationChance: 0.02, color: '#d94515', vegetationType: 'desert'
    },
    MESA_BRYCE: {
        id: 'mesa_bryce', name: 'Mesa Bryce', surfaceBlock: BlockType.RED_SAND, subBlock: BlockType.TERRACOTTA_WHITE, waterBlock: BlockType.WATER,
        terrainScale: 10, terrainBase: 72, treeChance: 0.0, treeType: 'none', vegetationChance: 0.01, color: '#ff6f00', vegetationType: 'desert'
    },
    VOLCANIC: {
        id: 'volcanic', name: 'Volcanic Crags', surfaceBlock: BlockType.BASALT, subBlock: BlockType.BASALT, waterBlock: BlockType.LAVA,
        terrainScale: 85, terrainBase: 85, treeChance: 0, treeType: 'none', vegetationChance: 0, color: '#444444', vegetationType: 'none'
    },

    // ===== NEW BIOMES (Task ID 4) =====

    // Birch Forest — cool temperate forest dominated by white-barked birch.
    BIRCH_FOREST: {
        id: 'birch_forest', name: 'Birch Forest', surfaceBlock: BlockType.MOSSY_GRASS, subBlock: BlockType.DIRT, waterBlock: BlockType.WATER,
        terrainScale: 22, terrainBase: 73, treeChance: 0.06, treeType: 'birch', vegetationChance: 0.22, color: '#c8e6c9', vegetationType: 'forest'
    },
    // Flower Forest — temperate forest clearing bursting with flowers.
    FLOWER_FOREST: {
        id: 'flower_forest', name: 'Flower Forest', surfaceBlock: BlockType.LUSH_GRASS, subBlock: BlockType.DIRT, waterBlock: BlockType.WATER,
        terrainScale: 24, terrainBase: 73, treeChance: 0.018, treeType: 'mixed_forest', vegetationChance: 0.45, color: '#e91e63', vegetationType: 'flowers'
    },
    // Dark Forest — dense canopy of dark oak, gloomy floor with little undergrowth.
    DARK_FOREST: {
        id: 'dark_forest', name: 'Dark Forest', surfaceBlock: BlockType.DARK_GRASS, subBlock: BlockType.DIRT, waterBlock: BlockType.WATER,
        terrainScale: 28, terrainBase: 74, treeChance: 0.085, treeType: 'dark_oak', vegetationChance: 0.06, color: '#1b5e20', vegetationType: 'sparse'
    },
    // Meadow — cool, flat, open grassland with sparse birch and tall grass.
    MEADOW: {
        id: 'meadow', name: 'Meadow', surfaceBlock: BlockType.MEADOW_GRASS, subBlock: BlockType.DIRT, waterBlock: BlockType.WATER,
        terrainScale: 14, terrainBase: 80, treeChance: 0.004, treeType: 'birch', vegetationChance: 0.5, color: '#aed581', vegetationType: 'flowers'
    },
    // Savanna — warm dry grassland with sparse acacia trees and tall grass.
    SAVANNA: {
        id: 'savanna', name: 'Savanna', surfaceBlock: BlockType.SAVANNA_GRASS, subBlock: BlockType.DIRT, waterBlock: BlockType.WATER,
        terrainScale: 12, terrainBase: 71, treeChance: 0.005, treeType: 'acacia', vegetationChance: 0.4, color: '#c0ca33', vegetationType: 'savanna'
    },
    // Jungle — hot, humid, dense jungle trees with lush undergrowth.
    JUNGLE: {
        id: 'jungle', name: 'Jungle', surfaceBlock: BlockType.JUNGLE_GRASS, subBlock: BlockType.DIRT, waterBlock: BlockType.WATER,
        terrainScale: 30, terrainBase: 74, treeChance: 0.09, treeType: 'jungle', vegetationChance: 0.5, color: '#2e7d32', vegetationType: 'jungle'
    },
    // Taiga — cold snowy conifer forest, denser than Tundra.
    TAIGA: {
        id: 'taiga', name: 'Taiga', surfaceBlock: BlockType.PODZOL, subBlock: BlockType.DIRT, waterBlock: BlockType.ICE,
        terrainScale: 30, terrainBase: 74, treeChance: 0.055, treeType: 'spruce', vegetationChance: 0.08, color: '#90a4ae', vegetationType: 'taiga', tags: ['snowy']
    },
    // Ice Spikes — rare frozen plains packed with towering ice pillars.
    ICE_SPIKES: {
        id: 'ice_spikes', name: 'Ice Spikes', surfaceBlock: BlockType.SNOW_BLOCK, subBlock: BlockType.PACKED_ICE, waterBlock: BlockType.ICE,
        terrainScale: 8, terrainBase: 72, treeChance: 0, treeType: 'none', vegetationChance: 0, color: '#e1f5fe', vegetationType: 'none', tags: ['snowy']
    },
    // Mountains — soaring stone peaks with snow caps and spruce foothills.
    MOUNTAINS: {
        id: 'mountains', name: 'Mountains', surfaceBlock: BlockType.ANDESITE, subBlock: BlockType.STONE, waterBlock: BlockType.WATER,
        terrainScale: 70, terrainBase: 110, treeChance: 0.01, treeType: 'spruce', vegetationChance: 0.05, color: '#9e9e9e', vegetationType: 'sparse', tags: ['snowy']
    },
    // Swamp — low-lying, waterlogged dirtland with dead bushes and sparse oak.
    SWAMP: {
        id: 'swamp', name: 'Swamp', surfaceBlock: BlockType.MUD, subBlock: BlockType.DIRT, waterBlock: BlockType.WATER,
        terrainScale: 8, terrainBase: 64, treeChance: 0.014, treeType: 'oak', vegetationChance: 0.3, color: '#4e6e58', vegetationType: 'swamp'
    },
    // Stone Shore — barren rocky coast, no vegetation.
    STONE_SHORE: {
        id: 'stone_shore', name: 'Stone Shore', surfaceBlock: BlockType.MOSSY_COBBLESTONE, subBlock: BlockType.STONE, waterBlock: BlockType.WATER,
        terrainScale: 10, terrainBase: 62, treeChance: 0, treeType: 'none', vegetationChance: 0, color: '#757575', vegetationType: 'none'
    },
    // Magnetic Fields — rare, huge, tiered magnetic-convergence biome (sealed boss
    // region). Terrain/structure is driven by the deterministic instance system in
    // magneticFields.ts, not by ordinary noise; surface is metallic Magnetite.
    MAGNETIC_FIELDS: {
        id: 'magnetic_fields', name: 'Magnetic Fields', surfaceBlock: BlockType.MAGNETITE_BLOCK, subBlock: BlockType.MAGNETITE_BLOCK, waterBlock: BlockType.WATER,
        terrainScale: 4, terrainBase: MF_BASE_HEIGHT, treeChance: 0, treeType: 'none', vegetationChance: 0, color: '#5b4a78', vegetationType: 'none', tags: ['magnetic']
    }
};

// Helper for dynamic noise types with Fractal Brownian Motion (FBM)
export function sample(
    noise: SimpleNoise, 
    x: number, 
    z: number, 
    type: NoiseType, 
    scale: number, 
    octaves: number = 1,
    lacunarity: number = 2.0,
    gain: number = 0.5
): number {
    let total = 0;
    let frequency = scale;
    let amplitude = 1;
    let maxAmplitude = 0;

    for (let i = 0; i < octaves; i++) {
        let value = 0;
        
        switch(type) {
            case 'sine':
                value = Math.sin(x * frequency) * Math.cos(z * frequency);
                break;
            case 'white':
                const n = Math.sin(x * 12.9898 * (i+1) + z * 78.233 * (i+1)) * 43758.5453;
                value = (n - Math.floor(n)) * 2 - 1;
                break;
            case 'opensimplex2':
                value = noise.openSimplex2D(x * frequency, z * frequency);
                break;
            case 'cellular':
                value = noise.cellular2D(x * frequency, z * frequency);
                break;
            case 'value':
                value = noise.value2D(x * frequency, z * frequency);
                break;
            case 'perlin':
            default:
                // Offset octaves to avoid stacking zero-crossings
                value = noise.noise2D(x * frequency + (i * 100), z * frequency + (i * 100));
                break;
        }
        
        total += value * amplitude;
        maxAmplitude += amplitude;
        
        amplitude *= gain;
        frequency *= lacunarity;
    }

    return total / maxAmplitude; // Normalize to -1..1 range
}

export interface GenerationParams {
    temp: number;
    continentalness: number;
    riverVal: number;
    weirdness: number;
    jitter: number;
}

// Short-lived memoization used by generateChunk: climate params were being
// recomputed 10-20x per column (terrain pass, biome pass, beach probes, tree
// pass). The function is pure for fixed (x, z, noiseSet, GenConfig), and the
// cache only lives for the duration of one synchronous generateChunk call, so
// GenConfig/seed cannot change while it is active.
let genParamsCache: Map<number, GenerationParams> | null = null;
let genParamsCacheNoiseSet: NoiseSet | null = null;

export function beginGenParamsCache(noiseSet: NoiseSet) {
    genParamsCache = new Map();
    genParamsCacheNoiseSet = noiseSet;
}

export function endGenParamsCache() {
    genParamsCache = null;
    genParamsCacheNoiseSet = null;
}

export function getGenerationParams(x: number, z: number, noiseSet: NoiseSet = GlobalNoise): GenerationParams {
    if (genParamsCache && noiseSet === genParamsCacheNoiseSet) {
        const key = (x + 1048576) * 4194304 + (z + 1048576);
        const cached = genParamsCache.get(key);
        if (cached) return cached;
        const computed = computeGenerationParams(x, z, noiseSet);
        genParamsCache.set(key, computed);
        return computed;
    }
    return computeGenerationParams(x, z, noiseSet);
}

function computeGenerationParams(x: number, z: number, noiseSet: NoiseSet): GenerationParams {
    const nc = GenConfig.noise;
    const offsets = noiseSet.offsets;

    // Optional climate domain warp
    const warpCfg = GenConfig.climateWarp;
    let wx = x, wz = z;
    if (warpCfg.enabled) {
        wx += noiseSet.biomeWarpA.noise2D(x * warpCfg.frequency, z * warpCfg.frequency) * warpCfg.amplitude;
        wz += noiseSet.biomeWarpB.noise2D(x * warpCfg.frequency, z * warpCfg.frequency) * warpCfg.amplitude;
    }

    // Per-channel offset coordinates
    const tx = wx + offsets.temperature.x;
    const tz = wz + offsets.temperature.z;
    const cx = wx + offsets.continentalness.x;
    const cz = wz + offsets.continentalness.z;
    const rx = wx + offsets.river.x;
    const rz = wz + offsets.river.z;
    const wdx = wx + offsets.weirdness.x;
    const wdz = wz + offsets.weirdness.z;

    const jitter = noiseSet.biome.noise2D(wx * 0.1, wz * 0.1) * 0.02; 
    
    const tempRaw = sample(noiseSet.biome, tx, tz, nc.temperature.type, nc.temperature.scale, nc.temperature.octaves, nc.temperature.lacunarity, nc.temperature.gain);
    const temp = (tempRaw * (nc.temperature.amplification || 1.5)) + jitter;

    const contRaw = sample(noiseSet.continental, cx, cz, nc.continentalness.type, nc.continentalness.scale, nc.continentalness.octaves, nc.continentalness.lacunarity, nc.continentalness.gain);
    const continentalness = contRaw + jitter + (nc.continentalness.offset || 0);
    
    const riverRaw = sample(noiseSet.river, rx, rz, nc.river.type, nc.river.scale, nc.river.octaves, nc.river.lacunarity, nc.river.gain);
    const riverVal = riverRaw + (jitter * (nc.river.jitter || 0));

    const weirdRaw = sample(noiseSet.weirdness, wdx, wdz, nc.weirdness.type, nc.weirdness.scale, nc.weirdness.octaves, nc.weirdness.lacunarity, nc.weirdness.gain);
    const weirdness = (weirdRaw * (nc.weirdness.amplification || 1.0)) + jitter;

    return { temp, continentalness, riverVal, weirdness, jitter };
}

export function getClimateDebugInfo(x: number, z: number, noiseSet: NoiseSet = GlobalNoise) {
    const params = getGenerationParams(x, z, noiseSet);
    const offsets = noiseSet.offsets;
    const warpCfg = GenConfig.climateWarp;
    let wx = x, wz = z;
    if (warpCfg.enabled) {
        wx += noiseSet.biomeWarpA.noise2D(x * warpCfg.frequency, z * warpCfg.frequency) * warpCfg.amplitude;
        wz += noiseSet.biomeWarpB.noise2D(x * warpCfg.frequency, z * warpCfg.frequency) * warpCfg.amplitude;
    }
    return {
        ...params,
        warpEnabled: warpCfg.enabled,
        warpedX: wx,
        warpedZ: wz,
        tempCoordX: wx + offsets.temperature.x,
        tempCoordZ: wz + offsets.temperature.z,
    };
}

export function getBiomeHeightInfo(x: number, z: number, noiseSet: NoiseSet = GlobalNoise): { terrainBase: number, terrainScale: number } {
    const params = getGenerationParams(x, z, noiseSet);
    const { temp, continentalness: cont, weirdness, riverVal: river } = params;
    
    const b = GenConfig.biomes;
    const ts = GenConfig.terrainShape;

    // Default: Plains Settings
    let targetBase = b.plains.base;
    let targetScale = b.plains.scale;

    // 1. Temperature Blending
    
    // Tundra
    const tundraFactor = 1.0 - THREE.MathUtils.smoothstep(temp, b.tundra.maxTemp - 0.1, b.tundra.maxTemp + 0.1);
    if (tundraFactor > 0) {
        targetBase = THREE.MathUtils.lerp(targetBase, b.tundra.base, tundraFactor);
        targetScale = THREE.MathUtils.lerp(targetScale, b.tundra.scale, tundraFactor);
    }

    // Cherry Grove
    const cherryFactor = Math.max(0, 1.0 - Math.abs(temp - (b.cherry.minTemp + 0.15)) / 0.2); 
    if (cherryFactor > 0) {
        targetBase = THREE.MathUtils.lerp(targetBase, b.cherry.base, cherryFactor);
        targetScale = THREE.MathUtils.lerp(targetScale, b.cherry.scale, cherryFactor);
    }

    // Forest
    const forestFactor = Math.max(0, 1.0 - Math.abs(temp - (b.forest.minTemp + 0.2)) / 0.25);
    if (forestFactor > 0) {
        targetBase = THREE.MathUtils.lerp(targetBase, b.forest.base, forestFactor);
        targetScale = THREE.MathUtils.lerp(targetScale, b.forest.scale, forestFactor);
    }

    // Desert
    const desertFactor = Math.max(0, 1.0 - Math.abs(temp - (b.desert.minTemp + 0.12)) / 0.18);
    if (desertFactor > 0) {
        targetBase = THREE.MathUtils.lerp(targetBase, b.desert.base, desertFactor);
        targetScale = THREE.MathUtils.lerp(targetScale, b.desert.scale, desertFactor);
    }

    // Mesa / Bryce
    const mesaFactor = Math.max(0, 1.0 - Math.abs(temp - (b.mesa.minTemp + 0.15)) / 0.2);
    if (mesaFactor > 0) {
        targetBase = THREE.MathUtils.lerp(targetBase, b.mesa.base, mesaFactor); 
        targetScale = THREE.MathUtils.lerp(targetScale, b.mesa.scale, mesaFactor);
    }

    // Volcanic
    const tempHotFactor = THREE.MathUtils.smoothstep(temp, b.volcanic.minTemp - 0.05, b.volcanic.minTemp + 0.1);
    const weirdFactor = THREE.MathUtils.smoothstep(weirdness, b.volcanic.minWeird - 0.05, b.volcanic.minWeird + 0.15);
    const volcanicFactor = tempHotFactor * weirdFactor;

    if (volcanicFactor > 0) {
        targetBase = THREE.MathUtils.lerp(targetBase, b.volcanic.base, volcanicFactor);
        targetScale = THREE.MathUtils.lerp(targetScale, b.volcanic.scale, volcanicFactor);
    }

    // Mountains — very high weirdness raises the land into soaring peaks. This
    // factor mirrors the biome-selection rule so MOUNTAINS columns actually get
    // mountainous terrain instead of their temp band's default height.
    // The ramp starts BELOW the biome threshold (minWeird-0.12) and reaches
    // full strength well above it (minWeird+0.18), creating a wide gradual
    // foothills transition: terrain begins rising gently before the biome is
    // officially "mountains", then steepens into full peaks at the core. This
    // avoids the abrupt cliff-edge transition that made small mountain biomes
    // look cramped and unnatural.
    if (b.mountains && typeof b.mountains.minWeird === 'number') {
        const mountainWeird = THREE.MathUtils.smoothstep(weirdness, b.mountains.minWeird - 0.12, b.mountains.minWeird + 0.18);
        // Suppress mountains where volcanic already dominates (volcanic is hotter/higher-weirdness band).
        const mountainFactor = mountainWeird * (1.0 - volcanicFactor);
        if (mountainFactor > 0) {
            targetBase = THREE.MathUtils.lerp(targetBase, b.mountains.base, mountainFactor);
            targetScale = THREE.MathUtils.lerp(targetScale, b.mountains.scale, mountainFactor);
        }
    }

    // Swamp — cool band + high weirdness flattens and lowers the land into a
    // waterlogged marsh. Kept gentle so it blends with surrounding cherry/meadow.
    if (b.swamp && typeof b.swamp.minWeird === 'number') {
        const swampTemp = Math.max(0, 1.0 - Math.abs(temp - (b.cherry.minTemp + 0.15)) / 0.25);
        const swampWeird = THREE.MathUtils.smoothstep(weirdness, b.swamp.minWeird - 0.08, b.swamp.minWeird + 0.15);
        const swampFactor = swampTemp * swampWeird * (1.0 - volcanicFactor);
        if (swampFactor > 0) {
            targetBase = THREE.MathUtils.lerp(targetBase, b.swamp.base, swampFactor);
            targetScale = THREE.MathUtils.lerp(targetScale, b.swamp.scale, swampFactor);
        }
    }

    // 2. Continentalness Blending (Ocean Slope)
    const OCEAN_START = b.ocean.continentalnessMax; 
    const LAND_FULL   = OCEAN_START + ts.landOffset; 

    // landFactor: 0 = Ocean, 1 = Full Land
    let landFactor = THREE.MathUtils.smoothstep(cont, OCEAN_START, LAND_FULL);
    // Apply curvature to make the coast steeper or gentler
    landFactor = Math.pow(landFactor, ts.coastPower);

    // Deep Ocean blending (cont < -0.60)
    const deepFactor = 1.0 - THREE.MathUtils.smoothstep(cont, -0.60, OCEAN_START); 
    const OCEAN_BASE = THREE.MathUtils.lerp(ts.oceanBaseDepth, ts.oceanDeepBase, deepFactor); 
    const OCEAN_SCALE = ts.oceanScale; 

    // Final blending between Ocean and Current Biome Target
    targetBase  = THREE.MathUtils.lerp(OCEAN_BASE,  targetBase,  landFactor);
    targetScale = THREE.MathUtils.lerp(OCEAN_SCALE, targetScale, landFactor);

    // 3. River Carving
    const riverDist = Math.abs(river);
    const riverFactor = 1.0 - THREE.MathUtils.smoothstep(riverDist, b.river.width * 0.6, b.river.width * 7.0);
    
    // Only carve rivers on land (or allow them to carve partially into beaches)
    if (landFactor > 0.5) {
        targetBase = THREE.MathUtils.lerp(targetBase, b.river.base, riverFactor);
        targetScale = THREE.MathUtils.lerp(targetScale, b.river.scale, riverFactor);
    }

    return { 
        terrainBase: targetBase * GenConfig.height.globalScale, 
        terrainScale: targetScale * GenConfig.height.globalScale 
    };
}

export function getBiome(x: number, z: number, noiseSet: NoiseSet = GlobalNoise): Biome {
    // Magnetic Fields takes top priority: rare, noise-gated instances override
    // ordinary biomes. Placement/shape come from the dedicated bossBiome noise.
    if (isInMagneticFields(x, z, noiseSet.seed | 0, (px, pz) => noiseSet.bossBiome.noise2D(px, pz))) {
        return BIOMES.MAGNETIC_FIELDS;
    }

    const { temp, continentalness, riverVal, weirdness } = getGenerationParams(x, z, noiseSet);
    const b = GenConfig.biomes;

    if (continentalness < b.ocean.continentalnessMax) {
        // Use tundra maxTemp for ocean freezing logic.
        if (temp < b.tundra.maxTemp) return BIOMES.FROZEN_OCEAN;
        return BIOMES.OCEAN;
    }

    if (Math.abs(riverVal) < b.river.width) {
        // Use tundra maxTemp for river freezing logic.
        if (temp < b.tundra.maxTemp) return BIOMES.FROZEN_RIVER;
        return BIOMES.RIVER;
    }

    // Stone Shore — a narrow rocky coastal band just inland of the ocean
    // threshold. Uses its own continentalnessMax so it hugs the coastline.
    if (b.stoneShore && typeof b.stoneShore.continentalnessMax === 'number'
        && continentalness < b.stoneShore.continentalnessMax
        && weirdness > 0.35) {
        return BIOMES.STONE_SHORE;
    }

    // Rare & Special Biomes first
    if (temp > b.volcanic.minTemp && weirdness > b.volcanic.minWeird) return BIOMES.VOLCANIC;
    if (temp > b.mesaBryce.minTemp && weirdness > b.mesaBryce.minWeird && weirdness <= b.mesaBryce.maxWeird) return BIOMES.MESA_BRYCE;

    // Mountains — very high weirdness across temperate bands raises soaring peaks.
    if (b.mountains && typeof b.mountains.minWeird === 'number' && weirdness > b.mountains.minWeird && temp > b.tundra.maxTemp) {
        return BIOMES.MOUNTAINS;
    }

    // ===== Cold band (temp < tundra.maxTemp) =====
    if (temp < b.tundra.maxTemp) {
        // Ice Spikes — very low weirdness (rare frozen variant)
        if (b.iceSpikes && typeof b.iceSpikes.minWeird === 'number' && typeof b.iceSpikes.maxWeird === 'number'
            && weirdness >= b.iceSpikes.minWeird && weirdness <= b.iceSpikes.maxWeird) {
            return BIOMES.ICE_SPIKES;
        }
        // Taiga — high weirdness (denser snowy conifer forest)
        if (b.taiga && typeof b.taiga.minWeird === 'number' && weirdness > b.taiga.minWeird) {
            return BIOMES.TAIGA;
        }
        return BIOMES.TUNDRA;
    }

    // ===== Hot band (mesa temp) =====
    if (temp > b.mesa.minTemp) return BIOMES.RED_MESA;

    // ===== Desert band =====
    if (temp > b.desert.minTemp) {
        // Savanna — low weirdness (warm dry grassland transition)
        if (b.savanna && typeof b.savanna.minWeird === 'number' && typeof b.savanna.maxWeird === 'number'
            && weirdness >= b.savanna.minWeird && weirdness <= b.savanna.maxWeird) {
            return BIOMES.SAVANNA;
        }
        return BIOMES.DESERT;
    }

    // ===== Plains band (temperate warm) =====
    if (temp > b.plains.minTemp) {
        // Jungle — high weirdness (dense hot forest)
        if (b.jungle && typeof b.jungle.minWeird === 'number' && weirdness > b.jungle.minWeird) {
            return BIOMES.JUNGLE;
        }
        // Savanna — low weirdness (warm dry). Uses maxWeird as the threshold
        // so the widened band (minWeird now -1.0) selects the full low range.
        if (b.savanna && typeof b.savanna.maxWeird === 'number' && weirdness <= b.savanna.maxWeird) {
            return BIOMES.SAVANNA;
        }
        return BIOMES.PLAINS;
    }

    // ===== Forest band (temperate) =====
    if (temp > b.forest.minTemp) {
        // Dark Forest — high weirdness
        if (b.darkForest && typeof b.darkForest.minWeird === 'number' && weirdness > b.darkForest.minWeird) {
            return BIOMES.DARK_FOREST;
        }
        // Flower Forest — mid weirdness
        if (b.flowerForest && typeof b.flowerForest.minWeird === 'number' && typeof b.flowerForest.maxWeird === 'number'
            && weirdness > b.flowerForest.minWeird && weirdness <= b.flowerForest.maxWeird) {
            return BIOMES.FLOWER_FOREST;
        }
        // Birch Forest — low-mid weirdness
        if (b.birchForest && typeof b.birchForest.minWeird === 'number' && typeof b.birchForest.maxWeird === 'number'
            && weirdness > b.birchForest.minWeird && weirdness <= b.birchForest.maxWeird) {
            return BIOMES.BIRCH_FOREST;
        }
        return BIOMES.FOREST;
    }

    // ===== Cherry band (cool temperate) =====
    if (temp > b.cherry.minTemp) {
        // Swamp — high weirdness (lowland marsh)
        if (b.swamp && typeof b.swamp.minWeird === 'number' && weirdness > b.swamp.minWeird) {
            return BIOMES.SWAMP;
        }
        // Meadow — low weirdness (flat open grassland)
        if (b.meadow && typeof b.meadow.minWeird === 'number' && typeof b.meadow.maxWeird === 'number'
            && weirdness > b.meadow.minWeird && weirdness <= b.meadow.maxWeird) {
            return BIOMES.MEADOW;
        }
        return BIOMES.CHERRY_GROVE;
    }

    // Fallback is Tundra
    return BIOMES.TUNDRA;
}
