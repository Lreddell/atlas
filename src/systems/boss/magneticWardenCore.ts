// Magnetic Warden encounter core: the pure, deterministic state machine behind
// the three-form fight. No THREE, no enums, no world or entity access, so the
// whole fight (attack selection, telegraph timing, form transitions, tethers,
// the polarity metronome, the Flux meter) is unit-testable under node --test.
//
// THE ONE RULE (everything in the fight derives from it):
//
//     Same polarity repels. Opposite attracts.
//
//   - Bolts carry the Warden's colour. Match it and they are repelled off your
//     boots and ABSORBED into Flux; oppose it and they curve in and hit.
//   - Its body: match it and your strike is repelled (blocked, you are shoved
//     back); oppose it and you are drawn in and the strike lands.
//   - Its Draw: opposite is dragged in, same is shoved out.
//   - Its ground rings: same is launched (and hurt), opposite is pinned safe.
//   - Full Flux: the next polarity flip discharges a Flux Burst.
//
// THE THREE FORMS
//   I   WARDEN (100% .. 66%)  grounded duel: Volley / Lash / Draw+Repel / Swap.
//   II  AEGIS  (66% .. 33%)   hovering core tethered to one tower crystal at a
//                             time (shielded). Break or burst the tether and it
//                             crashes, stunned; tethers burn out on their own.
//                             Plunges drop polarity rings; volleys punish climbers.
//   III STORM  (33% .. 0%)    grounded core behind an orbiting shard barrier and
//                             a polarity METRONOME: a ring on every beat, a recoil
//                             window after it, absorbable spiral bolts between.
//
// Conventions: seconds everywhere, polarity +1 (red) / -1 (blue), player
// polarity 0 means "neutral" (no Polarity Boots: bolts hit, strikes land, rings
// hurt without launching, no Flux).

export type WardenForm = 1 | 2 | 3;
export type WardenPolarity = 1 | -1;
export type PolarityRelation = 'same' | 'opposite' | 'neutral';
export type WardenAttack = 'volley' | 'lash' | 'draw';
export type TetherSnapReason = 'broken' | 'burst' | 'burnout';
export type WardenBlockReason = 'repelled' | 'tethered' | 'transition' | 'dead';

export type WardenAction =
    | 'idle'
    | 'swap_windup' | 'swap_recovery'
    | 'volley_windup' | 'volley_active' | 'volley_recovery'
    | 'lash_windup' | 'lash_active' | 'lash_recovery'
    | 'draw_windup' | 'draw_active' | 'draw_recovery'
    | 'stagger'
    | 'shatter'
    | 'hover'
    | 'plunge_windup' | 'plunge_drop' | 'plunge_recovery'
    | 'crash' | 'stunned' | 'recover'
    | 'storm_rise'
    | 'spiral' | 'recoil'
    | 'death';

export const WARDEN_MAX_HP = 270;
/** HP fractions at which the Warden changes form (hits are clamped to land exactly here). */
export const WARDEN_FORM_THRESHOLDS: Readonly<Record<2 | 3, number>> = { 2: 2 / 3, 3: 1 / 3 };
export const WARDEN_FORM_NAMES: Readonly<Record<WardenForm, string>> = { 1: 'Warden', 2: 'Aegis', 3: 'Storm' };
/** Absorbed bolts needed to charge a Flux Burst. */
export const FLUX_MAX = 10;
/** Radius (blocks) of a Flux Burst around the player. */
export const FLUX_BURST_RADIUS = 9;
/** Fraction of max HP a Flux Burst deals to an unshielded Warden. */
export const FLUX_BURST_DAMAGE_FRACTION = 0.1;
/** Largest single hit the Warden accepts (stops one-shot exploits). */
export const WARDEN_DAMAGE_CAP = 45;

/**
 * Every tunable timing and number for the fight, in seconds / blocks. Nothing
 * else in this file reads a bare time literal. Change pacing here.
 */
