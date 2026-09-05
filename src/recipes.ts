import { itemForBlock } from './systems/registry/contentIds';

import { ItemType } from './types';
import { STONE_TOOL_MATERIALS as BLOCK_STONE_TOOL_MATERIALS, WOOD_FAMILIES as BLOCK_WOOD_FAMILIES } from './systems/registry/blockFamilies';
const STONE_TOOL_MATERIALS = BLOCK_STONE_TOOL_MATERIALS.map(itemForBlock);
const WOOD_FAMILIES = BLOCK_WOOD_FAMILIES.map(f => ({ ...f, log: itemForBlock(f.log), planks: itemForBlock(f.planks), sapling: itemForBlock(f.sapling), slab: itemForBlock(f.slab), stairs: itemForBlock(f.stairs) }));

export interface Recipe {
    gridSize: 2 | 3;
    pattern: (ItemType | null)[];
    output: { type: ItemType, count: number };
}

export const RECIPES: Recipe[] = [
    // --- 2x2 ---
    { gridSize: 2, pattern: [ItemType.LOG, null, null, null], output: { type: ItemType.OAK_PLANKS, count: 4 } },
    { gridSize: 2, pattern: [ItemType.SPRUCE_LOG, null, null, null], output: { type: ItemType.SPRUCE_PLANKS, count: 4 } },
    { gridSize: 2, pattern: [ItemType.CHERRY_LOG, null, null, null], output: { type: ItemType.CHERRY_PLANKS, count: 4 } },
    { gridSize: 2, pattern: [ItemType.BIRCH_LOG, null, null, null], output: { type: ItemType.BIRCH_PLANKS, count: 4 } },
    { gridSize: 2, pattern: [ItemType.JUNGLE_LOG, null, null, null], output: { type: ItemType.JUNGLE_PLANKS, count: 4 } },
    { gridSize: 2, pattern: [ItemType.DARK_OAK_LOG, null, null, null], output: { type: ItemType.DARK_OAK_PLANKS, count: 4 } },
    { gridSize: 2, pattern: [ItemType.ACACIA_LOG, null, null, null], output: { type: ItemType.ACACIA_PLANKS, count: 4 } },

    { gridSize: 2, pattern: [ItemType.OAK_PLANKS, null, ItemType.OAK_PLANKS, null], output: { type: ItemType.STICK, count: 4 } },
    { gridSize: 2, pattern: [ItemType.SPRUCE_PLANKS, null, ItemType.SPRUCE_PLANKS, null], output: { type: ItemType.STICK, count: 4 } },
    { gridSize: 2, pattern: [ItemType.CHERRY_PLANKS, null, ItemType.CHERRY_PLANKS, null], output: { type: ItemType.STICK, count: 4 } },
    { gridSize: 2, pattern: [ItemType.BIRCH_PLANKS, null, ItemType.BIRCH_PLANKS, null], output: { type: ItemType.STICK, count: 4 } },
    { gridSize: 2, pattern: [ItemType.JUNGLE_PLANKS, null, ItemType.JUNGLE_PLANKS, null], output: { type: ItemType.STICK, count: 4 } },
    { gridSize: 2, pattern: [ItemType.DARK_OAK_PLANKS, null, ItemType.DARK_OAK_PLANKS, null], output: { type: ItemType.STICK, count: 4 } },
    { gridSize: 2, pattern: [ItemType.ACACIA_PLANKS, null, ItemType.ACACIA_PLANKS, null], output: { type: ItemType.STICK, count: 4 } },

    { gridSize: 2, pattern: [ItemType.OAK_PLANKS, ItemType.OAK_PLANKS, ItemType.OAK_PLANKS, ItemType.OAK_PLANKS], output: { type: ItemType.CRAFTING_TABLE, count: 1 } },
    { gridSize: 2, pattern: [ItemType.SPRUCE_PLANKS, ItemType.SPRUCE_PLANKS, ItemType.SPRUCE_PLANKS, ItemType.SPRUCE_PLANKS], output: { type: ItemType.CRAFTING_TABLE, count: 1 } },
    { gridSize: 2, pattern: [ItemType.CHERRY_PLANKS, ItemType.CHERRY_PLANKS, ItemType.CHERRY_PLANKS, ItemType.CHERRY_PLANKS], output: { type: ItemType.CRAFTING_TABLE, count: 1 } },
    { gridSize: 2, pattern: [ItemType.BIRCH_PLANKS, ItemType.BIRCH_PLANKS, ItemType.BIRCH_PLANKS, ItemType.BIRCH_PLANKS], output: { type: ItemType.CRAFTING_TABLE, count: 1 } },
    { gridSize: 2, pattern: [ItemType.JUNGLE_PLANKS, ItemType.JUNGLE_PLANKS, ItemType.JUNGLE_PLANKS, ItemType.JUNGLE_PLANKS], output: { type: ItemType.CRAFTING_TABLE, count: 1 } },
    { gridSize: 2, pattern: [ItemType.DARK_OAK_PLANKS, ItemType.DARK_OAK_PLANKS, ItemType.DARK_OAK_PLANKS, ItemType.DARK_OAK_PLANKS], output: { type: ItemType.CRAFTING_TABLE, count: 1 } },
    { gridSize: 2, pattern: [ItemType.ACACIA_PLANKS, ItemType.ACACIA_PLANKS, ItemType.ACACIA_PLANKS, ItemType.ACACIA_PLANKS], output: { type: ItemType.CRAFTING_TABLE, count: 1 } },

    { gridSize: 2, pattern: [ItemType.OAK_PLANKS, ItemType.OAK_PLANKS, ItemType.STICK, ItemType.STICK], output: { type: ItemType.WOOD_PICKAXE, count: 1 } },
    { gridSize: 2, pattern: [ItemType.SPRUCE_PLANKS, ItemType.SPRUCE_PLANKS, ItemType.STICK, ItemType.STICK], output: { type: ItemType.WOOD_PICKAXE, count: 1 } },
    { gridSize: 2, pattern: [ItemType.CHERRY_PLANKS, ItemType.CHERRY_PLANKS, ItemType.STICK, ItemType.STICK], output: { type: ItemType.WOOD_PICKAXE, count: 1 } },
    { gridSize: 2, pattern: [ItemType.BIRCH_PLANKS, ItemType.BIRCH_PLANKS, ItemType.STICK, ItemType.STICK], output: { type: ItemType.WOOD_PICKAXE, count: 1 } },
    { gridSize: 2, pattern: [ItemType.JUNGLE_PLANKS, ItemType.JUNGLE_PLANKS, ItemType.STICK, ItemType.STICK], output: { type: ItemType.WOOD_PICKAXE, count: 1 } },
    { gridSize: 2, pattern: [ItemType.DARK_OAK_PLANKS, ItemType.DARK_OAK_PLANKS, ItemType.STICK, ItemType.STICK], output: { type: ItemType.WOOD_PICKAXE, count: 1 } },
    { gridSize: 2, pattern: [ItemType.ACACIA_PLANKS, ItemType.ACACIA_PLANKS, ItemType.STICK, ItemType.STICK], output: { type: ItemType.WOOD_PICKAXE, count: 1 } },
    
    // Torch
    { gridSize: 2, pattern: [ItemType.COAL, null, ItemType.STICK, null], output: { type: ItemType.TORCH, count: 4 } },
    { gridSize: 2, pattern: [ItemType.CHARCOAL, null, ItemType.STICK, null], output: { type: ItemType.TORCH, count: 4 } },

    // --- 3x3 ---
    // Furnace
    { 
        gridSize: 3, 
        pattern: [
            ItemType.COBBLESTONE, ItemType.COBBLESTONE, ItemType.COBBLESTONE,
            ItemType.COBBLESTONE, null,                  ItemType.COBBLESTONE,
            ItemType.COBBLESTONE, ItemType.COBBLESTONE, ItemType.COBBLESTONE
        ],
        output: { type: ItemType.FURNACE, count: 1 }
    },
    // Chest
    { 
        gridSize: 3, 
        pattern: [
            ItemType.OAK_PLANKS, ItemType.OAK_PLANKS, ItemType.OAK_PLANKS,
            ItemType.OAK_PLANKS, null,             ItemType.OAK_PLANKS,
            ItemType.OAK_PLANKS, ItemType.OAK_PLANKS, ItemType.OAK_PLANKS
        ],
        output: { type: ItemType.CHEST, count: 1 }
    },
    { 
        gridSize: 3, 
        pattern: [
            ItemType.SPRUCE_PLANKS, ItemType.SPRUCE_PLANKS, ItemType.SPRUCE_PLANKS,
            ItemType.SPRUCE_PLANKS, null,             ItemType.SPRUCE_PLANKS,
            ItemType.SPRUCE_PLANKS, ItemType.SPRUCE_PLANKS, ItemType.SPRUCE_PLANKS
        ],
        output: { type: ItemType.CHEST, count: 1 }
    },
    { 
        gridSize: 3, 
        pattern: [
            ItemType.CHERRY_PLANKS, ItemType.CHERRY_PLANKS, ItemType.CHERRY_PLANKS,
            ItemType.CHERRY_PLANKS, null,             ItemType.CHERRY_PLANKS,
            ItemType.CHERRY_PLANKS, ItemType.CHERRY_PLANKS, ItemType.CHERRY_PLANKS
        ],
        output: { type: ItemType.CHEST, count: 1 }
    },
    { 
        gridSize: 3, 
        pattern: [
            ItemType.BIRCH_PLANKS, ItemType.BIRCH_PLANKS, ItemType.BIRCH_PLANKS,
            ItemType.BIRCH_PLANKS, null,             ItemType.BIRCH_PLANKS,
            ItemType.BIRCH_PLANKS, ItemType.BIRCH_PLANKS, ItemType.BIRCH_PLANKS
        ],
        output: { type: ItemType.CHEST, count: 1 }
    },
    {
        gridSize: 3,
        pattern: [
            ItemType.JUNGLE_PLANKS, ItemType.JUNGLE_PLANKS, ItemType.JUNGLE_PLANKS,
            ItemType.JUNGLE_PLANKS, null,             ItemType.JUNGLE_PLANKS,
            ItemType.JUNGLE_PLANKS, ItemType.JUNGLE_PLANKS, ItemType.JUNGLE_PLANKS
        ],
        output: { type: ItemType.CHEST, count: 1 }
    },
    {
        gridSize: 3,
        pattern: [
            ItemType.DARK_OAK_PLANKS, ItemType.DARK_OAK_PLANKS, ItemType.DARK_OAK_PLANKS,
            ItemType.DARK_OAK_PLANKS, null,             ItemType.DARK_OAK_PLANKS,
            ItemType.DARK_OAK_PLANKS, ItemType.DARK_OAK_PLANKS, ItemType.DARK_OAK_PLANKS
        ],
        output: { type: ItemType.CHEST, count: 1 }
    },
    {
        gridSize: 3,
        pattern: [
            ItemType.ACACIA_PLANKS, ItemType.ACACIA_PLANKS, ItemType.ACACIA_PLANKS,
            ItemType.ACACIA_PLANKS, null,             ItemType.ACACIA_PLANKS,
            ItemType.ACACIA_PLANKS, ItemType.ACACIA_PLANKS, ItemType.ACACIA_PLANKS
        ],
        output: { type: ItemType.CHEST, count: 1 }
    },
    // Bed
    {
        gridSize: 3,
        pattern: [
            ItemType.WOOL, ItemType.WOOL, ItemType.WOOL,
            ItemType.OAK_PLANKS, ItemType.OAK_PLANKS, ItemType.OAK_PLANKS,
            null, null, null
        ],
        output: { type: ItemType.BED_ITEM, count: 1 }
    },
    {
        gridSize: 3,
        pattern: [
            ItemType.WOOL, ItemType.WOOL, ItemType.WOOL,
            ItemType.SPRUCE_PLANKS, ItemType.SPRUCE_PLANKS, ItemType.SPRUCE_PLANKS,
            null, null, null
        ],
        output: { type: ItemType.BED_ITEM, count: 1 }
    },
    {
        gridSize: 3,
        pattern: [
            ItemType.WOOL, ItemType.WOOL, ItemType.WOOL,
            ItemType.CHERRY_PLANKS, ItemType.CHERRY_PLANKS, ItemType.CHERRY_PLANKS,
            null, null, null
        ],
        output: { type: ItemType.BED_ITEM, count: 1 }
    },
    {
        gridSize: 3,
        pattern: [
            ItemType.WOOL, ItemType.WOOL, ItemType.WOOL,
            ItemType.BIRCH_PLANKS, ItemType.BIRCH_PLANKS, ItemType.BIRCH_PLANKS,
            null, null, null
        ],
        output: { type: ItemType.BED_ITEM, count: 1 }
    },
    {
        gridSize: 3,
        pattern: [
            ItemType.WOOL, ItemType.WOOL, ItemType.WOOL,
            ItemType.JUNGLE_PLANKS, ItemType.JUNGLE_PLANKS, ItemType.JUNGLE_PLANKS,
            null, null, null
        ],
        output: { type: ItemType.BED_ITEM, count: 1 }
    },
    {
        gridSize: 3,
        pattern: [
            ItemType.WOOL, ItemType.WOOL, ItemType.WOOL,
            ItemType.DARK_OAK_PLANKS, ItemType.DARK_OAK_PLANKS, ItemType.DARK_OAK_PLANKS,
            null, null, null
        ],
        output: { type: ItemType.BED_ITEM, count: 1 }
    },
    {
        gridSize: 3,
        pattern: [
            ItemType.WOOL, ItemType.WOOL, ItemType.WOOL,
            ItemType.ACACIA_PLANKS, ItemType.ACACIA_PLANKS, ItemType.ACACIA_PLANKS,
            null, null, null
        ],
        output: { type: ItemType.BED_ITEM, count: 1 }
    },

    // TOOLS 3x3
    // Pickaxes
    { gridSize: 3, pattern: [ItemType.OAK_PLANKS, ItemType.OAK_PLANKS, ItemType.OAK_PLANKS, null, ItemType.STICK, null, null, ItemType.STICK, null], output: { type: ItemType.WOOD_PICKAXE, count: 1 } },
    { gridSize: 3, pattern: [ItemType.SPRUCE_PLANKS, ItemType.SPRUCE_PLANKS, ItemType.SPRUCE_PLANKS, null, ItemType.STICK, null, null, ItemType.STICK, null], output: { type: ItemType.WOOD_PICKAXE, count: 1 } },
    { gridSize: 3, pattern: [ItemType.CHERRY_PLANKS, ItemType.CHERRY_PLANKS, ItemType.CHERRY_PLANKS, null, ItemType.STICK, null, null, ItemType.STICK, null], output: { type: ItemType.WOOD_PICKAXE, count: 1 } },
    { gridSize: 3, pattern: [ItemType.BIRCH_PLANKS, ItemType.BIRCH_PLANKS, ItemType.BIRCH_PLANKS, null, ItemType.STICK, null, null, ItemType.STICK, null], output: { type: ItemType.WOOD_PICKAXE, count: 1 } },
    { gridSize: 3, pattern: [ItemType.JUNGLE_PLANKS, ItemType.JUNGLE_PLANKS, ItemType.JUNGLE_PLANKS, null, ItemType.STICK, null, null, ItemType.STICK, null], output: { type: ItemType.WOOD_PICKAXE, count: 1 } },
    { gridSize: 3, pattern: [ItemType.DARK_OAK_PLANKS, ItemType.DARK_OAK_PLANKS, ItemType.DARK_OAK_PLANKS, null, ItemType.STICK, null, null, ItemType.STICK, null], output: { type: ItemType.WOOD_PICKAXE, count: 1 } },
    { gridSize: 3, pattern: [ItemType.ACACIA_PLANKS, ItemType.ACACIA_PLANKS, ItemType.ACACIA_PLANKS, null, ItemType.STICK, null, null, ItemType.STICK, null], output: { type: ItemType.WOOD_PICKAXE, count: 1 } },
    { gridSize: 3, pattern: [ItemType.IRON_INGOT, ItemType.IRON_INGOT, ItemType.IRON_INGOT, null, ItemType.STICK, null, null, ItemType.STICK, null], output: { type: ItemType.IRON_PICKAXE, count: 1 } },
    { gridSize: 3, pattern: [ItemType.COPPER_INGOT, ItemType.COPPER_INGOT, ItemType.COPPER_INGOT, null, ItemType.STICK, null, null, ItemType.STICK, null], output: { type: ItemType.COPPER_PICKAXE, count: 1 } },
    
    // Axes (Right-handed)
    { gridSize: 3, pattern: [ItemType.OAK_PLANKS, ItemType.OAK_PLANKS, null, ItemType.OAK_PLANKS, ItemType.STICK, null, null, ItemType.STICK, null], output: { type: ItemType.WOOD_AXE, count: 1 } },
    { gridSize: 3, pattern: [ItemType.SPRUCE_PLANKS, ItemType.SPRUCE_PLANKS, null, ItemType.SPRUCE_PLANKS, ItemType.STICK, null, null, ItemType.STICK, null], output: { type: ItemType.WOOD_AXE, count: 1 } },
    { gridSize: 3, pattern: [ItemType.CHERRY_PLANKS, ItemType.CHERRY_PLANKS, null, ItemType.CHERRY_PLANKS, ItemType.STICK, null, null, ItemType.STICK, null], output: { type: ItemType.WOOD_AXE, count: 1 } },
    { gridSize: 3, pattern: [ItemType.BIRCH_PLANKS, ItemType.BIRCH_PLANKS, null, ItemType.BIRCH_PLANKS, ItemType.STICK, null, null, ItemType.STICK, null], output: { type: ItemType.WOOD_AXE, count: 1 } },
    { gridSize: 3, pattern: [ItemType.JUNGLE_PLANKS, ItemType.JUNGLE_PLANKS, null, ItemType.JUNGLE_PLANKS, ItemType.STICK, null, null, ItemType.STICK, null], output: { type: ItemType.WOOD_AXE, count: 1 } },
    { gridSize: 3, pattern: [ItemType.DARK_OAK_PLANKS, ItemType.DARK_OAK_PLANKS, null, ItemType.DARK_OAK_PLANKS, ItemType.STICK, null, null, ItemType.STICK, null], output: { type: ItemType.WOOD_AXE, count: 1 } },
    { gridSize: 3, pattern: [ItemType.ACACIA_PLANKS, ItemType.ACACIA_PLANKS, null, ItemType.ACACIA_PLANKS, ItemType.STICK, null, null, ItemType.STICK, null], output: { type: ItemType.WOOD_AXE, count: 1 } },
    { gridSize: 3, pattern: [ItemType.IRON_INGOT, ItemType.IRON_INGOT, null, ItemType.IRON_INGOT, ItemType.STICK, null, null, ItemType.STICK, null], output: { type: ItemType.IRON_AXE, count: 1 } },
    { gridSize: 3, pattern: [ItemType.COPPER_INGOT, ItemType.COPPER_INGOT, null, ItemType.COPPER_INGOT, ItemType.STICK, null, null, ItemType.STICK, null], output: { type: ItemType.COPPER_AXE, count: 1 } },

    // Axes (Left-handed / Mirrored)
    { gridSize: 3, pattern: [ItemType.OAK_PLANKS, ItemType.OAK_PLANKS, null, null, ItemType.OAK_PLANKS, ItemType.STICK, null, ItemType.STICK, null], output: { type: ItemType.WOOD_AXE, count: 1 } },
    { gridSize: 3, pattern: [ItemType.SPRUCE_PLANKS, ItemType.SPRUCE_PLANKS, null, null, ItemType.SPRUCE_PLANKS, ItemType.STICK, null, ItemType.STICK, null], output: { type: ItemType.WOOD_AXE, count: 1 } },
    { gridSize: 3, pattern: [ItemType.CHERRY_PLANKS, ItemType.CHERRY_PLANKS, null, null, ItemType.CHERRY_PLANKS, ItemType.STICK, null, ItemType.STICK, null], output: { type: ItemType.WOOD_AXE, count: 1 } },
    { gridSize: 3, pattern: [ItemType.BIRCH_PLANKS, ItemType.BIRCH_PLANKS, null, null, ItemType.BIRCH_PLANKS, ItemType.STICK, null, ItemType.STICK, null], output: { type: ItemType.WOOD_AXE, count: 1 } },
    { gridSize: 3, pattern: [ItemType.JUNGLE_PLANKS, ItemType.JUNGLE_PLANKS, null, null, ItemType.JUNGLE_PLANKS, ItemType.STICK, null, ItemType.STICK, null], output: { type: ItemType.WOOD_AXE, count: 1 } },
    { gridSize: 3, pattern: [ItemType.DARK_OAK_PLANKS, ItemType.DARK_OAK_PLANKS, null, null, ItemType.DARK_OAK_PLANKS, ItemType.STICK, null, ItemType.STICK, null], output: { type: ItemType.WOOD_AXE, count: 1 } },
    { gridSize: 3, pattern: [ItemType.ACACIA_PLANKS, ItemType.ACACIA_PLANKS, null, null, ItemType.ACACIA_PLANKS, ItemType.STICK, null, ItemType.STICK, null], output: { type: ItemType.WOOD_AXE, count: 1 } },
    { gridSize: 3, pattern: [ItemType.IRON_INGOT, ItemType.IRON_INGOT, null, null, ItemType.IRON_INGOT, ItemType.STICK, null, ItemType.STICK, null], output: { type: ItemType.IRON_AXE, count: 1 } },
    { gridSize: 3, pattern: [ItemType.COPPER_INGOT, ItemType.COPPER_INGOT, null, null, ItemType.COPPER_INGOT, ItemType.STICK, null, ItemType.STICK, null], output: { type: ItemType.COPPER_AXE, count: 1 } },

    // Shovels
    { gridSize: 3, pattern: [null, ItemType.OAK_PLANKS, null, null, ItemType.STICK, null, null, ItemType.STICK, null], output: { type: ItemType.WOOD_SHOVEL, count: 1 } },
    { gridSize: 3, pattern: [null, ItemType.SPRUCE_PLANKS, null, null, ItemType.STICK, null, null, ItemType.STICK, null], output: { type: ItemType.WOOD_SHOVEL, count: 1 } },
    { gridSize: 3, pattern: [null, ItemType.CHERRY_PLANKS, null, null, ItemType.STICK, null, null, ItemType.STICK, null], output: { type: ItemType.WOOD_SHOVEL, count: 1 } },
    { gridSize: 3, pattern: [null, ItemType.BIRCH_PLANKS, null, null, ItemType.STICK, null, null, ItemType.STICK, null], output: { type: ItemType.WOOD_SHOVEL, count: 1 } },
    { gridSize: 3, pattern: [null, ItemType.JUNGLE_PLANKS, null, null, ItemType.STICK, null, null, ItemType.STICK, null], output: { type: ItemType.WOOD_SHOVEL, count: 1 } },
    { gridSize: 3, pattern: [null, ItemType.DARK_OAK_PLANKS, null, null, ItemType.STICK, null, null, ItemType.STICK, null], output: { type: ItemType.WOOD_SHOVEL, count: 1 } },
    { gridSize: 3, pattern: [null, ItemType.ACACIA_PLANKS, null, null, ItemType.STICK, null, null, ItemType.STICK, null], output: { type: ItemType.WOOD_SHOVEL, count: 1 } },
    { gridSize: 3, pattern: [null, ItemType.IRON_INGOT, null, null, ItemType.STICK, null, null, ItemType.STICK, null], output: { type: ItemType.IRON_SHOVEL, count: 1 } },
    { gridSize: 3, pattern: [null, ItemType.COPPER_INGOT, null, null, ItemType.STICK, null, null, ItemType.STICK, null], output: { type: ItemType.COPPER_SHOVEL, count: 1 } },
];

