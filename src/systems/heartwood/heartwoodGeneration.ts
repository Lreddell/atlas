// Heartwood Marches generation post-pass (Stage 3).
//
// Runs inside chunkGeneration AFTER vault stamping, in both worker and main
// contexts (same code path). Stamps deterministic sites/structures from
// heartwoodSites.ts with a chunk-clipped writer, swaps road/limestone
// surfaces, plants groves, and refreshes local emission for stamped lamps.
//
// Chunk-border safety: the writer clips every edit to its own chunk; sites
// spanning chunks converge because every chunk runs the same pure functions.
// No neighbor GeneratedChunkData is ever touched. Caves carved by the base
// pass may open under thin stamps; structure floors are 3+ thick and patches
// repair small holes.

import { BlockType, type BlockDef } from '../../types';
import { BLOCKS } from '../../data/blocks';
import { CHUNK_SIZE, MIN_Y, MAX_Y } from '../../constants';
import { index3D } from '../world/worldCoords';
import {
  getHeartwoodLayout,
  type HeartwoodLayout,
} from './heartwoodSites';
import {
  HW_IRONWOOD_LOG, HW_RESIN_BLOCK, HW_RESIN_LANTERN, HW_RESONANT_LIMESTONE,
  HW_CUT_LIMESTONE, HW_RINGING_STONE, HW_BELL_BRONZE, HW_BRONZE_LAMP,
  HW_BRIAR_HEDGE, HW_ROOT_BLOCK, HW_CROWNROOT_LOG, HW_MOONLEAF_BLOCK,
  HW_FURROWED_EARTH, HW_STABLE_PATH, HW_SURVEY_MARKER,
  HW_IRONWOOD_LEAVES, HW_CROWNROOT_LEAVES,
} from './heartwoodContent';

export interface HeartwoodGenContext {
  seed: number;
  getSurfaceY(x: number, z: number): number;
}

interface HWChunk {
  blocks: Uint16Array;
  light: Uint8Array;
  meta: Uint8Array;
}

interface Writer {
  set(x: number, y: number, z: number, type: number, meta?: number): void;
  get(x: number, y: number, z: number): number | null;
  changed: Set<number>;
}

function makeWriter(cx: number, cz: number, chunk: HWChunk): Writer {
  const changed = new Set<number>();
  const local = (x: number, y: number, z: number): number | null => {
    const lx = x - cx * CHUNK_SIZE;
    const lz = z - cz * CHUNK_SIZE;
    if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE || y < MIN_Y || y > MAX_Y) return null;
    return index3D(lx, y, lz);
  };
  return {
    changed,
    set(x, y, z, type, meta = 0) {
      const i = local(x, y, z);
      if (i === null) return;
      chunk.blocks[i] = type;
      chunk.meta[i] = meta;
      changed.add(i);
    },
    get(x, y, z) {
      const i = local(x, y, z);
      return i === null ? null : chunk.blocks[i];
    },
  };
}

function hwRand(x: number, z: number, seed: number, salt: number): number {
  let h = Math.imul((x | 0) ^ (seed | 0), 374761393);
  h = Math.imul(h ^ ((z | 0) + salt), 668265263);
  h ^= h >>> 13;
  h = Math.imul(h, 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const defs = BLOCKS as unknown as Record<number, BlockDef | undefined>;

function isReplaceableForStamp(type: number | null): boolean {
  if (type === null) return false;
  if (type === BlockType.AIR) return true;
  const def = defs[type];
  if (!def) return false;
  // Vegetation/decoration yields to structures; solid terrain does not
  // (structures found on it instead of replacing it), except where a stamp
  // explicitly digs (floors, pits).
  return def.noCollision === true;
}

/** Fill a disc at fixed y (digging through anything except bedrock). */
function disc(w: Writer, cx: number, cz: number, y: number, r: number, type: number): void {
  for (let dx = -r; dx <= r; dx++) {
    for (let dz = -r; dz <= r; dz++) {
      if (dx * dx + dz * dz > r * r) continue;
      if (type === BlockType.AIR) {
        w.set(cx + dx, y, cz + dz, BlockType.AIR, 0);
      } else {
        const cur = w.get(cx + dx, y, cz + dz);
        if (cur === null || cur === BlockType.BEDROCK) continue;
        w.set(cx + dx, y, cz + dz, type, 0);
      }
    }
  }
}

function ring(w: Writer, cx: number, cz: number, y: number, r: number, type: number): void {
  for (let dx = -r; dx <= r; dx++) {
    for (let dz = -r; dz <= r; dz++) {
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d > r || d < r - 1.6) continue;
      const cur = w.get(cx + dx, y, cz + dz);
      if (cur === null || cur === BlockType.BEDROCK) continue;
      w.set(cx + dx, y, cz + dz, type, 0);
    }
  }
}

function box(w: Writer, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, type: number): void {
  for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
      for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) {
        if (type === BlockType.AIR) {
          w.set(x, y, z, BlockType.AIR, 0);
        } else {
          const cur = w.get(x, y, z);
          if (cur === null || cur === BlockType.BEDROCK) continue;
          w.set(x, y, z, type, 0);
        }
      }
    }
  }
}

