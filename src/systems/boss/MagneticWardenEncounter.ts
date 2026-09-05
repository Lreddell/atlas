// Magnetic Warden encounter runtime: the bridge between the pure state machine
// in magneticWardenCore and the live world. It registers itself as the
// magnetic_warden entity brain (owning the entity's movement every tick) and
// as its damage handler (applying the polarity rule and Magnet Slams to every
// hit), turns the core's events into bolts, rings, lunges, arena edits,
// particles and game events, and publishes a snapshot for the renderer and HUD.
//
// Side effects it owns:
//   - the tower crystals: each form IGNITES its own (the crystal block appears on
//     the tower and the tower's climb faces light up in the Warden's polarity),
//     and a broken crystal retires its tower once the climber is clear;
//   - the towers' polarity: every swap and Storm beat flips the ignited towers
//     with the Warden, announced first by a FLUX WINDOW (climbSurfaces) in which
//     a climber may flip to hold on;
//   - the arena clean-up on any reset.

import { worldManager } from '../WorldManager';
import { BlockType } from '../../types';
import { gameEvents } from '../events/GameEvents';
import { addTrauma } from '../player/cameraShake';
import { PLAYER_HEIGHT, PLAYER_WIDTH } from '../player/playerConstants';
import { climbSurfaces } from '../player/climbSurfaces';
import { viewRig } from '../player/viewRig';
import { wardenDefeat } from './wardenDefeat';
import { particleFx, polarityFxColor, FX_CHARGED } from '../fx/particleFx';
import { entityManager, type BrainContext } from '../entities/EntityManager';
import type { Entity } from '../entities/Entity';
import {
    ARENA_CENTRAL_RADIUS,
    ARENA_PILLAR_COUNT,
    ARENA_PILLAR_HALF,
    ARENA_PILLAR_HEIGHT,
    arenaPillarCenter,
    getPillarClimbFaceBounds,
    placePillarClimbMagnets,
    stripArenaClimbMagnets,
    stripPillarClimbMagnets,
} from '../world/magneticArena';
import {
    WARDEN_FORM_NAMES,
    WARDEN_TIMING,
    advanceWarden,
    createWardenState,
    getWardenActionDuration,
    getWardenBeatInterval,
    getWardenFieldProfile,
    isInWardenCone,
    isWardenPunishable,
    isWardenShielded,
    isWardenTransitioning,
    wardenActionPhase,
    wardenLiveTowers,
    wardenShardOffsets,
    type WardenAction,
    type WardenBoltSpec,
    type WardenEvent,
    type WardenForm,
    type WardenPolarity,
    type WardenState,
} from './magneticWardenCore';

export const MAGNETIC_WARDEN_BOSS_ID = 'magnetic_warden';
/** The melee hit zone a loaded strike reports (see InteractionController). */
export const MAGNET_SLAM_HIT_ZONE = 'magnet_slam';

export interface WardenArena {
    centerX: number;
    centerZ: number;
    /** Arena base (the platform floor is baseY + 1). */
    baseY: number;
    /** World positions of the four tower crystals, in tower order. */
    crystals: { x: number; y: number; z: number }[];
}

export interface WardenPoint { x: number; y: number; z: number }

export interface WardenTowerSnapshot {
    index: number;
    /** Tower centre column and the cap height. */
    x: number;
    z: number;
    top: number;
    crystal: WardenPoint;
    /** Polarity its climb faces currently carry. */
    polarity: number;
    /** Crystal intact. */
    standing: boolean;
    /** Powering the current form's shield. */
    ignited: boolean;
    /** An open flux window (the tower is flipping; a climber must flip to hold). */
    flux: { opensAt: number; until: number; polarity: number } | null;
    contested: boolean;
}

export interface WardenSnapshot {
    entityId: number | null;
    form: WardenForm;
    formName: string;
    action: WardenAction;
    actionTime: number;
    actionDuration: number;
    polarity: WardenPolarity;
    hp: number;
    maxHp: number;
    shielded: boolean;
    shieldLayers: number;
    shieldTotal: number;
    /** Reeling (a broken shield or a slam): hits land for the punish bonus. */
    punishable: boolean;
    towers: WardenTowerSnapshot[];
    contestTower: number | null;
    plungeTarget: WardenPoint | null;
    /** Seconds until the next Storm beat, its full interval, and the colour it brings. */
    beatRemaining: number;
    beatInterval: number;
    nextPolarity: WardenPolarity;
    doublePending: boolean;
    /** Seconds until the second ring of a double beat (0 when none is pending). */
    doubleRemaining: number;
    /** Storm shard barrier, world positions (shared with the hit test). */
    shards: WardenPoint[];
    floorY: number;
    clock: number;
    /** The shared fight clock the tower flux windows are stamped on. */
    fightClock: number;
    drawActive: boolean;
    /** Locked facing (radians, entity yaw convention) for the Lash / Charge telegraphs. */
    facingYaw: number;
    /** The Charge lane while it is telegraphed or run. */
    charge: { x: number; z: number; yaw: number; length: number; halfWidth: number; phase: 'windup' | 'lunge'; progress: number } | null;
}

const HOVER_HORIZONTAL_SPEED = 3.5;
const HOVER_VERTICAL_SPEED = 4;
const CONTEST_HORIZONTAL_SPEED = 7;
const CONTEST_VERTICAL_SPEED = 6;
const PLUNGE_TRACK_SPEED = 12;
const CRASH_DROP_SPEED = 30;
const LASH_TRACK_RATE = 2.2;
const CHARGE_TRACK_RATE = 3.0;
/** Fraction of the Charge windup during which it still tracks the player. */
const CHARGE_TRACK_FRACTION = 0.55;
/** A reeling Warden staggers toward the pool facing the tower that felled it. */
const REEL_STUMBLE_SPEED = 5;
/** A retired tower keeps its climb faces until the climber is this far from it. */
const TOWER_RETIRE_CLEARANCE = ARENA_PILLAR_HALF + 6;
const TOWER_RETIRE_TIMEOUT = 30;
/** How far from a tower a player counts as climbing / crossing to it. */
const TOWER_CONTEST_RADIUS = ARENA_PILLAR_HALF + 5.5;
const TOWER_CROSSING_RADIUS = 13;

const smooth = (t: number): number => { const c = Math.max(0, Math.min(1, t)); return c * c * (3 - 2 * c); };
const wrapAngle = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

class MagneticWardenEncounter {
    private state = createWardenState();
    private entityId: number | null = null;
    private arena: WardenArena | null = null;
    private hoverAngle = 0;
    private plungeTarget: WardenPoint | null = null;
    /** Where a broken shield sends the Warden (the pool edge facing the felled tower). */
    private crashTarget: { x: number; z: number } | null = null;
    private shardCooldown = 0;
    private facingYaw = 0;
    private plungeStartY = 0;
    private chargeHit = false;
    /** Polarity each tower's climb faces currently carry (only ignited towers are placed). */
    private towerPolarity = new Map<number, number>();
    /** Towers whose crystal fell, waiting for the climber to clear before their faces go dark. */
    private retiring = new Map<number, number>();
    private listeners = new Set<() => void>();

    constructor() {
        entityManager.registerBrain(MAGNETIC_WARDEN_BOSS_ID, (entity, dt, ctx) => this.tick(entity, dt, ctx));
        entityManager.registerDamageHandler(MAGNETIC_WARDEN_BOSS_ID, (entityId, amount, knockX, knockZ, stagger, hitZone) =>
            this.applyHit(entityId, amount, knockX, knockZ, stagger, hitZone));
        gameEvents.on('crystal:broken', ({ x, y, z }) => this.onCrystalBroken(x, y, z));
        gameEvents.on('boss:cleared', () => this.reset());
        gameEvents.on('boss:defeated', ({ bossId }) => { if (bossId === MAGNETIC_WARDEN_BOSS_ID) this.finish(); });
    }

