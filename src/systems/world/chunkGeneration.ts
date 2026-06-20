import { BlockType } from '../../types';
import { BLOCKS } from '../../data/blocks';
import { CHUNK_SIZE, WORLD_HEIGHT, MIN_Y, MAX_Y } from '../../constants';
import { GlobalNoise, NoiseSet } from '../../utils/noise';
import { NEIGHBORS } from './worldConstants';
import { getDirectionalOpacity, getPairedFaceOcclusion } from './blockProps';
import { getBiome, getBiomeHeightInfo, getGenerationParams, sample, beginGenParamsCache, endGenParamsCache } from './biomes';
import * as THREE from 'three';
import { GenConfig } from './genConfig';
import { index3D } from './worldCoords';

// Grassy-surface test: true for all grass-topped biome surface blocks (so
// vegetation placement works on mossy/lush/dark/meadow/savanna/jungle grass,
// podzol, plus the original grass/snowy-grass).
const GRASSY_SURFACES = new Set<BlockType>([
    BlockType.GRASS, BlockType.SNOWY_GRASS,
    BlockType.MOSSY_GRASS, BlockType.LUSH_GRASS, BlockType.DARK_GRASS,
    BlockType.MEADOW_GRASS, BlockType.SAVANNA_GRASS, BlockType.JUNGLE_GRASS,
    BlockType.PODZOL,
]);
const isGrassySurface = (t: BlockType) => GRASSY_SURFACES.has(t);
import { generateTreeBlocks, isValidSoil } from './trees';
import type { TreeKind } from './trees';

// Companion cache to beginGenParamsCache — getTerrainInfo is itself called several
// times per column during generateChunk (terrain pass, beach probes, tree pass).
let terrainInfoCache: Map<number, { height: number, baseHeight: number }> | null = null;
let terrainInfoCacheNoiseSet: NoiseSet | null = null;

function beginGenerationCaches(noiseSet: NoiseSet) {
    beginGenParamsCache(noiseSet);
    terrainInfoCache = new Map();
    terrainInfoCacheNoiseSet = noiseSet;
}

function endGenerationCaches() {
    endGenParamsCache();
    terrainInfoCache = null;
    terrainInfoCacheNoiseSet = null;
}

export function getTerrainInfo(x: number, z: number, noiseSet: NoiseSet = GlobalNoise): { height: number, baseHeight: number } {
    if (terrainInfoCache && noiseSet === terrainInfoCacheNoiseSet) {
        const key = (x + 1048576) * 4194304 + (z + 1048576);
        const cached = terrainInfoCache.get(key);
        if (cached) return cached;
        const computed = computeTerrainInfo(x, z, noiseSet);
        terrainInfoCache.set(key, computed);
        return computed;
    }
    return computeTerrainInfo(x, z, noiseSet);
}

