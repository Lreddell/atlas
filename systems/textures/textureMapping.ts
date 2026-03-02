
// Maps Atlas Slot IDs (from utils/textures.ts) to file paths relative to public/assets/textures/
// Example: 0: "blocks/dirt.png"

export const TEXTURE_PATHS: Record<number, string> = {
    // --- BLOCKS ---
    0: 'blocks/dirt.png',
    1: 'blocks/grass_top.png',
    2: 'blocks/stone.png',
    3: 'blocks/dirt.png', // Soil (if used)
    4: 'blocks/leaves_oak.png',
    5: 'blocks/sand.png',
    6: 'blocks/bedrock.png',
    7: 'blocks/log_oak.png',
    8: 'blocks/planks_oak.png',
    9: 'blocks/brick.png',
    10: 'blocks/cobblestone.png',
    11: 'blocks/glass.png',
    12: 'blocks/grass_side.png',
    13: 'blocks/log_oak_top.png',
    14: 'blocks/water.png',
    15: 'blocks/coal_ore.png',
    16: 'blocks/iron_ore.png',
    17: 'blocks/lava.png',
    18: 'blocks/sandstone_side.png',
    19: 'blocks/snow.png',
    20: 'blocks/ice.png',
    21: 'blocks/cactus_side.png',
    22: 'blocks/dead_bush.png',
    23: 'blocks/log_spruce.png',
    24: 'blocks/leaves_spruce.png',
    25: 'blocks/grass_snow_side.png',
    26: 'blocks/obsidian.png',
    27: 'blocks/planks_spruce.png',
    28: 'blocks/sandstone_top.png',
    29: 'blocks/grass_plant.png',
    30: 'blocks/rose.png',
    31: 'blocks/dandelion.png',
    
    // --- TOOLS ---
    32: 'items/wood_pickaxe.png',
    33: 'items/stone_pickaxe.png',
    34: 'items/iron_pickaxe.png',
    35: 'items/stick.png',
    // ... add more as needed mapping to the IDs in utils/textures.ts
    
    // --- UTILITY ---
    72: 'blocks/debug.png'
};
