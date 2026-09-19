// Heartwood entity registration: kinds, live brain adapter, frontal-guard
// damage handlers, and the single registration entry.
//
// Brains themselves live in heartwoodBrains.ts (pure, headless-testable).
// This module binds them to engine singletons and owns ENTITY_KINDS entries.
// Called once at startup from App module scope (main thread only — the
// worker never spawns entities). All mutations are idempotent.

import { ENTITY_KINDS, type Entity, type EntityKind } from '../entities/Entity';
import { entityManager, type BrainContext } from '../entities/EntityManager';
import { worldManager } from '../WorldManager';
import { getTerrainHeight } from '../world/baseChunkGeneration';
import { soundManager } from '../sound/SoundManager';
import { particleFx } from '../fx/particleFx';
import { gameEvents } from '../events/GameEvents';
import { BlockType } from '../../types';
import {
  tickFurrowling, tickSentry, tickHare, tickCantor, tickBailiff,
  tickDeer, tickFinch, tickMoth, noteFrontalBlock,
  clearBrain, SENTRY_GUARD_ARC_COS, BAILIFF_GUARD_ARC_COS,
  type BrainApi,
} from './heartwoodBrains';
import {
  HW_ROOT_HIDE, HW_RESIN, HW_BRIAR_FIBER, HW_CROWNWOOD_TWIG, HW_MOONLEAF,
  HW_RESONANT_SHARD, HW_BELL_FLECK, HW_FEATHER, HW_ANTLER_TINE,
} from './heartwoodContent';

export const HEARTWOOD_KINDS = [
  'furrowling',
  'briar_sentry',
  'crown_hare',
  'heartwood_cantor',
  'mossback_bailiff',
  'field_deer',
  'bellfinch',
  'resin_moth',
] as const;

export type HeartwoodKind = (typeof HEARTWOOD_KINDS)[number];

export function isHeartwoodKind(kind: string): kind is HeartwoodKind {
  return (HEARTWOOD_KINDS as readonly string[]).includes(kind);
}

