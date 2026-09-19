// Heartwood Marches production content (Stage 1: identity + data).
//
// Allocates stable numeric ids 259+ through the authoritative block registry
// (Gate 0; never the BlockType enum), publishes BLOCKS definitions, item
// stats, weapon profiles, and crafting recipes. Allocation order is fixed and
// asserted: any drift is a save-compatibility break and throws at startup.
//
// World blocks 259-278, inventory items 279-309. Texture atlas slots
// 300-316 (blocks) and 320-350 (items); painters live in utils/textures.ts
// (heartwood section), mappings in textureMapping.ts.

import { allocateWorldBlockId } from '../registry/blockRegistry';
import { ITEM_STATS } from '../registry/itemStats';
import { registerVaultWeaponProfile } from '../combat/vaultWeapons';
import { registerCrossRenderedBlock } from '../../data/spriteBlocks';
import { refreshRenderClassification } from '../world/geometry';
import { refreshOpacityTables } from '../world/blockProps';
import { CUTOUT_TILE_CONFIGS } from '../../utils/atlasTileFamilies';
import { RECIPES } from '../../recipes';
import { BlockType, type BlockDef } from '../../types';

const asId = (n: number): BlockType => n as BlockType;

// --- Numeric identities (frozen once shipped) ---
export const HW_IRONWOOD_LOG = 259;
export const HW_IRONWOOD_PLANKS = 260;
export const HW_IRONWOOD_SLAB = 261;
export const HW_IRONWOOD_STAIRS = 262;
export const HW_RESIN_BLOCK = 263;
export const HW_RESIN_LANTERN = 264;
export const HW_RESONANT_LIMESTONE = 265;
export const HW_CUT_LIMESTONE = 266;
export const HW_LIMESTONE_SLAB = 267;
export const HW_RINGING_STONE = 268;
export const HW_BELL_BRONZE = 269;
export const HW_BRONZE_LAMP = 270;
export const HW_BRIAR_HEDGE = 271;
export const HW_ROOT_BLOCK = 272;
export const HW_CROWNROOT_LOG = 273;
export const HW_CROWNROOT_PLANKS = 274;
export const HW_MOONLEAF_BLOCK = 275;
export const HW_FURROWED_EARTH = 276;
export const HW_STABLE_PATH = 277;
export const HW_SURVEY_MARKER = 278;

export const HW_BRIAR_FIBER = 279;
export const HW_ROOT_HIDE = 280;
export const HW_CROWNWOOD_TWIG = 281;
export const HW_RESONANT_SHARD = 282;
export const HW_BELL_FLECK = 283;
export const HW_RESIN = 284;
export const HW_MOONLEAF = 285;
export const HW_FIELD_SALVE = 286;
export const HW_THORN_BUCKLER = 287;
export const HW_KNELL_MAUL = 288;
export const HW_CRESCENT_DAGGERS = 289;
export const HW_GLEANING_HOOK = 290;
export const HW_RESONANT_BOW = 291;
export const HW_RESONANT_BRANCH = 292;
export const HW_ROOTHIDE_HELMET = 293;
export const HW_ROOTHIDE_CHEST = 294;
export const HW_ROOTHIDE_LEGS = 295;
export const HW_ROOTHIDE_BOOTS = 296;
export const HW_CROWN_HELMET = 297;
export const HW_CROWN_CHEST = 298;
export const HW_CROWN_LEGS = 299;
export const HW_CROWN_BOOTS = 300;
export const HW_MOON_HELMET = 301;
export const HW_MOON_CHEST = 302;
export const HW_MOON_LEGS = 303;
export const HW_MOON_BOOTS = 304;
export const HW_CRIMSON_ALMANAC = 305;
export const HW_BRONZE_INGOT = 306;
export const HW_MOONHIDE = 307;
export const HW_ANTLER_TINE = 308;
export const HW_BELL_ALLOY = 309;

