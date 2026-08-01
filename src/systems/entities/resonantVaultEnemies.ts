import type { BlockType } from '../../types.ts';
import type { EntityKind, EntityMovementAbility } from './Entity.ts';
import type { EncounterBounds, EncounterPosition } from './resonantEncounterActivation.ts';

export type VaultEnemyKind = 'vault_guard' | 'vault_marksman' | 'bell_hound' | 'tollkeeper';
export type VaultEnemyRole = 'frontline' | 'ranged' | 'flanker' | 'elite';
export type VaultEnemyActionId =
    | 'guard_sweep'
    | 'shield_bash'
    | 'crossbow_shot'
    | 'crossbow_volley'
    | 'hound_leap'
    | 'hound_rake'
    | 'hammer_strike'
    | 'bell_toll'
    | 'breaker_charge'
    | 'guard_block';

export type VaultEnemyAttackClass = 'melee' | 'ranged' | 'control';

export interface VaultEnemyActionProfile {
    id: VaultEnemyActionId;
    attackClass: VaultEnemyAttackClass;
    anticipation: number;
    active: number;
    recovery: number;
    damage: number;
    minRange: number;
    range: number;
    arcRadians: number;
    stagger: number;
    cooldownSeconds: number;
    locksMovement: boolean;
    projectile?: {
        speed: number;
        gravity: number;
        maxDistance: number;
        burst?: number;
        spreadRadians?: number;
    };
    counterplay: string;
}

/**
 * A raised-guard window: frontal hits are turned away while it lasts, so the
 * player has to time attacks around it (or break it with a heavy stagger).
 */
export interface VaultEnemyBlockProfile {
    durationSeconds: number;
    cooldownSeconds: number;
    arcRadians: number;
    /** A hit with at least this much stagger smashes through the guard. */
    breakStagger: number;
}

export interface VaultEnemyProfile {
    kind: VaultEnemyKind;
    role: VaultEnemyRole;
    navigation: EntityMovementAbility;
    actions: readonly VaultEnemyActionProfile[];
    block?: VaultEnemyBlockProfile;
    entity: EntityKind;
}

export interface VaultEnemyLootTypes {
    fracturedCore: BlockType;
    echoShard: BlockType;
    vaultBolt: BlockType;
}

export const MAX_ROOM_ENEMIES = 6;
export const MAX_LOADED_VAULT_ENEMIES = 12;

