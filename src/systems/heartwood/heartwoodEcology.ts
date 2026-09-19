// Heartwood ecology director: overworld population control per sub-biome.
//
// Maintains bounded ordinary/elite/passive populations around the player with
// a strict threat budget (bailiff counts triple; at most one elite engaged).
// Pure decision logic over injected world/entity access — no singletons, so
// node tests drive it directly. Wired into EntityManager.tick.

import { getHeartwoodSubBiome, type HeartwoodSubBiome } from './heartwoodSites';

export const HEARTWOOD_HOSTILES = ['furrowling', 'briar_sentry', 'crown_hare', 'heartwood_cantor', 'mossback_bailiff'] as const;
export const HEARTWOOD_PASSIVES = ['field_deer', 'bellfinch', 'resin_moth'] as const;

export interface EcologyWorld {
  hasChunk(cx: number, cz: number): boolean;
  /** Solid ground Y at the column, or null when unknown/unsafe. */
  groundY(x: number, z: number): number | null;
  isNight(): boolean;
}

export interface EcologyEntities {
  spawn(kind: string, x: number, y: number, z: number): number | null;
  despawn(id: number): void;
  list(): { id: number; kind: string; hp: number; x: number; y: number; z: number; boss: boolean }[];
}

export interface EcologyState {
  acc: number;
  nonce: number;
}

export function createEcologyState(): EcologyState {
  return { acc: 0, nonce: 0 };
}

interface Row {
  kind: string;
  count: number;
  threat: number;
}

// Desired populations by sub-biome (null = ordinary wilderness mix).
const TABLE: Record<string, Row[]> = {
  meadow: [
    { kind: 'field_deer', count: 3, threat: 0 },
    { kind: 'bellfinch', count: 2, threat: 0 },
    { kind: 'furrowling', count: 2, threat: 1 },
  ],
  downs: [
    { kind: 'furrowling', count: 3, threat: 1 },
    { kind: 'field_deer', count: 2, threat: 0 },
    { kind: 'bellfinch', count: 1, threat: 0 },
  ],
  briar: [
    { kind: 'briar_sentry', count: 3, threat: 1 },
    { kind: 'mossback_bailiff', count: 1, threat: 3 },
    { kind: 'resin_moth', count: 1, threat: 0 },
  ],
  grove: [
    { kind: 'crown_hare', count: 3, threat: 1 },
    { kind: 'heartwood_cantor', count: 2, threat: 1 },
    { kind: 'resin_moth', count: 2, threat: 0 },
  ],
  wild: [
    { kind: 'furrowling', count: 1, threat: 1 },
    { kind: 'field_deer', count: 2, threat: 0 },
  ],
};

export const ECOLOGY_TICK_SECONDS = 2.0;
export const ECOLOGY_SPAWN_RING_MIN = 24;
export const ECOLOGY_SPAWN_RING_MAX = 48;
export const ECOLOGY_DESPAWN_DIST = 80;
export const ECOLOGY_THREAT_CAP = 8;

