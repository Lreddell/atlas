export type Pr19TextureSlot = number;

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
    { slot: 32, path: 'items/wood_pickaxe.png' },
    { slot: 33, path: 'items/stone_pickaxe.png' },
    { slot: 34, path: 'items/iron_pickaxe.png' },
    { slot: 35, path: 'items/stick.png' },
    { slot: 36, path: 'items/wood_axe.png' },
    { slot: 37, path: 'items/stone_axe.png' },
    { slot: 38, path: 'items/iron_axe.png' },
    { slot: 39, path: 'items/wood_shovel.png' },
    { slot: 40, path: 'items/stone_shovel.png' },
    { slot: 41, path: 'items/iron_shovel.png' },
    { slot: 48, path: 'items/coal.png' },
    { slot: 49, path: 'items/iron_ingot.png' },
    { slot: 50, path: 'items/apple.png' },
    { slot: 51, path: 'items/oak_sapling.png' },
    { slot: 55, path: 'items/raw_iron.png' },
    { slot: 57, path: 'items/charcoal.png' },
    { slot: 59, path: 'items/raw_copper.png' },
    { slot: 60, path: 'items/copper_ingot.png' },
    { slot: 61, path: 'items/copper_pickaxe.png' },
    { slot: 62, path: 'items/copper_axe.png' },
    { slot: 63, path: 'items/copper_shovel.png' },
    { slot: 67, path: 'items/bed.png' },
    { slot: 73, path: 'items/wheat_seeds.png' },
    { slot: 100, path: 'items/raw_gold.png' },
    { slot: 101, path: 'items/gold_ingot.png' },
    { slot: 102, path: 'items/diamond.png' },
    { slot: 103, path: 'items/emerald.png' },
    { slot: 104, path: 'items/lapis_lazuli.png' },
    { slot: 105, path: 'items/wood_sword.png' },
    { slot: 106, path: 'items/wood_hoe.png' },
    { slot: 107, path: 'items/stone_sword.png' },
    { slot: 108, path: 'items/stone_hoe.png' },
    { slot: 109, path: 'items/iron_sword.png' },
    { slot: 110, path: 'items/iron_hoe.png' },
    { slot: 111, path: 'items/copper_sword.png' },
    { slot: 112, path: 'items/copper_hoe.png' },
    { slot: 113, path: 'items/gold_pickaxe.png' },
    { slot: 114, path: 'items/gold_axe.png' },
    { slot: 115, path: 'items/gold_shovel.png' },
    { slot: 116, path: 'items/gold_sword.png' },
    { slot: 117, path: 'items/gold_hoe.png' },
    { slot: 118, path: 'items/diamond_pickaxe.png' },
    { slot: 119, path: 'items/diamond_axe.png' },
    { slot: 120, path: 'items/diamond_shovel.png' },
    { slot: 121, path: 'items/diamond_sword.png' },
    { slot: 122, path: 'items/diamond_hoe.png' },
    { slot: 146, path: 'items/spruce_sapling.png' },
    { slot: 147, path: 'items/birch_sapling.png' },
    { slot: 148, path: 'items/cherry_sapling.png' },
    { slot: 149, path: 'blocks/positive_magnet.png' },
    { slot: 150, path: 'blocks/negative_magnet.png' },
    { slot: 151, path: 'items/iron_helmet.png' },
    { slot: 152, path: 'items/iron_chestplate.png' },
    { slot: 153, path: 'items/iron_leggings.png' },
    { slot: 154, path: 'items/iron_boots.png' },
    { slot: 155, path: 'items/polarity_boots.png' },
    { slot: 156, path: 'blocks/iron_block.png' },
    { slot: 157, path: 'items/gold_helmet.png' },
    { slot: 158, path: 'items/gold_chestplate.png' },
    { slot: 159, path: 'items/gold_leggings.png' },
    { slot: 160, path: 'items/gold_boots.png' },
    { slot: 161, path: 'items/diamond_helmet.png' },
    { slot: 162, path: 'items/diamond_chestplate.png' },
    { slot: 163, path: 'items/diamond_leggings.png' },
    { slot: 164, path: 'items/diamond_boots.png' },
    { slot: 165, path: 'items/copper_helmet.png' },
    { slot: 166, path: 'items/copper_chestplate.png' },
    { slot: 167, path: 'items/copper_leggings.png' },
    { slot: 168, path: 'items/copper_boots.png' },
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

