import assert from 'node:assert/strict';
import test from 'node:test';

import {
    WARDEN_DAMAGE_CAP,
    WARDEN_FORM_CRYSTALS,
    WARDEN_FORM_THRESHOLDS,
    WARDEN_MAX_HP,
    WARDEN_SLAM_MULTIPLIER,
    WARDEN_TIMING,
    advanceWarden,
    createWardenState,
    getWardenFieldProfile,
    isInWardenCone,
    isInWardenLane,
    isWardenShielded,
    polarityRelation,
    selectWardenAttack,
    wardenLiveTowers,
    wardenShardOffsets,
} from './magneticWardenCore.ts';

const STEP = 0.05;
const NEAR = { playerDistance: 10, playerTower: null };
const FAR = { playerDistance: 35, playerTower: null };

/** Advance `seconds` of ticks, collecting every event. */
function run(state, seconds, extra = NEAR) {
    const events = [];
    let current = state;
    const steps = Math.round(seconds / STEP);
    for (let index = 0; index < steps; index += 1) {
        const transition = advanceWarden(current, { type: 'tick', dt: STEP, ...extra });
        current = transition.state;
        events.push(...transition.events);
    }
    return { state: current, events };
}

/** Tick until `predicate(state)` holds (or the time limit passes). */
function runUntil(state, predicate, limitSeconds, extra = NEAR) {
    const events = [];
    let current = state;
    let elapsed = 0;
    while (!predicate(current) && elapsed < limitSeconds) {
        const transition = advanceWarden(current, { type: 'tick', dt: STEP, ...extra });
        current = transition.state;
        events.push(...transition.events);
        elapsed += STEP;
    }
    assert.ok(predicate(current), `condition not reached within ${limitSeconds}s (action=${current.action}, form=${current.form}, layers=${current.shieldLayers})`);
    return { state: current, events, elapsed };
}

const hit = (state, amount, playerPolarity, slam = false) => advanceWarden(state, { type: 'damage', amount, playerPolarity, slam });
const breakCrystal = (state, crystal) => advanceWarden(state, { type: 'crystal-broken', crystal });
const types = (events) => events.map((event) => event.type);

/** A fresh arena fight: four tower crystals, Form I shielded by crystal 0. */
function arenaFight() {
    return advanceWarden(createWardenState(), { type: 'configure', crystals: 4 });
}

/** Form I with its shield already broken and the reel finished. */
function openDuel() {
    let state = arenaFight().state;
    state = breakCrystal(state, 0).state;
    return runUntil(state, (s) => s.action === 'idle', 5).state;
}

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

/** A Form II Aegis fresh out of its shatter, shielded by crystals 1 and 2. */
function aegis() {
    const { state, events } = batterIntoForm(openDuel(), 2);
    assert.equal(state.action, 'shatter');
    const risen = runUntil(state, (s) => s.action === 'hover', 4);
    return { state: risen.state, events: [...events, ...risen.events] };
}

/** A Form II Aegis with both crystals broken, recovered into its low limp. */
function limpingAegis() {
    let { state } = aegis();
    state = breakCrystal(state, 1).state;
    state = runUntil(state, (s) => s.action === 'hover', 3).state;
    state = breakCrystal(state, 2).state;
    return runUntil(state, (s) => s.action === 'hover' && !isWardenShielded(s), 10).state;
}

/** A Form III Storm fresh out of storm_rise, shielded by crystal 3. */
function storm() {
    const crossing = batterIntoForm(limpingAegis(), 3);
    assert.equal(crossing.state.action, 'storm_rise');
    const risen = runUntil(crossing.state, (s) => s.action === 'spiral', 4);
    return { state: risen.state, events: [...crossing.events, ...risen.events] };
}

/** The Storm with its last crystal broken (unshielded finale). */
function openStorm() {
    let state = storm().state;
    state = breakCrystal(state, 3).state;
    return runUntil(state, (s) => s.action === 'spiral' && !isWardenShielded(s), 6).state;
}

