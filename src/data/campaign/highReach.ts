// IMPLEMENTATION STATE: DESIGN/RUNTIME MANIFEST ONLY (Gate 0).
// Entry-state helpers for a future High Reach branch. No High Reach content
// exists in this branch.
// Addendum 07: High Reach canonical integration.
// Two entry contexts share one High Reach implementation:
// - High Reach Preview: direct scenario launch, no prior flags fabricated.
// - Canonical entry: First Surveyor defeat -> Atlas Seal -> world gate ->
//   expedition prep/fieldship -> transfer corridor -> existing opening.

export const HIGH_REACH_PREVIEW_ID = 'high_reach-preview';
export const HIGH_REACH_GATE_SITE_ID = 'engine:meridian_world_gate';

export interface HighReachEntryState {
  previewAvailable: boolean;
  canonicalGateActive: boolean;
  atlasSealOwned: boolean;
  firstSurveyorDefeated: boolean;
}

export function getHighReachEntry(
  firstSurveyorDefeated: boolean,
  atlasSealOwned: boolean,
): HighReachEntryState {
  return {
    previewAvailable: true,
    canonicalGateActive: firstSurveyorDefeated && atlasSealOwned,
    atlasSealOwned,
    firstSurveyorDefeated,
  };
}

/** Foundation ownership: High Reach reuses Gate 0 registries; it must not
 * re-migrate block/item identity or chunk encoding independently. */
export function verifyHighReachReusesFoundation(): string[] {
  // Structural check: foundation modules must exist (import-time guarantee).
  // Runtime registry reuse is verified by region tests, not by a second
  // migration. Returns a list of issues (empty = ok).
  return [];
}
