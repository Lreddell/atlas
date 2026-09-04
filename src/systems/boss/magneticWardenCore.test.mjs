import assert from 'node:assert/strict';
import test from 'node:test';

import {
    FLUX_MAX,
    WARDEN_DAMAGE_CAP,
    WARDEN_FORM_THRESHOLDS,
    WARDEN_MAX_HP,
    WARDEN_TIMING,
    advanceWarden,
    createWardenState,
    getWardenFieldProfile,
    isInWardenCone,
    polarityRelation,
    selectWardenAttack,
    wardenShardOffsets,
} from './magneticWardenCore.ts';

const STEP = 0.05;

/** Advance `seconds` of ticks, collecting every event; extra tick fields optional. */
function run(state, seconds, extra = {}) {
    const events = [];
    let current = state;
    const steps = Math.round(seconds / STEP);
    for (let index = 0; index < steps; index += 1) {
        const transition = advanceWarden(current, { type: 'tick', dt: STEP, playerDistance: 10, ...extra });
        current = transition.state;
        events.push(...transition.events);
    }
    return { state: current, events };
}

/** Tick until `predicate(state)` holds (or the time limit passes). */
function runUntil(state, predicate, limitSeconds, extra = {}) {
    const events = [];
    let current = state;
    let elapsed = 0;
    while (!predicate(current) && elapsed < limitSeconds) {
        const transition = advanceWarden(current, { type: 'tick', dt: STEP, playerDistance: 10, ...extra });
        current = transition.state;
        events.push(...transition.events);
        elapsed += STEP;
    }
    assert.ok(predicate(current), `condition not reached within ${limitSeconds}s (action=${current.action}, form=${current.form})`);
    return { state: current, events, elapsed };
}

const hit = (state, amount, playerPolarity) => advanceWarden(state, { type: 'damage', amount, playerPolarity });
const types = (events) => events.map((event) => event.type);

/** Land capped opposite-polarity hits until the Warden changes form. */
function batterIntoForm(state, form) {
    let current = state;
    let events = [];
    let guard = 0;
    while (current.form < form && guard < 40) {
        const transition = hit(current, WARDEN_DAMAGE_CAP, -1);
        current = transition.state;
        events = transition.events;
        guard += 1;
    }
    assert.equal(current.form, form);
    return { state: current, events };
}

/** A Form II Aegis fresh out of its shatter, tethered to crystal `preferred`. */
function aegis(preferred = 2) {
    const configured = advanceWarden(createWardenState(), { type: 'configure', crystals: 4 }).state;
    const { state } = batterIntoForm(configured, 2);
    assert.equal(state.action, 'shatter');
    const result = runUntil(state, (s) => s.action === 'hover', 4, { preferredCrystal: preferred });
    return result;
}

/** A Form III Storm fresh out of storm_rise. */
function storm() {
    const { state: tethered } = aegis();
    // Snap the tether so the core is stunned and hittable, then push it under 1/3.
    let state = advanceWarden(tethered, { type: 'crystal-broken', crystal: tethered.tether.crystal }).state;
    state = runUntil(state, (s) => s.action === 'stunned', 2).state;
    const crossing = batterIntoForm(state, 3);
    assert.equal(crossing.state.action, 'storm_rise');
    const risen = runUntil(crossing.state, (s) => s.action === 'spiral', 4);
    return { state: risen.state, events: [...crossing.events, ...risen.events] };
}

test('the one rule: same repels, opposite attracts, no boots is neutral', () => {
    assert.equal(polarityRelation(1, 1), 'same');
    assert.equal(polarityRelation(-1, -1), 'same');
    assert.equal(polarityRelation(1, -1), 'opposite');
    assert.equal(polarityRelation(-1, 1), 'opposite');
    assert.equal(polarityRelation(0, 1), 'neutral');
    assert.equal(polarityRelation(Number.NaN, 1), 'neutral');
});

test('Form I opens idle and picks its attack from the spacing', () => {
    const fresh = createWardenState();
    assert.equal(fresh.form, 1);
    assert.equal(fresh.action, 'idle');
    assert.equal(selectWardenAttack(fresh, 2), 'lash');
    assert.equal(selectWardenAttack(fresh, 8), 'draw');
    assert.equal(selectWardenAttack(fresh, 20), 'volley');
    const close = run(fresh, WARDEN_TIMING.actions.idle + STEP, { playerDistance: 2 });
    assert.equal(close.state.action, 'lash_windup');
    const far = run(fresh, WARDEN_TIMING.actions.idle + STEP, { playerDistance: 30 });
    assert.equal(far.state.action, 'volley_windup');
});

