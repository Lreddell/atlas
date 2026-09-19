// Region 04: Tidelost Canopy (6.9-8.0, 9-13h).
// Rule: discrete water heights + vertical routes; no prolonged underwater DPS.
// Required: Riverjaw -> Jade Mantis -> Mangrove Colossus -> Nacre Leviathan.
// Guardians: Bog Lantern, Sunken Gardener.

import { registerCampaignBlock, registerCampaignItem } from '../../systems/campaign/contentIdentity';
import { registerCampaignRegion } from '../../systems/campaign/campaignRegions';
import { registerMaterial, registerAtmosphere, registerMusicState } from '../../systems/campaign/presentation';

export function registerTidelostCanopy(): void {
  registerCampaignBlock({ id: 'atlas:mangrove_heartwood', name: 'Mangrove Heartwood', hardness: 2, category: 'building' });
  registerCampaignBlock({ id: 'atlas:jade_bamboo', name: 'Jade Bamboo', hardness: 1.5, category: 'natural' });
  registerCampaignBlock({ id: 'atlas:reed_thatch', name: 'Reed Thatch', hardness: 0.5, category: 'building' });
  registerCampaignBlock({ id: 'atlas:mud_brick', name: 'Mud Brick', hardness: 1.5, category: 'building' });
  registerCampaignBlock({ id: 'atlas:delta_stone', name: 'Delta Stone', hardness: 1.5, category: 'building' });
  registerCampaignBlock({ id: 'atlas:sluice_control', name: 'Sluice Control', hardness: 2, category: 'functional' });
  registerCampaignBlock({ id: 'atlas:living_coral', name: 'Living Coral', hardness: 1, category: 'natural' });
  registerCampaignBlock({ id: 'atlas:nacre_tile', name: 'Nacre Tile', hardness: 1.5, category: 'building' });
  registerCampaignBlock({ id: 'atlas:reef_glass', name: 'Reef Glass', transparent: true, hardness: 0.8, category: 'building' });
  registerCampaignBlock({ id: 'atlas:tide_gauge', name: 'Tide Gauge', hardness: 1, category: 'functional' });

  registerCampaignItem({ id: 'atlas:riverjaw_crest', name: 'Riverjaw Crest', category: 'relic' });
  registerCampaignItem({ id: 'atlas:mantis_crest', name: 'Mantis Crest', category: 'relic' });
  registerCampaignItem({ id: 'atlas:mangrove_crest', name: 'Mangrove Crest', category: 'relic' });
  registerCampaignItem({ id: 'atlas:tidelost_keystone', name: 'Tidelost Keystone', category: 'relic' });
  registerCampaignItem({ id: 'atlas:undertow_cut', name: 'Undertow Cut', category: 'ability' });
  registerCampaignItem({ id: 'atlas:jade_pursuit', name: 'Jade Pursuit', category: 'ability' });
  registerCampaignItem({ id: 'atlas:rootline', name: 'Rootline', category: 'ability' });
  registerCampaignItem({ id: 'atlas:tidal_heart', name: 'Tidal Heart', category: 'ability' });
  registerCampaignItem({ id: 'atlas:lantern_core', name: 'Lantern Core', category: 'tool' });
  registerCampaignItem({ id: 'atlas:reef_scepter', name: 'Reef Scepter', category: 'tool' });

  registerMaterial({ id: 'tidelost:mangrove', albedo: '#4a5d3a', roughness: 0.9, windResponse: true });
  registerMaterial({ id: 'tidelost:nacre', albedo: '#e8d8e0', metalness: 0.3, roughness: 0.3 });
  registerMaterial({ id: 'tidelost:coral', albedo: '#d86a7a', roughness: 0.7 });
  registerAtmosphere({
    id: 'tidelost:day',
    region: 'tidelost',
    fogColor: '#a8c8a0',
    skyTop: '#5a9ac8',
    skyBottom: '#c8e8c0',
    ambientParticle: 'rain-mist-spore',
  });
  registerMusicState({ id: 'tidelost:explore', region: 'tidelost', layer: 'exploration', caption: 'Rain sticks and canopy bells over tide pulse.' });
  registerMusicState({ id: 'tidelost:leviathan', region: 'tidelost', layer: 'boss_phase', caption: 'Trench drums with nacre choir.' });

  registerCampaignRegion({
    type: 'tidelost',
    displayName: 'Tidelost Canopy',
    difficultyRange: [6.9, 8.0],
    targetFirstClearHours: [9, 13],
    keystoneId: 'atlas:tidelost_keystone',
    previewRefillItemId: 'atlas:reed_thatch',
    requiredBosses: [
      {
        bossId: 'tidelost:riverjaw_matriarch',
        siteId: 'tidelost:braided_delta',
        region: 'tidelost',
        grantedCrest: 'atlas:riverjaw_crest',
        signatureReward: 'atlas:undertow_cut',
        physicalUnlock: 'Scale operates floodgates; boat routes open.',
        atlasSketch: 'Floodgate channel to canopy temple.',
        memoryDurationSeconds: 15,
      },
      {
        bossId: 'tidelost:jade_mantis',
        siteId: 'tidelost:jade_canopy',
        region: 'tidelost',
        prerequisiteCrest: 'atlas:riverjaw_crest',
        grantedCrest: 'atlas:mantis_crest',
        signatureReward: 'atlas:jade_pursuit',
        physicalUnlock: 'Blade cuts binding vines; ziplines wake.',
        atlasSketch: 'Zipline bearing to the basilica.',
        memoryDurationSeconds: 15,
      },
      {
        bossId: 'tidelost:mangrove_colossus',
        siteId: 'tidelost:mangrove_basilica',
        region: 'tidelost',
        prerequisiteCrest: 'atlas:mantis_crest',
        grantedCrest: 'atlas:mangrove_crest',
        signatureReward: 'atlas:rootline',
        physicalUnlock: 'Heartwood grows a route to the reef.',
        atlasSketch: 'Root road to the trench observatory.',
        memoryDurationSeconds: 15,
      },
      {
        bossId: 'tidelost:nacre_leviathan',
        siteId: 'tidelost:nacre_basin',
        region: 'tidelost',
        prerequisiteCrest: 'atlas:mangrove_crest',
        grantedKeystone: 'atlas:tidelost_keystone',
        signatureReward: 'atlas:tidal_heart',
        physicalUnlock: 'Tides stabilize; black-sand current points meridianward.',
        regionTransform: 'Channels calm, ruins drain, platforms rise.',
        atlasSketch: 'Keystone map draws a black-sand current.',
        memoryDurationSeconds: 18,
      },
    ],
    optionalGuardians: [
      { id: 'tidelost:bog_lantern', name: 'Bog Lantern', difficulty: 7.1 },
      { id: 'tidelost:sunken_gardener', name: 'Sunken Gardener', difficulty: 7.8 },
    ],
    ordinaryEnemies: [
      { id: 'tidelost:reed_lancer', name: 'Reed Lancer', lesson: 'Shallow-water spacing.' },
      { id: 'tidelost:canopy_mantis', name: 'Canopy Mantis', lesson: 'Wall Leap plus Vertical Plunge.' },
      { id: 'tidelost:mudjaw_ambusher', name: 'Mudjaw Ambusher', lesson: 'Ripple reading.' },
      { id: 'tidelost:coral_sentry', name: 'Coral Sentry', lesson: 'Pruneable Seed Line.' },
      { id: 'tidelost:monsoon_ape', name: 'Monsoon Ape', lesson: 'Tagged Cover Throw.' },
    ],
    frenzyPackages: [
      {
        bossId: 'tidelost:riverjaw_matriarch',
        tighterTell: 'Tail Flood reverses once per cycle.',
        recoveryBranch: 'Coordinated juveniles converge.',
        spatialRule: 'Flood lanes swap sides.',
        visualMusicLayer: 'Crimson tide foam with deep drums.',
      },
      {
        bossId: 'tidelost:nacre_leviathan',
        tighterTell: 'High tide lasts one extra surge.',
        recoveryBranch: 'Pearl Choir ricochet.',
        spatialRule: 'Trench platforms sink one step longer.',
        visualMusicLayer: 'Blood-moon nacre glare with tide choir.',
      },
    ],
  });
}