// --- Generated recipes: stairs, slabs, swords, hoes, gold/diamond tools, sandstone ---
const S = ItemType.STICK;
const push = (gridSize: 2 | 3, pattern: (ItemType | null)[], type: ItemType, count: number) =>
    RECIPES.push({ gridSize, pattern, output: { type, count } });

push(3, [
    ItemType.IRON_INGOT, ItemType.IRON_INGOT, ItemType.IRON_INGOT,
    ItemType.IRON_INGOT, ItemType.IRON_INGOT, ItemType.IRON_INGOT,
    ItemType.IRON_INGOT, ItemType.IRON_INGOT, ItemType.IRON_INGOT,
], ItemType.IRON_BLOCK, 1);
push(2, [ItemType.IRON_BLOCK, null, null, null], ItemType.IRON_INGOT, 9);

// Stairs (6 blocks -> 4, both handedness) + slabs (3 in a row -> 6)
const SHAPE_FAMILIES: { mat: ItemType, slab: ItemType, stairs: ItemType }[] = [
    ...WOOD_FAMILIES.map(({ planks, slab, stairs }) => ({ mat: planks, slab, stairs })),
    { mat: ItemType.COBBLESTONE, slab: ItemType.COBBLESTONE_SLAB, stairs: ItemType.COBBLESTONE_STAIRS },
    { mat: ItemType.STONE, slab: ItemType.STONE_SLAB, stairs: ItemType.STONE_STAIRS },
    { mat: ItemType.SANDSTONE, slab: ItemType.SANDSTONE_SLAB, stairs: ItemType.SANDSTONE_STAIRS },
    { mat: ItemType.RED_SANDSTONE, slab: ItemType.RED_SANDSTONE_SLAB, stairs: ItemType.RED_SANDSTONE_STAIRS },
    { mat: ItemType.BRICK, slab: ItemType.BRICK_SLAB, stairs: ItemType.BRICK_STAIRS },
    { mat: ItemType.MAGNETITE_BLOCK, slab: ItemType.MAGNETITE_SLAB, stairs: ItemType.MAGNETITE_STAIRS },
    { mat: ItemType.MAGNETITE_BRICKS, slab: ItemType.MAGNETITE_BRICK_SLAB, stairs: ItemType.MAGNETITE_BRICK_STAIRS },
];
for (const f of SHAPE_FAMILIES) {
    push(3, [null, null, null, f.mat, f.mat, f.mat, null, null, null], f.slab, 6);
    push(3, [f.mat, null, null, f.mat, f.mat, null, f.mat, f.mat, f.mat], f.stairs, 4);
    push(3, [null, null, f.mat, null, f.mat, f.mat, f.mat, f.mat, f.mat], f.stairs, 4);
}

