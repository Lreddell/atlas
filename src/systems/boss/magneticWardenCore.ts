// Magnetic Warden encounter core: the pure, deterministic state machine behind
// the three-form fight. No THREE, no enums, no world or entity access, so the
// whole fight (attack selection, telegraph timing, form transitions, crystal
// shields, the polarity metronome) is unit-testable under node --test.
//
// THE ONE RULE (everything in the fight derives from it):
//
//     Same polarity repels. Opposite attracts.
//
//   - Bolts carry the Warden's colour. Match it and they are repelled off your
//     boots; oppose it and they curve in and hit.
//   - Its body: match it and your strike is repelled (blocked, you are shoved
//     back); oppose it and you are drawn in and the strike lands.
//   - Its Draw: opposite is dragged in, same is shoved out.
//   - Its ground rings: same is launched (and hurt), opposite is pinned safe.
//   - Its tower crystals power its shield and carry its polarity: you cling to a
//     tower's climb faces by OPPOSING them, and when the Warden swaps polarity
//     its towers swap with it, so a climber must flip to hold on.
//
// THE THREE FORMS (each opens SHIELDED by tower crystals; only breaking every
// crystal of the form drops the shield; crystal power never decays)
//   I   WARDEN (100% .. 66%)  one crystal. Grounded duel: Volley / Lash / Draw+
//                             Repel / Charge / Swap. Break the crystal: it reels.
//   II  AEGIS  (66% .. 33%)   two crystals. A hovering core that contests the
//                             climb (it drifts to the tower you climb, fires down
//                             at you, swaps its towers) and plunges rings on the
//                             platform. Break both: it crashes, then limps low.
//   III STORM  (33% .. 0%)    the last crystal. A grounded core behind a shard
//                             barrier and a polarity METRONOME: every beat flips
//                             it AND its tower, fires a ring, then a quiet recoil.
//
// Conventions: seconds everywhere, polarity +1 (red) / -1 (blue), player
// polarity 0 means "neutral" (no Polarity Boots: bolts hit, strikes land, rings
// hurt without launching).

export type WardenForm = 1 | 2 | 3;
export type WardenPolarity = 1 | -1;
export type PolarityRelation = 'same' | 'opposite' | 'neutral';
export type WardenAttack = 'volley' | 'lash' | 'draw' | 'charge';
export type WardenBlockReason = 'shielded' | 'repelled' | 'transition' | 'dead';

export type WardenAction =
    | 'idle'
    | 'swap_windup' | 'swap_recovery'
    | 'volley_windup' | 'volley_active' | 'volley_recovery'
    | 'lash_windup' | 'lash_active' | 'lash_recovery'
    | 'draw_windup' | 'draw_active' | 'draw_recovery'
    | 'charge_windup' | 'charge_active' | 'charge_recovery'
    | 'stagger'
    | 'flinch'
    | 'shield_break'
    | 'shatter'
    | 'hover'
    | 'plunge_windup' | 'plunge_drop' | 'plunge_recovery'
    | 'crash' | 'recover'
    | 'storm_rise'
    | 'spiral' | 'recoil'
    | 'death';