const KIND_DEFS: Record<HeartwoodKind, EntityKind> = {
  furrowling: {
    id: 'furrowling', maxHp: 24, width: 0.9, height: 0.9, speed: 4.5,
    aggroRange: 18, contactDamage: 0, attackCooldown: 1.0, color: 0x6a4a2a,
    brain: 'furrowling',
    navigation: {
      width: 0.9, height: 0.9, maxStep: 1, maxJump: 1, maxDrop: 3,
      preferredRange: { min: 2, max: 6 }, acceleration: 8,
      turnRate: 6, jumpImpulse: 7, dropSpeedScale: 0.5,
    },
    canStep: true, leashRadius: 40,
    drops: [
      { type: HW_ROOT_HIDE as BlockType, min: 1, max: 1, chance: 0.5 },
      { type: HW_RESIN as BlockType, min: 1, max: 1, chance: 0.15 },
      { type: BlockType.COBBLESTONE, min: 1, max: 1, chance: 0.2 },
    ],
  },
  briar_sentry: {
    id: 'briar_sentry', maxHp: 34, width: 0.8, height: 1.9, speed: 2.6,
    aggroRange: 16, contactDamage: 0, attackCooldown: 1.0, color: 0x2e5d33,
    brain: 'briar_sentry', staggerResistance: 0.2,
    navigation: {
      width: 0.8, height: 1.9, maxStep: 1, maxJump: 1, maxDrop: 3,
      preferredRange: { min: 2, max: 4 }, acceleration: 7,
      turnRate: 4, jumpImpulse: 7, dropSpeedScale: 0.5,
    },
    canStep: true, leashRadius: 30,
    drops: [
      { type: HW_BRIAR_FIBER as BlockType, min: 1, max: 2, chance: 0.6 },
      { type: HW_RESIN as BlockType, min: 1, max: 1, chance: 0.2 },
    ],
  },
  crown_hare: {
    id: 'crown_hare', maxHp: 18, width: 0.6, height: 0.8, speed: 5.5,
    aggroRange: 20, contactDamage: 0, attackCooldown: 1.0, color: 0xc8b898,
    brain: 'crown_hare',
    navigation: {
      width: 0.6, height: 0.8, maxStep: 1, maxJump: 2, maxDrop: 4,
      preferredRange: { min: 4, max: 9 }, acceleration: 10,
      turnRate: 8, jumpImpulse: 8, dropSpeedScale: 0.5,
    },
    canStep: true, leashRadius: 40,
    drops: [
      { type: HW_CROWNWOOD_TWIG as BlockType, min: 1, max: 1, chance: 0.4 },
      { type: HW_MOONLEAF as BlockType, min: 1, max: 1, chance: 0.25 },
      { type: HW_ROOT_HIDE as BlockType, min: 1, max: 1, chance: 0.2 },
    ],
  },
  heartwood_cantor: {
    id: 'heartwood_cantor', maxHp: 26, width: 0.7, height: 1.9, speed: 2.2,
    aggroRange: 22, contactDamage: 0, attackCooldown: 1.0, color: 0xa8a294,
    brain: 'heartwood_cantor',
    navigation: {
      width: 0.7, height: 1.9, maxStep: 1, maxJump: 1, maxDrop: 3,
      preferredRange: { min: 8, max: 14 }, acceleration: 6,
      turnRate: 4, jumpImpulse: 7, dropSpeedScale: 0.5,
    },
    canStep: true, leashRadius: 30,
    drops: [
      { type: HW_RESONANT_SHARD as BlockType, min: 1, max: 1, chance: 0.4 },
      { type: HW_BELL_FLECK as BlockType, min: 1, max: 2, chance: 0.25 },
    ],
  },
  mossback_bailiff: {
    id: 'mossback_bailiff', maxHp: 70, width: 1.1, height: 2.2, speed: 2.8,
    aggroRange: 18, contactDamage: 0, attackCooldown: 1.2, color: 0x4a7a3c,
    brain: 'mossback_bailiff', armored: true, staggerResistance: 0.35,
    navigation: {
      width: 1.1, height: 2.2, maxStep: 1, maxJump: 1, maxDrop: 2,
      preferredRange: { min: 2, max: 4 }, acceleration: 6,
      turnRate: 3.5, jumpImpulse: 7, dropSpeedScale: 0.5,
    },
    canStep: true, leashRadius: 30,
    drops: [
      { type: HW_RESIN as BlockType, min: 1, max: 2, chance: 0.5 },
      { type: HW_BELL_FLECK as BlockType, min: 1, max: 2, chance: 0.4 },
      { type: HW_ROOT_HIDE as BlockType, min: 1, max: 1, chance: 0.3 },
    ],
  },
  field_deer: {
    id: 'field_deer', maxHp: 10, width: 0.7, height: 1.6, speed: 5.0,
    aggroRange: 12, contactDamage: 0, attackCooldown: 1.0, color: 0xc8b898,
    brain: 'field_deer',
    navigation: {
      width: 0.7, height: 1.6, maxStep: 1, maxJump: 1, maxDrop: 3,
      preferredRange: { min: 6, max: 12 }, acceleration: 8,
      turnRate: 6, jumpImpulse: 7, dropSpeedScale: 0.5,
    },
    canStep: true, leashRadius: 60,
    drops: [
      { type: HW_ROOT_HIDE as BlockType, min: 1, max: 2, chance: 0.6 },
      { type: HW_ANTLER_TINE as BlockType, min: 1, max: 1, chance: 0.05 },
    ],
  },
  bellfinch: {
    id: 'bellfinch', maxHp: 6, width: 0.4, height: 0.5, speed: 6.0,
    aggroRange: 8, contactDamage: 0, attackCooldown: 1.0, color: 0x7a9aaa,
    brain: 'bellfinch',
    navigation: {
      width: 0.4, height: 0.5, maxStep: 1, maxJump: 2, maxDrop: 6,
      preferredRange: { min: 4, max: 10 }, acceleration: 10,
      turnRate: 8, jumpImpulse: 8, dropSpeedScale: 0.5,
    },
    canStep: true, leashRadius: 48,
    drops: [
      { type: HW_FEATHER as BlockType, min: 1, max: 2, chance: 0.5 },
    ],
  },
  resin_moth: {
    id: 'resin_moth', maxHp: 4, width: 0.4, height: 0.4, speed: 1.5,
    aggroRange: 6, contactDamage: 0, attackCooldown: 1.0, color: 0xb89878,
    brain: 'resin_moth',
    navigation: {
      width: 0.4, height: 0.4, maxStep: 1, maxJump: 2, maxDrop: 6,
      preferredRange: { min: 2, max: 8 }, acceleration: 6,
      turnRate: 8, jumpImpulse: 8, dropSpeedScale: 0.5,
    },
    canStep: true, leashRadius: 24,
    drops: [
      { type: HW_RESIN as BlockType, min: 1, max: 1, chance: 0.5 },
    ],
  },
};

