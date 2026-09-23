import { BlockType } from '../../types';
import { BLOCKS } from '../../data/blocks';
import { CROSS_RENDERED_BLOCKS } from '../../data/spriteBlocks';
import { RESONANT_DEFINITIONS } from '../../data/resonantDefinitions';

// What a chunk vertex tells the voxel shader, packed into its `color` attribute
// as four normalized bytes (Uint8 x4, 4 bytes a vertex instead of 12):
//
//   r  sky light, 0..15 averaged over the four cells around the corner, x17
//   g  block light (torches, lava, lamps), same encoding
//   b  ambient occlusion: 255 open, 170 / 85 / 0 for one, two, three occluders
//   a  bits 0-3 emission (0..15), bits 4-6 material class, bit 7 sway
//
// Light and AO stay separate so the shader can darken only the ambient light
// in corners. Class and emission are the same on all four corners of a quad;
// the sway bit marks the top corners of plants that bend in the wind.
// The shader decodes all of this in voxelMaterial.ts, so the two must agree.

export const VoxelClass = {
    SOLID: 0,
    LEAF: 1,
    PLANT: 2,
    WATER: 3,
    LAVA: 4,
    GLASS: 5,
    /** Cutout sprites that stay still: torches, crystals, spikes, lichen. */
    SPRITE: 6,
} as const;
export type VoxelClassId = typeof VoxelClass[keyof typeof VoxelClass];

export const SWAY_BIT = 0x80;

/** AO byte by the number of occluding neighbours at a corner (0..3). */
export const AO_BYTES: readonly number[] = [255, 170, 85, 0];

/** A 0..15 light level (fractional when averaged) as a byte. */
export const lightByte = (level: number): number => Math.round(level * 17);

export function packVoxelAlpha(voxelClass: number, emission: number, sway: boolean): number {
    return (sway ? SWAY_BIT : 0) | ((voxelClass & 7) << 4) | (Math.max(0, Math.min(15, Math.round(emission))) & 15);
}

export function unpackVoxelAlpha(byte: number): { voxelClass: number; emission: number; sway: boolean } {
    return { voxelClass: (byte >> 4) & 7, emission: byte & 15, sway: (byte & SWAY_BIT) !== 0 };
}

const MAX_BLOCK_ID = Math.max(
    ...Object.values(BlockType).filter((v): v is number => typeof v === 'number'),
);

const LEAF_BLOCKS = [
    BlockType.LEAVES, BlockType.SPRUCE_LEAVES, BlockType.BIRCH_LEAVES, BlockType.CHERRY_LEAVES,
    BlockType.JUNGLE_LEAVES, BlockType.DARK_OAK_LEAVES, BlockType.ACACIA_LEAVES,
];

// Cross sprites that are vegetation (they sway); every other cross sprite is a still SPRITE.
const PLANT_BLOCKS = [
    BlockType.GRASS_PLANT, BlockType.ROSE, BlockType.DANDELION, BlockType.PINK_FLOWER, BlockType.DEAD_BUSH,
    BlockType.SAPLING, BlockType.SPRUCE_SAPLING, BlockType.BIRCH_SAPLING, BlockType.CHERRY_SAPLING,
    BlockType.JUNGLE_SAPLING, BlockType.DARK_OAK_SAPLING, BlockType.ACACIA_SAPLING,
];

// Resonant Vault blocks glow faintly at most: the vault look is restrained
// slate and teal, never neon, however bright their light level is.
const RESONANT_EMISSION_CAP = 3;

/** Packed alpha byte (class | emission, no sway) per block id. */
const VOXEL_ALPHA = new Uint8Array(MAX_BLOCK_ID + 1);
const VOXEL_CLASS = new Uint8Array(MAX_BLOCK_ID + 1);

function classify(type: BlockType): VoxelClassId {
    if (LEAF_BLOCKS.includes(type)) return VoxelClass.LEAF;
    if (PLANT_BLOCKS.includes(type)) return VoxelClass.PLANT;
    if (type === BlockType.WATER) return VoxelClass.WATER;
    if (type === BlockType.LAVA) return VoxelClass.LAVA;
    if (type === BlockType.GLASS || type === BlockType.ICE) return VoxelClass.GLASS;
    if (CROSS_RENDERED_BLOCKS.has(type)) return VoxelClass.SPRITE;
    return VoxelClass.SOLID;
}

for (let id = 0; id <= MAX_BLOCK_ID; id++) {
    const type = id as BlockType;
    const def = BLOCKS[type];
    const voxelClass = classify(type);
    let emission = def?.lightLevel ?? 0;
    if (id in RESONANT_DEFINITIONS) emission = Math.min(emission, RESONANT_EMISSION_CAP);
    VOXEL_CLASS[id] = voxelClass;
    VOXEL_ALPHA[id] = packVoxelAlpha(voxelClass, emission, false);
}

