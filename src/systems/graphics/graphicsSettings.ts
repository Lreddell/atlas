// Graphics quality presets and the player's overrides on top of them.
//
// Pure data and functions only (no DOM, no three), so node tests can exercise
// every rule. graphicsStore.ts owns persistence and React subscription.
//
// A quality setting either comes from the chosen preset or from an explicit
// override. Picking a preset clears the overrides; changing any single quality
// option records an override and the menu shows the quality as "Custom".
// Preferences (the visual style, the shadow style, view bobbing) are a matter
// of taste rather than cost: they sit beside the presets and never make the
// quality "Custom".

export type GraphicsPresetId = 'low' | 'medium' | 'high' | 'ultra';
export type GraphicsQuality = GraphicsPresetId | 'custom';

export type ShadowQuality = 'off' | 'low' | 'medium' | 'high';
export type BloomQuality = 'off' | 'half' | 'full';
export type WaterQuality = 'simple' | 'fancy';
export type ParticleDensity = 'off' | 'low' | 'medium' | 'high';
export type CloudQuality = 'off' | 'fast' | 'fancy';
export type AntialiasMode = 'off' | 'msaa' | 'fxaa' | 'smaa';
/** Luminous is the new look; Classic is the renderer as it looked before the overhaul. */
export type VisualStyle = 'luminous' | 'classic';
/** Soft, filtered shadow edges, or crisp ones stepped on the 16-texel pixel grid. */
export type ShadowStyle = 'soft' | 'pixel';

/** Options the quality presets set. */
export interface QualityConfig {
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
}

/** Personal taste, kept apart from the quality presets. */
export interface GraphicsPreferences {
    visualStyle: VisualStyle;
    shadowStyle: ShadowStyle;
    /** The first-person view sways gently with each step (and dips on landing). */
    viewBobbing: boolean;
}

export interface GraphicsConfig extends QualityConfig, GraphicsPreferences {}

export type GraphicsOverrides = Partial<QualityConfig>;

export const DEFAULT_GRAPHICS_PREFERENCES: Readonly<GraphicsPreferences> = {
    visualStyle: 'luminous', shadowStyle: 'soft', viewBobbing: true,
};

export const GRAPHICS_PRESET_ORDER: readonly GraphicsPresetId[] = ['low', 'medium', 'high', 'ultra'];

