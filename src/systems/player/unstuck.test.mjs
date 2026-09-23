import assert from 'node:assert/strict';
import test from 'node:test';
import { findUnstuckPosition } from './unstuck.ts';

const bodyHits = boxes => p => boxes.some(([x, y, z, w, h, d]) =>
    p.x - 0.3 < x + w && p.x + 0.3 > x && p.y < y + h && p.y + 1.8 > y
    && p.z - 0.3 < z + d && p.z + 0.3 > z);

test('ordinary standing contact does not move the player', () => {
    assert.equal(findUnstuckPosition({ x: 0.5, y: 1, z: 0.5 }, bodyHits([[0, 0, 0, 1, 1, 1]])), null);
});

test('a block appearing around the shoulder ejects through its nearest side', () => {
    const collides = bodyHits([[0, 0, 0, 1, 1, 1]]);
    const result = findUnstuckPosition({ x: 1.2, y: 0, z: 0.5 }, collides);
    assert.ok(result && !collides(result));
    assert.ok(Math.abs(result.x - 1.3) < 0.001);
    assert.equal(result.y, 0);
});

test('a rebuilt multilayer platform lifts the entire body onto the top', () => {
    const collides = bodyHits([[-6, 0, -6, 12, 3, 12]]);
    const result = findUnstuckPosition({ x: 0, y: 0.5, z: 0 }, collides);
    assert.ok(result && !collides(result));
    assert.ok(Math.abs(result.y - 3) < 0.001);
});

test('partial block recovery retains the fractional top instead of burying the feet', () => {
    const collides = bodyHits([[-6, 0, -6, 12, 0.5, 12]]);
    const result = findUnstuckPosition({ x: 0, y: 0.2, z: 0 }, collides);
    assert.ok(result && !collides(result));
    assert.ok(Math.abs(result.y - 0.5) < 0.001);
});

test('a low ceiling rules out an upward exit', () => {
    const collides = bodyHits([[0, 0, 0, 1, 1, 1], [-4, 2, -4, 8, 2, 8]]);
    const result = findUnstuckPosition({ x: 0.5, y: 0, z: 0.5 }, collides);
    assert.ok(result && !collides(result));
    assert.equal(result.y, 0);
});

test('fully blocked or unloaded surroundings stop the bounded search', () => {
    assert.equal(findUnstuckPosition({ x: 0, y: 0, z: 0 }, () => true), null);
});
