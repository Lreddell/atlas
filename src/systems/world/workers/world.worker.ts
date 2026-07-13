import { generateChunk } from '../chunkGeneration';
import { generateGeometryData } from '../geometry';
import { reseedGlobalNoise } from '../../../utils/noise';
import { loadGenConfig, resetGenConfig } from '../genConfig';
import { normalizeWorkerError, type WorkerJobType } from './streamingProtocol';

const ctx = self as unknown as Worker;

ctx.onmessage = (event) => {
    const message = event.data;
    const {
        type,
        id,
        cx,
        cz,
        seed,
        config,
        chunk,
        metaData,
        neighbors,
        lights,
        ticket,
        cullDarkFaces,
        workerId = -1,
        worldSessionId = 0,
        desiredEpoch = 0,
        jobInputBytes = 0,
        sentAt = 0,
    } = message;

    if (type === 'PING') {
        ctx.postMessage({ type: 'PONG', workerId, sentAt, receivedAt: Date.now() });
        return;
    }

    if (type === 'SET_SEED') {
        reseedGlobalNoise(seed);
        return;
    }

    if (type === 'SET_GEN_CONFIG') {
        resetGenConfig();
        if (config) loadGenConfig(config);
        return;
    }

    const postJobError = (jobType: WorkerJobType, error: unknown) => {
        ctx.postMessage(normalizeWorkerError({
            error,
            jobType,
            workerId,
            cx,
            cz,
            ticket,
            worldSessionId,
            desiredEpoch,
            jobInputBytes,
        }));
    };

    if (type === 'GEN') {
        try {
            const result = generateChunk(cx, cz);
            ctx.postMessage({
                type: 'GEN_DONE',
                id,
                cx,
                cz,
                ticket,
                workerId,
                worldSessionId,
                desiredEpoch,
                jobInputBytes,
                result: {
                    blocks: result.blocks,
                    light: result.light,
                    meta: result.meta,
                },
            }, [result.blocks.buffer, result.light.buffer, result.meta.buffer]);
        } catch (error) {
            postJobError('GEN', error);
        }
        return;
    }

    if (type === 'MESH') {
        try {
            if (!chunk) {
                ctx.postMessage({
                    type: 'MESH_DONE',
                    id,
                    cx,
                    cz,
                    ticket,
                    workerId,
                    worldSessionId,
                    desiredEpoch,
                    jobInputBytes,
                    result: null,
                });
                return;
            }

            const result = generateGeometryData(cx, cz, chunk, metaData, neighbors, lights, !!cullDarkFaces);
            const buffers: Transferable[] = [];
            [result.opaque, result.cutout, result.transparent].forEach((geometry) => {
                buffers.push(
                    geometry.positions.buffer,
                    geometry.normals.buffer,
                    geometry.uvs.buffer,
                    geometry.colors.buffer,
                    geometry.indices.buffer,
                );
            });

            ctx.postMessage({
                type: 'MESH_DONE',
                id,
                cx,
                cz,
                ticket,
                workerId,
                worldSessionId,
                desiredEpoch,
                jobInputBytes,
                result,
            }, buffers);
        } catch (error) {
            postJobError('MESH', error);
        }
    }
};
