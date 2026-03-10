import { BlockType } from '../../types';
import { GlobalNoise, SimpleNoise, NoiseSet } from '../../utils/noise';
import * as THREE from 'three';
import { GenConfig, NoiseType } from './genConfig';

export interface Biome {
    id: string;
    name: string;
    surfaceBlock: BlockType;
    subBlock: BlockType;
    waterBlock: BlockType;
    // These defaults are just placeholders now, actual height comes from getBiomeHeightInfo
    terrainScale: number; 
    terrainBase: number;
    treeChance: number;
    treeType: 'oak' | 'spruce' | 'cherry' | 'mixed_forest' | 'none';
    vegetationChance: number;
    color: string;
}

// Sea Level is 63
export const BIOMES: Record<string, Biome> = {
    OCEAN: {
        id: 'ocean', name: 'Ocean', surfaceBlock: BlockType.SAND, subBlock: BlockType.STONE, waterBlock: BlockType.WATER,
        terrainScale: 10, terrainBase: 45, treeChance: 0, treeType: 'none', vegetationChance: 0, color: '#000080'
    },
    FROZEN_OCEAN: {
        id: 'frozen_ocean', name: 'Frozen Ocean', surfaceBlock: BlockType.SNOWY_GRASS, subBlock: BlockType.STONE, waterBlock: BlockType.ICE,
        terrainScale: 10, terrainBase: 45, treeChance: 0, treeType: 'none', vegetationChance: 0, color: '#90caf9'
    },
    RIVER: {
        id: 'river', name: 'River', surfaceBlock: BlockType.DIRT, subBlock: BlockType.DIRT, waterBlock: BlockType.WATER,
        terrainScale: 5, terrainBase: 58, treeChance: 0, treeType: 'none', vegetationChance: 0, color: '#304ffe'
    },
    FROZEN_RIVER: {
        id: 'frozen_river', name: 'Frozen River', surfaceBlock: BlockType.DIRT, subBlock: BlockType.DIRT, waterBlock: BlockType.ICE,
        terrainScale: 5, terrainBase: 58, treeChance: 0, treeType: 'none', vegetationChance: 0, color: '#a7c6ff'
    },
    PLAINS: {
        id: 'plains', name: 'Plains', surfaceBlock: BlockType.GRASS, subBlock: BlockType.DIRT, waterBlock: BlockType.WATER,
        terrainScale: 20, terrainBase: 70, treeChance: 0.0009, treeType: 'oak', vegetationChance: 0.25, color: '#8db360'
    },
    FOREST: {
        id: 'forest', name: 'Forest', surfaceBlock: BlockType.GRASS, subBlock: BlockType.DIRT, waterBlock: BlockType.WATER,
        terrainScale: 25, terrainBase: 72, treeChance: 0.035, treeType: 'mixed_forest', vegetationChance: 0.15, color: '#056621'
    },
    DESERT: {
        id: 'desert', name: 'Desert', surfaceBlock: BlockType.SAND, subBlock: BlockType.SANDSTONE, waterBlock: BlockType.WATER,
        terrainScale: 15, terrainBase: 72, treeChance: 0, treeType: 'none', vegetationChance: 0.015, color: '#fa9418'
    },
    TUNDRA: {
        id: 'tundra', name: 'Tundra', surfaceBlock: BlockType.SNOWY_GRASS, subBlock: BlockType.DIRT, waterBlock: BlockType.ICE,
        terrainScale: 35, terrainBase: 75, treeChance: 0.016, treeType: 'spruce', vegetationChance: 0.05, color: '#ffffff'
    },
    CHERRY_GROVE: {
        id: 'cherry_grove', name: 'Cherry Grove', surfaceBlock: BlockType.GRASS, subBlock: BlockType.DIRT, waterBlock: BlockType.WATER,
        terrainScale: 45, terrainBase: 85, treeChance: 0.02, treeType: 'cherry', vegetationChance: 0.3, color: '#ffc0cb'
    },
    RED_MESA: {
        id: 'red_mesa', name: 'Red Mesa', surfaceBlock: BlockType.RED_SAND, subBlock: BlockType.RED_SANDSTONE, waterBlock: BlockType.WATER,
        terrainScale: 10, terrainBase: 72, treeChance: 0.0, treeType: 'none', vegetationChance: 0.02, color: '#d94515'
    },
    MESA_BRYCE: {
        id: 'mesa_bryce', name: 'Mesa Bryce', surfaceBlock: BlockType.RED_SAND, subBlock: BlockType.TERRACOTTA_WHITE, waterBlock: BlockType.WATER,
        terrainScale: 10, terrainBase: 72, treeChance: 0.0, treeType: 'none', vegetationChance: 0.01, color: '#ff6f00'
    },
    VOLCANIC: {
        id: 'volcanic', name: 'Volcanic Crags', surfaceBlock: BlockType.BASALT, subBlock: BlockType.BASALT, waterBlock: BlockType.LAVA,
        terrainScale: 85, terrainBase: 85, treeChance: 0, treeType: 'none', vegetationChance: 0, color: '#444444'
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
                value = noise.simplex2D(x * frequency, z * frequency);
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

export function getGenerationParams(x: number, z: number, noiseSet: NoiseSet = GlobalNoise) {
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
    
    // Tundra (using explicit tundra config now)
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
    const { temp, continentalness, riverVal, weirdness } = getGenerationParams(x, z, noiseSet);
    const b = GenConfig.biomes;
    
    if (continentalness < b.ocean.continentalnessMax) {
        // Use tundra maxTemp for ocean freezing logic now
        if (temp < b.tundra.maxTemp) return BIOMES.FROZEN_OCEAN;
        return BIOMES.OCEAN;
    }

    if (Math.abs(riverVal) < b.river.width) {
        // Use tundra maxTemp for river freezing logic now
        if (temp < b.tundra.maxTemp) return BIOMES.FROZEN_RIVER;
        return BIOMES.RIVER;
    }

    // Rare & Special Biomes first
    if (temp > b.volcanic.minTemp && weirdness > b.volcanic.minWeird) return BIOMES.VOLCANIC;
    if (temp > b.mesaBryce.minTemp && weirdness > b.mesaBryce.minWeird && weirdness <= b.mesaBryce.maxWeird) return BIOMES.MESA_BRYCE;

    // Explicit Tundra Check based on Slider (maxTemp)
    // Checking this early allows the Tundra slider to "override" other biomes if set warmer.
    if (temp < b.tundra.maxTemp) return BIOMES.TUNDRA;

    // Standard Biomes
    if (temp > b.mesa.minTemp) return BIOMES.RED_MESA;
    if (temp > b.desert.minTemp) return BIOMES.DESERT;
    if (temp > b.plains.minTemp) return BIOMES.PLAINS;
    if (temp > b.forest.minTemp) return BIOMES.FOREST;
    if (temp > b.cherry.minTemp) return BIOMES.CHERRY_GROVE;
    
    // Fallback is Tundra
    return BIOMES.TUNDRA;
}
