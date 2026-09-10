import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import ts from 'typescript';
import * as THREE from 'three';
import { polarityRelation, WARDEN_TIMING } from '../boss/magneticWardenCore.ts';
import { segmentHitsBox, ringSweepsPlayer } from '../boss/wardenCombatGeometry.ts';

// Execute the actual projectile adapter against an empty voxel world. No WebGL,
// workers or persistent saves are started.
const code = ts.transpileModule(readFileSync(new URL('./EntityManager.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
function harness(solid = () => false) {
    const modules = {
        three: THREE,
        '../WorldManager': { worldManager: {} },
        '../player/playerCollision': { isSolid: solid },
        '../player/playerConstants': { PLAYER_HEIGHT: 1.8, PLAYER_WIDTH: 0.6 },
        '../boss/magneticWardenCore': { polarityRelation, WARDEN_TIMING },
        '../boss/wardenCombatGeometry': { segmentHitsBox, ringSweepsPlayer },
        '../events/GameEvents': { gameEvents: { emit() {} } },
        '../fx/particleFx': { particleFx: { burst() {} }, polarityFxColor: () => [1, 1, 1] },
        './navigation/VoxelNavigator': { VoxelNavigator: class {} },
        './navigation/NavigationPlanner': { NavigationPlanner: class {} },
    };
    const exports = {};
    new Function('require', 'exports', code)(name => modules[name] ?? {}, exports);
    return exports.entityManager;
}
const spawn = (manager, extra = {}) => manager.spawnProjectile({ x: 0, y: 1, z: 2,
    vx: 0, vy: 0, vz: -10, damage: 6, polarity: 0, kind: 'charged', sourceId: 1, ttl: 6, ...extra });
const eye = new THREE.Vector3(0, 1, 0), aim = new THREE.Vector3(0, 0, 1);

test('a return needs aim and reach, respects walls, and cannot re-return a spent bolt', () => {
    const manager = harness(); const bolt = spawn(manager);
    assert.equal(manager.returnChargedBolt(eye, new THREE.Vector3(1, 0, 0), 4), false);
    assert.equal(manager.returnChargedBolt(eye, aim, 1), false);
    assert.equal(manager.returnChargedBolt(eye, aim, 3.2), true);
    assert.deepEqual(bolt.vel.toArray(), [0, 0, 30]);
    assert.equal(bolt.homing, 0);
    assert.equal(manager.returnChargedBolt(eye, aim, 3.2), false);
    const wall = harness((_world, _x, _y, z) => z === 1);
    spawn(wall);
    assert.equal(wall.returnChargedBolt(eye, aim, 3.2), false);
});

test('fast returns sweep their source body; a form-change clear cannot resurrect other bolts', () => {
    const manager = harness();
    manager.entities.set(1, { id: 1, hp: 300, width: 1.8, height: 2.8, pos: new THREE.Vector3(0, 0, 8) });
    const calls = [];
    manager.damageEntity = (...args) => { calls.push(args); manager.clearHazardsFrom(1); };
    spawn(manager, { x: 5, kind: 'volley' }); // Survives before the returned bolt is processed.
    spawn(manager); manager.returnChargedBolt(eye, aim, 3.2);
    let playerHits = 0;
    manager.playerDamageHandler = () => { playerHits++; };
    spawn(manager); // A later bolt in this tick must also be cancelled by the break.
    manager.tickProjectiles(0.4, { x: 0, y: 0, z: 0 }, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], 1);
    assert.equal(calls[0][1], 12);
    assert.equal(calls[0][5], 'warden_return');
    assert.equal(manager.getProjectiles().length, 0);
    assert.equal(playerHits, 0);
});

test('returns cannot hit through terrain or hurt the player; charged bolts remain rollable', () => {
    const manager = harness((_world, _x, _y, z) => z === 5);
    manager.entities.set(1, { id: 1, hp: 300, width: 1.8, height: 2.8, pos: new THREE.Vector3(0, 0, 8) });
    let hits = 0; manager.damageEntity = () => { hits++; };
    manager.playerDamageHandler = () => { hits++; };
    spawn(manager); manager.returnChargedBolt(eye, aim, 3.2);
    manager.tickProjectiles(0.4, { x: 0, y: 0, z: 3 }, true);
    assert.equal(hits, 0);
    const dodge = harness();
    dodge.playerPolarityProvider = () => 1;
    dodge.playerInvulnerableProvider = () => true;
    dodge.playerDamageHandler = () => { hits++; };
    spawn(dodge); dodge.tickProjectiles(0.3, { x: 0, y: 0, z: 0 }, true);
    assert.equal(hits, 0);
    dodge.playerInvulnerableProvider = () => false;
    spawn(dodge); dodge.tickProjectiles(0.3, { x: 0, y: 0, z: 0 }, true);
    assert.equal(hits, 1); // Matching boots cannot auto-return a neutral charged bolt.
});
