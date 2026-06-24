import React, { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { bossSummon } from '../systems/boss/bossSummon';

// Drives the summon cutscene inside the Canvas: while active it owns the camera
// (Player physics is paused, mouse-look disabled) and draws thick humming beams
// from each crystal to the altar; once the beams collapse it draws the swelling
// energy ball (which persists after the camera hands back to the player). Mounted
// always; idle until bossSummon.running.

const BEAM_RED = 0xff5a5a;
const BEAM_BLUE = 0x5aa8ff;
const _dir = new THREE.Vector3();
const _mid = new THREE.Vector3();
const _crystal = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

export const BossCinematic: React.FC = () => {
    const { camera } = useThree();
    const beamRefs = useRef<(THREE.Mesh | null)[]>([]);
    const ballRef = useRef<THREE.Mesh | null>(null);
    const coreRef = useRef<THREE.Mesh | null>(null);
    const wasActive = useRef(false);

    useFrame(() => {
        const active = bossSummon.isActive();
        const now = performance.now();

        if (active) {
            camera.position.copy(bossSummon.camPos);
            camera.quaternion.copy(bossSummon.camQuat);
        } else if (wasActive.current) {
            // Handback: restore the player's original look so they resume facing
            // the altar from their own POV (Player takes the position from here).
            camera.quaternion.copy(bossSummon.playerStartQuat);
        }
        wasActive.current = active;

        // Beams (cinematic camera phase only).
        const progress = active ? bossSummon.beamProgress : 0;
        for (let i = 0; i < 4; i++) {
            const m = beamRefs.current[i];
            if (!m) continue;
            const c = bossSummon.crystals[i];
            if (progress <= 0 || !c) { m.visible = false; continue; }

            _crystal.set(c.x + 0.5, c.y + 0.5, c.z + 0.5);
            _dir.copy(bossSummon.altar).sub(_crystal);
            const fullLen = _dir.length() || 1;
            _dir.multiplyScalar(1 / fullLen);
            const len = fullLen * progress;
            _mid.copy(_crystal).addScaledVector(_dir, len * 0.5);

            m.visible = true;
            m.position.copy(_mid);
            m.quaternion.setFromUnitVectors(_up, _dir);
            m.scale.set(1, len, 1);
            const mat = m.material as THREE.MeshBasicMaterial;
            mat.color.setHex(i % 2 === 0 ? BEAM_RED : BEAM_BLUE);
            mat.opacity = 0.4 + 0.35 * Math.sin(now * 0.02 + i);
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
                    <meshBasicMaterial color={BEAM_RED} transparent opacity={0.6} side={THREE.DoubleSide} depthWrite={false} />
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
