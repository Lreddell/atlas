import * as THREE from 'three';
import '../atmosphereUniforms';
import '../dynamicLights';
import '../shadows';
import { ATLAS_PADDING, ATLAS_RAW_TILE_SIZE, ATLAS_STRIDE } from '../../../utils/textures';

// The chunk materials: three's MeshLambertMaterial, re-lit for voxels.
//
// Three still supplies the key light (with shadows), the hemisphere ambient,
// fog, dynamic lights and program caching; onBeforeCompile swaps in the voxel
// parts, driven by the per-vertex bytes the mesher writes (voxelVertex.ts):
//
//  - Ambient: hemisphere irradiance x (sky light)^2 x AO x a per-axis face
//    shade, so caves go dark by their own light data, corners darken, and
//    every face keeps a readable voxel shade even in full shadow.
//  - Key light (sun or moon): three's direct light and shadow, gated by sky
//    light, so no sun reaches into a cave, with or without shadow maps.
//  - Block light: warm near strong sources, neutral further out, with a
//    slight shared flicker; it reads the same day or night.
//  - The Brightness option: a cool slate floor where the sky can't reach,
//    the same after exposure day or night.
//  - Emission: bright texels of light-emitting blocks glow (lava, torches,
//    crystals); Resonant blocks are capped low at the mesher.
//  - Leaves and plants glow when the sun or moon is behind them, and sway in
//    the wind (leaves as whole blocks, plants from the root).
//  - Water and glass reflect the sky and the sun or moon; water ripples on
//    the 16-texel grid. Lava flows through its tile a texel at a time.
//  - Chunk fade in/out is an ordered-dither dissolve: depth-correct, no sorting.

export type VoxelVariant = 'solid' | 'cutout' | 'transparent';

/** Shared by every chunk material and fade clone: one write per frame reaches them all. */
export const VOXEL_UNIFORMS = {
    atlasTorchColor: { value: new THREE.Color(1.0, 0.55, 0.24) },
    /** x floor light, y torch strength (with flicker), z 1 / exposure, w clock (seconds). */
    atlasVoxelLight: { value: { x: 0.085, y: 1.25, z: 1, w: 0 } },
    /** x wind strength (0 = still), y 1 for water and glass reflections and ripples. */
    atlasVoxelStyle: { value: { x: 1, y: 1, z: 0, w: 0 } },
};

/** Graphics-preset switches that change only uniforms, never shaders. */
export function setVoxelStyle(options: { wind: boolean; fancyWater: boolean }): void {
    const style = VOXEL_UNIFORMS.atlasVoxelStyle.value;
    style.x = options.wind ? 1 : 0;
    style.y = options.fancyWater ? 1 : 0;
}

/** Per-frame lighting inputs: the Brightness option (0..1), tone-map exposure and a clock. */
export function updateVoxelLighting(brightness: number, exposure: number, timeSeconds: number): void {
    const light = VOXEL_UNIFORMS.atlasVoxelLight.value;
    light.x = 0.015 + Math.max(0, Math.min(1, brightness)) * 0.14;
    const flicker = Math.sin(timeSeconds * 7.3) * 0.6 + Math.sin(timeSeconds * 13.1 + 1.7) * 0.4;
    light.y = 1.25 * (1 + 0.035 * flicker);
    light.z = 1 / Math.max(0.05, exposure);
    // Wrapped so the shader's float clock keeps its precision in long sessions.
    light.w = timeSeconds % 3600;
}

const VERTEX_DECLARATIONS = /* glsl */`
uniform vec4 atlasVoxelLight;
uniform vec4 atlasVoxelStyle;
varying float vVoxelClass;
varying float vVoxelEmission;
varying float vVoxelFaceShade;
varying vec3 vVoxelNormal;
`;

