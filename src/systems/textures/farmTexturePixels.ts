// Farming block tiles, drawn by hand as 16x16 palette grids ('.' is clear):
// farmland and the eight wheat stages. (Wheat and bread, the items, are in the
// generated item catalog, pr19TexturePixels.ts.)
// Painted into the atlas by generateAtlasCanvas (utils/textures.ts); the
// palettes reuse the dirt, grass and crop colours already in the atlas.

export interface FarmPixelTile {
    rows: readonly string[];
    palette: Readonly<Record<string, string>>;
}

export const FARM_TEXTURE_TILES: Readonly<Record<number, FarmPixelTile>> = {
    // Farmland, dry: tilled furrows in the dirt's own browns.
    125: {
        rows: [
            'LHLLLHLLLLHLLHLL',
            'LLDLLLLDLLLLLDLL',
            'DDDGDDDDGDDDDDGD',
            'GGDGGGGGDGGGGGGD',
            'LLLHLLLLLHLLLLHL',
            'LDLLLLDLLLLDLLLL',
            'DDDDGDDDDDGDDDDD',
            'GGGGDGGGGGGGDGGG',
            'HLLLLLHLLLLLLHLL',
            'LLLDLLLLLDLLLLLD',
            'DGDDDDDGDDDDGDDD',
            'GGGDGGGGGGDGGGGG',
            'LLHLLLLHLLLLLLHL',
            'LLLLDLLLLLLDLLLL',
            'DDDDDDGDDDDDDGDD',
            'GDGGGGGGDGGGGGGG',
        ],
        palette: { H: '#927a72', L: '#7d665f', D: '#533931', G: '#43302a' },
    },
    // Farmland, moist: the same furrows, soaked dark.
    126: {
        rows: [
            'LHLLLHLLLLHLLHLL',
            'LLDLLLLDLLLLLDLL',
            'DDDGDDDDGDDDDDGD',
            'GGDGGGGGDGGGGGGD',
            'LLLHLLLLLHLLLLHL',
            'LDLLLLDLLLLDLLLL',
            'DDDDGDDDDDGDDDDD',
            'GGGGDGGGGGGGDGGG',
            'HLLLLLHLLLLLLHLL',
            'LLLDLLLLLDLLLLLD',
            'DGDDDDDGDDDDGDDD',
            'GGGDGGGGGGDGGGGG',
            'LLHLLLLHLLLLLLHL',
            'LLLLDLLLLLLDLLLL',
            'DDDDDDGDDDDDDGDD',
            'GDGGGGGGDGGGGGGG',
        ],
        palette: { H: '#5e4a42', L: '#4c3a33', D: '#33241e', G: '#281b16' },
    },
    // Wheat, stage 0.
    127: {
        rows: [
            '................',
            '................',
            '................',
            '................',
            '................',
            '................',
            '................',
            '................',
            '................',
            '................',
            '................',
            '................',
            '................',
            '....t..t..t..t..',
            '.t..s..s..s..s..',
            '.s..s..s..s..s..',
        ],
        palette: { s: '#2e7d32', l: '#388e3c', t: '#66bb6a' },
    },
    // Wheat, stage 1.
    128: {
        rows: [
            '................',
            '................',
            '................',
            '................',
            '................',
            '................',
            '................',
            '................',
            '................',
            '................',
            '................',
            '....t.....t.....',
            '.t..s..t..s..t..',
            '.s..s..s..s..s..',
            '.s..s..s..s..s..',
            '.s..s..s..s..s..',
        ],
        palette: { s: '#2e7d32', l: '#388e3c', t: '#66bb6a' },
    },
    // Wheat, stage 2.
    129: {
        rows: [
            '................',
            '................',
            '................',
            '................',
            '................',
            '................',
            '................',
            '................',
            '................',
            '....t.....t.....',
            '.t..s..t..s..t..',
            '.s..s..s..sl.s..',
            '.s.ls..s..s.ls..',
            '.sl.s..sl.s..s..',
            '.s..s..s..s..s..',
            '.s..s..s..s..s..',
        ],
        palette: { s: '#2e7d32', l: '#388e3c', t: '#66bb6a' },
    },
    // Wheat, stage 3.
    130: {
        rows: [
            '................',
            '................',
            '................',
            '................',
            '................',
            '................',
            '................',
            '....t.....t.....',
            '....s..t..s..t..',
            '.t..sl.s..s..s..',
            '.s..s.ls..s..s..',
            '.s..s..s..sl.s..',
            '.s.ls..s..s.ls..',
            '.sl.s..sl.s..s..',
            '.s..s..s..s..s..',
            '.s..s..s..s..s..',
        ],
        palette: { s: '#2e7d32', l: '#388e3c', t: '#66bb6a' },
    },
    // Wheat, stage 4.
    131: {
        rows: [
            '................',
            '................',
            '................',
            '................',
            '................',
            '....t.....t.....',
            '....s..t..s.....',
            '.t..s..s..s..t..',
            '.s..s..s.ls..s..',
            '.s..sl.s..s..sl.',
            '.sl.s.ls..s..s..',
            '.s..s..s..sl.s..',
            '.s.ls..s..s.ls..',
            '.sl.s..sl.s..s..',
            '.s..s..s..s..s..',
            '.s..s..s..s..s..',
        ],
        palette: { s: '#2e7d32', l: '#43a047', t: '#7cb342' },
    },
    // Wheat, stage 5.
    132: {
        rows: [
            '................',
            '................',
            '................',
            '....hk....hk....',
            '....kh....kh....',
            '....h..hk.hl.hk.',
            '.hkls..kh.s..kh.',
            '.kh.s..hl.s..h..',
            '.h..s..s.ls..s..',
            '.s..sl.s..s..sl.',
            '.sl.s.ls..s..s..',
            '.s..s..s..sl.s..',
            '.s.ls..s..s.ls..',
            '.sl.s..sl.s..s..',
            '.s..s..s..s..s..',
            '.s..s..s..s..s..',
        ],
        palette: { s: '#388e3c', l: '#7cb342', t: '#9ccc65', h: '#afb42b', k: '#c0ca33' },
    },
    // Wheat, stage 6.
    133: {
        rows: [
            '................',
            '................',
            '....hk....hk....',
            '....kh....kh....',
            '....hk.hk.hk.hk.',
            '.hk.k..kh.kl.kh.',
            '.khls..hk.s..hk.',
            '.hk.s..kl.s..k..',
            '.k..s..s.ls..s..',
            '.s..sl.s..s..sl.',
            '.sl.s.ls..s..s..',
            '.s..s..s..sl.s..',
            '.s.ls..s..s.ls..',
            '.sl.s..sl.s..s..',
            '.s..s..s..s..s..',
            '.s..s..s..s..s..',
        ],
        palette: { s: '#689f38', l: '#afb42b', t: '#c0ca33', h: '#d4b02f', k: '#e0c24a' },
    },
    // Wheat, stage 7 (ripe).
    134: {
        rows: [
            '................',
            '....hk....hk....',
            '....kh....kh....',
            '....hk.hk.hk.hk.',
            '.hk.k..kh.k..kh.',
            '.kh.s..hk.sl.hk.',
            '.hkls..k..s..k..',
            '.k..s..sl.s..s..',
            '.s..s..s.ls..s..',
            '.s..sl.s..s..sl.',
            '.sl.s.ls..s..s..',
            '.s..s..s..sl.s..',
            '.s.ls..s..s.ls..',
            '.sl.s..sl.s..s..',
            '.s..s..s..s..s..',
            '.s..s..s..s..s..',
        ],
        palette: { s: '#a1782a', l: '#c89a2e', t: '#d9b44a', h: '#d9b44a', k: '#8d6e3a' },
    },
};

/** Paints one farm tile into a 16x16 context (already translated to the tile). */
export function paintFarmTile(ctx: CanvasRenderingContext2D, tile: FarmPixelTile): void {
    tile.rows.forEach((row, y) => {
        for (let x = 0; x < row.length; x++) {
            const color = tile.palette[row[x]];
            if (!color) continue;
            ctx.fillStyle = color;
            ctx.fillRect(x, y, 1, 1);
        }
    });
}
