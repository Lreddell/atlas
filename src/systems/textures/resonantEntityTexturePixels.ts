import type { VaultEnemyKind } from '../entities/resonantVaultEnemies';
import type { VaultEnemyMaterialId } from '../../components/resonantVaultEnemyModels';
import type { BellTitanMaterialId } from '../../components/bellTitanModel';

export const RESONANT_ENTITY_TEXTURE_WIDTH = 48;
export const RESONANT_ENTITY_TEXTURE_HEIGHT = 32;
const REGION_SIZE = 16;
export const BELL_TITAN_TEXTURE_WIDTH = 64;
export const BELL_TITAN_TEXTURE_HEIGHT = 32;
export const bellTitanEmissiveFraction = 0.004;

export interface EntityTextureUvRect {
    u: number;
    v: number;
    width: number;
    height: number;
}

export const RESONANT_ENTITY_MATERIAL_UVS: Readonly<Record<VaultEnemyMaterialId, EntityTextureUvRect>> = {
    stone: { u: 0, v: 0.5, width: 1 / 3, height: 0.5 },
    darkStone: { u: 1 / 3, v: 0.5, width: 1 / 3, height: 0.5 },
    bronze: { u: 2 / 3, v: 0.5, width: 1 / 3, height: 0.5 },
    cloth: { u: 0, v: 0, width: 1 / 3, height: 0.5 },
    bell: { u: 1 / 3, v: 0, width: 1 / 3, height: 0.5 },
    accent: { u: 2 / 3, v: 0, width: 1 / 3, height: 0.5 },
};

export const BELL_TITAN_MATERIAL_UVS: Readonly<Record<BellTitanMaterialId, EntityTextureUvRect>> = {
    stone: { u: 0, v: 0.5, width: 0.25, height: 0.5 },
    dark_stone: { u: 0.25, v: 0.5, width: 0.25, height: 0.5 },
    bronze: { u: 0.5, v: 0.5, width: 0.25, height: 0.5 },
    worn_bronze: { u: 0.75, v: 0.5, width: 0.25, height: 0.5 },
    chain: { u: 0, v: 0, width: 0.25, height: 0.5 },
    bell: { u: 0.25, v: 0, width: 0.25, height: 0.5 },
    core: { u: 0.5, v: 0, width: 0.25, height: 0.5 },
};

type Rgb = readonly [number, number, number];
type Palette = Readonly<Record<VaultEnemyMaterialId, readonly [Rgb, Rgb, Rgb]>>;

const PALETTES: Readonly<Record<VaultEnemyKind, Palette>> = {
    vault_guard: {
        stone: [[74, 79, 75], [88, 92, 86], [104, 105, 96]],
        darkStone: [[43, 48, 46], [55, 60, 56], [69, 72, 65]],
        bronze: [[72, 76, 62], [91, 91, 67], [118, 104, 69]],
        cloth: [[55, 51, 43], [69, 62, 51], [81, 72, 56]],
        bell: [[119, 91, 48], [151, 116, 62], [177, 143, 80]],
        accent: [[48, 53, 48], [105, 96, 64], [184, 154, 91]],
    },
    vault_marksman: {
        stone: [[67, 73, 70], [80, 86, 81], [94, 97, 90]],
        darkStone: [[34, 39, 39], [46, 51, 49], [58, 61, 56]],
        bronze: [[66, 75, 64], [81, 88, 69], [105, 101, 70]],
        cloth: [[42, 48, 44], [52, 60, 54], [66, 70, 61]],
        bell: [[111, 85, 47], [143, 109, 60], [169, 136, 79]],
        accent: [[35, 43, 40], [81, 94, 80], [157, 145, 91]],
    },
    bell_hound: {
        stone: [[64, 69, 66], [80, 84, 78], [96, 96, 86]],
        darkStone: [[37, 43, 42], [49, 54, 51], [63, 65, 59]],
        bronze: [[68, 76, 62], [86, 89, 66], [110, 100, 67]],
        cloth: [[54, 48, 40], [67, 59, 48], [79, 69, 54]],
        bell: [[122, 91, 48], [158, 119, 63], [187, 150, 82]],
        accent: [[43, 48, 43], [98, 93, 63], [181, 149, 83]],
    },
    tollkeeper: {
        stone: [[70, 73, 70], [86, 88, 82], [104, 103, 94]],
        darkStone: [[38, 42, 41], [51, 55, 52], [67, 68, 62]],
        bronze: [[72, 76, 61], [94, 91, 64], [123, 103, 66]],
        cloth: [[49, 45, 40], [63, 57, 49], [77, 67, 54]],
        bell: [[128, 94, 47], [164, 121, 61], [194, 152, 81]],
        accent: [[45, 45, 39], [107, 88, 56], [190, 145, 74]],
    },
};

