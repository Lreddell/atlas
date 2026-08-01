import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { bellTitanEncounter } from '../systems/entities/BellTitanEncounter';
import {
    BELL_TITAN_ATTACK_GEOMETRY,
    getBellTitanActionDuration,
    type BellTitanAction,
} from '../systems/entities/BellTitanEncounterCore';
import {
    BELL_TITAN_MATERIAL_UVS,
} from '../systems/textures/resonantEntityTexturePixels';
import {
    BELL_TITAN_MODEL,
    getBellTitanVisibleParts,
    sampleBellTitanPose,
    type BellTitanMaterialId,
    type BellTitanPart,
} from './bellTitanModel';

const TEXTURE_PATH = '/assets/rvx/textures/entities/bell_titan.png';
const MAX_TITAN_RINGS = 8;
const MAX_TITAN_IMPACTS = 8;
const MAX_TITAN_LANES = 6;
const MAX_TITAN_DEBRIS = 20;
const LEFT_ARM_ANCHOR = new THREE.Vector3(-1.82, 3.98, 0);
const RIGHT_ARM_ANCHOR = new THREE.Vector3(1.94, 4.02, 0);
const BELL_ANCHOR = new THREE.Vector3(0, 3.75, 1.08);
const LEFT_LEG_ANCHOR = new THREE.Vector3(-0.72, 0.95, 0);
const RIGHT_LEG_ANCHOR = new THREE.Vector3(0.72, 0.95, 0);
const TITAN_LIGHT_OFFSETS = [
    [8, 5, 8], [-8, 5, 8], [8, 5, -8], [-8, 5, -8],
    [0, 10.5, 5.5], [0, 10.5, -5.5], [11, 6, 0], [-11, 6, 0],
] as const;
const BELL_TITAN_HIT_ZONES = {
    core: { hitZone: 'core' },
    shell: { hitZone: 'shell' },
} as const;

const MATERIAL_TINTS: Readonly<Record<BellTitanMaterialId, number>> = {
    stone: 0xe0ded4,
    dark_stone: 0xd0d0c9,
    bronze: 0xe3d1ae,
    worn_bronze: 0xd4c7ad,
    chain: 0xbebbb2,
    bell: 0xe8d0a0,
    core: 0xf0c27a,
};

type TitanMaterials = Readonly<Record<BellTitanMaterialId, THREE.MeshLambertMaterial>>;

function useTitanMaterials(): TitanMaterials {
    const source = useTexture(TEXTURE_PATH);
    const materials = useMemo(() => {
        const result = {} as Record<BellTitanMaterialId, THREE.MeshLambertMaterial>;
        for (const materialId of Object.keys(BELL_TITAN_MATERIAL_UVS) as BellTitanMaterialId[]) {
            const rect = BELL_TITAN_MATERIAL_UVS[materialId];
            const map = source.clone();
            map.colorSpace = THREE.SRGBColorSpace;
            map.magFilter = THREE.NearestFilter;
            map.minFilter = THREE.NearestFilter;
            map.generateMipmaps = false;
            map.wrapS = THREE.ClampToEdgeWrapping;
            map.wrapT = THREE.ClampToEdgeWrapping;
            map.offset.set(rect.u, rect.v);
            map.repeat.set(rect.width, rect.height);
            map.needsUpdate = true;
            const material = new THREE.MeshLambertMaterial({ map, color: MATERIAL_TINTS[materialId] });
            if (materialId === 'core') {
                material.emissive.setHex(0x3a2410);
                material.emissiveIntensity = 0.34;
            }
            result[materialId] = material;
        }
        return result;
    }, [source]);
    useEffect(() => () => {
        for (const material of Object.values(materials)) {
            material.map?.dispose();
            material.dispose();
        }
    }, [materials]);
    return materials;
}

const leftArmNames = new Set(BELL_TITAN_MODEL.parts.filter((part) => part.name.startsWith('left_')
    && !part.name.includes('thigh') && !part.name.includes('knee') && !part.name.includes('foot') && !part.name.includes('heel')
    && !part.name.includes('chain')).map((part) => part.name));
