import test from 'node:test';
import assert from 'node:assert/strict';

import {
    DIRECTIONS, anyDirectionHeld, sprintDriveHeld, canDirectionSprint, isDoubleTap, isSprinting,
} from './sprintRule.ts';

const keys = (held = []) => ({
    forward: held.includes('forward'),
    backward: held.includes('backward'),
    left: held.includes('left'),
    right: held.includes('right'),
});
const sources = (over = {}) => ({ sprint: false, sprintLatch: false, doubleTap: false, ...over });

test('nothing held is never a sprint drive, in either view', () => {
    assert.equal(anyDirectionHeld(keys()), false);
    assert.equal(sprintDriveHeld(keys(), false), false);
    assert.equal(sprintDriveHeld(keys(), true), false);
});

test('the welded views only sprint forwards', () => {
    assert.equal(sprintDriveHeld(keys(['forward']), false), true);
    for (const dir of ['backward', 'left', 'right']) {
        assert.equal(sprintDriveHeld(keys([dir]), false), false, `${dir} must not sprint`);
    }
    // Strafing while still running forwards is still a sprint.
    assert.equal(sprintDriveHeld(keys(['forward', 'right']), false), true);
});

test('the free view sprints in every direction', () => {
    for (const dir of DIRECTIONS) {
        assert.equal(sprintDriveHeld(keys([dir]), true), true, `${dir} must sprint`);
    }
});

test('only forward can start a sprint in the welded views; any direction can in the free one', () => {
    assert.equal(canDirectionSprint('forward', false), true);
    assert.equal(canDirectionSprint('left', false), false);
    for (const dir of DIRECTIONS) assert.equal(canDirectionSprint(dir, true), true);
});

test('a double tap is the same key twice inside the window', () => {
    assert.equal(isDoubleTap('forward', 'forward', 1000, 1200, 400), true);
    // Too slow.
    assert.equal(isDoubleTap('forward', 'forward', 1000, 1500, 400), false);
    // Two different keys in quick succession is a diagonal, not a sprint.
    assert.equal(isDoubleTap('left', 'forward', 1000, 1100, 400), false);
    // Nothing tapped yet.
    assert.equal(isDoubleTap('forward', null, 0, 100, 400), false);
});

test('every sprint source works, but only while a drive key is held', () => {
    for (const key of ['sprint', 'sprintLatch', 'doubleTap']) {
        const on = sources({ [key]: true });
        assert.equal(isSprinting(on, keys(['forward']), false, false), true, `${key} should sprint`);
        assert.equal(isSprinting(on, keys(), false, false), false, `${key} needs a drive key`);
    }
    assert.equal(isSprinting(sources(), keys(['forward']), false, false), false, 'no source, no sprint');
});

test('sneak beats every source, in both views', () => {
    const on = sources({ sprint: true });
    assert.equal(isSprinting(on, keys(['forward']), false, true), false);
    assert.equal(isSprinting(on, keys(['left']), true, true), false);
});

test('holding Ctrl and strafing sprints in the free view but not the welded ones', () => {
    const on = sources({ sprint: true });
    assert.equal(isSprinting(on, keys(['left']), false, false), false);
    assert.equal(isSprinting(on, keys(['left']), true, false), true);
    assert.equal(isSprinting(on, keys(['backward']), false, false), false);
    assert.equal(isSprinting(on, keys(['backward']), true, false), true);
});

test('the free view keeps the sprint across a change of heading', () => {
    const latched = sources({ sprintLatch: true });
    // Running forward, then rolling onto A while W is released: still driving.
    assert.equal(sprintDriveHeld(keys(['forward', 'left']), true), true);
    assert.equal(isSprinting(latched, keys(['left']), true, false), true);
    // Letting go of everything is what ends it.
    assert.equal(sprintDriveHeld(keys(), true), false);
});
