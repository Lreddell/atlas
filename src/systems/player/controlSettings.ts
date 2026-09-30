// Mouse-look settings (Options > Controls): how far the view turns for a
// movement of the mouse, and whether pushing the mouse forward looks down.
// Pure, so the maths is unit-testable; controlStore.ts persists it.

export interface ControlSettings {
    /** Look speed as a multiple of the stock speed (1 = 100%). */
    sensitivity: number;
    /** Pushing the mouse forward looks down instead of up. */
    invertY: boolean;
}

export const DEFAULT_CONTROL_SETTINGS: ControlSettings = { sensitivity: 1, invertY: false };

export const MIN_SENSITIVITY = 0.1;
export const MAX_SENSITIVITY = 3;

/** Radians the view turns per pixel of mouse movement at 100% sensitivity. */
export const LOOK_RADIANS_PER_PIXEL = 0.002;

const clampSensitivity = (value: number): number =>
    Math.min(MAX_SENSITIVITY, Math.max(MIN_SENSITIVITY, value));

/** Reads stored settings, falling back to the defaults for anything missing or malformed. */
export function parseControlSettings(raw: string | null): ControlSettings {
    if (!raw) return { ...DEFAULT_CONTROL_SETTINGS };
    try {
        const value = JSON.parse(raw) as Partial<Record<keyof ControlSettings, unknown>> | null;
        const sensitivity = typeof value?.sensitivity === 'number' && Number.isFinite(value.sensitivity)
            ? clampSensitivity(value.sensitivity)
            : DEFAULT_CONTROL_SETTINGS.sensitivity;
        const invertY = typeof value?.invertY === 'boolean' ? value.invertY : DEFAULT_CONTROL_SETTINGS.invertY;
        return { sensitivity, invertY };
    } catch {
        return { ...DEFAULT_CONTROL_SETTINGS };
    }
}

/** The settings with one change applied, kept in range. */
export function withControlChange(settings: ControlSettings, change: Partial<ControlSettings>): ControlSettings {
    const next = { ...settings, ...change };
    return { sensitivity: clampSensitivity(next.sensitivity), invertY: !!next.invertY };
}

/**
 * How far a mouse movement turns the view (radians): yaw to the left and pitch
 * upward are positive, as the camera's Euler angles take them.
 */
export function lookDelta(movementX: number, movementY: number, settings: ControlSettings): { yaw: number; pitch: number } {
    const scale = LOOK_RADIANS_PER_PIXEL * settings.sensitivity;
    return {
        yaw: -movementX * scale,
        pitch: -movementY * scale * (settings.invertY ? -1 : 1),
    };
}
