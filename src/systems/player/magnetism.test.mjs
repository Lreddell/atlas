import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { URL } from 'node:url';

const source = readFileSync(new URL('./magnetism.ts', import.meta.url), 'utf8');

test('player magnetism samples the closest point on the full body AABB', () => {
    assert.match(source, /getClosestPointOnAabb/);
    assert.match(source, /PLAYER_WIDTH/);
    assert.match(source, /bodyHeight/);
    assert.doesNotMatch(source, /const oy = pos\.y \+ 0\.9/);
});
