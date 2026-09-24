import * as THREE from 'three';
import '../atmosphereUniforms';
import '../dynamicLights';
import '../shadows';
import { ATLAS_COLS } from '../../../data/blocks';
import { ATLAS_PADDING, ATLAS_RAW_TILE_SIZE, ATLAS_STRIDE, getAtlasDimensions } from '../../../utils/textures';
import { FACE_DATA } from '../../world/worldConstants';
import {
    WORLD_LIGHT_DECLARATIONS,
    WORLD_LIGHT_END,
    WORLD_LIGHT_UNIFORMS,
    keyGatedLightsFragmentBegin,
    worldLightPrepare,
} from './worldLighting';

// The chunk materials: three's MeshLambertMaterial, re-lit for voxels.
//
// Three still supplies the key light (with shadows), the hemisphere ambient,
// fog, dynamic lights and program caching; onBeforeCompile swaps in the voxel
// parts, driven by the per-vertex bytes the mesher writes (voxelVertex.ts). The
// light itself is the shared world model (worldLighting.ts), so entities that
// stand among the blocks are lit the same way:
//
//  - Ambient: hemisphere irradiance x (sky light)^2 x AO x a per-axis face
//    shade, so caves go dark by their own light data, corners darken, and
//    every face keeps a readable voxel shade even in full shadow.
//  - Key light (sun or moon): three's direct light and shadow, gated by sky
//    light, so no sun reaches into a cave, with or without shadow maps.
//  - Block light: warm near strong sources, neutral further out, with a
//    slight shared flicker; it reads the same day or night.
//  - The Brightness option: a cool slate floor where the sky can't reach.
//  - Emission: bright texels of light-emitting blocks glow (lava, torches,
//    crystals); Resonant blocks are capped low at the mesher.
//  - Leaves and plants glow when the sun or moon is behind them, and sway in
//    the wind (leaves as whole blocks, plants from the root).
//  - Water and glass reflect the sky and the sun or moon; water ripples on
//    the 16-texel grid.
//  - Pixel shadows (the Pixel shadow style, BasicShadowMap): every texture
//    pixel takes one shadow value, so shadow edges step on the same 16x16 grid
//    as the art.
//  - Chunk fade in/out is an ordered-dither dissolve: depth-correct, no sorting.
//  - The Classic style swaps all of that for the pre-overhaul lighting.

export type VoxelVariant = 'solid' | 'cutout' | 'transparent';

/** Shared by every chunk material and fade clone (and every world-lit entity). */
export const VOXEL_UNIFORMS = WORLD_LIGHT_UNIFORMS;

/** Graphics switches that change only uniforms, never shaders. */
export function setVoxelStyle(options: { wind: boolean; fancyWater: boolean }): void {
    const style = VOXEL_UNIFORMS.atlasVoxelStyle.value;
    style.x = options.wind ? 1 : 0;
    style.y = options.fancyWater ? 1 : 0;
}

/** The floor light (the least light anywhere) for the Brightness option (0..1). */
export const floorLight = (brightness: number): number => 0.015 + Math.max(0, Math.min(1, brightness)) * 0.14;

/** Where the tiles sit in the atlas, for faces the shader tiles itself (geometry.ts packTile). */
const VOXEL_ATLAS_UNIFORMS = {
    /** x atlas columns, y cell stride, z padding, w tile size (texels). */
    atlasTiles: { value: new THREE.Vector4(ATLAS_COLS, ATLAS_STRIDE, ATLAS_PADDING, ATLAS_RAW_TILE_SIZE) },
    /** The atlas's size in texels. */
    atlasTexSize: { value: new THREE.Vector2(1, 1) },
};

