import { generateChunk } from '../chunkGeneration';
import { generateGeometryData } from '../geometry';
import { reseedGlobalNoise } from '../../../utils/noise';
import { loadGenConfig, resetGenConfig } from '../genConfig';

// Cast self to Worker
const ctx = self as unknown as Worker;

interface CachedChunk {
    blocks: Uint8Array;
    meta: Uint8Array;
    light: Uint8Array;
    revision: number;
}

const chunkCache = new Map<string, CachedChunk>();
const chunkKey = (cx: number, cz: number) => `${cx},${cz}`;

ctx.onmessage = (e) => {
    const { type, id, cx, cz, seed, config, chunk, metaData, neighbors, lights, ticket, cullDarkFaces, revision } = e.data;

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
        const result = generateChunk(cx, cz);
        
        // Transfer the generated buffers directly to the main thread.
        // The worker no longer maintains a cache, making it stateless.
        ctx.postMessage({ 
            type: 'GEN_DONE', 
            id, cx, cz, 
            ticket,
            result: { 
                blocks: result.blocks, 
                light: result.light, 
                meta: result.meta 
            }
        }, [result.blocks.buffer, result.light.buffer, result.meta.buffer]);
    }
    else if (type === 'MESH') {
        if (!chunk) {
            ctx.postMessage({ type: 'MESH_DONE', id, cx, cz, ticket, result: null });
            return;
        }

        // Generate geometry using data provided in the message.
        const result = generateGeometryData(cx, cz, chunk, metaData, neighbors, lights, !!cullDarkFaces);

        const buffers: Transferable[] = [];
        [result.opaque, result.cutout, result.transparent].forEach(geo => {
            if (geo.positions.buffer) buffers.push(geo.positions.buffer);
            if (geo.normals.buffer) buffers.push(geo.normals.buffer);
            if (geo.uvs.buffer) buffers.push(geo.uvs.buffer);
            if (geo.colors.buffer) buffers.push(geo.colors.buffer);
            if (geo.indices.buffer) buffers.push(geo.indices.buffer);
        });

        const safeBuffers = buffers.filter(b => b !== undefined && b !== null);

        ctx.postMessage({ type: 'MESH_DONE', id, cx, cz, ticket, revision, result }, safeBuffers);
    }
    else if (type === 'CACHE_CHUNK') {
        const key = chunkKey(cx, cz);
        const existing = chunkCache.get(key);
        if (!existing || revision >= existing.revision) {
            chunkCache.set(key, { blocks: chunk, meta: metaData, light: lights, revision });
        }
    }
    else if (type === 'MESH_CACHED') {
        const center = chunkCache.get(chunkKey(cx, cz));
        if (!center || center.revision !== revision) {
            ctx.postMessage({ type: 'MESH_DONE', id, cx, cz, ticket, revision, result: null });
            return;
        }
        const left = chunkCache.get(chunkKey(cx - 1, cz));
        const right = chunkCache.get(chunkKey(cx + 1, cz));
        const front = chunkCache.get(chunkKey(cx, cz + 1));
        const back = chunkCache.get(chunkKey(cx, cz - 1));
        const result = generateGeometryData(cx, cz, center.blocks, center.meta, {
            left: left?.blocks, right: right?.blocks, front: front?.blocks, back: back?.blocks,
        }, {
            center: center.light, left: left?.light, right: right?.light, front: front?.light, back: back?.light,
        }, !!cullDarkFaces);
        const buffers: Transferable[] = [];
        for (const geo of [result.opaque, result.cutout, result.transparent]) {
            buffers.push(geo.positions.buffer, geo.normals.buffer, geo.uvs.buffer, geo.colors.buffer, geo.indices.buffer);
        }
        ctx.postMessage({ type: 'MESH_DONE', id, cx, cz, ticket, revision, result }, buffers);
    }
    else if (type === 'EVICT') {
        chunkCache.delete(chunkKey(cx, cz));
    }
};
