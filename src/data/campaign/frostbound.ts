// Region 03: Frostbound Crown (5.2-6.8, 8-12h).
// Rule: delayed frost echoes + authored instability only.
// Required: Whitefang Packlord -> Rimeblade Exile -> Pale Avalanche -> Boreal Weaver.
// Guardians: Black-Ice Huntsman, Underfloe Horror.

import { registerCampaignBlock, registerCampaignItem } from '../../systems/campaign/contentIdentity';
import { registerCampaignRegion } from '../../systems/campaign/campaignRegions';
import { registerMaterial, registerAtmosphere, registerMusicState } from '../../systems/campaign/presentation';

export function registerFrostboundCrown(): void {
  registerCampaignBlock({ id: 'atlas:blue_ice_glass', name: 'Blue-Ice Glass', transparent: true, hardness: 0.8, category: 'building' });
  registerCampaignBlock({ id: 'atlas:blue_ice_brick', name: 'Blue-Ice Brick', hardness: 1.5, category: 'building' });
  registerCampaignBlock({ id: 'atlas:black_ice', name: 'Black Ice', hardness: 1, category: 'natural' });
  registerCampaignBlock({ id: 'atlas:packed_snow_block', name: 'Packed Snow', hardness: 0.5, category: 'natural' });
  registerCampaignBlock({ id: 'atlas:rime_steel_block', name: 'Rime-Steel Block', hardness: 3, category: 'building' });
  registerCampaignBlock({ id: 'atlas:frost_timber', name: 'Frost Timber', hardness: 2, category: 'building' });
  registerCampaignBlock({ id: 'atlas:monastery_stone', name: 'Monastery Stone', hardness: 2, category: 'building' });
  registerCampaignBlock({ id: 'atlas:aurora_lattice', name: 'Aurora Lattice', hardness: 1, category: 'functional' });
  registerCampaignBlock({ id: 'atlas:aurora_lamp', name: 'Aurora Lamp', hardness: 0.5, category: 'functional' });

  registerCampaignItem({ id: 'atlas:pack_crest', name: 'Pack Crest', category: 'relic' });
  registerCampaignItem({ id: 'atlas:exile_crest', name: 'Exile Crest', category: 'relic' });
  registerCampaignItem({ id: 'atlas:avalanche_crest', name: 'Avalanche Crest', category: 'relic' });
  registerCampaignItem({ id: 'atlas:frostbound_keystone', name: 'Frostbound Keystone', category: 'relic' });
  registerCampaignItem({ id: 'atlas:packstep', name: 'Packstep', category: 'ability' });
  registerCampaignItem({ id: 'atlas:rime_recall', name: 'Rime Recall', category: 'ability' });
  registerCampaignItem({ id: 'atlas:stonewake', name: 'Stonewake', category: 'ability' });
  registerCampaignItem({ id: 'atlas:aurora_step', name: 'Aurora Step', category: 'ability' });
  registerCampaignItem({ id: 'atlas:huntsman_longbow', name: 'Huntsman Longbow', category: 'tool' });
  registerCampaignItem({ id: 'atlas:underfloe_charm', name: 'Underfloe Charm', category: 'tool' });

  registerMaterial({ id: 'frostbound:blue_ice', albedo: '#9fd8f5', transparency: 'translucent', roughness: 0.15 });
  registerMaterial({ id: 'frostbound:black_ice', albedo: '#10141c', metalness: 0.4, roughness: 0.25 });
  registerMaterial({ id: 'frostbound:rime_steel', albedo: '#b8c8d8', metalness: 0.7, roughness: 0.4 });
  registerAtmosphere({
    id: 'frostbound:day',
    region: 'frostbound',
    fogColor: '#c8d8e8',
    skyTop: '#4a6a9a',
    skyBottom: '#d8e8f5',
    ambientParticle: 'ice-crystal-drift',
  });
  registerMusicState({ id: 'frostbound:explore', region: 'frostbound', layer: 'exploration', caption: 'Bow drones and wind chimes over snow hush.' });
  registerMusicState({ id: 'frostbound:weaver', region: 'frostbound', layer: 'boss_phase', caption: 'Aurora choir with ribbon percussion.' });

  registerCampaignRegion({
    type: 'frostbound',
    displayName: 'Frostbound Crown',
    difficultyRange: [5.2, 6.8],
    targetFirstClearHours: [8, 12],
    keystoneId: 'atlas:frostbound_keystone',
    previewRefillItemId: 'atlas:packed_snow_block',
    requiredBosses: [
      {
        bossId: 'frostbound:whitefang_packlord',
        siteId: 'frostbound:mirror_lake',
        region: 'frostbound',
        grantedCrest: 'atlas:pack_crest',
        signatureReward: 'atlas:packstep',
        physicalUnlock: 'Horn calls the lift herd; Mirror Lake stair opens.',
        atlasSketch: 'Herd trail to roofless monastery.',
        memoryDurationSeconds: 15,
      },
      {
        bossId: 'frostbound:rimeblade_exile',
        siteId: 'frostbound:rime_monastery',
        region: 'frostbound',
        prerequisiteCrest: 'atlas:pack_crest',
        grantedCrest: 'atlas:exile_crest',
        signatureReward: 'atlas:rime_recall',
        physicalUnlock: 'Heatless flame opens the buried pass.',
        atlasSketch: 'Pass bearing to avalanche stair.',
        memoryDurationSeconds: 15,
      },
      {
        bossId: 'frostbound:pale_avalanche',
        siteId: 'frostbound:avalanche_stair',
        region: 'frostbound',
        prerequisiteCrest: 'atlas:exile_crest',
        grantedCrest: 'atlas:avalanche_crest',
        signatureReward: 'atlas:stonewake',
        physicalUnlock: 'Core stabilizes the Boreal lattice; permanent pass.',
        atlasSketch: 'Lattice line to the observatory.',
        memoryDurationSeconds: 15,
      },
      {
        bossId: 'frostbound:boreal_weaver',
        siteId: 'frostbound:boreal_observatory',
        region: 'frostbound',
        prerequisiteCrest: 'atlas:avalanche_crest',
        grantedKeystone: 'atlas:frostbound_keystone',
        signatureReward: 'atlas:aurora_step',
        physicalUnlock: 'Aurora waylines ignite; monsoon column points tidelward.',
        regionTransform: 'Wolves turn guides, shrines relit, blizzards become weather only.',
        atlasSketch: 'Keystone map paints a green monsoon column.',
        memoryDurationSeconds: 18,
      },
    ],
    optionalGuardians: [
      { id: 'frostbound:black_ice_huntsman', name: 'Black-Ice Huntsman', difficulty: 5.7 },
      { id: 'frostbound:underfloe_horror', name: 'Underfloe Horror', difficulty: 6.6 },
    ],
    ordinaryEnemies: [
      { id: 'frostbound:rime_wolf', name: 'Rime Wolf', lesson: 'Echo Track positioning.' },
      { id: 'frostbound:echo_swordsman', name: 'Echo Swordsman', lesson: 'One delayed copy; Sheathe Mark interrupt.' },
      { id: 'frostbound:sleet_rook', name: 'Sleet Rook', lesson: 'Shadow-line dive.' },
      { id: 'frostbound:floe_crawler', name: 'Floe Crawler', lesson: 'Crack and bubble trail reading.' },
      { id: 'frostbound:glacier_warden', name: 'Glacier Warden', lesson: 'Heavy plus echo crack.' },
    ],
    frenzyPackages: [
      {
        bossId: 'frostbound:whitefang_packlord',
        tighterTell: 'Companions return faster.',
        recoveryBranch: 'Stagger opens a bigger alpha window.',
        spatialRule: 'Pack spread widens by one lane.',
        visualMusicLayer: 'Crimson aurora with pack howl round.',
      },
      {
        bossId: 'frostbound:boreal_weaver',
        tighterTell: 'One ribbon carries a delayed echo knot.',
        recoveryBranch: 'Ribbon collapse chains a second sweep.',
        spatialRule: 'Observatory rings rotate one extra step.',
        visualMusicLayer: 'Blood-moon ribbon glow with glass choir.',
      },
    ],
  });
}
