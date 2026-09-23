import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTs } from '../world/storage/bundleTs.mjs';

const { snapShadowCenter } = await loadTs(`export { snapShadowCenter } from './src/systems/graphics/shadows';`);

// The shadow camera's frame, as three builds it with lookAt (up = +Y).
const frame = (dir) => {
    const len = Math.hypot(...dir);
    const z = dir.map(v => v / len);
    const xRaw = [z[2], 0, -z[0]];
    const xLen = Math.hypot(...xRaw);
    const x = xRaw.map(v => v / xLen);
    const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
    return { x, y, z };
};
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

const LIGHTS = [[0.3, 0.8, 0.52], [-0.9, 0.2, 0.39], [0.05, 0.9, 0.42], [0.7, 0.1, -0.2]];
const TEXEL = 160 / 2048;

test('the snapped centre sits on the texel grid of the light frame, within a texel of the camera', () => {
    for (const dir of LIGHTS) {
        const { x, y, z } = frame(dir);
        for (const center of [[0, 0, 0], [123.456, 71.2, -987.65], [-4000.3, 150.9, 2500.01]]) {
            const out = snapShadowCenter(center, dir, TEXEL, [0, 0, 0]);
            const du = dot(out, x), dv = dot(out, y);
            assert.ok(Math.abs(du / TEXEL - Math.round(du / TEXEL)) < 1e-6, 'u on the grid');
            assert.ok(Math.abs(dv / TEXEL - Math.round(dv / TEXEL)) < 1e-6, 'v on the grid');
            assert.ok(dot(center, x) - du >= -1e-9 && dot(center, x) - du < TEXEL + 1e-9);
            assert.ok(dot(center, y) - dv >= -1e-9 && dot(center, y) - dv < TEXEL + 1e-9);
            assert.ok(Math.abs(dot(out, z) - dot(center, z)) < 1e-9, 'depth along the light is untouched');
        }
    }
});

test('small moves inside one texel leave the shadow camera where it is', () => {
    const dir = LIGHTS[0];
    const { x, y } = frame(dir);
    // Start a quarter texel into a cell on both light axes.
    const base = [x[0] * TEXEL * 10.25 + y[0] * TEXEL * 20.25, x[1] * TEXEL * 10.25 + y[1] * TEXEL * 20.25, x[2] * TEXEL * 10.25 + y[2] * TEXEL * 20.25];
    const first = snapShadowCenter(base, dir, TEXEL, [0, 0, 0]);
    for (const step of [0.1, 0.3, 0.6]) {
        const moved = base.map((v, i) => v + (x[i] + y[i]) * TEXEL * step);
        const snapped = snapShadowCenter(moved, dir, TEXEL, [0, 0, 0]);
        assert.ok(Math.abs(dot(snapped, x) - dot(first, x)) < 1e-9);
        assert.ok(Math.abs(dot(snapped, y) - dot(first, y)) < 1e-9);
    }
});
