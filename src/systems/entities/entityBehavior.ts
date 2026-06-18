export type PlayerTargetMode = 'survival' | 'creative' | 'spectator';

const AGGRO_FORGET_MULTIPLIER = 1.5;

export const canTargetPlayer = (gameMode: PlayerTargetMode): boolean =>
    gameMode === 'survival';

export const shouldForgetTarget = (distanceSquared: number, aggroRange: number): boolean => {
    const forgetRange = aggroRange * AGGRO_FORGET_MULTIPLIER;
    return distanceSquared > forgetRange * forgetRange;
};

export const shouldPreserveKnockback = (knockbackSeconds: number): boolean =>
    knockbackSeconds > 0;
