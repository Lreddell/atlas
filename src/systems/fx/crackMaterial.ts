import * as THREE from 'three';

// The block-breaking overlay: pixel cracks instead of a darkening box.
//
// Each face is a 16x16 pixel grid, matching the block textures. Cracks are the
// seams of a coarse Voronoi pattern (seeded by the block position and face, so
// every block breaks its own way, the same way every time) and spread outward
// from the middle of the face in ten discrete stages as the block weakens. Each
// landed swing flares them for an instant.

export const CRACK_STAGES = 10;

/** The visible stage (0..CRACK_STAGES) for a break progress of 0..1. */
export const crackStage = (progress: number): number =>
    Math.max(0, Math.min(CRACK_STAGES, Math.floor(progress * CRACK_STAGES)));

const VERTEX = /* glsl */`
varying vec2 vUv;
varying vec3 vFaceNormal;
void main() {
    vUv = uv;
    vFaceNormal = normal;
    gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}
`;

const FRAGMENT = /* glsl */`
uniform float uStage;       // 0..1, already quantised to the ten stages
uniform vec3 uSeed;         // the block's cell
uniform vec3 uTint;
uniform float uStrike;      // 1 at the moment a swing lands, fading to 0
varying vec2 vUv;
varying vec3 vFaceNormal;

float hash12( vec2 p ) {
    vec3 p3 = fract( vec3( p.xyx ) * 0.1031 );
    p3 += dot( p3, p3.yzx + 33.33 );
    return fract( ( p3.x + p3.y ) * p3.z );
}

void main() {
    vec2 pixel = floor( clamp( vUv, 0.0, 0.9999 ) * 16.0 ) + 0.5;
    float face = dot( abs( vFaceNormal ), vec3( 1.0, 2.0, 3.0 ) ) + ( dot( vFaceNormal, vec3( 1.0 ) ) > 0.0 ? 0.0 : 3.0 );
    vec2 key = uSeed.xz * 0.37 + vec2( uSeed.y * 0.61, face * 1.93 );
    vec2 center = vec2( 8.0 );
    // The first two seeds straddle the middle of the face, so a crack always
    // runs through it (that is where breaking starts); the rest keep clear.
    float angle = hash12( key * 1.7 + 5.0 ) * 6.2831853;
    vec2 split = vec2( cos( angle ), sin( angle ) ) * 2.5;
    // The nearest and second-nearest of six seed points.
    float d1 = 1e4;
    float d2 = 1e4;
    vec2 s1 = center;
    vec2 s2 = center;
    for ( int i = 0; i < 6; i ++ ) {
        vec2 seed;
        if ( i == 0 ) seed = center + split;
        else if ( i == 1 ) seed = center - split;
        else {
            seed = vec2( hash12( key + float( i ) * 7.31 ), hash12( key.yx + float( i ) * 3.17 + 11.0 ) ) * 16.0;
            vec2 away = seed - center;
            float len = length( away );
            if ( len < 5.0 ) seed = center + ( len > 0.001 ? away / len : vec2( 1.0, 0.0 ) ) * 5.0;
        }
        float d = distance( pixel, seed );
        if ( d < d1 ) { d2 = d1; s2 = s1; d1 = d; s1 = seed; }
        else if ( d < d2 ) { d2 = d; s2 = seed; }
    }
    // A crack runs where two cells meet: this pixel's distance to that edge,
    // measured exactly so the line stays thin even when two seeds sit close.
    float edge = ( d2 * d2 - d1 * d1 ) / ( 2.0 * max( distance( s1, s2 ), 0.001 ) );
    float crack = step( edge, 0.55 );
    // Cracks reach further from the face's middle stage by stage: a pixel or
    // two the moment mining starts, the whole face by the last stage.
    float dist = distance( pixel, center );
    float reach = dist / 11.3 + hash12( pixel + face * 17.0 + key ) * 0.2 * min( 1.0, dist / 4.0 );
    float shown = crack * step( reach, 0.1 + uStage * 1.1 );
    float alpha = shown * ( 0.62 + 0.3 * uStrike ) + uStage * 0.1;
    if ( alpha < 0.01 ) discard;
    gl_FragColor = vec4( uTint, alpha );
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
`;

export function createCrackMaterial(): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        uniforms: {
            uStage: { value: 0 },
            uSeed: { value: new THREE.Vector3() },
            uTint: { value: new THREE.Color(0x000000) },
            uStrike: { value: 0 },
        },
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
    });
}