const VERTEX_DECODE = /* glsl */`
	// Voxel bytes (voxelVertex.ts): a = sway bit | class << 4 | emission.
	float atlasPacked = floor( color.a * 255.0 + 0.5 );
	float atlasSwayBit = step( 127.5, atlasPacked );
	atlasPacked -= atlasSwayBit * 128.0;
	vVoxelClass = floor( atlasPacked / 16.0 );
	vVoxelEmission = atlasPacked - vVoxelClass * 16.0;
	// Chunks are never rotated, so the object normal is the world normal.
	vVoxelNormal = normal;
	// Stylised per-axis shade on the ambient light: tops, east/west, north/south, bottoms.
	vVoxelFaceShade = normal.y > 0.5 ? 1.0 : ( normal.y < -0.5 ? 0.62 : ( abs( normal.x ) > 0.5 ? 0.86 : 0.78 ) );
`;

const VERTEX_WIND = /* glsl */`
#include <begin_vertex>
#ifdef ATLAS_VOXEL_CUTOUT
	// Wind: leaves drift a little as whole blocks, plants bend from the root.
	// The offset depends only on world position, so blocks that share a corner
	// move together and never crack apart.
	float atlasSwayAmount = ( vVoxelClass > 0.5 && vVoxelClass < 1.5 ) ? 0.035 : atlasSwayBit * 0.1;
	if ( atlasSwayAmount > 0.0 && atlasVoxelStyle.x > 0.0 ) {
		vec3 atlasWindPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
		float atlasWindTime = atlasVoxelLight.w;
		vec2 atlasGust = vec2(
			sin( atlasWindTime * 1.7 + atlasWindPos.x * 0.4 + atlasWindPos.z * 0.23 ) + 0.5 * sin( atlasWindTime * 2.9 + atlasWindPos.z * 0.9 ),
			cos( atlasWindTime * 1.3 + atlasWindPos.z * 0.37 - atlasWindPos.x * 0.17 ) + 0.5 * cos( atlasWindTime * 2.3 + atlasWindPos.x * 0.8 )
		);
		transformed.xz += atlasGust * ( atlasSwayAmount * atlasVoxelStyle.x );
	}
#endif
`;

const FRAGMENT_DECLARATIONS = /* glsl */`
uniform vec3 atlasTorchColor;
uniform vec4 atlasVoxelLight;
uniform vec4 atlasVoxelStyle;
#ifdef ATLAS_VOXEL_FADE
uniform float atlasVoxelFade;
#endif
varying float vVoxelClass;
varying float vVoxelEmission;
varying float vVoxelFaceShade;
varying vec3 vVoxelNormal;
float atlasSkyLight;
float atlasBlockLight;
float atlasAo;
float atlasVoxelKeyGate;
float atlasBayer2( vec2 a ) { a = floor( a ); return fract( a.x / 2.0 + a.y * a.y * 0.75 ); }
float atlasBayer4( vec2 a ) { return atlasBayer2( 0.5 * a ) * 0.25 + atlasBayer2( a ); }
`;

const FRAGMENT_MAP = /* glsl */`
#ifdef USE_MAP
	vec2 atlasMapUv = vMapUv;
	#if defined( ATLAS_VOXEL_CUTOUT ) && __VERSION__ >= 300
	if ( vVoxelClass > 3.5 && vVoxelClass < 4.5 ) {
		// Lava flows: its tile scrolls within itself, one whole texel at a time.
		vec2 atlasSize = vec2( textureSize( map, 0 ) );
		vec2 atlasPx = vec2( atlasMapUv.x, 1.0 - atlasMapUv.y ) * atlasSize;
		vec2 atlasTile = floor( atlasPx / ${ATLAS_STRIDE.toFixed(1)} ) * ${ATLAS_STRIDE.toFixed(1)} + ${ATLAS_PADDING.toFixed(1)};
		vec2 atlasInTile = atlasPx - atlasTile;
		atlasInTile.y = mod( atlasInTile.y - floor( atlasVoxelLight.w * 3.0 ), ${ATLAS_RAW_TILE_SIZE.toFixed(1)} );
		atlasPx = atlasTile + atlasInTile;
		atlasMapUv = vec2( atlasPx.x / atlasSize.x, 1.0 - atlasPx.y / atlasSize.y );
	}
	#endif
	vec4 sampledDiffuseColor = texture2D( map, atlasMapUv );
	#ifdef ATLAS_VOXEL_CUTOUT
	sampledDiffuseColor.a = sampledDiffuseColor.a >= 0.5 ? 1.0 : 0.0;
	sampledDiffuseColor.rgb *= sampledDiffuseColor.a;
	#endif
	diffuseColor *= sampledDiffuseColor;
#endif
#ifdef ATLAS_VOXEL_FADE
	// Dissolve in and out on a 4x4 ordered-dither pattern.
	if ( atlasBayer4( gl_FragCoord.xy ) >= atlasVoxelFade ) discard;
#endif
	atlasSkyLight = vColor.r;
	atlasBlockLight = vColor.g;
	atlasAo = 0.5 + 0.5 * vColor.b;
	// The sun and moon only reach surfaces that are open to the sky.
	atlasVoxelKeyGate = smoothstep( 0.5, 0.95, atlasSkyLight );
`;

