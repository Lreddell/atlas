import React, { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { wardenDefeat } from '../systems/boss/wardenDefeat';

// Draws the Magnetic Warden's defeat: while the cinematic runs it owns the
// camera and renders the dying core (the entity itself is already gone) as a
// shuddering shell whose shards drift apart and then blow out. Mounted always;
// idle until wardenDefeat.running.

const CHARGED = 0xb388ff;
const POLARITY_RED = 0xe53935;
const POLARITY_BLUE = 0x1e88e5;
const SHARD_COUNT = 8;

export const WardenDefeatCinematic: React.FC = () => {
    const { camera } = useThree();
    const coreRef = useRef<THREE.Mesh>(null);
    const shellRef = useRef<THREE.Mesh>(null);
    const shardRefs = useRef<(THREE.Mesh | null)[]>([]);

    useFrame(({ clock }) => {
        const active = wardenDefeat.isActive();
        if (active) {
            camera.position.copy(wardenDefeat.camPos);
            camera.quaternion.copy(wardenDefeat.camQuat);
        }

        const show = wardenDefeat.running && wardenDefeat.collapse < 1;
        const core = coreRef.current, shell = shellRef.current;
        const t = clock.elapsedTime;
        const colour = wardenDefeat.polarity > 0 ? POLARITY_RED : POLARITY_BLUE;

        if (core && shell) {
            core.visible = show;
            shell.visible = show;
            if (show) {
                const scale = Math.max(0.001, wardenDefeat.coreScale);
                core.position.copy(wardenDefeat.corePos);
                shell.position.copy(wardenDefeat.corePos);
                core.rotation.set(t * 1.4, t * 2.1, 0);
                shell.rotation.set(-t * 0.9, t * 1.2, 0.4);
                core.scale.setScalar(scale * 0.7);
                shell.scale.setScalar(scale * 1.25);
                const cm = core.material as THREE.MeshBasicMaterial;
                cm.color.setHex(colour);
                cm.opacity = 0.75 + 0.25 * Math.sin(t * 26);
                (shell.material as THREE.MeshBasicMaterial).opacity = 0.35 * (1 - wardenDefeat.collapse);
            }
        }

        // The shell's plates drift outward as the collapse runs.
        shardRefs.current.forEach((shard, index) => {
            if (!shard) return;
            shard.visible = show;
            if (!show) return;
            const a = (index / SHARD_COUNT) * Math.PI * 2 + t * 0.5;
            const spread = 0.9 + wardenDefeat.collapse * 3.4;
            shard.position.set(
                wardenDefeat.corePos.x + Math.cos(a) * spread,
                wardenDefeat.corePos.y + Math.sin(t * 1.3 + index) * 0.4 + wardenDefeat.collapse * 0.9,
                wardenDefeat.corePos.z + Math.sin(a) * spread,
            );
            shard.rotation.set(t * 2 + index, t * 1.6, 0.4);
            shard.scale.setScalar(Math.max(0.001, 1 - wardenDefeat.collapse * 0.8));
            (shard.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - wardenDefeat.collapse);
        });
    });

    return (
        <>
            <mesh ref={shellRef} visible={false}>
                <icosahedronGeometry args={[1, 1]} />
                <meshBasicMaterial color={CHARGED} wireframe transparent opacity={0.35} depthWrite={false} />
            </mesh>
            <mesh ref={coreRef} visible={false}>
                <boxGeometry args={[1, 1, 1]} />
                <meshBasicMaterial color={POLARITY_RED} transparent opacity={0.85} depthWrite={false} />
            </mesh>
            {Array.from({ length: SHARD_COUNT }).map((_, index) => (
                <mesh key={`defeat-shard-${index}`} ref={(m) => { shardRefs.current[index] = m; }} visible={false}>
                    <boxGeometry args={[0.34, 0.7, 0.34]} />
                    <meshBasicMaterial color={CHARGED} transparent opacity={0.8} depthWrite={false} />
                </mesh>
            ))}
        </>
    );
};
