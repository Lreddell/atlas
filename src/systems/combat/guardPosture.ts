// Heartwood combat layer: timed guard, perfect parry, heavy guard, entity
// posture/stagger with break resistance, and the four signature arts.
//
// This module is pure simulation (no React, no three): every function takes
// explicit inputs and returns explicit outputs, so the whole layer is
// headlessly testable. EntityManager calls into it from tryDamagePlayer and
// damageEntity; InteractionController consumes art windows on melee swings.
//
// Universal response grammar (fixed meaning, Heartwood-themed presentation):
// - guard/parry: contact glint + rising metallic cue (briar-thorn visual)
// - heavy guard: double-ring cue + lower tone (sneak or Thorn Buckler)
// - dodge-only: three-pronged break shape + tearing cue (shockwave rings)
// - jumpable sweep: floor ripple + rising whoosh (shockwave rings)
// - reflectable: concentric diamonds + clean ping (returned bolts)
// - interruptible: unstable weak point + accelerating crackle (posture-fragile casts)

export const PERFECT_PARRY_WINDOW_MS = 220;
export const BUCKLER_PARRY_WINDOW_MS = 300;
export const GUARD_ARC_COS = Math.cos((75 * Math.PI) / 180);
export const GUARD_REDUCTION = 0.5;
export const HEAVY_GUARD_REDUCTION = 0.8;
export const GUARD_BROKEN_MS = 1200;
export const STABILITY_MAX = 100;

export const POSTURE_CAP = 100;
export const POSTURE_DECAY_PER_SECOND = 14;
export const STAGGER_BREAK_SECONDS = 1.6;

export const BOARSTEP_WINDOW_MS = 450;
export const BOARSTEP_DAMAGE_MULT = 1.35;
export const CROWN_WINDOW_MS = 600;
export const CROWN_DAMAGE_MULT = 1.25;
export const CROWN_STAGGER_FLOOR = 1.0;
export const ECHO_STORE_CAP = 12;
export const MOONHIDE_STAMINA_REFUND = 25;

export type GuardOutcome = 'parry' | 'guarded' | 'heavy_guarded' | 'broken' | 'full';

export interface GuardHitInput {
  nowMs: number;
  guardActive: boolean;
  guardStartedAtMs: number;
  /** Sneak-held or Thorn Buckler equipped. */
  heavyGuard: boolean;
  /** Attacker inside the frontal guard arc. */
  frontal: boolean;
  /** Dodge-only / jumpable attacks cannot be guarded. */
  guardable: boolean;
  damage: number;
  bucklerEquipped: boolean;
  stability: number;
  brokenUntilMs: number;
}

export interface GuardHitResult {
  outcome: GuardOutcome;
  damageTaken: number;
  stabilityCost: number;
  broken: boolean;
}

export function resolveGuardHit(input: GuardHitInput): GuardHitResult {
  const windowMs = input.bucklerEquipped ? BUCKLER_PARRY_WINDOW_MS : PERFECT_PARRY_WINDOW_MS;
  if (!input.guardActive || !input.frontal || !input.guardable || input.nowMs < input.brokenUntilMs) {
    return { outcome: 'full', damageTaken: input.damage, stabilityCost: 0, broken: false };
  }
  if (input.nowMs - input.guardStartedAtMs <= windowMs) {
    return { outcome: 'parry', damageTaken: 0, stabilityCost: 0, broken: false };
  }
  const heavy = input.heavyGuard;
  const reduction = heavy ? HEAVY_GUARD_REDUCTION : GUARD_REDUCTION;
  const cost = (heavy ? 30 : 18) + input.damage * (heavy ? 1.5 : 1.2);
  const remaining = input.stability - cost;
  if (remaining <= 0) {
    // The breaking blow lands at the guarded value; the NEXT hits are full
    // until stability recovers past the break.
    return {
      outcome: 'broken',
      damageTaken: input.damage * (1 - reduction),
      stabilityCost: input.stability,
      broken: true,
    };
  }
  return {
    outcome: heavy ? 'heavy_guarded' : 'guarded',
    damageTaken: input.damage * (1 - reduction),
    stabilityCost: cost,
    broken: false,
  };
}

// --- Entity posture (shared stagger contract) ---

interface PostureRecord {
  value: number;
  breaks: number;
  updatedAtMs: number;
}

const postureByEntity = new Map<number, PostureRecord>();

function readPosture(id: number, nowMs: number): PostureRecord {
  let record = postureByEntity.get(id);
  if (!record) {
    record = { value: 0, breaks: 0, updatedAtMs: nowMs };
    postureByEntity.set(id, record);
  } else {
    const dtSeconds = Math.max(0, (nowMs - record.updatedAtMs) / 1000);
    record.value = Math.max(0, record.value - dtSeconds * POSTURE_DECAY_PER_SECOND);
    record.updatedAtMs = nowMs;
  }
  return record;
}

/**
 * Add posture from a landed player hit. Returns true on a posture break.
 * Repeated breaks gain stagger resistance: each break halves further gain.
 */
export function addPosture(entityId: number, damage: number, staggerBonus: number, nowMs: number): boolean {
  const record = readPosture(entityId, nowMs);
  const gain = (damage * 5 + staggerBonus * 8) / (1 + record.breaks * 0.5);
  record.value += gain;
  if (record.value >= POSTURE_CAP) {
    record.value = 0;
    record.breaks += 1;
    return true;
  }
  return false;
}

export function getPostureBreaks(entityId: number): number {
  return postureByEntity.get(entityId)?.breaks ?? 0;
}

export function clearPosture(entityId: number): void {
  postureByEntity.delete(entityId);
}

export function resetPostureForTests(): void {
  postureByEntity.clear();
}

