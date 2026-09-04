// Magnetic Warden encounter runtime: the bridge between the pure state machine
// in magneticWardenCore and the live world. It registers itself as the
// magnetic_warden entity brain (owning the entity's movement every tick) and
// as its damage handler (applying the polarity rule to every hit), turns the
// core's events into bolts, rings, arena edits, particles and game events, and
// publishes a snapshot for the renderer and HUD.
//
// Side effects it owns: the four tower crystals (spawned for the Aegis, consumed
// by the Storm), the towers' magnet climb faces (placed with the crystals,
// stripped with them), and the arena clean-up on any reset.

import { worldManager } from '../WorldManager';
import { BlockType } from '../../types';
import { gameEvents } from '../events/GameEvents';
import { addTrauma } from '../player/cameraShake';
import { PLAYER_HEIGHT } from '../player/playerConstants';
import { particleFx, polarityFxColor, FX_CHARGED } from '../fx/particleFx';
import { entityManager, type BrainContext } from '../entities/EntityManager';
import type { Entity } from '../entities/Entity';
import { placePillarClimbMagnets, stripArenaClimbMagnets, ARENA_PILLAR_COUNT } from '../world/magneticArena';
import {
    FLUX_BURST_RADIUS,
    FLUX_MAX,
    WARDEN_FORM_NAMES,
    WARDEN_TIMING,
    advanceWarden,
    createWardenState,
    getWardenActionDuration,
    getWardenBeatInterval,
    getWardenFieldProfile,
    isInWardenCone,
    isWardenTransitioning,
    wardenActionPhase,
    wardenShardOffsets,
    type WardenAction,
    type WardenEvent,
    type WardenForm,
    type WardenPolarity,
    type WardenState,
} from './magneticWardenCore';

export const MAGNETIC_WARDEN_BOSS_ID = 'magnetic_warden';

export interface WardenArena {
    centerX: number;
    centerZ: number;
    /** Arena base (the platform floor is baseY + 1). */
    baseY: number;
    /** World positions of the four tower crystals, in tower order. */
    crystals: { x: number; y: number; z: number }[];
}

export interface WardenPoint { x: number; y: number; z: number }

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
    stunned: boolean;
    tether: { crystal: number; x: number; y: number; z: number; remaining: number; total: number } | null;
    crystals: { x: number; y: number; z: number; standing: boolean }[];
    plungeTarget: WardenPoint | null;
    /** Seconds until the next Storm beat, its full interval, and the colour it brings. */
    beatRemaining: number;
    beatInterval: number;
    nextPolarity: WardenPolarity;
    doublePending: boolean;
    /** Seconds until the second ring of a double beat (0 when none is pending). */
    doubleRemaining: number;
    flux: number;
    fluxMax: number;
    /** Storm shard barrier, world positions (shared with the hit test). */
    shards: WardenPoint[];
    floorY: number;
    clock: number;
    drawActive: boolean;
    /** Locked facing (radians, entity yaw convention) for the Lash telegraph. */
    facingYaw: number;
}

const HOVER_HORIZONTAL_SPEED = 3.5;
const HOVER_VERTICAL_SPEED = 4;
const PLUNGE_TRACK_SPEED = 12;
const CRASH_DROP_SPEED = 26;
const LASH_TRACK_RATE = 2.2;

const smooth = (t: number): number => { const c = Math.max(0, Math.min(1, t)); return c * c * (3 - 2 * c); };
const wrapAngle = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

class MagneticWardenEncounter {
    private state = createWardenState();
    private entityId: number | null = null;
    private arena: WardenArena | null = null;
    private hoverAngle = 0;
    private plungeTarget: WardenPoint | null = null;
    /** Where a snapped tether hurls the core (the platform edge below a broken crystal's tower). */
    private crashTarget: { x: number; z: number } | null = null;
    private shardCooldown = 0;
    private magnetsPlaced = false;
    private facingYaw = 0;
    private plungeStartY = 0;
    private listeners = new Set<() => void>();

