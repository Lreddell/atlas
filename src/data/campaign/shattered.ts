// IMPLEMENTATION STATE: DESIGN/RUNTIME MANIFEST ONLY (Gate 0).
// Shattered Meridian metadata for validation and future work. The existing
// Magnetic Fields / Warden content is untouched production; the region arc
// itself is not implemented.
// Region 05: Shattered Meridian (8.1-9.4, 10-14h).
// Rule: explicit bounded magnetic fields; stable camera/gravity.
// Required: Compass Beast -> Rail Saint -> Twin Poles -> Magnetic Warden.
// Guardians: Lodestone Drake, Iron Bloom.
// Preserves existing Magnetic Fields / Polarity Boots / Magnetic Warden.

import { registerCampaignBlock, registerCampaignItem } from '../../systems/campaign/contentIdentity';
import { registerCampaignRegion } from '../../systems/campaign/campaignRegions';
import { registerMaterial, registerAtmosphere, registerMusicState } from '../../systems/campaign/presentation';

export function registerShatteredMeridian(): void {
  registerCampaignBlock({ id: 'atlas:compass_stone', name: 'Compass Stone', hardness: 2, category: 'building' });
  registerCampaignBlock({ id: 'atlas:axis_floor', name: 'Axis Floor', hardness: 2, category: 'building' });
  registerCampaignBlock({ id: 'atlas:field_line_floor', name: 'Field-Line Floor', hardness: 2, category: 'functional' });
  registerCampaignBlock({ id: 'atlas:rail_bronze_block', name: 'Rail Bronze', hardness: 3, category: 'building' });
  registerCampaignBlock({ id: 'atlas:ferric_fabric', name: 'Ferric Fabric', hardness: 1, category: 'building' });
  registerCampaignBlock({ id: 'atlas:zero_point_lamp', name: 'Zero-Point Lamp', hardness: 0.5, category: 'functional' });
  registerCampaignBlock({ id: 'atlas:compass_tree_wood', name: 'Compass-Tree Wood', hardness: 2, category: 'natural' });
  registerCampaignBlock({ id: 'atlas:floating_ore_decor', name: 'Floating Ore', hardness: 2, category: 'natural' });

  registerCampaignItem({ id: 'atlas:compass_crest', name: 'Compass Crest', category: 'relic' });
  registerCampaignItem({ id: 'atlas:rail_crest', name: 'Rail Crest', category: 'relic' });
  registerCampaignItem({ id: 'atlas:twin_crest', name: 'Twin Crest', category: 'relic' });
  registerCampaignItem({ id: 'atlas:meridian_keystone', name: 'Meridian Keystone', category: 'relic' });
  registerCampaignItem({ id: 'atlas:axis_sense', name: 'Axis Sense', category: 'ability' });
  registerCampaignItem({ id: 'atlas:linebreak', name: 'Linebreak', category: 'ability' });
  registerCampaignItem({ id: 'atlas:dual_polarity', name: 'Dual Polarity', category: 'ability' });
  registerCampaignItem({ id: 'atlas:warden_field', name: 'Warden Field', category: 'ability' });
  registerCampaignItem({ id: 'atlas:lodestone_spear', name: 'Lodestone Spear', category: 'tool' });
  registerCampaignItem({ id: 'atlas:iron_bloom_catalyst', name: 'Iron Bloom Catalyst', category: 'tool' });

  registerMaterial({ id: 'meridian:magnetite', albedo: '#4a4a55', metalness: 0.6, roughness: 0.5 });
  registerMaterial({ id: 'meridian:rail_bronze', albedo: '#8a6d3b', metalness: 0.8, roughness: 0.35 });
  registerMaterial({ id: 'meridian:zero_point', albedo: '#b8e8f5', emissive: '#5ac8e8' });
  registerAtmosphere({
    id: 'meridian:day',
    region: 'shattered_meridian',
    fogColor: '#9a8ac8',
    skyTop: '#4a5a9a',
    skyBottom: '#c8b8e8',
    ambientParticle: 'iron-filing-drift',
  });
  registerMusicState({ id: 'meridian:explore', region: 'shattered_meridian', layer: 'exploration', caption: 'Rail rhythm and compass hum over iron wind.' });
  registerMusicState({ id: 'meridian:warden', region: 'shattered_meridian', layer: 'boss_phase', caption: 'Polarity choir with rail percussion.' });

  registerCampaignRegion({
    type: 'shattered_meridian',
    displayName: 'Shattered Meridian',
    difficultyRange: [8.1, 9.4],
    targetFirstClearHours: [10, 14],
    keystoneId: 'atlas:meridian_keystone',
    previewRefillItemId: 'atlas:ferric_fabric',
    requiredBosses: [
      {
        bossId: 'meridian:compass_beast',
        siteId: 'meridian:compass_barrens',
        region: 'shattered_meridian',
        grantedCrest: 'atlas:compass_crest',
        signatureReward: 'atlas:axis_sense',
        physicalUnlock: 'Needle reveals buried rails; bearings stabilize.',
        atlasSketch: 'Rail bearing to the grave station.',
        memoryDurationSeconds: 15,
      },
      {
        bossId: 'meridian:rail_saint',
        siteId: 'meridian:railgrave',
        region: 'shattered_meridian',
        prerequisiteCrest: 'atlas:compass_crest',
        grantedCrest: 'atlas:rail_crest',
        signatureReward: 'atlas:linebreak',
        physicalUnlock: 'Conductor restores transit toward the Twin Poles.',
        atlasSketch: 'Transit line to the twin mesas.',
        memoryDurationSeconds: 15,
      },
      {
        bossId: 'meridian:twin_poles',
        siteId: 'meridian:twin_mesas',
        region: 'shattered_meridian',
        prerequisiteCrest: 'atlas:rail_crest',
        grantedCrest: 'atlas:twin_crest',
        signatureReward: 'atlas:dual_polarity',
        physicalUnlock: 'Paired cores energize the Warden citadel; mesas reconnect.',
        atlasSketch: 'Field lines converge on the citadel.',
        memoryDurationSeconds: 15,
      },
      {
        bossId: 'meridian:magnetic_warden',
        siteId: 'meridian:magnetic_fields',
        region: 'shattered_meridian',
        prerequisiteCrest: 'atlas:twin_crest',
        grantedKeystone: 'atlas:meridian_keystone',
        signatureReward: 'atlas:warden_field',
        physicalUnlock: 'Fields settle; five keystones project the Engine map.',
        regionTransform: 'Bearings stable, transit usable, ore stabilizes.',
        atlasSketch: 'Keystone map draws the Engine convergence.',
        memoryDurationSeconds: 18,
      },
    ],
    optionalGuardians: [
      { id: 'meridian:lodestone_drake', name: 'Lodestone Drake', difficulty: 8.7 },
      { id: 'meridian:iron_bloom', name: 'Iron Bloom', difficulty: 9.2 },
    ],
    ordinaryEnemies: [
      { id: 'meridian:needle_hound', name: 'Needle Hound', lesson: 'Field-line charge.' },
      { id: 'meridian:flux_knight', name: 'Flux Knight', lesson: 'Attract shield, repel spear.' },
      { id: 'meridian:rail_rook', name: 'Rail Rook', lesson: 'Arc-bound; reflect off rail.' },
      { id: 'meridian:compass_mite', name: 'Compass Mite', lesson: 'Tutorial swarm, capped.' },
      { id: 'meridian:gyre_sentinel', name: 'Gyre Sentinel', lesson: 'Pull plus repulsion plus reflectable Axis Bolt.' },
    ],
    frenzyPackages: [
      {
        bossId: 'meridian:compass_beast',
        tighterTell: 'Charge follows one axis rotation.',
        recoveryBranch: 'Needle sweep chains a second arc.',
        spatialRule: 'North rotates mid-combo.',
        visualMusicLayer: 'Crimson compass rose with iron choir.',
      },
      {
        bossId: 'meridian:magnetic_warden',
        tighterTell: 'Two-crystal start with early frenzy.',
        recoveryBranch: 'Reflect yields an opening.',
        spatialRule: 'Field polarity swaps one extra time.',
        visualMusicLayer: 'Blood-moon field lines with warden organ.',
      },
    ],
  });
}
