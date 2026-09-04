import * as THREE from 'three';
import { worldManager } from '../WorldManager';
import { checkCollision, getSupportTop, isSolid } from '../player/playerCollision';
import { PLAYER_WIDTH, PLAYER_HEIGHT } from '../player/playerConstants';
import { GRAVITY } from '../../constants';
import { gameEvents } from '../events/GameEvents';
import { ENTITY_KINDS, type Entity, type EntityKind, type NavigationRuntimeState, type Projectile, type Shockwave } from './Entity';
import { addTrauma } from '../player/cameraShake';
import { particleFx, polarityFxColor, FX_CHARGED } from '../fx/particleFx';
import { polarityRelation } from '../boss/magneticWardenCore';
import type { BossFieldSource } from '../player/magneticField';
import { BlockType, type GameMode } from '../../types';
import { BLOCKS } from '../../data/blocks';
import { EntityLocomotion } from './navigation/EntityLocomotion';
import { NavigationPlanner } from './navigation/NavigationPlanner';
import { VoxelNavigator } from './navigation/VoxelNavigator';
import type { NavigationVector } from './navigation/navigationTypes';
import {
    canTargetPlayer,
    shouldForgetTarget,
    shouldPreserveKnockback,
} from './entityBehavior';
import { raycastBellTitanCore, resolveBellTitanHitZone } from './BellTitanEncounterCore';

export interface SpawnOptions {
    bossId?: string;
    regionId?: string;
    /** Post-spawn grace before the boss starts attacking (e.g. after a cutscene). */
    aggroGraceSeconds?: number;
}

/** Per-tick view a registered brain gets of the player. */
export interface BrainContext {
    player: { x: number; y: number; z: number } | null;
    /** False in creative/spectator: attacks are still authored but never land. */
    targetable: boolean;
}

/**
 * An authored fight owns its entity's whole tick (movement, attacks, aggro).
 * EntityManager still exposes its physics helpers (gravity, voxel collision,
 * navigation, leash) so a brain composes them instead of re-implementing them.
 */
export type EntityBrain = (entity: Entity, dt: number, ctx: BrainContext) => void;

export interface ProjectileSpec {
    x: number; y: number; z: number;
    vx: number; vy: number; vz: number;
    ttl: number;
    damage: number;
    polarity: number;
    sourceId?: number;
    kind?: Projectile['kind'];
    homing?: number;
}

export interface ShockwaveSpec {
    x: number; y: number; z: number;
    polarity: number;
    maxRadius: number;
    speed: number;
    damage: number;
    kind: Shockwave['kind'];
    /** Starting radius (a flux ring blooms from the player's body). */
    radius?: number;
}

/** Beyond this distance from its home a boss despawns (re-summon at the altar). */
const BOSS_DESPAWN_RADIUS = 96;

/**
 * Delay between a boss dying and its altar re-forming. The loot is dropped in
 * sync (just after) so it lands on the finished altar. App's altar restore uses
 * the same value so the two stay aligned.
 */
export const BOSS_DEFEAT_ALTAR_DELAY_MS = 2500;

const MAX_FALL_SPEED = 40;
const STEP_HEIGHT = 1.0;
const NAVIGATION_STUCK_SECONDS = 0.9;
const NAVIGATION_PROGRESS_DISTANCE = 0.15;

const NAVIGATION_WORLD = {
    getBlock: (x: number, y: number, z: number): number | null => {
        if (!worldManager.hasChunk(Math.floor(x / 16), Math.floor(z / 16))) return null;
        return worldManager.getBlock(x, y, z, false);
    },
    isLoaded: (x: number, z: number): boolean => worldManager.hasChunk(Math.floor(x / 16), Math.floor(z / 16)),
    isSolid: (type: number): boolean => type !== BlockType.AIR
        && type !== BlockType.WATER
        && type !== BlockType.LAVA
        && BLOCKS[type as BlockType]?.noCollision !== true,
    isHazard: (type: number): boolean => type === BlockType.LAVA
        || type === BlockType.ECHO_SPIKES
        || type === BlockType.PHASE_BLOCK
        || type === BlockType.VAULT_SEAL
        || type === BlockType.MAGNETIC_SPIKE,
};

const BOSS_NAMES: Record<string, string> = {
    magnetic_warden: 'Magnetic Warden',
    bell_titan: 'Bell Titan',
};

type EntityDamageResult = 'damaged' | 'blocked' | 'none';
type EntityDamageHandler = (
    entityId: number,
    amount: number,
    knockX: number,
    knockZ: number,
    stagger: number,
    hitZone?: string,
) => EntityDamageResult;

/**
 * Owns all non-player entities. Ticked from the fixed-timestep GameLoop. Keeps
 * the simulation framework-agnostic; rendering subscribes to structural changes
 * and reads positions each frame.
 */
class EntityManager {
    private entities = new Map<number, Entity>();
    private projectiles: Projectile[] = [];
    private shockwaves: Shockwave[] = [];
    // Pending boss-loot drop (fires BOSS_DEFEAT_ALTAR_DELAY_MS after a kill).
    // Tracked so clear() (world unload) can cancel it, otherwise the timer
    // would spawn the Warden's loot into whatever world is loaded next.
    private lootDropTimer: ReturnType<typeof setTimeout> | null = null;
    private nextId = 1;
    private nextProjectileId = 1;
    private nextShockwaveId = 1;
    private inCombat = false;
    private damageHandlers = new Map<string, EntityDamageHandler>();
    private brains = new Map<string, EntityBrain>();
    private navigationClock = 0;
    private readonly navigationValidator = new VoxelNavigator(NAVIGATION_WORLD);
    private readonly navigationPlanner = new NavigationPlanner(NAVIGATION_WORLD, {
        isOwnerActive: (entityId) => this.entities.has(entityId) && (this.entities.get(entityId)?.hp ?? 0) > 0,
    });
    private readonly locomotionWorld = {
        canOccupy: (position: NavigationVector, width: number, height: number) => !checkCollision(
            worldManager,
            { x: position.x + 0.5, y: position.y, z: position.z + 0.5 },
            width,
            height,
        ),
        hasSafeLanding: (position: NavigationVector, width: number) => this.isSafeGround(
            position.x + 0.5,
            position.y,
            position.z + 0.5,
            width,
        ),
    };

    // Injected by App so entities can chase/damage the player without importing
    // React state.
    private playerPosProvider: (() => { x: number; y: number; z: number } | null) | null = null;
    private playerDamageHandler: ((amount: number, knockX: number, knockZ: number) => void) | null = null;
    // Optional: apply a velocity impulse to the player (the boss's magnetic field).
    private playerImpulseHandler: ((x: number, y: number, z: number) => void) | null = null;
    private playerTeleportHandler: ((x: number, y: number, z: number) => void) | null = null;
    // The player's controlled polarity (+1 / -1), or 0 when they have no
    // Polarity Boots: the "neutral" case of the polarity rule.
    private playerPolarityProvider: (() => number) | null = null;

    // Structural-change subscribers (the renderer rebuilds its mesh list on these).
    private structureListeners = new Set<() => void>();

    setPlayerHooks(
        posProvider: () => { x: number; y: number; z: number } | null,
        damageHandler: (amount: number, knockX: number, knockZ: number) => void,
        impulseHandler?: (x: number, y: number, z: number) => void,
        teleportHandler?: (x: number, y: number, z: number) => void,
        polarityProvider?: () => number,
    ): void {
        this.playerPosProvider = posProvider;
        this.playerDamageHandler = damageHandler;
        this.playerImpulseHandler = impulseHandler ?? null;
        this.playerTeleportHandler = teleportHandler ?? null;
        this.playerPolarityProvider = polarityProvider ?? null;
    }

