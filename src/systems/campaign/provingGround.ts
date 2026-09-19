// Gate 0 proving ground: a small NEUTRAL encounter site built only from
// production systems (real chunks, real blocks, real save, real interaction).
//
// It demonstrates every foundation contract without any region content:
// activation, protected temporary arena edits, death/failure restoration,
// clear state, crest/keystone transition, region transform fixture,
// five-charge expedition anchor, physical waystone activation/travel, Atlas
// bearing/sketch, rematch setup, Blood Moon/Frenzy eligibility fixture,
// save/reload, export/import, and preview provenance.
//
// The site is content-neutral on purpose: boss `gate0:proving_dummy`,
// crest `atlas:gate0_crest`, keystone `atlas:gate0_keystone`. Region branches
// replace these identifiers with their own; the machinery stays shared.

import { BLOCKS } from '../../data/blocks';
import { BlockType } from '../../types';
import {
  createEncounterState,
  transitionEncounter,
  activateWaystoneAfterClear,
  resolveInterruptedFight,
  TempArenaLayer,
  type EncounterSiteState,
} from './encounterSites';
import { validateLandingVolume, EXPEDITION_ANCHOR_DEFAULT_CHARGES } from './waystones';
import { getRegionAnchor, type CampaignGraph } from './campaignGraph';
import type { CampaignAnchorRecord } from '../progression/ProgressionStore';
import {
  PROVING_STONE_NUMERIC,
  PROVING_WAYSTONE_NUMERIC,
  PROVING_ANCHOR_NUMERIC,
} from '../../data/campaign/gate0';

export const PROVING_SITE_ID = 'gate0:proving_site';
export const PROVING_BOSS_ID = 'gate0:proving_dummy';
export const PROVING_CREST_ID = 'atlas:gate0_crest';
export const PROVING_KEYSTONE_ID = 'atlas:gate0_keystone';
export const PROVING_REGION = 'gate0_proving_ground';
export const PROVING_ANCHOR_REFILL = 'minecraft:cobblestone';

/** Minimal structural surface: WorldManager satisfies this without a cycle. */
export interface ProvingWorldAccess {
  getBlock(x: number, y: number, z: number): number;
  setBlock(x: number, y: number, z: number, type: number, rotation?: number): unknown;
  getMetadata(x: number, y: number, z: number): number;
}

/** Structural progression surface (ProgressionStore satisfies it). */
export interface ProvingProgression {
  grantCampaignCrest(id: string): boolean;
  grantCampaignKeystone(id: string): boolean;
  setEncounterPhase(siteId: string, phase: string, patch?: Partial<{ waystoneActive: boolean; rematchAvailable: boolean; attemptCount: number; firstClearAt: number }>): void;
  activateWaystone(siteId: string): void;
  discoverWaystone(siteId: string): void;
  setAnchor(siteId: string, record: CampaignAnchorRecord): void;
  getAnchor(siteId: string): CampaignAnchorRecord | undefined;
  setRegionTransform(region: string, applied?: boolean): void;
  setBloodMoonFixture(on: boolean): void;
}

export interface ProvingLayout {
  origin: { x: number; y: number; z: number };
  waystone: { x: number; y: number; z: number };
  anchor: { x: number; y: number; z: number };
  barrier: { x: number; y: number; z: number }[];
  siteId: string;
}

function isSolidForBuild(type: number): boolean {
  if (type === BlockType.AIR) return false;
  const def = (BLOCKS as Record<number, { noCollision?: boolean } | undefined>)[type];
  return !def?.noCollision;
}

/** Find the surface (first solid top) under the given column. */
export function findProvingSurface(access: ProvingWorldAccess, x: number, z: number, hintY: number): number {
  for (let y = hintY + 40; y > hintY - 60; y--) {
    if (isSolidForBuild(access.getBlock(x, y, z))) return y + 1;
  }
  return hintY;
}

/**
 * Build the proving site: a 13x13 proving-stone pad, a waystone block, an
 * anchor block, and a 3-wide barrier wall that the crest will open.
 * All edits go through the production setBlock path (lighting, remesh,
 * dirty-marking included). Returns the layout for the driver + UI.
 */
export function buildProvingGround(
  access: ProvingWorldAccess,
  centerX: number,
  centerZ: number,
  hintY: number,
): ProvingLayout {
  const surfaceY = findProvingSurface(access, centerX, centerZ, hintY);
  const y = surfaceY;
  for (let dx = -6; dx <= 6; dx++) {
    for (let dz = -6; dz <= 6; dz++) {
      access.setBlock(centerX + dx, y, centerZ + dz, PROVING_STONE_NUMERIC, 0);
    }
  }
  const waystone = { x: centerX + 3, y: y + 1, z: centerZ };
  const anchor = { x: centerX - 3, y: y + 1, z: centerZ };
  access.setBlock(waystone.x, waystone.y, waystone.z, PROVING_WAYSTONE_NUMERIC, 0);
  access.setBlock(anchor.x, anchor.y, anchor.z, PROVING_ANCHOR_NUMERIC, 0);
  // Barrier wall south of the pad: physically blocks the route until the crest.
  const barrier: { x: number; y: number; z: number }[] = [];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = 1; dy <= 3; dy++) {
      const p = { x: centerX + dx, y: y + dy, z: centerZ + 7 };
      access.setBlock(p.x, p.y, p.z, PROVING_STONE_NUMERIC, 0);
      barrier.push(p);
    }
  }
  return { origin: { x: centerX, y, z: centerZ }, waystone, anchor, barrier, siteId: PROVING_SITE_ID };
}

