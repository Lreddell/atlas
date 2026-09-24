// Graphics quality presets and the player's overrides on top of them.
//
// Pure data and functions only (no DOM, no three), so node tests can exercise
// every rule. graphicsStore.ts owns persistence and React subscription.
//
// A setting either comes from the chosen preset or from an explicit override.
// Picking a preset clears the overrides; changing any single option records an
// override and the menu shows the quality as "Custom".

export type GraphicsPresetId = 'low' | 'medium' | 'high' | 'ultra';
export type GraphicsQuality = GraphicsPresetId | 'custom';

export type ShadowQuality = 'off' | 'low' | 'medium' | 'high';
export type BloomQuality = 'off' | 'half' | 'full';
export type WaterQuality = 'simple' | 'fancy';
export type ParticleDensity = 'off' | 'low' | 'medium' | 'high';
export type CloudQuality = 'off' | 'fast' | 'fancy';
export type AntialiasMode = 'off' | 'msaa' | 'fxaa' | 'smaa';

export interface GraphicsConfig {
    shadows: ShadowQuality;
    bloom: BloomQuality;
    godRays: boolean;
    water: WaterQuality;
    foliageWind: boolean;
    ambientParticles: ParticleDensity;
    clouds: CloudQuality;
    antialiasing: AntialiasMode;
    /** Upper bound on the device pixel ratio the world renders at (HiDPI screens). */
    maxPixelRatio: 1 | 1.5 | 2;
    mipmaps: boolean;
    motionBlur: boolean;
    chunkFade: boolean;
    /** The first-person view sways gently with each step (and dips on landing). */
    viewBobbing: boolean;
}

export type GraphicsOverrides = Partial<GraphicsConfig>;

export const GRAPHICS_PRESET_ORDER: readonly GraphicsPresetId[] = ['low', 'medium', 'high', 'ultra'];

export const GRAPHICS_PRESETS: Readonly<Record<GraphicsPresetId, Readonly<GraphicsConfig>>> = {
    // Roughly the cost of the pre-overhaul renderer.
    low: {
        shadows: 'off', bloom: 'off', godRays: false, water: 'simple', foliageWind: false,
        ambientParticles: 'off', clouds: 'fast', antialiasing: 'msaa', maxPixelRatio: 1,
        mipmaps: true, motionBlur: false, chunkFade: true, viewBobbing: true,
    },
    medium: {
        shadows: 'low', bloom: 'half', godRays: false, water: 'fancy', foliageWind: true,
        ambientParticles: 'low', clouds: 'fancy', antialiasing: 'msaa', maxPixelRatio: 1.5,
        mipmaps: true, motionBlur: false, chunkFade: true, viewBobbing: true,
    },
    high: {
        shadows: 'medium', bloom: 'half', godRays: true, water: 'fancy', foliageWind: true,
        ambientParticles: 'medium', clouds: 'fancy', antialiasing: 'msaa', maxPixelRatio: 2,
        mipmaps: true, motionBlur: false, chunkFade: true, viewBobbing: true,
    },
    ultra: {
        shadows: 'high', bloom: 'full', godRays: true, water: 'fancy', foliageWind: true,
        ambientParticles: 'high', clouds: 'fancy', antialiasing: 'msaa', maxPixelRatio: 2,
        mipmaps: true, motionBlur: false, chunkFade: true, viewBobbing: true,
    },
};

/** Shadow map resolution and reach (blocks from the camera) per quality. */
export const SHADOW_QUALITY_SETTINGS: Readonly<Record<Exclude<ShadowQuality, 'off'>, { mapSize: number; distance: number }>> = {
    low: { mapSize: 1024, distance: 48 },
    medium: { mapSize: 2048, distance: 80 },
    high: { mapSize: 4096, distance: 112 },
};

export interface GraphicsSettingsState {
    version: 1;
    preset: GraphicsPresetId;
    overrides: GraphicsOverrides;
    /** False until the first launch has probed the GPU and picked a preset. */
    detected: boolean;
}

