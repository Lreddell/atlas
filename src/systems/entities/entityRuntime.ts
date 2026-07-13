import * as THREE from 'three';
import { entityManager } from './EntityManager';
import { ENTITY_KINDS, type Entity } from './Entity';
import { EntitySpatialHash } from './EntitySpatialHash';
import { entitySimulationLevel, reducedTickInterval } from './entitySimulationLevel';

export interface EntityRuntimeTelemetry {
  activeEntities: number;
  reducedEntities: number;
  sleepingEntities: number;
  spatialBuckets: number;
  spatialQueries: number;
}

const INSTALL_MARK = Symbol.for('atlas.entity-runtime-installed');
const hash = new EntitySpatialHash(16);
const accumulators = new Map<number, number>();
const rayCandidates: number[] = [];
const fieldCandidates: number[] = [];
export const entityRuntimeTelemetry: EntityRuntimeTelemetry = {
  activeEntities: 0,
  reducedEntities: 0,
  sleepingEntities: 0,
  spatialBuckets: 0,
  spatialQueries: 0,
};

const boundsFor = (entity: Entity) => ({
  minX: entity.pos.x - entity.width * 0.5,
  minY: entity.pos.y,
  minZ: entity.pos.z - entity.width * 0.5,
  maxX: entity.pos.x + entity.width * 0.5,
  maxY: entity.pos.y + entity.height,
  maxZ: entity.pos.z + entity.width * 0.5,
});

const syncHash = (entities: Map<number, Entity>): void => {
  const live = new Set<number>();
  for (const entity of entities.values()) {
    live.add(entity.id);
    hash.upsert(entity.id, boundsFor(entity));
  }
  for (const id of [...accumulators.keys()]) {
    if (!live.has(id)) {
      hash.remove(id);
      accumulators.delete(id);
    }
  }
  entityRuntimeTelemetry.spatialBuckets = hash.bucketCount;
};

const rayAabb = (origin: THREE.Vector3, direction: THREE.Vector3, entity: Entity): number | null => {
  const half = entity.width * 0.5;
  const min = [entity.pos.x - half, entity.pos.y, entity.pos.z - half];
  const max = [entity.pos.x + half, entity.pos.y + entity.height, entity.pos.z + half];
  const start = [origin.x, origin.y, origin.z];
  const delta = [direction.x, direction.y, direction.z];
  let tMin = -Infinity;
  let tMax = Infinity;
  for (let axis = 0; axis < 3; axis += 1) {
    if (Math.abs(delta[axis]) < 1e-8) {
      if (start[axis] < min[axis] || start[axis] > max[axis]) return null;
      continue;
    }
    let a = (min[axis] - start[axis]) / delta[axis];
    let b = (max[axis] - start[axis]) / delta[axis];
    if (a > b) [a, b] = [b, a];
    tMin = Math.max(tMin, a);
    tMax = Math.min(tMax, b);
    if (tMin > tMax) return null;
  }
  return tMin >= 0 ? tMin : tMax >= 0 ? tMax : null;
};

