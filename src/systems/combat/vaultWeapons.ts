import { BlockType } from '../../types';

export type VaultWeaponKind = 'spear' | 'crossbow' | 'maul' | 'hammer';

export interface VaultWeaponProfile {
    kind: VaultWeaponKind;
    damage: number;
    reach: number;
    cooldownSeconds: number;
    stagger: number;
    durabilityCost: number;
}

export interface VaultWeaponTargetTraits {
    armored?: boolean;
    staggerResistance?: number;
}

export interface VaultWeaponAttackContext {
    distance?: number;
}

export interface VaultWeaponHit {
    profile: VaultWeaponProfile;
    damage: number;
    armorMultiplier: number;
    spacingMultiplier: number;
    stagger: number;
    technique: 'standard' | 'spear_sweet_spot' | 'armor_break' | 'titan_crush';
}

const PROFILES = new Map<BlockType, VaultWeaponProfile>([
    [BlockType.VAULTSTEEL_SPEAR, { kind: 'spear', damage: 6, reach: 5.4, cooldownSeconds: 0.58, stagger: 0.35, durabilityCost: 1 }],
    [BlockType.VAULT_CROSSBOW, { kind: 'crossbow', damage: 7, reach: 64, cooldownSeconds: 1.15, stagger: 0.25, durabilityCost: 1 }],
    [BlockType.BELLBREAKER_MAUL, { kind: 'maul', damage: 9, reach: 4.2, cooldownSeconds: 1.05, stagger: 1, durabilityCost: 1 }],
    [BlockType.TITAN_HAMMER, { kind: 'hammer', damage: 11, reach: 4.4, cooldownSeconds: 1.1, stagger: 1.25, durabilityCost: 1 }],
]);

export function getVaultWeaponProfile(type: BlockType): VaultWeaponProfile | null {
    return PROFILES.get(type) ?? null;
}

export function isEchoArtifact(type: BlockType): boolean {
    return type === BlockType.ECHO_TUNING_FORK;
}

export function resolveVaultMeleeHit(
    type: BlockType,
    target: VaultWeaponTargetTraits,
    context: VaultWeaponAttackContext = {},
): VaultWeaponHit | null {
    const profile = getVaultWeaponProfile(type);
    if (!profile || profile.kind === 'crossbow') return null;
    const distance = Number.isFinite(context.distance) ? Math.max(0, context.distance ?? 0) : null;
    const spearSweetSpot = profile.kind === 'spear' && distance !== null && distance >= 3.2;
    const spearCrowded = profile.kind === 'spear' && distance !== null && distance < 1.75;
    const spacingMultiplier = spearSweetSpot ? 1.35 : spearCrowded ? 0.82 : 1;
    const armorMultiplier = !target.armored ? 1
        : profile.kind === 'maul' ? 1.65
            : profile.kind === 'hammer' ? 1.55
                : 1;
    const resistance = Math.min(0.9, Math.max(0, target.staggerResistance ?? 0));
    const technique = spearSweetSpot ? 'spear_sweet_spot'
        : target.armored && profile.kind === 'maul' ? 'armor_break'
            : profile.kind === 'hammer' ? 'titan_crush'
                : 'standard';
    return {
        profile,
        damage: profile.damage * armorMultiplier * spacingMultiplier,
        armorMultiplier,
        spacingMultiplier,
        stagger: profile.stagger * (spearSweetSpot ? 1.45 : spearCrowded ? 0.7 : 1) * (1 - resistance),
        technique,
    };
}
