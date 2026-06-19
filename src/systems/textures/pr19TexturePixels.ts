export type Pr19TextureSlot = 149 | 150 | 151 | 152 | 153 | 154 | 155 | 156;

type PixelRect = readonly [x: number, y: number, width?: number, height?: number];

interface PixelLayer {
    color: string;
    rects: readonly PixelRect[];
}

export interface PixelTileDefinition {
    layers: readonly PixelLayer[];
}

export const PR19_TEXTURE_ASSETS: ReadonlyArray<{
    slot: Pr19TextureSlot;
    path: string;
}> = [
    { slot: 149, path: 'blocks/positive_magnet.png' },
    { slot: 150, path: 'blocks/negative_magnet.png' },
    { slot: 151, path: 'items/iron_helmet.png' },
    { slot: 152, path: 'items/iron_chestplate.png' },
    { slot: 153, path: 'items/iron_leggings.png' },
    { slot: 154, path: 'items/iron_boots.png' },
    { slot: 155, path: 'items/polarity_boots.png' },
    { slot: 156, path: 'blocks/iron_block.png' },
];

const IRON_SHADOW = '#9e9e9e';
const IRON_MID = '#d7ccc8';
const IRON_LIGHT = '#eeeeee';

const magnetFrame = (): PixelLayer[] => [
    { color: '#9e9e9e', rects: [[0, 0, 16, 16]] },
    {
        color: '#757575',
        rects: [
            [0, 0, 16, 1], [0, 15, 16, 1], [0, 0, 1, 16], [15, 0, 1, 16],
            [2, 3], [13, 2], [2, 12], [12, 13], [6, 1], [14, 8],
        ],
    },
    {
        color: '#bdbdbd',
        rects: [[1, 1, 5, 1], [1, 1, 1, 5], [9, 2], [13, 6], [3, 14], [10, 14]],
    },
    { color: '#616161', rects: [[3, 3, 10, 10]] },
];