interface MaterialPalette {
    outline: string;
    shadow: string;
    base: string;
    highlight: string;
}

const layer = (color: string, rects: readonly PixelRect[]): PixelLayer => ({ color, rects });
const tile = (...layers: PixelLayer[]): PixelTileDefinition => ({ layers });

const MATERIAL_PALETTES = {
    wood: { outline: '#3e2723', shadow: '#5d4037', base: '#8d6e63', highlight: '#bcaaa4' },
    stone: { outline: '#424242', shadow: '#616161', base: '#9e9e9e', highlight: '#e0e0e0' },
    iron: { outline: '#757575', shadow: IRON_SHADOW, base: IRON_MID, highlight: IRON_LIGHT },
    copper: { outline: '#7f3515', shadow: '#b44f1d', base: '#e67e22', highlight: '#ffab73' },
    gold: { outline: '#8d6e00', shadow: '#c49000', base: '#fbc02d', highlight: '#fff59d' },
    diamond: { outline: '#006064', shadow: '#00838f', base: '#00bcd4', highlight: '#84ffff' },
} satisfies Record<string, MaterialPalette>;

const TOOL_RECTS = {
    pickaxe: {
        outline: [[3, 4], [4, 3], [5, 2, 6, 1], [11, 3], [12, 4], [7, 5, 2, 2]],
        shadow: [[4, 4], [10, 4], [11, 5]],
        base: [[5, 3, 6, 2], [8, 5]],
        highlight: [[5, 3, 4, 1]],
    },
    axe: {
        outline: [[7, 3, 5, 1], [6, 4, 7, 4], [7, 8, 4, 1]],
        shadow: [[10, 4, 3, 4], [9, 8, 2, 1]],
        base: [[8, 4, 4, 4], [7, 5, 1, 2], [8, 8, 2, 1]],
        highlight: [[8, 4, 3, 1], [7, 5]],
    },
    shovel: {
        outline: [[10, 3, 3, 1], [9, 4, 5, 4], [10, 8, 3, 1]],
        shadow: [[12, 4, 2, 4], [10, 8, 3, 1]],
        base: [[10, 4, 3, 4], [9, 5]],
        highlight: [[10, 4, 2, 1]],
    },
    sword: {
        outline: [[11, 2, 2, 1], [10, 3, 3, 2], [9, 5, 3, 2], [8, 7, 3, 2], [5, 9, 5, 2]],
        shadow: [[11, 4], [10, 6], [9, 8], [8, 9]],
        base: [[11, 3], [10, 4, 2, 2], [9, 6, 2, 2], [8, 8, 2, 1]],
        highlight: [[11, 3], [10, 4], [9, 5], [8, 6]],
    },
    hoe: {
        outline: [[6, 2, 6, 1], [10, 3, 3, 2], [11, 5, 2, 4]],
        shadow: [[10, 3, 2, 2], [12, 5, 1, 4]],
        base: [[7, 3, 5, 1], [11, 4], [11, 5, 1, 3]],
        highlight: [[7, 2, 3, 1]],
    },
} as const;

const LONG_HANDLE: readonly PixelRect[] = [
    [3, 12, 2, 2], [4, 11, 2, 2], [5, 10, 2, 2], [6, 9, 2, 2],
    [7, 8, 2, 2], [8, 7, 2, 2], [9, 6, 2, 2],
];
const HANDLE_BASE: readonly PixelRect[] = [
    [4, 12], [5, 11], [6, 10], [7, 9], [8, 8], [9, 7], [10, 6],
];
const HANDLE_HIGHLIGHT: readonly PixelRect[] = [[5, 10], [6, 9], [7, 8]];

const toolTile = (
    shape: keyof typeof TOOL_RECTS,
    palette: MaterialPalette,
): PixelTileDefinition => {
    const rects = TOOL_RECTS[shape];
    return tile(
        layer(MATERIAL_PALETTES.wood.outline, LONG_HANDLE),
        layer(MATERIAL_PALETTES.wood.base, HANDLE_BASE),
        layer(MATERIAL_PALETTES.wood.highlight, HANDLE_HIGHLIGHT),
        layer(palette.outline, rects.outline),
        layer(palette.shadow, rects.shadow),
        layer(palette.base, rects.base),
        layer(palette.highlight, rects.highlight),
    );
};