test('the one rule: same repels, opposite attracts, no boots is neutral', () => {
    assert.equal(polarityRelation(1, 1), 'same');
    assert.equal(polarityRelation(-1, -1), 'same');
    assert.equal(polarityRelation(1, -1), 'opposite');
    assert.equal(polarityRelation(-1, 1), 'opposite');
    assert.equal(polarityRelation(0, 1), 'neutral');
    assert.equal(polarityRelation(Number.NaN, 1), 'neutral');
});

test('every form opens shielded by its own tower crystals, and the shield never decays', () => {
    assert.deepEqual(WARDEN_FORM_CRYSTALS, { 1: [0], 2: [1, 2], 3: [3] });
    const { state, events } = arenaFight();
    assert.equal(isWardenShielded(state), true);
    assert.deepEqual(state.ignited, [0]);
    assert.ok(events.some((event) => event.type === 'crystals' && event.mode === 'ignite' && event.crystals[0] === 0));
    assert.ok(events.some((event) => event.type === 'shield' && event.fraction === 1));
    // Any hit, of any polarity or strength, bounces while the crystal stands.
    for (const polarity of [1, -1, 0]) {
        const blocked = hit(state, 40, polarity, true);
        assert.equal(blocked.state.hp, WARDEN_MAX_HP);
        assert.equal(blocked.events[0].type, 'blocked');
        assert.equal(blocked.events[0].reason, 'shielded');
    }
    // Sixty seconds later it is still shielded: no burnout, no pity timer.
    const later = run(state, 60, FAR);
    assert.equal(isWardenShielded(later.state), true);
    assert.equal(later.state.shieldLayers, 1);
    // Without an arena (no crystals) the fight simply opens unshielded.
    const bare = advanceWarden(createWardenState(), { type: 'configure', crystals: 0 });
    assert.equal(isWardenShielded(bare.state), false);
});

test('breaking the form crystal shatters the shield into a punishable reel', () => {
    const { state } = arenaFight();
    const broken = breakCrystal(state, 0);
    assert.equal(broken.state.shieldLayers, 0);
    assert.equal(broken.state.action, 'shield_break');
    const kinds = types(broken.events);
    assert.ok(kinds.includes('crystal-lost'));
    assert.ok(kinds.includes('shield-broken'));
    assert.ok(broken.events.some((event) => event.type === 'shield' && event.fraction === 0));
    // Reeling: opposite hits land at the punish multiplier; same still bounces.
    const punished = hit(broken.state, 10, -1);
    assert.equal(punished.events[0].type, 'hurt');
    assert.equal(punished.events[0].punish, true);
    assert.ok(Math.abs((broken.state.hp - punished.state.hp) - 10 * WARDEN_TIMING.punishMultiplier) < 1e-9);
    assert.equal(hit(broken.state, 10, 1).events[0].reason, 'repelled');
    // Breaking a crystal that is not ignited (or already gone) does nothing.
    assert.deepEqual(breakCrystal(broken.state, 0).events, []);
    assert.deepEqual(breakCrystal(broken.state, 2).events, []);
    // The reel ends and the duel opens.
    const duel = runUntil(broken.state, (s) => s.action === 'idle', WARDEN_TIMING.actions.shield_break + 1);
    assert.equal(isWardenShielded(duel.state), false);
});

test('a shielded Warden holsters its Draw and only volleys at a player away on the towers', () => {
    const { state } = arenaFight();
    for (let index = 0; index < 20; index += 1) {
        assert.notEqual(selectWardenAttack({ ...state, attackIndex: index, cooldowns: { volley: 0, lash: 0, draw: 0, charge: 0 } }, 8), 'draw');
    }
    assert.equal(selectWardenAttack(openDuel(), 8), 'draw');
    // Far away: nothing but climber volleys, on the slow climber cadence.
    const far = run(state, 12, FAR);
    const actions = far.events.filter((event) => event.type === 'action').map((event) => event.action);
    assert.ok(actions.every((action) => action.startsWith('volley') || action === 'idle' || action.startsWith('swap')), actions.join(','));
    const volleys = far.events.filter((event) => event.type === 'volley');
    assert.ok(volleys.length >= 3);
    assert.ok(volleys.every((event) => event.climber === true && event.spec.homing === 0));
});

