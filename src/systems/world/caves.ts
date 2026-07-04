// Enum-free cave sampler shared by the chunk generator and the World Editor
// cross-section preview. These are pure functions of position + noise + config
// (no BlockType, no NoiseSet type), so they are directly unit-testable under
// Node's type-stripping runner AND guaranteed identical in both call sites — the
// editor preview shows exactly what the generator will carve.

export interface CaveConfig {
    enabled: boolean;
    surfaceTaperDepth: number;
    breachFreq: number;
    breachThreshold: number;
    wormEnabled: boolean;
    wormFreq: number;
    wormThreshold: number;
    wormYScale: number;
    cavernEnabled: boolean;
    cavernMinDepth: number;
    cavernMaskThreshold: number;
    cavernFreq: number;
    cavernThreshold: number;
    noodleEnabled: boolean;
    noodleFreq: number;
    noodleMaskThreshold: number;
    noodleThreshold: number;
    deepCheeseEnabled: boolean;
    deepCheeseMaxY: number;
    deepCheeseFreq: number;
    deepCheeseThreshold: number;
    lavaLevel: number;
    deepslateStartY: number;
    deepslateFullY: number;
    decorate: boolean;
    lushFreq: number;
    lushThreshold: number;
    dripstoneFreq: number;
    dripstoneThreshold: number;
    glowLichenChance: number;
    mossChance: number;
    dripstoneChance: number;
    geodeRarity: number;
}

export type Noise2D = (x: number, z: number) => number;
export type Noise3D = (x: number, y: number, z: number) => number;

/** Cave-biome region (drives which decorations the pass places). */
export type CaveBiome = 'plain' | 'lush' | 'dripstone';

/**
 * Columns where cave mouths are allowed to breach daylight (near the surface the
 * carve threshold is otherwise tapered to near-zero, so caves stay sealed).
 */
export function isBreachColumn(cwx: number, cwz: number, caveNoise2D: Noise2D, cfg: CaveConfig): boolean {
    return caveNoise2D(cwx * cfg.breachFreq, cwz * cfg.breachFreq) > cfg.breachThreshold;
}

/**
 * 0..1 multiplier that fades cave carving in over the first `surfaceTaperDepth`
 * blocks below the surface (so caves don't shave the terrain skin off), with a
 * floor in breach columns so some caves reach the surface as open mouths.
 */
export function caveSurfaceTaper(depth: number, isBreach: boolean, cfg: CaveConfig): number {
    let taper = 1.0;
    if (depth < cfg.surfaceTaperDepth) {
        taper = depth / cfg.surfaceTaperDepth;
        if (isBreach) taper = Math.max(0.6, taper);
    }
    return Math.max(0, Math.min(1, taper));
}

/**
 * True when this cell should be carved out (air, or lava below the lava level).
 * Layered: spaghetti/worm tunnels, cheese caverns, noodle threads, and deep
 * swiss-cheese holes — each independently toggleable and tunable via config.
 */
export function isCaveCarved(
    cwx: number, y: number, cwz: number,
    depth: number, taper: number,
    caveNoise3D: Noise3D, cfg: CaveConfig,
): boolean {
    if (!cfg.enabled) return false;

    // Spaghetti / worm caves — magnitude of a 2-channel 3D field near zero traces
    // long winding tubes.
    if (cfg.wormEnabled) {
        const f = cfg.wormFreq;
        const thr = cfg.wormThreshold * taper;
        const wc1 = caveNoise3D(cwx * f, y * f * cfg.wormYScale, cwz * f);
        if (Math.abs(wc1) < thr) {
            const wc2 = caveNoise3D(cwx * f + 123.4, y * f * cfg.wormYScale + 123.4, cwz * f + 123.4);
            if (Math.sqrt(wc1 * wc1 + wc2 * wc2) < thr) return true;
        }
    }

    // Cheese caverns — large open rooms, gated to deeper rock by a coarse mask.
    if (cfg.cavernEnabled && depth > cfg.cavernMinDepth) {
        const mask = caveNoise3D(cwx * 0.005, y * 0.02, cwz * 0.005);
        if (mask > cfg.cavernMaskThreshold) {
            const f = cfg.cavernFreq;
            const thr = cfg.cavernThreshold;
            const mc1 = caveNoise3D(cwx * f + 99, y * f + 99, cwz * f + 99);
            if (Math.abs(mc1) < thr) {
                const mc2 = caveNoise3D(cwx * f + 88, y * f + 88, cwz * f + 88);
                if (Math.sqrt(mc1 * mc1 + mc2 * mc2) < thr) return true;
            }
        }
    }

    // Noodle caves — thin secondary tunnels threading between the big features.
    if (cfg.noodleEnabled) {
        const mask = caveNoise3D(cwx * 0.01 + 222, y * 0.01, cwz * 0.01 + 222);
        if (mask > cfg.noodleMaskThreshold) {
            const f = cfg.noodleFreq;
            const thr = cfg.noodleThreshold * taper;
            const nc1 = caveNoise3D(cwx * f + 555, y * f, cwz * f + 555);
            if (Math.abs(nc1) < thr) {
                const nc2 = caveNoise3D(cwx * f + 444, y * f, cwz * f + 444);
                if (Math.sqrt(nc1 * nc1 + nc2 * nc2) < thr) return true;
            }
        }
    }

    // Deep swiss-cheese holes near the world floor.
    if (cfg.deepCheeseEnabled && depth > 10 && y < cfg.deepCheeseMaxY) {
        const f = cfg.deepCheeseFreq;
        if (caveNoise3D(cwx * f + 777, y * f + 777, cwz * f + 777) > cfg.deepCheeseThreshold) return true;
    }

    return false;
}

/**
 * Which decoration region a column falls in. Two decorrelated low-frequency
 * fields; the one over its threshold (higher wins ties) claims the column.
 */
export function caveBiomeAt(cwx: number, cwz: number, caveNoise2D: Noise2D, cfg: CaveConfig): CaveBiome {
    const lush = caveNoise2D(cwx * cfg.lushFreq + 700, cwz * cfg.lushFreq + 700);
    const drip = caveNoise2D(cwx * cfg.dripstoneFreq - 700, cwz * cfg.dripstoneFreq - 700);
    const lushOn = lush > cfg.lushThreshold;
    const dripOn = drip > cfg.dripstoneThreshold;
    if (lushOn && (!dripOn || lush >= drip)) return 'lush';
    if (dripOn) return 'dripstone';
    return 'plain';
}

/**
 * Whether stone at this Y should be deepslate. Fully deepslate at/below
 * `deepslateFullY`, plain stone at/above `deepslateStartY`, and a hash-jagged
 * blend in between (pass a per-cell 0..1 hash so the boundary reads organic).
 */
export function isDeepslateAt(y: number, hash01: number, cfg: CaveConfig): boolean {
    if (y <= cfg.deepslateFullY) return true;
    if (y >= cfg.deepslateStartY) return false;
    const span = cfg.deepslateStartY - cfg.deepslateFullY;
    const frac = (cfg.deepslateStartY - y) / (span <= 0 ? 1 : span); // 0 at start → 1 at full
    return hash01 < frac;
}
