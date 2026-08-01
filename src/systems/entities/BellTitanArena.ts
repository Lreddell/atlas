export interface BellTitanPoint {
    x: number;
    y: number;
    z: number;
}

export interface BellTitanShockwaveSpec {
    startRadius: number;
    endRadius: number;
    speed: number;
    damage: number;
}

export interface BellTitanShockwaveRenderState extends BellTitanPoint {
    id: number;
    radius: number;
    endRadius: number;
    speed: number;
}

export interface BellTitanImpactSpec {
    radius: number;
    warningSeconds: number;
    activeSeconds: number;
    damage: number;
}

export interface BellTitanImpactRenderState extends BellTitanPoint {
    id: number;
    radius: number;
    warningSeconds: number;
    activeSeconds: number;
    age: number;
    phase: 'warning' | 'active';
}

export interface BellTitanLaneSpec {
    yaw: number;
    length: number;
    halfWidth: number;
    warningSeconds: number;
    activeSeconds: number;
    damage: number;
}

export interface BellTitanLaneRenderState extends BellTitanPoint {
    id: number;
    yaw: number;
    length: number;
    halfWidth: number;
    warningSeconds: number;
    activeSeconds: number;
    age: number;
    phase: 'warning' | 'active';
}

export interface BellTitanDebris extends BellTitanPoint {
    id: number;
    vx: number;
    vy: number;
    vz: number;
    spin: number;
    ttl: number;
    age: number;
    floorY: number;
    settled: boolean;
    stage: 1 | 2;
}

interface ActiveShockwave extends BellTitanShockwaveRenderState {
    damage: number;
    hitPlayer: boolean;
}

interface ActiveImpact extends BellTitanImpactRenderState {
    damage: number;
    hitPlayer: boolean;
}

interface ActiveLane extends BellTitanLaneRenderState {
    damage: number;
    hitPlayer: boolean;
}

export interface BellTitanArenaBounds {
    centerX: number;
    centerZ: number;
    radius: number;
}

export interface BellTitanArenaTick {
    playerDamage: number;
    shockwaves: readonly BellTitanShockwaveRenderState[];
    impacts: readonly BellTitanImpactRenderState[];
    lanes: readonly BellTitanLaneRenderState[];
    debris: readonly BellTitanDebris[];
}

const DEFAULT_BOUNDS: BellTitanArenaBounds = { centerX: 0, centerZ: 0, radius: 19 };

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function seededUnit(seed: number): number {
    const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
    return value - Math.floor(value);
}

export class BellTitanArena {
    private bounds: BellTitanArenaBounds;
    private shockwaves: ActiveShockwave[] = [];
    private impacts: ActiveImpact[] = [];
    private lanes: ActiveLane[] = [];
    private debris: BellTitanDebris[] = [];
    private nextShockwaveId = 1;
    private nextImpactId = 1;
    private nextLaneId = 1;
    private nextDebrisId = 1;

    constructor(bounds: Partial<BellTitanArenaBounds> = {}) {
        this.bounds = {
            centerX: bounds.centerX ?? DEFAULT_BOUNDS.centerX,
            centerZ: bounds.centerZ ?? DEFAULT_BOUNDS.centerZ,
            radius: Math.max(1, bounds.radius ?? DEFAULT_BOUNDS.radius),
        };
    }

    configure(bounds: BellTitanArenaBounds): void {
        this.bounds = { ...bounds, radius: Math.max(1, bounds.radius) };
        this.reset();
    }

    spawnShockwave(origin: BellTitanPoint, spec: BellTitanShockwaveSpec): number {
        const maxRadius = Math.min(
            Math.max(spec.startRadius, spec.endRadius),
            this.distanceToBoundary(origin.x, origin.z),
        );
        const shockwave: ActiveShockwave = {
            id: this.nextShockwaveId++,
            ...origin,
            radius: Math.max(0, spec.startRadius),
            endRadius: maxRadius,
            speed: Math.max(0, spec.speed),
            damage: Math.max(0, spec.damage),
            hitPlayer: false,
        };
        if (shockwave.endRadius > shockwave.radius) this.shockwaves.push(shockwave);
        return shockwave.id;
    }