/** Per-frame lighting inputs: the Brightness option (0..1), tone-map exposure and a clock. */
export function updateVoxelLighting(brightness: number, exposure: number, timeSeconds: number): void {
    const atlas = getAtlasDimensions();
    VOXEL_ATLAS_UNIFORMS.atlasTexSize.value.set(atlas.width, atlas.height);
    const light = VOXEL_UNIFORMS.atlasVoxelLight.value;
    light.x = floorLight(brightness);
    const flicker = Math.sin(timeSeconds * 7.3) * 0.6 + Math.sin(timeSeconds * 13.1 + 1.7) * 0.4;
    light.y = 1.25 * (1 + 0.035 * flicker);
    light.z = 1 / Math.max(0.05, exposure);
    // Wrapped so the shader's float clock keeps its precision in long sessions.
    light.w = timeSeconds % 3600;
}

// A face direction's UV axes in the world, as the mesher lays them out
// (FACE_DATA: u runs corner 0 -> 1, v runs corner 0 -> 3), for tiled faces.
const TILE_AXES_GLSL = (() => {
    const vec3 = (v: number[]) => `vec3( ${v.map(c => c.toFixed(1)).join(', ')} )`;
    const faces = (['right', 'left', 'top', 'bottom', 'front', 'back'] as const).map((name, i, all) => {
        const { dir, corners: c } = FACE_DATA[name];
        const axis = dir[0] !== 0 ? 0 : dir[1] !== 0 ? 1 : 2;
        const test = `n.${'xyz'[axis]} ${dir[axis] > 0 ? '>' : '<'} ${dir[axis] > 0 ? '0.5' : '-0.5'}`;
        const u = [0, 1, 2].map(a => c[1][a] - c[0][a]);
        const v = [0, 1, 2].map(a => c[3][a] - c[0][a]);
        const branch = i === 0 ? `if ( ${test} )` : i === all.length - 1 ? 'else' : `else if ( ${test} )`;
        return `\t${branch} { u = ${vec3(u)}; v = ${vec3(v)}; }`;
    });
    return `void atlasTileAxes( vec3 n, out vec3 u, out vec3 v ) {\n${faces.join('\n')}\n}`;
})();

const VERTEX_DECLARATIONS = /* glsl */`
uniform vec4 atlasVoxelLight;
uniform vec4 atlasVoxelStyle;
varying float vVoxelClass;
varying float vVoxelEmission;
varying float vVoxelFaceShade;
varying vec3 vVoxelNormal;
#ifdef ATLAS_VOXEL_TILED
attribute float atlasTile;
// Not flat: a tiled quad's four corners carry the same values, so these
// interpolate to them anyway, and flat varyings are costly under ANGLE's D3D11
// backend (it rewrites every indexed draw to emulate GL's provoking vertex).
varying float vAtlasTile;
varying vec3 vAtlasTileCell;
${TILE_AXES_GLSL}
#endif
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
#ifdef ATLAS_VOXEL_TILED
	vAtlasTile = atlasTile;
	// A tiled face's first block (its UV origin's), as the world centre of that
	// block: the fragment steps whole blocks from here by its UV's integer part.
	vec3 atlasTu, atlasTv;
	atlasTileAxes( normal, atlasTu, atlasTv );
	vAtlasTileCell = ( modelMatrix * vec4( position - atlasTu * uv.x - atlasTv * uv.y, 1.0 ) ).xyz
		+ 0.5 * ( atlasTu + atlasTv - normal );
#endif
	// Stylised per-axis shade on the ambient light: tops, east/west, north/south, bottoms.
	vVoxelFaceShade = normal.y > 0.5 ? 1.0 : ( normal.y < -0.5 ? 0.62 : ( abs( normal.x ) > 0.5 ? 0.86 : 0.78 ) );
`;

/**
 * Wind: leaves drift a little as whole blocks, plants bend from the root. The
 * offset depends only on world position, so blocks that share a corner move
 * together and never crack apart. Shared by the chunk material and the depth
 * material foliage casts its shadows with, so a leaf and its shadow sway as one.
 */