test('a Form I volley is telegraphed by a windup and fires five bolts on the active frame', () => {
    const start = run(createWardenState(), WARDEN_TIMING.actions.idle + STEP, { playerDistance: 30 });
    assert.equal(start.state.action, 'volley_windup');
    const fired = runUntil(start.state, (s) => s.action === 'volley_active', 2, { playerDistance: 30 });
    const volley = fired.events.find((event) => event.type === 'volley');
    assert.ok(volley);
    assert.equal(volley.count, 5);
    assert.equal(volley.polarity, 1);
    assert.equal(fired.events.filter((event) => event.type === 'volley').length, 1);
    const recovered = runUntil(fired.state, (s) => s.action === 'idle', 3, { playerDistance: 30 });
    assert.ok(recovered.events.some((event) => event.type === 'action' && event.action === 'volley_recovery'));
    // Cooldown: the very next pick at the same spacing is not another volley.
    const next = run(recovered.state, WARDEN_TIMING.actions.idle + STEP, { playerDistance: 30 });
    assert.notEqual(next.state.action, 'volley_windup');
});

test('the Draw pulls for its active window then ends in a Repel burst', () => {
    const start = run(createWardenState(), WARDEN_TIMING.actions.idle + STEP, { playerDistance: 8 });
    assert.equal(start.state.action, 'draw_windup');
    const active = runUntil(start.state, (s) => s.action === 'draw_active', 2, { playerDistance: 8 });
    const on = active.events.find((event) => event.type === 'draw');
    assert.ok(on && on.active === true);
    assert.deepEqual(getWardenFieldProfile(active.state), {
        range: WARDEN_TIMING.draw.range, force: WARDEN_TIMING.draw.force, maxDrift: WARDEN_TIMING.draw.maxDrift,
    });
    const done = runUntil(active.state, (s) => s.action === 'draw_recovery', 3, { playerDistance: 8 });
    const sequence = types(done.events);
    assert.ok(sequence.includes('repel'));
    const off = done.events.find((event) => event.type === 'draw' && event.active === false);
    assert.ok(off);
    assert.ok(sequence.indexOf('repel') < sequence.indexOf('action'));
});

test('polarity swaps are their own telegraphed action: the flip lands after the windup', () => {
    const state = createWardenState({ swapTimer: 0 });
    const chosen = run(state, WARDEN_TIMING.actions.idle + STEP, { playerDistance: 30 });
    assert.equal(chosen.state.action, 'swap_windup');
    assert.equal(chosen.state.polarity, 1);
    assert.ok(!chosen.events.some((event) => event.type === 'polarity'));
    const flipped = runUntil(chosen.state, (s) => s.action === 'swap_recovery', 2, { playerDistance: 30 });
    assert.equal(flipped.state.polarity, -1);
    assert.ok(flipped.events.some((event) => event.type === 'polarity' && event.polarity === -1));
    assert.ok(flipped.state.swapTimer > WARDEN_TIMING.form1.swapInterval - 3);
});

test('hits with the same polarity are repelled, opposite and neutral land, and single hits are capped', () => {
    const state = createWardenState();
    const repelled = hit(state, 12, 1);
    assert.equal(repelled.state.hp, WARDEN_MAX_HP);
    assert.deepEqual(types(repelled.events), ['blocked']);
    assert.equal(repelled.events[0].reason, 'repelled');
    const landed = hit(state, 12, -1);
    assert.equal(landed.state.hp, WARDEN_MAX_HP - 12);
    assert.equal(landed.events[0].type, 'hurt');
    assert.equal(landed.events[0].relation, 'opposite');
    const neutral = hit(state, 12, 0);
    assert.equal(neutral.state.hp, WARDEN_MAX_HP - 12);
    const capped = hit(state, 500, -1);
    assert.equal(WARDEN_MAX_HP - capped.state.hp, WARDEN_DAMAGE_CAP);
});

