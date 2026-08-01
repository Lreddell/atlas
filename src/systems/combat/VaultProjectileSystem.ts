export interface VaultVector {
    x: number;
    y: number;
    z: number;
}

export type VaultProjectileOwner = 'player' | 'enemy';

export interface VaultProjectileOptions {
    owner?: VaultProjectileOwner;
    sourceId?: number;
    speed?: number;
    gravity?: number;
    stagger?: number;
    maxDistance?: number;
}

export interface VaultProjectileRenderState extends VaultVector {
    id: number;
    vx: number;
    vy: number;
    vz: number;
    owner: VaultProjectileOwner;
}

interface VaultProjectile extends VaultProjectileRenderState {
    damage: number;
    gravity: number;
    stagger: number;
    maxDistance: number;
    distance: number;
    sourceId?: number;
}

export interface VaultProjectileEntityHit {
    id: number;
    distance: number;
    hitZone?: string;
}

export interface VaultProjectileDependencies {
    getBlock(x: number, y: number, z: number): number | null;
    isBlockingBlock?(type: number | null): boolean;
    raycastEntity(
        origin: VaultVector,
        direction: VaultVector,
        maxDistance: number,
        projectile: Readonly<VaultProjectileRenderState> & { sourceId?: number },
    ): VaultProjectileEntityHit | null;
    damageEntity(id: number, damage: number, direction: VaultVector, stagger: number, owner: VaultProjectileOwner, hitZone?: string): void;
    onImpact?(position: VaultVector, kind: 'world' | 'entity'): void;
}

const MAX_SUBSTEP_DISTANCE = 0.35;
const WORLD_SAMPLE_DISTANCE = 0.07;
const DEFAULT_SPEED = 28;
const DEFAULT_GRAVITY = 2.8;
const DEFAULT_MAX_DISTANCE = 64;

const EMPTY_DEPENDENCIES: VaultProjectileDependencies = {
    getBlock: () => 0,
    raycastEntity: () => null,
    damageEntity: () => undefined,
};

function normalize(vector: VaultVector): VaultVector | null {
    const length = Math.hypot(vector.x, vector.y, vector.z);
    if (!Number.isFinite(length) || length <= 1e-6) return null;
    return { x: vector.x / length, y: vector.y / length, z: vector.z / length };
}

function defaultIsBlocking(type: number | null): boolean {
    return type !== null && type !== 0 && type !== 7 && type !== 22;
}

export class VaultProjectileSystem {
    private dependencies: VaultProjectileDependencies;
    private projectiles: VaultProjectile[] = [];
    private nextId = 1;

    constructor(dependencies: VaultProjectileDependencies = EMPTY_DEPENDENCIES) {
        this.dependencies = dependencies;
    }

    setDependencies(dependencies: VaultProjectileDependencies): void {
        this.dependencies = dependencies;
    }

    fire(origin: VaultVector, direction: VaultVector, damage: number, options: VaultProjectileOptions = {}): number | null {
        const normalized = normalize(direction);
        if (!normalized || !Number.isFinite(damage) || damage <= 0) return null;
        const speed = Math.max(0.1, options.speed ?? DEFAULT_SPEED);
        const projectile: VaultProjectile = {
            id: this.nextId++,
            x: origin.x,
            y: origin.y,
            z: origin.z,
            vx: normalized.x * speed,
            vy: normalized.y * speed,
            vz: normalized.z * speed,
            owner: options.owner ?? 'player',
            sourceId: options.sourceId,
            damage,
            gravity: Math.max(0, options.gravity ?? DEFAULT_GRAVITY),
            stagger: Math.max(0, options.stagger ?? 0),
            maxDistance: Math.max(0.1, options.maxDistance ?? DEFAULT_MAX_DISTANCE),
            distance: 0,
        };
        this.projectiles.push(projectile);
        return projectile.id;
    }