const TOOL_TEXTURES = [
    [32, 'pickaxe', 'wood'], [33, 'pickaxe', 'stone'], [34, 'pickaxe', 'iron'],
    [61, 'pickaxe', 'copper'], [113, 'pickaxe', 'gold'], [118, 'pickaxe', 'diamond'],
    [36, 'axe', 'wood'], [37, 'axe', 'stone'], [38, 'axe', 'iron'],
    [62, 'axe', 'copper'], [114, 'axe', 'gold'], [119, 'axe', 'diamond'],
    [39, 'shovel', 'wood'], [40, 'shovel', 'stone'], [41, 'shovel', 'iron'],
    [63, 'shovel', 'copper'], [115, 'shovel', 'gold'], [120, 'shovel', 'diamond'],
    [105, 'sword', 'wood'], [107, 'sword', 'stone'], [109, 'sword', 'iron'],
    [111, 'sword', 'copper'], [116, 'sword', 'gold'], [121, 'sword', 'diamond'],
    [106, 'hoe', 'wood'], [108, 'hoe', 'stone'], [110, 'hoe', 'iron'],
    [112, 'hoe', 'copper'], [117, 'hoe', 'gold'], [122, 'hoe', 'diamond'],
] as const;

for (const [slot, shape, material] of TOOL_TEXTURES) {
    PR19_TEXTURE_TILES[slot] = toolTile(shape, MATERIAL_PALETTES[material]);
}

const ingotTile = (palette: MaterialPalette): PixelTileDefinition => tile(
    layer(palette.outline, [[3, 6, 10, 5], [4, 5, 8, 1]]),
    layer(palette.shadow, [[4, 9, 8, 2], [11, 7, 2, 3]]),
    layer(palette.base, [[4, 6, 8, 4]]),
    layer(palette.highlight, [[5, 6, 5, 1], [4, 7, 2, 1]]),
);

const RAW_ROCK: MaterialPalette = {
    outline: '#4e342e',
    shadow: '#6d4c41',
    base: '#8d6e63',
    highlight: '#bcaaa4',
};

const rawOreTile = (
    rock: MaterialPalette,
    ore: MaterialPalette,
): PixelTileDefinition => tile(
    layer(rock.outline, [[4, 6, 1, 5], [5, 4, 6, 1], [11, 5, 2, 2], [12, 7, 1, 4], [5, 11, 7, 1]]),
    layer(rock.shadow, [[5, 5, 7, 6], [4, 7, 8, 3]]),
    layer(rock.base, [[5, 5, 5, 5], [6, 10, 5, 1]]),
    layer(ore.shadow, [[6, 6, 2, 2], [9, 9, 2, 2]]),
    layer(ore.base, [[7, 6, 2, 2], [9, 7, 2, 2], [6, 9, 2, 1]]),
    layer(ore.highlight, [[7, 6], [10, 7]]),
);

const gemTile = (palette: MaterialPalette): PixelTileDefinition => tile(
    layer(palette.outline, [[7, 2, 2, 1], [5, 3, 6, 1], [4, 4, 8, 4], [5, 8, 6, 2], [7, 10, 2, 3]]),
    layer(palette.shadow, [[4, 6, 2, 2], [10, 4, 2, 4], [7, 9, 2, 3]]),
    layer(palette.base, [[6, 4, 4, 5], [5, 5, 6, 2]]),
    layer(palette.highlight, [[6, 4, 3, 1], [6, 5, 2, 2]]),
);