    teleportPlayer(x: number, y: number, z: number): boolean {
        if (!this.playerTeleportHandler) return false;
        this.playerTeleportHandler(x, y, z);
        return true;
    }

    impulsePlayer(x: number, y: number, z: number): void {
        this.playerImpulseHandler?.(x, y, z);
    }

    /** Deal attack damage to the player (armor applies in App) with a knockback direction. */
    damagePlayer(amount: number, knockX: number, knockZ: number): void {
        this.playerDamageHandler?.(amount, knockX, knockZ);
    }

    /** The player's controlled polarity (+1 / -1), or 0 without Polarity Boots. */
    getPlayerPolarity(): number {
        const value = this.playerPolarityProvider?.() ?? 0;
        return Number.isFinite(value) ? value : 0;
    }

    getPlayerPosition(): { x: number; y: number; z: number } | null {
        return this.playerPosProvider?.() ?? null;
    }

    getProjectiles(): Projectile[] {
        return this.projectiles;
    }

    getShockwaves(): Shockwave[] {
        return this.shockwaves;
    }

    /** An authored fight (boss brain) takes over every tick for its entity kind. */
    registerBrain(kind: string, brain: EntityBrain): void {
        this.brains.set(kind, brain);
    }

    spawnProjectile(spec: ProjectileSpec): Projectile {
        const projectile: Projectile = {
            id: this.nextProjectileId++,
            pos: new THREE.Vector3(spec.x, spec.y, spec.z),
            vel: new THREE.Vector3(spec.vx, spec.vy, spec.vz),
            ttl: spec.ttl,
            damage: spec.damage,
            polarity: spec.polarity,
            sourceId: spec.sourceId,
            kind: spec.kind,
            homing: spec.homing,
        };
        this.projectiles.push(projectile);
        return projectile;
    }

    spawnShockwave(spec: ShockwaveSpec): Shockwave {
        const wave: Shockwave = {
            id: this.nextShockwaveId++,
            x: spec.x,
            y: spec.y,
            z: spec.z,
            polarity: spec.polarity,
            radius: spec.radius ?? 0,
            maxRadius: spec.maxRadius,
            speed: spec.speed,
            damage: spec.damage,
            hit: spec.kind === 'flux',
            kind: spec.kind,
        };
        this.shockwaves.push(wave);
        return wave;
    }

    /** Remove every boss bolt within `radius` of a point; returns how many were cleared. */
    clearProjectilesWithin(x: number, y: number, z: number, radius: number): number {
        const before = this.projectiles.length;
        const r2 = radius * radius;
        this.projectiles = this.projectiles.filter((p) => {
            const dx = p.pos.x - x, dy = p.pos.y - y, dz = p.pos.z - z;
            return dx * dx + dy * dy + dz * dz > r2;
        });
        return before - this.projectiles.length;
    }

    /** Wipe every bolt and ring (a fight ended or reset). */
    clearProjectilesAndShockwaves(): void {
        this.projectiles = [];
        this.shockwaves = [];
    }

    // --- Physics helpers exposed to registered brains ---
    applyGravity(e: Entity, dt: number): void {
        e.vel.y = Math.max(-MAX_FALL_SPEED, e.vel.y - GRAVITY * dt);
    }

    /** Voxel collision move; `guard` refuses ledges and lava under its own power. */
    moveEntity(e: Entity, dt: number, guard: boolean): void {
        const kind = ENTITY_KINDS[e.kind];
        if (!kind) return;
        this.moveWithCollision(e, kind, dt, guard);
    }

    leashEntity(e: Entity): void {
        const kind = ENTITY_KINDS[e.kind];
        if (kind) this.applyLeash(e, kind);
    }

    /** Ground navigation toward a target (preferred-range band, strafing). */
    steerEntity(e: Entity, target: { x: number; y: number; z: number }, dt: number): boolean {
        const kind = ENTITY_KINDS[e.kind];
        if (!kind) return false;
        const steered = this.steerWithNavigation(e, kind, target, dt);
        this.updateNavigationRecovery(e, kind, target);
        return steered;
    }

    /** Damp horizontal motion (a boss planting its feet for a telegraph). */
    haltEntity(e: Entity, dt: number): void {
        this.clearNavigationRoute(e);
        const damping = Math.max(0, 1 - dt * 12);
        e.vel.x *= damping;
        e.vel.z *= damping;
    }

    /**
     * Active magnetic-field emitters (one per engaged entity whose brain has set
     * a field). The player physics reads this each tick and applies the clamped
     * attract/repel force with its real velocity in hand.
     */
    getMagneticFieldSources(): BossFieldSource[] {
        const out: BossFieldSource[] = [];
        for (const e of this.entities.values()) {
            if (!e.field || !e.aggro || e.aggroGrace > 0 || e.hp <= 0) continue;
            out.push({
                x: e.pos.x,
                y: e.pos.y + e.height * 0.5,
                z: e.pos.z,
                polarity: e.polarity,
                range: e.field.range,
                force: e.field.force,
                maxDrift: e.field.maxDrift,
            });
        }
        return out;
    }

    onStructureChange(cb: () => void): () => void {
        this.structureListeners.add(cb);
        return () => { this.structureListeners.delete(cb); };
    }
    private notifyStructure(): void {
        this.structureListeners.forEach((cb) => cb());
    }

    getEntities(): Entity[] {
        return Array.from(this.entities.values());
    }
    getEntity(id: number): Entity | undefined {
        return this.entities.get(id);
    }
    registerDamageHandler(kind: string, handler: EntityDamageHandler): void {
        this.damageHandlers.set(kind, handler);
    }
    getCombatTraits(id: number): { armored: boolean; staggerResistance: number } {
        const entity = this.entities.get(id);
        const kind = entity ? ENTITY_KINDS[entity.kind] : null;
        return {
            armored: kind?.armored === true,
            staggerResistance: Math.min(0.9, Math.max(0, kind?.staggerResistance ?? 0)),
        };
    }

    /** Resolves an authored room point through the same clearance/hazard rules as live paths. */
    resolveNavigationAnchor(kindId: string, target: NavigationVector): NavigationVector | null {
        const kind = ENTITY_KINDS[kindId];
        return kind?.navigation ? this.resolveNavigationPoint(target, kind) : null;
    }

    setNavigationOverride(id: number, target: NavigationVector): boolean {
        const entity = this.entities.get(id);
        const kind = entity ? ENTITY_KINDS[entity.kind] : null;
        if (!entity || !kind?.navigation) return false;
        const state = this.ensureNavigationState(entity);
        state.overrideGoal = this.clampToEncounterBounds(entity, target);
        this.clearNavigationRoute(entity);
        state.repathAt = this.navigationClock;
        return true;
    }
    /** First entity matching pred, iterates the live map, so per-frame callers
     *  (e.g. the boss beam renderer) don't allocate a fresh entity array. */
    findEntity(pred: (e: Entity) => boolean): Entity | undefined {
        for (const e of this.entities.values()) if (pred(e)) return e;
        return undefined;
    }

