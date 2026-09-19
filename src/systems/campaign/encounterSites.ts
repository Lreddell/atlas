// Gate 0: Shared encounter-site contract.
// Covers field arenas, dungeons, moving bounded platforms, water-state arenas,
// polarity spaces, and the Meridian Engine.
//
// Guarantees: reservation before decoration, physical predecessor-crest lock,
// temporary edit protection, safe temp-voxel deformation restorable after
// failure, deterministic post-clear conversion, rematch isolation, and
// save/reload safety outside explicitly unsafe mid-frame states.

export type EncounterPhase =
  | 'undiscovered'
  | 'discovered'
  | 'locked'
  | 'ready'
  | 'fighting'
  | 'failed_resetting'
  | 'cleared'
  | 'rematch_armed';

export interface EncounterSiteState {
  siteId: string;
  bossId: string;
  phase: EncounterPhase;
  /** Temp-layer voxels staged during the fight (restorable). */
  tempLayerActive: boolean;
  /** Waystone activates only after arena is safe. */
  waystoneActive: boolean;
  /** Rematch ritual available only after first clear. */
  rematchAvailable: boolean;
  attemptCount: number;
  firstClearAt?: number;
  lastResetAt?: number;
}

export function createEncounterState(siteId: string, bossId: string): EncounterSiteState {
  return {
    siteId,
    bossId,
    phase: 'undiscovered',
    tempLayerActive: false,
    waystoneActive: false,
    rematchAvailable: false,
    attemptCount: 0,
  };
}

export type EncounterEvent =
  | { type: 'discover' }
  | { type: 'unlock'; hasPredecessorCrest: boolean }
  | { type: 'startFight' }
  | { type: 'fail' }
  | { type: 'clear'; timestamp: number }
  | { type: 'armRematch' }
  | { type: 'resetTempLayer' };

/** Deterministic state transition. Bosses must never write permanent chunk
 * destruction directly during a failed fight; use the temp layer instead. */
export function transitionEncounter(
  state: EncounterSiteState,
  event: EncounterEvent,
): EncounterSiteState {
  const next: EncounterSiteState = { ...state };
  switch (event.type) {
    case 'discover':
      if (next.phase === 'undiscovered') next.phase = 'discovered';
      break;
    case 'unlock':
      if (next.phase === 'discovered' || next.phase === 'locked') {
        next.phase = event.hasPredecessorCrest ? 'ready' : 'locked';
      }
      break;
    case 'startFight':
      if (next.phase === 'ready' || next.phase === 'rematch_armed') {
        next.phase = 'fighting';
        next.tempLayerActive = true;
        next.attemptCount += 1;
      }
      break;
    case 'fail':
      if (next.phase === 'fighting') {
        next.phase = 'failed_resetting';
      }
      break;
    case 'resetTempLayer':
      next.tempLayerActive = false;
      if (next.phase === 'failed_resetting') next.phase = 'ready';
      break;
    case 'clear':
      next.phase = 'cleared';
      next.tempLayerActive = false;
      next.firstClearAt = event.timestamp;
      // Waystone activates after the arena is safe (caller confirms safety,
      // then sets waystoneActive via activateWaystoneAfterClear).
      next.rematchAvailable = true;
      break;
    case 'armRematch':
      if (next.phase === 'cleared' && next.rematchAvailable) {
        next.phase = 'rematch_armed';
      }
      break;
  }
  return next;
}

export function activateWaystoneAfterClear(state: EncounterSiteState): EncounterSiteState {
  if (state.phase !== 'cleared') return state;
  return { ...state, waystoneActive: true };
}

/** Leaving/dying/reloading mid-boss resolves to a documented safe state. */
export function resolveInterruptedFight(state: EncounterSiteState): EncounterSiteState {
  if (state.phase === 'fighting' || state.phase === 'failed_resetting') {
    return {
      ...state,
      phase: state.firstClearAt ? 'cleared' : 'ready',
      tempLayerActive: false,
      lastResetAt: Date.now(),
    };
  }
  return state;
}

export interface TempVoxelEdit {
  x: number;
  y: number;
  z: number;
  /** Block present before the temp deformation. */
  previousBlock: string;
  previousMeta?: number;
}

/** In-memory temp layer; callers persist only the cleared-site outcome. */
export class TempArenaLayer {
  private edits: TempVoxelEdit[] = [];

  stage(edit: TempVoxelEdit): void {
    this.edits.push(edit);
  }

  /** Restore order is reverse-stage so overlapping edits unwind correctly. */
  restore(): TempVoxelEdit[] {
    const reversed = [...this.edits].reverse();
    this.edits = [];
    return reversed;
  }

  get pendingCount(): number {
    return this.edits.length;
  }

  clear(): void {
    this.edits = [];
  }
}
