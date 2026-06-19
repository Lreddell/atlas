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
const MIN_FIELD_MAGNITUDE = 0.2;
const GRID_DIAMETER = GRID_RADIUS * 2 + 1;
const MAX_ARROW_VERTICES = GRID_DIAMETER * GRID_DIAMETER * GRID_DIAMETER * 10;
const POSITIVE_COLOR = new THREE.Color(0xff4a4a);
const NEGATIVE_COLOR = new THREE.Color(0x4a8cff);

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

const appendVertex = (
    positions: number[],
    colors: number[],
    point: THREE.Vector3,
    color: THREE.Color,
): void => {
    positions.push(point.x, point.y, point.z);
    colors.push(color.r, color.g, color.b);
};

const appendSegment = (
    positions: number[],
    colors: number[],
    start: THREE.Vector3,
    end: THREE.Vector3,
    color: THREE.Color,
): void => {
    appendVertex(positions, colors, start, color);
    appendVertex(positions, colors, end, color);
};

export const MagneticFieldDebug: React.FC<MagneticFieldDebugProps> = ({ playerPosRef }) => {
    const elapsedRef = useRef(RECHECK_INTERVAL);
    const lastCenterRef = useRef('');
    const lastSourceSignatureRef = useRef('');
    const geometries = useMemo(() => [0, 1, 2].map(() => {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute(
            'position',
            new THREE.BufferAttribute(new Float32Array(MAX_ARROW_VERTICES * 3), 3),
        );
        geometry.setAttribute(
            'color',
            new THREE.BufferAttribute(new Float32Array(MAX_ARROW_VERTICES * 3), 3),
        );
        geometry.setDrawRange(0, 0);
        return geometry;
    }), []);
    const materials = useMemo(
        () => [0.35, 0.6, 0.9].map(opacity => new THREE.LineBasicMaterial({
            vertexColors: true,
            transparent: true,
            opacity,
            depthTest: false,
            depthWrite: false,
            toneMapped: false,
        })),
        [],
    );

    useEffect(() => () => {
        geometries.forEach(geometry => geometry.dispose());
        materials.forEach(material => material.dispose());
    }, [geometries, materials]);

    useFrame((_state, delta) => {
        elapsedRef.current += delta;
        if (elapsedRef.current < RECHECK_INTERVAL) return;
        elapsedRef.current = 0;

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

        const positions = [[], [], []] as number[][];
        const colors = [[], [], []] as number[][];
        const origin = new THREE.Vector3();
        const direction = new THREE.Vector3();
        const tip = new THREE.Vector3();
        const headBase = new THREE.Vector3();
        const side = new THREE.Vector3();
        const vertical = new THREE.Vector3();
        const wing = new THREE.Vector3();
        const reference = new THREE.Vector3();

        for (let x = centerX - GRID_RADIUS; x <= centerX + GRID_RADIUS; x += 1) {
            for (let y = centerY - GRID_RADIUS; y <= centerY + GRID_RADIUS; y += 1) {
                for (let z = centerZ - GRID_RADIUS; z <= centerZ + GRID_RADIUS; z += 1) {
                    origin.set(x + 0.5, y + 0.5, z + 0.5);
                    const field = sampleRawMagneticField(sources, origin.x, origin.y, origin.z);
                    const magnitude = Math.hypot(field.x, field.y, field.z);
                    if (magnitude < MIN_FIELD_MAGNITUDE) continue;

                    direction.set(field.x, field.y, field.z).multiplyScalar(1 / magnitude);
                    const normalizedMagnitude = Math.min(1, magnitude / MAGNET_FORCE);
                    const bucket = normalizedMagnitude < 0.2 ? 0 : normalizedMagnitude < 0.55 ? 1 : 2;
                    const length = 0.18 + Math.min(0.7, Math.log1p(magnitude) * 0.13);
                    const headLength = Math.min(0.22, length * 0.35);
                    const headWidth = headLength * 0.45;
                    const color = field.positiveStrength >= field.negativeStrength
                        ? POSITIVE_COLOR
                        : NEGATIVE_COLOR;

                    tip.copy(origin).addScaledVector(direction, length);
                    headBase.copy(tip).addScaledVector(direction, -headLength);
                    reference.set(0, Math.abs(direction.y) < 0.9 ? 1 : 0, Math.abs(direction.y) < 0.9 ? 0 : 1);
                    side.crossVectors(direction, reference).normalize();
                    vertical.crossVectors(direction, side).normalize();

                    appendSegment(positions[bucket], colors[bucket], origin, tip, color);
                    wing.copy(headBase).addScaledVector(side, headWidth);
                    appendSegment(positions[bucket], colors[bucket], tip, wing, color);
                    wing.copy(headBase).addScaledVector(side, -headWidth);
                    appendSegment(positions[bucket], colors[bucket], tip, wing, color);
                    wing.copy(headBase).addScaledVector(vertical, headWidth);
                    appendSegment(positions[bucket], colors[bucket], tip, wing, color);
                    wing.copy(headBase).addScaledVector(vertical, -headWidth);
                    appendSegment(positions[bucket], colors[bucket], tip, wing, color);
                }
            }
        }

        geometries.forEach((geometry, index) => {
            const positionAttribute = geometry.getAttribute('position') as THREE.BufferAttribute;
            const colorAttribute = geometry.getAttribute('color') as THREE.BufferAttribute;
            (positionAttribute.array as Float32Array).set(positions[index]);
            (colorAttribute.array as Float32Array).set(colors[index]);
            positionAttribute.needsUpdate = true;
            colorAttribute.needsUpdate = true;
            geometry.setDrawRange(0, positions[index].length / 3);
        });
    });

    return (
        <group renderOrder={1000}>
            {geometries.map((geometry, index) => (
                <lineSegments
                    key={index}
                    geometry={geometry}
                    material={materials[index]}
                    frustumCulled={false}
                    renderOrder={1000}
                />
            ))}
        </group>
    );
};
