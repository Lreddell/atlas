// Heartwood creature renderer: data-driven part models, procedural poses
// from combatAction phase, and readable telegraph decals (ring/lane/arc).
// Telegraphs mirror the universal response grammar: shape + motion carry
// meaning, color only reinforces. Death visuals fold + fade like the vault.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { entityManager } from '../systems/entities/EntityManager';
import type { Entity } from '../systems/entities/Entity';
import { gameEvents } from '../systems/events/GameEvents';
import { isHeartwoodKind } from '../systems/heartwood/heartwoodEntities';
import {
  HEARTWOOD_MODELS,
  HEARTWOOD_MATERIAL_TINTS,
  sampleHeartwoodAnimation,
  heartwoodActionClip,
  type HeartwoodMaterialId,
  type HeartwoodPartDefinition,
} from './heartwoodModels';

type HeartwoodMaterials = Readonly<Record<HeartwoodMaterialId, THREE.MeshLambertMaterial>>;

function useHeartwoodMaterials(): HeartwoodMaterials {
  return useMemo(() => {
    const result = {} as Record<HeartwoodMaterialId, THREE.MeshLambertMaterial>;
    for (const [id, tint] of Object.entries(HEARTWOOD_MATERIAL_TINTS) as [HeartwoodMaterialId, number][]) {
      result[id] = new THREE.MeshLambertMaterial({ color: tint });
    }
    return result;
  }, []);
}

interface PartNodeProps {
  part: HeartwoodPartDefinition;
  childrenByParent: ReadonlyMap<string, readonly HeartwoodPartDefinition[]>;
  materials: HeartwoodMaterials;
  register: (id: string, group: THREE.Group | null) => void;
}

const HeartwoodPartNode: React.FC<PartNodeProps> = ({ part, childrenByParent, materials, register }) => (
  <group
    ref={(group) => register(part.id, group)}
    position={[...part.position]}
  >
    <mesh castShadow receiveShadow material={materials[part.material]}>
      {part.shape === 'cylinder' ? (
        <cylinderGeometry args={[part.size[0], part.size[1], part.size[2], 8]} />
      ) : (
        <boxGeometry args={[...part.size]} />
      )}
    </mesh>
    {(childrenByParent.get(part.id) ?? []).map((child) => (
      <HeartwoodPartNode
        key={child.id}
        part={child}
        childrenByParent={childrenByParent}
        materials={materials}
        register={register}
      />
    ))}
  </group>
);

function normalizeYawDelta(value: number): number {
  let result = value;
  while (result > Math.PI) result -= Math.PI * 2;
  while (result < -Math.PI) result += Math.PI * 2;
  return result;
}