export const WARDEN_MAX_HP = 300;
/** HP fractions at which the Warden changes form (hits are clamped to land exactly here). */
export const WARDEN_FORM_THRESHOLDS: Readonly<Record<2 | 3, number>> = { 2: 2 / 3, 3: 1 / 3 };
export const WARDEN_FORM_NAMES: Readonly<Record<WardenForm, string>> = { 1: 'Warden', 2: 'Aegis', 3: 'Storm' };
/** Tower crystals (by tower index) that power each form's shield. */
export const WARDEN_FORM_CRYSTALS: Readonly<Record<WardenForm, readonly number[]>> = { 1: [0], 2: [1, 2], 3: [3] };
/** Largest single hit the Warden accepts (stops one-shot exploits). */
export const WARDEN_DAMAGE_CAP = 45;
/** Damage multiplier of a Magnet Slam (a strike loaded by a magnetic dash). */
export const WARDEN_SLAM_MULTIPLIER = 2.5;

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
        charge_windup: 0.85, charge_active: 0.45, charge_recovery: 1.1,
        stagger: 0.9,
        flinch: 1.2,
        /** Long enough for the climber who broke the crystal to launch back down and land a slam. */
        shield_break: 4.5,
        shatter: 2.6,
        hover: 0,
        plunge_windup: 0.85, plunge_drop: 0.3, plunge_recovery: 0.9,
        crash: 0.7, recover: 1.2,
        storm_rise: 2.6,
        spiral: 0, recoil: 1.4,
        death: 0,
    } as Record<WardenAction, number>,

    /** A player farther than this is on the towers / crossing: only climber volleys reach them. */
    farDistance: 20,
    /** Seconds after a polarity flip during which a climber may still flip to hold on. */
    swapGraceAfter: 0.3,

    form1: {
        /** Seconds between polarity swaps (chosen as its own telegraphed action). */
        swapInterval: 9,
        cooldowns: { volley: 2.4, lash: 3.0, draw: 7.5, charge: 6.0 } as Record<WardenAttack, number>,
        /** Distance profiles drive attack selection (ideal spacing, hard band). */
        distances: {
            lash: { ideal: 2.5, min: 0, max: 4.8 },
            draw: { ideal: 8, min: 3.5, max: 14 },
            charge: { ideal: 9, min: 5, max: 20 },
            volley: { ideal: 13, min: 5, max: 48 },
        } as Record<WardenAttack, { ideal: number; min: number; max: number }>,
        /** While its crystal stands it never Draws: the pull is the damage-phase gambit. */
        shieldedRoster: ['volley', 'lash', 'charge'] as readonly WardenAttack[],
        roster: ['volley', 'lash', 'draw', 'charge'] as readonly WardenAttack[],
        climberVolleyInterval: 2.6,
    },

    form2: {
        hoverHeight: 7,
        /** Hover height once every crystal is gone (unshielded, within a jump's reach). */
        limpHeight: 3,
        orbitRadius: 8,
        orbitRate: 0.25,
        /** While a player climbs one of its towers the core drifts out to it: this
         *  far from the centre (right above that tower's landing pool), this high,
         *  close enough to dash-slam from the upper half of the climb. */
        contestRadius: 21,
        contestHeight: 22,
        volleyInterval: 2.2,
        plungeInterval: 9,
        plungeFirst: 5,
        swapInterval: 10,
        hoverDwell: 0.8,
    },

    form3: {
        beatInterval: 3.2,
        overloadBeatInterval: 2.5,
        /** HP fraction under which the metronome speeds up and the shards fly. */
        overloadHp: 0.12,
        /** Every Nth beat is a double beat (two rings, flip twice). */
        doubleEvery: 4,
        doubleGap: 0.9,
        /** Countdown ticks (seconds remaining) reported before each beat; the first one opens the tower grace. */
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
        shardVolley: { speed: 14, damage: 3, ttl: 2.6, homing: 2.2 },
    },

    bolts: {
        volley1: { count: 5, spread: 0.3, speed: 16, damage: 2, ttl: 5, homing: 1.4 },
        volley2: { count: 3, spread: 0.18, speed: 17, damage: 2, ttl: 5, homing: 1.4 },
        /** Fired at a climber or a far player: a wide, honest spread that can be sidestepped on the wall. */
        climber: { count: 3, spread: 0.35, speed: 17, damage: 2, ttl: 5, homing: 0 },
        spiral: { speed: 11, damage: 1, ttl: 4, homing: 1.0 },
    },

    lash: { range: 4.5, halfAngle: 50 * Math.PI / 180, damage: 8 },
    draw: { range: 14, force: 60, maxDrift: 12, repelRadius: 5, repelDamage: 9 },
    charge: { length: 14, halfWidth: 1.5, speed: 22, damage: 12 },
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
    /** Damage multiplier while it reels from a broken shield or a Magnet Slam. */
    punishMultiplier: 1.5,
};

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
    /** Standing tower crystals by index (false once broken; only ignited ones matter). */
    crystals: boolean[];
    /** Tower crystals powering the current form's shield. */
    ignited: number[];
    /** Standing ignited crystals: the shield holds while this is above zero. */
    shieldLayers: number;
    /** The ignited tower the player is climbing or crossing to, if any. */
    contestTower: number | null;
    beatTimer: number;
    beatIndex: number;
    beatTicksReported: number;
    /** > 0 while the second ring of a double beat is pending. */
    doubleTimer: number;
    spiralTimer: number;
    spiralAngle: number;
    clock: number;
}