/** Hollow rectangular hedge/structure wall with gaps. */
function wallRect(
  w: Writer, cx: number, cz: number, y: number, half: number, height: number,
  type: number, gaps: { side: 'n' | 's' | 'e' | 'w'; at: number; width: number }[] = [],
): void {
  const gapAt = (x: number, z: number): boolean => {
    for (const g of gaps) {
      if (g.side === 'n' && z === cz - half && Math.abs(x - (cx + g.at)) < g.width) return true;
      if (g.side === 's' && z === cz + half && Math.abs(x - (cx + g.at)) < g.width) return true;
      if (g.side === 'w' && x === cx - half && Math.abs(z - (cz + g.at)) < g.width) return true;
      if (g.side === 'e' && x === cx + half && Math.abs(z - (cz + g.at)) < g.width) return true;
    }
    return false;
  };
  for (let dy = 0; dy < height; dy++) {
    for (let d = -half; d <= half; d++) {
      const cells: [number, number][] = [
        [cx + d, cz - half], [cx + d, cz + half], [cx - half, cz + d], [cx + half, cz + d],
      ];
      for (const [x, z] of cells) {
        if (gapAt(x, z)) continue;
        const cur = w.get(x, y + dy, z);
        if (cur === null || cur === BlockType.BEDROCK) continue;
        w.set(x, y + dy, z, type, 0);
      }
    }
  }
}

function clearAbove(w: Writer, x: number, z: number, fromY: number, height: number): void {
  for (let y = fromY; y < fromY + height && y <= MAX_Y; y++) {
    w.set(x, y, z, BlockType.AIR, 0);
  }
}

/** A hand-placed tree: trunk + blob canopy, deterministic height. */
function stampTree(
  w: Writer, x: number, y: number, z: number,
  log: number, leaves: number, height: number, canopyR: number,
): void {
  for (let i = 0; i < height; i++) w.set(x, y + i, z, log, 0);
  const top = y + height;
  for (let dx = -canopyR; dx <= canopyR; dx++) {
    for (let dz = -canopyR; dz <= canopyR; dz++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (Math.abs(dx) + Math.abs(dz) + Math.abs(dy) > canopyR + 1) continue;
        if (dx === 0 && dz === 0 && dy <= 0) continue;
        const cur = w.get(x + dx, top + dy, z + dz);
        if (cur === null) continue;
        if (cur === BlockType.AIR || isReplaceableForStamp(cur)) w.set(x + dx, top + dy, z + dz, leaves, 0);
      }
    }
  }
  w.set(x, top + 1, z, leaves, 0);
}

// --- Site stamps ---