const HeartwoodInstance: React.FC<{ id: number; kind: string }> = ({ id, kind }) => {
  const model = HEARTWOOD_MODELS[kind];
  const materials = useHeartwoodMaterials();
  const rootRef = useRef<THREE.Group>(null);
  const partRefs = useRef(new Map<string, THREE.Group>());
  const lastPosition = useRef<THREE.Vector3 | null>(null);
  const lastYaw = useRef(0);
  const smoothedSpeed = useRef(0);
  const locomotionTime = useRef(0);

  const childrenByParent = useMemo(() => {
    const result = new Map<string, HeartwoodPartDefinition[]>();
    for (const part of model.parts) {
      if (!part.parent) continue;
      const siblings = result.get(part.parent) ?? [];
      siblings.push(part);
      result.set(part.parent, siblings);
    }
    return result;
  }, [model]);
  const roots = useMemo(() => model.parts.filter((part) => !part.parent), [model]);
  const register = (partId: string, group: THREE.Group | null): void => {
    if (group) partRefs.current.set(partId, group);
    else partRefs.current.delete(partId);
  };

  useFrame(({ clock }, delta) => {
    const root = rootRef.current;
    const entity = entityManager.getEntity(id);
    if (!root || !entity || entity.hp <= 0 || !model) {
      if (root) root.visible = false;
      return;
    }
    root.visible = true;
    const previous = lastPosition.current;
    const distance = previous ? Math.hypot(entity.pos.x - previous.x, entity.pos.z - previous.z) : 0;
    if (!previous) lastPosition.current = entity.pos.clone();
    else previous.copy(entity.pos);
    const measuredSpeed = distance > 1.75 || delta <= 0 ? 0 : distance / delta;
    smoothedSpeed.current += (measuredSpeed - smoothedSpeed.current) * Math.min(1, delta * 12);
    locomotionTime.current += delta * Math.max(0.35, Math.min(4, smoothedSpeed.current));
    const yawDelta = normalizeYawDelta(entity.yaw - lastYaw.current);
    lastYaw.current = entity.yaw;

    let clip = heartwoodActionClip(entity.combatAction?.id, entity.combatAction?.phase);
    let progress = entity.combatAction
      ? Math.max(0, Math.min(1, entity.combatAction.elapsed / Math.max(0.001, entity.combatAction.duration)))
      : 0;
    if (!clip && Date.now() < entity.hurtUntil) {
      clip = 'hurt';
      progress = 0.5;
    } else if (!clip && smoothedSpeed.current > 0.12) {
      clip = 'move';
      progress = locomotionTime.current % 1;
    } else if (!clip && Math.abs(yawDelta) > 0.025) {
      clip = 'turn';
      progress = Math.min(1, Math.abs(yawDelta) * 5);
    } else if (!clip) {
      clip = entity.aggro ? 'alert' : 'idle';
      progress = clock.elapsedTime % 1;
    }
    const pose = sampleHeartwoodAnimation(kind, clip, progress, locomotionTime.current + id * 0.17);
    root.position.set(entity.pos.x, entity.pos.y + pose.rootY, entity.pos.z);
    root.rotation.set(pose.lean, entity.yaw, 0);
    const hurtScale = Date.now() < entity.hurtUntil ? 1.03 : 1;
    root.scale.set(model.visualScale[0] * hurtScale, model.visualScale[1] * hurtScale, model.visualScale[2] * hurtScale);
    for (const part of model.parts) {
      const group = partRefs.current.get(part.id);
      if (!group) continue;
      group.position.set(...part.position);
      let rx = 0;
      let rz = 0;
      if (part.leg) rx = Math.sin(locomotionTime.current * model.stride) * 0.55 * Math.min(1, smoothedSpeed.current);
      if (part.arm) rx = -pose.armRaise * 1.1;
      if (part.id === 'head') rz = pose.headTilt;
      group.rotation.set(rx, 0, rz);
    }
    const hurt = Date.now() < entity.hurtUntil;
    for (const [materialId, material] of Object.entries(materials) as [HeartwoodMaterialId, THREE.MeshLambertMaterial][]) {
      material.color.setHex(hurt ? 0xffffff : HEARTWOOD_MATERIAL_TINTS[materialId]);
    }
  });

  if (!model) return null;
  return (
    <group ref={rootRef} visible={false}>
      {roots.map((part) => (
        <HeartwoodPartNode
          key={part.id}
          part={part}
          childrenByParent={childrenByParent}
          materials={materials}
          register={register}
        />
      ))}
    </group>
  );
};

interface DeathVisual {
  key: string;
  kind: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  startedAt: number;
}

const HeartwoodDeathInstance: React.FC<{ visual: DeathVisual }> = ({ visual }) => {
  const model = HEARTWOOD_MODELS[visual.kind];
  const materials = useHeartwoodMaterials();
  const rootRef = useRef<THREE.Group>(null);
  const childrenByParent = useMemo(() => {
    const result = new Map<string, HeartwoodPartDefinition[]>();
    for (const part of model?.parts ?? []) {
      if (!part.parent) continue;
      const siblings = result.get(part.parent) ?? [];
      siblings.push(part);
      result.set(part.parent, siblings);
    }
    return result;
  }, [model]);
  const roots = useMemo(() => (model?.parts ?? []).filter((part) => !part.parent), [model]);
  useFrame(() => {
    const root = rootRef.current;
    if (!root || !model) return;
    const progress = Math.max(0, Math.min(1, (Date.now() - visual.startedAt) / 920));
    const pose = sampleHeartwoodAnimation(visual.kind, 'death', progress, progress);
    root.position.set(visual.x, visual.y + pose.rootY, visual.z);
    root.rotation.set(pose.lean, visual.yaw, 0);
    root.scale.set(...model.visualScale);
  });
  if (!model) return null;
  const noop = () => undefined;
  return (
    <group ref={rootRef}>
      {roots.map((part) => (
        <HeartwoodPartNode
          key={part.id}
          part={part}
          childrenByParent={childrenByParent}
          materials={materials}
          register={noop}
        />
      ))}
    </group>
  );
};

// Telegraph decals for active Heartwood attacks: expanding ring for sweeps
// and writ spikes, a lane for charges, an arc for melee swings. Shape and
// motion carry the meaning; color only reinforces the phase.
interface TelegraphDef {
  shape: 'ring' | 'lane' | 'arc';
  size: number;
  color: string;
}

