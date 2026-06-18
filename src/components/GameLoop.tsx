
import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { worldManager } from '../systems/WorldManager';
import { entityManager } from '../systems/entities/EntityManager';
import { FIXED_DT, MAX_SUBSTEPS } from '../systems/player/playerConstants';
import { tickFood, FoodState } from '../systems/player/playerFood';

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

    useFrame((_, delta) => {
        if (isPaused) return;

        accumulator.current += Math.min(delta, 0.25);

        let steps = 0;
        // Track health locally across substeps — the render-captured prop is stale
        // after the first substep, which made hunger damage/regen frame-rate dependent.
        let currentHealth = health;
        while (accumulator.current >= FIXED_DT && steps < MAX_SUBSTEPS) {
            worldManager.tick(FIXED_DT);
            entityManager.tick(FIXED_DT, gameMode);

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
