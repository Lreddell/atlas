export const RESONANT_TEXTURE_SLOTS = {
    echoStone: 237,
    echoBricks: 238,
    crackedEchoBricks: 239,
    chiseledEchoStone: 240,
    echoMosaic: 241,
    echoCrystal: 242,
    resonancePylon: 243,
    pulseConduit: 245,
    phaseBlock: 246,
    resonancePlate: 247,
    resonantLamp: 248,
    echoSpikes: 249,
    sentinelCore: 250,
    listeningStone: 251,
    vaultSeal: 252,
    echoShard: 253,
    echoDust: 254,
    echoCore: 256,
    fracturedCore: 260,
    vaultsteelSpear: 261,
    vaultCrossbow: 262,
    vaultBolt: 263,
    bellbreakerMaul: 264,
    echoTuningFork: 265,
    titanHammer: 266,
} as const;

type MaterialPattern =
    | 'dressed_stone'
    | 'offset_brick'
    | 'carved_inset'
    | 'mosaic'
    | 'mechanism'
    | 'crystal'
    | 'item';

interface TileSpec {
    slot: number;
    pattern: MaterialPattern;
    variant: number;
    base: string;
    mid: string;
    dark: string;
    accent: string;
}

const STONE = { base: '#50595a', mid: '#626d6e', dark: '#343b3d', accent: '#7c948e' };
const TILE_SPECS: TileSpec[] = [
    { slot: 237, pattern: 'dressed_stone', variant: 0, ...STONE },
    { slot: 238, pattern: 'offset_brick', variant: 0, base: '#4b5557', mid: '#5f696b', dark: '#31383a', accent: '#748480' },
    { slot: 239, pattern: 'offset_brick', variant: 1, base: '#454e50', mid: '#586264', dark: '#292f31', accent: '#707d7a' },
    { slot: 240, pattern: 'carved_inset', variant: 0, base: '#4c5658', mid: '#626d70', dark: '#303739', accent: '#80978f' },
    { slot: 241, pattern: 'mosaic', variant: 0, base: '#424c4e', mid: '#5c6769', dark: '#2c3335', accent: '#788a85' },
    { slot: 242, pattern: 'crystal', variant: 0, base: '#00000000', mid: '#6e9691', dark: '#3d5f5c', accent: '#c9e6df' },
    { slot: 243, pattern: 'mechanism', variant: 0, base: '#394245', mid: '#556064', dark: '#20272a', accent: '#718f89' },
    { slot: 245, pattern: 'mechanism', variant: 1, base: '#354044', mid: '#4b575a', dark: '#20282b', accent: '#78958e' },
    { slot: 246, pattern: 'mechanism', variant: 2, base: '#465154', mid: '#596568', dark: '#2b3336', accent: '#78958e' },
    { slot: 247, pattern: 'carved_inset', variant: 2, base: '#414a4d', mid: '#566164', dark: '#252d30', accent: '#78958e' },
    { slot: 248, pattern: 'crystal', variant: 1, base: '#283235', mid: '#6d8f89', dark: '#171e20', accent: '#d5eee8' },
    { slot: 249, pattern: 'crystal', variant: 2, base: '#00000000', mid: '#6e7f81', dark: '#3b494c', accent: '#a8c3be' },
    { slot: 250, pattern: 'mechanism', variant: 3, base: '#293235', mid: '#4c585b', dark: '#171e20', accent: '#86aaa3' },
    { slot: 251, pattern: 'carved_inset', variant: 3, base: '#465052', mid: '#596466', dark: '#293133', accent: '#76918a' },
    { slot: 252, pattern: 'carved_inset', variant: 4, base: '#252c2f', mid: '#384144', dark: '#151a1c', accent: '#718781' },
    { slot: 253, pattern: 'item', variant: 0, base: '#00000000', mid: '#739a94', dark: '#3e6561', accent: '#d3e9e4' },
    { slot: 254, pattern: 'item', variant: 1, base: '#00000000', mid: '#718d87', dark: '#455956', accent: '#b9cec8' },
    { slot: 256, pattern: 'item', variant: 3, base: '#00000000', mid: '#6d918b', dark: '#344f4c', accent: '#d1e6e1' },
    { slot: 260, pattern: 'item', variant: 7, base: '#00000000', mid: '#617c77', dark: '#324844', accent: '#95b2ac' },
    { slot: 261, pattern: 'item', variant: 8, base: '#00000000', mid: '#8c8b7e', dark: '#4a493f', accent: '#d8d5c3' },
    { slot: 262, pattern: 'item', variant: 9, base: '#00000000', mid: '#6f5d47', dark: '#382f27', accent: '#b5aa92' },
    { slot: 263, pattern: 'item', variant: 10, base: '#00000000', mid: '#77776d', dark: '#383933', accent: '#d4d3c4' },
    { slot: 264, pattern: 'item', variant: 11, base: '#00000000', mid: '#716f66', dark: '#34342f', accent: '#b08f5b' },
    { slot: 265, pattern: 'item', variant: 12, base: '#00000000', mid: '#9c9276', dark: '#514a3a', accent: '#d7cba8' },
    { slot: 266, pattern: 'item', variant: 13, base: '#00000000', mid: '#81735c', dark: '#39342c', accent: '#c4aa76' },
];

