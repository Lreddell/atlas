// Heartwood brain cores: pure decision + movement logic for ordinary
// hostiles, the elite, and passives. No singletons, no three.js, no DOM:
// every world interaction flows through BrainApi (injected), so the full
// move-by-move behavior runs headlessly in node tests.
//
// Entity access is POJO-compatible (pos/vel/yaw fields, no Vector3 methods)
// so fakes stay trivial. Physics application (gravity/move) goes through the
// api, which the live adapter binds to EntityManager helpers.

import type { Entity } from '../entities/Entity';
import type { PlayerHitSource } from '../entities/EntityManager';

export type EntityLike = Pick<
  Entity,
  | 'id' | 'kind' | 'pos' | 'vel' | 'width' | 'height' | 'hp' | 'yaw'
  | 'grounded' | 'aggro' | 'hurtUntil' | 'attackCooldown' | 'knockbackSeconds'
  | 'home' | 'combatAction'
>;

export interface BrainPlayer {
  x: number;
  y: number;
  z: number;
}

export interface BrainCtx {
  player: BrainPlayer | null;
  targetable: boolean;
}

export interface NearbyEntry {
  id: number;
  kind: string;
  hp: number;
  x: number;
  y: number;
  z: number;
  activeAction: boolean;
}

export interface BrainApi {
  steer(e: EntityLike, x: number, y: number, z: number, dt: number): void;
  halt(e: EntityLike, dt: number): void;
  gravity(e: EntityLike, dt: number): void;
  move(e: EntityLike, dt: number, ledgeGuard: boolean): void;
  damagePlayer(amount: number, kx: number, kz: number, source: PlayerHitSource, options?: { guardable?: boolean }): boolean;
  impulsePlayer(x: number, y: number, z: number): void;
  setDamageMult(entityId: number, mult: number): void;
  shockwave(spec: { sourceId?: number; x: number; y: number; z: number; polarity: number; maxRadius: number; speed: number; damage: number; kind: 'slam' | 'polarity'; radius?: number }): void;
  projectile(spec: { x: number; y: number; z: number; vx: number; vy: number; vz: number; ttl: number; damage: number; polarity: number; sourceId?: number; kind?: 'volley' | 'spiral'; homing?: number }): void;
  sound(id: string, pos: { x: number; y: number; z: number }, opts?: { volume?: number; pitch?: number }): void;
  burst(opts: { x: number; y: number; z: number; color: number[] }): void;
  others(selfId: number, kinds: string[], radius: number, e: EntityLike): NearbyEntry[];
  surfaceY(x: number, z: number): number;
  night(): boolean;
}

export interface BrainMem {
  state: string;
  phase: string;
  t: number;
  time: number;
  cooldowns: Record<string, number>;
  data: Record<string, number>;
  pending: { x: number; z: number; at: number }[];
}

const memories = new Map<number, BrainMem>();

export function memFor(id: number): BrainMem {
  let mem = memories.get(id);
  if (!mem) {
    mem = { state: 'idle', phase: 'idle', t: 0, time: 0, cooldowns: {}, data: {}, pending: [] };
    memories.set(id, mem);
  }
  return mem;
}

export function clearBrain(id: number): void {
  memories.delete(id);
}

export function resetBrainsForTests(): void {
  memories.clear();
}

export interface AttackDef {
  id: string;
  anticipation: number;
  active: number;
  recovery: number;
}

/** Advance one authored attack cycle; fires onActive once on active entry. */
export function runAttack(
  e: EntityLike,
  mem: BrainMem,
  dt: number,
  attack: AttackDef,
  onActive: () => void,
): boolean {
  mem.t += dt;
  const a = attack.anticipation;
  const b = a + attack.active;
  const c = b + attack.recovery;
  const phase = mem.t < a ? 'anticipation' : mem.t < b ? 'active' : 'recovery';
  const entered = mem.phase !== phase;
  mem.phase = phase;
  e.combatAction = {
    id: attack.id, phase, elapsed: mem.t, duration: c, locksMovement: phase !== 'recovery', targetYaw: e.yaw,
  };
  if (phase === 'active' && entered) onActive();
  if (mem.t >= c) {
    mem.t = 0;
    mem.phase = 'idle';
    mem.state = 'idle';
    e.combatAction = undefined;
    return true;
  }
  return false;
}

export function facePlayer(e: EntityLike, dx: number, dz: number): void {
  e.yaw = Math.atan2(dx, dz);
}

/** Standard tail: gravity + ledge-safe move. Brains set vel first. */
export function physics(e: EntityLike, api: BrainApi, dt: number): void {
  api.gravity(e, dt);
  api.move(e, dt, true);
}

function dist2D(ax: number, az: number, bx: number, bz: number): number {
  return Math.hypot(ax - bx, az - bz);
}