test('Form I duels from the spacing: Lash close, Draw mid, Charge lanes, Volley far', () => {
    const duel = openDuel();
    const ready = { ...duel, cooldowns: { volley: 0, lash: 0, draw: 0, charge: 0 }, lastAttack: null, attackIndex: 0 };
    assert.equal(selectWardenAttack(ready, 2), 'lash');
    assert.equal(selectWardenAttack(ready, 8), 'draw');
    assert.equal(selectWardenAttack({ ...ready, cooldowns: { volley: 0, lash: 0, draw: 99, charge: 0 } }, 9), 'charge');
    assert.equal(selectWardenAttack(ready, 30), 'volley');
    // The Charge: a lane telegraph, then a lunge with the lane geometry.
    const charging = run({ ...ready, cooldowns: { volley: 9, lash: 9, draw: 99, charge: 0 } }, WARDEN_TIMING.actions.idle + STEP, { playerDistance: 9, playerTower: null });
    assert.equal(charging.state.action, 'charge_windup');
    const lunge = runUntil(charging.state, (s) => s.action === 'charge_active', 2, { playerDistance: 9, playerTower: null });
    const charge = lunge.events.find((event) => event.type === 'charge');
    assert.equal(charge.length, WARDEN_TIMING.charge.length);
    assert.equal(charge.speed, WARDEN_TIMING.charge.speed);
    assert.equal(isInWardenLane({ x: 0, y: 0, z: 0 }, 0, { x: 0.5, y: 0, z: 8 }), true);
    assert.equal(isInWardenLane({ x: 0, y: 0, z: 0 }, 0, { x: 3, y: 0, z: 8 }), false);
    assert.equal(isInWardenLane({ x: 0, y: 0, z: 0 }, 0, { x: 0, y: 0, z: -3 }), false);
});

test('a Form I volley fires five homing bolts; the Draw ends in a Repel burst', () => {
    const duel = openDuel();
    // At volley range on the platform (inside farDistance) the full homing fan flies.
    const RANGED = { playerDistance: 16, playerTower: null };
    const start = run({ ...duel, cooldowns: { volley: 0, lash: 9, draw: 9, charge: 9 } }, WARDEN_TIMING.actions.idle + STEP, RANGED);
    assert.equal(start.state.action, 'volley_windup');
    const fired = runUntil(start.state, (s) => s.action === 'volley_active', 2, RANGED);
    const volley = fired.events.find((event) => event.type === 'volley');
    assert.equal(volley.spec.count, 5);
    assert.equal(volley.climber, false);
    assert.ok(volley.spec.homing > 0);
    // Beyond farDistance (on the towers or over the moat) only the slower climber spread reaches.
    const farStart = run({ ...duel, cooldowns: { volley: 0, lash: 9, draw: 9, charge: 9 } }, WARDEN_TIMING.actions.idle + STEP, FAR);
    const farFired = runUntil(farStart.state, (s) => s.action === 'volley_active', 2, FAR);
    const climberVolley = farFired.events.find((event) => event.type === 'volley');
    assert.equal(climberVolley.climber, true);
    assert.equal(climberVolley.spec.count, WARDEN_TIMING.bolts.climber.count);
    assert.equal(climberVolley.spec.homing, 0);
    const drawStart = run({ ...duel, cooldowns: { volley: 9, lash: 9, draw: 0, charge: 9 } }, WARDEN_TIMING.actions.idle + STEP, { playerDistance: 8, playerTower: null });
    assert.equal(drawStart.state.action, 'draw_windup');
    const active = runUntil(drawStart.state, (s) => s.action === 'draw_active', 2, { playerDistance: 8, playerTower: null });
    assert.ok(active.events.some((event) => event.type === 'draw' && event.active === true));
    assert.deepEqual(getWardenFieldProfile(active.state), { range: WARDEN_TIMING.draw.range, force: WARDEN_TIMING.draw.force, maxDrift: WARDEN_TIMING.draw.maxDrift });
    const done = runUntil(active.state, (s) => s.action === 'draw_recovery', 3, { playerDistance: 8, playerTower: null });
    const kinds = types(done.events);
    assert.ok(kinds.includes('repel'));
    assert.ok(done.events.some((event) => event.type === 'draw' && event.active === false));
});

