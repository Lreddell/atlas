export interface AtlasTilePainter {
    ctx: CanvasRenderingContext2D;
    withTile: (slot: number, draw: () => void) => void;
    fill: (color: string) => void;
    noise: (opacity?: number, density?: number) => void;
}

export interface CutoutTileConfig {
    slot: number;
    alphaCutoff?: number;
    forcedTransparentRgb?: [number, number, number];
}

type PixelRect = [number, number, number?, number?];

interface LogSideSpec {
    slot: number;
    baseColor: string;
    stripeColor: string;
    stripes: PixelRect[];
    noiseOpacity?: number;
}

interface LogTopSpec {
    slot: number;
    baseColor: string;
    strokeColor: string;
    noiseOpacity?: number;
    lineWidth?: number;
    strokeInset?: number;
}

interface PlankSpec {
    slot: number;
    baseColor: string;
    accentColor: string;
    noiseOpacity: number;
}

interface LeavesSpec {
    slot: number;
    baseColor: string;
    accentColor?: string;
    accentCount?: number;
    density: number;
    noiseOpacity: number;
}

interface GrassSideSpec {
    slot: number;
    baseColor: string;
    grassColor: string;
    noiseOpacity: number;
}

interface OreSpec {
    slot: number;
    oreColor: string;
    deposits: PixelRect[];
}

const drawRects = (ctx: CanvasRenderingContext2D, rects: PixelRect[]) => {
    rects.forEach(([x, y, width = 1, height = 1]) => ctx.fillRect(x, y, width, height));
};

const LOG_SIDE_SPECS: LogSideSpec[] = [
    { slot: 7, baseColor: '#5d4037', stripeColor: '#3e2723', stripes: [[3, 0, 2, 16], [11, 0, 2, 16]], noiseOpacity: 0.1 },
    { slot: 23, baseColor: '#3e2723', stripeColor: '#2d1e18', stripes: [[3, 0, 2, 16], [11, 0, 2, 16]], noiseOpacity: 0.1 },
    { slot: 74, baseColor: '#3e1e24', stripeColor: '#2d1e18', stripes: [[2, 0, 2, 16], [9, 0, 3, 16]], noiseOpacity: 0.1 },
    { slot: 87, baseColor: '#e3dfd3', stripeColor: '#212121', stripes: [[2, 3, 3, 1], [10, 7, 4, 1], [5, 12, 2, 1], [1, 14, 3, 1], [12, 2, 2, 1]], noiseOpacity: 0.05 },
];

const LOG_TOP_SPECS: LogTopSpec[] = [
    { slot: 13, baseColor: '#c9ad88', strokeColor: '#5d4037', noiseOpacity: 0.1, strokeInset: 2.5 },
    { slot: 75, baseColor: '#f8bbd0', strokeColor: '#3e1e24', noiseOpacity: 0.05, strokeInset: 2.5 },
    { slot: 88, baseColor: '#e3dfd3', strokeColor: '#bdbdbd', noiseOpacity: 0.05, lineWidth: 2, strokeInset: 1 },
];

const PLANK_SPECS: PlankSpec[] = [
    { slot: 8, baseColor: '#a1887f', accentColor: '#6d4c41', noiseOpacity: 0.1 },
    { slot: 27, baseColor: '#5d4037', accentColor: '#4e342e', noiseOpacity: 0.1 },
    { slot: 77, baseColor: '#f48fb1', accentColor: '#d8a0a8', noiseOpacity: 0.05 },
    { slot: 90, baseColor: '#f0f4c3', accentColor: '#d4e157', noiseOpacity: 0.05 },
];

const LEAVES_SPECS: LeavesSpec[] = [
    { slot: 4, baseColor: '#388e3c', density: 0.85, noiseOpacity: 0.2 },
    { slot: 24, baseColor: '#1b5e20', density: 0.85, noiseOpacity: 0.2 },
    { slot: 76, baseColor: '#f8bbd0', accentColor: '#f48fb1', accentCount: 40, density: 0.85, noiseOpacity: 0 },
    { slot: 89, baseColor: '#81c784', density: 0.85, noiseOpacity: 0.1 },
];

const GRASS_SIDE_SPECS: GrassSideSpec[] = [
    { slot: 12, baseColor: '#5d4037', grassColor: '#66bb6a', noiseOpacity: 0.1 },
    { slot: 25, baseColor: '#5d4037', grassColor: '#ffffff', noiseOpacity: 0.05 },
];

const ORE_SPECS: OreSpec[] = [
    { slot: 15, oreColor: '#212121', deposits: [[4, 4, 2, 2], [5, 4, 2, 2], [4, 5, 2, 2], [10, 10, 2, 2], [11, 10, 2, 2], [10, 11, 2, 2], [12, 5, 2, 2], [6, 12, 2, 2]] },
    { slot: 16, oreColor: '#d7ccc8', deposits: [[3, 6, 2, 2], [4, 6, 2, 2], [4, 5, 2, 2], [8, 10, 2, 2], [9, 10, 2, 2], [8, 11, 2, 2], [12, 3, 2, 2], [5, 13, 2, 2]] },
    { slot: 58, oreColor: '#e67e22', deposits: [[2, 5, 2, 2], [3, 6, 2, 2], [3, 5, 2, 2], [9, 11, 2, 2], [10, 11, 2, 2], [9, 12, 2, 2], [11, 4, 2, 2], [6, 13, 2, 2]] },
    { slot: 96, oreColor: '#fdd835', deposits: [[4, 4, 2, 2], [5, 4, 2, 2], [6, 5, 2, 2], [10, 10, 2, 2], [11, 10, 2, 2], [12, 9, 2, 2], [5, 12, 2, 2]] },
    { slot: 97, oreColor: '#00e5ff', deposits: [[5, 5, 2, 2], [6, 6, 2, 2], [10, 8, 2, 2], [11, 7, 2, 2], [4, 12, 2, 2], [8, 3, 2, 2], [12, 12, 2, 2]] },
    { slot: 98, oreColor: '#1a237e', deposits: [[4, 6], [5, 5], [5, 6], [6, 5], [10, 10], [11, 10], [10, 11], [11, 11], [7, 3]] },
    { slot: 99, oreColor: '#00e676', deposits: [[5, 5, 2, 2], [10, 9, 2, 2], [3, 11, 2, 2], [12, 4, 2, 2], [8, 8, 2, 2]] },
];