export const PR19_TEXTURE_TILES: Record<Pr19TextureSlot, PixelTileDefinition> = {
    149: {
        layers: [
            ...magnetFrame(),
            { color: '#d32f2f', rects: [[4, 4, 8, 8]] },
            { color: '#b71c1c', rects: [[4, 11, 8, 1], [11, 4, 1, 8]] },
            { color: '#e57373', rects: [[4, 4, 8, 1], [4, 4, 1, 8]] },
            { color: IRON_LIGHT, rects: [[7, 5, 2, 6], [5, 7, 6, 2]] },
        ],
    },
    150: {
        layers: [
            ...magnetFrame(),
            { color: '#1976d2', rects: [[4, 4, 8, 8]] },
            { color: '#0d47a1', rects: [[4, 11, 8, 1], [11, 4, 1, 8]] },
            { color: '#64b5f6', rects: [[4, 4, 8, 1], [4, 4, 1, 8]] },
            { color: IRON_LIGHT, rects: [[5, 7, 6, 2]] },
        ],
    },
    151: {
        layers: [
            {
                color: IRON_SHADOW,
                rects: [[5, 3, 6, 1], [4, 4, 8, 1], [3, 5, 10, 6], [3, 11, 3, 1], [10, 11, 3, 1]],
            },
            {
                color: IRON_MID,
                rects: [[5, 4, 6, 1], [4, 5, 8, 2], [4, 7, 2, 4], [10, 7, 2, 4]],
            },
            { color: IRON_LIGHT, rects: [[5, 5, 5, 1], [4, 6, 6, 1], [4, 7, 1, 2]] },
        ],
    },
    152: {
        layers: [
            {
                color: IRON_SHADOW,
                rects: [
                    [4, 2, 3, 2], [9, 2, 3, 2], [3, 3, 4, 2], [9, 3, 4, 2],
                    [2, 4, 4, 4], [10, 4, 4, 4], [4, 4, 8, 9],
                ],
            },
            {
                color: IRON_MID,
                rects: [[5, 3, 2, 2], [9, 3, 2, 2], [3, 4, 3, 3], [10, 4, 3, 3], [5, 5, 6, 7]],
            },
            { color: IRON_LIGHT, rects: [[5, 3, 1, 1], [3, 4, 2, 1], [5, 5, 4, 1], [5, 6, 1, 5]] },
        ],
    },
    153: {
        layers: [
            {
                color: IRON_SHADOW,
                rects: [[4, 3, 8, 2], [4, 5, 8, 3], [3, 7, 4, 6], [9, 7, 4, 6]],
            },
            {
                color: IRON_MID,
                rects: [[5, 4, 6, 3], [4, 7, 2, 5], [10, 7, 2, 5]],
            },
            { color: IRON_LIGHT, rects: [[5, 4, 4, 1], [4, 7, 1, 3], [10, 7, 1, 3]] },
        ],
    },
    154: {
        layers: [
            {
                color: IRON_SHADOW,
                rects: [[3, 4, 4, 7], [2, 9, 5, 4], [9, 4, 4, 7], [9, 9, 6, 4]],
            },
            {
                color: IRON_MID,
                rects: [[4, 5, 2, 5], [3, 10, 3, 2], [10, 5, 2, 5], [10, 10, 4, 2]],
            },
            { color: IRON_LIGHT, rects: [[4, 5, 1, 3], [10, 5, 1, 3]] },
        ],
    },
    155: {
        layers: [
            { color: '#b71c1c', rects: [[3, 4, 4, 7], [2, 9, 5, 4]] },
            { color: '#0d47a1', rects: [[9, 4, 4, 7], [9, 9, 6, 4]] },
            { color: '#e53935', rects: [[4, 5, 2, 5], [3, 10, 3, 2]] },
            { color: '#1e88e5', rects: [[10, 5, 2, 5], [10, 10, 4, 2]] },
            { color: '#ef9a9a', rects: [[4, 5, 1, 3]] },
            { color: '#90caf9', rects: [[10, 5, 1, 3]] },
        ],
    },
    156: {
        layers: [
            { color: '#757575', rects: [[0, 0, 16, 16]] },
            { color: IRON_SHADOW, rects: [[1, 1, 14, 14]] },
            {
                color: IRON_MID,
                rects: [
                    [2, 2, 12, 12],
                    [1, 4, 1, 8], [14, 4, 1, 8],
                    [4, 1, 8, 1], [4, 14, 8, 1],
                ],
            },
            {
                color: IRON_LIGHT,
                rects: [
                    [3, 3, 8, 1], [3, 3, 1, 8],
                    [5, 5, 5, 1], [5, 5, 1, 5],
                    [12, 2, 2, 2], [2, 12, 2, 2],
                ],
            },
            {
                color: IRON_SHADOW,
                rects: [
                    [4, 12, 8, 1], [12, 4, 1, 8],
                    [6, 10, 5, 1], [10, 6, 1, 5],
                ],
            },
        ],
    },
};

const parseHexColor = (color: string): readonly [number, number, number, number] => {
    const value = Number.parseInt(color.slice(1), 16);
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255, 255];
};

export const paintPixelTile = (
    ctx: Pick<CanvasRenderingContext2D, 'fillStyle' | 'fillRect'>,
    definition: PixelTileDefinition,
): void => {
    definition.layers.forEach(({ color, rects }) => {
        ctx.fillStyle = color;
        rects.forEach(([x, y, width = 1, height = 1]) => ctx.fillRect(x, y, width, height));
    });
};

export const rasterizePixelTile = (definition: PixelTileDefinition): Uint8Array => {
    const pixels = new Uint8Array(16 * 16 * 4);

    definition.layers.forEach(({ color, rects }) => {
        const rgba = parseHexColor(color);
        rects.forEach(([x, y, width = 1, height = 1]) => {
            for (let py = y; py < y + height; py += 1) {
                for (let px = x; px < x + width; px += 1) {
                    const offset = (py * 16 + px) * 4;
                    pixels.set(rgba, offset);
                }
            }
        });
    });

    return pixels;
};
