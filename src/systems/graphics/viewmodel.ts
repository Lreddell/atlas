import * as THREE from 'three';
import { addShaderPatch } from './materials/shaderPatches';

// The first-person hand and held item draw with their own projection:
//
//  - A fixed field of view, so the item keeps its size and shape whatever the
//    FOV setting, and doesn't stretch with the sprint FOV kick.
//  - Depth squeezed into the nearest sliver of the depth buffer. The item still
//    depth-tests against itself (a stair or a chest reads as a solid shape),
//    but always wins against the world, so it never clips into a block face
//    the player is pressed up against.

/** Field of view (degrees) the viewmodel is drawn with. */
export const VIEWMODEL_FOV = 70;
/** The viewmodel's depth lives in [0, VIEWMODEL_DEPTH_RANGE) of the 0..1 depth buffer. */
export const VIEWMODEL_DEPTH_RANGE = 0.02;

export const VIEWMODEL_UNIFORMS = {
    atlasViewmodelProjection: { value: new THREE.Matrix4() },
};

const lens = new THREE.PerspectiveCamera(VIEWMODEL_FOV, 1, 0.05, 20);
lens.updateProjectionMatrix();
VIEWMODEL_UNIFORMS.atlasViewmodelProjection.value.copy(lens.projectionMatrix);

/** Keeps the viewmodel lens at the canvas aspect ratio. */
export function updateViewmodelProjection(aspect: number): void {
    if (!(aspect > 0) || Math.abs(lens.aspect - aspect) < 1e-6) return;
    lens.aspect = aspect;
    lens.updateProjectionMatrix();
    VIEWMODEL_UNIFORMS.atlasViewmodelProjection.value.copy(lens.projectionMatrix);
}

const r = VIEWMODEL_DEPTH_RANGE.toFixed(4);
const rest = (1 - VIEWMODEL_DEPTH_RANGE).toFixed(4);

/** Draws `material` as part of the viewmodel. Meshes using it must be children of the camera. */
export function applyViewmodelProjection(material: THREE.Material): void {
    addShaderPatch(material, 'viewmodel', (shader) => {
        shader.uniforms.atlasViewmodelProjection = VIEWMODEL_UNIFORMS.atlasViewmodelProjection;
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\nuniform mat4 atlasViewmodelProjection;')
            .replace('#include <project_vertex>', /* glsl */`#include <project_vertex>
	gl_Position = atlasViewmodelProjection * mvPosition;
	// NDC depth [-1, 1] -> [-1, -1 + 2r]: the nearest sliver of the depth range.
	gl_Position.z = gl_Position.z * ${r} - ${rest} * gl_Position.w;`);
    });
}
