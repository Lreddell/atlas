export type PixelationMode = 'off' | 'world' | 'full';
export type PixelationResolution = 240 | 360 | 480;

const PIXELATION_STORAGE_KEY = 'atlas.settings.pixelationMode';
const PIXELATION_RESOLUTION_STORAGE_KEY = 'atlas.settings.pixelationResolution';
const LEGACY_OVERLAY_ID = 'atlas-pixelation-overlay';
const FULL_SCREEN_FILTER_SVG_ID = 'atlas-retro-filter-svg';
const FULL_SCREEN_FILTER_ID = 'atlas-retro-pixelate-filter';

export const PIXELATION_CHANGE_EVENT = 'atlas:pixelation-change';

const VALID_MODES: PixelationMode[] = ['off', 'world', 'full'];
const VALID_RESOLUTIONS: PixelationResolution[] = [240, 360, 480];
const DEFAULT_RESOLUTION: PixelationResolution = 240;

export const PIXELATION_MODE_LABELS: Record<PixelationMode, string> = {
    off: 'OFF',
    world: 'WORLD ONLY',
    full: 'FULL SCREEN',
};

export const normalizePixelationMode = (value: string | null | undefined): PixelationMode => {
    return VALID_MODES.includes(value as PixelationMode) ? value as PixelationMode : 'off';
};

export const normalizePixelationResolution = (value: string | number | null | undefined): PixelationResolution => {
    const parsed = typeof value === 'number' ? value : Number(value);
    return VALID_RESOLUTIONS.includes(parsed as PixelationResolution)
        ? parsed as PixelationResolution
        : DEFAULT_RESOLUTION;
};

export const getPixelationMode = (): PixelationMode => {
    if (typeof window === 'undefined') return 'off';
    return normalizePixelationMode(window.localStorage.getItem(PIXELATION_STORAGE_KEY));
};

export const getPixelationResolution = (): PixelationResolution => {
    if (typeof window === 'undefined') return DEFAULT_RESOLUTION;
    return normalizePixelationResolution(window.localStorage.getItem(PIXELATION_RESOLUTION_STORAGE_KEY));
};

export const getNextPixelationMode = (mode: PixelationMode): PixelationMode => {
    const index = VALID_MODES.indexOf(mode);
    return VALID_MODES[(index + 1) % VALID_MODES.length];
};

export const getNextPixelationResolution = (resolution: PixelationResolution): PixelationResolution => {
    const index = VALID_RESOLUTIONS.indexOf(resolution);
    return VALID_RESOLUTIONS[(index + 1) % VALID_RESOLUTIONS.length];
};

let originalRootFilter: string | null = null;
let originalRootWillChange: string | null = null;
let initialized = false;

const removeLegacyOverlay = () => {
    if (typeof document === 'undefined') return;
    document.getElementById(LEGACY_OVERLAY_ID)?.remove();
};

const ensureFullScreenFilter = (blockSize: number) => {
    if (typeof document === 'undefined') return;

    let svg = document.getElementById(FULL_SCREEN_FILTER_SVG_ID) as SVGSVGElement | null;
    if (!svg) {
        svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.id = FULL_SCREEN_FILTER_SVG_ID;
        svg.setAttribute('aria-hidden', 'true');
        Object.assign(svg.style, {
            position: 'fixed',
            width: '0',
            height: '0',
            overflow: 'hidden',
            pointerEvents: 'none',
        });

        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        const filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
        filter.id = FULL_SCREEN_FILTER_ID;
        filter.setAttribute('x', '0');
        filter.setAttribute('y', '0');
        filter.setAttribute('width', '100%');
        filter.setAttribute('height', '100%');
        filter.setAttribute('primitiveUnits', 'userSpaceOnUse');
        filter.setAttribute('color-interpolation-filters', 'sRGB');

        const flood = document.createElementNS('http://www.w3.org/2000/svg', 'feFlood');
        flood.setAttribute('width', '1');
        flood.setAttribute('height', '1');

        const cell = document.createElementNS('http://www.w3.org/2000/svg', 'feComposite');
        cell.id = 'atlas-retro-pixel-cell';

        const tile = document.createElementNS('http://www.w3.org/2000/svg', 'feTile');
        tile.setAttribute('result', 'atlasPixelGrid');

        const sample = document.createElementNS('http://www.w3.org/2000/svg', 'feComposite');
        sample.setAttribute('in', 'SourceGraphic');
        sample.setAttribute('in2', 'atlasPixelGrid');
        sample.setAttribute('operator', 'in');

        const dilate = document.createElementNS('http://www.w3.org/2000/svg', 'feMorphology');
        dilate.id = 'atlas-retro-pixel-dilate';
        dilate.setAttribute('operator', 'dilate');

        filter.append(flood, cell, tile, sample, dilate);
        defs.appendChild(filter);
        svg.appendChild(defs);
        document.body.appendChild(svg);
    }

    const sampleOffset = Math.max(0, Math.floor(blockSize / 2));
    const flood = svg.querySelector('feFlood');
    flood?.setAttribute('x', String(sampleOffset));
    flood?.setAttribute('y', String(sampleOffset));

    const cell = document.getElementById('atlas-retro-pixel-cell');
    cell?.setAttribute('width', String(blockSize));
    cell?.setAttribute('height', String(blockSize));

    const dilate = document.getElementById('atlas-retro-pixel-dilate');
    dilate?.setAttribute('radius', String(Math.max(1, Math.ceil(blockSize / 2))));
};

