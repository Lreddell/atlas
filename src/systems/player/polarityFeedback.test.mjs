import assert from 'node:assert/strict';
import test from 'node:test';

import { getPolaritySoundEvent } from './polarityFeedback.ts';

test('selects a dedicated sound event for each polarity', () => {
    assert.equal(getPolaritySoundEvent(true), 'ability.polarity.positive');
    assert.equal(getPolaritySoundEvent(false), 'ability.polarity.negative');
});
