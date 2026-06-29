import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

import { BlockType } from '../types';
import { worldManager } from '../systems/WorldManager';
import {
    MAGNET_FORCE,
    MAGNET_RANGE,
    collectMagnetSources,
    sampleRawMagneticField,
    type MagnetSource,
} from '../systems/player/magneticField';

interface MagneticFieldDebugProps {
    playerPosRef: React.MutableRefObject<THREE.Vector3>;
}

const GRID_RADIUS = MAGNET_RANGE;
const SOURCE_SCAN_RADIUS = GRID_RADIUS + MAGNET_RANGE;
const RECHECK_INTERVAL = 0.25;
const MIN_FIELD_MAGNITUDE = 0.15;
const GRID_DIAMETER = GRID_RADIUS * 2 + 1;
const MAX_ARROWS = GRID_DIAMETER * GRID_DIAMETER * GRID_DIAMETER;
const UP = new THREE.Vector3(0, 1, 0);

const BLOCK_IDS = {
    positiveMagnet: BlockType.POSITIVE_MAGNET,
    negativeMagnet: BlockType.NEGATIVE_MAGNET,
    ironBlock: BlockType.IRON_BLOCK,
};

const createSourceSignature = (sources: readonly MagnetSource[]): string =>
    sources.map(source => [
        source.x,
        source.y,
        source.z,
        source.polarity,
        source.axis?.x ?? 0,
        source.axis?.y ?? 0,
        source.axis?.z ?? 0,
    ].join(':')).join('|');

