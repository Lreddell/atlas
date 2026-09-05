import * as THREE from 'three';
import { BlockType } from '../../types';
import { WARDEN_MAX_HP } from '../boss/magneticWardenCore';
import type { NavigationPath, NavigationProfile, NavigationVector } from './navigation/navigationTypes';
import type { NavigationTicket } from './navigation/NavigationPlanner';

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
    /** Encounter-owned incoming-damage scale. Applied once by EntityManager. */
    damageMultiplier: number;
    grounded: boolean;
    aggro: boolean;
    /** ms timestamp until which the entity renders a hurt flash. */
    hurtUntil: number;
    /** ms timestamp until which a shielded boss renders a "blocked" shimmer. */
    shieldHitUntil: number;
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
    // --- Polarity boss surface (driven by the Magnetic Warden encounter) ---
    /** While true the boss takes no damage from any hit (a blocked shimmer instead). */
    shielded: boolean;
    /** Current polarity: 1 = positive (red), -1 = negative (blue). */
    polarity: number;
    /**
     * Attract/repel field this entity emits at the player right now, or null.
     * Owned by the entity's brain (the Warden's Draw multiplies it); the player
     * physics reads it through EntityManager.getMagneticFieldSources().
     */
    field?: EntityMagneticField | null;
    /** Seconds of post-spawn grace: present (music/bar) but passive, no attacks. */
    aggroGrace: number;
    /** Rideable entities (boats): true while the player is aboard, the player's
     *  physics drives the entity's position/yaw instead of its own tick. */
    ridden: boolean;
    /** Transient pathing state. World/entity persistence deliberately ignores it. */
    navigationState?: NavigationRuntimeState;
    /** Runtime-only bounds for an authored room encounter. */
    encounterBounds?: EntityEncounterBounds;
    /** Runtime-only supported recovery anchors owned by that same room. */
    recoveryAnchors?: NavigationVector[];
    /** Stable authored room identity; never serialized with the entity. */
    encounterRoomId?: string;
    /** Authoritative combat phase sampled by rendering and movement. */
    combatAction?: EntityCombatActionState;
    /** Short visible recovery after an authored same-room navigation rescue. */
    reformingUntil?: number;
}

export interface EntityEncounterBounds {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    minZ: number;
    maxZ: number;
}

export interface EntityCombatActionState {
    id: string;
    phase: 'anticipation' | 'active' | 'recovery';
    elapsed: number;
    duration: number;
    locksMovement: boolean;
    targetYaw: number;
}

/** A polarity field emitter (see magneticField.bossFieldVelocityDelta). */
export interface EntityMagneticField {
    /** Field reach in blocks. */
    range: number;
    /** Ramp acceleration (blocks/s²). */
    force: number;
    /** Top drift speed (blocks/s) the field pushes or pulls the player to. */
    maxDrift: number;
}

// An expanding ground ring. A 'polarity' ring carries the boss's colour: a
// player holding the SAME polarity is launched off the charged ground (and
// hurt), the OPPOSITE polarity is pinned safe, no boots just hurts. A 'slam'
// ring is the player's own Magnet Slam impact, purely visual here.
export interface Shockwave {
    id: number;
    x: number;
    y: number;
    z: number;
    polarity: number;
    radius: number;
    maxRadius: number;
    speed: number;
    /** Damage dealt to a player the ring catches on the wrong polarity. */
    damage: number;
    /** Whether it has already resolved against the player. */
    hit: boolean;
    kind: 'polarity' | 'slam';
}

// A boss bolt: a ballistic mover coloured by the polarity it was fired with.
// Matching polarity repels it off the player's boots (it bounces away, spent);
// opposite polarity draws it in (it homes) and it hits.
export interface Projectile {
    id: number;
    pos: THREE.Vector3;
    vel: THREE.Vector3;
    ttl: number;
    damage: number;
    polarity: number;
    /** Entity id of the boss that fired it. */
    sourceId?: number;
    /** Visual family: volley bolts are chunky, spiral bolts are small and fast-looking. */
    kind?: 'volley' | 'spiral';
    /** Steering rate (1/s) toward an opposite-polarity player. */
    homing?: number;
    /** Already bounced off the player's matching polarity: harmless, fading. */
    bounced?: boolean;
}

