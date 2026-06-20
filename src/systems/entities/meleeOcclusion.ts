// A melee target is occluded only if a solid block is clearly in front of it.
// A small tolerance prevents terrain the target stands on/beside (whose voxel
// hit can be marginally closer than the target's AABB near-face) from wrongly
// blocking legitimate body shots, while a real wall — much closer than the
// target — still blocks the hit. Without this tolerance, aiming center-mass at
// a tall entity over uneven ground silently dropped hits (boss HP never moved).
const OCCLUSION_TOLERANCE = 0.6;

export const isEntityHitVisible = (
    entityDistance: number,
    blockDistance: number | null,
): boolean => blockDistance === null || blockDistance >= entityDistance - OCCLUSION_TOLERANCE;