// Swords (2 material + stick) and hoes (2 material + 2 sticks, both handedness)
const SWORD_HOE: { mat: ItemType, sword: ItemType, hoe: ItemType }[] = [
    { mat: ItemType.IRON_INGOT, sword: ItemType.IRON_SWORD, hoe: ItemType.IRON_HOE },
    { mat: ItemType.COPPER_INGOT, sword: ItemType.COPPER_SWORD, hoe: ItemType.COPPER_HOE },
    { mat: ItemType.GOLD_INGOT, sword: ItemType.GOLD_SWORD, hoe: ItemType.GOLD_HOE },
    { mat: ItemType.DIAMOND, sword: ItemType.DIAMOND_SWORD, hoe: ItemType.DIAMOND_HOE },
];
for (const t of SWORD_HOE) {
    push(3, [null, t.mat, null, null, t.mat, null, null, S, null], t.sword, 1);
    push(3, [t.mat, t.mat, null, null, S, null, null, S, null], t.hoe, 1);
    push(3, [null, t.mat, t.mat, null, S, null, null, S, null], t.hoe, 1);
}
// Wooden swords/hoes (one per plank family)
for (const { planks } of WOOD_FAMILIES) {
    push(3, [null, planks, null, null, planks, null, null, S, null], ItemType.WOOD_SWORD, 1);
    push(3, [planks, planks, null, null, S, null, null, S, null], ItemType.WOOD_HOE, 1);
    push(3, [null, planks, planks, null, S, null, null, S, null], ItemType.WOOD_HOE, 1);
}