// Texture atlas slots (painters in utils/textures.ts heartwood section).
const T = {
  ironwoodLog: 300, ironwoodPlanks: 301, resinBlock: 302, resinLantern: 303,
  resonantLimestone: 304, cutLimestone: 305, ringingStone: 306, bellBronze: 307,
  bronzeLamp: 308, briarHedge: 309, rootBlock: 310, crownrootLog: 311,
  crownrootPlanks: 312, moonleaf: 313, furrowedEarth: 314, stablePath: 315,
  surveyMarker: 316,
  briarFiber: 320, rootHide: 321, crownTwig: 322, resonantShard: 323,
  bellFleck: 324, resin: 325, moonleafItem: 326, salve: 327, buckler: 328,
  maul: 329, daggers: 330, hook: 331, bow: 332, staff: 333,
  roothideHelm: 334, roothideChest: 335, roothideLegs: 336, roothideBoots: 337,
  crownHelm: 338, crownChest: 339, crownLegs: 340, crownBoots: 341,
  moonHelm: 342, moonChest: 343, moonLegs: 344, moonBoots: 345,
  almanac: 346, bronzeIngot: 347, moonhide: 348, tine: 349, alloy: 350,
};

interface BlockSpec {
  numeric: number;
  namespaced: string;
  def: Omit<BlockDef, 'id'>;
}

