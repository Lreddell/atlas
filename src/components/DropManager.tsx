
import React, { useRef, useMemo, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Drop, BlockType } from '../types';
import { BLOCKS, ATLAS_COLS } from '../data/blocks';
import { worldManager } from '../systems/WorldManager';
import { getAtlasDimensions, ATLAS_STRIDE, ATLAS_PADDING, ATLAS_RAW_TILE_SIZE } from '../utils/textures';
import { resolveTexture } from '../systems/world/textureResolver';
import { globalSunlightValue } from './ChunkMesh';
import { textureAtlasManager } from '../systems/textures/TextureAtlasManager';

interface DropManagerProps {
    drops: Drop[];
    playerPos: THREE.Vector3;
    onCollect: (id: string, type: BlockType, count: number) => void;
    onDestroy: (id: string) => void;
    isPaused: boolean;
    brightness: number;
}

// Shader injection for Drops - Matching HeldItem/Entity logic
const setupDropMaterial = (mat: THREE.MeshLambertMaterial) => {
    mat.onBeforeCompile = (shader) => {
        // Uniforms for lighting control
        shader.uniforms.uSunlight = { value: 1.0 };
        shader.uniforms.uBrightness = { value: 0.5 };
        
        shader.vertexShader = shader.vertexShader.replace(
            '#include <color_vertex>',
            `#include <color_vertex>
            #ifdef USE_INSTANCING_COLOR
                vColor = instanceColor;
            #endif`
        );

        shader.fragmentShader = `
            uniform float uSunlight;
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

            // Apply Burning Red Tint if vColor.b < 0.9
            if (vColor.b < 0.9) {
                 diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.2, 0.2), 0.7);
            }

            myTorchBaseColor = diffuseColor.rgb;

            // Light Calculation (Entity Style)
            float minLight = 0.05 + (uBrightness * 0.25);
            float skyFactor = max(vColor.r * uSunlight, minLight);
            diffuseColor.rgb *= skyFactor;
            `
        );

        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <lights_fragment_end>',
            `#include <lights_fragment_end>
            
            float torchIntensity = clamp(vColor.g, 0.0, 1.0);
            float torchGlow = pow(torchIntensity, 1.8);
            reflectedLight.directDiffuse += myTorchBaseColor * (torchGlow * 0.85);
            `
        );

        mat.userData.shader = shader;
    };
};

const MAX_DROPS_PER_TYPE = 128; // Buffer size for instances

