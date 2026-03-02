
import { generateGeometryData } from '../geometry';

// Cast self to Worker to prevent TypeScript from inferring it as Window
const ctx = self as unknown as Worker;

ctx.onmessage = (e) => {
    const { id, cx, cz, chunk, metaData, neighbors, lights } = e.data;
    
    const result = generateGeometryData(cx, cz, chunk, metaData, neighbors, lights);
    
    // Collect all buffers for transfer
    const buffers: Transferable[] = [];
    
    [result.opaque, result.cutout, result.transparent].forEach(geo => {
        if (geo.positions && geo.positions.buffer) buffers.push(geo.positions.buffer);
        if (geo.normals && geo.normals.buffer) buffers.push(geo.normals.buffer);
        if (geo.uvs && geo.uvs.buffer) buffers.push(geo.uvs.buffer);
        if (geo.colors && geo.colors.buffer) buffers.push(geo.colors.buffer);
        if (geo.indices && geo.indices.buffer) buffers.push(geo.indices.buffer);
    });

    // Safeguard: Filter out any potential undefined buffers
    const safeBuffers = buffers.filter(b => b !== undefined && b !== null);

    ctx.postMessage({ id, cx, cz, result }, safeBuffers);
};
