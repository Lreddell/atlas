
// Mutable configuration for World Generation
// This allows real-time editing from the WorldEdit debug tool

export type NoiseType = 'perlin' | 'opensimplex2' | 'cellular' | 'value' | 'sine' | 'white';

export interface NoiseParams {
    scale: number;
    type: NoiseType;
    octaves: number;     
    lacunarity: number;  
    gain: number;        
    jitter?: number;
    offset?: number;
    amplification?: number; 
    scale1?: number; // Terrain specific
    scale2?: number; // Terrain specific
}

// Initial default state
export const DEFAULTS = {
    noise: {
        temperature: { scale: 0.0006, type: 'perlin' as NoiseType, octaves: 1, lacunarity: 2.0, gain: 0.5, amplification: 1.5 },
        weirdness: { scale: 0.0012, type: 'perlin' as NoiseType, octaves: 2, lacunarity: 2.0, gain: 0.4, amplification: 1.45 },
        continentalness: { scale: 0.001, type: 'perlin' as NoiseType, octaves: 1, lacunarity: 2.0, gain: 0.5, offset: -0.15 },
        river: { scale: 0.004, type: 'perlin' as NoiseType, octaves: 1, lacunarity: 2.0, gain: 0.5, jitter: 0.5 },
        // Terrain uses manual octaves in chunkGeneration, but we expose base params here
        terrain: { scale: 0, scale1: 0.01, scale2: 0.05, type: 'perlin' as NoiseType, octaves: 1, lacunarity: 2, gain: 0.5 } // Dummy defaults for shared props
    },
    // Blending and Coastline Shapes
    terrainShape: {
        coastPower: 1.8,       // Curve sharpness for ocean-to-land slope
        landOffset: 0.14,      // How much continentalness past "coast" is required for full land height
        oceanBaseDepth: 38,    // Shallow ocean floor base Y
        oceanDeepBase: 26,     // Deep ocean floor base Y
        oceanScale: 8,         // Terrain noise scale underwater
    },
    biomes: {
        ocean: { continentalnessMax: -0.30, base: 38, scale: 8 },
        // Beach — the sandy coastal band bridging ocean and inland terrain. Its
        // base/scale also flatten the coast strip so dry beaches are wide.
        beach: { continentalnessMax: -0.25, base: 66, scale: 5 },
        tundra: { maxTemp: -0.7, base: 75, scale: 35 }, // Tundra Land Settings & Water Freezing Threshold
        river: { width: 0.012, base: 58, scale: 5 },

        volcanic: { minTemp: 0.72, minWeird: 0.45, base: 80, scale: 85 },
        mesaBryce: { minTemp: 0.65, minWeird: 0.30, maxWeird: 0.45, base: 72, scale: 10 },
        mesa: { minTemp: 0.6, base: 72, scale: 10 },
        desert: { minTemp: 0.35, base: 72, scale: 15 },
        plains: { minTemp: 0.0, base: 70, scale: 20 },
        forest: { minTemp: -0.4, base: 72, scale: 25 },
        cherry: { minTemp: -0.7, base: 85, scale: 45 },

        // --- Weirdness sub-bands within each temperature band ---
        // minWeird/maxWeird select the variant; base/scale shape terrain height
        // blending. The bands are disjoint from the mountains threshold below so
        // no temperate variant is shadowed by the mountain rule (the old 0.40
        // mountain threshold silently swallowed every weirdness > 0.40 biome:
        // swamps, jungles, and dark forests never generated).
        birchForest: { minTemp: -0.4, minWeird: -0.55, maxWeird: -0.25, base: 73, scale: 22 },
        flowerForest: { minTemp: -0.4, minWeird: 0.25, maxWeird: 0.42, base: 73, scale: 24 },
        darkForest: { minTemp: -0.4, minWeird: 0.50, maxWeird: 0.58, base: 74, scale: 28 },
        meadow: { minTemp: -0.7, minWeird: -0.30, maxWeird: 0.25, base: 80, scale: 14 },
        savanna: { minTemp: 0.0, minWeird: -1.0, maxWeird: -0.30, base: 71, scale: 12 },
        jungle: { minTemp: 0.0, minWeird: 0.42, maxWeird: 0.58, base: 74, scale: 30 },
        taiga: { maxTemp: -0.7, minWeird: 0.35, maxWeird: 1.0, base: 74, scale: 30 },
        iceSpikes: { maxTemp: -0.7, minWeird: -1.0, maxWeird: -0.50, base: 72, scale: 8 },
        mountains: { minWeird: 0.58, base: 145, scale: 120 },
        // Swamp — warm/wet lowland marsh. Spans the cherry+forest temp bands in
        // the 0.42..0.58 weirdness slot (capped by darkForest.minWeird in the
        // forest band), flattened to hover right at sea level for water pools.
        swamp: { minTemp: -0.7, maxTemp: 0.0, minWeird: 0.42, maxWeird: 0.58, base: 63, scale: 5 },
        stoneShore: { continentalnessMax: -0.18, base: 62, scale: 10 },
    },
    height: {
        globalScale: 1.0,
        seaLevel: 63
    },
    // Domain warp applied to every climate channel's sample coordinates. Enabled
    // by default so biome borders and coastlines read as organic, fractal edges
    // instead of smooth single-octave blobs. Old exported presets carry their own
    // climateWarp block, so loading them restores their original look.
    climateWarp: {
        enabled: true,
        frequency: 0.004,
        amplitude: 18
    },
    spawn: {
        searchRadius: 1024,
        slopePenaltyRadius: 4,
        maxSlopePenalty: 10,
        preferredElevationMin: 64,
        preferredElevationMax: 100,
        safeSearchRadius: 128,
        safeSearchStep: 16,
        earlyAcceptScore: 120
    },
    // Boss-domain worldgen. These used to be hardcoded constants in
    // magneticFields.ts; they are now editable config (World Editor > Biomes >
    // Magnetic Fields) with the old constants kept as compatibility defaults.
    // NOTE: cell / fieldFreq / fieldThreshold determine WHERE instances (and
    // their arenas) land — changing them relocates every Magnetic Field in an
    // existing world. The other values only reshape terrain around the same
    // deterministic centers.
    bossDomains: {
        magneticFields: {
            enabled: true,
            cell: 2560,            // grid spacing between candidate centers (blocks)
            radius: 384,           // base biome radius before edge warping
            fieldFreq: 0.0009,     // boss-field noise frequency for center activation
            fieldThreshold: 0.55,  // center activates only where the field peaks (rare)
            edgeFreq: 0.011,       // boundary wobble frequency
            edgeAmp: 0.28,         // boundary radius varies by ±28% → organic outline
            tierWarpFreq: 0.02,    // cliff-ring wobble frequency
            tierWarpAmp: 16,       // cliff rings shift in/out by up to 16 blocks
            shelfJitterFreq: 0.075,
            shelfJitterAmp: 1.8,   // ≈ ±2 blocks of bumpiness on shelves
            tierCount: 6,          // shelves: tier 0 (outer) .. tierCount-1 (plateau rim)
            tierHeight: 12,        // vertical rise of each magnetite wall
            arenaRadius: 80,       // flat plateau the arena sits on
            arenaFloorY: 132,      // world Y of the plateau / arena base
            baseHeight: 70,        // outer shelf surface (world Y of tier 0)
            apron: 64,             // edge band that ramps down into ambient terrain
            apronMinY: 60,         // apron never ramps below this (soft rocky shore)
        }
    }
};