export const WARDEN_TIMING = {
    /** Fixed action lengths. Untimed actions (hover, spiral) are 0. */
    actions: {
        idle: 0.5,
        swap_windup: 1.0, swap_recovery: 0.4,
        volley_windup: 0.7, volley_active: 0.15, volley_recovery: 0.6,
        lash_windup: 0.75, lash_active: 0.25, lash_recovery: 1.2,
        draw_windup: 0.9, draw_active: 1.5, draw_recovery: 1.4,
        stagger: 0.9,
        shatter: 2.6,
        hover: 0,
        plunge_windup: 0.85, plunge_drop: 0.3, plunge_recovery: 0.9,
        /** A snapped tether yanks the core down (and, for a broken crystal, toward that tower). */
        crash: 0.7, stunned: 0, recover: 1.2,
        storm_rise: 2.6,
        spiral: 0, recoil: 1.4,
        death: 0,
    } as Record<WardenAction, number>,

    form1: {
        /** Seconds between polarity swaps (chosen as its own telegraphed action). */
        swapInterval: 9,
        cooldowns: { volley: 2.4, lash: 3.0, draw: 7.5 } as Record<WardenAttack, number>,
        /** Distance profiles drive attack selection (ideal spacing, hard band). */
        distances: {
            lash: { ideal: 2.5, min: 0, max: 4.8 },
            draw: { ideal: 8, min: 3.5, max: 14 },
            volley: { ideal: 13, min: 5, max: 48 },
        } as Record<WardenAttack, { ideal: number; min: number; max: number }>,
    },

    form2: {
        hoverHeight: 7,
        /** Hover height when every crystal is gone (unshielded, within reach). */
        limpHeight: 2.2,
        orbitRadius: 8,
        orbitRate: 0.25,
        volleyInterval: 2.2,
        plungeInterval: 9,
        plungeFirst: 5,
        swapInterval: 10,
        /** A tether burns its crystal out after this long (a stun window for everyone). */
        tetherSeconds: 22,
        stun: { broken: 6, burst: 5, burnout: 3.5 } as Record<TetherSnapReason, number>,
        /** How often the receding shield fraction is reported while tethered. */
        shieldReportInterval: 0.25,
        hoverDwell: 0.8,
    },

    form3: {
        beatInterval: 3.2,
        overloadBeatInterval: 2.5,
        /** HP fraction under which the metronome speeds up. */
        overloadHp: 0.12,
        /** Every Nth beat is a double beat (two rings, flip twice). */
        doubleEvery: 4,
        doubleGap: 0.9,
        /** Countdown ticks (seconds remaining) reported before each beat. */
        ticks: [1.0, 0.5] as readonly number[],
        spiralInterval: 0.16,
        overloadSpiralInterval: 0.12,
        spiralStep: 0.55,
        shardCount: 4,
        shardRadius: 2.6,
        shardHeight: 1.2,
        shardRate: 1.4,
        shardDamage: 3,
        shardCooldown: 0.8,
        approachSpeed: 1.6,
    },

    bolts: {
        volley1: { count: 5, spread: 0.3, speed: 16, damage: 2, ttl: 5 },
        volley2: { count: 3, spread: 0.18, speed: 17, damage: 2, ttl: 5 },
        spiral: { speed: 11, damage: 1, ttl: 4 },
        /** Opposite-polarity bolts curve toward the player at this rate (1/s). */
        homing: 1.4,
    },

    lash: { range: 4.5, halfAngle: 50 * Math.PI / 180, damage: 8 },
    draw: { range: 14, force: 60, maxDrift: 12, repelRadius: 5, repelDamage: 9 },
    shockwave: {
        plunge: { maxRadius: 24, speed: 16, damage: 8 },
        beat: { maxRadius: 24, speed: 18, damage: 6 },
    },
    plunge: { impactRadius: 3.2, impactDamage: 12, targetClamp: 20, riseBeforeDrop: 2 },
    /** Ambient attract/repel field per form (the Draw overrides it). */
    field: {
        1: { range: 12, force: 20, maxDrift: 4 },
        2: { range: 10, force: 16, maxDrift: 3 },
        3: { range: 12, force: 24, maxDrift: 5 },
    } as Record<WardenForm, { range: number; force: number; maxDrift: number }>,
    /** Damage multiplier while stunned / staggered (the earned punish windows). */
    punishMultiplier: 1.5,
};

export interface WardenTether {
    crystal: number;
    remaining: number;
    total: number;
}

export interface WardenState {
    hp: number;
    maxHp: number;
    form: WardenForm;
    polarity: WardenPolarity;
    action: WardenAction;
    actionTime: number;
    /** Resolved duration of the current action (0 = untimed). */
    actionDuration: number;
    cooldowns: Record<WardenAttack, number>;
    lastAttack: WardenAttack | null;
    attackIndex: number;
    swapTimer: number;
    volleyTimer: number;
    plungeTimer: number;
    hoverDwell: number;
    /** Standing tower crystals by index (empty when fought without an arena). */
    crystals: boolean[];
    tether: WardenTether | null;
    shieldReportTimer: number;
    stunSeconds: number;
    beatTimer: number;
    beatIndex: number;
    beatTicksReported: number;
    /** > 0 while the second ring of a double beat is pending. */
    doubleTimer: number;
    spiralTimer: number;
    spiralAngle: number;
    flux: number;
    clock: number;
}

export type WardenInput =
    | {
        type: 'tick';
        dt: number;
        playerDistance: number;
        /** Standing crystal the runtime would like tethered next (farthest from the player). */
        preferredCrystal?: number | null;
    }
    | { type: 'damage'; amount: number; playerPolarity: number }
    | { type: 'crystal-broken'; crystal: number }
    | { type: 'bolt-absorbed' }
    | { type: 'polarity-flipped'; bossInRange: boolean }
    | { type: 'configure'; crystals: number };

