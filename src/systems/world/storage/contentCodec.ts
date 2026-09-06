import { BlockType, ItemType, type ItemStack, type ItemInstance } from '../../../types';
import { blockFromKey, blockIdentity, itemFromKey, itemIdentity } from '../../registry/contentIds';
import { LEGACY_BLOCK_KEYS, LEGACY_ITEM_KEYS } from '../../registry/legacyIds';
import type { ChestState, FurnaceState } from '../worldTypes';

export interface StoredItemStack {
    type: string;
    count: number;
    instance?: ItemInstance;
}

export interface ChunkEntities {
    chests?: Record<string, ChestState>;
    furnaces?: Record<string, FurnaceState>;
}

export interface ChunkExtras {
    /** Voxel index -> original key for an unavailable block. Never changed by meshing. */
    unknownBlocks?: Record<number, string>;
    tileEntities?: ChunkEntities;
}

const clone = <T>(value: T): T => structuredClone(value);
const contentKey = (key: unknown): key is string => typeof key === 'string' && key.length > 0 && key.length <= 256 && key.includes(':');

export function encodeItemStack(stack: ItemStack | null): StoredItemStack | null {
    if (!stack) return null;
    const key = stack.unknownKey ?? itemIdentity(stack.type)?.key ?? LEGACY_ITEM_KEYS.get(stack.type);
    if (!key) throw new Error(`Cannot save unregistered item handle ${stack.type}`);
    const copy = clone(stack);
    delete copy.unknownKey;
    return { ...copy, type: key };
}

export function decodeItemStack(value: unknown): ItemStack | null {
    if (value == null) return null;
    if (typeof value !== 'object') throw new Error('Invalid saved item stack');
    const stack = value as Record<string, unknown>;
    if (!Number.isInteger(stack.count) || (stack.count as number) <= 0) throw new Error('Invalid saved item count');
    const key = typeof stack.type === 'number' ? LEGACY_ITEM_KEYS.get(stack.type) : stack.type;
    if (!contentKey(key)) throw new Error(`Invalid saved item identity ${String(stack.type)}`);
    const id = itemFromKey(key);
    const copy = clone(stack);
    delete copy.unknownKey;
    // Keep all instance fields, including unknown extensions, for future content.
    return {
        ...copy,
        type: id ?? ItemType.UNKNOWN,
        count: stack.count as number,
        ...(id === undefined ? { unknownKey: key } : {}),
    } as ItemStack;
}

function mapEntityStacks(value: ChunkEntities | undefined, encode: boolean): unknown {
    if (!value) return undefined;
    const output = clone(value);
    const transform = encode ? encodeItemStack : decodeItemStack;
    for (const chest of Object.values(output.chests ?? {})) {
        if (!Array.isArray(chest.items)) throw new Error('Invalid saved chest');
        // The type changes only at the serialization boundary.
        chest.items = chest.items.map(stack => transform(stack)) as (ItemStack | null)[];
    }
    for (const furnace of Object.values(output.furnaces ?? {})) {
        for (const slot of ['input', 'fuel', 'output'] as const) furnace[slot] = transform(furnace[slot]) as ItemStack | null;
    }
    return output;
}

/** Decode legacy bytes using the frozen map; invalid/retired voxel values stay
 * visible and recoverable instead of becoming air or a different live item. */
export function upgradeLegacyBlocks(bytes: Uint8Array): { blocks: Uint16Array; unknownBlocks?: Record<number, string> } {
    const blocks = new Uint16Array(bytes.length);
    const unknownBlocks: Record<number, string> = {};
    for (let i = 0; i < bytes.length; i++) {
        const key = LEGACY_BLOCK_KEYS.get(bytes[i])!;
        const id = blockFromKey(key);
        blocks[i] = id ?? BlockType.UNKNOWN;
        if (id === undefined) unknownBlocks[i] = key;
    }
    return { blocks, ...(Object.keys(unknownBlocks).length ? { unknownBlocks } : {}) };
}

const HEADER = 16;
const MAX_CELLS = 1_048_576;
const MAX_DICTIONARY_BYTES = 32 * 1024 * 1024;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

/** ATP1: 16-byte header, UTF-8 key dictionary/containers, then packed local
 * palette indices. Uniform volumes use zero bits per voxel. Light and placement
 * metadata remain separate bytes in their enclosing storage record. */