const MATERIAL_ORDER: readonly VaultEnemyMaterialId[] = ['stone', 'darkStone', 'bronze', 'cloth', 'bell', 'accent'];

function writePixel(data: Uint8ClampedArray, x: number, y: number, color: Rgb): void {
    const offset = (y * RESONANT_ENTITY_TEXTURE_WIDTH + x) * 4;
    data[offset] = color[0];
    data[offset + 1] = color[1];
    data[offset + 2] = color[2];
    data[offset + 3] = 255;
}

function writeTitanPixel(data: Uint8ClampedArray, x: number, y: number, color: Rgb): void {
    const offset = (y * BELL_TITAN_TEXTURE_WIDTH + x) * 4;
    data[offset] = color[0];
    data[offset + 1] = color[1];
    data[offset + 2] = color[2];
    data[offset + 3] = 255;
}

function shadeIndex(kindIndex: number, materialIndex: number, x: number, y: number): 0 | 1 | 2 {
    const hash = (x * 19 + y * 31 + kindIndex * 43 + materialIndex * 61 + ((x * y) % 17)) % 29;
    if (hash <= 2) return 0;
    if (hash >= 26) return 2;
    return 1;
}

function paintRegion(
    data: Uint8ClampedArray,
    kindIndex: number,
    materialIndex: number,
    material: VaultEnemyMaterialId,
    palette: readonly [Rgb, Rgb, Rgb],
): void {
    const regionX = (materialIndex % 3) * REGION_SIZE;
    const regionY = materialIndex < 3 ? 0 : REGION_SIZE;
    for (let localY = 0; localY < REGION_SIZE; localY += 1) {
        for (let localX = 0; localX < REGION_SIZE; localX += 1) {
            let shade = shadeIndex(kindIndex, materialIndex, localX, localY);
            if (material === 'stone' || material === 'darkStone') {
                if (localY === 7 || (localX === 5 && localY > 7) || (localX === 12 && localY < 7)) shade = 0;
            } else if (material === 'bronze' || material === 'bell') {
                if ((localX === 2 || localX === 13) && (localY === 2 || localY === 13)) shade = 2;
                if ((localX + localY + kindIndex) % 11 === 0) shade = 0;
            } else if (material === 'cloth') {
                shade = (localX + localY * 2 + kindIndex) % 7 === 0 ? 0 : shade;
            } else {
                // Functional highlights are deliberately tiny: four warm pixels in
                // one 16x16 region, or 0.26% of the complete opaque sheet.
                shade = (localX === 7 || localX === 8) && (localY === 7 || localY === 8) ? 2 : 0;
            }
            writePixel(data, regionX + localX, regionY + localY, palette[shade]);
        }
    }
}

export function getResonantEntityTexturePixels(kind: VaultEnemyKind): Uint8ClampedArray {
    const data = new Uint8ClampedArray(RESONANT_ENTITY_TEXTURE_WIDTH * RESONANT_ENTITY_TEXTURE_HEIGHT * 4);
    const palette = PALETTES[kind];
    const kindIndex = (['vault_guard', 'vault_marksman', 'bell_hound', 'tollkeeper'] as const).indexOf(kind);
    MATERIAL_ORDER.forEach((material, materialIndex) => {
        paintRegion(data, kindIndex, materialIndex, material, palette[material]);
    });
    return data;
}