    spawnImpact(origin: BellTitanPoint, spec: BellTitanImpactSpec): number {
        const radius = clamp(spec.radius, 0.5, this.bounds.radius);
        const dx = origin.x - this.bounds.centerX;
        const dz = origin.z - this.bounds.centerZ;
        const offset = Math.hypot(dx, dz);
        const maxOffset = Math.max(0, this.bounds.radius - radius - 0.5);
        const positionScale = offset > maxOffset && offset > 0 ? maxOffset / offset : 1;
        const impact: ActiveImpact = {
            id: this.nextImpactId++,
            x: this.bounds.centerX + dx * positionScale,
            y: origin.y,
            z: this.bounds.centerZ + dz * positionScale,
            radius,
            warningSeconds: clamp(spec.warningSeconds, 0, 4),
            activeSeconds: clamp(spec.activeSeconds, 0.05, 1.5),
            age: 0,
            phase: 'warning',
            damage: Math.max(0, spec.damage),
            hitPlayer: false,
        };
        this.impacts.push(impact);
        return impact.id;
    }

    spawnLane(origin: BellTitanPoint, spec: BellTitanLaneSpec): number {
        const lane: ActiveLane = {
            id: this.nextLaneId++,
            ...origin,
            yaw: Number.isFinite(spec.yaw) ? spec.yaw : 0,
            length: clamp(spec.length, 1, this.bounds.radius * 2),
            halfWidth: clamp(spec.halfWidth, 0.2, 4),
            warningSeconds: clamp(spec.warningSeconds, 0.2, 4),
            activeSeconds: clamp(spec.activeSeconds, 0.05, 1.5),
            age: 0,
            phase: 'warning',
            damage: Math.max(0, spec.damage),
            hitPlayer: false,
        };
        this.lanes.push(lane);
        return lane.id;
    }

    breakShell(origin: BellTitanPoint, stage: 1 | 2): readonly BellTitanDebris[] {
        const count = stage === 1 ? 8 : 12;
        const created: BellTitanDebris[] = [];
        for (let index = 0; index < count; index += 1) {
            const angle = (index / count) * Math.PI * 2 + seededUnit(stage * 31 + index) * 0.28;
            const speed = 2.8 + seededUnit(stage * 53 + index) * 3.6;
            const piece: BellTitanDebris = {
                id: this.nextDebrisId++,
                x: origin.x,
                y: origin.y + 1.2 + seededUnit(stage * 71 + index) * 2.4,
                z: origin.z,
                vx: Math.sin(angle) * speed,
                vy: 3.5 + seededUnit(stage * 89 + index) * 4.5,
                vz: Math.cos(angle) * speed,
                spin: (seededUnit(stage * 107 + index) - 0.5) * 12,
                ttl: 3.1 + seededUnit(stage * 127 + index) * 0.7,
                age: 0,
                floorY: origin.y + 0.08,
                settled: false,
                stage,
            };
            this.debris.push(piece);
            created.push({ ...piece });
        }
        return created;
    }