const ACTIONS: Record<VaultEnemyKind, readonly VaultEnemyActionProfile[]> = {
    vault_guard: [
        {
            id: 'guard_sweep', attackClass: 'melee', anticipation: 0.56, active: 0.22, recovery: 0.68,
            damage: 8, minRange: 1.25, range: 3.55, arcRadians: Math.PI * 0.72, stagger: 0.38,
            cooldownSeconds: 1.45, locksMovement: true,
            counterplay: 'Stay outside the levelled spear, then close during its follow-through.',
        },
        {
            id: 'shield_bash', attackClass: 'control', anticipation: 0.34, active: 0.16, recovery: 0.82,
            damage: 5, minRange: 0, range: 1.7, arcRadians: Math.PI * 0.58, stagger: 0.78,
            cooldownSeconds: 3.6, locksMovement: true,
            counterplay: 'Sidestep the planted shield; the guard cannot turn after committing.',
        },
    ],
    vault_marksman: [
        {
            id: 'crossbow_shot', attackClass: 'ranged', anticipation: 0.72, active: 0.1, recovery: 1.12,
            damage: 5, minRange: 4, range: 24, arcRadians: Math.PI / 16, stagger: 0.18,
            cooldownSeconds: 1.55, locksMovement: true,
            projectile: { speed: 24, gravity: 1.8, maxDistance: 34 },
            counterplay: 'Break line of sight, then pressure the visible reload window.',
        },
        {
            id: 'crossbow_volley', attackClass: 'ranged', anticipation: 1.18, active: 0.14, recovery: 1.7,
            damage: 4, minRange: 8, range: 28, arcRadians: Math.PI / 12, stagger: 0.14,
            cooldownSeconds: 5.4, locksMovement: true,
            projectile: { speed: 23, gravity: 1.6, maxDistance: 38, burst: 3, spreadRadians: 0.065 },
            counterplay: 'The long brace announces a three-bolt fan; cover or a decisive rush defeats it.',
        },
    ],
    bell_hound: [
        {
            id: 'hound_leap', attackClass: 'melee', anticipation: 0.4, active: 0.38, recovery: 0.66,
            damage: 7, minRange: 2, range: 5.6, arcRadians: Math.PI * 0.6, stagger: 0.28,
            cooldownSeconds: 2.35, locksMovement: false,
            counterplay: 'Track the crouch, then sidestep its committed landing.',
        },
        {
            id: 'hound_rake', attackClass: 'melee', anticipation: 0.22, active: 0.2, recovery: 0.5,
            damage: 5, minRange: 0, range: 1.65, arcRadians: Math.PI * 1.12, stagger: 0.2,
            cooldownSeconds: 1.05, locksMovement: true,
            counterplay: 'Back away when the hound twists across your feet.',
        },
    ],
    tollkeeper: [
        {
            id: 'hammer_strike', attackClass: 'melee', anticipation: 0.96, active: 0.3, recovery: 1.12,
            damage: 14, minRange: 0, range: 4.2, arcRadians: Math.PI * 0.52, stagger: 0.72,
            cooldownSeconds: 2.5, locksMovement: true,
            counterplay: 'Leave the marked hammer lane, then punish the long follow-through.',
        },
        {
            id: 'bell_toll', attackClass: 'control', anticipation: 1.2, active: 0.82, recovery: 1.28,
            damage: 9, minRange: 2.5, range: 9.5, arcRadians: Math.PI * 2, stagger: 0.5,
            cooldownSeconds: 6.2, locksMovement: true,
            counterplay: 'Jump the travelling resonance ring or move into the quiet center.',
        },
        {
            id: 'breaker_charge', attackClass: 'control', anticipation: 0.86, active: 0.5, recovery: 1.5,
            damage: 16, minRange: 4.2, range: 12.5, arcRadians: Math.PI * 0.18, stagger: 0.9,
            cooldownSeconds: 7.4, locksMovement: false,
            counterplay: 'Leave the long marked lane before the Tollkeeper lowers its shoulder.',
        },
    ],
};

const NAVIGATION: Record<VaultEnemyKind, EntityMovementAbility> = {
    vault_guard: {
        width: 0.92, height: 1.82, maxStep: 1, maxJump: 1, maxDrop: 2,
        preferredRange: { min: 0, max: 1.15 }, acceleration: 11,
        turnRate: 7, jumpImpulse: 7.2, dropSpeedScale: 0.48,
    },
    vault_marksman: {
        width: 0.86, height: 1.78, maxStep: 1, maxJump: 1, maxDrop: 2,
        preferredRange: { min: 9, max: 13 }, acceleration: 10,
        turnRate: 8, jumpImpulse: 7, dropSpeedScale: 0.5, strafe: true,
    },
    bell_hound: {
        width: 1.08, height: 0.92, maxStep: 1, maxJump: 2, maxDrop: 3,
        preferredRange: { min: 2.1, max: 3.6 }, acceleration: 20,
        turnRate: 13, jumpImpulse: 8.6, dropSpeedScale: 0.62, strafe: true,
    },
    tollkeeper: {
        // Navigation footprint is deliberately narrower than the visual model:
        // a 3x3-column footprint could not path past ordinary room furnishing,
        // which left the crypt elite standing in place. Two columns of clearance
        // read fine for a shouldered giant and let it actually close distance.
        width: 1.45, height: 2.74, maxStep: 1, maxJump: 1, maxDrop: 2,
        preferredRange: { min: 0, max: 1.6 }, acceleration: 8,
        turnRate: 4.8, jumpImpulse: 7, dropSpeedScale: 0.32,
    },
};

function entityKind(
    kind: VaultEnemyKind,
    values: Omit<EntityKind, 'id' | 'navigation' | 'canStep' | 'contactDamage' | 'attackCooldown'>,
): EntityKind {
    return {
        id: kind,
        ...values,
        contactDamage: 0,
        attackCooldown: 0,
        navigation: NAVIGATION[kind],
        canStep: true,
    };
}

// The arena room is 55x51 blocks, so its corner-to-corner diagonal is ~75.
// Acquisition must cover that full span: an enemy that can see the player
// anywhere in the largest vault room never idles mid-fight.
const VAULT_ENEMY_AGGRO_RANGE = 78;