    spawn(kindId: string, x: number, y: number, z: number, opts: SpawnOptions = {}): Entity | null {
        const kind = ENTITY_KINDS[kindId];
        if (!kind) {
            console.warn(`[entities] unknown kind "${kindId}"`);
            return null;
        }
        const entity: Entity = {
            id: this.nextId++,
            kind: kind.id,
            pos: new THREE.Vector3(x, y, z),
            vel: new THREE.Vector3(0, 0, 0),
            width: kind.width,
            height: kind.height,
            hp: kind.maxHp,
            maxHp: kind.maxHp,
            damageMultiplier: 1,
            grounded: false,
            aggro: false,
            hurtUntil: 0,
            shieldHitUntil: 0,
            attackCooldown: 0,
            knockbackSeconds: 0,
            yaw: 0,
            isBoss: !!kind.isBoss,
            bossId: opts.bossId ?? (kind.isBoss ? kind.id : undefined),
            regionId: opts.regionId,
            shielded: false,
            polarity: 1,
            field: null,
            aggroGrace: opts.aggroGraceSeconds ?? 0,
            home: new THREE.Vector3(x, y, z),
            ridden: false,
        };
        this.entities.set(entity.id, entity);
        this.notifyStructure();
        if (entity.isBoss && entity.bossId) {
            gameEvents.emit('boss:spawned', {
                bossId: entity.bossId,
                entityId: entity.id,
                name: BOSS_NAMES[kind.id] ?? kind.id,
                maxHp: entity.maxHp,
            });
        }
        return entity;
    }

    despawn(id: number): void {
        this.navigationPlanner.cancelOwner(id);
        if (this.entities.delete(id)) this.notifyStructure();
    }

    clear(): void {
        const hadEntities = this.entities.size > 0;
        this.navigationPlanner.clear();
        this.navigationClock = 0;
        this.entities.clear();
        this.projectiles = [];
        this.shockwaves = [];
        if (this.lootDropTimer !== null) { clearTimeout(this.lootDropTimer); this.lootDropTimer = null; }
        if (this.inCombat) { this.inCombat = false; gameEvents.emit('combat:stop', {}); }
        gameEvents.emit('boss:cleared', {});
        if (hadEntities) this.notifyStructure();
    }

    /**
     * Apply damage to an entity (from a melee hit). knock is a horizontal dir.
     * Returns 'blocked' if a shield absorbed it (no damage, no knockback, no hurt
     * flash) so the caller can give distinct feedback, 'damaged' otherwise.
     */
    damageEntity(id: number, amount: number, knockX = 0, knockZ = 0, stagger = 0, hitZone?: string): EntityDamageResult {
        const e = this.entities.get(id);
        if (!e || e.hp <= 0) return 'none';
        const damageHandler = this.damageHandlers.get(e.kind);
        if (damageHandler) return damageHandler(id, amount, knockX, knockZ, stagger, hitZone);
        return this.applyStandardDamage(id, amount, knockX, knockZ, stagger);
    }

    /**
     * The default damage path (shield check, hp, knockback, phase gates, death).
     * Public so a registered damage handler can fall through to normal damage
     * after applying its own rule (e.g. a raised guard turning a hit away).
     */
    applyStandardDamage(id: number, amount: number, knockX = 0, knockZ = 0, stagger = 0): EntityDamageResult {
        const e = this.entities.get(id);
        if (!e || e.hp <= 0) return 'none';
        // A shielded entity is fully invulnerable: no damage, no knockback, no
        // white hurt flash, only a shield shimmer.
        if (e.shielded) { e.shieldHitUntil = Date.now() + 160; return 'blocked'; }
        const multiplier = Number.isFinite(e.damageMultiplier) ? Math.max(0, e.damageMultiplier) : 1;
        e.hp -= Math.max(0, amount) * multiplier;
        this.applyHitReaction(e, knockX, knockZ, stagger);
        if (e.isBoss && e.bossId) {
            gameEvents.emit('boss:damaged', { bossId: e.bossId, entityId: e.id, hp: Math.max(0, e.hp), maxHp: e.maxHp });
        }
        if (e.hp <= 0) this.kill(e);
        return 'damaged';
    }

    /** Hurt flash, knockback, and stagger for a hit that landed (no HP change). */
    applyHitReaction(e: Entity, knockX = 0, knockZ = 0, stagger = 0): void {
        e.hurtUntil = Date.now() + 180;
        e.aggro = true;
        const len = Math.hypot(knockX, knockZ) || 1;
        e.vel.x += (knockX / len) * 6;
        e.vel.z += (knockZ / len) * 6;
        e.vel.y += 3;
        const resolvedStagger = Math.max(0, Number.isFinite(stagger) ? stagger : 0);
        e.knockbackSeconds = Math.max(e.knockbackSeconds, 0.2 + resolvedStagger * 0.35);
        e.attackCooldown = Math.max(e.attackCooldown, resolvedStagger * 0.45);
    }

    /** Completes an encounter-owned lethal hit through the normal drops/events path. */
    defeatEntity(id: number): void {
        const entity = this.entities.get(id);
        if (entity) this.kill(entity);
    }

    /**
     * Despawn every boss and clear the boss bar. Used when the player dies, the
     * fight ends, the boss leaves, and it can be re-summoned at the altar. The
     * boss:cleared signal lets its encounter reset the arena for the next attempt.
     */
    despawnAllBosses(): void {
        let removed = false;
        for (const e of [...this.entities.values()]) {
            if (e.isBoss && e.hp > 0) { this.despawnBoss(e); removed = true; }
        }
        if (removed) {
            this.projectiles = [];
            this.shockwaves = [];
            if (this.inCombat) { this.inCombat = false; gameEvents.emit('combat:stop', {}); }
            gameEvents.emit('boss:cleared', {});
            this.notifyStructure();
        }
    }

    // Remove a boss (NOT a defeat: no drops, no region cleanse). The encounter
    // that owns it listens for boss:cleared and tidies its arena (crystals,
    // climb magnets), so the arena is clean until it is re-summoned.
    private despawnBoss(e: Entity): void {
        this.navigationPlanner.cancelOwner(e.id);
        this.entities.delete(e.id);
        // Any reset wipes the boss's bolts/shockwaves so nothing lingers in the air.
        this.projectiles = [];
        this.shockwaves = [];
    }

    /**
     * Passive prop/vehicle simulation (boats). While ridden the player's physics
     * drives pos/yaw directly, so the tick does nothing. Unridden, a floating
     * kind bobs at the water surface (buoyancy + heavy vertical damping, the
     * same profile as the ridden boat physics) and drifts to a stop; otherwise
     * it just falls and settles.
     */
    private tickPassive(e: Entity, kind: EntityKind, dt: number): void {
        e.knockbackSeconds = Math.max(0, e.knockbackSeconds - dt);
        if (e.ridden) return;

        // Horizontal drift bleeds off (water drag / ground friction).
        e.vel.x *= 0.92;
        e.vel.z *= 0.92;

        const bx = Math.floor(e.pos.x);
        const by = Math.floor(e.pos.y);
        const bz = Math.floor(e.pos.z);
        const feetInWater = worldManager.getBlock(bx, by, bz, false) === BlockType.WATER;
        const waterBelow = worldManager.getBlock(bx, by - 1, bz, false) === BlockType.WATER;

        if (kind.floats && (feetInWater || (waterBelow && e.pos.y - by < 0.25))) {
            // Hull buoyancy: push up while submerged, heavy damping → calm bobbing.
            e.vel.y *= 0.6;
            if (feetInWater) e.vel.y += 30 * dt;
            else if (e.vel.y < 0) e.vel.y = Math.max(e.vel.y, -0.5);
        } else {
            e.vel.y = Math.max(-MAX_FALL_SPEED, e.vel.y - GRAVITY * dt);
        }
        this.moveWithCollision(e, kind, dt, false);
    }

