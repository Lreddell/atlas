
import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { worldManager } from '../systems/WorldManager';
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

    useFrame((_, delta) => {
        if (isPaused) return;

        accumulator.current += Math.min(delta, 0.25);

        let steps = 0;
        while (accumulator.current >= FIXED_DT && steps < MAX_SUBSTEPS) {
            worldManager.tick(FIXED_DT);

            if (foodStateRef.current) {
                const newHealth = tickFood(foodStateRef.current, health, gameMode, isDead);
                if (newHealth !== health) setHealth(newHealth);
                setHunger(Math.floor(foodStateRef.current.foodLevel));
                setSaturation(foodStateRef.current.foodSaturationLevel);
            }

            accumulator.current -= FIXED_DT;
            steps++;
        }
    });

    return null;
};