Object.assign(PR19_TEXTURE_TILES, {
    35: tile(
        layer('#3e2723', [[3, 12, 2, 2], [4, 11, 2, 2], [5, 10, 2, 2], [6, 9, 2, 2], [7, 8, 2, 2], [8, 7, 2, 2], [9, 6, 2, 2], [10, 5, 2, 2], [11, 4, 2, 2]]),
        layer('#6d4c41', [[4, 12], [5, 11], [6, 10], [7, 9], [8, 8], [9, 7], [10, 6], [11, 5]]),
        layer('#a1887f', [[5, 10], [6, 9], [7, 8], [8, 7]]),
    ),
    48: tile(
        layer('#050505', [[4, 5, 1, 6], [5, 3, 6, 1], [11, 4, 2, 2], [12, 6, 1, 5], [5, 11, 7, 2]]),
        layer('#151515', [[5, 4, 6, 7], [4, 6, 8, 4]]),
        layer('#303030', [[6, 4, 3, 2], [9, 6, 2, 2], [6, 9, 2, 1]]),
        layer('#555555', [[6, 4], [9, 6]]),
    ),
    49: ingotTile(MATERIAL_PALETTES.iron),
    50: tile(
        layer('#7f0000', [[5, 5, 6, 1], [4, 6, 8, 6], [5, 12, 6, 1]]),
        layer('#b71c1c', [[5, 6, 6, 6], [4, 8, 8, 3]]),
        layer('#e53935', [[5, 6, 4, 4]]),
        layer('#ff8a80', [[6, 6, 2, 2]]),
        layer('#4e342e', [[8, 2, 2, 4]]),
        layer('#2e7d32', [[10, 3, 3, 2], [11, 2, 2, 1]]),
        layer('#81c784', [[10, 3, 2, 1]]),
    ),
    51: tile(
        layer('#4e342e', [[7, 9, 2, 7]]),
        layer('#6d4c41', [[8, 10, 1, 5]]),
        layer('#1b5e20', [[5, 4, 6, 6], [4, 6, 8, 3]]),
        layer('#2e7d32', [[6, 3, 4, 5], [5, 5, 6, 3]]),
        layer('#66bb6a', [[6, 4, 2, 2], [9, 5, 2, 2]]),
    ),
    55: rawOreTile(RAW_ROCK, MATERIAL_PALETTES.iron),
    57: tile(
        layer('#1b0f0a', [[5, 3, 6, 1], [4, 4, 8, 9], [5, 13, 6, 1]]),
        layer('#2b1b14', [[5, 4, 6, 9], [4, 6, 8, 5]]),
        layer('#4e342e', [[6, 4, 2, 4], [9, 8, 2, 3]]),
        layer('#6d4c41', [[6, 4], [9, 8]]),
    ),
    59: rawOreTile(RAW_ROCK, MATERIAL_PALETTES.copper),
    60: ingotTile(MATERIAL_PALETTES.copper),
    67: tile(
        layer('#3e2723', [[2, 10, 12, 3], [2, 13, 2, 2], [12, 13, 2, 2]]),
        layer('#5d4037', [[3, 11, 10, 2]]),
        layer('#8e0000', [[2, 6, 12, 5]]),
        layer('#c62828', [[3, 6, 10, 4]]),
        layer('#ef5350', [[3, 6, 5, 1]]),
        layer('#bdbdbd', [[10, 6, 3, 3]]),
        layer('#eeeeee', [[10, 6, 2, 2]]),
    ),
    73: tile(
        layer('#4e5d23', [[5, 6, 2, 4], [8, 4, 2, 4], [10, 8, 2, 4], [6, 11, 2, 2]]),
        layer('#7cb342', [[6, 6], [9, 4], [11, 8], [7, 11]]),
        layer('#c0ca33', [[6, 7], [9, 5], [11, 9]]),
    ),
    100: rawOreTile(RAW_ROCK, MATERIAL_PALETTES.gold),
    101: ingotTile(MATERIAL_PALETTES.gold),
    102: gemTile(MATERIAL_PALETTES.diamond),
    103: gemTile({
        outline: '#1b5e20',
        shadow: '#2e7d32',
        base: '#00c853',
        highlight: '#b9f6ca',
    }),
    104: tile(
        layer('#0d175f', [[4, 7, 2, 4], [6, 5, 3, 6], [9, 4, 2, 7], [11, 7, 2, 4], [5, 11, 7, 1]]),
        layer('#1a237e', [[5, 7, 2, 3], [7, 6, 3, 5], [10, 5, 1, 5], [11, 8, 1, 2]]),
        layer('#3949ab', [[7, 6, 2, 2], [10, 5], [6, 9]]),
        layer('#7986cb', [[7, 6], [10, 5]]),
    ),
    146: tile(
        layer('#4e342e', [[7, 11, 2, 5]]),
        layer('#0d3b14', [[7, 2, 2, 2], [5, 4, 6, 2], [4, 6, 8, 2], [3, 8, 10, 3]]),
        layer('#1b5e20', [[7, 3, 2, 1], [6, 5, 4, 1], [5, 7, 6, 1], [4, 9, 8, 1]]),
        layer('#4caf50', [[7, 3], [6, 5], [5, 7], [4, 9]]),
    ),
    147: tile(
        layer('#757575', [[7, 9, 2, 7]]),
        layer('#eeeeee', [[8, 9, 1, 6]]),
        layer('#212121', [[7, 11], [8, 14]]),
        layer('#558b2f', [[5, 4, 6, 6], [4, 6, 8, 3]]),
        layer('#8bc34a', [[6, 3, 4, 5], [5, 5, 6, 3]]),
        layer('#c5e1a5', [[6, 4, 2, 2], [9, 6, 2, 1]]),
    ),
    148: tile(
        layer('#4e342e', [[7, 9, 2, 7]]),
        layer('#2e7d32', [[5, 4, 6, 6], [4, 6, 8, 3]]),
        layer('#66bb6a', [[6, 3, 4, 5], [5, 5, 6, 3]]),
        layer('#ec407a', [[5, 4, 2, 2], [9, 5, 2, 2], [7, 7, 2, 2]]),
        layer('#f8bbd0', [[5, 4], [9, 5], [7, 7]]),
    ),
});

