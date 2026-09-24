import React, { useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { SKY_FAR_PLANE_GLSL, SKY_NOISE_GLSL, SKY_ORDER, skyFrame } from '../../../systems/graphics/skyObjects';

// The aurora: a few curtains hanging over the northern sky (north is -Z).
//
// Each band is a sheet that stands up from a folded foot, leaning back a
// little along the field lines. It burns brightest just above its rippling
// foot, green there, going teal and then violet or red toward its faint top;
// fine rays shimmer and drift along it, and surges of brightness roll along
// the whole band. It adds light (it never darkens what is behind it), runs in
// HDR so its foot catches a soft bloom, and is drawn at the far plane: in
// front of the moon and stars, behind the clouds and everything in the world.
// DayNightCycle decides when it shows (snowy biomes, at night) and its colours.

interface Band {
    /** How far north its foot stands, how wide it runs, and its foot and top heights (world units around the camera). */
    distance: number;
    width: number;
    base: number;
    height: number;
    /** How far its folds wander toward and away from you. */
    fold: number;
    /** Turn from due east-west (radians). */
    azimuth: number;
    seed: number;
    strength: number;
    segments: number;
}

const BANDS: readonly Band[] = [
    // The main arc, low over the northern horizon.
    { distance: 360, width: 820, base: 70, height: 220, fold: 120, azimuth: 0, seed: 1.7, strength: 1, segments: 192 },
    // A fainter, farther arc behind it.
    { distance: 560, width: 920, base: 40, height: 150, fold: 90, azimuth: 0.14, seed: 4.3, strength: 0.55, segments: 160 },
    // A band climbing high overhead, as in a strong display.
    { distance: 150, width: 700, base: 170, height: 180, fold: 80, azimuth: -0.1, seed: 8.9, strength: 0.6, segments: 160 },
];

const VERTEX = /* glsl */`
uniform float uTime;
uniform vec4 uShape;   // distance, width, base, height
uniform vec3 uFold;    // fold, seed, azimuth
varying vec2 vUv;
varying float vAlong;
varying float vEdgeOn;
${SKY_NOISE_GLSL}
float atlasFold( float u ) {
    return ( atlasSkyNoise( u * 2.4 + uFold.y + uTime * 0.012 ) - 0.5 ) * 2.0 * uFold.x
        + ( atlasSkyNoise( u * 7.0 - uFold.y - uTime * 0.03 ) - 0.5 ) * 0.45 * uFold.x;
}
void main() {
    float u = position.x;
    float v = position.y;
    float x = ( u - 0.5 ) * 2.0 * uShape.y;
    // The foot folds toward and away from you, drifting slowly. Where a fold
    // turns edge-on you look through more of the curtain, and it burns brighter.
    float fold = atlasFold( u );
    vEdgeOn = abs( atlasFold( u + 0.004 ) - fold ) / ( 0.008 * uShape.y );
    // Leaning back a little with height, along the field lines.
    float z = -uShape.x + fold - v * uShape.w * 0.18;
    float y = uShape.z + v * uShape.w;
    float c = cos( uFold.z );
    float s = sin( uFold.z );
    vec3 p = vec3( c * x - s * z, y, s * x + c * z );
    vUv = vec2( u, v );
    vAlong = x;
    gl_Position = projectionMatrix * modelViewMatrix * vec4( p, 1.0 );
    ${SKY_FAR_PLANE_GLSL}
}
`;

const FRAGMENT = /* glsl */`
uniform float uTime;
uniform float uOpacity;
uniform vec3 uColorLow;
uniform vec3 uColorMid;
uniform vec3 uColorHigh;
varying vec2 vUv;
varying float vAlong;
varying float vEdgeOn;
${SKY_NOISE_GLSL}
void main() {
    float u = vUv.x;
    float v = vUv.y;
    // Rays: fine vertical striations that shimmer and drift along the band.
    float rays = atlasSkyNoise( vAlong * 0.09 + uTime * 0.25 ) * 0.6 + atlasSkyNoise( vAlong * 0.31 - uTime * 0.6 ) * 0.4;
    rays = 0.2 + 0.8 * pow( rays, 2.0 );
    // The foot ripples: each ray starts at its own height.
    float foot = 0.03 + 0.06 * atlasSkyNoise( vAlong * 0.05 - uTime * 0.08 );
    float above = smoothstep( foot - 0.02, foot + 0.025, v );
    // Brightest just above the foot, fading upward, with a faint glow high up.
    float profile = above * ( exp( -( v - foot ) * 4.2 ) + 0.16 * smoothstep( 0.25, 0.6, v ) * exp( -( v - 0.45 ) * 2.4 ) );
    // Surges of brightness roll along the band, with dim gaps between them, and
    // folds seen edge-on burn brighter.
    float surge = ( 0.12 + 0.88 * smoothstep( 0.25, 0.9, atlasSkyNoise( vAlong * 0.0035 - uTime * 0.04 ) ) )
        * ( 1.0 + 1.6 * clamp( vEdgeOn, 0.0, 1.5 ) );
    // Soft ends and a soft top.
    float fade = smoothstep( 0.0, 0.18, u ) * smoothstep( 1.0, 0.82, u ) * ( 1.0 - smoothstep( 0.8, 1.0, v ) );
    vec3 color = mix( uColorLow, uColorMid, smoothstep( 0.05, 0.32, v ) );
    color = mix( color, uColorHigh, smoothstep( 0.32, 0.85, v ) );
    // The foot burns whitish where it is brightest.
    color += vec3( 0.3, 0.45, 0.3 ) * exp( -pow( ( v - foot - 0.025 ) * 16.0, 2.0 ) ) * rays;
    gl_FragColor = vec4( color * ( profile * rays * surge * fade * uOpacity ), 1.0 );
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
`;

/** A strip along the band: x = 0..1 along it, y = 0 at the foot, 1 at the top. */
function bandGeometry(segments: number): THREE.BufferGeometry {
    const positions = new Float32Array((segments + 1) * 2 * 3);
    const indices: number[] = [];
    for (let i = 0; i <= segments; i++) {
        const u = i / segments;
        positions.set([u, 0, 0, u, 1, 0], i * 6);
        if (i < segments) {
            const a = i * 2;
            indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
        }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    // The vertex shader moves everything into the sky: never cull it.
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    return geometry;
}

export const Aurora: React.FC = () => {
    const { camera } = useThree();
    const bands = useMemo(() => BANDS.map((band) => {
        const material = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
                uOpacity: { value: 0 },
                uShape: { value: new THREE.Vector4(band.distance, band.width, band.base, band.height) },
                uFold: { value: new THREE.Vector3(band.fold, band.seed, band.azimuth) },
                uColorLow: { value: new THREE.Color() },
                uColorMid: { value: new THREE.Color() },
                uColorHigh: { value: new THREE.Color() },
            },
            vertexShader: VERTEX,
            fragmentShader: FRAGMENT,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
        });
        return { band, material, geometry: bandGeometry(band.segments) };
    }), []);

    const groupRef = React.useRef<THREE.Group>(null);

    useFrame(({ clock }) => {
        const group = groupRef.current;
        if (!group) return;
        const strength = skyFrame.aurora * (1 - skyFrame.medium);
        group.visible = strength > 0.005;
        if (!group.visible) return;
        // Around the camera, like the rest of the sky: it never comes nearer.
        group.position.copy(camera.position);
        // Wrapped so the float clock keeps its precision in long sessions.
        const time = skyFrame.paused ? bands[0].material.uniforms.uTime.value : clock.elapsedTime % 3600;
        for (const { band, material } of bands) {
            material.uniforms.uTime.value = time;
            material.uniforms.uOpacity.value = strength * band.strength * 1.2;
            material.uniforms.uColorLow.value.copy(skyFrame.auroraLow);
            material.uniforms.uColorMid.value.copy(skyFrame.auroraMid);
            material.uniforms.uColorHigh.value.copy(skyFrame.auroraHigh);
        }
    });

    return (
        <group ref={groupRef} visible={false}>
            {bands.map(({ material, geometry }, index) => (
                <mesh key={index} geometry={geometry} material={material} renderOrder={SKY_ORDER.aurora} frustumCulled={false} />
            ))}
        </group>
    );
};
