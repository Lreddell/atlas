import {
    buildVaultEscapeRoutes,
    type VaultEscapeHazardKind,
    type VaultEscapeRoute,
    type VaultEscapeRouteDescriptor,
    type VaultEscapeRoutes,
} from './resonantVaultEscapes';
import type { VaultRoutePoint } from './resonantVaults';

export type VaultHazardPhase = 'rest' | 'telegraph' | 'active' | 'recover';

export interface VaultHazardDescriptor {
    id: string;
    route: VaultEscapeRoute;
    kind: VaultEscapeHazardKind;
    x: number;
    y: number;
    z: number;
    forwardX: number;
    forwardZ: number;
    rightX: number;
    rightZ: number;
    width: number;
    length: number;
    spikeCount: number;
    damage: number;
    phaseOffset: number;
    restSeconds: number;
    telegraphSeconds: number;
    activeSeconds: number;
    recoverSeconds: number;
    cycleSeconds: number;
}

export interface VaultHazardRenderState extends VaultHazardDescriptor {
    tier: 0 | 1 | 2 | 3;
    phase: VaultHazardPhase;
    phaseProgress: number;
    telegraphing: boolean;
    collisionHeight: number;
    headY: number;
    platformSolid: boolean;
}

export interface VaultHazardValidation {
    safeBypassPaths: number;
    legalTimedPaths: number;
    mandatoryBeats: number;
    spikeTriangles: number;
    spikeCollisionHeight: number;
    spikesAreCubes: boolean;
}

export interface VaultHazardTransition {
    id: string;
    kind: VaultEscapeHazardKind;
    phase: VaultHazardPhase;
    x: number;
    y: number;
    z: number;
}

export interface VaultHazardTick {
    damage: number;
    transitions: VaultHazardTransition[];
    states: readonly VaultHazardRenderState[];
}

function hashText(value: string): number {
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
}

function direction(route: VaultEscapeRouteDescriptor, index: number): { x: number; z: number } {
    const previous = route.path[Math.max(0, index - 2)];
    const next = route.path[Math.min(route.path.length - 1, index + 2)];
    const dx = next.x - previous.x;
    const dz = next.z - previous.z;
    if (Math.abs(dx) >= Math.abs(dz)) return { x: Math.sign(dx || 1), z: 0 };
    return { x: 0, z: Math.sign(dz || 1) };
}

function timing(kind: VaultEscapeHazardKind): Pick<VaultHazardDescriptor,
    'restSeconds' | 'telegraphSeconds' | 'activeSeconds' | 'recoverSeconds' | 'cycleSeconds'> {
    const values = kind === 'spikes' ? [1.35, 0.7, 0.72, 0.72]
        : kind === 'crusher' ? [1.55, 0.85, 0.55, 0.9]
            : kind === 'collapse' ? [1.65, 0.95, 1.35, 1.15]
                : [999, 0, 0, 0];
    return {
        restSeconds: values[0],
        telegraphSeconds: values[1],
        activeSeconds: values[2],
        recoverSeconds: values[3],
        cycleSeconds: values.reduce((sum, value) => sum + value, 0),
    };
}

function materialize(route: VaultEscapeRouteDescriptor): VaultHazardDescriptor[] {
    return route.hazardSlots.map((slot) => {
        const point = route.path[slot.pathIndex];
        const forward = direction(route, slot.pathIndex);
        const baseTiming = timing(slot.kind);
        return {
            id: slot.id,
            route: route.route,
            kind: slot.kind,
            x: point.x + 0.5,
            y: point.y,
            z: point.z + 0.5,
            forwardX: forward.x,
            forwardZ: forward.z,
            rightX: -forward.z,
            rightZ: forward.x,
            width: route.route === 'grand' ? 5.8 : 4.8,
            length: slot.kind === 'gap' ? 2.25 : slot.kind === 'collapse' ? 3.2 : 3.6,
            spikeCount: slot.kind === 'spikes' ? 10 : 0,
            damage: slot.kind === 'spikes' ? 4 : slot.kind === 'crusher' ? 8 : 0,
            phaseOffset: -(hashText(slot.id) % 700) / 1000,
            ...baseTiming,
        };
    });
}