/** True when a packmate runs an active attack cycle nearby (charge token). */
function packmateActive(api: BrainApi, e: EntityLike, kinds: string[], radius: number): boolean {
  return api.others(e.id, kinds, radius, e).some((o) => o.activeAction && o.hp > 0);
}

function touchDamage(
  e: EntityLike, api: BrainApi, ctx: BrainCtx, amount: number, cooldown: number,
): void {
  if (!ctx.player || !ctx.targetable || e.attackCooldown > 0) return;
  const d = dist2D(e.pos.x, e.pos.z, ctx.player.x, ctx.player.z);
  if (d < e.width * 0.5 + 0.9 && Math.abs(ctx.player.y - e.pos.y) < e.height + 1) {
    const kx = ctx.player.x - e.pos.x;
    const kz = ctx.player.z - e.pos.z;
    if (api.damagePlayer(amount, kx, kz, 'contact')) e.attackCooldown = cooldown;
  }
}

// --- Furrowling: commit/recovery pursuer with a pack charge token ---

export const FURROWLING_RUSH = { id: 'furrow_rush', anticipation: 0.45, active: 1.4, recovery: 0.8 };
export const FURROWLING_RAKE = { id: 'side_rake', anticipation: 0.3, active: 0.25, recovery: 0.6 };
export const FURROWLING_KICK = { id: 'dirt_kick', anticipation: 0.3, active: 0.15, recovery: 0.5 };

export function tickFurrowling(e: EntityLike, dt: number, ctx: BrainCtx, api: BrainApi): void {
  const mem = memFor(e.id);
  mem.time += dt;
  for (const key of Object.keys(mem.cooldowns)) mem.cooldowns[key] = Math.max(0, mem.cooldowns[key] - dt);
  e.attackCooldown = Math.max(0, e.attackCooldown - dt);
  const player = ctx.player && ctx.targetable ? ctx.player : null;
  if (!player) {
    e.aggro = false;
    e.combatAction = undefined;
    api.halt(e, dt);
    physics(e, api, dt);
    return;
  }
  const dx = player.x - e.pos.x;
  const dz = player.z - e.pos.z;
  const dist = Math.hypot(dx, dz);
  if (dist > 18) {
    e.aggro = false;
    e.combatAction = undefined;
    api.halt(e, dt);
    physics(e, api, dt);
    return;
  }
  e.aggro = true;
  facePlayer(e, dx, dz);

  if (mem.state === 'charge') {
    // Committed run: fixed heading, no steering (dodgeable by sidestep).
    // Slamming into a wall/ridge ends the run head-stuck: long opening.
    const done = runAttack(e, mem, dt, FURROWLING_RUSH, () => {
      api.sound('vault.enemy.hound_leap', e.pos, { volume: 0.7 });
    });
    const speed = Math.hypot(e.vel.x, e.vel.z);
    if (mem.phase === 'active' && speed < 1.5 && mem.data.struck !== 1) {
      mem.data.stuck = 1;
      mem.t = FURROWLING_RUSH.anticipation + FURROWLING_RUSH.active;
      api.burst({ x: e.pos.x, y: e.pos.y + 0.5, z: e.pos.z, color: [0.5, 0.4, 0.3] });
      api.sound('block.stone.land', e.pos, { volume: 0.8 });
    }
    if (dist < 1.4 && mem.data.struck !== 1) {
      mem.data.struck = 1;
      api.damagePlayer(4, dx, dz, 'attack');
      e.vel.x *= 0.15;
      e.vel.z *= 0.15;
      api.burst({ x: e.pos.x, y: e.pos.y + 0.5, z: e.pos.z, color: [0.5, 0.4, 0.3] });
    }
    physics(e, api, dt);
    if (done) {
      mem.cooldowns.rush = mem.data.stuck === 1 ? 3.5 : 2.2;
      mem.data.struck = 0;
      mem.data.stuck = 0;
    }
    return;
  }
  if (mem.state === 'rake' || mem.state === 'kick') {
    const attackId = mem.state;
    const attack = attackId === 'rake' ? FURROWLING_RAKE : FURROWLING_KICK;
    const finished = runAttack(e, mem, dt, attack, () => {
      const behind = (dx * -Math.sin(e.yaw) + dz * -Math.cos(e.yaw)) < -0.3;
      if (attackId === 'rake' || behind) {
        api.damagePlayer(attackId === 'rake' ? 3 : 2, dx, dz, 'attack');
      }
    });
    api.halt(e, dt);
    physics(e, api, dt);
    if (finished) mem.cooldowns[attackId] = attackId === 'rake' ? 1.6 : 4;
    return;
  }
  // Decide: charge (token-gated), rake (close flank), kick (rear hug).
  e.combatAction = undefined;
  const toPlayerBehind = (dx * -Math.sin(e.yaw) + dz * -Math.cos(e.yaw)) < -0.3;
  if (dist < 3 && toPlayerBehind && (mem.cooldowns.kick ?? 0) <= 0 && dist < 2.2) {
    mem.state = 'kick';
    mem.t = 0;
    mem.phase = 'idle';
    return;
  }
  if (dist < 2.8 && (mem.cooldowns.rake ?? 0) <= 0) {
    mem.state = 'rake';
    mem.t = 0;
    mem.phase = 'idle';
    return;
  }
  if (dist >= 3 && dist < 16 && (mem.cooldowns.rush ?? 0) <= 0
    && !packmateActive(api, e, ['furrowling'], 14)) {
    mem.state = 'charge';
    mem.t = 0;
    mem.phase = 'idle';
    mem.data.struck = 0;
    // Commit heading at anticipation start; the run itself never steers.
    const len = dist || 1;
    e.vel.x = (dx / len) * 9;
    e.vel.z = (dz / len) * 9;
    api.sound('vault.enemy.hound_leap', e.pos, { volume: 0.5, pitch: 1.2 });
    return;
  }
  // Circle while waiting for the token or cooldowns.
  if (dist > 3.2) {
    api.steer(e, player.x, player.y, player.z, dt);
  } else {
    api.halt(e, dt);
  }
  touchDamage(e, api, ctx, 2, 1.0);
  physics(e, api, dt);
}

