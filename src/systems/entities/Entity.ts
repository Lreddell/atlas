import * as THREE from 'three';
import { BlockType } from '../../types';

// A live entity instance. Positions follow the same convention as the player
// collision helpers: pos.x/pos.z are the horizontal center, pos.y is the feet
// (AABB bottom). width is the full footprint, height the full height.
export interface Entity {
    id: number;
    kind: string;
    pos: THREE.Vector3;
    vel: THREE.Vector3;
    width: number;
    height: number;
    hp: number;
    maxHp: number;
    grounded: boolean;
    aggro: boolean;
    /** ms timestamp until which the entity renders a hurt flash. */
    hurtUntil: number;
    /** seconds remaining before this entity can deal contact damage again. */
    attackCooldown: number;
    /** seconds remaining before AI may replace horizontal knockback velocity. */
    knockbackSeconds: number;
    /** facing yaw (radians) for rendering. */
    yaw: number;
    isBoss: boolean;
    bossId?: string;
    regionId?: string;
    /** Leash anchor (spawn point). Bosses with a leashRadius stay within it. */
    home?: THREE.Vector3;
    // --- Magnetic Warden boss mechanics ---
    /** While true the boss takes no damage (its shield crystals are intact). */
    shielded: boolean;
    /** Shield crystals still standing; the shield drops at 0. */
    shieldCrystals: number;
    /** Current polarity: 1 = positive (red), -1 = negative (blue). */
    polarity: number;
    /** Seconds until the next polarity swap. */
    polarityTimer: number;
    /** Seconds until the next projectile volley. */
    projectileTimer: number;
}

// A boss projectile (a magnetic bolt). Simple ballistic mover that damages the
// player on contact, themed by polarity colour.
export interface Projectile {
    id: number;
    pos: THREE.Vector3;
    vel: THREE.Vector3;
    ttl: number;
    damage: number;
    polarity: number;
}

export interface DropSpec {
    type: BlockType;
    min: number;
    max: number;
    chance?: number; // 0..1, default 1
}

// Static, data-driven definition of an entity type. Add a new enemy/boss by
// adding an entry here (and, for bosses, wiring its bossId/region at spawn).
export interface EntityKind {
    id: string;
    maxHp: number;
    width: number;
    height: number;
    /** horizontal move speed in blocks/sec when chasing. */
    speed: number;
    /** distance (blocks) at which the entity notices and chases the player. */
    aggroRange: number;
    contactDamage: number;
    /** seconds between contact hits. */
    attackCooldown: number;
    /** render color (hex). */
    color: number;
    isBoss?: boolean;
    drops?: DropSpec[];
    /** can the entity jump up a 1-block step while chasing. */
    canStep?: boolean;
    /** Boss starts shielded with this many crystals (0/undefined = no shield). */
    shieldCrystals?: number;
    /** Seconds between polarity swaps (undefined = never swaps). */
    polaritySwapInterval?: number;
    /** Seconds between projectile volleys (undefined = no projectiles). */
    projectileInterval?: number;
    /** Damage per projectile hit. */
    projectileDamage?: number;
    /** Max horizontal distance (blocks) the entity may stray from its spawn. */
    leashRadius?: number;
    /** Reach (blocks) of the boss's attract/repel magnetic field. */
    magneticFieldRange?: number;
    /** Peak acceleration (blocks/s²) the boss field applies at point-blank. */
    magneticFieldForce?: number;
}

export const ENTITY_KINDS: Record<string, EntityKind> = {
    slime: {
        id: 'slime',
        maxHp: 16,
        width: 0.9,
        height: 0.9,
        speed: 2.6,
        aggroRange: 14,
        contactDamage: 3,
        attackCooldown: 0.8,
        color: 0x5bbf5b,
        drops: [{ type: BlockType.DIRT, min: 0, max: 2 }],
        canStep: true,
    },
    cinder_warden: {
        id: 'cinder_warden',
        maxHp: 200,
        width: 1.6,
        height: 2.6,
        speed: 2.0,
        aggroRange: 24,
        contactDamage: 7,
        attackCooldown: 1.1,
        color: 0xff5530,
        isBoss: true,
        canStep: true,
    },
    magnetic_warden: {
        id: 'magnetic_warden',
        maxHp: 240,
        width: 1.8,
        height: 2.8,
        speed: 2.2,
        // Large enough to stay engaged with a player on the arena pillars across
        // the lava moat (forget range is 1.5×, covering the whole arena).
        aggroRange: 40,
        contactDamage: 8,
        attackCooldown: 1.0,
        color: 0x8e24aa,
        isBoss: true,
        canStep: true,
        shieldCrystals: 4,
        polaritySwapInterval: 6,
        projectileInterval: 2.2,
        projectileDamage: 5,
        // Confined to the central platform so it never paths into the moat.
        leashRadius: 19,
        // Arena-scale attract/repel field (the signature mechanic).
        magneticFieldRange: 30,
        magneticFieldForce: 40,
    },
};