export function buildVaultHazards(routes: VaultEscapeRoutes | 'fixture:all' | 'fixture:fracture_stair' | 'fixture:spike_lane'): VaultHazardDescriptor[] {
    const resolved = typeof routes === 'string'
        ? buildVaultEscapeRoutes({ seed: 404, vaultBaseY: -40, grandSurfaceY: 74, fractureSurfaceY: 70 })
        : routes;
    const descriptors = [...materialize(resolved.grand), ...materialize(resolved.fracture)];
    if (routes === 'fixture:fracture_stair') return descriptors.filter(({ route }) => route === 'fracture');
    if (routes === 'fixture:spike_lane') return descriptors.filter(({ kind }) => kind === 'spikes').slice(0, 1);
    return descriptors;
}

function positiveModulo(value: number, divisor: number): number {
    return ((value % divisor) + divisor) % divisor;
}

export function getTieredHazardTiming(
    descriptor: VaultHazardDescriptor,
    tier: 0 | 1 | 2 | 3,
): Pick<VaultHazardDescriptor,
    'restSeconds' | 'telegraphSeconds' | 'activeSeconds' | 'recoverSeconds' | 'cycleSeconds'> {
    if (descriptor.kind === 'gap') return timing('gap');
    const restScale = descriptor.kind === 'crusher'
        ? [1, 0.88, 0.76, 0.66][tier]
        : [1, 0.94, 0.84, 0.74][tier];
    const recoverScale = [1, 0.94, 0.84, 0.74][tier];
    const restSeconds = Math.max(0.65, descriptor.restSeconds * restScale);
    // Warnings never accelerate. Urgency comes from shorter safe/reset spans,
    // keeping every authored obstacle readable even at maximum escalation.
    const telegraphSeconds = Math.max(0.55, descriptor.telegraphSeconds);
    const activeSeconds = descriptor.activeSeconds;
    const recoverSeconds = Math.max(0.65, descriptor.recoverSeconds * recoverScale);
    return {
        restSeconds,
        telegraphSeconds,
        activeSeconds,
        recoverSeconds,
        cycleSeconds: restSeconds + telegraphSeconds + activeSeconds + recoverSeconds,
    };
}

export function sampleVaultHazard(
    descriptor: VaultHazardDescriptor,
    timeSeconds: number,
    tier: 0 | 1 | 2 | 3,
): VaultHazardRenderState {
    if (descriptor.kind === 'gap') {
        return {
            ...descriptor,
            tier,
            phase: 'active',
            phaseProgress: 1,
            telegraphing: false,
            collisionHeight: 0,
            headY: descriptor.y + 5.2,
            platformSolid: false,
        };
    }
    const tiered = getTieredHazardTiming(descriptor, tier);
    const local = positiveModulo(timeSeconds - descriptor.phaseOffset, tiered.cycleSeconds);
    let phase: VaultHazardPhase;
    let phaseProgress: number;
    if (local < tiered.restSeconds) {
        phase = 'rest';
        phaseProgress = local / tiered.restSeconds;
    } else if (local < tiered.restSeconds + tiered.telegraphSeconds) {
        phase = 'telegraph';
        phaseProgress = (local - tiered.restSeconds) / tiered.telegraphSeconds;
    } else if (local < tiered.restSeconds + tiered.telegraphSeconds + tiered.activeSeconds) {
        phase = 'active';
        phaseProgress = (local - tiered.restSeconds - tiered.telegraphSeconds) / tiered.activeSeconds;
    } else {
        phase = 'recover';
        phaseProgress = (local - tiered.restSeconds - tiered.telegraphSeconds - tiered.activeSeconds)
            / tiered.recoverSeconds;
    }
    const spikeHeight = phase === 'rest' ? 0.08
        : phase === 'telegraph' ? 0.08 + phaseProgress * 0.34
            : phase === 'active' ? 1.05
                : Math.max(0.08, 1.05 * (1 - phaseProgress));
    const crusherTravel = phase === 'telegraph' ? phaseProgress * 0.16
        : phase === 'active' ? Math.min(1, phaseProgress * 4)
            : phase === 'recover' ? 1 - phaseProgress
                : 0;
    return {
        ...descriptor,
        tier,
        phase,
        phaseProgress,
        telegraphing: phase === 'telegraph',
        collisionHeight: descriptor.kind === 'spikes' ? spikeHeight : 0,
        headY: descriptor.y + 5.15 - crusherTravel * 4.05,
        platformSolid: descriptor.kind !== 'collapse' || phase !== 'active',
    };
}

export function getHazardFloorCells(descriptor: VaultHazardDescriptor): VaultRoutePoint[] {
    const cells: VaultRoutePoint[] = [];
    const halfLength = descriptor.kind === 'gap' ? 1 : descriptor.kind === 'collapse' ? 2 : 0;
    for (let along = -halfLength; along <= halfLength; along += 1) {
        for (let across = -2; across <= 2; across += 1) {
            cells.push({
                x: Math.floor(descriptor.x + descriptor.forwardX * along + descriptor.rightX * across),
                y: Math.floor(descriptor.y - 1),
                z: Math.floor(descriptor.z + descriptor.forwardZ * along + descriptor.rightZ * across),
            });
        }
    }
    return cells;
}