const TERRACOTTA_SPECS: Array<{ slot: number; color: string }> = [
    { slot: 80, color: '#a1887f' },
    { slot: 81, color: '#fbc02d' },
    { slot: 82, color: '#8d6e63' },
    { slot: 91, color: '#d1b1a1' },
    { slot: 92, color: '#a05425' },
    { slot: 93, color: '#95576c' },
    { slot: 94, color: '#876b62' },
    { slot: 95, color: '#4d3323' },
];

export const CUTOUT_TILE_CONFIGS: CutoutTileConfig[] = [
    { slot: 4 },
    { slot: 22 },
    { slot: 24, alphaCutoff: 170, forcedTransparentRgb: [46, 107, 78] },
    { slot: 29 },
    { slot: 30 },
    { slot: 31 },
    { slot: 51 },
    { slot: 73 },
    { slot: 76 },
    { slot: 86 },
    { slot: 89 },
];

export const drawWoodFamilyTiles = ({ ctx, withTile, fill, noise }: AtlasTilePainter) => {
    LOG_SIDE_SPECS.forEach(({ slot, baseColor, stripeColor, stripes, noiseOpacity }) => {
        withTile(slot, () => {
            fill(baseColor);
            ctx.fillStyle = stripeColor;
            drawRects(ctx, stripes);
            noise(noiseOpacity);
        });
    });

    LOG_TOP_SPECS.forEach(({ slot, baseColor, strokeColor, noiseOpacity = 0.1, lineWidth, strokeInset = 2.5 }) => {
        withTile(slot, () => {
            fill(baseColor);
            ctx.strokeStyle = strokeColor;
            if (lineWidth !== undefined) ctx.lineWidth = lineWidth;
            ctx.strokeRect(strokeInset, strokeInset, 16 - strokeInset * 2, 16 - strokeInset * 2);
            if (lineWidth !== undefined) ctx.lineWidth = 1;
            noise(noiseOpacity);
        });
    });

    PLANK_SPECS.forEach(({ slot, baseColor, accentColor, noiseOpacity }) => {
        withTile(slot, () => {
            fill(baseColor);
            ctx.fillStyle = accentColor;
            ctx.fillRect(0, 0, 16, 1);
            ctx.fillRect(0, 4, 16, 1);
            ctx.fillRect(0, 8, 16, 1);
            ctx.fillRect(0, 12, 16, 1);
            ctx.fillRect(0, 15, 16, 1);
            ctx.fillRect(6, 0, 1, 4);
            ctx.fillRect(12, 5, 1, 3);
            ctx.fillRect(4, 9, 1, 3);
            ctx.fillRect(10, 13, 1, 3);
            noise(noiseOpacity);
        });
    });
};

export const drawFoliageFamilyTiles = ({ ctx, withTile, fill, noise }: AtlasTilePainter) => {
    LEAVES_SPECS.forEach(({ slot, baseColor, accentColor, accentCount = 0, density, noiseOpacity }) => {
        withTile(slot, () => {
            ctx.fillStyle = baseColor;
            for (let py = 0; py < 16; py += 1) {
                for (let px = 0; px < 16; px += 1) {
                    if (Math.random() < density) ctx.fillRect(px, py, 1, 1);
                }
            }
            if (accentColor && accentCount > 0) {
                ctx.fillStyle = accentColor;
                for (let index = 0; index < accentCount; index += 1) {
                    ctx.fillRect(Math.floor(Math.random() * 16), Math.floor(Math.random() * 16), 1, 1);
                }
            }
            if (noiseOpacity > 0) noise(noiseOpacity);
        });
    });

    GRASS_SIDE_SPECS.forEach(({ slot, baseColor, grassColor, noiseOpacity }) => {
        withTile(slot, () => {
            fill(baseColor);
            ctx.fillStyle = grassColor;
            ctx.fillRect(0, 0, 16, 4);
            for (let x = 0; x < 16; x += 1) {
                ctx.fillRect(x, 4, 1, Math.floor(Math.random() * 4));
            }
            noise(noiseOpacity);
        });
    });
};

export const drawOreFamilyTiles = ({ ctx, withTile, fill, noise }: AtlasTilePainter) => {
    ORE_SPECS.forEach(({ slot, oreColor, deposits }) => {
        withTile(slot, () => {
            fill('#9e9e9e');
            noise(0.15);
            ctx.fillStyle = oreColor;
            drawRects(ctx, deposits);
        });
    });
};

export const drawTerracottaTiles = ({ withTile, fill, noise }: AtlasTilePainter) => {
    TERRACOTTA_SPECS.forEach(({ slot, color }) => {
        withTile(slot, () => {
            fill(color);
            noise(0.05);
        });
    });
};
