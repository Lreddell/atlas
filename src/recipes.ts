
import { BlockType } from './types';

export interface Recipe {
    gridSize: 2 | 3;
    pattern: (BlockType | null)[];
    output: { type: BlockType, count: number };
}

export const RECIPES: Recipe[] = [
    // --- 2x2 ---
    { gridSize: 2, pattern: [BlockType.LOG, null, null, null], output: { type: BlockType.OAK_PLANKS, count: 4 } },
    { gridSize: 2, pattern: [BlockType.SPRUCE_LOG, null, null, null], output: { type: BlockType.SPRUCE_PLANKS, count: 4 } },
    { gridSize: 2, pattern: [BlockType.CHERRY_LOG, null, null, null], output: { type: BlockType.CHERRY_PLANKS, count: 4 } },
    { gridSize: 2, pattern: [BlockType.BIRCH_LOG, null, null, null], output: { type: BlockType.BIRCH_PLANKS, count: 4 } },
    
    { gridSize: 2, pattern: [BlockType.OAK_PLANKS, null, BlockType.OAK_PLANKS, null], output: { type: BlockType.STICK, count: 4 } },
    { gridSize: 2, pattern: [BlockType.SPRUCE_PLANKS, null, BlockType.SPRUCE_PLANKS, null], output: { type: BlockType.STICK, count: 4 } },
    { gridSize: 2, pattern: [BlockType.CHERRY_PLANKS, null, BlockType.CHERRY_PLANKS, null], output: { type: BlockType.STICK, count: 4 } },
    { gridSize: 2, pattern: [BlockType.BIRCH_PLANKS, null, BlockType.BIRCH_PLANKS, null], output: { type: BlockType.STICK, count: 4 } },
    
    { gridSize: 2, pattern: [BlockType.OAK_PLANKS, BlockType.OAK_PLANKS, BlockType.OAK_PLANKS, BlockType.OAK_PLANKS], output: { type: BlockType.CRAFTING_TABLE, count: 1 } },
    { gridSize: 2, pattern: [BlockType.SPRUCE_PLANKS, BlockType.SPRUCE_PLANKS, BlockType.SPRUCE_PLANKS, BlockType.SPRUCE_PLANKS], output: { type: BlockType.CRAFTING_TABLE, count: 1 } },
    { gridSize: 2, pattern: [BlockType.CHERRY_PLANKS, BlockType.CHERRY_PLANKS, BlockType.CHERRY_PLANKS, BlockType.CHERRY_PLANKS], output: { type: BlockType.CRAFTING_TABLE, count: 1 } },
    { gridSize: 2, pattern: [BlockType.BIRCH_PLANKS, BlockType.BIRCH_PLANKS, BlockType.BIRCH_PLANKS, BlockType.BIRCH_PLANKS], output: { type: BlockType.CRAFTING_TABLE, count: 1 } },
    
    { gridSize: 2, pattern: [BlockType.OAK_PLANKS, BlockType.OAK_PLANKS, BlockType.STICK, BlockType.STICK], output: { type: BlockType.WOOD_PICKAXE, count: 1 } },
    { gridSize: 2, pattern: [BlockType.SPRUCE_PLANKS, BlockType.SPRUCE_PLANKS, BlockType.STICK, BlockType.STICK], output: { type: BlockType.WOOD_PICKAXE, count: 1 } },
    { gridSize: 2, pattern: [BlockType.CHERRY_PLANKS, BlockType.CHERRY_PLANKS, BlockType.STICK, BlockType.STICK], output: { type: BlockType.WOOD_PICKAXE, count: 1 } },
    { gridSize: 2, pattern: [BlockType.BIRCH_PLANKS, BlockType.BIRCH_PLANKS, BlockType.STICK, BlockType.STICK], output: { type: BlockType.WOOD_PICKAXE, count: 1 } },
    
    // Torch
    { gridSize: 2, pattern: [BlockType.COAL, null, BlockType.STICK, null], output: { type: BlockType.TORCH, count: 4 } },
    { gridSize: 2, pattern: [BlockType.CHARCOAL, null, BlockType.STICK, null], output: { type: BlockType.TORCH, count: 4 } },

    // --- 3x3 ---
    // Furnace
    { 
        gridSize: 3, 
        pattern: [
            BlockType.COBBLESTONE, BlockType.COBBLESTONE, BlockType.COBBLESTONE,
            BlockType.COBBLESTONE, null,                  BlockType.COBBLESTONE,
            BlockType.COBBLESTONE, BlockType.COBBLESTONE, BlockType.COBBLESTONE
        ],
        output: { type: BlockType.FURNACE, count: 1 }
    },
    // Chest
    { 
        gridSize: 3, 
        pattern: [
            BlockType.OAK_PLANKS, BlockType.OAK_PLANKS, BlockType.OAK_PLANKS,
            BlockType.OAK_PLANKS, null,             BlockType.OAK_PLANKS,
            BlockType.OAK_PLANKS, BlockType.OAK_PLANKS, BlockType.OAK_PLANKS
        ],
        output: { type: BlockType.CHEST, count: 1 }
    },
    { 
        gridSize: 3, 
        pattern: [
            BlockType.SPRUCE_PLANKS, BlockType.SPRUCE_PLANKS, BlockType.SPRUCE_PLANKS,
            BlockType.SPRUCE_PLANKS, null,             BlockType.SPRUCE_PLANKS,
            BlockType.SPRUCE_PLANKS, BlockType.SPRUCE_PLANKS, BlockType.SPRUCE_PLANKS
        ],
        output: { type: BlockType.CHEST, count: 1 }
    },
    { 
        gridSize: 3, 
        pattern: [
            BlockType.CHERRY_PLANKS, BlockType.CHERRY_PLANKS, BlockType.CHERRY_PLANKS,
            BlockType.CHERRY_PLANKS, null,             BlockType.CHERRY_PLANKS,
            BlockType.CHERRY_PLANKS, BlockType.CHERRY_PLANKS, BlockType.CHERRY_PLANKS
        ],
        output: { type: BlockType.CHEST, count: 1 }
    },
    { 
        gridSize: 3, 
        pattern: [
            BlockType.BIRCH_PLANKS, BlockType.BIRCH_PLANKS, BlockType.BIRCH_PLANKS,
            BlockType.BIRCH_PLANKS, null,             BlockType.BIRCH_PLANKS,
            BlockType.BIRCH_PLANKS, BlockType.BIRCH_PLANKS, BlockType.BIRCH_PLANKS
        ],
        output: { type: BlockType.CHEST, count: 1 }
    },
    // Bed
    {
        gridSize: 3,
        pattern: [
            BlockType.WOOL, BlockType.WOOL, BlockType.WOOL,
            BlockType.OAK_PLANKS, BlockType.OAK_PLANKS, BlockType.OAK_PLANKS,
            null, null, null
        ],
        output: { type: BlockType.BED_ITEM, count: 1 }
    },
    {
        gridSize: 3,
        pattern: [
            BlockType.WOOL, BlockType.WOOL, BlockType.WOOL,
            BlockType.SPRUCE_PLANKS, BlockType.SPRUCE_PLANKS, BlockType.SPRUCE_PLANKS,
            null, null, null
        ],
        output: { type: BlockType.BED_ITEM, count: 1 }
    },
    {
        gridSize: 3,
        pattern: [
            BlockType.WOOL, BlockType.WOOL, BlockType.WOOL,
            BlockType.CHERRY_PLANKS, BlockType.CHERRY_PLANKS, BlockType.CHERRY_PLANKS,
            null, null, null
        ],
        output: { type: BlockType.BED_ITEM, count: 1 }
    },
    {
        gridSize: 3,
        pattern: [
            BlockType.WOOL, BlockType.WOOL, BlockType.WOOL,
            BlockType.BIRCH_PLANKS, BlockType.BIRCH_PLANKS, BlockType.BIRCH_PLANKS,
            null, null, null
        ],
        output: { type: BlockType.BED_ITEM, count: 1 }
    },

    // TOOLS 3x3
    // Pickaxes
    { gridSize: 3, pattern: [BlockType.OAK_PLANKS, BlockType.OAK_PLANKS, BlockType.OAK_PLANKS, null, BlockType.STICK, null, null, BlockType.STICK, null], output: { type: BlockType.WOOD_PICKAXE, count: 1 } },
    { gridSize: 3, pattern: [BlockType.SPRUCE_PLANKS, BlockType.SPRUCE_PLANKS, BlockType.SPRUCE_PLANKS, null, BlockType.STICK, null, null, BlockType.STICK, null], output: { type: BlockType.WOOD_PICKAXE, count: 1 } },
    { gridSize: 3, pattern: [BlockType.CHERRY_PLANKS, BlockType.CHERRY_PLANKS, BlockType.CHERRY_PLANKS, null, BlockType.STICK, null, null, BlockType.STICK, null], output: { type: BlockType.WOOD_PICKAXE, count: 1 } },
    { gridSize: 3, pattern: [BlockType.BIRCH_PLANKS, BlockType.BIRCH_PLANKS, BlockType.BIRCH_PLANKS, null, BlockType.STICK, null, null, BlockType.STICK, null], output: { type: BlockType.WOOD_PICKAXE, count: 1 } },
    { gridSize: 3, pattern: [BlockType.COBBLESTONE, BlockType.COBBLESTONE, BlockType.COBBLESTONE, null, BlockType.STICK, null, null, BlockType.STICK, null], output: { type: BlockType.STONE_PICKAXE, count: 1 } },
    { gridSize: 3, pattern: [BlockType.IRON_INGOT, BlockType.IRON_INGOT, BlockType.IRON_INGOT, null, BlockType.STICK, null, null, BlockType.STICK, null], output: { type: BlockType.IRON_PICKAXE, count: 1 } },
    { gridSize: 3, pattern: [BlockType.COPPER_INGOT, BlockType.COPPER_INGOT, BlockType.COPPER_INGOT, null, BlockType.STICK, null, null, BlockType.STICK, null], output: { type: BlockType.COPPER_PICKAXE, count: 1 } },
    
    // Axes (Right-handed)
    { gridSize: 3, pattern: [BlockType.OAK_PLANKS, BlockType.OAK_PLANKS, null, BlockType.OAK_PLANKS, BlockType.STICK, null, null, BlockType.STICK, null], output: { type: BlockType.WOOD_AXE, count: 1 } },
    { gridSize: 3, pattern: [BlockType.SPRUCE_PLANKS, BlockType.SPRUCE_PLANKS, null, BlockType.SPRUCE_PLANKS, BlockType.STICK, null, null, BlockType.STICK, null], output: { type: BlockType.WOOD_AXE, count: 1 } },
    { gridSize: 3, pattern: [BlockType.CHERRY_PLANKS, BlockType.CHERRY_PLANKS, null, BlockType.CHERRY_PLANKS, BlockType.STICK, null, null, BlockType.STICK, null], output: { type: BlockType.WOOD_AXE, count: 1 } },
    { gridSize: 3, pattern: [BlockType.BIRCH_PLANKS, BlockType.BIRCH_PLANKS, null, BlockType.BIRCH_PLANKS, BlockType.STICK, null, null, BlockType.STICK, null], output: { type: BlockType.WOOD_AXE, count: 1 } },
    { gridSize: 3, pattern: [BlockType.COBBLESTONE, BlockType.COBBLESTONE, null, BlockType.COBBLESTONE, BlockType.STICK, null, null, BlockType.STICK, null], output: { type: BlockType.STONE_AXE, count: 1 } },
    { gridSize: 3, pattern: [BlockType.IRON_INGOT, BlockType.IRON_INGOT, null, BlockType.IRON_INGOT, BlockType.STICK, null, null, BlockType.STICK, null], output: { type: BlockType.IRON_AXE, count: 1 } },
    { gridSize: 3, pattern: [BlockType.COPPER_INGOT, BlockType.COPPER_INGOT, null, BlockType.COPPER_INGOT, BlockType.STICK, null, null, BlockType.STICK, null], output: { type: BlockType.COPPER_AXE, count: 1 } },

    // Axes (Left-handed / Mirrored)
    { gridSize: 3, pattern: [BlockType.OAK_PLANKS, BlockType.OAK_PLANKS, null, null, BlockType.OAK_PLANKS, BlockType.STICK, null, BlockType.STICK, null], output: { type: BlockType.WOOD_AXE, count: 1 } },
    { gridSize: 3, pattern: [BlockType.SPRUCE_PLANKS, BlockType.SPRUCE_PLANKS, null, null, BlockType.SPRUCE_PLANKS, BlockType.STICK, null, BlockType.STICK, null], output: { type: BlockType.WOOD_AXE, count: 1 } },
    { gridSize: 3, pattern: [BlockType.CHERRY_PLANKS, BlockType.CHERRY_PLANKS, null, null, BlockType.CHERRY_PLANKS, BlockType.STICK, null, BlockType.STICK, null], output: { type: BlockType.WOOD_AXE, count: 1 } },
    { gridSize: 3, pattern: [BlockType.BIRCH_PLANKS, BlockType.BIRCH_PLANKS, null, null, BlockType.BIRCH_PLANKS, BlockType.STICK, null, BlockType.STICK, null], output: { type: BlockType.WOOD_AXE, count: 1 } },
    { gridSize: 3, pattern: [BlockType.COBBLESTONE, BlockType.COBBLESTONE, null, null, BlockType.COBBLESTONE, BlockType.STICK, null, BlockType.STICK, null], output: { type: BlockType.STONE_AXE, count: 1 } },
    { gridSize: 3, pattern: [BlockType.IRON_INGOT, BlockType.IRON_INGOT, null, null, BlockType.IRON_INGOT, BlockType.STICK, null, BlockType.STICK, null], output: { type: BlockType.IRON_AXE, count: 1 } },
    { gridSize: 3, pattern: [BlockType.COPPER_INGOT, BlockType.COPPER_INGOT, null, null, BlockType.COPPER_INGOT, BlockType.STICK, null, BlockType.STICK, null], output: { type: BlockType.COPPER_AXE, count: 1 } },

    // Shovels
    { gridSize: 3, pattern: [null, BlockType.OAK_PLANKS, null, null, BlockType.STICK, null, null, BlockType.STICK, null], output: { type: BlockType.WOOD_SHOVEL, count: 1 } },
    { gridSize: 3, pattern: [null, BlockType.SPRUCE_PLANKS, null, null, BlockType.STICK, null, null, BlockType.STICK, null], output: { type: BlockType.WOOD_SHOVEL, count: 1 } },
    { gridSize: 3, pattern: [null, BlockType.CHERRY_PLANKS, null, null, BlockType.STICK, null, null, BlockType.STICK, null], output: { type: BlockType.WOOD_SHOVEL, count: 1 } },
    { gridSize: 3, pattern: [null, BlockType.BIRCH_PLANKS, null, null, BlockType.STICK, null, null, BlockType.STICK, null], output: { type: BlockType.WOOD_SHOVEL, count: 1 } },
    { gridSize: 3, pattern: [null, BlockType.COBBLESTONE, null, null, BlockType.STICK, null, null, BlockType.STICK, null], output: { type: BlockType.STONE_SHOVEL, count: 1 } },
    { gridSize: 3, pattern: [null, BlockType.IRON_INGOT, null, null, BlockType.STICK, null, null, BlockType.STICK, null], output: { type: BlockType.IRON_SHOVEL, count: 1 } },
    { gridSize: 3, pattern: [null, BlockType.COPPER_INGOT, null, null, BlockType.STICK, null, null, BlockType.STICK, null], output: { type: BlockType.COPPER_SHOVEL, count: 1 } },
];