export type WardenEvent =
    | { type: 'action'; action: WardenAction; durationSeconds: number }
    | { type: 'form'; form: WardenForm }
    | { type: 'polarity'; polarity: WardenPolarity }
    | { type: 'volley'; count: number; spread: number; speed: number; damage: number; ttl: number; polarity: WardenPolarity }
    | { type: 'spiral-bolt'; angle: number; speed: number; damage: number; ttl: number; polarity: WardenPolarity }
    | { type: 'lash'; range: number; halfAngle: number; damage: number }
    | { type: 'draw'; active: boolean; range: number; force: number; maxDrift: number }
    | { type: 'repel'; radius: number; damage: number }
    | { type: 'shockwave'; polarity: WardenPolarity; maxRadius: number; speed: number; damage: number; source: 'plunge' | 'beat' }
    | { type: 'plunge'; phase: 'mark' | 'drop' | 'impact'; impactRadius: number; impactDamage: number }
    | { type: 'crystals'; mode: 'spawn' | 'consume' }
    | { type: 'tether'; crystal: number; seconds: number }
    | { type: 'untethered' }
    | { type: 'tether-snapped'; crystal: number; reason: TetherSnapReason; stunSeconds: number }
    | { type: 'shield'; fraction: number }
    | { type: 'crash' }
    | { type: 'recovered' }
    | { type: 'beat'; polarity: WardenPolarity; index: number; double: boolean; second: boolean }
    | { type: 'beat-tick'; remaining: number; nextPolarity: WardenPolarity }
    | { type: 'hurt'; damage: number; relation: PolarityRelation; punish: boolean }
    | { type: 'blocked'; reason: WardenBlockReason; relation: PolarityRelation }
    | { type: 'flux'; value: number; max: number; full: boolean }
    | { type: 'burst'; hitBoss: boolean; damage: number }
    | { type: 'stagger' }
    | { type: 'shards'; active: boolean }
    | { type: 'defeated' };

export interface WardenTransition {
    state: WardenState;
    events: WardenEvent[];
}

const ACTIONS = WARDEN_TIMING.actions;

const clampDuration = (value: number): number => (Number.isFinite(value) ? Math.max(0, value) : 0);

/** The universal rule, as a relation: same repels, opposite attracts, 0 = no boots. */
export function polarityRelation(playerPolarity: number, bossPolarity: number): PolarityRelation {
    if (!Number.isFinite(playerPolarity) || playerPolarity === 0) return 'neutral';
    return Math.sign(playerPolarity) === Math.sign(bossPolarity) ? 'same' : 'opposite';
}

export function wardenActionPhase(action: WardenAction): 'anticipation' | 'active' | 'recovery' {
    if (action.endsWith('_windup') || action === 'shatter' || action === 'storm_rise' || action === 'plunge_drop') return 'anticipation';
    if (action.endsWith('_active') || action === 'spiral' || action === 'hover') return 'active';
    return 'recovery';
}

/** True while the Warden is invulnerable regardless of polarity. */
export function isWardenTransitioning(state: WardenState): boolean {
    return state.action === 'shatter' || state.action === 'storm_rise'
        || state.action === 'crash' || state.action === 'recover' || state.action === 'death';
}

/** True while hits land for the punish multiplier (stunned core / staggered Warden). */
export function isWardenPunishable(state: WardenState): boolean {
    return state.action === 'stunned' || state.action === 'stagger';
}

export function getWardenActionDuration(action: WardenAction, state?: WardenState): number {
    if (action === 'stunned') return state?.stunSeconds ?? 0;
    return ACTIONS[action];
}

/** Ambient/draw field profile for the current action, or null for no field. */
export function getWardenFieldProfile(state: WardenState): { range: number; force: number; maxDrift: number } | null {
    if (isWardenTransitioning(state) || state.action === 'stunned' || state.action === 'stagger') return null;
    if (state.action === 'draw_active') return { range: WARDEN_TIMING.draw.range, force: WARDEN_TIMING.draw.force, maxDrift: WARDEN_TIMING.draw.maxDrift };
    return WARDEN_TIMING.field[state.form];
}

/** World-space offsets of the Form III shard barrier (shared by hit tests and rendering). */
export function wardenShardOffsets(clock: number, count = WARDEN_TIMING.form3.shardCount): { x: number; y: number; z: number }[] {
    const out: { x: number; y: number; z: number }[] = [];
    const { shardRadius, shardHeight, shardRate } = WARDEN_TIMING.form3;
    for (let index = 0; index < count; index += 1) {
        const angle = clock * shardRate + (index / count) * Math.PI * 2;
        out.push({
            x: Math.cos(angle) * shardRadius,
            y: shardHeight + Math.sin(clock * 2.1 + index) * 0.25,
            z: Math.sin(angle) * shardRadius,
        });
    }
    return out;
}