const WORLD_BLOCKS: BlockSpec[] = [
  { numeric: HW_IRONWOOD_LOG, namespaced: 'atlas:heartwood_ironwood_log', def: { color: '#6b4a2f', name: 'Ironwood Log', textureSlot: T.ironwoodLog, hardness: 2, preferredTool: 'axe', isFuel: true, fuelValue: 15000, smeltsInto: BlockType.CHARCOAL, category: 'natural', soundGroup: 'wood', drops: [{ type: asId(HW_IRONWOOD_LOG), chance: 1, min: 1, max: 1 }] } },
  { numeric: HW_IRONWOOD_PLANKS, namespaced: 'atlas:heartwood_ironwood_planks', def: { color: '#8a6242', name: 'Ironwood Planks', textureSlot: T.ironwoodPlanks, hardness: 2, preferredTool: 'axe', isFuel: true, fuelValue: 15000, category: 'building', soundGroup: 'wood', drops: [{ type: asId(HW_IRONWOOD_PLANKS), chance: 1, min: 1, max: 1 }] } },
  { numeric: HW_IRONWOOD_SLAB, namespaced: 'atlas:heartwood_ironwood_slab', def: { color: '#8a6242', name: 'Ironwood Slab', textureSlot: T.ironwoodPlanks, textureParent: asId(HW_IRONWOOD_PLANKS), shape: 'slab', transparent: true, hardness: 2, preferredTool: 'axe', isFuel: true, fuelValue: 7500, category: 'building', soundGroup: 'wood', drops: [{ type: asId(HW_IRONWOOD_SLAB), chance: 1, min: 1, max: 1 }] } },
  { numeric: HW_IRONWOOD_STAIRS, namespaced: 'atlas:heartwood_ironwood_stairs', def: { color: '#8a6242', name: 'Ironwood Stairs', textureSlot: T.ironwoodPlanks, textureParent: asId(HW_IRONWOOD_PLANKS), shape: 'stairs', transparent: true, hardness: 2, preferredTool: 'axe', isFuel: true, fuelValue: 15000, category: 'building', soundGroup: 'wood', drops: [{ type: asId(HW_IRONWOOD_STAIRS), chance: 1, min: 1, max: 1 }] } },
  { numeric: HW_RESIN_BLOCK, namespaced: 'atlas:heartwood_resin_block', def: { color: '#b06a2a', name: 'Resin Block', textureSlot: T.resinBlock, hardness: 1, isFuel: true, fuelValue: 20000, category: 'building', soundGroup: 'generic', drops: [{ type: asId(HW_RESIN_BLOCK), chance: 1, min: 1, max: 1 }] } },
  { numeric: HW_RESIN_LANTERN, namespaced: 'atlas:heartwood_resin_lantern', def: { color: '#e8a040', name: 'Resin Lantern', textureSlot: T.resinLantern, hardness: 0.5, lightLevel: 12, category: 'functional', soundGroup: 'glass', drops: [{ type: asId(HW_RESIN_LANTERN), chance: 1, min: 1, max: 1 }] } },
  { numeric: HW_RESONANT_LIMESTONE, namespaced: 'atlas:heartwood_resonant_limestone', def: { color: '#9a9484', name: 'Resonant Limestone', textureSlot: T.resonantLimestone, hardness: 1.5, preferredTool: 'pickaxe', minHarvestTier: 1, category: 'natural', soundGroup: 'stone', drops: [{ type: asId(HW_RESONANT_LIMESTONE), chance: 1, min: 1, max: 1 }] } },
  { numeric: HW_CUT_LIMESTONE, namespaced: 'atlas:heartwood_cut_limestone', def: { color: '#a8a294', name: 'Cut Limestone', textureSlot: T.cutLimestone, hardness: 1.5, preferredTool: 'pickaxe', minHarvestTier: 1, category: 'building', soundGroup: 'stone', drops: [{ type: asId(HW_CUT_LIMESTONE), chance: 1, min: 1, max: 1 }] } },
  { numeric: HW_LIMESTONE_SLAB, namespaced: 'atlas:heartwood_limestone_slab', def: { color: '#a8a294', name: 'Limestone Slab', textureSlot: T.cutLimestone, textureParent: asId(HW_CUT_LIMESTONE), shape: 'slab', transparent: true, hardness: 1.5, preferredTool: 'pickaxe', minHarvestTier: 1, category: 'building', soundGroup: 'stone', drops: [{ type: asId(HW_LIMESTONE_SLAB), chance: 1, min: 1, max: 1 }] } },
  { numeric: HW_RINGING_STONE, namespaced: 'atlas:heartwood_ringing_stone', def: { color: '#8f8a9a', name: 'Ringing Stone', textureSlot: T.ringingStone, hardness: 2, preferredTool: 'pickaxe', minHarvestTier: 1, category: 'functional', soundGroup: 'stone', drops: [{ type: asId(HW_RINGING_STONE), chance: 1, min: 1, max: 1 }] } },
  { numeric: HW_BELL_BRONZE, namespaced: 'atlas:heartwood_bell_bronze', def: { color: '#8a6d3b', name: 'Bell-Bronze Block', textureSlot: T.bellBronze, hardness: 3, preferredTool: 'pickaxe', minHarvestTier: 2, category: 'building', soundGroup: 'metal', drops: [{ type: asId(HW_BELL_BRONZE), chance: 1, min: 1, max: 1 }] } },
  { numeric: HW_BRONZE_LAMP, namespaced: 'atlas:heartwood_bronze_lamp', def: { color: '#c8a050', name: 'Bell-Bronze Lamp', textureSlot: T.bronzeLamp, hardness: 1, lightLevel: 13, category: 'functional', soundGroup: 'metal', drops: [{ type: asId(HW_BRONZE_LAMP), chance: 1, min: 1, max: 1 }] } },
  { numeric: HW_BRIAR_HEDGE, namespaced: 'atlas:heartwood_briar_hedge', def: { color: '#2e5d33', name: 'Briar Hedge', textureSlot: T.briarHedge, hardness: 0.8, preferredTool: 'axe', category: 'natural', soundGroup: 'grass', drops: [{ type: asId(HW_BRIAR_FIBER), chance: 0.6, min: 1, max: 2 }, { type: asId(HW_BRIAR_HEDGE), chance: 1, min: 1, max: 1 }] } },
  { numeric: HW_ROOT_BLOCK, namespaced: 'atlas:heartwood_root_block', def: { color: '#5a4632', name: 'Root Block', textureSlot: T.rootBlock, hardness: 1.2, preferredTool: 'axe', category: 'natural', soundGroup: 'wood', drops: [{ type: asId(HW_ROOT_BLOCK), chance: 1, min: 1, max: 1 }] } },
  { numeric: HW_CROWNROOT_LOG, namespaced: 'atlas:heartwood_crownroot_log', def: { color: '#7a6a55', name: 'Crownroot Log', textureSlot: T.crownrootLog, hardness: 2, preferredTool: 'axe', isFuel: true, fuelValue: 15000, smeltsInto: BlockType.CHARCOAL, category: 'natural', soundGroup: 'wood', drops: [{ type: asId(HW_CROWNROOT_LOG), chance: 1, min: 1, max: 1 }] } },
  { numeric: HW_CROWNROOT_PLANKS, namespaced: 'atlas:heartwood_crownroot_planks', def: { color: '#96866a', name: 'Crownroot Planks', textureSlot: T.crownrootPlanks, hardness: 2, preferredTool: 'axe', isFuel: true, fuelValue: 15000, category: 'building', soundGroup: 'wood', drops: [{ type: asId(HW_CROWNROOT_PLANKS), chance: 1, min: 1, max: 1 }] } },
  { numeric: HW_MOONLEAF_BLOCK, namespaced: 'atlas:heartwood_moonleaf', def: { color: '#b8d8c8', name: 'Moonleaf', textureSlot: T.moonleaf, hardness: 0, transparent: true, noCollision: true, category: 'natural', soundGroup: 'grass', drops: [{ type: asId(HW_MOONLEAF), chance: 1, min: 1, max: 2 }] } },
  { numeric: HW_FURROWED_EARTH, namespaced: 'atlas:heartwood_furrowed_earth', def: { color: '#5d4a37', name: 'Furrowed Earth', textureSlot: T.furrowedEarth, hardness: 0.5, preferredTool: 'shovel', category: 'natural', soundGroup: 'sand', drops: [{ type: BlockType.DIRT, chance: 1, min: 1, max: 1 }] } },
  { numeric: HW_STABLE_PATH, namespaced: 'atlas:heartwood_stable_path', def: { color: '#8a7a5a', name: 'Stable Path', textureSlot: T.stablePath, hardness: 0.6, preferredTool: 'shovel', category: 'building', soundGroup: 'sand', drops: [{ type: asId(HW_STABLE_PATH), chance: 1, min: 1, max: 1 }] } },
  { numeric: HW_SURVEY_MARKER, namespaced: 'atlas:heartwood_survey_marker', def: { color: '#c8c0b0', name: 'Survey Marker', textureSlot: T.surveyMarker, hardness: 1, preferredTool: 'pickaxe', minHarvestTier: 1, lightLevel: 4, category: 'functional', soundGroup: 'stone', drops: [{ type: asId(HW_SURVEY_MARKER), chance: 1, min: 1, max: 1 }] } },
];

