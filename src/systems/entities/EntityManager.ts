import * as THREE from 'three';
import { worldManager } from '../WorldManager';
import { checkCollision, getSupportTop } from '../player/playerCollision';
import { PLAYER_WIDTH, PLAYER_HEIGHT } from '../player/playerConstants';
import { GRAVITY } from '../../constants';
import { gameEvents } from '../events/GameEvents';
import { ENTITY_KINDS, type Entity, type EntityKind } from './Entity';
import type { GameMode } from '../../types';
import {
    canTargetPlayer,
    shouldForgetTarget,
    shouldPreserveKnockback,
} from './entityBehavior';

export interface SpawnOptions {
    bossId?: string;
    regionId?: string;
}

const MAX_FALL_SPEED = 40;
const STEP_HEIGHT = 1.0;

/**
 * Owns all non-player entities. Ticked from the fixed-timestep GameLoop. Keeps
 * the simulation framework-agnostic; rendering subscribes to structural changes
 * and reads positions each frame.
 */
class EntityManager {
    private entities = new Map<number, Entity>();
    private nextId = 1;
    private inCombat = false;

    // Injected by App so entities can chase/damage the player without importing
    // React state.
    private playerPosProvider: (() => { x: number; y: number; z: number } | null) | null = null;
    private playerDamageHandler: ((amount: number, knockX: number, knockZ: number) => void) | null = null;

    // Structural-change subscribers (the renderer rebuilds its mesh list on these).
    private structureListeners = new Set<() => void>();

    setPlayerHooks(
        posProvider: () => { x: number; y: number; z: number } | null,
        damageHandler: (amount: number, knockX: number, knockZ: number) => void,
    ): void {
        this.playerPosProvider = posProvider;
        this.playerDamageHandler = damageHandler;
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
            attackCooldown: 0,
            knockbackSeconds: 0,
            yaw: 0,
            isBoss: !!kind.isBoss,
            bossId: opts.bossId ?? (kind.isBoss ? kind.id : undefined),
            regionId: opts.regionId,
        };
        this.entities.set(entity.id, entity);
        this.notifyStructure();
        if (entity.isBoss && entity.bossId) {
            gameEvents.emit('boss:spawned', {
                bossId: entity.bossId,
                entityId: entity.id,
                name: kind.id === 'cinder_warden' ? 'Cinder Warden' : kind.id,
                maxHp: entity.maxHp,
            });
        }
        return entity;
    }

    despawn(id: number): void {
        if (this.entities.delete(id)) this.notifyStructure();
    }

    clear(): void {
        const hadEntities = this.entities.size > 0;
        this.entities.clear();
        if (this.inCombat) { this.inCombat = false; gameEvents.emit('combat:stop', {}); }
        gameEvents.emit('boss:cleared', {});
        if (hadEntities) this.notifyStructure();
    }

    /** Apply damage to an entity (from a melee hit). knock is a horizontal dir. */
    damageEntity(id: number, amount: number, knockX = 0, knockZ = 0): void {
        const e = this.entities.get(id);
        if (!e || e.hp <= 0) return;
        e.hp -= amount;
        e.hurtUntil = Date.now() + 180;
        e.aggro = true;
        const len = Math.hypot(knockX, knockZ) || 1;
        e.vel.x += (knockX / len) * 6;
        e.vel.z += (knockZ / len) * 6;
        e.vel.y += 3;
        e.knockbackSeconds = 0.2;

        if (e.isBoss && e.bossId) {
            gameEvents.emit('boss:damaged', { bossId: e.bossId, entityId: e.id, hp: Math.max(0, e.hp), maxHp: e.maxHp });
        }
        if (e.hp <= 0) this.kill(e);
    }

    private kill(e: Entity): void {
        const kind = ENTITY_KINDS[e.kind];
        // Drops
        kind?.drops?.forEach((d) => {
            if (d.chance != null && Math.random() > d.chance) return;
            const count = d.min + Math.floor(Math.random() * (d.max - d.min + 1));
            for (let i = 0; i < count; i++) worldManager.spawnDrop(d.type, e.pos.x, e.pos.y + 0.3, e.pos.z);
        });
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

            e.knockbackSeconds = Math.max(0, e.knockbackSeconds - dt);
            const preserveKnockback = shouldPreserveKnockback(e.knockbackSeconds);

            // --- AI: notice and chase the player ---
            if (pp && targetable) {
                const dx = pp.x - e.pos.x;
                const dz = pp.z - e.pos.z;
                const distSq = dx * dx + dz * dz;
                if (distSq < kind.aggroRange * kind.aggroRange) e.aggro = true;
                else if (e.aggro && shouldForgetTarget(distSq, kind.aggroRange)) e.aggro = false;
                if (e.aggro && !preserveKnockback) {
                    const dist = Math.sqrt(distSq) || 1;
                    e.vel.x = (dx / dist) * kind.speed;
                    e.vel.z = (dz / dist) * kind.speed;
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

            this.moveWithCollision(e, kind, dt);

            // --- Contact damage to player ---
            if (e.attackCooldown > 0) e.attackCooldown -= dt;
            if (targetable && pp && e.attackCooldown <= 0 && this.overlapsPlayer(e, pp)) {
                this.playerDamageHandler?.(kind.contactDamage, pp.x - e.pos.x, pp.z - e.pos.z);
                e.attackCooldown = kind.attackCooldown;
            }
        }

        if (anyAggro && !this.inCombat) { this.inCombat = true; gameEvents.emit('combat:start', {}); }
        else if (!anyAggro && this.inCombat) { this.inCombat = false; gameEvents.emit('combat:stop', {}); }
    }

    private moveWithCollision(e: Entity, kind: EntityKind, dt: number): void {
        const p = e.pos;
        const w = e.width, h = e.height;

        // X axis
        const nx = { x: p.x + e.vel.x * dt, y: p.y, z: p.z };
        if (!checkCollision(worldManager, nx, w, h)) {
            p.x = nx.x;
        } else if (kind.canStep && e.grounded) {
            // try stepping up a single block
            const stepped = { x: nx.x, y: p.y + STEP_HEIGHT, z: p.z };
            if (!checkCollision(worldManager, stepped, w, h)) { p.x = nx.x; p.y += STEP_HEIGHT; }
            else e.vel.x = 0;
        } else {
            e.vel.x = 0;
        }

        // Z axis
        const nz = { x: p.x, y: p.y, z: p.z + e.vel.z * dt };
        if (!checkCollision(worldManager, nz, w, h)) {
            p.z = nz.z;
        } else if (kind.canStep && e.grounded) {
            const stepped = { x: p.x, y: p.y + STEP_HEIGHT, z: nz.z };
            if (!checkCollision(worldManager, stepped, w, h)) { p.z = nz.z; p.y += STEP_HEIGHT; }
            else e.vel.z = 0;
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
