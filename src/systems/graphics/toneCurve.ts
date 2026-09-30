// The game's tone curve (three's ACES, Stephen Hill's fit) and its exact
// inverse, for authoring colours by how they should look on screen.

export type Rgb = [number, number, number];

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export const srgbToLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
export const linearToSrgb = (c: number): number => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

type Mat3 = [[number, number, number], [number, number, number], [number, number, number]];
// screen = clamp(OUT * fit(IN * c / 0.6))
const ACES_IN: Mat3 = [[0.59719, 0.35458, 0.04823], [0.07600, 0.90834, 0.01566], [0.02840, 0.13383, 0.83777]];
const ACES_OUT: Mat3 = [[1.60475, -0.53108, -0.07367], [-0.10208, 1.10813, -0.00605], [-0.00327, -0.07276, 1.07602]];

function invert(m: Mat3): Mat3 {
    const [[a, b, c], [d, e, f], [g, h, i]] = m;
    const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
    const det = a * A + b * B + c * C;
    return [
        [A / det, -(b * i - c * h) / det, (b * f - c * e) / det],
        [B / det, (a * i - c * g) / det, -(a * f - c * d) / det],
        [C / det, -(a * h - b * g) / det, (a * e - b * d) / det],
    ];
}
const ACES_IN_INV = invert(ACES_IN);
const ACES_OUT_INV = invert(ACES_OUT);

const mul = (m: Mat3, x: number, y: number, z: number, out: Rgb): Rgb => {
    out[0] = m[0][0] * x + m[0][1] * y + m[0][2] * z;
    out[1] = m[1][0] * x + m[1][1] * y + m[1][2] * z;
    out[2] = m[2][0] * x + m[2][1] * y + m[2][2] * z;
    return out;
};
const fit = (v: number) => (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.4329510) + 0.238081);
/** Solves fit(v) = y for v (the positive root). */
const fitInverse = (y: number) => {
    const a = 1 - 0.983729 * y;
    const b = 0.0245786 - 0.4329510 * y;
    const c = -(0.000090537 + 0.238081 * y);
    return (-b + Math.sqrt(Math.max(0, b * b - 4 * a * c))) / (2 * a);
};

const scratch: Rgb = [0, 0, 0];

/** three's ACES tone map at exposure 1: scene-linear in, linear screen colour (0..1) out. */
export function acesToneMap(color: Readonly<Rgb>, out: Rgb = [0, 0, 0]): Rgb {
    mul(ACES_IN, color[0] / 0.6, color[1] / 0.6, color[2] / 0.6, scratch);
    const r = fit(scratch[0]), g = fit(scratch[1]), b = fit(scratch[2]);
    mul(ACES_OUT, r, g, b, out);
    out[0] = clamp01(out[0]); out[1] = clamp01(out[1]); out[2] = clamp01(out[2]);
    return out;
}

/** The scene-linear colour that ACES maps to `screen` (linear, 0..1): acesToneMap's inverse. */
export function inverseAcesToneMap(screen: Readonly<Rgb>, out: Rgb = [0, 0, 0]): Rgb {
    mul(ACES_OUT_INV, screen[0], screen[1], screen[2], scratch);
    // Just inside the curve's reach: fit() never quite gets to 1.
    const r = fitInverse(Math.min(0.995, Math.max(0, scratch[0])));
    const g = fitInverse(Math.min(0.995, Math.max(0, scratch[1])));
    const b = fitInverse(Math.min(0.995, Math.max(0, scratch[2])));
    mul(ACES_IN_INV, r, g, b, out);
    out[0] = Math.max(0, out[0] * 0.6); out[1] = Math.max(0, out[1] * 0.6); out[2] = Math.max(0, out[2] * 0.6);
    return out;
}

/**
 * The scene-linear colour that shows as sRGB `hex` on screen at `exposure`:
 * for authoring sky colours by how they should look, not by raw light.
 */
export function onScreen(hex: number, exposure = 1): Rgb {
    const out = inverseAcesToneMap([
        srgbToLinear(((hex >> 16) & 0xff) / 255),
        srgbToLinear(((hex >> 8) & 0xff) / 255),
        srgbToLinear((hex & 0xff) / 255),
    ]);
    out[0] /= exposure; out[1] /= exposure; out[2] /= exposure;
    return out;
}

const glslMat3 = (m: Mat3): string =>
    `mat3( vec3( ${m[0][0]}, ${m[1][0]}, ${m[2][0]} ), vec3( ${m[0][1]}, ${m[1][1]}, ${m[2][1]} ), vec3( ${m[0][2]}, ${m[1][2]}, ${m[2][2]} ) )`;

/**
 * The tone curve in GLSL, both ways (exposure 1): atlasToScreen takes scene
 * light to the sRGB screen colour, atlasFromScreen undoes it. The Classic fog
 * mixes on screen, as the old renderer did, then goes back to scene light.
 */
export const TONE_CURVE_GLSL = /* glsl */`
vec3 atlasAcesFit( vec3 v ) {
    return ( v * ( v + 0.0245786 ) - 0.000090537 ) / ( v * ( 0.983729 * v + 0.4329510 ) + 0.238081 );
}
vec3 atlasAcesFitInverse( vec3 y ) {
    y = clamp( y, 0.0, 0.995 );
    vec3 a = 1.0 - 0.983729 * y;
    vec3 b = 0.0245786 - 0.4329510 * y;
    vec3 c = -( 0.000090537 + 0.238081 * y );
    return ( -b + sqrt( max( b * b - 4.0 * a * c, 0.0 ) ) ) / ( 2.0 * a );
}
vec3 atlasToScreen( vec3 color ) {
    vec3 screen = clamp( ${glslMat3(ACES_OUT)} * atlasAcesFit( ${glslMat3(ACES_IN)} * ( color / 0.6 ) ), 0.0, 1.0 );
    return mix( screen * 12.92, 1.055 * pow( screen, vec3( 1.0 / 2.4 ) ) - 0.055, step( 0.0031308, screen ) );
}
vec3 atlasFromScreen( vec3 srgb ) {
    vec3 screen = mix( srgb / 12.92, pow( ( srgb + 0.055 ) / 1.055, vec3( 2.4 ) ), step( 0.04045, srgb ) );
    return max( ${glslMat3(ACES_IN_INV)} * atlasAcesFitInverse( ${glslMat3(ACES_OUT_INV)} * screen ) * 0.6, 0.0 );
}
`;