export type WardenInput =
    | {
        type: 'tick';
        dt: number;
        playerDistance: number;
        /** An ignited, standing tower the player is climbing or approaching, or null. */
        playerTower?: number | null;
    }
    | { type: 'damage'; amount: number; playerPolarity: number; slam?: boolean }
    | { type: 'crystal-broken'; crystal: number }
    | { type: 'configure'; crystals: number };

export interface WardenBoltSpec {
    count: number;
    spread: number;
    speed: number;
    damage: number;
    ttl: number;
    homing: number;
}

export type WardenEvent =
    | { type: 'action'; action: WardenAction; durationSeconds: number }
    | { type: 'form'; form: WardenForm }
    /** The Warden's polarity flipped; every listed tower's climb faces flip with it. */
    | { type: 'polarity'; polarity: WardenPolarity; towers: number[] }
    | { type: 'volley'; spec: WardenBoltSpec; polarity: WardenPolarity; climber: boolean }
    | { type: 'spiral-bolt'; angle: number; speed: number; damage: number; ttl: number; homing: number; polarity: WardenPolarity }
    | { type: 'shard-volley'; speed: number; damage: number; ttl: number; homing: number; polarity: WardenPolarity }
    | { type: 'lash'; range: number; halfAngle: number; damage: number }
    | { type: 'draw'; active: boolean; range: number; force: number; maxDrift: number }
    | { type: 'repel'; radius: number; damage: number }
    | { type: 'charge'; length: number; halfWidth: number; speed: number; damage: number }
    | { type: 'shockwave'; polarity: WardenPolarity; maxRadius: number; speed: number; damage: number; source: 'plunge' | 'beat' }
    | { type: 'plunge'; phase: 'mark' | 'drop' | 'impact'; impactRadius: number; impactDamage: number }
    | { type: 'crystals'; mode: 'ignite'; crystals: number[]; polarity: WardenPolarity }
    | { type: 'crystals'; mode: 'consume' }
    /** Shield layers standing as a fraction of the form's crystals. */
    | { type: 'shield'; fraction: number }
    | { type: 'crystal-lost'; crystal: number; remaining: number }
    | { type: 'flinch'; crystal: number }
    | { type: 'shield-broken'; crystal: number }
    | { type: 'crash'; toward: number | null }
    | { type: 'recovered' }
    | { type: 'beat'; polarity: WardenPolarity; index: number; double: boolean; second: boolean }
    | { type: 'beat-tick'; remaining: number; nextPolarity: WardenPolarity; towers: number[] }
    | { type: 'hurt'; damage: number; relation: PolarityRelation; punish: boolean; slam: boolean }
    | { type: 'blocked'; reason: WardenBlockReason; relation: PolarityRelation }
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

/** True while the Warden is invulnerable regardless of polarity or shield. */
export function isWardenTransitioning(state: WardenState): boolean {
    return state.action === 'shatter' || state.action === 'storm_rise'
        || state.action === 'crash' || state.action === 'recover' || state.action === 'death';
}

/** True while its tower crystals hold its shield up. */
export function isWardenShielded(state: WardenState): boolean {
    return state.shieldLayers > 0;
}

/** True while hits land for the punish multiplier (reeling from a broken shield or a slam). */
export function isWardenPunishable(state: WardenState): boolean {
    return state.action === 'shield_break' || state.action === 'stagger';
}