function stampAmphitheater(w: Writer, ctx: HeartwoodGenContext, x: number, z: number, r: number, moonlit: boolean): void {
  const floorY = ctx.getSurfaceY(x, z);
  // Floor: 3-thick foundation so caves below cannot open holes.
  for (let d = 0; d < 3; d++) disc(w, x, z, floorY - d, r, moonlit ? HW_STABLE_PATH : HW_FURROWED_EARTH);
  disc(w, x, z, floorY, 10, HW_STABLE_PATH);
  // Terrace rings.
  ring(w, x, z, floorY + 1, r - 6, HW_CUT_LIMESTONE);
  ring(w, x, z, floorY + 1, r - 18, HW_CUT_LIMESTONE);
  ring(w, x, z, floorY + 1, r - 30, HW_CUT_LIMESTONE);
  if (moonlit) {
    // Moonleaf constellation ring + root arches at cardinal gaps.
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const px = Math.round(x + Math.cos(a) * (r - 12));
      const pz = Math.round(z + Math.sin(a) * (r - 12));
      const cur = w.get(px, floorY + 1, pz);
      if (cur === BlockType.AIR) w.set(px, floorY + 1, pz, HW_MOONLEAF_BLOCK, 0);
    }
  }
  // Clear the bowl air so no tree/leaf floats inside.
  for (let dx = -r; dx <= r; dx++) {
    for (let dz = -r; dz <= r; dz++) {
      if (dx * dx + dz * dz > r * r) continue;
      for (let y = floorY + 1; y < floorY + 12; y++) {
        const cur = w.get(x + dx, y, z + dz);
        if (cur === null) continue;
        if (isReplaceableForStamp(cur)) w.set(x + dx, y, z + dz, BlockType.AIR, 0);
      }
    }
  }
}

function stampDen(w: Writer, ctx: HeartwoodGenContext, x: number, z: number): void {
  const y = ctx.getSurfaceY(x, z);
  box(w, x - 2, y, z - 2, x + 2, y + 2, z + 2, HW_ROOT_BLOCK);
  box(w, x - 1, y + 1, z - 1, x + 1, y + 1, z + 1, BlockType.AIR);
  box(w, x - 1, y, z + 3, x + 1, y, z + 3, BlockType.AIR);
  w.set(x, y + 3, z, HW_SURVEY_MARKER, 0);
}

function stampKeep(w: Writer, ctx: HeartwoodGenContext, layout: HeartwoodLayout): void {
  const { x, z, half } = layout.keep;
  const { gateSide, gateAt, gateCells } = layout.keep;
  const y = ctx.getSurfaceY(x, z);
  // Foundation + courtyard.
  box(w, x - half, y - 2, z - half, x + half, y, z + half, HW_CUT_LIMESTONE);
  box(w, x - half + 3, y + 1, z - half + 3, x + half - 3, y + 1, z + half - 3, HW_STABLE_PATH);
  // Inner hall (solid shell, hollowed, roofed, doorway on approach side).
  box(w, x - 4, y + 1, z - 4, x + 4, y + 5, z + 4, HW_CUT_LIMESTONE);
  box(w, x - 3, y + 1, z - 3, x + 3, y + 4, z + 3, BlockType.AIR);
  if (gateSide === 'e') box(w, x + 4, y + 1, z - 1, x + 4, y + 3, z + 1, BlockType.AIR);
  else if (gateSide === 'w') box(w, x - 4, y + 1, z - 1, x - 4, y + 3, z + 1, BlockType.AIR);
  else if (gateSide === 's') box(w, x - 1, y + 1, z + 4, x + 1, y + 3, z + 4, BlockType.AIR);
  else box(w, x - 1, y + 1, z - 4, x + 1, y + 3, z - 4, BlockType.AIR);
  box(w, x - 4, y + 6, z - 4, x + 4, y + 6, z + 4, HW_BELL_BRONZE);
  w.set(x, y + 7, z, HW_SURVEY_MARKER, 0);
  // Corner pillars with lamps.
  for (const [sx, sz] of [[-half, -half], [half, -half], [-half, half], [half, half]] as const) {
    box(w, x + sx - 1, y + 1, z + sz - 1, x + sx + 1, y + 5, z + sz + 1, HW_CUT_LIMESTONE);
    w.set(x + sx, y + 6, z + sz, HW_BRONZE_LAMP, 0);
  }
  // Courtyard air: clear the annulus between hall and walls (not the hall).
  for (let dx = -half + 1; dx <= half - 1; dx++) {
    for (let dz = -half + 1; dz <= half - 1; dz++) {
      if (Math.abs(dx) <= 5 && Math.abs(dz) <= 5) continue;
      for (let dy = 2; dy <= 9; dy++) {
        const cur = w.get(x + dx, y + dy, z + dz);
        if (cur === null) continue;
        if (isReplaceableForStamp(cur)) w.set(x + dx, y + dy, z + dz, BlockType.AIR, 0);
      }
    }
  }
  // Outer hedge wall with a gate gap facing the approach.
  wallRect(w, x, z, y + 1, half, 4, HW_BRIAR_HEDGE, [{ side: gateSide, at: gateAt, width: 2 }]);
  // CLOSED root gate: living wall across the layout gate cells (opens on Furrow Crest).
  for (const cell of gateCells) {
    box(w, cell.x, y + 1, cell.z, cell.x, y + 4, cell.z, HW_ROOT_BLOCK);
  }
}

