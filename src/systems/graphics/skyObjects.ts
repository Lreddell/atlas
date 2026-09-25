import * as THREE from 'three';
import { addShaderPatch } from './materials/shaderPatches';
import { CLOUD_GLSL, CLOUD_UNIFORMS } from './cloudLayer';

// What the sky's objects (stars, sun and moon, aurora, meteors) share.
//
// They draw at the far plane, so everything in the world is in front of them:
// terrain at any render distance, and the clouds. (Placed at a fixed radius,
// they could draw over mountains farther out than that at high render
// distances.) Their order back to front is fixed by render order: the dome,
// stars, the sun's and moon's glows, their discs, the aurora and meteors,
// then the clouds over all of it. Drawn last, a cloud covers every one of
// them alike (the dome, stars and aurora included), so none shows through a
// cloud that hides another.

/** Render order of each sky layer (every one of them in a group of order 0). */
export const SKY_ORDER = {
    dome: -1000,
    stars: -990,
    glow: -980,
    disc: -970,
    aurora: -500,
    meteors: -400,
    clouds: -100,
} as const;

/** GLSL, after gl_Position is set: moves the vertex onto the far plane. */
export const SKY_FAR_PLANE_GLSL = 'gl_Position.z = gl_Position.w * 0.99999;';

/** Draws a built-in material (MeshBasic, Sprite) at the far plane. */
export function drawAtFarPlane(material: THREE.Material): void {
    addShaderPatch(material, 'sky-far-plane', (shader) => {
        shader.vertexShader = shader.vertexShader.replace(
            '#include <logdepthbuf_vertex>',
            `${SKY_FAR_PLANE_GLSL}\n#include <logdepthbuf_vertex>`,
        );
    });
}

/**
 * Hides a built-in sky material (the sun or moon, their glows) behind the
 * clouds, pixel by pixel: `amount` 1 hides it wholly where a cloud is in
 * front; less lets a soft part of it through (a glow seen through cloud).
 */
export function veilByClouds(material: THREE.Material, amount: number): void {
    addShaderPatch(material, `sky-cloud-veil-${amount}`, (shader) => {
        Object.assign(shader.uniforms, CLOUD_UNIFORMS);
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\nvarying vec3 vAtlasSkyDir;')
            .replace('#include <logdepthbuf_vertex>', 'vAtlasSkyDir = mvPosition.xyz * mat3( viewMatrix );\n#include <logdepthbuf_vertex>');
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', `#include <common>\nvarying vec3 vAtlasSkyDir;\n${CLOUD_GLSL}`)
            .replace('#include <opaque_fragment>', `#include <opaque_fragment>
	gl_FragColor.a *= 1.0 - ${amount.toFixed(2)} * atlasCloudCoverAlong( normalize( vAtlasSkyDir ) );`);
    });
}

/** Smooth 1D value noise, 0..1, for the aurora and meteors. */
export const SKY_NOISE_GLSL = /* glsl */`
float atlasSkyHash( float n ) { return fract( sin( n ) * 43758.5453123 ); }
float atlasSkyNoise( float x ) {
    float i = floor( x );
    float f = fract( x );
    f = f * f * ( 3.0 - 2.0 * f );
    return mix( atlasSkyHash( i ), atlasSkyHash( i + 1.0 ), f );
}
`;

/**
 * The sky as DayNightCycle last saw it, for the sky objects that run their
 * own frame (Aurora, Meteors). Written once per frame, never reallocated.
 */
export const skyFrame = {
    /** 0..1: how dark the sky is (star visibility). */
    night: 0,
    /** 0..1: how much aurora there is (night, in a snowy biome). */
    aurora: 0,
    /** How lively it is: about 0.3 calm, 0.7 lively, up to 1.6 in a substorm (auroraActivity.ts). */
    auroraActivity: 0.5,
    /** Aurora colours, low to high (scene-linear), the pink fringe along its foot, and its faint tops. */
    auroraLow: new THREE.Color(0x44ff88),
    auroraMid: new THREE.Color(0x88ffcc),
    auroraHigh: new THREE.Color(0x9966ff),
    auroraFringe: new THREE.Color(0xff4f9a),
    auroraTop: new THREE.Color(0xc0283c),
    bloodMoon: false,
    /** 0 new moon .. 4 full .. 7. */
    moonPhase: 0,
    /** 0..1: how far the camera is inside water or lava (the sky is lost in it). */
    medium: 0,
    paused: false,
};