interface ItemSpec {
  numeric: number;
  namespaced: string;
  def: Omit<BlockDef, 'id'>;
}

const ITEMS: ItemSpec[] = [
  { numeric: HW_BRIAR_FIBER, namespaced: 'atlas:heartwood_briar_fiber', def: { color: '#3a7a42', name: 'Briar Fiber', textureSlot: T.briarFiber, hardness: 0, isItem: true, category: 'ingredients' } },
  { numeric: HW_ROOT_HIDE, namespaced: 'atlas:heartwood_root_hide', def: { color: '#7a5a3a', name: 'Root-Bound Hide', textureSlot: T.rootHide, hardness: 0, isItem: true, category: 'ingredients' } },
  { numeric: HW_CROWNWOOD_TWIG, namespaced: 'atlas:heartwood_crownwood_twig', def: { color: '#a89878', name: 'Crownwood Twig', textureSlot: T.crownTwig, hardness: 0, isItem: true, isFuel: true, fuelValue: 2000, category: 'ingredients' } },
  { numeric: HW_RESONANT_SHARD, namespaced: 'atlas:heartwood_resonant_shard', def: { color: '#b8b0a0', name: 'Resonant Shard', textureSlot: T.resonantShard, hardness: 0, isItem: true, category: 'ingredients' } },
  { numeric: HW_BELL_FLECK, namespaced: 'atlas:heartwood_bell_fleck', def: { color: '#d8a848', name: 'Bell-Bronze Fleck', textureSlot: T.bellFleck, hardness: 0, isItem: true, category: 'ingredients' } },
  { numeric: HW_RESIN, namespaced: 'atlas:heartwood_resin', def: { color: '#d08030', name: 'Ironwood Resin', textureSlot: T.resin, hardness: 0, isItem: true, isFuel: true, fuelValue: 8000, category: 'ingredients' } },
  { numeric: HW_MOONLEAF, namespaced: 'atlas:heartwood_moonleaf_item', def: { color: '#c8e8d8', name: 'Moonleaf', textureSlot: T.moonleafItem, hardness: 0, isItem: true, lightLevel: 2, category: 'food', nutrition: 2, saturationModifier: 0.4 } },
  { numeric: HW_FIELD_SALVE, namespaced: 'atlas:heartwood_field_salve', def: { color: '#90c090', name: 'Field Salve', textureSlot: T.salve, hardness: 0, isItem: true, category: 'food', nutrition: 6, saturationModifier: 0.6 } },
  { numeric: HW_THORN_BUCKLER, namespaced: 'atlas:heartwood_thorn_buckler', def: { color: '#4a7a3a', name: 'Thorn Buckler', textureSlot: T.buckler, hardness: 0, isItem: true, category: 'tools' } },
  { numeric: HW_KNELL_MAUL, namespaced: 'atlas:heartwood_knell_maul', def: { color: '#8a6d3b', name: 'Knell Maul', textureSlot: T.maul, hardness: 0, isItem: true, category: 'tools' } },
  { numeric: HW_CRESCENT_DAGGERS, namespaced: 'atlas:heartwood_crescent_daggers', def: { color: '#b8c8d8', name: 'Crescent Daggers', textureSlot: T.daggers, hardness: 0, isItem: true, category: 'tools' } },
  { numeric: HW_GLEANING_HOOK, namespaced: 'atlas:heartwood_gleaning_hook', def: { color: '#9a8a6a', name: 'Gleaning Hook', textureSlot: T.hook, hardness: 0, isItem: true, category: 'tools' } },
  { numeric: HW_RESONANT_BOW, namespaced: 'atlas:heartwood_resonant_bow', def: { color: '#a89878', name: 'Resonant Bow', textureSlot: T.bow, hardness: 0, isItem: true, category: 'tools' } },
  { numeric: HW_RESONANT_BRANCH, namespaced: 'atlas:heartwood_resonant_branch', def: { color: '#c8b8e8', name: 'Resonant Branch', textureSlot: T.staff, hardness: 0, isItem: true, lightLevel: 3, category: 'tools' } },
  { numeric: HW_ROOTHIDE_HELMET, namespaced: 'atlas:heartwood_roothide_helmet', def: { color: '#6a4a2a', name: 'Root-Hide Cap', textureSlot: T.roothideHelm, hardness: 0, isItem: true, category: 'tools' } },
  { numeric: HW_ROOTHIDE_CHEST, namespaced: 'atlas:heartwood_roothide_tunic', def: { color: '#6a4a2a', name: 'Root-Hide Tunic', textureSlot: T.roothideChest, hardness: 0, isItem: true, category: 'tools' } },
  { numeric: HW_ROOTHIDE_LEGS, namespaced: 'atlas:heartwood_roothide_wraps', def: { color: '#6a4a2a', name: 'Root-Hide Wraps', textureSlot: T.roothideLegs, hardness: 0, isItem: true, category: 'tools' } },
  { numeric: HW_ROOTHIDE_BOOTS, namespaced: 'atlas:heartwood_roothide_boots', def: { color: '#6a4a2a', name: 'Root-Hide Boots', textureSlot: T.roothideBoots, hardness: 0, isItem: true, category: 'tools' } },
  { numeric: HW_CROWN_HELMET, namespaced: 'atlas:heartwood_crownwood_hood', def: { color: '#a89878', name: 'Crownwood Hood', textureSlot: T.crownHelm, hardness: 0, isItem: true, category: 'tools' } },
  { numeric: HW_CROWN_CHEST, namespaced: 'atlas:heartwood_crownwood_garb', def: { color: '#a89878', name: 'Crownwood Garb', textureSlot: T.crownChest, hardness: 0, isItem: true, category: 'tools' } },
  { numeric: HW_CROWN_LEGS, namespaced: 'atlas:heartwood_crownwood_trousers', def: { color: '#a89878', name: 'Crownwood Trousers', textureSlot: T.crownLegs, hardness: 0, isItem: true, category: 'tools' } },
  { numeric: HW_CROWN_BOOTS, namespaced: 'atlas:heartwood_crownwood_shoes', def: { color: '#a89878', name: 'Crownwood Shoes', textureSlot: T.crownBoots, hardness: 0, isItem: true, category: 'tools' } },
  { numeric: HW_MOON_HELMET, namespaced: 'atlas:heartwood_moonhide_hood', def: { color: '#7a9a9a', name: 'Moonhide Hood', textureSlot: T.moonHelm, hardness: 0, isItem: true, category: 'tools' } },
  { numeric: HW_MOON_CHEST, namespaced: 'atlas:heartwood_moonhide_wrap', def: { color: '#7a9a9a', name: 'Moonhide Wrap', textureSlot: T.moonChest, hardness: 0, isItem: true, category: 'tools' } },
  { numeric: HW_MOON_LEGS, namespaced: 'atlas:heartwood_moonhide_leggings', def: { color: '#7a9a9a', name: 'Moonhide Leggings', textureSlot: T.moonLegs, hardness: 0, isItem: true, category: 'tools' } },
  { numeric: HW_MOON_BOOTS, namespaced: 'atlas:heartwood_moonhide_moccasins', def: { color: '#7a9a9a', name: 'Moonhide Moccasins', textureSlot: T.moonBoots, hardness: 0, isItem: true, category: 'tools' } },
  { numeric: HW_CRIMSON_ALMANAC, namespaced: 'atlas:heartwood_crimson_almanac', def: { color: '#a02020', name: 'Crimson Almanac', textureSlot: T.almanac, hardness: 0, isItem: true, category: 'tools' } },
  { numeric: HW_BRONZE_INGOT, namespaced: 'atlas:heartwood_bronze_ingot', def: { color: '#c89840', name: 'Bell-Bronze Ingot', textureSlot: T.bronzeIngot, hardness: 0, isItem: true, category: 'ingredients' } },
  { numeric: HW_MOONHIDE, namespaced: 'atlas:heartwood_moonhide', def: { color: '#8aaaaa', name: 'Moonhide', textureSlot: T.moonhide, hardness: 0, isItem: true, category: 'ingredients' } },
  { numeric: HW_ANTLER_TINE, namespaced: 'atlas:heartwood_antler_tine', def: { color: '#d8c8a8', name: 'Antler Tine', textureSlot: T.tine, hardness: 0, isItem: true, category: 'ingredients' } },
  { numeric: HW_BELL_ALLOY, namespaced: 'atlas:heartwood_bell_alloy', def: { color: '#e8c868', name: 'Bell Alloy', textureSlot: T.alloy, hardness: 0, isItem: true, lightLevel: 2, category: 'ingredients' } },
];

