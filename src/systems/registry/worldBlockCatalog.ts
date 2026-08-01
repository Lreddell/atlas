import '../../data/resonantDefinitions';
import { BLOCKS } from '../../data/blocks';
import { BlockType, type BlockDef } from '../../types';

export const RESONANT_WORLD_BLOCK_IDS = [
    BlockType.ECHO_STONE,
    BlockType.ECHO_BRICKS,
    BlockType.CRACKED_ECHO_BRICKS,
    BlockType.CHISELED_ECHO_STONE,
    BlockType.ECHO_MOSAIC,
    BlockType.ECHO_CRYSTAL,
    BlockType.RESONANCE_PYLON,
    BlockType.PULSE_CONDUIT,
    BlockType.PHASE_BLOCK,
    BlockType.RESONANCE_PLATE,
    BlockType.RESONANT_LAMP,
    BlockType.ECHO_SPIKES,
    BlockType.SENTINEL_CORE,
    BlockType.LISTENING_STONE,
    BlockType.VAULT_SEAL,
    BlockType.ECHO_STONE_SLAB,
    BlockType.ECHO_STONE_STAIRS,
    BlockType.ECHO_BRICK_SLAB,
    BlockType.ECHO_BRICK_STAIRS,
] as const;

const resonantWorldBlockSet: ReadonlySet<number> = new Set(RESONANT_WORLD_BLOCK_IDS);

export function isWorldBlockId(id: number): id is BlockType {
    if (!Number.isInteger(id) || id < 0 || id > 255) return false;
    const definition = BLOCKS[id as BlockType] as BlockDef | undefined;
    return definition !== undefined && definition.isItem !== true;
}

export function assertWorldBlockId(id: number): asserts id is BlockType {
    if (!isWorldBlockId(id)) throw new RangeError(`Content id ${id} is not a world block.`);
}

export function isResonantWorldBlockId(id: number): id is (typeof RESONANT_WORLD_BLOCK_IDS)[number] {
    return resonantWorldBlockSet.has(id);
}
