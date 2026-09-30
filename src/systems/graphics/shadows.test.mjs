import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTs } from '../world/storage/bundleTs.mjs';

const { snapShadowCenter, createShadowSnap, sunDirection, SUN_ORBIT_AXIS } = await loadTs(`
export { snapShadowCenter, createShadowSnap } from './src/systems/graphics/shadows';
export { sunDirection, SUN_ORBIT_AXIS } from './src/systems/graphics/atmosphere';
`);

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const len = Math.hypot(...a); return a.map(v => v / len); };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

// The shadow camera's frame, as three builds it with lookAt for an up vector.
const frame = (dir, up) => {
    const z = norm(dir);
    const x = norm(cross(up, z));
    return { x, y: cross(z, x), z };
};

const UP_Y = [0, 1, 0];
const LIGHTS = [[0.3, 0.8, 0.52], [-0.9, 0.2, 0.39], [0.05, 0.9, 0.42], [0.7, 0.1, -0.2]];
const TEXEL = 160 / 2048;
/** A snap whose grid runs through the world origin. */
const originSnap = () => ({ pivot: [0, 0, 0], hasPivot: true });
/** Where `center` sits inside its grid cell, in texels (0..1) along an axis. */
const phase = (center, snapped, axis) => {
    const t = dot(sub(center, snapped), axis) / TEXEL;
    return t - Math.floor(t);
};
/** The smallest change between two phases, allowing for the wrap at 1. */
const phaseStep = (a, b) => Math.min(Math.abs(a - b), 1 - Math.abs(a - b));

test('the snapped centre sits on the texel grid of the light frame, within a texel of the camera', () => {
    for (const up of [UP_Y, SUN_ORBIT_AXIS]) {
        for (const dir of LIGHTS) {
            const { x, y, z } = frame(dir, up);
            for (const center of [[0, 0, 0], [123.456, 71.2, -987.65], [-4000.3, 150.9, 2500.01]]) {
                const snap = originSnap();
                const out = snapShadowCenter(center, dir, up, TEXEL, snap, [0, 0, 0]);
                const du = dot(out, x), dv = dot(out, y);
                assert.ok(Math.abs(du / TEXEL - Math.round(du / TEXEL)) < 1e-6, 'u on the grid');
                assert.ok(Math.abs(dv / TEXEL - Math.round(dv / TEXEL)) < 1e-6, 'v on the grid');
                assert.ok(dot(center, x) - du >= -1e-9 && dot(center, x) - du < TEXEL + 1e-9);
                assert.ok(dot(center, y) - dv >= -1e-9 && dot(center, y) - dv < TEXEL + 1e-9);
                assert.ok(Math.abs(dot(out, z) - dot(center, z)) < 1e-9, 'depth along the light is untouched');
                assert.deepEqual(snap.pivot, out, 'the grid now turns about the snapped centre');
            }
        }
    }
});

test('small moves inside one texel leave the shadow camera where it is', () => {
    const dir = LIGHTS[0];
    const { x, y } = frame(dir, UP_Y);
    // Start a quarter texel into a cell on both light axes.
    const base = [x[0] * TEXEL * 10.25 + y[0] * TEXEL * 20.25, x[1] * TEXEL * 10.25 + y[1] * TEXEL * 20.25, x[2] * TEXEL * 10.25 + y[2] * TEXEL * 20.25];
    const snap = originSnap();
    const first = snapShadowCenter(base, dir, UP_Y, TEXEL, snap, [0, 0, 0]);
    for (const step of [0.1, 0.3, 0.6]) {
        const moved = base.map((v, i) => v + (x[i] + y[i]) * TEXEL * step);
        const snapped = snapShadowCenter(moved, dir, UP_Y, TEXEL, snap, [0, 0, 0]);
        assert.ok(Math.abs(dot(snapped, x) - dot(first, x)) < 1e-9);
        assert.ok(Math.abs(dot(snapped, y) - dot(first, y)) < 1e-9);
    }
});

test('as the sun turns, the grid under a far-out player only creeps (no per-frame flicker)', () => {
    const center = [5000.3, 80.4, -4200.7];
    const frameTicks = 20 / 60; // a 60 fps frame of world time
    const snap = createShadowSnap();
    let worst = 0;
    let previous = null;
    for (let i = 0; i < 40; i++) {
        const dir = sunDirection(5800 + i * frameTicks);
        const out = snapShadowCenter(center, dir, SUN_ORBIT_AXIS, TEXEL, snap, [0, 0, 0]);
        const { x, y } = frame(dir, SUN_ORBIT_AXIS);
        const now = [phase(center, out, x), phase(center, out, y)];
        if (previous) worst = Math.max(worst, phaseStep(now[0], previous[0]), phaseStep(now[1], previous[1]));
        previous = now;
    }
    assert.ok(worst < 0.01, `grid moved ${worst.toFixed(4)} texels in one frame`);

    // The old snap, against the world origin: the grid there slid by whole texels a frame.
    let oldWorst = 0;
    previous = null;
    for (let i = 0; i < 40; i++) {
        const dir = sunDirection(5800 + i * frameTicks);
        const out = snapShadowCenter(center, dir, UP_Y, TEXEL, originSnap(), [0, 0, 0]);
        const { x, y } = frame(dir, UP_Y);
        const now = [phase(center, out, x), phase(center, out, y)];
        if (previous) oldWorst = Math.max(oldWorst, phaseStep(now[0], previous[0]), phaseStep(now[1], previous[1]));
        previous = now;
    }
    assert.ok(oldWorst > 0.1, 'the origin-anchored grid really did jump (this test can tell)');
});

test('with up on the orbit axis, one grid axis never moves as the sun crosses the sky', () => {
    const center = [-812.6, 95.2, 377.9];
    const snap = createShadowSnap();
    let firstPhase = null;
    for (let ticks = 200; ticks < 11800; ticks += 450) {
        const dir = sunDirection(ticks);
        const out = snapShadowCenter(center, dir, SUN_ORBIT_AXIS, TEXEL, snap, [0, 0, 0]);
        const { y } = frame(dir, SUN_ORBIT_AXIS);
        assert.ok(Math.abs(Math.abs(dot(y, SUN_ORBIT_AXIS)) - 1) < 1e-9, 'y is the orbit axis');
        const p = phase(center, out, y);
        if (firstPhase === null) firstPhase = p;
        assert.ok(phaseStep(p, firstPhase) < 1e-6, 'the grid never slides along the orbit axis');
    }
});