test('polarity swaps are telegraphed and flip the standing ignited towers with the Warden', () => {
    const { state } = arenaFight();
    const chosen = run({ ...state, swapTimer: 0 }, WARDEN_TIMING.actions.idle + STEP, FAR);
    assert.equal(chosen.state.action, 'swap_windup');
    assert.ok(!chosen.events.some((event) => event.type === 'polarity'));
    const flipped = runUntil(chosen.state, (s) => s.action === 'swap_recovery', 2, FAR);
    const polarity = flipped.events.find((event) => event.type === 'polarity');
    assert.equal(polarity.polarity, -1);
    assert.deepEqual(polarity.towers, [0]);
    assert.deepEqual(wardenLiveTowers(flipped.state), [0]);
    // Once its crystal is gone the swap carries no towers.
    const bare = breakCrystal(flipped.state, 0).state;
    assert.deepEqual(wardenLiveTowers(bare), []);
});

test('hits with the same polarity are repelled, opposite and neutral land, slams hit harder and stagger', () => {
    const duel = openDuel();
    const repelled = hit(duel, 12, 1);
    assert.equal(repelled.state.hp, duel.hp);
    assert.equal(repelled.events[0].reason, 'repelled');
    const landed = hit(duel, 12, -1);
    assert.equal(landed.state.hp, duel.hp - 12);
    assert.equal(landed.events[0].relation, 'opposite');
    assert.equal(hit(duel, 12, 0).state.hp, duel.hp - 12);
    assert.equal(duel.hp - hit(duel, 500, -1).state.hp, WARDEN_DAMAGE_CAP);
    const slammed = hit(duel, 10, -1, true);
    assert.equal(duel.hp - slammed.state.hp, 10 * WARDEN_SLAM_MULTIPLIER);
    assert.equal(slammed.state.action, 'stagger');
    assert.ok(slammed.events.some((event) => event.type === 'hurt' && event.slam === true));
    // A reeling Warden takes the punish bonus on top, and does not re-stagger.
    const reeling = { ...duel, action: 'shield_break', actionDuration: WARDEN_TIMING.actions.shield_break, actionTime: 0 };
    const doubled = hit(reeling, 10, -1, true);
    assert.equal(reeling.hp - doubled.state.hp, 10 * WARDEN_SLAM_MULTIPLIER * WARDEN_TIMING.punishMultiplier);
    assert.equal(doubled.state.action, 'shield_break');
});