function trimGrid(grid: (BlockType | null)[], width: number): (BlockType | null)[] {
    const height = grid.length / width;
    let minX = width, maxX = -1, minY = height, maxY = -1;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (grid[y * width + x] !== null) {
                if (x < minX) minX = x; if (x > maxX) maxX = x;
                if (y < minY) minY = y; if (y > maxY) maxY = y;
            }
        }
    }
    if (maxX === -1) return [];
    const newWidth = maxX - minX + 1;
    const newHeight = maxY - minY + 1;
    const trimmed: (BlockType | null)[] = new Array(newWidth * newHeight).fill(null);
    for (let y = 0; y < newHeight; y++) {
        for (let x = 0; x < newWidth; x++) {
            trimmed[y * newWidth + x] = grid[(minY + y) * width + (minX + x)];
        }
    }
    return trimmed;
}

export const checkRecipe = (grid: (BlockType | null)[], gridWidth: number): { type: BlockType, count: number } | null => {
    const trimmedInput = trimGrid(grid, gridWidth);
    if (trimmedInput.length === 0) return null;
    
    for (const recipe of RECIPES) {
        const recipeWidth = recipe.gridSize;
        const trimmedRecipe = trimGrid(recipe.pattern, recipeWidth);
        
        if (trimmedInput.length !== trimmedRecipe.length) continue;
        
        let match = true;
        for (let i = 0; i < trimmedInput.length; i++) {
            if (trimmedInput[i] !== trimmedRecipe[i]) { match = false; break; }
        }
        if (match) return recipe.output;
    }
    return null;
};
