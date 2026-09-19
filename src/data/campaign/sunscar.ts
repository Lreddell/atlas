// Region 02: Sunscar Expanse (3.5-5.1, 8-12h).
// Rule: heat as readable encounter state.
// Required: Glassjaw -> Cinder Warden -> Mirage Regent -> Pyreback Colossus.
// Guardians: Carrion Sun, Salt-Glass Saint.

import { registerCampaignBlock, registerCampaignItem } from '../../systems/campaign/contentIdentity';
import { registerCampaignRegion } from '../../systems/campaign/campaignRegions';
import { registerMaterial, registerAtmosphere, registerMusicState } from '../../systems/campaign/presentation';

export function registerSunscarExpanse(): void {
  registerCampaignBlock({ id: 'atlas:sun_glass', name: 'Sun Glass', transparent: true, hardness: 0.8, category: 'building' });
  registerCampaignBlock({ id: 'atlas:frosted_sun_glass', name: 'Frosted Sun Glass', transparent: true, hardness: 0.8, category: 'building' });
  registerCampaignBlock({ id: 'atlas:salt_crystal', name: 'Salt Crystal', hardness: 1, category: 'natural' });
  registerCampaignBlock({ id: 'atlas:packed_salt', name: 'Packed Salt', hardness: 1.2, category: 'building' });
  registerCampaignBlock({ id: 'atlas:ember_iron_ore', name: 'Ember-Iron Ore', hardness: 3, category: 'natural' });
  registerCampaignBlock({ id: 'atlas:red_knife_sandstone', name: 'Red Knife Sandstone', hardness: 1.5, category: 'building' });
  registerCampaignBlock({ id: 'atlas:aqueduct_masonry', name: 'Aqueduct Masonry', hardness: 2, category: 'building' });
  registerCampaignBlock({ id: 'atlas:prism_mirror', name: 'Prism Mirror', hardness: 1, category: 'functional' });
  registerCampaignBlock({ id: 'atlas:shade_engine', name: 'Shade Engine', hardness: 2, category: 'functional' });
  registerCampaignBlock({ id: 'atlas:pyreback_scale_block', name: 'Pyreback Scale', hardness: 3, category: 'building' });

  registerCampaignItem({ id: 'atlas:burrower_crest', name: 'Burrower Crest', category: 'relic' });
  registerCampaignItem({ id: 'atlas:warden_crest', name: 'Warden Crest', category: 'relic' });
  registerCampaignItem({ id: 'atlas:regent_crest', name: 'Regent Crest', category: 'relic' });
  registerCampaignItem({ id: 'atlas:sunscar_keystone', name: 'Sunscar Keystone', category: 'relic' });
  registerCampaignItem({ id: 'atlas:sandstep', name: 'Sandstep', category: 'ability' });
  registerCampaignItem({ id: 'atlas:tempered_guard', name: 'Tempered Guard', category: 'ability' });
  registerCampaignItem({ id: 'atlas:prism_sight', name: 'Prism Sight', category: 'ability' });
  registerCampaignItem({ id: 'atlas:emberheart', name: 'Emberheart', category: 'ability' });
  registerCampaignItem({ id: 'atlas:sunfeather_mantle', name: 'Sunfeather Mantle', category: 'tool' });
  registerCampaignItem({ id: 'atlas:cooling_resin', name: 'Cooling Resin', category: 'material' });

  registerMaterial({ id: 'sunscar:sun_glass', albedo: '#e8d9a0', transparency: 'translucent', roughness: 0.2 });
  registerMaterial({ id: 'sunscar:salt', albedo: '#f5f0e6', roughness: 0.6 });
  registerMaterial({ id: 'sunscar:basalt', albedo: '#3a3a40', roughness: 0.95 });
  registerAtmosphere({
    id: 'sunscar:day',
    region: 'sunscar',
    fogColor: '#e8c890',
    skyTop: '#5fb2e8',
    skyBottom: '#f5d9a0',
    ambientParticle: 'heat-shimmer-grit',
  });
  registerMusicState({ id: 'sunscar:explore', region: 'sunscar', layer: 'exploration', caption: 'Hammered dulcimer and wind over dune drone.' });
  registerMusicState({ id: 'sunscar:pyreback', region: 'sunscar', layer: 'boss_phase', caption: 'Caravan drums with brass ascent.' });

  registerCampaignRegion({
    type: 'sunscar',
    displayName: 'Sunscar Expanse',
    difficultyRange: [3.5, 5.1],
    targetFirstClearHours: [8, 12],
    keystoneId: 'atlas:sunscar_keystone',
    previewRefillItemId: 'atlas:cooling_resin',
    requiredBosses: [
      {
        bossId: 'sunscar:glassjaw_burrower',
        siteId: 'sunscar:glass_dunes',
        region: 'sunscar',
        grantedCrest: 'atlas:burrower_crest',
        signatureReward: 'atlas:sandstep',
        physicalUnlock: 'Lens reveals the furnace route.',
        atlasSketch: 'Glass road points to foundry smoke.',
        memoryDurationSeconds: 15,
      },
      {
        bossId: 'sunscar:cinder_warden',
        siteId: 'sunscar:cinder_foundry',
        region: 'sunscar',
        prerequisiteCrest: 'atlas:burrower_crest',
        grantedCrest: 'atlas:warden_crest',
        signatureReward: 'atlas:tempered_guard',
        physicalUnlock: 'Heart powers sun gate; foundries and lifts wake.',
        atlasSketch: 'Sun gate opens toward mirage towers.',
        memoryDurationSeconds: 15,
      },
      {
        bossId: 'sunscar:mirage_regent',
        siteId: 'sunscar:mirage_palace',
        region: 'sunscar',
        prerequisiteCrest: 'atlas:warden_crest',
        grantedCrest: 'atlas:regent_crest',
        signatureReward: 'atlas:prism_sight',
        physicalUnlock: 'Standard controls caravan boarding route.',
        atlasSketch: 'Caravan bearing to the moving mountain.',
        memoryDurationSeconds: 15,
      },
      {
        bossId: 'sunscar:pyreback_colossus',
        siteId: 'sunscar:caldera_march',
        region: 'sunscar',
        prerequisiteCrest: 'atlas:regent_crest',
        grantedKeystone: 'atlas:sunscar_keystone',
        signatureReward: 'atlas:emberheart',
        physicalUnlock: 'Colossus rests as buildable mountain; steam plume points frostward.',
        regionTransform: 'Foundries stay on, false lakes drain, aqueducts refill.',
        atlasSketch: 'Keystone map draws a frost bearing.',
        memoryDurationSeconds: 18,
      },
    ],
    optionalGuardians: [
      { id: 'sunscar:carrion_sun', name: 'Carrion Sun', difficulty: 4.3 },
      { id: 'sunscar:salt_glass_saint', name: 'Salt-Glass Saint', difficulty: 4.9 },
    ],
    ordinaryEnemies: [
      { id: 'sunscar:glass_skipper', name: 'Glass Skipper', lesson: 'Visible burrow trail.' },
      { id: 'sunscar:kiln_knight', name: 'Kiln Knight', lesson: 'Overheat openings.' },
      { id: 'sunscar:mirage_jackal', name: 'Mirage Jackal', lesson: 'One harmless decoy; true body has shadow.' },
      { id: 'sunscar:saltbound_pilgrim', name: 'Saltbound Pilgrim', lesson: 'Slow reflectable Sun Disc.' },
      { id: 'sunscar:basalt_ram', name: 'Basalt Ram', lesson: 'Breakable face plate plus jumpable wave.' },
    ],
    frenzyPackages: [
      {
        bossId: 'sunscar:glassjaw_burrower',
        tighterTell: 'Forked burrow trails; only shard-displacing trail erupts.',
        recoveryBranch: 'Second surfacing chains a quick bite.',
        spatialRule: 'Sand displacement zones persist.',
        visualMusicLayer: 'Crimson glass glint with rattle swell.',
      },
      {
        bossId: 'sunscar:pyreback_colossus',
        tighterTell: 'Channel reversal telegraph shortens.',
        recoveryBranch: 'Mortar plus melee combo on stagger.',
        spatialRule: 'Boarding tilt slows but covers more deck.',
        visualMusicLayer: 'Blood-moon emberfall with war horns.',
      },
    ],
  });
}