const TELEGRAPHS: Record<string, TelegraphDef> = {
  furrow_rush: { shape: 'lane', size: 10, color: '#e8b040' },
  side_rake: { shape: 'arc', size: 3, color: '#e8b040' },
  dirt_kick: { shape: 'arc', size: 2.5, color: '#e8b040' },
  pruning_jab: { shape: 'lane', size: 3.5, color: '#e8b040' },
  shield_press: { shape: 'arc', size: 3, color: '#e8b040' },
  thorn_retort: { shape: 'arc', size: 3, color: '#e8b040' },
  root_sweep: { shape: 'ring', size: 6, color: '#7fd08a' },
  leaf_flick: { shape: 'lane', size: 8, color: '#7fd08a' },
  tone_pulse: { shape: 'ring', size: 4, color: '#b8a0e8' },
  resonant_push: { shape: 'arc', size: 4.5, color: '#b8a0e8' },
  channel_hold: { shape: 'ring', size: 12, color: '#b8a0e8' },
  shield_edge: { shape: 'arc', size: 3, color: '#d08050' },
  bailiff_cut: { shape: 'arc', size: 3, color: '#d08050' },
  bailiff_heavy: { shape: 'arc', size: 3.5, color: '#d08050' },
  root_writ: { shape: 'ring', size: 5, color: '#d08050' },
  shoulder_evict: { shape: 'arc', size: 2.5, color: '#d08050' },
};

const HeartwoodTelegraphs: React.FC = () => {
  const [, force] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => force((n) => n + 1), 100);
    return () => window.clearInterval(id);
  }, []);
  const items: { key: string; entity: Entity; def: TelegraphDef; progress: number }[] = [];
  for (const entity of entityManager.getEntities()) {
    if (!isHeartwoodKind(entity.kind) || !entity.combatAction) continue;
    const action = entity.combatAction;
    if (action.id === 'brace' || action.id === 'hold_ground') continue;
    if (action.phase === 'recovery') continue;
    const def = TELEGRAPHS[action.id];
    if (!def) continue;
    items.push({
      key: `${entity.id}:${action.id}`,
      entity,
      def,
      progress: Math.max(0, Math.min(1, action.elapsed / Math.max(0.001, action.duration))),
    });
  }
  return (
    <>
      {items.map(({ key, entity, def, progress }) => {
        const active = entity.combatAction?.phase === 'active';
        const opacity = active ? 0.75 : 0.35 + progress * 0.3;
        const grow = def.shape === 'ring' ? def.size * (active ? 1 : 0.3 + progress * 0.7) : def.size;
        return (
          <group key={key} position={[entity.pos.x, entity.pos.y + 0.12, entity.pos.z]} rotation={[0, entity.yaw, 0]}>
            {def.shape === 'ring' && (
              <mesh rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[grow - 0.5 > 0 ? grow - 0.5 : 0.1, grow, 40]} />
                <meshBasicMaterial color={def.color} transparent opacity={opacity} side={THREE.DoubleSide} depthWrite={false} />
              </mesh>
            )}
            {def.shape === 'lane' && (
              <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, grow / 2]}>
                <planeGeometry args={[2.2, grow]} />
                <meshBasicMaterial color={def.color} transparent opacity={opacity * 0.7} side={THREE.DoubleSide} depthWrite={false} />
              </mesh>
            )}
            {def.shape === 'arc' && (
              <mesh rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[0.5, grow, 24, 1, Math.PI * 0.75, Math.PI * 0.5]} />
                <meshBasicMaterial color={def.color} transparent opacity={opacity} side={THREE.DoubleSide} depthWrite={false} />
              </mesh>
            )}
          </group>
        );
      })}
    </>
  );
};

/** World-lit renderer for all Heartwood creatures (ordinary, elite, passive). */
export const HeartwoodEntityRenderer: React.FC = () => {
  const [entities, setEntities] = useState<Array<{ id: number; kind: string }>>([]);
  const [deaths, setDeaths] = useState<DeathVisual[]>([]);
  const deathTimers = useRef(new Set<number>());
  useEffect(() => {
    const sync = () => setEntities(entityManager.getEntities()
      .filter((entity) => isHeartwoodKind(entity.kind))
      .map((entity) => ({ id: entity.id, kind: entity.kind })));
    sync();
    return entityManager.onStructureChange(sync);
  }, []);
  useEffect(() => {
    const timers = deathTimers.current;
    const off = gameEvents.on('entity:died', ({ entityId, type, x, y, z, yaw }) => {
      if (!isHeartwoodKind(type)) return;
      const startedAt = Date.now();
      const key = `${entityId}:${startedAt}`;
      setDeaths((current) => [...current, { key, kind: type, x, y, z, yaw, startedAt }]);
      const timer = window.setTimeout(() => {
        timers.delete(timer);
        setDeaths((current) => current.filter((visual) => visual.key !== key));
      }, 1100);
      timers.add(timer);
    });
    return () => {
      off();
      for (const timer of timers) window.clearTimeout(timer);
      timers.clear();
    };
  }, []);
  return <>
    {entities.map((entity) => <HeartwoodInstance key={entity.id} {...entity} />)}
    {deaths.map((visual) => <HeartwoodDeathInstance key={visual.key} visual={visual} />)}
    <HeartwoodTelegraphs />
  </>;
};
