import React, { useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { SKY_FAR_PLANE_GLSL, SKY_NOISE_GLSL, SKY_ORDER, skyFrame } from '../../../systems/graphics/skyObjects';
import { CLOUD_GLSL, CLOUD_UNIFORMS } from '../../../systems/graphics/cloudLayer';

// The aurora: curtains hanging over the northern sky (north is -Z).
//
// Each band is a sheet that stands up from a folded foot, leaning back a
// little along the field lines, built the way a real display looks from the
// ground:
//  - a sharp, bright lower border that ripples, burning whitish where it is
//    brightest, with a pink fringe beneath it when the display is lively;
//  - fine rays running along the curtain, each flickering and reaching its own
//    height;
//  - colour by height: the body colour just above the foot, the middle colour
//    higher, and faint crimson tops that deepen in a storm;
//  - folds that drift, and ripples that run along them, brightest where a
//    fold turns edge-on;
//  - surges of brightness rolling along the band.
// How lively it is comes from skyFrame.auroraActivity (auroraActivity.ts): a
// slow swell, and now and then a substorm, when the curtains brighten, grow
// taller, race along, and more of them swing out across the sky. The colours
// follow the moon's phase (DayNightCycle), for a touch of whimsy.
//
// Behind a cloud it softens into a diffuse glow (its rays, sharp foot and
// surges smooth out), so what the cloud lets through looks blurred by it.
//
// It adds light (it never darkens what is behind it), runs in HDR so its foot
// catches a soft bloom, and is drawn at the far plane, behind the clouds and
// everything in the world.

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
    /** How lively the display must be before this band shows (0: always). */
    lively: number;
    segments: number;
}

const BANDS: readonly Band[] = [
    // The main arc, low over the northern horizon.
    { distance: 360, width: 820, base: 70, height: 220, fold: 120, azimuth: 0, seed: 1.7, strength: 1, lively: 0, segments: 224 },
    // A fainter, farther arc behind it.
    { distance: 560, width: 920, base: 40, height: 150, fold: 90, azimuth: 0.14, seed: 4.3, strength: 0.55, lively: 0, segments: 160 },
    // A band climbing high overhead, once the display grows lively.
    { distance: 150, width: 700, base: 170, height: 180, fold: 80, azimuth: -0.1, seed: 8.9, strength: 0.7, lively: 0.45, segments: 192 },
    // Curtains swinging round to the north-east and north-west in a substorm.
    { distance: 300, width: 640, base: 90, height: 210, fold: 110, azimuth: 0.95, seed: 12.4, strength: 0.6, lively: 0.85, segments: 160 },
    { distance: 330, width: 600, base: 80, height: 190, fold: 100, azimuth: -1.0, seed: 15.8, strength: 0.5, lively: 1.0, segments: 160 },
];

const VERTEX = /* glsl */`
uniform float uTime;
uniform float uActivity;
uniform vec3 uPhase;   // how far the rays, ripples and surges have run (their speeds follow the activity)
uniform vec4 uShape;   // distance, width, base, height
uniform vec3 uFold;    // fold, seed, azimuth
varying vec2 vUv;
varying float vAlong;
varying float vEdgeOn;
varying vec3 vSkyDir;
${SKY_NOISE_GLSL}
// How far the foot folds toward or away from you at u: big slow folds, smaller
// ones, and ripples running along the curtain, quicker when it is lively.
float atlasFold( float u ) {
    float big = ( atlasSkyNoise( u * 2.4 + uFold.y + uTime * 0.012 ) - 0.5 ) * 2.0;
    float small = ( atlasSkyNoise( u * 7.0 - uFold.y - uTime * 0.03 ) - 0.5 ) * 0.45;
    float ripple = sin( u * 38.0 - uPhase.y + uFold.y ) * 0.05 * uActivity;
    return ( big + small + ripple ) * uFold.x;
}
void main() {
    float u = position.x;
    float v = position.y;
    float x = ( u - 0.5 ) * 2.0 * uShape.y;
    // Where a fold turns edge-on you look through more of the curtain, and it burns brighter.
    float fold = atlasFold( u );
    vEdgeOn = abs( atlasFold( u + 0.004 ) - fold ) / ( 0.008 * uShape.y );
    // Taller when lively; leaning back a little with height, along the field lines.
    float height = uShape.w * ( 0.75 + 0.3 * min( uActivity, 1.4 ) );
    float z = -uShape.x + fold - v * height * 0.18;
    float y = uShape.z + v * height;
    float c = cos( uFold.z );
    float s = sin( uFold.z );
    vec3 p = vec3( c * x - s * z, y, s * x + c * z );
    vUv = vec2( u, v );
    vAlong = x;
    vSkyDir = p;
    gl_Position = projectionMatrix * modelViewMatrix * vec4( p, 1.0 );
    ${SKY_FAR_PLANE_GLSL}
}
`;