const FRAGMENT_NORMAL = /* glsl */`
#include <normal_fragment_begin>
#ifdef ATLAS_VOXEL_CUTOUT
	// Cross sprites (plants, torches, crystals) are lit like the ground they
	// stand on, from both sides; a flipped back-face normal would turn them black.
	if ( ( vVoxelClass > 1.5 && vVoxelClass < 2.5 ) || vVoxelClass > 5.5 ) {
		normal = normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz );
	}
#endif
`;

const FRAGMENT_LIGHTS_END = /* glsl */`
	// Ambient: how open the sky is, AO, and the per-axis face shade.
	float atlasSkyVisibility = atlasSkyLight * atlasSkyLight;
	irradiance *= atlasSkyVisibility * atlasAo * vVoxelFaceShade;
	// Torches, lava and lamps: warm near a strong source, fading to a neutral
	// glow further out (so faint lights like glow lichen don't tint a cave
	// orange). Like the floor below, it reads the same day or night.
	vec3 atlasTorchTint = mix( vec3( 0.86, 0.84, 0.8 ), atlasTorchColor, smoothstep( 0.4, 0.9, atlasBlockLight ) );
	irradiance += atlasTorchTint * ( pow( atlasBlockLight, 2.2 ) * atlasAo * atlasVoxelLight.y * atlasVoxelLight.z * PI );
	// The Brightness option: a cool slate floor where the sky can't reach (caves).
	irradiance += vec3( 0.55, 0.62, 0.78 ) * ( atlasVoxelLight.x * atlasVoxelLight.z * ( 1.0 - atlasSkyVisibility ) * atlasAo * vVoxelFaceShade * PI );
#include <lights_fragment_end>
	// Light-emitting blocks: only their bright texels glow.
	float atlasLuma = dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
	totalEmissiveRadiance += diffuseColor.rgb * ( vVoxelEmission * ( 1.2 / 15.0 ) * atlasVoxelLight.z * smoothstep( 0.2, 0.55, atlasLuma ) );
#if defined( ATLAS_VOXEL_FOLIAGE ) && NUM_DIR_LIGHTS > 0
	// Leaves and plants glow when the sun or moon is behind them.
	if ( vVoxelClass > 0.5 && vVoxelClass < 2.5 ) {
		float atlasBacklight = pow( saturate( dot( - geometryViewDir, directionalLights[ 0 ].direction ) ), 4.0 );
		reflectedLight.directDiffuse += BRDF_Lambert( diffuseColor.rgb ) * directionalLights[ 0 ].color * ( atlasBacklight * 0.6 * atlasVoxelKeyGate );
	}
#endif
`;

