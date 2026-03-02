
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
        weirdness: { scale: 0.002, type: 'perlin' as NoiseType, octaves: 1, lacunarity: 2.0, gain: 0.5, amplification: 1.0 },
        continentalness: { scale: 0.001, type: 'perlin' as NoiseType, octaves: 1, lacunarity: 2.0, gain: 0.5, offset: -0.15 },
        river: { scale: 0.004, type: 'perlin' as NoiseType, octaves: 1, lacunarity: 2.0, gain: 0.5, jitter: 0.5 },
        // Terrain uses manual octaves in chunkGeneration, but we expose base params here
        terrain: { scale: 0, scale1: 0.01, scale2: 0.05, type: 'perlin' as NoiseType, octaves: 1, lacunarity: 2, gain: 0.5 } // Dummy defaults for shared props
    },
    // Blending and Coastline Shapes
    terrainShape: {
        coastPower: 2.2,       // Curve sharpness for ocean-to-land slope
        landOffset: 0.12,      // How much continentalness past "coast" is required for full land height
        oceanBaseDepth: 38,    // Shallow ocean floor base Y
        oceanDeepBase: 26,     // Deep ocean floor base Y
        oceanScale: 8,         // Terrain noise scale underwater
    },
    biomes: {
        ocean: { continentalnessMax: -0.30, base: 38, scale: 8 }, 
        tundra: { maxTemp: -0.7, base: 75, scale: 35 }, // Tundra Land Settings & Water Freezing Threshold
        river: { width: 0.012, base: 58, scale: 5 },
        
        volcanic: { minTemp: 0.80, minWeird: 0.50, base: 80, scale: 85 },
        mesaBryce: { minTemp: 0.65, minWeird: 0.30, maxWeird: 0.45, base: 72, scale: 10 },
        mesa: { minTemp: 0.6, base: 72, scale: 10 },
        desert: { minTemp: 0.35, base: 72, scale: 15 },
        plains: { minTemp: 0.0, base: 70, scale: 20 },
        forest: { minTemp: -0.4, base: 72, scale: 25 },
        cherry: { minTemp: -0.7, base: 85, scale: 45 },
    },
    height: {
        globalScale: 1.0,
        seaLevel: 63
    }
};

// Deep copy helper
function clone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
}

export const GenConfig = clone(DEFAULTS);

// Internal helper to apply a state object to the mutable GenConfig
function applyState(source: typeof DEFAULTS) {
    // Noise
    GenConfig.noise.temperature = clone(source.noise.temperature);
    GenConfig.noise.weirdness = clone(source.noise.weirdness);
    GenConfig.noise.continentalness = clone(source.noise.continentalness);
    GenConfig.noise.river = clone(source.noise.river);
    GenConfig.noise.terrain = clone(source.noise.terrain);

    // Terrain Shape
    GenConfig.terrainShape = clone(source.terrainShape);

    // Biomes
    const keys = Object.keys(source.biomes) as (keyof typeof source.biomes)[];
    keys.forEach(k => {
        // @ts-ignore
        if (GenConfig.biomes[k]) GenConfig.biomes[k] = clone(source.biomes[k]);
    });

    // Height
    GenConfig.height.globalScale = source.height.globalScale;
    GenConfig.height.seaLevel = source.height.seaLevel;
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
    const biomeKeys = Object.keys(GenConfig.biomes) as (keyof typeof GenConfig.biomes)[];
    biomeKeys.forEach(k => {
        const b = (GenConfig.biomes as any)[k];
        
        // Randomize thresholds
        if (b.minTemp !== undefined) b.minTemp = parseFloat(rf(-1, 1).toFixed(2));
        if (b.maxTemp !== undefined) b.maxTemp = parseFloat(rf(-1, 1).toFixed(2));
        if (b.minWeird !== undefined) b.minWeird = parseFloat(rf(-1, 1).toFixed(2));
        
        // Randomize height settings
        if (b.base !== undefined) b.base = rf(30, 110);
        if (b.scale !== undefined) b.scale = rf(5, 70);
        
        // Specific params
        if (b.continentalnessMax !== undefined) b.continentalnessMax = parseFloat(rf(-0.8, -0.1).toFixed(2));
        if (b.width !== undefined) b.width = rf(0.005, 0.08);
    });

    // Height Scale
    GenConfig.height.globalScale = rf(0.5, 2.5);
};

// Load config from JSON object
export const loadGenConfig = (data: any) => {
    if (!data) return false;
    try {
        const temp = clone(GenConfig);
        
        if (data.noise) {
            Object.keys(data.noise).forEach(k => {
                // @ts-ignore
                if (temp.noise[k]) Object.assign(temp.noise[k], data.noise[k]);
            });
        }
        if (data.terrainShape) Object.assign(temp.terrainShape, data.terrainShape);
        if (data.biomes) {
            Object.keys(data.biomes).forEach(k => {
                // @ts-ignore
                if (temp.biomes[k]) Object.assign(temp.biomes[k], data.biomes[k]);
            });
        }
        if (data.height) Object.assign(temp.height, data.height);
        
        applyState(temp);
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
