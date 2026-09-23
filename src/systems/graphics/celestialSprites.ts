import * as THREE from 'three';

// Pixel-art sun and moon discs (32x32, nearest-filtered), drawn once in code.
// Round and hand-shaded rather than the old flat squares, so the sky reads as
// part of the pixel world. Phase textures are cached: the moon needs 8.

const SIZE = 32;

type RGBA = [number, number, number, number];

function hexToRgba(hex: number, alpha = 255): RGBA {
    return [(hex >> 16) & 0xff, (hex >> 8) & 0xff, hex & 0xff, alpha];
}

function toTexture(pixels: Uint8ClampedArray<ArrayBuffer>): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.putImageData(new ImageData(pixels, SIZE, SIZE), 0, 0);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    return texture;
}

function put(pixels: Uint8ClampedArray<ArrayBuffer>, x: number, y: number, color: RGBA): void {
    const i = (y * SIZE + x) * 4;
    pixels[i] = color[0]; pixels[i + 1] = color[1]; pixels[i + 2] = color[2]; pixels[i + 3] = color[3];
}

/** Distance of a pixel centre from the disc centre, in pixels. */
const radiusAt = (x: number, y: number) => Math.hypot(x + 0.5 - SIZE / 2, y + 0.5 - SIZE / 2);

export function createPixelSunTexture(): THREE.Texture {
    const pixels = new Uint8ClampedArray(SIZE * SIZE * 4);
    const ramp: RGBA[] = [
        hexToRgba(0xfffbe8), hexToRgba(0xfff1c2), hexToRgba(0xffe08a), hexToRgba(0xffc85c), hexToRgba(0xf5a142),
    ];
    const R = 13;
    for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
            const r = radiusAt(x, y);
            if (r > R + 0.5) continue;
            // Stepped radial shading, lit from the upper left like every Atlas tile.
            const lean = ((x - SIZE / 2) + (y - SIZE / 2)) * 0.12;
            const band = Math.min(ramp.length - 1, Math.max(0, Math.floor((r + lean) / (R / 4.2))));
            put(pixels, x, y, r > R - 1 ? ramp[4] : ramp[band]);
        }
    }
    return toTexture(pixels);
}

// Fixed crater layout (disc-relative pixel offsets and radii) so every phase
// shows the same moon face.
const CRATERS: ReadonlyArray<[number, number, number]> = [
    [-4, -5, 2.6], [5, -2, 2.0], [-6, 4, 1.6], [2, 6, 2.4], [7, 5, 1.2], [-1, -1, 1.4], [-9, -1, 1.1], [4, -8, 1.3],
];

const moonCache = new Map<string, THREE.Texture>();

/**
 * phaseIndex 0 = new, 4 = full; waxing lights the right side first. The unlit
 * part keeps a faint earthshine so the disc's silhouette stays readable.
 */
export function createPixelMoonTexture(phaseIndex: number): THREE.Texture {
    const phase = ((phaseIndex % 8) + 8) % 8;
    const cached = moonCache.get(String(phase));
    if (cached) return cached;
    const pixels = new Uint8ClampedArray(SIZE * SIZE * 4);
    const lit: RGBA[] = [hexToRgba(0xf2f5fb), hexToRgba(0xdfe5f0), hexToRgba(0xc3cbdc), hexToRgba(0xa3adc4)];
    const shadow = hexToRgba(0x1d2436, 215);
    const shadowRim = hexToRgba(0x2c3550, 225);
    const R = 12;
    const angle = (phase / 8) * Math.PI * 2;
    const c = Math.cos(angle);
    const waxing = phase > 0 && phase < 4;
    for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
            const r = radiusAt(x, y);
            if (r > R + 0.5) continue;
            const nx = (x + 0.5 - SIZE / 2) / R;
            const ny = (y + 0.5 - SIZE / 2) / R;
            const span = Math.sqrt(Math.max(0, 1 - ny * ny));
            const isLit = phase === 4 || (phase !== 0 && (waxing ? nx > c * span : nx < -c * span));
            if (!isLit) {
                put(pixels, x, y, r > R - 1 ? shadowRim : shadow);
                continue;
            }
            let tone = r > R - 1 ? 2 : (nx + ny > 0.9 ? 1 : 0);
            for (const [cx, cy, cr] of CRATERS) {
                const d = Math.hypot(x + 0.5 - SIZE / 2 - cx, y + 0.5 - SIZE / 2 - cy);
                if (d <= cr) tone = Math.max(tone, d <= cr - 1 ? 3 : 2);
            }
            put(pixels, x, y, lit[tone]);
        }
    }
    const texture = toTexture(pixels);
    moonCache.set(String(phase), texture);
    return texture;
}
