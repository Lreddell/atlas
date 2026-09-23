import * as THREE from 'three';

// Point lights without three.js point lights.
//
// Every THREE.PointLight added to or removed from the scene changes the light
// count, and three recompiles every lit material when it does: mounting a boss
// with its arena lights hitched the game for every shader in the world, and the
// lights that sat mounted at intensity 0 made every terrain fragment loop over
// them anyway. Instead, boss and arena lights register here, and one shared
// uniform array (at most MAX_DYNAMIC_LIGHTS, uploaded per render) feeds a loop
// patched into three's lighting chunk. The shader never changes, so nothing
// recompiles; with no lights registered the loop exits at once.
//
// The maths matches three's physically based point light (colour x intensity,
// getDistanceAttenuation(distance, decay)), so a light moved here looks the same.

export const MAX_DYNAMIC_LIGHTS = 12;

export interface DynamicLight {
    /** World-space position; set it every frame for lights that move. */
    readonly position: THREE.Vector3;
    readonly color: THREE.Color;
    intensity: number;
    /** Cutoff distance in blocks (like PointLight.distance). */
    distance: number;
    decay: number;
}

export interface DynamicLightInit {
    color?: THREE.ColorRepresentation;
    intensity?: number;
    distance?: number;
    decay?: number;
}

const registered = new Set<DynamicLight>();

export const dynamicLights = {
    create(init: DynamicLightInit = {}): DynamicLight {
        const light: DynamicLight = {
            position: new THREE.Vector3(),
            color: new THREE.Color(init.color ?? 0xffffff),
            intensity: init.intensity ?? 0,
            distance: init.distance ?? 16,
            decay: init.decay ?? 2,
        };
        registered.add(light);
        return light;
    },
    remove(light: DynamicLight): void {
        registered.delete(light);
    },
    /** Lights currently registered (tests and debugging). */
    count(): number {
        return registered.size;
    },
};

// Two vec4 per light: [x, y, z, distance], [r, g, b (x intensity), decay].
const lightData = new Float32Array(MAX_DYNAMIC_LIGHTS * 8);
// A plain-object vec4 so UniformsUtils.clone shares it by reference (x = light count).
const lightInfo = { x: 0, y: 0, z: 0, w: 0 };

export const DYNAMIC_LIGHT_UNIFORMS = {
    atlasDynamicLights: { value: lightData },
    atlasDynamicLightInfo: { value: lightInfo },
};

const ranked: DynamicLight[] = [];
const cameraScratch = new THREE.Vector3();

/**
 * Packs the lights that matter most for this camera into the shared uniforms.
 * Called before every render (see DynamicLightsBridge); allocation-free.
 */
export function packDynamicLights(camera?: THREE.Camera): void {
    ranked.length = 0;
    for (const light of registered) {
        if (light.intensity > 0 && light.distance > 0) ranked.push(light);
    }
    if (ranked.length > MAX_DYNAMIC_LIGHTS && camera) {
        // Nearest light volumes first.
        const eye = camera.getWorldPosition(cameraScratch);
        ranked.sort((a, b) => (a.position.distanceTo(eye) - a.distance) - (b.position.distanceTo(eye) - b.distance));
    }
    const count = Math.min(ranked.length, MAX_DYNAMIC_LIGHTS);
    for (let i = 0; i < count; i++) {
        const light = ranked[i];
        const o = i * 8;
        lightData[o] = light.position.x;
        lightData[o + 1] = light.position.y;
        lightData[o + 2] = light.position.z;
        lightData[o + 3] = light.distance;
        lightData[o + 4] = light.color.r * light.intensity;
        lightData[o + 5] = light.color.g * light.intensity;
        lightData[o + 6] = light.color.b * light.intensity;
        lightData[o + 7] = light.decay;
    }
    lightInfo.x = count;
}

let installed = false;

/**
 * Adds the dynamic-light loop to three's shared lighting chunks, and the
 * uniforms to every lit ShaderLib entry. Idempotent; runs at import.
 */
export function installDynamicLights(): void {
    if (installed) return;
    installed = true;

    THREE.ShaderChunk.lights_pars_begin += /* glsl */`
uniform vec4 atlasDynamicLights[ ${MAX_DYNAMIC_LIGHTS * 2} ];
uniform vec4 atlasDynamicLightInfo;
`;
    // After three's own lights, before the ambient/hemisphere part is consumed.
    THREE.ShaderChunk.lights_fragment_begin += /* glsl */`
#if defined( RE_Direct )
	for ( int i = 0; i < ${MAX_DYNAMIC_LIGHTS}; i ++ ) {
		if ( float( i ) >= atlasDynamicLightInfo.x ) break;
		vec4 atlasLightA = atlasDynamicLights[ i * 2 ];
		vec4 atlasLightB = atlasDynamicLights[ i * 2 + 1 ];
		vec3 atlasLightVector = ( viewMatrix * vec4( atlasLightA.xyz, 1.0 ) ).xyz - geometryPosition;
		float atlasLightDistance = length( atlasLightVector );
		directLight.direction = atlasLightVector / max( atlasLightDistance, 1e-4 );
		directLight.color = atlasLightB.rgb * getDistanceAttenuation( atlasLightDistance, atlasLightA.w, atlasLightB.w );
		directLight.visible = true;
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
#endif
`;

    for (const lib of Object.values(THREE.ShaderLib) as { uniforms?: Record<string, THREE.IUniform> }[]) {
        if (lib.uniforms && 'ambientLightColor' in lib.uniforms) Object.assign(lib.uniforms, DYNAMIC_LIGHT_UNIFORMS);
    }
}

installDynamicLights();
