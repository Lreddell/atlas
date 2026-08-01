export const BELL_TITAN_MAX_HP = 390 as const;
export const BELL_TITAN_AWAKEN_SECONDS = 3;
export const BELL_TITAN_CLOSED_DAMAGE_MULTIPLIER = 0;
export const BELL_TITAN_CORE_DAMAGE_MULTIPLIER = 1;
export const BELL_TITAN_SHELL_BREAK_SECONDS = 2;
export const BELL_TITAN_DAMAGE_CAP = 42;

export type BellTitanAction =
    | 'dormant'
    | 'awaken'
    | 'idle'
    | 'sweep_windup'
    | 'sweep_active'
    | 'sweep_recovery'
    | 'slam_windup'
    | 'slam_active'
    | 'slam_recovery'
    | 'advance_windup'
    | 'advance_active'
    | 'advance_recovery'
    | 'double_toll_windup'
    | 'double_toll_active'
    | 'double_toll_recovery'
    | 'hammer_combo_windup'
    | 'hammer_combo_active'
    | 'hammer_combo_recovery'
    | 'chain_lash_windup'
    | 'chain_lash_active'
    | 'chain_lash_recovery'
    | 'vaultbreaker_windup'
    | 'vaultbreaker_active'
    | 'vaultbreaker_recovery'
    | 'resonance_cage_windup'
    | 'resonance_cage_active'
    | 'resonance_cage_recovery'
    | 'bell_storm_windup'
    | 'bell_storm_active'
    | 'bell_storm_recovery'
    | 'core_open'
    | 'shell_break'
    | 'stagger'
    | 'death';

export type BellTitanAttack =
    | 'sweep'
    | 'slam'
    | 'advance'
    | 'double_toll'
    | 'hammer_combo'
    | 'chain_lash'
    | 'vaultbreaker'
    | 'resonance_cage'
    | 'bell_storm';
export type BellTitanHitZone = 'shell' | 'core';
export type BellTitanCooldowns = Record<BellTitanAttack, number>;

/** Single source of truth for both authored hit tests and ground telegraphs. */
export const BELL_TITAN_ATTACK_GEOMETRY = Object.freeze({
    sweep: Object.freeze({ range: 7.8, halfAngle: 75 * Math.PI / 180 }),
    hammer_combo: Object.freeze({ range: 9.2, halfAngle: 75 * Math.PI / 180 }),
    chain_lash: Object.freeze({ range: 12, halfAngle: 110 * Math.PI / 180 }),
    advance: Object.freeze({ length: 20, halfWidth: 2.2 }),
    slam: Object.freeze({ radius: 3.35 }),
});

/** Maps a world-space impact onto the Titan's authored hanging-bell opening. */
export function resolveBellTitanHitZone(
    titanPosition: BellTitanPoint,
    titanYaw: number,
    impact: BellTitanPoint,
): BellTitanHitZone {
    const dx = impact.x - titanPosition.x;
    const dy = impact.y - titanPosition.y;
    const dz = impact.z - titanPosition.z;
    const cos = Math.cos(titanYaw);
    const sin = Math.sin(titanYaw);
    const localX = cos * dx - sin * dz;
    const localZ = sin * dx + cos * dz;
    return Math.abs(localX) <= 1.04 && dy >= 1.5 && dy <= 3.88 && localZ >= 0.16 && localZ <= 2.18
        ? 'core'
        : 'shell';
}

/** Raycasts the box occupied by the rendered hanging bell and its wide lip. */
export function raycastBellTitanCore(
    origin: BellTitanPoint,
    direction: BellTitanPoint,
    titanPosition: BellTitanPoint,
    titanYaw: number,
    maxDistance: number,
): number | null {
    const dx = origin.x - titanPosition.x;
    const dz = origin.z - titanPosition.z;
    const cos = Math.cos(titanYaw);
    const sin = Math.sin(titanYaw);
    const localOrigin = {
        x: cos * dx - sin * dz,
        y: origin.y - titanPosition.y,
        z: sin * dx + cos * dz,
    };
    const localDirection = {
        x: cos * direction.x - sin * direction.z,
        y: direction.y,
        z: sin * direction.x + cos * direction.z,
    };
    const min = { x: -1.06, y: 1.48, z: 0.14 };
    const max = { x: 1.06, y: 3.9, z: 2.2 };
    let near = 0;
    let far = Math.max(0, maxDistance);
    for (const axis of ['x', 'y', 'z'] as const) {
        const ray = localDirection[axis];
        if (Math.abs(ray) < 1e-8) {
            if (localOrigin[axis] < min[axis] || localOrigin[axis] > max[axis]) return null;
            continue;
        }
        const first = (min[axis] - localOrigin[axis]) / ray;
        const second = (max[axis] - localOrigin[axis]) / ray;
        near = Math.max(near, Math.min(first, second));
        far = Math.min(far, Math.max(first, second));
        if (near > far) return null;
    }
    return near <= maxDistance && far >= 0 ? Math.max(0, near) : null;
}

export interface BellTitanState {
    hp: number;
    maxHp: typeof BELL_TITAN_MAX_HP;
    phase: 1 | 2 | 3;
    shellStage: 0 | 1 | 2;
    action: BellTitanAction;
    actionTime: number;
    coreExposed: boolean;
    coreExposureRemaining: number;
    canDamagePlayer: boolean;
    attackIndex: number;
    actionPulseIndex: number;
    lastAttack: BellTitanAttack | null;
    previousAttack: BellTitanAttack | null;
    cooldowns: BellTitanCooldowns;
    phaseOpenerPending: boolean;
}

export type BellTitanInput =
    | { type: 'wake' }
    | { type: 'tick'; dt: number; playerDistance: number }
    | { type: 'damage'; amount: number; hitZone: BellTitanHitZone }
    | { type: 'stagger'; durationSeconds?: number };

export type BellTitanEvent =
    | { type: 'awakened' }
    | { type: 'action'; action: BellTitanAction; durationSeconds: number }
    | { type: 'strike'; attack: 'sweep' | 'advance' | 'hammer_combo' | 'chain_lash'; index?: 1 | 2; damage: number }
    | { type: 'shockwave'; attack: 'slam' | 'double_toll' | 'bell_storm' | 'vaultbreaker' | 'phase_burst'; index: number; startRadius: number; endRadius: number; speed: number; damage: number }
    | { type: 'impact'; attack: 'slam' | 'vaultbreaker' | 'bell_storm'; index: number; anchor?: 'player' | 'titan'; lateralOffset: number; forwardOffset: number; radius: number; warningSeconds: number; activeSeconds: number; damage: number }
    | { type: 'lane'; attack: 'resonance_cage'; index: number; yawOffset: number; lateralOffset: number; length: number; halfWidth: number; warningSeconds: number; activeSeconds: number; damage: number }
    | { type: 'core'; open: boolean; durationSeconds: number }
    | { type: 'shell-broken'; stage: 1 | 2 }
    | { type: 'hurt'; hitZone: 'core'; damage: number }
    | { type: 'deflected'; damage: number }
    | { type: 'defeated' };