for (const material of STONE_TOOL_MATERIALS) {
    push(3, [material, material, material, null, S, null, null, S, null], ItemType.STONE_PICKAXE, 1);
    push(3, [material, material, null, material, S, null, null, S, null], ItemType.STONE_AXE, 1);
    push(3, [material, material, null, null, material, S, null, S, null], ItemType.STONE_AXE, 1);
    push(3, [null, material, null, null, S, null, null, S, null], ItemType.STONE_SHOVEL, 1);
    push(3, [null, material, null, null, material, null, null, S, null], ItemType.STONE_SWORD, 1);
    push(3, [material, material, null, null, S, null, null, S, null], ItemType.STONE_HOE, 1);
    push(3, [null, material, material, null, S, null, null, S, null], ItemType.STONE_HOE, 1);
}

// Gold & Diamond pickaxe / axe / shovel (the other tiers already existed)
const HEAVY: { mat: ItemType, pick: ItemType, axe: ItemType, shovel: ItemType }[] = [
    { mat: ItemType.GOLD_INGOT, pick: ItemType.GOLD_PICKAXE, axe: ItemType.GOLD_AXE, shovel: ItemType.GOLD_SHOVEL },
    { mat: ItemType.DIAMOND, pick: ItemType.DIAMOND_PICKAXE, axe: ItemType.DIAMOND_AXE, shovel: ItemType.DIAMOND_SHOVEL },
];
for (const t of HEAVY) {
    push(3, [t.mat, t.mat, t.mat, null, S, null, null, S, null], t.pick, 1);
    push(3, [t.mat, t.mat, null, t.mat, S, null, null, S, null], t.axe, 1);
    push(3, [t.mat, t.mat, null, null, t.mat, S, null, S, null], t.axe, 1);
    push(3, [null, t.mat, null, null, S, null, null, S, null], t.shovel, 1);
}