test('crossing two thirds clamps the hit to the marker and shatters into the Aegis', () => {
    const configured = advanceWarden(createWardenState(), { type: 'configure', crystals: 4 }).state;
    // One capped hit leaves it above the marker; the next would overshoot and is clamped.
    const first = hit(configured, WARDEN_DAMAGE_CAP, -1);
    assert.equal(first.state.form, 1);
    const crossed = hit(first.state, WARDEN_DAMAGE_CAP + 20, -1);
    assert.equal(crossed.state.form, 2);
    assert.equal(crossed.state.action, 'shatter');
    assert.ok(Math.abs(crossed.state.hp - WARDEN_MAX_HP * WARDEN_FORM_THRESHOLDS[2]) < 1e-9);
    const kinds = types(crossed.events);
    assert.ok(kinds.includes('form'));
    assert.ok(crossed.events.some((event) => event.type === 'crystals' && event.mode === 'spawn'));
    assert.deepEqual(crossed.state.crystals, [true, true, true, true]);
    // The transition itself is invulnerable, whatever the polarity.
    const during = hit(crossed.state, 20, -1);
    assert.equal(during.events[0].type, 'blocked');
    assert.equal(during.events[0].reason, 'transition');
});

test('the Aegis tethers to the preferred crystal, is shielded, and burns the tether out into a stun', () => {
    const { state, events } = aegis(2);
    assert.deepEqual(state.tether && { crystal: state.tether.crystal, total: state.tether.total }, { crystal: 2, total: WARDEN_TIMING.form2.tetherSeconds });
    assert.ok(events.some((event) => event.type === 'tether' && event.crystal === 2));
    assert.ok(events.some((event) => event.type === 'shield' && event.fraction === 1));
    const blocked = hit(state, 20, -1);
    assert.equal(blocked.events[0].type, 'blocked');
    assert.equal(blocked.events[0].reason, 'tethered');

    const burnt = runUntil(state, (s) => s.action === 'crash', WARDEN_TIMING.form2.tetherSeconds + 1, { preferredCrystal: 2 });
    const snapped = burnt.events.find((event) => event.type === 'tether-snapped');
    assert.ok(snapped);
    assert.equal(snapped.reason, 'burnout');
    assert.equal(snapped.crystal, 2);
    assert.equal(snapped.stunSeconds, WARDEN_TIMING.form2.stun.burnout);
    assert.equal(burnt.state.crystals[2], false);
    // The shield fraction was reported receding while the tether burned.
    const fractions = burnt.events.filter((event) => event.type === 'shield').map((event) => event.fraction);
    assert.ok(fractions.some((fraction) => fraction > 0 && fraction < 1));
    assert.equal(fractions[fractions.length - 1], 0);

    const stunned = runUntil(burnt.state, (s) => s.action === 'stunned', 1, { preferredCrystal: 0 });
    assert.equal(stunned.state.actionDuration, WARDEN_TIMING.form2.stun.burnout);
    const rested = runUntil(stunned.state, (s) => s.action === 'hover', WARDEN_TIMING.form2.stun.burnout + WARDEN_TIMING.actions.recover + 1, { preferredCrystal: 0 });
    assert.ok(rested.events.some((event) => event.type === 'recovered'));
    assert.equal(rested.state.tether && rested.state.tether.crystal, 0);
});

test('breaking the tethered crystal grounds the Aegis for a long punish window', () => {
    const { state } = aegis(1);
    // Breaking a different crystal only removes it from the roster.
    const other = advanceWarden(state, { type: 'crystal-broken', crystal: 3 });
    assert.equal(other.state.action, 'hover');
    assert.equal(other.state.crystals[3], false);
    assert.deepEqual(other.events, []);

    const broken = advanceWarden(other.state, { type: 'crystal-broken', crystal: 1 });
    const snapped = broken.events.find((event) => event.type === 'tether-snapped');
    assert.equal(snapped.reason, 'broken');
    assert.equal(snapped.stunSeconds, WARDEN_TIMING.form2.stun.broken);
    assert.equal(broken.state.action, 'crash');
    const stunned = runUntil(broken.state, (s) => s.action === 'stunned', 1);
    const punished = hit(stunned.state, 10, -1);
    assert.equal(punished.events[0].type, 'hurt');
    assert.equal(punished.events[0].punish, true);
    assert.ok(Math.abs((stunned.state.hp - punished.state.hp) - 10 * WARDEN_TIMING.punishMultiplier) < 1e-9);
    // Same polarity is still repelled, even while it lies stunned.
    assert.equal(hit(stunned.state, 10, 1).events[0].reason, 'repelled');
});