const FRAGMENT = /* glsl */`
uniform float uTime;
uniform float uOpacity;
uniform float uActivity;
uniform vec3 uPhase;
uniform vec3 uFold;    // fold, seed, azimuth
uniform vec3 uColorLow;
uniform vec3 uColorMid;
uniform vec3 uColorHigh;
uniform vec3 uColorFringe;
uniform vec3 uColorTop;
varying vec2 vUv;
varying float vAlong;
varying float vEdgeOn;
varying vec3 vSkyDir;
${SKY_NOISE_GLSL}
${CLOUD_GLSL}
void main() {
    float u = vUv.x;
    float v = vUv.y;
    float lively = clamp( uActivity, 0.0, 1.6 );
    // Behind a cloud, only a soft glow of it comes through.
    float veil = atlasCloudCoverAlong( normalize( vSkyDir ) );
    // Rays: fine striations running along the curtain, each flickering on its
    // own; quicker, sharper and brighter as the display grows lively.
    float run = uPhase.x;
    float coarse = atlasSkyNoise( vAlong * 0.09 + run + uFold.y );
    float fineAt = vAlong * 0.31 - run * 2.2;
    float fine = atlasSkyNoise( fineAt );
    float rays = pow( coarse * 0.55 + fine * 0.45, 1.0 + 1.6 * lively );
    float ray = floor( fineAt );
    float flicker = 1.0 + 0.35 * lively * sin( uTime * ( 1.5 + 3.5 * atlasSkyHash( ray ) ) + atlasSkyHash( ray + 7.1 ) * 6.283 );
    rays = mix( ( 0.15 + 1.2 * rays ) * flicker, 0.55, veil );
    // Each ray reaches its own height.
    float top = 0.4 + 0.55 * atlasSkyNoise( vAlong * 0.05 + run * 0.4 + uFold.y * 3.0 );
    // The lower border ripples, and is sharp.
    float foot = 0.03 + 0.05 * atlasSkyNoise( vAlong * 0.05 - uTime * 0.08 + uFold.y );
    float h = v - foot;
    float above = smoothstep( -0.02 - 0.08 * veil, 0.012 + 0.08 * veil, h );
    // Brightest just above the foot, fading up each ray to its top, with a
    // faint glow high up that a storm lights crimson.
    float body = exp( -max( h, 0.0 ) * ( 4.6 - 1.4 * min( lively, 1.0 ) ) ) * ( 1.0 - smoothstep( top * 0.55, top, v ) );
    float high = 0.14 * ( 1.0 + 2.0 * smoothstep( 0.8, 1.4, lively ) ) * smoothstep( 0.2, 0.55, v ) * ( 1.0 - smoothstep( 0.6, 1.0, v ) );
    float profile = above * ( body + high );
    // Surges of brightness roll along the band, quicker in a storm, and folds
    // seen edge-on burn brighter.
    float surge = ( 0.15 + 0.85 * smoothstep( 0.25, 0.9, atlasSkyNoise( vAlong * 0.0035 - uPhase.z + uFold.y ) ) )
        * ( 1.0 + 1.6 * clamp( vEdgeOn, 0.0, 1.5 ) );
    surge = mix( surge, 0.7, veil );
    // Soft ends and a soft top.
    float fade = smoothstep( 0.0, 0.18, u ) * ( 1.0 - smoothstep( 0.82, 1.0, u ) ) * ( 1.0 - smoothstep( 0.8, 1.0, v ) );
    // Colour by height, with the body's hue rolling slowly along the band.
    vec3 low = mix( uColorLow, uColorMid, 0.35 * atlasSkyNoise( vAlong * 0.004 + uTime * 0.02 + uFold.y ) );
    vec3 color = mix( low, uColorMid, smoothstep( 0.08, 0.35, h ) );
    color = mix( color, uColorHigh, smoothstep( 0.3, 0.8, h ) );
    color = mix( color, uColorTop, smoothstep( 0.4, 0.85, h ) * ( 0.3 + 0.6 * smoothstep( 0.6, 1.3, lively ) ) );
    // A pink fringe along the foot when the display is lively.
    color = mix( color, uColorFringe, exp( -pow( ( h + 0.006 ) / 0.018, 2.0 ) ) * smoothstep( 0.55, 1.1, lively ) * 0.85 );
    // The foot burns whitish where it is brightest.
    color += vec3( 0.3, 0.45, 0.3 ) * exp( -pow( ( h - 0.02 ) * 16.0, 2.0 ) ) * rays * ( 1.0 - veil );
    float brightness = 0.55 + 0.6 * min( lively, 1.4 );
    gl_FragColor = vec4( color * ( profile * rays * surge * fade * brightness * uOpacity ), 1.0 );
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
                uActivity: { value: 0.5 },
                uPhase: { value: new THREE.Vector3() },
                ...CLOUD_UNIFORMS,
                uShape: { value: new THREE.Vector4(band.distance, band.width, band.base, band.height) },
                uFold: { value: new THREE.Vector3(band.fold, band.seed, band.azimuth) },
                uColorLow: { value: new THREE.Color() },
                uColorMid: { value: new THREE.Color() },
                uColorHigh: { value: new THREE.Color() },
                uColorFringe: { value: new THREE.Color() },
                uColorTop: { value: new THREE.Color() },
            },
            vertexShader: VERTEX,
            fragmentShader: FRAGMENT,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
        });
        const mesh = new THREE.Mesh(bandGeometry(band.segments), material);
        mesh.renderOrder = SKY_ORDER.aurora;
        mesh.frustumCulled = false;
        return { band, material, mesh };
    }), []);

    React.useEffect(() => () => {
        for (const { material, mesh } of bands) {
            material.dispose();
            mesh.geometry.dispose();
        }
    }, [bands]);

    const groupRef = React.useRef<THREE.Group>(null);

    useFrame(({ clock }, delta) => {
        const group = groupRef.current;
        if (!group) return;
        const strength = skyFrame.aurora * (1 - skyFrame.medium);
        group.visible = strength > 0.005;
        if (!group.visible) return;
        // Around the camera, like the rest of the sky: it never comes nearer.
        group.position.copy(camera.position);
        // Wrapped so the float clock keeps its precision in long sessions.
        const time = skyFrame.paused ? bands[0].material.uniforms.uTime.value : clock.elapsedTime % 3600;
        const activity = skyFrame.auroraActivity;
        const dt = skyFrame.paused ? 0 : Math.min(delta, 0.1);
        for (const { band, material, mesh } of bands) {
            // Each band breathes a little on its own.
            const lively = activity * (0.88 + 0.12 * Math.sin(time * 0.07 + band.seed));
            // Its rays, ripples and surges run faster as it grows lively. They
            // advance a frame at a time: a speed times the whole clock would
            // leap wherever the speed changed, the longer the session, the more.
            const phase = material.uniforms.uPhase.value as THREE.Vector3;
            phase.x = (phase.x + dt * (0.2 + 0.5 * lively)) % 3600;
            phase.y = (phase.y + dt * (0.35 + 0.9 * lively)) % 3600;
            phase.z = (phase.z + dt * (0.03 + 0.05 * lively)) % 3600;
            const shown = band.lively > 0 ? THREE.MathUtils.smoothstep(lively, band.lively, band.lively + 0.3) : 1;
            mesh.visible = shown > 0.01;
            const uniforms = material.uniforms;
            uniforms.uTime.value = time;
            uniforms.uActivity.value = lively;
            uniforms.uOpacity.value = strength * band.strength * shown * 1.2;
            uniforms.uColorLow.value.copy(skyFrame.auroraLow);
            uniforms.uColorMid.value.copy(skyFrame.auroraMid);
            uniforms.uColorHigh.value.copy(skyFrame.auroraHigh);
            uniforms.uColorFringe.value.copy(skyFrame.auroraFringe);
            uniforms.uColorTop.value.copy(skyFrame.auroraTop);
        }
    });

    return (
        <group ref={groupRef} visible={false}>
            {bands.map(({ mesh }, index) => <primitive key={index} object={mesh} />)}
        </group>
    );
};