/** Remove the proving site's blocks (dev-world reset control). */
export function clearProvingGround(access: ProvingWorldAccess, layout: ProvingLayout): void {
  for (let dx = -6; dx <= 6; dx++) {
    for (let dz = -6; dz <= 6; dz++) {
      access.setBlock(layout.origin.x + dx, layout.origin.y, layout.origin.z + dz, BlockType.AIR, 0);
    }
  }
  access.setBlock(layout.waystone.x, layout.waystone.y, layout.waystone.z, BlockType.AIR, 0);
  access.setBlock(layout.anchor.x, layout.anchor.y, layout.anchor.z, BlockType.AIR, 0);
  for (const p of layout.barrier) access.setBlock(p.x, p.y, p.z, BlockType.AIR, 0);
}

export interface ProvingEncounter {
  state: EncounterSiteState;
  tempLayer: TempArenaLayer;
}

/** Activation: discover -> crest check (neutral site needs none) -> fighting. */
export function startProvingEncounter(progression: ProvingProgression): ProvingEncounter {
  let state = createEncounterState(PROVING_SITE_ID, PROVING_BOSS_ID);
  state = transitionEncounter(state, { type: 'discover' });
  state = transitionEncounter(state, { type: 'unlock', hasPredecessorCrest: true });
  state = transitionEncounter(state, { type: 'startFight' });
  progression.setEncounterPhase(PROVING_SITE_ID, state.phase, { attemptCount: state.attemptCount });
  return { state, tempLayer: new TempArenaLayer() };
}

/**
 * Stage protected temporary arena edits: 3 crest-marked blocks inside the
 * arena that exist ONLY for the fight. Previous voxels are recorded for
 * restoration; nothing permanent is written.
 */
export function stageProvingTempEdits(
  access: ProvingWorldAccess,
  encounter: ProvingEncounter,
  layout: ProvingLayout,
): void {
  const cells = [
    { x: layout.origin.x - 2, y: layout.origin.y + 1, z: layout.origin.z - 2 },
    { x: layout.origin.x + 2, y: layout.origin.y + 1, z: layout.origin.z - 2 },
    { x: layout.origin.x, y: layout.origin.y + 1, z: layout.origin.z + 2 },
  ];
  for (const c of cells) {
    encounter.tempLayer.stage({
      x: c.x, y: c.y, z: c.z,
      previousBlock: String(access.getBlock(c.x, c.y, c.z)),
      previousMeta: access.getMetadata(c.x, c.y, c.z),
    });
    access.setBlock(c.x, c.y, c.z, PROVING_STONE_NUMERIC, 0);
  }
}

/** Failure/death: restore every staged voxel, resolve to the safe state. */
export function failProvingEncounter(
  access: ProvingWorldAccess,
  progression: ProvingProgression,
  encounter: ProvingEncounter,
): ProvingEncounter {  let state = transitionEncounter(encounter.state, { type: 'fail' });
  for (const edit of encounter.tempLayer.restore()) {
    access.setBlock(edit.x, edit.y, edit.z, Number(edit.previousBlock), edit.previousMeta ?? 0);
  }
  state = transitionEncounter(state, { type: 'resetTempLayer' });
  state = resolveInterruptedFight({ ...state, phase: state.phase });
  progression.setEncounterPhase(PROVING_SITE_ID, state.phase, { attemptCount: state.attemptCount });
  return { state, tempLayer: encounter.tempLayer };
}

/**
 * Clear: full victory handoff on the neutral site. Grants the crest exactly
 * once, opens the physical barrier, activates the waystone after the arena
 * is safe, stages the keystone + transform, and arms the rematch ritual.
 */
export function clearProvingEncounter(
  access: ProvingWorldAccess,
  progression: ProvingProgression,
  encounter: ProvingEncounter,
  layout: ProvingLayout,
  timestamp: number,
): ProvingEncounter & { granted: boolean } {
  let state = transitionEncounter(encounter.state, { type: 'clear', timestamp });
  // Temp edits never persist: a cleared site keeps its authored outcome only.
  encounter.tempLayer.clear();
  const granted = progression.grantCampaignCrest(PROVING_CREST_ID);
  // Physical unlock: the crest opens the barrier wall (no toast gate).
  for (const p of layout.barrier) access.setBlock(p.x, p.y, p.z, BlockType.AIR, 0);
  state = activateWaystoneAfterClear(state);
  progression.activateWaystone(PROVING_SITE_ID);
  progression.discoverWaystone(PROVING_SITE_ID);
  // Keystone + persistent world transformation fixture.
  progression.grantCampaignKeystone(PROVING_KEYSTONE_ID);
  applyProvingTransform(access, progression, layout);
  progression.setEncounterPhase(PROVING_SITE_ID, state.phase, {
    attemptCount: state.attemptCount,
    firstClearAt: state.firstClearAt,
    waystoneActive: state.waystoneActive,
    rematchAvailable: state.rematchAvailable,
  });
  return { state, tempLayer: encounter.tempLayer, granted };
}

