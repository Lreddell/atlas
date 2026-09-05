import { BlockType, ItemType, type BlockId, type ItemId } from '../../types';
import { LEGACY_CONTENT } from './legacyIds';

export type ContentKey = `${string}:${string}`;
export interface BlockIdentity { readonly id: BlockId; readonly key: ContentKey; }
export interface ItemIdentity { readonly id: ItemId; readonly key: ContentKey; readonly placedBlock: BlockId | null; }

const blocksById = new Map<number, BlockIdentity>();
const blocksByKey = new Map<string, BlockIdentity>();
const itemsById = new Map<number, ItemIdentity>();
const itemsByKey = new Map<string, ItemIdentity>();
const blockItems = new Map<BlockId, ItemId>();
const KEY = /^[a-z0-9_.-]+:[a-z0-9_./-]+$/;

export function registerBlockIdentity(id: BlockId, key: ContentKey): void {
    if (!Number.isInteger(id) || id < 0 || id > 65535 || !KEY.test(key)) throw new Error(`Invalid block identity ${key}/${id}`);
    if (blocksById.has(id) || blocksByKey.has(key)) throw new Error(`Duplicate block identity ${key}/${id}`);
    const entry = Object.freeze({ id, key });
    blocksById.set(id, entry);
    blocksByKey.set(key, entry);
}

export function registerItemIdentity(id: ItemId, key: ContentKey, placedBlock: BlockId | null = null): void {
    if (!Number.isInteger(id) || id < 0 || !KEY.test(key)) throw new Error(`Invalid item identity ${key}/${id}`);
    if (itemsById.has(id) || itemsByKey.has(key)) throw new Error(`Duplicate item identity ${key}/${id}`);
    if (placedBlock !== null && !blocksById.has(placedBlock)) throw new Error(`Item ${key} places an unregistered block`);
    const entry = Object.freeze({ id, key, placedBlock });
    itemsById.set(id, entry);
    itemsByKey.set(key, entry);
    if (placedBlock !== null) blockItems.set(placedBlock, id);
}

// Saplings had isItem=true for sprite rendering, but have always also occupied
// voxels. Their placement identities must survive the split of that old flag.
const SAPLING_IDS = new Set([113, 146, 147, 148, 227, 233, 239]);
for (const [id, key, kind] of LEGACY_CONTENT) {
    if (kind === 'block' || SAPLING_IDS.has(id)) registerBlockIdentity(id as BlockId, key);
}
registerBlockIdentity(BlockType.UNKNOWN, 'atlas:unknown_block');
for (const [id, key, kind] of LEGACY_CONTENT) {
    if (kind !== 'retired') registerItemIdentity(id as ItemId, key, blocksById.get(id)?.id ?? null);
}
registerItemIdentity(ItemType.UNKNOWN, 'atlas:unknown_item');

export const blockIdentity = (id: number): BlockIdentity | undefined => blocksById.get(id);
export const itemIdentity = (id: number): ItemIdentity | undefined => itemsById.get(id);
export const blockFromKey = (key: string): BlockId | undefined => blocksByKey.get(key)?.id;
export const itemFromKey = (key: string): ItemId | undefined => itemsByKey.get(key)?.id;
export const blockForItem = (id: ItemId): BlockId | null => itemsById.get(id)?.placedBlock ?? null;
export const itemForBlock = (id: BlockId): ItemId => blockItems.get(id) ?? ItemType.UNKNOWN;
export const isRegisteredItem = (id: number): id is ItemId => itemsById.has(id);
export const allBlockIdentities = (): readonly BlockIdentity[] => [...blocksById.values()];
export const allItemIdentities = (): readonly ItemIdentity[] => [...itemsById.values()];
