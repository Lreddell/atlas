import { generateChunk } from '../chunkGeneration';
import { generateGeometryData } from '../geometry';
import { reseedGlobalNoise } from '../../../utils/noise';

// Cast self to Worker
const ctx = self as unknown as Worker;

ctx.onmessage = (e) => {
    const { type, id, cx, cz, seed, chunk, metaData, neighbors, lights, ticket } = e.data;

    if (type === 'SET_SEED') {
        reseedGlobalNoise(seed);
        console.log(`[Worker] Reseeded with: ${seed}`);
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
        const result = generateGeometryData(cx, cz, chunk, metaData, neighbors, lights);

        const buffers: Transferable[] = [];
        [result.opaque, result.cutout, result.transparent].forEach(geo => {
            if (geo.positions.buffer) buffers.push(geo.positions.buffer);
            if (geo.normals.buffer) buffers.push(geo.normals.buffer);
            if (geo.uvs.buffer) buffers.push(geo.uvs.buffer);
            if (geo.colors.buffer) buffers.push(geo.colors.buffer);
            if (geo.indices.buffer) buffers.push(geo.indices.buffer);
        });

        const safeBuffers = buffers.filter(b => b !== undefined && b !== null);

        ctx.postMessage({ type: 'MESH_DONE', id, cx, cz, ticket, result }, safeBuffers);
    }
    else if (type === 'EVICT') {
        // Stateless worker: nothing to evict locally.
    }
};