const windGlsl = (voxelClass: string, swayBit: string) => /* glsl */`
	float atlasSwayAmount = ( ${voxelClass} > 0.5 && ${voxelClass} < 1.5 ) ? 0.035 : ${swayBit} * 0.1;
	if ( atlasSwayAmount > 0.0 && atlasVoxelStyle.x > 0.0 ) {
		vec3 atlasWindPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
		float atlasWindTime = atlasVoxelLight.w;
		vec2 atlasGust = vec2(
			sin( atlasWindTime * 1.7 + atlasWindPos.x * 0.4 + atlasWindPos.z * 0.23 ) + 0.5 * sin( atlasWindTime * 2.9 + atlasWindPos.z * 0.9 ),
			cos( atlasWindTime * 1.3 + atlasWindPos.z * 0.37 - atlasWindPos.x * 0.17 ) + 0.5 * cos( atlasWindTime * 2.3 + atlasWindPos.x * 0.8 )
		);
		transformed.xz += atlasGust * ( atlasSwayAmount * atlasVoxelStyle.x );
	}
`;

const VERTEX_WIND = /* glsl */`
#include <begin_vertex>
#ifdef ATLAS_VOXEL_CUTOUT
${windGlsl('vVoxelClass', 'atlasSwayBit')}
#endif
`;

const FRAGMENT_DECLARATIONS = /* glsl */`
${WORLD_LIGHT_DECLARATIONS}
#ifdef ATLAS_VOXEL_FADE
uniform float atlasVoxelFade;
#endif
varying float vVoxelClass;
varying float vVoxelEmission;
varying float vVoxelFaceShade;
varying vec3 vVoxelNormal;
float atlasBayer2( vec2 a ) { a = floor( a ); return fract( a.x / 2.0 + a.y * a.y * 0.75 ); }
float atlasBayer4( vec2 a ) { return atlasBayer2( 0.5 * a ) * 0.25 + atlasBayer2( a ); }
#ifdef ATLAS_VOXEL_TILED
varying float vAtlasTile;
varying vec3 vAtlasTileCell;
uniform vec4 atlasTiles;
uniform vec2 atlasTexSize;
${TILE_AXES_GLSL}

// voxelVertex.ts hashFace, in 32-bit unsigned arithmetic.
uint atlasHashFace( ivec3 p, int face ) {
	uint h = ( uint( p.x ) * 0x27d4eb2du ) ^ ( uint( p.y ) * 0x165667b1u ) ^ ( uint( p.z ) * 0x9e3779b1u ) ^ ( uint( face + 1 ) * 0x85ebca6bu );
	h ^= h >> 15u;
	h *= 0x2c1b3c6du;
	h ^= h >> 12u;
	h *= 0x297a2d39u;
	h ^= h >> 15u;
	return h;
}

vec2 atlasTileCorner( int i ) {
	return vec2( ( i == 1 || i == 2 ) ? 1.0 : 0.0, i >= 2 ? 1.0 : 0.0 );
}
#endif
`;

// The pre-overhaul water was lit a little brighter in the dark than solid blocks.
const CLASSIC_FLOOR = /* glsl */`
#ifdef ATLAS_VOXEL_TRANSPARENT
	#define ATLAS_CLASSIC_FLOOR 0.16
#else
	#define ATLAS_CLASSIC_FLOOR 0.05
#endif
`;

const FRAGMENT_MAP = /* glsl */`
#ifdef USE_MAP
	#ifdef ATLAS_VOXEL_TILED
	vec4 sampledDiffuseColor = atlasSampleVoxel( vMapUv );
	#else
	vec4 sampledDiffuseColor = texture2D( map, vMapUv );
	#endif
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
	// Clamped: with MSAA, edge samples extrapolate vertex values slightly past
	// 0..1, and pow() of a negative number is NaN (which bloom would smear).
	atlasSkyLight = clamp( vColor.r, 0.0, 1.0 );
	atlasBlockLight = clamp( vColor.g, 0.0, 1.0 );
	float atlasOpenness = clamp( vColor.b, 0.0, 1.0 );
	atlasAo = 0.5 + 0.5 * atlasOpenness;
	// The old mesher's AO: 14% darker per occluding neighbour.
	atlasClassicAo = 1.0 - 0.42 * ( 1.0 - atlasOpenness );
	atlasFaceShade = vVoxelFaceShade;
${worldLightPrepare('ATLAS_CLASSIC_FLOOR')}
`;

