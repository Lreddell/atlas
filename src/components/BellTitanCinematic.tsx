import React, { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { bellTitanCinematic } from '../systems/boss/bellTitanCinematic';
import { gameEvents } from '../systems/events/GameEvents';
import { resonantVaultRuntime } from '../systems/world/ResonantVaultRuntime';

const LINK_COUNT = 8;

export const BellTitanCinematic: React.FC = () => {
    const { camera } = useThree();
    const chainRef = useRef<THREE.Group>(null);
    const ringRefs = useRef<Array<THREE.Mesh | null>>([]);

    useEffect(() => {
        const offConfirmed = gameEvents.on('vault:titan-confirmed', ({ vaultId }) => {
            const target = resonantVaultRuntime.beginTitanAwakening(vaultId);
            if (!target) return;
            bellTitanCinematic.begin({
                vaultId,
                target,
                startPosition: camera.position.clone(),
                startQuaternion: camera.quaternion.clone(),
                onSpawn: () => resonantVaultRuntime.spawnConfirmedTitan(vaultId),
            });
        });
        const offLeft = gameEvents.on('vault:left', () => bellTitanCinematic.cancel());
        return () => {
            offConfirmed();
            offLeft();
            bellTitanCinematic.cancel();
        };
    }, [camera]);

    useFrame((_, delta) => {
        bellTitanCinematic.tick(delta);
        if (!bellTitanCinematic.active) {
            if (chainRef.current) chainRef.current.visible = false;
            ringRefs.current.forEach((ring) => { if (ring) ring.visible = false; });
            return;
        }
        camera.position.copy(bellTitanCinematic.cameraPosition);
        camera.quaternion.copy(bellTitanCinematic.cameraQuaternion);
        const target = bellTitanCinematic.target;
        if (chainRef.current) {
            chainRef.current.visible = true;
            chainRef.current.position.set(target.x, target.y + 18 - bellTitanCinematic.chainDrop * 8, target.z);
        }
        ringRefs.current.forEach((ring, index) => {
            if (!ring) return;
            const local = Math.max(0, Math.min(1, bellTitanCinematic.tollPulse * 1.55 - index * 0.22));
            ring.visible = local > 0 && local < 1;
            ring.position.set(target.x, target.y + 0.16 + index * 0.025, target.z);
            ring.scale.setScalar(2 + local * (16 + index * 5));
            const material = ring.material as THREE.MeshStandardMaterial;
            material.opacity = (1 - local) * 0.5;
        });
    });

    return (
        <>
            <group ref={chainRef} visible={false}>
                {Array.from({ length: LINK_COUNT }, (_, index) => (
                    <mesh key={index} position={[0, index * 1.25, 0]} rotation={[0, index % 2 === 0 ? 0 : Math.PI / 2, index % 2 === 0 ? 0.22 : -0.22]} castShadow>
                        <torusGeometry args={[0.52, 0.12, 6, 12]} />
                        <meshStandardMaterial color={0x665a45} roughness={0.58} metalness={0.62} />
                    </mesh>
                ))}
                <mesh position={[0, -1.1, 0]} castShadow>
                    <boxGeometry args={[3.5, 2.4, 3.5]} />
                    <meshStandardMaterial color={0x756444} roughness={0.55} metalness={0.55} side={THREE.DoubleSide} />
                </mesh>
                <mesh position={[0, -2.45, 0]} castShadow>
                    <boxGeometry args={[4.4, 0.55, 4.4]} />
                    <meshStandardMaterial color={0x665432} roughness={0.58} metalness={0.62} />
                </mesh>
                <mesh position={[0, -2.9, 0]} castShadow>
                    <boxGeometry args={[0.6, 1.25, 0.6]} />
                    <meshStandardMaterial color={0x3d3528} roughness={0.68} metalness={0.48} />
                </mesh>
            </group>
            {Array.from({ length: 3 }, (_, index) => (
                <mesh key={index} ref={(mesh) => { ringRefs.current[index] = mesh; }} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
                    <torusGeometry args={[1, 0.045, 6, 48]} />
                    <meshStandardMaterial color={0xa39168} roughness={0.65} metalness={0.34} emissive={0x251f13} emissiveIntensity={0.12} transparent opacity={0} depthWrite={false} />
                </mesh>
            ))}
        </>
    );
};