    /** Mark/unmark a rideable entity as ridden (the rider's physics takes over). */
    setRidden(id: number, ridden: boolean): void {
        const e = this.entities.get(id);
        if (e) {
            e.ridden = ridden;
            if (ridden) { e.vel.set(0, 0, 0); }
        }
    }

    /** Serialized boat states for the world save (WorldMetadata.boats). */
    serializeBoats(): { x: number; y: number; z: number; yaw: number }[] {
        const out: { x: number; y: number; z: number; yaw: number }[] = [];
        for (const e of this.entities.values()) {
            if (e.kind !== 'boat' || e.hp <= 0) continue;
            out.push({ x: e.pos.x, y: e.pos.y, z: e.pos.z, yaw: e.yaw });
        }
        return out;
    }

    /** Respawn saved boats on world load (tolerates missing/malformed entries). */
    restoreBoats(boats: unknown): void {
        if (!Array.isArray(boats)) return;
        for (const b of boats) {
            if (!b || typeof b !== 'object') continue;
            const { x, y, z, yaw } = b as { x?: unknown; y?: unknown; z?: unknown; yaw?: unknown };
            if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number'
                || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
            const e = this.spawn('boat', x, y, z);
            if (e && typeof yaw === 'number' && Number.isFinite(yaw)) e.yaw = yaw;
        }
    }

    private kill(e: Entity): void {
        const kind = ENTITY_KINDS[e.kind];
        const spawnDrops = (dx: number, dy: number, dz: number) => {
            kind?.drops?.forEach((d) => {
                if (d.chance != null && Math.random() > d.chance) return;
                const count = d.min + Math.floor(Math.random() * (d.max - d.min + 1));
                for (let i = 0; i < count; i++) worldManager.spawnDrop(d.type, dx, dy, dz);
            });
        };
        if (e.kind === 'magnetic_warden' && e.home) {
            // Loot drops one block ABOVE the altar (the summoner sits at home.y+3,
            // i.e. baseY+4; home is the spawn floor baseY+1), and only AFTER the
            // altar finishes re-forming (BOSS_DEFEAT_ALTAR_DELAY_MS later) so it
            // lands cleanly on top of the summoner instead of being buried.
            const hx = e.home.x, hy = e.home.y + 4, hz = e.home.z;
            if (this.lootDropTimer !== null) clearTimeout(this.lootDropTimer);
            this.lootDropTimer = setTimeout(() => {
                this.lootDropTimer = null;
                spawnDrops(hx, hy, hz);
            }, BOSS_DEFEAT_ALTAR_DELAY_MS + 200);
            // A huge multi-stage polarity eruption where the Warden falls.
            const cx = e.home.x, cy = e.pos.y + e.height * 0.5, cz = e.home.z;
            const col = polarityFxColor(e.polarity);
            particleFx.burst({ x: cx, y: cy, z: cz, color: col, color2: [1, 1, 1], count: 80, speed: 13, upBias: 4, spread: 1, size: 0.34, life: 1.3, gravity: 7, drag: 0.8 });
            particleFx.burst({ x: cx, y: cy, z: cz, color: FX_CHARGED, color2: [1, 0.9, 1], count: 60, speed: 7, upBias: 6, spread: 1, size: 0.28, life: 1.6, gravity: 2, drag: 0.6 });
            addTrauma(1.0);
            // The fight is over, clear every bolt and shockwave so the dead Warden's
            // attacks can't keep hitting the player during the victory moment.
            this.projectiles = [];
            this.shockwaves = [];
        } else {
            spawnDrops(e.pos.x, e.pos.y + 0.3, e.pos.z);
        }
        this.navigationPlanner.cancelOwner(e.id);
        this.entities.delete(e.id);
        gameEvents.emit('entity:died', {
            entityId: e.id,
            type: e.kind,
            x: e.pos.x,
            y: e.pos.y,
            z: e.pos.z,
            yaw: e.yaw,
        });
        if (e.isBoss && e.bossId) {
            gameEvents.emit('boss:defeated', { bossId: e.bossId, entityId: e.id, regionId: e.regionId });
        }
        this.notifyStructure();
    }

    /** Ray vs entity AABBs. Returns the nearest entity id within maxDist, or null. */
    raycastEntity(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number, excludeId?: number): { id: number; dist: number; hitZone?: string } | null {
        let best: { id: number; dist: number; hitZone?: string } | null = null;
        for (const e of this.entities.values()) {
            if (e.id === excludeId || e.hp <= 0) continue;
            const hx = e.width / 2;
            const minX = e.pos.x - hx, maxX = e.pos.x + hx;
            const minY = e.pos.y, maxY = e.pos.y + e.height;
            const minZ = e.pos.z - hx, maxZ = e.pos.z + hx;
            const t = rayAabb(origin, dir, minX, minY, minZ, maxX, maxY, maxZ);
            const coreDistance = e.kind === 'bell_titan'
                ? raycastBellTitanCore(origin, dir, e.pos, e.yaw, maxDist)
                : null;
            const distance = coreDistance ?? t;
            if (distance !== null && distance <= maxDist && (!best || distance < best.dist)) {
                const hitZone = coreDistance !== null
                    ? 'core'
                    : e.kind === 'bell_titan' && t !== null
                        ? resolveBellTitanHitZone(e.pos, e.yaw, {
                            x: origin.x + dir.x * t,
                            y: origin.y + dir.y * t,
                            z: origin.z + dir.z * t,
                        })
                        : undefined;
                best = { id: e.id, dist: distance, hitZone };
            }
        }
        return best;
    }

    private ensureNavigationState(e: Entity): NavigationRuntimeState {
        if (!e.navigationState) {
            e.navigationState = {
                path: null,
                waypointIndex: 0,
                goalCellKey: '',
                repathAt: 0,
                lastProgressPosition: { x: e.pos.x, y: e.pos.y, z: e.pos.z },
                lastProgressAt: this.navigationClock,
                recoveryAttempts: 0,
                replans: 0,
                strafeDirection: e.id % 2 === 0 ? 1 : -1,
            };
        }
        return e.navigationState;
    }

    private releaseNavigationTicket(e: Entity): void {
        const ticket = e.navigationState?.ticket;
        if (!ticket) return;
        this.navigationPlanner.release(ticket);
        delete e.navigationState!.ticket;
    }

    private clearNavigationRoute(e: Entity): void {
        this.releaseNavigationTicket(e);
        if (!e.navigationState) return;
        e.navigationState.path = null;
        e.navigationState.waypointIndex = 0;
    }

    private resolveNavigationPoint(target: { x: number; y: number; z: number }, kind: EntityKind): NavigationVector | null {
        const profile = kind.navigation;
        if (!profile) return null;
        const x = Math.floor(target.x);
        const z = Math.floor(target.z);
        const baseY = Math.round(target.y);
        const offsets = [0, -1, 1, -2, 2, -3, 3, -4, 4];
        for (const offset of offsets) {
            const point = { x, y: baseY + offset, z };
            if (this.navigationValidator.inspectStandingCell(point, profile).traversable) return point;
        }
        return null;
    }

    private clampToEncounterBounds(e: Entity, target: NavigationVector): NavigationVector {
        const bounds = e.encounterBounds;
        if (!bounds) return target;
        const inset = Math.max(0.75, e.width * 0.5 + 0.25);
        return {
            x: THREE.MathUtils.clamp(target.x, bounds.minX + inset, bounds.maxX - inset),
            y: THREE.MathUtils.clamp(target.y, bounds.minY, bounds.maxY - e.height),
            z: THREE.MathUtils.clamp(target.z, bounds.minZ + inset, bounds.maxZ - inset),
        };
    }