const restoreRootFilter = () => {
    if (typeof document === 'undefined') return;
    const root = document.getElementById('root');
    if (!root) return;

    if (originalRootFilter !== null) root.style.filter = originalRootFilter;
    else root.style.removeProperty('filter');

    if (originalRootWillChange !== null) root.style.willChange = originalRootWillChange;
    else root.style.removeProperty('will-change');
};

const applyFullScreenPixelation = (enabled: boolean, verticalResolution: PixelationResolution) => {
    if (typeof document === 'undefined' || typeof window === 'undefined') return;
    const root = document.getElementById('root');
    if (!root) return;

    if (!enabled) {
        restoreRootFilter();
        return;
    }

    if (originalRootFilter === null) originalRootFilter = root.style.filter;
    if (originalRootWillChange === null) originalRootWillChange = root.style.willChange;

    // Match the DOM block size to the approximate size of a low-resolution world
    // pixel in CSS pixels. The WebGL scene itself is rendered at the true lower
    // resolution by GameLoop; this filter is only needed to bring DOM UI into the
    // same visual grid for FULL SCREEN mode.
    const blockSize = Math.max(2, Math.round(window.innerHeight / verticalResolution));
    ensureFullScreenFilter(blockSize);
    root.style.filter = `url(#${FULL_SCREEN_FILTER_ID})`;
    root.style.willChange = 'filter';
};

const dispatchPixelationChange = () => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent(PIXELATION_CHANGE_EVENT, {
        detail: {
            mode: getPixelationMode(),
            resolution: getPixelationResolution(),
        },
    }));
};

export const applyPixelationPresentation = () => {
    if (typeof document === 'undefined') return;

    removeLegacyOverlay();
    const mode = getPixelationMode();
    const resolution = getPixelationResolution();

    document.documentElement.dataset.atlasPixelation = mode;
    document.documentElement.dataset.atlasPixelationResolution = String(resolution);
    applyFullScreenPixelation(mode === 'full', resolution);
};

export const setPixelationMode = (mode: PixelationMode) => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(PIXELATION_STORAGE_KEY, normalizePixelationMode(mode));
    applyPixelationPresentation();
    dispatchPixelationChange();
};

export const setPixelationResolution = (resolution: PixelationResolution) => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(
        PIXELATION_RESOLUTION_STORAGE_KEY,
        String(normalizePixelationResolution(resolution)),
    );
    applyPixelationPresentation();
    dispatchPixelationChange();
};

export const initializePixelation = () => {
    if (typeof window === 'undefined' || initialized) return;
    initialized = true;

    applyPixelationPresentation();

    window.addEventListener('storage', (event) => {
        if (event.key !== PIXELATION_STORAGE_KEY && event.key !== PIXELATION_RESOLUTION_STORAGE_KEY) return;
        applyPixelationPresentation();
        dispatchPixelationChange();
    });

    window.addEventListener('resize', () => {
        if (getPixelationMode() === 'full') applyPixelationPresentation();
    });
};
