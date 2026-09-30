
import React, { useRef, useMemo, useEffect, useState } from 'react';
import { useFrame, useThree, createPortal } from '@react-three/fiber';
import * as THREE from 'three';
import { ItemStack } from '../types';
import { isSpriteRenderedType } from '../data/spriteBlocks';
import { createHeldItemGeometry } from '../systems/player/heldItemGeometry';
import { getPlayerWeaponProfile } from '../systems/combat/vaultWeapons';
import { playerAttack, playerMining, playerInteraction, attackBusy, attackPose } from '../systems/combat/playerAttack';
import { viewRig, firstPersonHandOpacity } from '../systems/player/viewRig';
import { placementPose } from '../systems/player/playerAnimation';
import { inputState } from '../systems/player/playerInput';
import { usePlayerSkin } from '../systems/player/playerSkins';
import { MinecraftSkinPart } from './MinecraftSkinPart';
import { useSkinTexture } from '../hooks/useSkinTexture';
import { textureAtlasManager } from '../systems/textures/TextureAtlasManager';
import { graphicsSettings } from '../systems/graphics/graphicsStore';
import { viewMotion } from '../systems/player/viewMotion';
import { createViewmodelPose, createViewmodelState, stepViewmodel } from '../systems/player/viewmodelMotion';
import { applyEntityLighting, createEntityLight } from '../systems/graphics/materials/entityLighting';
import { applyViewmodelProjection, updateViewmodelProjection } from '../systems/graphics/viewmodel';
import { easeLight, sampleSmoothLight, type SmoothLight } from '../systems/graphics/smoothLight';
import { worldLightReader } from '../systems/graphics/worldLightReader';

const _viewDir = new THREE.Vector3();
const _lightSample: SmoothLight = { sky: 1, block: 0 };

interface HeldItemProps {
    selectedSlot: number;
    inventory: (ItemStack | null)[];
    isLocked: boolean;
    /** Unused: the Brightness option reaches the hand through the shared world light. */
    brightness?: number;
}

