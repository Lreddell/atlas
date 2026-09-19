// Authoritative block identity registry (Gate 0 production path).
//
// This is the single source of truth mapping compact numeric voxel ids to
// stable namespaced string ids:
//
//   - Legacy ids 0-255 are FROZEN. Their numeric <-> namespaced mapping is
//     derived from the BlockType enum + BLOCKS and locked by the checked-in
//     snapshot in legacyIds.json (see scripts/gen-legacy-ids.mjs and
//     legacyIds.test.mjs). Never reassign a legacy id.
//   - New content NEVER extends the BlockType enum. It registers here via
//     allocateWorldBlockId() and receives the next numeric id >= 256.
//     Chunk storage is Uint16Array, so ids up to 65534 are addressable.
//   - Numeric id 65535 is reserved for the unknown-block placeholder. Any
//     voxel id that is not in the registry (corrupt data, removed content,
//     snapshot mismatch) decodes to the placeholder, never to silent air.
//
// HOW A LATER REGION ADDS A BLOCK (no central switch edits):
//   1. Pick a namespaced id: `atlas:<region>_<name>`.
//   2. Pick a free texture atlas slot (>= 267; see TEXTURE_PATHS) and add a
//      deterministic painter in utils/textures.ts plus a mapping entry.
//   3. Call allocateWorldBlockId() once at startup (before atlas init).
//   4. Persisted worlds record the allocation in meta.registrySnapshot, so
//      reloads/imports resolve identically even if code order changes.

import '../../data/resonantDefinitions';
import { BLOCKS } from '../../data/blocks';
import { BlockType, type BlockDef } from '../../types';
import { RESONANT_WORLD_BLOCK_IDS } from './worldBlockCatalog';
import { RESONANT_ITEM_IDS } from './itemCatalog';

export const LEGACY_MAX_ID = 255;
export const FIRST_DYNAMIC_ID = 256;
export const MAX_VOXEL_ID = 65534;
export const UNKNOWN_PLACEHOLDER_ID = 65535;

export const REGISTRY_SNAPSHOT_VERSION = 1;

/** Explicit overrides for ids without a BLOCKS definition. */
const LEGACY_OVERRIDES: Readonly<Record<number, string>> = Object.freeze({
  77: 'atlas:retired_resonance_door',
  // FURNACE_ACTIVE shares the display name "Furnace" with FURNACE, and the
  // two bed halves share "Bed".
  18: 'minecraft:furnace_active',
  24: 'minecraft:bed_foot',
  25: 'minecraft:bed_head',
  // GRASS_PLANT ("Grass") collides with the GRASS block ("Grass").
  36: 'minecraft:grass_plant',
});

const RESERVED_NUMERICS: ReadonlySet<number> = new Set([
  ...RESONANT_WORLD_BLOCK_IDS as readonly number[],
  ...RESONANT_ITEM_IDS as readonly number[],
]);

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export interface LegacyTable {
  /** numeric id -> namespaced id, for every id with a BLOCKS definition. */
  numericToNamespaced: Record<number, string>;
  derivedAt: string;
}

/** Derive the frozen legacy table from the enum + BLOCKS. Throws on collision. */
export function deriveLegacyTable(): Record<number, string> {
  const table: Record<number, string> = {};
  const seen = new Map<string, number>();
  const defs = BLOCKS as unknown as Record<number, BlockDef | undefined>;
  for (let id = 0; id <= LEGACY_MAX_ID; id++) {
    const override = (LEGACY_OVERRIDES as Record<number, string>)[id];
    if (override !== undefined) {
      table[id] = override;
      continue;
    }
    const def = defs[id];
    if (!def) continue;
    const namespace = RESERVED_NUMERICS.has(id) || isResonantRange(id) ? 'atlas' : 'minecraft';
    const namespaced = `${namespace}:${slugify(def.name)}`;
    const clash = seen.get(namespaced);
    if (clash !== undefined) {
      throw new Error(
        `Legacy namespaced-id collision: numeric ${id} and ${clash} both derive ${namespaced}. ` +
        `Add an explicit override in LEGACY_OVERRIDES.`,
      );
    }
    seen.set(namespaced, id);
    table[id] = namespaced;
  }
  return table;
}