// --- Briar Sentry: frontal guard teacher ---

export const SENTRY_JAB = { id: 'pruning_jab', anticipation: 0.5, active: 0.2, recovery: 0.65 };
export const SENTRY_PRESS = { id: 'shield_press', anticipation: 0.4, active: 0.5, recovery: 0.7 };
export const SENTRY_RETORT = { id: 'thorn_retort', anticipation: 0.45, active: 0.2, recovery: 0.6 };
export const SENTRY_GUARD_ARC_COS = Math.cos(Math.PI * 0.41);

export function sentryFrontal(yaw: number, kx: number, kz: number): boolean {
  const len = Math.hypot(kx, kz);
  if (len < 1e-6) return true;
  // Knock points attacker -> entity, so the attacker sits opposite it.
  const dot = -(kx / len) * Math.sin(yaw) - (kz / len) * Math.cos(yaw);
  return dot >= SENTRY_GUARD_ARC_COS;
}

export function tickSentry(e: EntityLike, dt: number, ctx: BrainCtx, api: BrainApi): void {
  const mem = memFor(e.id);
  mem.time += dt;
  for (const key of Object.keys(mem.cooldowns)) mem.cooldowns[key] = Math.max(0, mem.cooldowns[key] - dt);
  e.attackCooldown = Math.max(0, e.attackCooldown - dt);
  const player = ctx.player && ctx.targetable ? ctx.player : null;
  if (!player) {
    e.aggro = false;
    e.combatAction = undefined;
    api.halt(e, dt);
    physics(e, api, dt);
    return;
  }
  const dx = player.x - e.pos.x;
  const dz = player.z - e.pos.z;
  const dist = Math.hypot(dx, dz);
  if (dist > 16) {
    e.aggro = false;
    e.combatAction = undefined;
    api.halt(e, dt);
    physics(e, api, dt);
    return;
  }
  e.aggro = true;
  facePlayer(e, dx, dz);

  if (mem.state === 'retort' || mem.state === 'jab' || mem.state === 'press') {
    const attackId = mem.state;
    const attack = attackId === 'retort' ? SENTRY_RETORT : attackId === 'jab' ? SENTRY_JAB : SENTRY_PRESS;
    const finished = runAttack(e, mem, dt, attack, () => {
      if (dist < (attackId === 'press' ? 2.6 : 3.0)) {
        api.damagePlayer(attackId === 'press' ? 2 : 3, dx, dz, 'attack');
        api.sound('vault.enemy.guard_swing', e.pos, { volume: 0.7 });
      }
    });
    if (attackId === 'press') {
      // Two advancing steps during the press.
      api.steer(e, player.x, player.y, player.z, dt);
    } else {
      api.halt(e, dt);
    }
    physics(e, api, dt);
    if (finished) mem.cooldowns[attackId] = 1.4;
    return;
  }
  // Hold the lane: brace (guard up) while the player is frontal and close.
  const frontal = sentryFrontal(e.yaw, -dx, -dz);
  if (dist < 4 && frontal && (mem.cooldowns.brace ?? 0) <= 0) {
    e.combatAction = { id: 'brace', phase: 'anticipation', elapsed: 0, duration: 2.0, locksMovement: true, targetYaw: e.yaw };
    api.halt(e, dt);
    physics(e, api, dt);
    mem.data.braceT = (mem.data.braceT ?? 0) + dt;
    if (mem.data.braceT > 2.0) {
      mem.data.braceT = 0;
      e.combatAction = undefined;
      mem.cooldowns.brace = 3;
    }
    return;
  }
  mem.data.braceT = 0;
  e.combatAction = undefined;
  if (dist < 3.0 && (mem.cooldowns.jab ?? 0) <= 0) {
    mem.state = 'jab';
    mem.t = 0;
    mem.phase = 'idle';
    return;
  }
  if (dist < 6 && (mem.cooldowns.press ?? 0) <= 0) {
    mem.state = 'press';
    mem.t = 0;
    mem.phase = 'idle';
    return;
  }
  if (dist > 2.6) api.steer(e, player.x, player.y, player.z, dt);
  else api.halt(e, dt);
  touchDamage(e, api, ctx, 2, 1.0);
  physics(e, api, dt);
}