/** Live adapter: binds brain cores to engine singletons (main thread). */
function liveApi(): BrainApi {
  return {
    steer: (e, x, y, z, dt) => { entityManager.steerEntity(e as Entity, { x, y, z }, dt); },
    halt: (e, dt) => { entityManager.haltEntity(e as Entity, dt); },
    gravity: (e, dt) => { entityManager.applyGravity(e as Entity, dt); },
    move: (e, dt, ledgeGuard) => { entityManager.moveEntity(e as Entity, dt, ledgeGuard); },
    damagePlayer: (amount, kx, kz, source, options) => entityManager.tryDamagePlayer(amount, kx, kz, source, options),
    impulsePlayer: (x, y, z) => { entityManager.impulsePlayer(x, y, z); },
    setDamageMult: (id, mult) => {
      const target = entityManager.getEntity(id);
      if (target) target.damageMultiplier = mult;
    },
    shockwave: (spec) => { entityManager.spawnShockwave(spec); },
    projectile: (spec) => { entityManager.spawnProjectile(spec); },
    sound: (id, pos, opts) => { soundManager.playAt(id, pos, { volume: 0.7, ...(opts ?? {}), fallback: false }); },
    burst: (opts) => {
      particleFx.burst({
        x: opts.x, y: opts.y, z: opts.z, color: opts.color as [number, number, number],
        color2: [1, 1, 1], count: 8, speed: 2.5, upBias: 0.7, spread: 0.6,
        size: 0.07, life: 0.35, gravity: 4, drag: 1.8,
      });
    },
    others: (selfId, kinds, radius, e) => entityManager.getEntities()
      .filter((o) => o.id !== selfId && kinds.includes(o.kind)
        && Math.hypot(o.pos.x - e.pos.x, o.pos.z - e.pos.z) <= radius)
      .map((o) => ({
        id: o.id, kind: o.kind, hp: o.hp,
        x: o.pos.x, y: o.pos.y, z: o.pos.z,
        activeAction: !!o.combatAction && o.combatAction.phase !== 'recovery',
      })),
    surfaceY: (x, z) => getTerrainHeight(x, z),
    night: () => {
      const t = worldManager.getTime() % 24000;
      return t > 12542 && t < 23459;
    },
  };
}

let api: BrainApi | null = null;

function brain(kind: 'furrowling' | 'briar_sentry' | 'crown_hare' | 'heartwood_cantor' | 'mossback_bailiff' | 'field_deer' | 'bellfinch' | 'resin_moth') {
  const ticks = { furrowling: tickFurrowling, briar_sentry: tickSentry, crown_hare: tickHare, heartwood_cantor: tickCantor, mossback_bailiff: tickBailiff, field_deer: tickDeer, bellfinch: tickFinch, resin_moth: tickMoth };
  return (entity: Entity, dt: number, ctx: BrainContext) => {
    if (!api) return;
    ticks[kind](entity, dt, { player: ctx.player, targetable: ctx.targetable }, api);
  };
}

