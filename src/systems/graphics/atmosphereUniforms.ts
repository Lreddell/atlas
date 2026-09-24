import * as THREE from 'three';
import type { AtmosphereState } from './atmosphere';
import { TONE_CURVE_GLSL, acesToneMap, linearToSrgb, type Rgb } from './toneCurve';

// The atmosphere as shader state, shared by every material in the world.
//
// ONE sky function (atlasSkyRadiance) paints the sky dome and colours the fog,
// so a fully fogged mountain at the render-distance edge is exactly the sky
// behind it: no seam, no mismatched band at the horizon.
//
// Fog for three's built-in materials is patched globally (installAtmosphere()):
//  - fog_vertex / fog_pars_* carry the camera-to-fragment vector instead of a depth,
//  - fog_fragment becomes empty, and the fog is applied in opaque_fragment, i.e.
//    BEFORE tone mapping and the sRGB encode. Stock r160 fogs after both, which is
//    the other reason fog and sky never matched.
//  - the atmosphere uniforms are added to every ShaderLib that supports fog. Their
//    values are plain objects, which UniformsUtils.clone copies by reference, so
//    one write per frame reaches every material and program.

type V3 = { x: number; y: number; z: number };
type V4 = { x: number; y: number; z: number; w: number };
const v3 = (): V3 => ({ x: 0, y: 0, z: 0 });

export const ATMOSPHERE_UNIFORMS = {
    atlasSkyZenith: { value: v3() },
    atlasSkyHorizon: { value: v3() },
    atlasSkyHorizonSun: { value: v3() },
    atlasSunGlow: { value: v3() },
    atlasMoonGlow: { value: v3() },
    atlasSunDir: { value: { x: 0, y: 1, z: 0 } as V3 },
    atlasMoonDir: { value: { x: 0, y: -1, z: 0 } as V3 },
    atlasFogGround: { value: v3() },
    /** Light on something floating in open air (sky fill plus some key light): for motes and particles. */
    atlasSceneLight: { value: v3() },
    /** x fog start, y fog end (horizontal blocks), z haze visibility distance (blocks), w haze scale height. */
    atlasFogParams: { value: { x: 40, y: 120, z: 300, w: 56 } as V4 },
    /** The Classic style: xyz its flat fog colour as shown on screen (sRGB), w 1 when on (the old sky gradient and linear fog). */
    atlasClassicSky: { value: { x: 0, y: 0, z: 0, w: 0 } as V4 },
    /** The cloud layer's own veil: x start, y end (horizontal blocks), at the edge of the layer rather than the terrain. */
    atlasCloudFog: { value: { x: 140, y: 240 } },
    /** Camera in a fluid: x amount 0..1, y fog density per block. */
    atlasMediumParams: { value: { x: 0, y: 0.1, z: 0, w: 0 } as V4 },
    atlasMediumColor: { value: v3() },
};

/** Fog colour and density for the fluid the camera is in; amount 0 turns it off. */
export function applyMediumUniforms(amount: number, color: readonly number[], density: number): void {
    const u = ATMOSPHERE_UNIFORMS;
    u.atlasMediumParams.value.x = amount;
    u.atlasMediumParams.value.y = density;
    setV3(u.atlasMediumColor.value, color);
}

const setV3 = (target: V3, source: readonly number[]) => {
    target.x = source[0]; target.y = source[1]; target.z = source[2];
};

