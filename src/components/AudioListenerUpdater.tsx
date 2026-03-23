
import { useRef, useEffect } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { soundManager } from '../systems/sound/SoundManager';
import { shouldUseCaveMusic } from '../systems/sound/caveMusic';
import { musicController } from '../systems/sound/MusicController';
import { worldManager } from '../systems/WorldManager';
import { getBiome } from '../systems/world/biomes';
import { getBloodMoonMusicTicksRemaining, isBloodMoonMusicActive } from '../systems/world/celestialEvents';

// Update audio listener pos each frame AND Drive Music Controller
export const AudioListenerUpdater = ({ isPaused, gameMode, keepMenuMusicContext = false }: { isPaused: boolean, gameMode: string, keepMenuMusicContext?: boolean }) => {
    const { camera } = useThree();
    const frameCount = useRef(0);

    // Muffle Audio on Pause
    useEffect(() => {
        soundManager.setGamePaused(isPaused);
    }, [isPaused]);

    useFrame(() => {
        soundManager.updateListener(camera);
        
        // Update music controller less frequently (every 10 frames approx) to save checks
        frameCount.current++;
        if (frameCount.current > 10) {
            frameCount.current = 0;

            if (keepMenuMusicContext) {
                musicController.update(true, gameMode, 'plains');
                return;
            }

            const x = Math.floor(camera.position.x);
            const y = Math.floor(camera.position.y);
            const z = Math.floor(camera.position.z);
            // Guard biome lookup
            if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
                const biome = getBiome(x, z);
                const inCaves = shouldUseCaveMusic(x, y, z);
                const ticks = worldManager.getTime();
                const inBloodMoon = isBloodMoonMusicActive(ticks, 24000, worldManager.getSeed());
                const bloodMoonTicksRemaining = getBloodMoonMusicTicksRemaining(ticks, 24000);
                musicController.update(false, gameMode, biome.id, inCaves, inBloodMoon, bloodMoonTicksRemaining);
            }
        }
    });
    return null;
};