/** Called by the sentry/bailiff damage handlers on a frontal blocked hit. */
export function noteFrontalBlock(entityId: number, nowMs: number): number {
  const mem = memFor(entityId);
  const windowStart = mem.data.blockWindowStart ?? -1e9;
  let count = mem.data.blockCount ?? 0;
  if (nowMs - windowStart > 4000) count = 0;
  count += 1;
  mem.data.blockWindowStart = nowMs;
  mem.data.blockCount = count;
  return count;
}

// --- Crown Hare: jumpable lines and lateral pressure ---

export const HARE_SWEEP = { id: 'root_sweep', anticipation: 0.4, active: 0.3, recovery: 0.6 };
export const HARE_FLICK = { id: 'leaf_flick', anticipation: 0.35, active: 0.15, recovery: 0.5 };

export function tickHare(e: EntityLike, dt: number, ctx: BrainCtx, api: BrainApi): void {
  const mem = memFor(e.id);
  mem.time += dt;
  for (const key of Object.keys(mem.cooldowns)) mem.cooldowns[key] = Math.max(0, mem.cooldowns[key] - dt);
  e.attackCooldown = Math.max(0, e.attackCooldown - dt);
  const player = ctx.player && ctx.targetable ? ctx.player : null;
  if (!player) {
    e.aggro = false;
    e.combatAction = undefined;
    api.halt(e, dt);
    physics(e, api, dt);
    return;
  }
  const dx = player.x - e.pos.x;
  const dz = player.z - e.pos.z;
  const dist = Math.hypot(dx, dz);
  if (dist > 20) {
    e.aggro = false;
    e.combatAction = undefined;
    api.halt(e, dt);
    physics(e, api, dt);
    return;
  }
  e.aggro = true;
  facePlayer(e, dx, dz);

  if (mem.state === 'sweep' || mem.state === 'flick') {
    const attackId = mem.state;
    const attack = attackId === 'sweep' ? HARE_SWEEP : HARE_FLICK;
    const finished = runAttack(e, mem, dt, attack, () => {
      if (attackId === 'sweep') {
        api.shockwave({
          sourceId: e.id, x: e.pos.x, y: e.pos.y + 0.2, z: e.pos.z, polarity: 0,
          maxRadius: 6, speed: 7, damage: 3, kind: 'slam', radius: 0.5,
        });
        api.sound('vault.enemy.hound_land', e.pos, { volume: 0.7 });
      } else {
        const len = dist || 1;
        api.projectile({
          sourceId: e.id, x: e.pos.x, y: e.pos.y + 1, z: e.pos.z,
          vx: (dx / len) * 15, vy: 0.5, vz: (dz / len) * 15,
          ttl: 2, damage: 1, polarity: 0,
        });
        api.sound('vault.enemy.marksman_fire', e.pos, { volume: 0.5, pitch: 1.6 });
      }
    });
    api.halt(e, dt);
    physics(e, api, dt);
    if (finished) {
      mem.cooldowns[attackId] = attackId === 'sweep' ? 2.4 : 1.2;
      if (attackId === 'sweep') {
        // Retreat to cover after the combo: back off, then reassess.
        mem.state = 'retreat';
        mem.t = 0;
        mem.phase = 'idle';
        e.combatAction = undefined;
        return;
      }
    }
    return;
  }
  if (mem.state === 'bound') {
    // Visible leap with a landing, never a teleport.
    mem.t += dt;
    if (mem.t > 0.7) {
      mem.state = 'idle';
      mem.t = 0;
      mem.cooldowns.bound = 2.0;
    }
    physics(e, api, dt);
    return;
  }
  if (mem.state === 'retreat') {
    mem.t += dt;
    const len = dist || 1;
    e.vel.x = (-dx / len) * 5;
    e.vel.z = (-dz / len) * 5;
    physics(e, api, dt);
    if (mem.t > 1.2 || dist > 10) {
      mem.state = 'idle';
      mem.t = 0;
    }
    return;
  }
  e.combatAction = undefined;
  if (dist < 7 && (mem.cooldowns.sweep ?? 0) <= 0) {
    mem.state = 'sweep';
    mem.t = 0;
    mem.phase = 'idle';
    return;
  }
  if (dist >= 6 && (mem.cooldowns.flick ?? 0) <= 0 && (mem.data.flicks ?? 0) < 3) {
    mem.state = 'flick';
    mem.t = 0;
    mem.phase = 'idle';
    mem.data.flicks = (mem.data.flicks ?? 0) + 1;
    return;
  }
  if (dist >= 6 && (mem.cooldowns.bound ?? 0) <= 0) {
    // Bound through: leap toward the player's flank.
    mem.state = 'bound';
    mem.t = 0;
    mem.phase = 'idle';
    mem.data.flicks = 0;
    const len = dist || 1;
    e.vel.x = (dx / len) * 8;
    e.vel.z = (dz / len) * 8;
    e.vel.y = 5;
    api.sound('vault.enemy.hound_leap', e.pos, { volume: 0.6, pitch: 1.4 });
    return;
  }
  if (dist > 3) api.steer(e, player.x, player.y, player.z, dt);
  else api.halt(e, dt);
  touchDamage(e, api, ctx, 1, 1.0);
  physics(e, api, dt);
}

