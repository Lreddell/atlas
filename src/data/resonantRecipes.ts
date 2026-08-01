import { RECIPES, type Recipe } from '../recipes';
import { BlockType } from '../types';
import { RESONANT_SHAPE_FAMILIES } from '../systems/registry/blockFamilies';

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
    { gridSize: 2, pattern: [BlockType.ECHO_SHARD, BlockType.ECHO_SHARD, null, null], output: { type: BlockType.ECHO_DUST, count: 4 } },
    { gridSize: 2, pattern: [BlockType.ECHO_STONE, BlockType.ECHO_STONE, BlockType.ECHO_STONE, BlockType.ECHO_STONE], output: { type: BlockType.ECHO_BRICKS, count: 4 } },
    { gridSize: 2, pattern: [BlockType.ECHO_BRICKS, BlockType.ECHO_DUST, null, null], output: { type: BlockType.CHISELED_ECHO_STONE, count: 1 } },
    { gridSize: 2, pattern: [BlockType.ECHO_STONE, BlockType.ECHO_DUST, BlockType.ECHO_STONE, BlockType.ECHO_DUST], output: { type: BlockType.ECHO_MOSAIC, count: 4 } },
    { gridSize: 2, pattern: [BlockType.FRACTURED_CORE, BlockType.FRACTURED_CORE, null, null], output: { type: BlockType.ECHO_DUST, count: 2 } },
    { gridSize: 3, pattern: [
        BlockType.ECHO_STONE, BlockType.ECHO_SHARD, BlockType.ECHO_STONE,
        BlockType.COPPER_INGOT, BlockType.ECHO_DUST, BlockType.COPPER_INGOT,
        BlockType.ECHO_STONE, BlockType.ECHO_STONE, BlockType.ECHO_STONE,
    ], output: { type: BlockType.RESONANCE_PYLON, count: 1 } },
    { gridSize: 3, pattern: [
        BlockType.GLASS, BlockType.ECHO_DUST, BlockType.GLASS,
        BlockType.COPPER_INGOT, BlockType.ECHO_SHARD, BlockType.COPPER_INGOT,
        BlockType.GLASS, BlockType.ECHO_DUST, BlockType.GLASS,
    ], output: { type: BlockType.RESONANT_LAMP, count: 2 } },
    { gridSize: 3, pattern: [
        BlockType.ECHO_BRICKS, BlockType.ECHO_DUST, BlockType.ECHO_BRICKS,
        BlockType.COPPER_INGOT, BlockType.ECHO_SHARD, BlockType.COPPER_INGOT,
        BlockType.ECHO_BRICKS, BlockType.ECHO_DUST, BlockType.ECHO_BRICKS,
    ], output: { type: BlockType.PULSE_CONDUIT, count: 4 } },
    { gridSize: 3, pattern: [
        BlockType.ECHO_MOSAIC, BlockType.ECHO_DUST, BlockType.ECHO_MOSAIC,
        BlockType.AMETHYST_BLOCK, BlockType.ECHO_SHARD, BlockType.AMETHYST_BLOCK,
        BlockType.ECHO_MOSAIC, BlockType.ECHO_DUST, BlockType.ECHO_MOSAIC,
    ], output: { type: BlockType.PHASE_BLOCK, count: 4 } },
    { gridSize: 3, pattern: [
        BlockType.IRON_INGOT, BlockType.ECHO_DUST, BlockType.IRON_INGOT,
        BlockType.ECHO_BRICKS, BlockType.ECHO_SHARD, BlockType.ECHO_BRICKS,
        BlockType.IRON_INGOT, BlockType.ECHO_DUST, BlockType.IRON_INGOT,
    ], output: { type: BlockType.RESONANCE_PLATE, count: 2 } },
    { gridSize: 3, pattern: [
        BlockType.ECHO_BRICKS, BlockType.ECHO_BRICKS, BlockType.ECHO_BRICKS,
        BlockType.ECHO_BRICKS, BlockType.ECHO_CORE, BlockType.ECHO_BRICKS,
        BlockType.ECHO_BRICKS, BlockType.ECHO_BRICKS, BlockType.ECHO_BRICKS,
    ], output: { type: BlockType.LISTENING_STONE, count: 1 } },
    ...resonantShapeRecipes,
];

let registered = false;
export function registerResonantRecipes(): void {
    if (registered || RECIPES.some((recipe) => recipe.output.type === BlockType.ECHO_STONE_SLAB)) return;
    RECIPES.push(...RESONANT_RECIPES);
    registered = true;
}