    private hasNavigationLineOfSight(e: Entity, target: { x: number; y: number; z: number }): boolean {
        const start = { x: e.pos.x, y: e.pos.y + e.height * 0.65, z: e.pos.z };
        const end = { x: target.x, y: target.y + PLAYER_HEIGHT * 0.65, z: target.z };
        const dx = end.x - start.x, dy = end.y - start.y, dz = end.z - start.z;
        const distance = Math.hypot(dx, dy, dz);
        const samples = Math.max(1, Math.ceil(distance / 0.25));
        for (let index = 1; index < samples; index += 1) {
            const fraction = index / samples;
            const type = NAVIGATION_WORLD.getBlock(
                Math.floor(start.x + dx * fraction),
                Math.floor(start.y + dy * fraction),
                Math.floor(start.z + dz * fraction),
            );
            if (type === null || NAVIGATION_WORLD.isSolid(type)) return false;
        }
        return true;
    }

    private chooseNavigationGoal(
        e: Entity,
        kind: EntityKind,
        target: { x: number; y: number; z: number },
    ): NavigationVector | null {
        const profile = kind.navigation;
        if (!profile) return null;
        const state = this.ensureNavigationState(e);
        if (state.overrideGoal) return this.resolveNavigationPoint(this.clampToEncounterBounds(e, state.overrideGoal), kind);
        if (state.disengaging && e.home) return this.resolveNavigationPoint(this.clampToEncounterBounds(e, e.home), kind);
        if (state.combatGoal) return this.resolveNavigationPoint(this.clampToEncounterBounds(e, state.combatGoal), kind);

        let destination = target;
        if (e.home && kind.leashRadius
            && Math.hypot(target.x - e.home.x, target.z - e.home.z) > kind.leashRadius) {
            destination = e.home;
        } else if (profile.preferredRange.min >= 3) {
            const dx = e.pos.x - target.x;
            const dz = e.pos.z - target.z;
            const distance = Math.hypot(dx, dz) || 1;
            const bandCenter = (profile.preferredRange.min + profile.preferredRange.max) * 0.5;
            destination = {
                x: target.x + (dx / distance) * bandCenter,
                y: target.y,
                z: target.z + (dz / distance) * bandCenter,
            };
        }
        return this.resolveNavigationPoint(this.clampToEncounterBounds(e, destination), kind);
    }

    private chooseStrafeGoal(
        e: Entity,
        kind: EntityKind,
        target: { x: number; y: number; z: number },
        state: NavigationRuntimeState,
    ): NavigationVector | null {
        const profile = kind.navigation;
        if (!profile?.strafe) return null;
        if (state.combatGoal && this.navigationClock < (state.combatGoalUntil ?? 0)) {
            return this.resolveNavigationPoint(state.combatGoal, kind);
        }

        const dx = e.pos.x - target.x;
        const dz = e.pos.z - target.z;
        const distance = Math.hypot(dx, dz) || 1;
        const minimumRadius = profile.preferredRange.min + 0.5;
        const maximumRadius = Math.max(minimumRadius, profile.preferredRange.max - 0.5);
        const radius = THREE.MathUtils.clamp(distance, minimumRadius, maximumRadius);
        const baseAngle = Math.atan2(dz, dx);
        const arc = THREE.MathUtils.clamp(2.75 / Math.max(1, radius), 0.22, 0.65);
        const initialDirection = state.strafeDirection ?? (e.id % 2 === 0 ? 1 : -1);

        for (const direction of [initialDirection, -initialDirection] as const) {
            const angle = baseAngle + arc * direction;
            const candidate = {
                x: target.x + Math.cos(angle) * radius,
                y: target.y,
                z: target.z + Math.sin(angle) * radius,
            };
            const resolved = this.resolveNavigationPoint(this.clampToEncounterBounds(e, candidate), kind);
            if (!resolved) continue;
            state.combatGoal = resolved;
            state.combatGoalUntil = this.navigationClock + 1.1 + (e.id % 3) * 0.15;
            state.strafeDirection = direction === 1 ? -1 : 1;
            return resolved;
        }

        delete state.combatGoal;
        delete state.combatGoalUntil;
        return null;
    }

    private steerWithNavigation(
        e: Entity,
        kind: EntityKind,
        target: { x: number; y: number; z: number },
        dt: number,
    ): boolean {
        const profile = kind.navigation;
        if (!profile || (e.isBoss && e.shielded)) return false;
        const state = this.ensureNavigationState(e);
        const horizontalDistance = Math.hypot(target.x - e.pos.x, target.z - e.pos.z);
        if (state.disengaging && e.home && Math.hypot(e.pos.x - e.home.x, e.pos.z - e.home.z) < 1.5) {
            this.clearNavigationRoute(e);
            state.disengaging = false;
            state.recoveryAttempts = 0;
            delete state.overrideGoal;
            return true;
        }
        const inPreferredBand = !state.overrideGoal && !state.disengaging
            && horizontalDistance >= profile.preferredRange.min
            && horizontalDistance <= profile.preferredRange.max
            && this.hasNavigationLineOfSight(e, target);
        const strafeGoal = inPreferredBand ? this.chooseStrafeGoal(e, kind, target, state) : null;
        if (!inPreferredBand) {
            delete state.combatGoal;
            delete state.combatGoalUntil;
        }
        if (inPreferredBand && !strafeGoal) {
            this.clearNavigationRoute(e);
            const amount = profile.acceleration * dt;
            e.vel.x = THREE.MathUtils.lerp(e.vel.x, 0, Math.min(1, amount));
            e.vel.z = THREE.MathUtils.lerp(e.vel.z, 0, Math.min(1, amount));
            e.yaw = Math.atan2(target.x - e.pos.x, target.z - e.pos.z);
            return true;
        }

        const goal = this.chooseNavigationGoal(e, kind, target);
        if (!goal) {
            this.clearNavigationRoute(e);
            e.vel.x *= 0.6;
            e.vel.z *= 0.6;
            return true;
        }
        const goalKey = `${goal.x},${goal.y},${goal.z}`;
        if (goalKey !== state.goalCellKey && this.navigationClock >= state.repathAt) {
            this.clearNavigationRoute(e);
            state.goalCellKey = goalKey;
            state.repathAt = this.navigationClock;
        }

        if (state.ticket) {
            const result = this.navigationPlanner.getResult(state.ticket);
            if (result.status === 'complete') {
                state.path = result.path;
                state.waypointIndex = result.path && result.path.nodes.length > 1 ? 1 : 0;
                state.replans += 1;
                state.lastProgressPosition = { x: e.pos.x, y: e.pos.y, z: e.pos.z };
                state.lastProgressAt = this.navigationClock;
                this.releaseNavigationTicket(e);
                state.repathAt = this.navigationClock + 0.45;
            } else if (result.status === 'failed') {
                this.releaseNavigationTicket(e);
                state.path = null;
                state.repathAt = this.navigationClock + 0.2;
            }
        }

        if (!state.path && !state.ticket && e.grounded && this.navigationClock >= state.repathAt) {
            state.ticket = this.navigationPlanner.request(e.id, {
                start: { x: Math.floor(e.pos.x), y: Math.round(e.pos.y), z: Math.floor(e.pos.z) },
                goal,
                profile,
                maxExpandedNodes: 2048,
            });
            state.repathAt = this.navigationClock + 0.2;
        }

        if (!state.path) {
            e.vel.x *= 0.7;
            e.vel.z *= 0.7;
            return true;
        }
        const locomotion = EntityLocomotion.tick(e as Entity & { navigationState: NavigationRuntimeState }, state.path, this.locomotionWorld, dt, profile, kind.speed);
        if (inPreferredBand && profile.strafe) {
            e.yaw = Math.atan2(target.x - e.pos.x, target.z - e.pos.z);
        }
        if (locomotion.routeInvalid) {
            state.path = null;
            state.waypointIndex = 0;
            state.repathAt = this.navigationClock;
        } else if (locomotion.routeComplete) {
            state.path = null;
            state.waypointIndex = 0;
            if (state.overrideGoal) delete state.overrideGoal;
            if (state.combatGoal) {
                delete state.combatGoal;
                delete state.combatGoalUntil;
            }
            if (state.disengaging && e.home && Math.hypot(e.pos.x - e.home.x, e.pos.z - e.home.z) < 1.5) {
                state.disengaging = false;
                state.recoveryAttempts = 0;
            }
            state.repathAt = this.navigationClock + 0.35;
        }
        return true;
    }