// --- Heartwood Cantor: reflectable support ---

export const CANTOR_PULSE = { id: 'tone_pulse', anticipation: 0.6, active: 0.2, recovery: 0.8 };
export const CANTOR_PUSH = { id: 'resonant_push', anticipation: 0.4, active: 0.2, recovery: 0.6 };
export const CANTOR_HOLD = { id: 'channel_hold', anticipation: 0.5, active: 3.0, recovery: 0.5 };

export function tickCantor(e: EntityLike, dt: number, ctx: BrainCtx, api: BrainApi): void {
  const mem = memFor(e.id);
  mem.time += dt;
  for (const key of Object.keys(mem.cooldowns)) mem.cooldowns[key] = Math.max(0, mem.cooldowns[key] - dt);
  e.attackCooldown = Math.max(0, e.attackCooldown - dt);
  const player = ctx.player && ctx.targetable ? ctx.player : null;
  if (!player) {
    e.aggro = false;
    e.combatAction = undefined;
    endCantorChannel(e, mem, api);
    api.halt(e, dt);
    physics(e, api, dt);
    return;
  }
  const dx = player.x - e.pos.x;
  const dz = player.z - e.pos.z;
  const dist = Math.hypot(dx, dz);
  if (dist > 22) {
    e.aggro = false;
    e.combatAction = undefined;
    endCantorChannel(e, mem, api);
    api.halt(e, dt);
    physics(e, api, dt);
    return;
  }
  e.aggro = true;
  facePlayer(e, dx, dz);

  if (mem.state === 'hold') {
    // Interruptible support channel: any real stagger breaks it.
    if (e.knockbackSeconds > 0.25) {
      endCantorChannel(e, mem, api);
      mem.state = 'idle';
      mem.t = 0;
      mem.phase = 'idle';
      e.combatAction = undefined;
      mem.cooldowns.hold = 5;
      return;
    }
    const finished = runAttack(e, mem, dt, CANTOR_HOLD, () => undefined);
    // Pulse the buff while channeling: allies hit 25% harder, restored on end.
    for (const ally of api.others(e.id, ['furrowling', 'briar_sentry', 'crown_hare', 'mossback_bailiff'], 12, e)) {
      if (ally.hp > 0 && mem.data[`buff_${ally.id}`] !== 1) {
        mem.data[`buff_${ally.id}`] = 1;
        api.setDamageMult(ally.id, 1.25);
      }
    }
    api.halt(e, dt);
    physics(e, api, dt);
    if (finished) {
      endCantorChannel(e, mem, api);
      mem.cooldowns.hold = 6;
    }
    return;
  }
  if (mem.state === 'pulse' || mem.state === 'push') {
    const attackId = mem.state;
    const attack = attackId === 'pulse' ? CANTOR_PULSE : CANTOR_PUSH;
    const finished = runAttack(e, mem, dt, attack, () => {
      if (attackId === 'pulse') {
        const len = dist || 1;
        api.projectile({
          x: e.pos.x, y: e.pos.y + 1.4, z: e.pos.z,
          vx: (dx / len) * 7, vy: 0, vz: (dz / len) * 7,
          ttl: 5, damage: 4, polarity: 0, sourceId: e.id, kind: 'volley',
        });
        api.sound('vault.enemy.marksman_fire', e.pos, { volume: 0.65, pitch: 0.8 });
      } else {
        if (dist < 4.5) {
          const len = dist || 1;
          api.damagePlayer(2, dx / len, dz / len, 'attack');
          api.impulsePlayer((dx / len) * 6, 2, (dz / len) * 6);
        }
        api.sound('vault.enemy.tollkeeper_windup', e.pos, { volume: 0.6, pitch: 1.3 });
      }
    });
    api.halt(e, dt);
    physics(e, api, dt);
    if (finished) mem.cooldowns[attackId] = attackId === 'pulse' ? 3.5 : 2.5;
    return;
  }
  e.combatAction = undefined;
  // Hold the support line: back away when crowded, close in when far.
  if (dist < 6) {
    const len = dist || 1;
    e.vel.x = (-dx / len) * 2.2;
    e.vel.z = (-dz / len) * 2.2;
  } else if (dist > 14) {
    api.steer(e, player.x, player.y, player.z, dt);
  } else {
    api.halt(e, dt);
  }
  if ((mem.cooldowns.pulse ?? 0) <= 0 && dist < 18) {
    mem.state = 'pulse';
    mem.t = 0;
    mem.phase = 'idle';
    return;
  }
  if (dist < 4.5 && (mem.cooldowns.push ?? 0) <= 0) {
    mem.state = 'push';
    mem.t = 0;
    mem.phase = 'idle';
    return;
  }
  const alliesNear = api.others(e.id, ['furrowling', 'briar_sentry', 'crown_hare', 'mossback_bailiff'], 12, e)
    .some((o) => o.hp > 0);
  if (alliesNear && (mem.cooldowns.hold ?? 0) <= 0) {
    mem.state = 'hold';
    mem.t = 0;
    mem.phase = 'idle';
    return;
  }
  touchDamage(e, api, ctx, 1, 1.0);
  physics(e, api, dt);
}

