import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTs } from '../world/storage/bundleTs.mjs';

globalThis.__APP_VERSION__ = 'test';
globalThis.__APP_DISPLAY_VERSION__ = 'test';

const mod = await loadTs(`
    export * as THREE from 'three';
    export { simulateStep, sweepAxis, moveSlices } from './src/systems/player/playerMovement';
    export { TERMINAL_VELOCITY, FIXED_DT, PLAYER_WIDTH, PLAYER_HEIGHT, MAX_MOVE_SLICE } from './src/systems/player/playerConstants';
    export { BlockType } from './src/types';
`);
const { THREE, simulateStep, sweepAxis, moveSlices, TERMINAL_VELOCITY, FIXED_DT, PLAYER_WIDTH, PLAYER_HEIGHT, MAX_MOVE_SLICE, BlockType } = mod;

// A world of air with a few solid cells, every chunk loaded.
const world = (solid) => ({
    getBlock: (x, y, z) => (solid(x, y, z) ? BlockType.STONE : BlockType.AIR),
    getMetadata: () => 0,
    hasChunk: () => true,
});

const intent = (overrides = {}) => ({
    forward: false, backward: false, left: false, right: false,
    jump: false, sneak: false, sprint: false, omniSprint: false,
    cancelDoubleTap: () => {},
    ...overrides,
});

test('a fall at terminal velocity lands on a one-block floor instead of passing through it', () => {
    // Terminal velocity covers more than the 2.8 blocks a body needs to clear a floor in one tick.
    assert.ok(TERMINAL_VELOCITY * FIXED_DT > PLAYER_HEIGHT + 1);
    const wm = world((x, y) => y === 10);
    // Start the tick just above the floor, already at terminal velocity.
    let pos = new THREE.Vector3(0.5, 11.5, 0.5);
    let vel = new THREE.Vector3(0, -TERMINAL_VELOCITY, 0);
    const result = simulateStep(wm, pos, vel, intent(), 0, FIXED_DT, false);
    assert.equal(result.grounded, true);
    assert.ok(Math.abs(result.position.y - 11) < 0.01, `stands on the floor, got y ${result.position.y}`);
    assert.equal(result.velocity.y, 0);
});

test('a long fall through open sky lands on a thin floor, from any starting height', () => {
    const wm = world((x, y) => y === 10);
    // Different starting heights put the ticks at different phases against the floor.
    for (let start = 150; start < 151; start += 0.125) {
        let pos = new THREE.Vector3(0.5, start, 0.5);
        let vel = new THREE.Vector3(0, 0, 0);
        for (let tick = 0; tick < 200; tick++) {
            const result = simulateStep(wm, pos, vel, intent(), 0, FIXED_DT, false);
            pos = result.position;
            vel = result.velocity;
            assert.ok(pos.y >= 11 - 0.01, `never below the floor (start ${start}, tick ${tick}: y ${pos.y})`);
            if (result.grounded) break;
        }
        assert.ok(Math.abs(pos.y - 11) < 0.01, `lands on it (start ${start})`);
    }
});

test('sprint-flying into a one-block wall stops at it, from any starting point', () => {
    // Creative sprint-flight reaches 50 blocks a second: 2.5 blocks a tick.
    const wm = world((x, y, z) => z === -5);
    for (let start = 0.5; start < 3; start += 0.125) {
        let pos = new THREE.Vector3(0.5, 20, start);
        let vel = new THREE.Vector3(0, 0, -50);
        for (let tick = 0; tick < 20; tick++) {
            const result = simulateStep(wm, pos, vel, intent({ forward: true, sprint: true }), 0, FIXED_DT, true);
            pos = result.position;
            vel = result.velocity;
            assert.ok(pos.z - PLAYER_WIDTH / 2 >= -4 - 0.01, `stays in front of the wall (start ${start}, tick ${tick}: z ${pos.z})`);
        }
    }
});

test('sweepAxis stops flush at the first obstacle and reports it', () => {
    const wm = world((x, y, z) => x === 3);
    const pos = { x: 0.5, y: 0, z: 0.5 };
    assert.equal(sweepAxis(wm, pos, 'x', 10, PLAYER_WIDTH, PLAYER_HEIGHT), true);
    assert.ok(pos.x + PLAYER_WIDTH / 2 <= 3 && pos.x + PLAYER_WIDTH / 2 > 3 - MAX_MOVE_SLICE, `flush against the block, got x ${pos.x}`);
    const free = { x: 0.5, y: 0, z: 0.5 };
    assert.equal(sweepAxis(wm, free, 'x', 2, PLAYER_WIDTH, PLAYER_HEIGHT), false);
    assert.ok(Math.abs(free.x - 2.5) < 1e-9);
    assert.equal(moveSlices(0), 1);
    assert.equal(moveSlices(-3.92), Math.ceil(3.92 / MAX_MOVE_SLICE));
});