    /** Snapshot change subscription (the HUD re-renders on these, not per frame). */
    subscribe(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
    }

    /**
     * Attach the encounter to a freshly spawned Warden entity. `arena` gives it
     * the tower crystals that shield each form; without one (the /boss spawn
     * command) every form plays unshielded.
     */
    begin(entityId: number, arena: WardenArena | null): void {
        const entity = entityManager.getEntity(entityId);
        if (!entity) return;
        this.cleanupArena();
        this.entityId = entityId;
        this.arena = arena;
        this.hoverAngle = arena ? Math.atan2(entity.pos.z - (arena.centerZ + 0.5), entity.pos.x - (arena.centerX + 0.5)) : 0;
        this.plungeTarget = null;
        this.crashTarget = null;
        this.shardCooldown = 0;
        this.chargeHit = false;
        this.facingYaw = entity.yaw;
        this.towerPolarity.clear();
        this.retiring.clear();
        climbSurfaces.clearAll();
        entity.aggro = true;
        entity.hp = entity.maxHp;
        this.emitForm(entity, 1);
        const configured = advanceWarden(createWardenState(), { type: 'configure', crystals: arena ? arena.crystals.length : 0 });
        this.state = configured.state;
        entity.polarity = this.state.polarity;
        this.applyEvents(configured.events, entity, entityManager.getPlayerPosition(), true);
        this.syncEntity(entity, true);
        this.notify();
    }

    getSnapshot(): WardenSnapshot {
        const entity = this.entityId !== null ? entityManager.getEntity(this.entityId) : undefined;
        const s = this.state;
        const floorY = this.floorY(entity);
        const charge = entity && (s.action === 'charge_windup' || s.action === 'charge_active')
            ? {
                x: entity.pos.x, z: entity.pos.z, yaw: this.facingYaw,
                length: WARDEN_TIMING.charge.length, halfWidth: WARDEN_TIMING.charge.halfWidth,
                phase: s.action === 'charge_windup' ? 'windup' as const : 'lunge' as const,
                progress: s.actionDuration > 0 ? Math.min(1, s.actionTime / s.actionDuration) : 0,
            }
            : null;
        return {
            entityId: entity ? entity.id : null,
            form: s.form,
            formName: WARDEN_FORM_NAMES[s.form],
            action: s.action,
            actionTime: s.actionTime,
            actionDuration: s.actionDuration > 0 ? s.actionDuration : getWardenActionDuration(s.action),
            polarity: s.polarity,
            hp: s.hp,
            maxHp: s.maxHp,
            shielded: isWardenShielded(s),
            shieldLayers: s.shieldLayers,
            shieldTotal: s.ignited.length,
            punishable: isWardenPunishable(s),
            towers: this.towerSnapshots(),
            contestTower: s.contestTower,
            plungeTarget: this.plungeTarget,
            beatRemaining: Math.max(0, s.beatTimer),
            beatInterval: getWardenBeatInterval(s),
            nextPolarity: s.polarity > 0 ? -1 : 1,
            doublePending: s.doubleTimer > 0,
            doubleRemaining: Math.max(0, s.doubleTimer),
            shards: entity && s.form === 3 ? this.shardWorldPositions(entity) : [],
            floorY,
            clock: s.clock,
            fightClock: climbSurfaces.clock,
            drawActive: s.action === 'draw_active',
            facingYaw: this.facingYaw,
            charge,
        };
    }

    isActive(): boolean {
        return this.entityId !== null && entityManager.getEntity(this.entityId) !== undefined;
    }

    /** The shared fight clock (seconds) the tower flux windows are stamped on. */
    getClock(): number {
        return climbSurfaces.clock;
    }

    // --- Per-tick brain ------------------------------------------------------

    private tick(entity: Entity, dt: number, ctx: BrainContext): void {
        if (this.entityId !== entity.id) this.begin(entity.id, null);
        climbSurfaces.advance(dt);
        entity.aggro = true;
        entity.knockbackSeconds = Math.max(0, entity.knockbackSeconds - dt);
        this.shardCooldown = Math.max(0, this.shardCooldown - dt);
        const player = ctx.player;
        const playerDistance = player ? Math.hypot(player.x - entity.pos.x, player.z - entity.pos.z) : 60;
        const playerTower = player ? this.towerNearPlayer(player) : null;
        const previous = this.state;
        // A player who cannot be targeted (creative/spectator) still sees the
        // fight play out, but nothing lands on them.
        const transition = advanceWarden(this.state, { type: 'tick', dt, playerDistance, playerTower });
        this.state = transition.state;
        this.applyEvents(transition.events, entity, player, ctx.targetable);
        if (this.state.action === 'death' || this.entityId !== entity.id) return;
        this.applyMovement(entity, previous, dt, player);
        this.applyContinuousHazards(entity, player, ctx.targetable);
        this.retireClearedTowers(player);
        this.syncEntity(entity, ctx.targetable);
        if (transition.events.length > 0) this.notify();
    }

    private applyMovement(entity: Entity, previous: WardenState, dt: number, player: WardenPoint | null): void {
        const s = this.state;
        const floorY = this.floorY(entity);
        if (s.form === 1 && s.action !== 'shatter') {
            this.moveGrounded(entity, dt, player);
            return;
        }
        if (s.action === 'shatter') {
            // Rise weightlessly out of the duel body toward the hover height.
            const t = smooth(s.actionTime / Math.max(0.001, s.actionDuration));
            entity.vel.set(0, 0, 0);
            entity.pos.y = floorY + WARDEN_TIMING.form2.hoverHeight * t;
            entity.grounded = false;
            return;
        }
        if (s.form === 2) {
            this.moveHover(entity, previous, dt, floorY);
            return;
        }
        if (s.action === 'storm_rise') {
            // Land: settle onto the platform as the shards unfold.
            const t = smooth(s.actionTime / Math.max(0.001, s.actionDuration));
            const from = floorY + WARDEN_TIMING.form2.limpHeight;
            entity.vel.set(0, 0, 0);
            entity.pos.y = Math.max(floorY, from + (floorY - from) * t);
            entity.grounded = entity.pos.y <= floorY + 0.01;
            if (player) entity.yaw = Math.atan2(player.x - entity.pos.x, player.z - entity.pos.z);
            return;
        }
        // Form III: a slow, inexorable advance behind the shard barrier.
        this.moveStorm(entity, dt, player);
    }

    private moveGrounded(entity: Entity, dt: number, player: WardenPoint | null): void {
        const s = this.state;
        const knockedBack = entity.knockbackSeconds > 0;
        if (s.action === 'charge_active') {
            // The lunge: a straight run down the locked lane. Collision and the
            // ledge guard stop it at the platform edge; the leash keeps it home.
            entity.yaw = this.facingYaw;
            entity.vel.x = Math.sin(this.facingYaw) * WARDEN_TIMING.charge.speed;
            entity.vel.z = Math.cos(this.facingYaw) * WARDEN_TIMING.charge.speed;
            entityManager.applyGravity(entity, dt);
            entityManager.moveEntity(entity, dt, true);
            entityManager.leashEntity(entity);
            return;
        }
        if (player && !knockedBack) {
            const want = Math.atan2(player.x - entity.pos.x, player.z - entity.pos.z);
            if (s.action === 'idle') {
                if (!entityManager.steerEntity(entity, player, dt)) entityManager.haltEntity(entity, dt);
                entity.yaw = want;
            } else if (s.action === 'shield_break' && this.crashTarget) {
                // Reeling: it staggers toward the pool below the felled tower, into
                // the climber's reach.
                this.stumbleToward(entity, this.crashTarget, dt);
            } else {
                entityManager.haltEntity(entity, dt);
                // Locked-in windups turn slowly (the telegraph shows where the
                // blow lands); the Charge tracks for the first half, then commits.
                if (s.action === 'lash_windup' || s.action === 'lash_active') {
                    const delta = wrapAngle(want - entity.yaw);
                    entity.yaw += Math.max(-LASH_TRACK_RATE * dt, Math.min(LASH_TRACK_RATE * dt, delta));
                } else if (s.action === 'charge_windup') {
                    const fraction = s.actionDuration > 0 ? s.actionTime / s.actionDuration : 1;
                    if (fraction < CHARGE_TRACK_FRACTION) {
                        const delta = wrapAngle(want - entity.yaw);
                        entity.yaw += Math.max(-CHARGE_TRACK_RATE * dt, Math.min(CHARGE_TRACK_RATE * dt, delta));
                    }
                } else if (s.action !== 'stagger' && s.action !== 'lash_recovery' && s.action !== 'charge_recovery'
                    && s.action !== 'shield_break' && s.action !== 'flinch') {
                    entity.yaw = want;
                }
            }
            this.facingYaw = entity.yaw;
        } else if (!knockedBack) {
            entityManager.haltEntity(entity, dt);
        }
        entityManager.applyGravity(entity, dt);
        entityManager.moveEntity(entity, dt, entity.grounded && !knockedBack);
        entityManager.leashEntity(entity);
    }