export function getResonantEntityEmissivePixelFraction(kind: VaultEnemyKind): number {
    const pixels = getResonantEntityTexturePixels(kind);
    let bright = 0;
    const accentX = REGION_SIZE * 2;
    const accentY = REGION_SIZE;
    for (let y = accentY; y < accentY + REGION_SIZE; y += 1) {
        for (let x = accentX; x < accentX + REGION_SIZE; x += 1) {
            const offset = (y * RESONANT_ENTITY_TEXTURE_WIDTH + x) * 4;
            const max = Math.max(pixels[offset], pixels[offset + 1], pixels[offset + 2]);
            if (max >= 145) bright += 1;
        }
    }
    return bright / (pixels.length / 4);
}

const TITAN_MATERIAL_ORDER: readonly BellTitanMaterialId[] = [
    'stone', 'dark_stone', 'bronze', 'worn_bronze', 'chain', 'bell', 'core',
];

const TITAN_PALETTE: Readonly<Record<BellTitanMaterialId, readonly [Rgb, Rgb, Rgb]>> = {
    stone: [[57, 58, 54], [75, 75, 68], [96, 93, 82]],
    dark_stone: [[29, 31, 30], [42, 44, 41], [57, 57, 52]],
    bronze: [[79, 61, 37], [111, 82, 45], [148, 111, 59]],
    worn_bronze: [[58, 51, 39], [82, 67, 45], [112, 88, 53]],
    chain: [[24, 25, 24], [38, 37, 33], [58, 52, 42]],
    bell: [[88, 65, 34], [128, 91, 43], [168, 124, 63]],
    core: [[42, 32, 22], [104, 67, 32], [214, 153, 76]],
};

export function getBellTitanTexturePixels(): Uint8ClampedArray {
    const data = new Uint8ClampedArray(BELL_TITAN_TEXTURE_WIDTH * BELL_TITAN_TEXTURE_HEIGHT * 4);
    TITAN_MATERIAL_ORDER.forEach((material, materialIndex) => {
        const regionX = (materialIndex % 4) * REGION_SIZE;
        const regionY = materialIndex < 4 ? 0 : REGION_SIZE;
        const palette = TITAN_PALETTE[material];
        for (let localY = 0; localY < REGION_SIZE; localY += 1) {
            for (let localX = 0; localX < REGION_SIZE; localX += 1) {
                const hash = (localX * 23 + localY * 37 + materialIndex * 71 + (localX * localY) % 19) % 31;
                let shade: 0 | 1 | 2 = hash < 4 ? 0 : hash > 27 ? 2 : 1;
                if (material === 'stone' || material === 'dark_stone') {
                    if (localY === 5 || (localX === 11 && localY > 5) || (localX === 4 && localY < 5)) shade = 0;
                } else if (material === 'bronze' || material === 'worn_bronze' || material === 'bell') {
                    if ((localX + localY * 3 + materialIndex) % 13 === 0) shade = 0;
                    if ((localX === 2 || localX === 13) && localY % 5 === 0) shade = 2;
                } else if (material === 'chain') {
                    shade = (localX + localY) % 4 === 0 ? 2 : ((localX - localY + 32) % 5 === 0 ? 0 : 1);
                } else {
                    // Only the painted bell crack is bright: eight pixels on the
                    // complete opaque sheet, comfortably below the 6% limit.
                    shade = ((localX === 7 || localX === 8) && localY >= 5 && localY <= 8) ? 2 : 0;
                }
                writeTitanPixel(data, regionX + localX, regionY + localY, palette[shade]);
            }
        }
    });
    // Fill the unused eighth region with blackened backing rather than alpha.
    for (let y = REGION_SIZE; y < BELL_TITAN_TEXTURE_HEIGHT; y += 1) {
        for (let x = REGION_SIZE * 3; x < BELL_TITAN_TEXTURE_WIDTH; x += 1) {
            writeTitanPixel(data, x, y, [25, 25, 23]);
        }
    }
    return data;
}
