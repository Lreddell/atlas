// The look of the sky, fog and light over a day, as data.
//
// Pure functions of world time, the lunar event, biome blends and settings, so
// node tests can check continuity and readability without WebGL. DayNightCycle
// samples this every frame and copies the result into the shared shader
// uniforms (atmosphereUniforms.ts) and the scene's two lights.
//
// Colours are authored as sRGB hex and converted once to linear light; the
// renderer tone-maps the final image, so every value here is scene-linear.
// The daytime horizon is authored as it should look on screen (onScreen), so
// the tone map can't wash it out to grey-white.

import { onScreen } from './toneCurve';

export type Vec3 = [number, number, number];

const srgbChannelToLinear = (c: number): number =>
    c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);

/** sRGB hex (0xRRGGBB) to linear RGB, optionally scaled. */
export function linear(hex: number, scale = 1): Vec3 {
    return [
        srgbChannelToLinear(((hex >> 16) & 0xff) / 255) * scale,
        srgbChannelToLinear(((hex >> 8) & 0xff) / 255) * scale,
        srgbChannelToLinear((hex & 0xff) / 255) * scale,
    ];
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smoothstep = (edge0: number, edge1: number, x: number) => {
    const t = clamp01((x - edge0) / (edge1 - edge0));
    return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const mixVec = (out: Vec3, a: Vec3, b: Vec3, t: number): Vec3 => {
    out[0] = mix(a[0], b[0], t);
    out[1] = mix(a[1], b[1], t);
    out[2] = mix(a[2], b[2], t);
    return out;
};

export const TICKS_PER_DAY = 24000;
/** The sun's arc leans this far toward +Z (south), so noon light has a direction. */
export const SUN_ORBIT_TILT = (25 * Math.PI) / 180;
/** The axis the sun and moon turn about (normal to their tilted arc). */
export const SUN_ORBIT_AXIS: Readonly<Vec3> = [0, -Math.sin(SUN_ORBIT_TILT), Math.cos(SUN_ORBIT_TILT)];

/**
 * Sun direction for a world time. Tick 0 rises in +X, 6000 is the highest
 * point, 12000 sets in -X: the same schedule as before, on a tilted arc.
 */
export function sunDirection(ticks: number, out: Vec3 = [0, 0, 0]): Vec3 {
    const phi = ((((ticks % TICKS_PER_DAY) + TICKS_PER_DAY) % TICKS_PER_DAY) / TICKS_PER_DAY) * Math.PI * 2;
    out[0] = Math.cos(phi);
    out[1] = Math.sin(phi) * Math.cos(SUN_ORBIT_TILT);
    out[2] = Math.sin(phi) * Math.sin(SUN_ORBIT_TILT);
    return out;
}

/** One keyframe of the sky, keyed by the sun's height (sunDir.y). */
interface SkyKey {
    h: number;
    zenith: Vec3;
    horizon: Vec3;
    horizonSun: Vec3;
    sunGlow: Vec3;
    sunLight: Vec3;
    hemiSky: Vec3;
    hemiGround: Vec3;
    /** Far haze distance (blocks): the steep part of the haze, (d / haze)^2 deep. */
    haze: number;
    /** Near haze density (per block): the light, even veil that lifts the near and middle distance. */
    hazeNear: number;
    exposure: number;
}

// Luminous palette: warm key light over cool ambient; twilight skies lean coral
// on the sun side and lilac opposite; nights are moonlit navy, never black.
// Light levels are calibrated as radiance on a top face relative to its albedo
// (Lambert divides irradiance by PI): about 0.7 at noon, 0.45 in golden hour,
// 0.2 at sunset, and about 0.1 under the moon, lifted by exposure at night.
// By day the sky and ground bounce stay strong enough that a face in shadow is
// about a fifth as bright as a sunlit one: readable, never black.
const SKY_KEYS: readonly SkyKey[] = [
    {   // deep night
        h: -0.3,
        zenith: linear(0x060c1c), horizon: linear(0x101b36), horizonSun: linear(0x101b36),
        sunGlow: linear(0x000000), sunLight: linear(0x000000),
        hemiSky: linear(0x4a6aa8, 0.27), hemiGround: linear(0x1c2030, 0.08), haze: 280, hazeNear: 0.0012, exposure: 1.9,
    },
    {   // late twilight
        h: -0.12,
        zenith: linear(0x0c173a), horizon: linear(0x1c2448), horizonSun: linear(0x3a2448),
        sunGlow: linear(0x6a3048, 0.25), sunLight: linear(0x000000),
        hemiSky: linear(0x4a5896, 0.27), hemiGround: linear(0x201e2c, 0.08), haze: 260, hazeNear: 0.0015, exposure: 1.75,
    },
    {   // just after sunset
        h: -0.03,
        zenith: linear(0x1d2c62), horizon: linear(0x4b4674), horizonSun: linear(0xc0584a),
        sunGlow: linear(0xff7040, 0.9), sunLight: linear(0x000000),
        hemiSky: linear(0x6e6caa, 0.28), hemiGround: linear(0x3a2c30, 0.09), haze: 250, hazeNear: 0.0022, exposure: 1.45,
    },
    {   // sun on the horizon
        h: 0.02,
        zenith: linear(0x30498a), horizon: linear(0x8c7ca2), horizonSun: linear(0xff8e52),
        sunGlow: linear(0xffa060, 1.7), sunLight: linear(0xff9a5a, 0.4),
        hemiSky: linear(0x8a90c2, 0.42), hemiGround: linear(0x6a4c3c, 0.2), haze: 235, hazeNear: 0.0024, exposure: 1.2,
    },
    {   // golden hour
        h: 0.1,
        zenith: linear(0x2f5eb4), horizon: linear(0xa2b4da), horizonSun: linear(0xffc27e),
        sunGlow: linear(0xffd090, 1.3), sunLight: linear(0xffc58a, 0.95),
        hemiSky: linear(0x9fb6e0, 0.8), hemiGround: linear(0x735a42, 0.32), haze: 315, hazeNear: 0.0018, exposure: 1.05,
    },
    {   // morning
        h: 0.25,
        zenith: linear(0x2d6cd0), horizon: onScreen(0x9bc9ef, 1.05), horizonSun: onScreen(0xecdcc0, 1.05),
        sunGlow: linear(0xffe4bc, 0.9), sunLight: linear(0xffe2bc, 1.2),
        hemiSky: linear(0xa8c8f0, 0.95), hemiGround: linear(0x786650, 0.38), haze: 410, hazeNear: 0.0013, exposure: 1.05,
    },
    {   // full day
        h: 0.5,
        zenith: linear(0x2a70da), horizon: onScreen(0x95cdf0, 1.05), horizonSun: onScreen(0xc2e0f2, 1.05),
        sunGlow: linear(0xfff6e6, 0.8), sunLight: linear(0xfff1dc, 1.3),
        hemiSky: linear(0xb0d0f8, 1.05), hemiGround: linear(0x7c6c54, 0.42), haze: 485, hazeNear: 0.0011, exposure: 1.05,
    },
];

export interface LunarInput {
    phaseIndex: number;
    isBloodMoon: boolean;
}

export interface AtmosphereInput {
    ticks: number;
    lunar: LunarInput;
    /** 0..1: how far the camera is inside the Magnetic Fields haze. */
    magnetic: number;
    /** 0..1: the Warden's storm (boss phase intensity), thickening that haze. */
    storm: number;
    renderDistanceChunks: number;
    chunkSize: number;
}

export interface AtmosphereState {
    sunDir: Vec3;
    moonDir: Vec3;
    /** Sun height: 1 at noon (tilted), 0 at the horizon, negative at night. */
    sunHeight: number;
    /** 0 at night, 1 in daylight; eases across sunrise and sunset. */
    dayFactor: number;
    /** Peaks while the sun crosses the horizon. */
    twilight: number;
    starVisibility: number;
    moonVisibility: number;

    /** Direction TO the key light (the sun by day, the moon by night). */
    keyDir: Vec3;
    /** Key light colour with its intensity folded in (linear irradiance). */
    keyColor: Vec3;
    keyIsMoon: boolean;
    hemiSky: Vec3;
    hemiGround: Vec3;

    skyZenith: Vec3;
    skyHorizon: Vec3;
    skyHorizonSun: Vec3;
    sunGlow: Vec3;
    moonGlow: Vec3;
    /** What the sky settles into below the horizon (and far fog looking down). */
    fogGround: Vec3;
    fogStart: number;
    fogEnd: number;
    /**
     * The haze at sea level is 1 - exp(-(d * hazeNear + (d / hazeDistance)^2)):
     * a light, even veil close by (it lifts shadows and dark ground toward the
     * sky colour, which keeps the world from feeling heavy) that closes in on an
     * increasing scale with distance.
     */
    hazeDistance: number;
    /** Haze density close by (per block, at sea level): the even part of the veil. */
    hazeNear: number;
    /** Haze scale height in blocks: how fast it thins with altitude. */
    hazeHeight: number;
    exposure: number;
    /** 0..1: how much of the sun disc shows (it sinks below the horizon). */
    sunVisibility: number;
    /** The Classic style (classicAtmosphere.ts): its flat fog colour and old sky-light factor. */
    classic: boolean;
    classicFog: Vec3;
    classicSunlight: number;
}

// A charged steel-blue haze: the old Magnetic Fields fog's teal-grey, kept a
// little cooler and darker so the arena's red and blue still read through it.
const MAGNETIC_FOG_TINT = linear(0x557893);
const MAGNETIC_TINT_ZENITH = linear(0x3e5474);
const BLOOD_ZENITH = linear(0x2a0609);
const BLOOD_HORIZON = linear(0x4c0c12);
const BLOOD_GROUND = linear(0x1c0508);
const BLOOD_HEMI = linear(0x8a2c2c, 0.32);
const MOON_LIGHT = linear(0xb8c8ff);
const BLOOD_MOON_LIGHT = linear(0xff7a62);
const MOON_GLOW = linear(0x9fb2e6);
const BLOOD_MOON_GLOW = linear(0xff3a28);

export function createAtmosphereState(): AtmosphereState {
    const v = (): Vec3 => [0, 0, 0];
    return {
        sunDir: v(), moonDir: v(), sunHeight: 0, dayFactor: 0, twilight: 0, starVisibility: 0, moonVisibility: 0,
        keyDir: v(), keyColor: v(), keyIsMoon: false, hemiSky: v(), hemiGround: v(),
        skyZenith: v(), skyHorizon: v(), skyHorizonSun: v(), sunGlow: v(), moonGlow: v(), fogGround: v(),
        fogStart: 0, fogEnd: 0, hazeDistance: 1e6, hazeNear: 0, hazeHeight: 0, exposure: 1,
        sunVisibility: 0, classic: false, classicFog: v(), classicSunlight: 1,
    };
}

/** Brightness of the moon's light by phase: 0.3 at new moon, 1 at full. */
export function moonPhaseBrightness(phaseIndex: number): number {
    const fullness = 1 - Math.abs(((phaseIndex % 8) + 8) % 8 - 4) / 4;
    return 0.3 + 0.7 * fullness;
}

/**
 * Samples the atmosphere into `out` (reused every frame, no allocation).
 * Continuous in time: every term is interpolated or eased, never switched.
 */
export function sampleAtmosphere(input: AtmosphereInput, out: AtmosphereState = createAtmosphereState()): AtmosphereState {
    const sun = sunDirection(input.ticks, out.sunDir);
    out.moonDir[0] = -sun[0];
    out.moonDir[1] = -sun[1];
    out.moonDir[2] = -sun[2];
    const h = sun[1];
    out.sunHeight = h;
    out.dayFactor = smoothstep(-0.06, 0.18, h);
    out.twilight = 1 - smoothstep(0.02, 0.22, Math.abs(h - 0.02));
    out.starVisibility = 1 - smoothstep(-0.14, 0.04, h);
    out.moonVisibility = smoothstep(-0.12, 0.06, -h);
    out.sunVisibility = smoothstep(-0.08, 0.06, h);
    out.classic = false;
    out.classicSunlight = 1;

    // Interpolate the sky keys by sun height.
    let lower = SKY_KEYS[0];
    let upper = SKY_KEYS[SKY_KEYS.length - 1];
    let t = 0;
    if (h <= lower.h) {
        upper = lower;
    } else if (h >= upper.h) {
        lower = upper;
    } else {
        for (let i = 0; i < SKY_KEYS.length - 1; i++) {
            if (h >= SKY_KEYS[i].h && h <= SKY_KEYS[i + 1].h) {
                lower = SKY_KEYS[i];
                upper = SKY_KEYS[i + 1];
                t = smoothstep(lower.h, upper.h, h);
                break;
            }
        }
    }
    mixVec(out.skyZenith, lower.zenith, upper.zenith, t);
    mixVec(out.skyHorizon, lower.horizon, upper.horizon, t);
    mixVec(out.skyHorizonSun, lower.horizonSun, upper.horizonSun, t);
    mixVec(out.sunGlow, lower.sunGlow, upper.sunGlow, t);
    mixVec(out.hemiSky, lower.hemiSky, upper.hemiSky, t);
    mixVec(out.hemiGround, lower.hemiGround, upper.hemiGround, t);
    const sunLight: Vec3 = [0, 0, 0];
    mixVec(sunLight, lower.sunLight, upper.sunLight, t);
    let haze = mix(lower.haze, upper.haze, t);
    let hazeNear = mix(lower.hazeNear, upper.hazeNear, t);
    out.exposure = mix(lower.exposure, upper.exposure, t);

    // The moon: its light scales with phase and height; a blood moon burns red.
    const lunar = input.lunar;
    const moonHeight = Math.max(0, -h);
    const moonStrength = moonPhaseBrightness(lunar.phaseIndex) * smoothstep(0.0, 0.25, moonHeight) * out.moonVisibility;
    const moonLight: Vec3 = lunar.isBloodMoon
        ? [BLOOD_MOON_LIGHT[0] * 0.2, BLOOD_MOON_LIGHT[1] * 0.2, BLOOD_MOON_LIGHT[2] * 0.2]
        : [MOON_LIGHT[0] * 0.16, MOON_LIGHT[1] * 0.16, MOON_LIGHT[2] * 0.16];
    // A blood moon is always full; otherwise the halo follows the lit fraction
    // (a new moon has almost none).
    const fullness = lunar.isBloodMoon ? 1 : 1 - Math.abs((((lunar.phaseIndex % 8) + 8) % 8) - 4) / 4;
    const glowSource = lunar.isBloodMoon ? BLOOD_MOON_GLOW : MOON_GLOW;
    const glowScale = (lunar.isBloodMoon ? 0.2 : 0.4) * out.moonVisibility * Math.pow(fullness, 1.5);
    out.moonGlow[0] = glowSource[0] * glowScale;
    out.moonGlow[1] = glowSource[1] * glowScale;
    out.moonGlow[2] = glowSource[2] * glowScale;

    // One key light: the sun while it is up, the moon otherwise. The swap happens
    // while both are near zero (sun just below the horizon), so it never pops.
    out.keyIsMoon = h < -0.02;
    if (out.keyIsMoon) {
        out.keyDir[0] = out.moonDir[0]; out.keyDir[1] = out.moonDir[1]; out.keyDir[2] = out.moonDir[2];
        out.keyColor[0] = moonLight[0] * moonStrength;
        out.keyColor[1] = moonLight[1] * moonStrength;
        out.keyColor[2] = moonLight[2] * moonStrength;
    } else {
        out.keyDir[0] = sun[0]; out.keyDir[1] = sun[1]; out.keyDir[2] = sun[2];
        const rise = smoothstep(-0.02, 0.04, h);
        out.keyColor[0] = sunLight[0] * rise;
        out.keyColor[1] = sunLight[1] * rise;
        out.keyColor[2] = sunLight[2] * rise;
    }

    // Below the horizon the sky settles into a darker version of the horizon.
    out.fogGround[0] = out.skyHorizon[0] * 0.62;
    out.fogGround[1] = out.skyHorizon[1] * 0.62;
    out.fogGround[2] = out.skyHorizon[2] * 0.66;

    // Blood moon: wine zenith, crimson horizon, red-brown fog and a red ambient,
    // strongest once the red moon has risen.
    if (lunar.isBloodMoon) {
        const blood = out.moonVisibility * (1 - out.dayFactor);
        mixVec(out.skyZenith, out.skyZenith, BLOOD_ZENITH, blood * 0.75);
        mixVec(out.skyHorizon, out.skyHorizon, BLOOD_HORIZON, blood * 0.85);
        mixVec(out.skyHorizonSun, out.skyHorizonSun, BLOOD_HORIZON, blood * 0.6);
        mixVec(out.fogGround, out.fogGround, BLOOD_GROUND, blood * 0.85);
        mixVec(out.hemiSky, out.hemiSky, BLOOD_HEMI, blood * 0.8);
        haze *= 1 - 0.3 * blood;
        hazeNear += 0.0006 * blood;
    }

    // The Magnetic Fields are hazy and charged: a thick steel-blue haze (close to
    // the original biome fog) that still leaves the arena readable, closing in
    // with the Warden's storm.
    const mag = clamp01(input.magnetic);
    if (mag > 0) {
        mixVec(out.skyHorizon, out.skyHorizon, MAGNETIC_FOG_TINT, mag * 0.7);
        mixVec(out.skyHorizonSun, out.skyHorizonSun, MAGNETIC_FOG_TINT, mag * 0.55);
        mixVec(out.skyZenith, out.skyZenith, MAGNETIC_TINT_ZENITH, mag * 0.35);
        mixVec(out.fogGround, out.fogGround, MAGNETIC_FOG_TINT, mag * 0.75);
        haze = mix(haze, mix(50, 26, clamp01(input.storm)), mag);
    }

    // The render-distance veil only covers the last stretch before the loading
    // edge; atmospheric depth nearer in comes from the haze.
    const edge = input.renderDistanceChunks * input.chunkSize;
    out.fogEnd = Math.max(24, edge - 4);
    out.fogStart = Math.max(16, Math.min(out.fogEnd - 12, edge * 0.8));
    out.hazeDistance = haze;
    out.hazeNear = hazeNear;
    // Open-air haze thins with altitude; the Magnetic Fields haze fills the
    // biome at any height (its arena stands high), as the old biome fog did.
    out.hazeHeight = mix(56, 4000, mag);
    return out;
}