const TILE_SIZE = 16;
const ATLAS_COLS = 8;
const STRIDE = 32;
const PADDING = 8;

type Rgba = readonly [number, number, number, number];

function parseColor(value: string): Rgba {
    const hex = value.slice(1);
    if (hex.length === 8) {
        return [
            Number.parseInt(hex.slice(0, 2), 16),
            Number.parseInt(hex.slice(2, 4), 16),
            Number.parseInt(hex.slice(4, 6), 16),
            Number.parseInt(hex.slice(6, 8), 16),
        ];
    }
    return [
        Number.parseInt(hex.slice(0, 2), 16),
        Number.parseInt(hex.slice(2, 4), 16),
        Number.parseInt(hex.slice(4, 6), 16),
        255,
    ];
}

class PixelTile {
    readonly data = new Uint8ClampedArray(TILE_SIZE * TILE_SIZE * 4);

    pixel(x: number, y: number, color: string): void {
        if (x < 0 || y < 0 || x >= TILE_SIZE || y >= TILE_SIZE) return;
        this.data.set(parseColor(color), (y * TILE_SIZE + x) * 4);
    }

    rect(x: number, y: number, width: number, height: number, color: string): void {
        for (let py = y; py < y + height; py += 1) {
            for (let px = x; px < x + width; px += 1) this.pixel(px, py, color);
        }
    }

    fill(color: string): void {
        this.rect(0, 0, TILE_SIZE, TILE_SIZE, color);
    }

    line(points: ReadonlyArray<readonly [number, number]>, color: string): void {
        for (const [x, y] of points) this.pixel(x, y, color);
    }
}

function drawDressedStone(tile: PixelTile, spec: TileSpec): void {
    tile.fill(spec.base);
    tile.rect(0, 0, 16, 1, spec.mid);
    tile.rect(0, 15, 16, 1, spec.dark);
    tile.line([[3, 3], [4, 3], [11, 2], [12, 2], [7, 7], [8, 7], [2, 11], [13, 12]], spec.mid);
    tile.line([[4, 4], [10, 8], [11, 8], [3, 12], [12, 13]], spec.dark);
    tile.line([[1, 6], [14, 9]], spec.accent);
}

function drawOffsetBrick(tile: PixelTile, spec: TileSpec): void {
    tile.fill(spec.base);
    for (const y of [4, 9, 14]) tile.rect(0, y, 16, 1, spec.dark);
    for (let course = 0; course < 4; course += 1) {
        const y = course * 5;
        const offset = course % 2 === 0 ? 5 : 1;
        for (let x = offset; x < 16; x += 8) tile.rect(x, y, 1, 4, spec.dark);
        tile.line([[offset + 1, y + 1], [offset + 2, y + 1]], spec.mid);
    }
    if (spec.variant === 1) {
        tile.line([[10, 0], [9, 1], [9, 2], [8, 3], [9, 4], [8, 5], [7, 6], [7, 7], [6, 8], [7, 9], [6, 10], [5, 11], [5, 12]], '#171c1e');
        tile.line([[10, 1], [8, 6], [6, 11]], spec.mid);
    }
}

