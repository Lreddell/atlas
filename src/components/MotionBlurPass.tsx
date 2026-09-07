import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
    MOTION_BLUR_MIN_PIXELS, MOTION_BLUR_SAMPLES, blurScale, isCameraCut,
    maxBlurPixels, motionBlurHistory,
} from '../systems/render/motionBlur';

// Scene-only motion blur, by camera reprojection.
//
// Mounted ONLY while the setting is on. Its useFrame runs at priority 1, which
// switches off R3F's automatic render and hands this component the frame; with
// the component unmounted, R3F renders exactly as it did before and none of the
// render targets below exist. That is what makes "off" cost nothing.
//
// The HUD is untouched by construction: everything here happens inside the WebGL
// canvas, on the scene's own colour and depth buffers. The DOM overlays (hearts,
// hotbar, crosshair, boss bar, polarity and low-health rims, menus) are siblings
// of the canvas in the page and cannot be reached from a shader.
//
// PER PIXEL: read depth, rebuild the world position, project it with LAST frame's
// view-projection, and the difference between where the point is now and where it
// was is that pixel's screen-space velocity. Gather along it. A still camera
// produces a zero vector and therefore a pixel-identical image, which is the
// property a fullscreen blur can never have.

const VERTEX = /* glsl */`
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const FRAGMENT = /* glsl */`
precision highp float;

varying vec2 vUv;

uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform mat4 uInverseViewProjection;   // this frame's, to rebuild world position
uniform mat4 uPreviousViewProjection;  // last frame's, to find where it used to be
uniform vec2 uResolution;
uniform float uScale;                  // shutter x strength x frame-rate normalisation
uniform float uMaxPixels;              // hard ceiling on the gather length

const int SAMPLES = ${MOTION_BLUR_SAMPLES};

void main() {
    vec4 color = texture2D(tColor, vUv);
    float depth = texture2D(tDepth, vUv).x;

    // The far plane is sky: it has no surface to have moved, and reprojecting it
    // produces enormous vectors that would smear the horizon on every turn.
    if (depth >= 1.0) { gl_FragColor = color; return; }

    vec4 clip = vec4(vUv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
    vec4 world = uInverseViewProjection * clip;
    world /= world.w;

    vec4 previousClip = uPreviousViewProjection * world;
    if (previousClip.w <= 0.0) { gl_FragColor = color; return; }
    vec2 previousUv = (previousClip.xy / previousClip.w) * 0.5 + 0.5;

    vec2 velocity = (vUv - previousUv) * uScale;

    // Clamp in PIXELS, so the ceiling means the same thing at every resolution.
    vec2 pixels = velocity * uResolution;
    float length_ = length(pixels);
    if (length_ < ${MOTION_BLUR_MIN_PIXELS.toFixed(3)}) { gl_FragColor = color; return; }
    if (length_ > uMaxPixels) velocity *= uMaxPixels / length_;

    // Gather centred on the pixel: a one-sided trail drags the image toward its
    // own past and reads as lag rather than blur.
    vec4 sum = color;
    float weight = 1.0;
    for (int i = 1; i < SAMPLES; i++) {
        float t = float(i) / float(SAMPLES - 1) - 0.5;
        vec2 uv = vUv + velocity * t;
        if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) continue;
        sum += texture2D(tColor, uv);
        weight += 1.0;
    }
    gl_FragColor = sum / weight;
}
`;

export const MotionBlurPass: React.FC = () => {
    const { gl, scene, size } = useThree();

    // Everything allocated once. A per-frame `new` here would be a garbage
    // collection every few seconds at 60 fps.
    const target = useMemo(() => {
        const rt = new THREE.WebGLRenderTarget(1, 1, {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            type: THREE.UnsignedByteType,
        });
        rt.depthTexture = new THREE.DepthTexture(1, 1);
        rt.depthTexture.type = THREE.UnsignedIntType;
        rt.stencilBuffer = false;
        return rt;
    }, []);

    const material = useMemo(() => new THREE.ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        depthTest: false,
        depthWrite: false,
        uniforms: {
            tColor: { value: null },
            tDepth: { value: null },
            uInverseViewProjection: { value: new THREE.Matrix4() },
            uPreviousViewProjection: { value: new THREE.Matrix4() },
            uResolution: { value: new THREE.Vector2(1, 1) },
            uScale: { value: 0 },
            uMaxPixels: { value: 0 },
        },
    }), []);

    const quad = useMemo(() => {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
        geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2));
        return new THREE.Mesh(geometry, material);
    }, [material]);
    const quadScene = useMemo(() => new THREE.Scene().add(quad), [quad]);
    const quadCamera = useMemo(() => new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), []);

    const previousViewProjection = useRef(new THREE.Matrix4());
    const previousPosition = useRef(new THREE.Vector3());
    const previousForward = useRef(new THREE.Vector3(0, 0, -1));
    const scratchForward = useRef(new THREE.Vector3());
    const scratchMatrix = useRef(new THREE.Matrix4());

    // Mounting is itself a discontinuity: there is no previous frame to compare to.
    useEffect(() => {
        motionBlurHistory.dirty = true;
        return () => {
            // Leaving must not strand the renderer on the offscreen target, or the
            // frame after the toggle renders into a target nobody presents.
            gl.setRenderTarget(null);
            motionBlurHistory.dirty = true;
        };
    }, [gl]);

    useEffect(() => {
        const width = Math.max(1, Math.floor(size.width * gl.getPixelRatio()));
        const height = Math.max(1, Math.floor(size.height * gl.getPixelRatio()));
        target.setSize(width, height);
        material.uniforms.uResolution.value.set(width, height);
        // A resized target has no valid history: its contents are undefined.
        motionBlurHistory.dirty = true;
    }, [size.width, size.height, gl, target, material]);

    useEffect(() => () => {
        target.depthTexture?.dispose();
        target.dispose();
        material.dispose();
        quad.geometry.dispose();
    }, [target, material, quad]);

    useFrame(({ camera: cam }, delta) => {
        const perspective = cam as THREE.PerspectiveCamera;
        perspective.updateMatrixWorld();

        const viewProjection = scratchMatrix.current.multiplyMatrices(
            perspective.projectionMatrix,
            perspective.matrixWorldInverse,
        );

        // A cut nothing reported still has to be caught: reprojecting across one
        // compares two unrelated cameras and streaks the whole frame.
        perspective.getWorldDirection(scratchForward.current);
        const moved = perspective.position.distanceTo(previousPosition.current);
        const facing = scratchForward.current.dot(previousForward.current);
        const cut = motionBlurHistory.dirty || isCameraCut(moved, facing);
        if (cut) {
            previousViewProjection.current.copy(viewProjection);
            motionBlurHistory.dirty = false;
        }

        // Scene into the offscreen target, then the blur to the canvas.
        gl.setRenderTarget(target);
        gl.clear();
        gl.render(scene, cam);
        gl.setRenderTarget(null);

        material.uniforms.tColor.value = target.texture;
        material.uniforms.tDepth.value = target.depthTexture;
        material.uniforms.uInverseViewProjection.value.copy(viewProjection).invert();
        material.uniforms.uPreviousViewProjection.value.copy(previousViewProjection.current);
        material.uniforms.uScale.value = blurScale(delta);
        material.uniforms.uMaxPixels.value = maxBlurPixels(material.uniforms.uResolution.value.x);
        gl.render(quadScene, quadCamera);

        previousViewProjection.current.copy(viewProjection);
        previousPosition.current.copy(perspective.position);
        previousForward.current.copy(scratchForward.current);
    }, 1);

    return null;
};