export const installEntityRuntime = (): void => {
  const manager = entityManager as any;
  if (manager[INSTALL_MARK]) return;
  const originalSpawn = manager.spawn.bind(manager);
  const originalDespawn = manager.despawn.bind(manager);
  const originalClear = manager.clear.bind(manager);
  const originalTick = manager.tick.bind(manager);

  manager.spawn = (kind: string, x: number, y: number, z: number, options?: unknown) => {
    const entity = originalSpawn(kind, x, y, z, options) as Entity;
    hash.upsert(entity.id, boundsFor(entity));
    return entity;
  };
  manager.despawn = (id: number, dropItems = true) => {
    hash.remove(id);
    accumulators.delete(id);
    originalDespawn(id, dropItems);
  };
  manager.clear = () => {
    hash.clear();
    accumulators.clear();
    originalClear();
  };

  manager.tick = (dt: number) => {
    const entities = manager.entities as Map<number, Entity>;
    const player = manager.playerPosProvider?.() ?? null;
    const skipped = new Map<number, Entity>();
    let active = 0;
    let reduced = 0;
    let sleeping = 0;
    if (player) {
      for (const [id, entity] of entities) {
        const dx = entity.pos.x - player.x;
        const dy = entity.pos.y - player.y;
        const dz = entity.pos.z - player.z;
        const definition = ENTITY_KINDS[entity.kind] as any;
        const level = entitySimulationLevel({
          distanceSq: dx * dx + dy * dy + dz * dz,
          isBoss: entity.isBoss,
          inCombat: !!manager.inCombat,
          aggro: entity.aggro,
          ridden: entity.ridden,
          passive: !!definition?.passive,
        });
        const interval = reducedTickInterval(level);
        if (interval === 0) {
          accumulators.delete(id);
          active += 1;
          continue;
        }
        const elapsed = (accumulators.get(id) ?? 0) + dt;
        if (elapsed >= interval) {
          accumulators.set(id, elapsed - interval);
          if (level === 'reduced') reduced += 1;
          else sleeping += 1;
          continue;
        }
        accumulators.set(id, elapsed);
        skipped.set(id, entity);
        entities.delete(id);
        if (level === 'reduced') reduced += 1;
        else sleeping += 1;
      }
    } else active = entities.size;

    try {
      originalTick(dt);
    } finally {
      for (const [id, entity] of skipped) if (!entities.has(id)) entities.set(id, entity);
    }
    syncHash(entities);
    entityRuntimeTelemetry.activeEntities = active;
    entityRuntimeTelemetry.reducedEntities = reduced;
    entityRuntimeTelemetry.sleepingEntities = sleeping;
  };

  manager.raycastEntity = (origin: THREE.Vector3, direction: THREE.Vector3, maxDistance = 5) => {
    entityRuntimeTelemetry.spatialQueries += 1;
    const end = origin.clone().addScaledVector(direction, maxDistance);
    hash.queryAabb({
      minX: Math.min(origin.x, end.x) - 2,
      minY: Math.min(origin.y, end.y) - 3,
      minZ: Math.min(origin.z, end.z) - 2,
      maxX: Math.max(origin.x, end.x) + 2,
      maxY: Math.max(origin.y, end.y) + 3,
      maxZ: Math.max(origin.z, end.z) + 2,
    }, rayCandidates);
    let best: Entity | null = null;
    let bestDistance = maxDistance;
    for (const id of rayCandidates) {
      const entity = (manager.entities as Map<number, Entity>).get(id);
      if (!entity) continue;
      const distance = rayAabb(origin, direction, entity);
      if (distance !== null && distance <= bestDistance) {
        best = entity;
        bestDistance = distance;
      }
    }
    return best ? { entity: best, distance: bestDistance } : null;
  };

  manager.getMagneticFieldSources = () => {
    const player = manager.playerPosProvider?.() ?? null;
    if (!player) return [];
    entityRuntimeTelemetry.spatialQueries += 1;
    hash.queryRadius(player.x, player.y, player.z, 64, fieldCandidates);
    const output: any[] = [];
    for (const id of fieldCandidates) {
      const entity = (manager.entities as Map<number, Entity>).get(id);
      if (!entity || entity.hp <= 0 || entity.aggroGrace > 0) continue;
      const definition = ENTITY_KINDS[entity.kind] as any;
      if (!definition?.magneticFieldRange || !definition.magneticFieldForce) continue;
      output.push({
        id: entity.id,
        x: entity.pos.x,
        y: entity.pos.y + entity.height * 0.5,
        z: entity.pos.z,
        polarity: entity.polarity,
        range: definition.magneticFieldRange,
        force: definition.magneticFieldForce,
      });
    }
    return output;
  };

  syncHash(manager.entities as Map<number, Entity>);
  manager[INSTALL_MARK] = true;
  if (typeof window !== 'undefined') {
    (window as any).__ATLAS_ENTITY_TELEMETRY__ = entityRuntimeTelemetry;
  }
};