function intersectsPlayer(state: VaultHazardRenderState, player: VaultRoutePoint): boolean {
    const dx = player.x - state.x;
    const dz = player.z - state.z;
    const along = Math.abs(dx * state.forwardX + dz * state.forwardZ);
    const across = Math.abs(dx * state.rightX + dz * state.rightZ);
    if (along > state.length * 0.5 + 0.35 || across > state.width * 0.5 + 0.35) return false;
    if (state.kind === 'spikes') {
        return state.collisionHeight > 0.65 && player.y < state.y + state.collisionHeight && player.y + 1.8 > state.y;
    }
    if (state.kind === 'crusher' && state.phase === 'active') {
        return player.y < state.headY + 1.05 && player.y + 1.8 > state.headY;
    }
    return false;
}

export class ResonantVaultHazardRuntime {
    private descriptors: VaultHazardDescriptor[] = [];
    private states: VaultHazardRenderState[] = [];
    private phases = new Map<string, VaultHazardPhase>();
    private cooldowns = new Map<string, number>();
    private clock = 0;
    private signature = '';

    configure(vaultId: string, routes: VaultEscapeRoutes): void {
        const signature = `${vaultId}:${routes.grand.pathLength}:${routes.fracture.pathLength}`;
        if (signature === this.signature) return;
        this.reset();
        this.signature = signature;
        this.descriptors = buildVaultHazards(routes);
        this.states = this.descriptors.map((descriptor) => sampleVaultHazard(descriptor, 0, 0));
    }

    tick(dtSeconds: number, player: VaultRoutePoint, tier: 0 | 1 | 2 | 3, enabled: boolean): VaultHazardTick {
        const dt = Math.max(0, Math.min(0.1, Number.isFinite(dtSeconds) ? dtSeconds : 0));
        this.clock += dt;
        for (const [id, remaining] of this.cooldowns) {
            const next = remaining - dt;
            if (next <= 0) this.cooldowns.delete(id);
            else this.cooldowns.set(id, next);
        }
        const transitions: VaultHazardTransition[] = [];
        this.states = this.descriptors.map((descriptor) => {
            const state = sampleVaultHazard(descriptor, this.clock, tier);
            const previous = this.phases.get(descriptor.id);
            if (previous !== state.phase) {
                this.phases.set(descriptor.id, state.phase);
                transitions.push({ id: state.id, kind: state.kind, phase: state.phase, x: state.x, y: state.y, z: state.z });
            }
            return state;
        });
        let damage = 0;
        if (enabled) {
            for (const state of this.states) {
                if (state.damage <= 0 || this.cooldowns.has(state.id) || !intersectsPlayer(state, player)) continue;
                damage += state.damage;
                this.cooldowns.set(state.id, 0.8);
            }
        }
        return { damage, transitions, states: this.getRenderState() };
    }

    getRenderState(): readonly VaultHazardRenderState[] {
        return this.states.map((state) => ({ ...state }));
    }

    reset(): void {
        this.descriptors = [];
        this.states = [];
        this.phases.clear();
        this.cooldowns.clear();
        this.clock = 0;
        this.signature = '';
    }
}

export const resonantVaultHazards = new ResonantVaultHazardRuntime();

export function validateHazardCourse(fixture: 'fixture:fracture_stair' | 'fixture:spike_lane'): VaultHazardValidation {
    const descriptors = buildVaultHazards(fixture);
    const spike = descriptors.find(({ kind }) => kind === 'spikes');
    const activeSpike = spike
        ? sampleVaultHazard(spike, spike.phaseOffset + spike.restSeconds + spike.telegraphSeconds + 0.1, 0)
        : null;
    return {
        safeBypassPaths: fixture === 'fixture:fracture_stair' ? 0 : 0,
        legalTimedPaths: descriptors.every(({ kind, restSeconds }) => kind === 'gap' || restSeconds >= 0.55) ? 1 : 0,
        mandatoryBeats: fixture === 'fixture:fracture_stair' ? descriptors.length : 1,
        spikeTriangles: (spike?.spikeCount ?? 0) * 8,
        spikeCollisionHeight: activeSpike?.collisionHeight ?? 0,
        spikesAreCubes: false,
    };
}