    constructor() {
        entityManager.registerBrain(MAGNETIC_WARDEN_BOSS_ID, (entity, dt, ctx) => this.tick(entity, dt, ctx));
        entityManager.registerDamageHandler(MAGNETIC_WARDEN_BOSS_ID, (entityId, amount, knockX, knockZ, stagger) =>
            this.applyHit(entityId, amount, knockX, knockZ, stagger));
        gameEvents.on('crystal:broken', ({ x, y, z }) => this.onCrystalBroken(x, y, z));
        gameEvents.on('bolt:absorbed', () => this.onBoltAbsorbed());
        gameEvents.on('ability:changed', ({ abilityId }) => { if (abilityId === 'polarity') this.onPolarityFlip(); });
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
     * the tower crystals to tether to; without one (the /boss spawn command)
     * the Aegis limps untethered and every form still plays.
     */
    begin(entityId: number, arena: WardenArena | null): void {
        const entity = entityManager.getEntity(entityId);
        if (!entity) return;
        this.cleanupArena();
        this.state = advanceWarden(createWardenState(), { type: 'configure', crystals: arena ? arena.crystals.length : 0 }).state;
        this.entityId = entityId;
        this.arena = arena;
        this.hoverAngle = arena ? Math.atan2(entity.pos.z - (arena.centerZ + 0.5), entity.pos.x - (arena.centerX + 0.5)) : 0;
        this.plungeTarget = null;
        this.shardCooldown = 0;
        this.facingYaw = entity.yaw;
        entity.aggro = true;
        entity.polarity = this.state.polarity;
        entity.hp = this.state.hp;
        entity.maxHp = this.state.maxHp;
        this.emitForm(entity, 1);
        gameEvents.emit('flux:changed', { value: 0, max: FLUX_MAX, full: false });
        this.notify();
    }

    getSnapshot(): WardenSnapshot {
        const entity = this.entityId !== null ? entityManager.getEntity(this.entityId) : undefined;
        const s = this.state;
        const floorY = this.floorY(entity);
        const tetherCrystal = s.tether && this.arena ? this.arena.crystals[s.tether.crystal] : null;
        return {
            entityId: entity ? entity.id : null,
            form: s.form,
            formName: WARDEN_FORM_NAMES[s.form],
            action: s.action,
            actionTime: s.actionTime,
            actionDuration: s.actionDuration > 0 ? s.actionDuration : getWardenActionDuration(s.action, s),
            polarity: s.polarity,
            hp: s.hp,
            maxHp: s.maxHp,
            shielded: this.isShielded(),
            stunned: s.action === 'stunned' || s.action === 'stagger',
            tether: s.tether && tetherCrystal
                ? { crystal: s.tether.crystal, x: tetherCrystal.x, y: tetherCrystal.y, z: tetherCrystal.z, remaining: s.tether.remaining, total: s.tether.total }
                : null,
            crystals: this.arena ? this.arena.crystals.map((c, index) => ({ ...c, standing: s.crystals[index] === true })) : [],
            plungeTarget: this.plungeTarget,
            beatRemaining: Math.max(0, s.beatTimer),
            beatInterval: getWardenBeatInterval(s),
            nextPolarity: s.polarity > 0 ? -1 : 1,
            doublePending: s.doubleTimer > 0,
            doubleRemaining: Math.max(0, s.doubleTimer),
            flux: s.flux,
            fluxMax: FLUX_MAX,
            shards: entity && s.form === 3 ? this.shardWorldPositions(entity) : [],
            floorY,
            clock: s.clock,
            drawActive: s.action === 'draw_active',
            facingYaw: this.facingYaw,
        };
    }

    getFlux(): { value: number; max: number; full: boolean } {
        return { value: this.state.flux, max: FLUX_MAX, full: this.state.flux >= FLUX_MAX };
    }

    isActive(): boolean {
        return this.entityId !== null && entityManager.getEntity(this.entityId) !== undefined;
    }

    // --- Per-tick brain ------------------------------------------------------

    private tick(entity: Entity, dt: number, ctx: BrainContext): void {
        if (this.entityId !== entity.id) this.begin(entity.id, null);
        entity.aggro = true;
        entity.knockbackSeconds = Math.max(0, entity.knockbackSeconds - dt);
        this.shardCooldown = Math.max(0, this.shardCooldown - dt);
        const player = ctx.player;
        const playerDistance = player ? Math.hypot(player.x - entity.pos.x, player.z - entity.pos.z) : 60;
        const preferredCrystal = player ? this.farthestStandingCrystal(player) : null;
        const previous = this.state;
        // A player who cannot be targeted (creative/spectator) still sees the
        // fight play out, but nothing lands on them.
        const transition = advanceWarden(this.state, { type: 'tick', dt, playerDistance, preferredCrystal });
        this.state = transition.state;
        this.applyEvents(transition.events, entity, player, ctx.targetable);
        if (this.state.action === 'death' || this.entityId !== entity.id) return;
        this.applyMovement(entity, previous, dt, player);
        this.applyContinuousHazards(entity, player, ctx.targetable);
        this.syncEntity(entity, ctx.targetable);
        if (transition.events.length > 0) this.notify();
    }

    private applyMovement(entity: Entity, previous: WardenState, dt: number, player: WardenPoint | null): void {
        const s = this.state;
        const floorY = this.floorY(entity);
        if (s.form === 1 && s.action !== 'shatter') {
            this.moveGrounded(entity, dt, player, s.action === 'idle');
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

    private moveGrounded(entity: Entity, dt: number, player: WardenPoint | null, mayPursue: boolean): void {
        const s = this.state;
        const knockedBack = entity.knockbackSeconds > 0;
        if (player && !knockedBack) {
            if (mayPursue) {
                if (!entityManager.steerEntity(entity, player, dt)) entityManager.haltEntity(entity, dt);
            } else {
                entityManager.haltEntity(entity, dt);
            }
            // Face the player: locked-in windups turn slowly (the telegraph shows
            // where the Lash will land), everything else tracks directly.
            const want = Math.atan2(player.x - entity.pos.x, player.z - entity.pos.z);
            if (s.action === 'lash_windup' || s.action === 'lash_active') {
                const delta = wrapAngle(want - entity.yaw);
                entity.yaw += Math.max(-LASH_TRACK_RATE * dt, Math.min(LASH_TRACK_RATE * dt, delta));
            } else if (s.action !== 'stagger' && s.action !== 'lash_recovery') {
                entity.yaw = want;
            }
            this.facingYaw = entity.yaw;
        } else if (!knockedBack) {
            entityManager.haltEntity(entity, dt);
        }
        entityManager.applyGravity(entity, dt);
        entityManager.moveEntity(entity, dt, entity.grounded && !knockedBack);
        entityManager.leashEntity(entity);
    }

    private moveHover(entity: Entity, previous: WardenState, dt: number, floorY: number): void {
        const s = this.state;
        const centre = this.centre(entity);
        entity.vel.set(0, 0, 0);
        // Tethered (or about to re-tether) it hovers out of reach; with no crystal
        // left it limps low enough to strike.
        const willTether = s.action === 'recover' && s.crystals.some(Boolean);
        const hoverY = floorY + (s.tether || willTether ? WARDEN_TIMING.form2.hoverHeight : WARDEN_TIMING.form2.limpHeight);
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
            case 'recover': {
                this.hoverAngle += WARDEN_TIMING.form2.orbitRate * dt;
                const r = WARDEN_TIMING.form2.orbitRadius;
                moveToward(centre.x + Math.cos(this.hoverAngle) * r, centre.z + Math.sin(this.hoverAngle) * r, HOVER_HORIZONTAL_SPEED);
                easeY(hoverY, s.action === 'recover' ? HOVER_VERTICAL_SPEED * 1.6 : HOVER_VERTICAL_SPEED);
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
                // Yanked by the snapping tether: down, and (for a broken crystal)
                // across to the platform edge below that tower, arriving as the
                // crash ends so a climber can drop into the pool and reach it.
                easeY(floorY, CRASH_DROP_SPEED);
                if (this.crashTarget) {
                    const remaining = Math.max(0.05, s.actionDuration - s.actionTime);
                    const dist = Math.hypot(this.crashTarget.x - entity.pos.x, this.crashTarget.z - entity.pos.z);
                    moveToward(this.crashTarget.x, this.crashTarget.z, dist / remaining);
                }
                break;
            }
            case 'plunge_recovery':
            case 'stunned':
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
        // Form III shard barrier: brushing a shard costs a little health and shoves.
        if (s.form === 3 && s.action !== 'storm_rise' && this.shardCooldown <= 0) {
            const px = player.x, py = player.y + PLAYER_HEIGHT * 0.5, pz = player.z;
            for (const shard of this.shardWorldPositions(entity)) {
                const dx = px - shard.x, dy = py - shard.y, dz = pz - shard.z;
                if (dx * dx + dz * dz < 1.1 && Math.abs(dy) < 1.6) {
                    this.shardCooldown = WARDEN_TIMING.form3.shardCooldown;
                    const d = Math.hypot(dx, dz) || 1;
                    entityManager.damagePlayer(WARDEN_TIMING.form3.shardDamage, dx / d, dz / d);
                    particleFx.burst({ x: shard.x, y: shard.y, z: shard.z, color: polarityFxColor(s.polarity), color2: [1, 1, 1], count: 12, speed: 6, upBias: 2, spread: 1, size: 0.22, life: 0.5, gravity: 5, drag: 1.2 });
                    break;
                }
            }
        }
    }

    private syncEntity(entity: Entity, targetable: boolean): void {
        const s = this.state;
        entity.polarity = s.polarity;
        entity.hp = s.hp;
        entity.shielded = this.isShielded();
        entity.field = targetable ? getWardenFieldProfile(s) : null;
        const duration = s.actionDuration > 0 ? s.actionDuration : getWardenActionDuration(s.action, s);
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
                    if (event.action === 'stunned') {
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
                    gameEvents.emit('boss:polarity', { bossId, entityId, polarity: event.polarity });
                    break;
                case 'volley':
                    if (player) this.fireVolley(entity, player, event);
                    break;
                case 'spiral-bolt':
                    this.fireSpiralBolt(entity, event);
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
                    if (event.mode === 'spawn') this.spawnCrystals(entity);
                    else this.consumeCrystals(entity);
                    gameEvents.emit('boss:crystals', { bossId, entityId, mode: event.mode });
                    break;
                case 'tether': {
                    const crystal = this.arena?.crystals[event.crystal];
                    if (crystal) {
                        particleFx.burst({ x: crystal.x + 0.5, y: crystal.y + 0.5, z: crystal.z + 0.5, color: FX_CHARGED, color2: [1, 1, 1], count: 30, speed: 6, upBias: 2, spread: 1, size: 0.26, life: 0.8, gravity: 2, drag: 0.8 });
                        gameEvents.emit('boss:tether', { bossId, entityId, crystal: event.crystal, x: crystal.x, y: crystal.y, z: crystal.z, seconds: event.seconds });
                    }
                    break;
                }
                case 'untethered':
                    gameEvents.emit('boss:vulnerable', { bossId, entityId });
                    break;
                case 'tether-snapped':
                    this.shatterCrystal(event.crystal);
                    this.crashTarget = event.reason === 'broken' ? this.edgeBelowCrystal(entity, event.crystal) : null;
                    addTrauma(0.5);
                    gameEvents.emit('boss:tether-snapped', { bossId, entityId, crystal: event.crystal, reason: event.reason, stunSeconds: event.stunSeconds });
                    gameEvents.emit('boss:vulnerable', { bossId, entityId });
                    break;
                case 'shield':
                    gameEvents.emit('boss:shield', { bossId, entityId, crystals: event.fraction });
                    break;
                case 'crash':
                    break;
                case 'recovered':
                    break;
                case 'beat':
                    addTrauma(event.second ? 0.4 : 0.55);
                    gameEvents.emit('boss:beat', { bossId, entityId, polarity: event.polarity, double: event.double, second: event.second });
                    break;
                case 'beat-tick':
                    gameEvents.emit('boss:beat-tick', { bossId, entityId, remaining: event.remaining, nextPolarity: event.nextPolarity });
                    break;
                case 'hurt':
                    entity.hp = this.state.hp;
                    entity.hurtUntil = Date.now() + 180;
                    particleFx.burst({
                        x: entity.pos.x, y: entity.pos.y + entity.height * 0.6, z: entity.pos.z,
                        color: FX_CHARGED, color2: [1, 1, 1], count: event.punish ? 22 : 12, speed: 6, upBias: 2, spread: 1, size: 0.24, life: 0.6, gravity: 5, drag: 1,
                    });
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
                case 'flux':
                    gameEvents.emit('flux:changed', { value: event.value, max: event.max, full: event.full });
                    break;
                case 'burst':
                    this.burstFx(entity, player, event.hitBoss);
                    break;
                case 'stagger':
                    addTrauma(0.35);
                    break;
                case 'shards':
                    break;
                case 'defeated':
                    entity.hp = 0;
                    this.consumeCrystals(entity);
                    this.entityId = null;
                    entityManager.defeatEntity(entityId);
                    break;
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

    private fireVolley(entity: Entity, player: WardenPoint, spec: { count: number; spread: number; speed: number; damage: number; ttl: number; polarity: WardenPolarity }): void {
        const ox = entity.pos.x, oy = entity.pos.y + entity.height * 0.7, oz = entity.pos.z;
        const dx = player.x - ox, dy = (player.y + PLAYER_HEIGHT * 0.9) - oy, dz = player.z - oz;
        const d = Math.hypot(dx, dy, dz) || 1;
        for (let index = 0; index < spec.count; index += 1) {
            const t = spec.count === 1 ? 0 : (index / (spec.count - 1)) * 2 - 1;
            const spread = t * spec.spread;
            const ca = Math.cos(spread), sa = Math.sin(spread);
            entityManager.spawnProjectile({
                x: ox, y: oy, z: oz,
                vx: (dx * ca - dz * sa) / d * spec.speed,
                vy: dy / d * spec.speed,
                vz: (dx * sa + dz * ca) / d * spec.speed,
                ttl: spec.ttl,
                damage: spec.damage,
                polarity: spec.polarity,
                sourceId: entity.id,
                kind: 'volley',
                homing: WARDEN_TIMING.bolts.homing,
            });
        }
        particleFx.burst({ x: ox, y: oy, z: oz, color: polarityFxColor(spec.polarity), color2: [1, 1, 1], count: 14, speed: 4, upBias: 1, spread: 0.5, dir: [dx / d, dy / d, dz / d], size: 0.22, life: 0.4, gravity: 2, drag: 1.5 });
    }

    private fireSpiralBolt(entity: Entity, spec: { angle: number; speed: number; damage: number; ttl: number; polarity: WardenPolarity }): void {
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
            homing: WARDEN_TIMING.bolts.homing * 0.7,
        });
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
            entityManager.damagePlayer(damage, fx, fz);
            addTrauma(0.35);
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
        entityManager.impulsePlayer((dx / d) * 12, 9, (dz / d) * 12);
        entityManager.damagePlayer(damage, dx / d, dz / d);
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
                entityManager.impulsePlayer((dx / n) * 9, 12, (dz / n) * 9);
                entityManager.damagePlayer(impactDamage, dx / n, dz / n);
            }
        }
        this.plungeTarget = null;
    }

    // --- Damage in --------------------------------------------------------------

    private applyHit(entityId: number, amount: number, knockX: number, knockZ: number, stagger: number): 'damaged' | 'blocked' | 'none' {
        if (entityId !== this.entityId) return 'none';
        const entity = entityManager.getEntity(entityId);
        if (!entity || entity.hp <= 0) return 'none';
        const transition = advanceWarden(this.state, { type: 'damage', amount, playerPolarity: entityManager.getPlayerPolarity() });
        this.state = transition.state;
        const hurt = transition.events.some((event) => event.type === 'hurt');
        this.applyEvents(transition.events, entity, entityManager.getPlayerPosition(), true);
        this.notify();
        if (!hurt) return 'blocked';
        if (this.entityId === entityId) {
            entityManager.applyHitReaction(entity, knockX, knockZ, stagger);
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
        this.notify();
    }

    private onBoltAbsorbed(): void {
        if (this.entityId === null) return;
        const entity = entityManager.getEntity(this.entityId);
        if (!entity) return;
        const transition = advanceWarden(this.state, { type: 'bolt-absorbed' });
        this.state = transition.state;
        this.applyEvents(transition.events, entity, entityManager.getPlayerPosition(), true);
        this.notify();
    }

    private onPolarityFlip(): void {
        if (this.entityId === null) return;
        const entity = entityManager.getEntity(this.entityId);
        if (!entity) return;
        const player = entityManager.getPlayerPosition();
        let bossInRange = false;
        if (player) {
            const dx = player.x - entity.pos.x, dy = (player.y + PLAYER_HEIGHT * 0.5) - (entity.pos.y + entity.height * 0.5), dz = player.z - entity.pos.z;
            bossInRange = Math.hypot(dx, dy, dz) <= FLUX_BURST_RADIUS;
        }
        const transition = advanceWarden(this.state, { type: 'polarity-flipped', bossInRange });
        this.state = transition.state;
        this.applyEvents(transition.events, entity, player, true);
        this.notify();
    }

    // --- Arena --------------------------------------------------------------

    private spawnCrystals(entity: Entity): void {
        if (!this.arena) return;
        const { centerX, centerZ, baseY, crystals } = this.arena;
        worldManager.setBlocks(crystals.map((c) => ({ x: c.x, y: c.y, z: c.z, type: BlockType.MAGNETIC_SHIELD_CRYSTAL })));
        for (let index = 0; index < Math.min(crystals.length, ARENA_PILLAR_COUNT); index += 1) {
            placePillarClimbMagnets(centerX, centerZ, baseY, index, (edits) => worldManager.setBlocks(edits));
        }
        this.magnetsPlaced = true;
        for (const c of crystals) {
            particleFx.burst({ x: c.x + 0.5, y: c.y + 0.5, z: c.z + 0.5, color: [1, 1, 1], color2: FX_CHARGED, count: 40, speed: 8, upBias: 3, spread: 1, size: 0.3, life: 0.9, gravity: 5, drag: 0.8 });
            // A streak of charged motes leaving the Warden toward the tower.
            const dx = c.x - entity.pos.x, dy = c.y - entity.pos.y, dz = c.z - entity.pos.z;
            const d = Math.hypot(dx, dy, dz) || 1;
            particleFx.burst({ x: entity.pos.x, y: entity.pos.y + 1.5, z: entity.pos.z, color: FX_CHARGED, color2: [1, 1, 1], count: 16, speed: 18, upBias: 0, spread: 0.08, dir: [dx / d, dy / d, dz / d], size: 0.26, life: 2.2, gravity: 0, drag: 0 });
        }
    }

    private consumeCrystals(entity: Entity): void {
        if (!this.arena) return;
        const edits: { x: number; y: number; z: number; type: BlockType }[] = [];
        for (const c of this.arena.crystals) {
            if (worldManager.hasChunk(Math.floor(c.x / 16), Math.floor(c.z / 16))
                && worldManager.getBlock(c.x, c.y, c.z, false) === BlockType.MAGNETIC_SHIELD_CRYSTAL) {
                edits.push({ x: c.x, y: c.y, z: c.z, type: BlockType.AIR });
                particleFx.burst({ x: c.x + 0.5, y: c.y + 0.5, z: c.z + 0.5, color: FX_CHARGED, color2: [1, 1, 1], count: 30, speed: 7, upBias: 3, spread: 1, size: 0.28, life: 0.8, gravity: 4, drag: 0.9 });
                const dx = entity.pos.x - c.x, dy = entity.pos.y - c.y, dz = entity.pos.z - c.z;
                const d = Math.hypot(dx, dy, dz) || 1;
                particleFx.burst({ x: c.x + 0.5, y: c.y + 0.5, z: c.z + 0.5, color: FX_CHARGED, color2: [1, 1, 1], count: 14, speed: 18, upBias: 0, spread: 0.08, dir: [dx / d, dy / d, dz / d], size: 0.26, life: 2.2, gravity: 0, drag: 0 });
            }
        }
        if (edits.length > 0) worldManager.setBlocks(edits);
        this.stripMagnets();
    }

    private shatterCrystal(index: number): void {
        const c = this.arena?.crystals[index];
        if (!c) return;
        if (worldManager.hasChunk(Math.floor(c.x / 16), Math.floor(c.z / 16))
            && worldManager.getBlock(c.x, c.y, c.z, false) === BlockType.MAGNETIC_SHIELD_CRYSTAL) {
            worldManager.setBlock(c.x, c.y, c.z, BlockType.AIR);
        }
        particleFx.burst({ x: c.x + 0.5, y: c.y + 0.5, z: c.z + 0.5, color: FX_CHARGED, color2: [1, 1, 1], count: 44, speed: 10, upBias: 4, spread: 1, size: 0.3, life: 0.9, gravity: 5, drag: 1 });
    }

    private stripMagnets(): void {
        if (!this.magnetsPlaced || !this.arena) { this.magnetsPlaced = false; return; }
        this.magnetsPlaced = false;
        stripArenaClimbMagnets(this.arena.centerX, this.arena.centerZ, this.arena.baseY, (edits) => worldManager.setBlocks(edits));
    }

    private cleanupArena(): void {
        if (!this.arena) return;
        const edits: { x: number; y: number; z: number; type: BlockType }[] = [];
        for (const c of this.arena.crystals) {
            if (worldManager.hasChunk(Math.floor(c.x / 16), Math.floor(c.z / 16))
                && worldManager.getBlock(c.x, c.y, c.z, false) === BlockType.MAGNETIC_SHIELD_CRYSTAL) {
                edits.push({ x: c.x, y: c.y, z: c.z, type: BlockType.AIR });
            }
        }
        if (edits.length > 0) worldManager.setBlocks(edits);
        this.stripMagnets();
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
        this.magnetsPlaced = false;
        gameEvents.emit('flux:changed', { value: 0, max: FLUX_MAX, full: false });
        this.notify();
    }

    private finish(): void {
        this.cleanupArena();
        this.state = createWardenState();
        this.entityId = null;
        this.arena = null;
        this.plungeTarget = null;
        gameEvents.emit('flux:changed', { value: 0, max: FLUX_MAX, full: false });
        this.notify();
    }

    // --- Helpers ---------------------------------------------------------------

    private notify(): void {
        this.listeners.forEach((listener) => listener());
    }

    private isShielded(): boolean {
        const s = this.state;
        return isWardenTransitioning(s) || (s.form === 2 && s.tether !== null);
    }

    private floorY(entity: Entity | undefined): number {
        if (this.arena) return this.arena.baseY + 1;
        return entity?.home?.y ?? entity?.pos.y ?? 0;
    }

    private centre(entity: Entity): { x: number; z: number } {
        if (this.arena) return { x: this.arena.centerX + 0.5, z: this.arena.centerZ + 0.5 };
        return { x: entity.home?.x ?? entity.pos.x, z: entity.home?.z ?? entity.pos.z };
    }

    /** The platform-edge point (inside the leash) on the line from the centre to a tower crystal. */
    private edgeBelowCrystal(entity: Entity, crystal: number): { x: number; z: number } | null {
        const c = this.arena?.crystals[crystal];
        if (!c) return null;
        const centre = this.centre(entity);
        const dx = c.x + 0.5 - centre.x, dz = c.z + 0.5 - centre.z;
        const d = Math.hypot(dx, dz) || 1;
        const reach = WARDEN_TIMING.plunge.targetClamp;
        return { x: centre.x + (dx / d) * reach, z: centre.z + (dz / d) * reach };
    }

    private farthestStandingCrystal(player: WardenPoint): number | null {
        if (!this.arena) return null;
        let best: number | null = null;
        let bestDistance = -1;
        this.arena.crystals.forEach((c, index) => {
            if (!this.state.crystals[index]) return;
            const distance = Math.hypot(c.x - player.x, c.z - player.z);
            if (distance > bestDistance) { bestDistance = distance; best = index; }
        });
        return best;
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

    private burstFx(entity: Entity, player: WardenPoint | null, hitBoss: boolean): void {
        const origin = player ?? { x: entity.pos.x, y: entity.pos.y, z: entity.pos.z };
        entityManager.clearProjectilesWithin(origin.x, origin.y + PLAYER_HEIGHT * 0.5, origin.z, FLUX_BURST_RADIUS);
        entityManager.spawnShockwave({
            x: origin.x, y: origin.y, z: origin.z, polarity: entityManager.getPlayerPolarity() || 1,
            maxRadius: FLUX_BURST_RADIUS, speed: 24, damage: 0, kind: 'flux', radius: 0.4,
        });
        particleFx.burst({ x: origin.x, y: origin.y + 1, z: origin.z, color: [1, 1, 1], color2: FX_CHARGED, count: 70, speed: 12, upBias: 3, spread: 1, size: 0.3, life: 0.9, gravity: 3, drag: 0.9 });
        addTrauma(hitBoss ? 0.7 : 0.4);
        gameEvents.emit('flux:burst', { x: origin.x, y: origin.y, z: origin.z, hitBoss });
    }
}

export const magneticWardenEncounter = new MagneticWardenEncounter();
