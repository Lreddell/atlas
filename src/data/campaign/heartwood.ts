// IMPLEMENTATION STATE: DESIGN/RUNTIME MANIFEST ONLY (Gate 0).
// This file registers Heartwood metadata (boss ids, crest chain, palettes,
// frenzy packages) for validation and future work. It implements NO terrain,
// encounters, AI, art, or audio. Heartwood production belongs to a future
// campaign/heartwood-marches branch built on this Gate 0 base.
// Region 01: Heartwood Marches (origin, 1.5-3.3, 6-10h).
// Rule: vibration through roots/stone/bell structures.
// Required: Root-Tusk -> Briar Castellan -> Crownroot Stag -> Bell Titan.
// Guardians: Moonhorn Stalker, The Gleaner.

import { registerCampaignBlock, registerCampaignItem } from '../../systems/campaign/contentIdentity';
import { registerCampaignRegion } from '../../systems/campaign/campaignRegions';
import { registerMaterial, registerAtmosphere, registerMusicState } from '../../systems/campaign/presentation';

export const HEARTWOOD_BOSSES = [
  'heartwood:root_tusk',
  'heartwood:briar_castellan',
  'heartwood:crownroot_stag',
  'heartwood:bell_titan',
] as const;

export function registerHeartwoodMarches(): void {
  // Construction / resource palette (remain useful after progression).
  registerCampaignBlock({ id: 'atlas:ironwood_log', name: 'Ironwood Log', hardness: 2, category: 'natural' });
  registerCampaignBlock({ id: 'atlas:ironwood_planks', name: 'Ironwood Planks', hardness: 2, category: 'building' });
  registerCampaignBlock({ id: 'atlas:resin_block', name: 'Resin Block', hardness: 1, category: 'natural' });
  registerCampaignBlock({ id: 'atlas:resonant_limestone', name: 'Resonant Limestone', hardness: 1.5, category: 'building' });
  registerCampaignBlock({ id: 'atlas:cut_limestone', name: 'Cut Limestone', hardness: 1.5, category: 'building' });
  registerCampaignBlock({ id: 'atlas:ringing_stone', name: 'Ringing Stone', hardness: 2, category: 'functional' });
  registerCampaignBlock({ id: 'atlas:bell_bronze_block', name: 'Bell-Bronze Block', hardness: 3, category: 'building' });
  registerCampaignBlock({ id: 'atlas:briar_hedge', name: 'Briar Hedge', hardness: 0.8, category: 'natural' });
  registerCampaignBlock({ id: 'atlas:crownroot_bark', name: 'Crownroot Bark', hardness: 2, category: 'natural' });
  registerCampaignBlock({ id: 'atlas:moonleaf_block', name: 'Moonleaf Block', hardness: 0.5, transparent: true, category: 'natural' });
  registerCampaignBlock({ id: 'atlas:furrowed_earth', name: 'Furrowed Earth', hardness: 0.5, category: 'natural' });
  registerCampaignBlock({ id: 'atlas:resin_lantern', name: 'Resin Lantern', hardness: 0.5, category: 'functional' });
  registerCampaignBlock({ id: 'atlas:survey_marker', name: 'Survey Marker', hardness: 1, category: 'functional' });

  // Physical crests + keystone (bound relics; gates check ownership).
  registerCampaignItem({ id: 'atlas:furrow_crest', name: 'Furrow Crest', category: 'relic' });
  registerCampaignItem({ id: 'atlas:castellan_crest', name: 'Castellan Crest', category: 'relic' });
  registerCampaignItem({ id: 'atlas:vault_crest', name: 'Vault Crest', category: 'relic' });
  registerCampaignItem({ id: 'atlas:heartwood_keystone', name: 'Heartwood Keystone', category: 'relic' });
  registerCampaignItem({ id: 'atlas:boarstep', name: 'Boarstep', category: 'ability' });
  registerCampaignItem({ id: 'atlas:briar_counter', name: 'Briar Counter', category: 'ability' });
  registerCampaignItem({ id: 'atlas:crown_reversal', name: 'Crown Reversal', category: 'ability' });
  registerCampaignItem({ id: 'atlas:echo_guard', name: 'Echo Guard', category: 'ability' });
  registerCampaignItem({ id: 'atlas:gleaning_hook', name: 'Gleaning Hook', category: 'tool' });
  registerCampaignItem({ id: 'atlas:moonhide', name: 'Moonhide', category: 'material' });

  registerMaterial({ id: 'heartwood:ironwood', albedo: '#6b4a2f', roughness: 0.9, windResponse: false });
  registerMaterial({ id: 'heartwood:bell_bronze', albedo: '#8a6d3b', metalness: 0.8, roughness: 0.35 });
  registerMaterial({ id: 'heartwood:briar', albedo: '#2e5d33', windResponse: true });
  registerAtmosphere({
    id: 'heartwood:day',
    region: 'heartwood',
    fogColor: '#b8cfa0',
    skyTop: '#7fb2d9',
    skyBottom: '#d9e8c8',
    ambientParticle: 'pollen-mote',
  });
  registerMusicState({ id: 'heartwood:explore', region: 'heartwood', layer: 'exploration', caption: 'Strings and wooden flutes over root hum.' });
  registerMusicState({ id: 'heartwood:bell_titan', region: 'heartwood', layer: 'boss_phase', caption: 'Vault bell counterpoint with bronze percussion.' });

  registerCampaignRegion({
    type: 'heartwood',
    displayName: 'Heartwood Marches',
    difficultyRange: [1.5, 3.3],
    targetFirstClearHours: [6, 10],
    keystoneId: 'atlas:heartwood_keystone',
    previewRefillItemId: 'atlas:resin_block',
    requiredBosses: [
      {
        bossId: 'heartwood:root_tusk',
        siteId: 'heartwood:furrow_downs',
        region: 'heartwood',
        grantedCrest: 'atlas:furrow_crest',
        signatureReward: 'atlas:boarstep',
        physicalUnlock: 'Tusk tears open Briarwall living gate.',
        atlasSketch: 'Furrow leads east to thorn wall.',
        memoryDurationSeconds: 15,
      },
      {
        bossId: 'heartwood:briar_castellan',
        siteId: 'heartwood:briarwall_keep',
        region: 'heartwood',
        prerequisiteCrest: 'atlas:furrow_crest',
        grantedCrest: 'atlas:castellan_crest',
        signatureReward: 'atlas:briar_counter',
        physicalUnlock: 'Seal parts Crownroot mist.',
        atlasSketch: 'Mist path to antler grove.',
        memoryDurationSeconds: 15,
      },
      {
        bossId: 'heartwood:crownroot_stag',
        siteId: 'heartwood:crownroot_grove',
        region: 'heartwood',
        prerequisiteCrest: 'atlas:castellan_crest',
        grantedCrest: 'atlas:vault_crest',
        signatureReward: 'atlas:crown_reversal',
        physicalUnlock: 'Antler key wakes the Vault bell.',
        atlasSketch: 'Bell tone points to vault stair.',
        memoryDurationSeconds: 15,
      },
      {
        bossId: 'heartwood:bell_titan',
        siteId: 'heartwood:resonant_vault',
        region: 'heartwood',
        prerequisiteCrest: 'atlas:vault_crest',
        grantedKeystone: 'atlas:heartwood_keystone',
        signatureReward: 'atlas:echo_guard',
        physicalUnlock: 'Vault opens; waynet hums; heat shimmer points to Sunscar.',
        regionTransform: 'Hedges flower, furrows stabilize into roads, tremors quiet.',
        atlasSketch: 'Keystone map burns a bearing sunward.',
        memoryDurationSeconds: 18,
      },
    ],
    optionalGuardians: [
      { id: 'heartwood:moonhorn_stalker', name: 'Moonhorn Stalker', difficulty: 2.3 },
      { id: 'heartwood:the_gleaner', name: 'The Gleaner', difficulty: 3.0 },
    ],
    ordinaryEnemies: [
      { id: 'heartwood:furrowling', name: 'Furrowling', lesson: 'Charge commitment and recovery punish.' },
      { id: 'heartwood:briar_sentry', name: 'Briar Sentry', lesson: 'Frontal guard; flank or parry.' },
      { id: 'heartwood:crown_hare', name: 'Crown Hare', lesson: 'Jumpable sweep timing.' },
      { id: 'heartwood:vault_cantor', name: 'Vault Cantor', lesson: 'Reflectable Tone Pulse.' },
      { id: 'heartwood:mossback_bailiff', name: 'Mossback Bailiff', lesson: 'Shield combo plus interruptible Root Writ.' },
    ],
    frenzyPackages: [
      {
        bossId: 'heartwood:root_tusk',
        tighterTell: 'Feint charge once per cycle.',
        recoveryBranch: 'Every second furrow sprouts blocking roots.',
        spatialRule: 'Furrow lanes persist one extra pass.',
        visualMusicLayer: 'Blood-moon root glow with low drum ostinato.',
      },
      {
        bossId: 'heartwood:bell_titan',
        tighterTell: 'Delayed overtone counterpoint on slam.',
        recoveryBranch: 'Echo shards orbit once before fading.',
        spatialRule: 'Bell ring zones shrink safe ground by one ring.',
        visualMusicLayer: 'Crimson bell shimmer with choir swell.',
      },
    ],
  });
}
