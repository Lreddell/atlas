import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { build } from 'esbuild';

const root = path.resolve(import.meta.dirname, '../../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const bundle = await build({
  entryPoints: [path.join(root, 'src/systems/entities/BellTitanEncounterCore.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  write: false,
});
const titan = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const {
  BELL_TITAN_AWAKEN_SECONDS,
  BELL_TITAN_CLOSED_DAMAGE_MULTIPLIER,
  BELL_TITAN_CORE_DAMAGE_MULTIPLIER,
  BELL_TITAN_DAMAGE_CAP,
  BELL_TITAN_ATTACK_GEOMETRY,
  BellTitanEncounterCore,
  advanceBellTitan,
  createBellTitanState,
  isBellTitanAdvanceHit,
  isBellTitanSweepHit,
  raycastBellTitanCore,
  resolveBellTitanHitZone,
} = titan;

const layout = {
  vaultId: 'resonant:test:titan',
  centerX: 0,
  centerZ: 0,
  surfaceY: 100,
  vaultY: 20,
  orientation: 0,
  rooms: [
    { id: 'antechamber', kind: 'antechamber', x: 0, y: 20, z: 30, width: 23, height: 13, depth: 17, variant: 1 },
    { id: 'arena', kind: 'arena', x: 0, y: 19, z: 0, width: 43, height: 17, depth: 39, variant: 2 },
    { id: 'core', kind: 'core', x: 0, y: 20, z: -36, width: 27, height: 15, depth: 21, variant: 3 },
  ],
  edges: [['antechamber', 'arena'], ['arena', 'core']],
  doorways: [],
  surfaceOutlets: { grand: { x: -1, z: 0 }, fracture: { x: 1, z: 0 } },
  glyphSequence: [0, 1, 2, 3],
  phaseTiming: { periodTicks: 100, solidTicks: 44, offsetTicks: 0 },
};

function makeHarness() {
  const events = [];
  const progressionCalls = [];
  const arenaCalls = [];
  let entity = null;
  const arena = {
    configure: (bounds) => arenaCalls.push({ type: 'configure', bounds }),
    spawnShockwave: (origin, spec) => { arenaCalls.push({ type: 'shockwave', origin, spec }); return arenaCalls.length; },
    spawnImpact: (origin, spec) => { arenaCalls.push({ type: 'impact', origin, spec }); return arenaCalls.length; },
    spawnLane: (origin, spec) => { arenaCalls.push({ type: 'lane', origin, spec }); return arenaCalls.length; },
    breakShell: (origin, stage) => { arenaCalls.push({ type: 'shell', origin, stage }); return []; },
    tick: () => ({ playerDamage: 0, shockwaves: [], impacts: [], lanes: [], debris: [] }),
    getShockwaves: () => [],
    getImpacts: () => [],
    getLanes: () => [],
    getDebris: () => [],
    reset: () => arenaCalls.push({ type: 'reset' }),
  };
  const entities = {
    spawn: (kind, x, y, z, options) => {
      entity = {
        id: 73,
        kind,
        pos: { x, y, z },
        vel: { x: 0, y: 0, z: 0 },
        width: 3.6,
        height: 6.2,
        hp: 390,
        maxHp: 390,
        damageMultiplier: 1,
        grounded: true,
        aggro: false,
        yaw: 0,
        hurtUntil: 0,
        regionId: options.regionId,
      };
      return entity;
    },
    getEntity: (id) => id === entity?.id ? entity : undefined,
    despawn: (id) => { if (id === entity?.id) entity = null; },
    defeat: (id) => { events.push({ name: 'entity:defeat-requested', payload: { entityId: id } }); },
  };
  const encounter = new BellTitanEncounterCore({
    arena,
    entities,
    progression: {
      markVaultTitanDefeated: (...args) => { progressionCalls.push(args); return true; },
    },
    events: { emit: (name, payload) => events.push({ name, payload }) },
    hasLineOfSight: () => true,
  });
  return { encounter, events, progressionCalls, arenaCalls, get entity() { return entity; } };
}

function tickFor(harness, seconds, player = { x: 7, y: 20, z: 4 }) {
  let damage = 0;
  for (let elapsed = 0; elapsed < seconds; elapsed += 0.05) damage += harness.encounter.tick(0.05, player);
  return damage;
}

test('the Titan cannot attack until the arena illumination finishes', () => {
  let transition = advanceBellTitan(createBellTitanState(), { type: 'wake' });
  assert.equal(transition.state.action, 'awaken');
  assert.equal(transition.state.canDamagePlayer, false);
  assert.deepEqual(transition.events.map((event) => event.type), ['awakened', 'action']);

  transition = advanceBellTitan(transition.state, {
    type: 'tick',
    dt: BELL_TITAN_AWAKEN_SECONDS - 0.1,
    playerDistance: 10,
  });
  assert.equal(transition.state.action, 'awaken');
  assert.equal(transition.state.canDamagePlayer, false);

  transition = advanceBellTitan(transition.state, { type: 'tick', dt: 0.11, playerDistance: 10 });
  assert.notEqual(transition.state.action, 'awaken');
  assert.equal(transition.state.canDamagePlayer, false);
});

test('a completed slam creates one clear bell-core damage window', () => {
  const state = createBellTitanState({ action: 'slam_recovery', actionTime: 0.89, canDamagePlayer: false });
  const transition = advanceBellTitan(state, { type: 'tick', dt: 0.02, playerDistance: 8 });
  assert.equal(transition.state.action, 'core_open');
  assert.equal(transition.state.coreExposed, true);
  assert.ok(transition.state.coreExposureRemaining >= 2.39);
  assert.deepEqual(transition.events.map((event) => event.type), ['core']);
});

test('attacks emit exactly once at authored visual contact instead of active-frame start', () => {
  const cases = [
    { action: 'sweep_active', before: 0.13, cross: 0.02, type: 'strike', attack: 'sweep' },
    { action: 'slam_active', before: 0.08, cross: 0.02, type: 'shockwave', attack: 'slam' },
    { action: 'advance_active', before: 0.21, cross: 0.02, type: 'strike', attack: 'advance' },
  ];
  for (const fixture of cases) {
    let state = createBellTitanState({ action: fixture.action, actionTime: 0, canDamagePlayer: true });
    let transition = advanceBellTitan(state, { type: 'tick', dt: fixture.before, playerDistance: 5 });
    assert.equal(transition.events.some((event) => event.type === fixture.type), false, fixture.action);
    transition = advanceBellTitan(transition.state, { type: 'tick', dt: fixture.cross, playerDistance: 5 });
    assert.equal(transition.events.filter((event) => event.type === fixture.type && event.attack === fixture.attack).length, 1, fixture.action);
    transition = advanceBellTitan(transition.state, { type: 'tick', dt: 0.02, playerDistance: 5 });
    assert.equal(transition.events.some((event) => event.type === fixture.type), false, fixture.action);
  }

  let toll = createBellTitanState({ action: 'double_toll_active', actionTime: 0, canDamagePlayer: true });
  let transition = advanceBellTitan(toll, { type: 'tick', dt: 0.17, playerDistance: 7 });
  assert.equal(transition.events.length, 0);
  transition = advanceBellTitan(transition.state, { type: 'tick', dt: 0.02, playerDistance: 7 });
  assert.deepEqual(transition.events.map((event) => event.index), [1]);
  transition = advanceBellTitan(transition.state, { type: 'tick', dt: 0.34, playerDistance: 7 });
  assert.equal(transition.events.length, 0);
  transition = advanceBellTitan(transition.state, { type: 'tick', dt: 0.02, playerDistance: 7 });
  assert.deepEqual(transition.events.map((event) => event.index), [2]);
});

test('armor breaks at two readable phase thresholds', () => {
  let state = createBellTitanState({ hp: 270, action: 'core_open', coreExposed: true, coreExposureRemaining: 3 });
  let transition = advanceBellTitan(state, { type: 'damage', amount: 20, hitZone: 'core' });
  state = transition.state;
  assert.equal(state.phase, 2);
  assert.equal(state.shellStage, 1);
  assert.equal(state.action, 'shell_break');
  assert.equal(state.canDamagePlayer, false);
  assert.deepEqual(transition.events.map((event) => event.type), ['shell-broken', 'core', 'action']);

  state = { ...state, hp: 140, phase: 2, shellStage: 1, action: 'core_open', actionTime: 0, coreExposed: true, coreExposureRemaining: 3 };
  transition = advanceBellTitan(state, { type: 'damage', amount: 10, hitZone: 'core' });
  assert.equal(transition.state.phase, 3);
  assert.equal(transition.state.shellStage, 2);
  assert.equal(transition.state.action, 'shell_break');
});

test('the closed shell fully deflects damage while the exposed bell applies a per-hit damage cap', () => {
  const closed = advanceBellTitan(createBellTitanState({ action: 'idle' }), {
    type: 'damage', amount: 50, hitZone: 'shell',
  }).state;
  const open = advanceBellTitan(createBellTitanState({ action: 'core_open', coreExposed: true }), {
    type: 'damage', amount: 50, hitZone: 'core',
  });
  assert.equal(BELL_TITAN_CLOSED_DAMAGE_MULTIPLIER, 0);
  assert.equal(BELL_TITAN_CORE_DAMAGE_MULTIPLIER, 1);
  assert.equal(closed.hp, 390);
  assert.equal(BELL_TITAN_DAMAGE_CAP, 42);
  assert.equal(open.state.hp, 348);
  assert.equal(open.events.some((event) => event.type === 'hurt' && event.hitZone === 'core'), true);
});

test('a ray through the rendered hanging bell resolves the core before the broad body box', () => {
  const position = { x: 10, y: 20, z: 30 };
  const front = { x: 10, y: 22.8, z: 36 };
  const direction = { x: 0, y: 0, z: -1 };
  const distance = raycastBellTitanCore(front, direction, position, 0, 10);
  assert.ok(distance !== null && distance >= 3.75 && distance < 6);
  assert.equal(raycastBellTitanCore({ x: 13, y: 22.8, z: 36 }, direction, position, 0, 10), null);
});

test('world-space hits resolve the hanging bell separately from the outer shell', () => {
  const position = { x: 10, y: 20, z: 30 };
  assert.equal(resolveBellTitanHitZone(position, 0, { x: 10, y: 22.8, z: 31.8 }), 'core');
  assert.equal(resolveBellTitanHitZone(position, 0, { x: 11.8, y: 22.8, z: 30 }), 'shell');
  assert.equal(resolveBellTitanHitZone(position, Math.PI / 2, { x: 11.8, y: 22.8, z: 30 }), 'core');
  assert.equal(resolveBellTitanHitZone(position, 0, { x: 10, y: 24.8, z: 31.8 }), 'shell');
});

test('attack selection is deterministic, spacing-aware, and never immediately repeats a move', () => {
  let state = createBellTitanState({ action: 'idle', actionTime: 0.79 });
  const actions = [];
  for (let i = 0; i < 4; i += 1) {
    let transition = advanceBellTitan(state, { type: 'tick', dt: 0.02, playerDistance: 8 });
    actions.push(transition.state.action);
    state = { ...transition.state, action: 'idle', actionTime: 0.79, canDamagePlayer: false };
  }
  assert.equal(new Set(actions).size, actions.length);
  assert.ok(actions.includes('advance_windup'));
  assert.ok(actions.includes('chain_lash_windup'));
  for (let i = 1; i < actions.length; i += 1) assert.notEqual(actions[i], actions[i - 1]);
});

test('the Titan closes distance before spending attacks outside their effective range', () => {
  const state = createBellTitanState({ action: 'idle', actionTime: 0.79 });
  const transition = advanceBellTitan(state, { type: 'tick', dt: 0.02, playerDistance: 24 });
  assert.equal(transition.state.action, 'advance_windup');
  assert.equal(transition.state.attackIndex, 1);
  assert.equal(transition.events.some((event) => event.type === 'action' && event.action === 'advance_windup'), true);
});

test('dodging a committed charge or hammer combination earns a substantial punish window', () => {
  const charge = advanceBellTitan(createBellTitanState({
    action: 'advance_recovery',
    actionTime: 0.61,
  }), { type: 'tick', dt: 0.02, playerDistance: 18 });
  assert.equal(charge.state.action, 'core_open');
  assert.ok(charge.state.coreExposureRemaining >= 1.99);

  const combo = advanceBellTitan(createBellTitanState({
    phase: 2,
    shellStage: 1,
    action: 'hammer_combo_recovery',
    actionTime: 0.67,
  }), { type: 'tick', dt: 0.02, playerDistance: 4 });
  assert.equal(combo.state.action, 'core_open');
  assert.ok(combo.state.coreExposureRemaining >= 1.88);
});

test('the anti-retreat charge and sweep hit exactly the exported telegraph geometry', () => {
  const origin = { x: 0, y: 20, z: 0 };
  const forward = { x: 0, z: 1 };
  const charge = BELL_TITAN_ATTACK_GEOMETRY.advance;
  assert.equal(isBellTitanAdvanceHit(origin, forward, { x: 0, y: 20, z: charge.length - 0.01 }), true);
  assert.equal(isBellTitanAdvanceHit(origin, forward, { x: 0, y: 20, z: charge.length + 0.01 }), false);
  assert.equal(isBellTitanAdvanceHit(origin, forward, { x: charge.halfWidth + 0.01, y: 20, z: 10 }), false);

  const sweep = BELL_TITAN_ATTACK_GEOMETRY.sweep;
  assert.equal(isBellTitanSweepHit(origin, forward, { x: 0, y: 20, z: sweep.range - 0.01 }), true);
  assert.equal(isBellTitanSweepHit(origin, forward, { x: 0, y: 20, z: sweep.range + 0.01 }), false);
});

test('the runtime spawns only the Bell Titan and begins with a safe illuminated awakening', () => {
  const harness = makeHarness();
  assert.equal(harness.encounter.ensure(layout.vaultId, layout), 73);
  assert.equal(harness.entity.kind, 'bell_titan');
  assert.equal(harness.entity.aggro, true);
  assert.equal(harness.encounter.getSnapshot().action, 'awaken');
  assert.equal(harness.encounter.getSnapshot().canDamagePlayer, false);
  assert.equal(harness.events.some((event) => event.name === 'vault:titan-awakened'), true);
  assert.equal(harness.events.some((event) => event.name === 'vault:encounter-started'), true);
  assert.equal(harness.arenaCalls[0].type, 'configure');
  tickFor(harness, 2.9, { x: 0, y: 23, z: 0 });
  assert.equal(harness.encounter.getSnapshot().action, 'awaken');
  tickFor(harness, 0.2, { x: 0, y: 23, z: 0 });
  assert.equal(harness.encounter.getSnapshot().action, 'idle');
});

test('the awakened Titan pursues across neutral beats and locks one authoritative windup anchor', () => {
  const harness = makeHarness();
  harness.encounter.ensure(layout.vaultId, layout);
  tickFor(harness, 3.15, { x: 0.5, y: 20, z: 18 });
  assert.ok(harness.entity.vel.z > 5, 'neutral movement should actively close distance');
  tickFor(harness, 0.5, { x: 0.5, y: 20, z: 18 });
  const locked = harness.encounter.getAttackAnchor();
  assert.notEqual(locked, null);
  harness.entity.pos.x += 4;
  harness.entity.pos.z -= 3;
  assert.deepEqual(harness.encounter.getAttackAnchor(), locked, 'telegraph must not drift after the attack commits');
});

test('the awakened Titan can actually damage a player inside its telegraphed sweep', () => {
  const harness = makeHarness();
  harness.encounter.ensure(layout.vaultId, layout);
  const damage = tickFor(harness, 6, { x: 0.5, y: 23, z: 5 });
  assert.ok(damage >= 11, `expected an authored Titan hit, received ${damage}`);
});

test('later phases escalate damage, cadence, core pressure, and the final toll', () => {
  const phaseOneSlam = advanceBellTitan(
    createBellTitanState({ phase: 1, action: 'slam_active', actionTime: 0.08, canDamagePlayer: true }),
    { type: 'tick', dt: 0.02, playerDistance: 8 },
  );
  const phaseThreeSlam = advanceBellTitan(
    createBellTitanState({ phase: 3, shellStage: 2, action: 'slam_active', actionTime: 0.08, canDamagePlayer: true }),
    { type: 'tick', dt: 0.02, playerDistance: 8 },
  );
  assert.ok(phaseThreeSlam.events[0].damage > phaseOneSlam.events[0].damage);

  const phaseOneRecovery = advanceBellTitan(
    createBellTitanState({ phase: 1, action: 'slam_recovery', actionTime: 0.89 }),
    { type: 'tick', dt: 0.02, playerDistance: 8 },
  );
  const phaseThreeRecovery = advanceBellTitan(
    createBellTitanState({ phase: 3, shellStage: 2, action: 'slam_recovery', actionTime: 0.89 }),
    { type: 'tick', dt: 0.02, playerDistance: 8 },
  );
  assert.ok(phaseThreeRecovery.state.coreExposureRemaining < phaseOneRecovery.state.coreExposureRemaining);

  let finalToll = createBellTitanState({
    phase: 3,
    shellStage: 2,
    action: 'double_toll_active',
    actionTime: 0,
    canDamagePlayer: true,
  });
  const rings = [];
  for (let elapsed = 0; elapsed < 1; elapsed += 0.05) {
    const transition = advanceBellTitan(finalToll, { type: 'tick', dt: 0.05, playerDistance: 8 });
    finalToll = transition.state;
    rings.push(...transition.events.filter((event) => event.type === 'shockwave'));
    if (finalToll.action !== 'double_toll_active') break;
  }
  assert.deepEqual(rings.map(({ index }) => index), [1, 2, 3]);
});

test('later phases introduce a two-hit hammer combination and a five-ring bell storm', () => {
  let combo = createBellTitanState({ phase: 2, shellStage: 1, action: 'hammer_combo_active', canDamagePlayer: true });
  const comboStrikes = [];
  for (let elapsed = 0; elapsed < 1; elapsed += 0.05) {
    const transition = advanceBellTitan(combo, { type: 'tick', dt: 0.05, playerDistance: 5 });
    combo = transition.state;
    comboStrikes.push(...transition.events.filter((event) => event.type === 'strike'));
    if (combo.action !== 'hammer_combo_active') break;
  }
  assert.deepEqual(comboStrikes.map(({ index }) => index), [1, 2]);

  let storm = createBellTitanState({ phase: 3, shellStage: 2, action: 'bell_storm_active', canDamagePlayer: true });
  const stormRings = [];
  for (let elapsed = 0; elapsed < 1.5; elapsed += 0.05) {
    const transition = advanceBellTitan(storm, { type: 'tick', dt: 0.05, playerDistance: 8 });
    storm = transition.state;
    stormRings.push(...transition.events.filter((event) => event.type === 'shockwave'));
    if (storm.action !== 'bell_storm_active') break;
  }
  assert.deepEqual(stormRings.map(({ index }) => index), [1, 2, 3, 4, 5]);
});

test('phase transitions open with distinct authored mechanics instead of resuming a shared loop', () => {
  const phaseTwo = advanceBellTitan(createBellTitanState({
    phase: 2,
    shellStage: 1,
    phaseOpenerPending: true,
    action: 'idle',
    actionTime: 0.79,
  }), { type: 'tick', dt: 0.02, playerDistance: 14 });
  assert.equal(phaseTwo.state.action, 'hammer_combo_windup');

  const phaseThree = advanceBellTitan(createBellTitanState({
    phase: 3,
    shellStage: 2,
    phaseOpenerPending: true,
    action: 'idle',
    actionTime: 0.79,
  }), { type: 'tick', dt: 0.02, playerDistance: 3 });
  assert.equal(phaseThree.state.action, 'resonance_cage_windup');
});

test('vaultbreaker and resonance cage author visible hazards before they become dangerous', () => {
  const breaker = advanceBellTitan(createBellTitanState({
    phase: 2,
    shellStage: 1,
    action: 'vaultbreaker_windup',
    actionTime: 0.31,
  }), { type: 'tick', dt: 0.02, playerDistance: 10 });
  assert.deepEqual(breaker.events.map(({ type }) => type), ['impact']);
  assert.ok(breaker.events[0].warningSeconds > 1);

  const cage = advanceBellTitan(createBellTitanState({
    phase: 3,
    shellStage: 2,
    action: 'resonance_cage_windup',
    actionTime: 0.33,
  }), { type: 'tick', dt: 0.02, playerDistance: 10 });
  assert.equal(cage.events.filter(({ type }) => type === 'lane').length, 5);
  assert.ok(cage.events.every(({ warningSeconds }) => warningSeconds >= 1.4));
});

test('shell breaks create a jumpable phase burst before the new move kit begins', () => {
  const transition = advanceBellTitan(createBellTitanState({
    hp: 250,
    phase: 2,
    shellStage: 1,
    action: 'shell_break',
    actionTime: 0.7,
  }), { type: 'tick', dt: 0.03, playerDistance: 8 });
  assert.equal(transition.events.filter(({ type }) => type === 'shockwave').length, 1);
  assert.equal(transition.events[0].attack, 'phase_burst');
});

test('arena lighting can be configured without spawning and remains after victory', () => {
  const harness = makeHarness();
  const anchor = harness.encounter.configureArena(layout.vaultId, layout);
  assert.deepEqual(anchor, { x: 0.5, y: 20, z: 0.5 });
  assert.deepEqual(harness.encounter.getArenaAnchor(), anchor);
  assert.equal(harness.entity, null);
  assert.equal(harness.encounter.areArenaLightsReady(), false);

  harness.encounter.ensure(layout.vaultId, layout);
  harness.encounter.handleEntityDeath(73);
  assert.deepEqual(harness.encounter.getArenaAnchor(), anchor);
  assert.equal(harness.encounter.areArenaLightsReady(), true);
  harness.encounter.reset();
  assert.equal(harness.encounter.getArenaAnchor(), null);
  harness.encounter.configureArena(layout.vaultId, layout, true);
  assert.equal(harness.encounter.areArenaLightsReady(), true);
});

test('runtime hits are encounter-authoritative and the closed shell cannot be brute-forced', () => {
  const harness = makeHarness();
  harness.encounter.ensure(layout.vaultId, layout);
  tickFor(harness, 3.1);
  assert.equal(harness.encounter.applyHit(73, 50, 'core'), 'blocked');
  assert.equal(harness.entity.hp, 390);
  assert.equal(harness.events.some((event) => event.name === 'vault:titan-deflected'), true);
  assert.equal(harness.events.some((event) => event.name === 'boss:damaged'), false);
});

test('entity death completes Titan progression exactly once', () => {
  const harness = makeHarness();
  harness.encounter.ensure(layout.vaultId, layout);
  assert.equal(harness.encounter.handleEntityDeath(73), true);
  assert.equal(harness.encounter.handleEntityDeath(73), false);
  assert.deepEqual(harness.progressionCalls, [[layout.vaultId, 73]]);
  assert.equal(harness.events.some((event) => event.name === 'vault:titan-defeated'), true);
  assert.equal(harness.events.some((event) => event.name === 'vault:encounter-completed'), true);
  tickFor(harness, 0.5, { x: 0, y: 20, z: 0 });
  assert.ok(harness.encounter.getSnapshot().actionTime >= 0.49);
  assert.notEqual(harness.encounter.getRenderAnchor(), null);
  tickFor(harness, 2.1, { x: 0, y: 20, z: 0 });
  assert.equal(harness.encounter.getRenderAnchor(), null);
});

test('runtime registration and typed events contain no Vault Mason fallback', () => {
  const entities = read('src/systems/entities/resonantEntities.ts');
  const manager = read('src/systems/entities/EntityManager.ts');
  const director = read('src/systems/entities/ResonantEncounterDirector.ts');
  const runtime = read('src/systems/world/ResonantVaultRuntime.ts');
  const controller = read('src/components/ResonantVaultController.tsx');
  const app = read('src/App.tsx');
  const events = read('src/systems/events/GameEvents.ts');
  const interaction = read('src/components/controllers/InteractionController.tsx');
  const projectiles = read('src/systems/combat/VaultProjectileSystem.ts');

  assert.match(entities, /bell_titan:\s*\{/);
  assert.match(entities, /bell_titan:[\s\S]*?drops:\s*\[[\s\S]*?TITAN_HAMMER/);
  assert.match(director, /vault:titan-shell-broken/);
  assert.match(director, /spawnTitanReinforcements/);
  assert.doesNotMatch(entities, /vault_mason:\s*\{/);
  assert.match(manager, /bell_titan:\s*'Bell Titan'/);
  assert.match(manager, /resolveBellTitanHitZone/);
  assert.match(interaction, /hit\.hitZone/);
  assert.match(interaction, /targetKind !== 'bell_titan'/);
  assert.match(projectiles, /entityHit\.hitZone/);
  assert.match(runtime, /bellTitanEncounter\.configureArena\([\s\S]*?layout\.vaultId,[\s\S]*?titanDefeated/);
  assert.match(runtime, /bellTitanEncounter\.cleanup\(\)/);
  for (const source of [manager, director, runtime, controller, app, events]) {
    assert.doesNotMatch(source, /VaultMason|vaultMason|vault_mason|vault:mason/);
  }
  for (const name of ['awakened', 'action', 'core', 'shell-broken', 'hurt', 'defeated']) {
    assert.match(events, new RegExp(`'vault:titan-${name}'`));
  }
  for (const obsolete of [
    'src/systems/entities/VaultMasonEncounterCore.ts',
    'src/systems/entities/VaultMasonEncounter.ts',
    'src/systems/entities/VaultMasonArena.ts',
    'src/systems/entities/vaultMasonEncounter.test.mjs',
    'src/systems/entities/vaultMasonArena.test.mjs',
  ]) assert.equal(fs.existsSync(path.join(root, obsolete)), false, `${obsolete} still exists`);
});