/** Persistent world change proving the victory mattered: corner beacons. */
export function applyProvingTransform(
  access: ProvingWorldAccess,
  progression: ProvingProgression,
  layout: ProvingLayout,
): void {
  const { x, y, z } = layout.origin;
  for (const [dx, dz] of [[-6, -6], [6, -6], [-6, 6], [6, 6]] as const) {
    for (let dy = 1; dy <= 3; dy++) {
      access.setBlock(x + dx, y + dy, z + dz, PROVING_WAYSTONE_NUMERIC, 0);
    }
  }
  progression.setRegionTransform(PROVING_REGION, true);
}

/** Arm a rematch: restores the protected instance without touching the cleared site. */
export function armProvingRematch(
  progression: ProvingProgression,
  encounter: ProvingEncounter,
): ProvingEncounter {
  const state = transitionEncounter(encounter.state, { type: 'armRematch' });
  progression.setEncounterPhase(PROVING_SITE_ID, state.phase, { attemptCount: state.attemptCount });
  return { state, tempLayer: encounter.tempLayer };
}

/** Register the five-charge expedition anchor (persisted via progression). */
export function placeProvingAnchor(progression: ProvingProgression, layout: ProvingLayout): CampaignAnchorRecord {
  const record: CampaignAnchorRecord = {
    charges: EXPEDITION_ANCHOR_DEFAULT_CHARGES,
    maxCharges: EXPEDITION_ANCHOR_DEFAULT_CHARGES,
    refillItemId: PROVING_ANCHOR_REFILL,
    x: layout.anchor.x, y: layout.anchor.y, z: layout.anchor.z,
  };
  progression.setAnchor(PROVING_SITE_ID, record);
  return record;
}

export interface ProvingTravelResult {
  ok: boolean;
  destination?: { x: number; y: number; z: number };
  reason?: string;
}

/** Waystone travel: earned node, out-of-combat, validated landing, boats stay. */
export function tryProvingTravel(
  access: ProvingWorldAccess,
  encounterPhase: EncounterSiteState['phase'],
  layout: ProvingLayout,
  waystoneActive: boolean,
): ProvingTravelResult {
  if (encounterPhase === 'fighting') {
    return { ok: false, reason: 'Cannot travel during an active encounter.' };
  }
  if (!waystoneActive) {
    return { ok: false, reason: 'The waystone is dormant. Clear the site first.' };
  }
  const solid = (x: number, y: number, z: number): boolean => isSolidForBuild(access.getBlock(x, y, z));
  const d = layout.waystone;
  if (!validateLandingVolume(solid, d.x, d.y, d.z)) {
    return { ok: false, reason: 'Landing volume is obstructed.' };
  }
  return { ok: true, destination: { x: d.x + 0.5, y: d.y + 0.1, z: d.z + 0.5 } };
}

export interface ProvingAtlasInfo {
  region: string;
  bearingDegrees: number;
  distanceBlocks: number;
  sketch: string;
  hint: string;
}

/**
 * Atlas bearing/sketch: an exploration record (bearing + distance + prose),
 * never live markers or undiscovered loot positions.
 */
export function provingAtlasInfo(
  graph: CampaignGraph,
  playerX: number,
  playerZ: number,
): ProvingAtlasInfo {
  const anchor = getRegionAnchor(graph, 'heartwood');
  const ax = anchor?.x ?? 0;
  const az = anchor?.z ?? 0;
  const dx = ax - playerX;
  const dz = az - playerZ;
  const distanceBlocks = Math.round(Math.sqrt(dx * dx + dz * dz));
  const bearingDegrees = Math.round(((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360);
  return {
    region: PROVING_REGION,
    bearingDegrees,
    distanceBlocks,
    sketch: 'A survey pad of teal stone. The violet node hums when the site is cleared.',
    hint: `Heartwood origin lies ${distanceBlocks}m away on bearing ${bearingDegrees}°. Follow the teal beacons.`,
  };
}

/** Frenzy eligibility for the fixture: cleared site + active waystone + demonstrable Blood Moon. */
export function canStartProvingFrenzy(
  bloodMoonDemonstrable: boolean,
  encounterPhase: EncounterSiteState['phase'],
  waystoneActive: boolean,
): boolean {
  return bloodMoonDemonstrable && encounterPhase === 'cleared' && waystoneActive;
}