// Needs the map sampler, so it goes in after three declares it, just before main().
const VOXEL_SAMPLE_FUNCTION = /* glsl */`
#if defined( USE_MAP ) && defined( ATLAS_VOXEL_TILED )
// A solid face's texel. Most faces carry atlas UVs; a tiled face (a greedy run
// of full blocks, geometry.ts) carries UVs in blocks, so the tile repeats once
// per block, turned by its quarter turns and each block's own texture variant
// (the same hash the mesher used to bake it, voxelVertex.ts). The mip level
// comes from the unwrapped UV, so it holds steady across block seams.
//
// The derivatives are taken first, outside the branch, and both kinds of face
// share one explicit-gradient fetch: a branch holding a derivative (or a
// plain texture() call) gets flattened on some backends, running both sides
// for every pixel.
vec4 atlasSampleVoxel( vec2 uv ) {
	vec2 gradX = dFdx( uv );
	vec2 gradY = dFdy( uv );
	vec2 coord = uv;
	if ( vAtlasTile < 32767.5 ) {
		int tile = int( vAtlasTile + 0.5 );
		int texIdx = tile & 1023;
		int turnsBase = ( tile >> 10 ) & 3;
		int mode = ( tile >> 12 ) & 3;
		int variant = 0;
		if ( mode != 0 ) {
			vec3 n = vVoxelNormal;
			int face = n.x > 0.5 ? 0 : n.x < -0.5 ? 1 : n.y > 0.5 ? 2 : n.y < -0.5 ? 3 : n.z > 0.5 ? 4 : 5;
			vec3 tu, tv;
			atlasTileAxes( n, tu, tv );
			// The block this texel belongs to, from the UV's whole part: the same
			// number the tile position below takes the fraction of, so the two
			// never disagree along a seam.
			ivec3 block = ivec3( floor( vAtlasTileCell + tu * floor( uv.x ) + tv * floor( uv.y ) ) );
			int h = int( atlasHashFace( block, face ) & 7u );
			// Grass-like blocks only mirror their sides.
			variant = ( mode == 2 && face != 2 && face != 3 ) ? ( h & 4 ) : h;
		}
		// Corner k of the face shows tile corner ((((k + turns) & 3) ^ mirror) + base turns) & 3.
		int turns = variant & 3;
		int mirror = ( variant >> 2 ) & 1;
		vec2 q0 = atlasTileCorner( ( ( turns ^ mirror ) + turnsBase ) & 3 );
		vec2 q1 = atlasTileCorner( ( ( ( ( 1 + turns ) & 3 ) ^ mirror ) + turnsBase ) & 3 );
		vec2 q3 = atlasTileCorner( ( ( ( ( 3 + turns ) & 3 ) ^ mirror ) + turnsBase ) & 3 );
		mat2 orient = mat2( q1 - q0, q3 - q0 );
		float columns = atlasTiles.x;
		vec2 cell = vec2( mod( float( texIdx ), columns ), floor( float( texIdx ) / columns ) );
		vec2 tileSize = vec2( atlasTiles.w ) / atlasTexSize;
		vec2 texel = cell * atlasTiles.y + atlasTiles.z;
		// v runs up the atlas: a tile's bottom edge sits at 1 - (top + size) / height.
		vec2 origin = vec2( texel.x / atlasTexSize.x, 1.0 - ( texel.y + atlasTiles.w ) / atlasTexSize.y );
		coord = origin + ( q0 + orient * fract( uv ) ) * tileSize;
		gradX = ( orient * gradX ) * tileSize;
		gradY = ( orient * gradY ) * tileSize;
	}
	return textureGrad( map, coord, gradX, gradY );
}
#endif
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

// The Pixel shadow style. three picks BasicShadowMap for it, so this is decided
// at compile time: Soft keeps three's filtered lookup untouched.
const PIXEL_SHADOW_FUNCTIONS = /* glsl */`
#include <shadowmap_pars_fragment>
#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
	uniform mat4 directionalShadowMatrix[ NUM_DIR_LIGHT_SHADOWS ];
	float atlasDirectionalShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowBias, float shadowRadius, vec4 shadowCoord, mat4 shadowMatrix ) {
	#if defined( SHADOWMAP_TYPE_BASIC ) && defined( USE_FOG )
		// Look the shadow up at the centre of this fragment's texture pixel, moved
		// only across the face (never off it), so a pixel is lit or shaded whole.
		vec3 atlasWorld = cameraPosition + vAtlasFogOffset;
		vec3 atlasSnapped = ( floor( atlasWorld * 16.0 ) + 0.5 ) / 16.0;
		shadowCoord += shadowMatrix * vec4( ( atlasSnapped - atlasWorld ) * ( 1.0 - abs( vVoxelNormal ) ), 0.0 );
		shadowCoord.xyz /= shadowCoord.w;
		shadowCoord.z += shadowBias;
		if ( shadowCoord.x < 0.0 || shadowCoord.x > 1.0 || shadowCoord.y < 0.0 || shadowCoord.y > 1.0 || shadowCoord.z > 1.0 ) return 1.0;
		// Four texels, bilinearly weighted, then thresholded: the edge lands where
		// the true shadow edge crosses the pixel grid, as a clean stair-step.
		vec2 atlasTexel = 1.0 / shadowMapSize;
		vec2 atlasSt = shadowCoord.xy * shadowMapSize - 0.5;
		vec2 atlasF = fract( atlasSt );
		vec2 atlasBase = ( floor( atlasSt ) + 0.5 ) * atlasTexel;
		float atlasS00 = texture2DCompare( shadowMap, atlasBase, shadowCoord.z );
		float atlasS10 = texture2DCompare( shadowMap, atlasBase + vec2( atlasTexel.x, 0.0 ), shadowCoord.z );
		float atlasS01 = texture2DCompare( shadowMap, atlasBase + vec2( 0.0, atlasTexel.y ), shadowCoord.z );
		float atlasS11 = texture2DCompare( shadowMap, atlasBase + atlasTexel, shadowCoord.z );
		float atlasShadow = step( 0.5, mix( mix( atlasS00, atlasS10, atlasF.x ), mix( atlasS01, atlasS11, atlasF.x ), atlasF.y ) );
		// The same fade at the edge of the shadowed area as three's (shadows.ts).
		vec2 atlasEdge = abs( shadowCoord.xy - 0.5 ) * 2.0;
		return mix( atlasShadow, 1.0, smoothstep( 0.82, 0.98, max( atlasEdge.x, atlasEdge.y ) ) );
	#else
		return getShadow( shadowMap, shadowMapSize, shadowBias, shadowRadius, shadowCoord );
	#endif
	}
