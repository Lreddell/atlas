import { itemForBlock } from '../systems/registry/contentIds';
import { RECIPES, type Recipe } from '../recipes';
import { ItemType } from '../types';
import { RESONANT_SHAPE_FAMILIES as BLOCK_RESONANT_SHAPE_FAMILIES } from '../systems/registry/blockFamilies';
const RESONANT_SHAPE_FAMILIES = BLOCK_RESONANT_SHAPE_FAMILIES.map(f => ({ ...f, material: itemForBlock(f.material), slab: itemForBlock(f.slab), stairs: itemForBlock(f.stairs) }));

const resonantShapeRecipes: Recipe[] = RESONANT_SHAPE_FAMILIES.flatMap(({ material, slab, stairs }) => [
    {
        gridSize: 3,
        pattern: [null, null, null, material, material, material, null, null, null],
        output: { type: slab, count: 6 },
    },
    {
        gridSize: 3,
        pattern: [material, null, null, material, material, null, material, material, material],
        output: { type: stairs, count: 4 },
    },
    {
        gridSize: 3,
        pattern: [null, null, material, null, material, material, material, material, material],
        output: { type: stairs, count: 4 },
    },
]);

export const RESONANT_RECIPES: Recipe[] = [
    { gridSize: 2, pattern: [ItemType.ECHO_SHARD, ItemType.ECHO_SHARD, null, null], output: { type: ItemType.ECHO_DUST, count: 4 } },
    { gridSize: 2, pattern: [ItemType.ECHO_STONE, ItemType.ECHO_STONE, ItemType.ECHO_STONE, ItemType.ECHO_STONE], output: { type: ItemType.ECHO_BRICKS, count: 4 } },
    { gridSize: 2, pattern: [ItemType.ECHO_BRICKS, ItemType.ECHO_DUST, null, null], output: { type: ItemType.CHISELED_ECHO_STONE, count: 1 } },
    { gridSize: 2, pattern: [ItemType.ECHO_STONE, ItemType.ECHO_DUST, ItemType.ECHO_STONE, ItemType.ECHO_DUST], output: { type: ItemType.ECHO_MOSAIC, count: 4 } },
    { gridSize: 2, pattern: [ItemType.FRACTURED_CORE, ItemType.FRACTURED_CORE, null, null], output: { type: ItemType.ECHO_DUST, count: 2 } },
    { gridSize: 3, pattern: [
        ItemType.ECHO_STONE, ItemType.ECHO_SHARD, ItemType.ECHO_STONE,
        ItemType.COPPER_INGOT, ItemType.ECHO_DUST, ItemType.COPPER_INGOT,
        ItemType.ECHO_STONE, ItemType.ECHO_STONE, ItemType.ECHO_STONE,
    ], output: { type: ItemType.RESONANCE_PYLON, count: 1 } },
    { gridSize: 3, pattern: [
        ItemType.GLASS, ItemType.ECHO_DUST, ItemType.GLASS,
        ItemType.COPPER_INGOT, ItemType.ECHO_SHARD, ItemType.COPPER_INGOT,
        ItemType.GLASS, ItemType.ECHO_DUST, ItemType.GLASS,
    ], output: { type: ItemType.RESONANT_LAMP, count: 2 } },
    { gridSize: 3, pattern: [
        ItemType.ECHO_BRICKS, ItemType.ECHO_DUST, ItemType.ECHO_BRICKS,
        ItemType.COPPER_INGOT, ItemType.ECHO_SHARD, ItemType.COPPER_INGOT,
        ItemType.ECHO_BRICKS, ItemType.ECHO_DUST, ItemType.ECHO_BRICKS,
    ], output: { type: ItemType.PULSE_CONDUIT, count: 4 } },
    { gridSize: 3, pattern: [
        ItemType.ECHO_MOSAIC, ItemType.ECHO_DUST, ItemType.ECHO_MOSAIC,
        ItemType.AMETHYST_BLOCK, ItemType.ECHO_SHARD, ItemType.AMETHYST_BLOCK,
        ItemType.ECHO_MOSAIC, ItemType.ECHO_DUST, ItemType.ECHO_MOSAIC,
    ], output: { type: ItemType.PHASE_BLOCK, count: 4 } },
    { gridSize: 3, pattern: [
        ItemType.IRON_INGOT, ItemType.ECHO_DUST, ItemType.IRON_INGOT,
        ItemType.ECHO_BRICKS, ItemType.ECHO_SHARD, ItemType.ECHO_BRICKS,
        ItemType.IRON_INGOT, ItemType.ECHO_DUST, ItemType.IRON_INGOT,
    ], output: { type: ItemType.RESONANCE_PLATE, count: 2 } },
    { gridSize: 3, pattern: [
        ItemType.ECHO_BRICKS, ItemType.ECHO_BRICKS, ItemType.ECHO_BRICKS,
        ItemType.ECHO_BRICKS, ItemType.ECHO_CORE, ItemType.ECHO_BRICKS,
        ItemType.ECHO_BRICKS, ItemType.ECHO_BRICKS, ItemType.ECHO_BRICKS,
    ], output: { type: ItemType.LISTENING_STONE, count: 1 } },
    ...resonantShapeRecipes,
];

let registered = false;
export function registerResonantRecipes(): void {
    if (registered || RECIPES.some((recipe) => recipe.output.type === ItemType.ECHO_STONE_SLAB)) return;
    RECIPES.push(...RESONANT_RECIPES);
    registered = true;
}