/** Cone test shared by the Lash hit check and its ground telegraph. */
export function isInWardenCone(
    origin: { x: number; y: number; z: number },
    yaw: number,
    target: { x: number; y: number; z: number },
    range: number = WARDEN_TIMING.lash.range,
    halfAngle: number = WARDEN_TIMING.lash.halfAngle,
): boolean {
    const dx = target.x - origin.x;
    const dz = target.z - origin.z;
    const distance = Math.hypot(dx, dz);
    if (distance > range || Math.abs(target.y - origin.y) > 3.2) return false;
    if (distance < 0.001) return true;
    // Entity yaw convention: forward = (sin(yaw), cos(yaw)).
    const dot = (dx / distance) * Math.sin(yaw) + (dz / distance) * Math.cos(yaw);
    return dot >= Math.cos(halfAngle);
}

export function fluxIsFull(state: Pick<WardenState, 'flux'>): boolean {
    return state.flux >= FLUX_MAX;
}

function createCooldowns(): Record<WardenAttack, number> {
    return { volley: 0, lash: 0, draw: 0 };
}

export function createWardenState(overrides: Partial<WardenState> = {}): WardenState {
    return {
        hp: WARDEN_MAX_HP,
        maxHp: WARDEN_MAX_HP,
        form: 1,
        polarity: 1,
        action: 'idle',
        actionTime: 0,
        actionDuration: ACTIONS.idle,
        cooldowns: createCooldowns(),
        lastAttack: null,
        attackIndex: 0,
        swapTimer: WARDEN_TIMING.form1.swapInterval,
        volleyTimer: 0,
        plungeTimer: WARDEN_TIMING.form2.plungeFirst,
        hoverDwell: 0,
        crystals: [],
        tether: null,
        shieldReportTimer: 0,
        stunSeconds: 0,
        beatTimer: WARDEN_TIMING.form3.beatInterval,
        beatIndex: 0,
        beatTicksReported: 0,
        doubleTimer: 0,
        spiralTimer: 0,
        spiralAngle: 0,
        flux: 0,
        clock: 0,
        ...overrides,
    };
}

// --- Action plumbing -------------------------------------------------------

function enterAction(state: WardenState, action: WardenAction, events: WardenEvent[], duration?: number): WardenState {
    const resolved = duration ?? getWardenActionDuration(action, state);
    events.push({ type: 'action', action, durationSeconds: resolved });
    return { ...state, action, actionTime: 0, actionDuration: resolved };
}

/** Leaving an action early: keep the runtime's side effects consistent. */
function interruptAction(state: WardenState, events: WardenEvent[]): void {
    if (state.action === 'draw_active') {
        events.push({ type: 'draw', active: false, range: WARDEN_TIMING.draw.range, force: WARDEN_TIMING.draw.force, maxDrift: WARDEN_TIMING.draw.maxDrift });
    }
}

function flipPolarity(state: WardenState, events: WardenEvent[]): WardenState {
    const polarity: WardenPolarity = state.polarity > 0 ? -1 : 1;
    events.push({ type: 'polarity', polarity });
    return { ...state, polarity };
}

function volleySpec(form: WardenForm) {
    return form === 1 ? WARDEN_TIMING.bolts.volley1 : WARDEN_TIMING.bolts.volley2;
}

function emitVolley(state: WardenState, events: WardenEvent[]): void {
    const spec = volleySpec(state.form);
    events.push({ type: 'volley', count: spec.count, spread: spec.spread, speed: spec.speed, damage: spec.damage, ttl: spec.ttl, polarity: state.polarity });
}

// --- Form I: the duel ------------------------------------------------------

function attackDistancePenalty(attack: WardenAttack, playerDistance: number): number {
    const band = WARDEN_TIMING.form1.distances[attack];
    if (playerDistance < band.min) return (band.min - playerDistance) * 4 + 8;
    if (playerDistance > band.max) return (playerDistance - band.max) * 4 + 8;
    return Math.abs(playerDistance - band.ideal);
}

/**
 * Picks the next Form I move: a swap when its timer is due (its own telegraphed
 * action, never layered under another windup), otherwise the readiest attack
 * for the current spacing with anti-repeat and a light rotation so it never
 * settles into a loop.
 */
export function selectWardenAttack(state: WardenState, playerDistance: number): WardenAttack | 'swap' {
    if (state.swapTimer <= 0) return 'swap';
    const attacks: WardenAttack[] = ['volley', 'lash', 'draw'];
    const ready = attacks.filter((attack) => state.cooldowns[attack] <= 0.001);
    const pool = ready.length > 0 ? ready : attacks;
    let chosen = pool[0];
    let best = Number.POSITIVE_INFINITY;
    for (const attack of pool) {
        const rotation = (attacks.indexOf(attack) - (state.attackIndex % attacks.length) + attacks.length) % attacks.length;
        const repetition = attack === state.lastAttack ? 18 : 0;
        const score = attackDistancePenalty(attack, playerDistance) + rotation * 0.6 + repetition;
        if (score < best) { best = score; chosen = attack; }
    }
    return chosen;
}