function computeTerrainInfo(x: number, z: number, noiseSet: NoiseSet): { height: number, baseHeight: number } {
    const { terrainBase, terrainScale } = getBiomeHeightInfo(x, z, noiseSet);
    
    const nc = GenConfig.noise.terrain;
    const freq1 = nc.scale1; 
    const freq2 = nc.scale2;
    const type = nc.type;

    const tox = noiseSet.offsets.terrain.x;
    const toz = noiseSet.offsets.terrain.z;
    
    const n1 = sample(noiseSet.terrain, x + tox, z + toz, type, freq1, 1, 2.0, 0.5);
    const n2 = sample(noiseSet.terrain, x + 100 + tox, z + 100 + toz, type, freq2, 1, 2.0, 0.5); 
    
    let elevation = n1 * terrainScale + n2 * (terrainScale / 3); 
    
    const baseHeight = Math.floor(terrainBase + elevation);

    const params = getGenerationParams(x, z, noiseSet);
    const { temp, weirdness, jitter } = params;
    
    const b = GenConfig.biomes;

    // --- VOLCANIC JITTER ---
    if (temp > b.volcanic.minTemp - 0.1 && weirdness > b.volcanic.minWeird - 0.05) {
        const tFactor = THREE.MathUtils.smoothstep(temp, b.volcanic.minTemp - 0.1, b.volcanic.minTemp);
        const wFactor = THREE.MathUtils.smoothstep(weirdness, b.volcanic.minWeird - 0.05, b.volcanic.minWeird + 0.1);
        const volcanicFactor = tFactor * wFactor;

        const jagged = Math.abs(noiseSet.weirdness.noise2D((x + tox) * 0.15, (z + toz) * 0.15));
        const jaggedLow = noiseSet.weirdness.noise2D((x + tox) * 0.03, (z + toz) * 0.03);

        elevation += (jagged * 12 + jaggedLow * 6) * volcanicFactor;
    }

    // --- MOUNTAIN JAGGED PEAKS ---
    // Adds sharp, high-frequency peak detail so mountains read as jagged peaks
    // rather than smooth rounded hills. Only applied at the mountain CORE (high
    // weirdness), NOT in the foothills transition zone — so the gradual climb
    // stays smooth while the summit is jagged and dramatic.
    if (b.mountains && typeof b.mountains.minWeird === 'number' && weirdness > b.mountains.minWeird) {
        const peakBlend = THREE.MathUtils.smoothstep(weirdness, b.mountains.minWeird, b.mountains.minWeird + 0.20);
        // Suppress where volcanic dominates
        const volTemp = THREE.MathUtils.smoothstep(temp, b.volcanic.minTemp - 0.1, b.volcanic.minTemp);
        const volWeird = THREE.MathUtils.smoothstep(weirdness, b.volcanic.minWeird - 0.05, b.volcanic.minWeird + 0.1);
        const mtnFactor = peakBlend * (1.0 - volTemp * volWeird);
        if (mtnFactor > 0) {
            // Ridge noise: sharp peaks at noise zero-crossings
            const ridge = 1.0 - Math.abs(noiseSet.weirdness.noise2D((x + tox) * 0.08, (z + toz) * 0.08));
            const ridge2 = 1.0 - Math.abs(noiseSet.weirdness.noise2D((x + tox) * 0.02 + 50, (z + toz) * 0.02 + 50));
            // Large-scale peak boost + fine ridge detail
            elevation += (ridge * ridge * 35 + ridge2 * 20) * mtnFactor;
        }
    }

    // --- MESA & BRYCE PLATEAU LOGIC ---
    if (temp > b.mesa.minTemp - 0.1) {
        const edgeFactor = THREE.MathUtils.smoothstep(temp, b.mesa.minTemp - 0.1, b.mesa.minTemp);
        
        const volcanicTemp = THREE.MathUtils.smoothstep(temp, b.volcanic.minTemp - 0.1, b.volcanic.minTemp);
        const volcanicWeird = THREE.MathUtils.smoothstep(weirdness, b.volcanic.minWeird - 0.05, b.volcanic.minWeird + 0.1);
        const isVolcanic = volcanicTemp * volcanicWeird;
        const volcanicFade = 1.0 - isVolcanic;

        const plateauNoise = noiseSet.terrain.noise2D((x + tox) * 0.008, (z + toz) * 0.008);
        
        let lowFactor = THREE.MathUtils.smoothstep(plateauNoise, -0.12, -0.08);
        let highFactor = THREE.MathUtils.smoothstep(plateauNoise, 0.08, 0.12);
        
        const bryceStart = THREE.MathUtils.smoothstep(weirdness, b.mesaBryce.minWeird - 0.02, b.mesaBryce.minWeird);
        const bryceEnd = 1.0 - THREE.MathUtils.smoothstep(weirdness, b.mesaBryce.maxWeird - 0.05, b.mesaBryce.maxWeird);
        const bryceFactor = bryceStart * bryceEnd; 

        let bryceBoost = 0;

        if (bryceFactor > 0.01) {
            const spireNoise = noiseSet.terrain.noise2D((x + tox) * 0.1, (z + toz) * 0.1); 
            const spireShape = THREE.MathUtils.smoothstep(spireNoise, 0.35, 0.55); 
            
            highFactor = THREE.MathUtils.lerp(highFactor, spireShape, bryceFactor);
            lowFactor = THREE.MathUtils.lerp(lowFactor, spireShape * 0.1, bryceFactor); 
            
            bryceBoost = (spireShape * 14) * bryceFactor;
        }

        const plateauHeight = (lowFactor * 5) + (highFactor * 20) + bryceBoost;
        
        const rVal = Math.abs(noiseSet.river.noise2D((x + noiseSet.offsets.river.x) * 0.004, (z + noiseSet.offsets.river.z) * 0.004) + (jitter * 0.5));
        const carvingFactor = THREE.MathUtils.smoothstep(rVal, b.river.width, b.river.width * 3.0);
        
        const mesaDetail = noiseSet.terrain.noise2D((x + tox) * 0.04, (z + toz) * 0.04) * 1.5;
        const detailMask = THREE.MathUtils.smoothstep(plateauHeight, 2.0, 6.0);

        elevation += (plateauHeight + mesaDetail * detailMask) * edgeFactor * carvingFactor * volcanicFade;
    }

    return { 
        height: Math.floor(terrainBase + elevation),
        baseHeight: baseHeight
    };
}

export function getTerrainHeight(x: number, z: number, noiseSet: NoiseSet = GlobalNoise): number {
    return getTerrainInfo(x, z, noiseSet).height;
}

function getStrataBlock(y: number): BlockType {
    const pattern = [
        BlockType.TERRACOTTA_ORANGE, BlockType.TERRACOTTA_ORANGE,
        BlockType.TERRACOTTA_YELLOW, BlockType.TERRACOTTA_BROWN, BlockType.TERRACOTTA_BROWN,
        BlockType.TERRACOTTA, BlockType.TERRACOTTA, BlockType.TERRACOTTA_RED,
        BlockType.TERRACOTTA_LIGHT_GRAY, BlockType.TERRACOTTA_WHITE, BlockType.TERRACOTTA_WHITE,
        BlockType.TERRACOTTA_ORANGE, BlockType.TERRACOTTA_MAGENTA, BlockType.TERRACOTTA_BROWN,
        BlockType.TERRACOTTA, BlockType.TERRACOTTA_YELLOW
    ];
    const idx = Math.abs(Math.floor(y)) % pattern.length;
    return pattern[idx];
}

/**
 * Resolve the actual surface block at a world column, matching the terrain pass logic.
 * This accounts for beach/riverbank conversion to SAND, mesa RED_SAND, and GRASS→DIRT below sea level.
 */