#endif
`;

const DIRECTIONAL_SHADOW_CALL = 'getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] )';

/** The shared key-gated light loop, with the voxel shadow lookup for directional lights. */
function voxelLightsFragmentBegin(): string {
    const chunk = keyGatedLightsFragmentBegin();
    if (!chunk.includes(DIRECTIONAL_SHADOW_CALL)) {
        console.warn('[voxelMaterial] three changed the directional shadow call; pixel shadows fall back to soft');
        return chunk;
    }
    return chunk.replace(
        DIRECTIONAL_SHADOW_CALL,
        'atlasDirectionalShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ], directionalShadowMatrix[ i ] )',
    );
}

const FRAGMENT_LIGHTS_END = /* glsl */`
${WORLD_LIGHT_END}
	if ( atlasClassic.x < 0.5 ) {
		// Light-emitting blocks: only their bright texels glow.
		float atlasLuma = dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
		totalEmissiveRadiance += diffuseColor.rgb * ( vVoxelEmission * ( 1.2 / 15.0 ) * atlasVoxelLight.z * smoothstep( 0.2, 0.55, atlasLuma ) );
#if defined( ATLAS_VOXEL_FOLIAGE ) && NUM_DIR_LIGHTS > 0
		// Leaves and plants glow when the sun or moon is behind them: in the light
		// that actually reaches them (directLight is the key light after the sky
		// gate and its shadow), never through the hill the sun has set behind.
		if ( vVoxelClass > 0.5 && vVoxelClass < 2.5 ) {
			float atlasBacklight = pow( saturate( dot( - geometryViewDir, directionalLights[ 0 ].direction ) ), 4.0 );
			reflectedLight.directDiffuse += BRDF_Lambert( diffuseColor.rgb ) * directLight.color * ( atlasBacklight * 0.6 );
		}
#endif
	}
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
    // Only solid chunks hold tiled faces (geometry.ts): the others sample as before.
    if (options.variant === 'solid') defines.ATLAS_VOXEL_TILED = '';
    if (options.fade) defines.ATLAS_VOXEL_FADE = '';
    material.defines = defines;
    if (options.fade) material.userData.atlasFade = { value: 0 };

    material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, VOXEL_UNIFORMS, VOXEL_ATLAS_UNIFORMS);
        if (options.fade) shader.uniforms.atlasVoxelFade = material.userData.atlasFade;

        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', `#include <common>\n${VERTEX_DECLARATIONS}`)
            .replace('#include <color_vertex>', `#include <color_vertex>\n${VERTEX_DECODE}`)
            .replace('#include <begin_vertex>', VERTEX_WIND);

        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', `#include <common>\n${FRAGMENT_DECLARATIONS}\n${CLASSIC_FLOOR}`)
            .replace('#include <shadowmap_pars_fragment>', PIXEL_SHADOW_FUNCTIONS)
            .replace('#include <map_fragment>', FRAGMENT_MAP)
            .replace('#include <color_fragment>', '')
            .replace('#include <normal_fragment_begin>', FRAGMENT_NORMAL)
            .replace('#include <lights_fragment_begin>', voxelLightsFragmentBegin())
            .replace('#include <lights_fragment_end>', FRAGMENT_LIGHTS_END)
            .replace('#include <opaque_fragment>', FRAGMENT_REFLECTIONS)
            .replace('#include <clipping_planes_pars_fragment>', `#include <clipping_planes_pars_fragment>
${VOXEL_SAMPLE_FUNCTION}`);
    };
    // One program per variant, however many clones share it.
    const cacheKey = `atlas-voxel-v5:${options.variant}${options.fade ? ':fade' : ''}`;
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

