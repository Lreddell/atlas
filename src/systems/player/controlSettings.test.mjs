import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { loadTs } from '../world/storage/bundleTs.mjs';

const {
    DEFAULT_CONTROL_SETTINGS, LOOK_RADIANS_PER_PIXEL, MAX_SENSITIVITY, MIN_SENSITIVITY,
    lookDelta, parseControlSettings, withControlChange,
} = await loadTs(`export * from './src/systems/player/controlSettings';`);

const root = path.resolve(import.meta.dirname, '../../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('stored control settings fall back to the defaults when missing or malformed', () => {
    assert.deepEqual(parseControlSettings(null), DEFAULT_CONTROL_SETTINGS);
    assert.deepEqual(parseControlSettings('not json'), DEFAULT_CONTROL_SETTINGS);
    assert.deepEqual(parseControlSettings('{"sensitivity":"fast","invertY":1}'), DEFAULT_CONTROL_SETTINGS);
    assert.deepEqual(parseControlSettings('{"sensitivity":1.5,"invertY":true}'), { sensitivity: 1.5, invertY: true });
    assert.equal(parseControlSettings('{"sensitivity":99}').sensitivity, MAX_SENSITIVITY);
    assert.equal(parseControlSettings('{"sensitivity":0}').sensitivity, MIN_SENSITIVITY);
});

test('a change keeps the sensitivity in range', () => {
    assert.equal(withControlChange(DEFAULT_CONTROL_SETTINGS, { sensitivity: 50 }).sensitivity, MAX_SENSITIVITY);
    assert.deepEqual(withControlChange(DEFAULT_CONTROL_SETTINGS, { invertY: true }), { sensitivity: 1, invertY: true });
});

test('look turns as it always did at 100%, scaled by sensitivity, pitch flipped when inverted', () => {
    const stock = lookDelta(100, 50, DEFAULT_CONTROL_SETTINGS);
    assert.equal(stock.yaw, -100 * LOOK_RADIANS_PER_PIXEL);
    assert.equal(stock.pitch, -50 * LOOK_RADIANS_PER_PIXEL);
    assert.equal(LOOK_RADIANS_PER_PIXEL, 0.002, 'the stock speed is unchanged');
    const doubled = lookDelta(100, 50, { sensitivity: 2, invertY: false });
    assert.equal(doubled.yaw, 2 * stock.yaw);
    const inverted = lookDelta(100, 50, { sensitivity: 1, invertY: true });
    assert.equal(inverted.yaw, stock.yaw);
    assert.equal(inverted.pitch, -stock.pitch);
});

test('the camera, the magnetic-wall look and the Controls screen all use these settings', () => {
    const camera = read('src/components/CameraControls.tsx');
    assert.match(camera, /lookDelta\(clamp\(e\.movementX\), clamp\(e\.movementY\), getControlSettings\(\)\)/);
    assert.match(camera, /lookBridge\.dYaw \+= look\.yaw/);
    assert.doesNotMatch(camera, /\* 0\.002/);
    const menu = read('src/components/ui/PauseMenu.tsx');
    assert.match(menu, /label="Controls\.\.\." onClick=\{\(\) => setScreen\('controls'\)\}/);
    assert.match(menu, /label="Mouse Sensitivity"/);
    assert.match(menu, /label="Invert Mouse"/);
    assert.match(menu, /CONTROL_GROUPS\.map/);
});

test('a new player never starts, or respawns, inside a still-sealed region', () => {
    const manager = read('src/systems/WorldManager.ts');
    assert.match(manager, /private isSealedSpawnColumn\(x: number, z: number\): boolean \{[\s\S]*?sealedByDefault && !progression\.isRegionCleansed\(region\.id\)/);
    assert.match(manager, /if \(this\.isSealedSpawnColumn\(x, z\)\) return -1;/);
    assert.match(manager, /else if \(h > seaLevel && !this\.isSealedSpawnColumn\(x, z\)\)/);
});