function hash01(nonce: number, salt: number): number {
  let h = Math.imul(nonce ^ 0x9e3779b9, 374761393);
  h = Math.imul(h ^ (salt + 0x85ebca6b), 668265263);
  h ^= h >>> 13;
  h = Math.imul(h, 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** One ecology step. Call at low frequency (every ~2s), never per tick. */
export function ecologyStep(
  state: EcologyState,
  dt: number,
  player: { x: number; y: number; z: number } | null,
  seedNum: number,
  world: EcologyWorld,
  entities: EcologyEntities,
): void {
  state.acc += dt;
  if (state.acc < ECOLOGY_TICK_SECONDS || !player) return;
  state.acc = 0;
  state.nonce += 1;
  const sub: HeartwoodSubBiome | 'wild' = getHeartwoodSubBiome(Math.floor(player.x), Math.floor(player.z), seedNum) ?? 'wild';
  const rows = TABLE[sub] ?? TABLE.wild;
  const live = entities.list().filter((e) => !e.boss && e.hp > 0);
  // Despawn far non-boss heartwood creatures first (budget + perf).
  for (const e of live) {
    if (!isHeartwoodCreature(e.kind)) continue;
    if (Math.hypot(e.x - player.x, e.z - player.z) > ECOLOGY_DESPAWN_DIST) {
      entities.despawn(e.id);
    }
  }
  const after = entities.list().filter((e) => !e.boss && e.hp > 0);
  const counts = new Map<string, number>();
  let threat = 0;
  for (const e of after) {
    counts.set(e.kind, (counts.get(e.kind) ?? 0) + 1);
    threat += e.kind === 'mossback_bailiff' ? 3 : isHostile(e.kind) ? 1 : 0;
  }
  for (const row of rows) {
    if ((counts.get(row.kind) ?? 0) >= row.count) continue;
    if (threat + row.threat > ECOLOGY_THREAT_CAP) continue;
    const spot = findSpawnSpot(state, player, seedNum, world);
    if (!spot) continue;
    const id = entities.spawn(row.kind, spot.x, spot.y, spot.z);
    if (id !== null) {
      counts.set(row.kind, (counts.get(row.kind) ?? 0) + 1);
      threat += row.threat;
    }
    // One spawn per step: populations converge over successive steps
    // instead of bursting, which keeps hitches out of the frame budget.
    break;
  }
}

/** Object-form tick used by EntityManager.tick: adapts engine singletons to
 *  ecologyStep. Skipped in spectator mode (observer cameras must not seed
 *  encounters); survival and creative both get a living overworld. */
export interface HeartwoodEcologyTickOptions {
  gameMode: string;
  playerPos: { x: number; y: number; z: number } | null;
  seed: number;
  spawn(kind: string, x: number, y: number, z: number): number | null;
  despawn(id: number): void;
  list(): { id: number; kind: string; hp: number; x: number; y: number; z: number; boss: boolean }[];
  hasChunk(cx: number, cz: number): boolean;
  groundY(x: number, z: number): number | null;
  night(): boolean;
}

export function tickHeartwoodEcology(
  state: EcologyState,
  dt: number,
  opts: HeartwoodEcologyTickOptions,
): void {
  if (opts.gameMode === 'spectator') return;
  ecologyStep(state, dt, opts.playerPos, opts.seed, {
    hasChunk: opts.hasChunk,
    groundY: opts.groundY,
    isNight: opts.night,
  }, {
    spawn: opts.spawn,
    despawn: opts.despawn,
    list: opts.list,
  });
}

function findSpawnSpot(
  state: EcologyState,
  player: { x: number; y: number; z: number },
  seedNum: number,
  world: EcologyWorld,
): { x: number; y: number; z: number } | null {
  for (let attempt = 0; attempt < 6; attempt++) {
    const a = hash01(state.nonce * 31 + attempt, seedNum & 0xffff) * Math.PI * 2;
    const d = ECOLOGY_SPAWN_RING_MIN + hash01(state.nonce * 17 + attempt * 7, (seedNum >>> 8) & 0xffff)
      * (ECOLOGY_SPAWN_RING_MAX - ECOLOGY_SPAWN_RING_MIN);
    const x = Math.floor(player.x + Math.cos(a) * d) + 0.5;
    const z = Math.floor(player.z + Math.sin(a) * d) + 0.5;
    if (!world.hasChunk(Math.floor(x / 16), Math.floor(z / 16))) continue;
    const gy = world.groundY(Math.floor(x), Math.floor(z));
    if (gy === null) continue;
    // Never bury spawns: require headroom the spawner cannot verify cheaply
    // here is handled by the brain's physics (they fall/settle on spawn).
    return { x, y: gy + 1, z };
  }
  return null;
}

function isHostile(kind: string): boolean {
  return (HEARTWOOD_HOSTILES as readonly string[]).includes(kind);
}

function isHeartwoodCreature(kind: string): boolean {
  return isHostile(kind) || (HEARTWOOD_PASSIVES as readonly string[]).includes(kind);
}
