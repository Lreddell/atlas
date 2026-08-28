import React, { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { worldManager } from '../systems/WorldManager';
import { entityManager } from '../systems/entities/EntityManager';
import { FIXED_DT, MAX_SUBSTEPS } from '../systems/player/playerConstants';
import { tickFood, FoodState } from '../systems/player/playerFood';
import { vaultProjectileSystem } from '../systems/combat/VaultProjectileSystem';
import {
    getPixelationMode,
    getPixelationResolution,
    PIXELATION_CHANGE_EVENT,
    type PixelationMode,
    type PixelationResolution,
} from '../systems/graphics/pixelation';

interface GameLoopProps {
    isPaused: boolean;
    foodStateRef: React.MutableRefObject<FoodState>;
    setHealth: React.Dispatch<React.SetStateAction<number>>;
    setHunger: React.Dispatch<React.SetStateAction<number>>;
    setSaturation: React.Dispatch<React.SetStateAction<number>>;
    health: number;
    gameMode: 'survival' | 'creative' | 'spectator';
    isDead: boolean;
}

/**
 * Owns Atlas's final 3D render. A positive useFrame priority disables R3F's
 * automatic gl.render call, so WORLD/FULL pixelation can render the world into
 * a genuinely low-resolution framebuffer and nearest-neighbor upscale it.
 * DOM HUD/menu layers remain outside this pass; FULL mode rasterizes those in
 * pixelation.ts after the WebGL world has already been pixelated here.
 */
const useRetroWorldRenderer = () => {
    const gl = useThree((state) => state.gl);
    const scene = useThree((state) => state.scene);
    const camera = useThree((state) => state.camera);
    const size = useThree((state) => state.size);

    const modeRef = useRef<PixelationMode>(getPixelationMode());
    const resolutionRef = useRef<PixelationResolution>(getPixelationResolution());
    const targetSizeRef = useRef({ width: 0, height: 0 });

    const renderTargetRef = useRef<THREE.WebGLRenderTarget | null>(null);
    const postSceneRef = useRef<THREE.Scene | null>(null);
    const postCameraRef = useRef<THREE.OrthographicCamera | null>(null);
    const postGeometryRef = useRef<THREE.PlaneGeometry | null>(null);
    const postMaterialRef = useRef<THREE.MeshBasicMaterial | null>(null);

    if (!renderTargetRef.current) {
        const target = new THREE.WebGLRenderTarget(1, 1, {
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter,
            generateMipmaps: false,
            depthBuffer: true,
            stencilBuffer: false,
            // Keep the intermediate scene-referred image in enough precision to
            // preserve highlights before R3F's ACES/output transform. Three skips
            // tone mapping and display color-space conversion for render targets.
            type: THREE.HalfFloatType,
        });
        target.texture.generateMipmaps = false;
        target.texture.minFilter = THREE.NearestFilter;
        target.texture.magFilter = THREE.NearestFilter;
        target.texture.colorSpace = THREE.LinearSRGBColorSpace;
        renderTargetRef.current = target;

        const postScene = new THREE.Scene();
        const postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        const geometry = new THREE.PlaneGeometry(2, 2);
        const material = new THREE.MeshBasicMaterial({
            map: target.texture,
            depthTest: false,
            depthWrite: false,
            // This second pass is the final display pass. Leaving tone mapping on
            // makes it receive the same renderer ACES + sRGB conversion as Atlas's
            // ordinary direct-to-screen render, instead of showing raw linear HDR.
            toneMapped: true,
        });
        const quad = new THREE.Mesh(geometry, material);
        quad.frustumCulled = false;
        postScene.add(quad);

        postSceneRef.current = postScene;
        postCameraRef.current = postCamera;
        postGeometryRef.current = geometry;
        postMaterialRef.current = material;
    }

    useEffect(() => {
        const sync = () => {
            modeRef.current = getPixelationMode();
            resolutionRef.current = getPixelationResolution();
        };

        sync();
        window.addEventListener(PIXELATION_CHANGE_EVENT, sync);
        return () => window.removeEventListener(PIXELATION_CHANGE_EVENT, sync);
    }, []);

    useEffect(() => () => {
        renderTargetRef.current?.dispose();
        postGeometryRef.current?.dispose();
        postMaterialRef.current?.dispose();
    }, []);

    useFrame(() => {
        const target = renderTargetRef.current;
        const postScene = postSceneRef.current;
        const postCamera = postCameraRef.current;
        if (!target || !postScene || !postCamera) {
            gl.setRenderTarget(null);
            gl.render(scene, camera);
            return;
        }

        const mode = modeRef.current;
        if (mode === 'off') {
            gl.setRenderTarget(null);
            gl.render(scene, camera);
            gl.domElement.removeAttribute('data-atlas-retro-resolution');
            return;
        }

        const targetHeight = Math.max(1, resolutionRef.current);
        const aspect = Math.max(0.01, size.width / Math.max(1, size.height));
        const targetWidth = Math.max(1, Math.round(targetHeight * aspect));

        if (
            targetSizeRef.current.width !== targetWidth ||
            targetSizeRef.current.height !== targetHeight
        ) {
            target.setSize(targetWidth, targetHeight);
            targetSizeRef.current = { width: targetWidth, height: targetHeight };
        }

        // First pass: rasterize the world at the retro resolution in linear/HDR
        // space. Three deliberately does not apply the final display transform here.
        gl.setRenderTarget(target);
        gl.clear();
        gl.render(scene, camera);

        // Second pass: nearest-neighbor upscale and perform the renderer's normal
        // final tone-mapping/output conversion exactly once.
        gl.setRenderTarget(null);
        gl.clear();
        gl.render(postScene, postCamera);

        gl.domElement.setAttribute(
            'data-atlas-retro-resolution',
            `${targetWidth}x${targetHeight}`,
        );
    }, 100);
};

export const GameLoop: React.FC<GameLoopProps> = ({ isPaused, foodStateRef, setHealth, setHunger, setSaturation, health, gameMode, isDead }) => {
    const accumulator = useRef(0);
    const lastHungerRef = useRef(Number.NaN);
    const lastSaturationRef = useRef(Number.NaN);

    useRetroWorldRenderer();

    useEffect(() => {
        if (isDead) vaultProjectileSystem.clear();
    }, [isDead]);

    useEffect(() => () => vaultProjectileSystem.clear(), []);

    useFrame((_, delta) => {
        if (isPaused) return;

        accumulator.current += Math.min(delta, 0.25);

        let steps = 0;
        // Track health locally across substeps, the render-captured prop is stale
        // after the first substep, which made hunger damage/regen frame-rate dependent.
        let currentHealth = health;
        while (accumulator.current >= FIXED_DT && steps < MAX_SUBSTEPS) {
            worldManager.tick(FIXED_DT);
            entityManager.tick(FIXED_DT, gameMode);
            if (!isDead) vaultProjectileSystem.tick(FIXED_DT);

            if (foodStateRef.current) {
                const newHealth = tickFood(foodStateRef.current, currentHealth, gameMode, isDead);
                if (newHealth !== currentHealth) {
                    currentHealth = newHealth;
                    setHealth(newHealth);
                }

                // Only push state updates when the displayed value actually changes;
                // raw saturation is a continuously-decaying float that would otherwise
                // re-render the whole App every fixed tick (20/s).
                const hungerNow = Math.floor(foodStateRef.current.foodLevel);
                if (hungerNow !== lastHungerRef.current) {
                    lastHungerRef.current = hungerNow;
                    setHunger(hungerNow);
                }
                const saturationNow = Math.round(foodStateRef.current.foodSaturationLevel * 4) / 4;
                if (saturationNow !== lastSaturationRef.current) {
                    lastSaturationRef.current = saturationNow;
                    setSaturation(saturationNow);
                }
            }

            accumulator.current -= FIXED_DT;
            steps++;
        }
    });

    return null;
};