test('with every crystal gone the Aegis limps untethered and can be hit normally', () => {
    let { state } = aegis(0);
    for (let crystal = 0; crystal < 4; crystal += 1) {
        state = advanceWarden(state, { type: 'crystal-broken', crystal }).state;
    }
    const rested = runUntil(state, (s) => s.action === 'hover' && s.tether === null, 12);
    assert.ok(rested.events.some((event) => event.type === 'untethered'));
    const landed = hit(rested.state, 10, -1);
    assert.equal(landed.events[0].type, 'hurt');
    assert.equal(landed.events[0].punish, false);
});

test('the Aegis plunges on a timer: mark, drop, then an impact with a polarity ring', () => {
    const { state } = aegis(0);
    const marked = runUntil(state, (s) => s.action === 'plunge_windup', WARDEN_TIMING.form2.plungeFirst + 4, { preferredCrystal: 0 });
    assert.ok(marked.events.some((event) => event.type === 'plunge' && event.phase === 'mark'));
    const landed = runUntil(marked.state, (s) => s.action === 'plunge_recovery', 3, { preferredCrystal: 0 });
    const phases = landed.events.filter((event) => event.type === 'plunge').map((event) => event.phase);
    assert.deepEqual(phases, ['drop', 'impact']);
    const ring = landed.events.find((event) => event.type === 'shockwave');
    assert.equal(ring.source, 'plunge');
    assert.equal(ring.polarity, landed.state.polarity);
});

test('Flux fills from absorbed bolts and a flip discharges it: snapping a tether or staggering the Warden', () => {
    let state = createWardenState();
    for (let index = 0; index < FLUX_MAX - 1; index += 1) state = advanceWarden(state, { type: 'bolt-absorbed' }).state;
    assert.equal(state.flux, FLUX_MAX - 1);
    const full = advanceWarden(state, { type: 'bolt-absorbed' });
    assert.equal(full.state.flux, FLUX_MAX);
    assert.ok(full.events.some((event) => event.type === 'flux' && event.full === true));
    // A flip with the boss out of range spends the charge without hurting it.
    const miss = advanceWarden(full.state, { type: 'polarity-flipped', bossInRange: false });
    assert.equal(miss.state.flux, 0);
    assert.equal(miss.state.hp, WARDEN_MAX_HP);
    assert.ok(miss.events.some((event) => event.type === 'burst' && event.hitBoss === false));
    // A flip without a full meter does nothing.
    assert.deepEqual(advanceWarden(miss.state, { type: 'polarity-flipped', bossInRange: true }).events, []);
    // Form I: 10% of max HP and a stagger window.
    const burst = advanceWarden(full.state, { type: 'polarity-flipped', bossInRange: true });
    assert.equal(burst.state.hp, WARDEN_MAX_HP - Math.round(WARDEN_MAX_HP * 0.1));
    assert.equal(burst.state.action, 'stagger');
    assert.ok(burst.events.some((event) => event.type === 'stagger'));
    // Form II: a tethered core is grounded by the burst instead.
    let tethered = aegis(3).state;
    for (let index = 0; index < FLUX_MAX; index += 1) tethered = advanceWarden(tethered, { type: 'bolt-absorbed' }).state;
    const snapped = advanceWarden(tethered, { type: 'polarity-flipped', bossInRange: true });
    const snap = snapped.events.find((event) => event.type === 'tether-snapped');
    assert.equal(snap.reason, 'burst');
    assert.equal(snap.stunSeconds, WARDEN_TIMING.form2.stun.burst);
    assert.equal(snapped.state.flux, 0);
});

test('a threshold crossing mid-Draw switches the field off before the transition', () => {
    const start = run(createWardenState({ hp: WARDEN_MAX_HP * WARDEN_FORM_THRESHOLDS[2] + 1 }), WARDEN_TIMING.actions.idle + STEP, { playerDistance: 8 });
    const active = runUntil(start.state, (s) => s.action === 'draw_active', 2, { playerDistance: 8 });
    const crossed = hit(active.state, 5, -1);
    assert.equal(crossed.state.form, 2);
    const kinds = types(crossed.events);
    assert.ok(crossed.events.some((event) => event.type === 'draw' && event.active === false));
    assert.ok(kinds.indexOf('draw') < kinds.indexOf('form'));
});

test('crossing one third consumes the crystals and rises into the Storm', () => {
    const { state, events } = storm();
    assert.equal(state.form, 3);
    assert.equal(state.action, 'spiral');
    assert.ok(events.some((event) => event.type === 'form' && event.form === 3));
    assert.ok(events.some((event) => event.type === 'crystals' && event.mode === 'consume'));
    assert.ok(events.some((event) => event.type === 'shards' && event.active));
    assert.deepEqual(state.crystals, [false, false, false, false]);
    assert.equal(state.tether, null);
    assert.equal(getWardenFieldProfile(state).range, WARDEN_TIMING.field[3].range);
});

