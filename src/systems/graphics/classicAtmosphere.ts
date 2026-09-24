import type { AtmosphereState, Vec3 } from './atmosphere';
import { acesToneMap, inverseAcesToneMap, srgbToLinear } from './toneCurve';

export { acesToneMap, inverseAcesToneMap };

// The Classic visual style: the sky, fog and light of the renderer as it was
// before the overhaul, reproduced inside the new one.
//
// The old day/night cycle is replayed as it was written (the same colours,
// breakpoints, lunar tints and Magnetic Fields fog), then translated into the
// new pipeline's scene-linear values. The old renderer drew its sky dome and
// fog outside the tone map (the dome wrote linear colours straight to the
// screen, the fog was mixed in after the sRGB encode), so each colour is taken
// back through an exact inverse of three's ACES curve: what reaches the screen
// is what the old game showed.

/** The axis the old sun and moon turn about: their arc runs east, overhead, west. */
export const CLASSIC_ORBIT_AXIS: Readonly<Vec3> = [0, 0, 1];

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
/** THREE.MathUtils.smoothstep(x, min, max). */
const smoothstep = (x: number, min: number, max: number) => {
    if (x <= min) return 0;
    if (x >= max) return 1;
    const t = (x - min) / (max - min);
    return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const colourCache = new Map<string | number, Vec3>();

/** A '#rrggbb' or 0xrrggbb colour as THREE.Color stores it (linear). Cached: read-only. */
function colour(hex: string | number): Readonly<Vec3> {
    const cached = colourCache.get(hex);
    if (cached) return cached;
    const value = typeof hex === 'number' ? hex : parseInt(hex.replace('#', ''), 16) || 0;
    const result: Vec3 = [
        srgbToLinear(((value >> 16) & 0xff) / 255),
        srgbToLinear(((value >> 8) & 0xff) / 255),
        srgbToLinear((value & 0xff) / 255),
    ];
    colourCache.set(hex, result);
    return result;
}

const set = (out: Vec3, v: Readonly<Vec3>): Vec3 => { out[0] = v[0]; out[1] = v[1]; out[2] = v[2]; return out; };
const mixInto = (out: Vec3, a: Readonly<Vec3>, b: Readonly<Vec3>, t: number): Vec3 => {
    out[0] = lerp(a[0], b[0], t); out[1] = lerp(a[1], b[1], t); out[2] = lerp(a[2], b[2], t);
    return out;
};

const decoded: Vec3 = [0, 0, 0];

/** An old sky-dome colour: its linear values went to the screen as if they were sRGB. */
function domeToScene(value: Readonly<Vec3>, out: Vec3): Vec3 {
    decoded[0] = srgbToLinear(clamp01(value[0]));
    decoded[1] = srgbToLinear(clamp01(value[1]));
    decoded[2] = srgbToLinear(clamp01(value[2]));
    return inverseAcesToneMap(decoded, out);
}

/** An old fog colour: mixed in after the sRGB encode, so the screen showed the colour itself. */
const fogToScene = (value: Readonly<Vec3>, out: Vec3): Vec3 => inverseAcesToneMap(value, out);

// The old palette (DayNightCycle before the overhaul).
const NIGHT_ZENITH = colour(0x000005);
const NIGHT_HORIZON = colour(0x080815);
const DAY_ZENITH = colour(0x4a90e2);
const DAY_HORIZON = colour(0x87ceeb);
const SUNSET_ZENITH = colour(0x2c3e50);
const SUNSET_HORIZON_SUN = colour(0xff6b35);
const SUNSET_HORIZON_MOON = colour(0x0d0d26);
const MAGNETIC_FOG_TINT = colour(0x2a2238);
const WHITE: Vec3 = [1, 1, 1];

export interface ClassicLunarInput {
    phaseIndex: number;
    isBloodMoon: boolean;
    skyTintHex: string;
    fogTintHex: string;
    moonLightHex: string;
    ambientLightHex: string;
    nightBrightnessMultiplier: number;
    moonLightMultiplier: number;
}

export interface ClassicAtmosphereInput {
    ticks: number;
    lunar: ClassicLunarInput;
    magnetic: number;
    storm: number;
    renderDistanceChunks: number;
    chunkSize: number;
}

const zenith: Vec3 = [0, 0, 0];
const horizonSun: Vec3 = [0, 0, 0];
const horizonMoon: Vec3 = [0, 0, 0];
const fog: Vec3 = [0, 0, 0];
const tint: Vec3 = [0, 0, 0];

export function sampleClassicAtmosphere(input: ClassicAtmosphereInput, out: AtmosphereState): AtmosphereState {
    const ticks = ((input.ticks % 24000) + 24000) % 24000;
    const phi = (ticks / 24000) * Math.PI * 2;
    // The old orbit: +X at sunrise, straight overhead at noon, no tilt.
    out.sunDir[0] = Math.cos(phi); out.sunDir[1] = Math.sin(phi); out.sunDir[2] = 0;
    out.moonDir[0] = -out.sunDir[0]; out.moonDir[1] = -out.sunDir[1]; out.moonDir[2] = 0;
    const h = out.sunDir[1];
    out.sunHeight = h;

    const dayFactor = smoothstep(h, -0.05, 0.2);
    const nightFactor = 1 - dayFactor;
    const moonVisibility = smoothstep(-h, -0.2, 0.1);
    const lunar = input.lunar;
    const phaseBrightness = (1 - Math.abs(lunar.phaseIndex - 4) / 4) * 0.72;
    const phaseIntensity = (0.63 + 0.2 * phaseBrightness) * lunar.nightBrightnessMultiplier;
    out.dayFactor = dayFactor;
    out.twilight = 1 - smoothstep(Math.abs(h), 0, 0.2);
    out.sunVisibility = smoothstep(h, -0.08, 0.08);
    out.starVisibility = 1 - out.sunVisibility;
    out.moonVisibility = moonVisibility;

    // --- Sky and fog colours, exactly as the old day/night cycle picked them.
    if (h > 0.4) {
        set(zenith, DAY_ZENITH); set(horizonSun, DAY_HORIZON); set(horizonMoon, DAY_HORIZON); set(fog, DAY_HORIZON);
    } else if (h > -0.05) {
        const t = 1 - (h + 0.05) / 0.45;
        mixInto(zenith, DAY_ZENITH, SUNSET_ZENITH, t);
        mixInto(horizonSun, DAY_HORIZON, SUNSET_HORIZON_SUN, t);
        mixInto(horizonMoon, DAY_HORIZON, SUNSET_HORIZON_MOON, t);
        mixInto(fog, DAY_HORIZON, SUNSET_HORIZON_MOON, t * 0.8);
        if (t > 0.8) {
            const night = (t - 0.8) / 0.2;
            mixInto(zenith, zenith, NIGHT_ZENITH, night);
            mixInto(horizonSun, horizonSun, NIGHT_HORIZON, night);
            mixInto(horizonMoon, horizonMoon, NIGHT_HORIZON, night);
            mixInto(fog, fog, NIGHT_HORIZON, night);
        }
    } else {
        set(zenith, NIGHT_ZENITH); set(horizonSun, NIGHT_HORIZON); set(horizonMoon, NIGHT_HORIZON); set(fog, NIGHT_HORIZON);
    }
    const bloodBlend = lunar.isBloodMoon ? moonVisibility * smoothstep(1 - dayFactor, 0.08, 0.9) : 0;
    if (bloodBlend > 0) {
        const skyTint = set(tint, colour(lunar.skyTintHex));
        const fogTint = colour(lunar.fogTintHex);
        mixInto(zenith, zenith, skyTint, bloodBlend * 0.34);
        mixInto(horizonSun, horizonSun, fogTint, bloodBlend * 0.12);
        mixInto(horizonMoon, horizonMoon, skyTint, bloodBlend * 0.48);
        mixInto(fog, fog, fogTint, bloodBlend * 0.3);
    }
    const mag = clamp01(input.magnetic);
    const storm = clamp01(input.storm);
    if (mag > 0.001) mixInto(fog, fog, MAGNETIC_FOG_TINT, mag * (0.5 + 0.5 * storm));

    domeToScene(zenith, out.skyZenith);
    domeToScene(horizonSun, out.skyHorizonSun);
    domeToScene(horizonMoon, out.skyHorizon);
    fogToScene(fog, out.classicFog);
    set(out.fogGround, out.skyHorizon);
    out.sunGlow[0] = out.sunGlow[1] = out.sunGlow[2] = 0;
    out.moonGlow[0] = out.moonGlow[1] = out.moonGlow[2] = 0;

    // --- Linear fog from 30% of the render distance to its edge; the Magnetic
    //     Fields pulled it in hard, and the Warden's storm harder still.
    const edge = input.renderDistanceChunks * input.chunkSize;
    let near = Math.max(30, edge * 0.3);
    let far = edge - 5;
    if (mag > 0.001) {
        near = lerp(near, 12 - 8 * storm, mag);
        far = lerp(far, Math.max(16, far * (0.45 - 0.3 * storm)), mag);
    }
    out.fogStart = Math.max(0, Math.min(near, far - 1));
    out.fogEnd = far;
    out.hazeDistance = 1e6;
    out.hazeNear = 0;
    out.hazeHeight = 56;
    out.exposure = 1;

    // --- Light: a white sun and a phase-dimmed moon (one key light, whichever
    //     is stronger), a flat ambient, and the old sky-light factor.
    const sunIntensity = Math.max(0, Math.sin(phi)) * 0.8 * dayFactor;
    const moonIntensity = 0.5 * phaseBrightness * lunar.moonLightMultiplier * nightFactor;
    out.keyIsMoon = moonIntensity > sunIntensity;
    if (out.keyIsMoon) {
        set(out.keyDir, out.moonDir);
        const moon = colour(lunar.moonLightHex);
        out.keyColor[0] = moon[0] * moonIntensity; out.keyColor[1] = moon[1] * moonIntensity; out.keyColor[2] = moon[2] * moonIntensity;
    } else {
        set(out.keyDir, out.sunDir);
        out.keyColor[0] = out.keyColor[1] = out.keyColor[2] = sunIntensity;
    }
    const nightAmbient = (0.2 + 0.1 * phaseBrightness) * lunar.nightBrightnessMultiplier;
    const ambient = lerp(nightAmbient, 0.6, dayFactor);
    mixInto(tint, colour(lunar.ambientLightHex), WHITE, dayFactor);
    out.hemiSky[0] = tint[0] * ambient; out.hemiSky[1] = tint[1] * ambient; out.hemiSky[2] = tint[2] * ambient;
    set(out.hemiGround, out.hemiSky);
    out.classicSunlight = lerp(phaseIntensity, 1, dayFactor);
    out.classic = true;
    return out;
}
