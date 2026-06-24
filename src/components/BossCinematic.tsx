import React, { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { bossSummon } from '../systems/boss/bossSummon';

// Drives the summon cutscene inside the Canvas: while active it owns the camera
// (Player physics is paused, mouse-look disabled) and draws thick humming beams
// that grow from each shield crystal to the altar. Mounted always; it does
// nothing until bossSummon.isActive().

const BEAM_RED = 0xff5a5a;
const BEAM_BLUE = 0x5aa8ff;
const _dir = new THREE.Vector3();
const _mid = new THREE.Vector3();
const _crystal = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

export const BossCinematic: React.FC = () => {
    const { camera } = useThree();
    const beamRefs = useRef<(THREE.Mesh | null)[]>([]);

    useFrame(() => {
        const active = bossSummon.isActive();

        if (active) {
            camera.position.copy(bossSummon.camPos);
            camera.quaternion.copy(bossSummon.camQuat);
        }

        const progress = active ? bossSummon.beamProgress : 0;
        for (let i = 0; i < 4; i++) {
            const m = beamRefs.current[i];
            if (!m) continue;
            const c = bossSummon.crystals[i];
            if (!active || progress <= 0 || !c) { m.visible = false; continue; }

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
            mat.opacity = 0.35 + 0.35 * Math.sin(performance.now() * 0.02 + i);
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
        </>
    );
};
