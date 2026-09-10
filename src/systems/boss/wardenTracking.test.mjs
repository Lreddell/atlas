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
    const clears = [], sounds = [];
    const modules = {
        './magneticWardenCore': core, './wardenCombatGeometry': geometry,
        '../entities/EntityManager': { entityManager: { registerBrain() {}, registerDamageHandler() {}, clearHazardsFrom: id => clears.push(id) } },
        '../events/GameEvents': { gameEvents: { on() {}, emit() {} } },
        '../player/playerConstants': { PLAYER_HEIGHT: 1.8 },
        '../player/cameraShake': { addTrauma() {} },
        '../sound/SoundManager': { soundManager: { playAt: name => sounds.push(name) } },
        '../fx/particleFx': { particleFx: { burst() {} }, polarityFxColor: () => [1, 1, 1] },
    };
    const exports = {};
    new Function('require', 'exports', code)(name => modules[name] ?? {}, exports);
    return { encounter: exports.magneticWardenEncounter, clears, sounds };
}

test('both aerial forms track early, then preserve the visible landing point through the entire drop', () => {
    for (const form of [2, 3]) {
        const { encounter, sounds } = harness();
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
    }
});

test('ordinary stagger preserves flight hazards while an objective break clears them', () => {
    const { encounter, clears } = harness();
    const entity = { id: 7, pos: new THREE.Vector3() };
    encounter.applyEvents([{ type: 'stagger' }], entity, null, false);
    assert.equal(clears.length, 0);
    encounter.applyEvents([{ type: 'shield-broken', crystal: 0 }], entity, null, false);
    assert.deepEqual(clears, [7]);
});
