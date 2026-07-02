import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// First-person boat hull, drawn while riding. Follows the player's feet and the
// camera yaw so the bow always points where you steer; a gentle roll/bob sells
// the floating feel without a physics-driven mesh.
interface BoatRigProps {
    playerPosRef: React.MutableRefObject<THREE.Vector3>;
}

const HULL = '#8d6e63';
const TRIM = '#6d4c33';
const SEAT = '#c9a877';

export const BoatRig: React.FC<BoatRigProps> = ({ playerPosRef }) => {
    const group = useRef<THREE.Group>(null);

    useFrame(({ camera, clock }) => {
        const g = group.current;
        if (!g) return;
        const p = playerPosRef.current;
        const t = clock.elapsedTime;
        g.position.set(p.x, p.y + 0.05 + Math.sin(t * 1.7) * 0.03, p.z);
        g.rotation.set(0, camera.rotation.y, Math.sin(t * 1.3) * 0.02, 'YXZ');
    });

    return (
        <group ref={group}>
            {/* hull floor */}
            <mesh position={[0, 0.06, -0.15]}>
                <boxGeometry args={[1.15, 0.12, 2.3]} />
                <meshLambertMaterial color={TRIM} />
            </mesh>
            {/* side walls */}
            <mesh position={[-0.58, 0.28, -0.15]}>
                <boxGeometry args={[0.14, 0.34, 2.3]} />
                <meshLambertMaterial color={HULL} />
            </mesh>
            <mesh position={[0.58, 0.28, -0.15]}>
                <boxGeometry args={[0.14, 0.34, 2.3]} />
                <meshLambertMaterial color={HULL} />
            </mesh>
            {/* bow (forward, -Z) and stern walls */}
            <mesh position={[0, 0.28, -1.32]}>
                <boxGeometry args={[1.3, 0.34, 0.16]} />
                <meshLambertMaterial color={HULL} />
            </mesh>
            <mesh position={[0, 0.28, 1.0]}>
                <boxGeometry args={[1.3, 0.34, 0.16]} />
                <meshLambertMaterial color={HULL} />
            </mesh>
            {/* bow tip */}
            <mesh position={[0, 0.22, -1.5]}>
                <boxGeometry args={[0.5, 0.22, 0.24]} />
                <meshLambertMaterial color={TRIM} />
            </mesh>
            {/* seat plank behind the player's knees */}
            <mesh position={[0, 0.22, 0.55]}>
                <boxGeometry args={[1.0, 0.08, 0.35]} />
                <meshLambertMaterial color={SEAT} />
            </mesh>
        </group>
    );
};
