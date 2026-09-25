import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { ATMOSPHERE_GLSL, ATMOSPHERE_UNIFORMS } from '../../systems/graphics/atmosphereUniforms';
import { ambientMix } from '../../systems/graphics/ambientMix';
import type { ParticleDensity } from '../../systems/graphics/graphicsSettings';
import { getBiome } from '../../systems/world/biomes';
import { worldManager } from '../../systems/WorldManager';
import { BlockType } from '../../types';

// Ambient life in the air around the player: fireflies on warm nights, pollen
// on sunny meadows, snow in cold biomes, embers over the volcanic crags,
// polarity sparks in the Magnetic Fields and dust in the dark underground.
//
// Two point clouds (glowing and matte) of fixed size, animated entirely on the
// GPU: every particle drifts from a seeded spot and wraps around a box that
// follows the camera, so the air is always full and the CPU only updates a few
// weights a second. Each particle has a slot in 0..1; the weights decide which
// kind it is right now (or none), so a biome or the time of day changes the mix
// smoothly with no spawning. Squares, never soft blobs: the points are pixels.

const COUNTS: Record<Exclude<ParticleDensity, 'off'>, number> = { low: 110, medium: 220, high: 360 };
const BOX = new THREE.Vector3(36, 20, 36);
const SAMPLE_INTERVAL = 0.25;

const VERTEX = /* glsl */`
attribute vec4 aSeed;
attribute vec4 aRand;
uniform float uTime;
uniform vec3 uBox;
uniform vec3 uWeights;
uniform float uPixelScale;
uniform float uMaxPointSize;
varying vec3 vColor;
varying float vAlpha;
varying vec3 vOffset;

void main() {
    // Which kind this particle is right now (3 = none: the weights leave it out).
    float kind = aSeed.w < uWeights.x ? 0.0 : ( aSeed.w < uWeights.y ? 1.0 : ( aSeed.w < uWeights.z ? 2.0 : 3.0 ) );
    if ( kind > 2.5 ) {
        gl_Position = vec4( 2.0, 2.0, 2.0, 1.0 );
        gl_PointSize = 0.0;
        return;
    }
    float t = uTime;
    vec3 phase = aRand.xyz * 6.2831;
    vec3 drift;
    vec3 wiggle;
    float size;
    float alpha;
    vec3 color;
#ifdef GLOW
    if ( kind < 0.5 ) {
        // Fireflies: slow wandering, blinking yellow-green.
        drift = vec3( 0.0 );
        wiggle = vec3( sin( t * 0.31 + phase.x ) * 1.6, sin( t * 0.47 + phase.y ) * 0.7, cos( t * 0.27 + phase.z ) * 1.6 );
        size = 0.09;
        alpha = smoothstep( 0.55, 1.0, sin( t * ( 0.7 + aRand.w * 0.8 ) + phase.x ) * 0.5 + 0.5 );
        color = vec3( 0.62, 1.0, 0.16 ) * 0.9;
    } else if ( kind < 1.5 ) {
        // Embers: rising and flickering.
        drift = vec3( 0.18, 1.1 + aRand.w * 0.8, 0.1 );
        wiggle = vec3( sin( t * 1.9 + phase.x ) * 0.4, 0.0, cos( t * 1.6 + phase.z ) * 0.4 );
        size = 0.07;
        alpha = 0.6 + 0.4 * sin( t * 9.0 + phase.y );
        color = vec3( 1.7, 0.55, 0.12 );
    } else {
        // Polarity sparks: quick jittery motes, red or blue.
        drift = vec3( 0.0, 0.25, 0.0 );
        wiggle = vec3( sin( t * 3.1 + phase.x ), sin( t * 2.3 + phase.y ) * 0.6, cos( t * 2.7 + phase.z ) ) * 0.8;
        size = 0.06;
        alpha = step( 0.35, fract( t * 1.7 + aRand.w ) );
        color = aRand.w > 0.5 ? vec3( 1.45, 0.28, 0.26 ) : vec3( 0.3, 0.6, 1.5 );
    }
#else
    if ( kind < 0.5 ) {
        // Pollen: drifting on the breeze.
        drift = vec3( 0.35, 0.04, 0.22 );
        wiggle = vec3( sin( t * 0.9 + phase.x ) * 0.5, sin( t * 0.7 + phase.y ) * 0.4, cos( t * 0.8 + phase.z ) * 0.5 );
        size = 0.05;
        alpha = 0.85;
        color = vec3( 1.0, 0.94, 0.66 );
    } else if ( kind < 1.5 ) {
        // Snow: falling and swaying.
        drift = vec3( 0.2, -1.3 - aRand.w * 0.6, 0.12 );
        wiggle = vec3( sin( t * 1.1 + phase.x ) * 0.45, 0.0, cos( t * 0.9 + phase.z ) * 0.45 );
        size = 0.08;
        alpha = 0.95;
        color = vec3( 1.0 );
    } else {
        // Dust: barely moving motes.
        drift = vec3( 0.03, 0.015, 0.02 );
        wiggle = vec3( sin( t * 0.21 + phase.x ), sin( t * 0.17 + phase.y ) * 0.5, cos( t * 0.19 + phase.z ) ) * 0.6;
        size = 0.035;
        alpha = 0.5;
        color = vec3( 0.86, 0.8, 0.7 );
    }
#endif
    vec3 p = aSeed.xyz * uBox + drift * t + wiggle;
    // Wrap into the box around the camera, and fade out near its faces so a
    // particle crossing one never pops.
    vec3 rel = mod( p - cameraPosition + uBox * 0.5, uBox ) - uBox * 0.5;
    vec3 edge = abs( rel ) / ( uBox * 0.5 );
    float edgeFade = 1.0 - smoothstep( 0.7, 1.0, max( max( edge.x, edge.y ), edge.z ) );
    // Nothing drifts right into the lens.
    edgeFade *= smoothstep( 1.2, 2.6, length( rel ) );
    vec4 mvPosition = viewMatrix * vec4( cameraPosition + rel, 1.0 );
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = clamp( size * uPixelScale / max( -mvPosition.z, 0.1 ), 1.0, uMaxPointSize );
    vColor = color;
    vAlpha = alpha * edgeFade;
    vOffset = rel;
}
`;