const ENTITIES: Record<VaultEnemyKind, EntityKind> = {
    vault_guard: entityKind('vault_guard', {
        maxHp: 44, width: 0.92, height: 1.82, speed: 2.45, aggroRange: VAULT_ENEMY_AGGRO_RANGE,
        color: 0x5a5b55, armored: true, staggerResistance: 0.35,
    }),
    vault_marksman: entityKind('vault_marksman', {
        maxHp: 30, width: 0.86, height: 1.78, speed: 2.65, aggroRange: VAULT_ENEMY_AGGRO_RANGE,
        color: 0x68645a, staggerResistance: 0.08,
    }),
    bell_hound: entityKind('bell_hound', {
        maxHp: 28, width: 1.08, height: 0.92, speed: 3.75, aggroRange: VAULT_ENEMY_AGGRO_RANGE,
        color: 0x6a6255, staggerResistance: 0.12,
    }),
    tollkeeper: entityKind('tollkeeper', {
        maxHp: 92, width: 1.5, height: 2.74, speed: 2.05, aggroRange: VAULT_ENEMY_AGGRO_RANGE,
        color: 0x514f49, armored: true, staggerResistance: 0.58,
    }),
};

const BLOCKS_BY_KIND: Partial<Record<VaultEnemyKind, VaultEnemyBlockProfile>> = {
    vault_guard: { durationSeconds: 1.25, cooldownSeconds: 3.4, arcRadians: Math.PI * 0.82, breakStagger: 0.55 },
    tollkeeper: { durationSeconds: 1.6, cooldownSeconds: 4.6, arcRadians: Math.PI * 0.7, breakStagger: 0.62 },
};

export const VAULT_ENEMY_PROFILES: Readonly<Record<VaultEnemyKind, VaultEnemyProfile>> = Object.freeze({
    vault_guard: { kind: 'vault_guard', role: 'frontline', navigation: NAVIGATION.vault_guard, actions: ACTIONS.vault_guard, block: BLOCKS_BY_KIND.vault_guard, entity: ENTITIES.vault_guard },
    vault_marksman: { kind: 'vault_marksman', role: 'ranged', navigation: NAVIGATION.vault_marksman, actions: ACTIONS.vault_marksman, entity: ENTITIES.vault_marksman },
    bell_hound: { kind: 'bell_hound', role: 'flanker', navigation: NAVIGATION.bell_hound, actions: ACTIONS.bell_hound, entity: ENTITIES.bell_hound },
    tollkeeper: { kind: 'tollkeeper', role: 'elite', navigation: NAVIGATION.tollkeeper, actions: ACTIONS.tollkeeper, block: BLOCKS_BY_KIND.tollkeeper, entity: ENTITIES.tollkeeper },
});

const ROOM_WAVE_VARIANTS: Record<string, readonly (readonly (readonly VaultEnemyKind[])[])[]> = {
    guard_hall: [
        [['vault_guard', 'vault_guard', 'vault_marksman'], ['vault_guard', 'bell_hound', 'vault_marksman']],
        [['vault_guard', 'bell_hound', 'bell_hound'], ['vault_guard', 'vault_guard', 'bell_hound']],
        [['tollkeeper', 'vault_guard', 'vault_marksman'], ['vault_guard', 'vault_guard', 'vault_marksman', 'bell_hound']],
    ],
    resonance_foundry: [
        [['vault_guard', 'vault_marksman', 'bell_hound'], ['vault_guard', 'vault_guard', 'vault_marksman']],
        [['bell_hound', 'bell_hound', 'vault_guard'], ['bell_hound', 'vault_marksman', 'vault_marksman']],
        [['tollkeeper', 'vault_guard', 'bell_hound'], ['tollkeeper', 'vault_marksman', 'bell_hound']],
    ],
    inner_works: [
        [['vault_marksman', 'bell_hound', 'bell_hound'], ['vault_guard', 'bell_hound', 'vault_marksman']],
        [['tollkeeper', 'vault_guard', 'vault_marksman'], ['tollkeeper', 'bell_hound', 'vault_guard']],
        [['tollkeeper', 'vault_guard', 'vault_marksman', 'bell_hound'], ['tollkeeper', 'tollkeeper', 'vault_marksman']],
    ],
    bell_crypt: [
        [['bell_hound', 'bell_hound', 'vault_guard'], ['vault_guard', 'vault_guard', 'bell_hound']],
        [['vault_guard', 'vault_marksman', 'vault_marksman'], ['vault_guard', 'bell_hound', 'vault_marksman']],
        [['tollkeeper', 'bell_hound', 'vault_guard'], ['tollkeeper', 'vault_marksman', 'bell_hound']],
        [['tollkeeper', 'tollkeeper', 'vault_marksman', 'bell_hound'], ['tollkeeper', 'vault_guard', 'vault_marksman', 'bell_hound']],
    ],
    grand_ascent: [
        [['vault_guard', 'vault_marksman'], ['vault_guard', 'bell_hound']],
        [['bell_hound', 'tollkeeper'], ['vault_guard', 'tollkeeper']],
    ],
    combat: [
        [['vault_guard', 'vault_marksman'], ['vault_guard', 'bell_hound']],
        [['bell_hound', 'vault_guard'], ['vault_marksman', 'bell_hound']],
    ],
};

