

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
  CHERRY_SAPLING = 148,

  // --- Slabs (half blocks) ---
  OAK_SLAB = 149,
  SPRUCE_SLAB = 150,
  BIRCH_SLAB = 151,
  CHERRY_SLAB = 152,
  COBBLESTONE_SLAB = 153,
  STONE_SLAB = 154,
  SANDSTONE_SLAB = 155,
  RED_SANDSTONE_SLAB = 156,
  BRICK_SLAB = 157,

  // --- Stairs ---
  OAK_STAIRS = 158,
  SPRUCE_STAIRS = 159,
  BIRCH_STAIRS = 160,
  CHERRY_STAIRS = 161,
  COBBLESTONE_STAIRS = 162,
  STONE_STAIRS = 163,
  SANDSTONE_STAIRS = 164,
  RED_SANDSTONE_STAIRS = 165,
  BRICK_STAIRS = 166,

  // Polarity Boots upgrade (Magnetic Warden drop) + the upgraded boots. IDs in a
  // free low range so they stay within the Uint8Array block-id limit even though
  // they are inventory-only items.
  POLARITY_BOOTS_UPGRADE = 167,
  UPGRADED_POLARITY_BOOTS = 168,

  // Magnetism (Phase 4): magnetic field blocks + iron armor + polarity boots.
  POSITIVE_MAGNET = 190,
  NEGATIVE_MAGNET = 191,
  IRON_HELMET = 192,
  IRON_CHESTPLATE = 193,
  IRON_LEGGINGS = 194,
  IRON_BOOTS = 195,
  POLARITY_BOOTS = 196,
  IRON_BLOCK = 197,
  GOLD_HELMET = 198,
  GOLD_CHESTPLATE = 199,
  GOLD_LEGGINGS = 200,
  GOLD_BOOTS = 201,
  DIAMOND_HELMET = 202,
  DIAMOND_CHESTPLATE = 203,
  DIAMOND_LEGGINGS = 204,
  DIAMOND_BOOTS = 205,
  COPPER_HELMET = 206,
  COPPER_CHESTPLATE = 207,
  COPPER_LEGGINGS = 208,
  COPPER_BOOTS = 209,

  // Packed Ice (denser ice for Ice Spikes biome)
  PACKED_ICE = 210,

  // --- Biome-specific surface blocks (Task ID 5) ---
  // Grass-topped biome blocks (each uses a top + side texture pair)
  MOSSY_GRASS = 211,       // Birch Forest
  LUSH_GRASS = 212,        // Flower Forest
  DARK_GRASS = 213,        // Dark Forest
  MEADOW_GRASS = 214,      // Meadow
  SAVANNA_GRASS = 215,     // Savanna
  JUNGLE_GRASS = 216,      // Jungle
  PODZOL = 217,            // Taiga
  // Mountain stone variants
  ANDESITE = 218,
  DIORITE = 219,
  GRANITE = 220,
  // Other biome surfaces
  COARSE_DIRT = 221,       // Dead Forest
  MUD = 222,               // Swamp
  MOSSY_COBBLESTONE = 223, // Stone Shore

  // --- New tree wood families (Task ID 6): Jungle, Dark Oak, Acacia ---
  // Each family: LOG, LEAVES, PLANKS, SAPLING, SLAB, STAIRS
  JUNGLE_LOG = 224,
  JUNGLE_LEAVES = 225,
  JUNGLE_PLANKS = 226,
  JUNGLE_SAPLING = 227,
  JUNGLE_SLAB = 228,
  JUNGLE_STAIRS = 229,

  DARK_OAK_LOG = 230,
  DARK_OAK_LEAVES = 231,
  DARK_OAK_PLANKS = 232,
  DARK_OAK_SAPLING = 233,
  DARK_OAK_SLAB = 234,
  DARK_OAK_STAIRS = 235,

  ACACIA_LOG = 236,
  ACACIA_LEAVES = 237,
  ACACIA_PLANKS = 238,
  ACACIA_SAPLING = 239,
  ACACIA_SLAB = 240,
  ACACIA_STAIRS = 241,

  // --- Magnetic Fields biome (signature terrain + traversal + boss content) ---
  // Magnetite Block: plain gray metallic terrain block (NOT a magnetic source).
  MAGNETITE_BLOCK = 242,
  // Resource crystals (cross-plane, red = positive, blue = negative).
  POSITIVE_MAGNETITE_CRYSTAL = 243,
  NEGATIVE_MAGNETITE_CRYSTAL = 244,
  // Hazard spike (cross-plane, multiplies fall damage on landing).
  MAGNETIC_SPIKE = 245,
  // Arena content blocks.
  MAGNETIC_BOSS_SUMMONER = 246,
  MAGNETIC_SHIELD_CRYSTAL = 247,
  // Contrast decoration: emissive accent block + bright cross-plane shard.
  CHARGED_MAGNETITE = 248,
  MAGNETITE_SHARD = 249,

  // --- Magnetite building set (for the Magnetic Warden arena) ---
  MAGNETITE_SLAB = 250,
  MAGNETITE_STAIRS = 251,
  MAGNETITE_BRICKS = 252,
  MAGNETITE_BRICK_SLAB = 253,
  MAGNETITE_BRICK_STAIRS = 254,
  CHISELED_MAGNETITE = 255
  // NOTE: the solid "Positive/Negative Magnetite Block" traversal sources reuse
  // the existing POSITIVE_MAGNET (190) / NEGATIVE_MAGNET (191) ids for save
  // compatibility; only their user-facing names are magnetite-themed.
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

  // Non-cube shapes (slabs, stairs). The block is rendered/collided as a set of
  // partial AABBs (see systems/world/blockShapes.ts) instead of a full cube.
  shape?: 'slab' | 'stairs';
  // For shaped blocks, resolve textures as if this parent block (so e.g. a
  // sandstone slab gets sandstone's top/side faces). Defaults to the block itself.
  textureParent?: BlockType;
  
  // Food Properties
  nutrition?: number; // Hunger restored
  saturationModifier?: number; // Saturation restored = nutrition * modifier * 2
}