export type WorldGenConfigSnapshot = typeof DEFAULTS;
type GenConfigState = WorldGenConfigSnapshot;
type NoiseKey = keyof GenConfigState['noise'];
type BiomeKey = keyof GenConfigState['biomes'];

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null;

const normalizeNoiseType = (value: unknown): NoiseType | null => {
    switch (value) {
        case 'perlin':
        case 'opensimplex2':
        case 'cellular':
        case 'value':
        case 'sine':
        case 'white':
            return value;
        case 'simplex':
            return 'opensimplex2';
        default:
            return null;
    }
};

// Deep copy helper
function clone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
}

const mergeKnownShape = (base: unknown, incoming: unknown): unknown => {
    if (!isRecord(base) || !isRecord(incoming)) return clone(base);

    const result = clone(base) as Record<string, unknown>;
    Object.keys(result).forEach((key) => {
        const incomingValue = incoming[key];
        if (incomingValue === undefined) return;

        const currentValue = result[key];
        if (isRecord(currentValue)) {
            if (isRecord(incomingValue)) {
                result[key] = mergeKnownShape(currentValue, incomingValue);
            }
            return;
        }

        if (!isRecord(incomingValue)) {
            result[key] = clone(incomingValue);
        }
    });
    return result;
};

export const normalizeGenConfigSnapshot = (
    data: unknown,
    base: WorldGenConfigSnapshot = DEFAULTS,
): WorldGenConfigSnapshot | null => {
    if (!isRecord(data)) return null;

    const normalized = mergeKnownShape(base, data) as WorldGenConfigSnapshot;
    const incomingNoise = isRecord(data.noise) ? data.noise : {};
    (Object.keys(normalized.noise) as NoiseKey[]).forEach((key) => {
        const incoming = incomingNoise[key];
        if (!isRecord(incoming) || !('type' in incoming)) return;
        normalized.noise[key].type = normalizeNoiseType(incoming.type) ?? base.noise[key].type;
    });
    return normalized;
};

export const GenConfig = clone(DEFAULTS);

// Internal helper to apply a state object to the mutable GenConfig
function applyState(source: typeof DEFAULTS) {
    Object.assign(GenConfig, clone(source));
}