export const MagneticFieldDebug: React.FC<MagneticFieldDebugProps> = ({ playerPosRef }) => {
    const positiveShaftRef = useRef<THREE.InstancedMesh>(null);
    const positiveHeadRef = useRef<THREE.InstancedMesh>(null);
    const negativeShaftRef = useRef<THREE.InstancedMesh>(null);
    const negativeHeadRef = useRef<THREE.InstancedMesh>(null);
    const elapsedRef = useRef(RECHECK_INTERVAL);
    const lastCenterRef = useRef('');
    const lastSourceSignatureRef = useRef('');

    const shaftGeometry = useMemo(() => new THREE.CylinderGeometry(1, 1, 1, 8, 1, false), []);
    const headGeometry = useMemo(() => new THREE.ConeGeometry(1, 1, 8, 1, false), []);
    const positiveMaterial = useMemo(() => new THREE.MeshBasicMaterial({
        color: 0xff2020,
        transparent: true,
        opacity: 0.96,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
    }), []);
    const negativeMaterial = useMemo(() => new THREE.MeshBasicMaterial({
        color: 0x00b8ff,
        transparent: true,
        opacity: 0.96,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
    }), []);

    useEffect(() => {
        [
            positiveShaftRef.current,
            positiveHeadRef.current,
            negativeShaftRef.current,
            negativeHeadRef.current,
        ].forEach(mesh => mesh?.instanceMatrix.setUsage(THREE.DynamicDrawUsage));

        return () => {
            shaftGeometry.dispose();
            headGeometry.dispose();
            positiveMaterial.dispose();
            negativeMaterial.dispose();
        };
    }, [headGeometry, negativeMaterial, positiveMaterial, shaftGeometry]);

    useFrame((_state, delta) => {
        elapsedRef.current += delta;
        if (elapsedRef.current < RECHECK_INTERVAL) return;
        elapsedRef.current = 0;

        const positiveShaft = positiveShaftRef.current;
        const positiveHead = positiveHeadRef.current;
        const negativeShaft = negativeShaftRef.current;
        const negativeHead = negativeHeadRef.current;
        if (!positiveShaft || !positiveHead || !negativeShaft || !negativeHead) return;

        const centerX = Math.floor(playerPosRef.current.x);
        const centerY = Math.floor(playerPosRef.current.y);
        const centerZ = Math.floor(playerPosRef.current.z);
        const centerKey = `${centerX},${centerY},${centerZ}`;
        const getBlock = (x: number, y: number, z: number) => worldManager.getBlock(x, y, z, false);
        const sources = collectMagnetSources(
            getBlock,
            centerX,
            centerY,
            centerZ,
            SOURCE_SCAN_RADIUS,
            BLOCK_IDS,
        );
        const sourceSignature = createSourceSignature(sources);

        if (
            centerKey === lastCenterRef.current
            && sourceSignature === lastSourceSignatureRef.current
        ) {
            return;
        }

        lastCenterRef.current = centerKey;
        lastSourceSignatureRef.current = sourceSignature;

        let positiveCount = 0;
        let negativeCount = 0;
        const origin = new THREE.Vector3();
        const direction = new THREE.Vector3();
        const position = new THREE.Vector3();
        const quaternion = new THREE.Quaternion();
        const scale = new THREE.Vector3();
        const matrix = new THREE.Matrix4();

        for (let x = centerX - GRID_RADIUS; x <= centerX + GRID_RADIUS; x += 1) {
            for (let y = centerY - GRID_RADIUS; y <= centerY + GRID_RADIUS; y += 1) {
                for (let z = centerZ - GRID_RADIUS; z <= centerZ + GRID_RADIUS; z += 1) {
                    origin.set(x + 0.5, y + 0.5, z + 0.5);
                    const field = sampleRawMagneticField(sources, origin.x, origin.y, origin.z);
                    const magnitude = Math.hypot(field.x, field.y, field.z);
                    if (magnitude < MIN_FIELD_MAGNITUDE) continue;

                    direction.set(field.x, field.y, field.z).multiplyScalar(1 / magnitude);
                    quaternion.setFromUnitVectors(UP, direction);

                    const normalizedMagnitude = Math.min(1, magnitude / (MAGNET_FORCE * 2));
                    const totalLength = 0.42 + normalizedMagnitude * 0.95;
                    const headLength = 0.2 + normalizedMagnitude * 0.16;
                    const shaftLength = Math.max(0.16, totalLength - headLength);
                    const shaftRadius = 0.035 + normalizedMagnitude * 0.025;
                    const headRadius = 0.12 + normalizedMagnitude * 0.07;
                    const positiveDominant = field.positiveStrength >= field.negativeStrength;
                    const instanceIndex = positiveDominant ? positiveCount++ : negativeCount++;
                    const shaftMesh = positiveDominant ? positiveShaft : negativeShaft;
                    const headMesh = positiveDominant ? positiveHead : negativeHead;

                    position.copy(origin).addScaledVector(direction, shaftLength * 0.5);
                    scale.set(shaftRadius, shaftLength, shaftRadius);
                    matrix.compose(position, quaternion, scale);
                    shaftMesh.setMatrixAt(instanceIndex, matrix);

                    position.copy(origin).addScaledVector(direction, shaftLength + headLength * 0.5);
                    scale.set(headRadius, headLength, headRadius);
                    matrix.compose(position, quaternion, scale);
                    headMesh.setMatrixAt(instanceIndex, matrix);
                }
            }
        }

        positiveShaft.count = positiveCount;
        positiveHead.count = positiveCount;
        negativeShaft.count = negativeCount;
        negativeHead.count = negativeCount;
        positiveShaft.instanceMatrix.needsUpdate = true;
        positiveHead.instanceMatrix.needsUpdate = true;
        negativeShaft.instanceMatrix.needsUpdate = true;
        negativeHead.instanceMatrix.needsUpdate = true;
    });

    return (
        <group renderOrder={2000}>
            <instancedMesh
                ref={positiveShaftRef}
                args={[shaftGeometry, positiveMaterial, MAX_ARROWS]}
                frustumCulled={false}
                renderOrder={2000}
            />
            <instancedMesh
                ref={positiveHeadRef}
                args={[headGeometry, positiveMaterial, MAX_ARROWS]}
                frustumCulled={false}
                renderOrder={2000}
            />
            <instancedMesh
                ref={negativeShaftRef}
                args={[shaftGeometry, negativeMaterial, MAX_ARROWS]}
                frustumCulled={false}
                renderOrder={2000}
            />
            <instancedMesh
                ref={negativeHeadRef}
                args={[headGeometry, negativeMaterial, MAX_ARROWS]}
                frustumCulled={false}
                renderOrder={2000}
            />
        </group>
    );
};