function stampOutpost(w: Writer, ctx: HeartwoodGenContext, x: number, z: number): void {
  const y = ctx.getSurfaceY(x, z);
  box(w, x - 4, y - 1, z - 4, x + 4, y, z + 4, HW_CUT_LIMESTONE);
  // Clear first so the walls below land on a clean pad.
  box(w, x - 3, y + 1, z - 3, x + 3, y + 6, z + 3, BlockType.AIR);
  wallRect(w, x, z, y + 1, 4, 3, HW_BRIAR_HEDGE, [{ side: 's', at: 0, width: 1 }]);
  w.set(x, y + 1, z, HW_SURVEY_MARKER, 0);
  w.set(x + 2, y + 1, z + 2, HW_RESIN_LANTERN, 0);
}

function stampShrine(w: Writer, ctx: HeartwoodGenContext, x: number, z: number): void {
  const y = ctx.getSurfaceY(x, z);
  disc(w, x, z, y, 3, HW_CUT_LIMESTONE);
  w.set(x, y + 1, z, HW_RINGING_STONE, 0);
  for (const [dx, dz] of [[2, 0], [-2, 0], [0, 2], [0, -2]] as const) {
    if (w.get(x + dx, y + 1, z + dz) === BlockType.AIR) w.set(x + dx, y + 1, z + dz, HW_MOONLEAF_BLOCK, 0);
  }
  clearAbove(w, x, z, y + 1, 6);
}

function stampCairn(w: Writer, ctx: HeartwoodGenContext, x: number, z: number): void {
  const y = ctx.getSurfaceY(x, z);
  w.set(x, y + 1, z, BlockType.COBBLESTONE, 0);
  w.set(x, y + 2, z, BlockType.STONE, 0);
  w.set(x, y + 3, z, HW_SURVEY_MARKER, 0);
}

function stampRingingStone(w: Writer, ctx: HeartwoodGenContext, x: number, z: number): void {
  const y = ctx.getSurfaceY(x, z);
  disc(w, x, z, y, 2, HW_STABLE_PATH);
  w.set(x, y + 1, z, HW_RINGING_STONE, 0);
  clearAbove(w, x, z, y + 2, 4);
}

function stampBellTower(w: Writer, ctx: HeartwoodGenContext, x: number, z: number): void {
  const y = ctx.getSurfaceY(x, z);
  box(w, x - 2, y - 1, z - 2, x + 2, y, z + 2, HW_CUT_LIMESTONE);
  box(w, x - 1, y + 1, z - 1, x + 1, y + 10, z + 1, HW_CUT_LIMESTONE);
  box(w, x - 2, y + 11, z - 2, x + 2, y + 11, z + 2, HW_BELL_BRONZE);
  w.set(x, y + 12, z, HW_BRONZE_LAMP, 0);
  for (let i = 1; i <= 3; i++) w.set(x + 3, y + i, z, HW_CUT_LIMESTONE, 0);
}

function stampFarm(w: Writer, ctx: HeartwoodGenContext, x: number, z: number): void {
  const y = ctx.getSurfaceY(x, z);
  // Field walls with gaps.
  wallRect(w, x, z, y + 1, 6, 1, BlockType.COBBLESTONE, [
    { side: 'n', at: 0, width: 1 }, { side: 's', at: 0, width: 1 },
  ]);
  // Furrowed rows inside.
  for (let dz = -4; dz <= 4; dz += 2) {
    for (let dx = -4; dx <= 4; dx++) {
      const cur = w.get(x + dx, y + 1, z + dz);
      if (cur === BlockType.AIR || isReplaceableForStamp(cur)) w.set(x + dx, y + 1, z + dz, HW_FURROWED_EARTH, 0);
    }
  }
}

