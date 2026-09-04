import assert from 'node:assert/strict';
import test from 'node:test';

import { ClimbSurfaceRegistry, attractsByPolarity } from './climbSurfaces.ts';
import { findAdhesionCandidate } from './magneticAdhesion.ts';

const tower = (overrides = {}) => ({
    id: 'tower-1',
    min: { x: 20, y: 60, z: 20 },
    max: { x: 20, y: 90, z: 26 },
    polarity: -1,
    opensAt: 10,
    until: 11.3,
    safeTarget: { x: 0, z: 0 },
    ...overrides,
});

test('the plain rule: opposite attracts, same repels, no boots never attracts', () => {
    assert.equal(attractsByPolarity(1, -1), true);
    assert.equal(attractsByPolarity(-1, 1), true);
    assert.equal(attractsByPolarity(1, 1), false);
    assert.equal(attractsByPolarity(0, 1), false);
    assert.equal(attractsByPolarity(1, 0), false);
});

test('inside an open window the face holds either polarity; outside it the plain rule returns', () => {
    const registry = new ClimbSurfaceRegistry();
    registry.setFlux(tower());
    assert.equal(registry.zoneAt(20, 70, 23)?.id, 'tower-1');
    assert.equal(registry.zoneAt(21, 70, 23), null);
    // Before the window: plain rule against the block's current polarity.
    assert.equal(registry.inFlux(20, 70, 23, 9.9), false);
    assert.equal(registry.isAttractive(1, 1, 20, 70, 23, 9.9), false);
    assert.equal(registry.isAttractive(-1, 1, 20, 70, 23, 9.9), true);
    // During: both hold.
    assert.equal(registry.inFlux(20, 70, 23, 10.5), true);
    assert.equal(registry.isAttractive(1, 1, 20, 70, 23, 10.5), true);
    assert.equal(registry.isAttractive(-1, 1, 20, 70, 23, 10.5), true);
    assert.equal(registry.isAttractive(1, 0, 20, 70, 23, 10.5), false, 'air is never a surface');
    // After: plain rule against the settled polarity.
    assert.equal(registry.inFlux(20, 70, 23, 11.3), false);
    assert.equal(registry.isAttractive(1, -1, 20, 70, 23, 11.3), true);
    assert.equal(registry.isAttractive(-1, -1, 20, 70, 23, 11.3), false);
    assert.equal(registry.activeWindows(10.5).length, 1);
    assert.equal(registry.activeWindows(12).length, 0);
    registry.clear('tower-1');
    assert.equal(registry.zoneAt(20, 70, 23), null);
});

test('a climber who matches the settled polarity is shocked toward the safe target, an opposing one holds', () => {
    const registry = new ClimbSurfaceRegistry();
    registry.setFlux(tower());
    const normal = { x: -1, y: 0, z: 0 };
    const climber = { x: 19.5, y: 70, z: 23 };
    // Still in the window: nobody is shocked.
    assert.equal(registry.shockAt(20, 70, 23, -1, 11, normal, climber), null);
    // Closed: matching the settled (-1) polarity is thrown toward the platform centre.
    const shock = registry.shockAt(20, 70, 23, -1, 11.3, normal, climber);
    assert.ok(shock);
    const len = Math.hypot(shock.x, shock.z);
    assert.ok(Math.abs(len - 1) < 1e-9);
    assert.ok(shock.x < 0 && shock.z < 0, 'toward (0,0)');
    // Opposing it holds on, no boots is never shocked, off the surface nothing happens.
    assert.equal(registry.shockAt(20, 70, 23, 1, 11.3, normal, climber), null);
    assert.equal(registry.shockAt(20, 70, 23, 0, 11.3, normal, climber), null);
    assert.equal(registry.shockAt(25, 70, 23, -1, 11.3, normal, climber), null);
    // With no safe target the face normal is the launch direction.
    registry.setFlux(tower({ safeTarget: null }));
    assert.deepEqual(registry.shockAt(20, 70, 23, -1, 11.3, normal, climber), { x: -1, z: 0 });
    // Long after the window closed nobody can still be shocked, and a surface
    // whose window never opened (ignited, never flipped) never shocks.
    assert.equal(registry.shockAt(20, 70, 23, -1, 13, normal, climber), null);
    registry.setFlux(tower({ opensAt: -1, until: -1 }));
    assert.equal(registry.shockAt(20, 70, 23, -1, 5, normal, climber), null);
    // The shared clock advances only by positive finite steps.
    registry.advance(0.5);
    registry.advance(-1);
    registry.advance(Number.NaN);
    assert.equal(registry.clock, 0.5);
});

test('the adhesion scan accepts the flux rule so a climber keeps their face through a flip', () => {
    const registry = new ClimbSurfaceRegistry();
    registry.setFlux(tower({ min: { x: 5, y: 0, z: 0 }, max: { x: 5, y: 3, z: 0 }, polarity: 1, opensAt: 0, until: 1 }));
    // A single magnet block at (5,1,0) whose open -x face the player is pressed against.
    const getPolarity = (x, y, z) => (x === 5 && y === 1 && z === 0 ? 1 : 0);
    const isSolid = (x, y, z) => x === 5 && y === 1 && z === 0;
    const center = { x: 4.6, y: 1.5, z: 0.5 };
    // Plain rule: a +1 player is not attracted to a +1 block.
    assert.equal(findAdhesionCandidate(getPolarity, isSolid, center, 1), null);
    // Flux rule mid-window: the same face holds them.
    const held = findAdhesionCandidate(getPolarity, isSolid, center, 1, undefined, (p, b, x, y, z) => registry.isAttractive(p, b, x, y, z, 0.5));
    assert.ok(held);
    assert.deepEqual(held.normal, { x: -1, y: 0, z: 0 });
    // Window closed: gone again.
    assert.equal(findAdhesionCandidate(getPolarity, isSolid, center, 1, undefined, (p, b, x, y, z) => registry.isAttractive(p, b, x, y, z, 1.5)), null);
});
