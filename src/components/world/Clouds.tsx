import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { GlobalNoise } from '../../utils/noise';
import { CHUNK_SIZE } from '../../constants';
import { registerCloudHandlers } from './cloudState';
import { ATMOSPHERE_GLSL, ATMOSPHERE_UNIFORMS } from '../../systems/graphics/atmosphereUniforms';
import { SKY_ORDER } from '../../systems/graphics/skyObjects';
import {
    CLOUD_CELL,
    CLOUD_GLSL,
    CLOUD_REACH,
    CLOUD_SHADE_GLSL,
    CLOUD_SPEED,
    CLOUD_THICKNESS,
    CLOUD_UNIFORMS,
    setCloudCover,
    updateCloudLayer,
} from '../../systems/graphics/cloudLayer';
import type { CloudQuality } from '../../systems/graphics/graphicsSettings';

// The clouds: one slab of voxel clouds (cloudLayer.ts), traced pixel by pixel.
//
// A triangle covers the screen and every pixel follows its own view ray
// through the slab, cell by cell across the cloud map, to the first cloud face
// it meets. So the clouds are exact voxels at any distance with no geometry to
// rebuild as the player moves or the clouds drift, and they reach 128 chunks
// out whatever the render distance, fading into the haze at the horizon.
// Where a cell is smaller than a pixel, the ray reads the map's mipmaps
// instead: the average cover along its way through the slab, lit as the
// cloud sides and bases that make it up, so far clouds never shimmer.
//
// Only the nearest face shows, so a cloud reads as one volume from any side.
// The clouds draw after every sky object, and a cloud lets through as much of
// what is behind it as its thickness along the view allows, alike for all of
// it, as real cloud does: thin rims and clipped corners are soft, a view
// straight through the slab shows the bright aurora, moon, sun and meteors
// dimly, a long look along a cloud shows nothing, while the faint stars are
// lost (each star checks the clouds along its own line of sight, so none
// shows inside a cloud). Far off, the clouds take the haze's colour, as the
// terrain does. (Classic keeps its old, more translucent clouds.) The pixel
// takes the hit's depth, so terrain in front hides the cloud (peaks rise
// through the layer), and water or particles drawn later sort against it.

const VERTEX = /* glsl */`
varying vec3 vCloudRay;
void main() {
	// The point on the far plane under this corner, turned into world axes.
	vec4 far = inverse( projectionMatrix ) * vec4( position.xy, 1.0, 1.0 );
	vCloudRay = ( far.xyz / far.w ) * mat3( viewMatrix );
	gl_Position = vec4( position.xy, 0.0, 1.0 );
}
`;