// Helper to reset to defaults if needed
export const resetGenConfig = () => {
    applyState(DEFAULTS);
};

// Randomize everything
export const randomizeGenConfig = () => {
    const r = Math.random;
    const rf = (min: number, max: number) => min + r() * (max - min);

    // Randomize Noise
    const noiseKeys = ['temperature', 'continentalness', 'weirdness', 'river'] as const;
    const noiseTypes: NoiseType[] = ['perlin', 'opensimplex2', 'cellular', 'value', 'sine', 'white'];

    noiseKeys.forEach(k => {
        const n = GenConfig.noise[k] as NoiseParams;
        n.scale = rf(0.0001, 0.01); 
        n.octaves = Math.floor(rf(1, 5)); 
        n.lacunarity = rf(1.5, 3.5); 
        n.gain = rf(0.2, 0.9);
        if (n.amplification !== undefined) n.amplification = rf(0.5, 3.0);
        if (n.offset !== undefined) n.offset = rf(-0.5, 0.5);
        if (n.jitter !== undefined) n.jitter = r();
        
        // 15% chance to change noise type to something weird
        if (r() < 0.15) {
             n.type = noiseTypes[Math.floor(r() * noiseTypes.length)];
        } else {
            n.type = 'perlin';
        }
    });
    
    // Randomize Terrain Noise (Explicitly typed)
    const t = GenConfig.noise.terrain as NoiseParams;
    t.scale1 = rf(0.002, 0.05);
    t.scale2 = rf(0.01, 0.1);
    if (r() < 0.2) t.type = noiseTypes[Math.floor(r() * noiseTypes.length)];
    else t.type = 'perlin';

    // Randomize Terrain Shape
    GenConfig.terrainShape.coastPower = rf(0.5, 4.0);
    GenConfig.terrainShape.landOffset = rf(0.01, 0.4);
    GenConfig.terrainShape.oceanBaseDepth = rf(10, 50);
    GenConfig.terrainShape.oceanDeepBase = rf(5, 30);
    GenConfig.terrainShape.oceanScale = rf(5, 30);

    // Randomize Biomes
    const biomeKeys = Object.keys(GenConfig.biomes) as BiomeKey[];
    biomeKeys.forEach(k => {
        const b = GenConfig.biomes[k];
        
        // Randomize thresholds
        if ('minTemp' in b && b.minTemp !== undefined) b.minTemp = parseFloat(rf(-1, 1).toFixed(2));
        if ('maxTemp' in b && b.maxTemp !== undefined) b.maxTemp = parseFloat(rf(-1, 1).toFixed(2));
        if ('minWeird' in b && b.minWeird !== undefined) b.minWeird = parseFloat(rf(-1, 1).toFixed(2));
        
        // Randomize height settings
        if ('base' in b && b.base !== undefined) b.base = rf(30, 110);
        if ('scale' in b && b.scale !== undefined) b.scale = rf(5, 70);
        
        // Specific params
        if ('continentalnessMax' in b && b.continentalnessMax !== undefined) b.continentalnessMax = parseFloat(rf(-0.8, -0.1).toFixed(2));
        if ('width' in b && b.width !== undefined) b.width = rf(0.005, 0.08);
    });

    // Height Scale
    GenConfig.height.globalScale = rf(0.5, 2.5);
};

// Load config from JSON object
export const loadGenConfig = (data: unknown) => {
    try {
        const normalized = normalizeGenConfigSnapshot(data, GenConfig);
        if (!normalized) return false;
        applyState(normalized);
        return true;
    } catch (e) {
        console.error("Failed to load config:", e);
        return false;
    }
};

// --- HISTORY SYSTEM ---

const history: typeof DEFAULTS[] = [];
let historyIndex = -1;

export const initHistory = () => {
    if (history.length === 0) {
        history.push(clone(GenConfig));
        historyIndex = 0;
    }
};

export const pushHistory = () => {
    if (historyIndex < history.length - 1) {
        history.splice(historyIndex + 1);
    }
    
    const newState = clone(GenConfig);
    const currentState = history[historyIndex];
    
    if (JSON.stringify(newState) !== JSON.stringify(currentState)) {
        history.push(newState);
        historyIndex++;
        
        // Limit history size
        if (history.length > 50) {
            history.shift();
            historyIndex--;
        }
    }
};

export const undo = (): boolean => {
    if (historyIndex > 0) {
        historyIndex--;
        applyState(history[historyIndex]);
        return true;
    }
    return false;
};

export const redo = (): boolean => {
    if (historyIndex < history.length - 1) {
        historyIndex++;
        applyState(history[historyIndex]);
        return true;
    }
    return false;
};

export const getHistoryState = () => ({
    canUndo: historyIndex > 0,
    canRedo: historyIndex < history.length - 1
});