test('crossing two thirds shatters into the Aegis and ignites its two crystals', () => {
    // Two capped hits from just above the marker: the first stays in Form I, the second crosses.
    const duel = { ...openDuel(), hp: WARDEN_MAX_HP * WARDEN_FORM_THRESHOLDS[2] + WARDEN_DAMAGE_CAP + 10 };
    const first = hit(duel, WARDEN_DAMAGE_CAP, -1);
    assert.equal(first.state.form, 1);
    assert.equal(first.state.hp, duel.hp - WARDEN_DAMAGE_CAP);
    const crossed = hit(first.state, WARDEN_DAMAGE_CAP + 20, -1);
    assert.equal(crossed.state.form, 2);
    assert.equal(crossed.state.action, 'shatter');
    assert.ok(Math.abs(crossed.state.hp - WARDEN_MAX_HP * WARDEN_FORM_THRESHOLDS[2]) < 1e-9);
    const ignite = crossed.events.find((event) => event.type === 'crystals' && event.mode === 'ignite');
    assert.deepEqual(ignite.crystals, [1, 2]);
    assert.equal(crossed.state.shieldLayers, 2);
    assert.deepEqual(wardenLiveTowers(crossed.state), [1, 2]);
    assert.equal(hit(crossed.state, 20, -1).events[0].reason, 'transition');
});

test('the Aegis contests the tower being climbed and stays shielded until both crystals fall', () => {
    const { state } = aegis();
    assert.equal(hit(state, 20, -1).events[0].reason, 'shielded');
    // A player on tower 1: the core marks it as the contest and fires climber volleys, never plunges.
    const contested = run(state, 12, { playerDistance: 30, playerTower: 1 });
    assert.equal(contested.state.contestTower, 1);
    const kinds = types(contested.events);
    assert.ok(!kinds.includes('plunge'));
    const volleys = contested.events.filter((event) => event.type === 'volley');
    assert.ok(volleys.length >= 3);
    assert.ok(volleys.every((event) => event.climber));
    // A tower that is not ignited is not a contest.
    assert.equal(run(state, 0.1, { playerDistance: 30, playerTower: 0 }).state.contestTower, null);
    // First crystal: a flinch, still shielded, one layer left.
    const one = breakCrystal(contested.state, 1);
    assert.equal(one.state.action, 'flinch');
    assert.equal(one.state.shieldLayers, 1);
    assert.equal(one.state.contestTower, null);
    assert.ok(one.events.some((event) => event.type === 'shield' && Math.abs(event.fraction - 0.5) < 1e-9));
    assert.equal(hit(one.state, 20, -1).events[0].reason, 'shielded');
    const back = runUntil(one.state, (s) => s.action === 'hover', 3);
    // Second crystal: the crash toward that tower, then the reel and the recovery into a low limp.
    const two = breakCrystal(back.state, 2);
    assert.equal(two.state.action, 'crash');
    const crash = two.events.find((event) => event.type === 'crash');
    assert.equal(crash.toward, 2);
    assert.ok(two.events.some((event) => event.type === 'shield-broken'));
    const reeling = runUntil(two.state, (s) => s.action === 'shield_break', 2);
    // The Aegis swapped during the long contest, so strike with whatever opposes it now.
    const opposite = -reeling.state.polarity;
    assert.equal(hit(reeling.state, 10, opposite).events[0].punish, true);
    assert.equal(hit(reeling.state, 10, -opposite).events[0].reason, 'repelled');
    const limp = runUntil(reeling.state, (s) => s.action === 'hover', WARDEN_TIMING.actions.shield_break + WARDEN_TIMING.actions.recover + 1);
    assert.ok(limp.events.some((event) => event.type === 'recovered'));
    assert.equal(isWardenShielded(limp.state), false);
    assert.equal(hit(limp.state, 10, -limp.state.polarity).events[0].type, 'hurt');
});

test('the limping Aegis plunges on a timer: mark, drop, then an impact with a polarity ring', () => {
    const state = limpingAegis();
    const marked = runUntil(state, (s) => s.action === 'plunge_windup', WARDEN_TIMING.form2.plungeFirst + 6);
    assert.ok(marked.events.some((event) => event.type === 'plunge' && event.phase === 'mark'));
    const landed = runUntil(marked.state, (s) => s.action === 'plunge_recovery', 3);
    assert.deepEqual(landed.events.filter((event) => event.type === 'plunge').map((event) => event.phase), ['drop', 'impact']);
    const ring = landed.events.find((event) => event.type === 'shockwave');
    assert.equal(ring.source, 'plunge');
    assert.equal(ring.polarity, landed.state.polarity);
});

