import assert from 'node:assert/strict';
import test from 'node:test';

import { findFirstBlockedEdit } from './regionEditPolicy.ts';

test('multi-cell edits reject the whole operation when any cell is blocked', () => {
    const positions = [
        { x: 1, y: 2, z: 3 },
        { x: 2, y: 2, z: 3 },
    ];

    assert.deepEqual(
        findFirstBlockedEdit(positions, ({ x }) => x !== 2),
        positions[1],
    );
    assert.equal(findFirstBlockedEdit(positions, () => true), null);
});