const ARMOR_RECTS = {
    helmet: {
        shadow: [[5, 3, 6, 1], [4, 4, 8, 1], [3, 5, 10, 6], [3, 11, 3, 1], [10, 11, 3, 1]],
        base: [[5, 4, 6, 1], [4, 5, 8, 2], [4, 7, 2, 4], [10, 7, 2, 4]],
        highlight: [[5, 5, 5, 1], [4, 6, 6, 1], [4, 7, 1, 2]],
    },
    chestplate: {
        shadow: [[4, 2, 3, 2], [9, 2, 3, 2], [3, 3, 4, 2], [9, 3, 4, 2], [2, 4, 4, 4], [10, 4, 4, 4], [4, 4, 8, 9]],
        base: [[5, 3, 2, 2], [9, 3, 2, 2], [3, 4, 3, 3], [10, 4, 3, 3], [5, 5, 6, 7]],
        highlight: [[5, 3], [3, 4, 2, 1], [5, 5, 4, 1], [5, 6, 1, 5]],
    },
    leggings: {
        shadow: [[4, 3, 8, 2], [4, 5, 8, 3], [3, 7, 4, 6], [9, 7, 4, 6]],
        base: [[5, 4, 6, 3], [4, 7, 2, 5], [10, 7, 2, 5]],
        highlight: [[5, 4, 4, 1], [4, 7, 1, 3], [10, 7, 1, 3]],
    },
    boots: {
        shadow: [[3, 4, 4, 7], [2, 9, 5, 4], [9, 4, 4, 7], [9, 9, 6, 4]],
        base: [[4, 5, 2, 5], [3, 10, 3, 2], [10, 5, 2, 5], [10, 10, 4, 2]],
        highlight: [[4, 5, 1, 3], [10, 5, 1, 3]],
    },
} as const;

const armorTile = (
    piece: keyof typeof ARMOR_RECTS,
    palette: MaterialPalette,
): PixelTileDefinition => {
    const rects = ARMOR_RECTS[piece];
    return tile(
        layer(palette.shadow, rects.shadow),
        layer(palette.base, rects.base),
        layer(palette.highlight, rects.highlight),
    );
};

const ARMOR_TEXTURES = [
    [157, 'helmet', 'gold'], [158, 'chestplate', 'gold'],
    [159, 'leggings', 'gold'], [160, 'boots', 'gold'],
    [161, 'helmet', 'diamond'], [162, 'chestplate', 'diamond'],
    [163, 'leggings', 'diamond'], [164, 'boots', 'diamond'],
    [165, 'helmet', 'copper'], [166, 'chestplate', 'copper'],
    [167, 'leggings', 'copper'], [168, 'boots', 'copper'],
] as const;

for (const [slot, piece, material] of ARMOR_TEXTURES) {
    PR19_TEXTURE_TILES[slot] = armorTile(piece, MATERIAL_PALETTES[material]);
}

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