function getResolvedSurface(wx: number, wz: number, noiseSet: NoiseSet = GlobalNoise): BlockType {
    const biome = getBiome(wx, wz, noiseSet);
    const { height, baseHeight } = getTerrainInfo(wx, wz, noiseSet);

    let surface = biome.surfaceBlock;

    // Mesa/Bryce: surface is RED_SAND if at or below baseHeight + 1
    if (biome.id === 'red_mesa' || biome.id === 'mesa_bryce') {
        if (height > baseHeight + 1) {
            surface = getStrataBlock(height);
        } else {
            surface = BlockType.RED_SAND;
        }
    }

    // Mountains — elevation-banded surface (matches the terrain pass): grass
    // foothills, stone-variant slopes, snow caps. Trees only root in the grass band.
    if (biome.id === 'mountains') {
        if (height > 150) {
            surface = BlockType.SNOW_BLOCK;
        } else if (height > 110) {
            // Approximate the terrain-pass stone-variant pick. The exact per-column
            // noise choice isn't re-evaluated here; ANDESITE is a safe default that
            // passes isValidSoil=false (so trees won't root on bare rock, correct).
            surface = BlockType.ANDESITE;
        } else {
            surface = BlockType.GRASS;
        }
    }

    // Beach zone detection — matches terrain pass
    const params = getGenerationParams(wx, wz, noiseSet);
    const contVal = params.continentalness;
    const riverVal = Math.abs(params.riverVal);

    const isCoastal = (contVal > -0.55 && contVal < GenConfig.biomes.ocean.continentalnessMax + 0.15);
    const isRiverBank = (riverVal > GenConfig.biomes.river.width - 0.002 && riverVal < GenConfig.biomes.river.width * 7.0);
    let isBeachZone = isCoastal || isRiverBank;

    if (!isBeachZone && height >= 60 && height <= 65) {
        const offsets = [[4,0], [-4,0], [0,4], [0,-4]];
        for (const [ox, oz] of offsets) {
            const nh = getTerrainHeight(wx + ox, wz + oz, noiseSet);
            if ((height >= 63 && nh < 63) || (height < 63 && nh >= 63)) {
                isBeachZone = true;
                break;
            }
        }
    }

    if (isBeachZone && height >= 60 && height <= 65 && biome.id !== 'volcanic' && biome.id !== 'red_mesa' && biome.id !== 'mesa_bryce' && biome.id !== 'stone_shore' && biome.id !== 'mountains') {
        surface = BlockType.SAND;
    }

    // Grass converts to dirt below sea level
    if (height < 63 && surface === BlockType.GRASS) {
        surface = BlockType.DIRT;
    }

    return surface;
}

export function generateChunk(cx: number, cz: number) {
    beginGenerationCaches(GlobalNoise);
    try {
        return generateChunkInner(cx, cz);
    } finally {
        endGenerationCaches();
    }
}

// Scratch reused across generateChunk calls (sync per context — main thread
// fallback or one worker). Allocating the 786KB queue per chunk was GC churn.
const genLightQueueScratch = new Int32Array(CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT * 2);
const genHeightmapScratch = new Int16Array(CHUNK_SIZE * CHUNK_SIZE);

