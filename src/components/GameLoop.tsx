
import React, { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { worldManager } from '../systems/WorldManager';
import { entityManager } from '../systems/entities/EntityManager';
import { FIXED_DT, MAX_SUBSTEPS } from '../systems/player/playerConstants';
import { tickFood, FoodState } from '../systems/player/playerFood';
import { vaultProjectileSystem } from '../systems/combat/VaultProjectileSystem';
import {
    getPixelationMode,
    getPixelationResolution,
    PIXELATION_CHANGE_EVENT,
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

export const GameLoop: React.FC<GameLoopProps> = ({ isPaused, foodStateRef, setHealth, setHunger, setSaturation, health, gameMode, isDead }) => {
    const accumulator = useRef(0);
    const lastHungerRef = useRef(Number.NaN);
    const lastSaturationRef = useRef(Number.NaN);
    const gl = useThree((state) => state.gl);
    const size = useThree((state) => state.size);
    const setDpr = useThree((state) => state.setDpr);
    const initialDpr = useThree((state) => state.viewport.initialDpr);

    useEffect(() => {
        if (isDead) vaultProjectileSystem.clear();
    }, [isDead]);

    useEffect(() => () => vaultProjectileSystem.clear(), []);

    useEffect(() => {
        const canvas = gl.domElement;
        const previousImageRendering = canvas.style.imageRendering;

        const applyRetroResolution = () => {
            const mode = getPixelationMode();
            if (mode === 'off') {
                setDpr(initialDpr);
                canvas.style.imageRendering = previousImageRendering;
                return;
            }

            const targetHeight = getPixelationResolution();
            const cssHeight = Math.max(1, size.height);
            // R3F DPR directly controls the WebGL drawing-buffer dimensions. Keeping
            // it at or below 1 means the scene is genuinely rendered at fewer pixels,
            // then the full-size canvas is enlarged by the browser.
            const retroDpr = Math.max(0.1, Math.min(1, targetHeight / cssHeight));
            setDpr(retroDpr);
            canvas.style.imageRendering = 'pixelated';
        };

        applyRetroResolution();
        window.addEventListener(PIXELATION_CHANGE_EVENT, applyRetroResolution);

        return () => {
            window.removeEventListener(PIXELATION_CHANGE_EVENT, applyRetroResolution);
            setDpr(initialDpr);
            canvas.style.imageRendering = previousImageRendering;
        };
    }, [gl, initialDpr, setDpr, size.height]);

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