    private stumbleToward(entity: Entity, target: { x: number; z: number }, dt: number): void {
        const dx = target.x - entity.pos.x, dz = target.z - entity.pos.z;
        const d = Math.hypot(dx, dz);
        if (d < 1.5) { entityManager.haltEntity(entity, dt); return; }
        entity.vel.x = (dx / d) * REEL_STUMBLE_SPEED;
        entity.vel.z = (dz / d) * REEL_STUMBLE_SPEED;
    }

    private moveHover(entity: Entity, previous: WardenState, dt: number, floorY: number): void {
        const s = this.state;
        const centre = this.centre(entity);
        entity.vel.set(0, 0, 0);
        // Shielded it hovers out of reach (higher still when it contests a
        // climb); with its crystals gone it limps low enough to strike.
        const shielded = isWardenShielded(s) || (s.action === 'recover' && isWardenShielded(s));
        const contest = s.contestTower !== null && shielded ? this.contestPoint(entity, s.contestTower) : null;
        const hoverY = floorY + (contest
            ? WARDEN_TIMING.form2.contestHeight
            : shielded ? WARDEN_TIMING.form2.hoverHeight : WARDEN_TIMING.form2.limpHeight);
        const moveToward = (tx: number, tz: number, speed: number) => {
            const dx = tx - entity.pos.x, dz = tz - entity.pos.z;
            const d = Math.hypot(dx, dz);
            if (d < 0.001) return;
            const step = Math.min(d, speed * dt);
            entity.pos.x += (dx / d) * step;
            entity.pos.z += (dz / d) * step;
        };
        const easeY = (targetY: number, speed: number) => {
            const dy = targetY - entity.pos.y;
            const step = Math.min(Math.abs(dy), speed * dt);
            entity.pos.y += Math.sign(dy) * step;
        };
        switch (s.action) {
            case 'hover':
            case 'volley_windup':
            case 'volley_active':
            case 'volley_recovery':
            case 'swap_windup':
            case 'swap_recovery':
            case 'flinch':
            case 'recover': {
                if (contest) {
                    moveToward(contest.x, contest.z, CONTEST_HORIZONTAL_SPEED);
                    easeY(hoverY, CONTEST_VERTICAL_SPEED);
                } else {
                    this.hoverAngle += WARDEN_TIMING.form2.orbitRate * dt;
                    const r = WARDEN_TIMING.form2.orbitRadius;
                    moveToward(centre.x + Math.cos(this.hoverAngle) * r, centre.z + Math.sin(this.hoverAngle) * r, HOVER_HORIZONTAL_SPEED);
                    easeY(hoverY, s.action === 'recover' ? HOVER_VERTICAL_SPEED * 1.6 : HOVER_VERTICAL_SPEED);
                }
                break;
            }
            case 'plunge_windup': {
                const target = this.plungeTarget ?? { x: entity.pos.x, y: floorY, z: entity.pos.z };
                moveToward(target.x, target.z, PLUNGE_TRACK_SPEED);
                easeY(hoverY + WARDEN_TIMING.plunge.riseBeforeDrop, HOVER_VERTICAL_SPEED * 2);
                break;
            }
            case 'plunge_drop': {
                if (previous.action !== 'plunge_drop') this.plungeStartY = entity.pos.y;
                const t = smooth(s.actionTime / Math.max(0.001, s.actionDuration));
                entity.pos.y = Math.max(floorY, this.plungeStartY + (floorY - this.plungeStartY) * t);
                break;
            }
            case 'crash': {
                // Yanked out of the air by its broken shield: down, and across to
                // the pool below the tower that felled it, arriving as the crash
                // ends so the climber can drop straight onto it.
                easeY(floorY, CRASH_DROP_SPEED);
                if (this.crashTarget) {
                    const remaining = Math.max(0.05, s.actionDuration - s.actionTime);
                    const dist = Math.hypot(this.crashTarget.x - entity.pos.x, this.crashTarget.z - entity.pos.z);
                    moveToward(this.crashTarget.x, this.crashTarget.z, dist / remaining);
                }
                break;
            }
            case 'plunge_recovery':
            case 'shield_break':
            case 'stagger':
                entity.pos.y = floorY;
                break;
            default:
                break;
        }
        entity.pos.y = Math.max(floorY, entity.pos.y);
        entity.grounded = entity.pos.y <= floorY + 0.01;
        const player = entityManager.getPlayerPosition();
        if (player) entity.yaw = Math.atan2(player.x - entity.pos.x, player.z - entity.pos.z);
        this.facingYaw = entity.yaw;
    }

    private moveStorm(entity: Entity, dt: number, player: WardenPoint | null): void {
        const knockedBack = entity.knockbackSeconds > 0;
        if (player && !knockedBack) {
            const dx = player.x - entity.pos.x, dz = player.z - entity.pos.z;
            const d = Math.hypot(dx, dz) || 1;
            entity.yaw = Math.atan2(dx, dz);
            this.facingYaw = entity.yaw;
            if (d > 3.2 && this.state.action === 'spiral') {
                entity.vel.x = (dx / d) * WARDEN_TIMING.form3.approachSpeed;
                entity.vel.z = (dz / d) * WARDEN_TIMING.form3.approachSpeed;
            } else {
                entityManager.haltEntity(entity, dt);
            }
        } else if (!knockedBack) {
            entityManager.haltEntity(entity, dt);
        }
        entityManager.applyGravity(entity, dt);
        entityManager.moveEntity(entity, dt, entity.grounded && !knockedBack);
        entityManager.leashEntity(entity);
    }