    tick(
        dtSeconds: number,
        player: BellTitanPoint,
        hasLineOfSight: (origin: BellTitanPoint, player: BellTitanPoint) => boolean = () => true,
    ): BellTitanArenaTick {
        const dt = clamp(Number.isFinite(dtSeconds) ? dtSeconds : 0, 0, 2);
        let playerDamage = 0;
        for (const wave of this.shockwaves) {
            const previousRadius = wave.radius;
            wave.radius = Math.min(wave.endRadius, wave.radius + wave.speed * dt);
            const playerRadius = Math.hypot(player.x - wave.x, player.z - wave.z);
            const crossesPlayer = previousRadius < playerRadius && wave.radius >= playerRadius;
            // The ring is a low travelling ridge. A deliberate jump clears it.
            const verticalMatch = Math.abs(player.y - wave.y) <= 0.82;
            if (!wave.hitPlayer && crossesPlayer && verticalMatch && hasLineOfSight(wave, player)) {
                wave.hitPlayer = true;
                playerDamage += wave.damage;
            }
        }
        this.shockwaves = this.shockwaves.filter((wave) => wave.radius < wave.endRadius);

        for (const impact of this.impacts) {
            impact.age += dt;
            impact.phase = impact.age >= impact.warningSeconds ? 'active' : 'warning';
            const active = impact.age >= impact.warningSeconds
                && impact.age < impact.warningSeconds + impact.activeSeconds;
            const inside = Math.hypot(player.x - impact.x, player.z - impact.z) <= impact.radius;
            if (active && !impact.hitPlayer && inside && Math.abs(player.y - impact.y) <= 2.4
                && hasLineOfSight(impact, player)) {
                impact.hitPlayer = true;
                playerDamage += impact.damage;
            }
        }
        this.impacts = this.impacts.filter((impact) => (
            impact.age < impact.warningSeconds + impact.activeSeconds
        ));

        for (const lane of this.lanes) {
            lane.age += dt;
            lane.phase = lane.age >= lane.warningSeconds ? 'active' : 'warning';
            const active = lane.age >= lane.warningSeconds
                && lane.age < lane.warningSeconds + lane.activeSeconds;
            const dx = player.x - lane.x;
            const dz = player.z - lane.z;
            const forwardX = Math.sin(lane.yaw);
            const forwardZ = Math.cos(lane.yaw);
            const along = dx * forwardX + dz * forwardZ;
            const across = Math.abs(dx * forwardZ - dz * forwardX);
            const inside = Math.abs(along) <= lane.length * 0.5 && across <= lane.halfWidth;
            if (active && !lane.hitPlayer && inside && Math.abs(player.y - lane.y) <= 0.92
                && hasLineOfSight(lane, player)) {
                lane.hitPlayer = true;
                playerDamage += lane.damage;
            }
        }
        this.lanes = this.lanes.filter((lane) => lane.age < lane.warningSeconds + lane.activeSeconds);

        for (const piece of this.debris) {
            piece.ttl -= dt;
            if (piece.settled) continue;
            piece.age += dt;
            piece.x += piece.vx * dt;
            piece.z += piece.vz * dt;
            const nextY = piece.y + piece.vy * dt - 9 * dt * dt;
            piece.vy -= 18 * dt;
            if (nextY <= piece.floorY) {
                piece.y = piece.floorY;
                piece.vx = 0;
                piece.vy = 0;
                piece.vz = 0;
                piece.settled = true;
            } else piece.y = nextY;
        }
        this.debris = this.debris.filter((piece) => piece.ttl > 0);
        return {
            playerDamage,
            shockwaves: this.getShockwaves(),
            impacts: this.getImpacts(),
            lanes: this.getLanes(),
            debris: this.getDebris(),
        };
    }

    getShockwaves(): readonly BellTitanShockwaveRenderState[] {
        return this.shockwaves.map(({ damage: _damage, hitPlayer: _hitPlayer, ...wave }) => ({ ...wave }));
    }

    getDebris(): readonly BellTitanDebris[] {
        return this.debris.map((piece) => ({ ...piece }));
    }

    getImpacts(): readonly BellTitanImpactRenderState[] {
        return this.impacts.map(({ damage: _damage, hitPlayer: _hitPlayer, ...impact }) => ({ ...impact }));
    }

    getLanes(): readonly BellTitanLaneRenderState[] {
        return this.lanes.map(({ damage: _damage, hitPlayer: _hitPlayer, ...lane }) => ({ ...lane }));
    }

    reset(): void {
        this.shockwaves = [];
        this.impacts = [];
        this.lanes = [];
        this.debris = [];
    }

    private distanceToBoundary(x: number, z: number): number {
        const offset = Math.hypot(x - this.bounds.centerX, z - this.bounds.centerZ);
        return Math.max(0, this.bounds.radius - offset);
    }
}
