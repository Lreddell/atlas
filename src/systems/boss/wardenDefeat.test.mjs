import assert from 'node:assert/strict';
import test from 'node:test';
import { URL } from 'node:url';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import * as THREE from 'three';

// Exercise the real controller without starting audio, particles, or a browser.
const events = [];
globalThis.__defeatTest = {
    THREE,
    gameEvents: { emit: (name, payload) => events.push({ name, payload }) },
    addTrauma: () => {}, soundManager: { play() {}, playAt() {} },
    particleFx: { burst() {} }, FX_CHARGED: [1, 1, 1], polarityFxColor: () => [1, 1, 1],
};
const source = readFileSync(new URL('./wardenDefeat.ts', import.meta.url), 'utf8').replace(/^import .*;\r?$/gm, '');
const script = 'const { THREE, gameEvents, addTrauma, soundManager, particleFx, FX_CHARGED, polarityFxColor } = globalThis.__defeatTest;\n' + stripTypeScriptTypes(source);
const { wardenDefeat } = await import('data:text/javascript;base64,' + Buffer.from(script).toString('base64'));
delete globalThis.__defeatTest;
const params = { x: 101, y: 65, z: 203, height: 5, polarity: 1,
    centerX: 100, centerZ: 200, floorY: 65, returnPitch: -0.8, returnYaw: 2 };

for (const ending of ['complete', 'skip', 'cancel']) {
    test(`${ending} defeat returns control once, with a safe victory position only on completion`, () => {
        const previousWindow = globalThis.window;
        globalThis.window = { addEventListener() {}, removeEventListener() {} };
        events.length = 0;
        try {
            wardenDefeat.begin(params);
            assert.equal(wardenDefeat.isActive(), true);
            if (ending === 'complete') wardenDefeat.step(6);
            else wardenDefeat[ending]();
            wardenDefeat.skip();
            const ends = events.filter(e => e.name === 'cinematic:end');
            assert.equal(ends.length, 1);
            assert.equal(wardenDefeat.isActive(), false);
            if (ending === 'cancel') {
                assert.equal(ends[0].payload.returnPosition, undefined);
                assert.equal(ends[0].payload.returnYaw, params.returnYaw);
            } else {
                assert.deepEqual(ends[0].payload.returnPosition, { x: 100.5, y: 65, z: 210.5 });
                assert.equal(ends[0].payload.returnYaw, 0);
            }
        } finally {
            wardenDefeat.cancel();
            globalThis.window = previousWindow;
        }
    });
}
