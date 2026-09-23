import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { blurScale, isCameraCut, maxBlurPixels, motionBlurHistory } from '../../render/motionBlur';
import { ATMOSPHERE_UNIFORMS } from '../atmosphereUniforms';
import {
    BLOOM_DOWN_FRAGMENT, BLOOM_PREFILTER_FRAGMENT, BLOOM_UP_FRAGMENT, COMPOSITE_FRAGMENT, COPY_FRAGMENT,
    FULLSCREEN_VERTEX, FXAA_FRAGMENT, MOTION_BLUR_FRAGMENT, RAYS_BLUR_FRAGMENT, RAYS_MASK_FRAGMENT,
} from './postShaders';
import { TONE_MAPPING, type PipelinePlan } from './pipelinePlan';

// The post pipeline (Medium preset and up, or whenever motion blur is on).
//
// Its useFrame runs at priority 1, which switches off R3F's own render and
// hands this component the frame:
//
//   scene -> HDR target (half float, MSAA when set, depth texture)
//     -> motion blur (optional; camera reprojection, sky untouched)
//     -> bloom: bright-pass on what glows, dual-filter mip chain
//     -> god rays (High and up): radial blur of the bright sky around the sun
//     -> composite: exposure, tone map, grade, vignette, dither, sRGB
//     -> FXAA to the canvas (or the composite draws to the canvas directly)
//
// Everything stays inside the WebGL canvas: the HUD and menus are DOM siblings
// and are never touched. Unmounting returns the frame to R3F.

const GRADE = {
    saturation: 1.06,
    contrast: 1.05,
    vignette: 0.16,
    splitTone: 0.6,
    shadowTint: new THREE.Vector3(0.94, 0.98, 1.06),
    highlightTint: new THREE.Vector3(1.04, 1.0, 0.95),
};
const BLOOM_STRENGTH = 0.55;
const BLOOM_THRESHOLD = new THREE.Vector2(1.5, 0.6);

type HdrTarget = THREE.WebGLRenderTarget;

const hdrTarget = (samples = 0, depth = false): HdrTarget => {
    const target = new THREE.WebGLRenderTarget(1, 1, {
        type: THREE.HalfFloatType,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        depthBuffer: depth,
        samples,
    });
    if (depth) {
        // Unsigned-int depth, so a multisampled target's depth resolves into it
        // (the formats must match for the blit).
        target.depthTexture = new THREE.DepthTexture(1, 1);
        target.depthTexture.type = THREE.UnsignedIntType;
    }
    target.stencilBuffer = false;
    return target;
};

const pass = (fragmentShader: string, uniforms: Record<string, THREE.IUniform>, defines: Record<string, string> = {}) =>
    new THREE.ShaderMaterial({
        vertexShader: FULLSCREEN_VERTEX,
        fragmentShader,
        uniforms,
        defines,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
    });

const scratchForward = new THREE.Vector3();
const scratchLight = new THREE.Vector3();

