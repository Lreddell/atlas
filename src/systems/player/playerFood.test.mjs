import assert from 'node:assert/strict';
import test from 'node:test';

import {
    FORAGERS_RESERVE_DURATION_TICKS,
    FORAGERS_RESERVE_EXHAUSTION_FACTOR,
    addExhaustion,
    createFoodState,
    eatFood,
    getForagersReserveSeconds,
    hasForagersReserve,
    tickFood,
} from './playerFood.ts';

test('prepared meals activate a 90-second Forager\'s Reserve', () => {
    const state = createFoodState();
    state.foodLevel = 8;
    state.foodSaturationLevel = 0;

    eatFood(state, 9, 0.6);

    assert.equal(state.foragersReserveTicks, FORAGERS_RESERVE_DURATION_TICKS);
    assert.equal(getForagersReserveSeconds(state), 90);
    assert.equal(hasForagersReserve(state), true);
});

test('snacks restore hunger without activating the expedition buff', () => {
    const state = createFoodState();
    state.foodLevel = 10;

    eatFood(state, 5, 0.3);

    assert.equal(state.foragersReserveTicks, 0);
    assert.equal(hasForagersReserve(state), false);
});

test('Forager\'s Reserve reduces exhaustion while active', () => {
    const state = createFoodState();
    state.foodExhaustionLevel = 0;
    state.foragersReserveTicks = 20;

    addExhaustion(state, 2);

    assert.equal(state.foodExhaustionLevel, 2 * FORAGERS_RESERVE_EXHAUSTION_FACTOR);
});

test('old save states without the optional field retain normal exhaustion', () => {
    const state = {
        foodLevel: 20,
        foodSaturationLevel: 5,
        foodExhaustionLevel: 0,
        foodTickTimer: 0,
    };

    addExhaustion(state, 2);

    assert.equal(state.foodExhaustionLevel, 2);
    assert.equal(hasForagersReserve(state), false);
});

test('the reserve expires deterministically on survival ticks', () => {
    const state = createFoodState();
    state.foragersReserveTicks = 2;

    tickFood(state, 20, 'survival', false);
    assert.equal(state.foragersReserveTicks, 1);
    tickFood(state, 20, 'survival', false);

    assert.equal(state.foragersReserveTicks, 0);
    assert.equal(hasForagersReserve(state), false);
});

test('death clears the transient preparation buff', () => {
    const state = createFoodState();
    state.foragersReserveTicks = 400;

    const health = tickFood(state, 0, 'survival', true);

    assert.equal(health, 0);
    assert.equal(state.foragersReserveTicks, 0);
});
