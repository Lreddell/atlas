

import { BlockType, BlockDef } from '../types';

export const BLOCKS: Record<BlockType, BlockDef> = {
  [BlockType.AIR]: { id: BlockType.AIR, color: '', name: 'Air', transparent: true, hardness: 0 },
  [BlockType.BEDROCK]: { id: BlockType.BEDROCK, color: '#212121', name: 'Bedrock', textureSlot: 6, hardness: Infinity, category: 'natural' },
  [BlockType.DIRT]: { id: BlockType.DIRT, color: '#5d4037', name: 'Dirt', textureSlot: 0, hardness: 0.5, preferredTool: 'shovel', category: 'natural' },
  [BlockType.GRASS]: { 
      id: BlockType.GRASS, color: '#388e3c', name: 'Grass', textureSlot: 1, hardness: 0.6, preferredTool: 'shovel',
      drops: [{ type: BlockType.DIRT, chance: 1, min: 1, max: 1 }], category: 'natural'
  },
  [BlockType.SAND]: { id: BlockType.SAND, color: '#fbc02d', name: 'Sand', textureSlot: 5, hardness: 0.5, preferredTool: 'shovel', smeltsInto: BlockType.GLASS, category: 'natural' },
  [BlockType.STONE]: { 
      id: BlockType.STONE, color: '#757575', name: 'Stone', textureSlot: 2, hardness: 1.5, preferredTool: 'pickaxe', minHarvestTier: 1,
      drops: [{ type: BlockType.COBBLESTONE, chance: 1, min: 1, max: 1 }],
      smeltsInto: BlockType.STONE, category: 'building'
  },
  [BlockType.COBBLESTONE]: { id: BlockType.COBBLESTONE, color: '#616161', name: 'Cobblestone', textureSlot: 10, hardness: 2.0, preferredTool: 'pickaxe', minHarvestTier: 1, smeltsInto: BlockType.STONE, category: 'building' },
  [BlockType.BRICK]: { id: BlockType.BRICK, color: '#b71c1c', name: 'Brick', textureSlot: 9, hardness: 2.0, preferredTool: 'pickaxe', minHarvestTier: 1, category: 'building' },
  [BlockType.LOG]: { id: BlockType.LOG, color: '#3e2723', name: 'Oak Log', textureSlot: 7, hardness: 2.0, preferredTool: 'axe', isFuel: true, fuelValue: 15000, smeltsInto: BlockType.CHARCOAL, category: 'natural' },
  [BlockType.OAK_PLANKS]: { id: BlockType.OAK_PLANKS, color: '#8d6e63', name: 'Oak Planks', textureSlot: 8, hardness: 2.0, preferredTool: 'axe', isFuel: true, fuelValue: 15000, category: 'building' },
  [BlockType.GLASS]: { id: BlockType.GLASS, color: '#81d4fa', name: 'Glass', transparent: true, textureSlot: 11, hardness: 0.3, minHarvestTier: 100, category: 'building' },
  [BlockType.LEAVES]: { 
      id: BlockType.LEAVES, color: '#2e7d32', name: 'Leaves', transparent: true, textureSlot: 4, hardness: 0.2,
      drops: [
          { type: BlockType.SAPLING, chance: 0.05, min: 1, max: 1 },
          { type: BlockType.APPLE, chance: 0.02, min: 1, max: 1 },
          { type: BlockType.STICK, chance: 0.1, min: 1, max: 2 }
      ], category: 'natural'
  },
  [BlockType.WATER]: { id: BlockType.WATER, color: '#0288d1', name: 'Water', transparent: true, textureSlot: 14, hardness: 100, category: 'natural' },
  [BlockType.LAVA]: { id: BlockType.LAVA, color: '#d32f2f', name: 'Lava', textureSlot: 17, hardness: 100, lightLevel: 15, noCollision: true, category: 'natural' },
  [BlockType.OBSIDIAN]: { id: BlockType.OBSIDIAN, color: '#120b1c', name: 'Obsidian', textureSlot: 26, hardness: 50, preferredTool: 'pickaxe', minHarvestTier: 3, category: 'building' },
  
  [BlockType.WOOL]: { id: BlockType.WOOL, color: '#eeeeee', name: 'Wool', textureSlot: 64, hardness: 0.8, preferredTool: 'axe', category: 'building' },

  // --- NEW BIOME BLOCKS ---
  [BlockType.SANDSTONE]: { id: BlockType.SANDSTONE, color: '#e6c27e', name: 'Sandstone', textureSlot: 18, hardness: 0.8, preferredTool: 'pickaxe', minHarvestTier: 1, category: 'building' },
  [BlockType.SNOW_BLOCK]: { id: BlockType.SNOW_BLOCK, color: '#ffffff', name: 'Snow Block', textureSlot: 19, hardness: 0.2, preferredTool: 'shovel', category: 'natural' },
  [BlockType.ICE]: { id: BlockType.ICE, color: '#90caf9', name: 'Ice', textureSlot: 20, hardness: 0.5, transparent: true, category: 'natural' },
  [BlockType.CACTUS]: { id: BlockType.CACTUS, color: '#4caf50', name: 'Cactus', textureSlot: 21, hardness: 0.4, category: 'natural', noCollision: false }, // Opaque solid block
  [BlockType.DEAD_BUSH]: { 
      id: BlockType.DEAD_BUSH, color: '#6d4c41', name: 'Dead Bush', textureSlot: 22, hardness: 0, transparent: true, noCollision: true, 
      drops: [{ type: BlockType.STICK, chance: 0.5, min: 0, max: 2 }], category: 'natural' 
  },
  [BlockType.SPRUCE_LOG]: { id: BlockType.SPRUCE_LOG, color: '#3e2723', name: 'Spruce Log', textureSlot: 23, hardness: 2.0, preferredTool: 'axe', isFuel: true, fuelValue: 15000, smeltsInto: BlockType.CHARCOAL, category: 'natural' },
  [BlockType.SPRUCE_LEAVES]: { 
      id: BlockType.SPRUCE_LEAVES, color: '#1b5e20', name: 'Spruce Leaves', transparent: true, textureSlot: 24, hardness: 0.2, 
      drops: [{ type: BlockType.STICK, chance: 0.1, min: 1, max: 2 }], category: 'natural' 
  },
  [BlockType.SNOWY_GRASS]: { 
      id: BlockType.SNOWY_GRASS, color: '#ffffff', name: 'Snowy Grass', textureSlot: 25, hardness: 0.6, preferredTool: 'shovel',
      drops: [{ type: BlockType.DIRT, chance: 1, min: 1, max: 1 }], category: 'natural'
  },
  [BlockType.SPRUCE_PLANKS]: { id: BlockType.SPRUCE_PLANKS, color: '#5d4037', name: 'Spruce Planks', textureSlot: 27, hardness: 2.0, preferredTool: 'axe', isFuel: true, fuelValue: 15000, category: 'building' },

  // --- FOREST / BIRCH ---
  [BlockType.BIRCH_LOG]: { id: BlockType.BIRCH_LOG, color: '#e3dfd3', name: 'Birch Log', textureSlot: 87, hardness: 2.0, preferredTool: 'axe', isFuel: true, fuelValue: 15000, smeltsInto: BlockType.CHARCOAL, category: 'natural' },
  [BlockType.BIRCH_LEAVES]: { 
      id: BlockType.BIRCH_LEAVES, color: '#81c784', name: 'Birch Leaves', transparent: true, textureSlot: 89, hardness: 0.2, 
      drops: [
          { type: BlockType.SAPLING, chance: 0.05, min: 1, max: 1 }, 
          { type: BlockType.STICK, chance: 0.1, min: 1, max: 2 }
      ], 
      category: 'natural' 
  },
  [BlockType.BIRCH_PLANKS]: { id: BlockType.BIRCH_PLANKS, color: '#fff9c4', name: 'Birch Planks', textureSlot: 90, hardness: 2.0, preferredTool: 'axe', isFuel: true, fuelValue: 15000, category: 'building' },

  // --- CHERRY GROVE ---
  [BlockType.CHERRY_LOG]: { id: BlockType.CHERRY_LOG, color: '#3e1e24', name: 'Cherry Log', textureSlot: 74, hardness: 2.0, preferredTool: 'axe', isFuel: true, fuelValue: 15000, smeltsInto: BlockType.CHARCOAL, category: 'natural' },
  [BlockType.CHERRY_LEAVES]: { 
      id: BlockType.CHERRY_LEAVES, color: '#f8bbd0', name: 'Cherry Leaves', transparent: true, textureSlot: 76, hardness: 0.2, 
      drops: [{ type: BlockType.STICK, chance: 0.1, min: 1, max: 2 }], category: 'natural' 
  },
  [BlockType.CHERRY_PLANKS]: { id: BlockType.CHERRY_PLANKS, color: '#f48fb1', name: 'Cherry Planks', textureSlot: 77, hardness: 2.0, preferredTool: 'axe', isFuel: true, fuelValue: 15000, category: 'building' },
  [BlockType.PINK_FLOWER]: { id: BlockType.PINK_FLOWER, color: '#f48fb1', name: 'Pink Petals', textureSlot: 86, hardness: 0, transparent: true, noCollision: true, category: 'natural' },

  // --- RED MESA ---
  [BlockType.RED_SAND]: { id: BlockType.RED_SAND, color: '#d84315', name: 'Red Sand', textureSlot: 78, hardness: 0.5, preferredTool: 'shovel', smeltsInto: BlockType.GLASS, category: 'natural' },
  [BlockType.RED_SANDSTONE]: { id: BlockType.RED_SANDSTONE, color: '#bf360c', name: 'Red Sandstone', textureSlot: 79, hardness: 0.8, preferredTool: 'pickaxe', minHarvestTier: 1, category: 'building' },
  [BlockType.TERRACOTTA]: { id: BlockType.TERRACOTTA, color: '#a1887f', name: 'Terracotta', textureSlot: 80, hardness: 1.25, preferredTool: 'pickaxe', minHarvestTier: 1, category: 'building' },
  [BlockType.TERRACOTTA_YELLOW]: { id: BlockType.TERRACOTTA_YELLOW, color: '#fbc02d', name: 'Yellow Terracotta', textureSlot: 81, hardness: 1.25, preferredTool: 'pickaxe', minHarvestTier: 1, category: 'building' },
  [BlockType.TERRACOTTA_RED]: { id: BlockType.TERRACOTTA_RED, color: '#8d6e63', name: 'Red Terracotta', textureSlot: 82, hardness: 1.25, preferredTool: 'pickaxe', minHarvestTier: 1, category: 'building' },
  [BlockType.TERRACOTTA_WHITE]: { id: BlockType.TERRACOTTA_WHITE, color: '#d1b1a1', name: 'White Terracotta', textureSlot: 91, hardness: 1.25, preferredTool: 'pickaxe', minHarvestTier: 1, category: 'building' },
  [BlockType.TERRACOTTA_ORANGE]: { id: BlockType.TERRACOTTA_ORANGE, color: '#a05425', name: 'Orange Terracotta', textureSlot: 92, hardness: 1.25, preferredTool: 'pickaxe', minHarvestTier: 1, category: 'building' },
  [BlockType.TERRACOTTA_MAGENTA]: { id: BlockType.TERRACOTTA_MAGENTA, color: '#95576c', name: 'Magenta Terracotta', textureSlot: 93, hardness: 1.25, preferredTool: 'pickaxe', minHarvestTier: 1, category: 'building' },
  [BlockType.TERRACOTTA_LIGHT_GRAY]: { id: BlockType.TERRACOTTA_LIGHT_GRAY, color: '#876b62', name: 'Light Gray Terracotta', textureSlot: 94, hardness: 1.25, preferredTool: 'pickaxe', minHarvestTier: 1, category: 'building' },
  [BlockType.TERRACOTTA_BROWN]: { id: BlockType.TERRACOTTA_BROWN, color: '#4d3323', name: 'Brown Terracotta', textureSlot: 95, hardness: 1.25, preferredTool: 'pickaxe', minHarvestTier: 1, category: 'building' },

  // --- VOLCANIC ---
  [BlockType.BASALT]: { id: BlockType.BASALT, color: '#424242', name: 'Basalt', textureSlot: 83, hardness: 1.25, preferredTool: 'pickaxe', minHarvestTier: 1, category: 'building' },
  [BlockType.MAGMA]: { id: BlockType.MAGMA, color: '#ff7043', name: 'Magma Block', textureSlot: 85, hardness: 0.5, preferredTool: 'pickaxe', lightLevel: 3, category: 'natural' },

  // --- PLANTS ---
  [BlockType.GRASS_PLANT]: { 
      id: BlockType.GRASS_PLANT, color: '#388e3c', name: 'Grass', textureSlot: 29, hardness: 0, transparent: true, noCollision: true, 
      drops: [{ type: BlockType.WHEAT_SEEDS, chance: 0.125, min: 1, max: 1 }], category: 'natural' 
  },
  [BlockType.ROSE]: { id: BlockType.ROSE, color: '#d32f2f', name: 'Rose', textureSlot: 30, hardness: 0, transparent: true, noCollision: true, category: 'natural' },
  [BlockType.DANDELION]: { id: BlockType.DANDELION, color: '#fbc02d', name: 'Dandelion', textureSlot: 31, hardness: 0, transparent: true, noCollision: true, category: 'natural' },

  // --- DEBUG ---
  [BlockType.DEBUG_CROSS]: { id: BlockType.DEBUG_CROSS, color: '#ff00ff', name: 'Debug Cross', textureSlot: 72, hardness: 0, transparent: true, noCollision: true, category: 'building' },

  // --- ORES ---
  [BlockType.COAL_ORE]: { 
      id: BlockType.COAL_ORE, color: '#212121', name: 'Coal Ore', textureSlot: 15, hardness: 3.0, preferredTool: 'pickaxe', minHarvestTier: 1,
      drops: [{ type: BlockType.COAL, chance: 1, min: 1, max: 1 }], category: 'natural'
  },
  [BlockType.IRON_ORE]: { 
      id: BlockType.IRON_ORE, color: '#d7ccc8', name: 'Iron Ore', textureSlot: 16, hardness: 3.0, preferredTool: 'pickaxe', minHarvestTier: 2, 
      drops: [{ type: BlockType.RAW_IRON, chance: 1, min: 1, max: 1 }], category: 'natural'
  },
  [BlockType.COPPER_ORE]: { 
      id: BlockType.COPPER_ORE, color: '#e67e22', name: 'Copper Ore', textureSlot: 58, hardness: 3.0, preferredTool: 'pickaxe', minHarvestTier: 2,
      drops: [{ type: BlockType.RAW_COPPER, chance: 1, min: 2, max: 5 }], category: 'natural'
  },
  [BlockType.GOLD_ORE]: {
      id: BlockType.GOLD_ORE, color: '#fdd835', name: 'Gold Ore', textureSlot: 96, hardness: 3.0, preferredTool: 'pickaxe', minHarvestTier: 3,
      drops: [{ type: BlockType.RAW_GOLD, chance: 1, min: 1, max: 1 }], category: 'natural'
  },
  [BlockType.DIAMOND_ORE]: {
      id: BlockType.DIAMOND_ORE, color: '#00bcd4', name: 'Diamond Ore', textureSlot: 97, hardness: 3.0, preferredTool: 'pickaxe', minHarvestTier: 3,
      drops: [{ type: BlockType.DIAMOND, chance: 1, min: 1, max: 1 }], category: 'natural'
  },
  [BlockType.LAPIS_ORE]: {
      id: BlockType.LAPIS_ORE, color: '#1a237e', name: 'Lapis Ore', textureSlot: 98, hardness: 3.0, preferredTool: 'pickaxe', minHarvestTier: 2,
      drops: [{ type: BlockType.LAPIS_LAZULI, chance: 1, min: 4, max: 9 }], category: 'natural'
  },
  [BlockType.EMERALD_ORE]: {
      id: BlockType.EMERALD_ORE, color: '#00e676', name: 'Emerald Ore', textureSlot: 99, hardness: 3.0, preferredTool: 'pickaxe', minHarvestTier: 3,
      drops: [{ type: BlockType.EMERALD, chance: 1, min: 1, max: 1 }], category: 'natural'
  },
  
  [BlockType.CRAFTING_TABLE]: { id: BlockType.CRAFTING_TABLE, color: '#8d6e63', name: 'Crafting Table', textureSlot: 43, hardness: 2.5, preferredTool: 'axe', isFuel: true, fuelValue: 15000, category: 'functional' },
  [BlockType.FURNACE]: { id: BlockType.FURNACE, color: '#616161', name: 'Furnace', textureSlot: 44, hardness: 3.5, preferredTool: 'pickaxe', minHarvestTier: 1, category: 'functional' },
  [BlockType.FURNACE_ACTIVE]: { 
      id: BlockType.FURNACE_ACTIVE, color: '#616161', name: 'Furnace', textureSlot: 47, hardness: 3.5, preferredTool: 'pickaxe', minHarvestTier: 1,
      drops: [{ type: BlockType.FURNACE, chance: 1, min: 1, max: 1 }]
  },
  [BlockType.CHEST]: { id: BlockType.CHEST, color: '#8d6e63', name: 'Chest', textureSlot: 52, hardness: 2.5, preferredTool: 'axe', isFuel: true, fuelValue: 15000, category: 'functional' },
  [BlockType.TORCH]: { id: BlockType.TORCH, color: '#ffd600', name: 'Torch', textureSlot: 56, hardness: 0, transparent: true, lightLevel: 14, noCollision: true, category: 'functional' },
  
  [BlockType.BED_FOOT]: { 
      id: BlockType.BED_FOOT, color: '#c62828', name: 'Bed', textureSlot: 65, hardness: 0.2, transparent: true, 
      drops: [{ type: BlockType.BED_ITEM, chance: 1, min: 1, max: 1 }]
  },
  [BlockType.BED_HEAD]: { 
      id: BlockType.BED_HEAD, color: '#c62828', name: 'Bed', textureSlot: 66, hardness: 0.2, transparent: true,
      drops: [{ type: BlockType.BED_ITEM, chance: 1, min: 1, max: 1 }]
  },
  [BlockType.BED_ITEM]: { id: BlockType.BED_ITEM, color: '#c62828', name: 'Bed', textureSlot: 67, hardness: 0, isItem: true, category: 'functional' },

  [BlockType.WOOD_PICKAXE]: { id: BlockType.WOOD_PICKAXE, color: '#8d6e63', name: 'Wood Pickaxe', textureSlot: 32, hardness: 0, isItem: true, toolSpeed: 2.0, toolType: 'pickaxe', toolTier: 1, isFuel: true, fuelValue: 10000, category: 'tools' },
  [BlockType.STONE_PICKAXE]: { id: BlockType.STONE_PICKAXE, color: '#757575', name: 'Stone Pickaxe', textureSlot: 33, hardness: 0, isItem: true, toolSpeed: 4.0, toolType: 'pickaxe', toolTier: 2, category: 'tools' },
  [BlockType.IRON_PICKAXE]: { id: BlockType.IRON_PICKAXE, color: '#d7ccc8', name: 'Iron Pickaxe', textureSlot: 34, hardness: 0, isItem: true, toolSpeed: 6.0, toolType: 'pickaxe', toolTier: 3, category: 'tools' },
  [BlockType.COPPER_PICKAXE]: { id: BlockType.COPPER_PICKAXE, color: '#e67e22', name: 'Copper Pickaxe', textureSlot: 61, hardness: 0, isItem: true, toolSpeed: 8.0, toolType: 'pickaxe', toolTier: 2, category: 'tools' },

  [BlockType.WOOD_AXE]: { id: BlockType.WOOD_AXE, color: '#8d6e63', name: 'Wood Axe', textureSlot: 36, hardness: 0, isItem: true, toolSpeed: 2.0, toolType: 'axe', toolTier: 1, isFuel: true, fuelValue: 10000, category: 'tools' },
  [BlockType.STONE_AXE]: { id: BlockType.STONE_AXE, color: '#757575', name: 'Stone Axe', textureSlot: 37, hardness: 0, isItem: true, toolSpeed: 4.0, toolType: 'axe', toolTier: 2, category: 'tools' },
  [BlockType.IRON_AXE]: { id: BlockType.IRON_AXE, color: '#d7ccc8', name: 'Iron Axe', textureSlot: 38, hardness: 0, isItem: true, toolSpeed: 6.0, toolType: 'axe', toolTier: 3, category: 'tools' },
  [BlockType.COPPER_AXE]: { id: BlockType.COPPER_AXE, color: '#e67e22', name: 'Copper Axe', textureSlot: 62, hardness: 0, isItem: true, toolSpeed: 8.0, toolType: 'axe', toolTier: 2, category: 'tools' },

  [BlockType.WOOD_SHOVEL]: { id: BlockType.WOOD_SHOVEL, color: '#8d6e63', name: 'Wood Shovel', textureSlot: 39, hardness: 0, isItem: true, toolSpeed: 2.0, toolType: 'shovel', toolTier: 1, isFuel: true, fuelValue: 10000, category: 'tools' },
  [BlockType.STONE_SHOVEL]: { id: BlockType.STONE_SHOVEL, color: '#757575', name: 'Stone Shovel', textureSlot: 40, hardness: 0, isItem: true, toolSpeed: 4.0, toolType: 'shovel', toolTier: 2, category: 'tools' },
  [BlockType.IRON_SHOVEL]: { id: BlockType.IRON_SHOVEL, color: '#d7ccc8', name: 'Iron Shovel', textureSlot: 41, hardness: 0, isItem: true, toolSpeed: 6.0, toolType: 'shovel', toolTier: 3, category: 'tools' },
  [BlockType.COPPER_SHOVEL]: { id: BlockType.COPPER_SHOVEL, color: '#e67e22', name: 'Copper Shovel', textureSlot: 63, hardness: 0, isItem: true, toolSpeed: 8.0, toolType: 'shovel', toolTier: 2, category: 'tools' },

  [BlockType.WOOD_SWORD]: { id: BlockType.WOOD_SWORD, color: '#8d6e63', name: 'Wood Sword', textureSlot: 105, hardness: 0, isItem: true, category: 'tools' },
  [BlockType.WOOD_HOE]: { id: BlockType.WOOD_HOE, color: '#8d6e63', name: 'Wood Hoe', textureSlot: 106, hardness: 0, isItem: true, category: 'tools' },
  
  [BlockType.STONE_SWORD]: { id: BlockType.STONE_SWORD, color: '#757575', name: 'Stone Sword', textureSlot: 107, hardness: 0, isItem: true, category: 'tools' },
  [BlockType.STONE_HOE]: { id: BlockType.STONE_HOE, color: '#757575', name: 'Stone Hoe', textureSlot: 108, hardness: 0, isItem: true, category: 'tools' },
  
  [BlockType.IRON_SWORD]: { id: BlockType.IRON_SWORD, color: '#d7ccc8', name: 'Iron Sword', textureSlot: 109, hardness: 0, isItem: true, category: 'tools' },
  [BlockType.IRON_HOE]: { id: BlockType.IRON_HOE, color: '#d7ccc8', name: 'Iron Hoe', textureSlot: 110, hardness: 0, isItem: true, category: 'tools' },
  
  [BlockType.COPPER_SWORD]: { id: BlockType.COPPER_SWORD, color: '#e67e22', name: 'Copper Sword', textureSlot: 111, hardness: 0, isItem: true, category: 'tools' },
  [BlockType.COPPER_HOE]: { id: BlockType.COPPER_HOE, color: '#e67e22', name: 'Copper Hoe', textureSlot: 112, hardness: 0, isItem: true, category: 'tools' },

  [BlockType.GOLD_PICKAXE]: { id: BlockType.GOLD_PICKAXE, color: '#fbc02d', name: 'Gold Pickaxe', textureSlot: 113, hardness: 0, isItem: true, toolSpeed: 12.0, toolType: 'pickaxe', toolTier: 1, category: 'tools' },
  [BlockType.GOLD_AXE]: { id: BlockType.GOLD_AXE, color: '#fbc02d', name: 'Gold Axe', textureSlot: 114, hardness: 0, isItem: true, toolSpeed: 12.0, toolType: 'axe', toolTier: 1, category: 'tools' },
  [BlockType.GOLD_SHOVEL]: { id: BlockType.GOLD_SHOVEL, color: '#fbc02d', name: 'Gold Shovel', textureSlot: 115, hardness: 0, isItem: true, toolSpeed: 12.0, toolType: 'shovel', toolTier: 1, category: 'tools' },
  [BlockType.GOLD_SWORD]: { id: BlockType.GOLD_SWORD, color: '#fbc02d', name: 'Gold Sword', textureSlot: 116, hardness: 0, isItem: true, category: 'tools' },
  [BlockType.GOLD_HOE]: { id: BlockType.GOLD_HOE, color: '#fbc02d', name: 'Gold Hoe', textureSlot: 117, hardness: 0, isItem: true, category: 'tools' },

  [BlockType.DIAMOND_PICKAXE]: { id: BlockType.DIAMOND_PICKAXE, color: '#00bcd4', name: 'Diamond Pickaxe', textureSlot: 118, hardness: 0, isItem: true, toolSpeed: 8.0, toolType: 'pickaxe', toolTier: 4, category: 'tools' },
  [BlockType.DIAMOND_AXE]: { id: BlockType.DIAMOND_AXE, color: '#00bcd4', name: 'Diamond Axe', textureSlot: 119, hardness: 0, isItem: true, toolSpeed: 8.0, toolType: 'axe', toolTier: 4, category: 'tools' },
  [BlockType.DIAMOND_SHOVEL]: { id: BlockType.DIAMOND_SHOVEL, color: '#00bcd4', name: 'Diamond Shovel', textureSlot: 120, hardness: 0, isItem: true, toolSpeed: 8.0, toolType: 'shovel', toolTier: 4, category: 'tools' },
  [BlockType.DIAMOND_SWORD]: { id: BlockType.DIAMOND_SWORD, color: '#00bcd4', name: 'Diamond Sword', textureSlot: 121, hardness: 0, isItem: true, category: 'tools' },
  [BlockType.DIAMOND_HOE]: { id: BlockType.DIAMOND_HOE, color: '#00bcd4', name: 'Diamond Hoe', textureSlot: 122, hardness: 0, isItem: true, category: 'tools' },

  [BlockType.STICK]: { id: BlockType.STICK, color: '#6d4c41', name: 'Stick', textureSlot: 35, hardness: 0, isItem: true, isFuel: true, fuelValue: 5000, category: 'ingredients' },
  [BlockType.COAL]: { id: BlockType.COAL, color: '#212121', name: 'Coal', textureSlot: 48, hardness: 0, isItem: true, isFuel: true, fuelValue: 80000, category: 'ingredients' },
  [BlockType.CHARCOAL]: { id: BlockType.CHARCOAL, color: '#212121', name: 'Charcoal', textureSlot: 57, hardness: 0, isItem: true, isFuel: true, fuelValue: 80000, category: 'ingredients' },
  [BlockType.IRON_INGOT]: { id: BlockType.IRON_INGOT, color: '#d7ccc8', name: 'Iron Ingot', textureSlot: 49, hardness: 0, isItem: true, category: 'ingredients' },
  [BlockType.COPPER_INGOT]: { id: BlockType.COPPER_INGOT, color: '#e67e22', name: 'Copper Ingot', textureSlot: 60, hardness: 0, isItem: true, category: 'ingredients' },
  [BlockType.RAW_IRON]: { id: BlockType.RAW_IRON, color: '#bcaaa4', name: 'Raw Iron', textureSlot: 55, hardness: 0, isItem: true, smeltsInto: BlockType.IRON_INGOT, category: 'ingredients' },
  [BlockType.RAW_COPPER]: { id: BlockType.RAW_COPPER, color: '#d35400', name: 'Raw Copper', textureSlot: 59, hardness: 0, isItem: true, smeltsInto: BlockType.COPPER_INGOT, category: 'ingredients' },
  
  [BlockType.RAW_GOLD]: { id: BlockType.RAW_GOLD, color: '#fdd835', name: 'Raw Gold', textureSlot: 100, hardness: 0, isItem: true, smeltsInto: BlockType.GOLD_INGOT, category: 'ingredients' },
  [BlockType.GOLD_INGOT]: { id: BlockType.GOLD_INGOT, color: '#fbc02d', name: 'Gold Ingot', textureSlot: 101, hardness: 0, isItem: true, category: 'ingredients' },
  [BlockType.DIAMOND]: { id: BlockType.DIAMOND, color: '#00bcd4', name: 'Diamond', textureSlot: 102, hardness: 0, isItem: true, category: 'ingredients' },
  [BlockType.EMERALD]: { id: BlockType.EMERALD, color: '#00e676', name: 'Emerald', textureSlot: 103, hardness: 0, isItem: true, category: 'ingredients' },
  [BlockType.LAPIS_LAZULI]: { id: BlockType.LAPIS_LAZULI, color: '#1a237e', name: 'Lapis Lazuli', textureSlot: 104, hardness: 0, isItem: true, category: 'ingredients' },

  [BlockType.APPLE]: { 
      id: BlockType.APPLE, color: '#ff0000', name: 'Apple', textureSlot: 50, hardness: 0, isItem: true, category: 'food',
      nutrition: 4, saturationModifier: 0.3 // 4 * 0.3 * 2 = 2.4 saturation
  },
  [BlockType.SAPLING]: { id: BlockType.SAPLING, color: '#388e3c', name: 'Sapling', textureSlot: 51, hardness: 0, isItem: true, isFuel: true, fuelValue: 5000, category: 'natural' },
  [BlockType.WHEAT_SEEDS]: { id: BlockType.WHEAT_SEEDS, color: '#a5d6a7', name: 'Wheat Seeds', textureSlot: 73, hardness: 0, isItem: true, category: 'natural' }
};

export const ATLAS_COLS = 8;

export function getTextureRows(): number {
    let maxSlot = 0;
    for (const key in BLOCKS) {
        const slot = BLOCKS[key as unknown as BlockType].textureSlot;
        if (slot !== undefined && slot > maxSlot) maxSlot = slot;
    }
    maxSlot = Math.max(maxSlot, 124);
    return Math.ceil((maxSlot + 1) / ATLAS_COLS);
}