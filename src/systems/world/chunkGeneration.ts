import '../../data/resonantDefinitions';
import { GlobalNoise } from '../../utils/noise';
import { getBiome } from './biomes';
import {
    generateChunk as generateBaseChunk,
    getTerrainHeight as getBaseTerrainHeight,
} from './baseChunkGeneration';
import { applyResonantVaultsToChunk } from './resonantVaultGeneration';
import { getVaultId } from './resonantVaults';

export * from './baseChunkGeneration';

export interface ChunkGenerationOptions {
    rejectedVaultIds?: readonly string[];
}

export function generateChunk(cx: number, cz: number, options: ChunkGenerationOptions = {}) {
    const result = generateBaseChunk(cx, cz);
    const rejectedVaultIds = new Set(options.rejectedVaultIds ?? []);
    return applyResonantVaultsToChunk(cx, cz, result, {
        seed: GlobalNoise.seed | 0,
        getSurfaceY: (x, z) => getBaseTerrainHeight(x, z, GlobalNoise),
        getSurfaceBiomeId: (x, z) => getBiome(x, z, GlobalNoise).id,
        isCandidateAllowed: (candidate) => !rejectedVaultIds.has(getVaultId(candidate)),
    });
}
