import React, { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { entityManager } from '../systems/entities/EntityManager';
import { ENTITY_KINDS } from '../systems/entities/Entity';
import { ResonantVaultEnemyRenderer } from './ResonantVaultEnemyRenderer';
import { MagneticWardenRenderer } from './MagneticWardenRenderer';
import { PlayerModel } from './PlayerModel';
import { BossCompassTracker } from './BossCompassTracker';

const POLARITY_RED = 0xe53935;
const POLARITY_BLUE = 0x1e88e5;
const SLAM_RING = 0xf3ecff;   // the player's own Magnet Slam impact ring
const PROJECTILE_POOL = 64;
const SHOCKWAVE_POOL = 6;
const CUSTOM_RENDERED_ENTITY_KINDS = new Set([
    'vault_guard',
    'vault_marksman',
    'bell_hound',
    'tollkeeper',
    'bell_titan',
    'magnetic_warden',
]);

const BOAT_HULL = 0x8d6e63;
const BOAT_TRIM = 0x6d4c33;
const BOAT_SEAT = 0xc9a877;

// The boat's world model: a wooden hull built from boxes, centered on the
// entity's mid-height origin (the shared position update places every entity
// group at pos + height/2). Forward is -Z, matching entity yaw conventions.
const BoatModel: React.FC = () => {
    const dy = -0.31; // shift children down so the hull floor sits at the entity's feet
    return (
        <group>
            <mesh position={[0, 0.06 + dy, -0.15]} castShadow>
                <boxGeometry args={[1.15, 0.12, 2.3]} />
                <meshLambertMaterial color={BOAT_TRIM} />
            </mesh>
            <mesh position={[-0.58, 0.28 + dy, -0.15]} castShadow>
                <boxGeometry args={[0.14, 0.34, 2.3]} />
                <meshLambertMaterial color={BOAT_HULL} />
            </mesh>
            <mesh position={[0.58, 0.28 + dy, -0.15]} castShadow>
                <boxGeometry args={[0.14, 0.34, 2.3]} />
                <meshLambertMaterial color={BOAT_HULL} />
            </mesh>
            <mesh position={[0, 0.28 + dy, -1.32]} castShadow>
                <boxGeometry args={[1.3, 0.34, 0.16]} />
                <meshLambertMaterial color={BOAT_HULL} />
            </mesh>
            <mesh position={[0, 0.28 + dy, 1.0]} castShadow>
                <boxGeometry args={[1.3, 0.34, 0.16]} />
                <meshLambertMaterial color={BOAT_HULL} />
            </mesh>
            <mesh position={[0, 0.22 + dy, -1.5]} castShadow>
                <boxGeometry args={[0.5, 0.22, 0.24]} />
                <meshLambertMaterial color={BOAT_TRIM} />
            </mesh>
            <mesh position={[0, 0.22 + dy, 0.55]}>
                <boxGeometry args={[1.0, 0.08, 0.35]} />
                <meshLambertMaterial color={BOAT_SEAT} />
            </mesh>
        </group>
    );
};

// Renders all entities owned by the EntityManager. The React list is rebuilt only
// on structural changes (spawn/despawn); per-frame position/flash/projectile
// updates are written directly to meshes via refs to avoid re-renders. Authored
// fights (the Bell Titan, the Magnetic Warden) draw their own bodies.
export const EntityRenderer: React.FC = () => {
    const [ids, setIds] = useState<number[]>([]);
    const meshRefs = useRef<Map<number, THREE.Object3D>>(new Map());
    const projRefs = useRef<(THREE.Mesh | null)[]>([]);
    const ringRefs = useRef<(THREE.Mesh | null)[]>([]);

    useEffect(() => {
        const sync = () => setIds(entityManager.getEntities().map((e) => e.id));
        sync();
        return entityManager.onStructureChange(sync);
    }, []);

    useFrame(() => {
        const now = Date.now();
        for (const e of entityManager.getEntities()) {
            const kind = ENTITY_KINDS[e.kind];
            const mesh = meshRefs.current.get(e.id);
            if (!mesh) continue;
            mesh.position.set(e.pos.x, e.pos.y + e.height / 2, e.pos.z);
            mesh.rotation.y = e.yaw;
            if (kind.passive) {
                // Passive props (boats) are multi-mesh groups: a hit reads as
                // a quick scale pop instead of a material flash.
                mesh.scale.setScalar(now < e.hurtUntil ? 1.07 : 1);
            } else {
                const mat = (mesh as THREE.Mesh).material as THREE.MeshLambertMaterial;
                mat.color.setHex(now < e.hurtUntil ? 0xffffff : kind.color);
            }
        }
        // Projectile pool: bolts tint by the polarity they were fired with,
        // spiral bolts read small and quick, volley bolts chunky.
        const projectiles = entityManager.getProjectiles();
        for (let i = 0; i < PROJECTILE_POOL; i++) {
            const m = projRefs.current[i];
            if (!m) continue;
            const p = projectiles[i];
            if (p) {
                m.visible = true;
                m.position.set(p.pos.x, p.pos.y, p.pos.z);
                m.rotation.set(now * 0.004, now * 0.006, 0);
                (m.material as THREE.MeshBasicMaterial).color.setHex(p.polarity > 0 ? POLARITY_RED : POLARITY_BLUE);
                // A bolt bounced off the player's boots is spent: it shrinks away.
                m.scale.setScalar((p.kind === 'spiral' ? 0.62 : 1) * (p.bounced ? 0.5 : 1));
            } else {
                m.visible = false;
            }
        }
        // Expanding ground rings: polarity rings from the boss, the player's
        // own pale Magnet Slam ring.
        const shockwaves = entityManager.getShockwaves();
        for (let i = 0; i < SHOCKWAVE_POOL; i++) {
            const m = ringRefs.current[i];
            if (!m) continue;
            const s = shockwaves[i];
            if (s && s.radius > 0) {
                m.visible = true;
                m.position.set(s.x, s.y + 0.1, s.z);
                // A unit ring (inner 0.86, outer 1.0) scaled to the current radius.
                m.scale.set(s.radius, s.radius, s.radius);
                const mat = m.material as THREE.MeshBasicMaterial;
                mat.color.setHex(s.kind === 'slam' ? SLAM_RING : (s.polarity > 0 ? POLARITY_RED : POLARITY_BLUE));
                mat.opacity = (s.kind === 'slam' ? 0.85 : 0.75) * (1 - s.radius / s.maxRadius);
            } else {
                m.visible = false;
            }
        }
    });

    return (
        <>
            <ResonantVaultEnemyRenderer />
            <MagneticWardenRenderer />
            <PlayerModel />
            <BossCompassTracker />
            {ids.map((id) => {
                const e = entityManager.getEntity(id);
                if (!e) return null;
                const kind = ENTITY_KINDS[e.kind];
                const customRendered = CUSTOM_RENDERED_ENTITY_KINDS.has(e.kind);
                if (customRendered) return null;
                return kind.id === 'boat' ? (
                    <group key={id} ref={(m) => { if (m) meshRefs.current.set(id, m); else meshRefs.current.delete(id); }}>
                        <BoatModel />
                    </group>
                ) : (
                    <mesh
                        key={id}
                        ref={(m) => { if (m) meshRefs.current.set(id, m); else meshRefs.current.delete(id); }}
                        castShadow
                    >
                        <boxGeometry args={[kind.width, kind.height, kind.width]} />
                        <meshLambertMaterial color={kind.color} />
                    </mesh>
                );
            })}
            {Array.from({ length: PROJECTILE_POOL }).map((_, i) => (
                <mesh key={`proj-${i}`} ref={(m) => { projRefs.current[i] = m; }} visible={false}>
                    <boxGeometry args={[0.45, 0.45, 0.45]} />
                    <meshBasicMaterial color={POLARITY_RED} />
                </mesh>
            ))}
            {Array.from({ length: SHOCKWAVE_POOL }).map((_, i) => (
                <mesh key={`ring-${i}`} ref={(m) => { ringRefs.current[i] = m; }} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
                    <ringGeometry args={[0.86, 1, 48]} />
                    <meshBasicMaterial color={POLARITY_RED} transparent opacity={0.6} side={THREE.DoubleSide} depthWrite={false} />
                </mesh>
            ))}
        </>
    );
};
