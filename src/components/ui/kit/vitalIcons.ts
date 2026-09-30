import type { PixelPalette } from './PixelArt';

// The HUD's vitals, drawn for Atlas: a life crystal for health, a loaf for
// provisions, a steel plate for armor and a bubble for breath. Each is 11x11
// art pixels, lit from the top left, with a full and an empty palette over the
// same mask so a half pip can clip one over the other.

export interface VitalIcon {
    rows: readonly string[];
    full: PixelPalette;
    empty: PixelPalette;
}

export const LIFE_CRYSTAL: VitalIcon = {
    rows: [
        '...........',
        '..ooooooo..',
        '.ohhllllro.',
        'ohhllllrrdo',
        'odlllrrrrdo',
        '.olrrrrrdo.',
        '..olrrrdo..',
        '...olrdo...',
        '....oro....',
        '.....o.....',
        '...........',
    ],
    full: { o: '#3d0710', h: '#ffd3c9', l: '#ff6f61', r: '#e0303a', d: '#9c1426' },
    empty: { o: '#150307', h: '#5c2630', l: '#4d1f28', r: '#3f1a22', d: '#30121a' },
};

export const PROVISIONS: VitalIcon = {
    rows: [
        '...........',
        '...........',
        '...ooooo...',
        '.oohhhhhoo.',
        'ohhhbbbbbdo',
        'ohbbcbbcbdo',
        'obbcbbcbbdo',
        'obbbbbbbdso',
        '.odddddddo.',
        '..ooooooo..',
        '...........',
    ],
    full: { o: '#3b1f07', h: '#f7cf85', b: '#d8923d', c: '#f8e2a8', d: '#a45d1c', s: '#7a3f10' },
    empty: { o: '#130a02', h: '#4d3d2a', b: '#3e3122', c: '#4d3d2a', d: '#30261a', s: '#281f15' },
};

export const ARMOR_PLATE: VitalIcon = {
    rows: [
        '...........',
        '.ooooooooo.',
        '.ohhlhmmdo.',
        '.ohllhmmdo.',
        '.ohllhmmdo.',
        '.olllhmmdo.',
        '..ollhmdo..',
        '..ollhmdo..',
        '...olhdo...',
        '....omo....',
        '.....o.....',
    ],
    full: { o: '#0f141c', h: '#f2f6f9', l: '#c3ced8', m: '#8e9dac', d: '#5f6d7c' },
    empty: { o: '#07090d', h: '#3a4049', l: '#333942', m: '#2b3038', d: '#23272e' },
};

export const BREATH_BUBBLE: VitalIcon = {
    rows: [
        '...........',
        '...ooooo...',
        '..ohhccco..',
        '.ohcccccbo.',
        '.ohcccccbo.',
        '.occcccbbo.',
        '.occcccbbo.',
        '.occccbbbo.',
        '..occbbbo..',
        '...ooooo...',
        '...........',
    ],
    full: { o: '#0b3160', h: '#eaf7ff', c: '#63b8ff', b: '#2f7fd6' },
    empty: { o: 'rgba(11, 49, 96, 0.5)', h: 'rgba(20, 40, 70, 0.3)', c: 'rgba(20, 40, 70, 0.3)', b: 'rgba(20, 40, 70, 0.3)' },
};
