import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { entityManager } from '../systems/entities/EntityManager';
import type { Entity } from '../systems/entities/Entity';
import {
    isVaultEnemyKind,
    type VaultEnemyActionId,
    type VaultEnemyKind,
} from '../systems/entities/resonantVaultEnemies';
import { gameEvents } from '../systems/events/GameEvents';
import { RESONANT_ENTITY_MATERIAL_UVS } from '../systems/textures/resonantEntityTexturePixels';
import {
    VAULT_ENEMY_MODELS,
    sampleVaultEnemyAnimation,
    type VaultEnemyAnimationClip,
    type VaultEnemyMaterialId,
    type VaultEnemyPartDefinition,
} from './resonantVaultEnemyModels';

const MATERIAL_TINTS: Readonly<Record<VaultEnemyMaterialId, number>> = {
    stone: 0xf1f0e9,
    darkStone: 0xe8e8e2,
    bronze: 0xf0eadb,
    cloth: 0xe9e6dd,
    bell: 0xfff1d2,
    accent: 0xe8ddbd,
};

type VaultEnemyMaterials = Readonly<Record<VaultEnemyMaterialId, THREE.MeshLambertMaterial>>;

function useVaultEnemyMaterials(texturePath: string): VaultEnemyMaterials {
    const source = useTexture(texturePath);
    const materials = useMemo(() => {
        const result = {} as Record<VaultEnemyMaterialId, THREE.MeshLambertMaterial>;
        for (const materialId of Object.keys(RESONANT_ENTITY_MATERIAL_UVS) as VaultEnemyMaterialId[]) {
            const rect = RESONANT_ENTITY_MATERIAL_UVS[materialId];
            const map = source.clone();
            map.colorSpace = THREE.SRGBColorSpace;
            map.magFilter = THREE.NearestFilter;
            map.minFilter = THREE.NearestFilter;
            map.generateMipmaps = false;
            map.wrapS = THREE.ClampToEdgeWrapping;
            map.wrapT = THREE.ClampToEdgeWrapping;
            map.offset.set(rect.u, rect.v);
            map.repeat.set(rect.width, rect.height);
            map.needsUpdate = true;
            const material = new THREE.MeshLambertMaterial({ map, color: MATERIAL_TINTS[materialId] });
            if (materialId === 'accent') {
                material.emissive.setHex(0x2b2619);
                material.emissiveIntensity = 0.14;
            }
            result[materialId] = material;
        }
        return result;
    }, [source]);

    useEffect(() => () => {
        for (const material of Object.values(materials)) {
            material.map?.dispose();
            material.dispose();
        }
    }, [materials]);
    return materials;
}

interface PartNodeProps {
    part: VaultEnemyPartDefinition;
    childrenByParent: ReadonlyMap<string, readonly VaultEnemyPartDefinition[]>;
    materials: VaultEnemyMaterials;
    register: (id: string, group: THREE.Group | null) => void;
}

