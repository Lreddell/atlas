import * as THREE from 'three';
import { getPixelationResolution, PIXELATION_CHANGE_EVENT } from './pixelation';

export type RetroEffectKey = 'vertexJitter' | 'textureWarp' | 'dithering' | 'affineMapping';

export interface RetroEffectsSettings {
    vertexJitter: boolean;
    textureWarp: boolean;
    dithering: boolean;
    affineMapping: boolean;
}

const STORAGE_KEYS: Record<RetroEffectKey, string> = {
    vertexJitter: 'atlas.settings.ps1VertexJitter',
    textureWarp: 'atlas.settings.ps1TextureWarp',
    dithering: 'atlas.settings.ps1Dithering',
    affineMapping: 'atlas.settings.ps1AffineMapping',
};

export const RETRO_EFFECT_CHANGE_EVENT = 'atlas:retro-effects-change';

const uniformVertexJitter = { value: 0 };
const uniformTextureWarp = { value: 0 };
const uniformDithering = { value: 0 };
const uniformAffineMapping = { value: 0 };
const uniformVirtualResolution = { value: new THREE.Vector2(320, 240) };

const readBoolean = (key: string, fallback = false) => {
    if (typeof window === 'undefined') return fallback;
    const raw = window.localStorage.getItem(key);
    return raw == null ? fallback : raw === 'true';
};

export const getRetroEffectsSettings = (): RetroEffectsSettings => ({
    vertexJitter: readBoolean(STORAGE_KEYS.vertexJitter),
    textureWarp: readBoolean(STORAGE_KEYS.textureWarp),
    dithering: readBoolean(STORAGE_KEYS.dithering),
    affineMapping: readBoolean(STORAGE_KEYS.affineMapping),
});

const updateVirtualResolution = () => {
    const height = getPixelationResolution();
    const aspect = typeof window === 'undefined' || window.innerHeight <= 0
        ? 4 / 3
        : window.innerWidth / window.innerHeight;
    uniformVirtualResolution.value.set(Math.max(1, Math.round(height * aspect)), height);
};

const syncUniforms = () => {
    const settings = getRetroEffectsSettings();
    uniformVertexJitter.value = settings.vertexJitter ? 1 : 0;
    uniformTextureWarp.value = settings.textureWarp ? 1 : 0;
    uniformDithering.value = settings.dithering ? 1 : 0;
    uniformAffineMapping.value = settings.affineMapping ? 1 : 0;
    updateVirtualResolution();
};

const dispatchChange = () => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent(RETRO_EFFECT_CHANGE_EVENT, {
        detail: getRetroEffectsSettings(),
    }));
};

export const setRetroEffect = (key: RetroEffectKey, enabled: boolean) => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEYS[key], String(enabled));
    syncUniforms();
    dispatchChange();
};

type RetroShader = {
    uniforms: Record<string, { value: unknown }>;
    vertexShader: string;
    fragmentShader: string;
};

type BeforeCompileHook = (shader: RetroShader, renderer: THREE.WebGLRenderer) => void;

type HookedMaterial = THREE.Material & {
    [customHookSymbol]?: BeforeCompileHook;
    [wrappedHookSymbol]?: BeforeCompileHook;
};

const customHookSymbol = Symbol('atlasRetroCustomBeforeCompile');
const wrappedHookSymbol = Symbol('atlasRetroWrappedBeforeCompile');

const VERTEX_HEADER = `
uniform float uAtlasRetroVertexJitter;
uniform vec2 uAtlasRetroVirtualResolution;
#ifdef USE_MAP
varying vec2 vAtlasRetroAffineUv;
#endif
`;

const VERTEX_PROJECT_PATCH = `
#include <project_vertex>

#ifdef USE_MAP
    // Perspective-correct varyings divide by clip W during rasterization. Multiplying
    // by W here lets the fragment stage recover a linear/affine UV interpolation.
    vAtlasRetroAffineUv = vMapUv * gl_Position.w;
#endif

if (uAtlasRetroVertexJitter > 0.5) {
    // PS1-style integer screen coordinates: snap projected vertices to a low-res
    // pixel grid, then put them back into clip space. This produces geometry wobble
    // as the camera moves instead of moving the final image as one flat layer.
    vec2 safeResolution = max(uAtlasRetroVirtualResolution, vec2(1.0));
    vec2 ndc = gl_Position.xy / gl_Position.w;
    vec2 pixel = (ndc * 0.5 + 0.5) * safeResolution;
    pixel = floor(pixel + 0.5);
    ndc = (pixel / safeResolution - 0.5) * 2.0;
    gl_Position.xy = ndc * gl_Position.w;
}
`;

