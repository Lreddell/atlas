
import React, { useRef, useMemo, useEffect, useState } from 'react';
import { useFrame, useThree, createPortal } from '@react-three/fiber';
import * as THREE from 'three';
import { ItemStack } from '../types';
import { isSpriteRenderedType } from '../data/spriteBlocks';
import { worldManager } from '../systems/WorldManager';
import { createHeldItemGeometry } from '../systems/player/heldItemGeometry';
import { getPlayerWeaponProfile } from '../systems/combat/vaultWeapons';
import { playerAttack, playerMining, playerInteraction, attackBusy, attackPose } from '../systems/combat/playerAttack';
import { viewRig, firstPersonHandOpacity } from '../systems/player/viewRig';
import { placementPose } from '../systems/player/playerAnimation';
import { inputState } from '../systems/player/playerInput';
import { globalSunlightValue } from './chunkLightingState';
import { usePlayerSkin } from '../systems/player/playerSkins';
import { MinecraftSkinPart } from './MinecraftSkinPart';
import { useSkinTexture } from '../hooks/useSkinTexture';
import { textureAtlasManager } from '../systems/textures/TextureAtlasManager';

interface HeldItemProps {
    selectedSlot: number;
    inventory: (ItemStack | null)[];
    isLocked: boolean;
    brightness: number;
}

const setupEntityMaterial = (mat: THREE.MeshLambertMaterial) => {
    mat.onBeforeCompile = (shader) => {
        shader.uniforms.uSunlight = { value: 1.0 };
        shader.uniforms.uSkyLight = { value: 1.0 };
        shader.uniforms.uBlockLight = { value: 0.0 };
        shader.uniforms.uBrightness = { value: 0.5 };

        shader.fragmentShader = `
            uniform float uSunlight;
            uniform float uSkyLight;
            uniform float uBlockLight;
            uniform float uBrightness;
            vec3 myTorchBaseColor;
            ${shader.fragmentShader}
        `;

        shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', '');

        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <map_fragment>',
            `#ifdef USE_MAP
                vec4 sampledDiffuseColor = texture2D( map, vMapUv );
                diffuseColor *= sampledDiffuseColor;
            #endif

            myTorchBaseColor = diffuseColor.rgb;

            float minLight = 0.05 + (uBrightness * 0.25);
            float skyFactor = max(uSkyLight * uSunlight, minLight);
            diffuseColor.rgb *= skyFactor;
            `
        );

        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <lights_fragment_end>',
            `#include <lights_fragment_end>
            
            float torchIntensity = clamp(uBlockLight, 0.0, 1.0);
            float torchGlow = pow(torchIntensity, 1.8);
            reflectedLight.directDiffuse += myTorchBaseColor * (torchGlow * 0.85);
            `
        );
        
        mat.userData.shader = shader;
    };
};