    private applyContinuousHazards(entity: Entity, player: WardenPoint | null, targetable: boolean): void {
        const s = this.state;
        if (!player || !targetable) return;
        // The Charge: one clean hit on anyone in its path.
        if (s.action === 'charge_active' && !this.chargeHit) {
            const reach = entity.width * 0.5 + PLAYER_WIDTH * 0.5 + 0.35;
            const dx = player.x - entity.pos.x, dz = player.z - entity.pos.z;
            const vertical = player.y < entity.pos.y + entity.height && player.y + PLAYER_HEIGHT > entity.pos.y;
            if (Math.abs(dx) < reach && Math.abs(dz) < reach && vertical) {
                this.chargeHit = true;
                const fx = Math.sin(this.facingYaw), fz = Math.cos(this.facingYaw);
                if (entityManager.tryDamagePlayer(WARDEN_TIMING.charge.damage, fx, fz, 'attack')) {
                    entityManager.impulsePlayer(fx * 11, 7, fz * 11);
                    addTrauma(0.6);
                    particleFx.burst({ x: player.x, y: player.y + 1, z: player.z, color: polarityFxColor(s.polarity), color2: [1, 1, 1], count: 24, speed: 8, upBias: 3, spread: 1, size: 0.26, life: 0.6, gravity: 5, drag: 1.1 });
                    gameEvents.emit('boss:charge', { bossId: MAGNETIC_WARDEN_BOSS_ID, entityId: entity.id, phase: 'hit' });
                }
            }
        }
        // Form III shard barrier: brushing a shard costs a little health and shoves.
        if (s.form === 3 && s.action !== 'storm_rise' && this.shardCooldown <= 0) {
            const px = player.x, py = player.y + PLAYER_HEIGHT * 0.5, pz = player.z;
            for (const shard of this.shardWorldPositions(entity)) {
                const dx = px - shard.x, dy = py - shard.y, dz = pz - shard.z;
                if (dx * dx + dz * dz < 1.1 && Math.abs(dy) < 1.6) {
                    this.shardCooldown = WARDEN_TIMING.form3.shardCooldown;
                    const d = Math.hypot(dx, dz) || 1;
                    if (entityManager.tryDamagePlayer(WARDEN_TIMING.form3.shardDamage, dx / d, dz / d, 'contact')) {
                        particleFx.burst({ x: shard.x, y: shard.y, z: shard.z, color: polarityFxColor(s.polarity), color2: [1, 1, 1], count: 12, speed: 6, upBias: 2, spread: 1, size: 0.22, life: 0.5, gravity: 5, drag: 1.2 });
                    }
                    break;
                }
            }
        }
    }

    private syncEntity(entity: Entity, targetable: boolean): void {
        const s = this.state;
        entity.polarity = s.polarity;
        entity.hp = s.hp;
        // The generic shield flag covers both reasons a hit cannot land, so the
        // player's kit offers a dash only when a strike would count.
        entity.shielded = isWardenShielded(s) || isWardenTransitioning(s);
        entity.field = targetable ? getWardenFieldProfile(s) : null;
        const duration = s.actionDuration > 0 ? s.actionDuration : getWardenActionDuration(s.action);
        entity.combatAction = {
            id: s.action,
            phase: wardenActionPhase(s.action),
            elapsed: s.actionTime,
            duration: Math.max(0.001, duration),
            locksMovement: s.action !== 'idle' && s.action !== 'spiral',
            targetYaw: entity.yaw,
        };
    }

    // --- Events → world ------------------------------------------------------

    private applyEvents(events: readonly WardenEvent[], entity: Entity, player: WardenPoint | null, targetable: boolean): void {
        const bossId = MAGNETIC_WARDEN_BOSS_ID;
        const entityId = entity.id;
        for (const event of events) {
            switch (event.type) {
                case 'action':
                    if (event.action === 'lash_windup') this.facingYaw = entity.yaw;
                    if (event.action === 'charge_windup') {
                        this.facingYaw = entity.yaw;
                        this.chargeHit = false;
                        gameEvents.emit('boss:charge', { bossId, entityId, phase: 'windup' });
                    }
                    if (event.action === 'charge_active') {
                        gameEvents.emit('boss:charge', { bossId, entityId, phase: 'lunge' });
                        particleFx.burst({ x: entity.pos.x, y: entity.pos.y + 0.6, z: entity.pos.z, color: polarityFxColor(this.state.polarity), color2: FX_CHARGED, count: 26, speed: 7, upBias: 1, spread: 0.7, dir: [-Math.sin(this.facingYaw), 0.2, -Math.cos(this.facingYaw)], size: 0.26, life: 0.6, gravity: 4, drag: 1.2 });
                    }
                    if (event.action === 'swap_windup') {
                        // The towers destabilise with the Warden: their window opens now.
                        this.openFlux(wardenLiveTowers(this.state), this.state.polarity > 0 ? -1 : 1, event.durationSeconds + WARDEN_TIMING.swapGraceAfter, entity);
                    }
                    if (event.action === 'shield_break') {
                        addTrauma(0.9);
                        this.impactFx(entity.pos.x, this.floorY(entity), entity.pos.z, this.state.polarity, 18);
                    }
                    gameEvents.emit('boss:action', {
                        bossId, entityId, action: event.action, phase: wardenActionPhase(event.action), durationSeconds: event.durationSeconds,
                    });
                    break;
                case 'form':
                    this.enterForm(entity, event.form);
                    break;
                case 'polarity':
                    entity.polarity = event.polarity;
                    this.polarityFx(entity, event.polarity);
                    this.flipTowers(event.towers, event.polarity, entity);
                    gameEvents.emit('boss:polarity', { bossId, entityId, polarity: event.polarity });
                    break;
                case 'volley':
                    if (player) this.fireVolley(entity, player, event.spec, event.polarity, event.climber);
                    break;
                case 'spiral-bolt':
                    this.fireSpiralBolt(entity, event);
                    break;
                case 'shard-volley':
                    if (player) this.fireShardVolley(entity, player, event);
                    break;
                case 'lash':
                    this.resolveLash(entity, player, targetable, event.damage, event.range, event.halfAngle);
                    break;
                case 'draw':
                    if (event.active) this.drawFx(entity);
                    break;
                case 'repel':
                    this.resolveRepel(entity, player, targetable, event.radius, event.damage);
                    break;
                case 'charge':
                    break;
                case 'shockwave':
                    entityManager.spawnShockwave({
                        x: entity.pos.x, y: this.floorY(entity), z: entity.pos.z,
                        polarity: event.polarity, maxRadius: event.maxRadius, speed: event.speed, damage: event.damage, kind: 'polarity',
                    });
                    // Beat rings announce themselves through boss:beat; only the
                    // plunge ring shares the slam impact cue.
                    if (event.source === 'plunge') gameEvents.emit('boss:slam', { bossId, entityId, phase: 'impact', polarity: event.polarity });
                    break;
                case 'plunge':
                    this.resolvePlunge(entity, player, targetable, event.phase, event.impactRadius, event.impactDamage);
                    break;
                case 'crystals':
                    if (event.mode === 'ignite') {
                        this.igniteTowers(event.crystals, event.polarity, entity);
                        gameEvents.emit('boss:crystals', { bossId, entityId, mode: 'ignite', crystals: event.crystals.slice(), polarity: event.polarity });
                    } else {
                        this.consumeAll(entity);
                        gameEvents.emit('boss:crystals', { bossId, entityId, mode: 'consume', crystals: [], polarity: this.state.polarity });
                    }
                    break;
                case 'shield':
                    gameEvents.emit('boss:shield', { bossId, entityId, crystals: event.fraction });
                    break;
                case 'crystal-lost':
                    this.crystalLostFx(event.crystal, entity);
                    this.retiring.set(event.crystal, climbSurfaces.clock);
                    gameEvents.emit('boss:crystal-lost', { bossId, entityId, crystal: event.crystal, remaining: event.remaining });
                    break;
                case 'flinch':
                    addTrauma(0.3);
                    break;
                case 'shield-broken':
                    this.crashTarget = this.edgeBelowCrystal(entity, event.crystal);
                    addTrauma(0.5);
                    gameEvents.emit('boss:shield-broken', { bossId, entityId, crystal: event.crystal });
                    gameEvents.emit('boss:vulnerable', { bossId, entityId });
                    break;
                case 'crash':
                    if (event.toward !== null) this.crashTarget = this.edgeBelowCrystal(entity, event.toward);
                    break;
                case 'recovered':
                    this.crashTarget = null;
                    break;
                case 'beat':
                    addTrauma(event.second ? 0.4 : 0.55);
                    if (event.double && !event.second) {
                        // The second ring flips everything straight back: the towers'
                        // window stays open across both flips.
                        this.openFlux(wardenLiveTowers(this.state), event.polarity > 0 ? -1 : 1, WARDEN_TIMING.form3.doubleGap + WARDEN_TIMING.swapGraceAfter, entity);
                    }
                    gameEvents.emit('boss:beat', { bossId, entityId, polarity: event.polarity, double: event.double, second: event.second });
                    break;
                case 'beat-tick':
                    if (event.remaining >= WARDEN_TIMING.form3.ticks[0]) {
                        this.openFlux(event.towers, event.nextPolarity, event.remaining + WARDEN_TIMING.swapGraceAfter, entity);
                    }
                    gameEvents.emit('boss:beat-tick', { bossId, entityId, remaining: event.remaining, nextPolarity: event.nextPolarity });
                    break;
                case 'hurt':
                    entity.hp = this.state.hp;
                    entity.hurtUntil = Date.now() + 180;
                    particleFx.burst({
                        x: entity.pos.x, y: entity.pos.y + entity.height * 0.6, z: entity.pos.z,
                        color: FX_CHARGED, color2: [1, 1, 1], count: event.slam ? 40 : event.punish ? 22 : 12, speed: event.slam ? 10 : 6, upBias: 2, spread: 1, size: 0.24, life: 0.6, gravity: 5, drag: 1,
                    });
                    if (event.slam) this.slamFx(entity, player, true, event.punish);
                    gameEvents.emit('boss:damaged', { bossId, entityId, hp: Math.max(0, this.state.hp), maxHp: this.state.maxHp });
                    break;
                case 'blocked':
                    entity.shieldHitUntil = Date.now() + 160;
                    if (event.reason === 'repelled' && player) {
                        // Same polarity: the strike bounces and the player is shoved off.
                        const dx = player.x - entity.pos.x, dz = player.z - entity.pos.z;
                        const d = Math.hypot(dx, dz) || 1;
                        entityManager.impulsePlayer((dx / d) * 7, 2.5, (dz / d) * 7);
                        particleFx.burst({
                            x: entity.pos.x + (dx / d) * entity.width * 0.6, y: entity.pos.y + entity.height * 0.55, z: entity.pos.z + (dz / d) * entity.width * 0.6,
                            color: polarityFxColor(this.state.polarity), color2: [1, 1, 1], count: 14, speed: 5, upBias: 1, spread: 0.6, dir: [dx / d, 0.3, dz / d], size: 0.22, life: 0.45, gravity: 3, drag: 1.3,
                        });
                        gameEvents.emit('boss:repelled', { bossId, entityId });
                    }
                    break;
                case 'stagger':
                    addTrauma(0.35);
                    break;
                case 'shards':
                    break;
                case 'defeated': {
                    entity.hp = 0;
                    // Start the defeat cinematic from where it fell, before the
                    // entity (and its renderer) are gone.
                    const centre = this.centre(entity);
                    const dir = viewRig.dir;
                    wardenDefeat.begin({
                        x: entity.pos.x, y: entity.pos.y, z: entity.pos.z,
                        height: entity.height,
                        polarity: this.state.polarity,
                        centerX: this.arena ? this.arena.centerX : centre.x - 0.5,
                        centerZ: this.arena ? this.arena.centerZ : centre.z - 0.5,
                        floorY: this.floorY(entity),
                        returnPitch: Math.asin(Math.max(-1, Math.min(1, dir.y))),
                        returnYaw: Math.atan2(-dir.x, -dir.z),
                    });
                    this.consumeAll(entity);
                    this.entityId = null;
                    entityManager.defeatEntity(entityId);
                    break;
                }
                default:
                    break;
            }
        }
    }

