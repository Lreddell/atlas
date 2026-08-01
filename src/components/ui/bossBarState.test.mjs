import assert from 'node:assert/strict';
import test from 'node:test';

import { reduceBossBarState } from './bossBarState.ts';

test('boss damage is matched by entity id, not only boss kind', () => {
    const state = reduceBossBarState(null, {
        type: 'spawned',
        bossId: 'magnetic_warden',
        entityId: 8,
        name: 'Magnetic Warden',
        maxHp: 200,
    });

    const ignored = reduceBossBarState(state, {
        type: 'damaged',
        bossId: 'magnetic_warden',
        entityId: 9,
        hp: 50,
        maxHp: 200,
    });
    const updated = reduceBossBarState(state, {
        type: 'damaged',
        bossId: 'magnetic_warden',
        entityId: 8,
        hp: 150,
        maxHp: 200,
    });

    assert.equal(ignored?.hp, 200);
    assert.equal(updated?.hp, 150);
});

test('clearing the world removes the active boss bar', () => {
    const state = {
        bossId: 'magnetic_warden',
        entityId: 8,
        name: 'Magnetic Warden',
        hp: 200,
        maxHp: 200,
    };
    assert.equal(reduceBossBarState(state, { type: 'cleared' }), null);
});
