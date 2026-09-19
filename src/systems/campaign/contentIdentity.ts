// Gate 0: Scalable content identity.
// Separates stable namespaced persistent identities from compact runtime handles
// so the campaign can grow past the legacy Uint8 (0-255) ceiling without
// rewriting old saves.
//
// Design choice: legacy numeric BlockType IDs are frozen. New campaign content
// uses `atlas:<name>` string IDs. Runtime hot paths use uint16 handles derived
// from a validated registry snapshot. Chunk/save code persists namespaced IDs
// (or palette indices into a persisted palette), never bare new numeric IDs.

export const CAMPAIGN_CONTENT_VERSION = 1;

export interface NamespacedBlockDef {
  /** Stable persistent identity, e.g. `atlas:ironwood_log`. */
  id: string;
  /** Human-readable name. */
  name: string;
  /** Optional legacy numeric ID for pre-migration blocks. Undefined for new blocks. */
  legacyNumericId?: number;
  /** If placeable, the item that places it. */
  itemId?: string;
  /** Texture atlas slot (procedural fallback when PNG is absent). */
  textureSlot?: number;
  transparent?: boolean;
  noCollision?: boolean;
  hardness?: number;
  category?: string;
}

export interface NamespacedItemDef {
  /** Stable persistent identity, e.g. `atlas:furrow_crest`. */
  id: string;
  name: string;
  legacyNumericId?: number;
  /** Block placed by this item, if any. */
  placesBlock?: string | null;
  stackSize?: number;
  textureSlot?: number;
  category?: string;
}

/** Frozen legacy numeric mapping. Never reassign these. */
export const FROZEN_LEGACY_IDS: Readonly<Record<number, string>> = Object.freeze({
  0: 'minecraft:air',
  1: 'minecraft:dirt',
  2: 'minecraft:grass',
  3: 'minecraft:stone',
  5: 'minecraft:leaves',
  6: 'minecraft:sand',
  7: 'minecraft:water',
  8: 'minecraft:bedrock',
  77: 'atlas:retired_resonance_door',
});

const blockRegistry = new Map<string, NamespacedBlockDef>();
const itemRegistry = new Map<string, NamespacedItemDef>();
const blockItemLinks = new Map<string, string>();

function isValidNamespacedId(id: string): boolean {
  return /^[a-z0-9_]+:[a-z0-9_/.-]+$/.test(id);
}

export function registerCampaignBlock(def: NamespacedBlockDef): void {
  if (!isValidNamespacedId(def.id)) {
    throw new Error(`Invalid block id: ${def.id}`);
  }
  if (blockRegistry.has(def.id)) {
    throw new Error(`Duplicate block id: ${def.id}`);
  }
  blockRegistry.set(def.id, { ...def });
  if (def.itemId) {
    blockItemLinks.set(def.itemId, def.id);
  }
}

export function registerCampaignItem(def: NamespacedItemDef): void {
  if (!isValidNamespacedId(def.id)) {
    throw new Error(`Invalid item id: ${def.id}`);
  }
  if (itemRegistry.has(def.id)) {
    throw new Error(`Duplicate item id: ${def.id}`);
  }
  itemRegistry.set(def.id, { ...def });
  if (def.placesBlock) {
    blockItemLinks.set(def.id, def.placesBlock);
  }
}

export function getCampaignBlock(id: string): NamespacedBlockDef | undefined {
  return blockRegistry.get(id);
}

export function getCampaignItem(id: string): NamespacedItemDef | undefined {
  return itemRegistry.get(id);
}

export function getBlockForItem(itemId: string): string | undefined {
  return blockItemLinks.get(itemId);
}

export function listCampaignBlocks(): NamespacedBlockDef[] {
  return Array.from(blockRegistry.values());
}

export function listCampaignItems(): NamespacedItemDef[] {
  return Array.from(itemRegistry.values());
}

/** Deterministic snapshot sorted by id; runtime handles are indices into this. */
export function buildRegistrySnapshot(): { blocks: string[]; items: string[] } {
  return {
    blocks: Array.from(blockRegistry.keys()).sort(),
    items: Array.from(itemRegistry.keys()).sort(),
  };
}

/** Compact runtime handle table (uint16) derived from a validated snapshot. */
export class RuntimeHandleTable {
  private blockToHandle = new Map<string, number>();
  private handleToBlock: string[] = [];

  constructor(blockIds: string[]) {
    const sorted = [...blockIds].sort();
    if (sorted.length > 65535) {
      throw new Error('Block catalog exceeds uint16 handle space.');
    }
    sorted.forEach((id, index) => {
      this.blockToHandle.set(id, index);
      this.handleToBlock[index] = id;
    });
  }

  handleFor(id: string): number | undefined {
    return this.blockToHandle.get(id);
  }

  idFor(handle: number): string | undefined {
    return this.handleToBlock[handle];
  }

  get size(): number {
    return this.handleToBlock.length;
  }
}

export interface RegistryValidationIssue {
  kind: string;
  message: string;
}

export function validateCampaignRegistries(): RegistryValidationIssue[] {
  const issues: RegistryValidationIssue[] = [];
  for (const [itemId, blockId] of blockItemLinks) {
    if (!blockRegistry.has(blockId) && !isLegacyBlockReference(blockId)) {
      issues.push({
        kind: 'missing-block-link',
        message: `Item ${itemId} links to unknown block ${blockId}`,
      });
    }
    void itemId;
  }
  const seen = new Set<string>();
  for (const id of [...blockRegistry.keys(), ...itemRegistry.keys()]) {
    if (seen.has(id)) {
      issues.push({ kind: 'duplicate-key', message: `Duplicate content key: ${id}` });
    }
    seen.add(id);
  }
  return issues;
}

function isLegacyBlockReference(blockId: string): boolean {
  return blockId.startsWith('minecraft:') || blockId.startsWith('legacy:');
}

/** Reset registries (tests/dev only). */
export function clearCampaignRegistriesForTests(): void {
  blockRegistry.clear();
  itemRegistry.clear();
  blockItemLinks.clear();
}
