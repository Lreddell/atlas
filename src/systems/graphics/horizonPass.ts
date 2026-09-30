import * as THREE from 'three';
import { HORIZON_DEPTH_UNIFORMS, HORIZON_NEAR_UNIFORM } from './materials/voxelMaterial';

// The horizon's own render pass (the distant terrain, horizon/).
//
// Distant terrain reaches thousands of blocks, and a depth buffer spread from
// a tenth of a block to there has no precision left far out: walls and water
// fight over every pixel, in rings and lines. So, as Distant Horizons does,
// the horizon is drawn with a projection of its own, its near plane just
// inside where the full chunks stop and its far plane at the horizon, into
// targets of its own, and laid into the world's render by two full-screen
// draws that write its depth as the world's camera sees it:
//
//  - its land (terrain, trees, sea floor) right after the sky, so the chunks
//    draw in front of it and clouds, particles, god rays and motion blur all
//    meet distant mountains where they are;
//  - its sea and ice with the world's see-through things, after every solid
//    surface, near or far, so the water blends over whichever sea floor is
//    behind it: the horizon's own, or the full chunks' where a line of sight
//    passes from one to the other.
//
// The world's render stays a single pass (three clears a multisampled
// target's samples after each render), with two more objects in it.

/** Where the land composite falls in the draw order: after the sky's objects (SKY_ORDER), before the clouds. */
export const HORIZON_LAND_ORDER = -200;
/** The sea composite: among see-through things, before the chunks' own water (WATER_ORDER). */
export const HORIZON_SEA_ORDER = -0.75;

/** Its meshes' layers in its scene: land draws first, then the sea behind it. */
export const HORIZON_LAND_LAYER = 1;
export const HORIZON_SEA_LAYER = 2;

const COMPOSITE_VERTEX = /* glsl */`
varying vec2 vUv;
void main() {
	vUv = position.xy * 0.5 + 0.5;
	gl_Position = vec4( position.xy, 0.0, 1.0 );
}
`;

const COMPOSITE_FRAGMENT = /* glsl */`
uniform sampler2D tHorizonColor;
uniform sampler2D tHorizonDepth;
// x, y: the horizon's near and far planes; z, w: the world camera's.
uniform vec4 uNearFar;
varying vec2 vUv;
void main() {
	vec4 color = texture2D( tHorizonColor, vUv );
	if ( color.a < 0.004 ) discard;
	// The horizon's depth back to a distance, then into the world camera's depth.
	float d = texture2D( tHorizonDepth, vUv ).r;
	float viewZ = uNearFar.x * uNearFar.y / ( uNearFar.y - d * ( uNearFar.y - uNearFar.x ) );
	float ndc = ( uNearFar.w + uNearFar.z - 2.0 * uNearFar.w * uNearFar.z / viewZ ) / ( uNearFar.w - uNearFar.z );
	gl_FragDepth = clamp( ndc * 0.5 + 0.5, 0.0, 0.999999 );
	// Premultiplied: it was drawn over transparent black.
	gl_FragColor = color;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}
`;

/** The world's sky and key light, which the horizon copies (DayNightCycle sets them). */
export const worldLights: { hemi: THREE.HemisphereLight | null; key: THREE.DirectionalLight | null } = { hemi: null, key: null };

const scratchPosition = new THREE.Vector3();
const scratchColor = new THREE.Color();
/** A near plane no chunk reaches: while the horizon draws nothing, the chunks' water never gives way to it. */
const NOWHERE = 1e9;

interface Layer {
    target: THREE.WebGLRenderTarget | null;
    composite: THREE.Mesh;
    uniforms: { tHorizonColor: { value: THREE.Texture | null }; tHorizonDepth: { value: THREE.Texture | null }; uNearFar: { value: THREE.Vector4 } };
}

function makeLayer(name: string, order: number, sea: boolean): Layer {
    const uniforms = {
        tHorizonColor: { value: null as THREE.Texture | null },
        tHorizonDepth: { value: null as THREE.Texture | null },
        uNearFar: { value: new THREE.Vector4(1, 2, 0.1, 1000) },
    };
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    const material = new THREE.ShaderMaterial({
        vertexShader: COMPOSITE_VERTEX,
        fragmentShader: COMPOSITE_FRAGMENT,
        uniforms,
        // Land always lands (it is the first thing past the sky) and writes its
        // depth; the sea tests against every solid surface and writes none.
        depthTest: true,
        depthFunc: sea ? THREE.LessEqualDepth : THREE.AlwaysDepth,
        depthWrite: !sea,
        transparent: sea,
        blending: THREE.CustomBlending,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneMinusSrcAlphaFactor,
        blendSrcAlpha: THREE.OneFactor,
        blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    });
    const composite = new THREE.Mesh(geometry, material);
    composite.name = name;
    composite.frustumCulled = false;
    composite.renderOrder = order;
    composite.visible = false;
    composite.matrixAutoUpdate = false;
    return { target: null, composite, uniforms };
}

export class HorizonPass {
    /** The horizon's terrain and sea, with copies of the world's lights (never casting shadows). */
    readonly scene = new THREE.Scene();
    readonly camera = new THREE.PerspectiveCamera();
    /** The horizon's near and far planes (blocks from the camera). */
    near = 64;
    far = 4096;
    /** Whether there is anything to draw. */
    active = false;

    private readonly land = makeLayer('horizonLand', HORIZON_LAND_ORDER, false);
    private readonly sea = makeLayer('horizonSea', HORIZON_SEA_ORDER, true);
    private readonly hemi = new THREE.HemisphereLight();
    private readonly key = new THREE.DirectionalLight();

