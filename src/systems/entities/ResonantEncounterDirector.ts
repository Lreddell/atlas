import { BLOCKS } from '../../data/blocks';
import { BlockType } from '../../types';
import { VaultProjectileSystem } from '../combat/VaultProjectileSystem';
import { gameEvents } from '../events/GameEvents';
import { particleFx } from '../fx/particleFx';
import { soundManager } from '../sound/SoundManager';
import { addTrauma } from '../player/cameraShake';
import { progression } from '../progression/ProgressionStore';
import { worldManager } from '../WorldManager';
import {
    getVaultDoorwayRoomOpening,
    getVaultRoomBounds,
    type VaultLayout,
    type VaultRoom,
    type VaultRoomKind,
    type VaultRoutePoint,
} from '../world/resonantVaults';
import type { Entity } from './Entity';
import { entityManager } from './EntityManager';
import './resonantEntities';
import {
    MAX_LOADED_VAULT_ENEMIES,
    MAX_ROOM_ENEMIES,
    getBellTitanReinforcementWave,
    getRoomEncounterWaves,
    getVaultEnemyProfile,
    getVaultRecoveryAnchors,
    isVaultEnemyKind,
    type VaultEnemyActionProfile,
    type VaultEnemyActionId,
    type VaultEnemyKind,
    type VaultEnemyProfile,
} from './resonantVaultEnemies';
import { resolveEncounterWaveSpawnPoints } from './resonantEncounterSpawn';
import { bellTitanEncounter } from './BellTitanEncounter';
import { getCrossingPitDescriptor } from '../world/resonantVaultPuzzles';

export interface EchoBoltRenderState {
    id: number;
    x: number;
    y: number;
    z: number;
    vx: number;
    vy: number;
    vz: number;
    radius: number;
}

export interface VaultCombatTelegraphRenderState {
    id: string;
    shape: 'arc' | 'line' | 'lane' | 'ring' | 'disc';
    phase: 'warning' | 'active';
    x: number;
    y: number;
    z: number;
    yaw: number;
    range: number;
    width: number;
    arcRadians: number;
    progress: number;
}

interface ResonanceBacklash {
    id: number;
    vaultId: string;
    x: number;
    y: number;
    z: number;
    age: number;
    warningSeconds: number;
    activeSeconds: number;
    radius: number;
    damage: number;
    hit: boolean;
}

interface EncounterState {
    key: string;
    vaultId: string;
    room: VaultRoom;
    bounds: ReturnType<typeof getVaultRoomBounds>;
    waves: VaultEnemyKind[][];
    waveIndex: number;
    entityIds: Set<number>;
    recoveryAnchors: VaultRoutePoint[];
    entryAnchors: VaultRoutePoint[];
    gateCells: VaultRoutePoint[];
    started: boolean;
    completed: boolean;
    pendingWaveAt: number | null;
    pendingClearAt: number | null;
    reinforcementAdded: boolean;
    spawnAttempts: number;
}

interface EnemyFoleyState {
    x: number;
    z: number;
    grounded: boolean;
    distance: number;
    step: number;
}

type BoltListener = () => void;

const ENCOUNTER_WAVE_DELAY = 1.65;
const ENCOUNTER_CLEAR_DELAY = 0.65;
// A raised guard begins only when the player is close enough to read it.
const BLOCK_TRIGGER_RANGE_MULTIPLIER = 1.7;
// A wave whose spawn anchors stay unresolvable is retried at 0.5s intervals
// this many times (~8s) and then skipped, so one bad room can never hold the
// vault's single-active-encounter lock forever.
const MAX_WAVE_SPAWN_ATTEMPTS = 16;
const CHUNK_SIZE = 16;
const PLAYER_WIDTH = 0.7;
const PLAYER_HEIGHT = 1.8;

function rayAabbDistance(
    origin: VaultRoutePoint,
    direction: VaultRoutePoint,
    maxDistance: number,
    min: VaultRoutePoint,
    max: VaultRoutePoint,
): number | null {
    let near = 0;
    let far = maxDistance;
    for (const axis of ['x', 'y', 'z'] as const) {
        const velocity = direction[axis];
        if (Math.abs(velocity) < 1e-8) {
            if (origin[axis] < min[axis] || origin[axis] > max[axis]) return null;
            continue;
        }
        const first = (min[axis] - origin[axis]) / velocity;
        const second = (max[axis] - origin[axis]) / velocity;
        near = Math.max(near, Math.min(first, second));
        far = Math.min(far, Math.max(first, second));
        if (near > far) return null;
    }
    return near >= 0 && near <= maxDistance ? near : null;
}

function isCombatRoomKind(kind: VaultRoomKind): boolean {
    return getRoomEncounterWaves(kind, 0).length > 0;
}

class ResonantEncounterDirector {
    private encounters = new Map<string, EncounterState>();
    private entityEncounter = new Map<number, string>();
    private activeRoomByVault = new Map<string, string>();
    private attackTimers = new Map<number, number>();
    private actionCooldowns = new Map<string, number>();
    private lastEnemyActions = new Map<number, VaultEnemyActionId>();
    private tacticalRefreshAt = new Map<number, number>();
    private blockCooldowns = new Map<number, number>();
    private actionHits = new Set<number>();
    private enemyFoley = new Map<number, EnemyFoleyState>();
    private boltListeners = new Set<BoltListener>();
    private clock = 0;
    private currentPlayer: VaultRoutePoint | null = null;
    private pendingProjectileDamage = 0;
    private offDeath: (() => void) | null = null;
    private titanLayouts = new Map<string, VaultLayout>();
    private titanMinions = new Map<number, string>();
    private titanReinforced = new Set<string>();
    private resonanceBacklashes: ResonanceBacklash[] = [];
    private nextBacklashId = 1;
    private readonly enemyProjectiles = new VaultProjectileSystem({
        getBlock: (x, y, z) => worldManager.tryGetBlock(x, y, z),
        isBlockingBlock: (type) => type === null || (type !== BlockType.AIR
            && type !== BlockType.WATER
            && type !== BlockType.LAVA
            && BLOCKS[type as BlockType]?.noCollision !== true),
        raycastEntity: (origin, direction, maxDistance, projectile) => {
            const player = this.currentPlayer;
            if (!player || projectile.owner !== 'enemy') return null;
            const distance = rayAabbDistance(
                origin,
                direction,
                maxDistance,
                { x: player.x - PLAYER_WIDTH * 0.5, y: player.y, z: player.z - PLAYER_WIDTH * 0.5 },
                { x: player.x + PLAYER_WIDTH * 0.5, y: player.y + PLAYER_HEIGHT, z: player.z + PLAYER_WIDTH * 0.5 },
            );
            return distance === null ? null : { id: 0, distance };
        },
        damageEntity: (_id, damage, direction, stagger, owner) => {
            if (owner !== 'enemy') return;
            this.pendingProjectileDamage += damage;
            entityManager.impulsePlayer(direction.x * stagger * 3.5, Math.min(1.1, stagger), direction.z * stagger * 3.5);
            addTrauma(0.16);
        },
        onImpact: (position, kind) => particleFx.burst({
            x: position.x,
            y: position.y,
            z: position.z,
            color: kind === 'entity' ? [0.55, 0.49, 0.38] : [0.4, 0.39, 0.34],
            color2: [0.72, 0.65, 0.49],
            count: kind === 'entity' ? 8 : 5,
            speed: 2.2,
            upBias: 0.7,
            spread: 0.55,
            size: 0.08,
            life: 0.32,
            gravity: 4,
            drag: 1.8,
        }),
    });