export interface BellTitanTransition {
    state: BellTitanState;
    events: BellTitanEvent[];
}

/**
 * Every tunable timing for the Bell Titan fight, in seconds unless noted.
 * Nothing in this file reads a bare time literal — change pacing here.
 */
export const BELL_TITAN_TIMING = {
    /** Base length of each state-machine action, before the phase speed-up. */
    actionDurations: {
        dormant: 0,
        awaken: BELL_TITAN_AWAKEN_SECONDS,
        idle: 0.55,
        sweep_windup: 0.92,
        sweep_active: 0.26,
        sweep_recovery: 0.62,
        slam_windup: 1.18,
        slam_active: 0.12,
        slam_recovery: 0.68,
        advance_windup: 0.82,
        advance_active: 0.92,
        advance_recovery: 0.62,
        double_toll_windup: 1.42,
        double_toll_active: 0.98,
        double_toll_recovery: 0.72,
        hammer_combo_windup: 1.06,
        hammer_combo_active: 0.86,
        hammer_combo_recovery: 0.68,
        chain_lash_windup: 1.08,
        chain_lash_active: 0.52,
        chain_lash_recovery: 0.64,
        vaultbreaker_windup: 1.42,
        vaultbreaker_active: 0.34,
        vaultbreaker_recovery: 0.76,
        resonance_cage_windup: 1.82,
        resonance_cage_active: 0.72,
        resonance_cage_recovery: 0.82,
        bell_storm_windup: 1.72,
        bell_storm_active: 1.34,
        bell_storm_recovery: 0.78,
        core_open: 0,
        shell_break: BELL_TITAN_SHELL_BREAK_SECONDS,
        stagger: 0.75,
        death: 2.4,
    } as Record<BellTitanAction, number>,

    /**
     * Multiplier applied to windup/recovery/idle durations per phase. Active
     * frames, awaken, shell break and death are deliberately never scaled.
     */
    phaseSpeedScale: { 1: 1, 2: 0.86, 3: 0.72 } as Record<1 | 2 | 3, number>,

    /** Seconds before an attack can be re-selected, before the phase scale. */
    attackCooldowns: {
        sweep: 2.6,
        slam: 3.8,
        advance: 2.9,
        double_toll: 6.2,
        hammer_combo: 4.4,
        chain_lash: 4.5,
        vaultbreaker: 6.6,
        resonance_cage: 9.2,
        bell_storm: 9.6,
    } as BellTitanCooldowns,

    /** Multiplier applied to attack cooldowns per phase. */
    cooldownPhaseScale: { 1: 1, 2: 0.92, 3: 0.82 } as Record<1 | 2 | 3, number>,

    /**
     * Base seconds the core stays open after an attack's recovery — the
     * player's damage window — before coreOpenPhaseScale is applied. Only
     * attacks listed in coreOpenersByPhase for the current phase actually
     * open the core; everything else flows straight back to idle.
     */
    coreOpenSeconds: {
        slam: 2.4,
        advance: 2.3,
        double_toll: 2.6,
        hammer_combo: 2.2,
        vaultbreaker: 2.6,
        resonance_cage: 2.4,
        bell_storm: 2.5,
    } as Partial<Record<BellTitanAttack, number>>,

    /**
     * Multiplier on coreOpenSeconds per phase. Mirrors phaseSpeedScale so the
     * damage windows tighten at the same rate the boss speeds up, keeping the
     * vulnerable share of the fight roughly constant across phases.
     */
    coreOpenPhaseScale: { 1: 1, 2: 0.92, 3: 0.82 } as Record<1 | 2 | 3, number>,

    /**
     * Which attacks earn a core window in each phase. Later phases reserve
     * windows for the heavy committed attacks; quick pokes keep up pressure
     * without handing the player a free turn.
     */
    coreOpenersByPhase: {
        1: ['slam', 'advance'],
        2: ['hammer_combo', 'vaultbreaker', 'double_toll'],
        3: ['resonance_cage', 'bell_storm', 'vaultbreaker', 'double_toll'],
    } as Record<1 | 2 | 3, readonly BellTitanAttack[]>,

    /** Offset into the owning action at which each hit/telegraph fires. */
    contactSeconds: {
        sweep: 0.14,
        slam: 0.09,
        advance: 0.22,
        doubleTollFirst: 0.18,
        doubleTollSecond: 0.54,
        doubleTollThird: 0.84,
        hammerComboFirst: 0.22,
        hammerComboSecond: 0.64,
        chainLash: 0.24,
        vaultbreaker: 0.12,
        vaultbreakerMark: 0.32,
        resonanceCageMark: 0.34,
        resonanceCagePulse: 0.18,
        shellBreakPulse: 0.72,
        bellStormMarks: 0.42,
        bellStorm: [0.18, 0.4, 0.64, 0.9, 1.16] as readonly number[],
    },

    /** Ground telegraph lead-in and damage windows, per attack. */
    telegraphs: {
        slamImpact: { warningSeconds: 0, activeSeconds: 0.24 },
        vaultbreakerImpact: {
            warningSeconds: { 1: 1.34, 2: 1.34, 3: 1.02 } as Record<1 | 2 | 3, number>,
            activeSeconds: 0.28,
        },
        resonanceCageLane: { warningSeconds: 1.46, activeSeconds: 0.38 },
        bellStormImpact: {
            warningSeconds: [1.28, 1.48, 1.68] as readonly number[],
            activeSeconds: 0.25,
        },
    },

    /** Default duration when a stagger arrives without an explicit length. */
    defaultStaggerSeconds: 0.75,
};

const ACTION_DURATIONS = BELL_TITAN_TIMING.actionDurations;
const ATTACK_COOLDOWN_SECONDS = BELL_TITAN_TIMING.attackCooldowns;
const ACTIVE_CONTACT_SECONDS = BELL_TITAN_TIMING.contactSeconds;
const TELEGRAPHS = BELL_TITAN_TIMING.telegraphs;

const PHASE_ATTACKS: Record<1 | 2 | 3, readonly BellTitanAttack[]> = {
    1: ['sweep', 'slam', 'advance', 'chain_lash'],
    2: ['hammer_combo', 'vaultbreaker', 'double_toll', 'chain_lash', 'advance', 'slam', 'sweep'],
    3: ['resonance_cage', 'bell_storm', 'vaultbreaker', 'hammer_combo', 'double_toll', 'chain_lash', 'advance', 'slam'],
};

const ATTACK_DISTANCE: Record<BellTitanAttack, { ideal: number; min: number; max: number }> = {
    sweep: { ideal: 4.2, min: 0, max: 7.2 },
    slam: { ideal: 7, min: 2, max: 14 },
    advance: { ideal: 15, min: 8, max: 40 },
    double_toll: { ideal: 10, min: 4.5, max: 22 },
    hammer_combo: { ideal: 4.8, min: 0, max: 8.5 },
    chain_lash: { ideal: 7, min: 2.5, max: 11 },
    vaultbreaker: { ideal: 10.5, min: 5, max: 24 },
    resonance_cage: { ideal: 11, min: 4, max: 26 },
    bell_storm: { ideal: 12.5, min: 5, max: 28 },
};