    tick(deltaSeconds: number): void {
        if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0 || this.projectiles.length === 0) return;
        const duration = Math.min(deltaSeconds, 0.25);
        for (let index = this.projectiles.length - 1; index >= 0; index -= 1) {
            const projectile = this.projectiles[index];
            let remaining = duration;
            let removed = false;
            while (remaining > 1e-6 && !removed) {
                const remainingDistance = projectile.maxDistance - projectile.distance;
                if (remainingDistance <= 1e-6) {
                    this.projectiles.splice(index, 1);
                    removed = true;
                    break;
                }
                const speed = Math.max(0.1, Math.hypot(projectile.vx, projectile.vy, projectile.vz));
                const allowedDistance = Math.min(MAX_SUBSTEP_DISTANCE, remainingDistance);
                // Account for acceleration when choosing the time slice. Selecting
                // solely from the velocity at the start of the slice lets gravity
                // make steep bolts tunnel slightly beyond the collision budget.
                const stepSeconds = Math.min(
                    remaining,
                    allowedDistance / (speed + projectile.gravity * remaining),
                );
                projectile.vy -= projectile.gravity * stepSeconds;
                const segment = {
                    x: projectile.vx * stepSeconds,
                    y: projectile.vy * stepSeconds,
                    z: projectile.vz * stepSeconds,
                };
                const segmentLength = Math.hypot(segment.x, segment.y, segment.z);
                const direction = normalize(segment);
                if (!direction || segmentLength <= 1e-6) break;
                const origin = { x: projectile.x, y: projectile.y, z: projectile.z };
                const worldDistance = this.findWorldCollisionDistance(origin, direction, segmentLength);
                const entityHit = this.dependencies.raycastEntity(origin, direction, segmentLength, projectile);
                const entityDistance = entityHit && Number.isFinite(entityHit.distance) && entityHit.distance >= 0
                    ? entityHit.distance
                    : Number.POSITIVE_INFINITY;

                if (entityHit && entityDistance <= segmentLength && entityDistance < worldDistance) {
                    projectile.x += direction.x * entityDistance;
                    projectile.y += direction.y * entityDistance;
                    projectile.z += direction.z * entityDistance;
                    this.dependencies.damageEntity(entityHit.id, projectile.damage, direction, projectile.stagger, projectile.owner, entityHit.hitZone);
                    this.dependencies.onImpact?.({ x: projectile.x, y: projectile.y, z: projectile.z }, 'entity');
                    this.projectiles.splice(index, 1);
                    removed = true;
                    break;
                }
                if (worldDistance <= segmentLength) {
                    projectile.x += direction.x * worldDistance;
                    projectile.y += direction.y * worldDistance;
                    projectile.z += direction.z * worldDistance;
                    this.dependencies.onImpact?.({ x: projectile.x, y: projectile.y, z: projectile.z }, 'world');
                    this.projectiles.splice(index, 1);
                    removed = true;
                    break;
                }

                projectile.x += segment.x;
                projectile.y += segment.y;
                projectile.z += segment.z;
                projectile.distance += segmentLength;
                remaining -= stepSeconds;
                if (projectile.distance >= projectile.maxDistance) {
                    this.projectiles.splice(index, 1);
                    removed = true;
                }
            }
        }
    }

    getRenderState(): readonly VaultProjectileRenderState[] {
        return this.projectiles;
    }

    clear(): void {
        this.projectiles = [];
    }

    private findWorldCollisionDistance(origin: VaultVector, direction: VaultVector, maxDistance: number): number {
        const blocks = this.dependencies;
        const isBlocking = blocks.isBlockingBlock ?? defaultIsBlocking;
        const samples = Math.max(1, Math.ceil(maxDistance / WORLD_SAMPLE_DISTANCE));
        for (let sample = 1; sample <= samples; sample += 1) {
            const distance = Math.min(maxDistance, sample * maxDistance / samples);
            const x = origin.x + direction.x * distance;
            const y = origin.y + direction.y * distance;
            const z = origin.z + direction.z * distance;
            if (isBlocking(blocks.getBlock(Math.floor(x), Math.floor(y), Math.floor(z)))) return distance;
        }
        return Number.POSITIVE_INFINITY;
    }
}

export const vaultProjectileSystem = new VaultProjectileSystem();