    constructor() {
        this.ensureSubscribed();
        // Guard-bearing kinds own their damage path: a raised guard turns frontal
        // hits away (with readable feedback), a heavy stagger smashes through it,
        // and everything else falls through to standard damage.
        for (const kind of ['vault_guard', 'tollkeeper'] as const) {
            entityManager.registerDamageHandler(kind, (entityId, amount, knockX, knockZ, stagger) => (
                this.handleGuardedDamage(entityId, amount, knockX, knockZ, stagger)
            ));
        }
    }

    private handleGuardedDamage(
        entityId: number,
        amount: number,
        knockX: number,
        knockZ: number,
        stagger: number,
    ): 'damaged' | 'blocked' | 'none' {
        const entity = entityManager.getEntity(entityId);
        if (!entity) return 'none';
        const block = isVaultEnemyKind(entity.kind) ? getVaultEnemyProfile(entity.kind).block : undefined;
        if (!block || entity.combatAction?.id !== 'guard_block') {
            const result = entityManager.applyStandardDamage(entityId, amount, knockX, knockZ, stagger);
            // A clean light hit teaches the player that blind follow-up spam is
            // unsafe: surviving guards brace for the next blow, while flanking
            // and heavy stagger remain authored counters.
            if (result === 'damaged' && block && !entity.combatAction && entity.hp > 0) {
                this.attackTimers.set(entityId, Math.max(this.attackTimers.get(entityId) ?? 0, 0.9));
                this.blockCooldowns.set(entityId, this.clock);
            }
            return result;
        }
        // The knock direction points from the attacker toward the entity, so the
        // attacker sits opposite it. Only hits inside the frontal guard arc are
        // turned away; flanks and backs stay open.
        const length = Math.hypot(knockX, knockZ);
        const facingDot = length > 1e-6
            ? -(knockX / length) * Math.sin(entity.yaw) - (knockZ / length) * Math.cos(entity.yaw)
            : 1;
        if (facingDot < Math.cos(block.arcRadians * 0.5)) {
            return entityManager.applyStandardDamage(entityId, amount, knockX, knockZ, stagger);
        }
        if (stagger >= block.breakStagger) {
            // A heavy hit smashes the guard open: partial damage, a long stagger,
            // and the guard cannot come back up for a full cooldown.
            delete entity.combatAction;
            this.blockCooldowns.set(entityId, this.clock + block.cooldownSeconds);
            this.attackTimers.set(entityId, Math.max(this.attackTimers.get(entityId) ?? 0, 1.1));
            entity.knockbackSeconds = Math.max(entity.knockbackSeconds, 0.55);
            this.emitBlockFeedback(entity, true);
            return entityManager.applyStandardDamage(entityId, amount * 0.6, knockX, knockZ, stagger);
        }
        entity.shieldHitUntil = Date.now() + 180;
        this.emitBlockFeedback(entity, false);
        return 'blocked';
    }

    private emitBlockFeedback(entity: Entity, broken: boolean): void {
        const forwardX = Math.sin(entity.yaw);
        const forwardZ = Math.cos(entity.yaw);
        soundManager.playAt('block.amethyst.hit', {
            x: entity.pos.x + forwardX * 0.6,
            y: entity.pos.y + entity.height * 0.6,
            z: entity.pos.z + forwardZ * 0.6,
        }, { volume: broken ? 0.9 : 0.7, pitch: broken ? 0.7 : 1.45 });
        particleFx.burst({
            x: entity.pos.x + forwardX * 0.7,
            y: entity.pos.y + entity.height * 0.62,
            z: entity.pos.z + forwardZ * 0.7,
            color: broken ? [0.72, 0.6, 0.35] : [0.62, 0.68, 0.64],
            color2: [0.82, 0.78, 0.6],
            count: broken ? 22 : 10,
            speed: broken ? 4.5 : 2.6,
            upBias: 0.5,
            spread: 0.5,
            size: 0.07,
            life: 0.3,
            gravity: 3,
            drag: 2,
        });
    }

    private ensureSubscribed(): void {
        if (this.offDeath) return;
        this.offDeath = gameEvents.on('entity:died', ({ entityId }) => this.onEntityDied(entityId));
        gameEvents.on('vault:titan-shell-broken', ({ vaultId, stage }) => {
            this.spawnTitanReinforcements(vaultId, stage);
        });
        gameEvents.on('vault:titan-defeated', ({ vaultId }) => this.clearTitanMinions(vaultId));
    }

    getBolts(): readonly EchoBoltRenderState[] {
        return this.enemyProjectiles.getRenderState().map((bolt) => ({ ...bolt, radius: 0.18 }));
    }

    getCombatTelegraphs(): readonly VaultCombatTelegraphRenderState[] {
        const telegraphs: VaultCombatTelegraphRenderState[] = [];
        for (const entity of entityManager.getEntities()) {
            if (!isVaultEnemyKind(entity.kind) || !entity.combatAction
                || entity.combatAction.id === 'guard_block'
                || entity.combatAction.id === 'reform'
                || entity.combatAction.phase === 'recovery') continue;
            const action = getVaultEnemyProfile(entity.kind).actions
                .find((candidate) => candidate.id === entity.combatAction?.id);
            if (!action) continue;
            const phase = entity.combatAction.phase === 'anticipation' ? 'warning' : 'active';
            const progress = Math.max(0, Math.min(1,
                entity.combatAction.elapsed / Math.max(0.001, entity.combatAction.duration)));
            const shape = action.id === 'bell_toll' ? 'ring'
                : action.id === 'breaker_charge' ? 'lane'
                    : action.projectile ? 'line'
                        : 'arc';
            telegraphs.push({
                id: `enemy:${entity.id}:${action.id}`,
                shape,
                phase,
                x: entity.pos.x,
                y: entity.pos.y + 0.035,
                z: entity.pos.z,
                yaw: entity.combatAction.targetYaw ?? entity.yaw,
                range: shape === 'ring' && phase === 'active'
                    ? 2.2 + (action.range - 2.2) * progress
                    : action.range,
                width: action.id === 'breaker_charge' ? 2.5 : action.projectile ? 0.16 : 0,
                arcRadians: action.arcRadians,
                progress,
            });
        }
        for (const backlash of this.resonanceBacklashes) {
            const warning = backlash.age < backlash.warningSeconds;
            const progress = warning
                ? backlash.age / backlash.warningSeconds
                : (backlash.age - backlash.warningSeconds) / backlash.activeSeconds;
            telegraphs.push({
                id: `backlash:${backlash.id}`,
                shape: 'disc',
                phase: warning ? 'warning' : 'active',
                x: backlash.x,
                y: backlash.y + 0.035,
                z: backlash.z,
                yaw: 0,
                range: backlash.radius,
                width: 0,
                arcRadians: Math.PI * 2,
                progress: Math.max(0, Math.min(1, progress)),
            });
        }
        return telegraphs;
    }

