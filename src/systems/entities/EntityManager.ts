import * as THREE from 'three';
import { worldManager } from '../WorldManager';
import { checkCollision, getSupportTop, isSolid } from '../player/playerCollision';
import { PLAYER_WIDTH, PLAYER_HEIGHT } from '../player/playerConstants';
import { GRAVITY } from '../../constants';
import { gameEvents } from '../events/GameEvents';
import { ENTITY_KINDS, type Entity, type EntityKind, type Projectile, type Shockwave } from './Entity';
import { inputState } from '../player/playerInput';
import { addTrauma } from '../player/cameraShake';
import { particleFx, polarityFxColor, FX_CHARGED } from '../fx/particleFx';
import type { BossFieldSource } from '../player/magneticField';
import { BlockType, type GameMode } from '../../types';
import {
    canTargetPlayer,
    shouldForgetTarget,
    shouldPreserveKnockback,
} from './entityBehavior';

export interface SpawnOptions {
    bossId?: string;
    regionId?: string;
    /** World positions of the boss's shield crystals (so a despawn can clear them). */
    shieldCrystalPositions?: { x: number; y: number; z: number }[];
    /** Post-spawn grace before the boss starts attacking (e.g. after a cutscene). */
    aggroGraceSeconds?: number;
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

const BOSS_NAMES: Record<string, string> = {
    cinder_warden: 'Cinder Warden',
    magnetic_warden: 'Magnetic Warden',
};

/**
 * Owns all non-player entities. Ticked from the fixed-timestep GameLoop. Keeps
 * the simulation framework-agnostic; rendering subscribes to structural changes
 * and reads positions each frame.
 */
class EntityManager {
    private entities = new Map<number, Entity>();
    private projectiles: Projectile[] = [];
    private shockwaves: Shockwave[] = [];
    private nextId = 1;
    private nextProjectileId = 1;
    private nextShockwaveId = 1;
    private inCombat = false;

    // Injected by App so entities can chase/damage the player without importing
    // React state.
    private playerPosProvider: (() => { x: number; y: number; z: number } | null) | null = null;
    private playerDamageHandler: ((amount: number, knockX: number, knockZ: number) => void) | null = null;
    // Optional: apply a velocity impulse to the player (the boss's magnetic field).
    private playerImpulseHandler: ((x: number, y: number, z: number) => void) | null = null;

    // Structural-change subscribers (the renderer rebuilds its mesh list on these).
    private structureListeners = new Set<() => void>();

    setPlayerHooks(
        posProvider: () => { x: number; y: number; z: number } | null,
        damageHandler: (amount: number, knockX: number, knockZ: number) => void,
        impulseHandler?: (x: number, y: number, z: number) => void,
    ): void {
        this.playerPosProvider = posProvider;
        this.playerDamageHandler = damageHandler;
        this.playerImpulseHandler = impulseHandler ?? null;
    }

    getProjectiles(): Projectile[] {
        return this.projectiles;
    }

    getShockwaves(): Shockwave[] {
        return this.shockwaves;
    }