function beginForm1Attack(state: WardenState, events: WardenEvent[], playerDistance: number): WardenState {
    const pick = selectWardenAttack(state, playerDistance);
    if (pick === 'swap') {
        return enterAction({ ...state, swapTimer: WARDEN_TIMING.form1.swapInterval }, 'swap_windup', events);
    }
    const cooldowns = { ...state.cooldowns, [pick]: WARDEN_TIMING.form1.cooldowns[pick] };
    return enterAction({ ...state, cooldowns, lastAttack: pick, attackIndex: state.attackIndex + 1 }, `${pick}_windup`, events);
}

function finishForm1Action(state: WardenState, events: WardenEvent[], playerDistance: number): WardenState {
    switch (state.action) {
        case 'idle': return beginForm1Attack(state, events, playerDistance);
        case 'volley_windup': { const next = enterAction(state, 'volley_active', events); emitVolley(next, events); return next; }
        case 'volley_active': return enterAction(state, 'volley_recovery', events);
        case 'volley_recovery': return enterAction(state, 'idle', events);
        case 'lash_windup': {
            const next = enterAction(state, 'lash_active', events);
            events.push({ type: 'lash', range: WARDEN_TIMING.lash.range, halfAngle: WARDEN_TIMING.lash.halfAngle, damage: WARDEN_TIMING.lash.damage });
            return next;
        }
        case 'lash_active': return enterAction(state, 'lash_recovery', events);
        case 'lash_recovery': return enterAction(state, 'idle', events);
        case 'draw_windup': {
            const next = enterAction(state, 'draw_active', events);
            events.push({ type: 'draw', active: true, range: WARDEN_TIMING.draw.range, force: WARDEN_TIMING.draw.force, maxDrift: WARDEN_TIMING.draw.maxDrift });
            return next;
        }
        case 'draw_active': {
            events.push({ type: 'repel', radius: WARDEN_TIMING.draw.repelRadius, damage: WARDEN_TIMING.draw.repelDamage });
            events.push({ type: 'draw', active: false, range: WARDEN_TIMING.draw.range, force: WARDEN_TIMING.draw.force, maxDrift: WARDEN_TIMING.draw.maxDrift });
            return enterAction(state, 'draw_recovery', events);
        }
        case 'draw_recovery': return enterAction(state, 'idle', events);
        case 'swap_windup': return enterAction(flipPolarity(state, events), 'swap_recovery', events);
        case 'swap_recovery': return enterAction(state, 'idle', events);
        case 'stagger': return enterAction(state, 'idle', events);
        default: return state;
    }
}

// --- Form II: the tether ---------------------------------------------------

function standingCrystals(state: WardenState): number[] {
    const out: number[] = [];
    state.crystals.forEach((standing, index) => { if (standing) out.push(index); });
    return out;
}

function pickTether(state: WardenState, events: WardenEvent[], preferred: number | null | undefined): WardenState {
    const standing = standingCrystals(state);
    if (standing.length === 0) {
        events.push({ type: 'untethered' });
        events.push({ type: 'shield', fraction: 0 });
        return { ...state, tether: null };
    }
    const crystal = preferred !== null && preferred !== undefined && state.crystals[preferred] ? preferred : standing[0];
    const total = WARDEN_TIMING.form2.tetherSeconds;
    events.push({ type: 'tether', crystal, seconds: total });
    events.push({ type: 'shield', fraction: 1 });
    return { ...state, tether: { crystal, remaining: total, total }, shieldReportTimer: WARDEN_TIMING.form2.shieldReportInterval };
}

function snapTether(state: WardenState, events: WardenEvent[], reason: TetherSnapReason): WardenState {
    const tether = state.tether;
    if (!tether) return state;
    const crystals = state.crystals.slice();
    crystals[tether.crystal] = false;
    const stunSeconds = WARDEN_TIMING.form2.stun[reason];
    events.push({ type: 'tether-snapped', crystal: tether.crystal, reason, stunSeconds });
    events.push({ type: 'shield', fraction: 0 });
    interruptAction(state, events);
    let next: WardenState = { ...state, crystals, tether: null, stunSeconds };
    next = enterAction(next, 'crash', events);
    events.push({ type: 'crash' });
    return next;
}

