import { useSyncExternalStore } from 'react';
import { parseControlSettings, withControlChange, type ControlSettings } from './controlSettings';

// The persisted mouse-look settings, shared by the camera (read on every mouse
// move) and the Controls screen. Same external-store pattern as graphicsStore.ts.

export const CONTROL_SETTINGS_KEY = 'atlas.settings.controls.v1';

const read = (): string | null => {
    try { return window.localStorage.getItem(CONTROL_SETTINGS_KEY); } catch { return null; }
};

const write = (settings: ControlSettings): void => {
    try { window.localStorage.setItem(CONTROL_SETTINGS_KEY, JSON.stringify(settings)); } catch { /* storage full or blocked: keep the in-memory settings */ }
};

let snapshot: ControlSettings | null = null;
const listeners = new Set<() => void>();

/** The current settings (loaded on first use). */
export function getControlSettings(): ControlSettings {
    if (!snapshot) snapshot = parseControlSettings(read());
    return snapshot;
}

export const controlSettings = {
    set(change: Partial<ControlSettings>): void {
        snapshot = withControlChange(getControlSettings(), change);
        write(snapshot);
        listeners.forEach((listener) => listener());
    },
    subscribe(listener: () => void): () => void {
        listeners.add(listener);
        return () => { listeners.delete(listener); };
    },
};

export function useControlSettings(): ControlSettings {
    return useSyncExternalStore(controlSettings.subscribe, getControlSettings, getControlSettings);
}