const VaultEnemyPartNode: React.FC<PartNodeProps> = ({ part, childrenByParent, materials, register }) => (
    <group
        ref={(group) => register(part.id, group)}
        position={[...part.position]}
        rotation={part.rotation ? [...part.rotation] : undefined}
    >
        <mesh position={[...part.meshOffset]} castShadow receiveShadow material={materials[part.material]}>
            {part.shape === 'cylinder' ? (
                <cylinderGeometry args={[part.size[0], part.size[1], part.size[2], part.segments ?? 8]} />
            ) : (
                <boxGeometry args={[...part.size]} />
            )}
        </mesh>
        {(childrenByParent.get(part.id) ?? []).map((child) => (
            <VaultEnemyPartNode
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

function actionClip(entity: Entity): VaultEnemyAnimationClip | null {
    const action = entity.combatAction;
    if (!action) return null;
    if (action.id === 'pulse_stagger' || action.id === 'reform') return 'stagger';
    if (action.id === 'guard_block') return 'block';
    if (action.phase === 'anticipation') return 'anticipation';
    if (action.phase === 'active') return 'attack';
    return 'recovery';
}

const VaultEnemyInstance: React.FC<{ id: number; kind: VaultEnemyKind }> = ({ id, kind }) => {
    const model = VAULT_ENEMY_MODELS[kind];
    const materials = useVaultEnemyMaterials(model.texture);
    const rootRef = useRef<THREE.Group>(null);
    const partRefs = useRef(new Map<string, THREE.Group>());
    const lastPosition = useRef<THREE.Vector3 | null>(null);
    const lastYaw = useRef(0);
    const smoothedSpeed = useRef(0);
    const locomotionTime = useRef(0);
    const wasActionActive = useRef(false);
    const forcedAnticipationFrames = useRef(0);

    const childrenByParent = useMemo(() => {
        const result = new Map<string, VaultEnemyPartDefinition[]>();
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
        if (!root || !entity || entity.hp <= 0) {
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
        const currentAction = !!entity.combatAction;
        if (currentAction && !wasActionActive.current) forcedAnticipationFrames.current = 1;
        wasActionActive.current = currentAction;

        let clip = actionClip(entity);
        let progress = entity.combatAction
            ? Math.max(0, Math.min(1, entity.combatAction.elapsed / Math.max(0.001, entity.combatAction.duration)))
            : 0;
        if (forcedAnticipationFrames.current > 0 && clip !== 'stagger') {
            clip = 'anticipation';
            progress = Math.max(0.72, progress);
            forcedAnticipationFrames.current -= 1;
        } else if (!clip && Date.now() < entity.hurtUntil) {
            clip = 'hurt';
            progress = 0.5;
        } else if (!clip && smoothedSpeed.current > 0.12) {
            clip = 'move';
            progress = (locomotionTime.current % 1);
        } else if (!clip && Math.abs(yawDelta) > 0.025) {
            clip = 'turn';
            progress = Math.min(1, Math.abs(yawDelta) * 5);
        } else if (!clip) {
            clip = entity.aggro ? 'alert' : 'idle';
            progress = (clock.elapsedTime % 1);
        }

        const actionId = entity.combatAction?.id as VaultEnemyActionId | undefined;
        const pose = sampleVaultEnemyAnimation(kind, clip, progress, locomotionTime.current + id * 0.17, actionId);
        root.position.set(
            entity.pos.x + pose.rootPosition[0],
            entity.pos.y + pose.rootPosition[1],
            entity.pos.z + pose.rootPosition[2],
        );
        root.rotation.set(pose.rootRotation[0], entity.yaw + pose.rootRotation[1], pose.rootRotation[2]);
        const hurtScale = Date.now() < entity.hurtUntil ? 1.025 : 1;
        root.scale.set(
            model.visualScale[0] * hurtScale,
            model.visualScale[1] * hurtScale,
            model.visualScale[2] * hurtScale,
        );

        for (const part of model.parts) {
            const group = partRefs.current.get(part.id);
            if (!group) continue;
            const position = pose.partPositions[part.id] ?? part.position;
            const rotation = pose.partRotations[part.id] ?? part.rotation ?? [0, 0, 0];
            const scale = pose.partScales[part.id] ?? [1, 1, 1];
            group.position.set(...position);
            group.rotation.set(...rotation);
            group.scale.set(...scale);
        }
        const hurt = Date.now() < entity.hurtUntil;
        for (const [materialId, material] of Object.entries(materials) as [VaultEnemyMaterialId, THREE.MeshLambertMaterial][]) {
            material.color.setHex(hurt ? 0xffffff : MATERIAL_TINTS[materialId]);
        }
    });

    return (
        <group ref={rootRef} visible={false}>
            {roots.map((part) => (
                <VaultEnemyPartNode
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

interface VaultEnemyDeathVisual {
    key: string;
    kind: VaultEnemyKind;
    x: number;
    y: number;
    z: number;
    yaw: number;
    startedAt: number;
}

const VaultEnemyDeathInstance: React.FC<{ visual: VaultEnemyDeathVisual }> = ({ visual }) => {
    const model = VAULT_ENEMY_MODELS[visual.kind];
    const materials = useVaultEnemyMaterials(model.texture);
    const rootRef = useRef<THREE.Group>(null);
    const partRefs = useRef(new Map<string, THREE.Group>());
    const childrenByParent = useMemo(() => {
        const result = new Map<string, VaultEnemyPartDefinition[]>();
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

    useFrame(() => {
        const root = rootRef.current;
        if (!root) return;
        const progress = Math.max(0, Math.min(1, (Date.now() - visual.startedAt) / 920));
        const pose = sampleVaultEnemyAnimation(visual.kind, 'death', progress, progress);
        root.position.set(
            visual.x + pose.rootPosition[0],
            visual.y + pose.rootPosition[1],
            visual.z + pose.rootPosition[2],
        );
        root.rotation.set(pose.rootRotation[0], visual.yaw + pose.rootRotation[1], pose.rootRotation[2]);
        root.scale.set(...model.visualScale);
        for (const part of model.parts) {
            const group = partRefs.current.get(part.id);
            if (!group) continue;
            const position = pose.partPositions[part.id] ?? part.position;
            const rotation = pose.partRotations[part.id] ?? part.rotation ?? [0, 0, 0];
            const scale = pose.partScales[part.id] ?? [1, 1, 1];
            group.position.set(...position);
            group.rotation.set(...rotation);
            group.scale.set(...scale);
        }
    });

    return (
        <group ref={rootRef}>
            {roots.map((part) => (
                <VaultEnemyPartNode
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

/** Dedicated world-lit renderer for the four definitive Resonant Vault enemies. */
export const ResonantVaultEnemyRenderer: React.FC = () => {
    const [entities, setEntities] = useState<Array<{ id: number; kind: VaultEnemyKind }>>([]);
    const [deaths, setDeaths] = useState<VaultEnemyDeathVisual[]>([]);
    const deathTimers = useRef<Set<number>>(new Set());
    useEffect(() => {
        const sync = () => setEntities(entityManager.getEntities()
            .filter((entity): entity is Entity & { kind: VaultEnemyKind } => isVaultEnemyKind(entity.kind))
            .map((entity) => ({ id: entity.id, kind: entity.kind })));
        sync();
        return entityManager.onStructureChange(sync);
    }, []);
    useEffect(() => {
        const timers = deathTimers.current;
        const off = gameEvents.on('entity:died', ({ entityId, type, x, y, z, yaw }) => {
            if (!isVaultEnemyKind(type)) return;
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
        {entities.map((entity) => <VaultEnemyInstance key={entity.id} {...entity} />)}
        {deaths.map((visual) => <VaultEnemyDeathInstance key={visual.key} visual={visual} />)}
    </>;
};