// Sandstone from sand (2x2)
push(2, [ItemType.SAND, ItemType.SAND, ItemType.SAND, ItemType.SAND], ItemType.SANDSTONE, 1);
push(2, [ItemType.RED_SAND, ItemType.RED_SAND, ItemType.RED_SAND, ItemType.RED_SAND], ItemType.RED_SANDSTONE, 1);

// --- Magnetic Fields: magnetite traversal blocks + Polarity Boots ---
// Positive/Negative Magnetite Block: eight matching crystals around one iron ingot.
const PC = ItemType.POSITIVE_MAGNETITE_CRYSTAL;
const NC = ItemType.NEGATIVE_MAGNETITE_CRYSTAL;
const FE = ItemType.IRON_INGOT;
push(3, [PC, PC, PC, PC, FE, PC, PC, PC, PC], ItemType.POSITIVE_MAGNET, 1);
push(3, [NC, NC, NC, NC, FE, NC, NC, NC, NC], ItemType.NEGATIVE_MAGNET, 1);

// Polarity Boots: boots silhouette (iron sides) with one crystal of each polarity
// in the bottom corners. Mirrored so crystal order doesn't matter.
push(3, [null, null, null, FE, null, FE, PC, null, NC], ItemType.POLARITY_BOOTS, 1);
push(3, [null, null, null, FE, null, FE, NC, null, PC], ItemType.POLARITY_BOOTS, 1);

