import { useSyncExternalStore } from 'react';
import {
    DEFAULT_GRAPHICS_STATE,
    detectPreset,
    graphicsQuality,
    migrateLegacyGraphics,
    parseGraphicsState,
    resolveGraphicsConfig,
    withOption,
    withPreset,
    type GpuCapabilities,
    type GraphicsConfig,
    type GraphicsPresetId,
    type GraphicsQuality,
    type GraphicsSettingsState,
} from './graphicsSettings';

// The persisted graphics settings, shared by the renderer components and the
// Video Settings screen. Same external-store pattern as playerSkins.ts: one
// module-level snapshot, React subscribes with useSyncExternalStore, and no
// state lives in App.

export const GRAPHICS_SETTINGS_KEY = 'atlas.settings.graphics.v1';

export interface GraphicsSnapshot {
    state: GraphicsSettingsState;
    config: GraphicsConfig;
    quality: GraphicsQuality;
    /** True when this session picked the preset from the GPU (first launch). */
    autoDetected: boolean;
}

const read = (key: string): string | null => {
    try { return window.localStorage.getItem(key); } catch { return null; }
};

const write = (key: string, value: string): void => {
    try { window.localStorage.setItem(key, value); } catch { /* storage full or blocked: keep the in-memory state */ }
};

/** Asks a throwaway WebGL2 context what the machine is; never throws. */
export function probeGpuCapabilities(): GpuCapabilities {
    const fallback: GpuCapabilities = { renderer: '', webgl2: false, cores: 4, memoryGb: null, coarsePointer: false };
    try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl2');
        let renderer = '';
        if (gl) {
            const info = gl.getExtension('WEBGL_debug_renderer_info');
            renderer = String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
            gl.getExtension('WEBGL_lose_context')?.loseContext();
        }
        const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
        return {
            renderer,
            webgl2: !!gl,
            cores: navigator.hardwareConcurrency || 4,
            memoryGb: typeof memory === 'number' ? memory : null,
            coarsePointer: typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches,
        };
    } catch {
        return fallback;
    }
}

const snapshotOf = (state: GraphicsSettingsState, autoDetected: boolean): GraphicsSnapshot => ({
    state, config: resolveGraphicsConfig(state), quality: graphicsQuality(state), autoDetected,
});

let snapshot: GraphicsSnapshot | null = null;
const listeners = new Set<() => void>();

function initialSnapshot(): GraphicsSnapshot {
    const stored = parseGraphicsState(read(GRAPHICS_SETTINGS_KEY));
    if (stored?.detected) return snapshotOf(stored, false);
    // First launch on this build: pick a preset for this GPU and carry over any
    // old Video Settings toggle the player had changed from its default.
    const preset = detectPreset(probeGpuCapabilities());
    const state: GraphicsSettingsState = {
        ...DEFAULT_GRAPHICS_STATE, preset, overrides: migrateLegacyGraphics(read, preset), detected: true,
    };
    write(GRAPHICS_SETTINGS_KEY, JSON.stringify(state));
    return snapshotOf(state, true);
}

function current(): GraphicsSnapshot {
    if (!snapshot) snapshot = initialSnapshot();
    return snapshot;
}

function commit(next: GraphicsSettingsState): void {
    snapshot = snapshotOf(next, current().autoDetected);
    write(GRAPHICS_SETTINGS_KEY, JSON.stringify(next));
    for (const listener of listeners) listener();
}

export const graphicsSettings = {
    get: current,
    getConfig: (): GraphicsConfig => current().config,
    setPreset(preset: GraphicsPresetId): void {
        commit(withPreset(current().state, preset));
    },
    setOption<K extends keyof GraphicsConfig>(key: K, value: GraphicsConfig[K]): void {
        commit(withOption(current().state, key, value));
    },
    subscribe(listener: () => void): () => void {
        listeners.add(listener);
        return () => { listeners.delete(listener); };
    },
};

export function useGraphicsSettings(): GraphicsSnapshot {
    return useSyncExternalStore(graphicsSettings.subscribe, current);
}