/** Ignited crystals still standing (their towers carry the Warden's polarity). */
export function wardenLiveTowers(state: Pick<WardenState, 'ignited' | 'crystals'>): number[] {
    return state.ignited.filter((index) => state.crystals[index] === true);
}

export function getWardenActionDuration(action: WardenAction): number {
    return ACTIONS[action];
}

/** Seconds between Storm beats (faster once the Warden overloads under 12% HP). */
export function getWardenBeatInterval(state: Pick<WardenState, 'hp' | 'maxHp'>): number {
    return state.hp / state.maxHp <= WARDEN_TIMING.form3.overloadHp
        ? WARDEN_TIMING.form3.overloadBeatInterval
        : WARDEN_TIMING.form3.beatInterval;
}

export function isWardenOverloaded(state: Pick<WardenState, 'hp' | 'maxHp'>): boolean {
    return state.hp / state.maxHp <= WARDEN_TIMING.form3.overloadHp;
}

/** Ambient/draw field profile for the current action, or null for no field. */
export function getWardenFieldProfile(state: WardenState): { range: number; force: number; maxDrift: number } | null {
    if (isWardenTransitioning(state) || isWardenPunishable(state) || state.action === 'flinch') return null;
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

/** Lane test shared by the Charge hit check and its ground telegraph. */
export function isInWardenLane(
    origin: { x: number; y: number; z: number },
    yaw: number,
    target: { x: number; y: number; z: number },
    length: number = WARDEN_TIMING.charge.length,
    halfWidth: number = WARDEN_TIMING.charge.halfWidth,
): boolean {
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const dx = target.x - origin.x;
    const dz = target.z - origin.z;
    const along = dx * fx + dz * fz;
    const across = Math.abs(dx * fz - dz * fx);
    return along >= -0.5 && along <= length && across <= halfWidth && Math.abs(target.y - origin.y) <= 3.2;
}

function createCooldowns(): Record<WardenAttack, number> {
    return { volley: 0, lash: 0, draw: 0, charge: 0 };
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
        volleyTimer: 1.5,
        plungeTimer: WARDEN_TIMING.form2.plungeFirst,
        hoverDwell: 0,
        crystals: [],
        ignited: [],
        shieldLayers: 0,
        contestTower: null,
        beatTimer: WARDEN_TIMING.form3.beatInterval,
        beatIndex: 0,
        beatTicksReported: 0,
        doubleTimer: 0,
        spiralTimer: 0,
        spiralAngle: 0,
        clock: 0,
        ...overrides,
    };
}

// --- Action plumbing -------------------------------------------------------

function enterAction(state: WardenState, action: WardenAction, events: WardenEvent[], duration?: number): WardenState {
    const resolved = duration ?? getWardenActionDuration(action);
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
    events.push({ type: 'polarity', polarity, towers: wardenLiveTowers(state) });
    return { ...state, polarity };
}

/** The resting action of the current form. */
function restAction(form: WardenForm): WardenAction {
    return form === 1 ? 'idle' : form === 2 ? 'hover' : 'spiral';
}

function emitVolley(state: WardenState, events: WardenEvent[], climber: boolean): void {
    const spec = climber
        ? WARDEN_TIMING.bolts.climber
        : state.form === 1 ? WARDEN_TIMING.bolts.volley1 : WARDEN_TIMING.bolts.volley2;
    events.push({ type: 'volley', spec, polarity: state.polarity, climber });
}

/** A far player is on the towers or crossing the moat: only climber volleys reach them. */
function isPlayerFar(playerDistance: number): boolean {
    return playerDistance > WARDEN_TIMING.farDistance;
}

// --- Shield: tower crystals ------------------------------------------------