// Upgraded Polarity Boots: combine the boots with the Magnetic Warden's upgrade
// drop (either order, placed side by side).
push(2, [ItemType.POLARITY_BOOTS, ItemType.POLARITY_BOOTS_UPGRADE, null, null], ItemType.UPGRADED_POLARITY_BOOTS, 1);
push(2, [ItemType.POLARITY_BOOTS_UPGRADE, ItemType.POLARITY_BOOTS, null, null], ItemType.UPGRADED_POLARITY_BOOTS, 1);

// Magnetite building set: bricks (2x2 → 4), chiseled (2 slabs stacked → 1).
const MAG = ItemType.MAGNETITE_BLOCK;
push(2, [MAG, MAG, MAG, MAG], ItemType.MAGNETITE_BRICKS, 4);
push(2, [ItemType.MAGNETITE_SLAB, null, ItemType.MAGNETITE_SLAB, null], ItemType.CHISELED_MAGNETITE, 1);

// Charged Magnetite (emissive building light): a shard set into a magnetite block.
const SH = ItemType.MAGNETITE_SHARD;
push(2, [SH, null, MAG, null], ItemType.CHARGED_MAGNETITE, 1);

// Magnetic Spikes (fall-damage hazard): a shard crown over a magnetite base.
push(3, [null, null, null, SH, null, SH, MAG, MAG, MAG], ItemType.MAGNETIC_SPIKE, 4);