// --- Signature art windows (Boarstep / Crown Reversal / Echo Guard) ---

interface ArtState {
  boarstepUntilMs: number;
  crownUntilMs: number;
  echoStored: number;
}

const artState: ArtState = { boarstepUntilMs: 0, crownUntilMs: 0, echoStored: 0 };

export function noteDodge(evadedAtMs: number, hasBoarstep: boolean, hasCrownReversal: boolean): void {
  if (hasBoarstep) artState.boarstepUntilMs = evadedAtMs + BOARSTEP_WINDOW_MS;
  if (hasCrownReversal) artState.crownUntilMs = evadedAtMs + CROWN_WINDOW_MS;
}

export function noteParry(atMs: number, hasEchoGuard: boolean, postureValue = 4): void {
  void atMs;
  if (hasEchoGuard) artState.echoStored = Math.min(ECHO_STORE_CAP, artState.echoStored + postureValue);
}

/** Consume armed windows for the next melee swing. */
export function consumeArtWindows(nowMs: number): { boarstep: boolean; crown: boolean } {
  const boarstep = nowMs <= artState.boarstepUntilMs;
  const crown = nowMs <= artState.crownUntilMs;
  artState.boarstepUntilMs = 0;
  artState.crownUntilMs = 0;
  return { boarstep, crown };
}

export function peekArtWindows(nowMs: number): { boarstep: boolean; crown: boolean } {
  return { boarstep: nowMs <= artState.boarstepUntilMs, crown: nowMs <= artState.crownUntilMs };
}

/** Release stored Echo Guard posture into a heavy-weapon hit. */
export function consumeEcho(): number {
  const stored = artState.echoStored;
  artState.echoStored = 0;
  return stored;
}

export function peekEcho(): number {
  return artState.echoStored;
}

export function resetArtsForTests(): void {
  artState.boarstepUntilMs = 0;
  artState.crownUntilMs = 0;
  artState.echoStored = 0;
}

// --- Guard session (transitions + stability; driven by resolve calls) ---
// The single source of guard input is inputState.guarding (F key, same as
// sneak). This module tracks edge transitions and stability; callers pass
// explicit values so the sim stays pure and headlessly testable.

interface GuardSession {
  lastActive: boolean;
  startedAtMs: number;
  stability: number;
  brokenUntilMs: number;
  lastResolveMs: number;
  bucklerEquipped: boolean;
}

const guardSession: GuardSession = {
  lastActive: false,
  startedAtMs: 0,
  stability: STABILITY_MAX,
  brokenUntilMs: 0,
  lastResolveMs: 0,
  bucklerEquipped: false,
};

export function setBucklerEquipped(equipped: boolean): void {
  guardSession.bucklerEquipped = equipped;
}

export interface IncomingPlayerHit {
  nowMs: number;
  guardActive: boolean;
  sneaking: boolean;
  /** Camera yaw radians (three.js convention: forward = -sin/-cos). */
  facingYaw: number;
  /** Knockback direction applied to the player (away from the attacker). */
  knockX: number;
  knockZ: number;
  damage: number;
  guardable: boolean;
}

export interface ResolvedPlayerHit extends GuardHitResult {
  frontal: boolean;
  heavyGuard: boolean;
}

/** Full guard resolution for one incoming hit. Pure given explicit inputs. */
export function resolveIncomingHit(hit: IncomingPlayerHit): ResolvedPlayerHit {
  if (guardSession.lastResolveMs > 0 && !hit.guardActive) {
    const dt = Math.max(0, (hit.nowMs - guardSession.lastResolveMs) / 1000);
    guardSession.stability = Math.min(STABILITY_MAX, guardSession.stability + dt * 30);
  }
  guardSession.lastResolveMs = hit.nowMs;
  if (hit.guardActive && !guardSession.lastActive) {
    guardSession.startedAtMs = hit.nowMs;
  }
  guardSession.lastActive = hit.guardActive;
  const len = Math.hypot(hit.knockX, hit.knockZ);
  const facingX = -Math.sin(hit.facingYaw);
  const facingZ = -Math.cos(hit.facingYaw);
  // Knock points away from the attacker, so the attacker sits opposite it.
  const toAttackerX = len > 1e-6 ? -hit.knockX / len : facingX;
  const toAttackerZ = len > 1e-6 ? -hit.knockZ / len : facingZ;
  const frontal = toAttackerX * facingX + toAttackerZ * facingZ >= GUARD_ARC_COS;
  const heavyGuard = hit.sneaking || guardSession.bucklerEquipped;
  const result = resolveGuardHit({
    nowMs: hit.nowMs,
    guardActive: hit.guardActive,
    guardStartedAtMs: guardSession.startedAtMs,
    heavyGuard,
    frontal,
    guardable: hit.guardable,
    damage: hit.damage,
    bucklerEquipped: guardSession.bucklerEquipped,
    stability: guardSession.stability,
    brokenUntilMs: guardSession.brokenUntilMs,
  });
  guardSession.stability = Math.max(0, guardSession.stability - result.stabilityCost);
  if (result.broken) guardSession.brokenUntilMs = hit.nowMs + GUARD_BROKEN_MS;
  return { ...result, frontal, heavyGuard };
}

export function getGuardView(nowMs: number): { stability: number; broken: boolean; buckler: boolean } {
  return {
    stability: guardSession.stability,
    broken: nowMs < guardSession.brokenUntilMs,
    buckler: guardSession.bucklerEquipped,
  };
}

export function resetGuardForTests(): void {
  guardSession.lastActive = false;
  guardSession.startedAtMs = 0;
  guardSession.stability = STABILITY_MAX;
  guardSession.brokenUntilMs = 0;
  guardSession.lastResolveMs = 0;
  guardSession.bucklerEquipped = false;
}