function igniteCrystals(state: WardenState, form: WardenForm, events: WardenEvent[]): WardenState {
    const wanted = WARDEN_FORM_CRYSTALS[form].filter((index) => index < state.crystals.length);
    const crystals = state.crystals.slice();
    for (const index of wanted) crystals[index] = true;
    const next: WardenState = { ...state, crystals, ignited: wanted.slice(), shieldLayers: wanted.length, contestTower: null };
    if (wanted.length > 0) {
        events.push({ type: 'crystals', mode: 'ignite', crystals: wanted.slice(), polarity: state.polarity });
    }
    events.push({ type: 'shield', fraction: wanted.length > 0 ? 1 : 0 });
    return next;
}

function shieldFraction(state: WardenState): number {
    return state.ignited.length > 0 ? state.shieldLayers / state.ignited.length : 0;
}

function resolveCrystalBroken(state: WardenState, crystal: number): WardenTransition {
    const events: WardenEvent[] = [];
    if (crystal < 0 || crystal >= state.crystals.length || !state.crystals[crystal]) return { state, events };
    const crystals = state.crystals.slice();
    crystals[crystal] = false;
    let next: WardenState = { ...state, crystals };
    if (!state.ignited.includes(crystal) || state.action === 'death') return { state: next, events };

    next = { ...next, shieldLayers: Math.max(0, next.shieldLayers - 1), contestTower: next.contestTower === crystal ? null : next.contestTower };
    events.push({ type: 'crystal-lost', crystal, remaining: next.shieldLayers });
    events.push({ type: 'shield', fraction: shieldFraction(next) });
    if (isWardenTransitioning(next)) return { state: next, events };

    if (next.shieldLayers > 0) {
        // A layer gone, more stand: it reels for a beat but stays shielded.
        interruptAction(next, events);
        events.push({ type: 'flinch', crystal });
        return { state: enterAction(next, 'flinch', events), events };
    }

    // The last crystal of the form: the shield shatters.
    interruptAction(next, events);
    events.push({ type: 'shield-broken', crystal });
    if (next.form === 2) {
        // The core is yanked out of the air toward the tower that felled it.
        events.push({ type: 'crash', toward: crystal });
        return { state: enterAction(next, 'crash', events), events };
    }
    return { state: enterAction(next, 'shield_break', events), events };
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
 * settles into a loop. While shielded it keeps the Draw holstered.
 */
export function selectWardenAttack(state: WardenState, playerDistance: number): WardenAttack | 'swap' {
    if (state.swapTimer <= 0) return 'swap';
    const attacks = isWardenShielded(state) ? WARDEN_TIMING.form1.shieldedRoster : WARDEN_TIMING.form1.roster;
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
    if (state.swapTimer <= 0) {
        return enterAction({ ...state, swapTimer: WARDEN_TIMING.form1.swapInterval }, 'swap_windup', events);
    }
    // A player away on the towers can only be reached by volleys; while the
    // shield stands the Warden keeps the pressure honest and slow.
    if (isPlayerFar(playerDistance)) {
        if (state.volleyTimer > 0) return state;
        return enterAction({ ...state, volleyTimer: WARDEN_TIMING.form1.climberVolleyInterval, lastAttack: 'volley' }, 'volley_windup', events);
    }
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
        case 'volley_windup': {
            const next = enterAction(state, 'volley_active', events);
            emitVolley(next, events, isPlayerFar(playerDistance));
            return next;
        }
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
        case 'charge_windup': {
            const next = enterAction(state, 'charge_active', events);
            events.push({ type: 'charge', length: WARDEN_TIMING.charge.length, halfWidth: WARDEN_TIMING.charge.halfWidth, speed: WARDEN_TIMING.charge.speed, damage: WARDEN_TIMING.charge.damage });
            return next;
        }
        case 'charge_active': return enterAction(state, 'charge_recovery', events);
        case 'charge_recovery': return enterAction(state, 'idle', events);
        case 'swap_windup': return enterAction(flipPolarity(state, events), 'swap_recovery', events);
        case 'swap_recovery': return enterAction(state, 'idle', events);
        case 'stagger':
        case 'flinch':
        case 'shield_break':
            return enterAction(state, 'idle', events);
        default: return state;
    }
}