    private enterForm(entity: Entity, form: WardenForm): void {
        if (form === 2) {
            entity.width = 1.6;
            entity.height = 1.6;
        } else if (form === 3) {
            entity.width = 2.2;
            entity.height = 2.4;
        }
        this.crashTarget = null;
        addTrauma(0.8);
        particleFx.burst({ x: entity.pos.x, y: entity.pos.y + entity.height * 0.6, z: entity.pos.z, color: polarityFxColor(this.state.polarity), color2: [1, 1, 1], count: 60, speed: 12, upBias: 5, spread: 1, size: 0.32, life: 1.1, gravity: 4, drag: 0.7 });
        particleFx.burst({ x: entity.pos.x, y: entity.pos.y + entity.height * 0.6, z: entity.pos.z, color: FX_CHARGED, color2: [1, 0.9, 1], count: 40, speed: 7, upBias: 6, spread: 1, size: 0.28, life: 1.5, gravity: 2, drag: 0.6 });
        this.emitForm(entity, form);
        gameEvents.emit('boss:phase', { bossId: MAGNETIC_WARDEN_BOSS_ID, entityId: entity.id, phase: form });
    }

    private emitForm(entity: Entity, form: WardenForm): void {
        gameEvents.emit('boss:form', { bossId: MAGNETIC_WARDEN_BOSS_ID, entityId: entity.id, form, name: WARDEN_FORM_NAMES[form] });
    }

    // --- Attacks -------------------------------------------------------------

    private fireVolley(entity: Entity, player: WardenPoint, spec: WardenBoltSpec, polarity: WardenPolarity, climber: boolean): void {
        const ox = entity.pos.x, oy = entity.pos.y + entity.height * 0.7, oz = entity.pos.z;
        const dx = player.x - ox, dy = (player.y + PLAYER_HEIGHT * 0.9) - oy, dz = player.z - oz;
        const d = Math.hypot(dx, dy, dz) || 1;
        // A climber volley leads the shot a touch so the spread lands on the wall
        // around them rather than behind.
        const lead = climber ? 0.15 : 0;
        for (let index = 0; index < spec.count; index += 1) {
            const t = spec.count === 1 ? 0 : (index / (spec.count - 1)) * 2 - 1;
            const spread = t * spec.spread;
            const ca = Math.cos(spread), sa = Math.sin(spread);
            entityManager.spawnProjectile({
                x: ox, y: oy, z: oz,
                vx: (dx * ca - dz * sa) / d * spec.speed,
                vy: (dy / d + lead * t) * spec.speed,
                vz: (dx * sa + dz * ca) / d * spec.speed,
                ttl: spec.ttl,
                damage: spec.damage,
                polarity,
                sourceId: entity.id,
                kind: 'volley',
                homing: spec.homing,
            });
        }
        particleFx.burst({ x: ox, y: oy, z: oz, color: polarityFxColor(polarity), color2: [1, 1, 1], count: 14, speed: 4, upBias: 1, spread: 0.5, dir: [dx / d, dy / d, dz / d], size: 0.22, life: 0.4, gravity: 2, drag: 1.5 });
    }

    private fireSpiralBolt(entity: Entity, spec: { angle: number; speed: number; damage: number; ttl: number; homing: number; polarity: WardenPolarity }): void {
        const ox = entity.pos.x, oy = entity.pos.y + 1.3, oz = entity.pos.z;
        entityManager.spawnProjectile({
            x: ox + Math.cos(spec.angle) * 1.2, y: oy, z: oz + Math.sin(spec.angle) * 1.2,
            vx: Math.cos(spec.angle) * spec.speed,
            vy: 0,
            vz: Math.sin(spec.angle) * spec.speed,
            ttl: spec.ttl,
            damage: spec.damage,
            polarity: spec.polarity,
            sourceId: entity.id,
            kind: 'spiral',
            homing: spec.homing,
        });
    }

    /** Overloaded Storm: the shards themselves fly at the player as homing bolts. */
    private fireShardVolley(entity: Entity, player: WardenPoint, spec: { speed: number; damage: number; ttl: number; homing: number; polarity: WardenPolarity }): void {
        for (const shard of this.shardWorldPositions(entity)) {
            const dx = player.x - shard.x, dy = (player.y + PLAYER_HEIGHT * 0.5) - shard.y, dz = player.z - shard.z;
            const d = Math.hypot(dx, dy, dz) || 1;
            entityManager.spawnProjectile({
                x: shard.x, y: shard.y, z: shard.z,
                vx: (dx / d) * spec.speed, vy: (dy / d) * spec.speed, vz: (dz / d) * spec.speed,
                ttl: spec.ttl, damage: spec.damage, polarity: spec.polarity, sourceId: entity.id, kind: 'spiral', homing: spec.homing,
            });
            particleFx.burst({ x: shard.x, y: shard.y, z: shard.z, color: polarityFxColor(spec.polarity), color2: [1, 1, 1], count: 8, speed: 4, upBias: 0.5, spread: 0.6, dir: [dx / d, dy / d, dz / d], size: 0.2, life: 0.4, gravity: 2, drag: 1.5 });
        }
    }

