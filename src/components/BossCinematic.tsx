import React, { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { bossSummon } from '../systems/boss/bossSummon';
import { entityManager } from '../systems/entities/EntityManager';
import { worldManager } from '../systems/WorldManager';
import { BlockType } from '../types';
import { particleFx, FX_CHARGED } from '../systems/fx/particleFx';

// Drives the summon cutscene inside the Canvas: while active it owns the camera
// (Player physics is paused, mouse-look disabled) and draws thick humming beams
// from each crystal to the altar; once the beams collapse it draws the swelling
// energy ball (which persists after the camera hands back to the player). Mounted
// always; idle until bossSummon.running.

const SHIELD_BEAM = 0xc060ff;   // all summon/shield beams are this purple (consistent)
const _dir = new THREE.Vector3();
const _mid = new THREE.Vector3();
const _crystal = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

// Orient/scale a unit-height cylinder mesh as a beam from (fx,fy,fz) to (tx,ty,tz),
// drawn up to `prog` (0..1) of its length.
function drawBeam(
    m: THREE.Mesh, fx: number, fy: number, fz: number, tx: number, ty: number, tz: number,
    prog: number, color: number, opacity: number,
): void {
    _crystal.set(fx, fy, fz);
    _dir.set(tx - fx, ty - fy, tz - fz);
    const fullLen = _dir.length() || 1;
    _dir.multiplyScalar(1 / fullLen);
    const len = fullLen * prog;
    _mid.copy(_crystal).addScaledVector(_dir, len * 0.5);
    m.visible = true;
    m.position.copy(_mid);
    m.quaternion.setFromUnitVectors(_up, _dir);
    m.scale.set(1, len, 1);
    const mat = m.material as THREE.MeshBasicMaterial;
    mat.color.setHex(color);
    mat.opacity = opacity;
}

export const BossCinematic: React.FC = () => {
    const { camera } = useThree();
    const beamRefs = useRef<(THREE.Mesh | null)[]>([]);
    const ballRef = useRef<THREE.Mesh | null>(null);
    const coreRef = useRef<THREE.Mesh | null>(null);
    const wasActive = useRef(false);
    // Per-crystal beam bookkeeping for the fight phase (ender-dragon shield beams).
    const wasStanding = useRef<boolean[]>([false, false, false, false]);
    const brokenAt = useRef<number[]>([0, 0, 0, 0]);

    useFrame(() => {
        const active = bossSummon.isActive();
        const now = performance.now();

        if (active) {
            camera.position.copy(bossSummon.camPos);
            camera.quaternion.copy(bossSummon.camQuat);
        } else if (wasActive.current) {
            // Handback: leave the camera looking at the energy ball from the return
            // spot (App teleports the player there + sets matching look on this edge).
            camera.quaternion.copy(bossSummon.returnQuat);
        }
        wasActive.current = active;

        // Beams: during the cutscene they feed the energy ball (crystal → altar).
        // Once the boss spawns they re-target the BOSS and track it — ender-dragon
        // style — each beam lasting until its crystal is destroyed, then dissipating
        // with a burst (and a sound, played in App on crystal:broken).
        const cutsceneProg = bossSummon.beamProgress;
        const boss = cutsceneProg <= 0
            ? entityManager.getEntities().find((e) => e.isBoss && (e.shieldCrystalPositions?.length ?? 0) > 0)
            : undefined;

        for (let i = 0; i < 4; i++) {
            const m = beamRefs.current[i];
            if (!m) continue;

            // Cutscene: crystal → swelling ball at the altar.
            if (cutsceneProg > 0 && bossSummon.crystals[i]) {
                const c = bossSummon.crystals[i];
                drawBeam(m, c.x + 0.5, c.y + 0.5, c.z + 0.5,
                    bossSummon.altar.x, bossSummon.altar.y, bossSummon.altar.z,
                    cutsceneProg, SHIELD_BEAM, 0.4 + 0.35 * Math.sin(now * 0.02 + i));
                wasStanding.current[i] = true;
                continue;
            }

            const c = boss?.shieldCrystalPositions?.[i];
            const standing = !!c && !!boss?.shielded
                && worldManager.getBlock(c.x, c.y, c.z, false) === BlockType.MAGNETIC_SHIELD_CRYSTAL;

            // Fight: crystal → boss (tracking). Beam lasts while its crystal stands.
            if (standing && c && boss) {
                drawBeam(m, c.x + 0.5, c.y + 0.5, c.z + 0.5,
                    boss.pos.x, boss.pos.y + boss.height * 0.5, boss.pos.z,
                    1, SHIELD_BEAM, 0.45 + 0.3 * Math.sin(now * 0.03 + i));
                wasStanding.current[i] = true;
                continue;
            }

            // The crystal just shattered this frame → erupt, then fade the beam out.
            if (wasStanding.current[i] && c && boss) {
                wasStanding.current[i] = false;
                brokenAt.current[i] = now;
                particleFx.burst({
                    x: c.x + 0.5, y: c.y + 0.5, z: c.z + 0.5, color: FX_CHARGED, color2: [1, 1, 1],
                    count: 44, speed: 10, upBias: 4, spread: 1, size: 0.3, life: 0.9, gravity: 5, drag: 1,
                });
            }

            const since = now - brokenAt.current[i];
            if (c && boss && brokenAt.current[i] > 0 && since < 350) {
                drawBeam(m, c.x + 0.5, c.y + 0.5, c.z + 0.5,
                    boss.pos.x, boss.pos.y + boss.height * 0.5, boss.pos.z,
                    1, SHIELD_BEAM, 0.6 * (1 - since / 350));
            } else {
                m.visible = false;
            }
        }

        // Energy ball at the altar (persists into the player-controlled grace window).
        const ball = ballRef.current, core = coreRef.current;
        const s = bossSummon.ballScale;
        if (ball && core) {
            if (s > 0.001) {
                const r = s * bossSummon.ballMaxRadius;
                const pulse = 1 + 0.08 * Math.sin(now * 0.012);
                ball.visible = true; core.visible = true;
                ball.position.copy(bossSummon.altar);
                core.position.copy(bossSummon.altar);
                ball.scale.setScalar(r * pulse);
                core.scale.setScalar(r * 0.55);
                ball.rotation.y += 0.03; ball.rotation.x += 0.017;
                (ball.material as THREE.MeshBasicMaterial).opacity = 0.18 + 0.22 * s;
                (core.material as THREE.MeshBasicMaterial).opacity = 0.55 + 0.35 * Math.sin(now * 0.02);
            } else {
                ball.visible = false; core.visible = false;
            }
        }
    });

    return (
        <>
            {[0, 1, 2, 3].map((i) => (
                <mesh key={`beam-${i}`} ref={(m) => { beamRefs.current[i] = m; }} visible={false}>
                    {/* Unit-height cylinder (scaled along Y to the beam length). */}
                    <cylinderGeometry args={[0.32, 0.32, 1, 10, 1, true]} />
                    <meshBasicMaterial color={SHIELD_BEAM} transparent opacity={0.6} side={THREE.DoubleSide} depthWrite={false} />
                </mesh>
            ))}
            {/* Energy ball: a translucent outer shell + a bright pulsing core. */}
            <mesh ref={ballRef} visible={false}>
                <icosahedronGeometry args={[1, 1]} />
                <meshBasicMaterial color={0xb388ff} transparent opacity={0.3} wireframe depthWrite={false} />
            </mesh>
            <mesh ref={coreRef} visible={false}>
                <sphereGeometry args={[1, 16, 12]} />
                <meshBasicMaterial color={0xe6d8ff} transparent opacity={0.7} depthWrite={false} />
            </mesh>
        </>
    );
};