function frame(tile: PixelTile, spec: TileSpec): void {
    tile.fill(spec.base);
    tile.rect(1, 1, 14, 1, spec.mid);
    tile.rect(1, 14, 14, 1, spec.dark);
    tile.rect(1, 2, 1, 12, spec.mid);
    tile.rect(14, 2, 1, 12, spec.dark);
}

function drawCarvedInset(tile: PixelTile, spec: TileSpec): void {
    frame(tile, spec);
    if (spec.variant === 0) {
        tile.rect(4, 4, 8, 8, spec.dark);
        tile.rect(5, 5, 6, 1, spec.mid);
        tile.rect(7, 7, 2, 4, spec.accent);
        tile.pixel(6, 8, spec.mid); tile.pixel(9, 8, spec.mid);
    } else if (spec.variant === 1) {
        tile.rect(3, 2, 2, 12, spec.dark); tile.rect(11, 2, 2, 12, spec.dark);
        tile.rect(7, 2, 2, 12, '#1a2022');
        tile.rect(5, 5, 2, 1, spec.mid); tile.rect(9, 10, 2, 1, spec.mid);
        tile.pixel(7, 8, spec.accent); tile.pixel(8, 8, spec.accent);
    } else if (spec.variant === 2) {
        tile.rect(3, 5, 10, 7, spec.dark);
        tile.rect(4, 5, 8, 1, spec.mid); tile.rect(5, 7, 6, 3, spec.base);
        tile.rect(7, 8, 2, 1, spec.accent);
    } else if (spec.variant === 3) {
        tile.rect(3, 3, 10, 10, spec.dark);
        tile.line([[7, 4], [8, 4], [5, 5], [10, 5], [4, 7], [11, 7], [4, 8], [11, 8], [5, 10], [10, 10], [7, 11], [8, 11]], spec.mid);
        tile.line([[7, 6], [8, 6], [6, 7], [9, 7], [6, 8], [9, 8], [7, 9], [8, 9]], spec.accent);
    } else {
        tile.rect(0, 4, 16, 1, spec.dark); tile.rect(0, 11, 16, 1, spec.dark);
        tile.rect(5, 0, 1, 16, spec.dark); tile.rect(10, 0, 1, 16, spec.dark);
        tile.rect(7, 1, 2, 14, '#151a1c');
        tile.pixel(7, 7, spec.accent); tile.pixel(8, 7, spec.accent);
    }
}

function drawMosaic(tile: PixelTile, spec: TileSpec): void {
    tile.fill(spec.base);
    tile.line([[7, 0], [8, 0], [6, 1], [9, 1], [5, 2], [10, 2], [4, 3], [11, 3], [3, 4], [12, 4], [2, 5], [13, 5], [1, 6], [14, 6], [0, 7], [15, 7], [0, 8], [15, 8]], spec.dark);
    tile.line([[7, 3], [8, 3], [6, 4], [9, 4], [5, 5], [10, 5], [4, 6], [11, 6], [3, 7], [12, 7], [3, 8], [12, 8], [4, 9], [11, 9], [5, 10], [10, 10], [6, 11], [9, 11], [7, 12], [8, 12]], spec.mid);
    tile.rect(7, 6, 2, 4, spec.accent);
    tile.pixel(6, 7, spec.accent); tile.pixel(9, 8, spec.accent);
}

