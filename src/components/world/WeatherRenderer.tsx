import React, { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { weatherSystem } from '../../systems/world/WeatherSystem';

const PARTICLE_COUNT = 700;
const RADIUS = 18;

export const WeatherRenderer: React.FC<{ isPaused: boolean }> = ({ isPaused }) => {
    const { camera, scene } = useThree();
    const pointsRef = useRef<THREE.Points>(null);
    const materialRef = useRef<THREE.PointsMaterial>(null);
    const positions = useMemo(() => {
        const data = new Float32Array(PARTICLE_COUNT * 3);
        for (let i = 0; i < PARTICLE_COUNT; i++) {
            data[i * 3] = (Math.random() * 2 - 1) * RADIUS;
            data[i * 3 + 1] = Math.random() * 24 - 4;
            data[i * 3 + 2] = (Math.random() * 2 - 1) * RADIUS;
        }
        return data;
    }, []);

    useFrame((_, delta) => {
        const weather = weatherSystem.get();
        if (pointsRef.current) {
            pointsRef.current.visible = weather.type !== 'clear' && weather.intensity > 0.01;
            pointsRef.current.position.set(camera.position.x, camera.position.y + 4, camera.position.z);
        }
        if (materialRef.current) {
            materialRef.current.opacity = weather.intensity * (weather.type === 'snow' ? 0.85 : 0.55);
            materialRef.current.size = weather.type === 'snow' ? 0.18 : 0.07;
            materialRef.current.color.set(weather.type === 'snow' ? 0xffffff : 0x9cc9e8);
        }
        if (scene.fog && weather.lightningFlash > 0) {
            (scene.fog as THREE.Fog).color.lerp(new THREE.Color(0xddeeff), weather.lightningFlash * 0.45);
        }
        if (isPaused || weather.type === 'clear') return;
        const speed = weather.type === 'snow' ? 3 : 22;
        const attribute = pointsRef.current?.geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
        if (!attribute) return;
        for (let i = 0; i < PARTICLE_COUNT; i++) {
            let y = attribute.getY(i) - delta * speed;
            if (y < -5) y += 24;
            attribute.setY(i, y);
            if (weather.type !== 'snow') attribute.setX(i, attribute.getX(i) + delta * 1.5);
            if (attribute.getX(i) > RADIUS) attribute.setX(i, -RADIUS);
        }
        attribute.needsUpdate = true;
    });

    return (
        <points ref={pointsRef} frustumCulled={false} renderOrder={50}>
            <bufferGeometry>
                <bufferAttribute attach="attributes-position" count={PARTICLE_COUNT} array={positions} itemSize={3} />
            </bufferGeometry>
            <pointsMaterial ref={materialRef} transparent depthWrite={false} sizeAttenuation color={0x9cc9e8} />
        </points>
    );
};