    private resolveLash(entity: Entity, player: WardenPoint | null, targetable: boolean, damage: number, range: number, halfAngle: number): void {
        const col = polarityFxColor(this.state.polarity);
        const fx = Math.sin(entity.yaw), fz = Math.cos(entity.yaw);
        for (let index = 0; index < 8; index += 1) {
            const a = entity.yaw + (index / 7 - 0.5) * halfAngle * 2;
            particleFx.burst({
                x: entity.pos.x + Math.sin(a) * 1.4, y: entity.pos.y + 1.2, z: entity.pos.z + Math.cos(a) * 1.4,
                color: col, color2: [1, 1, 1], count: 4, speed: 9, upBias: 0.5, spread: 0.3, dir: [Math.sin(a), 0.1, Math.cos(a)], size: 0.24, life: 0.45, gravity: 4, drag: 1.4,
            });
        }
        if (!player || !targetable) return;
        if (isInWardenCone({ x: entity.pos.x, y: entity.pos.y, z: entity.pos.z }, entity.yaw, player, range, halfAngle)) {
            if (entityManager.tryDamagePlayer(damage, fx, fz, 'attack')) addTrauma(0.35);
        }
    }

    private resolveRepel(entity: Entity, player: WardenPoint | null, targetable: boolean, radius: number, damage: number): void {
        const col = polarityFxColor(this.state.polarity);
        for (let index = 0; index < 16; index += 1) {
            const a = (index / 16) * Math.PI * 2;
            particleFx.burst({
                x: entity.pos.x + Math.cos(a) * 1.2, y: entity.pos.y + 1.0, z: entity.pos.z + Math.sin(a) * 1.2,
                color: col, color2: [1, 1, 1], count: 4, speed: 10, upBias: 1.5, spread: 0.4, dir: [Math.cos(a), 0.3, Math.sin(a)], size: 0.26, life: 0.6, gravity: 6, drag: 1.2,
            });
        }
        addTrauma(0.5);
        if (!player || !targetable) return;
        const dx = player.x - entity.pos.x, dy = (player.y + PLAYER_HEIGHT * 0.5) - (entity.pos.y + entity.height * 0.5), dz = player.z - entity.pos.z;
        if (Math.hypot(dx, dy, dz) > radius) return;
        const d = Math.hypot(dx, dz) || 1;
        if (entityManager.tryDamagePlayer(damage, dx / d, dz / d, 'attack')) {
            entityManager.impulsePlayer((dx / d) * 12, 9, (dz / d) * 12);
        }
    }

    private resolvePlunge(entity: Entity, player: WardenPoint | null, targetable: boolean, phase: 'mark' | 'drop' | 'impact', impactRadius: number, impactDamage: number): void {
        const bossId = MAGNETIC_WARDEN_BOSS_ID;
        const floorY = this.floorY(entity);
        if (phase === 'mark') {
            // Mark where the player stands right now (clamped to the platform):
            // a static disc they can walk out of, with a ring to answer after.
            const centre = this.centre(entity);
            const target = player ? { x: player.x, z: player.z } : { x: entity.pos.x, z: entity.pos.z };
            const dx = target.x - centre.x, dz = target.z - centre.z;
            const d = Math.hypot(dx, dz);
            const clamp = WARDEN_TIMING.plunge.targetClamp;
            if (d > clamp) { target.x = centre.x + (dx / d) * clamp; target.z = centre.z + (dz / d) * clamp; }
            this.plungeTarget = { x: target.x, y: floorY, z: target.z };
            gameEvents.emit('boss:slam', { bossId, entityId: entity.id, phase: 'rise', polarity: this.state.polarity });
            return;
        }
        if (phase === 'drop') return;
        // Impact: the disc itself hurts anyone still inside it; the polarity
        // ring that follows (a separate event) sweeps the rest of the platform.
        addTrauma(1.0);
        this.impactFx(entity.pos.x, floorY, entity.pos.z, this.state.polarity, 16);
        if (player && targetable && this.plungeTarget) {
            const dx = player.x - this.plungeTarget.x, dz = player.z - this.plungeTarget.z;
            const d = Math.hypot(dx, dz);
            if (d <= impactRadius && Math.abs(player.y - floorY) < 3) {
                const n = d || 1;
                if (entityManager.tryDamagePlayer(impactDamage, dx / n, dz / n, 'attack')) {
                    entityManager.impulsePlayer((dx / n) * 9, 12, (dz / n) * 9);
                }
            }
        }
        this.plungeTarget = null;
    }

    // --- Damage in --------------------------------------------------------------

    private applyHit(entityId: number, amount: number, knockX: number, knockZ: number, stagger: number, hitZone?: string): 'damaged' | 'blocked' | 'none' {
        if (entityId !== this.entityId) return 'none';
        const entity = entityManager.getEntity(entityId);
        if (!entity || entity.hp <= 0) return 'none';
        const slam = hitZone === MAGNET_SLAM_HIT_ZONE;
        const player = entityManager.getPlayerPosition();
        const transition = advanceWarden(this.state, { type: 'damage', amount, playerPolarity: entityManager.getPlayerPolarity(), slam });
        this.state = transition.state;
        const hurt = transition.events.some((event) => event.type === 'hurt');
        this.applyEvents(transition.events, entity, player, true);
        if (slam && !hurt) this.slamFx(entity, player, false, false);
        this.notify();
        if (!hurt) return 'blocked';
        if (this.entityId === entityId) {
            entityManager.applyHitReaction(entity, knockX, knockZ, slam ? stagger + 1 : stagger);
            this.syncEntity(entity, true);
        }
        return 'damaged';
    }

    private onCrystalBroken(x: number, y: number, z: number): void {
        if (!this.arena || this.entityId === null) return;
        const index = this.arena.crystals.findIndex((c) => c.x === x && c.y === y && c.z === z);
        if (index < 0) return;
        const entity = entityManager.getEntity(this.entityId);
        if (!entity) return;
        const transition = advanceWarden(this.state, { type: 'crystal-broken', crystal: index });
        this.state = transition.state;
        this.applyEvents(transition.events, entity, entityManager.getPlayerPosition(), true);
        this.syncEntity(entity, true);
        this.notify();
    }

    // --- Arena: crystals and the towers' polarity ------------------------------

    /** A form's crystals appear on their towers and the towers light up in the Warden's polarity. */
    private igniteTowers(crystals: readonly number[], polarity: number, entity: Entity): void {
        if (!this.arena) return;
        const { centerX, centerZ, baseY } = this.arena;
        const edits: { x: number; y: number; z: number; type: BlockType }[] = [];
        for (const index of crystals) {
            const c = this.arena.crystals[index];
            if (!c || index >= ARENA_PILLAR_COUNT) continue;
            edits.push({ x: c.x, y: c.y, z: c.z, type: BlockType.MAGNETIC_SHIELD_CRYSTAL });
            this.retiring.delete(index);
            this.setTowerPolarity(index, polarity);
            const bounds = getPillarClimbFaceBounds(centerX, centerZ, baseY, index);
            if (bounds) {
                const centre = this.centre(entity);
                climbSurfaces.setFlux({ id: this.zoneId(index), min: bounds.min, max: bounds.max, polarity, opensAt: -1, until: -1, safeTarget: { x: centre.x, z: centre.z } });
            }
            particleFx.burst({ x: c.x + 0.5, y: c.y + 0.5, z: c.z + 0.5, color: [1, 1, 1], color2: FX_CHARGED, count: 40, speed: 8, upBias: 3, spread: 1, size: 0.3, life: 0.9, gravity: 5, drag: 0.8 });
            // A streak of charged motes leaving the Warden toward the tower.
            const dx = c.x - entity.pos.x, dy = c.y - entity.pos.y, dz = c.z - entity.pos.z;
            const d = Math.hypot(dx, dy, dz) || 1;
            particleFx.burst({ x: entity.pos.x, y: entity.pos.y + 1.5, z: entity.pos.z, color: FX_CHARGED, color2: [1, 1, 1], count: 16, speed: 18, upBias: 0, spread: 0.08, dir: [dx / d, dy / d, dz / d], size: 0.26, life: 2.2, gravity: 0, drag: 0 });
        }
        if (edits.length > 0) worldManager.setBlocks(edits);
    }

