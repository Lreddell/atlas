// IMPLEMENTATION STATE: DESIGN/RUNTIME MANIFEST ONLY (Gate 0).
// Finale metadata (keystone gate, Atlas Seal) for validation and future
// work. No Engine geometry, Surveyor AI, or postgame implementation exists.
// Finale 06: Meridian Engine / The First Surveyor (10.0, 2-4h expedition).
// Six chapters: Convergence Court -> Survey Archive -> Index Works ->
// Five Bearings -> Engine Annulus -> Meridian Chamber.
// Requires all five real keystones in Standard; preview uses noncanonical
// five-keystone provenance.

import { registerCampaignBlock, registerCampaignItem } from '../../systems/campaign/contentIdentity';
import { registerMaterial, registerAtmosphere, registerMusicState } from '../../systems/campaign/presentation';

export const MERIDIAN_ENGINE_BOSS = 'engine:first_surveyor';
export const ATLAS_SEAL_ITEM = 'atlas:atlas_seal';

export const ENGINE_REQUIRED_KEYSTONES = [
  'atlas:heartwood_keystone',
  'atlas:sunscar_keystone',
  'atlas:frostbound_keystone',
  'atlas:tidelost_keystone',
  'atlas:meridian_keystone',
] as const;

export function registerMeridianEngine(): void {
  registerCampaignBlock({ id: 'atlas:survey_stone', name: 'Survey Stone', hardness: 2, category: 'building' });
  registerCampaignBlock({ id: 'atlas:contour_stone', name: 'Contour Stone', hardness: 2, category: 'building' });
  registerCampaignBlock({ id: 'atlas:axis_bronze_trim', name: 'Axis Bronze Trim', hardness: 3, category: 'building' });
  registerCampaignBlock({ id: 'atlas:projection_glass', name: 'Projection Glass', transparent: true, hardness: 1, category: 'building' });
  registerCampaignBlock({ id: 'atlas:archive_shelf', name: 'Archive Shelf', hardness: 2, category: 'functional' });
  registerCampaignBlock({ id: 'atlas:index_pylon', name: 'Index Pylon', hardness: 3, category: 'functional' });
  registerCampaignBlock({ id: 'atlas:folding_bridge', name: 'Folding Bridge', hardness: 2, category: 'functional' });
  registerCampaignBlock({ id: 'atlas:seal_gate', name: 'Seal Gate', hardness: 5, category: 'functional' });

  registerCampaignItem({ id: 'atlas:atlas_seal', name: 'Atlas Seal', category: 'relic' });
  registerCampaignItem({ id: 'atlas:sanguine_dial', name: 'Sanguine Dial', category: 'tool' });
  registerCampaignItem({ id: 'atlas:crimson_almanac', name: 'Crimson Almanac', category: 'tool' });

  registerMaterial({ id: 'engine:survey_bronze', albedo: '#7a6a4a', metalness: 0.7, roughness: 0.4 });
  registerMaterial({ id: 'engine:projection_glass', albedo: '#b8e8f5', transparency: 'translucent', roughness: 0.2 });
  registerAtmosphere({
    id: 'engine:annulus',
    region: 'meridian_engine',
    fogColor: '#6a5a8a',
    skyTop: '#2a2a4a',
    skyBottom: '#8a7aba',
    ambientParticle: 'survey-dust-drift',
  });
  registerMusicState({ id: 'engine:explore', region: 'meridian_engine', layer: 'exploration', caption: 'Archive hush with survey pulse.' });
  registerMusicState({ id: 'engine:surveyor', region: 'meridian_engine', layer: 'boss_phase', caption: 'Three-phase surveyor: measure, revise, uncharted.' });
}

export function hasAllEngineKeystones(ownedKeystones: string[]): boolean {
  return ENGINE_REQUIRED_KEYSTONES.every((k) => ownedKeystones.includes(k));
}
