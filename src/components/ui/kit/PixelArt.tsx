import React from 'react';

// Pixel art drawn from text masks: each character of a row is one art pixel,
// coloured by the palette ('.' and anything not in the palette stay clear).
// Rows become one path per colour, drawn crisp at a whole-number scale.

/** Mask character -> CSS colour. */
export type PixelPalette = Readonly<Record<string, string>>;

const pathsFor = (rows: readonly string[], palette: PixelPalette): [string, string][] => {
    const byColor = new Map<string, string>();
    rows.forEach((row, y) => {
        let x = 0;
        while (x < row.length) {
            const color = palette[row[x]];
            let end = x + 1;
            while (end < row.length && row[end] === row[x]) end++;
            if (color) byColor.set(color, `${byColor.get(color) ?? ''}M${x} ${y}h${end - x}v1h${x - end}z`);
            x = end;
        }
    });
    return [...byColor];
};

interface PixelArtProps {
    rows: readonly string[];
    palette: PixelPalette;
    /** Screen pixels per art pixel. */
    scale?: number;
    className?: string;
    style?: React.CSSProperties;
}

/** Pass module-level rows and palettes: the paths are built once per pair. */
export const PixelArt: React.FC<PixelArtProps> = ({ rows, palette, scale = 2, className, style }) => {
    const paths = React.useMemo(() => pathsFor(rows, palette), [rows, palette]);
    const width = rows.reduce((widest, row) => Math.max(widest, row.length), 0);
    return (
        <svg
            width={width * scale}
            height={rows.length * scale}
            viewBox={`0 0 ${width} ${rows.length}`}
            shapeRendering="crispEdges"
            className={className}
            style={style}
            aria-hidden="true"
        >
            {paths.map(([fill, d]) => <path key={fill} fill={fill} d={d} />)}
        </svg>
    );
};

/** A pixel X for close buttons, in the text colour. */
export const CloseMark: React.FC = () => (
    <svg width="14" height="14" viewBox="0 0 7 7" shapeRendering="crispEdges" aria-hidden="true">
        <path fill="currentColor" d="M0 0h2v1h1v1h1V1h1V0h2v2H6v1H5v1h1v1h1v2H5V6H4V5H3v1H2v1H0V5h1V4h1V3H1V2H0Z" />
    </svg>
);

// A four-point navigation star: the mark of a place worth finding.
const STAR_ROWS = [
    '...a...',
    '...a...',
    '..aba..',
    'aabcbaa',
    '..aba..',
    '...a...',
    '...a...',
] as const;
const STAR_PALETTE: PixelPalette = { a: '#f3d488', b: '#fff1c4', c: '#ffffff' };

export const StarGlyph: React.FC<{ scale?: number; className?: string; style?: React.CSSProperties }> = ({ scale = 2, className, style }) => (
    <PixelArt rows={STAR_ROWS} palette={STAR_PALETTE} scale={scale} className={className} style={style} />
);

// The ATLAS wordmark: square-stroked letters on a nine-pixel cap height, in a
// banded brass ramp with a dark outline and a hard drop shadow so it reads on
// any sky.
const LETTERS: Readonly<Record<string, readonly string[]>> = {
    A: ['.XXXX.', 'XXXXXX', 'XX..XX', 'XX..XX', 'XXXXXX', 'XXXXXX', 'XX..XX', 'XX..XX', 'XX..XX'],
    T: ['XXXXXX', 'XXXXXX', '..XX..', '..XX..', '..XX..', '..XX..', '..XX..', '..XX..', '..XX..'],
    L: ['XX....', 'XX....', 'XX....', 'XX....', 'XX....', 'XX....', 'XX....', 'XXXXXX', 'XXXXXX'],
    S: ['.XXXXX', 'XXXXXX', 'XX....', 'XXXXX.', '.XXXXX', '....XX', '....XX', 'XXXXXX', 'XXXXX.'],
};
const FACE_BANDS = 'aabbbccdd'; // one band letter per cap row, lit from the top
const WORDMARK_PALETTE: PixelPalette = {
    a: '#fff1c4',
    b: '#f3d488',
    c: '#e2b866',
    d: '#c99a4a',
    o: '#070917',
    s: 'rgba(7, 9, 23, 0.55)',
};

const buildWordmark = (word: string): string[] => {
    const glyphs = [...word].map((letter) => LETTERS[letter]);
    const gap = 2;
    const textWidth = glyphs.reduce((sum, glyph) => sum + glyph[0].length, 0) + gap * (glyphs.length - 1);
    // One pixel of outline all round, one more of shadow to the bottom right.
    const width = textWidth + 3;
    const height = 9 + 3;
    const grid = Array.from({ length: height }, () => Array<string>(width).fill('.'));
    let left = 1;
    for (const glyph of glyphs) {
        glyph.forEach((row, y) => {
            [...row].forEach((cell, x) => { if (cell === 'X') grid[y + 1][left + x] = FACE_BANDS[y]; });
        });
        left += glyph[0].length + gap;
    }
    const isFace = (x: number, y: number) => 'abcd'.includes(grid[y]?.[x] ?? '.');
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (grid[y][x] !== '.') continue;
            let touches = false;
            for (let dy = -1; dy <= 1 && !touches; dy++) {
                for (let dx = -1; dx <= 1; dx++) if (isFace(x + dx, y + dy)) { touches = true; break; }
            }
            if (touches) grid[y][x] = 'o';
        }
    }
    for (let y = height - 1; y > 0; y--) {
        for (let x = width - 1; x > 0; x--) {
            if (grid[y][x] === '.' && grid[y - 1][x - 1] !== '.' && grid[y - 1][x - 1] !== 's') grid[y][x] = 's';
        }
    }
    return grid.map((row) => row.join(''));
};

const WORDMARK_ROWS = buildWordmark('ATLAS');

export const AtlasWordmark: React.FC<{ scale?: number; className?: string }> = ({ scale = 6, className }) => (
    <PixelArt rows={WORDMARK_ROWS} palette={WORDMARK_PALETTE} scale={scale} className={className} />
);