    private setTowerPolarity(index: number, polarity: number): void {
        if (!this.arena) return;
        const { centerX, centerZ, baseY } = this.arena;
        placePillarClimbMagnets(centerX, centerZ, baseY, index, (edits) => worldManager.setBlocks(edits), polarity);
        this.towerPolarity.set(index, polarity);
    }

    /** Open the flux window on the given towers: they will settle at `polarity` in `seconds`. */
    private openFlux(towers: readonly number[], polarity: number, seconds: number, entity: Entity): void {
        if (!this.arena || towers.length === 0) return;
        const now = climbSurfaces.clock;
        for (const index of towers) {
            const zone = climbSurfaces.get(this.zoneId(index));
            if (!zone) continue;
            climbSurfaces.setFlux({ ...zone, polarity, opensAt: now, until: now + seconds });
            const c = this.arena.crystals[index];
            if (c) particleFx.burst({ x: c.x + 0.5, y: c.y + 0.5, z: c.z + 0.5, color: polarityFxColor(polarity), color2: [1, 1, 1], count: 18, speed: 5, upBias: 2, spread: 1, size: 0.24, life: 0.7, gravity: 2, drag: 1 });
        }
        gameEvents.emit('boss:towers', { bossId: MAGNETIC_WARDEN_BOSS_ID, entityId: entity.id, towers: towers.slice(), polarity, phase: 'flux', until: now + seconds });
    }

    /** The Warden flipped: its ignited towers flip with it (their windows stay open a moment longer). */
    private flipTowers(towers: readonly number[], polarity: number, entity: Entity): void {
        if (!this.arena || towers.length === 0) return;
        for (const index of towers) {
            this.setTowerPolarity(index, polarity);
            const zone = climbSurfaces.get(this.zoneId(index));
            if (zone) {
                // A flip that was never announced (a crash mid-window, a command spawn)
                // still grants the grace after it.
                const until = zone.until > climbSurfaces.clock ? zone.until : climbSurfaces.clock + WARDEN_TIMING.swapGraceAfter;
                const opensAt = zone.until > climbSurfaces.clock ? zone.opensAt : climbSurfaces.clock;
                climbSurfaces.setFlux({ ...zone, polarity, opensAt, until });
            }
            const c = this.arena.crystals[index];
            if (c) particleFx.burst({ x: c.x + 0.5, y: c.y + 0.5, z: c.z + 0.5, color: polarityFxColor(polarity), color2: [1, 1, 1], count: 30, speed: 8, upBias: 3, spread: 1, size: 0.28, life: 0.8, gravity: 3, drag: 0.9 });
        }
        const zone = climbSurfaces.get(this.zoneId(towers[0]));
        gameEvents.emit('boss:towers', { bossId: MAGNETIC_WARDEN_BOSS_ID, entityId: entity.id, towers: towers.slice(), polarity, phase: 'flipped', until: zone ? zone.until : climbSurfaces.clock });
    }

    private crystalLostFx(index: number, entity: Entity): void {
        const c = this.arena?.crystals[index];
        if (!c) return;
        particleFx.burst({ x: c.x + 0.5, y: c.y + 0.5, z: c.z + 0.5, color: FX_CHARGED, color2: [1, 1, 1], count: 44, speed: 10, upBias: 4, spread: 1, size: 0.3, life: 0.9, gravity: 5, drag: 1 });
        // The shield's light snaps back from the tower into the core.
        const dx = entity.pos.x - c.x, dy = entity.pos.y - c.y, dz = entity.pos.z - c.z;
        const d = Math.hypot(dx, dy, dz) || 1;
        particleFx.burst({ x: c.x + 0.5, y: c.y + 0.5, z: c.z + 0.5, color: FX_CHARGED, color2: [1, 1, 1], count: 14, speed: 18, upBias: 0, spread: 0.08, dir: [dx / d, dy / d, dz / d], size: 0.26, life: 2.2, gravity: 0, drag: 0 });
    }

    /** A felled tower goes dark once the climber is clear of it (never from under their feet). */
    private retireClearedTowers(player: WardenPoint | null): void {
        if (!this.arena || this.retiring.size === 0) return;
        for (const [index, since] of Array.from(this.retiring.entries())) {
            const c = arenaPillarCenter(this.arena.centerX, this.arena.centerZ, index);
            const distance = player ? Math.hypot(player.x - (c.x + 0.5), player.z - (c.z + 0.5)) : Infinity;
            if (distance >= TOWER_RETIRE_CLEARANCE || climbSurfaces.clock - since >= TOWER_RETIRE_TIMEOUT) {
                this.stripTower(index);
                this.retiring.delete(index);
            }
        }
    }

    private stripTower(index: number): void {
        if (!this.arena) return;
        const { centerX, centerZ, baseY } = this.arena;
        if (this.towerPolarity.has(index)) {
            stripPillarClimbMagnets(centerX, centerZ, baseY, index, (edits) => worldManager.setBlocks(edits));
            this.towerPolarity.delete(index);
        }
        climbSurfaces.clear(this.zoneId(index));
    }

    /** Every remaining crystal and lit tower is consumed (a form ends, the Warden dies, the arena resets). */
    private consumeAll(entity: Entity | null): void {
        if (!this.arena) return;
        const edits: { x: number; y: number; z: number; type: BlockType }[] = [];
        for (const c of this.arena.crystals) {
            if (worldManager.hasChunk(Math.floor(c.x / 16), Math.floor(c.z / 16))
                && worldManager.getBlock(c.x, c.y, c.z, false) === BlockType.MAGNETIC_SHIELD_CRYSTAL) {
                edits.push({ x: c.x, y: c.y, z: c.z, type: BlockType.AIR });
                particleFx.burst({ x: c.x + 0.5, y: c.y + 0.5, z: c.z + 0.5, color: FX_CHARGED, color2: [1, 1, 1], count: 30, speed: 7, upBias: 3, spread: 1, size: 0.28, life: 0.8, gravity: 4, drag: 0.9 });
                if (entity) {
                    const dx = entity.pos.x - c.x, dy = entity.pos.y - c.y, dz = entity.pos.z - c.z;
                    const d = Math.hypot(dx, dy, dz) || 1;
                    particleFx.burst({ x: c.x + 0.5, y: c.y + 0.5, z: c.z + 0.5, color: FX_CHARGED, color2: [1, 1, 1], count: 14, speed: 18, upBias: 0, spread: 0.08, dir: [dx / d, dy / d, dz / d], size: 0.26, life: 2.2, gravity: 0, drag: 0 });
                }
            }
        }
        if (edits.length > 0) worldManager.setBlocks(edits);
        if (this.towerPolarity.size > 0) {
            stripArenaClimbMagnets(this.arena.centerX, this.arena.centerZ, this.arena.baseY, (e) => worldManager.setBlocks(e));
            this.towerPolarity.clear();
        }
        this.retiring.clear();
        climbSurfaces.clearAll();
    }