const FRAGMENT = /* glsl */`
${ATMOSPHERE_GLSL}
varying vec3 vColor;
varying float vAlpha;
varying vec3 vOffset;

void main() {
    if ( vAlpha < 0.01 ) discard;
#ifdef GLOW
    // Self-lit and additive: the haze swallows it with distance.
    gl_FragColor = vec4( vColor * vAlpha * ( 1.0 - atlasFogAmount( vOffset, 1.0 - atlasHazeParams.z ) ), 1.0 );
#else
    gl_FragColor = vec4( atlasApplyFog( vColor * atlasSceneLight, vOffset ), vAlpha );
#endif
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
`;

function createParticleGeometry(count: number, seed: number): THREE.BufferGeometry {
    let state = seed >>> 0;
    const random = () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const seeds = new Float32Array(count * 4);
    const rands = new Float32Array(count * 4);
    for (let i = 0; i < count * 4; i++) {
        seeds[i] = random();
        rands[i] = random();
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
    geometry.setAttribute('aRand', new THREE.BufferAttribute(rands, 4));
    return geometry;
}

function createParticleMaterial(glow: boolean): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
        uniforms: {
            ...ATMOSPHERE_UNIFORMS,
            uTime: { value: 0 },
            uBox: { value: BOX },
            uWeights: { value: new THREE.Vector3() },
            uPixelScale: { value: 600 },
            uMaxPointSize: { value: 4 },
        },
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        defines: glow ? { GLOW: '' } : {},
        transparent: true,
        depthWrite: false,
        blending: glow ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
}

