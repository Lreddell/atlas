import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { resonantVaultHazards } from '../systems/world/resonantVaultHazards';

const MAX_SPIKE_BANKS = 4;
const SPIKES_PER_BANK = 10;
const MAX_CRUSHERS = 4;
const MAX_COLLAPSE_WARNINGS = 2;

/** Physical, world-lit hazard geometry. No billboards, crossed planes, or bloom. */
export const ResonantVaultHazardRenderer: React.FC = () => {
    const spikeRefs = useRef<Array<THREE.Mesh | null>>([]);
    const crusherRefs = useRef<Array<THREE.Group | null>>([]);
    const crusherHeadRefs = useRef<Array<THREE.Mesh | null>>([]);
    const collapseRefs = useRef<Array<THREE.Group | null>>([]);

    useFrame(({ clock }) => {
        const states = resonantVaultHazards.getRenderState();
        const spikeBanks = states.filter(({ kind }) => kind === 'spikes');
        for (let bank = 0; bank < MAX_SPIKE_BANKS; bank += 1) {
            const state = spikeBanks[bank];
            for (let index = 0; index < SPIKES_PER_BANK; index += 1) {
                const mesh = spikeRefs.current[bank * SPIKES_PER_BANK + index];
                if (!mesh || !state) {
                    if (mesh) mesh.visible = false;
                    continue;
                }
                const across = (index % 5) - 2;
                const along = index < 5 ? -0.62 : 0.62;
                const height = Math.max(0.06, state.collisionHeight);
                mesh.visible = true;
                mesh.position.set(
                    state.x + state.forwardX * along + state.rightX * across * 0.92,
                    state.y + height * 0.5,
                    state.z + state.forwardZ * along + state.rightZ * across * 0.92,
                );
                mesh.scale.set(1, height, 1);
                mesh.rotation.y = (index & 1) * Math.PI / 4;
                const material = mesh.material as THREE.MeshStandardMaterial;
                material.emissive.setHex(state.tier === 3 ? 0x6b2412 : 0x3d1d0d);
                material.emissiveIntensity = state.telegraphing ? (state.tier === 3 ? 0.28 : 0.22) : 0.03;
            }
        }

        const crushers = states.filter(({ kind }) => kind === 'crusher');
        for (let index = 0; index < MAX_CRUSHERS; index += 1) {
            const group = crusherRefs.current[index];
            const head = crusherHeadRefs.current[index];
            const state = crushers[index];
            if (!group || !head || !state) {
                if (group) group.visible = false;
                continue;
            }
            group.visible = true;
            group.position.set(state.x, state.y, state.z);
            group.rotation.y = Math.atan2(state.forwardX, state.forwardZ);
            head.position.y = state.headY - state.y + 0.48;
            const material = head.material as THREE.MeshStandardMaterial;
            material.emissive.setHex(state.tier === 3 ? 0x6b2412 : 0x3a190b);
            material.emissiveIntensity = state.telegraphing ? (state.tier === 3 ? 0.24 : 0.18) : 0.025;
        }

        const collapses = states.filter(({ kind }) => kind === 'collapse');
        for (let index = 0; index < MAX_COLLAPSE_WARNINGS; index += 1) {
            const group = collapseRefs.current[index];
            const state = collapses[index];
            if (!group || !state) {
                if (group) group.visible = false;
                continue;
            }
            group.visible = state.telegraphing;
            group.position.set(
                state.x + (state.telegraphing ? Math.sin(clock.elapsedTime * 34) * 0.035 : 0),
                state.y + 0.035,
                state.z + (state.telegraphing ? Math.cos(clock.elapsedTime * 29) * 0.035 : 0),
            );
            group.rotation.y = Math.atan2(state.forwardX, state.forwardZ);
        }
    });

    return <>
        {Array.from({ length: MAX_SPIKE_BANKS * SPIKES_PER_BANK }, (_, index) => (
            <mesh key={`vault-spike:${index}`} ref={(mesh) => { spikeRefs.current[index] = mesh; }} visible={false} castShadow receiveShadow>
                <coneGeometry args={[0.34, 1, 4]} />
                <meshStandardMaterial color={0x625f57} roughness={0.62} metalness={0.48} emissive={0x3d1d0d} emissiveIntensity={0.03} />
            </mesh>
        ))}
        {Array.from({ length: MAX_CRUSHERS }, (_, index) => (
            <group key={`vault-crusher:${index}`} ref={(group) => { crusherRefs.current[index] = group; }} visible={false}>
                {[-3, 3].map((x) => (
                    <mesh key={x} position={[x, 2.6, 0]} castShadow receiveShadow>
                        <boxGeometry args={[0.42, 5.2, 0.72]} />
                        <meshStandardMaterial color={0x625e54} roughness={0.76} metalness={0.24} />
                    </mesh>
                ))}
                <mesh position={[0, 5.15, 0]} castShadow receiveShadow>
                    <boxGeometry args={[6.45, 0.42, 0.8]} />
                    <meshStandardMaterial color={0x777064} roughness={0.7} metalness={0.28} />
                </mesh>
                <mesh ref={(mesh) => { crusherHeadRefs.current[index] = mesh; }} castShadow receiveShadow>
                    <boxGeometry args={[5.65, 0.96, 2.8]} />
                    <meshStandardMaterial color={0x6a6255} roughness={0.58} metalness={0.38} emissive={0x3a190b} emissiveIntensity={0.025} />
                </mesh>
            </group>
        ))}
        {Array.from({ length: MAX_COLLAPSE_WARNINGS }, (_, index) => (
            <group key={`vault-collapse:${index}`} ref={(group) => { collapseRefs.current[index] = group; }} visible={false}>
                {Array.from({ length: 5 }, (__, strip) => (
                    <mesh key={strip} position={[strip - 2, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                        <planeGeometry args={[0.72, 3.1]} />
                        <meshStandardMaterial color={0x9b754f} roughness={0.82} metalness={0.12} transparent opacity={0.42} depthWrite={false} />
                    </mesh>
                ))}
            </group>
        ))}
    </>;
};