function isResonantRange(id: number): boolean {
  return (id >= 70 && id <= 85) || (id >= 170 && id <= 187);
}

// --- Runtime state (module-singleton; reset only in tests) ---

let legacyTable: Record<number, string> | null = null;
let legacyReverse: Map<string, number> | null = null;
/** namespaced id -> allocated numeric id (>= 256). */
const dynamicAllocations = new Map<string, number>();
let nextDynamicId = FIRST_DYNAMIC_ID;
let initialized = false;

function ensureInit(): void {
  if (initialized) return;
  initialized = true;
  legacyTable = deriveLegacyTable();
  legacyReverse = new Map();
  for (const [numeric, namespaced] of Object.entries(legacyTable)) {
    legacyReverse.set(namespaced, Number(numeric));
  }
  // The unknown-block placeholder is always present so decode paths can
  // substitute it without a registry lookup.
  const defs = BLOCKS as unknown as Record<number, BlockDef | undefined>;
  if (!defs[UNKNOWN_PLACEHOLDER_ID]) {
    defs[UNKNOWN_PLACEHOLDER_ID] = {
      id: UNKNOWN_PLACEHOLDER_ID as BlockType,
      color: '#ff00ff',
      name: 'Unknown Block',
      textureSlot: 46,
      hardness: 1,
      category: 'building',
    };
  }
}

function isValidNamespacedId(id: string): boolean {
  return /^[a-z0-9_]+:[a-z0-9_/.-]+$/.test(id);
}

/**
 * Allocate the next numeric voxel id for a new namespaced block and publish
 * its definition to BLOCKS. Idempotent per namespaced id within a session.
 * Deterministic across sessions as long as callers register in the same
 * order (guaranteed by initCampaignContent at startup; worlds additionally
 * persist the allocation snapshot for exact reload resolution).
 */
export function allocateWorldBlockId(namespacedId: string, def: Omit<BlockDef, 'id'>): number {
  ensureInit();
  if (!isValidNamespacedId(namespacedId)) {
    throw new Error(`Invalid namespaced block id: ${namespacedId}`);
  }
  const existing = dynamicAllocations.get(namespacedId);
  if (existing !== undefined) return existing;
  if (legacyReverse!.has(namespacedId)) {
    throw new Error(`Namespaced id ${namespacedId} collides with a frozen legacy id.`);
  }
  if (nextDynamicId > MAX_VOXEL_ID) {
    throw new Error('Voxel id space exhausted (max 65534 addressable blocks).');
  }
  if (!Number.isInteger(def.textureSlot) || (def.textureSlot as number) < 0) {
    throw new Error(`Block ${namespacedId} needs an explicit textureSlot.`);
  }
  if (!Number.isFinite(def.hardness)) {
    throw new Error(`Block ${namespacedId} needs a finite hardness.`);
  }
  const numeric = nextDynamicId++;
  dynamicAllocations.set(namespacedId, numeric);
  (BLOCKS as unknown as Record<number, BlockDef>)[numeric] = { ...def, id: numeric as BlockType };
  return numeric;
}

/** Numeric id for a namespaced id, or undefined if unknown. */
export function numericForNamespaced(namespacedId: string): number | undefined {
  ensureInit();
  const legacy = legacyReverse!.get(namespacedId);
  if (legacy !== undefined) return legacy;
  return dynamicAllocations.get(namespacedId);
}

/** Namespaced id for a numeric id, or undefined if unknown. */
export function namespacedForNumeric(numeric: number): string | undefined {
  ensureInit();
  if (!Number.isInteger(numeric) || numeric < 0 || numeric > UNKNOWN_PLACEHOLDER_ID) return undefined;
  if (numeric === UNKNOWN_PLACEHOLDER_ID) return 'atlas:unknown_placeholder';
  const legacy = legacyTable![numeric];
  if (legacy !== undefined) return legacy;
  for (const [name, id] of dynamicAllocations) {
    if (id === numeric) return name;
  }
  return undefined;
}

/**
 * THE unknown-id rule: any voxel id outside the registry resolves to the
 * placeholder. Callers must use this on every decode path (chunk load,
 * import, migration) so unknown content is recoverable, never silent air.
 */