function drawMechanism(tile: PixelTile, spec: TileSpec): void {
    frame(tile, spec);
    if (spec.variant === 0) {
        tile.rect(4, 2, 8, 12, spec.dark);
        tile.rect(5, 3, 6, 2, spec.mid); tile.rect(5, 11, 6, 2, spec.mid);
        tile.rect(7, 5, 2, 6, spec.accent);
        tile.pixel(6, 7, spec.mid); tile.pixel(9, 8, spec.mid);
    } else if (spec.variant === 1) {
        tile.rect(2, 6, 12, 4, spec.dark);
        tile.rect(0, 7, 5, 2, spec.accent); tile.rect(11, 7, 5, 2, spec.accent);
        tile.rect(6, 6, 4, 4, spec.mid); tile.rect(7, 7, 2, 2, spec.dark);
    } else if (spec.variant === 2) {
        tile.rect(3, 3, 10, 10, spec.dark);
        tile.rect(4, 4, 8, 8, spec.base);
        tile.line([[4, 4], [5, 4], [10, 4], [11, 4], [4, 5], [11, 5], [4, 10], [11, 10], [4, 11], [5, 11], [10, 11], [11, 11]], spec.accent);
        tile.line([[7, 6], [8, 6], [6, 7], [9, 7], [6, 8], [9, 8], [7, 9], [8, 9]], spec.mid);
    } else {
        tile.rect(3, 3, 10, 10, spec.dark);
        tile.rect(5, 2, 6, 12, spec.mid); tile.rect(2, 5, 12, 6, spec.mid);
        tile.rect(5, 5, 6, 6, spec.dark); tile.rect(7, 6, 2, 4, spec.accent);
        tile.pixel(6, 7, spec.base); tile.pixel(9, 8, spec.base);
    }
}

function drawCrystal(tile: PixelTile, spec: TileSpec): void {
    tile.fill(spec.base);
    if (spec.variant === 0) {
        tile.line([[7, 1], [8, 1], [5, 3], [6, 2], [9, 2], [10, 3], [4, 5], [11, 5], [3, 8], [12, 8], [5, 13], [10, 13], [7, 15], [8, 15]], spec.dark);
        tile.rect(5, 4, 6, 9, spec.mid); tile.rect(7, 3, 2, 10, spec.accent);
        tile.pixel(6, 5, '#e4f2ee'); tile.pixel(9, 10, spec.dark);
    } else if (spec.variant === 1) {
        tile.rect(2, 2, 12, 12, spec.dark); tile.rect(4, 4, 8, 8, spec.mid);
        tile.rect(5, 5, 6, 6, spec.accent); tile.rect(7, 4, 1, 8, '#edf8f5');
        tile.pixel(4, 4, spec.base); tile.pixel(11, 11, spec.base);
    } else {
        for (const x of [3, 7, 11]) {
            tile.rect(x, 7, 2, 8, spec.dark);
            tile.pixel(x + 1, 5, spec.mid); tile.pixel(x + 1, 6, spec.accent);
        }
        tile.rect(2, 13, 12, 2, spec.mid);
    }
}