function endCantorChannel(e: EntityLike, mem: BrainMem, api: BrainApi): void {
  void e;
  for (const key of Object.keys(mem.data)) {
    if (!key.startsWith('buff_')) continue;
    const id = Number(key.slice(5));
    if (Number.isFinite(id)) api.setDamageMult(id, 1);
    delete mem.data[key];
  }
}

// --- Mossback Bailiff (elite): guard + interrupt combo ---

export const BAILIFF_EDGE = { id: 'shield_edge', anticipation: 0.4, active: 0.2, recovery: 0.4 };
export const BAILIFF_CUT = { id: 'bailiff_cut', anticipation: 0.3, active: 0.2, recovery: 0.45 };
export const BAILIFF_HEAVY = { id: 'bailiff_heavy', anticipation: 0.7, active: 0.25, recovery: 0.9 };
export const BAILIFF_WRIT = { id: 'root_writ', anticipation: 1.0, active: 0.2, recovery: 0.7 };
export const BAILIFF_EVICT = { id: 'shoulder_evict', anticipation: 0.3, active: 0.2, recovery: 0.8 };
export const BAILIFF_GUARD_ARC_COS = Math.cos(Math.PI * 0.41);

export function tickBailiff(e: EntityLike, dt: number, ctx: BrainCtx, api: BrainApi): void {
  const mem = memFor(e.id);
  mem.time += dt;
  for (const key of Object.keys(mem.cooldowns)) mem.cooldowns[key] = Math.max(0, mem.cooldowns[key] - dt);
  e.attackCooldown = Math.max(0, e.attackCooldown - dt);
  const player = ctx.player && ctx.targetable ? ctx.player : null;
  if (!player) {
    e.aggro = false;
    e.combatAction = undefined;
    api.halt(e, dt);
    physics(e, api, dt);
    return;
  }
  const dx = player.x - e.pos.x;
  const dz = player.z - e.pos.z;
  const dist = Math.hypot(dx, dz);
  if (dist > 18) {
    e.aggro = false;
    e.combatAction = undefined;
    api.halt(e, dt);
    physics(e, api, dt);
    return;
  }
  e.aggro = true;
  facePlayer(e, dx, dz);
  // Delayed root spikes fire on schedule regardless of current action.
  drainPendingRoots(e, mem, api);

  if (mem.state === 'writ') {
    // Interruptible cast: posture damage cancels it outright.
    if (e.knockbackSeconds > 0.2) {
      e.combatAction = undefined;
      mem.state = 'idle';
      mem.t = 0;
      mem.phase = 'idle';
      mem.cooldowns.writ = 4;
      api.sound('block.amethyst.hit', e.pos, { volume: 0.7, pitch: 0.9 });
      api.halt(e, dt);
      physics(e, api, dt);
      return;
    }
    const finished = runAttack(e, mem, dt, BAILIFF_WRIT, () => {
      mem.pending.push(
        { x: player.x, z: player.z, at: mem.time + 0.8 },
        { x: player.x - dx * 0.3, z: player.z - dz * 0.3, at: mem.time + 1.0 },
      );
      api.sound('vault.enemy.tollkeeper_windup', e.pos, { volume: 0.8, pitch: 0.7 });
    });
    api.halt(e, dt);
    physics(e, api, dt);
    if (finished) mem.cooldowns.writ = 5;
  } else if (mem.state === 'edge' || mem.state === 'cut' || mem.state === 'heavy' || mem.state === 'evict') {
    const attackId = mem.state;
    const attack = attackId === 'edge' ? BAILIFF_EDGE : attackId === 'cut' ? BAILIFF_CUT : attackId === 'heavy' ? BAILIFF_HEAVY : BAILIFF_EVICT;
    const finished = runAttack(e, mem, dt, attack, () => {
      const reach = attackId === 'heavy' ? 3.2 : 2.6;
      if (dist < reach) {
        const dmg = attackId === 'heavy' ? 7 : attackId === 'evict' ? 2 : 3;
        const guardable = attackId !== 'evict';
        api.damagePlayer(dmg, dx, dz, 'attack', guardable ? undefined : { guardable: false });
        if (attackId === 'evict') api.impulsePlayer(dx * 2, 2, dz * 2);
        api.sound('vault.enemy.tollkeeper_impact', e.pos, { volume: 0.8 });
      }
    });
    if (attackId === 'edge' || attackId === 'cut') api.steer(e, player.x, player.y, player.z, dt);
    else api.halt(e, dt);
    physics(e, api, dt);
    if (finished) {
      if (attackId === 'edge') {
        mem.state = 'cut';
        mem.t = 0;
        mem.phase = 'idle';
      } else {
        mem.cooldowns.string = 2.6;
        if (attackId === 'heavy' || attackId === 'evict') mem.cooldowns[attackId] = 4;
      }
    }
    drainPendingRoots(e, mem, api);
    return;
  } else {
    // Hold Ground brace while the player is frontal and close.
    const frontal = sentryFrontal(e.yaw, -dx, -dz);
    if (dist < 4 && frontal && (mem.cooldowns.brace ?? 0) <= 0) {
      e.combatAction = { id: 'hold_ground', phase: 'anticipation', elapsed: 0, duration: 2.5, locksMovement: true, targetYaw: e.yaw };
      api.halt(e, dt);
      physics(e, api, dt);
      mem.data.braceT = (mem.data.braceT ?? 0) + dt;
      if (mem.data.braceT > 2.5) {
        mem.data.braceT = 0;
        e.combatAction = undefined;
        mem.cooldowns.brace = 4;
      }
      drainPendingRoots(e, mem, api);
      return;
    }
    mem.data.braceT = 0;
    e.combatAction = undefined;
    const crowded = api.others(e.id, ['furrowling', 'briar_sentry', 'crown_hare', 'heartwood_cantor', 'mossback_bailiff'], 3, e)
      .some((o) => o.hp > 0);
    if (dist < 2.2 && crowded && (mem.cooldowns.evict ?? 0) <= 0) {
      mem.state = 'evict';
      mem.t = 0;
      mem.phase = 'idle';
      return;
    }
    if (dist < 3.2 && (mem.cooldowns.string ?? 0) <= 0) {
      mem.state = 'edge';
      mem.t = 0;
      mem.phase = 'idle';
      return;
    }
    if (dist < 8 && (mem.cooldowns.writ ?? 0) <= 0) {
      mem.state = 'writ';
      mem.t = 0;
      mem.phase = 'idle';
      return;
    }
    if (dist > 2.8) api.steer(e, player.x, player.y, player.z, dt);
    else api.halt(e, dt);
    touchDamage(e, api, ctx, 3, 1.2);
    physics(e, api, dt);
  }
  drainPendingRoots(e, mem, api);
}