// --- Form II: the contested climb --------------------------------------------

function finishForm2Action(state: WardenState, events: WardenEvent[], playerDistance: number): WardenState {
    const dwell = WARDEN_TIMING.form2.hoverDwell;
    switch (state.action) {
        case 'shatter': return enterAction({ ...state, hoverDwell: dwell }, 'hover', events);
        case 'volley_windup': {
            const next = enterAction(state, 'volley_active', events);
            emitVolley(next, events, state.contestTower !== null || isPlayerFar(playerDistance));
            return next;
        }
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
        case 'crash': return enterAction(state, 'shield_break', events);
        case 'shield_break': return enterAction(state, 'recover', events);
        case 'recover': {
            events.push({ type: 'recovered' });
            return enterAction({ ...state, plungeTimer: WARDEN_TIMING.form2.plungeFirst, hoverDwell: dwell }, 'hover', events);
        }
        case 'flinch':
        case 'stagger':
            return enterAction({ ...state, hoverDwell: dwell }, 'hover', events);
        default: return state;
    }
}

function tickHover(state: WardenState, events: WardenEvent[], playerDistance: number): WardenState {
    if (state.hoverDwell > 0) return state;
    const far = state.contestTower !== null || isPlayerFar(playerDistance);
    if (state.swapTimer <= 0) {
        return enterAction({ ...state, swapTimer: WARDEN_TIMING.form2.swapInterval }, 'swap_windup', events);
    }
    // Plunges only threaten the platform: a climber is contested with volleys.
    if (!far && state.plungeTimer <= 0) {
        events.push({ type: 'plunge', phase: 'mark', impactRadius: WARDEN_TIMING.plunge.impactRadius, impactDamage: WARDEN_TIMING.plunge.impactDamage });
        return enterAction(state, 'plunge_windup', events);
    }
    if (state.volleyTimer <= 0) {
        return enterAction({ ...state, volleyTimer: WARDEN_TIMING.form2.volleyInterval }, 'volley_windup', events);
    }
    return state;
}

// --- Form III: the metronome ----------------------------------------------

function spiralInterval(state: WardenState): number {
    return isWardenOverloaded(state) ? WARDEN_TIMING.form3.overloadSpiralInterval : WARDEN_TIMING.form3.spiralInterval;
}

function fireBeatRing(state: WardenState, events: WardenEvent[], double: boolean, second: boolean): WardenState {
    const next = flipPolarity(state, events);
    const wave = WARDEN_TIMING.shockwave.beat;
    events.push({ type: 'beat', polarity: next.polarity, index: next.beatIndex, double, second });
    events.push({ type: 'shockwave', polarity: next.polarity, maxRadius: wave.maxRadius, speed: wave.speed, damage: wave.damage, source: 'beat' });
    if (!second && isWardenOverloaded(next) && !isWardenShielded(next)) {
        const spec = WARDEN_TIMING.form3.shardVolley;
        events.push({ type: 'shard-volley', speed: spec.speed, damage: spec.damage, ttl: spec.ttl, homing: spec.homing, polarity: next.polarity });
    }
    return next;
}

function tickMetronome(state: WardenState, events: WardenEvent[], dt: number): WardenState {
    let next = { ...state };
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
        events.push({ type: 'beat-tick', remaining: ticks[next.beatTicksReported], nextPolarity: upcoming, towers: wardenLiveTowers(next) });
        next.beatTicksReported += 1;
    }
    if (next.beatTimer <= 0) {
        const double = (next.beatIndex + 1) % WARDEN_TIMING.form3.doubleEvery === 0;
        next.beatIndex += 1;
        next = fireBeatRing(next, events, double, false);
        if (double) next.doubleTimer = WARDEN_TIMING.form3.doubleGap;
        next.beatTimer += getWardenBeatInterval(next);
        next.beatTicksReported = 0;
        // A beat cuts every grounded action short except the punish windows.
        if (!isWardenPunishable(next) && next.action !== 'flinch') {
            interruptAction(next, events);
            next = enterAction(next, 'recoil', events);
        }
    }
    return next;
}

