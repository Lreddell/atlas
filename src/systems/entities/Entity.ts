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
    /** World positions of this boss's shield crystals (restored when it resets). */
    shieldCrystalPositions?: { x: number; y: number; z: number }[];
    /** Crystals the boss started with (so a reset can restore the shield). */
    maxShieldCrystals?: number;
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
    /** Vulnerable-phase: seconds left in the current dodge barrage before a parry. */
    barrageTimer: number;
    /** Vulnerable-phase: a deflectable parry bolt is currently in play. */
    awaitingParry: boolean;
    /** Slam attack state machine ('none' until phase 2). */
    slamState: 'none' | 'charging' | 'rising' | 'hanging' | 'dropping';
    /** Seconds until the next slam (phase 2+). */
    slamTimer: number;
    /** Seconds left in the current slam sub-phase (rise/hang). */
    slamPhaseTimer: number;
    /** Floor Y the boss rose from / slams back down to. */
    slamGroundY: number;
    /** Seconds of post-spawn grace: present (music/bar) but passive, no attacks. */
    aggroGrace: number;
}

// An expanding polarity shockwave ring from a slam. Same polarity as the boss;
// the player must hold the OPPOSITE boots polarity or be launched when it passes.
export interface Shockwave {
    id: number;
    x: number;
    y: number;
    z: number;
    polarity: number;
    radius: number;
    maxRadius: number;
    speed: number;
    /** Damage dealt to a same-polarity player the ring catches. */
    damage: number;
    /** Whether it has already resolved against the player. */
    hit: boolean;
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
    /** A purple "parry" bolt the player can hit back at the boss. */
    deflectable?: boolean;
    /** 'boss' bolts hurt the player; 'player' bolts (deflected) hurt the boss. */
    owner?: 'boss' | 'player';
    /** Entity id of the boss that fired it (so a deflected bolt knows its target). */
    sourceId?: number;
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
    /** Vulnerable-phase dodge-barrage length (seconds) before each parry bolt. */
    barrageDuration?: number;
    /** Fraction of max HP a successfully deflected parry bolt deals. */
    parryDamageFraction?: number;
    /** HP fraction (0..1) at/under which the boss enters its frenzy phase. */
    frenzyThreshold?: number;
    /** HP fraction (0..1) at/under which the boss starts its slam attacks. */
    slamThreshold?: number;
    /** Seconds between slams. */
    slamInterval?: number;
    /** Seconds the boss charges/crouches on the ground before launching (windup). */
    slamChargeTime?: number;
    /** Horizontal tracking speed (blocks/sec) toward the player while airborne. */
    slamTrackSpeed?: number;
    /** How high (blocks) the boss rises before slamming. */
    slamRiseHeight?: number;
    /** Seconds to rise to the apex (the telegraph window). */
    slamRiseTime?: number;
    /** Seconds the boss hangs at the apex before dropping. */
    slamHangTime?: number;
    /** Drop speed (blocks/sec) on the way down. */
    slamDropSpeed?: number;
    /** Damage dealt if the shockwave catches a same-polarity player. */
    slamDamage?: number;
    /** Radius (blocks) the shockwave ring expands to. */
    slamMaxRadius?: number;
    /** Expansion speed (blocks/sec) of the shockwave ring. */
    slamRingSpeed?: number;
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
        contactDamage: 16,   // a DIRECT hit from the Warden hurts a lot — keep your distance
        attackCooldown: 1.0,
        color: 0x8e24aa,
        isBoss: true,
        canStep: true,
        shieldCrystals: 4,
        polaritySwapInterval: 6,
        // Heavy projectile pressure so climbing the pillars is a real gauntlet.
        projectileInterval: 1.5,
        // Bolts hit softer now (and armor mitigates them) — the threat is volume.
        projectileDamage: 2,
        // Confined to the central platform so it never paths into the moat.
        leashRadius: 19,
        // Platform-scale attract/repel field — deliberately short of the pillars
        // (radius ~35) so it can't drag a climber off a tower.
        magneticFieldRange: 18,
        magneticFieldForce: 40,
        // Vulnerable phase: dodge a barrage, then deflect a purple bolt for ~1/12 HP.
        barrageDuration: 5,
        parryDamageFraction: 1 / 12,
        // Phase 2 (≤50%): polarity SLAM shockwaves. Phase 3 (≤25%): frenzy.
        slamThreshold: 0.5,
        slamInterval: 8,        // slams come every ~8s (frenzy is faster)
        slamChargeTime: 0.55,   // crouch + charge windup before launching
        slamTrackSpeed: 15,     // homes over the player while airborne (85% in phase 1)
        slamRiseHeight: 50,     // launches WAY up (50 blocks)
        slamRiseTime: 0.85,
        slamHangTime: 1.15,     // hang: track, then a locked/flashing beat before it drops
        slamDropSpeed: 78,      // fast slam down from way up high
        slamDamage: 9,
        slamMaxRadius: 26,
        slamRingSpeed: 15,
        frenzyThreshold: 0.25,
        drops: [{ type: BlockType.POLARITY_BOOTS_UPGRADE, min: 1, max: 1 }],
    },
};