/** Fire due root spikes (delayed, bounded, jumpable). */
function drainPendingRoots(e: EntityLike, mem: BrainMem, api: BrainApi): void {
  if (mem.pending.length === 0) return;
  const due = mem.pending.filter((p) => mem.time >= p.at);
  mem.pending = mem.pending.filter((p) => mem.time < p.at);
  for (const p of due) {
    api.shockwave({
      sourceId: e.id, x: p.x, y: e.pos.y, z: p.z, polarity: 0,
      maxRadius: 5, speed: 7, damage: 5, kind: 'slam', radius: 0.5,
    });
    api.sound('vault.enemy.tollkeeper_impact', { x: p.x, y: e.pos.y, z: p.z }, { volume: 0.8, pitch: 0.6 });
  }
}

// --- Passives ---

export function tickDeer(e: EntityLike, dt: number, ctx: BrainCtx, api: BrainApi): void {
  const mem = memFor(e.id);
  mem.time += dt;
  const player = ctx.player;
  e.combatAction = undefined;
  const dist = player ? dist2D(e.pos.x, e.pos.z, player.x, player.z) : Infinity;
  if (dist < 10) {
    // Flee along open ground, keep fleeing briefly after losing sight.
    e.aggro = true;
    mem.data.fleeT = 2.0;
    const dx = e.pos.x - (player?.x ?? e.pos.x);
    const dz = e.pos.z - (player?.z ?? e.pos.z);
    const len = Math.hypot(dx, dz) || 1;
    facePlayer(e, dx, dz);
    e.vel.x = (dx / len) * 5;
    e.vel.z = (dz / len) * 5;
  } else if ((mem.data.fleeT ?? 0) > 0) {
    mem.data.fleeT = Math.max(0, (mem.data.fleeT ?? 0) - dt);
  } else {
    e.aggro = false;
    // Graze: occasional slow step.
    mem.data.stepT = (mem.data.stepT ?? 0) + dt;
    if (mem.data.stepT > 4) {
      mem.data.stepT = 0;
      const a = ((e.id * 37 + Math.floor(mem.time)) % 628) / 100;
      e.vel.x = Math.cos(a) * 1.2;
      e.vel.z = Math.sin(a) * 1.2;
      facePlayer(e, e.vel.x, e.vel.z);
    } else {
      e.vel.x *= 0.9;
      e.vel.z *= 0.9;
    }
  }
  physics(e, api, dt);
}