export const DEFAULT_GRAPHICS_STATE: GraphicsSettingsState = {
    version: 1, preset: 'medium', overrides: {}, detected: false,
};

export function resolveGraphicsConfig(state: Pick<GraphicsSettingsState, 'preset' | 'overrides'>): GraphicsConfig {
    return { ...GRAPHICS_PRESETS[state.preset], ...state.overrides };
}

export function graphicsQuality(state: Pick<GraphicsSettingsState, 'preset' | 'overrides'>): GraphicsQuality {
    return Object.keys(state.overrides).length > 0 ? 'custom' : state.preset;
}

/** Choosing a preset discards every override. */
export function withPreset(state: GraphicsSettingsState, preset: GraphicsPresetId): GraphicsSettingsState {
    return { ...state, preset, overrides: {}, detected: true };
}

/** One option changed: record it as an override, or drop the override when it matches the preset again. */
export function withOption<K extends keyof GraphicsConfig>(
    state: GraphicsSettingsState, key: K, value: GraphicsConfig[K],
): GraphicsSettingsState {
    const overrides = { ...state.overrides };
    if (GRAPHICS_PRESETS[state.preset][key] === value) delete overrides[key];
    else overrides[key] = value;
    return { ...state, overrides, detected: true };
}

const PRESET_IDS = new Set<string>(GRAPHICS_PRESET_ORDER);
const CONFIG_VALIDATORS: { [K in keyof GraphicsConfig]: (v: unknown) => v is GraphicsConfig[K] } = {
    shadows: (v): v is ShadowQuality => v === 'off' || v === 'low' || v === 'medium' || v === 'high',
    bloom: (v): v is BloomQuality => v === 'off' || v === 'half' || v === 'full',
    godRays: (v): v is boolean => typeof v === 'boolean',
    water: (v): v is WaterQuality => v === 'simple' || v === 'fancy',
    foliageWind: (v): v is boolean => typeof v === 'boolean',
    ambientParticles: (v): v is ParticleDensity => v === 'off' || v === 'low' || v === 'medium' || v === 'high',
    clouds: (v): v is CloudQuality => v === 'off' || v === 'fast' || v === 'fancy',
    antialiasing: (v): v is AntialiasMode => v === 'off' || v === 'msaa' || v === 'fxaa' || v === 'smaa',
    maxPixelRatio: (v): v is 1 | 1.5 | 2 => v === 1 || v === 1.5 || v === 2,
    mipmaps: (v): v is boolean => typeof v === 'boolean',
    motionBlur: (v): v is boolean => typeof v === 'boolean',
    chunkFade: (v): v is boolean => typeof v === 'boolean',
    viewBobbing: (v): v is boolean => typeof v === 'boolean',
};

/** Parses stored JSON; anything unknown or malformed falls back field by field. */
export function parseGraphicsState(raw: string | null): GraphicsSettingsState | null {
    if (!raw) return null;
    let value: unknown;
    try { value = JSON.parse(raw); } catch { return null; }
    if (!value || typeof value !== 'object') return null;
    const record = value as Record<string, unknown>;
    if (record.version !== 1) return null;
    const preset = typeof record.preset === 'string' && PRESET_IDS.has(record.preset)
        ? record.preset as GraphicsPresetId : DEFAULT_GRAPHICS_STATE.preset;
    const overrides: GraphicsOverrides = {};
    const rawOverrides = record.overrides && typeof record.overrides === 'object'
        ? record.overrides as Record<string, unknown> : {};
    for (const key of Object.keys(CONFIG_VALIDATORS) as (keyof GraphicsConfig)[]) {
        const candidate = rawOverrides[key];
        if (CONFIG_VALIDATORS[key](candidate)) (overrides as Record<string, unknown>)[key] = candidate;
    }
    return { version: 1, preset, overrides, detected: record.detected === true };
}

/**
 * Pre-overhaul Video Settings were individual toggles. Only choices that differ
 * from the old defaults are carried over (as overrides), so players who never
 * touched them get the new preset look; players who turned something off keep it off.
 */