test('the Storm metronome: ticks, a ring on the beat, a recoil window, spirals between', () => {
    const { state } = storm();
    const beat = runUntil(state, (s) => s.action === 'recoil', WARDEN_TIMING.form3.beatInterval + 1);
    const kinds = types(beat.events);
    const ticks = beat.events.filter((event) => event.type === 'beat-tick').map((event) => event.remaining);
    assert.deepEqual(ticks, [1.0, 0.5]);
    assert.ok(beat.events.every((event) => event.type !== 'beat-tick' || event.nextPolarity === -1));
    assert.ok(kinds.indexOf('beat-tick') < kinds.indexOf('beat'));
    const ring = beat.events.find((event) => event.type === 'shockwave');
    assert.equal(ring.source, 'beat');
    assert.equal(ring.polarity, -1);
    assert.equal(beat.state.polarity, -1);
    assert.ok(beat.events.some((event) => event.type === 'polarity' && event.polarity === -1));
    // Spiral bolts flowed before the beat, in opposite pairs.
    const spirals = beat.events.filter((event) => event.type === 'spiral-bolt');
    assert.ok(spirals.length >= 20);
    assert.ok(Math.abs((spirals[1].angle - spirals[0].angle) - Math.PI) < 1e-9);
    // No bolts during the recoil window.
    const quiet = run(beat.state, WARDEN_TIMING.actions.recoil - STEP);
    assert.equal(quiet.events.filter((event) => event.type === 'spiral-bolt').length, 0);
    assert.equal(quiet.state.action, 'recoil');
    const resumed = runUntil(quiet.state, (s) => s.action === 'spiral', 1);
    assert.equal(resumed.state.action, 'spiral');
});

test('every fourth beat is a double beat with a second ring of the flipped-back colour', () => {
    const { state } = storm();
    let current = state;
    const rings = [];
    for (let beatNumber = 1; beatNumber <= 4; beatNumber += 1) {
        const next = runUntil(current, (s) => s.beatIndex === beatNumber, WARDEN_TIMING.form3.beatInterval + 1.5);
        rings.push(...next.events.filter((event) => event.type === 'beat'));
        current = next.state;
    }
    assert.deepEqual(rings.map((event) => event.double), [false, false, false, true]);
    assert.equal(current.doubleTimer > 0, true);
    const second = runUntil(current, (s) => s.doubleTimer === 0, WARDEN_TIMING.form3.doubleGap + 0.5);
    const secondRing = second.events.find((event) => event.type === 'beat' && event.second);
    assert.ok(secondRing);
    assert.equal(secondRing.polarity, rings[3].polarity * -1);
    assert.equal(second.events.filter((event) => event.type === 'shockwave').length, 1);
});

test('the Warden dies once and then ignores every input', () => {
    const state = createWardenState({ hp: 5, form: 3, action: 'spiral', actionDuration: 0 });
    const dead = hit(state, 10, -1);
    assert.equal(dead.state.hp, 0);
    assert.equal(dead.state.action, 'death');
    assert.ok(dead.events.some((event) => event.type === 'defeated'));
    assert.deepEqual(hit(dead.state, 10, -1).events.map((event) => event.type), ['blocked']);
    assert.deepEqual(run(dead.state, 1).events, []);
    assert.deepEqual(advanceWarden(dead.state, { type: 'bolt-absorbed' }).events, []);
});

test('shard offsets and the Lash cone share their geometry with the renderer', () => {
    const offsets = wardenShardOffsets(0);
    assert.equal(offsets.length, WARDEN_TIMING.form3.shardCount);
    for (const offset of offsets) {
        assert.ok(Math.abs(Math.hypot(offset.x, offset.z) - WARDEN_TIMING.form3.shardRadius) < 1e-9);
    }
    const origin = { x: 0, y: 0, z: 0 };
    assert.equal(isInWardenCone(origin, 0, { x: 0, y: 0, z: 3 }), true);
    assert.equal(isInWardenCone(origin, 0, { x: 0, y: 0, z: -3 }), false);
    assert.equal(isInWardenCone(origin, 0, { x: 0, y: 0, z: 6 }), false);
    assert.equal(isInWardenCone(origin, Math.PI / 2, { x: 3, y: 0, z: 0 }), true);
});
