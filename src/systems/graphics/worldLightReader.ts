import { BLOCKS } from '../../data/blocks';
import { BlockType } from '../../types';
import { worldManager } from '../WorldManager';
import type { VoxelLightReader } from './smoothLight';

/** The live world as a light source for sampleSmoothLight. */
export const worldLightReader: VoxelLightReader = {
    light: (x, y, z) => worldManager.getLight(x, y, z),
    opaque: (x, y, z) => {
        const type = worldManager.getBlock(x, y, z, false);
        if (type === BlockType.AIR) return false;
        const def = BLOCKS[type];
        return !!def && !def.transparent && !def.noCollision && !def.shape;
    },
};