export const LEGACY_GRAPHICS_KEYS = {
    shadows: 'atlas.settings.shadowsEnabled',
    clouds: 'atlas.settings.cloudsEnabled',
    mipmaps: 'atlas.settings.mipmapsEnabled',
    antialiasing: 'atlas.settings.antialiasing',
    chunkFade: 'atlas.settings.chunkFadeEnabled',
    motionBlur: 'atlas.settings.motionBlur',
} as const;

export function migrateLegacyGraphics(
    read: (key: string) => string | null, preset: GraphicsPresetId,
): GraphicsOverrides {
    const overrides: GraphicsOverrides = {};
    const base = GRAPHICS_PRESETS[preset];
    if (read(LEGACY_GRAPHICS_KEYS.shadows) === 'true' && base.shadows === 'off') overrides.shadows = 'low';
    if (read(LEGACY_GRAPHICS_KEYS.clouds) === 'false') overrides.clouds = 'off';
    if (read(LEGACY_GRAPHICS_KEYS.mipmaps) === 'false') overrides.mipmaps = false;
    if (read(LEGACY_GRAPHICS_KEYS.antialiasing) === 'false') overrides.antialiasing = 'off';
    if (read(LEGACY_GRAPHICS_KEYS.chunkFade) === 'false') overrides.chunkFade = false;
    if (read(LEGACY_GRAPHICS_KEYS.motionBlur) === 'true') overrides.motionBlur = true;
    return overrides;
}

export interface GpuCapabilities {
    /** Unmasked renderer string when the browser exposes it, else the masked one. */
    renderer: string;
    webgl2: boolean;
    cores: number;
    /** navigator.deviceMemory in GB when available (Chromium caps it at 8). */
    memoryGb: number | null;
    coarsePointer: boolean;
}

/**
 * First-launch preset from what the browser reports. Conservative on purpose:
 * Ultra is never auto-picked, and unknown hardware lands on Medium only when it
 * looks like a desktop-class machine.
 */
export function detectPreset(caps: GpuCapabilities): GraphicsPresetId {
    const gpu = caps.renderer.toLowerCase();
    if (!caps.webgl2 || caps.coarsePointer) return 'low';
    if (/swiftshader|llvmpipe|software|basic render|softpipe/.test(gpu)) return 'low';

    const discreteHigh =
        /\brtx\s?[2-9]0\d0/.test(gpu) ||              // RTX 2060 and up
        /\brx\s?[6-9]\d{3}/.test(gpu) ||              // Radeon RX 6000 / 7000 / 9000
        /\barc\b.*\ba7\d\d/.test(gpu) ||              // Intel Arc A7xx
        /apple m[1-9] (pro|max|ultra)/.test(gpu);
    if (discreteHigh) return 'high';

    const discreteMid =
        /\bgtx\s?1[0-6]\d0/.test(gpu) ||              // GTX 10 / 16 series
        /\brx\s?5\d{3}/.test(gpu) ||
        /\brx\s?(4[78]0|5[78]0|590)/.test(gpu) ||
        /\barc\b/.test(gpu) ||
        /radeon.*(780m|760m|680m)/.test(gpu) ||       // strong APUs
        /iris.*xe|apple m[1-9]/.test(gpu);
    if (discreteMid) return 'medium';

    if (/intel.*(uhd|hd) graphics|mali|adreno|powervr/.test(gpu)) return 'low';

    const desktopClass = caps.cores >= 8 && (caps.memoryGb === null || caps.memoryGb >= 8);
    return desktopClass ? 'medium' : 'low';
}

/** One step down, used by the low-frame-rate hint. */
export function lowerPreset(preset: GraphicsPresetId): GraphicsPresetId | null {
    const index = GRAPHICS_PRESET_ORDER.indexOf(preset);
    return index > 0 ? GRAPHICS_PRESET_ORDER[index - 1] : null;
}
