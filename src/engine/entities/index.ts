import { advanceActionTimeline, nonnegativeFinite, type ActionDurations, type ActionTimeline } from '../encounters/index.ts';

export interface EntityPoint { x: number; y: number; z: number }
export interface MovementCapability {
    width: number; height: number; maxStep: number; maxJump: number; maxDrop: number;
    avoidHazards?: ReadonlySet<number>;
    preferredRange: { min: number; max: number };
    acceleration: number; turnRate: number; jumpImpulse: number; dropSpeedScale: number; strafe?: boolean;
}
export interface EntityDefinition {
    id: string;
    displayName?: string;
    maxHp: number; width: number; height: number; speed: number; aggroRange: number;
    contactDamage: number; attackCooldown: number; color: number;
    passive?: boolean; floats?: boolean; isBoss?: boolean; canStep?: boolean;
    armored?: boolean; staggerResistance?: number; leashRadius?: number; brain?: string;
    navigation?: MovementCapability;
    drops?: Array<{ type: number; min: number; max: number; chance?: number }>;
    /** Custom renderers register at the game composition root; ordinary enemies use the standard body. */
    renderMode?: 'standard' | 'custom';
    /** External encounters author horizontal movement; generic runtime still supplies gravity/collision. */
    movementOwner?: 'generic' | 'encounter';
}

export interface EntityCapabilities {
    health: { max: number; armored?: boolean; staggerResistance?: number };
    body: { width: number; height: number; color: number; renderMode?: 'standard' | 'custom' };
    movement?: { speed: number; navigation?: MovementCapability; leashRadius?: number; owner?: 'generic' | 'encounter' };
    aggro?: { range: number };
    melee?: { contactDamage: number; cooldownSeconds: number };
    loot?: EntityDefinition['drops'];
    boss?: boolean;
    brain?: string;
}

export function validateEntityDefinition(definition: EntityDefinition): void {
    if (!definition.id || !Number.isFinite(definition.maxHp) || definition.maxHp <= 0
        || !Number.isFinite(definition.width) || definition.width <= 0
        || !Number.isFinite(definition.height) || definition.height <= 0) throw new Error(`Invalid entity body: ${definition.id}`);
    for (const key of ['speed', 'aggroRange', 'contactDamage', 'attackCooldown'] as const) {
        if (!Number.isFinite(definition[key]) || definition[key] < 0) throw new Error(`Invalid entity ${key}: ${definition.id}`);
    }
    for (const drop of definition.drops ?? []) {
        if (!Number.isInteger(drop.type) || drop.type < 0 || !Number.isInteger(drop.min) || !Number.isInteger(drop.max)
            || drop.min < 0 || drop.max < drop.min || (drop.chance !== undefined
            && (!Number.isFinite(drop.chance) || drop.chance < 0 || drop.chance > 1))) throw new Error(`Invalid entity loot: ${definition.id}`);
    }
}

/** A conventional enemy is capability data; custom behavior uses the registered brain escape hatch. */
export function createEntityDefinition(id: string, displayName: string, capabilities: EntityCapabilities): EntityDefinition {
    if (!/^[a-z][a-z0-9_.-]*:[a-z0-9_./-]+$/.test(id)) throw new Error(`Entity content requires a namespaced id: ${id}`);
    const definition: EntityDefinition = {
        id, displayName, maxHp: capabilities.health.max, ...capabilities.body,
        armored: capabilities.health.armored, staggerResistance: capabilities.health.staggerResistance,
        speed: capabilities.movement?.speed ?? 0, navigation: capabilities.movement?.navigation,
        leashRadius: capabilities.movement?.leashRadius, movementOwner: capabilities.movement?.owner,
        aggroRange: capabilities.aggro?.range ?? 0,
        contactDamage: capabilities.melee?.contactDamage ?? 0,
        attackCooldown: capabilities.melee?.cooldownSeconds ?? 0,
        drops: capabilities.loot, isBoss: capabilities.boss, brain: capabilities.brain,
    };
    validateEntityDefinition(definition);
    return definition;
}

/** Testable decision state used by simple authored attacks independently of rendering. */
export interface MeleeCapabilityState { cooldown: number; action: ActionTimeline | null; landed: boolean }
export interface MeleeCapabilityProfile extends ActionDurations { range: number; damage: number; cooldownSeconds: number }
export function advanceMeleeCapability(
    state: MeleeCapabilityState, profile: MeleeCapabilityProfile,
    input: { dt: number; distance: number; targetable: boolean; lineOfSight: boolean },
): { state: MeleeCapabilityState; damage: number } {
    const dt = nonnegativeFinite(input.dt);
    const next = { ...state, action: state.action ? { ...state.action } : null, cooldown: Math.max(0, state.cooldown - dt) };
    let damage = 0;
    if (!input.targetable) return { state: { ...next, action: null, landed: false }, damage };
    if (!next.action && next.cooldown === 0 && input.distance <= profile.range && input.lineOfSight) {
        next.action = { phase: 'anticipation', elapsed: 0, duration: profile.anticipation };
        next.landed = false;
    }
    if (next.action) {
        const attemptHit = () => {
            if (!next.landed && input.distance <= profile.range && input.lineOfSight) { damage = profile.damage; next.landed = true; }
        };
        if (next.action.phase === 'active') attemptHit();
        const finished = advanceActionTimeline(next.action, profile, dt, (phase) => { if (phase === 'active') attemptHit(); });
        if (finished) { next.action = null; next.cooldown = profile.cooldownSeconds; }
    }
    return { state: next, damage };
}

export type EntityDamageResult = 'damaged' | 'blocked' | 'none';
export interface EntityRaycastHit { distance: number; hitZone?: string }
export interface EntityDefeatContext {
    /** The runtime owns timers and cancels them on world unload. */
    dropAt(position: EntityPoint, delayMilliseconds?: number): void;
    clearOwnedHazards(): void;
}
export interface EntityHooks<T> {
    raycast?: (entity: T, origin: EntityPoint, direction: EntityPoint, maxDistance: number, bodyDistance: number | null) => EntityRaycastHit | null;
    /** Return true if the handler took responsibility for loot. */
    defeat?: (entity: T, context: EntityDefeatContext) => boolean;
}

/** Registration is explicit, rejects accidental replacement, and never executes content callbacks at import time. */
export class EntityHookRegistry<T> {
    private hooks = new Map<string, EntityHooks<T>>();
    register(id: string, hooks: EntityHooks<T>): () => void {
        if (this.hooks.has(id)) throw new Error(`Entity hooks already registered: ${id}`);
        this.hooks.set(id, hooks);
        return () => { if (this.hooks.get(id) === hooks) this.hooks.delete(id); };
    }
    get(id: string): EntityHooks<T> | undefined { return this.hooks.get(id); }
}
