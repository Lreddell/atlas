
import { BlockType } from './types';
import { STONE_TOOL_MATERIALS, WOOD_FAMILIES } from './systems/registry/blockFamilies';

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
    { gridSize: 2, pattern: [BlockType.JUNGLE_LOG, null, null, null], output: { type: BlockType.JUNGLE_PLANKS, count: 4 } },
    { gridSize: 2, pattern: [BlockType.DARK_OAK_LOG, null, null, null], output: { type: BlockType.DARK_OAK_PLANKS, count: 4 } },
    { gridSize: 2, pattern: [BlockType.ACACIA_LOG, null, null, null], output: { type: BlockType.ACACIA_PLANKS, count: 4 } },

    { gridSize: 2, pattern: [BlockType.OAK_PLANKS, null, BlockType.OAK_PLANKS, null], output: { type: BlockType.STICK, count: 4 } },
    { gridSize: 2, pattern: [BlockType.SPRUCE_PLANKS, null, BlockType.SPRUCE_PLANKS, null], output: { type: BlockType.STICK, count: 4 } },
    { gridSize: 2, pattern: [BlockType.CHERRY_PLANKS, null, BlockType.CHERRY_PLANKS, null], output: { type: BlockType.STICK, count: 4 } },
    { gridSize: 2, pattern: [BlockType.BIRCH_PLANKS, null, BlockType.BIRCH_PLANKS, null], output: { type: BlockType.STICK, count: 4 } },
    { gridSize: 2, pattern: [BlockType.JUNGLE_PLANKS, null, BlockType.JUNGLE_PLANKS, null], output: { type: BlockType.STICK, count: 4 } },
    { gridSize: 2, pattern: [BlockType.DARK_OAK_PLANKS, null, BlockType.DARK_OAK_PLANKS, null], output: { type: BlockType.STICK, count: 4 } },
    { gridSize: 2, pattern: [BlockType.ACACIA_PLANKS, null, BlockType.ACACIA_PLANKS, null], output: { type: BlockType.STICK, count: 4 } },

    { gridSize: 2, pattern: [BlockType.OAK_PLANKS, BlockType.OAK_PLANKS, BlockType.OAK_PLANKS, BlockType.OAK_PLANKS], output: { type: BlockType.CRAFTING_TABLE, count: 1 } },
    { gridSize: 2, pattern: [BlockType.SPRUCE_PLANKS, BlockType.SPRUCE_PLANKS, BlockType.SPRUCE_PLANKS, BlockType.SPRUCE_PLANKS], output: { type: BlockType.CRAFTING_TABLE, count: 1 } },
    { gridSize: 2, pattern: [BlockType.CHERRY_PLANKS, BlockType.CHERRY_PLANKS, BlockType.CHERRY_PLANKS, BlockType.CHERRY_PLANKS], output: { type: BlockType.CRAFTING_TABLE, count: 1 } },
    { gridSize: 2, pattern: [BlockType.BIRCH_PLANKS, BlockType.BIRCH_PLANKS, BlockType.BIRCH_PLANKS, BlockType.BIRCH_PLANKS], output: { type: BlockType.CRAFTING_TABLE, count: 1 } },
    { gridSize: 2, pattern: [BlockType.JUNGLE_PLANKS, BlockType.JUNGLE_PLANKS, BlockType.JUNGLE_PLANKS, BlockType.JUNGLE_PLANKS], output: { type: BlockType.CRAFTING_TABLE, count: 1 } },
    { gridSize: 2, pattern: [BlockType.DARK_OAK_PLANKS, BlockType.DARK_OAK_PLANKS, BlockType.DARK_OAK_PLANKS, BlockType.DARK_OAK_PLANKS], output: { type: BlockType.CRAFTING_TABLE, count: 1 } },
    { gridSize: 2, pattern: [BlockType.ACACIA_PLANKS, BlockType.ACACIA_PLANKS, BlockType.ACACIA_PLANKS, BlockType.ACACIA_PLANKS], output: { type: BlockType.CRAFTING_TABLE, count: 1 } },

    { gridSize: 2, pattern: [BlockType.OAK_PLANKS, BlockType.OAK_PLANKS, BlockType.STICK, BlockType.STICK], output: { type: BlockType.WOOD_PICKAXE, count: 1 } },
    { gridSize: 2, pattern: [BlockType.SPRUCE_PLANKS, BlockType.SPRUCE_PLANKS, BlockType.STICK, BlockType.STICK], output: { type: BlockType.WOOD_PICKAXE, count: 1 } },
    { gridSize: 2, pattern: [BlockType.CHERRY_PLANKS, BlockType.CHERRY_PLANKS, BlockType.STICK, BlockType.STICK], output: { type: BlockType.WOOD_PICKAXE, count: 1 } },
    { gridSize: 2, pattern: [BlockType.BIRCH_PLANKS, BlockType.BIRCH_PLANKS, BlockType.STICK, BlockType.STICK], output: { type: BlockType.WOOD_PICKAXE, count: 1 } },
    { gridSize: 2, pattern: [BlockType.JUNGLE_PLANKS, BlockType.JUNGLE_PLANKS, BlockType.STICK, BlockType.STICK], output: { type: BlockType.WOOD_PICKAXE, count: 1 } },
    { gridSize: 2, pattern: [BlockType.DARK_OAK_PLANKS, BlockType.DARK_OAK_PLANKS, BlockType.STICK, BlockType.STICK], output: { type: BlockType.WOOD_PICKAXE, count: 1 } },
    { gridSize: 2, pattern: [BlockType.ACACIA_PLANKS, BlockType.ACACIA_PLANKS, BlockType.STICK, BlockType.STICK], output: { type: BlockType.WOOD_PICKAXE, count: 1 } },
    
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
    {
        gridSize: 3,
        pattern: [
            BlockType.JUNGLE_PLANKS, BlockType.JUNGLE_PLANKS, BlockType.JUNGLE_PLANKS,
            BlockType.JUNGLE_PLANKS, null,             BlockType.JUNGLE_PLANKS,
            BlockType.JUNGLE_PLANKS, BlockType.JUNGLE_PLANKS, BlockType.JUNGLE_PLANKS
        ],
        output: { type: BlockType.CHEST, count: 1 }
    },
    {
        gridSize: 3,
        pattern: [
            BlockType.DARK_OAK_PLANKS, BlockType.DARK_OAK_PLANKS, BlockType.DARK_OAK_PLANKS,
            BlockType.DARK_OAK_PLANKS, null,             BlockType.DARK_OAK_PLANKS,
            BlockType.DARK_OAK_PLANKS, BlockType.DARK_OAK_PLANKS, BlockType.DARK_OAK_PLANKS
        ],
        output: { type: BlockType.CHEST, count: 1 }
    },
    {
        gridSize: 3,
        pattern: [
            BlockType.ACACIA_PLANKS, BlockType.ACACIA_PLANKS, BlockType.ACACIA_PLANKS,
            BlockType.ACACIA_PLANKS, null,             BlockType.ACACIA_PLANKS,
            BlockType.ACACIA_PLANKS, BlockType.ACACIA_PLANKS, BlockType.ACACIA_PLANKS
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
    {
        gridSize: 3,
        pattern: [
            BlockType.WOOL, BlockType.WOOL, BlockType.WOOL,
            BlockType.JUNGLE_PLANKS, BlockType.JUNGLE_PLANKS, BlockType.JUNGLE_PLANKS,
            null, null, null
        ],
        output: { type: BlockType.BED_ITEM, count: 1 }
    },
    {
        gridSize: 3,
        pattern: [
            BlockType.WOOL, BlockType.WOOL, BlockType.WOOL,
            BlockType.DARK_OAK_PLANKS, BlockType.DARK_OAK_PLANKS, BlockType.DARK_OAK_PLANKS,
            null, null, null
        ],
        output: { type: BlockType.BED_ITEM, count: 1 }
    },
    {
        gridSize: 3,
        pattern: [
            BlockType.WOOL, BlockType.WOOL, BlockType.WOOL,
            BlockType.ACACIA_PLANKS, BlockType.ACACIA_PLANKS, BlockType.ACACIA_PLANKS,
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
    { gridSize: 3, pattern: [BlockType.JUNGLE_PLANKS, BlockType.JUNGLE_PLANKS, BlockType.JUNGLE_PLANKS, null, BlockType.STICK, null, null, BlockType.STICK, null], output: { type: BlockType.WOOD_PICKAXE, count: 1 } },
    { gridSize: 3, pattern: [BlockType.DARK_OAK_PLANKS, BlockType.DARK_OAK_PLANKS, BlockType.DARK_OAK_PLANKS, null, BlockType.STICK, null, null, BlockType.STICK, null], output: { type: BlockType.WOOD_PICKAXE, count: 1 } },
    { gridSize: 3, pattern: [BlockType.ACACIA_PLANKS, BlockType.ACACIA_PLANKS, BlockType.ACACIA_PLANKS, null, BlockType.STICK, null, null, BlockType.STICK, null], output: { type: BlockType.WOOD_PICKAXE, count: 1 } },
    { gridSize: 3, pattern: [BlockType.IRON_INGOT, BlockType.IRON_INGOT, BlockType.IRON_INGOT, null, BlockType.STICK, null, null, BlockType.STICK, null], output: { type: BlockType.IRON_PICKAXE, count: 1 } },
    { gridSize: 3, pattern: [BlockType.COPPER_INGOT, BlockType.COPPER_INGOT, BlockType.COPPER_INGOT, null, BlockType.STICK, null, null, BlockType.STICK, null], output: { type: BlockType.COPPER_PICKAXE, count: 1 } },
    
    // Axes (Right-handed)
    { gridSize: 3, pattern: [BlockType.OAK_PLANKS, BlockType.OAK_PLANKS, null, BlockType.OAK_PLANKS, BlockType.STICK, null, null, BlockType.STICK, null], output: { type: BlockType.WOOD_AXE, count: 1 } },
    { gridSize: 3, pattern: [BlockType.SPRUCE_PLANKS, BlockType.SPRUCE_PLANKS, null, BlockType.SPRUCE_PLANKS, BlockType.STICK, null, null, BlockType.STICK, null], output: { type: BlockType.WOOD_AXE, count: 1 } },
    { gridSize: 3, pattern: [BlockType.CHERRY_PLANKS, BlockType.CHERRY_PLANKS, null, BlockType.CHERRY_PLANKS, BlockType.STICK, null, null, BlockType.STICK, null], output: { type: BlockType.WOOD_AXE, count: 1 } },
    { gridSize: 3, pattern: [BlockType.BIRCH_PLANKS, BlockType.BIRCH_PLANKS, null, BlockType.BIRCH_PLANKS, BlockType.STICK, null, null, BlockType.STICK, null], output: { type: BlockType.WOOD_AXE, count: 1 } },
    { gridSize: 3, pattern: [BlockType.JUNGLE_PLANKS, BlockType.JUNGLE_PLANKS, null, BlockType.JUNGLE_PLANKS, BlockType.STICK, null, null, BlockType.STICK, null], output: { type: BlockType.WOOD_AXE, count: 1 } },
    { gridSize: 3, pattern: [BlockType.DARK_OAK_PLANKS, BlockType.DARK_OAK_PLANKS, null, BlockType.DARK_OAK_PLANKS, BlockType.STICK, null, null, BlockType.STICK, null], output: { type: BlockType.WOOD_AXE, count: 1 } },
    { gridSize: 3, pattern: [BlockType.ACACIA_PLANKS, BlockType.ACACIA_PLANKS, null, BlockType.ACACIA_PLANKS, BlockType.STICK, null, null, BlockType.STICK, null], output: { type: BlockType.WOOD_AXE, count: 1 } },
    { gridSize: 3, pattern: [BlockType.IRON_INGOT, BlockType.IRON_INGOT, null, BlockType.IRON_INGOT, BlockType.STICK, null, null, BlockType.STICK, null], output: { type: BlockType.IRON_AXE, count: 1 } },
    { gridSize: 3, pattern: [BlockType.COPPER_INGOT, BlockType.COPPER_INGOT, null, BlockType.COPPER_INGOT, BlockType.STICK, null, null, BlockType.STICK, null], output: { type: BlockType.COPPER_AXE, count: 1 } },

    // Axes (Left-handed / Mirrored)
    { gridSize: 3, pattern: [BlockType.OAK_PLANKS, BlockType.OAK_PLANKS, null, null, BlockType.OAK_PLANKS, BlockType.STICK, null, BlockType.STICK, null], output: { type: BlockType.WOOD_AXE, count: 1 } },
    { gridSize: 3, pattern: [BlockType.SPRUCE_PLANKS, BlockType.SPRUCE_PLANKS, null, null, BlockType.SPRUCE_PLANKS, BlockType.STICK, null, BlockType.STICK, null], output: { type: BlockType.WOOD_AXE, count: 1 } },
    { gridSize: 3, pattern: [BlockType.CHERRY_PLANKS, BlockType.CHERRY_PLANKS, null, null, BlockType.CHERRY_PLANKS, BlockType.STICK, null, BlockType.STICK, null], output: { type: BlockType.WOOD_AXE, count: 1 } },
    { gridSize: 3, pattern: [BlockType.BIRCH_PLANKS, BlockType.BIRCH_PLANKS, null, null, BlockType.BIRCH_PLANKS, BlockType.STICK, null, BlockType.STICK, null], output: { type: BlockType.WOOD_AXE, count: 1 } },
    { gridSize: 3, pattern: [BlockType.JUNGLE_PLANKS, BlockType.JUNGLE_PLANKS, null, null, BlockType.JUNGLE_PLANKS, BlockType.STICK, null, BlockType.STICK, null], output: { type: BlockType.WOOD_AXE, count: 1 } },
    { gridSize: 3, pattern: [BlockType.DARK_OAK_PLANKS, BlockType.DARK_OAK_PLANKS, null, null, BlockType.DARK_OAK_PLANKS, BlockType.STICK, null, BlockType.STICK, null], output: { type: BlockType.WOOD_AXE, count: 1 } },
    { gridSize: 3, pattern: [BlockType.ACACIA_PLANKS, BlockType.ACACIA_PLANKS, null, null, BlockType.ACACIA_PLANKS, BlockType.STICK, null, BlockType.STICK, null], output: { type: BlockType.WOOD_AXE, count: 1 } },
    { gridSize: 3, pattern: [BlockType.IRON_INGOT, BlockType.IRON_INGOT, null, null, BlockType.IRON_INGOT, BlockType.STICK, null, BlockType.STICK, null], output: { type: BlockType.IRON_AXE, count: 1 } },
    { gridSize: 3, pattern: [BlockType.COPPER_INGOT, BlockType.COPPER_INGOT, null, null, BlockType.COPPER_INGOT, BlockType.STICK, null, BlockType.STICK, null], output: { type: BlockType.COPPER_AXE, count: 1 } },

    // Shovels
    { gridSize: 3, pattern: [null, BlockType.OAK_PLANKS, null, null, BlockType.STICK, null, null, BlockType.STICK, null], output: { type: BlockType.WOOD_SHOVEL, count: 1 } },
    { gridSize: 3, pattern: [null, BlockType.SPRUCE_PLANKS, null, null, BlockType.STICK, null, null, BlockType.STICK, null], output: { type: BlockType.WOOD_SHOVEL, count: 1 } },
    { gridSize: 3, pattern: [null, BlockType.CHERRY_PLANKS, null, null, BlockType.STICK, null, null, BlockType.STICK, null], output: { type: BlockType.WOOD_SHOVEL, count: 1 } },
    { gridSize: 3, pattern: [null, BlockType.BIRCH_PLANKS, null, null, BlockType.STICK, null, null, BlockType.STICK, null], output: { type: BlockType.WOOD_SHOVEL, count: 1 } },
    { gridSize: 3, pattern: [null, BlockType.JUNGLE_PLANKS, null, null, BlockType.STICK, null, null, BlockType.STICK, null], output: { type: BlockType.WOOD_SHOVEL, count: 1 } },
    { gridSize: 3, pattern: [null, BlockType.DARK_OAK_PLANKS, null, null, BlockType.STICK, null, null, BlockType.STICK, null], output: { type: BlockType.WOOD_SHOVEL, count: 1 } },
    { gridSize: 3, pattern: [null, BlockType.ACACIA_PLANKS, null, null, BlockType.STICK, null, null, BlockType.STICK, null], output: { type: BlockType.WOOD_SHOVEL, count: 1 } },
    { gridSize: 3, pattern: [null, BlockType.IRON_INGOT, null, null, BlockType.STICK, null, null, BlockType.STICK, null], output: { type: BlockType.IRON_SHOVEL, count: 1 } },
    { gridSize: 3, pattern: [null, BlockType.COPPER_INGOT, null, null, BlockType.STICK, null, null, BlockType.STICK, null], output: { type: BlockType.COPPER_SHOVEL, count: 1 } },
];

// --- Generated recipes: stairs, slabs, swords, hoes, gold/diamond tools, sandstone ---
const S = BlockType.STICK;
const push = (gridSize: 2 | 3, pattern: (BlockType | null)[], type: BlockType, count: number) =>
    RECIPES.push({ gridSize, pattern, output: { type, count } });

push(3, [
    BlockType.IRON_INGOT, BlockType.IRON_INGOT, BlockType.IRON_INGOT,
    BlockType.IRON_INGOT, BlockType.IRON_INGOT, BlockType.IRON_INGOT,
    BlockType.IRON_INGOT, BlockType.IRON_INGOT, BlockType.IRON_INGOT,
], BlockType.IRON_BLOCK, 1);
push(2, [BlockType.IRON_BLOCK, null, null, null], BlockType.IRON_INGOT, 9);

// Stairs (6 blocks -> 4, both handedness) + slabs (3 in a row -> 6)
const SHAPE_FAMILIES: { mat: BlockType, slab: BlockType, stairs: BlockType }[] = [
    ...WOOD_FAMILIES.map(({ planks, slab, stairs }) => ({ mat: planks, slab, stairs })),
    { mat: BlockType.COBBLESTONE, slab: BlockType.COBBLESTONE_SLAB, stairs: BlockType.COBBLESTONE_STAIRS },
    { mat: BlockType.STONE, slab: BlockType.STONE_SLAB, stairs: BlockType.STONE_STAIRS },
    { mat: BlockType.SANDSTONE, slab: BlockType.SANDSTONE_SLAB, stairs: BlockType.SANDSTONE_STAIRS },
    { mat: BlockType.RED_SANDSTONE, slab: BlockType.RED_SANDSTONE_SLAB, stairs: BlockType.RED_SANDSTONE_STAIRS },
    { mat: BlockType.BRICK, slab: BlockType.BRICK_SLAB, stairs: BlockType.BRICK_STAIRS },
    { mat: BlockType.MAGNETITE_BLOCK, slab: BlockType.MAGNETITE_SLAB, stairs: BlockType.MAGNETITE_STAIRS },
    { mat: BlockType.MAGNETITE_BRICKS, slab: BlockType.MAGNETITE_BRICK_SLAB, stairs: BlockType.MAGNETITE_BRICK_STAIRS },
];
for (const f of SHAPE_FAMILIES) {
    push(3, [null, null, null, f.mat, f.mat, f.mat, null, null, null], f.slab, 6);
    push(3, [f.mat, null, null, f.mat, f.mat, null, f.mat, f.mat, f.mat], f.stairs, 4);
    push(3, [null, null, f.mat, null, f.mat, f.mat, f.mat, f.mat, f.mat], f.stairs, 4);
}

// Swords (2 material + stick) and hoes (2 material + 2 sticks, both handedness)
const SWORD_HOE: { mat: BlockType, sword: BlockType, hoe: BlockType }[] = [
    { mat: BlockType.IRON_INGOT, sword: BlockType.IRON_SWORD, hoe: BlockType.IRON_HOE },
    { mat: BlockType.COPPER_INGOT, sword: BlockType.COPPER_SWORD, hoe: BlockType.COPPER_HOE },
    { mat: BlockType.GOLD_INGOT, sword: BlockType.GOLD_SWORD, hoe: BlockType.GOLD_HOE },
    { mat: BlockType.DIAMOND, sword: BlockType.DIAMOND_SWORD, hoe: BlockType.DIAMOND_HOE },
];
for (const t of SWORD_HOE) {
    push(3, [null, t.mat, null, null, t.mat, null, null, S, null], t.sword, 1);
    push(3, [t.mat, t.mat, null, null, S, null, null, S, null], t.hoe, 1);
    push(3, [null, t.mat, t.mat, null, S, null, null, S, null], t.hoe, 1);
}
// Wooden swords/hoes (one per plank family)
for (const { planks } of WOOD_FAMILIES) {
    push(3, [null, planks, null, null, planks, null, null, S, null], BlockType.WOOD_SWORD, 1);
    push(3, [planks, planks, null, null, S, null, null, S, null], BlockType.WOOD_HOE, 1);
    push(3, [null, planks, planks, null, S, null, null, S, null], BlockType.WOOD_HOE, 1);
}

for (const material of STONE_TOOL_MATERIALS) {
    push(3, [material, material, material, null, S, null, null, S, null], BlockType.STONE_PICKAXE, 1);
    push(3, [material, material, null, material, S, null, null, S, null], BlockType.STONE_AXE, 1);
    push(3, [material, material, null, null, material, S, null, S, null], BlockType.STONE_AXE, 1);
    push(3, [null, material, null, null, S, null, null, S, null], BlockType.STONE_SHOVEL, 1);
    push(3, [null, material, null, null, material, null, null, S, null], BlockType.STONE_SWORD, 1);
    push(3, [material, material, null, null, S, null, null, S, null], BlockType.STONE_HOE, 1);
    push(3, [null, material, material, null, S, null, null, S, null], BlockType.STONE_HOE, 1);
}

// Gold & Diamond pickaxe / axe / shovel (the other tiers already existed)
const HEAVY: { mat: BlockType, pick: BlockType, axe: BlockType, shovel: BlockType }[] = [
    { mat: BlockType.GOLD_INGOT, pick: BlockType.GOLD_PICKAXE, axe: BlockType.GOLD_AXE, shovel: BlockType.GOLD_SHOVEL },
    { mat: BlockType.DIAMOND, pick: BlockType.DIAMOND_PICKAXE, axe: BlockType.DIAMOND_AXE, shovel: BlockType.DIAMOND_SHOVEL },
];
for (const t of HEAVY) {
    push(3, [t.mat, t.mat, t.mat, null, S, null, null, S, null], t.pick, 1);
    push(3, [t.mat, t.mat, null, t.mat, S, null, null, S, null], t.axe, 1);
    push(3, [t.mat, t.mat, null, null, t.mat, S, null, S, null], t.axe, 1);
    push(3, [null, t.mat, null, null, S, null, null, S, null], t.shovel, 1);
}

// Sandstone from sand (2x2)
push(2, [BlockType.SAND, BlockType.SAND, BlockType.SAND, BlockType.SAND], BlockType.SANDSTONE, 1);
push(2, [BlockType.RED_SAND, BlockType.RED_SAND, BlockType.RED_SAND, BlockType.RED_SAND], BlockType.RED_SANDSTONE, 1);

// --- Magnetic Fields: magnetite traversal blocks + Polarity Boots ---
// Positive/Negative Magnetite Block: eight matching crystals around one iron ingot.
const PC = BlockType.POSITIVE_MAGNETITE_CRYSTAL;
const NC = BlockType.NEGATIVE_MAGNETITE_CRYSTAL;
const FE = BlockType.IRON_INGOT;
push(3, [PC, PC, PC, PC, FE, PC, PC, PC, PC], BlockType.POSITIVE_MAGNET, 1);
push(3, [NC, NC, NC, NC, FE, NC, NC, NC, NC], BlockType.NEGATIVE_MAGNET, 1);

// Polarity Boots: boots silhouette (iron sides) with one crystal of each polarity
// in the bottom corners. Mirrored so crystal order doesn't matter.
push(3, [null, null, null, FE, null, FE, PC, null, NC], BlockType.POLARITY_BOOTS, 1);
push(3, [null, null, null, FE, null, FE, NC, null, PC], BlockType.POLARITY_BOOTS, 1);

// Magnetite building set: bricks (2x2 → 4), chiseled (2 slabs stacked → 1).
const MAG = BlockType.MAGNETITE_BLOCK;
push(2, [MAG, MAG, MAG, MAG], BlockType.MAGNETITE_BRICKS, 4);
push(2, [BlockType.MAGNETITE_SLAB, null, BlockType.MAGNETITE_SLAB, null], BlockType.CHISELED_MAGNETITE, 1);

interface TrimmedGrid {
    cells: (BlockType | null)[];
    w: number;
    h: number;
}

function trimGrid(grid: (BlockType | null)[], width: number): TrimmedGrid | null {
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
    if (maxX === -1) return null;
    const newWidth = maxX - minX + 1;
    const newHeight = maxY - minY + 1;
    const cells: (BlockType | null)[] = new Array(newWidth * newHeight).fill(null);
    for (let y = 0; y < newHeight; y++) {
        for (let x = 0; x < newWidth; x++) {
            cells[y * newWidth + x] = grid[(minY + y) * width + (minX + x)];
        }
    }
    return { cells, w: newWidth, h: newHeight };
}

export const checkRecipe = (grid: (BlockType | null)[], gridWidth: number): { type: BlockType, count: number } | null => {
    const input = trimGrid(grid, gridWidth);
    if (!input) return null;

    for (const recipe of RECIPES) {
        const r = trimGrid(recipe.pattern, recipe.gridSize);
        if (!r) continue;

        // Exact shape match (width AND height), not just cell count — otherwise a
        // 1x3 column and a 3x1 row both "match" (e.g. stacked planks -> slabs).
        if (input.w !== r.w || input.h !== r.h) continue;

        let match = true;
        for (let i = 0; i < input.cells.length; i++) {
            if (input.cells[i] !== r.cells[i]) { match = false; break; }
        }
        if (match) return recipe.output;
    }
    return null;
};
