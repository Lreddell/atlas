

export enum BlockType {
  AIR = 0,
  DIRT = 1,
  GRASS = 2,
  STONE = 3,
  LEAVES = 5,
  SAND = 6,
  WATER = 7,
  BEDROCK = 8,
  LOG = 9,
  OAK_PLANKS = 10,
  BRICK = 11,
  COBBLESTONE = 12,
  GLASS = 13,
  COAL_ORE = 14,
  IRON_ORE = 15,
  CRAFTING_TABLE = 16,
  FURNACE = 17,
  FURNACE_ACTIVE = 18,
  CHEST = 19,
  TORCH = 20,
  COPPER_ORE = 21,
  LAVA = 22,
  WOOL = 23,
  BED_FOOT = 24,
  BED_HEAD = 25,
  OBSIDIAN = 26,
  
  // New Biome Blocks
  SANDSTONE = 27,
  SNOW_BLOCK = 28,
  ICE = 29,
  CACTUS = 30,
  DEAD_BUSH = 31,
  SPRUCE_LOG = 32,
  SPRUCE_LEAVES = 33,
  SNOWY_GRASS = 34,
  SPRUCE_PLANKS = 35,
  
  // Plants
  GRASS_PLANT = 36,
  ROSE = 37,
  DANDELION = 38,
  
  // Debug
  DEBUG_CROSS = 39,

  // --- NEW BIOME BLOCKS v2 ---
  // Cherry Grove
  CHERRY_LOG = 40,
  CHERRY_LEAVES = 41,
  CHERRY_PLANKS = 42,
  PINK_FLOWER = 86,
  
  // Red Mesa
  RED_SAND = 43,
  RED_SANDSTONE = 44,
  TERRACOTTA = 45,
  TERRACOTTA_YELLOW = 46,
  TERRACOTTA_RED = 47,
  // Expanded Terracotta
  TERRACOTTA_WHITE = 91,
  TERRACOTTA_ORANGE = 92,
  TERRACOTTA_MAGENTA = 93,
  TERRACOTTA_LIGHT_GRAY = 94,
  TERRACOTTA_BROWN = 95,

  // Volcanic
  BASALT = 48,
  MAGMA = 49,

  // Forest / Birch
  BIRCH_LOG = 87,
  BIRCH_LEAVES = 88,
  BIRCH_PLANKS = 89,

  // New Ores
  GOLD_ORE = 96,
  DIAMOND_ORE = 97,
  LAPIS_ORE = 98,
  EMERALD_ORE = 99,
  
  // Items
  WOOD_PICKAXE = 100,
  STONE_PICKAXE = 101,
  IRON_PICKAXE = 102,
  STICK = 103,
  
  WOOD_AXE = 104,
  STONE_AXE = 105,
  IRON_AXE = 106,
  
  WOOD_SHOVEL = 107,
  STONE_SHOVEL = 108,
  IRON_SHOVEL = 109,
  
  COAL = 110,
  IRON_INGOT = 111,
  APPLE = 112,
  SAPLING = 113,
  RAW_IRON = 114,
  CHARCOAL = 115,

  COPPER_INGOT = 116,
  RAW_COPPER = 117,
  COPPER_PICKAXE = 118,
  COPPER_AXE = 119,
  COPPER_SHOVEL = 120,
  
  BED_ITEM = 121,
  WHEAT_SEEDS = 122,

  // New Items
  RAW_GOLD = 123,
  GOLD_INGOT = 124,
  DIAMOND = 125,
  LAPIS_LAZULI = 126,
  EMERALD = 127,

  // Missing Tools
  WOOD_SWORD = 128,
  WOOD_HOE = 129,
  
  STONE_SWORD = 130,
  STONE_HOE = 131,
  
  IRON_SWORD = 132,
  IRON_HOE = 133,
  
  GOLD_PICKAXE = 134,
  GOLD_AXE = 135,
  GOLD_SHOVEL = 136,
  GOLD_SWORD = 137,
  GOLD_HOE = 138,
  
  DIAMOND_PICKAXE = 139,
  DIAMOND_AXE = 140,
  DIAMOND_SHOVEL = 141,
  DIAMOND_SWORD = 142,
  DIAMOND_HOE = 143,
  
  COPPER_SWORD = 144,
  COPPER_HOE = 145,

  // Saplings (species-specific)
  SPRUCE_SAPLING = 146,
  BIRCH_SAPLING = 147,
  CHERRY_SAPLING = 148
}

export type ToolType = 'pickaxe' | 'axe' | 'shovel' | 'none';
export type ToolTier = 0 | 1 | 2 | 3 | 4; // 0: Hand, 1: Wood, 2: Stone, 3: Iron/Copper, 4: Diamond/Gold
export type CreativeTab = 'building' | 'natural' | 'functional' | 'tools' | 'food' | 'ingredients';

export interface DropEntry {
    type: BlockType;
    chance: number; // 0-1
    min: number;
    max: number;
}

export interface BlockDef {
  id: BlockType;
  color: string;
  name: string;
  transparent?: boolean;
  textureSlot?: number; 
  hardness: number; 
  isItem?: boolean; 
  toolSpeed?: number; 
  toolType?: ToolType; 
  toolTier?: ToolTier;
  preferredTool?: ToolType; 
  minHarvestTier?: number; // Tier required to get a drop
  drops?: DropEntry[]; 
  isFuel?: boolean;
  fuelValue?: number; // Duration in ms
  smeltsInto?: BlockType;
  lightLevel?: number; // 0-15 Emission
  noCollision?: boolean;
  category?: CreativeTab;
  soundGroup?: string; // Optional sound group override
  
  // Food Properties
  nutrition?: number; // Hunger restored
  saturationModifier?: number; // Saturation restored = nutrition * modifier * 2
}

export interface ItemStack {
  type: BlockType;
  count: number;
}

export interface Drop {
    id: string;
    type: BlockType;
    count: number;
    position: [number, number, number];
    velocity: [number, number, number];
    createdAt: number;
    pickupDelay: number; // Timestamp when it can be picked up
}