const rightArmNames = new Set(BELL_TITAN_MODEL.parts.filter((part) => part.name.startsWith('right_')
    && !part.name.includes('thigh') && !part.name.includes('knee') && !part.name.includes('foot') && !part.name.includes('heel')
    && !part.name.includes('chain')).map((part) => part.name));
const bellNames = new Set(BELL_TITAN_MODEL.parts
    .filter((part) => part.name.includes('chain') || part.name.includes('bell') || part.name === 'hanging_bell')
    .map((part) => part.name));
const leftLegNames = new Set(['left_thigh', 'left_knee', 'left_foot', 'left_heel']);
const rightLegNames = new Set(['right_thigh', 'right_knee', 'right_foot', 'right_heel']);

interface TitanPartMeshProps {
    part: BellTitanPart;
    materials: TitanMaterials;
    offset?: THREE.Vector3;
    register: (name: string, object: THREE.Mesh | null) => void;
}

const TitanPartMesh: React.FC<TitanPartMeshProps> = ({ part, materials, offset, register }) => {
    const position: [number, number, number] = [
        part.position[0] - (offset?.x ?? 0),
        part.position[1] - (offset?.y ?? 0),
        part.position[2] - (offset?.z ?? 0),
    ];
    const coreHitZone = part.name === 'hanging_bell' || part.name.startsWith('bell_');
    return (
        <mesh
            ref={(mesh) => register(part.name, mesh)}
            name={part.name}
            position={position}
            rotation={part.rotation ? [...part.rotation] : undefined}
            material={materials[part.material]}
            userData={coreHitZone ? BELL_TITAN_HIT_ZONES.core : BELL_TITAN_HIT_ZONES.shell}
            castShadow
            receiveShadow
        >
            <boxGeometry args={[...part.size]} />
        </mesh>
    );
};

function actionProgress(action: BellTitanAction, elapsed: number, duration: number): number {
    if (action === 'core_open') return Math.min(1, elapsed / 0.32);
    if (action === 'death') return Math.min(1, elapsed / (duration * 0.75));
    return Math.max(0, Math.min(1, elapsed / Math.max(0.001, duration)));
}

