
import { generateChunk } from '../chunkGeneration';

// Cast self to Worker to prevent TypeScript from inferring it as Window
const ctx = self as unknown as Worker;

ctx.onmessage = (e) => {
    const { id, cx, cz } = e.data;
    const result = generateChunk(cx, cz);
    
    // Transfer buffers to avoid copy
    ctx.postMessage({ 
        id, cx, cz, result 
    }, [result.blocks.buffer, result.light.buffer, result.meta.buffer]);
};