/** Copies one frame of atmosphere into the shared uniforms. Allocation-free. */
export function applyAtmosphereUniforms(state: AtmosphereState): void {
    const u = ATMOSPHERE_UNIFORMS;
    setV3(u.atlasSkyZenith.value, state.skyZenith);
    setV3(u.atlasSkyHorizon.value, state.skyHorizon);
    setV3(u.atlasSkyHorizonSun.value, state.skyHorizonSun);
    setV3(u.atlasSunGlow.value, state.sunGlow);
    setV3(u.atlasMoonGlow.value, state.moonGlow);
    setV3(u.atlasSunDir.value, state.sunDir);
    setV3(u.atlasMoonDir.value, state.moonDir);
    setV3(u.atlasFogGround.value, state.fogGround);
    const sceneLight = u.atlasSceneLight.value;
    sceneLight.x = state.hemiSky[0] + state.keyColor[0] * 0.35;
    sceneLight.y = state.hemiSky[1] + state.keyColor[1] * 0.35;
    sceneLight.z = state.hemiSky[2] + state.keyColor[2] * 0.35;
    const fog = u.atlasFogParams.value;
    fog.x = state.fogStart;
    fog.y = state.fogEnd;
    fog.z = state.hazeDistance;
    fog.w = state.hazeHeight;
    const classic = u.atlasClassicSky.value;
    acesToneMap(state.classicFog, classicScreen);
    classic.x = linearToSrgb(classicScreen[0]);
    classic.y = linearToSrgb(classicScreen[1]);
    classic.z = linearToSrgb(classicScreen[2]);
    classic.w = state.classic ? 1 : 0;
}

const classicScreen: Rgb = [0, 0, 0];

/** Uniform declarations plus the sky and fog functions, for any fragment shader. */
export const ATMOSPHERE_GLSL = /* glsl */`
uniform vec3 atlasSkyZenith;
uniform vec3 atlasSkyHorizon;
uniform vec3 atlasSkyHorizonSun;
uniform vec3 atlasSunGlow;
uniform vec3 atlasMoonGlow;
uniform vec3 atlasSunDir;
uniform vec3 atlasMoonDir;
uniform vec3 atlasFogGround;
uniform vec3 atlasSceneLight;
uniform vec4 atlasFogParams;
uniform vec4 atlasMediumParams;
uniform vec3 atlasMediumColor;
uniform vec4 atlasClassicSky;
uniform vec2 atlasCloudFog;
${TONE_CURVE_GLSL}

// Scene-linear sky radiance looking along a (normalised) world direction.
vec3 atlasSkyRadiance(vec3 dir) {
    if (atlasClassicSky.w > 0.5) {
        // Classic: the old two-horizon gradient, warmer toward the sun.
        vec3 classicHorizon = mix(atlasSkyHorizon, atlasSkyHorizonSun, smoothstep(-0.4, 0.8, dot(dir, atlasSunDir)));
        return mix(classicHorizon, atlasSkyZenith, sqrt(max(dir.y, 0.0)));
    }
    float up = clamp(dir.y, 0.0, 1.0);
    float cosSun = dot(dir, atlasSunDir);
    // The horizon warms toward the sun (twilight asymmetry).
    float towardSun = pow(clamp(cosSun * 0.5 + 0.5, 0.0, 1.0), 3.0);
    vec3 horizon = mix(atlasSkyHorizon, atlasSkyHorizonSun, towardSun);
    // A narrow bright band at the horizon, deep colour above it.
    float zenithMix = 1.0 - exp(-up * 8.0);
    vec3 sky = mix(horizon, atlasSkyZenith, zenithMix);
    // Mie scattering: a soft halo and a tight glow around the sun, a soft moon halo.
    float sunDot = max(cosSun, 0.0);
    sky += atlasSunGlow * (pow(sunDot, 14.0) * 0.12 + pow(sunDot, 96.0) * 0.7);
    float moonDot = max(dot(dir, atlasMoonDir), 0.0);
    sky += atlasMoonGlow * (pow(moonDot, 16.0) * 0.35 + pow(moonDot, 128.0) * 0.9);
    // Below the horizon the sky settles into a dim ground haze.
    return mix(sky, atlasFogGround, clamp(-dir.y * 3.0, 0.0, 1.0));
}

// How much of the fragment at world offset v (from the camera) is fog.
float atlasFogAmount(vec3 v) {
    // Classic: the old linear fog, by view depth, from its start distance to the edge.
    if (atlasClassicSky.w > 0.5) return smoothstep(atlasFogParams.x, atlasFogParams.y, -(viewMatrix * vec4(v, 0.0)).z);
    // Render-distance veil, by horizontal distance: terrain at the loading edge is
    // always fully sky, but anything straight overhead is not veiled. The cloud
    // layer reaches well past the terrain, so it fades at its own edge instead.
#ifdef ATLAS_FOG_CLOUDS
    float edge = smoothstep(atlasCloudFog.x, atlasCloudFog.y, length(v.xz));
#else
    float edge = smoothstep(atlasFogParams.x, atlasFogParams.y, length(v.xz));
#endif
    // Height haze on an increasing scale: 1 - exp(-(d / D)^2) keeps the near and
    // middle distance clear and closes in steeply further out. The ray's height
    // thins it (thick in valleys, thin up high, D at sea level y = 62); below sea
    // level it stops thickening: the haze is open air, not cave fog.
    float scaleHeight = atlasFogParams.w;
    float dist = length(v);
    float h0 = exp(-max(cameraPosition.y - 62.0, 0.0) / scaleHeight);
    float k = v.y / scaleHeight;
    float along = abs(k) > 1e-3 ? (1.0 - exp(-k)) / k : 1.0 - 0.5 * k;
    float depth = dist * clamp(h0 * along, 0.0, 2.0) / max(atlasFogParams.z, 1.0);
    float haze = 1.0 - exp(-depth * depth);
    return clamp(max(edge, haze), 0.0, 1.0);
}

vec3 atlasApplyFog(vec3 color, vec3 v) {
    vec3 fogged;
    if (atlasClassicSky.w > 0.5) {
        // The old renderer mixed its fog in on screen, after the tone map.
        fogged = atlasFromScreen(mix(atlasToScreen(color), atlasClassicSky.xyz, atlasFogAmount(v)));
    } else {
        fogged = mix(color, atlasSkyRadiance(normalize(v)), atlasFogAmount(v));
    }
    // With the camera in water or lava, a short dense fog of that fluid's colour.
    float medium = atlasMediumParams.x * (1.0 - exp(-length(v) * atlasMediumParams.y));
    return mix(fogged, atlasMediumColor, medium);
}
`;