function tickSpiral(state: WardenState, events: WardenEvent[], dt: number, playerDistance: number): WardenState {
    if (state.action !== 'spiral') return state;
    // A far player (on the last tower) is contested with honest climber volleys
    // instead of a spiral that can never reach them.
    if (isPlayerFar(playerDistance)) {
        if (state.volleyTimer > 0) return state;
        return enterAction({ ...state, volleyTimer: WARDEN_TIMING.form1.climberVolleyInterval }, 'volley_windup', events);
    }
    let timer = state.spiralTimer - dt;
    let angle = state.spiralAngle;
    const spec = WARDEN_TIMING.bolts.spiral;
    let guard = 0;
    while (timer <= 0 && guard < 8) {
        events.push({ type: 'spiral-bolt', angle, speed: spec.speed, damage: spec.damage, ttl: spec.ttl, homing: spec.homing, polarity: state.polarity });
        events.push({ type: 'spiral-bolt', angle: angle + Math.PI, speed: spec.speed, damage: spec.damage, ttl: spec.ttl, homing: spec.homing, polarity: state.polarity });
        angle += WARDEN_TIMING.form3.spiralStep;
        timer += spiralInterval(state);
        guard += 1;
    }
    return { ...state, spiralTimer: timer, spiralAngle: angle };
}

function finishForm3Action(state: WardenState, events: WardenEvent[], playerDistance: number): WardenState {
    switch (state.action) {
        case 'storm_rise': return enterAction({ ...state, beatTimer: WARDEN_TIMING.form3.beatInterval, beatTicksReported: 0, spiralTimer: 0.4 }, 'spiral', events);
        case 'recoil': return enterAction({ ...state, spiralTimer: 0.2 }, 'spiral', events);
        case 'volley_windup': {
            const next = enterAction(state, 'volley_active', events);
            emitVolley(next, events, isPlayerFar(playerDistance));
            return next;
        }
        case 'volley_active': return enterAction(state, 'volley_recovery', events);
        case 'volley_recovery': return enterAction({ ...state, spiralTimer: 0.2 }, 'spiral', events);
        case 'stagger':
        case 'flinch':
        case 'shield_break':
            return enterAction({ ...state, spiralTimer: 0.2 }, 'spiral', events);
        default: return state;
    }
}

// --- Damage and forms ------------------------------------------------------

function applyThresholds(state: WardenState, events: WardenEvent[]): WardenState {
    if (state.hp <= 0) {
        interruptAction(state, events);
        const dead = enterAction({ ...state, hp: 0, shieldLayers: 0, ignited: [] }, 'death', events);
        events.push({ type: 'shield', fraction: 0 });
        events.push({ type: 'defeated' });
        return dead;
    }
    const fraction = state.hp / state.maxHp;
    if (state.form === 1 && fraction <= WARDEN_FORM_THRESHOLDS[2]) {
        interruptAction(state, events);
        // Clamp so the transition fires exactly at the marker, never below it.
        // The Aegis ignites its two crystals as it shatters, and the hover
        // timers restart so the new form opens with a beat of stillness.
        let next: WardenState = {
            ...state,
            hp: state.maxHp * WARDEN_FORM_THRESHOLDS[2],
            form: 2,
            plungeTimer: WARDEN_TIMING.form2.plungeFirst,
            volleyTimer: 1.5,
            swapTimer: WARDEN_TIMING.form2.swapInterval,
            hoverDwell: 1.0,
        };
        next = enterAction(next, 'shatter', events);
        events.push({ type: 'form', form: 2 });
        next = igniteCrystals(next, 2, events);
        return next;
    }
    if (state.form === 2 && fraction <= WARDEN_FORM_THRESHOLDS[3]) {
        interruptAction(state, events);
        let next: WardenState = {
            ...state,
            hp: state.maxHp * WARDEN_FORM_THRESHOLDS[3],
            form: 3,
            volleyTimer: 1.5,
        };
        next = enterAction(next, 'storm_rise', events);
        events.push({ type: 'form', form: 3 });
        events.push({ type: 'crystals', mode: 'consume' });
        next = igniteCrystals(next, 3, events);
        events.push({ type: 'shards', active: true });
        return next;
    }
    return state;
}

