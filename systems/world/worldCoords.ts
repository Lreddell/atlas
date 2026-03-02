
import { CHUNK_SIZE, MIN_Y } from '../../constants';

export function getChunkKey(cx: number, cz: number) {
    return `${cx},${cz}`;
}

export function worldToChunk(x: number, z: number) {
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const lx = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    return { cx, cz, lx, lz };
}

export function index3D(lx: number, y: number, lz: number): number {
    return ((y - MIN_Y) * CHUNK_SIZE * CHUNK_SIZE) + (lz * CHUNK_SIZE) + lx;
}