const FRAGMENT = /* glsl */`
#define ATLAS_FOG_CLOUDS
#include <common>
#include <lights_pars_begin>
${ATMOSPHERE_GLSL}
${CLOUD_GLSL}
${CLOUD_SHADE_GLSL}
// three declares it for the vertex stage only; the same uniform, shared.
uniform mat4 projectionMatrix;
// The view's angle per pixel (radians): how many cells a pixel spans out there.
uniform float atlasCloudPixel;
varying vec3 vCloudRay;

// How much of what is behind it a cloud hides, from how far the view runs
// through it: a view straight through the slab lets a little through, a long
// look along a cloud nothing, the same from above as from below. Every face
// keeps most of its body even where the view only clips it (by a face's edge,
// or a corner): fading there turned faces to glowing glass toward their edges.
// (The layer's own opacity multiplies this.)
float atlasCloudSolid( float through ) {
	return atlasClassicSky.w > 0.5 ? 1.0 : mix( 0.75, 1.0, 1.0 - exp( -through * 0.4 ) );
}

bool atlasCloudAt( ivec2 cell, ivec2 size ) {
	ivec2 wrapped = cell - size * ivec2( floor( vec2( cell ) / vec2( size ) ) );
	return texelFetch( atlasCloudMap, wrapped, 0 ).r > 0.5;
}

// The clouds along the stretch tA..tB of the ray, averaged from the map's
// mipmaps: rgb their light (hazed), a how much of the view they cover. tMid
// is where along the ray that light is taken.
vec4 atlasCloudAverage( vec3 dir, float tA, float tB, float footprint, out float tMid ) {
	tMid = 0.5 * ( tA + tB );
	vec3 rel = dir * tMid;
	vec4 cell = textureLod( atlasCloudMap, atlasCloudUv( rel.xz ), log2( max( footprint, 1.0 ) ) );
	float horizontal = length( dir.xz );
	// A ray that crosses several cells meets a cloud in any one of them.
	float crossed = 1.0 + ( tB - tA ) * horizontal * atlasCloudGrid.z;
	float cover = 1.0 - pow( 1.0 - clamp( cell.r, 0.0, 0.999 ), crossed );
	// Far off and low in the sky, a cloud shows more of its sides than its base.
	float sides = ${(CLOUD_THICKNESS / CLOUD_CELL).toFixed(4)} * ( abs( dir.x ) + abs( dir.z ) );
	vec3 facing = horizontal > 1e-4 ? -vec3( dir.x, 0.0, dir.z ) / horizontal : vec3( 0.0 );
	vec3 n = normalize( mix( vec3( 0.0, dir.y > 0.0 ? -1.0 : 1.0, 0.0 ), facing, sides / ( sides + abs( dir.y ) ) ) );
	float inner = cell.g / max( cell.r, 1e-3 );
	vec3 light = atlasCloudLight( n, dir, inner, 0.5 );
	return vec4( atlasApplyFog( light, rel ), cover * atlasCloudSolid( 4.0 + 8.0 * inner ) );
}

void main() {
	vec3 dir = normalize( vCloudRay );
	// The stretch of the ray inside the layer, out to its reach.
	float tIn = 0.0;
	float tOut = atlasCloudLayer.w / max( length( dir.xz ), 1e-4 );
	float toBase = atlasCloudLayer.x - cameraPosition.y;
	float toTop = atlasCloudLayer.y - cameraPosition.y;
	if ( abs( dir.y ) > 1e-5 ) {
		float ta = toBase / dir.y;
		float tb = toTop / dir.y;
		tIn = max( min( ta, tb ), 0.0 );
		tOut = min( tOut, max( ta, tb ) );
	} else if ( toBase > 0.0 || toTop < 0.0 ) {
		discard;
	}
	if ( tOut <= tIn || atlasCloudLayer.z <= 0.0 ) discard;

	// How many cells a pixel spans, along the view, where the ray enters.
	float footprint = tIn * atlasCloudPixel * atlasCloudGrid.z / max( abs( dir.y ), 0.03 );
	float detail = 1.0 - smoothstep( 0.5, 1.5, footprint );

	// Near: trace the cells to the first face.
	vec4 near = vec4( 0.0 );
	float tNear = tIn;
	if ( detail > 0.0 ) {
		ivec2 size = textureSize( atlasCloudMap, 0 );
		vec2 perT = dir.xz * atlasCloudGrid.z;
		vec2 p = atlasCloudGrid.xy + perT * tIn;
		ivec2 cell = ivec2( floor( p ) );
		ivec2 stepCell = ivec2( sign( perT ) );
		vec2 tDelta = vec2( perT.x != 0.0 ? abs( 1.0 / perT.x ) : 1e30, perT.y != 0.0 ? abs( 1.0 / perT.y ) : 1e30 );
		vec2 f = p - floor( p );
		vec2 tNext = tIn + vec2( perT.x > 0.0 ? 1.0 - f.x : f.x, perT.y > 0.0 ? 1.0 - f.y : f.y ) * tDelta;
		// From inside a cloud, its inner walls are what shows.
		bool inside = tIn == 0.0 && atlasCloudAt( cell, size );
		int face = 0; // 0 the layer's floor or ceiling, 1 an x side, 2 a z side
		float t = tIn;
		float tHit = -1.0;
		if ( !inside && atlasCloudAt( cell, size ) ) {
			tHit = tIn;
		} else {
			for ( int i = 0; i < 48; i++ ) {
				if ( tNext.x < tNext.y ) {
					t = tNext.x;
					tNext.x += tDelta.x;
					cell.x += stepCell.x;
					face = 1;
				} else {
					t = tNext.y;
					tNext.y += tDelta.y;
					cell.y += stepCell.y;
					face = 2;
				}
				if ( t >= tOut ) {
					if ( inside ) {
						tHit = tOut;
						face = 0;
					}
					t = tOut;
					break;
				}
				if ( atlasCloudAt( cell, size ) != inside ) {
					tHit = t;
					break;
				}
			}
		}
		// How far the view runs through the cloud it met: on to where it
		// leaves it (or, from inside one, back to the eye).
		float through = tHit;
		if ( tHit >= 0.0 && !inside ) {
			float tLeave = tOut;
			for ( int i = 0; i < 16; i++ ) {
				float tStep;
				if ( tNext.x < tNext.y ) {
					tStep = tNext.x;
					tNext.x += tDelta.x;
					cell.x += stepCell.x;
				} else {
					tStep = tNext.y;
					tNext.y += tDelta.y;
					cell.y += stepCell.y;
				}
				if ( tStep >= tOut ) break;
				if ( !atlasCloudAt( cell, size ) ) {
					tLeave = tStep;
					break;
				}
			}
			through = tLeave - tHit;
		}
		if ( tHit >= 0.0 ) {
			// The face toward the viewer.
			vec3 n = face == 1 ? vec3( -float( stepCell.x ), 0.0, 0.0 )
				: face == 2 ? vec3( 0.0, 0.0, -float( stepCell.y ) )
				: vec3( 0.0, dir.y > 0.0 ? -1.0 : 1.0, 0.0 );
			vec3 rel = dir * tHit;
			float inner = textureLod( atlasCloudMap, atlasCloudUv( rel.xz ), 0.0 ).g;
			float height = clamp( ( cameraPosition.y + rel.y - atlasCloudLayer.x ) / ( atlasCloudLayer.y - atlasCloudLayer.x ), 0.0, 1.0 );
			near = vec4( atlasApplyFog( atlasCloudLight( n, dir, inner, height ), rel ), atlasCloudSolid( through ) );
			tNear = tHit;
		} else if ( t < tOut ) {
			// Out of steps before the end of the layer: the rest of it, averaged.
			float further = t * atlasCloudPixel * atlasCloudGrid.z / max( abs( dir.y ), 0.03 );
			near = atlasCloudAverage( dir, t, tOut, further, tNear );
		}
	}
	// Far: the average.
	vec4 far = vec4( 0.0 );
	float tFar = tIn;
	if ( detail < 1.0 ) far = atlasCloudAverage( dir, tIn, tOut, footprint, tFar );

	float cover = mix( far.a, near.a, detail );
	if ( cover < 0.002 ) discard;
	gl_FragColor = vec4( mix( far.rgb * far.a, near.rgb * near.a, detail ) / cover, cover * atlasCloudLayer.z );

	// The hit's own depth; past the far plane, just in front of the sky.
	vec4 clip = projectionMatrix * vec4( mat3( viewMatrix ) * ( dir * ( detail > 0.5 ? tNear : tFar ) ), 1.0 );
	gl_FragDepth = min( 0.5 * clip.z / clip.w + 0.5, 0.99999 );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}
`;