function finishForm2Action(state: WardenState, events: WardenEvent[], preferred: number | null | undefined): WardenState {
    const dwell = WARDEN_TIMING.form2.hoverDwell;
    switch (state.action) {
        case 'shatter': return enterAction(pickTether({ ...state, hoverDwell: dwell }, events, preferred), 'hover', events);
        case 'volley_windup': { const next = enterAction(state, 'volley_active', events); emitVolley(next, events); return next; }
        case 'volley_active': return enterAction(state, 'volley_recovery', events);
        case 'volley_recovery': return enterAction({ ...state, hoverDwell: dwell }, 'hover', events);
        case 'plunge_windup': {
            events.push({ type: 'plunge', phase: 'drop', impactRadius: WARDEN_TIMING.plunge.impactRadius, impactDamage: WARDEN_TIMING.plunge.impactDamage });
            return enterAction(state, 'plunge_drop', events);
        }
        case 'plunge_drop': {
            const wave = WARDEN_TIMING.shockwave.plunge;
            events.push({ type: 'plunge', phase: 'impact', impactRadius: WARDEN_TIMING.plunge.impactRadius, impactDamage: WARDEN_TIMING.plunge.impactDamage });
            events.push({ type: 'shockwave', polarity: state.polarity, maxRadius: wave.maxRadius, speed: wave.speed, damage: wave.damage, source: 'plunge' });
            return enterAction(state, 'plunge_recovery', events);
        }
        case 'plunge_recovery':
            return enterAction({ ...state, plungeTimer: WARDEN_TIMING.form2.plungeInterval, hoverDwell: dwell }, 'hover', events);
        case 'swap_windup': return enterAction(flipPolarity(state, events), 'swap_recovery', events);
        case 'swap_recovery': return enterAction({ ...state, hoverDwell: dwell }, 'hover', events);
        case 'crash': return enterAction(state, 'stunned', events, state.stunSeconds);
        case 'stunned': return enterAction(state, 'recover', events);
        case 'recover': {
            events.push({ type: 'recovered' });
            return enterAction(pickTether({ ...state, plungeTimer: WARDEN_TIMING.form2.plungeFirst, hoverDwell: dwell }, events, preferred), 'hover', events);
        }
        default: return state;
    }
}

function tickHover(state: WardenState, events: WardenEvent[]): WardenState {
    if (state.hoverDwell > 0) return state;
    if (state.plungeTimer <= 0) {
        events.push({ type: 'plunge', phase: 'mark', impactRadius: WARDEN_TIMING.plunge.impactRadius, impactDamage: WARDEN_TIMING.plunge.impactDamage });
        return enterAction(state, 'plunge_windup', events);
    }
    if (state.swapTimer <= 0) {
        return enterAction({ ...state, swapTimer: WARDEN_TIMING.form2.swapInterval }, 'swap_windup', events);
    }
    if (state.volleyTimer <= 0) {
        return enterAction({ ...state, volleyTimer: WARDEN_TIMING.form2.volleyInterval }, 'volley_windup', events);
    }
    return state;
}

function tickTether(state: WardenState, events: WardenEvent[], dt: number): WardenState {
    const tether = state.tether;
    if (!tether || state.action === 'crash' || state.action === 'stunned' || state.action === 'recover') return state;
    const remaining = tether.remaining - dt;
    if (remaining <= 0) return snapTether({ ...state, tether: { ...tether, remaining: 0 } }, events, 'burnout');
    let reportTimer = state.shieldReportTimer - dt;
    if (reportTimer <= 0) {
        reportTimer = WARDEN_TIMING.form2.shieldReportInterval;
        events.push({ type: 'shield', fraction: remaining / tether.total });
    }
    return { ...state, tether: { ...tether, remaining }, shieldReportTimer: reportTimer };
}

// --- Form III: the metronome ----------------------------------------------

/** Seconds between Storm beats (faster once the Warden overloads under 12% HP). */
export function getWardenBeatInterval(state: Pick<WardenState, 'hp' | 'maxHp'>): number {
    return state.hp / state.maxHp <= WARDEN_TIMING.form3.overloadHp
        ? WARDEN_TIMING.form3.overloadBeatInterval
        : WARDEN_TIMING.form3.beatInterval;
}

const beatInterval = getWardenBeatInterval;

function spiralInterval(state: WardenState): number {
    return state.hp / state.maxHp <= WARDEN_TIMING.form3.overloadHp
        ? WARDEN_TIMING.form3.overloadSpiralInterval
        : WARDEN_TIMING.form3.spiralInterval;
}

function fireBeatRing(state: WardenState, events: WardenEvent[], double: boolean, second: boolean): WardenState {
    const next = flipPolarity(state, events);
    const wave = WARDEN_TIMING.shockwave.beat;
    events.push({ type: 'beat', polarity: next.polarity, index: next.beatIndex, double, second });
    events.push({ type: 'shockwave', polarity: next.polarity, maxRadius: wave.maxRadius, speed: wave.speed, damage: wave.damage, source: 'beat' });
    return next;
}