export interface DropSpec {
    type: BlockType;
    min: number;
    max: number;
    chance?: number; // 0..1, default 1
}

/** Runtime-only movement contract used by voxel navigation and locomotion. */
export interface EntityMovementAbility extends NavigationProfile {
    preferredRange: { min: number; max: number };
    acceleration: number;
    turnRate: number;
    jumpImpulse: number;
    dropSpeedScale: number;
    strafe?: boolean;
}

export interface NavigationRuntimeState {
    path: NavigationPath | null;
    waypointIndex: number;
    goalCellKey: string;
    repathAt: number;
    lastProgressPosition: NavigationVector;
    lastProgressAt: number;
    recoveryAttempts: number;
    replans: number;
    ticket?: NavigationTicket;
    overrideGoal?: NavigationVector;
    combatGoal?: NavigationVector;
    combatGoalUntil?: number;
    strafeDirection?: -1 | 1;
    disengaging?: boolean;
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
    /** Passive prop/vehicle (boats): no AI, no aggro, no contact damage, never
     *  triggers combat music; simulated with simple float/settle physics. */
    passive?: boolean;
    /** Floats on water (buoyancy + surface bobbing) while unridden. */
    floats?: boolean;
    isBoss?: boolean;
    drops?: DropSpec[];
    /** Explicit pathing body and traversal limits. Added per entity in the
     * locomotion integration; omitted definitions keep the legacy mover. */
    navigation?: EntityMovementAbility;
    /** can the entity jump up a 1-block step while chasing. */
    canStep?: boolean;
    /** Physical armor trait used by conventional blunt weapon profiles. */
    armored?: boolean;
    /** Fraction of incoming stagger resisted, clamped to 0..0.9 by combat rules. */
    staggerResistance?: number;
    /** Max horizontal distance (blocks) the entity may stray from its spawn. */
    leashRadius?: number;
    /**
     * The entity's fight is authored by a registered brain (see
     * EntityManager.registerBrain) instead of the generic chase/contact AI.
     */
    brain?: string;
}

export const ENTITY_KINDS: Record<string, EntityKind> = {
    // Boat, a rideable, passive water vehicle. Placed by using a Boat item on
    // water; boarded with a right click; broken (a few punches) it drops its
    // item back. Unridden it floats and bobs at the surface; ridden, the
    // player's boat physics drives it. Persisted per world (WorldMetadata.boats).
    boat: {
        id: 'boat',
        maxHp: 8,
        width: 1.2,
        height: 0.62,
        speed: 0,
        aggroRange: 0,
        contactDamage: 0,
        attackCooldown: 1,
        color: 0x8d6e63,
        passive: true,
        floats: true,
        drops: [{ type: BlockType.BOAT, min: 1, max: 1 }],
    },
    // The Magnetic Warden. Its whole fight (three forms, telegraphs, the tower
    // crystal shields, the polarity metronome) is authored by systems/boss/magneticWardenCore and
    // driven by MagneticWardenEncounter; this entry only declares the body.
    magnetic_warden: {
        id: 'magnetic_warden',
        maxHp: WARDEN_MAX_HP,
        width: 1.8,
        height: 2.8,
        speed: 2.6,
        // Large enough to stay engaged with a player on the arena pillars across
        // the lava moat (forget range is 1.5×, covering the whole arena).
        aggroRange: 40,
        // Its body never hurts by touch: every hit comes from a telegraphed attack.
        contactDamage: 0,
        attackCooldown: 1.0,
        color: 0x8e24aa,
        isBoss: true,
        brain: 'magnetic_warden',
        navigation: {
            width: 1.8, height: 2.8, maxStep: 1, maxJump: 1, maxDrop: 1,
            preferredRange: { min: 5, max: 11 }, acceleration: 7,
            turnRate: 5, jumpImpulse: 7, dropSpeedScale: 0.4, strafe: true,
        },
        canStep: true,
        // Confined to the central platform so it never paths into the moat.
        leashRadius: 19,
        drops: [{ type: BlockType.POLARITY_BOOTS_UPGRADE, min: 1, max: 1 }],
    },
};