/**
 * Frontal-guard damage path shared by briar_sentry and mossback_bailiff:
 * a raised guard turns frontal hits away, heavy stagger smashes through,
 * flanks stay open. Mirrors the vault guard contract.
 */
function handleFrontalGuard(
  entityId: number,
  amount: number,
  knockX: number,
  knockZ: number,
  stagger: number,
  arcCos: number,
  breakStagger: number,
): 'damaged' | 'blocked' | 'none' {
  const entity = entityManager.getEntity(entityId);
  if (!entity) return 'none';
  const guardUp = entity.combatAction?.id === 'brace' || entity.combatAction?.id === 'hold_ground';
  if (!guardUp) return entityManager.applyStandardDamage(entityId, amount, knockX, knockZ, stagger);
  const len = Math.hypot(knockX, knockZ);
  const dot = len > 1e-6
    ? -(knockX / len) * Math.sin(entity.yaw) - (knockZ / len) * Math.cos(entity.yaw)
    : 1;
  if (dot < arcCos) {
    return entityManager.applyStandardDamage(entityId, amount, knockX, knockZ, stagger);
  }
  if (stagger >= breakStagger) {
    entity.combatAction = undefined;
    entity.knockbackSeconds = Math.max(entity.knockbackSeconds, 0.55);
    soundManager.playAt('block.amethyst.hit', {
      x: entity.pos.x, y: entity.pos.y + entity.height * 0.6, z: entity.pos.z,
    }, { volume: 0.9, pitch: 0.7, fallback: false });
    return entityManager.applyStandardDamage(entityId, amount * 0.6, knockX, knockZ, stagger);
  }
  entity.shieldHitUntil = Date.now() + 180;
  noteFrontalBlock(entityId, Date.now());
  soundManager.playAt('block.amethyst.hit', {
    x: entity.pos.x, y: entity.pos.y + entity.height * 0.6, z: entity.pos.z,
  }, { volume: 0.7, pitch: 1.45, fallback: false });
  particleFx.burst({
    x: entity.pos.x, y: entity.pos.y + entity.height * 0.6, z: entity.pos.z,
    color: [0.62, 0.68, 0.64], color2: [0.82, 0.78, 0.6],
    count: 10, speed: 2.6, upBias: 0.5, spread: 0.5, size: 0.07, life: 0.3, gravity: 3, drag: 2,
  });
  return 'blocked';
}

let registered = false;

/** Register kinds, brains, and guard handlers (main thread, idempotent). */
export function registerHeartwoodEntities(): void {
  if (registered) return;
  registered = true;
  const kinds = ENTITY_KINDS as Record<string, EntityKind>;
  for (const id of HEARTWOOD_KINDS) kinds[id] = KIND_DEFS[id];
  api = liveApi();
  entityManager.registerBrain('furrowling', brain('furrowling'));
  entityManager.registerBrain('briar_sentry', brain('briar_sentry'));
  entityManager.registerBrain('crown_hare', brain('crown_hare'));
  entityManager.registerBrain('heartwood_cantor', brain('heartwood_cantor'));
  entityManager.registerBrain('mossback_bailiff', brain('mossback_bailiff'));
  entityManager.registerBrain('field_deer', brain('field_deer'));
  entityManager.registerBrain('bellfinch', brain('bellfinch'));
  entityManager.registerBrain('resin_moth', brain('resin_moth'));
  entityManager.registerDamageHandler('briar_sentry', (id, amount, kx, kz, stagger) => (
    handleFrontalGuard(id, amount, kx, kz, stagger, SENTRY_GUARD_ARC_COS, 1.0)
  ));
  entityManager.registerDamageHandler('mossback_bailiff', (id, amount, kx, kz, stagger) => (
    handleFrontalGuard(id, amount, kx, kz, stagger, BAILIFF_GUARD_ARC_COS, 1.2)
  ));
  const offDeath = gameEvents.on('entity:died', ({ entityId }) => clearBrain(entityId));
  void offDeath;
}

export function resetHeartwoodEntitiesForTests(): void {
  registered = false;
}
