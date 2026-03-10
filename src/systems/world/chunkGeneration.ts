import { BlockType } from '../../types';
import { BLOCKS } from '../../data/blocks';
import { CHUNK_SIZE, WORLD_HEIGHT, MIN_Y, MAX_Y } from '../../constants';
import { GlobalNoise, NoiseSet } from '../../utils/noise';
import { NEIGHBORS } from './worldConstants';
import { getOpacity } from './blockProps';
import { getBiome, getBiomeHeightInfo, getGenerationParams, sample } from './biomes';
import * as THREE from 'three';
import { GenConfig } from './genConfig';
import { index3D } from './worldCoords';

export function getTerrainInfo(x: number, z: number, noiseSet: NoiseSet = GlobalNoise): { height: number, baseHeight: number } {
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

export function generateChunk(cx: number, cz: number) {
    const blocks = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT);
    const light = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT);
    const meta = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT);
    
    // Column heightmap to speed up lighting pass
    const colHeightmap = new Int16Array(CHUNK_SIZE * CHUNK_SIZE).fill(MIN_Y);

    const lightQueue = new Int32Array(CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT * 2);
    let qHead = 0;
    let qTail = 0;

    const worldX = cx * CHUNK_SIZE;
    const worldZ = cz * CHUNK_SIZE;
    const worldSeed = GlobalNoise.seed | 0;
    const noiseSet = GlobalNoise;
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

                    if (isBeachZone && height >= 60 && height <= 65 && biome.id !== 'volcanic' && biome.id !== 'red_mesa' && biome.id !== 'mesa_bryce') {
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
                const checkExposed = () => isExposed(index, y, x, z);
                let coalChance = getTriangularChance(y, 0, 192, 96);
                if (coalChance > 0) {
                    const noise = noiseSet.cave.noise3D(cwx * 0.15, y * 0.15, cwz * 0.15);
                    if (noise > 0.45) { 
                        if (!checkExposed() || seededRand01(wx, y, wz, 101) > 0.5) {
                            blocks[index] = BlockType.COAL_ORE;
                            continue;
                        }
                    }
                }
                let copperChance = getTriangularChance(y, -16, 112, 48);
                if (copperChance > 0) {
                    const copperGeoNoise = noiseSet.weirdness.noise3D(cwx*0.05, y*0.05, cwz*0.05);
                    const favorCopper = copperGeoNoise > 0.3;
                    const noise = noiseSet.cave.noise3D(cwx * 0.12 + 999, y * 0.12 + 999, cwz * 0.12 + 999);
                    const threshold = favorCopper ? 0.45 : 0.6; 
                    if (noise > threshold) {
                        if (!checkExposed() || seededRand01(wx, y, wz, 102) > 0.5) {
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
                        if (!checkExposed() || seededRand01(wx, y, wz, 103) > 0.5) {
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
                        if (isMesaGold || !checkExposed() || seededRand01(wx, y, wz, 104) > 0.5) {
                            blocks[index] = BlockType.GOLD_ORE;
                            continue;
                        }
                    }
                }
                let lapisChance = getTriangularChance(y, -64, 64, -1);
                if (lapisChance > 0) {
                    const noise = noiseSet.cave.noise3D(cwx * 0.3 + 444, y * 0.3 + 444, cwz * 0.3 + 444);
                    if (noise > 0.65) {
                        if (!checkExposed()) {
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
                        if (!checkExposed() || seededRand01(wx, y, wz, 105) > 0.5) {
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
    for (let x = 3; x < CHUNK_SIZE - 3; x++) {
        for (let z = 3; z < CHUNK_SIZE - 3; z++) {
                const wx = worldX + x;
                const wz = worldZ + z;
                const biome = getBiome(wx, wz, noiseSet);
                const treeRnd = seededRand01(wx, 0, wz, 201);
                
                if (biome.treeType !== 'none' && treeRnd < biome.treeChance) { 
                    const terrainY = getTerrainHeight(wx, wz, noiseSet);
                    if (terrainY <= 63) continue;
                    const groundY = terrainY;
                    const idx = index3D(x, groundY, z);
                    const t = blocks[idx];
                    
                    if (t === biome.surfaceBlock || t === BlockType.DIRT || t === BlockType.GRASS || t === BlockType.SNOWY_GRASS || t === BlockType.RED_SAND) {
                        let currentTree: string = biome.treeType;
                        if (biome.treeType === 'mixed_forest') currentTree = seededRand01(wx, groundY, wz, 202) < 0.2 ? 'birch' : 'oak';

                        if (currentTree === 'oak') {
                            const treeH = 4 + Math.floor(seededRand01(wx, groundY, wz, 203) * 3);
                            for(let h = 1; h <= treeH; h++) {
                                const tIdx = index3D(x, groundY + h, z);
                                if (tIdx >= 0 && tIdx < blocks.length) {
                                    blocks[tIdx] = BlockType.LOG;
                                    colHeightmap[z * CHUNK_SIZE + x] = Math.max(colHeightmap[z * CHUNK_SIZE + x], groundY + h);
                                }
                            }
                            const leafStart = groundY + treeH - 2;
                            const leafEnd = groundY + treeH + 1;
                            for(let ly = leafStart; ly <= leafEnd; ly++) {
                                const range = ly === leafEnd ? 1 : 2;
                                for(let lx = x - range; lx <= x + range; lx++) {
                                    for(let lz = z - range; lz <= z + range; lz++) {
                                        if (Math.abs(lx - x) + Math.abs(lz - z) <= range) {
                                            if (lx >= 0 && lx < CHUNK_SIZE && lz >= 0 && lz < CHUNK_SIZE) {
                                                const lIdx = index3D(lx, ly, lz);
                                                if (lIdx >= 0 && lIdx < blocks.length && blocks[lIdx] === BlockType.AIR) {
                                                    blocks[lIdx] = BlockType.LEAVES;
                                                    colHeightmap[lz * CHUNK_SIZE + lx] = Math.max(colHeightmap[lz * CHUNK_SIZE + lx], ly);
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        } 
                        else if (currentTree === 'birch') {
                            const treeH = 5 + Math.floor(seededRand01(wx, groundY, wz, 204) * 2);
                            for(let h = 1; h <= treeH; h++) {
                                const tIdx = index3D(x, groundY + h, z);
                                if (tIdx >= 0 && tIdx < blocks.length) {
                                    blocks[tIdx] = BlockType.BIRCH_LOG;
                                    colHeightmap[z * CHUNK_SIZE + x] = Math.max(colHeightmap[z * CHUNK_SIZE + x], groundY + h);
                                }
                            }
                            const leafStart = groundY + treeH - 2;
                            const leafEnd = groundY + treeH + 1;
                            for(let ly = leafStart; ly <= leafEnd; ly++) {
                                const range = ly === leafEnd ? 1 : 2;
                                for(let lx = x - range; lx <= x + range; lx++) {
                                    for(let lz = z - range; lz <= z + range; lz++) {
                                        if (Math.abs(lx - x) + Math.abs(lz - z) <= range) {
                                            if (lx >= 0 && lx < CHUNK_SIZE && lz >= 0 && lz < CHUNK_SIZE) {
                                                const lIdx = index3D(lx, ly, lz);
                                                if (lIdx >= 0 && lIdx < blocks.length && blocks[lIdx] === BlockType.AIR) {
                                                    blocks[lIdx] = BlockType.BIRCH_LEAVES;
                                                    colHeightmap[lz * CHUNK_SIZE + lx] = Math.max(colHeightmap[lz * CHUNK_SIZE + lx], ly);
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        else if (currentTree === 'spruce') {
                            const treeH = 6 + Math.floor(seededRand01(wx, groundY, wz, 205) * 4);
                            for(let h = 1; h <= treeH; h++) {
                                const tIdx = index3D(x, groundY + h, z);
                                if (tIdx >= 0 && tIdx < blocks.length) {
                                    blocks[tIdx] = BlockType.SPRUCE_LOG;
                                    colHeightmap[z * CHUNK_SIZE + x] = Math.max(colHeightmap[z * CHUNK_SIZE + x], groundY + h);
                                }
                            }
                            for(let h = 3; h <= treeH + 1; h++) {
                                const radius = Math.floor((treeH - h + 1) * 0.4); 
                                for(let lx = x - radius; lx <= x + radius; lx++) {
                                    for(let lz = z - radius; lz <= z + radius; lz++) {
                                        if (Math.abs(lx - x) + Math.abs(lz - z) <= radius + 0.5) {
                                            if (lx >= 0 && lx < CHUNK_SIZE && lz >= 0 && lz < CHUNK_SIZE) {
                                                const ly = groundY + h;
                                                const lIdx = index3D(lx, ly, lz);
                                                if (lIdx >= 0 && lIdx < blocks.length && blocks[lIdx] === BlockType.AIR) {
                                                    blocks[lIdx] = BlockType.SPRUCE_LEAVES;
                                                    colHeightmap[lz * CHUNK_SIZE + lx] = Math.max(colHeightmap[lz * CHUNK_SIZE + lx], ly);
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                            const topH = groundY + treeH + 1;
                            const topIdx = index3D(x, topH, z);
                            if (topIdx >= 0 && topIdx < blocks.length) {
                                blocks[topIdx] = BlockType.SPRUCE_LEAVES;
                                colHeightmap[z * CHUNK_SIZE + x] = Math.max(colHeightmap[z * CHUNK_SIZE + x], topH);
                            }
                        }
                        else if (currentTree === 'cherry') {
                            const treeH = 5 + Math.floor(seededRand01(wx, groundY, wz, 206) * 2);
                            let tx = x, tz = z;
                            for(let h = 1; h <= treeH; h++) {
                                if (h > 2 && seededRand01(wx, groundY + h, wz, 207) > 0.5) {
                                    tx += seededRand01(wx + h, groundY, wz, 208) > 0.5 ? 1 : -1;
                                }
                                if (h > 2 && seededRand01(wx, groundY + h, wz, 209) > 0.5) {
                                    tz += seededRand01(wx, groundY, wz + h, 210) > 0.5 ? 1 : -1;
                                }
                                
                                if (tx>=0 && tx<CHUNK_SIZE && tz>=0 && tz<CHUNK_SIZE) {
                                    const tIdx = index3D(tx, groundY + h, tz);
                                    if (tIdx >= 0 && tIdx < blocks.length) {
                                        blocks[tIdx] = BlockType.CHERRY_LOG;
                                        colHeightmap[tz * CHUNK_SIZE + tx] = Math.max(colHeightmap[tz * CHUNK_SIZE + tx], groundY + h);
                                    }
                                }
                            }
                            const canopyCenterY = groundY + treeH;
                            for(let ly = canopyCenterY - 2; ly <= canopyCenterY + 1; ly++) {
                                const range = ly === canopyCenterY + 1 ? 1 : (ly === canopyCenterY ? 3 : 2);
                                for(let lx = tx - range; lx <= tx + range; lx++) {
                                    for(let lz = tz - range; lz <= tz + range; lz++) {
                                        if (lx>=0 && lx<CHUNK_SIZE && lz>=0 && lz<CHUNK_SIZE) {
                                            const dist = Math.sqrt((lx-tx)**2 + (lz-tz)**2);
                                            if (dist <= range + 0.5) {
                                                const lIdx = index3D(lx, ly, lz);
                                                if (lIdx >= 0 && lIdx < blocks.length && blocks[lIdx] === BlockType.AIR) {
                                                    blocks[lIdx] = BlockType.CHERRY_LEAVES;
                                                    colHeightmap[lz * CHUNK_SIZE + lx] = Math.max(colHeightmap[lz * CHUNK_SIZE + lx], ly);
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                } 
                else if (treeRnd > 0.5 && treeRnd < 0.5 + biome.vegetationChance) {
                    const terrainY = getTerrainHeight(wx, wz, noiseSet);
                    if (terrainY <= 63) continue;
                    const idx = index3D(x, terrainY, z);
                    const t = blocks[idx];
                    if ((t === biome.surfaceBlock || t === BlockType.SAND || t === BlockType.RED_SAND || t === BlockType.TERRACOTTA_ORANGE) && terrainY < MAX_Y - 3) {
                        const upIdx = index3D(x, terrainY + 1, z);
                        if (blocks[upIdx] === BlockType.AIR) {
                            if (biome.id === 'desert' || biome.id === 'red_mesa' || biome.id === 'mesa_bryce') {
                                if (t === BlockType.SAND || t === BlockType.RED_SAND) {
                                    if (biome.id === 'desert' && seededRand01(wx, terrainY, wz, 211) < 0.4) {
                                        const h = 1 + Math.floor(seededRand01(wx, terrainY, wz, 212) * 3);
                                        for(let i=1; i<=h; i++) {
                                            const cy = terrainY + i;
                                            const cIdx = index3D(x, cy, z);
                                            if (cIdx >= 0 && cIdx < blocks.length) {
                                                blocks[cIdx] = BlockType.CACTUS;
                                                colHeightmap[z * CHUNK_SIZE + x] = Math.max(colHeightmap[z * CHUNK_SIZE + x], cy);
                                            }
                                        }
                                    } else {
                                        blocks[upIdx] = BlockType.DEAD_BUSH;
                                        colHeightmap[z * CHUNK_SIZE + x] = Math.max(colHeightmap[z * CHUNK_SIZE + x], terrainY + 1);
                                    }
                                } else if (biome.id === 'mesa_bryce' && seededRand01(wx, terrainY, wz, 213) < 0.05) {
                                    blocks[upIdx] = BlockType.DEAD_BUSH;
                                    colHeightmap[z * CHUNK_SIZE + x] = Math.max(colHeightmap[z * CHUNK_SIZE + x], terrainY + 1);
                                }
                            } else if (biome.id === 'plains' || biome.id === 'forest') {
                                if (t === BlockType.GRASS) {
                                    const plantRnd = seededRand01(wx, terrainY, wz, 214);
                                    if (plantRnd < 0.7) blocks[upIdx] = BlockType.GRASS_PLANT;
                                    else if (plantRnd < 0.85) blocks[upIdx] = BlockType.DANDELION;
                                    else blocks[upIdx] = BlockType.ROSE;
                                    colHeightmap[z * CHUNK_SIZE + x] = Math.max(colHeightmap[z * CHUNK_SIZE + x], terrainY + 1);
                                }
                            } else if (biome.id === 'cherry_grove') {
                                if (t === BlockType.GRASS) {
                                    const plantRnd = seededRand01(wx, terrainY, wz, 215);
                                    if (plantRnd < 0.3) blocks[upIdx] = BlockType.PINK_FLOWER;
                                    else if (plantRnd < 0.7) blocks[upIdx] = BlockType.GRASS_PLANT;
                                    colHeightmap[z * CHUNK_SIZE + x] = Math.max(colHeightmap[z * CHUNK_SIZE + x], terrainY + 1);
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
                const opacity = getOpacity(type);
                
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
        for(let ni=0; ni<6; ni++) {
            const dx = NEIGHBORS[ni][0]; const dy = NEIGHBORS[ni][1]; const dz = NEIGHBORS[ni][2];
            const nx=x+dx; const ny=y+dy; const nz=z+dz;
            if (nx<0 || nx>=CHUNK_SIZE || ny<MIN_Y || ny>MAX_Y || nz<0 || nz>=CHUNK_SIZE) continue;
            const nIndex = index3D(nx, ny, nz);
            if (nIndex < 0 || nIndex >= blocks.length) continue;
            const nType = blocks[nIndex];
            const opacity = getOpacity(nType);
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