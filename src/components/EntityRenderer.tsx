import React, { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { entityManager } from '../systems/entities/EntityManager';
import { ENTITY_KINDS } from '../systems/entities/Entity';

// Renders all entities owned by the EntityManager. The React list is rebuilt
// only on structural changes (spawn/despawn); per-frame position/flash updates
// are written directly to the meshes via refs to avoid re-renders.
export const EntityRenderer: React.FC = () => {
    const [ids, setIds] = useState<number[]>([]);
    const meshRefs = useRef<Map<number, THREE.Mesh>>(new Map());

    useEffect(() => {
        const sync = () => setIds(entityManager.getEntities().map((e) => e.id));
        sync();
        return entityManager.onStructureChange(sync);
    }, []);

    useFrame(() => {
        const now = Date.now();
        for (const e of entityManager.getEntities()) {
            const mesh = meshRefs.current.get(e.id);
            if (!mesh) continue;
            // Mesh origin is the box center; entity pos.y is the feet.
            mesh.position.set(e.pos.x, e.pos.y + e.height / 2, e.pos.z);
            mesh.rotation.y = e.yaw;
            const mat = mesh.material as THREE.MeshLambertMaterial;
            mat.color.setHex(now < e.hurtUntil ? 0xffffff : ENTITY_KINDS[e.kind].color);
        }
    });

    return (
        <>
            {ids.map((id) => {
                const e = entityManager.getEntity(id);
                if (!e) return null;
                const kind = ENTITY_KINDS[e.kind];
                return (
                    <mesh
                        key={id}
                        ref={(m) => {
                            if (m) meshRefs.current.set(id, m);
                            else meshRefs.current.delete(id);
                        }}
                        castShadow
                    >
                        <boxGeometry args={[kind.width, kind.height, kind.width]} />
                        <meshLambertMaterial color={kind.color} />
                    </mesh>
                );
            })}
        </>
    );
};