function generateChunkInner(cx: number, cz: number) {
    const blocks = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT);
    const light = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT);
    const meta = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT);

    // Column heightmap to speed up lighting pass
    const colHeightmap = genHeightmapScratch.fill(MIN_Y);

    const lightQueue = genLightQueueScratch;
    let qHead = 0;
    let qTail = 0;

    const worldX = cx * CHUNK_SIZE;
    const worldZ = cz * CHUNK_SIZE;
    const noiseSet = GlobalNoise;
    const worldSeed = noiseSet.seed | 0;
    const caveOx = noiseSet.offsets.cave.x;
    const caveOz = noiseSet.offsets.cave.z;

    const seededRand01 = (x: number, y: number, z: number, salt: number): number => {
        let h = Math.imul((x | 0) ^ worldSeed, 374761393);
        h = Math.imul(h ^ ((y | 0) + salt), 668265263);
        h = Math.imul(h ^ ((z | 0) - salt), 2147483647);
        h ^= h >>> 13;
        h = Math.imul(h, 1274126177);
        h ^= h >>> 16;
        return (h >>> 0) / 4294967296;
    };

    const isExposed = (idx: number, y: number, x: number, z: number): boolean => {
        if (x > 0 && blocks[idx - 1] === BlockType.AIR) return true;
        if (x < CHUNK_SIZE - 1 && blocks[idx + 1] === BlockType.AIR) return true;
        if (z > 0 && blocks[idx - CHUNK_SIZE] === BlockType.AIR) return true;
        if (z < CHUNK_SIZE - 1 && blocks[idx + CHUNK_SIZE] === BlockType.AIR) return true;
        if (y > MIN_Y && blocks[idx - CHUNK_SIZE * CHUNK_SIZE] === BlockType.AIR) return true;
        if (y < MAX_Y && blocks[idx + CHUNK_SIZE * CHUNK_SIZE] === BlockType.AIR) return true;
        return false;
    };

    const getTriangularChance = (y: number, min: number, max: number, peak: number): number => {
        if (y < min || y > max) return 0;
        if (y === peak) return 1.0;
        if (y < peak) return (y - min) / (peak - min);
        return (max - y) / (max - peak);
    };

    // 1. Terrain Pass
    for (let x = 0; x < CHUNK_SIZE; x++) {
        for (let z = 0; z < CHUNK_SIZE; z++) {
            const wx = worldX + x;
            const wz = worldZ + z;
            
            const biome = getBiome(wx, wz, noiseSet);
            const { height, baseHeight } = getTerrainInfo(wx, wz, noiseSet);
            
            const params = getGenerationParams(wx, wz, noiseSet);
            const contVal = params.continentalness;
            const riverVal = Math.abs(params.riverVal);

            const isCoastal = (contVal > -0.55 && contVal < GenConfig.biomes.ocean.continentalnessMax + 0.15);
            const isRiverBank = (riverVal > GenConfig.biomes.river.width - 0.002 && riverVal < GenConfig.biomes.river.width * 7.0);
            let isBeachZone = isCoastal || isRiverBank;

            if (!isBeachZone && height >= 60 && height <= 65) {
                 const offsets = [[4,0], [-4,0], [0,4], [0,-4]];
                 for(const [ox, oz] of offsets) {
                     const nh = getTerrainHeight(wx + ox, wz + oz, noiseSet);
                     if ((height >= 63 && nh < 63) || (height < 63 && nh >= 63)) {
                         isBeachZone = true;
                         break;
                     }
                 }
            }

            const cwx = wx + caveOx;
            const cwz = wz + caveOz;
            const wdx = wx + noiseSet.offsets.weirdness.x;
            const wdz = wz + noiseSet.offsets.weirdness.z;
            const breachNoise = noiseSet.cave.noise2D(cwx * 0.015, cwz * 0.015);
            const isBreachZone = breachNoise > 0.05; 

            // Loop from top (MAX_Y) down to bottom (MIN_Y)
            for (let y = MAX_Y; y >= MIN_Y; y--) {
                let type = BlockType.AIR;
                const index = index3D(x, y, z);
                
                if (y === MIN_Y) {
                    type = BlockType.BEDROCK;
                } else if (y <= height) { 
                    if (y < height - 4) type = BlockType.STONE;
                    else if (y < height) {
                        type = biome.subBlock;
                    } else {
                        type = biome.surfaceBlock;
                    }

                    if (biome.id === 'red_mesa' || biome.id === 'mesa_bryce') {
                        if (y > baseHeight + 1) {
                            type = getStrataBlock(y);
                        } else {
                            if (y === height) {
                                type = BlockType.RED_SAND;
                            } else if (y >= height - 3) {
                                type = BlockType.RED_SANDSTONE;
                            }
                        }
                    }

                    if (biome.id === 'volcanic' && y === height) {
                        const lavaNoise = noiseSet.cave.noise2D(cwx * 0.08, cwz * 0.08);
                        if (lavaNoise > 0.6) type = BlockType.LAVA;
                        else if (lavaNoise > 0.3) type = BlockType.MAGMA;
                    }

                    // Mountains — elevation-banded surface: grass foothills,
                    // bare stone-variant slopes (andesite/diorite/granite), snow caps.
                    if (biome.id === 'mountains' && y === height) {
                        if (height > 150) {
                            type = BlockType.SNOW_BLOCK;
                        } else if (height > 110) {
                            // Use the column's noise to pick a stone variant so
                            // bands of andesite/diorite/granite streak the cliffs.
                            const stoneNoise = noiseSet.cave.noise2D(cwx * 0.1, cwz * 0.1);
                            if (stoneNoise > 0.33) type = BlockType.GRANITE;
                            else if (stoneNoise < -0.33) type = BlockType.DIORITE;
                            else type = BlockType.ANDESITE;
                        } else {
                            type = BlockType.GRASS;
                        }
                    }

                    if (isBeachZone && height >= 60 && height <= 65 && biome.id !== 'volcanic' && biome.id !== 'red_mesa' && biome.id !== 'mesa_bryce' && biome.id !== 'stone_shore' && biome.id !== 'mountains') {
                        const depth = height - y;
                        if (depth < 4) {
                            if (depth === 3) type = BlockType.SANDSTONE;
                            else type = BlockType.SAND;
                        }
                    }

                    if (y < 63 && type === BlockType.GRASS) {
                        type = BlockType.DIRT;
                    }
                    
                    if (y > MIN_Y) { 
                        if (biome.id === 'mesa_bryce' && y > baseHeight) {
                        } else {
                            let isCave = false;
                            const depth = height - y;

                            let surfaceTaper = 1.0;
                            if (depth < 20) {
                                surfaceTaper = depth / 20.0;
                                if (isBreachZone) {
                                    surfaceTaper = Math.max(0.6, surfaceTaper);
                                }
                            }

                            const wormFreq = 0.02;
                            const wormThresh = 0.15 * surfaceTaper; 
                            const wc1 = noiseSet.cave.noise3D(cwx * wormFreq, y * wormFreq * 1.2, cwz * wormFreq);
                            if (Math.abs(wc1) < wormThresh) {
                                const wc2 = noiseSet.cave.noise3D(cwx * wormFreq + 123.4, y * wormFreq * 1.2 + 123.4, cwz * wormFreq + 123.4);
                                const wormVal = Math.sqrt(wc1*wc1 + wc2*wc2);
                                if (wormVal < wormThresh) isCave = true;
                            }

                            if (!isCave && depth > 15) {
                                const megaMask = noiseSet.cave.noise3D(cwx * 0.005, y * 0.02, cwz * 0.005);
                                if (megaMask > 0.5) { 
                                    const megaFreq = 0.012; 
                                    const megaThresh = 0.25;
                                    const mc1 = noiseSet.cave.noise3D(cwx * megaFreq + 99, y * megaFreq + 99, cwz * megaFreq + 99);
                                    if (Math.abs(mc1) < megaThresh) {
                                        const mc2 = noiseSet.cave.noise3D(cwx * megaFreq + 88, y * megaFreq + 88, cwz * megaFreq + 88);
                                        const megaVal = Math.sqrt(mc1*mc1 + mc2*mc2);
                                        if (megaVal < megaThresh) isCave = true; 
                                    }
                                }
                            }

                            if (!isCave) {
                                const noodleFreq = 0.05; 
                                const noodleMask = noiseSet.cave.noise3D(cwx * 0.01 + 222, y * 0.01, cwz * 0.01 + 222);
                                if (noodleMask > 0.2) {
                                    const noodleThresh = 0.08 * surfaceTaper;
                                    const nc1 = noiseSet.cave.noise3D(cwx * noodleFreq + 555, y * noodleFreq, cwz * noodleFreq + 555);
                                    if (Math.abs(nc1) < noodleThresh) {
                                        const nc2 = noiseSet.cave.noise3D(cwx * noodleFreq + 444, y * noodleFreq, cwz * noodleFreq + 444);
                                        const noodleVal = Math.sqrt(nc1*nc1 + nc2*nc2);
                                        if (noodleVal < noodleThresh) isCave = true;
                                    }
                                }
                            }
                            
                            if (!isCave && depth > 10 && y < 0) {
                                const cheeseFreq = 0.03;
                                const cheeseVal = noiseSet.cave.noise3D(cwx * cheeseFreq + 777, y * cheeseFreq + 777, cwz * cheeseFreq + 777);
                                if (cheeseVal > 0.45) isCave = true; 
                            }

                            if (isCave) {
                                if (y <= MIN_Y + 10) type = BlockType.LAVA;
                                else type = BlockType.AIR;
                            }
                        }
                    }
                } else if (y <= 63) {
                    if (biome.waterBlock === BlockType.ICE) {
                        if (y === 63) type = BlockType.ICE;
                        else type = BlockType.WATER;
                    } else {
                        type = biome.waterBlock;
                    }
                }
                
                blocks[index] = type;
                if (type !== BlockType.AIR && y > colHeightmap[z * CHUNK_SIZE + x]) {
                    colHeightmap[z * CHUNK_SIZE + x] = y;
                }
            }

            // --- 1.18 ORE GENERATION ---
            const stoneTop = height - 1; 
            for (let y = MIN_Y + 1; y <= stoneTop; y++) {
                const index = index3D(x, y, z);
                if (blocks[index] !== BlockType.STONE) continue;
                let coalChance = getTriangularChance(y, 0, 192, 96);
                if (coalChance > 0) {
                    const noise = noiseSet.cave.noise3D(cwx * 0.15, y * 0.15, cwz * 0.15);
                    if (noise > 0.45) { 
                        if (!isExposed(index, y, x, z) || seededRand01(wx, y, wz, 101) > 0.5) {
                            blocks[index] = BlockType.COAL_ORE;
                            continue;
                        }
                    }
                }
                let copperChance = getTriangularChance(y, -16, 112, 48);
                if (copperChance > 0) {
                    const copperGeoNoise = noiseSet.weirdness.noise3D(wdx*0.05, y*0.05, wdz*0.05);
                    const favorCopper = copperGeoNoise > 0.3;
                    const noise = noiseSet.cave.noise3D(cwx * 0.12 + 999, y * 0.12 + 999, cwz * 0.12 + 999);
                    const threshold = favorCopper ? 0.45 : 0.6; 
                    if (noise > threshold) {
                        if (!isExposed(index, y, x, z) || seededRand01(wx, y, wz, 102) > 0.5) {
                            blocks[index] = BlockType.COPPER_ORE;
                            continue;
                        }
                    }
                }
                let ironChance = Math.max(
                    getTriangularChance(y, -64, 72, 16),
                    getTriangularChance(y, 80, 320, 232)
                );
                if (ironChance > 0) {
                    const noise = noiseSet.cave.noise3D(cwx * 0.2 + 123, y * 0.2 + 123, cwz * 0.2 + 123);
                    if (noise > 0.52) {
                        if (!isExposed(index, y, x, z) || seededRand01(wx, y, wz, 103) > 0.5) {
                            blocks[index] = BlockType.IRON_ORE;
                            continue;
                        }
                    }
                }
                let goldChance = getTriangularChance(y, -64, 32, -16);
                let isMesaGold = false;
                if (biome.id === 'red_mesa' || biome.id === 'mesa_bryce') {
                    if (y >= -64 && y <= 256) {
                        goldChance = 1.0; 
                        isMesaGold = true;
                    }
                }
                if (goldChance > 0) {
                    const noise = noiseSet.cave.noise3D(cwx * 0.25 + 777, y * 0.25 + 777, cwz * 0.25 + 777);
                    const threshold = isMesaGold ? 0.45 : 0.6;
                    if (noise > threshold) {
                        if (isMesaGold || !isExposed(index, y, x, z) || seededRand01(wx, y, wz, 104) > 0.5) {
                            blocks[index] = BlockType.GOLD_ORE;
                            continue;
                        }
                    }
                }
                let lapisChance = getTriangularChance(y, -64, 64, -1);
                if (lapisChance > 0) {
                    const noise = noiseSet.cave.noise3D(cwx * 0.3 + 444, y * 0.3 + 444, cwz * 0.3 + 444);
                    if (noise > 0.65) {
                        if (!isExposed(index, y, x, z)) {
                            blocks[index] = BlockType.LAPIS_ORE;
                            continue;
                        }
                    }
                }
                if (y <= 16) {
                    const ramp = (16 - y) / (16 - (-64));
                    const noise = noiseSet.cave.noise3D(cwx * 0.35 + 333, y * 0.35 + 333, cwz * 0.35 + 333);
                    const threshold = 0.8 - (ramp * 0.2);
                    if (noise > threshold) {
                        if (!isExposed(index, y, x, z) || seededRand01(wx, y, wz, 105) > 0.5) {
                            blocks[index] = BlockType.DIAMOND_ORE;
                            continue;
                        }
                    }
                }
                if (biome.name.includes("Volcanic") || biome.name.includes("Mesa") || biome.name.includes("Tundra") || height > 90) {
                    let emeraldChance = getTriangularChance(y, -16, 320, 232);
                    if (emeraldChance > 0) {
                        const noise = noiseSet.cave.noise3D(cwx * 0.35 + 111, y * 0.35 + 111, cwz * 0.35 + 111);
                        if (noise > 0.75) { 
                            blocks[index] = BlockType.EMERALD_ORE;
                            continue;
                        }
                    }
                }
            }
        }
    }

    // 2. Vegetation Pass
    // Trees sample a padded world-space area so that a tree rooted in a
    // neighbouring chunk can still contribute logs/leaves to this one.
    // Padding = cherry max lean (4) + canopy radius (3) + 1 safety margin.
    const TREE_FEATURE_PADDING = 8;

    // Places a block at world coordinates only if the position falls inside this chunk.
    const placeIfInChunk = (wpx: number, wpy: number, wpz: number, blockType: BlockType, onlyAir = false): void => {
        const lx = wpx - worldX;
        const lz = wpz - worldZ;
        if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE) return;
        if (wpy < MIN_Y || wpy > MAX_Y) return;
        const idx = index3D(lx, wpy, lz);
        if (onlyAir && blocks[idx] !== BlockType.AIR) return;
        blocks[idx] = blockType;
        const colIdx = lz * CHUNK_SIZE + lx;
        if (wpy > colHeightmap[colIdx]) colHeightmap[colIdx] = wpy;
    };

    for (let rootWx = worldX - TREE_FEATURE_PADDING; rootWx < worldX + CHUNK_SIZE + TREE_FEATURE_PADDING; rootWx++) {
        for (let rootWz = worldZ - TREE_FEATURE_PADDING; rootWz < worldZ + CHUNK_SIZE + TREE_FEATURE_PADDING; rootWz++) {
            const biome = getBiome(rootWx, rootWz, noiseSet);
            const treeRnd = seededRand01(rootWx, 0, rootWz, 201);

            if (biome.treeType !== 'none' && treeRnd < biome.treeChance) {
                const terrainY = getTerrainHeight(rootWx, rootWz, noiseSet);
                if (terrainY <= 63) continue;
                const groundY = terrainY;

                // Use resolved surface logic that matches the terrain pass (beach/river/mesa overrides).
                const resolvedSurface = getResolvedSurface(rootWx, rootWz, noiseSet);
                if (!isValidSoil(resolvedSurface)) continue;

                // NOTE: deliberately no check against the actual placed block here.
                // The resolved-surface check above is pure noise, so it evaluates
                // identically when this root is processed by neighboring chunks. An
                // actual-block check only worked for in-chunk roots, so a tree could
                // be skipped by its home chunk while neighbors still placed its
                // canopy — orphan leaves floating across borders.

                let treeKind: TreeKind;
                if (biome.treeType === 'mixed_forest') {
                    treeKind = seededRand01(rootWx, groundY, rootWz, 202) < 0.2 ? 'birch' : 'oak';
                } else {
                    treeKind = biome.treeType as TreeKind;
                }

                const treeBlocks = generateTreeBlocks(treeKind, rootWx, groundY, rootWz, worldSeed);
                for (const tb of treeBlocks) {
                    placeIfInChunk(tb.wx, tb.wy, tb.wz, tb.type, !tb.isTrunk);
                }
            } else if (treeRnd > 0.5 && treeRnd < 0.5 + biome.vegetationChance) {
                // Vegetation plants remain chunk-local — only process roots inside the
                // current chunk. Placement is a single block (or vertical cactus), so the
                // full 0..15 range is safe; the old 3-block margin left visible barren
                // strips along every 16-block grid line.
                const rootLx = rootWx - worldX;
                const rootLz = rootWz - worldZ;
                if (rootLx < 0 || rootLx >= CHUNK_SIZE || rootLz < 0 || rootLz >= CHUNK_SIZE) continue;

                const terrainY = getTerrainHeight(rootWx, rootWz, noiseSet);
                if (terrainY <= 63) continue;
                const idx = index3D(rootLx, terrainY, rootLz);
                const t = blocks[idx];
                if ((t === biome.surfaceBlock || t === BlockType.SAND || t === BlockType.RED_SAND || t === BlockType.TERRACOTTA_ORANGE) && terrainY < MAX_Y - 3) {
                    const upIdx = index3D(rootLx, terrainY + 1, rootLz);
                    if (blocks[upIdx] === BlockType.AIR) {
                        const plantRnd = seededRand01(rootWx, terrainY, rootWz, 214);
                        const vType = biome.vegetationType || 'none';
                        const markH = () => { colHeightmap[rootLz * CHUNK_SIZE + rootLx] = Math.max(colHeightmap[rootLz * CHUNK_SIZE + rootLx], terrainY + 1); };

                        if (vType === 'desert') {
                            if (t === BlockType.SAND || t === BlockType.RED_SAND) {
                                if (plantRnd < 0.4) {
                                    const h = 1 + Math.floor(seededRand01(rootWx, terrainY, rootWz, 212) * 3);
                                    for (let i = 1; i <= h; i++) {
                                        const cy = terrainY + i;
                                        const cIdx = index3D(rootLx, cy, rootLz);
                                        if (cIdx >= 0 && cIdx < blocks.length) {
                                            blocks[cIdx] = BlockType.CACTUS;
                                            colHeightmap[rootLz * CHUNK_SIZE + rootLx] = Math.max(colHeightmap[rootLz * CHUNK_SIZE + rootLx], cy);
                                        }
                                    }
                                } else {
                                    blocks[upIdx] = BlockType.DEAD_BUSH;
                                    markH();
                                }
                            } else if (plantRnd < 0.05) {
                                // Terracotta strata (mesa/bryce) — occasional dead bush.
                                blocks[upIdx] = BlockType.DEAD_BUSH;
                                markH();
                            }
                        } else if (vType === 'forest') {
                            if (isGrassySurface(t)) {
                                if (plantRnd < 0.7) blocks[upIdx] = BlockType.GRASS_PLANT;
                                else if (plantRnd < 0.85) blocks[upIdx] = BlockType.DANDELION;
                                else blocks[upIdx] = BlockType.ROSE;
                                markH();
                            }
                        } else if (vType === 'flowers') {
                            if (isGrassySurface(t)) {
                                if (plantRnd < 0.3) blocks[upIdx] = BlockType.DANDELION;
                                else if (plantRnd < 0.6) blocks[upIdx] = BlockType.ROSE;
                                else if (plantRnd < 0.8) blocks[upIdx] = BlockType.PINK_FLOWER;
                                else blocks[upIdx] = BlockType.GRASS_PLANT;
                                markH();
                            }
                        } else if (vType === 'sparse') {
                            if (isGrassySurface(t)) {
                                if (plantRnd < 0.9) blocks[upIdx] = BlockType.GRASS_PLANT;
                                else blocks[upIdx] = BlockType.DANDELION;
                                markH();
                            }
                        } else if (vType === 'cherry') {
                            if (isGrassySurface(t)) {
                                if (plantRnd < 0.3) blocks[upIdx] = BlockType.PINK_FLOWER;
                                else blocks[upIdx] = BlockType.GRASS_PLANT;
                                markH();
                            }
                        } else if (vType === 'savanna') {
                            if (isGrassySurface(t)) {
                                if (plantRnd < 0.8) blocks[upIdx] = BlockType.GRASS_PLANT;
                                else if (plantRnd < 0.9) blocks[upIdx] = BlockType.DEAD_BUSH;
                                else blocks[upIdx] = BlockType.DANDELION;
                                markH();
                            }
                        } else if (vType === 'jungle') {
                            if (isGrassySurface(t)) {
                                if (plantRnd < 0.6) blocks[upIdx] = BlockType.GRASS_PLANT;
                                else if (plantRnd < 0.8) blocks[upIdx] = BlockType.ROSE;
                                else if (plantRnd < 0.9) blocks[upIdx] = BlockType.DANDELION;
                                else blocks[upIdx] = BlockType.PINK_FLOWER;
                                markH();
                            }
                        } else if (vType === 'taiga') {
                            if (isGrassySurface(t)) {
                                if (plantRnd < 0.6) blocks[upIdx] = BlockType.DEAD_BUSH;
                                else blocks[upIdx] = BlockType.GRASS_PLANT;
                                markH();
                            }
                        } else if (vType === 'swamp') {
                            if (t === BlockType.MUD || t === BlockType.DIRT) {
                                if (plantRnd < 0.5) blocks[upIdx] = BlockType.DEAD_BUSH;
                                else if (plantRnd < 0.9) blocks[upIdx] = BlockType.GRASS_PLANT;
                                else blocks[upIdx] = BlockType.DANDELION;
                                markH();
                            }
                        }
                        // vType === 'none': no decoration
                    }
                }
            }

            // Ice Spikes — rare towering packed-ice pillars rising from the snow.
            if (biome.id === 'ice_spikes') {
                const rootLx = rootWx - worldX;
                const rootLz = rootWz - worldZ;
                if (rootLx >= 0 && rootLx < CHUNK_SIZE && rootLz >= 0 && rootLz < CHUNK_SIZE) {
                    const spikeRnd = seededRand01(rootWx, 0, rootWz, 231);
                    if (spikeRnd < 0.05) {
                        const terrainY = getTerrainHeight(rootWx, rootWz, noiseSet);
                        if (terrainY > 63 && terrainY < MAX_Y - 14) {
                            const baseIdx = index3D(rootLx, terrainY, rootLz);
                            if (blocks[baseIdx] === BlockType.SNOW_BLOCK) {
                                const spikeH = 5 + Math.floor(seededRand01(rootWx, terrainY, rootWz, 232) * 9); // 5-13 tall
                                for (let h = 1; h <= spikeH; h++) {
                                    const cy = terrainY + h;
                                    if (cy > MAX_Y) break;
                                    // Plus-shaped base for the bottom 3 layers, single column above,
                                    // with a tapered tip — reads as a sharp icicle from a distance.
                                    const isBase = h <= 3;
                                    const isTip = h >= spikeH - 1;
                                    const placeIce = (lx: number, lz: number) => {
                                        if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE) return;
                                        const cIdx = index3D(lx, cy, lz);
                                        if (cIdx < 0 || cIdx >= blocks.length) return;
                                        const cur = blocks[cIdx];
                                        if (cur === BlockType.AIR || cur === BlockType.SNOW_BLOCK) {
                                            blocks[cIdx] = BlockType.PACKED_ICE;
                                            colHeightmap[lz * CHUNK_SIZE + lx] = Math.max(colHeightmap[lz * CHUNK_SIZE + lx], cy);
                                        }
                                    };
                                    placeIce(rootLx, rootLz);
                                    if (isBase && !isTip) {
                                        placeIce(rootLx + 1, rootLz);
                                        placeIce(rootLx - 1, rootLz);
                                        placeIce(rootLx, rootLz + 1);
                                        placeIce(rootLx, rootLz - 1);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // 3. Initial Light Scan
    for (let x = 0; x < CHUNK_SIZE; x++) {
        for (let z = 0; z < CHUNK_SIZE; z++) {
            const maxHeight = colHeightmap[z * CHUNK_SIZE + x];
            
            // Fill sunlit air from top down to the first non-air block
            for (let y = MAX_Y; y > maxHeight; y--) {
                const index = index3D(x, y, z);
                light[index] = (15 << 4); // Full sunlight, no block light
            }

            let sky = 15;
            // Scan from highest non-air block down to bottom
            for (let y = maxHeight; y >= MIN_Y; y--) {
                const index = index3D(x, y, z);
                const type = blocks[index];
                // Skylight falls straight down — probe the top (downward-entry) face so
                // shaped blocks occlude by shape, identical to the edit-time scan.
                const opacity = getDirectionalOpacity(type, meta[index], 0, -1, 0);

                if (opacity >= 15) sky = 0;
                else if (opacity > 0) sky = Math.max(0, sky - opacity);
                
                const def = BLOCKS[type as BlockType];
                const emission = def ? (def.lightLevel || 0) : 0;
                const val = (sky << 4) | (emission & 0xF);
                light[index] = val;
                
                if (val > 0) {
                    lightQueue[qTail++] = index;
                }
            }
        }
    }

    // 3b. Seed horizontal skylight spreading. Sunlit air above each column was
    // filled with sky=15 but never enqueued, so light never spread sideways into
    // cave mouths, breach shafts, or carved notches — they rendered pitch black
    // except near chunk borders (where reconcileChunkBorders happened to fix it).
    // For every column, enqueue the sunlit cells in the band between its own
    // heightmap and the tallest in-chunk horizontal neighbor column.
    for (let x = 0; x < CHUNK_SIZE; x++) {
        for (let z = 0; z < CHUNK_SIZE; z++) {
            const ownH = colHeightmap[z * CHUNK_SIZE + x];
            let tallest = ownH;
            if (x > 0) tallest = Math.max(tallest, colHeightmap[z * CHUNK_SIZE + x - 1]);
            if (x < CHUNK_SIZE - 1) tallest = Math.max(tallest, colHeightmap[z * CHUNK_SIZE + x + 1]);
            if (z > 0) tallest = Math.max(tallest, colHeightmap[(z - 1) * CHUNK_SIZE + x]);
            if (z < CHUNK_SIZE - 1) tallest = Math.max(tallest, colHeightmap[(z + 1) * CHUNK_SIZE + x]);
            for (let y = ownH + 1; y <= tallest && qTail < lightQueue.length; y++) {
                lightQueue[qTail++] = index3D(x, y, z);
            }
        }
    }

    // 4. Internal Light Propagation
    while(qHead < qTail) {
        const i = lightQueue[qHead++];
        const x = i % CHUNK_SIZE;
        const remainder = Math.floor(i / CHUNK_SIZE);
        const z = remainder % CHUNK_SIZE;
        const yIndex = Math.floor(remainder / CHUNK_SIZE);
        const y = yIndex + MIN_Y;
        const val = light[i];
        const sky = (val >> 4) & 0xF;
        const block = val & 0xF;
        const srcType = blocks[i];
        const srcMeta = meta[i];
        for(let ni=0; ni<6; ni++) {
            const dx = NEIGHBORS[ni][0]; const dy = NEIGHBORS[ni][1]; const dz = NEIGHBORS[ni][2];
            const nx=x+dx; const ny=y+dy; const nz=z+dz;
            if (nx<0 || nx>=CHUNK_SIZE || ny<MIN_Y || ny>MAX_Y || nz<0 || nz>=CHUNK_SIZE) continue;
            const nIndex = index3D(nx, ny, nz);
            if (nIndex < 0 || nIndex >= blocks.length) continue;
            const nType = blocks[nIndex];
            // Paired occlusion: blocks if the source exit face, the target entry face,
            // or their combined partial coverage seals the crossing, so a shaped cell
            // can't leak light out through a solid (or jointly-solid) side.
            const opacity = getPairedFaceOcclusion(srcType, srcMeta, nType, meta[nIndex], dx, dy, dz);
            const atten = Math.max(1, opacity);
            const nVal = light[nIndex];
            let nSky = (nVal >> 4) & 0xF;
            let nBlock = nVal & 0xF;
            let updated = false;
            if (block > 0) {
                const nextBlock = block - atten;
                if (nextBlock > nBlock) { nBlock = nextBlock; updated = true; }
            }
            if (sky > 0) {
                let nextSky = sky - atten;
                if (dy === -1 && sky === 15 && opacity === 0) nextSky = 15;
                if (nextSky > nSky) { nSky = nextSky; updated = true; }
            }
            if (updated) {
                light[nIndex] = (nSky << 4) | (nBlock & 0xF);
                lightQueue[qTail++] = nIndex;
            }
        }
    }

    return { blocks, light, meta };
}