export const HeldItem: React.FC<HeldItemProps> = ({ selectedSlot, inventory, isLocked, brightness }) => {
    const skin = usePlayerSkin();
    const skinTexture = useSkinTexture(skin);
    const { camera } = useThree();
    const groupRef = useRef<THREE.Group>(null);
    const itemStack = inventory[selectedSlot];
    const itemType = itemStack ? itemStack.type : null;
    const [texture, setTexture] = useState<THREE.Texture | null>(null);

    const moveSway = useRef(0);
    const alphaTests = useRef(new WeakMap<THREE.Material, number>());

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
            // instead of drawing back/interior faces over front ones. The held model
            // sits ~0.8u from the camera (closer than world geometry) so it still
            // renders on top (only clips when the player is face-planted into a block).
            depthTest: true,
            depthWrite: true
        });
        setupEntityMaterial(mat);
        return mat;
    }, [texture]);

    const handMaterial = useMemo(() => {
        const mat = new THREE.MeshLambertMaterial({ 
            color: skin.palette.skin,
            depthTest: false,
            depthWrite: false,
            transparent: true 
        });
        setupEntityMaterial(mat);
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
                    if (!alphaTests.current.has(material)) alphaTests.current.set(material, material.alphaTest);
                    material.opacity = opacity;
                    material.alphaTest = alphaTests.current.get(material)! * opacity;
                }
            });
            const light = worldManager.getLight(Math.floor(camera.position.x), Math.floor(camera.position.y), Math.floor(camera.position.z));
            const uSky = light.sky / 15.0;
            const uBlock = light.block / 15.0;
            
            if (itemMaterial && itemMaterial.userData.shader) {
                const s = itemMaterial.userData.shader;
                if(s.uniforms.uSunlight) s.uniforms.uSunlight.value = globalSunlightValue;
                if(s.uniforms.uSkyLight) s.uniforms.uSkyLight.value = uSky;
                if(s.uniforms.uBlockLight) s.uniforms.uBlockLight.value = uBlock;
                if(s.uniforms.uBrightness) s.uniforms.uBrightness.value = brightness;
            }
            if (handMaterial && handMaterial.userData.shader) {
                const s = handMaterial.userData.shader;
                if(s.uniforms.uSunlight) s.uniforms.uSunlight.value = globalSunlightValue;
                if(s.uniforms.uSkyLight) s.uniforms.uSkyLight.value = uSky;
                if(s.uniforms.uBlockLight) s.uniforms.uBlockLight.value = uBlock;
                if(s.uniforms.uBrightness) s.uniforms.uBrightness.value = brightness;
            }

            // Since we are a child of the camera, we do not copy position/quaternion.
            // We render in local space relative to the camera.

            const isMoving = isLocked && (inputState.forward || inputState.backward || inputState.left || inputState.right);

            const targetSway = isMoving ? 1 : 0;
            moveSway.current = THREE.MathUtils.lerp(moveSway.current, targetSway, 1 - Math.exp(-10 * delta));

            // Viewmodel motion uses render time, never the 20 Hz physics clock.
            const time = state.clock.elapsedTime;
            const bobX = Math.sin(time * 10) * 0.02 * moveSway.current;
            const bobY = Math.sin(time * 20) * 0.02 * moveSway.current;

            const genericAction = isLocked && (playerMining.active || inputState.eating || (playerInteraction.leftHeld && !getPlayerWeaponProfile(itemType)));
            const actionTime = playerMining.active ? playerMining.elapsed : time;
            const swingVal = genericAction ? Math.sin((actionTime % 0.25) / 0.25 * Math.PI) : placementPose(playerInteraction.placementElapsed).weight;
            const swingRot = swingVal * -0.8;
            const swingPos = swingVal * -0.2;
            
            // Set local position relative to camera
            groupRef.current.position.set(0.5 + bobX, -0.5 + bobY + swingPos, -0.8);

            // Set local rotation relative to camera
            groupRef.current.rotation.set(0.2 + swingRot, -0.2 + (swingRot * 0.3), 0);
            
            const is2D = itemType && isSpriteRenderedType(itemType);

            if (itemType && !is2D) {
                 groupRef.current.rotateY(-0.2);
                 groupRef.current.rotateZ(0.2);
            }

            if (getPlayerWeaponProfile(itemType) && attackBusy(playerAttack) && playerAttack.kind !== 'crossbow') {
                const pose = attackPose(playerAttack);
                groupRef.current.position.set(0.45 + bobX + pose.sweep * 0.20, -0.48 + bobY + pose.shoulder * 0.10, -0.8 - pose.thrust * 0.3);
                groupRef.current.rotation.set(0.2 - pose.shoulder * 0.55, -0.2 + pose.twist, pose.sweep);
                return;
            }
            if (getPlayerWeaponProfile(itemType) && attackBusy(playerAttack) && playerAttack.kind === 'crossbow' && !playerAttack.cancelled) {
                const recoil = Math.sin(Math.max(0, (playerAttack.elapsed / playerAttack.duration - 0.5) * 2) * Math.PI);
                groupRef.current.position.set(0.42 + bobX, -0.45 + bobY - recoil * 0.06, -0.82 + recoil * 0.17);
                groupRef.current.rotation.set(0.12 + recoil * 0.19, -0.13, -0.02);
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