/** World-lit, segmented Bell Titan with encounter-authored motion and hit zones. */
export const BellTitanRenderer: React.FC = () => {
    const materials = useTitanMaterials();
    const rootRef = useRef<THREE.Group>(null);
    const torsoRef = useRef<THREE.Group>(null);
    const leftArmRef = useRef<THREE.Group>(null);
    const rightArmRef = useRef<THREE.Group>(null);
    const leftLegRef = useRef<THREE.Group>(null);
    const rightLegRef = useRef<THREE.Group>(null);
    const bellRef = useRef<THREE.Group>(null);
    const leftCageRef = useRef<THREE.Mesh | null>(null);
    const rightCageRef = useRef<THREE.Mesh | null>(null);
    const headRef = useRef<THREE.Mesh | null>(null);
    const clapperRef = useRef<THREE.Mesh | null>(null);
    const partRefs = useRef(new Map<string, THREE.Mesh>());
    const ringRefs = useRef<Array<THREE.Mesh | null>>([]);
    const impactRefs = useRef<Array<THREE.Mesh | null>>([]);
    const laneRefs = useRef<Array<THREE.Mesh | null>>([]);
    const debrisRefs = useRef<Array<THREE.Mesh | null>>([]);
    const lightRefs = useRef<Array<THREE.PointLight | null>>([]);
    const coreLightRef = useRef<THREE.PointLight>(null);
    const sectorTelegraphRef = useRef<THREE.Mesh>(null);
    const wideSectorTelegraphRef = useRef<THREE.Mesh>(null);
    const lineTelegraphRef = useRef<THREE.Mesh>(null);
    const diskTelegraphRef = useRef<THREE.Mesh>(null);
    const visibleStage = useRef(-1);

    const register = (name: string, object: THREE.Mesh | null): void => {
        if (object) partRefs.current.set(name, object);
        else partRefs.current.delete(name);
        if (name === 'chest_cage_left') leftCageRef.current = object;
        if (name === 'chest_cage_right') rightCageRef.current = object;
        if (name === 'head') headRef.current = object;
        if (name === 'bell_clapper') clapperRef.current = object;
    };

    const groups = useMemo(() => ({
        leftArm: BELL_TITAN_MODEL.parts.filter((part) => leftArmNames.has(part.name)),
        rightArm: BELL_TITAN_MODEL.parts.filter((part) => rightArmNames.has(part.name)),
        bell: BELL_TITAN_MODEL.parts.filter((part) => bellNames.has(part.name)),
        leftLeg: BELL_TITAN_MODEL.parts.filter((part) => leftLegNames.has(part.name)),
        rightLeg: BELL_TITAN_MODEL.parts.filter((part) => rightLegNames.has(part.name)),
        body: BELL_TITAN_MODEL.parts.filter((part) => !leftArmNames.has(part.name)
            && !rightArmNames.has(part.name) && !bellNames.has(part.name)
            && !leftLegNames.has(part.name) && !rightLegNames.has(part.name)),
    }), []);

    useFrame(({ clock }) => {
        const root = rootRef.current;
        const anchor = bellTitanEncounter.getRenderAnchor();
        const arenaAnchor = bellTitanEncounter.getArenaAnchor();
        const snapshot = bellTitanEncounter.getSnapshot();
        if (!root) return;
        const lightAnchor = arenaAnchor ?? anchor;
        if (!lightAnchor) {
            root.visible = false;
            if (coreLightRef.current) coreLightRef.current.intensity = 0;
            for (const light of lightRefs.current) if (light) light.intensity = 0;
            for (const ring of ringRefs.current) if (ring) ring.visible = false;
            for (const impact of impactRefs.current) if (impact) impact.visible = false;
            for (const lane of laneRefs.current) if (lane) lane.visible = false;
            for (const piece of debrisRefs.current) if (piece) piece.visible = false;
            if (sectorTelegraphRef.current) sectorTelegraphRef.current.visible = false;
            if (wideSectorTelegraphRef.current) wideSectorTelegraphRef.current.visible = false;
            if (lineTelegraphRef.current) lineTelegraphRef.current.visible = false;
            if (diskTelegraphRef.current) diskTelegraphRef.current.visible = false;
            return;
        }
        const awakening = snapshot.action === 'awaken'
            ? Math.min(1, snapshot.actionTime / getBellTitanActionDuration('awaken'))
            : (bellTitanEncounter.areArenaLightsReady() || anchor ? 1 : 0);
        const lightIntensity = 0.35 + awakening * 3.15;
        for (let index = 0; index < lightRefs.current.length; index += 1) {
            const light = lightRefs.current[index];
            if (!light) continue;
            const offset = TITAN_LIGHT_OFFSETS[index];
            light.position.set(lightAnchor.x + offset[0], lightAnchor.y + offset[1], lightAnchor.z + offset[2]);
            const groupDelay = index * 0.14;
            const overheadBoost = index >= 4 ? 1.25 : 1;
            light.intensity = lightIntensity * overheadBoost * Math.max(0.08, Math.min(1, (awakening - groupDelay) * 4));
        }
        if (!anchor) {
            root.visible = false;
            for (const ring of ringRefs.current) if (ring) ring.visible = false;
            for (const impact of impactRefs.current) if (impact) impact.visible = false;
            for (const lane of laneRefs.current) if (lane) lane.visible = false;
            for (const piece of debrisRefs.current) if (piece) piece.visible = false;
            if (sectorTelegraphRef.current) sectorTelegraphRef.current.visible = false;
            if (wideSectorTelegraphRef.current) wideSectorTelegraphRef.current.visible = false;
            if (lineTelegraphRef.current) lineTelegraphRef.current.visible = false;
            if (diskTelegraphRef.current) diskTelegraphRef.current.visible = false;
            return;
        }
        root.visible = true;
        const duration = snapshot.action === 'core_open'
            ? Math.max(0.001, snapshot.coreExposureRemaining + snapshot.actionTime)
            : getBellTitanActionDuration(snapshot.action, snapshot.phase);
        const pose = sampleBellTitanPose(
            snapshot.action,
            actionProgress(snapshot.action, snapshot.actionTime, duration),
            clock.elapsedTime,
        );
        root.position.set(anchor.x, anchor.y + pose.rootY, anchor.z + pose.rootZ);
        root.rotation.set(pose.rootX, anchor.yaw, 0);
        if (torsoRef.current) torsoRef.current.rotation.set(pose.torsoX, pose.torsoYaw, 0);
        if (leftArmRef.current) leftArmRef.current.rotation.set(pose.leftShoulderX + pose.leftHammerX * 0.45, 0, pose.leftShoulderZ + pose.leftHammerZ * 0.65);
        if (rightArmRef.current) rightArmRef.current.rotation.set(pose.rightShoulderX + pose.rightHammerX * 0.45, 0, pose.rightShoulderZ + pose.rightHammerZ * 0.65);
        if (leftLegRef.current) leftLegRef.current.rotation.x = pose.leftLegX;
        if (rightLegRef.current) rightLegRef.current.rotation.x = pose.rightLegX;
        if (bellRef.current) bellRef.current.rotation.set(pose.bellSwingX, 0, pose.bellSwingZ + pose.chainSway * 0.35);
        if (headRef.current) headRef.current.rotation.x = pose.headX;
        if (clapperRef.current) clapperRef.current.rotation.x = pose.clapperSwing;
        if (leftCageRef.current) leftCageRef.current.rotation.y = -pose.chestOpen * 0.72;
        if (rightCageRef.current) rightCageRef.current.rotation.y = pose.chestOpen * 0.72;

        if (visibleStage.current !== snapshot.shellStage) {
            visibleStage.current = snapshot.shellStage;
            const visible = new Set(getBellTitanVisibleParts(snapshot.shellStage));
            for (const [name, mesh] of partRefs.current) mesh.visible = visible.has(name);
        }
        const hurt = Date.now() < anchor.hurtUntil;
        for (const [id, material] of Object.entries(materials) as [BellTitanMaterialId, THREE.MeshLambertMaterial][]) {
            material.color.setHex(hurt ? 0xffffff : MATERIAL_TINTS[id]);
        }
        const corePulse = snapshot.coreExposed ? 0.5 + Math.sin(clock.elapsedTime * 6.5) * 0.5 : 0;
        materials.core.emissiveIntensity = snapshot.coreExposed ? 1.35 + corePulse * 0.42 : 0.22 + snapshot.shellStage * 0.1;
        materials.bell.emissive.setHex(snapshot.coreExposed ? 0x6f3e15 : 0x000000);
        materials.bell.emissiveIntensity = snapshot.coreExposed ? 0.78 + corePulse * 0.28 : 0;
        materials.worn_bronze.emissive.setHex(snapshot.coreExposed ? 0x2d1909 : 0x000000);
        materials.worn_bronze.emissiveIntensity = snapshot.coreExposed ? 0.38 + corePulse * 0.16 : 0;
        if (bellRef.current) {
            const openScale = snapshot.coreExposed ? 1.035 + corePulse * 0.018 : 1;
            bellRef.current.scale.setScalar(openScale);
        }
        if (coreLightRef.current) {
            const ringing = snapshot.action.includes('toll') || snapshot.action.includes('storm')
                || snapshot.action.includes('resonance_cage');
            coreLightRef.current.intensity = snapshot.coreExposed ? 4.8 + corePulse * 1.4 : ringing ? 1.35 : 0.35 + snapshot.shellStage * 0.28;
            coreLightRef.current.color.setHex(snapshot.coreExposed ? 0xffc16a : 0xb89462);
        }

        const windup = snapshot.action.endsWith('_windup');
        const attack = windup ? snapshot.action.slice(0, -'_windup'.length) : '';
        const lockedAnchor = bellTitanEncounter.getAttackAnchor() ?? anchor;
        const telegraphProgress = windup ? actionProgress(snapshot.action, snapshot.actionTime, duration) : 0;
        const telegraphPulse = 0.18 + telegraphProgress * 0.34 + Math.sin(clock.elapsedTime * 10) * 0.035;
        const sector = sectorTelegraphRef.current;
        const sectorRange = attack === 'hammer_combo'
            ? BELL_TITAN_ATTACK_GEOMETRY.hammer_combo.range
            : BELL_TITAN_ATTACK_GEOMETRY.sweep.range;
        if (sector) {
            sector.visible = attack === 'sweep' || attack === 'hammer_combo';
            sector.position.set(lockedAnchor.x, lockedAnchor.y + 0.045, lockedAnchor.z);
            sector.rotation.set(-Math.PI / 2, 0, -lockedAnchor.yaw);
            sector.scale.setScalar(sectorRange);
            (sector.material as THREE.MeshLambertMaterial).opacity = telegraphPulse;
        }
        const wideSector = wideSectorTelegraphRef.current;
        if (wideSector) {
            wideSector.visible = attack === 'chain_lash';
            wideSector.position.set(lockedAnchor.x, lockedAnchor.y + 0.047, lockedAnchor.z);
            wideSector.rotation.set(-Math.PI / 2, 0, -lockedAnchor.yaw);
            wideSector.scale.setScalar(BELL_TITAN_ATTACK_GEOMETRY.chain_lash.range);
            (wideSector.material as THREE.MeshLambertMaterial).opacity = telegraphPulse;
        }
        const line = lineTelegraphRef.current;
        if (line) {
            const { length: lineLength, halfWidth } = BELL_TITAN_ATTACK_GEOMETRY.advance;
            line.visible = attack === 'advance';
            line.position.set(
                lockedAnchor.x + Math.sin(lockedAnchor.yaw) * lineLength * 0.5,
                lockedAnchor.y + 0.05,
                lockedAnchor.z + Math.cos(lockedAnchor.yaw) * lineLength * 0.5,
            );
            line.rotation.set(-Math.PI / 2, 0, -lockedAnchor.yaw);
            line.scale.set(halfWidth * 2, lineLength, 1);
            (line.material as THREE.MeshLambertMaterial).opacity = telegraphPulse;
        }
        const disk = diskTelegraphRef.current;
        if (disk) {
            disk.visible = attack === 'slam';
            disk.position.set(lockedAnchor.x, lockedAnchor.y + 0.04, lockedAnchor.z);
            disk.rotation.set(-Math.PI / 2, 0, 0);
            disk.scale.setScalar(BELL_TITAN_ATTACK_GEOMETRY.slam.radius);
            (disk.material as THREE.MeshLambertMaterial).opacity = telegraphPulse;
        }

        const rings = bellTitanEncounter.getShockwaves();
        for (let index = 0; index < MAX_TITAN_RINGS; index += 1) {
            const mesh = ringRefs.current[index];
            const ring = rings[index];
            if (!mesh || !ring) {
                if (mesh) mesh.visible = false;
                continue;
            }
            mesh.visible = true;
            mesh.position.set(ring.x, ring.y + 0.08, ring.z);
            mesh.scale.setScalar(ring.radius);
            const material = mesh.material as THREE.MeshLambertMaterial;
            material.opacity = 0.76 * (1 - ring.radius / Math.max(ring.radius + 0.01, ring.endRadius));
        }
        const impacts = bellTitanEncounter.getImpacts();
        for (let index = 0; index < MAX_TITAN_IMPACTS; index += 1) {
            const mesh = impactRefs.current[index];
            const impact = impacts[index];
            if (!mesh || !impact) {
                if (mesh) mesh.visible = false;
                continue;
            }
            mesh.visible = true;
            mesh.position.set(impact.x, impact.y + 0.055, impact.z);
            mesh.scale.setScalar(impact.radius);
            const material = mesh.material as THREE.MeshLambertMaterial;
            const warningProgress = Math.min(1, impact.age / Math.max(0.001, impact.warningSeconds));
            material.color.setHex(impact.phase === 'active' ? 0xffd38a : 0xc89c62);
            material.opacity = impact.phase === 'active'
                ? 0.72
                : 0.16 + warningProgress * 0.42 + Math.sin(clock.elapsedTime * 12 + index) * 0.05;
        }
        const lanes = bellTitanEncounter.getLanes();
        for (let index = 0; index < MAX_TITAN_LANES; index += 1) {
            const mesh = laneRefs.current[index];
            const lane = lanes[index];
            if (!mesh || !lane) {
                if (mesh) mesh.visible = false;
                continue;
            }
            mesh.visible = true;
            mesh.position.set(lane.x, lane.y + 0.06, lane.z);
            mesh.rotation.set(-Math.PI / 2, 0, -lane.yaw);
            mesh.scale.set(lane.halfWidth * 2, lane.length, 1);
            const material = mesh.material as THREE.MeshLambertMaterial;
            const warningProgress = Math.min(1, lane.age / Math.max(0.001, lane.warningSeconds));
            material.color.setHex(lane.phase === 'active' ? 0xffd79a : 0xb98b58);
            material.opacity = lane.phase === 'active'
                ? 0.68
                : 0.12 + warningProgress * 0.36 + Math.sin(clock.elapsedTime * 11 + index * 0.7) * 0.04;
        }
        const debris = bellTitanEncounter.getDebris();
        for (let index = 0; index < MAX_TITAN_DEBRIS; index += 1) {
            const mesh = debrisRefs.current[index];
            const piece = debris[index];
            if (!mesh || !piece) {
                if (mesh) mesh.visible = false;
                continue;
            }
            mesh.visible = true;
            mesh.position.set(piece.x, piece.y, piece.z);
            mesh.rotation.set(piece.spin * piece.age, piece.spin * 0.37 * piece.age, piece.spin * 0.61 * piece.age);
        }
    });

    return (
        <>
            <group ref={rootRef} visible={false}>
                <group ref={torsoRef}>
                    {groups.body.map((part) => <TitanPartMesh key={part.name} part={part} materials={materials} register={register} />)}
                </group>
                <group ref={leftArmRef} position={LEFT_ARM_ANCHOR}>
                    {groups.leftArm.map((part) => <TitanPartMesh key={part.name} part={part} materials={materials} offset={LEFT_ARM_ANCHOR} register={register} />)}
                </group>
                <group ref={rightArmRef} position={RIGHT_ARM_ANCHOR}>
                    {groups.rightArm.map((part) => <TitanPartMesh key={part.name} part={part} materials={materials} offset={RIGHT_ARM_ANCHOR} register={register} />)}
                </group>
                <group ref={leftLegRef} position={LEFT_LEG_ANCHOR}>
                    {groups.leftLeg.map((part) => <TitanPartMesh key={part.name} part={part} materials={materials} offset={LEFT_LEG_ANCHOR} register={register} />)}
                </group>
                <group ref={rightLegRef} position={RIGHT_LEG_ANCHOR}>
                    {groups.rightLeg.map((part) => <TitanPartMesh key={part.name} part={part} materials={materials} offset={RIGHT_LEG_ANCHOR} register={register} />)}
                </group>
                <group ref={bellRef} position={BELL_ANCHOR}>
                    {groups.bell.map((part) => <TitanPartMesh key={part.name} part={part} materials={materials} offset={BELL_ANCHOR} register={register} />)}
                </group>
                <pointLight ref={coreLightRef} position={[0, 2.9, 1.72]} color={0xb89462} intensity={0} distance={8.5} decay={1.7} />
            </group>
            <mesh ref={sectorTelegraphRef} visible={false} renderOrder={3}>
                <ringGeometry args={[0, 1, 56, 1, -11 * Math.PI / 12, 5 * Math.PI / 6]} />
                <meshLambertMaterial color={0xb98b58} emissive={0x24180d} emissiveIntensity={0.18} transparent opacity={0.25} side={THREE.DoubleSide} depthWrite={false} />
            </mesh>
            <mesh ref={wideSectorTelegraphRef} visible={false} renderOrder={3}>
                <ringGeometry args={[0, 1, 64, 1, -10 * Math.PI / 9, 11 * Math.PI / 9]} />
                <meshLambertMaterial color={0xb98b58} emissive={0x24180d} emissiveIntensity={0.18} transparent opacity={0.25} side={THREE.DoubleSide} depthWrite={false} />
            </mesh>
            <mesh ref={lineTelegraphRef} visible={false} renderOrder={3}>
                <planeGeometry args={[1, 1]} />
                <meshLambertMaterial color={0xb98b58} emissive={0x24180d} emissiveIntensity={0.18} transparent opacity={0.25} side={THREE.DoubleSide} depthWrite={false} />
            </mesh>
            <mesh ref={diskTelegraphRef} visible={false} renderOrder={3}>
                <circleGeometry args={[1, 48]} />
                <meshLambertMaterial color={0xb98b58} emissive={0x24180d} emissiveIntensity={0.18} transparent opacity={0.25} side={THREE.DoubleSide} depthWrite={false} />
            </mesh>
            {Array.from({ length: TITAN_LIGHT_OFFSETS.length }, (_, index) => (
                <pointLight
                    key={`titan-light:${index}`}
                    ref={(light) => { lightRefs.current[index] = light; }}
                    position={[0, 0, 0]}
                    color={index >= 4 ? 0xffe0aa : index < 2 ? 0xffc27a : 0xe6c394}
                    intensity={0}
                    distance={index >= 4 ? 29 : 24}
                    decay={1.4}
                />
            ))}
            {Array.from({ length: MAX_TITAN_RINGS }, (_, index) => (
                <mesh key={`titan-ring:${index}`} ref={(mesh) => { ringRefs.current[index] = mesh; }} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
                    <ringGeometry args={[0.9, 1, 64]} />
                    <meshLambertMaterial color={0xb99b69} transparent opacity={0.7} side={THREE.DoubleSide} depthWrite={false} />
                </mesh>
            ))}
            {Array.from({ length: MAX_TITAN_IMPACTS }, (_, index) => (
                <mesh key={`titan-impact:${index}`} ref={(mesh) => { impactRefs.current[index] = mesh; }} rotation={[-Math.PI / 2, 0, 0]} visible={false} renderOrder={4}>
                    <circleGeometry args={[1, 48]} />
                    <meshLambertMaterial color={0xc89c62} emissive={0x2a190b} emissiveIntensity={0.24} transparent opacity={0.3} side={THREE.DoubleSide} depthWrite={false} />
                </mesh>
            ))}
            {Array.from({ length: MAX_TITAN_LANES }, (_, index) => (
                <mesh key={`titan-lane:${index}`} ref={(mesh) => { laneRefs.current[index] = mesh; }} rotation={[-Math.PI / 2, 0, 0]} visible={false} renderOrder={4}>
                    <planeGeometry args={[1, 1]} />
                    <meshLambertMaterial color={0xb98b58} emissive={0x24180d} emissiveIntensity={0.22} transparent opacity={0.28} side={THREE.DoubleSide} depthWrite={false} />
                </mesh>
            ))}
            {Array.from({ length: MAX_TITAN_DEBRIS }, (_, index) => (
                <mesh key={`titan-debris:${index}`} ref={(mesh) => { debrisRefs.current[index] = mesh; }} visible={false} castShadow>
                    <boxGeometry args={[0.42, 0.34, 0.5]} />
                    <meshLambertMaterial color={index % 3 === 0 ? 0x8f7449 : 0x56554e} />
                </mesh>
            ))}
        </>
    );
};