export const RenderPipeline: React.FC<{ plan: PipelinePlan }> = ({ plan }) => {
    const { gl, scene, size } = useThree();
    const bloomLevels = plan.bloom === 'off' ? 0 : plan.bloom === 'full' ? 6 : 5;

    const targets = useMemo(() => ({
        scene: hdrTarget(plan.msaaSamples, true),
        blur: plan.motionBlur ? hdrTarget() : null,
        down: Array.from({ length: bloomLevels }, () => hdrTarget()),
        up: Array.from({ length: Math.max(0, bloomLevels - 1) }, () => hdrTarget()),
        raysMask: plan.godRays ? hdrTarget() : null,
        rays: plan.godRays ? hdrTarget() : null,
        ldr: plan.fxaa ? new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter }) : null,
    }), [plan.msaaSamples, plan.motionBlur, plan.godRays, plan.fxaa, bloomLevels]);

    const materials = useMemo(() => ({
        motionBlur: pass(MOTION_BLUR_FRAGMENT, {
            tColor: { value: null }, tDepth: { value: null },
            uInverseViewProjection: { value: new THREE.Matrix4() },
            uPreviousViewProjection: { value: new THREE.Matrix4() },
            uResolution: { value: new THREE.Vector2(1, 1) },
            uScale: { value: 0 }, uMaxPixels: { value: 0 },
        }),
        prefilter: pass(BLOOM_PREFILTER_FRAGMENT, {
            tColor: { value: null }, uTexel: { value: new THREE.Vector2() },
            uExposure: { value: 1 }, uThreshold: { value: BLOOM_THRESHOLD },
        }),
        down: pass(BLOOM_DOWN_FRAGMENT, { tColor: { value: null }, uTexel: { value: new THREE.Vector2() } }),
        up: pass(BLOOM_UP_FRAGMENT, { tSmall: { value: null }, tCurrent: { value: null }, uTexel: { value: new THREE.Vector2() } }),
        raysMask: pass(RAYS_MASK_FRAGMENT, {
            tColor: { value: null }, tDepth: { value: null }, uLightUv: { value: new THREE.Vector2() },
            uAspect: { value: 1 }, uExposure: { value: 1 },
        }),
        raysBlur: pass(RAYS_BLUR_FRAGMENT, { tMask: { value: null }, uLightUv: { value: new THREE.Vector2() } }),
        composite: pass(COMPOSITE_FRAGMENT, {
            tColor: { value: null }, tBloom: { value: null }, tRays: { value: null },
            uExposure: { value: 1 }, uBloomStrength: { value: BLOOM_STRENGTH }, uRays: { value: new THREE.Vector3() },
            uGrade: { value: new THREE.Vector4(GRADE.saturation, GRADE.contrast, GRADE.vignette, GRADE.splitTone) },
            uShadowTint: { value: GRADE.shadowTint }, uHighlightTint: { value: GRADE.highlightTint },
            uTime: { value: 0 },
        }, {
            ...(bloomLevels > 0 ? { USE_BLOOM: '' } : {}),
            ...(plan.godRays ? { USE_RAYS: '' } : {}),
            ...(TONE_MAPPING === 'aces' ? { TONEMAP_ACES: '' } : {}),
        }),
        fxaa: pass(FXAA_FRAGMENT, { tColor: { value: null }, uTexel: { value: new THREE.Vector2() } }),
        copy: pass(COPY_FRAGMENT, { tColor: { value: null } }),
    }), [bloomLevels, plan.godRays]);

    const quad = useMemo(() => {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
        geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2));
        const mesh = new THREE.Mesh(geometry, materials.copy);
        mesh.frustumCulled = false;
        return mesh;
    }, [materials]);
    const quadScene = useMemo(() => new THREE.Scene().add(quad), [quad]);
    const quadCamera = useMemo(() => new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), []);

    const history = useRef({
        viewProjection: new THREE.Matrix4(),
        position: new THREE.Vector3(),
        forward: new THREE.Vector3(0, 0, -1),
        scratch: new THREE.Matrix4(),
    });

    // Sizes follow the drawing buffer; bloom levels halve, god rays run at a quarter.
    useEffect(() => {
        const width = Math.max(1, Math.floor(size.width * gl.getPixelRatio()));
        const height = Math.max(1, Math.floor(size.height * gl.getPixelRatio()));
        targets.scene.setSize(width, height);
        targets.blur?.setSize(width, height);
        targets.ldr?.setSize(width, height);
        const first = plan.bloom === 'full' ? 0 : 1;
        targets.down.forEach((target, i) => target.setSize(Math.max(1, width >> (i + first)), Math.max(1, height >> (i + first))));
        targets.up.forEach((target, i) => target.setSize(Math.max(1, width >> (i + first)), Math.max(1, height >> (i + first))));
        targets.raysMask?.setSize(Math.max(1, width >> 2), Math.max(1, height >> 2));
        targets.rays?.setSize(Math.max(1, width >> 2), Math.max(1, height >> 2));
        materials.motionBlur.uniforms.uResolution.value.set(width, height);
        materials.fxaa.uniforms.uTexel.value.set(1 / width, 1 / height);
        materials.raysMask.uniforms.uAspect.value = width / height;
        motionBlurHistory.dirty = true;
    }, [size.width, size.height, gl, targets, materials, plan.bloom]);

    useEffect(() => {
        motionBlurHistory.dirty = true;
        return () => {
            // Never strand the renderer on an offscreen target after unmounting.
            gl.setRenderTarget(null);
            motionBlurHistory.dirty = true;
        };
    }, [gl]);

    useEffect(() => () => {
        const all = [targets.scene, targets.blur, targets.raysMask, targets.rays, targets.ldr, ...targets.down, ...targets.up];
        for (const target of all) {
            target?.depthTexture?.dispose();
            target?.dispose();
        }
    }, [targets]);
    useEffect(() => () => { for (const material of Object.values(materials)) material.dispose(); }, [materials]);
    useEffect(() => () => { quad.geometry.dispose(); }, [quad]);

    const draw = (material: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null) => {
        quad.material = material;
        gl.setRenderTarget(target);
        gl.render(quadScene, quadCamera);
    };

    useFrame(({ camera, clock }, delta) => {
        const perspective = camera as THREE.PerspectiveCamera;
        const exposure = gl.toneMappingExposure;

        // 1. The scene, in scene-linear HDR.
        gl.setRenderTarget(targets.scene);
        gl.clear();
        gl.render(scene, perspective);
        let color: THREE.Texture = targets.scene.texture;
        const depth = targets.scene.depthTexture;

        // 2. Motion blur (only when the player turned it on).
        if (targets.blur) {
            const h = history.current;
            perspective.updateMatrixWorld();
            const viewProjection = h.scratch.multiplyMatrices(perspective.projectionMatrix, perspective.matrixWorldInverse);
            perspective.getWorldDirection(scratchForward);
            const cut = motionBlurHistory.dirty
                || isCameraCut(perspective.position.distanceTo(h.position), scratchForward.dot(h.forward));
            if (cut) {
                h.viewProjection.copy(viewProjection);
                motionBlurHistory.dirty = false;
            }
            const u = materials.motionBlur.uniforms;
            u.tColor.value = color;
            u.tDepth.value = depth;
            u.uInverseViewProjection.value.copy(viewProjection).invert();
            u.uPreviousViewProjection.value.copy(h.viewProjection);
            u.uScale.value = blurScale(delta);
            u.uMaxPixels.value = maxBlurPixels(u.uResolution.value.x);
            draw(materials.motionBlur, targets.blur);
            color = targets.blur.texture;
            h.viewProjection.copy(viewProjection);
            h.position.copy(perspective.position);
            h.forward.copy(scratchForward);
        }

        // 3. Bloom: bright-pass, then down the mip chain and back up.
        let bloom: THREE.Texture | null = null;
        if (targets.down.length > 0) {
            const prefilter = materials.prefilter.uniforms;
            prefilter.tColor.value = color;
            prefilter.uTexel.value.set(1 / targets.scene.width, 1 / targets.scene.height);
            prefilter.uExposure.value = exposure;
            draw(materials.prefilter, targets.down[0]);
            for (let i = 1; i < targets.down.length; i++) {
                const down = materials.down.uniforms;
                down.tColor.value = targets.down[i - 1].texture;
                down.uTexel.value.set(0.5 / targets.down[i].width, 0.5 / targets.down[i].height);
                draw(materials.down, targets.down[i]);
            }
            for (let i = targets.up.length - 1; i >= 0; i--) {
                const up = materials.up.uniforms;
                const small = i === targets.up.length - 1 ? targets.down[i + 1] : targets.up[i + 1];
                up.tSmall.value = small.texture;
                up.tCurrent.value = targets.down[i].texture;
                up.uTexel.value.set(0.5 / small.width, 0.5 / small.height);
                draw(materials.up, targets.up[i]);
            }
            bloom = (targets.up[0] ?? targets.down[0]).texture;
        }

        // 4. God rays from the sun by day, faintly from the moon at night, when in view.
        const composite = materials.composite.uniforms;
        composite.uRays.value.set(0, 0, 0);
        if (targets.raysMask && targets.rays) {
            const sun = ATMOSPHERE_UNIFORMS.atlasSunDir.value;
            const moon = ATMOSPHERE_UNIFORMS.atlasMoonDir.value;
            const useSun = sun.y > -0.05;
            const light = useSun ? sun : moon;
            scratchLight.set(light.x, light.y, light.z);
            perspective.getWorldDirection(scratchForward);
            const facing = THREE.MathUtils.smoothstep(scratchForward.dot(scratchLight), 0.25, 0.75);
            const aboveHorizon = THREE.MathUtils.smoothstep(scratchLight.y, -0.05, 0.08);
            const strength = facing * aboveHorizon * (useSun ? 0.35 : 0.12);
            if (strength > 0.001) {
                scratchLight.multiplyScalar(400).add(perspective.position).project(perspective);
                const lightUv = materials.raysMask.uniforms.uLightUv.value.set(scratchLight.x * 0.5 + 0.5, scratchLight.y * 0.5 + 0.5);
                const mask = materials.raysMask.uniforms;
                mask.tColor.value = color;
                mask.tDepth.value = depth;
                mask.uExposure.value = exposure;
                draw(materials.raysMask, targets.raysMask);
                const blur = materials.raysBlur.uniforms;
                blur.tMask.value = targets.raysMask.texture;
                blur.uLightUv.value.copy(lightUv);
                draw(materials.raysBlur, targets.rays);
                // Tinted like the light itself: warm at golden hour, cool under the moon.
                const tint = useSun ? ATMOSPHERE_UNIFORMS.atlasSunGlow.value : ATMOSPHERE_UNIFORMS.atlasMoonGlow.value;
                const tintMax = Math.max(tint.x, tint.y, tint.z, 1e-4);
                composite.uRays.value.set(tint.x / tintMax, tint.y / tintMax, tint.z / tintMax).multiplyScalar(strength);
            }
        }

        // 5. Composite (tone map, grade, encode) and anti-aliasing.
        composite.tColor.value = color;
        composite.tBloom.value = bloom;
        composite.tRays.value = targets.rays?.texture ?? null;
        composite.uExposure.value = exposure;
        composite.uTime.value = clock.elapsedTime;
        if (targets.ldr) {
            draw(materials.composite, targets.ldr);
            materials.fxaa.uniforms.tColor.value = targets.ldr.texture;
            draw(materials.fxaa, null);
        } else {
            draw(materials.composite, null);
        }
    }, 1);

    return null;
};