function stampTreeStand(
  w: Writer, ctx: HeartwoodGenContext, seed: number, x: number, z: number,
  log: number, leaves: number, count: number, spread: number, withResin: boolean,
): void {
  for (let i = 0; i < count; i++) {
    const a = hwRand(x, z, seed, 500 + i) * Math.PI * 2;
    const d = 4 + hwRand(x, z, seed, 600 + i) * spread;
    const tx = Math.round(x + Math.cos(a) * d);
    const tz = Math.round(z + Math.sin(a) * d);
    const ty = ctx.getSurfaceY(tx, tz);
    const cur = w.get(tx, ty + 1, tz);
    if (cur !== BlockType.AIR && !isReplaceableForStamp(cur)) continue;
    const h = 4 + Math.floor(hwRand(tx, tz, seed, 700 + i) * 3);
    stampTree(w, tx, ty + 1, tz, log, leaves, h, 2);
    if (withResin && hwRand(tx, tz, seed, 800 + i) < 0.4) {
      w.set(tx + 1, ty + 1, tz, HW_RESIN_BLOCK, 0);
    }
  }
}

function stampMoonleafPatch(w: Writer, ctx: HeartwoodGenContext, seed: number, x: number, z: number, r: number): void {
  for (let dx = -r; dx <= r; dx++) {
    for (let dz = -r; dz <= r; dz++) {
      if (dx * dx + dz * dz > r * r) continue;
      if (hwRand(x + dx, z + dz, seed, 900) > 0.25) continue;
      const y = ctx.getSurfaceY(x + dx, z + dz);
      if (w.get(x + dx, y + 1, z + dz) === BlockType.AIR) {
        w.set(x + dx, y + 1, z + dz, HW_MOONLEAF_BLOCK, 0);
      }
    }
  }
}

function stampSpire(w: Writer, ctx: HeartwoodGenContext, x: number, z: number): void {
  const y = ctx.getSurfaceY(x, z);
  box(w, x - 1, y - 1, z - 1, x + 1, y, z + 1, HW_RESONANT_LIMESTONE);
  box(w, x, y + 1, z, x, y + 14, z, HW_CUT_LIMESTONE);
  for (let i = 4; i <= 12; i += 4) {
    box(w, x - 1, y + i, z - 1, x + 1, y + i, z + 1, HW_BELL_BRONZE);
    box(w, x, y + i, z, x, y + i, z, HW_CUT_LIMESTONE);
  }
  w.set(x, y + 15, z, HW_BRONZE_LAMP, 0);
}

function stampVaultEntrance(w: Writer, ctx: HeartwoodGenContext, x: number, z: number): void {
  const y = ctx.getSurfaceY(x, z);
  // Raised platform, cleared first so the arch lands clean.
  box(w, x - 6, y - 1, z - 6, x + 6, y, z + 6, HW_CUT_LIMESTONE);
  box(w, x - 6, y + 1, z - 6, x + 6, y + 9, z + 6, BlockType.AIR);
  // Grand arch + sealed vault row (opens via transform).
  for (let i = 0; i <= 6; i++) {
    box(w, x - 2, y + 1 + i, z - 2, x - 2, y + 1 + i, z + 2, HW_RESONANT_LIMESTONE);
    box(w, x + 2, y + 1 + i, z - 2, x + 2, y + 1 + i, z + 2, HW_RESONANT_LIMESTONE);
  }
  box(w, x - 2, y + 7, z - 2, x + 2, y + 8, z + 2, HW_BELL_BRONZE);
  box(w, x - 1, y + 1, z, x + 1, y + 5, z, BlockType.VAULT_SEAL);
  w.set(x - 4, y + 1, z + 4, HW_BRONZE_LAMP, 0);
  w.set(x + 4, y + 1, z + 4, HW_BRONZE_LAMP, 0);
  w.set(x, y + 1, z + 5, HW_SURVEY_MARKER, 0);
}