export function isVaultEnemyKind(kind: string): kind is VaultEnemyKind {
    return Object.prototype.hasOwnProperty.call(VAULT_ENEMY_PROFILES, kind);
}

export function getVaultEnemyProfile(kind: string): VaultEnemyProfile {
    if (!isVaultEnemyKind(kind)) throw new Error(`Unknown vault enemy kind: ${kind}`);
    return VAULT_ENEMY_PROFILES[kind];
}

export function getRoomEncounterWaves(roomKind: string, seed: number): VaultEnemyKind[][] {
    const stages = ROOM_WAVE_VARIANTS[roomKind] ?? [];
    let value = (seed ^ Math.imul(roomKind.length + 17, 0x9e3779b1)) >>> 0;
    return stages.map((variants, stage) => {
        value ^= value << 13;
        value ^= value >>> 17;
        value ^= value << 5;
        const index = ((value >>> 0) + stage * 3) % variants.length;
        return [...variants[index]];
    });
}

export function getBellTitanReinforcementWave(stage: 1 | 2): VaultEnemyKind[] {
    return stage === 1
        ? ['bell_hound', 'bell_hound', 'bell_hound', 'vault_guard', 'vault_guard']
        : ['vault_marksman', 'vault_marksman', 'tollkeeper', 'tollkeeper', 'bell_hound', 'vault_guard'];
}

export function getVaultRecoveryAnchors(
    bounds: EncounterBounds,
    floorY: number,
    variant: number,
): EncounterPosition[] {
    const insetX = Math.min(5, Math.max(2, Math.floor((bounds.maxX - bounds.minX) * 0.2)));
    const insetZ = Math.min(5, Math.max(2, Math.floor((bounds.maxZ - bounds.minZ) * 0.2)));
    const anchors: EncounterPosition[] = [
        { x: bounds.minX + insetX, y: floorY, z: bounds.minZ + insetZ },
        { x: bounds.maxX - insetX, y: floorY, z: bounds.minZ + insetZ },
        { x: bounds.maxX - insetX, y: floorY, z: bounds.maxZ - insetZ },
        { x: bounds.minX + insetX, y: floorY, z: bounds.maxZ - insetZ },
    ];
    const offset = ((variant % anchors.length) + anchors.length) % anchors.length;
    return [...anchors.slice(offset), ...anchors.slice(0, offset)];
}

function getVaultEnemyDrops(kind: VaultEnemyKind, loot: VaultEnemyLootTypes): EntityKind['drops'] {
    switch (kind) {
        case 'vault_guard': return [{ type: loot.fracturedCore, min: 1, max: 2, chance: 0.72 }];
        case 'vault_marksman': return [
            { type: loot.vaultBolt, min: 1, max: 3, chance: 0.82 },
            { type: loot.echoShard, min: 1, max: 2, chance: 0.55 },
        ];
        case 'bell_hound': return [{ type: loot.echoShard, min: 1, max: 2, chance: 0.68 }];
        case 'tollkeeper': return [
            { type: loot.fracturedCore, min: 3, max: 5, chance: 1 },
            { type: loot.echoShard, min: 2, max: 4, chance: 0.8 },
        ];
    }
}

export function registerVaultEnemies(
    registry: Record<string, EntityKind>,
    loot: VaultEnemyLootTypes,
): void {
    for (const profile of Object.values(VAULT_ENEMY_PROFILES)) {
        registry[profile.kind] = {
            ...profile.entity,
            drops: getVaultEnemyDrops(profile.kind, loot),
        };
    }
}