const FRAGMENT_REFLECTIONS = /* glsl */`
#if defined( ATLAS_VOXEL_TRANSPARENT ) && defined( USE_FOG )
	// Water and glass reflect the sky and the sun or moon, more at grazing angles.
	if ( atlasVoxelStyle.y > 0.5 && gl_FrontFacing ) {
		vec3 atlasEye = normalize( vAtlasFogOffset );
		vec3 atlasN = normalize( vVoxelNormal );
		bool atlasIsWater = vVoxelClass > 2.5 && vVoxelClass < 3.5;
		// Ripples on the 16-texel grid, so the surface reads as pixel art up close;
		// they calm with distance, where they would only alias into stripes.
		float atlasRippleFade = 1.0 - smoothstep( 10.0, 40.0, length( vAtlasFogOffset ) );
		if ( atlasIsWater && atlasN.y > 0.5 && atlasRippleFade > 0.0 ) {
			vec2 atlasCell = floor( ( cameraPosition.xz + vAtlasFogOffset.xz ) * 16.0 ) / 16.0;
			float atlasT = atlasVoxelLight.w;
			vec2 atlasRipple = vec2(
				sin( atlasCell.x * 2.1 + atlasT * 1.3 ) + sin( ( atlasCell.x + atlasCell.y ) * 1.3 - atlasT * 0.9 ),
				cos( atlasCell.y * 1.9 - atlasT * 1.1 ) + cos( ( atlasCell.x - atlasCell.y ) * 1.7 + atlasT * 0.7 )
			) * ( 0.022 * atlasRippleFade );
			atlasN = normalize( vec3( atlasRipple.x, 1.0, atlasRipple.y ) );
		}
		vec3 atlasR = reflect( atlasEye, atlasN );
		float atlasF0 = atlasIsWater ? 0.02 : 0.04;
		float atlasFresnel = atlasF0 + ( 1.0 - atlasF0 ) * pow( 1.0 - saturate( dot( - atlasEye, atlasN ) ), 5.0 );
		// Out of the sky's reach (under an overhang, in a cave) there is nothing bright to reflect.
		vec3 atlasReflected = atlasSkyRadiance( atlasR ) * ( atlasSkyLight * atlasSkyLight );
		#if NUM_DIR_LIGHTS > 0
		vec3 atlasKeyWorld = normalize( ( vec4( directionalLights[ 0 ].direction, 0.0 ) * viewMatrix ).xyz );
		atlasReflected += directionalLights[ 0 ].color * ( pow( saturate( dot( atlasR, atlasKeyWorld ) ), 220.0 ) * 6.0 * atlasVoxelKeyGate );
		#endif
		outgoingLight = mix( outgoingLight, atlasReflected, atlasFresnel );
		diffuseColor.a = mix( diffuseColor.a, 1.0, atlasFresnel * 0.8 );
	}
#endif
#include <opaque_fragment>
`;

const DIRECTIONAL_INFO = 'getDirectionalLightInfo( directionalLight, directLight );';

/** three's light loop with the key light gated by sky light (dynamic lights are not gated). */
function voxelLightsFragmentBegin(): string {
    const chunk = THREE.ShaderChunk.lights_fragment_begin;
    if (!chunk.includes(DIRECTIONAL_INFO)) {
        console.warn('[voxelMaterial] three changed lights_fragment_begin; key light is not sky-gated');
        return chunk;
    }
    return chunk.replace(DIRECTIONAL_INFO, `${DIRECTIONAL_INFO}\n\t\tdirectLight.color *= atlasVoxelKeyGate;`);
}

interface VoxelMaterialOptions {
    variant: VoxelVariant;
    fade: boolean;
}