function stampWaystoneHub(w: Writer, ctx: HeartwoodGenContext, x: number, z: number): void {
  const y = ctx.getSurfaceY(x, z);
  disc(w, x, z, y, 7, HW_CUT_LIMESTONE);
  for (let dx = -7; dx <= 7; dx++) {
    for (let dz = -7; dz <= 7; dz++) {
      if (dx * dx + dz * dz > 49) continue;
      clearAbove(w, x + dx, z + dz, y + 1, 5);
    }
  }
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    w.set(Math.round(x + Math.cos(a) * 5), y + 1, Math.round(z + Math.sin(a) * 5), HW_RINGING_STONE, 0);
  }
  // Dormant center: unlit survey marker (lights/activates on Bell Titan).
  w.set(x, y + 1, z, HW_SURVEY_MARKER, 0);
}

function stampHuntingGround(w: Writer, ctx: HeartwoodGenContext, seed: number, x: number, z: number): void {
  const y = ctx.getSurfaceY(x, z);
  ring(w, x, z, y + 1, 10, HW_BRIAR_HEDGE);
  // Gaps in the ring (lanes).
  for (const a of [0.4, 2.5, 4.4]) {
    const px = Math.round(x + Math.cos(a) * 10);
    const pz = Math.round(z + Math.sin(a) * 10);
    w.set(px, y + 1, pz, BlockType.AIR, 0);
  }
  w.set(x, y + 1, z, HW_SURVEY_MARKER, 0);
  void seed;
}

function stampMill(w: Writer, ctx: HeartwoodGenContext, x: number, z: number): void {
  const y = ctx.getSurfaceY(x, z);
  // Ruin walls (roofless, gapped).
  box(w, x - 6, y + 1, z - 4, x - 6, y + 4, z + 4, HW_CUT_LIMESTONE);
  box(w, x + 6, y + 1, z - 4, x + 6, y + 3, z + 4, HW_CUT_LIMESTONE);
  box(w, x - 6, y + 1, z - 4, x + 6, y + 5, z - 4, HW_CUT_LIMESTONE);
  // Wheel pit: stone ring south side.
  ring(w, x, z + 8, y, 3, HW_CUT_LIMESTONE);
  // Crop strips: furrowed rows alternating bare dirt east of the mill.
  for (let s = 0; s < 8; s++) {
    for (let dx = 10; dx <= 26; dx++) {
      const cur = w.get(x + dx, y + 1, z - 7 + s * 2);
      if (cur === BlockType.AIR || isReplaceableForStamp(cur)) {
        w.set(x + dx, y + 1, z - 7 + s * 2, s % 2 === 0 ? HW_FURROWED_EARTH : BlockType.DIRT, 0);
      }
    }
  }
  box(w, x - 5, y + 1, z - 3, x + 5, y + 6, z + 3, BlockType.AIR);
}

function pointToSegment(x: number, z: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const lenSq = dx * dx + dz * dz;
  let t = lenSq > 0 ? ((x - ax) * dx + (z - az) * dz) / lenSq : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(x - (ax + dx * t), z - (az + dz * t));
}

function refreshEmission(w: Writer, chunk: HWChunk): void {
  const queue: number[] = [];
  for (const index of w.changed) {
    const type = chunk.blocks[index];
    const emission = defs[type]?.lightLevel ?? 0;
    const sky = chunk.light[index] & 0xf0;
    chunk.light[index] = sky | (emission & 0x0f);
    if (emission > 1) queue.push(index);
  }
  const plane = CHUNK_SIZE * CHUNK_SIZE;
  const offsets = [-1, 1, -CHUNK_SIZE, CHUNK_SIZE, -plane, plane];
  let head = 0;
  while (head < queue.length && queue.length < 18000) {
    const index = queue[head++];
    const level = chunk.light[index] & 0x0f;
    if (level <= 1) continue;
    for (const off of offsets) {
      const next = index + off;
      if (next < 0 || next >= chunk.blocks.length) continue;
      const nextType = chunk.blocks[next];
      const def = defs[nextType];
      if (nextType !== BlockType.AIR && !def?.transparent && !def?.noCollision) continue;
      if ((chunk.light[next] & 0x0f) >= level - 1) continue;
      chunk.light[next] = (chunk.light[next] & 0xf0) | (level - 1);
      queue.push(next);
    }
  }
}