// --- Armor (iron / gold / diamond / copper) ---
// Helmet, chestplate, leggings, boots use the classic silhouettes. These were
// missing entirely, which made every armor set creative-only.
const ARMOR_SETS: { mat: ItemType; helmet: ItemType; chestplate: ItemType; leggings: ItemType; boots: ItemType }[] = [
    { mat: ItemType.IRON_INGOT, helmet: ItemType.IRON_HELMET, chestplate: ItemType.IRON_CHESTPLATE, leggings: ItemType.IRON_LEGGINGS, boots: ItemType.IRON_BOOTS },
    { mat: ItemType.GOLD_INGOT, helmet: ItemType.GOLD_HELMET, chestplate: ItemType.GOLD_CHESTPLATE, leggings: ItemType.GOLD_LEGGINGS, boots: ItemType.GOLD_BOOTS },
    { mat: ItemType.DIAMOND, helmet: ItemType.DIAMOND_HELMET, chestplate: ItemType.DIAMOND_CHESTPLATE, leggings: ItemType.DIAMOND_LEGGINGS, boots: ItemType.DIAMOND_BOOTS },
    { mat: ItemType.COPPER_INGOT, helmet: ItemType.COPPER_HELMET, chestplate: ItemType.COPPER_CHESTPLATE, leggings: ItemType.COPPER_LEGGINGS, boots: ItemType.COPPER_BOOTS },
];
for (const a of ARMOR_SETS) {
    const M = a.mat;
    push(3, [M, M, M, M, null, M, null, null, null], a.helmet, 1);
    push(3, [M, null, M, M, M, M, M, M, M], a.chestplate, 1);
    push(3, [M, M, M, M, null, M, M, null, M], a.leggings, 1);
    push(3, [null, null, null, M, null, M, M, null, M], a.boots, 1);
}