export function resolveNumericForDecode(numeric: number): number {
  ensureInit();
  if (!Number.isInteger(numeric) || numeric < 0 || numeric > UNKNOWN_PLACEHOLDER_ID) {
    return UNKNOWN_PLACEHOLDER_ID;
  }
  if (numeric === UNKNOWN_PLACEHOLDER_ID) return UNKNOWN_PLACEHOLDER_ID;
  if (legacyTable![numeric] !== undefined) return numeric;
  for (const id of dynamicAllocations.values()) {
    if (id === numeric) return numeric;
  }
  return UNKNOWN_PLACEHOLDER_ID;
}

let cachedLegacyRemap: Uint16Array | null = null;

/**
 * Precomputed 256-entry remap for legacy uint8 voxel planes: known legacy
 * ids pass through, unassigned gap ids (4, 90, ...) map to the unknown
 * placeholder instead of silently becoming air. Built once per session.
 */
export function legacyDecodeRemap(): Uint16Array {
  ensureInit();
  if (!cachedLegacyRemap) {
    const remap = new Uint16Array(256);
    for (let i = 0; i < 256; i++) {
      remap[i] = legacyTable![i] !== undefined ? i : UNKNOWN_PLACEHOLDER_ID;
    }
    cachedLegacyRemap = remap;
  }
  return cachedLegacyRemap;
}

/**
 * Copy a legacy uint8 voxel plane up to uint16, applying the decode remap.
 * Every legacy chunk read (disk, import, IndexedDB row) funnels through here.
 */
export function copyUpLegacyBlocks(blocks: Uint8Array | Uint16Array): Uint16Array {
  ensureInit();
  if (blocks instanceof Uint16Array) {
    // Already wide: still enforce the unknown-id rule per voxel.
    const out = new Uint16Array(blocks.length);
    for (let i = 0; i < blocks.length; i++) {
      out[i] = resolveNumericForDecode(blocks[i]);
    }
    return out;
  }
  const remap = legacyDecodeRemap();
  const out = new Uint16Array(blocks.length);
  for (let i = 0; i < blocks.length; i++) {
    out[i] = remap[blocks[i]];
  }
  return out;
}

export interface RegistryAllocation {
  numeric: number;
  namespaced: string;
}

/** Persisted per world so reloads/imports resolve dynamic ids exactly. */
export function buildRegistrySnapshotExtra(): RegistryAllocation[] {
  ensureInit();
  const out: RegistryAllocation[] = [];
  for (const [namespaced, numeric] of dynamicAllocations) {
    out.push({ numeric, namespaced });
  }
  out.sort((a, b) => a.numeric - b.numeric);
  return out;
}

/**
 * Re-apply a world's allocation snapshot. Unknown namespaced ids (content
 * removed since the save) are recorded as placeholder-mapped so their voxels
 * decode visibly instead of corrupting neighbors.
 */
export function applyRegistrySnapshot(extra: RegistryAllocation[] | undefined): string[] {
  ensureInit();
  const issues: string[] = [];
  if (!extra) return issues;
  for (const entry of extra) {
    if (!entry || !isValidNamespacedId(entry.namespaced) || !Number.isInteger(entry.numeric)) {
      issues.push(`Skipping malformed registry entry: ${JSON.stringify(entry)}`);
      continue;
    }
    const known = numericForNamespaced(entry.namespaced);
    if (known !== undefined) {
      if (known !== entry.numeric) {
        issues.push(
          `Registry order drift for ${entry.namespaced}: code allocates ${known}, save used ${entry.numeric}. ` +
          `Save voxels for this block decode to the unknown placeholder.`,
        );
      }
      continue;
    }
    issues.push(`Unknown block ${entry.namespaced} (save numeric ${entry.numeric}): decodes to placeholder.`);
  }
  return issues;
}

/** All dynamic allocations this session (diagnostics/dev). */
export function listDynamicAllocations(): RegistryAllocation[] {
  return buildRegistrySnapshotExtra();
}

/** Reset dynamic state (tests only; legacy table is re-derived). */
export function resetBlockRegistryForTests(): void {
  dynamicAllocations.clear();
  nextDynamicId = FIRST_DYNAMIC_ID;
}