    constructor() {
        this.scene.matrixAutoUpdate = false;
        for (const light of [this.hemi, this.key]) light.layers.enableAll();
        this.scene.add(this.hemi, this.key, this.key.target);
    }

    /** The two draws the world's render lays the horizon in with. */
    get composites(): THREE.Mesh[] {
        return [this.land.composite, this.sea.composite];
    }

    /**
     * Draws the horizon as `camera` sees it into its targets (width x height,
     * the land with `samples` MSAA samples) and points the composites at them.
     * `world` is the scene they draw in, for its fog.
     */
    render(gl: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera, world: THREE.Scene, width: number, height: number, samples: number): void {
        if (!this.active || width <= 0 || height <= 0) {
            this.land.composite.visible = false;
            this.sea.composite.visible = false;
            HORIZON_NEAR_UNIFORM.value = NOWHERE;
            return;
        }
        HORIZON_NEAR_UNIFORM.value = this.near;
        const landTarget = this.ensureTarget(this.land, width, height, samples);
        const seaTarget = this.ensureTarget(this.sea, width, height, 0);
        this.syncLights();
        this.scene.fog = world.fog;
        this.syncCamera(camera);

        const previousTarget = gl.getRenderTarget();
        const previousAlpha = gl.getClearAlpha();
        gl.getClearColor(scratchColor);
        gl.setClearColor(0x000000, 0);
        const view = this.camera;
        // Land first, then the sea, hidden behind the land by its depth.
        view.layers.set(HORIZON_LAND_LAYER);
        gl.setRenderTarget(landTarget);
        gl.clear(true, true, false);
        gl.render(this.scene, view);
        HORIZON_DEPTH_UNIFORMS.atlasHorizonDepth.value = landTarget.depthTexture;
        HORIZON_DEPTH_UNIFORMS.atlasHorizonSize.value.set(width, height);
        view.layers.set(HORIZON_SEA_LAYER);
        gl.setRenderTarget(seaTarget);
        gl.clear(true, true, false);
        gl.render(this.scene, view);
        gl.setRenderTarget(previousTarget);
        gl.setClearColor(scratchColor, previousAlpha);

        for (const [layer, target] of [[this.land, landTarget], [this.sea, seaTarget]] as const) {
            layer.uniforms.tHorizonColor.value = target.texture;
            layer.uniforms.tHorizonDepth.value = target.depthTexture;
            layer.uniforms.uNearFar.value.set(this.near, this.far, camera.near, camera.far);
            layer.composite.visible = true;
        }
    }

    dispose(): void {
        HORIZON_NEAR_UNIFORM.value = NOWHERE;
        for (const layer of [this.land, this.sea]) {
            layer.target?.depthTexture?.dispose();
            layer.target?.dispose();
            layer.target = null;
            layer.composite.visible = false;
        }
    }

    private syncCamera(camera: THREE.PerspectiveCamera): void {
        const view = this.camera;
        camera.updateMatrixWorld();
        view.matrixAutoUpdate = false;
        view.matrix.copy(camera.matrixWorld);
        view.matrix.decompose(view.position, view.quaternion, view.scale);
        view.matrixWorld.copy(camera.matrixWorld);
        view.matrixWorldInverse.copy(camera.matrixWorldInverse);
        if (view.fov !== camera.fov || view.aspect !== camera.aspect || view.near !== this.near || view.far !== this.far || view.zoom !== camera.zoom) {
            view.fov = camera.fov;
            view.aspect = camera.aspect;
            view.zoom = camera.zoom;
            view.near = this.near;
            view.far = this.far;
            view.updateProjectionMatrix();
        }
    }

    private ensureTarget(layer: Layer, width: number, height: number, samples: number): THREE.WebGLRenderTarget {
        let target = layer.target;
        if (target && target.samples !== samples) {
            target.depthTexture?.dispose();
            target.dispose();
            target = null;
        }
        if (!target) {
            target = new THREE.WebGLRenderTarget(width, height, {
                type: THREE.HalfFloatType,
                minFilter: THREE.NearestFilter,
                magFilter: THREE.NearestFilter,
                depthBuffer: true,
                samples,
            });
            // Unsigned-int depth, so a multisampled target's depth resolves into it.
            target.depthTexture = new THREE.DepthTexture(width, height);
            target.depthTexture.type = THREE.UnsignedIntType;
            target.stencilBuffer = false;
            layer.target = target;
        } else if (target.width !== width || target.height !== height) {
            target.setSize(width, height);
        }
        return target;
    }

    /** The world's sky light and key light, copied (their shadows stay with the world). */
    private syncLights(): void {
        const hemi = worldLights.hemi;
        if (hemi) {
            this.hemi.color.copy(hemi.color);
            this.hemi.groundColor.copy(hemi.groundColor);
            this.hemi.intensity = hemi.intensity;
            this.hemi.position.copy(hemi.getWorldPosition(scratchPosition));
            this.hemi.visible = hemi.visible;
            this.hemi.updateMatrixWorld();
        }
        const key = worldLights.key;
        if (key) {
            this.key.color.copy(key.color);
            this.key.intensity = key.intensity;
            this.key.visible = key.visible;
            this.key.position.copy(key.getWorldPosition(scratchPosition));
            this.key.target.position.copy(key.target.getWorldPosition(scratchPosition));
            this.key.updateMatrixWorld();
            this.key.target.updateMatrixWorld();
        }
    }
}

/** The one horizon pass. */
export const horizonPass = new HorizonPass();