// Wool from woven plant fiber, wheat seeds were a dead-end drop and wool (the
// bed ingredient, i.e. respawn anchors) had no survival source at all.
push(2, [ItemType.WHEAT_SEEDS, ItemType.WHEAT_SEEDS, ItemType.WHEAT_SEEDS, ItemType.WHEAT_SEEDS], ItemType.WOOL, 1);

// Packed ice from ice (Ice Spikes material, otherwise creative-only to build with).
push(2, [ItemType.ICE, ItemType.ICE, ItemType.ICE, ItemType.ICE], ItemType.PACKED_ICE, 1);

// Boat, classic hull silhouette (5 planks), one recipe per wood family.
for (const { planks } of WOOD_FAMILIES) {
    push(3, [null, null, null, planks, null, planks, planks, planks, planks], ItemType.BOAT, 1);
}

// --- Foods ---
// Forager's Bowl, the three foraged fruits together (apple + banana + lumen
// berry), in a row or column, any order, so it's easy to stumble onto.
const BOWL_PERMS: ItemType[][] = (() => {
    const [a, b, c] = [ItemType.APPLE, ItemType.BANANA, ItemType.LUMEN_BERRY];
    return [[a, b, c], [a, c, b], [b, a, c], [b, c, a], [c, a, b], [c, b, a]];
})();
for (const [p, q, r] of BOWL_PERMS) {
    // Horizontal row and vertical column variants.
    push(3, [null, null, null, p, q, r, null, null, null], ItemType.FORAGERS_BOWL, 1);
    push(3, [p, null, null, q, null, null, r, null, null], ItemType.FORAGERS_BOWL, 1);
}

interface TrimmedGrid {
    cells: (ItemType | null)[];
    w: number;
    h: number;
}

function trimGrid(grid: (ItemType | null)[], width: number): TrimmedGrid | null {
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
    const cells: (ItemType | null)[] = new Array(newWidth * newHeight).fill(null);
    for (let y = 0; y < newHeight; y++) {
        for (let x = 0; x < newWidth; x++) {
            cells[y * newWidth + x] = grid[(minY + y) * width + (minX + x)];
        }
    }
    return { cells, w: newWidth, h: newHeight };
}

export const checkRecipe = (grid: (ItemType | null)[], gridWidth: number): { type: ItemType, count: number } | null => {
    const input = trimGrid(grid, gridWidth);
    if (!input) return null;

    for (const recipe of RECIPES) {
        const r = trimGrid(recipe.pattern, recipe.gridSize);
        if (!r) continue;

        // Exact shape match (width AND height), not just cell count, otherwise a
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