let registered = false;

export function registerHeartwoodContent(): void {
  if (registered) return;
  registered = true;
  for (const spec of WORLD_BLOCKS) {
    const numeric = allocateWorldBlockId(spec.namespaced, spec.def);
    if (numeric !== spec.numeric) {
      throw new Error(`Heartwood block allocation drift: ${spec.namespaced} got ${numeric}, expected ${spec.numeric}.`);
    }
  }
  for (const spec of ITEMS) {
    const numeric = allocateWorldBlockId(spec.namespaced, spec.def);
    if (numeric !== spec.numeric) {
      throw new Error(`Heartwood item allocation drift: ${spec.namespaced} got ${numeric}, expected ${spec.numeric}.`);
    }
  }
  registerCrossRenderedBlock(asId(HW_MOONLEAF_BLOCK));
  CUTOUT_TILE_CONFIGS.push({ slot: T.moonleaf });
  refreshRenderClassification();
  refreshOpacityTables();
  registerItemStats();
  registerWeaponProfiles();
  registerRecipes();
}

function registerItemStats(): void {
  const S = ITEM_STATS as Record<number, { attack?: number; defense?: number; slot?: string; maxDurability?: number }>;
  // Weapons.
  S[HW_KNELL_MAUL] = { attack: 10, maxDurability: 450 };
  S[HW_CRESCENT_DAGGERS] = { attack: 4, maxDurability: 220 };
  S[HW_GLEANING_HOOK] = { attack: 3, maxDurability: 300 };
  S[HW_RESONANT_BOW] = { attack: 8, maxDurability: 380 };
  S[HW_RESONANT_BRANCH] = { attack: 7, maxDurability: 300 };
  S[HW_THORN_BUCKLER] = { defense: 2, slot: 'accessory', maxDurability: 250 };
  // Root-hide (medium, just under iron).
  S[HW_ROOTHIDE_HELMET] = { defense: 2, slot: 'helmet', maxDurability: 132 };
  S[HW_ROOTHIDE_CHEST] = { defense: 5, slot: 'chestplate', maxDurability: 192 };
  S[HW_ROOTHIDE_LEGS] = { defense: 4, slot: 'leggings', maxDurability: 180 };
  S[HW_ROOTHIDE_BOOTS] = { defense: 2, slot: 'boots', maxDurability: 156 };
  // Crownwood (light, mobile).
  S[HW_CROWN_HELMET] = { defense: 1, slot: 'helmet', maxDurability: 110 };
  S[HW_CROWN_CHEST] = { defense: 4, slot: 'chestplate', maxDurability: 160 };
  S[HW_CROWN_LEGS] = { defense: 3, slot: 'leggings', maxDurability: 150 };
  S[HW_CROWN_BOOTS] = { defense: 1, slot: 'boots', maxDurability: 130 };
  // Moonhide (light + perfect-dodge stamina perk, see guardPosture).
  S[HW_MOON_HELMET] = { defense: 1, slot: 'helmet', maxDurability: 120 };
  S[HW_MOON_CHEST] = { defense: 3, slot: 'chestplate', maxDurability: 170 };
  S[HW_MOON_LEGS] = { defense: 3, slot: 'leggings', maxDurability: 160 };
  S[HW_MOON_BOOTS] = { defense: 1, slot: 'boots', maxDurability: 140 };
}

