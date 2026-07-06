import { BlockType } from '../../types.ts';

export interface WoodFamily {
    name: 'oak' | 'spruce' | 'birch' | 'cherry' | 'jungle' | 'dark_oak' | 'acacia';
    log: BlockType;
    planks: BlockType;
    sapling: BlockType;
    slab: BlockType;
    stairs: BlockType;
}

export const WOOD_FAMILIES: readonly WoodFamily[] = [
    {
        name: 'oak',
        log: BlockType.LOG,
        planks: BlockType.OAK_PLANKS,
        sapling: BlockType.SAPLING,
        slab: BlockType.OAK_SLAB,
        stairs: BlockType.OAK_STAIRS,
    },
    {
        name: 'spruce',
        log: BlockType.SPRUCE_LOG,
        planks: BlockType.SPRUCE_PLANKS,
        sapling: BlockType.SPRUCE_SAPLING,
        slab: BlockType.SPRUCE_SLAB,
        stairs: BlockType.SPRUCE_STAIRS,
    },
    {
        name: 'birch',
        log: BlockType.BIRCH_LOG,
        planks: BlockType.BIRCH_PLANKS,
        sapling: BlockType.BIRCH_SAPLING,
        slab: BlockType.BIRCH_SLAB,
        stairs: BlockType.BIRCH_STAIRS,
    },
    {
        name: 'cherry',
        log: BlockType.CHERRY_LOG,
        planks: BlockType.CHERRY_PLANKS,
        sapling: BlockType.CHERRY_SAPLING,
        slab: BlockType.CHERRY_SLAB,
        stairs: BlockType.CHERRY_STAIRS,
    },
    {
        name: 'jungle',
        log: BlockType.JUNGLE_LOG,
        planks: BlockType.JUNGLE_PLANKS,
        sapling: BlockType.JUNGLE_SAPLING,
        slab: BlockType.JUNGLE_SLAB,
        stairs: BlockType.JUNGLE_STAIRS,
    },
    {
        name: 'dark_oak',
        log: BlockType.DARK_OAK_LOG,
        planks: BlockType.DARK_OAK_PLANKS,
        sapling: BlockType.DARK_OAK_SAPLING,
        slab: BlockType.DARK_OAK_SLAB,
        stairs: BlockType.DARK_OAK_STAIRS,
    },
    {
        name: 'acacia',
        log: BlockType.ACACIA_LOG,
        planks: BlockType.ACACIA_PLANKS,
        sapling: BlockType.ACACIA_SAPLING,
        slab: BlockType.ACACIA_SLAB,
        stairs: BlockType.ACACIA_STAIRS,
    },
];

export const GRASS_BLOCKS = [
    BlockType.GRASS,
    BlockType.SNOWY_GRASS,
    BlockType.MOSSY_GRASS,
    BlockType.LUSH_GRASS,
    BlockType.DARK_GRASS,
    BlockType.MEADOW_GRASS,
    BlockType.SAVANNA_GRASS,
    BlockType.JUNGLE_GRASS,
] as const;

export const STONE_TOOL_MATERIALS = [
    BlockType.COBBLESTONE,
    BlockType.ANDESITE,
    BlockType.DIORITE,
    BlockType.GRANITE,
] as const;

export const LOG_BLOCKS = WOOD_FAMILIES.map(({ log }) => log);
const LOG_BLOCK_SET = new Set<BlockType>(LOG_BLOCKS);

export const isLogBlock = (type: BlockType): boolean => LOG_BLOCK_SET.has(type);