    private cleanupArena(): void {
        this.consumeAll(null);
    }

    /** The boss left without a defeat (death, distance, unload): wipe the arena state. */
    private reset(): void {
        if (this.entityId !== null) {
            const entity = entityManager.getEntity(this.entityId);
            if (entity && entity.hp > 0) return; // another boss cleared, this fight is still live
        }
        this.cleanupArena();
        this.state = createWardenState();
        this.entityId = null;
        this.arena = null;
        this.plungeTarget = null;
        this.crashTarget = null;
        this.notify();
    }

    private finish(): void {
        this.cleanupArena();
        this.state = createWardenState();
        this.entityId = null;
        this.arena = null;
        this.plungeTarget = null;
        this.crashTarget = null;
        this.notify();
    }

    // --- Helpers ---------------------------------------------------------------

    private notify(): void {
        this.listeners.forEach((listener) => listener());
    }

    private zoneId(index: number): string {
        return `tower-${index}`;
    }

    private floorY(entity: Entity | undefined): number {
        if (this.arena) return this.arena.baseY + 1;
        return entity?.home?.y ?? entity?.pos.y ?? 0;
    }

    private centre(entity: Entity): { x: number; z: number } {
        if (this.arena) return { x: this.arena.centerX + 0.5, z: this.arena.centerZ + 0.5 };
        return { x: entity.home?.x ?? entity.pos.x, z: entity.home?.z ?? entity.pos.z };
    }

    private towerCentre(index: number): { x: number; z: number } | null {
        if (!this.arena) return null;
        const c = arenaPillarCenter(this.arena.centerX, this.arena.centerZ, index);
        return { x: c.x + 0.5, z: c.z + 0.5 };
    }

    /** The platform-edge point (inside the leash) on the line from the centre to a tower: its landing pool. */
    private edgeBelowCrystal(entity: Entity, crystal: number): { x: number; z: number } | null {
        const tower = this.towerCentre(crystal);
        if (!tower) return null;
        const centre = this.centre(entity);
        const dx = tower.x - centre.x, dz = tower.z - centre.z;
        const d = Math.hypot(dx, dz) || 1;
        const reach = WARDEN_TIMING.plunge.targetClamp;
        return { x: centre.x + (dx / d) * reach, z: centre.z + (dz / d) * reach };
    }

    /** Where the Aegis hovers to contest a climb: out toward the tower, high. */
    private contestPoint(entity: Entity, tower: number): { x: number; z: number } | null {
        const t = this.towerCentre(tower);
        if (!t) return null;
        const centre = this.centre(entity);
        const dx = t.x - centre.x, dz = t.z - centre.z;
        const d = Math.hypot(dx, dz) || 1;
        return { x: centre.x + (dx / d) * WARDEN_TIMING.form2.contestRadius, z: centre.z + (dz / d) * WARDEN_TIMING.form2.contestRadius };
    }

    /** The ignited, standing tower the player is on or crossing to, if any. */
    private towerNearPlayer(player: WardenPoint): number | null {
        if (!this.arena) return null;
        const centre = { x: this.arena.centerX + 0.5, z: this.arena.centerZ + 0.5 };
        const fromCentre = Math.hypot(player.x - centre.x, player.z - centre.z);
        let best: number | null = null;
        let bestDistance = Infinity;
        for (const index of wardenLiveTowers(this.state)) {
            const t = this.towerCentre(index);
            if (!t) continue;
            const distance = Math.hypot(player.x - t.x, player.z - t.z);
            const near = distance <= TOWER_CONTEST_RADIUS
                || (fromCentre > ARENA_CENTRAL_RADIUS + 1 && distance <= TOWER_CROSSING_RADIUS);
            if (near && distance < bestDistance) { best = index; bestDistance = distance; }
        }
        return best;
    }

    private towerSnapshots(): WardenTowerSnapshot[] {
        if (!this.arena) return [];
        const s = this.state;
        const now = climbSurfaces.clock;
        const out: WardenTowerSnapshot[] = [];
        for (let index = 0; index < Math.min(this.arena.crystals.length, ARENA_PILLAR_COUNT); index += 1) {
            const polarity = this.towerPolarity.get(index);
            if (polarity === undefined) continue;
            const t = this.towerCentre(index);
            if (!t) continue;
            const zone = climbSurfaces.get(this.zoneId(index));
            const flux = zone && now >= zone.opensAt && now < zone.until ? { opensAt: zone.opensAt, until: zone.until, polarity: zone.polarity } : null;
            out.push({
                index,
                x: t.x,
                z: t.z,
                top: this.arena.baseY + ARENA_PILLAR_HEIGHT + 1,
                crystal: this.arena.crystals[index],
                polarity,
                standing: s.crystals[index] === true,
                ignited: s.ignited.includes(index),
                flux,
                contested: s.contestTower === index,
            });
        }
        return out;
    }

    private shardWorldPositions(entity: Entity): WardenPoint[] {
        return wardenShardOffsets(this.state.clock).map((offset) => ({
            x: entity.pos.x + offset.x,
            y: entity.pos.y + offset.y,
            z: entity.pos.z + offset.z,
        }));
    }

    private impactFx(x: number, y: number, z: number, polarity: number, count: number): void {
        const col = polarityFxColor(polarity);
        for (let index = 0; index < count; index += 1) {
            const a = (index / count) * Math.PI * 2;
            particleFx.burst({
                x: x + Math.cos(a) * 1.4, y: y + 0.3, z: z + Math.sin(a) * 1.4,
                color: col, color2: [1, 1, 1], count: 5, speed: 8, upBias: 1.5, spread: 0.5,
                dir: [Math.cos(a), 0.25, Math.sin(a)], size: 0.3, life: 0.7, gravity: 9, drag: 1.4,
            });
        }
    }

    private polarityFx(entity: Entity, polarity: number): void {
        particleFx.burst({
            x: entity.pos.x, y: entity.pos.y + entity.height * 0.5, z: entity.pos.z,
            color: polarityFxColor(polarity), color2: [1, 1, 1], count: 36, speed: 9, upBias: 2, spread: 1, size: 0.26, life: 0.8, gravity: 2, drag: 0.9,
        });
    }

    private drawFx(entity: Entity): void {
        // Motes drawn inward: the field lines converging on the Warden.
        particleFx.burst({
            x: entity.pos.x, y: entity.pos.y + entity.height * 0.5, z: entity.pos.z,
            color: polarityFxColor(this.state.polarity), color2: FX_CHARGED, count: 40, speed: 9, upBias: 0, spread: 1, size: 0.22, life: 1.4, gravity: -1, drag: 2.2,
        });
    }

    /** A Magnet Slam: the player's colour blooms as a ring off the point of impact. */
    private slamFx(entity: Entity, player: WardenPoint | null, landed: boolean, punish: boolean): void {
        const polarity = entityManager.getPlayerPolarity() || 1;
        const origin = player ?? { x: entity.pos.x, y: entity.pos.y, z: entity.pos.z };
        const x = (origin.x + entity.pos.x) * 0.5, y = entity.pos.y + entity.height * 0.5, z = (origin.z + entity.pos.z) * 0.5;
        entityManager.spawnShockwave({ x, y: this.floorY(entity), z, polarity, maxRadius: landed ? 6 : 3, speed: 22, damage: 0, kind: 'slam', radius: 0.4 });
        particleFx.burst({ x, y, z, color: [1, 1, 1], color2: polarityFxColor(polarity), count: landed ? 70 : 24, speed: landed ? 12 : 6, upBias: 3, spread: 1, size: 0.3, life: 0.9, gravity: 3, drag: 0.9 });
        addTrauma(landed ? 0.7 : 0.3);
        gameEvents.emit('player:slam', { x, y, z, polarity, landed, punish });
    }
}

export const magneticWardenEncounter = new MagneticWardenEncounter();