export const HeldItem: React.FC<HeldItemProps> = ({ selectedSlot, inventory, isLocked }) => {
    const skin = usePlayerSkin();
    const skinTexture = useSkinTexture(skin);
    const { camera } = useThree();
    const groupRef = useRef<THREE.Group>(null);
    const itemStack = inventory[selectedSlot];
    const itemType = itemStack ? itemStack.type : null;
    const [texture, setTexture] = useState<THREE.Texture | null>(null);

    const viewmodelState = useRef(createViewmodelState());
    const viewmodelPose = useRef(createViewmodelPose());
    const alphaTests = useRef(new WeakMap<THREE.Material, number>());
    // The world light at the eye, shared by every part of the viewmodel: the
    // hand is lit like the blocks it is held among.
    const eyeLight = useMemo(() => createEntityLight(), []);
    const eyeLightLevel = useRef<SmoothLight>({ sky: 1, block: 0 });

    useEffect(() => {
        setTexture(textureAtlasManager.getTexture());
    }, []);

    const itemMaterial = useMemo(() => {
        if (!texture) return null;
        const mat = new THREE.MeshLambertMaterial({
            map: texture,
            transparent: true,
            alphaTest: 0.5,
            side: THREE.DoubleSide,
            // Depth-test/write enabled so multi-box shapes (slabs/stairs) self-occlude
            // instead of drawing back/interior faces over front ones. The viewmodel's
            // depth sits in front of the whole world (viewmodel.ts), so it never
            // clips into a block, even with the player pressed against one.
            depthTest: true,
            depthWrite: true
        });
        return mat;
    }, [texture]);

    const handMaterial = useMemo(() => {
        const mat = new THREE.MeshLambertMaterial({
            color: skin.palette.skin,
            depthTest: false,
            depthWrite: false,
            transparent: true
        });
        return mat;
    }, [skin.palette.skin]);

    const geometry = useMemo(() => createHeldItemGeometry(itemType), [itemType]);
    useEffect(() => () => { geometry?.dispose(); }, [geometry]);
    useEffect(() => () => { itemMaterial?.dispose(); }, [itemMaterial]);
    useEffect(() => () => { handMaterial.dispose(); }, [handMaterial]);

    useFrame((state, delta) => {
        if (groupRef.current) {
            const opacity = viewRig.detached ? 0 : firstPersonHandOpacity(viewRig.camera, viewRig.eye);
            groupRef.current.visible = opacity > 0.001;
            groupRef.current.traverse(object => {
                if (!(object instanceof THREE.Mesh)) return;
                const materials = Array.isArray(object.material) ? object.material : [object.material];
                for (const material of materials) {
                    if (!alphaTests.current.has(material)) {
                        alphaTests.current.set(material, material.alphaTest);
                        // Every part of the viewmodel: world light, and its own lens and depth.
                        applyEntityLighting(material, { kind: 'uniform', light: eyeLight });
                        applyViewmodelProjection(material);
                    }
                    material.opacity = opacity;
                    material.alphaTest = alphaTests.current.get(material)! * opacity;
                }
            });
            const perspective = camera as THREE.PerspectiveCamera;
            updateViewmodelProjection(perspective.aspect);
            sampleSmoothLight(worldLightReader, camera.position.x, camera.position.y, camera.position.z, _lightSample);
            const level = easeLight(eyeLightLevel.current, _lightSample, delta, 12);
            eyeLight.value.x = level.sky;
            eyeLight.value.y = level.block;

            // Since we are a child of the camera, we do not copy position/quaternion.
            // We render in local space relative to the camera.

            // Viewmodel motion uses render time, never the 20 Hz physics clock.
            const time = state.clock.elapsedTime;
            camera.getWorldDirection(_viewDir);
            const lookYaw = Math.atan2(-_viewDir.x, -_viewDir.z);
            const lookPitch = Math.asin(Math.max(-1, Math.min(1, _viewDir.y)));

            // Mining and eating repeat while held; a use/place pushes once on success.
            const genericAction = isLocked && (playerMining.active || inputState.eating || (playerInteraction.leftHeld && !getPlayerWeaponProfile(itemType)));
            const eating = genericAction && inputState.eating;
            const actionTime = playerMining.active ? playerMining.elapsed : time;
            const swing = genericAction && !eating ? (actionTime % 0.25) / 0.25 : null;
            const motion = stepViewmodel(viewmodelState.current, viewMotion, {
                dt: delta, time, yaw: lookYaw, pitch: lookPitch,
                itemKey: itemType ?? 'hand', eating, swing,
                cameraBobbing: graphicsSettings.getConfig().viewBobbing,
            }, viewmodelPose.current);
            const place = placementPose(playerInteraction.placementElapsed).weight;

            // Set local position and rotation relative to camera: rest pose plus motion.
            groupRef.current.position.set(0.5 + motion.x, -0.5 + motion.y - place * 0.2, -0.8 + motion.z - place * 0.06);
            groupRef.current.rotation.set(0.2 + motion.rx - place * 0.8, -0.2 + motion.ry - place * 0.24, motion.rz);

            const is2D = itemType && isSpriteRenderedType(itemType);

            if (itemType && !is2D) {
                 groupRef.current.rotateY(-0.2);
                 groupRef.current.rotateZ(0.2);
            }

            if (getPlayerWeaponProfile(itemType) && attackBusy(playerAttack) && playerAttack.kind !== 'crossbow') {
                const pose = attackPose(playerAttack);
                groupRef.current.position.set(0.45 + motion.x + pose.sweep * 0.20, -0.48 + motion.y + pose.shoulder * 0.10, -0.8 + motion.z - pose.thrust * 0.3);
                groupRef.current.rotation.set(0.2 + motion.rx - pose.shoulder * 0.55, -0.2 + motion.ry + pose.twist, motion.rz + pose.sweep);
                return;
            }
            if (getPlayerWeaponProfile(itemType) && attackBusy(playerAttack) && playerAttack.kind === 'crossbow' && !playerAttack.cancelled) {
                const recoil = Math.sin(Math.max(0, (playerAttack.elapsed / playerAttack.duration - 0.5) * 2) * Math.PI);
                groupRef.current.position.set(0.42 + motion.x, -0.45 + motion.y - recoil * 0.06, -0.82 + motion.z + recoil * 0.17);
                groupRef.current.rotation.set(0.12 + motion.rx + recoil * 0.19, -0.13 + motion.ry, motion.rz - 0.02);
            }
        }
    });

    return createPortal(
        <group ref={groupRef} visible={false}>
             {!itemType && skin.model !== 'atlas' && <group position={[0, -0.2, 0.2]} rotation={[Math.PI / 2 + 0.5, 0, -0.2]}>
                 <MinecraftSkinPart skin={skin} texture={skinTexture} part="rightArm" firstPerson />
             </group>}
             {!itemType && skin.model === 'atlas' && (
                 <mesh position={[0, -0.2, 0.2]} rotation={[0.5, 0, -0.2]} renderOrder={999}>
                     <boxGeometry args={[0.2, 0.2, 0.8]} />
                     {handMaterial && <primitive object={handMaterial} attach="material" />}
                 </mesh>
             )}

             {itemType && geometry && itemMaterial && (
                 <mesh geometry={geometry} material={itemMaterial} renderOrder={999} />
             )}
        </group>,
        camera
    );

    
};
