import React, { useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { type GameMode } from '../types';
import { entityManager } from '../systems/entities/EntityManager';
import { resonantVaultRuntime } from '../systems/world/ResonantVaultRuntime';
import { bellTitanEncounter } from '../systems/entities/BellTitanEncounter';
import { bellTitanCinematic } from '../systems/boss/bellTitanCinematic';

interface ResonantVaultControllerProps {
    active: boolean;
    isPaused: boolean;
    isDead: boolean;
    gameMode: GameMode;
}

type PlayerDamageBridge = {
    playerDamageHandler: ((amount: number, knockX: number, knockZ: number) => void) | null;
};

export const ResonantVaultController: React.FC<ResonantVaultControllerProps> = ({ active, isPaused, isDead, gameMode }) => {
    const { camera } = useThree();

    useEffect(() => () => {
        bellTitanCinematic.cancel();
        resonantVaultRuntime.reset();
    }, []);

    useEffect(() => {
        if (isDead) {
            bellTitanCinematic.cancel();
            bellTitanEncounter.cleanup();
            resonantVaultRuntime.prepareForPlayerRecovery();
        }
    }, [isDead]);

    useFrame((_, delta) => {
        const playerPosition = {
            x: camera.position.x,
            y: camera.position.y - 1.62,
            z: camera.position.z,
        };
        if (!active || isDead) return;
        if (!isPaused) {
            const damage = resonantVaultRuntime.tick(Math.min(delta, 0.1), playerPosition, gameMode);
            if (damage > 0) {
                const bridge = entityManager as unknown as PlayerDamageBridge;
                bridge.playerDamageHandler?.(damage, 0, 0);
            }
        }
    });

    return null;
};