function registerWeaponProfiles(): void {
  registerVaultWeaponProfile(asId(HW_KNELL_MAUL), { kind: 'maul', damage: 10, reach: 4.2, cooldownSeconds: 1.05, stagger: 1.1, durabilityCost: 1 });
  registerVaultWeaponProfile(asId(HW_CRESCENT_DAGGERS), { kind: 'daggers', damage: 4, reach: 2.7, cooldownSeconds: 0.34, stagger: 0.18, durabilityCost: 1 });
  registerVaultWeaponProfile(asId(HW_GLEANING_HOOK), { kind: 'hook', damage: 3, reach: 6.5, cooldownSeconds: 0.9, stagger: 0.4, durabilityCost: 1 });
  registerVaultWeaponProfile(asId(HW_RESONANT_BOW), { kind: 'crossbow', damage: 8, reach: 64, cooldownSeconds: 1.0, stagger: 0.3, durabilityCost: 1 });
  registerVaultWeaponProfile(asId(HW_RESONANT_BRANCH), { kind: 'staff', damage: 7, reach: 3.0, cooldownSeconds: 0.9, stagger: 0.35, durabilityCost: 2 });
}

function push(gridSize: 2 | 3, pattern: (BlockType | null)[], type: BlockType, count: number): void {
  RECIPES.push({ gridSize, pattern, output: { type, count } });
}