    private updateNavigationRecovery(e: Entity, kind: EntityKind, target: { x: number; y: number; z: number } | null): void {
        const state = e.navigationState;
        if (!kind.navigation || !state?.path) return;
        const progress = Math.hypot(
            e.pos.x - state.lastProgressPosition.x,
            e.pos.z - state.lastProgressPosition.z,
        );
        if (progress >= NAVIGATION_PROGRESS_DISTANCE) {
            state.lastProgressPosition = { x: e.pos.x, y: e.pos.y, z: e.pos.z };
            state.lastProgressAt = this.navigationClock;
            state.recoveryAttempts = 0;
            return;
        }
        if (this.navigationClock - state.lastProgressAt < NAVIGATION_STUCK_SECONDS) return;

        const oldPath = state.path;
        const oldWaypointIndex = state.waypointIndex;
        state.recoveryAttempts += 1;
        state.path = null;
        state.waypointIndex = 0;
        state.repathAt = this.navigationClock;
        state.lastProgressAt = this.navigationClock;
        if (state.recoveryAttempts !== 2) delete state.overrideGoal;
        if (state.recoveryAttempts === 2 && target) {
            const dx = target.x - e.pos.x, dz = target.z - e.pos.z;
            const length = Math.hypot(dx, dz) || 1;
            const sign = e.id % 2 === 0 ? 1 : -1;
            state.overrideGoal = {
                x: e.pos.x + (-dz / length) * 2 * sign,
                y: e.pos.y,
                z: e.pos.z + (dx / length) * 2 * sign,
            };
        } else if (state.recoveryAttempts === 3) {
            const visible = oldPath.nodes
                .slice(oldWaypointIndex)
                .map((node) => ({ node, distance: Math.hypot(node.x + 0.5 - e.pos.x, node.z + 0.5 - e.pos.z) }))
                .filter(({ node, distance }) => distance > 0.5
                    && distance <= 4
                    && this.hasNavigationLineOfSight(e, { x: node.x + 0.5, y: node.y, z: node.z + 0.5 }))
                .sort((a, b) => a.distance - b.distance)[0]?.node;
            if (visible) state.overrideGoal = visible;
        } else if (state.recoveryAttempts > 3 && this.recoverToAuthoredAnchor(e, kind, state)) {
            return;
        } else if (state.recoveryAttempts > 3) {
            state.disengaging = true;
            state.overrideGoal = e.home ? { x: e.home.x, y: e.home.y, z: e.home.z } : undefined;
            e.aggro = false;
        }
    }

    private recoverToAuthoredAnchor(e: Entity, kind: EntityKind, state: NavigationRuntimeState): boolean {
        if (!e.encounterBounds || !e.recoveryAnchors?.length || !kind.navigation) return false;
        const candidate = e.recoveryAnchors
            .map((anchor) => this.resolveNavigationPoint(this.clampToEncounterBounds(e, anchor), kind))
            .filter((anchor): anchor is NavigationVector => anchor !== null)
            .map((anchor) => ({
                cell: anchor,
                position: { x: anchor.x + 0.5, y: anchor.y, z: anchor.z + 0.5 },
                distance: Math.hypot(anchor.x + 0.5 - e.pos.x, anchor.z + 0.5 - e.pos.z),
            }))
            .filter(({ position }) => this.hasNavigationLineOfSight(e, position)
                && [...this.entities.values()].every((other) => other.id === e.id
                    || other.hp <= 0
                    || Math.hypot(other.pos.x - position.x, other.pos.z - position.z) > (other.width + e.width) * 0.5 + 0.35))
            .sort((a, b) => a.distance - b.distance)[0];
        if (!candidate) return false;

        this.clearNavigationRoute(e);
        e.pos.set(candidate.position.x, candidate.position.y, candidate.position.z);
        e.vel.set(0, 0, 0);
        e.grounded = true;
        e.reformingUntil = Date.now() + 450;
        e.combatAction = {
            id: 'reform',
            phase: 'recovery',
            elapsed: 0,
            duration: 0.45,
            locksMovement: true,
            targetYaw: e.yaw,
        };
        state.recoveryAttempts = 0;
        state.lastProgressPosition = { x: e.pos.x, y: e.pos.y, z: e.pos.z };
        state.lastProgressAt = this.navigationClock;
        state.repathAt = this.navigationClock + 0.45;
        delete state.overrideGoal;
        return true;
    }

    private hasCommittedSafeDrop(e: Entity, kind: EntityKind): boolean {
        const state = e.navigationState;
        const profile = kind.navigation;
        if (!state?.path || !profile) return false;
        return EntityLocomotion.isSafeDropCommitted(
            e as Entity & { navigationState: NavigationRuntimeState },
            state.path,
            this.locomotionWorld,
            profile,
        );
    }