    queueResonanceBacklash(
        vaultId: string,
        origin: VaultRoutePoint,
        radius = 4.2,
        damage = 5,
    ): void {
        const existing = this.resonanceBacklashes.find((backlash) => backlash.vaultId === vaultId
            && Math.hypot(backlash.x - origin.x, backlash.z - origin.z) < 0.5);
        if (existing) return;
        this.resonanceBacklashes.push({
            id: this.nextBacklashId++,
            vaultId,
            x: origin.x,
            y: origin.y,
            z: origin.z,
            age: 0,
            warningSeconds: 0.72,
            activeSeconds: 0.28,
            radius,
            damage,
            hit: false,
        });
    }

    isTelegraphing(entityId: number): boolean {
        return entityManager.getEntity(entityId)?.combatAction?.phase === 'anticipation';
    }

    subscribeBolts(listener: BoltListener): () => void {
        this.boltListeners.add(listener);
        return () => { this.boltListeners.delete(listener); };
    }

    private notifyBolts(): void {
        for (const listener of this.boltListeners) listener();
    }

    private tickResonanceBacklashes(dt: number, player: VaultRoutePoint): number {
        let damage = 0;
        for (const backlash of this.resonanceBacklashes) {
            const previousAge = backlash.age;
            backlash.age += dt;
            const active = backlash.age >= backlash.warningSeconds
                && backlash.age < backlash.warningSeconds + backlash.activeSeconds;
            if (previousAge < backlash.warningSeconds && backlash.age >= backlash.warningSeconds) {
                particleFx.burst({
                    x: backlash.x,
                    y: backlash.y + 0.12,
                    z: backlash.z,
                    color: [0.43, 0.29, 0.2],
                    color2: [0.72, 0.58, 0.34],
                    count: 22,
                    speed: 5.2,
                    upBias: 1.4,
                    spread: 1,
                    size: 0.12,
                    life: 0.55,
                    gravity: 2.8,
                    drag: 1.4,
                });
                addTrauma(0.2);
            }
            if (!active || backlash.hit) continue;
            const distance = Math.hypot(player.x - backlash.x, player.z - backlash.z);
            if (distance > backlash.radius || Math.abs(player.y - backlash.y) > 1.35) continue;
            if (!this.hasClearShot(
                { x: backlash.x, y: backlash.y + 0.9, z: backlash.z },
                { x: player.x, y: player.y + 0.9, z: player.z },
            )) continue;
            backlash.hit = true;
            damage += backlash.damage;
            const dx = player.x - backlash.x;
            const dz = player.z - backlash.z;
            const length = Math.hypot(dx, dz) || 1;
            entityManager.impulsePlayer(dx / length * 2.8, 0.65, dz / length * 2.8);
        }
        this.resonanceBacklashes = this.resonanceBacklashes.filter((backlash) => (
            backlash.age < backlash.warningSeconds + backlash.activeSeconds
        ));
        return damage;
    }

