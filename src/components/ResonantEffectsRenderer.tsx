import React, { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { resonantEncounterDirector } from '../systems/entities/ResonantEncounterDirector';
import { gameEvents, type GameEventMap, type ResonantEchoKind } from '../systems/events/GameEvents';
import type { VaultRoutePoint } from '../systems/world/resonantVaults';
import { BellTitanRenderer } from './BellTitanRenderer';
import { ResonantVaultHazardRenderer } from './ResonantVaultHazardRenderer';
import { vaultProjectileSystem } from '../systems/combat/VaultProjectileSystem';

const MAX_ECHO_BOLTS = 128;
const MAX_VAULT_BOLTS = 64;
const MAX_COMBAT_TELEGRAPHS = 24;

const BOLT_AXIS = new THREE.Vector3(1, 0, 0);
const BOLT_DIRECTION = new THREE.Vector3();

interface EchoVisual {
    id: number;
    vaultId: string;
    kind: ResonantEchoKind;
    cells: VaultRoutePoint[];
    phase: 'preview' | 'resolved';
    startedAt: number;
    expiresAt: number;
}

interface PatternBaseVisual {
    vaultId: string;
    cells: VaultRoutePoint[];
}

type PatternStepVisual = GameEventMap['vault:echo-step'] & {
    id: number;
    startedAt: number;
    expiresAt: number;
};

type InputStepVisual = GameEventMap['vault:memory-input'] & {
    id: number;
};

const VaultCombatTelegraphLayer: React.FC = () => {
    const roots = useRef<Array<THREE.Group | null>>([]);
    const arcs = useRef<Array<THREE.Mesh | null>>([]);
    const lanes = useRef<Array<THREE.Mesh | null>>([]);
    const rings = useRef<Array<THREE.Mesh | null>>([]);
    const discs = useRef<Array<THREE.Mesh | null>>([]);
    const arcKeys = useRef<string[]>([]);

    useFrame(() => {
        const states = resonantEncounterDirector.getCombatTelegraphs();
        for (let index = 0; index < MAX_COMBAT_TELEGRAPHS; index += 1) {
            const root = roots.current[index];
            const arc = arcs.current[index];
            const lane = lanes.current[index];
            const ring = rings.current[index];
            const disc = discs.current[index];
            const state = states[index];
            if (!root || !arc || !lane || !ring || !disc || !state) {
                if (root) root.visible = false;
                continue;
            }
            root.visible = true;
            root.position.set(state.x, state.y, state.z);
            root.rotation.set(0, state.yaw, 0);
            arc.visible = state.shape === 'arc';
            lane.visible = state.shape === 'line' || state.shape === 'lane';
            ring.visible = state.shape === 'ring';
            disc.visible = state.shape === 'disc';
            const warning = state.phase === 'warning';
            const color = warning ? 0x9a7a4d : 0x7b3c24;
            const opacity = warning ? 0.3 + state.progress * 0.2 : 0.48;
            if (arc.visible) {
                const arcKey = state.arcRadians.toFixed(3);
                if (arcKeys.current[index] !== arcKey) {
                    const previous = arc.geometry;
                    arc.geometry = new THREE.CircleGeometry(
                        1,
                        32,
                        -Math.PI * 0.5 - state.arcRadians * 0.5,
                        state.arcRadians,
                    );
                    previous.dispose();
                    arcKeys.current[index] = arcKey;
                }
                arc.scale.set(state.range, state.range, 1);
            }
            if (lane.visible) {
                lane.position.set(0, 0, state.range * 0.5);
                lane.scale.set(state.width, 1, state.range);
            }
            if (ring.visible) ring.scale.set(state.range, state.range, 1);
            if (disc.visible) disc.scale.set(state.range, state.range, 1);
            for (const mesh of [arc, lane, ring, disc]) {
                const material = mesh.material as THREE.MeshStandardMaterial;
                material.color.setHex(color);
                material.emissive.setHex(warning ? 0x251b0f : 0x32150d);
                material.emissiveIntensity = warning ? 0.09 : 0.16;
                material.opacity = opacity;
            }
        }
    });

    return <>
        {Array.from({ length: MAX_COMBAT_TELEGRAPHS }, (_, index) => (
            <group key={`vault-combat-telegraph:${index}`} ref={(group) => { roots.current[index] = group; }} visible={false}>
                <mesh ref={(mesh) => { arcs.current[index] = mesh; }} rotation={[-Math.PI / 2, 0, 0]}>
                    <circleGeometry args={[1, 32, 0, Math.PI]} />
                    <meshStandardMaterial color={0x9a7a4d} roughness={0.78} metalness={0.18} emissive={0x251b0f} emissiveIntensity={0.09} transparent opacity={0.35} depthWrite={false} />
                </mesh>
                <mesh ref={(mesh) => { lanes.current[index] = mesh; }}>
                    <boxGeometry args={[1, 0.035, 1]} />
                    <meshStandardMaterial color={0x9a7a4d} roughness={0.78} metalness={0.18} emissive={0x251b0f} emissiveIntensity={0.09} transparent opacity={0.35} depthWrite={false} />
                </mesh>
                <mesh ref={(mesh) => { rings.current[index] = mesh; }} rotation={[-Math.PI / 2, 0, 0]}>
                    <ringGeometry args={[0.84, 1, 40]} />
                    <meshStandardMaterial color={0x9a7a4d} roughness={0.72} metalness={0.24} emissive={0x251b0f} emissiveIntensity={0.09} transparent opacity={0.38} depthWrite={false} side={THREE.DoubleSide} />
                </mesh>
                <mesh ref={(mesh) => { discs.current[index] = mesh; }} rotation={[-Math.PI / 2, 0, 0]}>
                    <circleGeometry args={[1, 40]} />
                    <meshStandardMaterial color={0x9a7a4d} roughness={0.82} metalness={0.14} emissive={0x251b0f} emissiveIntensity={0.09} transparent opacity={0.32} depthWrite={false} side={THREE.DoubleSide} />
                </mesh>
            </group>
        ))}
    </>;
};

function echoSignature(vaultId: string, kind: ResonantEchoKind, cells: VaultRoutePoint[]): string {
    const first = cells[0];
    const last = cells[cells.length - 1];
    return `${vaultId}:${kind}:${cells.length}:${first?.x}:${first?.y}:${first?.z}:${last?.x}:${last?.y}:${last?.z}`;
}

const EchoChip: React.FC<{ visual: EchoVisual; cell: VaultRoutePoint; index: number }> = ({ visual, cell, index }) => {
    const groupRef = useRef<THREE.Group>(null);
    useFrame(() => {
        if (!groupRef.current) return;
        const elapsed = Date.now() - visual.startedAt;
        const delay = visual.phase === 'preview' ? index / Math.max(1, visual.cells.length - 1) * 820 : 0;
        groupRef.current.visible = elapsed >= delay;
    });
    const resolved = visual.phase === 'resolved';
    const previous = visual.cells[Math.max(0, index - 1)] ?? cell;
    const next = visual.cells[Math.min(visual.cells.length - 1, index + 1)] ?? cell;
    const dx = next.x - previous.x;
    const dz = next.z - previous.z;
    const rotation = dx === 0 && dz === 0 ? 0 : -Math.atan2(dz, dx);
    const destination = index === visual.cells.length - 1;
    return (
        <group
            ref={groupRef}
            position={[cell.x + 0.5, cell.y + 1.02, cell.z + 0.5]}
            rotation={[0, rotation, 0]}
            visible={resolved}
        >
            <mesh>
                <boxGeometry args={[destination ? 0.8 : 0.58, 0.025, 0.1]} />
                <meshStandardMaterial color={resolved ? 0xb0a37e : 0x817a69} roughness={0.72} metalness={0.22} emissive={0x282317} emissiveIntensity={resolved ? 0.14 : 0.06} transparent opacity={0.9} depthWrite={false} />
            </mesh>
            <mesh position={[destination ? 0 : 0.2, 0.004, 0]} rotation={[0, Math.PI / 2, 0]}>
                <boxGeometry args={[destination ? 0.8 : 0.38, 0.028, 0.1]} />
                <meshStandardMaterial color={resolved ? 0xb0a37e : 0x817a69} roughness={0.72} metalness={0.22} emissive={0x282317} emissiveIntensity={resolved ? 0.14 : 0.06} transparent opacity={0.9} depthWrite={false} />
            </mesh>
        </group>
    );
};

const PatternFloorGlyph: React.FC<{ cell: VaultRoutePoint; symbol: number }> = ({ cell, symbol }) => {
    const rotation = symbol * Math.PI / 4;
    return (
        <group position={[cell.x + 0.5, cell.y + 0.025, cell.z + 0.5]} rotation={[0, rotation, 0]}>
            <mesh>
                <boxGeometry args={[0.72, 0.035, 0.1]} />
                <meshStandardMaterial color={0x777b70} roughness={0.78} metalness={0.18} emissive={0x171b16} emissiveIntensity={0.08} />
            </mesh>
            <mesh rotation={[0, symbol % 2 === 0 ? Math.PI / 2 : Math.PI / 3, 0]}>
                <boxGeometry args={[symbol < 2 ? 0.42 : 0.58, 0.04, 0.085]} />
                <meshStandardMaterial color={0x9a8c69} roughness={0.66} metalness={0.3} emissive={0x201b10} emissiveIntensity={0.1} />
            </mesh>
        </group>
    );
};

const PatternStepMarker: React.FC<{ visual: PatternStepVisual }> = ({ visual }) => {
    const groupRef = useRef<THREE.Group>(null);
    useFrame(() => {
        if (!groupRef.current) return;
        const fraction = Math.min(1, Math.max(0, (Date.now() - visual.startedAt) / visual.durationMs));
        const settle = Math.min(1, fraction / 0.14);
        const release = Math.min(1, (1 - fraction) / 0.18);
        groupRef.current.scale.setScalar(0.82 + Math.min(settle, release) * 0.18);
    });
    const next = visual.next;
    const trail = next ? Array.from({ length: 4 }, (_, index) => {
        const fraction = (index + 1) / 5;
        return {
            x: visual.x + 0.5 + (next.x - visual.x) * fraction,
            y: visual.y + 1.18 + (next.y - visual.y) * fraction,
            z: visual.z + 0.5 + (next.z - visual.z) * fraction,
        };
    }) : [];
    return (
        <group ref={groupRef}>
            <group position={[visual.x + 0.5, visual.y + 1.025, visual.z + 0.5]} rotation={[0, visual.symbol * Math.PI / 4, 0]}>
                {[0, 1].map((axis) => (
                    <mesh key={axis} rotation={[0, axis * Math.PI / 2, 0]}>
                        <boxGeometry args={[0.92, 0.045, 0.1]} />
                        <meshStandardMaterial
                            color={0xb3a47d}
                            roughness={0.58}
                            metalness={0.34}
                            emissive={0x3a3524}
                            emissiveIntensity={0.22}
                            transparent
                            opacity={0.9}
                            depthWrite={false}
                        />
                    </mesh>
                ))}
                <mesh position={[0, 1.15, 0]}>
                    <boxGeometry args={[0.16, 2.3, 0.16]} />
                    <meshStandardMaterial color={0xc0ad78} roughness={0.54} metalness={0.32} emissive={0x4a3b1e} emissiveIntensity={0.42} transparent opacity={0.8} depthWrite={false} />
                </mesh>
            </group>
            <group position={[visual.x + 0.5, visual.floorY + 0.055, visual.z + 0.5]} rotation={[0, visual.symbol * Math.PI / 4, 0]}>
                <mesh>
                    <boxGeometry args={[0.9, 0.045, 0.13]} />
                    <meshStandardMaterial color={0xaba076} roughness={0.62} metalness={0.28} emissive={0x312c1c} emissiveIntensity={0.2} transparent opacity={0.84} depthWrite={false} />
                </mesh>
            </group>
            {trail.map((point, index) => (
                <mesh key={index} position={[point.x, point.y, point.z]} rotation={[0, index * 0.7, 0]}>
                    <boxGeometry args={[0.07, 0.04, 0.07]} />
                    <meshStandardMaterial color={0x9b947d} roughness={0.84} metalness={0.08} emissive={0x1c1b16} emissiveIntensity={0.08} transparent opacity={0.46} depthWrite={false} />
                </mesh>
            ))}
        </group>
    );
};

const InputStepMarker: React.FC<{ visual: InputStepVisual }> = ({ visual }) => {
    const groupRef = useRef<THREE.Group>(null);
    useFrame(({ clock }) => {
        if (!groupRef.current) return;
        const breathe = 0.96 + Math.sin(clock.elapsedTime * 2.2 + visual.progress) * 0.035;
        groupRef.current.scale.setScalar(breathe);
    });
    return (
        <group ref={groupRef} position={[visual.x + 0.5, visual.y + 1.04, visual.z + 0.5]}>
            <mesh rotation={[-Math.PI / 2, 0, visual.symbol * Math.PI / 4]}>
                <torusGeometry args={[0.43, 0.045, 6, 24]} />
                <meshStandardMaterial
                    color={0xa59770}
                    roughness={0.6}
                    metalness={0.36}
                    emissive={0x2b2617}
                    emissiveIntensity={0.16}
                />
            </mesh>
            <mesh position={[0, 0.025, 0]} rotation={[0, visual.symbol * Math.PI / 4, 0]}>
                <boxGeometry args={[0.64, 0.035, 0.085]} />
                <meshStandardMaterial color={0xb0a47f} roughness={0.64} metalness={0.3} emissive={0x282315} emissiveIntensity={0.12} />
            </mesh>
        </group>
    );
};

const EchoPreviewLayer: React.FC = () => {
    const [visuals, setVisuals] = useState<EchoVisual[]>([]);
    const [patternBases, setPatternBases] = useState<PatternBaseVisual[]>([]);
    const [patternSteps, setPatternSteps] = useState<PatternStepVisual[]>([]);
    const [inputSteps, setInputSteps] = useState<InputStepVisual[]>([]);
    const nextId = useRef(1);

    useEffect(() => {
        const offPreview = gameEvents.on('vault:echo-preview', ({ vaultId, kind, cells, stepDurationMs }) => {
            const now = Date.now();
            if (kind === 'pattern') {
                setPatternBases((current) => [
                    ...current.filter((visual) => visual.vaultId !== vaultId),
                    { vaultId, cells },
                ]);
                return;
            }
            setVisuals((current) => [...current, {
                id: nextId.current++, vaultId, kind, cells, phase: 'preview', startedAt: now, expiresAt: now + stepDurationMs + 250,
            }]);
        });
        const offResolved = gameEvents.on('vault:echo-resolved', ({ vaultId, kind, cells }) => {
            if (kind === 'pattern') return;
            const now = Date.now();
            const signature = echoSignature(vaultId, kind, cells);
            setVisuals((current) => [
                ...current.filter((visual) => echoSignature(visual.vaultId, visual.kind, visual.cells) !== signature),
                { id: nextId.current++, vaultId, kind, cells, phase: 'resolved', startedAt: now, expiresAt: now + 3400 },
            ]);
        });
        const offStep = gameEvents.on('vault:echo-step', (step) => {
            const now = Date.now();
            setPatternSteps((current) => [...current, {
                ...step,
                id: nextId.current++,
                startedAt: now,
                expiresAt: now + step.durationMs,
            }]);
        });
        const offInput = gameEvents.on('vault:memory-input', (step) => {
            if (!step.correct) {
                setInputSteps((current) => current.filter((visual) => visual.vaultId !== step.vaultId));
                return;
            }
            setInputSteps((current) => [
                ...current.filter((visual) => visual.vaultId !== step.vaultId || visual.progress < step.progress),
                { ...step, id: nextId.current++ },
            ]);
        });
        const clearVault = ({ vaultId }: { vaultId: string }) => {
            setVisuals((current) => current.filter((visual) => visual.vaultId !== vaultId));
            setPatternBases((current) => current.filter((visual) => visual.vaultId !== vaultId));
            setPatternSteps((current) => current.filter((visual) => visual.vaultId !== vaultId));
            setInputSteps((current) => current.filter((visual) => visual.vaultId !== vaultId));
        };
        const offLeft = gameEvents.on('vault:left', clearVault);
        const offRoomSolved = gameEvents.on('vault:room-solved', clearVault);
        const cleanup = window.setInterval(() => {
            const now = Date.now();
            setVisuals((current) => current.filter((visual) => visual.expiresAt > now));
            setPatternSteps((current) => current.filter((visual) => visual.expiresAt > now));
        }, 100);
        return () => {
            offPreview();
            offResolved();
            offStep();
            offInput();
            offLeft();
            offRoomSolved();
            window.clearInterval(cleanup);
        };
    }, []);

    return <>
        {visuals.flatMap((visual) => visual.cells.map((cell, index) => (
            <EchoChip key={`${visual.id}:${index}`} visual={visual} cell={cell} index={index} />
        )))}
        {patternBases.flatMap((visual) => visual.cells.map((cell, symbol) => (
            <PatternFloorGlyph key={`${visual.vaultId}:${symbol}`} cell={cell} symbol={symbol} />
        )))}
        {patternSteps.map((visual) => <PatternStepMarker key={visual.id} visual={visual} />)}
        {inputSteps.map((visual) => <InputStepMarker key={visual.id} visual={visual} />)}
    </>;
};

export const ResonantEffectsRenderer: React.FC = () => {
    const boltRefs = useRef<Array<THREE.Mesh | null>>([]);
    const vaultBoltRefs = useRef<Array<THREE.Mesh | null>>([]);

    useFrame(({ clock }) => {
        const bolts = resonantEncounterDirector.getBolts();
        for (let index = 0; index < MAX_ECHO_BOLTS; index += 1) {
            const mesh = boltRefs.current[index];
            if (!mesh) continue;
            const bolt = bolts[index];
            if (!bolt) {
                mesh.visible = false;
                continue;
            }
            mesh.visible = true;
            mesh.position.set(bolt.x, bolt.y, bolt.z);
            mesh.scale.setScalar(bolt.radius * (1 + Math.sin(clock.elapsedTime * 18 + bolt.id) * 0.12));
            mesh.rotation.x += 0.08;
            mesh.rotation.z += 0.11;
        }
        const vaultBolts = vaultProjectileSystem.getRenderState();
        for (let index = 0; index < MAX_VAULT_BOLTS; index += 1) {
            const mesh = vaultBoltRefs.current[index];
            if (!mesh) continue;
            const bolt = vaultBolts[index];
            if (!bolt) {
                mesh.visible = false;
                continue;
            }
            mesh.visible = true;
            mesh.position.set(bolt.x, bolt.y, bolt.z);
            BOLT_DIRECTION.set(bolt.vx, bolt.vy, bolt.vz).normalize();
            mesh.quaternion.setFromUnitVectors(BOLT_AXIS, BOLT_DIRECTION);
        }
    });

    return (
        <>
            <EchoPreviewLayer />
            <VaultCombatTelegraphLayer />
            <BellTitanRenderer />
            <ResonantVaultHazardRenderer />
            {Array.from({ length: MAX_ECHO_BOLTS }, (_, index) => (
                <mesh key={index} ref={(mesh) => { boltRefs.current[index] = mesh; }} visible={false}>
                    <boxGeometry args={[1.6, 0.6, 0.6]} />
                    <meshStandardMaterial color={0x8a8e84} roughness={0.52} metalness={0.38} emissive={0x211f18} emissiveIntensity={0.1} />
                </mesh>
            ))}
            {Array.from({ length: MAX_VAULT_BOLTS }, (_, index) => (
                <mesh key={`vault-bolt:${index}`} ref={(mesh) => { vaultBoltRefs.current[index] = mesh; }} visible={false} castShadow>
                    <boxGeometry args={[0.58, 0.055, 0.055]} />
                    <meshStandardMaterial color={0x8d8b80} roughness={0.52} metalness={0.42} emissive={0x17150f} emissiveIntensity={0.04} />
                </mesh>
            ))}
        </>
    );
};