export function voxelClassOf(type: BlockType): VoxelClassId {
    return (type <= MAX_BLOCK_ID ? VOXEL_CLASS[type] : VoxelClass.SOLID) as VoxelClassId;
}

/** The alpha byte for every corner of this block's faces (plants add SWAY_BIT on top corners). */
export function voxelAlphaOf(type: BlockType): number {
    return type <= MAX_BLOCK_ID ? VOXEL_ALPHA[type] : 0;
}

/**
 * Fluids don't darken the corners of the blocks around them: a sea floor or a
 * shore under water is open space for ambient light, not a crevice.
 */
export const isFluidBlock = (type: BlockType): boolean => type === BlockType.WATER || type === BlockType.LAVA;

// --- Texture variation ---------------------------------------------------------
//
// Natural blocks with no up or grain get a rotated and/or mirrored copy of their
// tile, picked by a hash of the block position and face, so a field of stone or
// sand stops repeating the same 16px stamp. Same position, same variant, every
// time (meshing, reloads, other machines). Textures with a direction (logs,
// furnaces, crafting tables, chests, sandstone bands, grass sides) keep theirs.

/** 0 none, 1 any rotation or mirror on every face, 2 grass-like: vary the top and bottom, only mirror the sides. */
const UV_VARIATION = new Uint8Array(MAX_BLOCK_ID + 1);
const VARY_ALL = 1;
const VARY_TOP = 2;

for (const type of [
    BlockType.STONE, BlockType.DIRT, BlockType.SAND, BlockType.RED_SAND, BlockType.COBBLESTONE,
    BlockType.MOSSY_COBBLESTONE, BlockType.SNOW_BLOCK, BlockType.ANDESITE, BlockType.DIORITE, BlockType.GRANITE,
    BlockType.COARSE_DIRT, BlockType.MUD, BlockType.CALCITE, BlockType.MOSS_BLOCK, BlockType.BEDROCK,
    BlockType.PACKED_ICE, BlockType.MAGMA, BlockType.OBSIDIAN,
    BlockType.COAL_ORE, BlockType.IRON_ORE, BlockType.COPPER_ORE, BlockType.GOLD_ORE,
    BlockType.DIAMOND_ORE, BlockType.LAPIS_ORE, BlockType.EMERALD_ORE,
]) UV_VARIATION[type] = VARY_ALL;

for (const type of [
    BlockType.GRASS, BlockType.SNOWY_GRASS, BlockType.MOSSY_GRASS, BlockType.LUSH_GRASS, BlockType.DARK_GRASS,
    BlockType.MEADOW_GRASS, BlockType.SAVANNA_GRASS, BlockType.JUNGLE_GRASS, BlockType.PODZOL,
]) UV_VARIATION[type] = VARY_TOP;

/** Face indices, matching the mesher's direction order. */
export const FACE_INDEX = { right: 0, left: 1, top: 2, bottom: 3, front: 4, back: 5 } as const;

function hashFace(x: number, y: number, z: number, face: number): number {
    let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(z | 0, 0x9e3779b1) ^ Math.imul(face + 1, 0x85ebca6b);
    h ^= h >>> 15;
    h = Math.imul(h, 0x2c1b3c6d);
    h ^= h >>> 12;
    h = Math.imul(h, 0x297a2d39);
    h ^= h >>> 15;
    return h >>> 0;
}

/**
 * The UV variant for one block face at a world position: bits 0-1 a quarter-turn
 * count, bit 2 a mirror. 0 leaves the face exactly as resolveTexture made it.
 */
export function uvVariantFor(type: BlockType, face: number, x: number, y: number, z: number): number {
    const mode = type <= MAX_BLOCK_ID ? UV_VARIATION[type] : 0;
    if (mode === 0) return 0;
    const h = hashFace(x, y, z, face);
    if (mode === VARY_TOP && face !== FACE_INDEX.top && face !== FACE_INDEX.bottom) return h & 4;
    return h & 7;
}

// Corner order is [BL, BR, TR, TL]: a mirror swaps BL/BR and TR/TL.
const MIRROR_CORNER = [1, 0, 3, 2];

/** Writes the face's four corner UVs (u,v pairs, [BL, BR, TR, TL]) for a variant into out. */
export function applyUvVariant(uvs: ArrayLike<number>, variant: number, out: { [index: number]: number }): void {
    const turns = variant & 3;
    const mirror = (variant & 4) !== 0;
    for (let corner = 0; corner < 4; corner++) {
        let source = (corner + turns) & 3;
        if (mirror) source = MIRROR_CORNER[source];
        out[corner * 2] = uvs[source * 2];
        out[corner * 2 + 1] = uvs[source * 2 + 1];
    }
}