test('a threshold crossing mid-Draw switches the field off before the transition', () => {
    const duel = { ...openDuel(), hp: WARDEN_MAX_HP * WARDEN_FORM_THRESHOLDS[2] + 1, cooldowns: { volley: 9, lash: 9, draw: 0, charge: 9 } };
    const start = run(duel, WARDEN_TIMING.actions.idle + STEP, { playerDistance: 8, playerTower: null });
    const active = runUntil(start.state, (s) => s.action === 'draw_active', 2, { playerDistance: 8, playerTower: null });
    const crossed = hit(active.state, 5, -1);
    assert.equal(crossed.state.form, 2);
    const kinds = types(crossed.events);
    assert.ok(crossed.events.some((event) => event.type === 'draw' && event.active === false));
    assert.ok(kinds.indexOf('draw') < kinds.indexOf('form'));
});

test('crossing one third rises into the Storm shielded by the last crystal', () => {
    const { state, events } = storm();
    assert.equal(state.form, 3);
    assert.equal(state.action, 'spiral');
    assert.ok(events.some((event) => event.type === 'form' && event.form === 3));
    assert.ok(events.some((event) => event.type === 'shards' && event.active));
    const ignite = events.find((event) => event.type === 'crystals' && event.mode === 'ignite');
    assert.deepEqual(ignite.crystals, [3]);
    assert.equal(isWardenShielded(state), true);
    assert.equal(hit(state, 20, -1).events[0].reason, 'shielded');
    assert.equal(getWardenFieldProfile(state).range, WARDEN_TIMING.field[3].range);
});

test('the Storm metronome flips its tower on every beat, rings, and opens a recoil window', () => {
    const { state } = storm();
    const beat = runUntil(state, (s) => s.action === 'recoil', WARDEN_TIMING.form3.beatInterval + 1);
    const ticks = beat.events.filter((event) => event.type === 'beat-tick');
    assert.deepEqual(ticks.map((event) => event.remaining), [1.0, 0.5]);
    assert.ok(ticks.every((event) => event.nextPolarity === -1));
    assert.deepEqual(ticks[0].towers, [3]);
    const polarity = beat.events.find((event) => event.type === 'polarity');
    assert.deepEqual(polarity.towers, [3]);
    const ring = beat.events.find((event) => event.type === 'shockwave');
    assert.equal(ring.source, 'beat');
    assert.equal(ring.polarity, -1);
    const spirals = beat.events.filter((event) => event.type === 'spiral-bolt');
    assert.ok(spirals.length >= 20);
    assert.ok(Math.abs((spirals[1].angle - spirals[0].angle) - Math.PI) < 1e-9);
    const quiet = run(beat.state, WARDEN_TIMING.actions.recoil - STEP);
    assert.equal(quiet.events.filter((event) => event.type === 'spiral-bolt').length, 0);
    assert.equal(quiet.state.action, 'recoil');
    // A climber on the last tower is contested with climber volleys, not spirals.
    const far = run(runUntil(quiet.state, (s) => s.action === 'spiral', 1).state, 6, FAR);
    assert.equal(far.events.filter((event) => event.type === 'spiral-bolt').length, 0);
    assert.ok(far.events.some((event) => event.type === 'volley' && event.climber));
});

