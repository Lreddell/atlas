import React, { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { entityManager } from '../systems/entities/EntityManager';
import { ENTITY_KINDS } from '../systems/entities/Entity';

const POLARITY_RED = 0xe53935;
const POLARITY_BLUE = 0x1e88e5;
const PARRY_PURPLE = 0xb388ff;   // deflectable bolt
const PARRY_RETURN = 0x80ffea;   // deflected, player-owned bolt
const PROJECTILE_POOL = 48;
const SHOCKWAVE_POOL = 4;

// Renders all entities owned by the EntityManager. The React list is rebuilt only
// on structural changes (spawn/despawn); per-frame position/flash/shield/projectile
// updates are written directly to meshes via refs to avoid re-renders.
export const EntityRenderer: React.FC = () => {
    const [ids, setIds] = useState<number[]>([]);
    const meshRefs = useRef<Map<number, THREE.Mesh>>(new Map());
    const shieldRefs = useRef<Map<number, THREE.Mesh>>(new Map());
    const auraRefs = useRef<Map<number, THREE.Mesh>>(new Map());
    const slamRefs = useRef<Map<number, THREE.Mesh>>(new Map());
    const projRefs = useRef<(THREE.Mesh | null)[]>([]);
    const ringRefs = useRef<(THREE.Mesh | null)[]>([]);
    // Per-boss polarity-swap flash bookkeeping for the field aura.
    const lastPolarity = useRef<Map<number, number>>(new Map());
    const flashUntil = useRef<Map<number, number>>(new Map());

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
            // Shield bubble: visible only while the boss is shielded. A blocked
            // hit makes it flare so the invulnerability reads clearly.
            const shield = shieldRefs.current.get(e.id);
            if (shield) {
                shield.visible = e.shielded;
                shield.position.set(e.pos.x, e.pos.y + e.height / 2, e.pos.z);
                shield.rotation.y += 0.02;
                const sm = shield.material as THREE.MeshBasicMaterial;
                sm.opacity = now < e.shieldHitUntil ? 0.85 : 0.35;
            }
            // Magnetic field aura: a flat ring at the boss's feet, coloured by
            // polarity, gently pulsing — and flaring out on each polarity swap.
            const aura = auraRefs.current.get(e.id);
            if (aura) {
                // Hidden during the opening shielded/flying phase — the ring would
                // otherwise float in mid-air under the levitating Warden's feet.
                const showField = e.aggro && !!kind.magneticFieldRange && !e.shielded;
                aura.visible = showField;
                if (showField) {
                    const prev = lastPolarity.current.get(e.id);
                    if (prev !== undefined && prev !== e.polarity) flashUntil.current.set(e.id, now + 420);
                    lastPolarity.current.set(e.id, e.polarity);

                    aura.position.set(e.pos.x, e.pos.y + 0.06, e.pos.z);
                    aura.rotation.z += 0.01;
                    const flashT = Math.max(0, (flashUntil.current.get(e.id) ?? 0) - now) / 420;
                    const pulse = 1 + 0.06 * Math.sin(now * 0.005) + flashT * 0.7;
                    aura.scale.setScalar(pulse);
                    const am = aura.material as THREE.MeshBasicMaterial;
                    am.color.setHex(e.polarity > 0 ? POLARITY_RED : POLARITY_BLUE);
                    am.opacity = 0.22 + flashT * 0.4;
                }
            }
            // Slam landing indicator: a ground ring under the boss showing where it
            // will slam. It tracks the boss's x/z (which homes over the player), grows
            // in during the charge, and flashes faster/brighter as the drop nears.
            const slam = slamRefs.current.get(e.id);
            if (slam) {
                const active = e.slamState !== 'none';
                slam.visible = active;
                if (active) {
                    slam.position.set(e.pos.x, e.slamGroundY + 0.08, e.pos.z);
                    const chargeT = kind.slamChargeTime ?? 0.5;
                    const hangT = kind.slamHangTime ?? 0.45;
                    let base = 0.45, flash = 0, grow = 1;
                    if (e.slamState === 'charging') { const t = 1 - Math.max(0, e.slamPhaseTimer) / chargeT; base = 0.15 + 0.25 * t; grow = 0.5 + 0.5 * t; }
                    else if (e.slamState === 'rising') base = 0.45;
                    else if (e.slamState === 'hanging') flash = Math.min(1, 1 - e.slamPhaseTimer / hangT);
                    else flash = 1; // dropping
                    const freq = 0.006 + flash * 0.045;
                    const pulse = 0.5 + 0.5 * Math.sin(now * freq);
                    const sm = slam.material as THREE.MeshBasicMaterial;
                    sm.color.setHex(e.polarity > 0 ? POLARITY_RED : POLARITY_BLUE);
                    sm.opacity = Math.min(0.95, (base + flash * 0.5)) * (0.55 + 0.45 * pulse);
                    slam.scale.setScalar(grow * (1 + flash * 0.12 * pulse));
                }
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
                // Deflectable "parry" bolts glow purple; a deflected (player-owned)
                // bolt streaks bright cyan; ordinary bolts tint by polarity.
                const hex = p.owner === 'player' ? PARRY_RETURN
                    : p.deflectable ? PARRY_PURPLE
                        : (p.polarity > 0 ? POLARITY_RED : POLARITY_BLUE);
                (m.material as THREE.MeshBasicMaterial).color.setHex(hex);
                // Parry bolts read bigger so they're easy to target.
                const s = p.deflectable || p.owner === 'player' ? 1.8 : 1;
                m.scale.setScalar(s);
            } else {
                m.visible = false;
            }
        }
        // Expanding polarity shockwave rings (boss slams).
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
                mat.color.setHex(s.polarity > 0 ? POLARITY_RED : POLARITY_BLUE);
                mat.opacity = 0.75 * (1 - s.radius / s.maxRadius);
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
                const hasField = !!kind.magneticFieldRange;
                const auraR = Math.max(kind.width, 1) * 1.7;
                const hasSlam = !!kind.slamThreshold;
                const slamR = Math.max(kind.width, 2) * 1.7;
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
                        {hasField && (
                            <mesh
                                ref={(m) => {
                                    if (m) { auraRefs.current.set(id, m); }
                                    else { auraRefs.current.delete(id); lastPolarity.current.delete(id); flashUntil.current.delete(id); }
                                }}
                                rotation={[-Math.PI / 2, 0, 0]}
                                visible={false}
                            >
                                <ringGeometry args={[auraR * 0.82, auraR, 40]} />
                                <meshBasicMaterial color={POLARITY_RED} transparent opacity={0.25} side={THREE.DoubleSide} depthWrite={false} />
                            </mesh>
                        )}
                        {hasSlam && (
                            <mesh
                                ref={(m) => { if (m) slamRefs.current.set(id, m); else slamRefs.current.delete(id); }}
                                rotation={[-Math.PI / 2, 0, 0]}
                                visible={false}
                            >
                                <ringGeometry args={[slamR * 0.7, slamR, 48]} />
                                <meshBasicMaterial color={POLARITY_RED} transparent opacity={0.5} side={THREE.DoubleSide} depthWrite={false} />
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
            {Array.from({ length: SHOCKWAVE_POOL }).map((_, i) => (
                <mesh key={`ring-${i}`} ref={(m) => { ringRefs.current[i] = m; }} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
                    <ringGeometry args={[0.86, 1, 48]} />
                    <meshBasicMaterial color={POLARITY_RED} transparent opacity={0.6} side={THREE.DoubleSide} depthWrite={false} />
                </mesh>
            ))}
        </>
    );
};