    /**
     * Active boss magnetic-field emitters (one per aggro'd boss that has a field).
     * The player physics reads this each tick and applies the clamped attract/
     * repel force with its real velocity in hand.
     */
    getMagneticFieldSources(): BossFieldSource[] {
        const out: BossFieldSource[] = [];
        for (const e of this.entities.values()) {
            const kind = ENTITY_KINDS[e.kind];
            if (!kind?.magneticFieldRange || !e.aggro || e.aggroGrace > 0 || e.hp <= 0) continue;
            out.push({
                x: e.pos.x,
                y: e.pos.y + e.height * 0.5,
                z: e.pos.z,
                polarity: e.polarity,
                range: kind.magneticFieldRange,
                force: kind.magneticFieldForce ?? 30,
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
            shielded: (kind.shieldCrystals ?? 0) > 0,
            shieldCrystals: kind.shieldCrystals ?? 0,
            polarity: 1,
            polarityTimer: kind.polaritySwapInterval ?? 0,
            projectileTimer: kind.projectileInterval ?? 0,
            barrageTimer: kind.barrageDuration ?? 0,
            awaitingParry: false,
            slamState: 'none',
            slamTimer: kind.slamInterval ?? 0,
            slamPhaseTimer: 0,
            slamGroundY: y,
            aggroGrace: opts.aggroGraceSeconds ?? 0,
            home: new THREE.Vector3(x, y, z),
            shieldCrystalPositions: opts.shieldCrystalPositions,
            maxShieldCrystals: kind.shieldCrystals ?? 0,
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
            if (entity.shielded) {
                gameEvents.emit('boss:shield', { bossId: entity.bossId, entityId: entity.id, crystals: entity.shieldCrystals });
            }
        }
        return entity;
    }

    /**
     * A shield crystal in a sealed boss region was destroyed: drop the shield by one
     * on that region's boss; when the last crystal falls the boss becomes vulnerable.
     */
    onShieldCrystalBroken(regionId: string | null): void {
        for (const e of this.entities.values()) {
            if (!e.shielded || e.shieldCrystals <= 0) continue;
            if (regionId && e.regionId && e.regionId !== regionId) continue;
            e.shieldCrystals -= 1;
            if (e.bossId) gameEvents.emit('boss:shield', { bossId: e.bossId, entityId: e.id, crystals: e.shieldCrystals });
            if (e.shieldCrystals <= 0) {
                e.shielded = false;
                if (e.bossId) gameEvents.emit('boss:vulnerable', { bossId: e.bossId, entityId: e.id });
            }
            return; // one crystal → one shield point
        }
    }

    despawn(id: number): void {
        if (this.entities.delete(id)) this.notifyStructure();
    }

    clear(): void {
        const hadEntities = this.entities.size > 0;
        this.entities.clear();
        this.projectiles = [];
        this.shockwaves = [];
        if (this.inCombat) { this.inCombat = false; gameEvents.emit('combat:stop', {}); }
        gameEvents.emit('boss:cleared', {});
        if (hadEntities) this.notifyStructure();
    }

    /**
     * Apply damage to an entity (from a melee hit). knock is a horizontal dir.
     * Returns 'blocked' if a shield absorbed it (no damage, no knockback, no hurt
     * flash) so the caller can give distinct feedback, 'damaged' otherwise.
     */
    damageEntity(id: number, amount: number, knockX = 0, knockZ = 0): 'damaged' | 'blocked' | 'none' {
        const e = this.entities.get(id);
        if (!e || e.hp <= 0) return 'none';
        // Shielded bosses are fully invulnerable until every crystal is broken:
        // no damage, no knockback, no white hurt flash — only a shield shimmer.
        if (e.shielded) { e.shieldHitUntil = Date.now() + 160; return 'blocked'; }
        const hpBefore = e.hp;
        e.hp -= amount;

        // Phase gate: a hit that would push the boss PAST 50% or 25% is clamped to
        // land EXACTLY on that threshold, so the phase transition fires right at it
        // (not somewhere below). The next hit then carries it past.
        let phase = 0;
        if (e.isBoss && e.hp > 0) {
            const kind = ENTITY_KINDS[e.kind];
            const fb = hpBefore / e.maxHp;
            const gates: [number, number][] = [[kind?.slamThreshold ?? 0.5, 2], [kind?.frenzyThreshold ?? 0.25, 3]];
            for (const [thr, ph] of gates) {
                if (fb > thr && e.hp / e.maxHp <= thr) { e.hp = e.maxHp * thr; phase = ph; break; }
            }
        }

        e.hurtUntil = Date.now() + 180;
        e.aggro = true;
        const len = Math.hypot(knockX, knockZ) || 1;
        e.vel.x += (knockX / len) * 6;
        e.vel.z += (knockZ / len) * 6;
        e.vel.y += 3;
        e.knockbackSeconds = 0.2;

        if (e.isBoss && e.bossId) {
            gameEvents.emit('boss:damaged', { bossId: e.bossId, entityId: e.id, hp: Math.max(0, e.hp), maxHp: e.maxHp });
            // Phase transition (at the gated threshold): a polarity shock + camera
            // jolt so the escalation reads clearly, and the new phase begins.
            if (phase > 0) {
                const col = polarityFxColor(e.polarity);
                particleFx.burst({ x: e.pos.x, y: e.pos.y + e.height * 0.6, z: e.pos.z, color: col, color2: [1, 1, 1], count: 50, speed: 11, upBias: 5, spread: 1, size: 0.32, life: 1.1, gravity: 4, drag: 0.7 });
                addTrauma(0.6);
                gameEvents.emit('boss:phase', { bossId: e.bossId, entityId: e.id, phase });
            }
        }
        if (e.hp <= 0) this.kill(e);
        return 'damaged';
    }

    /**
     * Despawn every boss and clear the boss bar. Used when the player dies — the
     * fight ends, the boss leaves, and it can be re-summoned at the altar. Its
     * shield crystals are restored so the next attempt starts clean.
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

    // Remove a boss (NOT a defeat: no drops, no region cleanse) and clear any of
    // its still-standing shield crystals — the arena is empty until re-summoned.
    private despawnBoss(e: Entity): void {
        for (const c of e.shieldCrystalPositions ?? []) {
            if (worldManager.hasChunk(Math.floor(c.x / 16), Math.floor(c.z / 16))
                && worldManager.getBlock(c.x, c.y, c.z, false) === BlockType.MAGNETIC_SHIELD_CRYSTAL) {
                worldManager.setBlock(c.x, c.y, c.z, BlockType.AIR);
            }
        }
        this.entities.delete(e.id);
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
        if (e.isBoss && e.home) {
            // Loot drops one block ABOVE the altar (the summoner sits at home.y+3,
            // i.e. baseY+4; home is the spawn floor baseY+1), and only AFTER the
            // altar finishes re-forming (BOSS_DEFEAT_ALTAR_DELAY_MS later) so it
            // lands cleanly on top of the summoner instead of being buried.
            const hx = e.home.x, hy = e.home.y + 4, hz = e.home.z;
            window.setTimeout(() => spawnDrops(hx, hy, hz), BOSS_DEFEAT_ALTAR_DELAY_MS + 200);
            // A huge multi-stage polarity eruption where the Warden falls.
            const cx = e.home.x, cy = e.pos.y + e.height * 0.5, cz = e.home.z;
            const col = polarityFxColor(e.polarity);
            particleFx.burst({ x: cx, y: cy, z: cz, color: col, color2: [1, 1, 1], count: 80, speed: 13, upBias: 4, spread: 1, size: 0.34, life: 1.3, gravity: 7, drag: 0.8 });
            particleFx.burst({ x: cx, y: cy, z: cz, color: FX_CHARGED, color2: [1, 0.9, 1], count: 60, speed: 7, upBias: 6, spread: 1, size: 0.28, life: 1.6, gravity: 2, drag: 0.6 });
            addTrauma(1.0);
            // The fight is over — clear every bolt and shockwave so the dead Warden's
            // attacks can't keep hitting the player during the victory moment.
            this.projectiles = [];
            this.shockwaves = [];
        } else {
            spawnDrops(e.pos.x, e.pos.y + 0.3, e.pos.z);
        }
        this.entities.delete(e.id);
        gameEvents.emit('entity:died', { entityId: e.id, type: e.kind });
        if (e.isBoss && e.bossId) {
            gameEvents.emit('boss:defeated', { bossId: e.bossId, entityId: e.id, regionId: e.regionId });
        }
        this.notifyStructure();
    }

    /** Ray vs entity AABBs. Returns the nearest entity id within maxDist, or null. */
    raycastEntity(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number): { id: number; dist: number } | null {
        let best: { id: number; dist: number } | null = null;
        for (const e of this.entities.values()) {
            const hx = e.width / 2;
            const minX = e.pos.x - hx, maxX = e.pos.x + hx;
            const minY = e.pos.y, maxY = e.pos.y + e.height;
            const minZ = e.pos.z - hx, maxZ = e.pos.z + hx;
            const t = rayAabb(origin, dir, minX, minY, minZ, maxX, maxY, maxZ);
            if (t !== null && t <= maxDist && (!best || t < best.dist)) best = { id: e.id, dist: t };
        }
        return best;
    }

    tick(dt: number, gameMode: GameMode): void {
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

            // A boss whose fight the player has abandoned (wandered far from the
            // arena, or died) despawns — the bar clears and it can be re-summoned.
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

            // --- Slam attack overrides everything while the boss is airborne ---
            if (e.slamState !== 'none') {
                this.tickSlam(e, kind, dt, pp);
                if (e.aggro) anyAggro = true;
                continue;
            }

            // --- AI: notice and chase the player ---
            if (pp && targetable) {
                const dx = pp.x - e.pos.x;
                const dz = pp.z - e.pos.z;
                const distSq = dx * dx + dz * dz;
                if (distSq < kind.aggroRange * kind.aggroRange) e.aggro = true;
                else if (e.aggro && shouldForgetTarget(distSq, kind.aggroRange)) e.aggro = false;
                if (e.aggro && !preserveKnockback) {
                    // Steer toward the player, but if leashed and the player is
                    // beyond the leash, steer back toward home instead so the boss
                    // holds the arena (and lets its ranged field do the work).
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
                    // Always face the player even while repositioning.
                    e.yaw = Math.atan2(dx, dz);
                } else if (!e.aggro && !preserveKnockback) {
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
            const guard = e.grounded && !preserveKnockback;
            this.moveWithCollision(e, kind, dt, guard);
            this.applyLeash(e, kind);

            // --- Contact damage to player ---
            if (e.attackCooldown > 0) e.attackCooldown -= dt;
            if (targetable && pp && e.attackCooldown <= 0 && this.overlapsPlayer(e, pp)) {
                this.playerDamageHandler?.(kind.contactDamage, pp.x - e.pos.x, pp.z - e.pos.z);
                e.attackCooldown = kind.attackCooldown;
            }

            // --- Slam attack (phase 2+): periodic rise-and-slam shockwaves ---
            if (kind.slamThreshold && pp && targetable && e.aggro && !e.shielded
                && e.hp <= e.maxHp * kind.slamThreshold) {
                e.slamTimer -= dt;
                const frenzy = e.hp <= e.maxHp * (kind.frenzyThreshold ?? 0);
                // Only launch from the ground, so slamGroundY captures the real floor.
                if (e.slamTimer <= 0 && !e.awaitingParry && e.grounded) this.startSlam(e, kind, frenzy);
            }

            // --- Magnetic Warden boss mechanics (polarity swap, field, projectiles) ---
            // Only while actively engaged, so it stays silent and idle when the
            // player is dead or away (no phantom polarity-swap sounds).
            if (e.slamState === 'none' && kind.polaritySwapInterval && pp && targetable && e.aggro) {
                this.tickBossMechanics(e, kind, pp, dt);
            }
        }

        this.tickProjectiles(dt, pp, targetable);
        this.tickShockwaves(dt, pp, targetable);

        if (anyAggro && !this.inCombat) { this.inCombat = true; gameEvents.emit('combat:start', {}); }
        else if (!anyAggro && this.inCombat) { this.inCombat = false; gameEvents.emit('combat:stop', {}); }
    }

    // The Magnetic Warden's combat. Polarity keeps swapping throughout. While
    // SHIELDED it lays down a dodge barrage (you break the pillar crystals). Once
    // VULNERABLE it loops: a timed dodge barrage, then it stops and fires a single
    // deflectable purple "parry" bolt — hit that back to deal ~1/12 of its HP.
    // Below the frenzy threshold it speeds everything up but still gives parries.
    private tickBossMechanics(
        e: Entity, kind: EntityKind,
        pp: { x: number; y: number; z: number }, dt: number,
    ): void {
        const frenzy = !e.shielded && e.hp <= e.maxHp * (kind.frenzyThreshold ?? 0);

        // Polarity swaps run in every phase (telegraphed by a shockwave).
        if (kind.polaritySwapInterval) {
            e.polarityTimer -= dt;
            if (e.polarityTimer <= 0) {
                e.polarity *= -1;
                e.polarityTimer = kind.polaritySwapInterval * (frenzy ? 0.6 : 1);
                if (e.bossId) gameEvents.emit('boss:polarity', { bossId: e.bossId, entityId: e.id, polarity: e.polarity });
                if (e.aggro) this.emitPolarityShockwave(e, pp);
            }
        }

        if (!kind.projectileInterval) return;

        // Shielded: a steady dodge barrage while the player works the crystals.
        if (e.shielded) {
            e.projectileTimer -= dt;
            if (e.projectileTimer <= 0) {
                e.projectileTimer = kind.projectileInterval;
                this.fireVolley(e, kind, pp, false);
            }
            return;
        }

        // Vulnerable: while a parry bolt is live, hold ALL other fire so the
        // player can aim cleanly. Resume once it's deflected, hits, or expires.
        if (e.awaitingParry) {
            if (!this.projectiles.some((p) => p.deflectable && p.sourceId === e.id)) {
                e.awaitingParry = false;
                e.barrageTimer = (kind.barrageDuration ?? 5) * (frenzy ? 0.6 : 1);
            }
            return;
        }

        e.barrageTimer -= dt;
        if (e.barrageTimer > 0) {
            // Dodge barrage — faster and wider during the frenzy.
            e.projectileTimer -= dt;
            if (e.projectileTimer <= 0) {
                e.projectileTimer = kind.projectileInterval * (frenzy ? 0.5 : 1);
                this.fireVolley(e, kind, pp, frenzy);
            }
        } else {
            // Launch one deflectable purple bolt for the player to parry. The
            // existing barrage bolts are left in flight (they expire on their own
            // ttl or on contact) so the arena stays busy and dangerous.
            this.fireParryBolt(e, kind, pp);
            e.awaitingParry = true;
            if (e.bossId) gameEvents.emit('boss:parry', { bossId: e.bossId, entityId: e.id });
        }
    }

    // A slow, straight, purple bolt aimed at the player. Hitting it back (left
    // click within reach) turns it into a player-owned bolt that damages the boss.
    private fireParryBolt(e: Entity, kind: EntityKind, pp: { x: number; y: number; z: number }): void {
        const ox = e.pos.x, oy = e.pos.y + e.height * 0.7, oz = e.pos.z;
        const dx = pp.x - ox, dy = (pp.y + PLAYER_HEIGHT * 0.5) - oy, dz = pp.z - oz;
        const d = Math.hypot(dx, dy, dz) || 1;
        const speed = 9;
        this.projectiles.push({
            id: this.nextProjectileId++,
            pos: new THREE.Vector3(ox, oy, oz),
            vel: new THREE.Vector3((dx / d) * speed, (dy / d) * speed, (dz / d) * speed),
            ttl: 6,
            damage: kind.projectileDamage ?? 2,
            polarity: e.polarity,
            deflectable: true,
            owner: 'boss',
            sourceId: e.id,
        });
    }

    /**
     * Try to deflect a parry bolt the player is aiming at (left click). Reflects
     * the nearest deflectable boss bolt back toward its boss. Returns true on a
     * successful deflect.
     */
    deflectProjectile(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number): boolean {
        let best: Projectile | null = null;
        let bestDist = Infinity;
        for (const p of this.projectiles) {
            if (!p.deflectable || p.owner !== 'boss') continue;
            // Tight hit box: you must put the crosshair right on the bolt to parry
            // it, so deflecting takes real aim rather than a flailing click.
            const r = 0.42;
            const t = rayAabb(origin, dir,
                p.pos.x - r, p.pos.y - r, p.pos.z - r,
                p.pos.x + r, p.pos.y + r, p.pos.z + r);
            if (t !== null && t <= maxDist && t < bestDist) { best = p; bestDist = t; }
        }
        if (!best) return false;

        const boss = best.sourceId != null ? this.entities.get(best.sourceId) : undefined;
        // Ghast-fireball parry: the bolt flies straight back along the player's aim
        // direction — NOT homing on the boss. To land a hit you must be looking
        // through the boss at the moment you strike the bolt.
        const dl = Math.hypot(dir.x, dir.y, dir.z) || 1;
        const speed = 30;
        best.vel.set((dir.x / dl) * speed, (dir.y / dl) * speed, (dir.z / dl) * speed);
        best.owner = 'player';
        best.deflectable = false;
        best.ttl = 3.5;
        // A bright purple spark fan blasting out along the aim line.
        particleFx.burst({
            x: best.pos.x, y: best.pos.y, z: best.pos.z,
            color: FX_CHARGED, color2: [1, 1, 1],
            count: 26, speed: 9, upBias: 0.5, spread: 0.4,
            dir: [dir.x, dir.y, dir.z], size: 0.26, life: 0.6, gravity: 2, drag: 1.2,
        });
        addTrauma(0.25);
        if (boss?.bossId) gameEvents.emit('boss:deflected', { bossId: boss.bossId, entityId: boss.id });
        return true;
    }

    private emitPolarityShockwave(e: Entity, pp: { x: number; y: number; z: number }): void {
        if (!this.playerImpulseHandler) return;
        const dx = pp.x - e.pos.x, dz = pp.z - e.pos.z;
        const dist = Math.hypot(dx, dz) || 1;
        const SHOCK_RANGE = 26;
        if (dist > SHOCK_RANGE) return;
        const playerPol = inputState.magneticPolarity >= 0 ? 1 : -1;
        const sign = playerPol === e.polarity ? 1 : -1; // same repels, opposite attracts
        const mag = 6.5 * (1 - dist / SHOCK_RANGE);
        this.playerImpulseHandler((dx / dist) * sign * mag, 2.4, (dz / dist) * sign * mag);
    }

    private fireVolley(e: Entity, kind: EntityKind, pp: { x: number; y: number; z: number }, enraged = false): void {
        const ox = e.pos.x, oy = e.pos.y + e.height * 0.7, oz = e.pos.z;
        const dx = pp.x - ox, dy = (pp.y + PLAYER_HEIGHT * 0.5) - oy, dz = pp.z - oz;
        const d = Math.hypot(dx, dy, dz) || 1;
        const speed = enraged ? 23 : 18;
        // A dense 5-bolt fan, widening to 7 once enraged — heavy pressure on a
        // player exposed on a pillar.
        const spreads = enraged
            ? [-0.45, -0.3, -0.15, 0, 0.15, 0.3, 0.45]
            : [-0.3, -0.15, 0, 0.15, 0.3];
        for (const spread of spreads) {
            const ca = Math.cos(spread), sa = Math.sin(spread);
            this.projectiles.push({
                id: this.nextProjectileId++,
                pos: new THREE.Vector3(ox, oy, oz),
                vel: new THREE.Vector3(
                    (dx * ca - dz * sa) / d * speed,
                    dy / d * speed,
                    (dx * sa + dz * ca) / d * speed,
                ),
                ttl: 5,
                damage: kind.projectileDamage ?? 4,
                polarity: e.polarity,
                owner: 'boss',
            });
        }
    }

    private tickProjectiles(
        dt: number,
        pp: { x: number; y: number; z: number } | null,
        targetable: boolean,
    ): void {
        if (this.projectiles.length === 0) return;
        const survivors: Projectile[] = [];
        for (const p of this.projectiles) {
            p.ttl -= dt;
            p.pos.x += p.vel.x * dt;
            p.pos.y += p.vel.y * dt;
            p.pos.z += p.vel.z * dt;
            if (p.ttl <= 0) continue;
            // Only solid blocks stop a bolt — water landing pools and foliage don't.
            if (isSolid(worldManager, Math.floor(p.pos.x), Math.floor(p.pos.y), Math.floor(p.pos.z))) continue;

            if (p.owner === 'player') {
                // A deflected bolt: it now hits the boss for a chunk of its HP.
                if (this.hitBossWithDeflected(p)) continue;
            } else if (targetable && pp) {
                // Hit the whole player AABB (centre ± body), not just a low point.
                const cx = pp.x, cy = pp.y + PLAYER_HEIGHT * 0.5, cz = pp.z;
                const dx = p.pos.x - cx, dy = p.pos.y - cy, dz = p.pos.z - cz;
                if (Math.abs(dx) < 0.85 && Math.abs(dz) < 0.85 && Math.abs(dy) < 1.1) {
                    this.playerDamageHandler?.(p.damage, p.vel.x, p.vel.z);
                    continue;
                }
            }
            survivors.push(p);
        }
        this.projectiles = survivors;
    }

    /** A player-deflected bolt: damages the first boss it overlaps (~1/12 HP). */
    private hitBossWithDeflected(p: Projectile): boolean {
        for (const e of this.entities.values()) {
            if (!e.isBoss || e.hp <= 0) continue;
            const hx = e.width / 2;
            if (p.pos.x > e.pos.x - hx && p.pos.x < e.pos.x + hx &&
                p.pos.z > e.pos.z - hx && p.pos.z < e.pos.z + hx &&
                p.pos.y > e.pos.y && p.pos.y < e.pos.y + e.height) {
                const kind = ENTITY_KINDS[e.kind];
                const dmg = Math.max(1, Math.round(e.maxHp * (kind?.parryDamageFraction ?? 1 / 12)));
                this.damageEntity(e.id, dmg, p.vel.x, p.vel.z);
                // A burst of charged sparks where the bolt slams home on the boss.
                particleFx.burst({
                    x: p.pos.x, y: p.pos.y, z: p.pos.z,
                    color: FX_CHARGED, color2: [1, 1, 1],
                    count: 30, speed: 7, upBias: 2, spread: 1, size: 0.28, life: 0.7, gravity: 5, drag: 1,
                });
                return true;
            }
        }
        return false;
    }

    // --- Slam attack: charge (windup) → rise (tracks the player) → hang (locks +
    //     flashes) → drop → polarity shockwave. The rendered ground indicator (see
    //     EntityRenderer) follows the boss's x/z the whole time, showing where it
    //     will land, and flashes as the drop nears. ---
    private startSlam(e: Entity, kind: EntityKind, frenzy: boolean): void {
        e.slamState = 'charging';
        e.slamPhaseTimer = kind.slamChargeTime ?? 0.5;
        e.slamGroundY = e.pos.y;
        // Frenzy (≤25% HP) slams come much more often.
        e.slamTimer = (kind.slamInterval ?? 9) * (frenzy ? 0.45 : 1);
        e.vel.set(0, 0, 0);
        if (e.bossId) gameEvents.emit('boss:slam', { bossId: e.bossId, entityId: e.id, phase: 'rise', polarity: e.polarity });
    }

    /** Home the boss's x/z toward the player at a capped speed, clamped to its arena
     *  leash so a retreating player can't drag the slam (and its shockwave) out. */
    private slamTrack(e: Entity, pp: { x: number; z: number }, speed: number, dt: number): void {
        const tdx = pp.x - e.pos.x, tdz = pp.z - e.pos.z;
        const td = Math.hypot(tdx, tdz);
        if (td >= 0.001) {
            const step = Math.min(td, speed * dt);
            e.pos.x += (tdx / td) * step;
            e.pos.z += (tdz / td) * step;
        }
        const leash = ENTITY_KINDS[e.kind]?.leashRadius;
        if (e.home && leash) {
            const hx = e.pos.x - e.home.x, hz = e.pos.z - e.home.z;
            const hd = Math.hypot(hx, hz);
            if (hd > leash) { e.pos.x = e.home.x + (hx / hd) * leash; e.pos.z = e.home.z + (hz / hd) * leash; }
        }
    }

    private tickSlam(e: Entity, kind: EntityKind, dt: number, pp: { x: number; y: number; z: number } | null): void {
        const riseTime = kind.slamRiseTime ?? 0.85;
        const apex = e.slamGroundY + (kind.slamRiseHeight ?? 9);
        const track = kind.slamTrackSpeed ?? 12;
        const col = polarityFxColor(e.polarity);

        if (e.slamState === 'charging') {
            // Crouch + gather: energy streams UP into the boss off the ground — the
            // "he's about to launch" tell (effects, not UI).
            e.slamPhaseTimer -= dt;
            if (Math.random() < 0.6) {
                const a = Math.random() * Math.PI * 2, r = 0.8 + Math.random() * 1.6;
                particleFx.burst({
                    x: e.pos.x + Math.cos(a) * r, y: e.slamGroundY, z: e.pos.z + Math.sin(a) * r,
                    color: col, color2: [1, 1, 1], count: 2, speed: 1, upBias: 7, spread: 0.2,
                    dir: [0, 1, 0], size: 0.26, life: 0.5, gravity: -7, drag: 0.4,
                });
            }
            if (e.slamPhaseTimer <= 0) {
                e.slamState = 'rising';
                e.slamPhaseTimer = riseTime;
                addTrauma(0.4);
                // Launch dust blasted out along the ground as he rockets up.
                for (let i = 0; i < 12; i++) {
                    const a = (i / 12) * Math.PI * 2;
                    particleFx.burst({
                        x: e.pos.x + Math.cos(a) * 1.2, y: e.slamGroundY + 0.2, z: e.pos.z + Math.sin(a) * 1.2,
                        color: col, count: 3, speed: 7, upBias: 1, spread: 0.5,
                        dir: [Math.cos(a), 0.2, Math.sin(a)], size: 0.26, life: 0.6, gravity: 8, drag: 1.4,
                    });
                }
            }
            return;
        }

        if (e.slamState === 'rising') {
            e.pos.y += ((kind.slamRiseHeight ?? 9) / riseTime) * dt;
            if (pp) this.slamTrack(e, pp, track, dt); // home over the player on the way up
            e.slamPhaseTimer -= dt;
            if (e.slamPhaseTimer <= 0 || e.pos.y >= apex) {
                e.pos.y = apex;
                e.slamState = 'hanging';
                e.slamPhaseTimer = kind.slamHangTime ?? 0.45;
            }
        } else if (e.slamState === 'hanging') {
            // Track toward the player, then LOCK the target for the final ~0.4s (the
            // indicator stops moving and flashes). AFK players get caught, but you can
            // still sidestep the locked spot.
            if (pp && e.slamPhaseTimer > 0.4) this.slamTrack(e, pp, track * 0.9, dt);
            e.slamPhaseTimer -= dt;
            if (e.slamPhaseTimer <= 0) {
                // Frenzy FEINT: flip polarity the instant before slamming, so a player
                // who committed to the telegraphed colour gets caught. The ground
                // indicator (which reads e.polarity) flips with it.
                if (e.hp <= e.maxHp * (kind.frenzyThreshold ?? 0)) {
                    e.polarity = e.polarity > 0 ? -1 : 1;
                    if (e.bossId) gameEvents.emit('boss:polarity', { bossId: e.bossId, entityId: e.id, polarity: e.polarity });
                }
                e.slamState = 'dropping';
            }
        } else { // dropping
            e.pos.y -= (kind.slamDropSpeed ?? 38) * dt;
            if (e.pos.y <= e.slamGroundY) {
                e.pos.y = e.slamGroundY;
                e.slamState = 'none';
                e.grounded = true;
                this.spawnShockwave(e, kind);
                addTrauma(1.4); // a heavy ground-quake on the 50-block slam landing
                // A bright polarity-coloured ring of sparks blasting outward along
                // the ground from the point of impact.
                for (let i = 0; i < 16; i++) {
                    const a = (i / 16) * Math.PI * 2;
                    particleFx.burst({
                        x: e.pos.x + Math.cos(a) * 1.4, y: e.slamGroundY + 0.3, z: e.pos.z + Math.sin(a) * 1.4,
                        color: col, color2: [1, 1, 1],
                        count: 5, speed: 8, upBias: 1.5, spread: 0.5,
                        dir: [Math.cos(a), 0.25, Math.sin(a)], size: 0.3, life: 0.7, gravity: 9, drag: 1.4,
                    });
                }
                if (e.bossId) gameEvents.emit('boss:slam', { bossId: e.bossId, entityId: e.id, phase: 'impact', polarity: e.polarity });
            }
        }
    }

    private spawnShockwave(e: Entity, kind: EntityKind): void {
        this.shockwaves.push({
            id: this.nextShockwaveId++,
            x: e.pos.x,
            y: e.slamGroundY,
            z: e.pos.z,
            polarity: e.polarity,
            radius: 0,
            maxRadius: kind.slamMaxRadius ?? 26,
            speed: kind.slamRingSpeed ?? 15,
            damage: kind.slamDamage ?? 9,
            hit: false,
        });
    }

    // Expand each shockwave; when its leading edge reaches the player, a SAME
    // polarity launches + hurts them, OPPOSITE is safe (they ground against it).
    private tickShockwaves(
        dt: number,
        pp: { x: number; y: number; z: number } | null,
        targetable: boolean,
    ): void {
        if (this.shockwaves.length === 0) return;
        const survivors: Shockwave[] = [];
        for (const s of this.shockwaves) {
            s.radius += s.speed * dt;
            if (!s.hit && targetable && pp) {
                const dist = Math.hypot(pp.x - s.x, pp.z - s.z);
                // Resolve once the ring's edge sweeps over the player (and they're
                // near the floor — a player already airborne above it is skipped).
                if (s.radius >= dist && Math.abs(pp.y - s.y) < 3.5) {
                    s.hit = true;
                    const playerPol = inputState.magneticPolarity >= 0 ? 1 : -1;
                    if (playerPol === s.polarity) {
                        // Same polarity → launched up and outward, and hurt.
                        const d = dist || 1;
                        const ox = (pp.x - s.x) / d, oz = (pp.z - s.z) / d;
                        // A wrong-polarity slam launches you HARD up and away.
                        this.playerImpulseHandler?.(ox * 13, 19, oz * 13);
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
     * which already reads as a ledge — the explicit check guards flush lava too.
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
