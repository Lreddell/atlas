import assert from 'node:assert/strict';
import test from 'node:test';
import { segmentHitsBox, ringSweepsPlayer, plungePosition, WARDEN_SECTOR_START } from './wardenCombatGeometry.ts';
import { isInWardenCone, WARDEN_TIMING } from './magneticWardenCore.ts';

test('a swept bolt or rush catches a player between simulation positions', () => {
    const min = { x: -0.5, y: 0, z: -0.5 }, max = { x: 0.5, y: 1.8, z: 0.5 };
    assert.equal(segmentHitsBox({ x: -2, y: 1, z: 0 }, { x: 2, y: 1, z: 0 }, min, max), true);
    assert.equal(segmentHitsBox({ x: -2, y: 1, z: 0.7 }, { x: 2, y: 1, z: 0.7 }, min, max), false);
    assert.equal(segmentHitsBox({ x: -2, y: 2.2, z: 0 }, { x: 2, y: 2.2, z: 0 }, min, max), false);
    assert.equal(segmentHitsBox({ x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: 0 }, min, max), true);
    assert.equal(segmentHitsBox({ x: 2, y: 1, z: 0 }, { x: 2, y: 1, z: 0 }, min, max), false);
});

test('a shockwave only hurts at its visible edge, within its reach and below a jump', () => {
    assert.equal(ringSweepsPlayer(8, 10, 24, 9, 0.02), true);
    assert.equal(ringSweepsPlayer(8, 10, 24, 3, 0.02), false, 'landing behind a passed ring is safe');
    assert.equal(ringSweepsPlayer(23, 26, 24, 25, 0), false, 'last-step overshoot never extends its range');
    assert.equal(ringSweepsPlayer(8, 10, 24, 9, 1.25), false, 'jumping clears the edge');
    assert.equal(ringSweepsPlayer(8, 10, 24, 9, -2), false, 'a player in the recessed moat is below it');
});

test('the Aegis aligns with the marked circle before falling, at every starting distance', () => {
    for (const x of [-20, 0, 20]) {
        const start = { x, y: 90, z: -8 }, target = { x: 15, y: 65, z: 8 };
        const apex = plungePosition(start, target, 1, 0);
        assert.deepEqual(apex, { x: 15, y: 92, z: 8 });
        for (const progress of [0.01, 0.5, 0.99, 1]) {
            const falling = plungePosition(start, target, 1, progress);
            assert.equal(falling.x, target.x);
            assert.equal(falling.z, target.z);
            assert.ok(falling.y >= target.y && falling.y <= apex.y);
        }
        assert.deepEqual(plungePosition(start, target, 1, 1), target);
    }
});

test('the rendered cleave sector points where its collision cone points for every facing', () => {
    const half = WARDEN_TIMING.lash.halfAngle;
    for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2, 0.71]) {
        for (const angle of [WARDEN_SECTOR_START - half * 0.9, WARDEN_SECTOR_START, WARDEN_SECTOR_START + half * 0.9]) {
            // Renderer: XY ring -> rotate around Z by yaw -> tilt X by -PI/2.
            const x = 4 * Math.cos(angle + yaw), z = -4 * Math.sin(angle + yaw);
            assert.equal(isInWardenCone({ x: 0, y: 0, z: 0 }, yaw, { x, y: 0, z }), true);
        }
        assert.equal(isInWardenCone({ x: 0, y: 0, z: 0 }, yaw, { x: -Math.sin(yaw) * 3, y: 0, z: -Math.cos(yaw) * 3 }), false);
    }
});