const FRAGMENT_HEADER = `
uniform float uAtlasRetroTextureWarp;
uniform float uAtlasRetroDithering;
uniform float uAtlasRetroAffineMapping;
#ifdef USE_MAP
varying vec2 vAtlasRetroAffineUv;
#endif

vec2 atlasRetroMapUv(vec2 perspectiveUv) {
    vec2 uv = perspectiveUv;
#ifdef USE_MAP
    if (uAtlasRetroAffineMapping > 0.5) {
        // gl_FragCoord.w is the interpolated reciprocal clip W. Paired with the
        // W-weighted vertex varying above, this reconstructs affine UVs rather than
        // modern perspective-correct interpolation.
        uv = vAtlasRetroAffineUv * gl_FragCoord.w;
    }
#endif

    if (uAtlasRetroTextureWarp > 0.5) {
        // Emulate low-precision texture coordinates. The tiny screen-cell offset is
        // stable while standing still but crawls as geometry crosses raster pixels,
        // producing the characteristic texture swim without a generic sine-wave warp.
        uv = floor(uv * 1024.0 + 0.5) / 1024.0;
        vec2 cell = floor(gl_FragCoord.xy * 0.5);
        float crawl = mod(cell.x + cell.y, 2.0) - 0.5;
        uv += vec2(crawl / 2048.0, -crawl / 2048.0);
    }

    return uv;
}

float atlasRetroBayer4(vec2 fragCoord) {
    vec2 p = mod(floor(fragCoord), 4.0);
    float x = p.x;
    float y = p.y;

    if (y < 1.0) {
        if (x < 1.0) return 0.0 / 16.0;
        if (x < 2.0) return 8.0 / 16.0;
        if (x < 3.0) return 2.0 / 16.0;
        return 10.0 / 16.0;
    }
    if (y < 2.0) {
        if (x < 1.0) return 12.0 / 16.0;
        if (x < 2.0) return 4.0 / 16.0;
        if (x < 3.0) return 14.0 / 16.0;
        return 6.0 / 16.0;
    }
    if (y < 3.0) {
        if (x < 1.0) return 3.0 / 16.0;
        if (x < 2.0) return 11.0 / 16.0;
        if (x < 3.0) return 1.0 / 16.0;
        return 9.0 / 16.0;
    }

    if (x < 1.0) return 15.0 / 16.0;
    if (x < 2.0) return 7.0 / 16.0;
    if (x < 3.0) return 13.0 / 16.0;
    return 5.0 / 16.0;
}
`;

const DITHER_PATCH = `
#include <colorspace_fragment>
if (uAtlasRetroDithering > 0.5) {
    // Quantize to 5 bits per RGB channel (15-bit colour) using a 4x4 ordered
    // threshold. The pattern is tied to screen pixels like the console output.
    vec3 rgb5 = clamp(gl_FragColor.rgb, 0.0, 1.0) * 31.0;
    float threshold = atlasRetroBayer4(gl_FragCoord.xy);
    gl_FragColor.rgb = floor(rgb5 + threshold) / 31.0;
}
`;

export const applyRetroShaderPatch = (shader: RetroShader) => {
    if (shader.vertexShader.includes('uAtlasRetroVertexJitter')) return;

    shader.uniforms.uAtlasRetroVertexJitter = uniformVertexJitter;
    shader.uniforms.uAtlasRetroTextureWarp = uniformTextureWarp;
    shader.uniforms.uAtlasRetroDithering = uniformDithering;
    shader.uniforms.uAtlasRetroAffineMapping = uniformAffineMapping;
    shader.uniforms.uAtlasRetroVirtualResolution = uniformVirtualResolution;

    shader.vertexShader = VERTEX_HEADER + shader.vertexShader;
    if (shader.vertexShader.includes('#include <project_vertex>')) {
        shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', VERTEX_PROJECT_PATCH);
    }

    shader.fragmentShader = FRAGMENT_HEADER + shader.fragmentShader;

    // Three r160's built-in materials use texture2D here. Keep the texture() form
    // as well so the patch remains valid if a GLSL3 material is introduced later.
    shader.fragmentShader = shader.fragmentShader.replace(
        /texture2D\s*\(\s*map\s*,\s*vMapUv\s*\)/g,
        'texture2D( map, atlasRetroMapUv( vMapUv ) )',
    );
    shader.fragmentShader = shader.fragmentShader.replace(
        /texture\s*\(\s*map\s*,\s*vMapUv\s*\)/g,
        'texture( map, atlasRetroMapUv( vMapUv ) )',
    );

    if (shader.fragmentShader.includes('#include <colorspace_fragment>')) {
        shader.fragmentShader = shader.fragmentShader.replace('#include <colorspace_fragment>', DITHER_PATCH);
    }
};

let materialHookInstalled = false;

const installMaterialHook = () => {
    if (materialHookInstalled) return;
    materialHookInstalled = true;

    const prototype = THREE.Material.prototype as THREE.Material & { onBeforeCompile: BeforeCompileHook };
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'onBeforeCompile');
    const originalHook = typeof descriptor?.value === 'function'
        ? descriptor.value as BeforeCompileHook
        : (() => {});

    Object.defineProperty(prototype, 'onBeforeCompile', {
        configurable: true,
        get(this: HookedMaterial) {
            if (!this[wrappedHookSymbol]) {
                const customHook = this[customHookSymbol] ?? originalHook;
                this[wrappedHookSymbol] = (shader, renderer) => {
                    customHook.call(this, shader, renderer);
                    applyRetroShaderPatch(shader);
                };
            }
            return this[wrappedHookSymbol];
        },
        set(this: HookedMaterial, hook: BeforeCompileHook) {
            this[customHookSymbol] = hook;
            this[wrappedHookSymbol] = undefined;
        },
    });
};

// This module is imported before App. Installing at module evaluation time means
// materials created at module scope (including shared chunk materials) have their
// custom onBeforeCompile hooks chained through the retro patch rather than replacing it.
installMaterialHook();

let initialized = false;

export const initializeRetroEffects = () => {
    if (typeof window === 'undefined' || initialized) return;
    initialized = true;
    syncUniforms();

    window.addEventListener('storage', (event) => {
        if (!Object.values(STORAGE_KEYS).includes(event.key ?? '')) return;
        syncUniforms();
        dispatchChange();
    });

    window.addEventListener('resize', updateVirtualResolution);
    window.addEventListener(PIXELATION_CHANGE_EVENT, updateVirtualResolution);
};
