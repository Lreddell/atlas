import * as THREE from 'three';
import { buildCloudMap, sampleCloudCover, type CloudMap } from './cloudMap';

// The one cloud layer, shared by everything that sees or feels it: the layer
// itself (components/world/Clouds.tsx traces it pixel by pixel), the blocks
// and entities whose sunlight it shadows (worldLighting.ts), the water that
// reflects it (voxelMaterial.ts), and the sky, whose sun glow dims while a
// cloud covers the sun (DayNightCycle.tsx).
//
// The layer is a slab of voxel clouds: cells of CLOUD_CELL blocks, CLOUD_THICKNESS
// tall from CLOUD_BASE up, drifting toward +x, laid out by a tiling map
// (cloudMap.ts). Every shader finds a point on the map from its offset from the
// camera and where the camera is on the map (atlasCloudGrid), so positions stay
// small and precise however far out the world goes.

export const CLOUD_BASE = 192;
export const CLOUD_THICKNESS = 4;
/** Blocks per map cell. */
export const CLOUD_CELL = 12;
/** Drift toward +x, blocks per second. */
export const CLOUD_SPEED = 1;
/** How far out the layer reaches: 128 chunks whatever the render distance, so the sky is clouded to its horizon. */
export const CLOUD_REACH = 2048;
/** The share of the key light a full cloud keeps off the ground. */
export const CLOUD_SHADOW_STRENGTH = 0.72;

const placeholder = new THREE.DataTexture(new Uint8Array(4), 1, 1);
placeholder.needsUpdate = true;

/** Shared uniform objects: assigned by reference into every material that uses them. */
export const CLOUD_UNIFORMS = {
    atlasCloudMap: { value: placeholder as THREE.Texture },
    /** xy where the camera is on the map, in cells (wrapped into it); z 1 / CLOUD_CELL; w shadow strength (0 = none). */
    atlasCloudGrid: { value: { x: 0, y: 0, z: 1 / CLOUD_CELL, w: 0 } },
    /** x base height, y top height, z the layer's opacity (0 = hidden), w its reach in blocks. */
    atlasCloudLayer: { value: { x: CLOUD_BASE, y: CLOUD_BASE + CLOUD_THICKNESS, z: 0, w: CLOUD_REACH } },
    /** The clouds' own colour (Classic tints it by the time of day). */
    atlasCloudColor: { value: new THREE.Color(0xf3f5fb) },
};

/** Declarations and the shadow lookup; any shader with a camera offset `rel` to a world point. */
export const CLOUD_GLSL = /* glsl */`
uniform sampler2D atlasCloudMap;
uniform vec4 atlasCloudGrid;
uniform vec4 atlasCloudLayer;
uniform vec3 atlasCloudColor;

// The map texture coordinate under a point, from its horizontal offset from the camera.
vec2 atlasCloudUv( vec2 relXZ ) {
	return ( atlasCloudGrid.xy + relXZ * atlasCloudGrid.z ) / vec2( textureSize( atlasCloudMap, 0 ) );
}

// How much cloud lies along a line of sight dir (world, from the camera):
// 0 clear, 1 behind a cloud. For points of light such as the stars.
float atlasCloudCoverAlong( vec3 dir ) {
	if ( atlasCloudLayer.z <= 0.0 || abs( dir.y ) < 0.01 ) return 0.0;
	float t = ( 0.5 * ( atlasCloudLayer.x + atlasCloudLayer.y ) - cameraPosition.y ) / dir.y;
	if ( t <= 0.0 ) return 0.0;
	vec2 at = dir.xz * t;
	float reach = 1.0 - smoothstep( 0.6, 1.0, length( at ) / atlasCloudLayer.w );
	// Crisp at the clouds' own voxel edges; far off, where a pixel spans
	// several cells, their average.
	float cover = smoothstep( 0.25, 0.75, textureLod( atlasCloudMap, atlasCloudUv( at ), log2( max( t / 600.0, 1.0 ) ) ).r );
	return clamp( cover * reach * atlasCloudLayer.z, 0.0, 1.0 );
}

// How much of the key light (world direction keyDir, toward it) reaches the
// point rel through the clouds: 1 in the open, less in a cloud's shadow.
float atlasCloudSunlight( vec3 rel, vec3 keyDir ) {
	if ( atlasCloudGrid.w <= 0.0 || keyDir.y < 0.05 ) return 1.0;
	float t = ( 0.5 * ( atlasCloudLayer.x + atlasCloudLayer.y ) - cameraPosition.y - rel.y ) / keyDir.y;
	if ( t <= 0.0 ) return 1.0;
	float cover = textureLod( atlasCloudMap, atlasCloudUv( rel.xz + keyDir.xz * t ), 0.0 ).r;
	// Long, faint shadows while the sun is low.
	return 1.0 - atlasCloudGrid.w * cover * smoothstep( 0.05, 0.3, keyDir.y );
}
`;

