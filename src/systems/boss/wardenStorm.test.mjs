import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import ts from 'typescript';
import * as THREE from 'three';
import * as core from './magneticWardenCore.ts';
import * as geometry from './wardenCombatGeometry.ts';

const code = ts.transpileModule(readFileSync(new URL('./MagneticWardenEncounter.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
function harness() {
    const clears = [], sounds = [], damage = [];
    const modules = {
        './magneticWardenCore': core, './wardenCombatGeometry': geometry,
        '../entities/EntityManager': { entityManager: { registerBrain() {}, registerDamageHandler() {}, clearHazardsFrom: id => clears.push(id), tryDamagePlayer: amount => { damage.push(amount); return true; }, impulsePlayer() {} } },
        '../events/GameEvents': { gameEvents: { on() {}, emit() {} } },
        '../player/playerConstants': { PLAYER_HEIGHT: 1.8 },
        '../player/cameraShake': { addTrauma() {} },
        '../sound/SoundManager': { soundManager: { playAt: name => sounds.push(name) } },
        '../fx/particleFx': { particleFx: { burst() {} }, polarityFxColor: () => [1, 1, 1] },
    };
    const exports = {};
    new Function('require', 'exports', code)(name => modules[name] ?? {}, exports);
    return { encounter: exports.magneticWardenEncounter, clears, sounds, damage };
}

test('Aegis and Storm track early, then preserve the visible landing point through the entire drop', () => {
    for (const form of [2, 3]) {
        const { encounter, sounds, damage } = harness();
        const entity = { id: 1, pos: new THREE.Vector3(0, 0, 0), vel: new THREE.Vector3(), home: { x: 0, y: 0, z: 0 } };
        encounter.state = core.createWardenState({ form, action: 'plunge_windup', actionDuration: 1.6 });
        encounter.resolvePlunge(entity, { x: 2, y: 0, z: 0 }, false, 'mark', 3.2, 12);
        encounter.state.actionTime = 0.8;
        encounter.applyMovement(entity, 0.05, { x: 8, y: 0, z: 0 });
        assert.equal(encounter.plungeTarget.x, 8);
        encounter.state.actionTime = 1.05;
        encounter.applyMovement(entity, 0.05, { x: 14, y: 0, z: 0 });
        assert.equal(encounter.plungeTarget.x, 8);
        assert.ok(sounds.length > 0);
        encounter.state.actionTime = 1.6;
        encounter.applyMovement(entity, 0.05, { x: 18, y: 0, z: 0 });
        assert.equal(entity.pos.x, 8);
        assert.equal(entity.pos.y, 16);
        encounter.state = { ...encounter.state, action: 'plunge_drop', actionDuration: 0.3, actionTime: 0.3 };
        encounter.applyMovement(entity, 0.05, { x: 18, y: 0, z: 0 });
        assert.deepEqual(entity.pos.toArray(), [8, 0, 0]);
        encounter.resolvePlunge(entity, { x: 8, y: 0, z: 0 }, true, 'impact', 3.2, 12);
        assert.deepEqual(damage, [12]); // Direct center hit is independent of polarity and the ring.
        encounter.plungeTarget = { x: 8, y: 0, z: 0 };
        encounter.resolvePlunge(entity, { x: 12, y: 0, z: 0 }, true, 'impact', 3.2, 12);
        assert.deepEqual(damage, [12]);
    }
});

test('all four Storm crystals must fall before the shield drops', () => {
    let state = core.advanceWarden(core.createWardenState({ form: 3, hp: 100, action: 'spiral' }), { type: 'configure', crystals: 4 }).state;
    assert.deepEqual(core.wardenLiveTowers(state), [0, 1, 2, 3]);
    for (const [index, crystal] of [2, 0, 3, 1].entries()) {
        state = core.advanceWarden(state, { type: 'crystal-broken', crystal }).state;
        assert.equal(state.shieldLayers, 3 - index);
        assert.equal(core.isWardenShielded(state), index < 3);
        const hit = core.advanceWarden(state, { type: 'damage', amount: 5, playerPolarity: -state.polarity });
        assert.equal(hit.events[0].type, index < 3 ? 'blocked' : 'hurt');
    }
    assert.equal(state.action, 'shield_break');
    assert.equal(state.actionDuration, 4.5);
});

test('Storm completes damaging slams between full beats', () => {
    let state = core.createWardenState({ form: 3, hp: 100, action: 'spiral', actionDuration: 0,
        plungeTimer: 0, crystals: [true, true, true, true], ignited: [0, 1, 2, 3], shieldLayers: 4 });
    const events = [];
    for (let i = 0; i < 1200; i++) {
        const step = core.advanceWarden(state, { type: 'tick', dt: 0.05, playerDistance: 8 });
        state = step.state; events.push(...step.events);
        if (state.action.startsWith('plunge_')) assert.ok(!step.events.some(e => e.type === 'beat'));
    }
    assert.equal(events.find(e => e.type === 'beat' || e.type === 'plunge').type, 'beat');
    const impacts = events.filter(e => e.type === 'plunge' && e.phase === 'impact');
    assert.ok(impacts.length >= 3);
    assert.ok(impacts.every(e => e.impactDamage === 12 && e.impactRadius === 3.2));
    assert.equal(events.filter(e => e.type === 'shockwave' && e.source === 'plunge').length, impacts.length);
    assert.ok(events.some(e => e.type === 'beat' && e.second));
});

test('the faster overload beats still leave room for repeated slams', () => {
    for (const dt of [1 / 60, 0.05, 0.1]) {
        let state = core.createWardenState({ form: 3, hp: 30, action: 'spiral', actionDuration: 0, plungeTimer: 0 });
        let impacts = 0;
        for (let time = 0; time < 45; time += dt) {
            const step = core.advanceWarden(state, { type: 'tick', dt, playerDistance: 8 });
            state = step.state;
            impacts += step.events.filter(e => e.type === 'plunge' && e.phase === 'impact').length;
        }
        assert.ok(impacts >= 3, `overload must keep slamming at dt=${dt}`);
    }
});

test('first-phase physical cleaves hit inside the cone and cannot be answered by polarity', () => {
    const { encounter, damage } = harness();
    const entity = { id: 1, pos: new THREE.Vector3(), yaw: 0 };
    for (const polarity of [-1, 1]) {
        encounter.state = core.createWardenState({ polarity });
        encounter.resolveLash(entity, { x: 0, y: 0, z: 3 }, true, 8, 4.5, Math.PI / 3);
    }
    assert.deepEqual(damage, [8, 8]);
    encounter.resolveLash(entity, { x: 0, y: 0, z: -3 }, true, 8, 4.5, Math.PI / 3);
    assert.deepEqual(damage, [8, 8]);
});