    tick(dt: number, gameMode: GameMode): void {
        this.navigationClock += Math.max(0, dt);
        this.navigationPlanner.tickBudget();
        if (this.entities.size === 0) {
            if (this.inCombat) { this.inCombat = false; gameEvents.emit('combat:stop', {}); }
            return;
        }
        const pp = this.playerPosProvider?.() ?? null;
        const targetable = canTargetPlayer(gameMode);
        let anyAggro = false;

        for (const e of this.entities.values()) {
            const kind = ENTITY_KINDS[e.kind];
            if (!kind) continue;

            // --- Passive props/vehicles (boats): no AI, no aggro, no combat ---
            if (kind.passive) {
                this.tickPassive(e, kind, dt);
                continue;
            }

            // A boss whose fight the player has abandoned (wandered far from the
            // arena, or died) despawns, the bar clears and it can be re-summoned.
            if (e.isBoss && e.home) {
                const far = !pp || Math.hypot(pp.x - e.home.x, pp.z - e.home.z) > BOSS_DESPAWN_RADIUS;
                if (far) {
                    this.despawnBoss(e);
                    this.projectiles = [];
                    this.shockwaves = [];
                    if (this.inCombat) { this.inCombat = false; gameEvents.emit('combat:stop', {}); }
                    gameEvents.emit('boss:cleared', {});
                    this.notifyStructure();
                    continue;
                }
            }

            // A registered brain (the Magnetic Warden's three-form encounter) owns
            // this entity's whole tick, composing the physics helpers above.
            const brain = kind.brain ? this.brains.get(kind.brain) : undefined;
            if (brain) {
                brain(e, dt, { player: pp, targetable });
                if (e.aggro) anyAggro = true;
                continue;
            }

            // The Bell Titan owns its authored attacks and horizontal movement.
            // EntityManager still resolves gravity and voxel collision, but never
            // layers generic pursuit/contact AI over the encounter timeline.
            if (e.kind === 'bell_titan') {
                e.aggro = true;
                anyAggro = true;
                e.vel.y = Math.max(-MAX_FALL_SPEED, e.vel.y - GRAVITY * dt);
                this.moveWithCollision(e, kind, dt, true);
                this.applyLeash(e, kind);
                continue;
            }

            // --- Post-spawn grace: present (music + bar) but does not attack ---
            if (e.aggroGrace > 0) {
                e.aggroGrace = Math.max(0, e.aggroGrace - dt);
                e.aggro = true; // counts as engaged so the boss music + bar are up
                anyAggro = true;
                e.vel.x *= 0.6; e.vel.z *= 0.6;
                e.vel.y = Math.max(-MAX_FALL_SPEED, e.vel.y - GRAVITY * dt);
                this.moveWithCollision(e, kind, dt, false);
                continue;
            }

            e.knockbackSeconds = Math.max(0, e.knockbackSeconds - dt);
            const preserveKnockback = shouldPreserveKnockback(e.knockbackSeconds);
            const actionLocksMovement = (e.reformingUntil ?? 0) > Date.now()
                || e.combatAction?.locksMovement === true;
            if (actionLocksMovement && !preserveKnockback) {
                this.clearNavigationRoute(e);
                e.vel.x = 0;
                e.vel.z = 0;
            }

            // --- AI: notice and chase the player ---
            if (pp && targetable) {
                const dx = pp.x - e.pos.x;
                const dz = pp.z - e.pos.z;
                const distSq = dx * dx + dz * dz;
                if (e.navigationState?.disengaging) e.aggro = false;
                else if (distSq < kind.aggroRange * kind.aggroRange) e.aggro = true;
                else if (e.aggro && shouldForgetTarget(distSq, kind.aggroRange)) e.aggro = false;
                if (e.aggro && !preserveKnockback && !actionLocksMovement) {
                    if (!this.steerWithNavigation(e, kind, pp, dt)) {
                        // Compatibility path for entities without a navigation profile.
                        let tx = dx, tz = dz;
                        if (e.home && kind.leashRadius) {
                            const hx = pp.x - e.home.x, hz = pp.z - e.home.z;
                            if (Math.hypot(hx, hz) > kind.leashRadius) {
                                tx = e.home.x - e.pos.x;
                                tz = e.home.z - e.pos.z;
                            }
                        }
                        const tlen = Math.hypot(tx, tz) || 1;
                        e.vel.x = (tx / tlen) * kind.speed;
                        e.vel.z = (tz / tlen) * kind.speed;
                        e.yaw = Math.atan2(dx, dz);
                    }
                } else if (!e.aggro && e.navigationState?.disengaging && e.home && !preserveKnockback && !actionLocksMovement) {
                    this.steerWithNavigation(e, kind, e.home, dt);
                } else if (!e.aggro && !preserveKnockback) {
                    this.clearNavigationRoute(e);
                    e.vel.x *= 0.6;
                    e.vel.z *= 0.6;
                }
            } else {
                e.aggro = false;
                if (!preserveKnockback) {
                    e.vel.x *= 0.6;
                    e.vel.z *= 0.6;
                }
            }
            if (e.aggro) anyAggro = true;

            // --- Gravity ---
            e.vel.y = Math.max(-MAX_FALL_SPEED, e.vel.y - GRAVITY * dt);

            // Under its own power (grounded, not mid-knockback) the entity refuses
            // to step off ledges or onto lava; knockback can still shove it.
            const guard = e.grounded && !preserveKnockback && !this.hasCommittedSafeDrop(e, kind);
            this.moveWithCollision(e, kind, dt, guard);
            this.applyLeash(e, kind);
            this.updateNavigationRecovery(e, kind, pp);

            // --- Contact damage to player ---
            if (e.attackCooldown > 0) e.attackCooldown -= dt;
            if (kind.contactDamage > 0 && targetable && pp && e.attackCooldown <= 0 && this.overlapsPlayer(e, pp)) {
                this.playerDamageHandler?.(kind.contactDamage, pp.x - e.pos.x, pp.z - e.pos.z);
                e.attackCooldown = kind.attackCooldown;
            }
        }

        this.tickProjectiles(dt, pp, targetable);
        this.tickShockwaves(dt, pp, targetable);

        if (anyAggro && !this.inCombat) { this.inCombat = true; gameEvents.emit('combat:start', {}); }
        else if (!anyAggro && this.inCombat) { this.inCombat = false; gameEvents.emit('combat:stop', {}); }
    }

    // Boss bolts. The polarity rule resolves every contact: a bolt the player
    // MATCHES is repelled off their boots and absorbed (bolt:absorbed feeds the
    // Flux meter, no damage); a bolt they OPPOSE is drawn in (it homes) and hits;
    // no boots is neutral and just gets hit.
    private tickProjectiles(
        dt: number,
        pp: { x: number; y: number; z: number } | null,
        targetable: boolean,
    ): void {
        if (this.projectiles.length === 0) return;
        const playerPolarity = this.getPlayerPolarity();
        const survivors: Projectile[] = [];
        for (const p of this.projectiles) {
            p.ttl -= dt;
            if (pp && p.homing && polarityRelation(playerPolarity, p.polarity) === 'opposite') {
                // Attraction: steer toward the player's chest at a capped rate,
                // keeping the bolt's speed, so it curves in but never snaps.
                const speed = p.vel.length();
                if (speed > 0.001) {
                    const tx = pp.x - p.pos.x, ty = pp.y + PLAYER_HEIGHT * 0.5 - p.pos.y, tz = pp.z - p.pos.z;
                    const td = Math.hypot(tx, ty, tz) || 1;
                    const k = Math.min(1, p.homing * dt);
                    p.vel.x += ((tx / td) * speed - p.vel.x) * k;
                    p.vel.y += ((ty / td) * speed - p.vel.y) * k;
                    p.vel.z += ((tz / td) * speed - p.vel.z) * k;
                    p.vel.multiplyScalar(speed / (p.vel.length() || 1));
                }
            }
            p.pos.x += p.vel.x * dt;
            p.pos.y += p.vel.y * dt;
            p.pos.z += p.vel.z * dt;
            if (p.ttl <= 0) continue;
            // Only solid blocks stop a bolt, water landing pools and foliage don't.
            if (isSolid(worldManager, Math.floor(p.pos.x), Math.floor(p.pos.y), Math.floor(p.pos.z))) continue;

            if (targetable && pp) {
                // Hit the whole player AABB (centre ± body), not just a low point.
                const cx = pp.x, cy = pp.y + PLAYER_HEIGHT * 0.5, cz = pp.z;
                const dx = p.pos.x - cx, dy = p.pos.y - cy, dz = p.pos.z - cz;
                if (Math.abs(dx) < 0.85 && Math.abs(dz) < 0.85 && Math.abs(dy) < 1.1) {
                    if (polarityRelation(playerPolarity, p.polarity) === 'same') {
                        // Repelled: a spark fan off the boots, no damage, Flux gained.
                        particleFx.burst({
                            x: p.pos.x, y: p.pos.y, z: p.pos.z,
                            color: polarityFxColor(p.polarity), color2: [1, 1, 1],
                            count: 10, speed: 5, upBias: 1, spread: 0.6,
                            dir: [-p.vel.x, 0.3, -p.vel.z], size: 0.2, life: 0.4, gravity: 3, drag: 1.4,
                        });
                        gameEvents.emit('bolt:absorbed', { x: p.pos.x, y: p.pos.y, z: p.pos.z, polarity: p.polarity });
                    } else {
                        this.playerDamageHandler?.(p.damage, p.vel.x, p.vel.z);
                    }
                    continue;
                }
            }
            survivors.push(p);
        }
        this.projectiles = survivors;
    }