/**
 * A cloud's light, for the layer and for its reflections. Needs CLOUD_GLSL,
 * the atmosphere (ATMOSPHERE_GLSL) and three's lights declared before it.
 */
export const CLOUD_SHADE_GLSL = /* glsl */`
// The light off a cloud face with world normal n, seen along viewDir. inner is
// how deep in a big cloud the face sits (0 on its rim, 1 in its middle), and
// height how far up the layer (0 its base, 1 its top).
vec3 atlasCloudLight( vec3 n, vec3 viewDir, float inner, float height ) {
	vec3 keyDir = vec3( 0.0, 1.0, 0.0 );
	vec3 keyColor = vec3( 0.0 );
	vec3 skyColor = vec3( 0.0 );
	vec3 groundColor = vec3( 0.0 );
#if NUM_DIR_LIGHTS > 0
	keyDir = inverseTransformDirection( directionalLights[ 0 ].direction, viewMatrix );
	keyColor = directionalLights[ 0 ].color;
#endif
#if NUM_HEMI_LIGHTS > 0
	skyColor = hemisphereLights[ 0 ].skyColor;
	groundColor = hemisphereLights[ 0 ].groundColor;
#endif
	if ( atlasClassicSky.w > 0.5 ) {
		// Classic: the old clouds' plain Lambert light.
		vec3 irradiance = mix( groundColor, skyColor, 0.5 * n.y + 0.5 ) + keyColor * max( dot( n, keyDir ), 0.0 );
		return atlasCloudColor * irradiance * RECIPROCAL_PI;
	}
	// The blocks' per-axis shade (tops 1, east/west 0.86, north/south 0.78,
	// bases 0.62), blended for the tilted normals of far, averaged clouds.
	vec3 a = abs( n );
	float sides = a.x + a.z;
	float shade = ( max( n.y, 0.0 ) + 0.62 * max( -n.y, 0.0 ) + 0.86 * a.x + 0.78 * a.z ) / max( sides + a.y, 1e-4 );
	// A cloud's sides darken toward its base, which its own body shades: soft
	// and rounded rather than flat slabs.
	shade *= mix( 1.0, mix( 0.74, 1.06, height ), sides / max( sides + a.y, 1e-4 ) );
	float base = max( -n.y, 0.0 );
	// A cloud hangs in open sky, so even its base sees a good share of the sky's light...
	vec3 ambient = mix( groundColor, skyColor, 0.72 + 0.28 * n.y ) * shade;
	// ...and looks down on the hazy horizon all round, glowing with it: pale by
	// day, warm at sunrise and sunset.
	vec3 horizon = mix( vec3( dot( atlasSkyHorizonSun, vec3( 0.2126, 0.7152, 0.0722 ) ) ), atlasSkyHorizonSun, 0.5 );
	ambient += horizon * ( PI * 0.18 * base );
	// Little light gets into the middle of a big cloud: its base goes grey there
	// while its rim stays bright.
	ambient *= 1.0 - 0.35 * inner * base;
	// Around sunrise and sunset, and for a while after the sun has set, the low
	// sun lights the undersides from its side of the sky: gold, then orange,
	// then pink as it sinks, brightest toward it.
	float lowSun = ( 1.0 - smoothstep( 0.02, 0.35, atlasSunDir.y ) ) * smoothstep( -0.16, -0.02, atlasSunDir.y );
	float towardSun = dot( normalize( viewDir.xz + 1e-5 ), normalize( atlasSunDir.xz + 1e-5 ) ) * 0.5 + 0.5;
	ambient += atlasSunGlow * ( PI * 0.35 * base * lowSun * ( 0.2 + 0.8 * towardSun * towardSun ) * ( 1.0 - 0.5 * inner ) );
	// Under an aurora, the clouds glow with its light, most where it shines
	// through them from behind.
	ambient += atlasAuroraGlow * ( PI * 0.8 * ( 0.2 + 0.8 * smoothstep( -0.3, 0.8, -viewDir.z ) ) );
	// The sun or moon on the faces that see it; through a thin cloud (not a
	// thick one) some of it soaks down to the base; and where it is behind a
	// cloud's rim, a silver lining.
	float direct = max( dot( n, keyDir ), 0.0 )
		+ base * max( keyDir.y, 0.0 ) * 0.45 * ( 1.0 - 0.9 * inner )
		+ pow( max( dot( viewDir, keyDir ), 0.0 ), 8.0 ) * 0.7 * ( 1.0 - 0.8 * inner );
	// Light bounced about inside a cloud leaves it brighter than a white wall in the same light.
	return ( ambient + keyColor * direct ) * ( 2.0 * RECIPROCAL_PI ) * atlasCloudColor;
}

// The clouds a ray from rel along dir (world, upward) meets, averaged over
// blur cells: rgb their light, a how much of the view they cover. For
// reflections, where only a blur of them shows.
vec4 atlasCloudsSeen( vec3 rel, vec3 dir, float blur ) {
	if ( atlasCloudLayer.z <= 0.0 || dir.y < 0.02 ) return vec4( 0.0 );
	float t = ( 0.5 * ( atlasCloudLayer.x + atlasCloudLayer.y ) - cameraPosition.y - rel.y ) / dir.y;
	if ( t <= 0.0 ) return vec4( 0.0 );
	vec3 at = rel + dir * t;
	vec4 cell = textureLod( atlasCloudMap, atlasCloudUv( at.xz ), log2( max( blur, 1.0 ) ) );
	float cover = cell.r * atlasCloudLayer.z * ( 1.0 - smoothstep( 0.6, 1.0, length( at.xz ) / atlasCloudLayer.w ) );
	vec3 light = atlasCloudLight( vec3( 0.0, -1.0, 0.0 ), dir, cell.g / max( cell.r, 1e-3 ), 0.0 );
	return vec4( atlasApplyFog( light, at ), cover );
}
`;

