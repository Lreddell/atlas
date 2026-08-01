import { useRef, useEffect } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { soundManager } from '../systems/sound/SoundManager';
import { shouldUseCaveMusic } from '../systems/sound/caveMusic';
import { musicController } from '../systems/sound/MusicController';
import { worldManager } from '../systems/WorldManager';
import { getBiome } from '../systems/world/biomes';
import { getBloodMoonMusicTicksRemaining, isBloodMoonMusicActive } from '../systems/world/celestialEvents';
import type { GameMode } from '../types';
import { ResonantVaultController } from './ResonantVaultController';
import { ResonantEffectsRenderer } from './ResonantEffectsRenderer';

// Update audio listener position, drive music, and mount world-context expedition
// systems that need the live camera without introducing a separate screen UI.
export const AudioListenerUpdater = ({
    isPaused,
    gameMode,
    keepMenuMusicContext = false,
    suspendMusic = false,
}: {
    isPaused: boolean;
    gameMode: GameMode;
    keepMenuMusicContext?: boolean;
    suspendMusic?: boolean;
}) => {
    const { camera } = useThree();
    const frameCount = useRef(0);

    useEffect(() => {
        soundManager.setGamePaused(isPaused);
    }, [isPaused]);

    useEffect(() => {
        if (suspendMusic) musicController.stopForDeath();
        else musicController.resumeAfterDeath();
    }, [suspendMusic]);

    useFrame(() => {
        soundManager.updateListener(camera);
        if (suspendMusic) return;
        frameCount.current += 1;
        if (frameCount.current <= 10) return;
        frameCount.current = 0;

        if (keepMenuMusicContext) {
            musicController.update(true, gameMode, 'plains');
            return;
        }

        const x = Math.floor(camera.position.x);
        const y = Math.floor(camera.position.y);
        const z = Math.floor(camera.position.z);
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return;
        const biome = getBiome(x, z);
        const inCaves = shouldUseCaveMusic(x, y, z);
        const ticks = worldManager.getTime();
        const inBloodMoon = isBloodMoonMusicActive(ticks, 24000, worldManager.getSeed());
        const bloodMoonTicksRemaining = getBloodMoonMusicTicksRemaining(ticks, 24000);
        const isNight = (ticks % 24000) >= 12000;
        musicController.update(false, gameMode, biome.id, inCaves, inBloodMoon, bloodMoonTicksRemaining, isNight);
    });

    const active = !keepMenuMusicContext && !suspendMusic;
    return (
        <>
            <ResonantVaultController
                active={active}
                isPaused={isPaused}
                isDead={suspendMusic}
                gameMode={gameMode}
            />
            <ResonantEffectsRenderer />
        </>
    );
};
