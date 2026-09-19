// Campaign content entrypoint. Import this once at startup (or in tests)
// so all region/finale content registers against Gate 0 contracts.
// Safe to call multiple times: duplicate registration is skipped.
//
// IMPLEMENTATION STATE (Gate 0): region files below are DESIGN/RUNTIME
// MANIFESTS ONLY. They register metadata (boss ids, crest chains, palettes,
// frenzy packages) used by validation and future region branches. They do NOT
// allocate numeric voxel ids and contain no terrain/AI/art implementation.
// The only production blocks allocated here are the neutral Gate 0 proving
// blocks (256-258). Do not mistake manifest registration for region completion.

import { registerHeartwoodMarches } from './heartwood';
import { registerSunscarExpanse } from './sunscar';
import { registerFrostboundCrown } from './frostbound';
import { registerTidelostCanopy } from './tidelost';
import { registerShatteredMeridian } from './shattered';
import { registerMeridianEngine } from './engine';
import { registerGate0ProvingBlocks } from './gate0';

let initialized = false;

export function initCampaignContent(): void {
  if (initialized) return;
  initialized = true;
  registerGate0ProvingBlocks();
  registerHeartwoodMarches();
  registerSunscarExpanse();
  registerFrostboundCrown();
  registerTidelostCanopy();
  registerShatteredMeridian();
  registerMeridianEngine();
}

export function resetCampaignContentForTests(): void {
  initialized = false;
}