function registerRecipes(): void {
  const P = asId(HW_IRONWOOD_PLANKS);
  const L = asId(HW_IRONWOOD_LOG);
  const CP = asId(HW_CROWNROOT_PLANKS);
  const CL = asId(HW_CROWNROOT_LOG);
  const CUT = asId(HW_CUT_LIMESTONE);
  const RES = asId(HW_RESIN);
  const STK = BlockType.STICK;
  // Ironwood timber.
  push(2, [L, null, null, null], P, 4);
  push(3, [null, null, null, P, P, P, null, null, null], asId(HW_IRONWOOD_SLAB), 6);
  push(3, [P, null, null, P, P, null, P, P, P], asId(HW_IRONWOOD_STAIRS), 4);
  push(2, [CL, null, null, null], CP, 4);
  // Limestone family.
  push(2, [asId(HW_RESONANT_LIMESTONE), asId(HW_RESONANT_LIMESTONE), asId(HW_RESONANT_LIMESTONE), asId(HW_RESONANT_LIMESTONE)], CUT, 4);
  push(3, [null, null, null, CUT, CUT, CUT, null, null, null], asId(HW_LIMESTONE_SLAB), 6);
  push(2, [CUT, asId(HW_RESONANT_SHARD), null, null], asId(HW_RINGING_STONE), 2);
  // Resin goods.
  push(2, [RES, RES, RES, RES], asId(HW_RESIN_BLOCK), 1);
  push(3, [null, RES, null, RES, BlockType.TORCH, RES, null, RES, null], asId(HW_RESIN_LANTERN), 2);
  // Bell bronze economy: flecks -> ingot -> block/lamp/gear.
  const FLECK = asId(HW_BELL_FLECK);
  const INGOT = asId(HW_BRONZE_INGOT);
  push(2, [FLECK, FLECK, FLECK, FLECK], INGOT, 1);
  push(3, [INGOT, INGOT, INGOT, INGOT, INGOT, INGOT, INGOT, INGOT, INGOT], asId(HW_BELL_BRONZE), 1);
  push(3, [null, INGOT, null, INGOT, BlockType.TORCH, INGOT, null, INGOT, null], asId(HW_BRONZE_LAMP), 2);
  // Briar/root/crownroot building.
  push(2, [BlockType.LEAVES, asId(HW_BRIAR_FIBER), null, null], asId(HW_BRIAR_HEDGE), 2);
  push(2, [L, BlockType.DIRT, null, null], asId(HW_ROOT_BLOCK), 2);
  push(2, [BlockType.DIRT, BlockType.DIRT, BlockType.COBBLESTONE, null], asId(HW_STABLE_PATH), 4);
  push(2, [STK, BlockType.STONE, RES, null], asId(HW_SURVEY_MARKER), 2);
  // Field Salve: hide + moonleaf + resin.
  push(2, [asId(HW_ROOT_HIDE), asId(HW_MOONLEAF), RES, null], asId(HW_FIELD_SALVE), 2);
  // Thorn Buckler: planks + bronze + resin.
  push(3, [null, P, null, P, INGOT, P, null, P, null], asId(HW_THORN_BUCKLER), 1);
  // Knell Maul (Bell-Titan alloy gated).
  const ALLOY = asId(HW_BELL_ALLOY);
  push(3, [ALLOY, ALLOY, ALLOY, ALLOY, STK, ALLOY, null, STK, null], asId(HW_KNELL_MAUL), 1);
  // Crescent Daggers (Stalker moonhide gated).
  const MH = asId(HW_MOONHIDE);
  push(3, [null, MH, null, null, STK, null, null, null, null], asId(HW_CRESCENT_DAGGERS), 1);
  // Resonant Bow (Stag tine gated): twig limbs, fiber string, tine core.
  push(3, [asId(HW_CROWNWOOD_TWIG), asId(HW_BRIAR_FIBER), asId(HW_ANTLER_TINE), asId(HW_CROWNWOOD_TWIG), null, asId(HW_BRIAR_FIBER), asId(HW_CROWNWOOD_TWIG), asId(HW_BRIAR_FIBER), asId(HW_ANTLER_TINE)], asId(HW_RESONANT_BOW), 1);
  // Resonant Branch (arcane staff): twig + shard + stick.
  push(3, [null, asId(HW_RESONANT_SHARD), null, null, asId(HW_CROWNWOOD_TWIG), null, null, STK, null], asId(HW_RESONANT_BRANCH), 1);
  // Armor sets, classic silhouettes.
  armorSet(asId(HW_ROOT_HIDE), HW_ROOTHIDE_HELMET, HW_ROOTHIDE_CHEST, HW_ROOTHIDE_LEGS, HW_ROOTHIDE_BOOTS);
  armorSet(asId(HW_CROWNWOOD_TWIG), HW_CROWN_HELMET, HW_CROWN_CHEST, HW_CROWN_LEGS, HW_CROWN_BOOTS);
  armorSet(MH, HW_MOON_HELMET, HW_MOON_CHEST, HW_MOON_LEGS, HW_MOON_BOOTS);
  // Crimson Almanac (post-Titan): bronze + moonleaf + resin.
  push(3, [null, asId(HW_MOONLEAF), null, INGOT, RES, INGOT, null, INGOT, null], asId(HW_CRIMSON_ALMANAC), 1);
  // Gleaning Hook is a direct Gleaner drop (no recipe); Moonhide armor needs
  // Stalker material, keeping sidegrades honestly gated.
}

function armorSet(mat: BlockType, helmet: number, chest: number, legs: number, boots: number): void {
  const M = mat;
  push(3, [M, M, M, M, null, M, null, null, null], asId(helmet), 1);
  push(3, [M, null, M, M, M, M, M, M, M], asId(chest), 1);
  push(3, [M, M, M, M, null, M, M, null, M], asId(legs), 1);
  push(3, [null, null, null, M, null, M, M, null, M], asId(boots), 1);
}

export function resetHeartwoodContentForTests(): void {
  registered = false;
}