    // Expand each ring; when a polarity ring's leading edge reaches the player,
    // the SAME polarity is launched off the charged ground and hurt, the
    // OPPOSITE is pinned safe, and no boots (neutral) is hurt without a launch.
    private tickShockwaves(
        dt: number,
        pp: { x: number; y: number; z: number } | null,
        targetable: boolean,
    ): void {
        if (this.shockwaves.length === 0) return;
        const playerPolarity = this.getPlayerPolarity();
        const survivors: Shockwave[] = [];
        for (const s of this.shockwaves) {
            s.radius += s.speed * dt;
            if (!s.hit && s.kind === 'polarity' && targetable && pp) {
                const dist = Math.hypot(pp.x - s.x, pp.z - s.z);
                // Resolve once the ring's edge sweeps over the player (and they're
                // near the floor, a player already airborne above it is skipped).
                if (s.radius >= dist && Math.abs(pp.y - s.y) < 3.5) {
                    s.hit = true;
                    const relation = polarityRelation(playerPolarity, s.polarity);
                    const d = dist || 1;
                    const ox = (pp.x - s.x) / d, oz = (pp.z - s.z) / d;
                    if (relation === 'same') {
                        // Repulsion off the charged floor: launched HARD up and away.
                        this.playerImpulseHandler?.(ox * 13, 19, oz * 13);
                        this.playerDamageHandler?.(s.damage, ox, oz);
                    } else if (relation === 'neutral') {
                        this.playerDamageHandler?.(s.damage, ox, oz);
                    }
                }
            }
            if (s.radius <= s.maxRadius) survivors.push(s);
        }
        this.shockwaves = survivors;
    }

    private moveWithCollision(e: Entity, kind: EntityKind, dt: number, guard = false): void {
        const p = e.pos;
        const w = e.width, h = e.height;

        // X axis
        const nx = { x: p.x + e.vel.x * dt, y: p.y, z: p.z };
        if (!checkCollision(worldManager, nx, w, h)) {
            if (guard && !this.isSafeGround(nx.x, p.y, p.z, w)) e.vel.x = 0; // ledge / lava
            else p.x = nx.x;
        } else if (kind.canStep && e.grounded) {
            // try stepping up a single block
            const stepped = { x: nx.x, y: p.y + STEP_HEIGHT, z: p.z };
            if (!checkCollision(worldManager, stepped, w, h)
                && (!guard || this.isSafeGround(nx.x, p.y + STEP_HEIGHT, p.z, w))) {
                p.x = nx.x; p.y += STEP_HEIGHT;
            } else e.vel.x = 0;
        } else {
            e.vel.x = 0;
        }

        // Z axis
        const nz = { x: p.x, y: p.y, z: p.z + e.vel.z * dt };
        if (!checkCollision(worldManager, nz, w, h)) {
            if (guard && !this.isSafeGround(p.x, p.y, nz.z, w)) e.vel.z = 0; // ledge / lava
            else p.z = nz.z;
        } else if (kind.canStep && e.grounded) {
            const stepped = { x: p.x, y: p.y + STEP_HEIGHT, z: nz.z };
            if (!checkCollision(worldManager, stepped, w, h)
                && (!guard || this.isSafeGround(p.x, p.y + STEP_HEIGHT, nz.z, w))) {
                p.z = nz.z; p.y += STEP_HEIGHT;
            } else e.vel.z = 0;
        } else {
            e.vel.z = 0;
        }

        // Y axis
        const ny = { x: p.x, y: p.y + e.vel.y * dt, z: p.z };
        if (!checkCollision(worldManager, ny, w, h)) {
            p.y = ny.y;
            e.grounded = false;
        } else {
            if (e.vel.y < 0) {
                const top = getSupportTop(worldManager, { x: p.x, y: p.y, z: p.z }, w);
                if (top !== null) p.y = top;
                e.grounded = true;
            }
            e.vel.y = 0;
        }
    }

    /**
     * Whether the entity can stand at (x,z) with feet near feetY: there is solid
     * support within a step below (so it won't walk off a ledge into the moat),
     * and it isn't stepping onto lava. Lava is non-solid so it yields no support,
     * which already reads as a ledge, the explicit check guards flush lava too.
     */
    private isSafeGround(x: number, feetY: number, z: number, w: number): boolean {
        if (worldManager.getBlock(Math.floor(x), Math.floor(feetY), Math.floor(z), false) === BlockType.LAVA) {
            return false;
        }
        const top = getSupportTop(worldManager, { x, y: feetY, z }, w);
        if (top === null) return false;
        return feetY - top <= STEP_HEIGHT + 0.05;
    }

    /** Hard-contain a leashed entity within leashRadius of its spawn (home). */
    private applyLeash(e: Entity, kind: EntityKind): void {
        if (!e.home || !kind.leashRadius) return;
        const dx = e.pos.x - e.home.x;
        const dz = e.pos.z - e.home.z;
        const d = Math.hypot(dx, dz);
        if (d <= kind.leashRadius) return;
        const k = kind.leashRadius / d;
        e.pos.x = e.home.x + dx * k;
        e.pos.z = e.home.z + dz * k;
        // Cancel any outward velocity so it doesn't keep fighting the leash.
        const ox = dx / d, oz = dz / d;
        const outward = e.vel.x * ox + e.vel.z * oz;
        if (outward > 0) { e.vel.x -= ox * outward; e.vel.z -= oz * outward; }
    }

    private overlapsPlayer(e: Entity, pp: { x: number; y: number; z: number }): boolean {
        const ehx = e.width / 2;
        const phx = PLAYER_WIDTH / 2;
        return (
            e.pos.x - ehx < pp.x + phx && e.pos.x + ehx > pp.x - phx &&
            e.pos.z - ehx < pp.z + phx && e.pos.z + ehx > pp.z - phx &&
            e.pos.y < pp.y + PLAYER_HEIGHT && e.pos.y + e.height > pp.y
        );
    }
}

// Slab-method ray vs AABB. Returns entry distance along dir (assumed normalized)
// or null if no hit / behind the origin.
function rayAabb(
    o: THREE.Vector3, d: THREE.Vector3,
    minX: number, minY: number, minZ: number,
    maxX: number, maxY: number, maxZ: number,
): number | null {
    let tmin = -Infinity, tmax = Infinity;
    const axes: [number, number, number, number][] = [
        [o.x, d.x, minX, maxX],
        [o.y, d.y, minY, maxY],
        [o.z, d.z, minZ, maxZ],
    ];
    for (const [oa, da, lo, hi] of axes) {
        if (Math.abs(da) < 1e-8) {
            if (oa < lo || oa > hi) return null;
        } else {
            let t1 = (lo - oa) / da;
            let t2 = (hi - oa) / da;
            if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
            if (t1 > tmin) tmin = t1;
            if (t2 < tmax) tmax = t2;
            if (tmin > tmax) return null;
        }
    }
    if (tmax < 0) return null;
    return tmin >= 0 ? tmin : tmax;
}

export const entityManager = new EntityManager();
