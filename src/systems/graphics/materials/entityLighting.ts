import * as THREE from 'three';
import '../atmosphereUniforms';
import '../dynamicLights';
import { addShaderPatch } from './shaderPatches';
import {
    WORLD_LIGHT_DECLARATIONS,
    WORLD_LIGHT_END,
    WORLD_LIGHT_UNIFORMS,
    keyGatedLightsFragmentBegin,
    worldLightPrepare,
} from './worldLighting';

// World light for things that aren't blocks: the player's body and hand, held
// and dropped items, and block debris. Without it they took the open-sky
// ambient everywhere: lit like noon in a pitch-black cave and untouched by the
// torch they stood next to. With it they run the blocks' own lighting code
// (worldLighting.ts) on the voxel light sampled where they are.

/** x sky light 0..1, y block light 0..1 (z, w unused). One per entity, shared by all its materials. */
export interface EntityLight {
    value: { x: number; y: number; z: number; w: number };
}

export const createEntityLight = (): EntityLight => ({ value: { x: 1, y: 0, z: 0, w: 0 } });

/**
 * Where the light comes from: one sampled value for a whole model, or each
 * instance's colour (r = sky, g = block) for instanced drops and particles.
 */
export type EntityLightSource = { kind: 'uniform'; light: EntityLight } | { kind: 'instance' };

const LIGHT_HOOKS = ['#include <lights_lambert_fragment>', '#include <lights_physical_fragment>', '#include <lights_phong_fragment>'];

const inputsFor = (source: EntityLightSource) => source.kind === 'instance'
    ? /* glsl */`
	atlasSkyLight = clamp( vColor.r, 0.0, 1.0 );
	atlasBlockLight = clamp( vColor.g, 0.0, 1.0 );`
    : /* glsl */`
	atlasSkyLight = clamp( atlasEntityLight.x, 0.0, 1.0 );
	atlasBlockLight = clamp( atlasEntityLight.y, 0.0, 1.0 );`;

const isLit = (material: THREE.Material): boolean =>
    material instanceof THREE.MeshLambertMaterial
    || material instanceof THREE.MeshStandardMaterial
    || material instanceof THREE.MeshPhongMaterial;

/**
 * Lights `material` like the blocks around it. Unlit materials (MeshBasic) are
 * left alone. Returns whether the material is world-lit.
 */
export function applyEntityLighting(material: THREE.Material, source: EntityLightSource): boolean {
    if (!isLit(material)) return false;
    const id = `entity-light-${source.kind}`;
    addShaderPatch(material, id, (shader) => {
        Object.assign(shader.uniforms, WORLD_LIGHT_UNIFORMS);
        if (source.kind === 'uniform') shader.uniforms.atlasEntityLight = source.light;
        let fragment = shader.fragmentShader.replace('#include <common>', `#include <common>\n${WORLD_LIGHT_DECLARATIONS}${
            source.kind === 'uniform' ? '\nuniform vec4 atlasEntityLight;' : ''}`);
        // Instanced drops and particles carry light, not colour, in their instance colour.
        if (source.kind === 'instance') fragment = fragment.replace('#include <color_fragment>', '');
        const hook = LIGHT_HOOKS.find(candidate => fragment.includes(candidate));
        if (!hook) return;
        fragment = fragment
            .replace(hook, /* glsl */`${inputsFor(source)}
	atlasAo = 1.0;
	atlasClassicAo = 1.0;
	// The voxel faces' per-axis shade, continuous for any facing: tops 1, sides 0.82, bottoms 0.64.
	atlasFaceShade = 0.82 + 0.18 * inverseTransformDirection( normal, viewMatrix ).y;
${worldLightPrepare()}
${hook}`)
            .replace('#include <lights_fragment_begin>', keyGatedLightsFragmentBegin())
            .replace('#include <lights_fragment_end>', WORLD_LIGHT_END);
        shader.fragmentShader = fragment;
    });
    return true;
}
