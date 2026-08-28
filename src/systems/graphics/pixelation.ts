export type PixelationMode = 'off' | 'world' | 'full';

const PIXELATION_STORAGE_KEY = 'atlas.settings.pixelationMode';
const PIXELATION_OVERLAY_ID = 'atlas-pixelation-overlay';

const VALID_MODES: PixelationMode[] = ['off', 'world', 'full'];

export const PIXELATION_MODE_LABELS: Record<PixelationMode, string> = {
    off: 'OFF',
    world: 'WORLD ONLY',
    full: 'FULL SCREEN',
};

export const normalizePixelationMode = (value: string | null | undefined): PixelationMode => {
    return VALID_MODES.includes(value as PixelationMode) ? value as PixelationMode : 'off';
};

export const getPixelationMode = (): PixelationMode => {
    if (typeof window === 'undefined') return 'off';
    return normalizePixelationMode(window.localStorage.getItem(PIXELATION_STORAGE_KEY));
};

const removePixelationOverlay = () => {
    if (typeof document === 'undefined') return;
    document.getElementById(PIXELATION_OVERLAY_ID)?.remove();
    document.documentElement.removeAttribute('data-atlas-pixelation');
};

const createPixelationOverlay = (mode: Exclude<PixelationMode, 'off'>) => {
    if (typeof document === 'undefined') return;

    const previous = document.getElementById(PIXELATION_OVERLAY_ID);
    if (previous) previous.remove();

    const overlay = document.createElement('div');
    overlay.id = PIXELATION_OVERLAY_ID;
    overlay.setAttribute('aria-hidden', 'true');
    overlay.dataset.mode = mode;

    Object.assign(overlay.style, {
        position: 'fixed',
        inset: '0',
        pointerEvents: 'none',
        width: '100vw',
        height: '100vh',
        imageRendering: 'pixelated',
        backgroundImage: [
            'linear-gradient(rgba(255,255,255,0.018) 1px, transparent 1px)',
            'linear-gradient(90deg, rgba(0,0,0,0.045) 1px, transparent 1px)',
        ].join(','),
        backgroundSize: '3px 3px',
        backdropFilter: 'blur(0.35px) contrast(1.055) saturate(1.02)',
        opacity: '0.9',
        zIndex: mode === 'full' ? '2147483646' : '30',
    });
    overlay.style.setProperty('-webkit-backdrop-filter', 'blur(0.35px) contrast(1.055) saturate(1.02)');

    document.body.appendChild(overlay);
    document.documentElement.dataset.atlasPixelation = mode;
};

export const applyPixelationMode = (mode: PixelationMode) => {
    if (typeof document === 'undefined') return;

    removePixelationOverlay();
    if (mode === 'off') return;

    createPixelationOverlay(mode);
};

export const setPixelationMode = (mode: PixelationMode) => {
    const normalized = normalizePixelationMode(mode);
    if (typeof window !== 'undefined') {
        window.localStorage.setItem(PIXELATION_STORAGE_KEY, normalized);
    }
    applyPixelationMode(normalized);
};

export const getNextPixelationMode = (mode: PixelationMode): PixelationMode => {
    const index = VALID_MODES.indexOf(mode);
    return VALID_MODES[(index + 1) % VALID_MODES.length];
};

export const initializePixelation = () => {
    if (typeof window === 'undefined') return;

    applyPixelationMode(getPixelationMode());

    window.addEventListener('storage', (event) => {
        if (event.key !== PIXELATION_STORAGE_KEY) return;
        applyPixelationMode(normalizePixelationMode(event.newValue));
    });
};