const NO_RAYCAST = () => undefined;

// Set every frame by DayNightCycle (updateCloudColor): the time of day's cover and the style.
let naturalOpacity = 0.85;
let classicStyle = false;
// Luminous clouds are a constant soft white: the scene's key and sky lights
// colour them (gold at sunset, moonlit blue at night) and the atmosphere fogs
// them. Classic: white by day, dimmed to a dark blue-grey at night.
const CLOUD_ALBEDO = new THREE.Color(0xf3f5fb);
const CLASSIC_CLOUD_NIGHT = new THREE.Color(0x1a1a2e).multiplyScalar(0.4);
const CLASSIC_CLOUD_DAY = new THREE.Color(0xffffff);

const updateCloudColor = (dayFactor: number, classic: boolean) => {
    classicStyle = classic;
    const color = CLOUD_UNIFORMS.atlasCloudColor.value;
    if (classic) color.lerpColors(CLASSIC_CLOUD_NIGHT, CLASSIC_CLOUD_DAY, dayFactor);
    else color.copy(CLOUD_ALBEDO);
    // Luminous clouds are nearly solid: a night cloud is a moonlit shape that
    // an aurora or the moon still glows through, dimly. Classic matches the
    // old renderer, which blended both of a cloud's faces.
    naturalOpacity = classic ? 0.84 + 0.12 * dayFactor : 1;
};

registerCloudHandlers({ updateColor: updateCloudColor });

/** The cloud map from the bundled image (white = cloud), or a noise pattern without one. Loaded once. */
let coverRequested = false;