    isRoomReady(room: VaultRoom): boolean {
        const bounds = getVaultRoomBounds(room);
        const samples = [
            [bounds.minX, bounds.minZ],
            [bounds.maxX, bounds.minZ],
            [bounds.minX, bounds.maxZ],
            [bounds.maxX, bounds.maxZ],
            [room.x, room.z],
        ];
        return samples.every(([x, z]) => worldManager.hasChunk(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE)));
    }

    ensureRoomEncounter(vaultId: string, layout: VaultLayout, room: VaultRoom, seed: number): number[] {
        if (!isCombatRoomKind(room.kind) || !this.isRoomReady(room)) return [];
        if (progression.isVaultRoomSolved(vaultId, room.id)) return [];
        const activeKey = this.activeRoomByVault.get(vaultId);
        const key = `${vaultId}:${room.id}`;
        if (activeKey && activeKey !== key) return [];
        const existing = this.encounters.get(key);
        if (existing) return [...existing.entityIds];

        const waves = getRoomEncounterWaves(room.kind, seed ^ room.variant);
        if (waves.length === 0 || waves.some((wave) => wave.length > MAX_ROOM_ENEMIES)) return [];
        const bounds = getVaultRoomBounds(room);
        const recoveryAnchors = this.resolveRecoveryAnchors(room, bounds);
        // One standable anchor is enough to run a wave (spawn resolution falls
        // back across anchors). Demanding all four corners would leave a
        // cluttered room unsolvable, which blocks the hub seal for the whole vault.
        if (recoveryAnchors.length === 0) return [];
        const state: EncounterState = {
            key,
            vaultId,
            room,
            bounds,
            waves,
            waveIndex: 0,
            entityIds: new Set(),
            recoveryAnchors,
            entryAnchors: this.resolveEntryAnchors(layout, room),
            gateCells: [],
            started: false,
            completed: false,
            pendingWaveAt: this.clock,
            pendingClearAt: null,
            reinforcementAdded: false,
            spawnAttempts: 0,
        };
        state.gateCells = this.closeRoomGates(layout, room);
        this.encounters.set(key, state);
        this.activeRoomByVault.set(vaultId, key);
        this.spawnWave(state);
        return [...state.entityIds];
    }

    ensureCrossingFailureEncounter(vaultId: string, layout: VaultLayout, room: VaultRoom, seed: number): number[] {
        const pit = getCrossingPitDescriptor(room);
        const encounterRoom: VaultRoom = {
            ...room,
            kind: 'bell_crypt',
            y: pit.floorY,
            width: pit.bounds.maxX - pit.bounds.minX + 1,
            height: room.y - pit.floorY,
            depth: pit.bounds.maxZ - pit.bounds.minZ + 1,
        };
        return this.ensureRoomEncounter(vaultId, layout, encounterRoom, seed ^ 0x51a7);
    }

    queueGrandAscentReinforcement(vaultId: string, roomId: string): boolean {
        const state = this.encounters.get(`${vaultId}:${roomId}`);
        if (!state || state.completed || state.room.kind !== 'grand_ascent' || state.reinforcementAdded) return false;
        const reinforcement: VaultEnemyKind[] = ['vault_marksman', 'bell_hound'];
        if (reinforcement.length > MAX_ROOM_ENEMIES) return false;
        state.reinforcementAdded = true;
        state.waves.push(reinforcement);
        // If the authored waves just ended, convert the pending clear into the
        // escalation wave. Otherwise normal death progression reaches it once.
        if (state.entityIds.size === 0 && state.pendingClearAt !== null) {
            state.pendingClearAt = null;
            state.waveIndex += 1;
            state.pendingWaveAt = this.clock + ENCOUNTER_WAVE_DELAY;
        }
        return true;
    }

    ensureTitan(vaultId: string, layout: VaultLayout): number | null {
        this.titanLayouts.set(vaultId, layout);
        return bellTitanEncounter.ensure(vaultId, layout);
    }

    private spawnTitanReinforcements(vaultId: string, stage: 1 | 2): void {
        const reinforcementKey = `${vaultId}:${stage}`;
        if (this.titanReinforced.has(reinforcementKey)) return;
        const layout = this.titanLayouts.get(vaultId);
        const arena = layout?.rooms.find((room) => room.kind === 'arena');
        if (!layout || !arena) return;
        const bounds = getVaultRoomBounds(arena);
        const anchors = this.resolveRecoveryAnchors(arena, bounds);
        const wave = getBellTitanReinforcementWave(stage);
        const points = resolveEncounterWaveSpawnPoints(
            wave,
            [],
            anchors,
            stage - 1,
            (kind, anchor) => entityManager.resolveNavigationAnchor(kind, anchor),
        );
        const spawned: number[] = [];
        wave.forEach((kind, index) => {
            const point = points[index];
            if (!point) return;
            const entity = entityManager.spawn(kind, point.x + 0.5, point.y, point.z + 0.5, {
                regionId: vaultId,
                aggroGraceSeconds: 0.45 + index * 0.1,
            });
            if (!entity) return;
            entity.aggro = true;
            entity.encounterBounds = bounds;
            entity.recoveryAnchors = anchors.map((anchor) => ({ ...anchor }));
            entity.encounterRoomId = arena.id;
            this.titanMinions.set(entity.id, vaultId);
            this.attackTimers.set(entity.id, 0.55 + index * 0.18);
            spawned.push(entity.id);
        });
        if (spawned.length === 0) return;
        this.titanReinforced.add(reinforcementKey);
        gameEvents.emit('vault:encounter-progress', {
            vaultId,
            roomId: arena.id,
            roomKind: arena.kind,
            wave: stage + 1,
            totalWaves: 3,
            remaining: spawned.length,
        });
    }

    tick(dt: number, player: VaultRoutePoint): number {
        const step = Math.max(0, Math.min(0.1, dt));
        this.clock += step;
        this.currentPlayer = player;
        this.pendingProjectileDamage = 0;
        this.enemyProjectiles.tick(step);
        let damage = this.pendingProjectileDamage + this.tickResonanceBacklashes(step, player);

        for (const state of [...this.encounters.values()]) {
            if (state.completed) continue;
            this.reapMissingEntities(state);
            if (state.pendingWaveAt !== null && this.clock >= state.pendingWaveAt) this.spawnWave(state);
            if (state.pendingClearAt !== null && this.clock >= state.pendingClearAt) {
                this.completeEncounter(state);
                continue;
            }
            for (const entityId of state.entityIds) {
                const entity = entityManager.getEntity(entityId);
                if (!entity || entity.hp <= 0) continue;
                entity.aggro = true;
                this.tickEnemyFoley(entity, state.vaultId);
                damage += this.tickEnemyAction(entity, player, step);
            }
        }

        for (const [entityId] of [...this.titanMinions]) {
            const entity = entityManager.getEntity(entityId);
            if (!entity || entity.hp <= 0) continue;
            entity.aggro = true;
            this.tickEnemyFoley(entity, entity.regionId ?? 'resonant');
            damage += this.tickEnemyAction(entity, player, step);
        }

        this.currentPlayer = null;
        return damage + bellTitanEncounter.tick(step, player);
    }

    private resolveRecoveryAnchors(
        room: VaultRoom,
        bounds: ReturnType<typeof getVaultRoomBounds>,
    ): VaultRoutePoint[] {
        const raw = getVaultRecoveryAnchors(bounds, room.y + 1, room.variant);
        const resolved: VaultRoutePoint[] = [];
        const offsets = [
            [0, 0], [1, 0], [-1, 0], [0, 1], [0, -1],
            [1, 1], [-1, 1], [1, -1], [-1, -1], [2, 0], [-2, 0], [0, 2], [0, -2],
        ];
        // Prefer cells that fit the widest kind (tollkeeper), but keep anchors a
        // smaller kind can stand on: every consumer re-resolves per kind at use
        // time, and discarding guard-sized corners can leave a room without any
        // anchors at all.
        for (const kind of ['tollkeeper', 'vault_guard'] as const) {
            for (const anchor of raw) {
                for (const [dx, dz] of offsets) {
                    const point = entityManager.resolveNavigationAnchor(kind, {
                        x: anchor.x + dx,
                        y: anchor.y,
                        z: anchor.z + dz,
                    });
                    if (!point || resolved.some((other) => other.x === point.x && other.y === point.y && other.z === point.z)) continue;
                    resolved.push(point);
                    break;
                }
            }
            if (resolved.length >= 4) break;
        }
        return resolved;
    }

    private resolveEntryAnchors(layout: VaultLayout, room: VaultRoom): VaultRoutePoint[] {
        return layout.doorways
            .filter((doorway) => doorway.from === room.id || doorway.to === room.id)
            .map((doorway) => doorway.roomOverlap[doorway.from === room.id ? 0 : 1])
            .map((anchor) => entityManager.resolveNavigationAnchor('bell_hound', { ...anchor, y: room.y + 1 }))
            .filter((anchor): anchor is VaultRoutePoint => anchor !== null);
    }

    private spawnWave(state: EncounterState): void {
        if (state.completed || state.entityIds.size > 0) return;
        const wave = state.waves[state.waveIndex];
        if (!wave) return;
        const liveCount = entityManager.getEntities().filter((entity) => entity.hp > 0 && isVaultEnemyKind(entity.kind)).length;
        if (liveCount + wave.length > MAX_LOADED_VAULT_ENEMIES) {
            state.pendingWaveAt = this.clock + 0.5;
            return;
        }

        const points = resolveEncounterWaveSpawnPoints(
            wave,
            state.waveIndex > 0 ? state.entryAnchors : [],
            state.recoveryAnchors,
            state.waveIndex,
            (kind, anchor) => entityManager.resolveNavigationAnchor(kind, anchor),
        );
        // Spawn every enemy that found a standable cell. An enemy without one is
        // dropped from the wave rather than blocking it - the room stays winnable.
        const spawned: number[] = [];
        wave.forEach((kind, index) => {
            const point = points[index];
            if (!point) return;
            const entity = entityManager.spawn(kind, point.x + 0.5, point.y, point.z + 0.5, {
                regionId: state.vaultId,
                aggroGraceSeconds: 0.5 + index * 0.08,
            });
            if (!entity) return;
            entity.aggro = true;
            entity.encounterBounds = state.bounds;
            entity.recoveryAnchors = state.recoveryAnchors.map((value) => ({ ...value }));
            entity.encounterRoomId = state.room.id;
            state.entityIds.add(entity.id);
            this.entityEncounter.set(entity.id, state.key);
            this.attackTimers.set(entity.id, 0.7 + index * 0.18);
            spawned.push(entity.id);
        });
        if (spawned.length === 0) {
            // Nothing standable right now (chunks streaming, player built over the
            // anchors). Retry briefly, then skip the wave entirely - never hold the
            // vault's one-active-room lock on a wave that cannot materialize.
            state.spawnAttempts += 1;
            if (state.spawnAttempts < MAX_WAVE_SPAWN_ATTEMPTS) {
                state.pendingWaveAt = this.clock + 0.5;
            } else {
                state.spawnAttempts = 0;
                this.advanceWave(state);
            }
            return;
        }

        state.spawnAttempts = 0;
        state.pendingWaveAt = null;
        if (!state.started) {
            state.started = true;
            gameEvents.emit('vault:encounter-started', {
                vaultId: state.vaultId,
                room: 'combat',
                roomId: state.room.id,
                roomKind: state.room.kind,
                wave: state.waveIndex + 1,
                totalWaves: state.waves.length,
                entityIds: spawned,
            });
        } else {
            gameEvents.emit('vault:encounter-progress', {
                vaultId: state.vaultId,
                roomId: state.room.id,
                roomKind: state.room.kind,
                wave: state.waveIndex + 1,
                totalWaves: state.waves.length,
                remaining: spawned.length,
            });
        }
    }

    private actionCooldownKey(entityId: number, actionId: VaultEnemyActionId): string {
        return `${entityId}:${actionId}`;
    }

    private getCurrentActionProfile(entity: Entity, profile: VaultEnemyProfile): VaultEnemyActionProfile | null {
        const id = entity.combatAction?.id;
        return profile.actions.find((candidate) => candidate.id === id) ?? null;
    }

    private getCombatPeers(entity: Entity): Entity[] {
        return entityManager.getEntities().filter((candidate) => candidate.id !== entity.id
            && candidate.hp > 0
            && candidate.regionId === entity.regionId
            && candidate.encounterRoomId === entity.encounterRoomId
            && isVaultEnemyKind(candidate.kind));
    }

    private canBeginEnemyAction(entity: Entity, action: VaultEnemyActionProfile): boolean {
        const active = this.getCombatPeers(entity)
            .map((peer) => peer.combatAction && peer.combatAction.phase !== 'recovery' && isVaultEnemyKind(peer.kind)
                ? getVaultEnemyProfile(peer.kind).actions.find((candidate) => candidate.id === peer.combatAction?.id)
                : null)
            .filter((candidate): candidate is VaultEnemyActionProfile => !!candidate);
        const sameClass = active.filter((candidate) => candidate.attackClass === action.attackClass).length;
        if (action.attackClass === 'control') return sameClass < 1;
        if (action.attackClass === 'ranged') return sameClass < 2;
        return sameClass < 2;
    }

    private selectEnemyAction(
        entity: Entity,
        player: VaultRoutePoint,
        profile: VaultEnemyProfile,
        distance: number,
    ): VaultEnemyActionProfile | null {
        const origin = { x: entity.pos.x, y: entity.pos.y + entity.height * 0.72, z: entity.pos.z };
        const target = { x: player.x, y: player.y + 1.15, z: player.z };
        const last = this.lastEnemyActions.get(entity.id);
        const candidates = profile.actions.filter((action) => distance >= action.minRange
            && distance <= action.range
            && (this.actionCooldowns.get(this.actionCooldownKey(entity.id, action.id)) ?? 0) <= this.clock
            && (!action.projectile || this.hasClearShot(origin, target))
            && this.canBeginEnemyAction(entity, action));
        if (candidates.length === 0) return null;
        const pool = candidates.length > 1 ? candidates.filter((action) => action.id !== last) : candidates;
        const scored = (pool.length > 0 ? pool : candidates).map((action, index) => {
            const ideal = action.minRange + (action.range - action.minRange)
                * (action.attackClass === 'ranged' ? 0.62 : action.attackClass === 'control' ? 0.55 : 0.42);
            const spacingScore = -Math.abs(distance - ideal);
            const cadence = ((entity.id * 17 + action.id.length * 13 + Math.floor(this.clock * 2) + index * 5) % 19) / 19;
            const phasePressure = action.attackClass === 'control' && this.getCombatPeers(entity).length >= 3 ? 0.8 : 0;
            return { action, score: spacingScore + cadence + phasePressure };
        });
        scored.sort((left, right) => right.score - left.score || left.action.id.localeCompare(right.action.id));
        return scored[0]?.action ?? null;
    }

    private updateTacticalMovement(entity: Entity, player: VaultRoutePoint, profile: VaultEnemyProfile): void {
        if ((this.tacticalRefreshAt.get(entity.id) ?? 0) > this.clock) return;
        this.tacticalRefreshAt.set(entity.id, this.clock + 0.7 + (entity.id % 5) * 0.08);
        if (profile.role === 'ranged') {
            this.relocateMarksman(entity, player);
            return;
        }
        if (profile.role !== 'flanker' || !entity.encounterBounds) return;
        const dx = player.x - entity.pos.x;
        const dz = player.z - entity.pos.z;
        const length = Math.hypot(dx, dz) || 1;
        const side = (entity.id & 1) === 0 ? 1 : -1;
        const target = {
            x: Math.max(entity.encounterBounds.minX + 2, Math.min(entity.encounterBounds.maxX - 2,
                player.x - dz / length * side * 3.4 - dx / length)),
            y: player.y,
            z: Math.max(entity.encounterBounds.minZ + 2, Math.min(entity.encounterBounds.maxZ - 2,
                player.z + dx / length * side * 3.4 - dz / length)),
        };
        const resolved = entityManager.resolveNavigationAnchor(entity.kind, target);
        if (resolved) entityManager.setNavigationOverride(entity.id, resolved);
    }

    private tickEnemyAction(entity: Entity, player: VaultRoutePoint, dt: number): number {
        if (!isVaultEnemyKind(entity.kind)) return 0;
        if (entity.combatAction?.id === 'reform') {
            entity.combatAction.elapsed += dt;
            if (entity.combatAction.elapsed >= entity.combatAction.duration) {
                delete entity.combatAction;
                delete entity.reformingUntil;
            }
            return 0;
        }
        if (entity.combatAction?.id === 'guard_block') {
            entity.combatAction.elapsed += dt;
            entity.yaw = Math.atan2(player.x - entity.pos.x, player.z - entity.pos.z);
            entity.combatAction.targetYaw = entity.yaw;
            if (entity.combatAction.elapsed >= entity.combatAction.duration) {
                const block = getVaultEnemyProfile(entity.kind).block;
                delete entity.combatAction;
                this.blockCooldowns.set(entity.id, this.clock + (block?.cooldownSeconds ?? 3.5));
                gameEvents.emit('vault:enemy-action', {
                    vaultId: entity.regionId ?? '', entityId: entity.id, kind: entity.kind,
                    action: 'guard_block', phase: 'recovery',
                    x: entity.pos.x, y: entity.pos.y, z: entity.pos.z,
                });
            }
            return 0;
        }

        const profile = getVaultEnemyProfile(entity.kind);
        if (!entity.combatAction) {
            const timer = Math.max(0, (this.attackTimers.get(entity.id) ?? 0) - dt);
            this.attackTimers.set(entity.id, timer);
            const dx = player.x - entity.pos.x;
            const dz = player.z - entity.pos.z;
            const distance = Math.hypot(dx, dz);
            const meleeReach = Math.max(...profile.actions.filter((action) => !action.projectile).map((action) => action.range), 1);
            if (profile.block && timer > 0.35
                && distance <= meleeReach * BLOCK_TRIGGER_RANGE_MULTIPLIER
                && (this.blockCooldowns.get(entity.id) ?? 0) <= this.clock) {
                const targetYaw = Math.atan2(dx, dz);
                entity.yaw = targetYaw;
                entity.combatAction = {
                    id: 'guard_block', phase: 'active', elapsed: 0,
                    duration: profile.block.durationSeconds, locksMovement: true, targetYaw,
                };
                gameEvents.emit('vault:enemy-action', {
                    vaultId: entity.regionId ?? '', entityId: entity.id, kind: entity.kind,
                    action: 'guard_block', phase: 'active',
                    x: entity.pos.x, y: entity.pos.y, z: entity.pos.z,
                });
                return 0;
            }
            if (timer > 0) {
                this.updateTacticalMovement(entity, player, profile);
                return 0;
            }
            const action = this.selectEnemyAction(entity, player, profile, distance);
            if (!action) {
                this.updateTacticalMovement(entity, player, profile);
                return 0;
            }
            const targetYaw = Math.atan2(dx, dz);
            entity.yaw = targetYaw;
            entity.combatAction = {
                id: action.id, phase: 'anticipation', elapsed: 0,
                duration: action.anticipation, locksMovement: action.locksMovement, targetYaw,
            };
            this.actionCooldowns.set(this.actionCooldownKey(entity.id, action.id), this.clock + action.cooldownSeconds);
            this.lastEnemyActions.set(entity.id, action.id);
            this.emitEnemyAction(entity, action, 'anticipation');
            this.actionHits.delete(entity.id);
            return 0;
        }

        const action = this.getCurrentActionProfile(entity, profile);
        if (!action) {
            delete entity.combatAction;
            return 0;
        }
        let damage = 0;
        entity.combatAction.elapsed += dt;
        while (entity.combatAction && entity.combatAction.elapsed >= entity.combatAction.duration) {
            const overflow = entity.combatAction.elapsed - entity.combatAction.duration;
            if (entity.combatAction.phase === 'anticipation') {
                entity.combatAction.phase = 'active';
                entity.combatAction.elapsed = overflow;
                entity.combatAction.duration = action.active;
                this.emitEnemyAction(entity, action, 'active');
                damage += this.beginActiveAction(entity, player, action);
            } else if (entity.combatAction.phase === 'active') {
                entity.combatAction.phase = 'recovery';
                entity.combatAction.elapsed = overflow;
                entity.combatAction.duration = action.recovery;
                this.emitEnemyAction(entity, action, 'recovery');
            } else {
                delete entity.combatAction;
                this.actionHits.delete(entity.id);
                this.attackTimers.set(entity.id, action.attackClass === 'ranged' ? 0.38 : 0.24);
            }
        }
        if (entity.combatAction?.phase !== 'active' || this.actionHits.has(entity.id)) return damage;
        const dx = player.x - entity.pos.x;
        const dz = player.z - entity.pos.z;
        const distance = Math.hypot(dx, dz);
        const verticalDistance = Math.abs(player.y - entity.pos.y);
        if (((action.id === 'hound_leap' && distance <= 1.6 && verticalDistance <= 1.5)
            || (action.id === 'breaker_charge' && distance <= 1.9 && verticalDistance <= 1.75))
            && this.hasAttackLineOfSight(entity, player)) {
            this.actionHits.add(entity.id);
            const length = distance || 1;
            entityManager.impulsePlayer(dx / length * action.stagger * 5.5, action.stagger * 1.2, dz / length * action.stagger * 5.5);
            addTrauma(action.id === 'breaker_charge' ? 0.34 : 0.2);
            damage += action.damage;
        } else if (action.id === 'bell_toll') {
            const progress = entity.combatAction.elapsed / Math.max(0.001, entity.combatAction.duration);
            const ringRadius = 2.2 + (action.range - 2.2) * progress;
            if (Math.abs(distance - ringRadius) <= 0.95 && Math.abs(player.y - entity.pos.y) <= 0.82
                && this.hasAttackLineOfSight(entity, player)) {
                this.actionHits.add(entity.id);
                const length = distance || 1;
                entityManager.impulsePlayer(dx / length * action.stagger * 4.5, 0.55, dz / length * action.stagger * 4.5);
                addTrauma(0.24);
                damage += action.damage;
            }
        }
        return damage;
    }

    private emitEnemyAction(
        entity: Entity,
        action: VaultEnemyActionProfile,
        phase: 'anticipation' | 'active' | 'recovery',
    ): void {
        if (!isVaultEnemyKind(entity.kind)) return;
        gameEvents.emit('vault:enemy-action', {
            vaultId: entity.regionId ?? '',
            entityId: entity.id,
            kind: entity.kind,
            action: action.id,
            phase,
            x: entity.pos.x,
            y: entity.pos.y,
            z: entity.pos.z,
        });
    }

    private tickEnemyFoley(entity: Entity, vaultId: string): void {
        if (!isVaultEnemyKind(entity.kind)) return;
        const previous = this.enemyFoley.get(entity.id);
        if (!previous) {
            this.enemyFoley.set(entity.id, {
                x: entity.pos.x,
                z: entity.pos.z,
                grounded: entity.grounded,
                distance: 0,
                step: 0,
            });
            return;
        }
        const moved = Math.hypot(entity.pos.x - previous.x, entity.pos.z - previous.z);
        previous.x = entity.pos.x;
        previous.z = entity.pos.z;
        if (moved < 1.5 && entity.grounded) previous.distance += moved;
        else if (moved >= 1.5) previous.distance = 0;

        if (!previous.grounded && entity.grounded && entity.kind === 'bell_hound') {
            gameEvents.emit('vault:enemy-landed', {
                vaultId,
                entityId: entity.id,
                kind: entity.kind,
                x: entity.pos.x,
                y: entity.pos.y,
                z: entity.pos.z,
            });
            particleFx.burst({
                x: entity.pos.x,
                y: entity.pos.y + 0.08,
                z: entity.pos.z,
                color: [0.3, 0.29, 0.26],
                color2: [0.48, 0.43, 0.34],
                count: 12,
                speed: 2.4,
                upBias: 0.6,
                spread: 0.9,
                size: 0.09,
                life: 0.38,
                gravity: 4.5,
                drag: 1.8,
            });
        }
        previous.grounded = entity.grounded;

        const stride = entity.kind === 'tollkeeper' ? 1.18
            : entity.kind === 'bell_hound' ? 0.68
                : entity.kind === 'vault_marksman' ? 0.78
                    : 0.9;
        if (previous.distance < stride || entity.kind === 'bell_hound') return;
        previous.distance %= stride;
        previous.step += 1;
        gameEvents.emit('vault:enemy-footstep', {
            vaultId,
            entityId: entity.id,
            kind: entity.kind,
            step: previous.step,
            x: entity.pos.x,
            y: entity.pos.y,
            z: entity.pos.z,
        });
    }

    private beginActiveAction(entity: Entity, player: VaultRoutePoint, action: VaultEnemyActionProfile): number {
        if (action.projectile) {
            const origin = { x: entity.pos.x, y: entity.pos.y + entity.height * 0.72, z: entity.pos.z };
            const target = { x: player.x, y: player.y + 1.15, z: player.z };
            const dx = target.x - origin.x;
            const dy = target.y - origin.y;
            const dz = target.z - origin.z;
            const burst = Math.max(1, action.projectile.burst ?? 1);
            const spread = action.projectile.spreadRadians ?? 0;
            for (let index = 0; index < burst; index += 1) {
                const offset = (index - (burst - 1) * 0.5) * spread;
                const cos = Math.cos(offset);
                const sin = Math.sin(offset);
                this.enemyProjectiles.fire(origin, {
                    x: dx * cos - dz * sin,
                    y: dy,
                    z: dx * sin + dz * cos,
                }, action.damage, {
                    owner: 'enemy',
                    sourceId: entity.id,
                    speed: action.projectile.speed,
                    gravity: action.projectile.gravity,
                    maxDistance: action.projectile.maxDistance,
                    stagger: action.stagger,
                });
            }
            this.notifyBolts();
            particleFx.burst({
                ...origin,
                color: [0.5, 0.42, 0.27],
                color2: [0.72, 0.61, 0.38],
                count: 6,
                speed: 1.8,
                upBias: 0.2,
                spread: 0.35,
                size: 0.055,
                life: 0.22,
                gravity: 2,
                drag: 2.4,
            });
            return 0;
        }
        if (action.id === 'hound_leap') {
            // The crouch locks the pounce direction. The model and floor cue now
            // promise the same line the hound actually travels, so a sidestep is
            // reliable counterplay instead of a last-frame tracking check.
            const yaw = entity.combatAction?.targetYaw ?? entity.yaw;
            entity.vel.x = Math.sin(yaw) * 7.8;
            entity.vel.z = Math.cos(yaw) * 7.8;
            if (entity.grounded) entity.vel.y = Math.max(entity.vel.y, 5.4);
            entity.knockbackSeconds = Math.max(entity.knockbackSeconds, action.active);
            particleFx.burst({
                x: entity.pos.x,
                y: entity.pos.y + 0.08,
                z: entity.pos.z,
                color: [0.28, 0.27, 0.24],
                color2: [0.44, 0.4, 0.32],
                count: 8,
                speed: 2.2,
                upBias: 0.45,
                spread: 0.8,
                size: 0.075,
                life: 0.3,
                gravity: 4.5,
                drag: 2,
            });
            return 0;
        }
        if (action.id === 'breaker_charge') {
            const yaw = entity.combatAction?.targetYaw ?? entity.yaw;
            entity.vel.x = Math.sin(yaw) * 10.5;
            entity.vel.z = Math.cos(yaw) * 10.5;
            entity.knockbackSeconds = Math.max(entity.knockbackSeconds, action.active);
            particleFx.burst({
                x: entity.pos.x,
                y: entity.pos.y + 0.12,
                z: entity.pos.z,
                color: [0.31, 0.29, 0.25],
                color2: [0.62, 0.5, 0.31],
                count: 18,
                speed: 4.8,
                upBias: 0.7,
                spread: 0.9,
                size: 0.1,
                life: 0.45,
                gravity: 4.5,
                drag: 1.5,
            });
            return 0;
        }
        if (action.id === 'bell_toll') {
            particleFx.burst({
                x: entity.pos.x,
                y: entity.pos.y + entity.height * 0.62,
                z: entity.pos.z,
                color: [0.55, 0.46, 0.29],
                color2: [0.76, 0.68, 0.46],
                count: 28,
                speed: 6.2,
                upBias: 0.4,
                spread: 1,
                size: 0.12,
                life: 0.72,
                gravity: 0.7,
                drag: 1.1,
            });
            addTrauma(0.26);
            return 0;
        }
        if (action.id === 'hammer_strike') {
            particleFx.burst({
                x: entity.pos.x + Math.sin(entity.yaw) * Math.min(1.45, action.range * 0.62),
                y: entity.pos.y + 0.12,
                z: entity.pos.z + Math.cos(entity.yaw) * Math.min(1.45, action.range * 0.62),
                color: [0.31, 0.29, 0.25],
                color2: [0.55, 0.49, 0.38],
                count: 20,
                speed: 4.2,
                upBias: 1.1,
                spread: 1,
                size: 0.12,
                life: 0.58,
                gravity: 6,
                drag: 1.8,
            });
        }
        if (action.id === 'shield_bash') {
            particleFx.burst({
                x: entity.pos.x + Math.sin(entity.yaw) * 0.9,
                y: entity.pos.y + 1.05,
                z: entity.pos.z + Math.cos(entity.yaw) * 0.9,
                color: [0.46, 0.42, 0.33],
                color2: [0.72, 0.63, 0.43],
                count: 12,
                speed: 3.2,
                upBias: 0.35,
                spread: 0.5,
                size: 0.08,
                life: 0.3,
                gravity: 2.4,
                drag: 1.8,
            });
        }
        if (this.actionHits.has(entity.id)
            || !this.isPlayerInCommittedArc(entity, player, action)
            || !this.hasAttackLineOfSight(entity, player)) return 0;
        this.actionHits.add(entity.id);
        const dx = player.x - entity.pos.x;
        const dz = player.z - entity.pos.z;
        const length = Math.hypot(dx, dz) || 1;
        entityManager.impulsePlayer(dx / length * action.stagger * 6, action.stagger * 1.5, dz / length * action.stagger * 6);
        addTrauma(action.stagger > 0.6 ? 0.28 : 0.18);
        if (action.id === 'guard_sweep') {
            particleFx.burst({
                x: entity.pos.x + Math.sin(entity.yaw) * Math.min(1.45, action.range * 0.62),
                y: entity.pos.y + 0.75,
                z: entity.pos.z + Math.cos(entity.yaw) * Math.min(1.45, action.range * 0.62),
                color: [0.42, 0.36, 0.25],
                color2: [0.62, 0.51, 0.31],
                count: 8,
                speed: 2.4,
                upBias: 0.3,
                spread: 0.45,
                size: 0.065,
                life: 0.26,
                gravity: 3,
                drag: 1.8,
            });
        }
        return action.damage;
    }

    private isPlayerInCommittedArc(entity: Entity, player: VaultRoutePoint, action: VaultEnemyActionProfile): boolean {
        const dx = player.x - entity.pos.x;
        const dz = player.z - entity.pos.z;
        const distance = Math.hypot(dx, dz);
        if (distance > action.range || distance <= 1e-6) return false;
        const yaw = entity.combatAction?.targetYaw ?? entity.yaw;
        const dot = (dx / distance) * Math.sin(yaw) + (dz / distance) * Math.cos(yaw);
        return dot >= Math.cos(action.arcRadians * 0.5);
    }

    private relocateMarksman(entity: Entity, player: VaultRoutePoint): void {
        const anchors = entity.recoveryAnchors ?? [];
        const target = anchors
            .filter((anchor) => this.hasClearShot(
                { x: anchor.x + 0.5, y: anchor.y + entity.height * 0.72, z: anchor.z + 0.5 },
                { x: player.x, y: player.y + 1.15, z: player.z },
            ))
            .sort((a, b) => {
                const tacticalScore = (anchor: VaultRoutePoint) => {
                    const playerDistance = Math.hypot(anchor.x - player.x, anchor.z - player.z);
                    const travelDistance = Math.hypot(anchor.x - entity.pos.x, anchor.z - entity.pos.z);
                    return Math.abs(playerDistance - 11) + travelDistance * 0.14;
                };
                return tacticalScore(a) - tacticalScore(b);
            })[0];
        if (target) entityManager.setNavigationOverride(entity.id, target);
    }

    /**
     * Attack occlusion: a solid block between the attacker's chest and the
     * player's chest negates the hit, so cover and pillars actually protect.
     */
    private hasAttackLineOfSight(entity: Entity, player: VaultRoutePoint): boolean {
        return this.hasClearShot(
            { x: entity.pos.x, y: entity.pos.y + Math.min(entity.height * 0.72, 1.5), z: entity.pos.z },
            { x: player.x, y: player.y + 1.15, z: player.z },
        );
    }

    private hasClearShot(start: VaultRoutePoint, end: VaultRoutePoint): boolean {
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const dz = end.z - start.z;
        const distance = Math.hypot(dx, dy, dz);
        const samples = Math.max(1, Math.ceil(distance / 0.18));
        for (let index = 1; index < samples; index += 1) {
            const fraction = index / samples;
            const type = worldManager.tryGetBlock(
                Math.floor(start.x + dx * fraction),
                Math.floor(start.y + dy * fraction),
                Math.floor(start.z + dz * fraction),
            );
            if (type === null || (type !== BlockType.AIR
                && type !== BlockType.WATER
                && type !== BlockType.LAVA
                && BLOCKS[type]?.noCollision !== true)) return false;
        }
        return true;
    }

    private closeRoomGates(layout: VaultLayout, room: VaultRoom): VaultRoutePoint[] {
        const seen = new Set<string>();
        const cells = layout.doorways
            .filter((doorway) => doorway.from === room.id || doorway.to === room.id)
            .flatMap((doorway) => getVaultDoorwayRoomOpening(doorway, room.id))
            .filter((cell) => {
                const key = `${cell.x},${cell.y},${cell.z}`;
                if (seen.has(key) || worldManager.tryGetBlock(cell.x, cell.y, cell.z) !== BlockType.AIR) return false;
                seen.add(key);
                return true;
            });
        if (cells.length > 0) worldManager.setBlocks(cells.map((cell) => ({ ...cell, type: BlockType.VAULT_SEAL })));
        return cells;
    }

    private openRoomGates(state: EncounterState): void {
        const edits = state.gateCells
            .filter((cell) => worldManager.tryGetBlock(cell.x, cell.y, cell.z) === BlockType.VAULT_SEAL)
            .map((cell) => ({ ...cell, type: BlockType.AIR }));
        if (edits.length > 0) worldManager.setBlocks(edits);
        state.gateCells = [];
    }

    private clearEnemyCombatState(entityId: number): void {
        this.attackTimers.delete(entityId);
        this.blockCooldowns.delete(entityId);
        this.lastEnemyActions.delete(entityId);
        this.tacticalRefreshAt.delete(entityId);
        this.actionHits.delete(entityId);
        this.enemyFoley.delete(entityId);
        for (const key of [...this.actionCooldowns.keys()]) {
            if (key.startsWith(`${entityId}:`)) this.actionCooldowns.delete(key);
        }
    }

    private onEntityDied(entityId: number): void {
        if (bellTitanEncounter.handleEntityDeath(entityId)) {
            return;
        }
        if (this.titanMinions.delete(entityId)) {
            this.clearEnemyCombatState(entityId);
            return;
        }
        const key = this.entityEncounter.get(entityId);
        if (!key) return;
        this.entityEncounter.delete(entityId);
        this.clearEnemyCombatState(entityId);
        const encounter = this.encounters.get(key);
        if (!encounter) return;
        encounter.entityIds.delete(entityId);
        gameEvents.emit('vault:encounter-progress', {
            vaultId: encounter.vaultId,
            roomId: encounter.room.id,
            roomKind: encounter.room.kind,
            wave: encounter.waveIndex + 1,
            totalWaves: encounter.waves.length,
            remaining: encounter.entityIds.size,
        });
        if (encounter.entityIds.size > 0) return;
        this.advanceWave(encounter);
    }

    private advanceWave(state: EncounterState): void {
        if (state.waveIndex + 1 < state.waves.length) {
            state.waveIndex += 1;
            state.pendingWaveAt = this.clock + ENCOUNTER_WAVE_DELAY;
            state.pendingClearAt = null;
        } else {
            state.pendingWaveAt = null;
            state.pendingClearAt = this.clock + ENCOUNTER_CLEAR_DELAY;
        }
    }

    /**
     * Drop tracked entities that no longer exist in the entity manager. An
     * unload or external despawn emits no 'entity:died' event, and a wave that
     * waits on a vanished enemy would stall the encounter - and the vault's
     * one-active-room lock - forever.
     */
    private reapMissingEntities(state: EncounterState): void {
        let removed = false;
        for (const entityId of [...state.entityIds]) {
            if (entityManager.getEntity(entityId)) continue;
            state.entityIds.delete(entityId);
            this.entityEncounter.delete(entityId);
            this.clearEnemyCombatState(entityId);
            removed = true;
        }
        if (!removed || state.entityIds.size > 0) return;
        if (state.pendingWaveAt === null && state.pendingClearAt === null) this.advanceWave(state);
    }

    private completeEncounter(state: EncounterState): void {
        if (state.completed) return;
        state.completed = true;
        state.pendingClearAt = null;
        this.openRoomGates(state);
        progression.setVaultRoomSolved(state.vaultId, state.room.id);
        this.activeRoomByVault.delete(state.vaultId);
        gameEvents.emit('vault:encounter-cleared', {
            vaultId: state.vaultId,
            roomId: state.room.id,
            roomKind: state.room.kind,
        });
        gameEvents.emit('vault:encounter-completed', {
            vaultId: state.vaultId,
            room: 'combat',
            roomId: state.room.id,
            roomKind: state.room.kind,
        });
        particleFx.burst({
            x: state.room.x,
            y: state.room.y + 3,
            z: state.room.z,
            color: [0.62, 0.48, 0.27],
            color2: [0.86, 0.68, 0.38],
            count: 24,
            speed: 4,
            upBias: 3,
            spread: 1.1,
            size: 0.12,
            life: 0.8,
            gravity: 2,
            drag: 1.6,
        });
    }

    resetVault(vaultId: string): void {
        const titanId = bellTitanEncounter.getSnapshot().entityId;
        if (titanId !== null && entityManager.getEntity(titanId)?.regionId === vaultId) bellTitanEncounter.cleanup();
        for (const [key, encounter] of [...this.encounters]) {
            if (encounter.vaultId !== vaultId) continue;
            this.openRoomGates(encounter);
            for (const id of encounter.entityIds) {
                entityManager.despawn(id);
                this.entityEncounter.delete(id);
                this.clearEnemyCombatState(id);
            }
            this.encounters.delete(key);
        }
        this.activeRoomByVault.delete(vaultId);
        this.clearTitanMinions(vaultId);
        this.titanLayouts.delete(vaultId);
        for (const key of [...this.titanReinforced]) {
            if (key.startsWith(`${vaultId}:`)) this.titanReinforced.delete(key);
        }
        this.resonanceBacklashes = this.resonanceBacklashes.filter((backlash) => backlash.vaultId !== vaultId);
        this.enemyProjectiles.clear();
        this.notifyBolts();
    }

    reset(): void {
        bellTitanEncounter.cleanup();
        for (const encounter of this.encounters.values()) this.openRoomGates(encounter);
        this.encounters.clear();
        this.entityEncounter.clear();
        this.activeRoomByVault.clear();
        this.attackTimers.clear();
        this.actionCooldowns.clear();
        this.lastEnemyActions.clear();
        this.tacticalRefreshAt.clear();
        this.blockCooldowns.clear();
        this.actionHits.clear();
        this.enemyFoley.clear();
        for (const entityId of this.titanMinions.keys()) entityManager.despawn(entityId);
        this.titanMinions.clear();
        this.titanLayouts.clear();
        this.titanReinforced.clear();
        this.resonanceBacklashes = [];
        this.nextBacklashId = 1;
        this.enemyProjectiles.clear();
        this.currentPlayer = null;
        this.pendingProjectileDamage = 0;
        this.clock = 0;
        this.notifyBolts();
    }

    private clearTitanMinions(vaultId: string): void {
        for (const [entityId, ownerVault] of [...this.titanMinions]) {
            if (ownerVault !== vaultId) continue;
            entityManager.despawn(entityId);
            this.titanMinions.delete(entityId);
            this.clearEnemyCombatState(entityId);
        }
    }
}

export const resonantEncounterDirector = new ResonantEncounterDirector();