// Optional per-item-instance data. Absent on ordinary stackable commodities
// (so existing behavior and saves are unchanged); present on items that carry
// state such as durability or rolled stats. Serializes with the inventory.
export interface ItemInstance {
  durability?: number;
  maxDurability?: number;
  /** Stat overrides that take precedence over the static ITEM_STATS registry. */
  stats?: ItemStats;
  /** Freeform tags, e.g. build-archetype affinity ('mobility', 'relic'). */
  tags?: string[];
}

export interface ItemStats {
  /** Melee damage dealt to entities (half-hearts). */
  attack?: number;
  /** Incoming-damage reduction when equipped (future armor). */
  defense?: number;
  /** Equipment slot this item occupies, if any. */
  slot?: EquipmentSlot;
  /** Max durability (uses) for tools/weapons; absent = unbreakable. */
  maxDurability?: number;
}

export type EquipmentSlot = 'helmet' | 'chestplate' | 'leggings' | 'boots' | 'accessory';

export interface ItemStack {
  type: BlockType;
  count: number;
  instance?: ItemInstance;
}

export interface Drop {
    id: string;
    type: BlockType;
    count: number;
    instance?: ItemInstance;
    position: [number, number, number];
    velocity: [number, number, number];
    createdAt: number;
    pickupDelay: number; // Timestamp when it can be picked up
    // Despawn clock (ms). Like Minecraft item entities, this only advances while the
    // drop is in a loaded chunk near the player; it pauses when the player wanders
    // far, so leaving the area never deletes a drop. Despawns at DROP_LIFETIME_MS.
    age: number;
}

export type GameMode = 'survival' | 'creative' | 'spectator';

export interface BreakingVisual {
    pos: [number, number, number];
    progress: number;
    noDrop: boolean;
}

export interface ContainerLocation {
    x: number;
    y: number;
    z: number;
}

export type OpenContainer =
    | { type: 'inventory' }
    | { type: 'creative' }
    | ({ type: 'crafting' } & ContainerLocation)
    | ({ type: 'furnace' } & ContainerLocation)
    | ({ type: 'chest' } & ContainerLocation)
    | ({ type: 'boss_confirm'; bossId: string; regionId: string | null } & ContainerLocation);

export type OpenContainerState = OpenContainer | null;

export type InventoryCollection =
    | 'inventory'
    | 'crafting'
    | 'output'
    | 'creative'
    | 'chest'
    | 'furnace_input'
    | 'furnace_fuel'
    | 'furnace_output'
    | 'none';

export type InventoryAction =
    | 'click'
    | 'right_click'
    | 'middle_click'
    | 'shift_click'
    | 'swap_hotbar'
    | 'drop_key'
    | 'drop_cursor'
    | 'drag_end'
    | 'double_click';

export interface CreativeInventoryActionData {
    creativeItem: ItemStack;
}

export interface HotbarSwapActionData {
    hotbarIdx: number;
}

export interface DropKeyActionData {
    dropAll: boolean;
}

export interface DragTargetSlot {
    collection: Exclude<InventoryCollection, 'none'>;
    index: number;
}

export interface DragEndActionData {
    mode: 'split' | 'one';
    slots: DragTargetSlot[];
    startStack: ItemStack;
}

export type InventoryActionData =
    | CreativeInventoryActionData
    | HotbarSwapActionData
    | DropKeyActionData
    | DragEndActionData;

export type InventoryActionHandler = (
    action: InventoryAction,
    collection: InventoryCollection,
    index: number,
    data?: InventoryActionData,
) => void;