function generateProceduralCover(): void {
    const width = 256;
    const height = 256;
    const data = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            let n = GlobalNoise.terrain.noise2D(x * 0.03, y * 0.03);
            n += GlobalNoise.terrain.noise2D(x * 0.1, y * 0.1) * 0.5;
            data[y * width + x] = n > 0.4 ? 1 : 0;
        }
    }
    setCloudCover(width, height, data);
}

function coverFromImage(img: ImageBitmap): boolean {
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return false;
    ctx.drawImage(img, 0, 0);
    const pixels = ctx.getImageData(0, 0, img.width, img.height).data;
    const data = new Uint8Array(img.width * img.height);
    let clouds = 0;
    for (let i = 0; i < data.length; i++) {
        if (pixels[i * 4 + 3] > 50 && pixels[i * 4] > 100) {
            data[i] = 1;
            clouds++;
        }
    }
    if (clouds === 0) return false;
    setCloudCover(img.width, img.height, data);
    return true;
}

async function loadCover(): Promise<void> {
    const rawPath = 'assets/textures/environment/clouds.png';
    for (const url of [`/${rawPath}`, rawPath]) {
        try {
            const response = await fetch(url);
            if (!response.ok) continue;
            // Decoded as a bitmap: an <img>'s decode() waits while the window is hidden.
            const bitmap = await createImageBitmap(await response.blob());
            const loaded = coverFromImage(bitmap);
            bitmap.close();
            if (loaded) return;
        } catch {
            // Try the next location, then fall back to noise.
        }
    }
    generateProceduralCover();
}

/** How long the clouds take to fade in or out when switched on or off (seconds). */
const TOGGLE_FADE = 0.6;

export const Clouds: React.FC<{ isPaused: boolean; renderDistance: number; quality: CloudQuality }> = ({ isPaused, renderDistance, quality }) => {
    const { camera } = useThree();
    const meshRef = useRef<THREE.Mesh>(null);
    const driftRef = useRef(0);
    const visibilityRef = useRef(quality === 'off' ? 0 : 1);

    const geometry = useMemo(() => {
        // One triangle over the whole screen.
        const triangle = new THREE.BufferGeometry();
        triangle.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
        return triangle;
    }, []);
    const material = useMemo(() => new THREE.ShaderMaterial({
        uniforms: {
            ...THREE.UniformsUtils.clone(THREE.UniformsLib.lights),
            ...ATMOSPHERE_UNIFORMS,
            ...CLOUD_UNIFORMS,
            atlasCloudPixel: { value: 0.002 },
        },
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        lights: true,
        transparent: true,
        depthWrite: true,
    }), []);
    useEffect(() => () => {
        geometry.dispose();
        material.dispose();
    }, [geometry, material]);

    useEffect(() => {
        if (coverRequested) return;
        coverRequested = true;
        void loadCover();
    }, []);

    useFrame((state, delta) => {
        const visibility = THREE.MathUtils.clamp(
            visibilityRef.current + (quality === 'off' ? -delta : delta) / TOGGLE_FADE, 0, 1);
        visibilityRef.current = visibility;
        if (!isPaused) driftRef.current += delta * CLOUD_SPEED;

        // Classic keeps the old reach (a little past the render distance); Luminous
        // clouds the sky out to its horizon.
        const classicReach = Math.min(renderDistance * 2, renderDistance + 16) * CHUNK_SIZE;
        const reach = classicStyle ? classicReach : CLOUD_REACH;
        ATMOSPHERE_UNIFORMS.atlasCloudFog.value.x = reach * 0.6;
        ATMOSPHERE_UNIFORMS.atlasCloudFog.value.y = reach;
        const eased = visibility * visibility * (3 - 2 * visibility);
        updateCloudLayer({
            cameraX: camera.position.x,
            cameraZ: camera.position.z,
            drift: driftRef.current,
            opacity: naturalOpacity * eased,
            visibility: eased,
            shadows: quality === 'fancy' && !classicStyle ? eased : 0,
            reach,
        });

        const fov = (camera as THREE.PerspectiveCamera).fov ?? 70;
        material.uniforms.atlasCloudPixel.value = 2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2)
            / Math.max(1, state.size.height * state.viewport.dpr);
        if (meshRef.current) meshRef.current.visible = eased > 0;
    });

    return (
        <mesh
            ref={meshRef}
            geometry={geometry}
            material={material}
            renderOrder={SKY_ORDER.clouds}
            frustumCulled={false}
            raycast={NO_RAYCAST}
        />
    );
};