const DropGroup: React.FC<{ type: BlockType, drops: Drop[], burningDrops: React.MutableRefObject<Map<string, number>>, isPaused: boolean, brightness: number }> = ({ type, drops, burningDrops, isPaused, brightness }) => {
    const meshRef = useRef<THREE.InstancedMesh>(null);
    const dummy = useMemo(() => new THREE.Object3D(), []);
    const [texture, setTexture] = useState<THREE.Texture | null>(null);
    const colorScratch = useMemo(() => new THREE.Color(), []);

    useEffect(() => {
        setTexture(textureAtlasManager.getTexture());
    }, []);

    const geometry = useMemo(() => {
        const def = BLOCKS[type];
        
        const is2D = def.isItem || 
                     type === BlockType.TORCH || 
                     type === BlockType.BED_ITEM ||
                     type === BlockType.DEAD_BUSH ||
                     type === BlockType.GRASS_PLANT ||
                     type === BlockType.ROSE ||
                     type === BlockType.DANDELION ||
                     type === BlockType.DEBUG_CROSS ||
                     type === BlockType.WHEAT_SEEDS ||
                     type === BlockType.PINK_FLOWER ||
                     type === BlockType.SPRUCE_SAPLING ||
                     type === BlockType.BIRCH_SAPLING ||
                     type === BlockType.CHERRY_SAPLING;

        if (is2D) {
            const geo = new THREE.PlaneGeometry(0.4, 0.4);
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

            uvAttribute.setXY(0, u0, v1); // TL
            uvAttribute.setXY(1, u1, v1); // TR
            uvAttribute.setXY(2, u0, v0); // BL
            uvAttribute.setXY(3, u1, v0); // BR
            
            uvAttribute.needsUpdate = true;
            return geo;
        } else {
            // Block Drop (Mini Block)
            const geo = new THREE.BoxGeometry(0.25, 0.25, 0.25);
            const uvAttribute = geo.attributes.uv;
            
            const directions = ['right', 'left', 'top', 'bottom', 'front', 'back'] as const;
            const vectors = [
                [1,0,0], [-1,0,0], [0,1,0], [0,-1,0], [0,0,1], [0,0,-1]
            ];

            directions.forEach((dir, i) => {
                const vec = vectors[i];
                const { uvs } = resolveTexture(type, dir, vec[0], vec[1], vec[2], 0);
                const base = i * 4;
                uvAttribute.setXY(base + 0, uvs[6], uvs[7]); // TL
                uvAttribute.setXY(base + 1, uvs[4], uvs[5]); // TR
                uvAttribute.setXY(base + 2, uvs[0], uvs[1]); // BL
                uvAttribute.setXY(base + 3, uvs[2], uvs[3]); // BR
            });

            uvAttribute.needsUpdate = true;
            return geo;
        }
    }, [type]);
    
    // Set up material with custom shader once
    const material = useMemo(() => {
        if (!texture) return null;
        const mat = new THREE.MeshLambertMaterial({ 
            map: texture, 
            transparent: true, 
            alphaTest: 0.5, 
            side: THREE.DoubleSide,
            vertexColors: true 
        });
        setupDropMaterial(mat);
        return mat;
    }, [texture]);

    useFrame((state, _) => {
        if (isPaused) return; // Pause rendering updates for drops
        if (!meshRef.current || !material) return;
        
        // Update Sunlight Uniform
        if (material.userData.shader) {
            if (material.userData.shader.uniforms.uSunlight) {
                material.userData.shader.uniforms.uSunlight.value = globalSunlightValue;
            }
            if (material.userData.shader.uniforms.uBrightness) {
                material.userData.shader.uniforms.uBrightness.value = brightness;
            }
        }

        let i = 0;
        const now = Date.now();
        
        // Count limits to avoid overflow
        const count = Math.min(drops.length, MAX_DROPS_PER_TYPE);

        for (let j = 0; j < count; j++) {
             const drop = drops[j];
             
             dummy.position.set(drop.position[0], drop.position[1], drop.position[2]);
             
             // Check if burning
             const timeOfDeath = burningDrops.current.get(drop.id);
             let scale = 1.0;
             let isBurning = false;

             if (timeOfDeath) {
                 const startTime = timeOfDeath - 500;
                 const progress = Math.min(1, (now - startTime) / 500);
                 scale = Math.max(0, 1.0 - progress);
                 isBurning = true;
                 
                 // Jitter while burning
                 dummy.position.x += (Math.random() - 0.5) * 0.1;
                 dummy.position.y += (Math.random() - 0.5) * 0.1;
                 dummy.position.z += (Math.random() - 0.5) * 0.1;
             }

             // Spin effect
             const time = state.clock.elapsedTime;
             dummy.rotation.set(0, time * 2 + (drop.id.charCodeAt(0)), 0);
             
             // If block is 2D item, face camera mostly or just spin around Y
             const def = BLOCKS[type];
             const is2D = def.isItem || 
                     type === BlockType.TORCH || 
                     type === BlockType.BED_ITEM ||
                     type === BlockType.DEAD_BUSH ||
                     type === BlockType.GRASS_PLANT ||
                     type === BlockType.ROSE ||
                     type === BlockType.DANDELION ||
                     type === BlockType.DEBUG_CROSS ||
                     type === BlockType.WHEAT_SEEDS ||
                     type === BlockType.PINK_FLOWER ||
                     type === BlockType.SPRUCE_SAPLING ||
                     type === BlockType.BIRCH_SAPLING ||
                     type === BlockType.CHERRY_SAPLING;

             if (!is2D) {
                 dummy.rotation.x = Math.sin(time) * 0.5;
                 dummy.rotation.z = Math.cos(time) * 0.5;
             }

             // Hover
             dummy.position.y += Math.sin(time * 3 + (drop.id.charCodeAt(0))) * 0.1;

             dummy.scale.setScalar(scale);
             dummy.updateMatrix();
             meshRef.current!.setMatrixAt(i, dummy.matrix);
             
             const bx = Math.floor(drop.position[0]);
             const by = Math.floor(drop.position[1] + 0.5); 
             const bz = Math.floor(drop.position[2]);
             
             const light = worldManager.getLight(bx, by, bz);
             
             const r = light.sky / 15.0;
             const g = light.block / 15.0;
             const b = isBurning ? 0.0 : 1.0;
             
             colorScratch.setRGB(r, g, b);
             meshRef.current!.setColorAt(i, colorScratch);
             
             i++;
        }
        
        meshRef.current.count = count;
        meshRef.current.instanceMatrix.needsUpdate = true;
        if(meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
    });

    if (!material) return null;

    return (
        <instancedMesh ref={meshRef} args={[geometry, undefined, MAX_DROPS_PER_TYPE]} frustumCulled={false} material={material}>
        </instancedMesh>
    );
};

export const DropManager: React.FC<DropManagerProps> = ({ drops, playerPos, onCollect, onDestroy, isPaused, brightness }) => {
    // Map of ID -> Timestamp when burning started
    const burningDrops = useRef<Map<string, number>>(new Map());
    const accumulator = useRef(0);

    useFrame((_, delta) => {
        if (isPaused) return;

        // Use accumulator pattern to ensure physics speed is framerate independent
        const frameTime = Math.min(delta, 0.2); // Cap max delta to prevent death spiral
        accumulator.current += frameTime;
        
        const FIXED_STEP = 1 / 60;
        const MAX_STEPS = 5;
        let steps = 0;

        const now = Date.now();

        // Process Burning Queues (Time check only, cheap)
        burningDrops.current.forEach((deathTime, id) => {
            if (now >= deathTime) {
                onDestroy(id);
                burningDrops.current.delete(id);
            }
        });

        // Run Fixed Steps
        while (accumulator.current >= FIXED_STEP && steps < MAX_STEPS) {
            const dt = FIXED_STEP;

            drops.forEach(drop => {
                // If already marked for death, skip physics
                if (burningDrops.current.has(drop.id)) return;

                // Physics update
                drop.velocity[1] -= 20.0 * dt; 
                drop.velocity[1] = Math.max(drop.velocity[1], -20);

                const oldPos = new THREE.Vector3(...drop.position);
                const moveVec = new THREE.Vector3(...drop.velocity).multiplyScalar(dt);
                const newPos = oldPos.clone().add(moveVec);
                
                const bx = Math.floor(newPos.x);
                const by = Math.floor(newPos.y - 0.15); 
                const bz = Math.floor(newPos.z);

                const blockAtFeet = worldManager.getBlock(bx, by, bz, false);
                const blockInBody = worldManager.getBlock(Math.floor(newPos.x), Math.floor(newPos.y), Math.floor(newPos.z), false);

                // Lava Destruction Logic
                if (blockAtFeet === BlockType.LAVA || blockInBody === BlockType.LAVA) {
                    // Mark for death in 500ms
                    if (!burningDrops.current.has(drop.id)) {
                        burningDrops.current.set(drop.id, now + 500);
                    }
                    
                    // Slow down in lava
                    drop.velocity[0] *= 0.5;
                    drop.velocity[1] *= 0.5;
                    drop.velocity[2] *= 0.5;
                }

                if (blockAtFeet !== BlockType.AIR && blockAtFeet !== BlockType.WATER && blockAtFeet !== BlockType.LAVA && !BLOCKS[blockAtFeet].noCollision) {
                    newPos.y = by + 1.15; 
                    drop.velocity[1] = 0;
                    drop.velocity[0] *= 0.5; 
                    drop.velocity[2] *= 0.5;
                }

                const sideBlockX = worldManager.getBlock(Math.floor(newPos.x), Math.floor(newPos.y), Math.floor(oldPos.z), false);
                if (sideBlockX !== BlockType.AIR && sideBlockX !== BlockType.WATER && sideBlockX !== BlockType.LAVA && !BLOCKS[sideBlockX].noCollision) {
                    newPos.x = oldPos.x;
                    drop.velocity[0] *= -0.5;
                }
                const sideBlockZ = worldManager.getBlock(Math.floor(oldPos.x), Math.floor(newPos.y), Math.floor(newPos.z), false);
                if (sideBlockZ !== BlockType.AIR && sideBlockZ !== BlockType.WATER && sideBlockZ !== BlockType.LAVA && !BLOCKS[sideBlockZ].noCollision) {
                    newPos.z = oldPos.z;
                    drop.velocity[2] *= -0.5;
                }

                const canPickup = now > drop.pickupDelay;
                const dist = newPos.distanceTo(playerPos);
                
                if (canPickup && !burningDrops.current.has(drop.id)) {
                    if (dist < 1.4) {
                        onCollect(drop.id, drop.type, drop.count);
                        newPos.set(0, -5000, 0); 
                    } else if (dist < 5.0) {
                        const dir = playerPos.clone().sub(newPos).normalize();
                        const pullStrength = (5.0 - dist) * 25.0 * dt;
                        drop.velocity[0] += dir.x * pullStrength;
                        drop.velocity[1] += dir.y * pullStrength + (2.0 * dt); 
                        drop.velocity[2] += dir.z * pullStrength;
                    }
                }
                drop.position = [newPos.x, newPos.y, newPos.z];
            });

            accumulator.current -= FIXED_STEP;
            steps++;
        }

        // Safety clamp if simulation fell behind (e.g. freeze)
        if (accumulator.current > FIXED_STEP) accumulator.current = 0;
    });

    const dropsByType = useMemo(() => {
        const groups: Record<number, Drop[]> = {};
        drops.forEach(d => {
            if (d.position[1] < -100) return;
            if (!groups[d.type]) groups[d.type] = [];
            groups[d.type].push(d);
        });
        return groups;
    }, [drops]);

    return (
        <group>
            {Object.keys(dropsByType).map(t => (
                <DropGroup key={t} type={Number(t)} drops={dropsByType[Number(t)]} burningDrops={burningDrops} isPaused={isPaused} brightness={brightness} />
            ))}
        </group>
    );
};