function drawItem(tile: PixelTile, spec: TileSpec): void {
    tile.fill('#00000000');
    const v = spec.variant;
    if (v === 0) {
        tile.line([[7, 1], [8, 1], [5, 4], [6, 3], [9, 3], [10, 4], [4, 7], [11, 7], [5, 11], [10, 11], [7, 14], [8, 14]], spec.dark);
        tile.rect(6, 4, 4, 8, spec.mid); tile.rect(7, 4, 2, 6, spec.accent);
    } else if (v === 1) {
        for (const [x, y] of [[3, 4], [7, 2], [11, 5], [5, 8], [10, 10], [3, 12], [7, 13]]) {
            tile.pixel(x, y, spec.mid); tile.pixel(x + 1, y, spec.accent);
        }
    } else if (v === 2) {
        tile.rect(5, 2, 6, 12, spec.dark); tile.rect(3, 5, 10, 6, spec.dark);
        tile.rect(6, 3, 4, 10, spec.mid); tile.rect(4, 6, 8, 4, spec.mid);
        tile.rect(7, 6, 2, 4, spec.accent);
    } else if (v === 3) {
        tile.rect(4, 2, 8, 12, spec.dark); tile.rect(2, 5, 12, 6, spec.dark);
        tile.rect(5, 3, 6, 10, spec.mid); tile.rect(3, 6, 10, 4, spec.mid);
        tile.rect(6, 5, 4, 6, spec.accent); tile.rect(7, 6, 2, 4, '#e7f2ef');
    } else if (v === 4) {
        tile.rect(2, 6, 12, 5, spec.dark); tile.rect(4, 4, 8, 9, spec.dark);
        tile.rect(3, 7, 10, 3, spec.mid); tile.rect(5, 5, 6, 7, spec.mid);
        tile.rect(7, 6, 2, 5, spec.accent); tile.pixel(3, 6, '#9b7c57');
    } else if (v === 5) {
        tile.line([[7, 1], [8, 1], [5, 2], [10, 2], [3, 4], [12, 4], [2, 7], [13, 7], [3, 11], [12, 11], [6, 14], [9, 14]], spec.dark);
        tile.rect(5, 4, 6, 8, spec.mid); tile.rect(7, 3, 2, 10, spec.accent);
        tile.rect(6, 6, 4, 4, spec.dark);
    } else if (v === 6) {
        tile.line([[6, 1], [9, 1], [4, 3], [11, 3], [2, 6], [13, 6], [2, 9], [13, 9], [4, 12], [11, 12], [6, 14], [9, 14]], spec.dark);
        tile.rect(4, 4, 8, 8, spec.mid); tile.rect(6, 6, 4, 4, '#00000000');
        tile.pixel(5, 5, spec.accent); tile.pixel(10, 10, spec.accent);
    } else if (v === 7) {
        tile.rect(3, 3, 5, 10, spec.dark); tile.rect(9, 5, 4, 7, spec.dark);
        tile.rect(4, 4, 3, 8, spec.mid); tile.rect(10, 6, 2, 5, spec.mid);
        tile.line([[7, 6], [8, 6], [8, 7], [9, 7], [7, 9], [8, 9], [8, 10], [9, 10]], spec.accent);
    } else if (v === 8) {
        // Vaultsteel Spear: long shaft, cross guard, and pale leaf blade.
        tile.line([[3, 14], [4, 13], [5, 12], [6, 11], [7, 10], [8, 9], [9, 8], [10, 7], [11, 6]], spec.dark);
        tile.line([[4, 14], [5, 13], [6, 12], [7, 11], [8, 10], [9, 9], [10, 8], [11, 7]], spec.mid);
        tile.line([[9, 6], [10, 6], [11, 5], [12, 4], [13, 3], [13, 2], [12, 3], [11, 4], [10, 5]], spec.accent);
        tile.line([[8, 8], [10, 10]], '#6a563e');
    } else if (v === 9) {
        // Vault Crossbow: bowed limbs, central stock, trigger, and string.
        tile.line([[2, 4], [3, 3], [4, 3], [5, 4], [10, 4], [11, 3], [12, 3], [13, 4]], spec.accent);
        tile.line([[2, 5], [3, 6], [4, 7], [11, 7], [12, 6], [13, 5]], spec.dark);
        tile.rect(6, 4, 4, 5, spec.mid);
        tile.line([[8, 8], [8, 9], [7, 10], [7, 11], [6, 12], [6, 13]], spec.mid);
        tile.line([[3, 4], [4, 5], [5, 6], [6, 7], [9, 7], [10, 6], [11, 5], [12, 4]], '#d0c6ab');
        tile.pixel(9, 9, spec.accent);
    } else if (v === 10) {
        // Physical bolt: steel head, straight shaft, and two fletching vanes.
        tile.line([[3, 13], [4, 12], [5, 11], [6, 10], [7, 9], [8, 8], [9, 7], [10, 6], [11, 5], [12, 4]], spec.mid);
        tile.line([[11, 3], [12, 3], [13, 2], [13, 4], [12, 5]], spec.accent);
        tile.line([[3, 11], [4, 11], [5, 12], [4, 13], [3, 14]], spec.dark);
    } else if (v === 11) {
        // Bellbreaker Maul: broad weighted head and deliberately long handle.
        tile.rect(3, 2, 9, 5, spec.dark);
        tile.rect(4, 3, 7, 3, spec.mid);
        tile.rect(3, 4, 2, 2, spec.accent);
        tile.line([[8, 7], [8, 8], [7, 9], [7, 10], [6, 11], [6, 12], [5, 13], [5, 14]], '#5a4732');
        tile.line([[9, 7], [9, 8], [8, 9], [8, 10], [7, 11], [7, 12]], spec.mid);
    } else if (v === 12) {
        // Echo Tuning Fork: two quiet brass tines with a compact handle.
        tile.rect(4, 2, 2, 7, spec.dark);
        tile.rect(10, 2, 2, 7, spec.dark);
        tile.rect(5, 2, 1, 6, spec.accent);
        tile.rect(10, 2, 1, 6, spec.accent);
        tile.line([[5, 8], [6, 9], [7, 10], [8, 10], [9, 9], [10, 8]], spec.mid);
        tile.rect(7, 10, 2, 5, spec.dark);
        tile.rect(8, 10, 1, 4, spec.accent);
    } else {
        // Titan Hammer: cracked bell-metal head with a reinforced straight haft.
        tile.rect(2, 2, 11, 6, spec.dark);
        tile.rect(3, 3, 9, 4, spec.mid);
        tile.line([[7, 3], [7, 4], [8, 5], [7, 6]], spec.accent);
        tile.rect(7, 8, 3, 7, spec.dark);
        tile.rect(8, 8, 1, 6, '#765c39');
        tile.pixel(6, 8, spec.accent); tile.pixel(10, 8, spec.accent);
    }
}

