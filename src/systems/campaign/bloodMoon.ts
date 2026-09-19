// Gate 0: Blood Moon / Frenzy framework.
// Blood Moons are a visible post-clear challenge layer, never random
// first-clear punishment. Natural moons begin only after Bell Titan clear.
// Frenzy rematches are manually started at cleared waystones during the event.

export interface BloodMoonState {
  unlocked: boolean;
  active: boolean;
  /** Warning window in seconds before the event peaks. */
  warningSeconds: number;
  nightCount: number;
  lastEventAt?: number;
}

export function createBloodMoonState(): BloodMoonState {
  return { unlocked: false, active: false, warningSeconds: 180, nightCount: 0 };
}

export function unlockBloodMoonOnBellTitanClear(state: BloodMoonState): BloodMoonState {
  return { ...state, unlocked: true };
}

export interface FrenzyModifierPackage {
  bossId: string;
  tighterTell: string;
  recoveryBranch: string;
  spatialRule: string;
  visualMusicLayer: string;
  /** Small explicit stat adjustments only where needed for new mechanics. */
  healthMultiplier?: number;
  damageMultiplier?: number;
}

export function createFrenzyPackage(
  bossId: string,
  partial: Omit<FrenzyModifierPackage, 'bossId'>,
): FrenzyModifierPackage {
  return { bossId, ...partial };
}

/** Regional Blood Moon enemies borrow one simplified boss lesson under a
 * strict threat budget. */
export interface BloodMoonThreatBudget {
  maxActiveElites: number;
  maxConcurrentModifiers: number;
}

export const DEFAULT_BLOOD_MOON_BUDGET: BloodMoonThreatBudget = {
  maxActiveElites: 3,
  maxConcurrentModifiers: 2,
};

export function isFrenzyEligible(
  bloodMoon: BloodMoonState,
  bossDefeated: boolean,
  atClearedWaystone: boolean,
): boolean {
  return bloodMoon.unlocked && bloodMoon.active && bossDefeated && atClearedWaystone;
}