function blockReason(state: WardenState, relation: PolarityRelation): WardenBlockReason | null {
    if (state.action === 'death') return 'dead';
    if (isWardenTransitioning(state)) return 'transition';
    if (isWardenShielded(state)) return 'shielded';
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
    const slam = input.slam === true;
    const punish = isWardenPunishable(state);
    const multiplier = (punish ? WARDEN_TIMING.punishMultiplier : 1) * (slam ? WARDEN_SLAM_MULTIPLIER : 1);
    const damage = Math.min(WARDEN_DAMAGE_CAP, clampDuration(input.amount) * multiplier);
    if (damage <= 0) return { state, events };
    events.push({ type: 'hurt', damage, relation, punish, slam });
    let next = applyThresholds({ ...state, hp: state.hp - damage }, events);
    // A Magnet Slam that lands on a standing Warden knocks it reeling, unless it
    // is already down or mid-transition.
    if (slam && next.form === state.form && next.action !== 'death' && !isWardenTransitioning(next)
        && !isWardenPunishable(next) && next.action !== 'flinch') {
        interruptAction(next, events);
        next = enterAction(next, 'stagger', events);
        events.push({ type: 'stagger' });
    }
    return { state: next, events };
}

// --- The reducer -----------------------------------------------------------

export function advanceWarden(state: WardenState, input: WardenInput): WardenTransition {
    if (input.type === 'damage') return resolveDamage(state, input);
    if (input.type === 'crystal-broken') return resolveCrystalBroken(state, input.crystal);
    if (input.type === 'configure') {
        const events: WardenEvent[] = [];
        const crystals = Array.from({ length: Math.max(0, Math.floor(input.crystals)) }, () => false);
        // Form I opens shielded by its crystal (if the arena has one).
        const next = igniteCrystals({ ...state, crystals }, state.form, events);
        return { state: next, events };
    }

    const events: WardenEvent[] = [];
    const dt = clampDuration(Math.min(0.1, input.dt));
    if (dt <= 0 || state.action === 'death') return { state, events };

    const playerTower = input.playerTower ?? null;
    const contestTower = playerTower !== null && state.ignited.includes(playerTower) && state.crystals[playerTower] === true
        ? playerTower
        : null;

    let next: WardenState = {
        ...state,
        clock: state.clock + dt,
        cooldowns: {
            volley: Math.max(0, state.cooldowns.volley - dt),
            lash: Math.max(0, state.cooldowns.lash - dt),
            draw: Math.max(0, state.cooldowns.draw - dt),
            charge: Math.max(0, state.cooldowns.charge - dt),
        },
        swapTimer: state.swapTimer - dt,
        volleyTimer: state.volleyTimer - dt,
        plungeTimer: state.plungeTimer - dt,
        hoverDwell: Math.max(0, state.hoverDwell - dt),
        actionTime: state.actionTime + dt,
        contestTower,
    };

    if (next.actionDuration > 0 && next.actionTime >= next.actionDuration && next.action !== 'death') {
        if (next.form === 1) next = finishForm1Action(next, events, input.playerDistance);
        else if (next.form === 2) next = finishForm2Action(next, events, input.playerDistance);
        else next = finishForm3Action(next, events, input.playerDistance);
    }

    if (next.form === 2 && next.action === 'hover') next = tickHover(next, events, input.playerDistance);
    if (next.form === 3 && next.action !== 'storm_rise') {
        next = tickMetronome(next, events, dt);
        next = tickSpiral(next, events, dt, input.playerDistance);
    }
    return { state: next, events };
}

/** The resting action a form returns to after a window closes (exposed for the runtime's animation). */
export const wardenRestAction = restAction;
