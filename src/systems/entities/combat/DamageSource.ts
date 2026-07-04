export type DamageType = 'generic' | 'melee' | 'projectile' | 'fall' | 'fire' | 'lava'
    | 'drowning' | 'starvation' | 'explosion' | 'magic' | 'void' | 'magnetic';

export interface DamageSource {
    type: DamageType;
    attackerId?: number;
    directEntityId?: number;
    bypassArmor?: boolean;
    bypassInvulnerability?: boolean;
    scalesWithDifficulty?: boolean;
    fire?: boolean;
    projectile?: boolean;
    magic?: boolean;
}

export const damageSources = {
    generic: (): DamageSource => ({ type: 'generic' }),
    melee: (attackerId?: number): DamageSource => ({ type: 'melee', attackerId }),
    projectile: (directEntityId?: number, attackerId?: number): DamageSource => ({ type: 'projectile', directEntityId, attackerId, projectile: true }),
    fall: (): DamageSource => ({ type: 'fall' }),
    fire: (): DamageSource => ({ type: 'fire', fire: true }),
    explosion: (attackerId?: number): DamageSource => ({ type: 'explosion', attackerId }),
    magic: (attackerId?: number): DamageSource => ({ type: 'magic', attackerId, magic: true }),
    void: (): DamageSource => ({ type: 'void', bypassArmor: true, bypassInvulnerability: true }),
} as const;
