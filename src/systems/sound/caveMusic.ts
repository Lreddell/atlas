import { worldManager } from '../WorldManager';
import { BlockType } from '../../types';

const CAVE_DEPTH_THRESHOLD = 14;
const CAVE_MAX_SKY_LIGHT = 2;
const CAVE_MAX_Y = 56;

export const shouldUseCaveMusic = (x: number, y: number, z: number) => {
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
};