function installVoxelShader(material: THREE.MeshLambertMaterial, options: VoxelMaterialOptions): void {
    const defines: Record<string, string> = {};
    if (options.variant === 'cutout') {
        defines.ATLAS_VOXEL_CUTOUT = '';
        defines.ATLAS_VOXEL_FOLIAGE = '';
    }
    if (options.variant === 'transparent') defines.ATLAS_VOXEL_TRANSPARENT = '';
    if (options.fade) defines.ATLAS_VOXEL_FADE = '';
    material.defines = defines;
    if (options.fade) material.userData.atlasFade = { value: 0 };

    material.onBeforeCompile = (shader) => {
        shader.uniforms.atlasTorchColor = VOXEL_UNIFORMS.atlasTorchColor;
        shader.uniforms.atlasVoxelLight = VOXEL_UNIFORMS.atlasVoxelLight;
        shader.uniforms.atlasVoxelStyle = VOXEL_UNIFORMS.atlasVoxelStyle;
        if (options.fade) shader.uniforms.atlasVoxelFade = material.userData.atlasFade;

        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', `#include <common>\n${VERTEX_DECLARATIONS}`)
            .replace('#include <color_vertex>', `#include <color_vertex>\n${VERTEX_DECODE}`)
            .replace('#include <begin_vertex>', VERTEX_WIND);

        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', `#include <common>\n${FRAGMENT_DECLARATIONS}`)
            .replace('#include <map_fragment>', FRAGMENT_MAP)
            .replace('#include <color_fragment>', '')
            .replace('#include <normal_fragment_begin>', FRAGMENT_NORMAL)
            .replace('#include <lights_fragment_begin>', voxelLightsFragmentBegin())
            .replace('#include <lights_fragment_end>', FRAGMENT_LIGHTS_END)
            .replace('#include <opaque_fragment>', FRAGMENT_REFLECTIONS);
    };
    // One program per variant, however many clones share it.
    const cacheKey = `atlas-voxel-v2:${options.variant}${options.fade ? ':fade' : ''}`;
    material.customProgramCacheKey = () => cacheKey;
    material.needsUpdate = true;
}

function createVoxelMaterial(variant: VoxelVariant, map: THREE.Texture | null): THREE.MeshLambertMaterial {
    const material = new THREE.MeshLambertMaterial({ map, vertexColors: true });
    if (variant === 'solid') {
        material.side = THREE.FrontSide;
    } else if (variant === 'cutout') {
        material.alphaTest = 0.5;
        material.side = THREE.DoubleSide;
    } else {
        material.transparent = true;
        material.opacity = 0.6;
        material.side = THREE.DoubleSide;
        material.depthWrite = false;
    }
    installVoxelShader(material, { variant, fade: false });
    return material;
}

export interface VoxelMaterials {
    solid: THREE.MeshLambertMaterial;
    cutout: THREE.MeshLambertMaterial;
    transparent: THREE.MeshLambertMaterial;
}

/** The three shared chunk materials. */
export function createVoxelMaterials(map: THREE.Texture | null): VoxelMaterials {
    return {
        solid: createVoxelMaterial('solid', map),
        cutout: createVoxelMaterial('cutout', map),
        transparent: createVoxelMaterial('transparent', map),
    };
}

/**
 * Clones for one fading chunk. They stay opaque (depth-writing) and dissolve
 * through atlasVoxelFade instead, so they sort and occlude like the shared ones.
 */
export function createVoxelFadeMaterials(shared: VoxelMaterials, startFade: number): VoxelMaterials {
    const clone = (source: THREE.MeshLambertMaterial, variant: VoxelVariant) => {
        const material = source.clone();
        installVoxelShader(material, { variant, fade: true });
        material.userData.atlasFade.value = startFade;
        return material;
    };
    return {
        solid: clone(shared.solid, 'solid'),
        cutout: clone(shared.cutout, 'cutout'),
        transparent: clone(shared.transparent, 'transparent'),
    };
}

/** 0 = fully dissolved, 1 = fully visible. */
export function setVoxelFade(materials: VoxelMaterials, amount: number): void {
    materials.solid.userData.atlasFade.value = amount;
    materials.cutout.userData.atlasFade.value = amount;
    materials.transparent.userData.atlasFade.value = amount;
}

export function disposeVoxelMaterials(materials: VoxelMaterials): void {
    materials.solid.dispose();
    materials.cutout.dispose();
    materials.transparent.dispose();
}
