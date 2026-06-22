import React, { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { entityManager } from '../systems/entities/EntityManager';
import { ENTITY_KINDS } from '../systems/entities/Entity';

const POLARITY_RED = 0xe53935;
const POLARITY_BLUE = 0x1e88e5;
const PROJECTILE_POOL = 36;

// Renders all entities owned by the EntityManager. The React list is rebuilt only
// on structural changes (spawn/despawn); per-frame position/flash/shield/projectile
// updates are written directly to meshes via refs to avoid re-renders.
export const EntityRenderer: React.FC = () => {
    const [ids, setIds] = useState<number[]>([]);
    const meshRefs = useRef<Map<number, THREE.Mesh>>(new Map());
    const shieldRefs = useRef<Map<number, THREE.Mesh>>(new Map());
    const projRefs = useRef<(THREE.Mesh | null)[]>([]);

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
            if (mesh) {
                mesh.position.set(e.pos.x, e.pos.y + e.height / 2, e.pos.z);
                mesh.rotation.y = e.yaw;
                const mat = mesh.material as THREE.MeshLambertMaterial;
                // Polarity bosses tint red/blue with their current polarity.
                const base = kind.polaritySwapInterval ? (e.polarity > 0 ? POLARITY_RED : POLARITY_BLUE) : kind.color;
                mat.color.setHex(now < e.hurtUntil ? 0xffffff : base);
            }
            // Shield bubble: visible only while the boss is shielded.
            const shield = shieldRefs.current.get(e.id);
            if (shield) {
                shield.visible = e.shielded;
                shield.position.set(e.pos.x, e.pos.y + e.height / 2, e.pos.z);
                shield.rotation.y += 0.02;
            }
        }
        // Projectile pool.
        const projectiles = entityManager.getProjectiles();
        for (let i = 0; i < PROJECTILE_POOL; i++) {
            const m = projRefs.current[i];
            if (!m) continue;
            const p = projectiles[i];
            if (p) {
                m.visible = true;
                m.position.set(p.pos.x, p.pos.y, p.pos.z);
                (m.material as THREE.MeshBasicMaterial).color.setHex(p.polarity > 0 ? POLARITY_RED : POLARITY_BLUE);
            } else {
                m.visible = false;
            }
        }
    });

    return (
        <>
            {ids.map((id) => {
                const e = entityManager.getEntity(id);
                if (!e) return null;
                const kind = ENTITY_KINDS[e.kind];
                const isShieldBoss = (kind.shieldCrystals ?? 0) > 0;
                return (
                    <React.Fragment key={id}>
                        <mesh
                            ref={(m) => { if (m) meshRefs.current.set(id, m); else meshRefs.current.delete(id); }}
                            castShadow
                        >
                            <boxGeometry args={[kind.width, kind.height, kind.width]} />
                            <meshLambertMaterial color={kind.color} />
                        </mesh>
                        {isShieldBoss && (
                            <mesh ref={(m) => { if (m) shieldRefs.current.set(id, m); else shieldRefs.current.delete(id); }}>
                                <sphereGeometry args={[Math.max(kind.width, kind.height) * 0.62, 16, 12]} />
                                <meshBasicMaterial color={0x9c6bff} wireframe transparent opacity={0.35} />
                            </mesh>
                        )}
                    </React.Fragment>
                );
            })}
            {Array.from({ length: PROJECTILE_POOL }).map((_, i) => (
                <mesh key={`proj-${i}`} ref={(m) => { projRefs.current[i] = m; }} visible={false}>
                    <boxGeometry args={[0.45, 0.45, 0.45]} />
                    <meshBasicMaterial color={POLARITY_RED} />
                </mesh>
            ))}
        </>
    );
};