const smooth = (current: number, target: number, delta: number) => current + (target - current) * Math.min(1, delta * 1.5);

export const AmbientParticles = ({ density, isPaused }: { density: Exclude<ParticleDensity, 'off'>; isPaused: boolean }) => {
    const { gl, camera } = useThree();
    const count = COUNTS[density];
    const glow = useMemo(() => ({ geometry: createParticleGeometry(count, 0x5eed1), material: createParticleMaterial(true) }), [count]);
    const matte = useMemo(() => ({ geometry: createParticleGeometry(count, 0x5eed2), material: createParticleMaterial(false) }), [count]);
    useEffect(() => () => {
        glow.geometry.dispose(); glow.material.dispose();
        matte.geometry.dispose(); matte.material.dispose();
    }, [glow, matte]);

    // Target and current shares of each pool: [fireflies, embers, sparks], [pollen, snow, dust].
    const env = useRef({ age: SAMPLE_INTERVAL, glowTarget: [0, 0, 0], matteTarget: [0, 0, 0], glow: [0, 0, 0], matte: [0, 0, 0], time: 0 });
    const drawingSize = useMemo(() => new THREE.Vector2(), []);

    useFrame((_, delta) => {
        const state = env.current;
        if (!isPaused) state.time += delta;
        state.age += delta;
        if (state.age >= SAMPLE_INTERVAL) {
            state.age = 0;
            const x = Math.floor(camera.position.x), y = Math.floor(camera.position.y), z = Math.floor(camera.position.z);
            const biome = getBiome(camera.position.x, camera.position.z) as { id?: string; tags?: string[] } | undefined;
            const light = worldManager.getLight(x, y, z);
            const cell = worldManager.getBlock(x, y, z, false);
            const mix = ambientMix({
                biomeId: biome?.id ?? '',
                snowyTag: Array.isArray(biome?.tags) && biome.tags.includes('snowy'),
                skyLight: light.sky,
                blockLight: light.block,
                sunHeight: ATMOSPHERE_UNIFORMS.atlasSunDir.value.y,
                inFluid: cell === BlockType.WATER || cell === BlockType.LAVA,
            });
            state.glowTarget[0] = mix.fireflies;
            state.glowTarget[1] = mix.embers;
            state.glowTarget[2] = mix.sparks;
            state.matteTarget[0] = mix.pollen;
            state.matteTarget[1] = mix.snow;
            state.matteTarget[2] = mix.dust;
        }
        const weights = (current: number[], target: number[], uniform: THREE.Vector3) => {
            for (let i = 0; i < 3; i++) current[i] = smooth(current[i], target[i], delta);
            uniform.set(current[0], current[0] + current[1], current[0] + current[1] + current[2]);
        };
        weights(state.glow, state.glowTarget, glow.material.uniforms.uWeights.value);
        weights(state.matte, state.matteTarget, matte.material.uniforms.uWeights.value);

        // Point sizes in world units: pixels per unit at distance 1.
        gl.getDrawingBufferSize(drawingSize);
        const fov = (camera as THREE.PerspectiveCamera).fov ?? 70;
        const pixelScale = drawingSize.y / (2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2));
        // Motes stay small pixels however close they drift: at most 4px at 720p.
        const maxPointSize = Math.max(2, Math.round(4 * drawingSize.y / 720));
        for (const material of [glow.material, matte.material]) {
            material.uniforms.uTime.value = state.time;
            material.uniforms.uPixelScale.value = pixelScale;
            material.uniforms.uMaxPointSize.value = maxPointSize;
        }
    });

    return (
        <>
            <points geometry={glow.geometry} material={glow.material} frustumCulled={false} renderOrder={2} />
            <points geometry={matte.geometry} material={matte.material} frustumCulled={false} renderOrder={2} />
        </>
    );
};
