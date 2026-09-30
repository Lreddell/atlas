import { generateChunk } from '../chunkGeneration';
import { generateGeometryData } from '../geometry';
import { createBorderScratch, unpackMeshBorders } from '../meshBorders';
import { reseedGlobalNoise } from '../../../utils/noise';
import { loadGenConfig, resetGenConfig } from '../genConfig';
import { buildHorizonTile } from '../horizon/buildHorizonTile';
import { BlockType } from '../../../types';

// Cast self to Worker
const ctx = self as unknown as Worker;

// Side chunks rebuilt from a mesh job's border planes, reused job after job.
const borderScratch = createBorderScratch();

/** Whether a chunk holds a flowing (levelled) water or lava cell. */
function hasFlowingFluid(blocks: Uint8Array, meta: Uint8Array | undefined): boolean {
    if (!meta) return false;
    for (let i = 0; i < blocks.length; i++) {
        if (meta[i] !== 0 && (blocks[i] === BlockType.WATER || blocks[i] === BlockType.LAVA)) return true;
    }
    return false;
}

ctx.onmessage = (e) => {
    const { type, id, cx, cz, seed, config, chunk, metaData, light, borders, ticket, cullDarkFaces, rejectedVaultIds } = e.data;

    if (type === 'SET_SEED') {
        reseedGlobalNoise(seed);
        console.log(`[Worker] Reseeded with: ${seed}`);
    }
    else if (type === 'SET_GEN_CONFIG') {
        resetGenConfig();
        if (config) {
            loadGenConfig(config);
        }
        console.log('[Worker] Applied world generation config');
    }
    else if (type === 'GEN') {
        const result = generateChunk(cx, cz, { rejectedVaultIds });

        // Transfer the generated buffers directly to the main thread.
        // The worker no longer maintains a cache, making it stateless.
        ctx.postMessage({
            type: 'GEN_DONE',
            id, cx, cz,
            ticket,
            result: {
                blocks: result.blocks,
                light: result.light,
                meta: result.meta,
                // Whether any water or lava is mid-flow (almost never, freshly
                // generated): the main thread looks for it only then.
                hasFlowing: hasFlowingFluid(result.blocks, result.meta),
            }
        }, [result.blocks.buffer, result.light.buffer, result.meta.buffer]);
    }
    else if (type === 'MESH') {
        if (!chunk) {
            ctx.postMessage({ type: 'MESH_DONE', id, cx, cz, ticket, result: null });
            return;
        }

        // Generate geometry using data provided in the message.
        const { neighbors, lights, neighborMeta } = unpackMeshBorders(borders, light, borderScratch);
        const result = generateGeometryData(cx, cz, chunk, metaData, neighbors, lights, !!cullDarkFaces, neighborMeta);

        const buffers: Transferable[] = [];
        [result.opaque, result.cutout, result.transparent, result.water].forEach(geo => {
            if (geo.positions.buffer) buffers.push(geo.positions.buffer);
            if (geo.normals.buffer) buffers.push(geo.normals.buffer);
            if (geo.uvs.buffer) buffers.push(geo.uvs.buffer);
            if (geo.colors.buffer) buffers.push(geo.colors.buffer);
            if (geo.tiles.buffer) buffers.push(geo.tiles.buffer);
            if (geo.indices.buffer) buffers.push(geo.indices.buffer);
        });

        const safeBuffers = buffers.filter(b => b !== undefined && b !== null);

        ctx.postMessage({ type: 'MESH_DONE', id, cx, cz, ticket, result }, safeBuffers);
    }
    else if (type === 'HORIZON_TILE') {
        // A tile of the horizon, past the full chunks (horizon/buildHorizonTile.ts).
        const { level, tx, tz } = e.data;
        const result = buildHorizonTile(level, tx, tz);
        const buffers: ArrayBuffer[] = [];
        for (const mesh of [result.opaque, result.transparent]) {
            if (!mesh) continue;
            buffers.push(mesh.positions.buffer as ArrayBuffer, mesh.normals.buffer as ArrayBuffer, mesh.uvs.buffer as ArrayBuffer,
                mesh.colors.buffer as ArrayBuffer, mesh.tiles.buffer as ArrayBuffer, mesh.indices.buffer as ArrayBuffer);
        }
        ctx.postMessage({ type: 'HORIZON_TILE_DONE', id, result }, buffers);
    }
    else if (type === 'EVICT') {
        // Stateless worker: nothing to evict locally.
    }
};