function drawTile(tile: PixelTile, spec: TileSpec): void {
    if (spec.pattern === 'dressed_stone') drawDressedStone(tile, spec);
    else if (spec.pattern === 'offset_brick') drawOffsetBrick(tile, spec);
    else if (spec.pattern === 'carved_inset') drawCarvedInset(tile, spec);
    else if (spec.pattern === 'mosaic') drawMosaic(tile, spec);
    else if (spec.pattern === 'mechanism') drawMechanism(tile, spec);
    else if (spec.pattern === 'crystal') drawCrystal(tile, spec);
    else drawItem(tile, spec);
}

export function getResonantTilePixels(slot: number): Uint8ClampedArray {
    const spec = TILE_SPECS.find((candidate) => candidate.slot === slot);
    const tile = new PixelTile();
    if (spec) drawTile(tile, spec);
    return tile.data;
}

export function paintResonantTextureTiles(canvas: HTMLCanvasElement): void {
    const atlasCtx = canvas.getContext('2d');
    if (!atlasCtx) return;
    atlasCtx.imageSmoothingEnabled = false;
    for (const spec of TILE_SPECS) {
        const tile = document.createElement('canvas');
        tile.width = TILE_SIZE;
        tile.height = TILE_SIZE;
        const tileCtx = tile.getContext('2d');
        if (!tileCtx) continue;
        tileCtx.imageSmoothingEnabled = false;
        const imageData = tileCtx.createImageData(TILE_SIZE, TILE_SIZE);
        imageData.data.set(getResonantTilePixels(spec.slot));
        tileCtx.putImageData(imageData, 0, 0);

        const col = spec.slot % ATLAS_COLS;
        const row = Math.floor(spec.slot / ATLAS_COLS);
        const x = col * STRIDE + PADDING;
        const y = row * STRIDE + PADDING;
        atlasCtx.clearRect(col * STRIDE, row * STRIDE, STRIDE, STRIDE);
        atlasCtx.drawImage(tile, x, y);
        atlasCtx.drawImage(tile, 0, 0, 16, 1, x, y - PADDING, 16, PADDING);
        atlasCtx.drawImage(tile, 0, 15, 16, 1, x, y + 16, 16, PADDING);
        atlasCtx.drawImage(tile, 0, 0, 1, 16, x - PADDING, y, PADDING, 16);
        atlasCtx.drawImage(tile, 15, 0, 1, 16, x + 16, y, PADDING, 16);
    }
}