let installed = false;

/**
 * Patches three's shared shader chunks and uniform libraries once, before the
 * first material compiles. Idempotent; safe to call from any module.
 */
export function installAtmosphere(): void {
    if (installed) return;
    installed = true;

    THREE.ShaderChunk.fog_pars_vertex = /* glsl */`
#ifdef USE_FOG
    varying vec3 vAtlasFogOffset;
#endif
`;
    // World-space offset from the camera: mvPosition rotated back by the view
    // matrix's (orthonormal) rotation. Works for instanced and skinned meshes too.
    THREE.ShaderChunk.fog_vertex = /* glsl */`
#ifdef USE_FOG
    vAtlasFogOffset = mvPosition.xyz * mat3( viewMatrix );
#endif
`;
    THREE.ShaderChunk.fog_pars_fragment = /* glsl */`
#ifdef USE_FOG
    varying vec3 vAtlasFogOffset;
    ${ATMOSPHERE_GLSL}
#endif
`;
    THREE.ShaderChunk.fog_fragment = '';
    const opaque = THREE.ShaderChunk.opaque_fragment;
    THREE.ShaderChunk.opaque_fragment = /* glsl */`
#ifdef USE_FOG
    outgoingLight = atlasApplyFog( outgoingLight, vAtlasFogOffset );
#endif
${opaque}`;

    for (const lib of Object.values(THREE.ShaderLib) as { uniforms?: Record<string, THREE.IUniform> }[]) {
        if (lib.uniforms && 'fogColor' in lib.uniforms) Object.assign(lib.uniforms, ATMOSPHERE_UNIFORMS);
    }
}

installAtmosphere();