export function tickFinch(e: EntityLike, dt: number, ctx: BrainCtx, api: BrainApi): void {
  const mem = memFor(e.id);
  mem.time += dt;
  const player = ctx.player;
  e.combatAction = undefined;
  if (mem.state === 'fly') {
    mem.t += dt;
    const tx = mem.data.tx ?? e.pos.x;
    const tz = mem.data.tz ?? e.pos.z;
    const dx = tx - e.pos.x;
    const dz = tz - e.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 1 || mem.t > 3) {
      mem.state = 'idle';
      mem.t = 0;
      e.vel.x = 0;
      e.vel.z = 0;
      e.vel.y = 0;
    } else {
      e.vel.x = (dx / d) * 7;
      e.vel.z = (dz / d) * 7;
      e.vel.y = Math.max(-1, Math.min(2, (mem.data.ty ?? e.pos.y) - e.pos.y));
      facePlayer(e, dx, dz);
    }
    api.move(e, dt, false);
    return;
  }
  e.vel.x *= 0.8;
  e.vel.z *= 0.8;
  if (player && dist2D(e.pos.x, e.pos.z, player.x, player.z) < 6) {
    // Take flight to a nearby perch: deterministic pick from the clock.
    const a = ((e.id * 53 + Math.floor(mem.time * 2)) % 628) / 100;
    const d = 8 + ((e.id * 29 + Math.floor(mem.time)) % 8);
    const tx = e.pos.x + Math.cos(a) * d;
    const tz = e.pos.z + Math.sin(a) * d;
    mem.data.tx = tx;
    mem.data.tz = tz;
    mem.data.ty = api.surfaceY(tx, tz) + 4;
    mem.state = 'fly';
    mem.t = 0;
    api.sound('block.grass.step', e.pos, { volume: 0.4, pitch: 1.8 });
  }
  physics(e, api, dt);
}

export function tickMoth(e: EntityLike, dt: number, _ctx: BrainCtx, api: BrainApi): void {
  const mem = memFor(e.id);
  mem.time += dt;
  e.combatAction = undefined;
  const active = api.night();
  const home = e.home ?? e.pos;
  // A landed hit startles it into a fast dart.
  const startled = Date.now() < e.hurtUntil;
  const radius = active ? 12 : 6;
  const dx = home.x - e.pos.x;
  const dz = home.z - e.pos.z;
  const homeDist = Math.hypot(dx, dz);
  const speed = startled ? 4.5 : 1.5;
  if (homeDist > radius) {
    const len = homeDist || 1;
    e.vel.x = (dx / len) * 2;
    e.vel.z = (dz / len) * 2;
  } else {
    mem.data.stepT = (mem.data.stepT ?? 0) + dt;
    if (mem.data.stepT > 2.5) {
      mem.data.stepT = 0;
      const a = ((e.id * 71 + Math.floor(mem.time * 3)) % 628) / 100;
      e.vel.x = Math.cos(a) * speed;
      e.vel.z = Math.sin(a) * speed;
    }
  }
  e.vel.y = Math.sin(mem.time * 3 + e.id) * 0.8;
  facePlayer(e, e.vel.x || 0.01, e.vel.z || 0.01);
  api.move(e, dt, false);
}