test('breaking the last crystal opens the finale: unshielded, still on the beat, shards fly at overload', () => {
    const state = openStorm();
    assert.equal(isWardenShielded(state), false);
    // The Storm has flipped on the beat during the reel: strike with whatever opposes it now.
    assert.equal(hit(state, 10, -state.polarity).events[0].type, 'hurt');
    assert.equal(hit(state, 10, state.polarity).events[0].reason, 'repelled');
    const beat = runUntil(state, (s) => s.beatIndex > state.beatIndex, WARDEN_TIMING.form3.beatInterval + 1);
    assert.deepEqual(beat.events.find((event) => event.type === 'polarity').towers, []);
    // Overload: faster beats and a shard volley on each beat.
    const overloaded = { ...state, hp: WARDEN_MAX_HP * 0.1 };
    const fast = runUntil(overloaded, (s) => s.beatIndex > overloaded.beatIndex, WARDEN_TIMING.form3.beatInterval + 1);
    assert.ok(fast.events.some((event) => event.type === 'shard-volley'));
    assert.ok(Math.abs(fast.state.beatTimer - WARDEN_TIMING.form3.overloadBeatInterval) < 0.1 + 1e-9);
    // While shielded the shards stay home.
    const shielded = { ...storm().state, hp: WARDEN_MAX_HP * 0.1 };
    const held = runUntil(shielded, (s) => s.beatIndex > shielded.beatIndex, WARDEN_TIMING.form3.beatInterval + 1, FAR);
    assert.ok(!held.events.some((event) => event.type === 'shard-volley'));
});

test('every fourth beat is a double beat with a second ring of the flipped-back colour', () => {
    const state = openStorm();
    let current = state;
    let doubles = 0;
    let firstRing = null;
    let secondRing = null;
    // Four consecutive beats always contain exactly one double; the moment it
    // fires, its second ring follows a doubleGap later in the flipped-back colour.
    for (let beatNumber = state.beatIndex + 1; beatNumber <= state.beatIndex + 4; beatNumber += 1) {
        const next = runUntil(current, (s) => s.beatIndex === beatNumber, WARDEN_TIMING.form3.beatInterval + 1.5);
        current = next.state;
        const first = next.events.find((event) => event.type === 'beat' && event.double && !event.second);
        if (!first) continue;
        doubles += 1;
        firstRing = first;
        const second = runUntil(current, (s) => s.doubleTimer === 0, WARDEN_TIMING.form3.doubleGap + 0.5);
        secondRing = second.events.find((event) => event.type === 'beat' && event.second);
        current = second.state;
    }
    assert.equal(doubles, 1);
    assert.ok(firstRing);
    assert.ok(secondRing);
    assert.equal(secondRing.polarity, firstRing.polarity * -1);
});

test('the Warden dies once and then ignores every input', () => {
    const state = { ...openStorm(), hp: 5 };
    const dead = hit(state, 10, -state.polarity);
    assert.equal(dead.state.hp, 0);
    assert.equal(dead.state.action, 'death');
    assert.ok(dead.events.some((event) => event.type === 'defeated'));
    assert.deepEqual(types(hit(dead.state, 10, -state.polarity).events), ['blocked']);
    assert.deepEqual(run(dead.state, 1).events, []);
    assert.deepEqual(breakCrystal(dead.state, 3).events, []);
});

test('nothing in the fight rolls dice, and the shared geometry helpers agree with the renderer', () => {
    const offsets = wardenShardOffsets(0);
    assert.equal(offsets.length, WARDEN_TIMING.form3.shardCount);
    for (const offset of offsets) assert.ok(Math.abs(Math.hypot(offset.x, offset.z) - WARDEN_TIMING.form3.shardRadius) < 1e-9);
    const origin = { x: 0, y: 0, z: 0 };
    assert.equal(isInWardenCone(origin, 0, { x: 0, y: 0, z: 3 }), true);
    assert.equal(isInWardenCone(origin, 0, { x: 0, y: 0, z: -3 }), false);
    assert.equal(isInWardenCone(origin, Math.PI / 2, { x: 3, y: 0, z: 0 }), true);
    // Determinism: the same inputs produce the same events, twice.
    const a = run(arenaFight().state, 20, NEAR);
    const b = run(arenaFight().state, 20, NEAR);
    assert.deepEqual(a.state, b.state);
    assert.deepEqual(a.events, b.events);
});
