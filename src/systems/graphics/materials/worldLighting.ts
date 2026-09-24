import * as THREE from 'three';

// One lighting model for the voxel world and everything standing in it.
//
// Blocks (voxelMaterial.ts) and entities (entityLighting.ts) feed the same four
// inputs into the same GLSL, so a player, a dropped item or a mote of debris
// next to a torch, in a cave or under the moon is lit exactly like the blocks
// around it:
//
//   atlasSkyLight    0..1  how open the sky is here (the voxel sky light)
//   atlasBlockLight  0..1  torch and lamp light here
//   atlasAo / atlasClassicAo  ambient occlusion (1 where open)
//   atlasFaceShade   the stylised per-axis shade on the ambient light
//
// Two styles share these inputs. Luminous: hemisphere ambient scaled by sky
// openness, the sun or moon gated to open sky, warm torch light and a cool
// floor where the sky can't reach. Classic: the pre-overhaul model, where the
// surface colour itself is darkened by its sky light and torches add a neutral
// glow. The style is a uniform, so switching it never recompiles a shader.

/** Shared by every world-lit material: one write per frame reaches them all. */
export const WORLD_LIGHT_UNIFORMS = {
    atlasTorchColor: { value: new THREE.Color(1.0, 0.55, 0.24) },
    /** x floor light, y torch strength (with flicker), z 1 / exposure, w clock (seconds). */
    atlasVoxelLight: { value: { x: 0.085, y: 1.25, z: 1, w: 0 } },
    /** x wind strength (0 = still), y 1 for water and glass reflections and ripples. */
    atlasVoxelStyle: { value: { x: 1, y: 1, z: 0, w: 0 } },
    /** The Classic style: x 1 when on, y the old day/night sunlight factor, z the Brightness option (0..1). */
    atlasClassic: { value: { x: 0, y: 1, z: 0.5, w: 0 } },
};

/** Switches between the Luminous and Classic lighting (uniforms only, no recompile). */
export function setClassicLighting(classic: boolean): void {
    WORLD_LIGHT_UNIFORMS.atlasClassic.value.x = classic ? 1 : 0;
}

/** The Classic model's day/night factor on sky light, and the Brightness option it floors with. */
export function setClassicLightLevels(sunlight: number, brightness: number): void {
    const classic = WORLD_LIGHT_UNIFORMS.atlasClassic.value;
    classic.y = sunlight;
    classic.z = Math.max(0, Math.min(1, brightness));
}

/** Uniforms and per-fragment inputs; include once after #include <common>. */
export const WORLD_LIGHT_DECLARATIONS = /* glsl */`
uniform vec3 atlasTorchColor;
uniform vec4 atlasVoxelLight;
uniform vec4 atlasVoxelStyle;
uniform vec4 atlasClassic;
float atlasSkyLight;
float atlasBlockLight;
float atlasAo;
float atlasClassicAo;
float atlasFaceShade;
float atlasVoxelKeyGate;
vec3 atlasAlbedo;
`;

/**
 * Once the inputs are set and diffuseColor holds the surface colour: keep the
 * colour for the torch glow, gate the key light, and (Classic) darken the
 * surface by its sky light. `classicFloor` is the old minimum light.
 */
export const worldLightPrepare = (classicFloor = '0.05') => /* glsl */`
	atlasAlbedo = diffuseColor.rgb;
	// The sun and moon only reach surfaces that are open to the sky (Classic
	// needs no gate: its sky light already darkens the surface itself).
	atlasVoxelKeyGate = atlasClassic.x > 0.5 ? 1.0 : smoothstep( 0.5, 0.95, atlasSkyLight );
	if ( atlasClassic.x > 0.5 ) {
		diffuseColor.rgb *= max( atlasSkyLight * atlasClassicAo * atlasClassic.y, ${classicFloor} + atlasClassic.z * 0.25 );
	}
`;

const DIRECTIONAL_INFO = 'getDirectionalLightInfo( directionalLight, directLight );';

/** three's light loop with the key light gated by sky light (dynamic lights are not gated). */
export function keyGatedLightsFragmentBegin(chunk = THREE.ShaderChunk.lights_fragment_begin): string {
    if (!chunk.includes(DIRECTIONAL_INFO)) {
        console.warn('[worldLighting] three changed lights_fragment_begin; key light is not sky-gated');
        return chunk;
    }
    return chunk.replace(DIRECTIONAL_INFO, `${DIRECTIONAL_INFO}\n\t\tdirectLight.color *= atlasVoxelKeyGate;`);
}

/** Replaces #include <lights_fragment_end>: ambient, torch and floor light, per style. */
export const WORLD_LIGHT_END = /* glsl */`
	if ( atlasClassic.x < 0.5 ) {
		// Ambient: how open the sky is, AO, and the per-axis face shade.
		float atlasSkyVisibility = atlasSkyLight * atlasSkyLight;
		irradiance *= atlasSkyVisibility * atlasAo * atlasFaceShade;
		// Torches, lava and lamps: warm near a strong source, fading to a neutral
		// glow further out (so faint lights like glow lichen don't tint a cave
		// orange). Like the floor below, it reads the same day or night.
		vec3 atlasTorchTint = mix( vec3( 0.86, 0.84, 0.8 ), atlasTorchColor, smoothstep( 0.4, 0.9, atlasBlockLight ) );
		irradiance += atlasTorchTint * ( pow( atlasBlockLight, 2.2 ) * atlasAo * atlasVoxelLight.y * atlasVoxelLight.z * PI );
		// The Brightness option: a cool slate floor where the sky can't reach (caves).
		irradiance += vec3( 0.55, 0.62, 0.78 ) * ( atlasVoxelLight.x * atlasVoxelLight.z * ( 1.0 - atlasSkyVisibility ) * atlasAo * atlasFaceShade * PI );
	}
#include <lights_fragment_end>
	if ( atlasClassic.x > 0.5 ) {
		// Classic torch light: a neutral glow on the surface's own colour.
		reflectedLight.directDiffuse += atlasAlbedo * ( pow( clamp( atlasBlockLight * atlasClassicAo, 0.0, 1.0 ), 1.8 ) * 0.85 );
	}
`;
