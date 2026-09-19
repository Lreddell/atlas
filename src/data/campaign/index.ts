// Campaign content entrypoint. Import this once at startup (or in tests)
// so all region/finale content registers against Gate 0 contracts.
// Safe to call multiple times: duplicate registration is skipped.

import { registerHeartwoodMarches } from './heartwood';
import { registerSunscarExpanse } from './sunscar';
import { registerFrostboundCrown } from './frostbound';
import { registerTidelostCanopy } from './tidelost';
import { registerShatteredMeridian } from './shattered';
import { registerMeridianEngine } from './engine';

let initialized = false;

export function initCampaignContent(): void {
  if (initialized) return;
  initialized = true;
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