function tickMetronome(state: WardenState, events: WardenEvent[], dt: number): WardenState {
    let next = { ...state };
    // Second ring of a double beat.
    if (next.doubleTimer > 0) {
        next.doubleTimer -= dt;
        if (next.doubleTimer <= 0) {
            next.doubleTimer = 0;
            next = fireBeatRing(next, events, true, true);
        }
    }
    next.beatTimer -= dt;
    const upcoming: WardenPolarity = next.polarity > 0 ? -1 : 1;
    const ticks = WARDEN_TIMING.form3.ticks;
    while (next.beatTicksReported < ticks.length && next.beatTimer <= ticks[next.beatTicksReported]) {
        events.push({ type: 'beat-tick', remaining: ticks[next.beatTicksReported], nextPolarity: upcoming });
        next.beatTicksReported += 1;
    }
    if (next.beatTimer <= 0) {
        const double = (next.beatIndex + 1) % WARDEN_TIMING.form3.doubleEvery === 0;
        next.beatIndex += 1;
        next = fireBeatRing(next, events, double, false);
        if (double) next.doubleTimer = WARDEN_TIMING.form3.doubleGap;
        next.beatTimer += beatInterval(next);
        next.beatTicksReported = 0;
        interruptAction(next, events);
        next = enterAction(next, 'recoil', events);
    }
    return next;
}

function tickSpiral(state: WardenState, events: WardenEvent[], dt: number): WardenState {
    if (state.action !== 'spiral') return state;
    let timer = state.spiralTimer - dt;
    let angle = state.spiralAngle;
    const spec = WARDEN_TIMING.bolts.spiral;
    let guard = 0;
    while (timer <= 0 && guard < 8) {
        events.push({ type: 'spiral-bolt', angle, speed: spec.speed, damage: spec.damage, ttl: spec.ttl, polarity: state.polarity });
        events.push({ type: 'spiral-bolt', angle: angle + Math.PI, speed: spec.speed, damage: spec.damage, ttl: spec.ttl, polarity: state.polarity });
        angle += WARDEN_TIMING.form3.spiralStep;
        timer += spiralInterval(state);
        guard += 1;
    }
    return { ...state, spiralTimer: timer, spiralAngle: angle };
}

function finishForm3Action(state: WardenState, events: WardenEvent[]): WardenState {
    switch (state.action) {
        case 'storm_rise': return enterAction({ ...state, beatTimer: WARDEN_TIMING.form3.beatInterval, beatTicksReported: 0, spiralTimer: 0.4 }, 'spiral', events);
        case 'recoil': return enterAction({ ...state, spiralTimer: 0.2 }, 'spiral', events);
        default: return state;
    }
}

// --- Damage, forms, flux ---------------------------------------------------

function applyThresholds(state: WardenState, events: WardenEvent[]): WardenState {
    if (state.hp <= 0) {
        interruptAction(state, events);
        const dead = enterAction({ ...state, hp: 0, tether: null }, 'death', events);
        events.push({ type: 'shield', fraction: 0 });
        events.push({ type: 'defeated' });
        return dead;
    }
    const fraction = state.hp / state.maxHp;
    if (state.form === 1 && fraction <= WARDEN_FORM_THRESHOLDS[2]) {
        interruptAction(state, events);
        // Clamp so the transition fires exactly at the marker, never below it.
        // Every crystal re-forms on its tower for the Aegis, and the hover
        // timers restart so the new form opens with a beat of stillness.
        let next: WardenState = {
            ...state,
            hp: state.maxHp * WARDEN_FORM_THRESHOLDS[2],
            form: 2,
            tether: null,
            crystals: state.crystals.map(() => true),
            plungeTimer: WARDEN_TIMING.form2.plungeFirst,
            volleyTimer: 1.5,
            swapTimer: WARDEN_TIMING.form2.swapInterval,
            hoverDwell: 1.0,
        };
        next = enterAction(next, 'shatter', events);
        events.push({ type: 'form', form: 2 });
        events.push({ type: 'crystals', mode: 'spawn' });
        events.push({ type: 'shield', fraction: 0 });
        return next;
    }
    if (state.form === 2 && fraction <= WARDEN_FORM_THRESHOLDS[3]) {
        interruptAction(state, events);
        let next: WardenState = {
            ...state,
            hp: state.maxHp * WARDEN_FORM_THRESHOLDS[3],
            form: 3,
            tether: null,
            crystals: state.crystals.map(() => false),
        };
        next = enterAction(next, 'storm_rise', events);
        events.push({ type: 'form', form: 3 });
        events.push({ type: 'crystals', mode: 'consume' });
        events.push({ type: 'shield', fraction: 0 });
        events.push({ type: 'shards', active: true });
        return next;
    }
    return state;
}

function blockReason(state: WardenState, relation: PolarityRelation): WardenBlockReason | null {
    if (state.action === 'death') return 'dead';
    if (isWardenTransitioning(state)) return 'transition';
    if (state.form === 2 && state.tether !== null) return 'tethered';
    if (relation === 'same') return 'repelled';
    return null;
}

