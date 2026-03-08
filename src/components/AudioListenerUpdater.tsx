
import { useRef, useEffect } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { soundManager } from '../systems/sound/SoundManager';
import { musicController } from '../systems/sound/MusicController';
import { worldManager } from '../systems/WorldManager';
import { getBiome } from '../systems/world/biomes';
import { getBloodMoonMusicTicksRemaining, isBloodMoonMusicActive } from '../systems/world/celestialEvents';
import { BlockType } from '../types';

const CAVE_DEPTH_THRESHOLD = 14;
const CAVE_MAX_SKY_LIGHT = 2;
const CAVE_MAX_Y = 56;

export function shouldUseCaveMusic(x: number, y: number, z: number) {
    const terrainHeight = worldManager.getTerrainHeight(x, z);
    const undergroundDepth = terrainHeight - y;
    if (undergroundDepth < CAVE_DEPTH_THRESHOLD || y > CAVE_MAX_Y) return false;

    const headLight = worldManager.getLight(x, y, z).sky;
    const feetLight = worldManager.getLight(x, Math.max(y - 1, 0), z).sky;
    if (headLight > CAVE_MAX_SKY_LIGHT || feetLight > CAVE_MAX_SKY_LIGHT) return false;

    const headBlock = worldManager.getBlock(x, y, z, false);
    const feetBlock = worldManager.getBlock(x, Math.max(y - 1, 0), z, false);
    if (headBlock === BlockType.WATER || headBlock === BlockType.LAVA || feetBlock === BlockType.WATER || feetBlock === BlockType.LAVA) {
        return false;
    }

    return true;
}

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
