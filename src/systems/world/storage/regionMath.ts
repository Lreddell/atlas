// Pure region/slot math for the .acr layout. Uses explicit floor + non-negative
// modulo so negative chunk coordinates map correctly (naive integer division
// truncates toward zero and breaks for negatives).

import { REGION_EDGE } from './acr/acrFormat';

export interface RegionCoord { rx: number; rz: number; }
export interface RegionSlot { rx: number; rz: number; localX: number; localZ: number; slot: number; }

export function regionForChunk(cx: number, cz: number): RegionCoord {
    return { rx: Math.floor(cx / REGION_EDGE), rz: Math.floor(cz / REGION_EDGE) };
}

export function localCoord(c: number): number {
    return ((c % REGION_EDGE) + REGION_EDGE) % REGION_EDGE;
}

export function slotForChunk(cx: number, cz: number): RegionSlot {
    const rx = Math.floor(cx / REGION_EDGE);
    const rz = Math.floor(cz / REGION_EDGE);
    const localX = localCoord(cx);
    const localZ = localCoord(cz);
    return { rx, rz, localX, localZ, slot: localX + localZ * REGION_EDGE };
}

/** Region-file base name without extension, e.g. "r.-1.0". */
export function regionFileStem(rx: number, rz: number): string {
    return `r.${rx}.${rz}`;
}

export function regionFileName(rx: number, rz: number): string {
    return `${regionFileStem(rx, rz)}.acr`;
}