export function encodeBlockPalette(blocks: Uint16Array, extras: ChunkExtras = {}): Uint8Array {
    if (blocks.length > MAX_CELLS) throw new Error('Block volume exceeds codec limit');
    const keys: string[] = [];
    const keyIndices = new Map<string, number>();
    const local = new Uint16Array(blocks.length);
    const handleCache = new Map<number, string>();
    for (let i = 0; i < blocks.length; i++) {
        const id = blocks[i];
        let key = id === BlockType.UNKNOWN ? extras.unknownBlocks?.[i] : undefined;
        if (!key) {
            key = handleCache.get(id) ?? blockIdentity(id)?.key ?? LEGACY_BLOCK_KEYS.get(id);
            if (!key) throw new Error(`Cannot save unregistered block handle ${id}`);
            handleCache.set(id, key);
        }
        if (!contentKey(key)) throw new Error('Invalid block palette key');
        let index = keyIndices.get(key);
        if (index === undefined) {
            index = keys.length;
            if (index > 65535) throw new Error('Block palette exceeds 65536 entries');
            keys.push(key);
            keyIndices.set(key, index);
        }
        local[i] = index;
    }
    const bits = keys.length <= 1 ? 0 : Math.ceil(Math.log2(keys.length));
    const dictionary = encoder.encode(JSON.stringify({ keys, tileEntities: mapEntityStacks(extras.tileEntities, true) }));
    if (dictionary.length > MAX_DICTIONARY_BYTES) throw new Error('Chunk dictionary exceeds codec limit');
    const bytes = new Uint8Array(HEADER + dictionary.length + Math.ceil(blocks.length * bits / 8));
    bytes.set([65, 84, 80, 1]);
    const view = new DataView(bytes.buffer);
    view.setUint32(4, blocks.length);
    view.setUint32(8, dictionary.length);
    bytes[12] = bits;
    bytes.set(dictionary, HEADER);
    let position = HEADER + dictionary.length;
    let accumulator = 0;
    let available = 0;
    if (bits) for (const index of local) {
        accumulator |= index << available;
        available += bits;
        while (available >= 8) {
            bytes[position++] = accumulator & 255;
            accumulator >>>= 8;
            available -= 8;
        }
    }
    if (available) bytes[position] = accumulator & 255;
    return bytes;
}

export function decodeBlockPalette(bytes: Uint8Array): { blocks: Uint16Array } & ChunkExtras {
    if (bytes.length < HEADER || bytes[0] !== 65 || bytes[1] !== 84 || bytes[2] !== 80 || bytes[3] !== 1) throw new Error('Invalid ATP1 block palette');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const count = view.getUint32(4);
    const dictionaryLength = view.getUint32(8);
    const bits = bytes[12];
    if (count > MAX_CELLS || dictionaryLength > MAX_DICTIONARY_BYTES || bits > 16 || bytes[13] || bytes[14] || bytes[15]) throw new Error('Invalid ATP1 palette header');
    if (bytes.length !== HEADER + dictionaryLength + Math.ceil(count * bits / 8)) throw new Error('Truncated or trailing ATP1 palette data');
    const dictionary = JSON.parse(decoder.decode(bytes.subarray(HEADER, HEADER + dictionaryLength)));
    const keys: unknown = dictionary.keys;
    if (!Array.isArray(keys) || keys.length > 65536 || (count > 0 && keys.length === 0)
        || keys.some(key => !contentKey(key)) || new Set(keys).size !== keys.length
        || bits !== (keys.length <= 1 ? 0 : Math.ceil(Math.log2(keys.length)))) throw new Error('Invalid ATP1 key dictionary');
    const palette = (keys as string[]).map(key => blockFromKey(key));
    const blocks = new Uint16Array(count);
    const unknownBlocks: Record<number, string> = {};
    let position = HEADER + dictionaryLength;
    let accumulator = 0;
    let available = 0;
    const mask = (1 << bits) - 1;
    for (let i = 0; i < count; i++) {
        while (available < bits) { accumulator |= bytes[position++] << available; available += 8; }
        const index = bits ? accumulator & mask : 0;
        accumulator >>>= bits;
        available -= bits;
        if (index >= keys.length) throw new Error('Invalid ATP1 palette index');
        blocks[i] = palette[index] ?? BlockType.UNKNOWN;
        if (palette[index] === undefined) unknownBlocks[i] = keys[index];
    }
    if (accumulator !== 0) throw new Error('Non-zero ATP1 padding');
    return {
        blocks,
        ...(Object.keys(unknownBlocks).length ? { unknownBlocks } : {}),
        ...(dictionary.tileEntities ? { tileEntities: mapEntityStacks(dictionary.tileEntities, false) as ChunkEntities } : {}),
    };
}