/**
 * Stamp Heartwood sites/structures/surfaces into one chunk. Safe to run in
 * worker or main thread (pure + clipped). Returns the chunk (mutated).
 */
export function applyHeartwoodToChunk(
  cx: number, cz: number, chunk: HWChunk, ctx: HeartwoodGenContext,
): HWChunk {
  const layout = getHeartwoodLayout(ctx.seed);
  const x0 = cx * CHUNK_SIZE;
  const z0 = cz * CHUNK_SIZE;
  const x1 = x0 + CHUNK_SIZE - 1;
  const z1 = z0 + CHUNK_SIZE - 1;
  const touchesDisc = !(x1 < -1600 || x0 > 1600 || z1 < -1600 || z0 > 1600);
  // Fast reject: no sites near this chunk and no routes crossing it.
  let near = touchesDisc;
  if (!near) {
    for (const route of layout.routes) {
      for (let i = 0; i < route.length - 1; i++) {
        const a = route[i];
        const b = route[i + 1];
        if (pointToSegment((x0 + x1) / 2, (z0 + z1) / 2, a.x, a.z, b.x, b.z) < 120) { near = true; break; }
      }
      if (near) break;
    }
  }
  if (!near) return chunk;
  const w = makeWriter(cx, cz, chunk);
  const inChunk = (x: number, z: number, pad: number): boolean =>
    x > x0 - pad && x < x1 + pad && z > z0 - pad && z < z1 + pad;

  // --- Major sites ---
  if (inChunk(layout.amphitheater.x, layout.amphitheater.z, 48)) {
    stampAmphitheater(w, ctx, layout.amphitheater.x, layout.amphitheater.z, 42, false);
    stampDen(w, ctx, layout.amphitheater.x + 30, layout.amphitheater.z + 18);
  }
  if (inChunk(layout.stagAmphitheater.x, layout.stagAmphitheater.z, 42)) {
    stampAmphitheater(w, ctx, layout.stagAmphitheater.x, layout.stagAmphitheater.z, 36, true);
  }
  if (inChunk(layout.keep.x, layout.keep.z, 30)) stampKeep(w, ctx, layout);
  if (inChunk(layout.vaultEntrance.x, layout.vaultEntrance.z, 16)) {
    stampVaultEntrance(w, ctx, layout.vaultEntrance.x, layout.vaultEntrance.z);
  }
  if (inChunk(layout.waystoneHub.x, layout.waystoneHub.z, 12)) {
    stampWaystoneHub(w, ctx, layout.waystoneHub.x, layout.waystoneHub.z);
  }
  if (inChunk(layout.bellTower.x, layout.bellTower.z, 10)) {
    stampBellTower(w, ctx, layout.bellTower.x, layout.bellTower.z);
  }
  if (inChunk(layout.farm.x, layout.farm.z, 12)) stampFarm(w, ctx, layout.farm.x, layout.farm.z);
  if (inChunk(layout.mill.x, layout.mill.z, 30)) stampMill(w, ctx, layout.mill.x, layout.mill.z);
  for (const c of layout.cairns) if (inChunk(c.x, c.z, 6)) stampCairn(w, ctx, c.x, c.z);
  for (const c of layout.ringingStones) if (inChunk(c.x, c.z, 6)) stampRingingStone(w, ctx, c.x, c.z);
  for (const c of layout.outposts) if (inChunk(c.x, c.z, 10)) stampOutpost(w, ctx, c.x, c.z);
  for (const c of layout.shrines) if (inChunk(c.x, c.z, 8)) stampShrine(w, ctx, c.x, c.z);
  for (const c of layout.spires) if (inChunk(c.x, c.z, 8)) stampSpire(w, ctx, c.x, c.z);
  for (const c of layout.huntingGrounds) if (inChunk(c.x, c.z, 16)) stampHuntingGround(w, ctx, ctx.seed, c.x, c.z);
  for (const c of layout.groveStands) {
    if (!inChunk(c.x, c.z, 40)) continue;
    stampTreeStand(w, ctx, ctx.seed, c.x, c.z, HW_CROWNROOT_LOG, HW_CROWNROOT_LEAVES, 8, 26, true);
    stampMoonleafPatch(w, ctx, ctx.seed, c.x, c.z, 14);
  }
  // Meadow ironwood grove ring around the origin basin.
  for (const a of [0.6, 2.2, 3.9, 5.1]) {
    const gx = Math.round(Math.cos(a) * 150);
    const gz = Math.round(Math.sin(a) * 150);
    if (!inChunk(gx, gz, 30)) continue;
    stampTreeStand(w, ctx, ctx.seed, gx, gz, HW_IRONWOOD_LOG, HW_IRONWOOD_LEAVES, 9, 20, true);
  }
  // Meadow flower clusters (roses/dandelions on grass).
  for (let x = x0; x <= x1; x += 2) {
    for (let z = z0; z <= z1; z += 2) {
      if (Math.hypot(x, z) > 215) continue;
      if (hwRand(x, z, ctx.seed, 1001) > 0.06) continue;
      const y = ctx.getSurfaceY(x, z);
      if (w.get(x, y + 1, z) !== BlockType.AIR) continue;
      const ground = w.get(x, y, z);
      if (ground !== BlockType.GRASS && ground !== HW_FURROWED_EARTH) continue;
      const r = hwRand(x, z, ctx.seed, 1002);
      w.set(x, y + 1, z, r < 0.4 ? BlockType.ROSE : r < 0.8 ? BlockType.DANDELION : BlockType.GRASS_PLANT, 0);
    }
  }
  // Briar hedge corridors flanking the keep approach (route leg 1 end).
  // (Keep walls + outposts carry the corridor read; hedges ring hunting grounds.)

  // --- Surfaces: roads, limestone exposure (bounded column scans) ---
  for (let x = x0; x <= x1; x++) {
    for (let z = z0; z <= z1; z++) {
      // Roads: stable path where the surface is soft.
      let road = false;
      for (const route of layout.routes) {
        for (let i = 0; i < route.length - 1; i++) {
          if (pointToSegment(x, z, route[i].x, route[i].z, route[i + 1].x, route[i + 1].z) < 2.2) { road = true; break; }
        }
        if (road) break;
      }
      const y = ctx.getSurfaceY(x, z);
      const top = w.get(x, y, z);
      if (top === null) continue;
      if (road && (top === BlockType.GRASS || top === BlockType.DIRT || top === HW_FURROWED_EARTH)) {
        w.set(x, y, z, HW_STABLE_PATH, 0);
        const above = w.get(x, y + 1, z);
        if (above !== null && above !== BlockType.AIR && isReplaceableForStamp(above)) w.set(x, y + 1, z, BlockType.AIR, 0);
        continue;
      }
      // Limestone country: exposed stone inside the disc becomes resonant.
      if (!road && top === BlockType.STONE && Math.hypot(x, z) < 1500 && hwRand(x, z, ctx.seed, 1100) < 0.3) {
        w.set(x, y, z, HW_RESONANT_LIMESTONE, 0);
      }
    }
  }
  // Roadside survey markers every ~150 blocks along routes.
  for (const route of layout.routes) {
    for (let i = 0; i < route.length - 1; i++) {
      const a = route[i];
      const b = route[i + 1];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      for (let d = 75; d < len; d += 150) {
        const t = d / len;
        const mx = Math.round(a.x + (b.x - a.x) * t) + 3;
        const mz = Math.round(a.z + (b.z - a.z) * t);
        if (mx < x0 || mx > x1 || mz < z0 || mz > z1) continue;
        const y = ctx.getSurfaceY(mx, mz);
        if (w.get(mx, y + 1, mz) === BlockType.AIR) w.set(mx, y + 1, mz, HW_SURVEY_MARKER, 0);
      }
    }
  }

  if (w.changed.size > 0) refreshEmission(w, chunk);
  return chunk;
}
