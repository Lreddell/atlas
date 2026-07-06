import { worldManager } from '../WorldManager';
import { getBiomeAt } from '../world/chunkGeneration';
import { BlockType } from '../../types';

const CAVE_DEPTH_THRESHOLD = 14;
const CAVE_MAX_SKY_LIGHT = 2;
const CAVE_MAX_Y = 56;

export const shouldUseCaveMusic = (x: number, y: number, z: number) => {
    // Never over a fluid, whatever the biome (don't swap to cave music while
    // swimming through a flooded cavern or standing in lava).
    const headBlock = worldManager.getBlock(x, y, z, false);
    const feetBlock = worldManager.getBlock(x, Math.max(y - 1, 0), z, false);
    if (headBlock === BlockType.WATER || headBlock === BlockType.LAVA || feetBlock === BlockType.WATER || feetBlock === BlockType.LAVA) {
        return false;
    }

    // Being in a real cave biome (Lush / Dripstone / Caves) is enough on its own
    //, those are the underground regions and should always carry cave music,
    // even where glow lichen / clusters light the room up.
    const biome = getBiomeAt(Math.floor(x), Math.floor(y), Math.floor(z));
    if (biome.tags?.includes('cave')) return true;

    // Otherwise fall back to the deep-and-dark heuristic (unlit pockets that the
    // biome classifier still counts as surface, e.g. shallow tunnels).
    const terrainHeight = worldManager.getTerrainHeight(x, z);
    const undergroundDepth = terrainHeight - y;
    if (undergroundDepth < CAVE_DEPTH_THRESHOLD || y > CAVE_MAX_Y) return false;

    const headLight = worldManager.getLight(x, y, z).sky;
    const feetLight = worldManager.getLight(x, Math.max(y - 1, 0), z).sky;
    if (headLight > CAVE_MAX_SKY_LIGHT || feetLight > CAVE_MAX_SKY_LIGHT) return false;

    return true;
};