function resolveDamage(state: WardenState, input: Extract<WardenInput, { type: 'damage' }>): WardenTransition {
    const events: WardenEvent[] = [];
    const relation = polarityRelation(input.playerPolarity, state.polarity);
    const reason = blockReason(state, relation);
    if (reason) {
        events.push({ type: 'blocked', reason, relation });
        return { state, events };
    }
    const punish = isWardenPunishable(state);
    const damage = Math.min(WARDEN_DAMAGE_CAP, clampDuration(input.amount) * (punish ? WARDEN_TIMING.punishMultiplier : 1));
    if (damage <= 0) return { state, events };
    events.push({ type: 'hurt', damage, relation, punish });
    const next = applyThresholds({ ...state, hp: state.hp - damage }, events);
    return { state: next, events };
}

function resolveBurst(state: WardenState, bossInRange: boolean): WardenTransition {
    const events: WardenEvent[] = [];
    if (!fluxIsFull(state)) return { state, events };
    let next: WardenState = { ...state, flux: 0 };
    events.push({ type: 'flux', value: 0, max: FLUX_MAX, full: false });
    const damage = Math.round(state.maxHp * FLUX_BURST_DAMAGE_FRACTION);
    const canHit = bossInRange && !isWardenTransitioning(next);
    if (!canHit) {
        events.push({ type: 'burst', hitBoss: false, damage: 0 });
        return { state: next, events };
    }
    if (next.form === 2 && next.tether) {
        events.push({ type: 'burst', hitBoss: true, damage: 0 });
        return { state: snapTether(next, events, 'burst'), events };
    }
    events.push({ type: 'burst', hitBoss: true, damage });
    events.push({ type: 'hurt', damage, relation: 'neutral', punish: false });
    next = { ...next, hp: next.hp - damage };
    const before = next.form;
    next = applyThresholds(next, events);
    if (next.form === before && next.action !== 'death' && next.form === 1 && next.action !== 'stagger') {
        interruptAction(next, events);
        next = enterAction(next, 'stagger', events);
        events.push({ type: 'stagger' });
    }
    return { state: next, events };
}

function resolveCrystalBroken(state: WardenState, crystal: number): WardenTransition {
    const events: WardenEvent[] = [];
    if (crystal < 0 || crystal >= state.crystals.length || !state.crystals[crystal]) return { state, events };
    const crystals = state.crystals.slice();
    crystals[crystal] = false;
    const next: WardenState = { ...state, crystals };
    if (next.tether && next.tether.crystal === crystal && next.form === 2) {
        return { state: snapTether(next, events, 'broken'), events };
    }
    return { state: next, events };
}

// --- The reducer -----------------------------------------------------------

export function advanceWarden(state: WardenState, input: WardenInput): WardenTransition {
    if (input.type === 'damage') return resolveDamage(state, input);
    if (input.type === 'crystal-broken') return resolveCrystalBroken(state, input.crystal);
    if (input.type === 'polarity-flipped') return resolveBurst(state, input.bossInRange);
    if (input.type === 'configure') {
        const crystals = Array.from({ length: Math.max(0, Math.floor(input.crystals)) }, () => true);
        return { state: { ...state, crystals }, events: [] };
    }
    if (input.type === 'bolt-absorbed') {
        const events: WardenEvent[] = [];
        if (state.action === 'death') return { state, events };
        const flux = Math.min(FLUX_MAX, state.flux + 1);
        events.push({ type: 'flux', value: flux, max: FLUX_MAX, full: flux >= FLUX_MAX });
        return { state: { ...state, flux }, events };
    }

    const events: WardenEvent[] = [];
    const dt = clampDuration(Math.min(0.1, input.dt));
    if (dt <= 0 || state.action === 'death') return { state, events };

    let next: WardenState = {
        ...state,
        clock: state.clock + dt,
        cooldowns: {
            volley: Math.max(0, state.cooldowns.volley - dt),
            lash: Math.max(0, state.cooldowns.lash - dt),
            draw: Math.max(0, state.cooldowns.draw - dt),
        },
        swapTimer: state.swapTimer - dt,
        volleyTimer: state.volleyTimer - dt,
        plungeTimer: state.plungeTimer - dt,
        hoverDwell: Math.max(0, state.hoverDwell - dt),
        actionTime: state.actionTime + dt,
    };

    if (next.form === 2) next = tickTether(next, events, dt);

    if (next.actionDuration > 0 && next.actionTime >= next.actionDuration && next.action !== 'death') {
        if (next.form === 1) next = finishForm1Action(next, events, input.playerDistance);
        else if (next.form === 2) next = finishForm2Action(next, events, input.preferredCrystal);
        else next = finishForm3Action(next, events);
    }

    if (next.form === 2 && next.action === 'hover') next = tickHover(next, events);
    if (next.form === 3 && next.action !== 'storm_rise') {
        next = tickMetronome(next, events, dt);
        next = tickSpiral(next, events, dt);
    }
    return { state: next, events };
}
