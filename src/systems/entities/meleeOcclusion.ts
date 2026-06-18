const HIT_EPSILON = 1e-4;

export const isEntityHitVisible = (
    entityDistance: number,
    blockDistance: number | null,
): boolean => blockDistance === null || entityDistance < blockDistance - HIT_EPSILON;
