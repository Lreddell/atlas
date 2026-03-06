
import React, { useRef, useMemo, useEffect, useState } from 'react';
import { useFrame, useThree, createPortal } from '@react-three/fiber';
import * as THREE from 'three';
import { ItemStack, BlockType } from '../types';
import { BLOCKS, ATLAS_COLS } from '../data/blocks';
import { getAtlasDimensions, ATLAS_STRIDE, ATLAS_PADDING, ATLAS_RAW_TILE_SIZE } from '../utils/textures';
import { resolveTexture } from '../systems/world/textureResolver';
import { worldManager } from '../systems/WorldManager';
import { globalSunlightValue } from './ChunkMesh';
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
    const { camera, scene } = useThree();
    const groupRef = useRef<THREE.Group>(null);
    const itemStack = inventory[selectedSlot];
    const itemType = itemStack ? itemStack.type : null;
    const [texture, setTexture] = useState<THREE.Texture | null>(null);

    const animState = useRef({ swingPhase: 0, swingStartTime: 0 });
    const pendingPlacementSwing = useRef(false);
    const keysPressed = useRef(new Set<string>());
    const isLeftMouseDown = useRef(false);
    const isRightMouseDown = useRef(false);
    const moveSway = useRef(0); 
    const isLockedRef = useRef(isLocked);
    
    const itemStackRef = useRef(itemStack);
    useEffect(() => { itemStackRef.current = itemStack; }, [itemStack]);

    useEffect(() => {
        setTexture(textureAtlasManager.getTexture());
    }, []);

    useEffect(() => {
        isLockedRef.current = isLocked;
        if (!isLocked) {
            isLeftMouseDown.current = false;
            isRightMouseDown.current = false;
        }
    }, [isLocked]);

    // Ensure camera is part of the scene graph so its children (the hand) are rendered
    useEffect(() => {
        scene.add(camera);
        return () => {
            scene.remove(camera);
        };
    }, [scene, camera]);

    const itemMaterial = useMemo(() => {
        if (!texture) return null;
        const mat = new THREE.MeshLambertMaterial({ 
            map: texture, 
            transparent: true, 
            alphaTest: 0.5, 
            side: THREE.DoubleSide,
            depthTest: false,
            depthWrite: false
        });
        setupEntityMaterial(mat);
        return mat;
    }, [texture]);

    const handMaterial = useMemo(() => {
        const mat = new THREE.MeshLambertMaterial({ 
            color: "#eebb99",
            depthTest: false,
            depthWrite: false,
            transparent: true 
        });
        setupEntityMaterial(mat);
        return mat;
    }, []);

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => keysPressed.current.add(e.code);
        const onKeyUp = (e: KeyboardEvent) => keysPressed.current.delete(e.code);
        const onPlacement = () => {
            pendingPlacementSwing.current = true;
        };
        
        const onMouseDown = (e: MouseEvent) => { 
            if (!isLockedRef.current) {
                isLeftMouseDown.current = false;
                isRightMouseDown.current = false;
                return;
            }
            if(e.button === 0) isLeftMouseDown.current = true;
            if(e.button === 2 && itemStackRef.current) isRightMouseDown.current = true;
        };
        const onMouseUp = (e: MouseEvent) => { 
            if(e.button === 0) isLeftMouseDown.current = false;
            if(e.button === 2) isRightMouseDown.current = false;
        };

        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);
        window.addEventListener('mousedown', onMouseDown);
        window.addEventListener('mouseup', onMouseUp);
        window.addEventListener('atlas:block-placed', onPlacement as EventListener);
        
        return () => {
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('keyup', onKeyUp);
            window.removeEventListener('mousedown', onMouseDown);
            window.removeEventListener('mouseup', onMouseUp);
            window.removeEventListener('atlas:block-placed', onPlacement as EventListener);
        };
    }, []);

    const geometry = useMemo(() => {
        if (!itemType) return null;
        const def = BLOCKS[itemType];
        
        const is2D = def.isItem || 
                     itemType === BlockType.TORCH || 
                     itemType === BlockType.BED_ITEM ||
                     itemType === BlockType.DEAD_BUSH ||
                     itemType === BlockType.GRASS_PLANT ||
                     itemType === BlockType.ROSE ||
                     itemType === BlockType.DANDELION ||
                     itemType === BlockType.DEBUG_CROSS ||
                     itemType === BlockType.WHEAT_SEEDS ||
                     itemType === BlockType.PINK_FLOWER;

        if (!is2D) {
            const geo = new THREE.BoxGeometry(0.4, 0.4, 0.4);
            const uvAttribute = geo.attributes.uv;
            const directions = ['right', 'left', 'top', 'bottom', 'front', 'back'] as const;
            const vectors = [[1,0,0], [-1,0,0], [0,1,0], [0,-1,0], [0,0,1], [0,0,-1]];

            directions.forEach((dir, i) => {
                const vec = vectors[i];
                const { uvs } = resolveTexture(itemType, dir, vec[0], vec[1], vec[2], 0);
                const base = i * 4;
                uvAttribute.setXY(base + 0, uvs[6], uvs[7]); 
                uvAttribute.setXY(base + 1, uvs[4], uvs[5]); 
                uvAttribute.setXY(base + 2, uvs[0], uvs[1]); 
                uvAttribute.setXY(base + 3, uvs[2], uvs[3]); 
            });
            uvAttribute.needsUpdate = true;
            return geo;
        } else {
             const geo = new THREE.PlaneGeometry(0.5, 0.5);
             const uvAttribute = geo.attributes.uv;
             const texIdx = def.textureSlot || 0;
             const { width, height } = getAtlasDimensions();
             
             const col = texIdx % ATLAS_COLS; 
             const row = Math.floor(texIdx / ATLAS_COLS);
             const pxX = col * ATLAS_STRIDE + ATLAS_PADDING;
             const pxY = row * ATLAS_STRIDE + ATLAS_PADDING;

             const u0 = pxX / width;
             const u1 = (pxX + ATLAS_RAW_TILE_SIZE) / width;
             const v1 = 1.0 - (pxY / height);
             const v0 = 1.0 - ((pxY + ATLAS_RAW_TILE_SIZE) / height);

             uvAttribute.setXY(0, u0, v1); 
             uvAttribute.setXY(1, u1, v1); 
             uvAttribute.setXY(2, u0, v0); 
             uvAttribute.setXY(3, u1, v0); 
             uvAttribute.needsUpdate = true;
             return geo;
        }
    }, [itemType]);

    useFrame((state, delta) => {
        if (groupRef.current) {
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

            const isMoving = isLocked && (
                keysPressed.current.has('KeyW') || keysPressed.current.has('KeyS') || 
                keysPressed.current.has('KeyA') || keysPressed.current.has('KeyD')
            );
            
            const targetSway = isMoving ? 1 : 0;
            moveSway.current = THREE.MathUtils.lerp(moveSway.current, targetSway, 1 - Math.exp(-10 * delta));

            const time = state.clock.elapsedTime;
            const bobX = Math.sin(time * 10) * 0.02 * moveSway.current;
            const bobY = Math.sin(time * 20) * 0.02 * moveSway.current;

            const isAction = (isLeftMouseDown.current || isRightMouseDown.current) && isLocked;
            const SWING_DURATION = 0.25; 

            if (pendingPlacementSwing.current && animState.current.swingPhase === 0) {
                animState.current.swingStartTime = time;
                animState.current.swingPhase = Number.EPSILON;
                pendingPlacementSwing.current = false;
            }

            if (isAction && animState.current.swingPhase === 0) {
                animState.current.swingStartTime = time;
                animState.current.swingPhase = Number.EPSILON;
            }

            if (animState.current.swingPhase !== 0) {
                const elapsed = time - animState.current.swingStartTime;
                if (elapsed > 0) {
                    const progress = elapsed / SWING_DURATION;
                    if (progress >= 1.0) {
                        animState.current.swingPhase = 0;
                    } else {
                        animState.current.swingPhase = progress * Math.PI;
                    }
                }
            }

            const swingVal = Math.sin(animState.current.swingPhase);
            const swingRot = swingVal * -0.8;
            const swingPos = swingVal * -0.2;
            
            // Set local position relative to camera
            groupRef.current.position.set(0.5 + bobX, -0.5 + bobY + swingPos, -0.8);

            // Set local rotation relative to camera
            groupRef.current.rotation.set(0.2 + swingRot, -0.2 + (swingRot * 0.3), 0);
            
            const is2D = itemType && (
                BLOCKS[itemType].isItem || 
                itemType === BlockType.TORCH ||
                itemType === BlockType.BED_ITEM ||
                itemType === BlockType.DEAD_BUSH ||
                itemType === BlockType.GRASS_PLANT ||
                itemType === BlockType.ROSE ||
                itemType === BlockType.DANDELION ||
                itemType === BlockType.DEBUG_CROSS ||
                itemType === BlockType.WHEAT_SEEDS ||
                itemType === BlockType.PINK_FLOWER
            );

            if (itemType && !is2D) {
                 groupRef.current.rotateY(-0.2);
                 groupRef.current.rotateZ(0.2);
            }
        }
    });

    return createPortal(
        <group ref={groupRef}>
             {!itemType && (
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