function clampDuration(value: number): number {
    return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function getBellTitanActionDuration(action: BellTitanAction, phase: 1 | 2 | 3 = 1): number {
    const base = ACTION_DURATIONS[action];
    if (action === 'awaken' || action === 'shell_break' || action === 'death'
        || action === 'core_open' || action.endsWith('_active')) return base;
    return base * BELL_TITAN_TIMING.phaseSpeedScale[phase];
}

function enterAction(state: BellTitanState, action: BellTitanAction, events: BellTitanEvent[]): BellTitanState {
    const durationSeconds = getBellTitanActionDuration(action, state.phase);
    events.push({ type: 'action', action, durationSeconds });
    return {
        ...state,
        action,
        actionTime: 0,
        actionPulseIndex: 0,
        canDamagePlayer: action === 'sweep_active'
            || action === 'slam_active'
            || action === 'advance_active'
            || action === 'double_toll_active'
            || action === 'hammer_combo_active'
            || action === 'bell_storm_active',
    };
}

function openCore(
    state: BellTitanState,
    durationSeconds: number,
    events: BellTitanEvent[],
): BellTitanState {
    events.push({ type: 'core', open: true, durationSeconds });
    return {
        ...state,
        action: 'core_open',
        actionTime: 0,
        actionPulseIndex: 0,
        coreExposed: true,
        coreExposureRemaining: durationSeconds,
        canDamagePlayer: false,
    };
}

function closeCore(state: BellTitanState, events: BellTitanEvent[]): BellTitanState {
    if (state.coreExposed) events.push({ type: 'core', open: false, durationSeconds: 0 });
    return { ...state, coreExposed: false, coreExposureRemaining: 0 };
}

function createCooldowns(): BellTitanCooldowns {
    return {
        sweep: 0,
        slam: 0,
        advance: 0,
        double_toll: 0,
        hammer_combo: 0,
        chain_lash: 0,
        vaultbreaker: 0,
        resonance_cage: 0,
        bell_storm: 0,
    };
}

function tickCooldowns(cooldowns: BellTitanCooldowns, dt: number): BellTitanCooldowns {
    const next = { ...cooldowns };
    for (const attack of Object.keys(next) as BellTitanAttack[]) {
        next[attack] = Math.max(0, next[attack] - dt);
    }
    return next;
}

function attackDistancePenalty(attack: BellTitanAttack, playerDistance: number): number {
    const range = ATTACK_DISTANCE[attack];
    if (playerDistance < range.min) return (range.min - playerDistance) * 4 + 8;
    if (playerDistance > range.max) return (playerDistance - range.max) * 4 + 8;
    return Math.abs(playerDistance - range.ideal);
}

/**
 * Picks a readable move for the current spacing without falling into a fixed loop.
 * Rotation rank provides deterministic variety; range, cooldown and anti-repeat
 * penalties keep the Titan responsive to what the player is actually doing.
 */
function selectAttack(state: BellTitanState, events: BellTitanEvent[], playerDistance: number): BellTitanState {
    const attacks = PHASE_ATTACKS[state.phase];
    const ready = attacks.filter((attack) => state.cooldowns[attack] <= 0.001);
    const pool = ready.length > 0 ? ready : attacks;
    let chosen = state.phaseOpenerPending ? attacks[0] : pool[0];
    let bestScore = Number.POSITIVE_INFINITY;
    for (const attack of state.phaseOpenerPending ? [chosen] : pool) {
        const rosterIndex = attacks.indexOf(attack);
        const rotationRank = (rosterIndex - (state.attackIndex % attacks.length) + attacks.length) % attacks.length;
        const repetitionPenalty = attack === state.lastAttack ? 18 : attack === state.previousAttack ? 4.5 : 0;
        const score = attackDistancePenalty(attack, playerDistance) + rotationRank * 0.7 + repetitionPenalty;
        if (score < bestScore) {
            chosen = attack;
            bestScore = score;
        }
    }
    const cooldowns = {
        ...state.cooldowns,
        [chosen]: ATTACK_COOLDOWN_SECONDS[chosen] * BELL_TITAN_TIMING.cooldownPhaseScale[state.phase],
    };
    return enterAction({
        ...state,
        attackIndex: state.attackIndex + 1,
        previousAttack: state.lastAttack,
        lastAttack: chosen,
        cooldowns,
        phaseOpenerPending: false,
    }, `${chosen}_windup`, events);
}

/** Core exposure window for the attack that just finished recovering. */
function coreOpenSecondsFor(attack: BellTitanAttack, phase: 1 | 2 | 3): number {
    if (!BELL_TITAN_TIMING.coreOpenersByPhase[phase].includes(attack)) return 0;
    return (BELL_TITAN_TIMING.coreOpenSeconds[attack] ?? 0) * BELL_TITAN_TIMING.coreOpenPhaseScale[phase];
}

/** Ends an attack: opens the core if this phase grants a window, else idles. */
function finishAttackRecovery(state: BellTitanState, attack: BellTitanAttack, events: BellTitanEvent[]): BellTitanState {
    const seconds = coreOpenSecondsFor(attack, state.phase);
    return seconds > 0 ? openCore(state, seconds, events) : enterAction(state, 'idle', events);
}

function nextTimedAction(
    state: BellTitanState,
    events: BellTitanEvent[],
    playerDistance: number,
): BellTitanState {
    switch (state.action) {
        case 'awaken': return enterAction(state, 'idle', events);
        case 'idle': return selectAttack(state, events, playerDistance);
        case 'sweep_windup': return enterAction(state, 'sweep_active', events);
        case 'sweep_active': return enterAction(state, 'sweep_recovery', events);
        case 'sweep_recovery': return finishAttackRecovery(state, 'sweep', events);
        case 'slam_windup': return enterAction(state, 'slam_active', events);
        case 'slam_active': return enterAction(state, 'slam_recovery', events);
        case 'slam_recovery': return finishAttackRecovery(state, 'slam', events);
        case 'advance_windup': return enterAction(state, 'advance_active', events);
        case 'advance_active': return enterAction(state, 'advance_recovery', events);
        case 'advance_recovery': return finishAttackRecovery(state, 'advance', events);
        case 'double_toll_windup': return enterAction(state, 'double_toll_active', events);
        case 'double_toll_active': return enterAction(state, 'double_toll_recovery', events);
        case 'double_toll_recovery': return finishAttackRecovery(state, 'double_toll', events);
        case 'hammer_combo_windup': return enterAction(state, 'hammer_combo_active', events);
        case 'hammer_combo_active': return enterAction(state, 'hammer_combo_recovery', events);
        case 'hammer_combo_recovery': return finishAttackRecovery(state, 'hammer_combo', events);
        case 'chain_lash_windup': return enterAction(state, 'chain_lash_active', events);
        case 'chain_lash_active': return enterAction(state, 'chain_lash_recovery', events);
        case 'chain_lash_recovery': return finishAttackRecovery(state, 'chain_lash', events);
        case 'vaultbreaker_windup': return enterAction(state, 'vaultbreaker_active', events);
        case 'vaultbreaker_active': return enterAction(state, 'vaultbreaker_recovery', events);
        case 'vaultbreaker_recovery': return finishAttackRecovery(state, 'vaultbreaker', events);
        case 'resonance_cage_windup': return enterAction(state, 'resonance_cage_active', events);
        case 'resonance_cage_active': return enterAction(state, 'resonance_cage_recovery', events);
        case 'resonance_cage_recovery': return finishAttackRecovery(state, 'resonance_cage', events);
        case 'bell_storm_windup': return enterAction(state, 'bell_storm_active', events);
        case 'bell_storm_active': return enterAction(state, 'bell_storm_recovery', events);
        case 'bell_storm_recovery': return finishAttackRecovery(state, 'bell_storm', events);
        case 'shell_break': return enterAction(state, 'idle', events);
        case 'stagger': return enterAction(state, 'idle', events);
        default: return state;
    }
}

function emitActiveCues(_previous: BellTitanState, state: BellTitanState, events: BellTitanEvent[]): BellTitanState {
    const phaseBonus = state.phase - 1;
    if (state.action === 'sweep_active' && state.actionPulseIndex === 0
        && state.actionTime >= ACTIVE_CONTACT_SECONDS.sweep) {
        events.push({ type: 'strike', attack: 'sweep', damage: 11 + phaseBonus * 2 });
        state = { ...state, actionPulseIndex: 1 };
    } else if (state.action === 'advance_active' && state.actionPulseIndex === 0
        && state.actionTime >= ACTIVE_CONTACT_SECONDS.advance) {
        events.push({ type: 'strike', attack: 'advance', damage: 13 + phaseBonus * 2 });
        state = { ...state, actionPulseIndex: 1 };
    } else if (state.action === 'slam_active' && state.actionPulseIndex === 0
        && state.actionTime >= ACTIVE_CONTACT_SECONDS.slam) {
        events.push({ type: 'shockwave', attack: 'slam', index: 1, startRadius: 2.5, endRadius: 19, speed: 8 + phaseBonus * 1.25, damage: 9 + phaseBonus * 2 });
        events.push({
            type: 'impact', attack: 'slam', index: 1,
            anchor: 'titan',
            lateralOffset: 0, forwardOffset: 0, radius: BELL_TITAN_ATTACK_GEOMETRY.slam.radius,
            warningSeconds: TELEGRAPHS.slamImpact.warningSeconds,
            activeSeconds: TELEGRAPHS.slamImpact.activeSeconds,
            damage: 12 + phaseBonus * 2,
        });
        state = { ...state, actionPulseIndex: 1 };
    }

    if (state.action === 'double_toll_active') {
        if (state.actionPulseIndex === 0 && state.actionTime >= ACTIVE_CONTACT_SECONDS.doubleTollFirst) {
            events.push({ type: 'shockwave', attack: 'double_toll', index: 1, startRadius: 3, endRadius: 19, speed: 8 + phaseBonus, damage: 8 + phaseBonus * 2 });
            state = { ...state, actionPulseIndex: 1 };
        }
        if (state.actionPulseIndex === 1 && state.actionTime >= ACTIVE_CONTACT_SECONDS.doubleTollSecond) {
            events.push({ type: 'shockwave', attack: 'double_toll', index: 2, startRadius: 5, endRadius: 19, speed: 9.5 + phaseBonus, damage: 8 + phaseBonus * 2 });
            state = { ...state, actionPulseIndex: 2 };
        }
        if (state.phase === 3 && state.actionPulseIndex === 2
            && state.actionTime >= ACTIVE_CONTACT_SECONDS.doubleTollThird) {
            events.push({ type: 'shockwave', attack: 'double_toll', index: 3, startRadius: 2, endRadius: 19, speed: 12, damage: 13 });
            state = { ...state, actionPulseIndex: 3 };
        }
    }
    if (state.action === 'hammer_combo_active') {
        if (state.actionPulseIndex === 0 && state.actionTime >= ACTIVE_CONTACT_SECONDS.hammerComboFirst) {
            events.push({ type: 'strike', attack: 'hammer_combo', index: 1, damage: 12 + phaseBonus * 2 });
            state = { ...state, actionPulseIndex: 1 };
        }
        if (state.actionPulseIndex === 1 && state.actionTime >= ACTIVE_CONTACT_SECONDS.hammerComboSecond) {
            events.push({ type: 'strike', attack: 'hammer_combo', index: 2, damage: 15 + phaseBonus * 2 });
            state = { ...state, actionPulseIndex: 2 };
        }
    }
    if (state.action === 'chain_lash_active' && state.actionPulseIndex === 0
        && state.actionTime >= ACTIVE_CONTACT_SECONDS.chainLash) {
        events.push({ type: 'strike', attack: 'chain_lash', damage: 14 + phaseBonus * 2 });
        state = { ...state, actionPulseIndex: 1 };
    }
    if (state.action === 'vaultbreaker_windup' && state.actionPulseIndex === 0
        && state.actionTime >= ACTIVE_CONTACT_SECONDS.vaultbreakerMark) {
        events.push({
            type: 'impact', attack: 'vaultbreaker', index: 1,
            lateralOffset: 0, forwardOffset: 0, radius: 3.15,
            warningSeconds: TELEGRAPHS.vaultbreakerImpact.warningSeconds[state.phase],
            activeSeconds: TELEGRAPHS.vaultbreakerImpact.activeSeconds,
            damage: 17 + phaseBonus * 2,
        });
        state = { ...state, actionPulseIndex: 1 };
    }
    if (state.action === 'vaultbreaker_active' && state.actionPulseIndex === 0
        && state.actionTime >= ACTIVE_CONTACT_SECONDS.vaultbreaker) {
        events.push({
            type: 'shockwave', attack: 'vaultbreaker', index: 1,
            startRadius: 2.2, endRadius: 19, speed: 11.5 + phaseBonus, damage: 11 + phaseBonus * 2,
        });
        state = { ...state, actionPulseIndex: 1 };
    }
    if (state.action === 'resonance_cage_windup' && state.actionPulseIndex === 0
        && state.actionTime >= ACTIVE_CONTACT_SECONDS.resonanceCageMark) {
        const laneOffsets = [-7.2, 0, 7.2] as const;
        laneOffsets.forEach((lateralOffset, index) => events.push({
            type: 'lane', attack: 'resonance_cage', index: index + 1,
            yawOffset: 0, lateralOffset, length: 34, halfWidth: 1.15,
            warningSeconds: TELEGRAPHS.resonanceCageLane.warningSeconds,
            activeSeconds: TELEGRAPHS.resonanceCageLane.activeSeconds,
            damage: 14,
        }));
        [-5.2, 5.2].forEach((lateralOffset, index) => events.push({
            type: 'lane', attack: 'resonance_cage', index: index + 4,
            yawOffset: Math.PI / 2, lateralOffset, length: 34, halfWidth: 1.05,
            warningSeconds: TELEGRAPHS.resonanceCageLane.warningSeconds,
            activeSeconds: TELEGRAPHS.resonanceCageLane.activeSeconds,
            damage: 14,
        }));
        state = { ...state, actionPulseIndex: 1 };
    }
    if (state.action === 'resonance_cage_active' && state.actionPulseIndex === 0
        && state.actionTime >= ACTIVE_CONTACT_SECONDS.resonanceCagePulse) {
        events.push({
            type: 'shockwave', attack: 'phase_burst', index: 1,
            startRadius: 2.6, endRadius: 18.5, speed: 9.8, damage: 12,
        });
        state = { ...state, actionPulseIndex: 1 };
    }
    if (state.action === 'bell_storm_windup' && state.actionPulseIndex === 0
        && state.actionTime >= ACTIVE_CONTACT_SECONDS.bellStormMarks) {
        const offsets = [
            { lateral: 0, forward: 0 },
            { lateral: -5.4, forward: 2.2 },
            { lateral: 5.4, forward: -2.2 },
        ] as const;
        offsets.forEach((offset, index) => events.push({
            type: 'impact', attack: 'bell_storm', index: index + 1,
            lateralOffset: offset.lateral, forwardOffset: offset.forward,
            radius: index === 0 ? 2.7 : 2.35,
            warningSeconds: TELEGRAPHS.bellStormImpact.warningSeconds[index],
            activeSeconds: TELEGRAPHS.bellStormImpact.activeSeconds,
            damage: 13 + index,
        }));
        state = { ...state, actionPulseIndex: 1 };
    }
    if (state.action === 'bell_storm_active') {
        for (let index = state.actionPulseIndex; index < ACTIVE_CONTACT_SECONDS.bellStorm.length; index += 1) {
            if (state.actionTime < ACTIVE_CONTACT_SECONDS.bellStorm[index]) break;
            events.push({
                type: 'shockwave',
                attack: 'bell_storm',
                index: index + 1,
                startRadius: 1.5 + index * 1.35,
                endRadius: 19,
                speed: 8.8 + index * 0.95,
                damage: 9 + index,
            });
            state = { ...state, actionPulseIndex: index + 1 };
        }
    }
    if (state.action === 'shell_break' && state.actionPulseIndex === 0
        && state.actionTime >= ACTIVE_CONTACT_SECONDS.shellBreakPulse) {
        events.push({
            type: 'shockwave', attack: 'phase_burst', index: 1,
            startRadius: 2.4, endRadius: 19, speed: state.phase === 3 ? 12 : 10.5,
            damage: state.phase === 3 ? 14 : 11,
        });
        state = { ...state, actionPulseIndex: 1 };
    }
    return state;
}

function resolveDamage(state: BellTitanState, input: Extract<BellTitanInput, { type: 'damage' }>): BellTitanTransition {
    if (state.action === 'dormant' || state.action === 'awaken' || state.action === 'death') {
        return { state, events: [] };
    }

    const events: BellTitanEvent[] = [];
    const coreHit = input.hitZone === 'core' && state.coreExposed && state.action === 'core_open';
    const multiplier = coreHit ? BELL_TITAN_CORE_DAMAGE_MULTIPLIER : BELL_TITAN_CLOSED_DAMAGE_MULTIPLIER;
    const damage = Math.min(BELL_TITAN_DAMAGE_CAP, clampDuration(input.amount) * multiplier);
    let next: BellTitanState = { ...state, hp: Math.max(0, state.hp - damage) };
    if (coreHit && damage > 0) events.push({ type: 'hurt', hitZone: 'core', damage });
    else if (input.amount > 0) events.push({ type: 'deflected', damage: clampDuration(input.amount) });

    if (next.hp <= 0) {
        next = closeCore(next, events);
        next = { ...next, action: 'death', actionTime: 0, actionPulseIndex: 0, canDamagePlayer: false };
        events.push({ type: 'defeated' });
        return { state: next, events };
    }

    const hpFraction = next.hp / next.maxHp;
    const nextPhase: 1 | 2 | 3 = hpFraction <= 0.34 ? 3 : hpFraction <= 0.67 ? 2 : 1;
    if (nextPhase > state.phase) {
        const stage = nextPhase === 2 ? 1 : 2;
        next = {
            ...next,
            phase: nextPhase,
            shellStage: stage,
            attackIndex: 0,
            previousAttack: null,
            lastAttack: null,
            cooldowns: createCooldowns(),
            phaseOpenerPending: true,
        };
        events.length = 0;
        events.push({ type: 'shell-broken', stage });
        next = closeCore(next, events);
        next = enterAction(next, 'shell_break', events);
    }
    return { state: next, events };
}

export function createBellTitanState(overrides: Partial<BellTitanState> = {}): BellTitanState {
    return {
        hp: BELL_TITAN_MAX_HP,
        maxHp: BELL_TITAN_MAX_HP,
        phase: 1,
        shellStage: 0,
        action: 'dormant',
        actionTime: 0,
        coreExposed: false,
        coreExposureRemaining: 0,
        canDamagePlayer: false,
        attackIndex: 0,
        actionPulseIndex: 0,
        lastAttack: null,
        previousAttack: null,
        cooldowns: createCooldowns(),
        phaseOpenerPending: false,
        ...overrides,
    };
}

export function advanceBellTitan(state: BellTitanState, input: BellTitanInput): BellTitanTransition {
    if (input.type === 'damage') return resolveDamage(state, input);
    const events: BellTitanEvent[] = [];
    if (input.type === 'wake') {
        if (state.action !== 'dormant') return { state, events };
        events.push({ type: 'awakened' });
        return { state: enterAction(state, 'awaken', events), events };
    }
    if (input.type === 'stagger') {
        if (state.action === 'dormant' || state.action === 'awaken' || state.action === 'death' || state.action === 'shell_break') {
            return { state, events };
        }
        const fallback = BELL_TITAN_TIMING.defaultStaggerSeconds;
        const next = enterAction(closeCore(state, events), 'stagger', events);
        return {
            state: {
                ...next,
                actionTime: Math.max(0, ACTION_DURATIONS.stagger - clampDuration(input.durationSeconds ?? fallback)),
            },
            events,
        };
    }

    const dt = clampDuration(input.dt);
    if (dt <= 0 || state.action === 'dormant') return { state, events };
    const cooledState = { ...state, cooldowns: tickCooldowns(state.cooldowns, dt) };
    if (cooledState.action === 'death') {
        return {
            state: { ...cooledState, actionTime: Math.min(ACTION_DURATIONS.death, cooledState.actionTime + dt) },
            events,
        };
    }
    if (cooledState.action === 'core_open') {
        const remaining = Math.max(0, cooledState.coreExposureRemaining - dt);
        if (remaining > 0) return { state: { ...cooledState, actionTime: cooledState.actionTime + dt, coreExposureRemaining: remaining }, events };
        const closed = closeCore({ ...cooledState, actionTime: cooledState.actionTime + dt }, events);
        return { state: enterAction(closed, 'idle', events), events };
    }

    const previous = cooledState;
    let next = { ...cooledState, actionTime: cooledState.actionTime + dt };
    if (next.actionTime >= getBellTitanActionDuration(next.action, next.phase)) {
        next = nextTimedAction(next, events, input.playerDistance);
    }
    next = emitActiveCues(previous, next, events);
    return { state: next, events };
}

export interface BellTitanSnapshot extends BellTitanState {
    entityId: number | null;
}

export interface BellTitanRenderAnchor extends BellTitanPoint {
    yaw: number;
    hurtUntil: number;
}

export interface BellTitanAttackAnchor extends BellTitanPoint {
    yaw: number;
}

export interface BellTitanEntityHandle {
    id: number;
    kind: string;
    pos: BellTitanPoint;
    vel: BellTitanPoint;
    width: number;
    height: number;
    hp: number;
    maxHp: number;
    damageMultiplier: number;
    grounded: boolean;
    aggro: boolean;
    yaw: number;
    hurtUntil: number;
    regionId?: string;
    combatAction?: {
        id: string;
        phase: 'anticipation' | 'active' | 'recovery';
        elapsed: number;
        duration: number;
        locksMovement: boolean;
        targetYaw: number;
    };
}

export interface BellTitanEntitySink {
    spawn(
        kind: string,
        x: number,
        y: number,
        z: number,
        options: { bossId: string; regionId: string; aggroGraceSeconds: number },
    ): BellTitanEntityHandle | null;
    getEntity(id: number): BellTitanEntityHandle | undefined;
    despawn(id: number): void;
    defeat(id: number): void;
}

export interface BellTitanArenaController {
    configure(bounds: BellTitanArenaBounds): void;
    spawnShockwave(origin: BellTitanPoint, spec: BellTitanShockwaveSpec): number;
    spawnImpact(origin: BellTitanPoint, spec: BellTitanImpactSpec): number;
    spawnLane(origin: BellTitanPoint, spec: BellTitanLaneSpec): number;
    breakShell(origin: BellTitanPoint, stage: 1 | 2): readonly BellTitanDebris[];
    tick(
        dtSeconds: number,
        player: BellTitanPoint,
        hasLineOfSight?: (origin: BellTitanPoint, player: BellTitanPoint) => boolean,
    ): BellTitanArenaTick;
    getShockwaves(): readonly BellTitanShockwaveRenderState[];
    getImpacts(): readonly BellTitanImpactRenderState[];
    getLanes(): readonly BellTitanLaneRenderState[];
    getDebris(): readonly BellTitanDebris[];
    reset(): void;
}

export interface BellTitanProgressionSink {
    markVaultTitanDefeated(vaultId: string, entityId: number): boolean;
}

export interface BellTitanEventSink {
    emit(name: string, payload: Record<string, unknown>): void;
}

export interface BellTitanEncounterDependencies {
    arena: BellTitanArenaController;
    entities: BellTitanEntitySink;
    progression: BellTitanProgressionSink;
    events: BellTitanEventSink;
    hasLineOfSight(origin: BellTitanPoint, target: BellTitanPoint): boolean;
}

function horizontalDirection(from: BellTitanPoint, to: BellTitanPoint): { x: number; z: number } {
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const length = Math.hypot(dx, dz) || 1;
    return { x: dx / length, z: dz / length };
}

export function isBellTitanSweepHit(
    origin: BellTitanPoint,
    forward: { x: number; z: number },
    target: BellTitanPoint,
    range: number = BELL_TITAN_ATTACK_GEOMETRY.sweep.range,
    halfAngle: number = BELL_TITAN_ATTACK_GEOMETRY.sweep.halfAngle,
): boolean {
    const dx = target.x - origin.x;
    const dz = target.z - origin.z;
    const distance = Math.hypot(dx, dz);
    if (distance > range || Math.abs(target.y - origin.y) > 3.2) return false;
    if (distance < 0.001) return true;
    const forwardLength = Math.hypot(forward.x, forward.z) || 1;
    const dot = (dx / distance) * (forward.x / forwardLength) + (dz / distance) * (forward.z / forwardLength);
    return dot >= Math.cos(halfAngle);
}

export function isBellTitanAdvanceHit(
    origin: BellTitanPoint,
    forward: { x: number; z: number },
    target: BellTitanPoint,
    length: number = BELL_TITAN_ATTACK_GEOMETRY.advance.length,
    halfWidth: number = BELL_TITAN_ATTACK_GEOMETRY.advance.halfWidth,
): boolean {
    const dx = target.x - origin.x;
    const dz = target.z - origin.z;
    const along = dx * forward.x + dz * forward.z;
    const across = Math.abs(dx * forward.z - dz * forward.x);
    return along >= 0 && along <= length && across <= halfWidth && Math.abs(target.y - origin.y) <= 3.2;
}

function actionPhase(action: BellTitanAction): 'anticipation' | 'active' | 'recovery' {
    if (action.endsWith('_windup') || action === 'awaken') return 'anticipation';
    if (action.endsWith('_active')) return 'active';
    return 'recovery';
}

export class BellTitanEncounterCore {
    private state = createBellTitanState();
    private layout: VaultLayout | null = null;
    private vaultId: string | null = null;
    private entityId: number | null = null;
    private clock = 0;
    private facing = { x: 0, z: 1 };
    private actionOrigin: BellTitanPoint = { x: 0, y: 0, z: 0 };
    private renderAnchor: BellTitanRenderAnchor | null = null;
    private arenaAnchor: BellTitanPoint | null = null;
    private arenaVaultId: string | null = null;
    private arenaLightsReady = false;
    private deathEndsAt = 0;

    constructor(private readonly deps: BellTitanEncounterDependencies) {}

    getSnapshot(): BellTitanSnapshot {
        return { ...this.state, entityId: this.entityId };
    }

    getRenderAnchor(): BellTitanRenderAnchor | null {
        return this.renderAnchor ? { ...this.renderAnchor } : null;
    }

    getAttackAnchor(): BellTitanAttackAnchor | null {
        if (!this.state.action.endsWith('_windup')) return null;
        return {
            ...this.actionOrigin,
            yaw: Math.atan2(this.facing.x, this.facing.z),
        };
    }

    getArenaAnchor(): BellTitanPoint | null {
        return this.arenaAnchor ? { ...this.arenaAnchor } : null;
    }

    areArenaLightsReady(): boolean {
        return this.arenaLightsReady;
    }

    configureArena(vaultId: string, layout: VaultLayout, cleared = false): BellTitanPoint | null {
        if (this.arenaVaultId === vaultId && this.arenaAnchor) {
            this.arenaLightsReady ||= cleared;
            return { ...this.arenaAnchor };
        }
        const arenaRoom = layout.rooms.find((room) => room.kind === 'arena');
        if (!arenaRoom) return null;
        this.deps.arena.configure({
            centerX: arenaRoom.x,
            centerZ: arenaRoom.z,
            radius: Math.max(8, Math.min(arenaRoom.width, arenaRoom.depth) * 0.5 - 6.5),
        });
        this.arenaVaultId = vaultId;
        this.arenaAnchor = { x: arenaRoom.x + 0.5, y: arenaRoom.y + 1, z: arenaRoom.z + 0.5 };
        this.arenaLightsReady = cleared;
        return { ...this.arenaAnchor };
    }

    getShockwaves(): readonly BellTitanShockwaveRenderState[] {
        return this.deps.arena.getShockwaves();
    }

    getDebris(): readonly BellTitanDebris[] {
        return this.deps.arena.getDebris();
    }

    getImpacts(): readonly BellTitanImpactRenderState[] {
        return this.deps.arena.getImpacts();
    }

    getLanes(): readonly BellTitanLaneRenderState[] {
        return this.deps.arena.getLanes();
    }

    getAnimationTime(): number {
        return this.clock;
    }

    spawn(vaultId: string, layout: VaultLayout): number | null {
        return this.ensure(vaultId, layout);
    }

    ensure(vaultId: string, layout: VaultLayout): number | null {
        if (this.entityId !== null && this.vaultId === vaultId && this.deps.entities.getEntity(this.entityId)) {
            return this.entityId;
        }
        if (this.entityId !== null || this.layout !== null || this.vaultId !== null) this.reset();
        const arenaAnchor = this.configureArena(vaultId, layout);
        if (!arenaAnchor) return null;
        this.layout = layout;
        this.vaultId = vaultId;
        const entity = this.deps.entities.spawn('bell_titan', arenaAnchor.x, arenaAnchor.y, arenaAnchor.z, {
            bossId: 'bell_titan',
            regionId: vaultId,
            aggroGraceSeconds: 0,
        });
        if (!entity) return null;
        this.entityId = entity.id;
        this.arenaLightsReady = false;
        entity.aggro = true;
        entity.damageMultiplier = 1;
        entity.hp = BELL_TITAN_MAX_HP;
        entity.maxHp = BELL_TITAN_MAX_HP;
        this.captureRenderAnchor(entity);
        const transition = advanceBellTitan(createBellTitanState(), { type: 'wake' });
        this.state = transition.state;
        this.applyEvents(transition.events, entity, { x: entity.pos.x, y: entity.pos.y, z: entity.pos.z });
        this.syncCombatAction(entity);
        this.deps.events.emit('vault:encounter-started', { vaultId, room: 'arena', entityIds: [entity.id] });
        return entity.id;
    }

    tick(dtSeconds: number, player: BellTitanPoint): number {
        const dt = clampDuration(Math.min(0.1, dtSeconds));
        this.clock += dt;
        if (this.entityId === null) {
            if (this.state.action === 'death') {
                this.state = advanceBellTitan(this.state, { type: 'tick', dt, playerDistance: 0 }).state;
                if (this.clock >= this.deathEndsAt) this.renderAnchor = null;
            }
            return 0;
        }
        const entity = this.deps.entities.getEntity(this.entityId);
        if (!entity) return 0;
        this.captureRenderAnchor(entity);
        if (this.state.action === 'idle') {
            this.facing = horizontalDirection(entity.pos, player);
            entity.yaw = Math.atan2(this.facing.x, this.facing.z);
        }
        const previous = this.state;
        const transition = advanceBellTitan(this.state, {
            type: 'tick',
            dt,
            playerDistance: Math.hypot(player.x - entity.pos.x, player.z - entity.pos.z),
        });
        this.state = transition.state;
        if (transition.events.some((event) => event.type === 'action' && event.action.endsWith('_windup'))) {
            this.facing = horizontalDirection(entity.pos, player);
            this.actionOrigin = { x: entity.pos.x, y: entity.pos.y, z: entity.pos.z };
            entity.yaw = Math.atan2(this.facing.x, this.facing.z);
        }
        let damage = this.applyEvents(transition.events, entity, player);
        this.applyAuthoredMovement(entity, previous.action, dt, player);
        this.syncCombatAction(entity);
        const arenaTick = this.deps.arena.tick(dt, player, this.deps.hasLineOfSight);
        damage += arenaTick.playerDamage;
        return damage;
    }

    applyHit(entityId: number, amount: number, hitZone: BellTitanHitZone = 'shell'): 'damaged' | 'blocked' | 'none' {
        if (entityId !== this.entityId) return 'none';
        const entity = this.deps.entities.getEntity(entityId);
        if (!entity || entity.hp <= 0) return 'none';
        const previousHp = this.state.hp;
        const transition = advanceBellTitan(this.state, { type: 'damage', amount, hitZone });
        this.state = transition.state;
        const damage = Math.max(0, previousHp - this.state.hp);
        if (damage <= 0) {
            this.applyEvents(transition.events, entity, entity.pos);
            return 'blocked';
        }
        entity.hp = this.state.hp;
        entity.hurtUntil = Date.now() + 180;
        this.applyEvents(transition.events, entity, entity.pos);
        this.syncCombatAction(entity);
        if (this.vaultId) {
            this.deps.events.emit('boss:damaged', {
                bossId: 'bell_titan', entityId, hp: entity.hp, maxHp: entity.maxHp,
            });
        }
        if (this.state.action === 'death') this.deps.entities.defeat(entityId);
        return 'damaged';
    }

    handleEntityDeath(entityId: number): boolean {
        if (entityId !== this.entityId || !this.vaultId) return false;
        const vaultId = this.vaultId;
        const entity = this.deps.entities.getEntity(entityId);
        if (entity) this.captureRenderAnchor(entity);
        this.state = { ...this.state, hp: 0, action: 'death', actionTime: 0, canDamagePlayer: false, coreExposed: false, coreExposureRemaining: 0 };
        this.deathEndsAt = this.clock + ACTION_DURATIONS.death;
        this.deps.arena.reset();
        this.deps.progression.markVaultTitanDefeated(vaultId, entityId);
        this.arenaLightsReady = true;
        this.deps.events.emit('vault:titan-defeated', { vaultId, entityId });
        this.deps.events.emit('vault:encounter-completed', { vaultId, room: 'arena' });
        this.entityId = null;
        this.layout = null;
        this.vaultId = null;
        return true;
    }

    cleanup(): void {
        this.reset();
    }

    reset(): void {
        if (this.entityId !== null && this.deps.entities.getEntity(this.entityId)) {
            this.deps.entities.despawn(this.entityId);
            this.deps.events.emit('boss:cleared', {});
        }
        this.deps.arena.reset();
        this.state = createBellTitanState();
        this.layout = null;
        this.vaultId = null;
        this.entityId = null;
        this.renderAnchor = null;
        this.arenaAnchor = null;
        this.arenaVaultId = null;
        this.arenaLightsReady = false;
        this.deathEndsAt = 0;
        this.facing = { x: 0, z: 1 };
        this.actionOrigin = { x: 0, y: 0, z: 0 };
    }

    private applyEvents(events: readonly BellTitanEvent[], entity: BellTitanEntityHandle, player: BellTitanPoint): number {
        let damage = 0;
        for (const event of events) {
            if (!this.vaultId) continue;
            if (event.type === 'awakened') {
                this.deps.events.emit('vault:titan-awakened', { vaultId: this.vaultId, entityId: entity.id });
            } else if (event.type === 'action') {
                this.deps.events.emit('vault:titan-action', {
                    vaultId: this.vaultId,
                    entityId: entity.id,
                    action: event.action,
                    durationSeconds: event.durationSeconds,
                });
            } else if (event.type === 'core') {
                this.deps.events.emit('vault:titan-core', {
                    vaultId: this.vaultId,
                    entityId: entity.id,
                    open: event.open,
                    durationSeconds: event.durationSeconds,
                });
            } else if (event.type === 'shell-broken') {
                this.deps.arena.breakShell({ x: entity.pos.x, y: entity.pos.y, z: entity.pos.z }, event.stage);
                this.deps.events.emit('vault:titan-shell-broken', {
                    vaultId: this.vaultId,
                    entityId: entity.id,
                    stage: event.stage,
                });
                this.deps.events.emit('boss:phase', { bossId: 'bell_titan', entityId: entity.id, phase: this.state.phase });
            } else if (event.type === 'shockwave') {
                this.deps.arena.spawnShockwave(
                    { x: entity.pos.x, y: entity.pos.y + 0.25, z: entity.pos.z },
                    event,
                );
                this.deps.events.emit('vault:titan-strike', {
                    vaultId: this.vaultId,
                    entityId: entity.id,
                    attack: event.attack,
                    index: event.index,
                });
            } else if (event.type === 'impact') {
                const perpendicular = { x: this.facing.z, z: -this.facing.x };
                const target = event.anchor === 'titan' ? entity.pos : player;
                this.deps.arena.spawnImpact({
                    x: target.x + perpendicular.x * event.lateralOffset + this.facing.x * event.forwardOffset,
                    y: this.arenaAnchor?.y ?? entity.pos.y,
                    z: target.z + perpendicular.z * event.lateralOffset + this.facing.z * event.forwardOffset,
                }, event);
            } else if (event.type === 'lane') {
                const yaw = entity.yaw + event.yawOffset;
                const right = { x: Math.cos(yaw), z: -Math.sin(yaw) };
                const center = this.arenaAnchor ?? entity.pos;
                this.deps.arena.spawnLane({
                    x: center.x + right.x * event.lateralOffset,
                    y: center.y,
                    z: center.z + right.z * event.lateralOffset,
                }, { ...event, yaw });
            } else if (event.type === 'strike') {
                let hit: boolean;
                if (event.attack === 'advance') {
                    const geometry = BELL_TITAN_ATTACK_GEOMETRY.advance;
                    hit = isBellTitanAdvanceHit(
                        this.actionOrigin,
                        this.facing,
                        player,
                        geometry.length,
                        geometry.halfWidth,
                    );
                } else {
                    const geometry = BELL_TITAN_ATTACK_GEOMETRY[event.attack];
                    hit = isBellTitanSweepHit(
                        this.actionOrigin,
                        this.facing,
                        player,
                        geometry.range,
                        geometry.halfAngle,
                    );
                }
                if (hit && this.deps.hasLineOfSight(entity.pos, player)) damage += event.damage;
                this.deps.events.emit('vault:titan-strike', {
                    vaultId: this.vaultId,
                    entityId: entity.id,
                    attack: event.attack,
                    index: event.index,
                });
            } else if (event.type === 'deflected') {
                this.deps.events.emit('vault:titan-deflected', {
                    vaultId: this.vaultId,
                    entityId: entity.id,
                    damage: event.damage,
                });
            } else if (event.type === 'hurt') {
                this.deps.events.emit('vault:titan-hurt', {
                    vaultId: this.vaultId,
                    entityId: entity.id,
                    hitZone: event.hitZone,
                    damage: event.damage,
                });
            }
        }
        return damage;
    }

    private applyAuthoredMovement(
        entity: BellTitanEntityHandle,
        previousAction: BellTitanAction,
        dt: number,
        player: BellTitanPoint,
    ): void {
        const pursuitRecovery = this.state.action === 'sweep_recovery'
            || this.state.action === 'advance_recovery'
            || this.state.action === 'hammer_combo_recovery'
            || this.state.action === 'chain_lash_recovery';
        if (this.state.action === 'idle' || pursuitRecovery) {
            const direction = horizontalDirection(entity.pos, player);
            const distance = Math.hypot(player.x - entity.pos.x, player.z - entity.pos.z);
            this.facing = direction;
            entity.yaw = Math.atan2(direction.x, direction.z);
            if (distance > 5.25) {
                const baseSpeed = this.state.phase === 3 ? 6.6 : this.state.phase === 2 ? 5.9 : 5.2;
                const speed = pursuitRecovery ? baseSpeed * 0.58 : baseSpeed;
                entity.vel.x = direction.x * speed;
                entity.vel.z = direction.z * speed;
            } else {
                // Close-range lateral pressure prevents a stationary damage dummy
                // without obscuring the next locked windup direction.
                const baseStrafe = this.state.phase === 1 ? 1.1 : this.state.phase === 2 ? 1.65 : 2.1;
                const strafe = pursuitRecovery ? baseStrafe * 0.45 : baseStrafe;
                const side = this.state.attackIndex % 2 === 0 ? 1 : -1;
                entity.vel.x = direction.z * strafe * side;
                entity.vel.z = -direction.x * strafe * side;
            }
            return;
        }
        if (this.state.action === 'advance_active') {
            const speed = this.state.phase === 3 ? 18.5 : this.state.phase === 2 ? 17 : 15.5;
            entity.vel.x = this.facing.x * speed;
            entity.vel.z = this.facing.z * speed;
            return;
        }
        if (this.state.action === 'vaultbreaker_active') {
            const speed = this.state.phase === 3 ? 11.5 : 9.8;
            entity.vel.x = this.facing.x * speed;
            entity.vel.z = this.facing.z * speed;
            return;
        }
        if (previousAction === 'advance_active' || previousAction === 'vaultbreaker_active'
            || this.state.action !== previousAction) {
            entity.vel.x = 0;
            entity.vel.z = 0;
        } else {
            const damping = Math.max(0, 1 - dt * 12);
            entity.vel.x *= damping;
            entity.vel.z *= damping;
        }
    }

    private syncCombatAction(entity: BellTitanEntityHandle): void {
        const duration = this.state.action === 'core_open'
            ? this.state.coreExposureRemaining
            : getBellTitanActionDuration(this.state.action, this.state.phase);
        entity.combatAction = {
            id: this.state.action,
            phase: actionPhase(this.state.action),
            elapsed: this.state.actionTime,
            duration: Math.max(0.001, duration),
            locksMovement: this.state.action !== 'advance_active' && this.state.action !== 'vaultbreaker_active',
            targetYaw: entity.yaw,
        };
    }

    private captureRenderAnchor(entity: BellTitanEntityHandle): void {
        this.renderAnchor = {
            x: entity.pos.x,
            y: entity.pos.y,
            z: entity.pos.z,
            yaw: entity.yaw,
            hurtUntil: entity.hurtUntil,
        };
    }
}
import type {
    BellTitanArenaBounds,
    BellTitanArenaTick,
    BellTitanDebris,
    BellTitanImpactRenderState,
    BellTitanImpactSpec,
    BellTitanLaneRenderState,
    BellTitanLaneSpec,
    BellTitanPoint,
    BellTitanShockwaveRenderState,
    BellTitanShockwaveSpec,
} from './BellTitanArena';
import type { VaultLayout } from '../world/resonantVaults';