/**
 * What leaves and plants cast their shadows with: three's packed depth, cut out
 * by the atlas like the chunk material, and swaying with the same wind, so a
 * leaf and its shadow move as one (no shimmer where foliage shadows itself).
 */
export function createCutoutDepthMaterial(map: THREE.Texture | null): THREE.MeshDepthMaterial {
    const material = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map, alphaTest: 0.5 });
    // The packed voxel bytes ride in the colour attribute (voxelVertex.ts).
    material.vertexColors = true;
    material.onBeforeCompile = (shader) => {
        shader.uniforms.atlasVoxelLight = VOXEL_UNIFORMS.atlasVoxelLight;
        shader.uniforms.atlasVoxelStyle = VOXEL_UNIFORMS.atlasVoxelStyle;
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\nuniform vec4 atlasVoxelLight;\nuniform vec4 atlasVoxelStyle;')
            .replace('#include <begin_vertex>', `#include <begin_vertex>
	float atlasPacked = floor( color.a * 255.0 + 0.5 );
	float atlasSwayBit = step( 127.5, atlasPacked );
	float atlasVoxelClassHere = floor( ( atlasPacked - atlasSwayBit * 128.0 ) / 16.0 );
${windGlsl('atlasVoxelClassHere', 'atlasSwayBit')}`);
    };
    material.customProgramCacheKey = () => 'atlas-voxel-cutout-depth-v1';
    return material;
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