export const GRAPHICS_PRESETS: Readonly<Record<GraphicsPresetId, Readonly<QualityConfig>>> = {
    // Roughly the cost of the pre-overhaul renderer.
    low: {
        shadows: 'off', bloom: 'off', godRays: false, water: 'simple', foliageWind: false,
        ambientParticles: 'off', clouds: 'fast', antialiasing: 'msaa', maxPixelRatio: 1,
        mipmaps: true, motionBlur: false, chunkFade: true,
    },
    medium: {
        shadows: 'low', bloom: 'half', godRays: false, water: 'fancy', foliageWind: true,
        ambientParticles: 'low', clouds: 'fancy', antialiasing: 'msaa', maxPixelRatio: 1.5,
        mipmaps: true, motionBlur: false, chunkFade: true,
    },
    high: {
        shadows: 'medium', bloom: 'half', godRays: true, water: 'fancy', foliageWind: true,
        ambientParticles: 'medium', clouds: 'fancy', antialiasing: 'msaa', maxPixelRatio: 2,
        mipmaps: true, motionBlur: false, chunkFade: true,
    },
    ultra: {
        shadows: 'high', bloom: 'full', godRays: true, water: 'fancy', foliageWind: true,
        ambientParticles: 'high', clouds: 'fancy', antialiasing: 'msaa', maxPixelRatio: 2,
        mipmaps: true, motionBlur: false, chunkFade: true,
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
    preferences: GraphicsPreferences;
    /** False until the first launch has probed the GPU and picked a preset. */
    detected: boolean;
}

export const DEFAULT_GRAPHICS_STATE: GraphicsSettingsState = {
    version: 1, preset: 'medium', overrides: {}, preferences: { ...DEFAULT_GRAPHICS_PREFERENCES }, detected: false,
};

/**
 * The Classic style is the renderer before the overhaul, which had none of the
 * Luminous effects: whatever the preset says, they stay off under it.
 */
export function applyVisualStyle(config: GraphicsConfig): GraphicsConfig {
    if (config.visualStyle !== 'classic') return config;
    return { ...config, bloom: 'off', godRays: false, water: 'simple', foliageWind: false, ambientParticles: 'off' };
}

export function resolveGraphicsConfig(
    state: Pick<GraphicsSettingsState, 'preset' | 'overrides'> & { preferences?: Partial<GraphicsPreferences> },
): GraphicsConfig {
    return applyVisualStyle({
        ...GRAPHICS_PRESETS[state.preset], ...state.overrides, ...DEFAULT_GRAPHICS_PREFERENCES, ...state.preferences,
    });
}

export function graphicsQuality(state: Pick<GraphicsSettingsState, 'preset' | 'overrides'>): GraphicsQuality {
    return Object.keys(state.overrides).length > 0 ? 'custom' : state.preset;
}

/** Choosing a preset discards every override. */
export function withPreset(state: GraphicsSettingsState, preset: GraphicsPresetId): GraphicsSettingsState {
    return { ...state, preset, overrides: {}, detected: true };
}

const PREFERENCE_KEYS: ReadonlySet<string> = new Set<keyof GraphicsPreferences>(['visualStyle', 'shadowStyle', 'viewBobbing']);

export const isPreferenceKey = (key: keyof GraphicsConfig): key is keyof GraphicsPreferences => PREFERENCE_KEYS.has(key);

/**
 * One option changed. A preference is simply stored; a quality option becomes
 * an override, or drops its override when it matches the preset again.
 */
export function withOption<K extends keyof GraphicsConfig>(
    state: GraphicsSettingsState, key: K, value: GraphicsConfig[K],
): GraphicsSettingsState {
    if (isPreferenceKey(key)) {
        return { ...state, preferences: { ...state.preferences, [key]: value }, detected: true };
    }
    const qualityKey = key as keyof QualityConfig;
    const overrides: Record<string, unknown> = { ...state.overrides };
    if (GRAPHICS_PRESETS[state.preset][qualityKey] === value) delete overrides[qualityKey];
    else overrides[qualityKey] = value;
    return { ...state, overrides: overrides as GraphicsOverrides, detected: true };
}

const PRESET_IDS = new Set<string>(GRAPHICS_PRESET_ORDER);
const QUALITY_VALIDATORS: { [K in keyof QualityConfig]: (v: unknown) => v is QualityConfig[K] } = {
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
};
const PREFERENCE_VALIDATORS: { [K in keyof GraphicsPreferences]: (v: unknown) => v is GraphicsPreferences[K] } = {
    visualStyle: (v): v is VisualStyle => v === 'luminous' || v === 'classic',
    shadowStyle: (v): v is ShadowStyle => v === 'soft' || v === 'pixel',
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
    for (const key of Object.keys(QUALITY_VALIDATORS) as (keyof QualityConfig)[]) {
        const candidate = rawOverrides[key];
        if (QUALITY_VALIDATORS[key](candidate)) (overrides as Record<string, unknown>)[key] = candidate;
    }
    const rawPreferences = record.preferences && typeof record.preferences === 'object'
        ? record.preferences as Record<string, unknown> : {};
    const preferences: GraphicsPreferences = { ...DEFAULT_GRAPHICS_PREFERENCES };
    for (const key of Object.keys(PREFERENCE_VALIDATORS) as (keyof GraphicsPreferences)[]) {
        // View bobbing used to be stored as a quality override.
        const candidate = key in rawPreferences ? rawPreferences[key] : rawOverrides[key];
        if (PREFERENCE_VALIDATORS[key](candidate)) (preferences as unknown as Record<string, unknown>)[key] = candidate;
    }
    return { version: 1, preset, overrides, preferences, detected: record.detected === true };
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