let map: CloudMap | null = null;
let texture: THREE.DataTexture | null = null;
let drift = 0;
let visibility = 0;

/** Lays out the sky from one byte per cell (non-zero = cloud), row-major. */
export function setCloudCover(width: number, height: number, cover: Uint8Array): void {
    map = buildCloudMap(width, height, cover);
    const next = new THREE.DataTexture(map.rgba, width, height, THREE.RGBAFormat, THREE.UnsignedByteType);
    next.wrapS = THREE.RepeatWrapping;
    next.wrapT = THREE.RepeatWrapping;
    next.magFilter = THREE.LinearFilter;
    // Mipmapped: far clouds and reflections read an average of many cells.
    next.minFilter = THREE.LinearMipmapLinearFilter;
    next.generateMipmaps = true;
    next.needsUpdate = true;
    texture?.dispose();
    texture = next;
    CLOUD_UNIFORMS.atlasCloudMap.value = next;
}

export interface CloudFrame {
    cameraX: number;
    cameraZ: number;
    /** Blocks the clouds have drifted toward +x. */
    drift: number;
    /** The layer's opacity: 0 hidden. */
    opacity: number;
    /** 0..1 how far the layer is switched on (it fades in and out). */
    visibility: number;
    /** 0..1 how strongly they shadow the ground (0 = no shadows). */
    shadows: number;
    /** How far out the layer reaches, in blocks. */
    reach: number;
}

/** One frame of the layer's state into the shared uniforms. */
export function updateCloudLayer(frame: CloudFrame): void {
    drift = frame.drift;
    visibility = frame.visibility;
    const grid = CLOUD_UNIFORMS.atlasCloudGrid.value;
    const width = map?.width ?? 1;
    const height = map?.height ?? 1;
    const cellX = (frame.cameraX - frame.drift) / CLOUD_CELL;
    const cellZ = frame.cameraZ / CLOUD_CELL;
    grid.x = cellX - Math.floor(cellX / width) * width;
    grid.y = cellZ - Math.floor(cellZ / height) * height;
    grid.w = map ? CLOUD_SHADOW_STRENGTH * frame.shadows : 0;
    const layer = CLOUD_UNIFORMS.atlasCloudLayer.value;
    layer.z = map ? frame.opacity : 0;
    layer.w = frame.reach;
}

/**
 * How much of the sky toward (dirX, dirY, dirZ) a cloud covers, seen from a
 * point: 0 clear, 1 behind a full cloud. For dimming the sun or moon.
 */
export function cloudCoverToward(x: number, y: number, z: number, dirX: number, dirY: number, dirZ: number): number {
    if (!map || visibility <= 0 || dirY < 0.02) return 0;
    const t = (CLOUD_BASE + CLOUD_THICKNESS / 2 - y) / dirY;
    if (t <= 0) return 0;
    return visibility * sampleCloudCover(map, (x + dirX * t - drift) / CLOUD_CELL, (z + dirZ * t) / CLOUD_CELL);
}
