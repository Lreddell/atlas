
import React, { useRef, useMemo, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Drop, BlockType, type ItemStack } from '../types';
import { BLOCKS, ATLAS_COLS } from '../data/blocks';
import { isSpriteRenderedType } from '../data/spriteBlocks';
import { worldManager } from '../systems/WorldManager';
import { getAtlasDimensions, ATLAS_STRIDE, ATLAS_PADDING, ATLAS_RAW_TILE_SIZE } from '../utils/textures';
import { resolveTexture } from '../systems/world/textureResolver';
import { buildShapedBlockGeometry } from '../systems/world/shapedGeometry';
import { textureAtlasManager } from '../systems/textures/TextureAtlasManager';
import { isMagneticMetalItem } from '../systems/registry/metalItems';
import {
    MAGNET_RANGE,
    collectMagnetSources,
    sampleRawMagneticField,
    type MagnetSource,
} from '../systems/player/magneticField';
import { applyMagneticFieldToVelocity } from '../systems/player/dropMagnetism';
import { applyEntityLighting } from '../systems/graphics/materials/entityLighting';
import {
    PICKUP_FLIGHT_MS,
    PICKUP_TARGET_HEIGHT,
    dropPhase,
    pickupFlight,
    spawnPop,
    type PickupFlight,
} from '../systems/fx/dropMotion';

interface DropManagerProps {
    drops: Drop[];
    playerPos: THREE.Vector3;
    onCollect: (id: string, stack: ItemStack) => boolean;
    onDestroy: (id: string) => void;
    /** True while the player can't collect (dead): no pickup and no pull. */
    pickupsBlocked?: boolean;
    /** performance.now() before which pickup and pull stay off (respawn grace). */
    pickupLockUntilRef?: React.MutableRefObject<number>;
    isPaused: boolean;
    /** Unused: the Brightness option reaches drops through the shared world light. */
    brightness?: number;
}

// Drops carry their voxel light in the instance colour (r sky, g block) and are
// lit like the blocks around them (entityLighting.ts); b < 0.9 marks a drop
// burning in lava, tinted red.
const setupDropMaterial = (mat: THREE.MeshLambertMaterial) => {
    mat.onBeforeCompile = (shader) => {
        shader.vertexShader = shader.vertexShader.replace(
            '#include <color_vertex>',
            `#include <color_vertex>
            #ifdef USE_INSTANCING_COLOR
                vColor = instanceColor;
            #endif`
        );
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <map_fragment>',
            `#include <map_fragment>
            if (vColor.b < 0.9) {
                 diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.2, 0.2), 0.7);
            }`
        );
    };
    mat.customProgramCacheKey = () => 'atlas-drop-v2';
    applyEntityLighting(mat, { kind: 'instance' });
};

const MAX_DROPS_PER_TYPE = 128; // Buffer size for instances
const NO_DROPS: Drop[] = [];

/** An item that was just collected, drawn flying into the player (it has already left `drops`). */
interface PickupGhost {
    type: BlockType;
    x: number;
    y: number;
    z: number;
    start: number;
    phase: number;
}

const _flight: PickupFlight = { pull: 0, arc: 0, scale: 1, hover: 1 };

/** Idle spin, tilt and bob for a drop (or a collected item on its way in). */
function poseDrop(dummy: THREE.Object3D, time: number, phase: number, is2D: boolean, hover: number): void {
    dummy.rotation.set(0, time * 1.8 + phase, 0);
    if (!is2D) {
        // Mini blocks rock gently as they turn instead of tumbling.
        dummy.rotation.x = Math.sin(time * 1.3 + phase) * 0.2;
        dummy.rotation.z = Math.cos(time * 1.1 + phase) * 0.2;
    }
    dummy.position.y += Math.sin(time * 2.6 + phase) * 0.08 * hover;
}

const DropGroup: React.FC<{ type: BlockType, drops: Drop[], ghosts: PickupGhost[], playerPos: THREE.Vector3, burningDrops: React.MutableRefObject<Map<string, number>>, isPaused: boolean }> = ({ type, drops, ghosts, playerPos, burningDrops, isPaused }) => {
    const meshRef = useRef<THREE.InstancedMesh>(null);
    const dummy = useMemo(() => new THREE.Object3D(), []);
    const [texture, setTexture] = useState<THREE.Texture | null>(null);
    const colorScratch = useMemo(() => new THREE.Color(), []);

    useEffect(() => {
        setTexture(textureAtlasManager.getTexture());
    }, []);

    const geometry = useMemo(() => {
        const def = BLOCKS[type];

        // Slabs / stairs: render the real partial-box shape instead of a full mini-cube.
        if (def.shape) {
            const parentType = (def.textureParent ?? type) as BlockType;
            return buildShapedBlockGeometry(type, parentType, 0.25);
        }

        const is2D = isSpriteRenderedType(type);

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

        let i = 0;
        const now = Date.now();
        const time = state.clock.elapsedTime;
        const mesh = meshRef.current;
        const is2D = isSpriteRenderedType(type);

        const writeInstance = (x: number, y: number, z: number, isBurning: boolean) => {
            dummy.updateMatrix();
            mesh.setMatrixAt(i, dummy.matrix);
            const light = worldManager.getLight(Math.floor(x), Math.floor(y + 0.5), Math.floor(z));
            colorScratch.setRGB(light.sky / 15.0, light.block / 15.0, isBurning ? 0.0 : 1.0);
            mesh.setColorAt(i, colorScratch);
            i++;
        };

        // Count limits to avoid overflow
        const count = Math.min(drops.length, MAX_DROPS_PER_TYPE);

        for (let j = 0; j < count; j++) {
             const drop = drops[j];

             dummy.position.set(drop.position[0], drop.position[1], drop.position[2]);

             // Check if burning
             const timeOfDeath = burningDrops.current.get(drop.id);
             // New drops pop up to size instead of appearing at once.
             let scale = spawnPop(now - drop.createdAt);
             let isBurning = false;

             if (timeOfDeath) {
                 const startTime = timeOfDeath - 500;
                 const progress = Math.min(1, (now - startTime) / 500);
                 scale *= Math.max(0, 1.0 - progress);
                 isBurning = true;

                 // Jitter while burning
                 dummy.position.x += (Math.random() - 0.5) * 0.1;
                 dummy.position.y += (Math.random() - 0.5) * 0.1;
                 dummy.position.z += (Math.random() - 0.5) * 0.1;
             }

             poseDrop(dummy, time, dropPhase(drop.id), is2D, 1);
             dummy.scale.setScalar(scale);
             writeInstance(drop.position[0], drop.position[1], drop.position[2], isBurning);
        }

        // Items just collected fly into the player, shrinking as they go.
        for (const ghost of ghosts) {
             if (ghost.type !== type || i >= MAX_DROPS_PER_TYPE) continue;
             const flight = pickupFlight(now - ghost.start, _flight);
             if (!flight) continue;
             const x = ghost.x + (playerPos.x - ghost.x) * flight.pull;
             const y = ghost.y + (playerPos.y + PICKUP_TARGET_HEIGHT - ghost.y) * flight.pull + flight.arc;
             const z = ghost.z + (playerPos.z - ghost.z) * flight.pull;
             dummy.position.set(x, y, z);
             poseDrop(dummy, time, ghost.phase, is2D, flight.hover);
             dummy.scale.setScalar(flight.scale);
             writeInstance(x, y, z, false);
        }

        meshRef.current.count = i;
        meshRef.current.instanceMatrix.needsUpdate = true;
        if(meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
    });

    if (!material) return null;

    return (
        <instancedMesh ref={meshRef} args={[geometry, undefined, MAX_DROPS_PER_TYPE]} frustumCulled={false} material={material}>
        </instancedMesh>
    );
};

// Scratch vectors reused across all drops and steps, this loop runs per drop per
// 60 Hz fixed step, and allocating Vector3s here was a steady GC churn source.
const _dropOldPos = new THREE.Vector3();
const _dropNewPos = new THREE.Vector3();
const _dropPullDir = new THREE.Vector3();
const MAGNET_SOURCE_CACHE_MS = 250;
const MAGNET_SOURCE_CACHE_PRUNE_MS = 2000;
const MAGNET_BLOCK_IDS = {
    positiveMagnet: BlockType.POSITIVE_MAGNET,
    negativeMagnet: BlockType.NEGATIVE_MAGNET,
    ironBlock: BlockType.IRON_BLOCK,
};
const getWorldBlock = (x: number, y: number, z: number) => worldManager.getBlock(x, y, z, false);

interface MagnetSourceCacheEntry {
    expiresAt: number;
    sources: MagnetSource[];
}

export const DropManager: React.FC<DropManagerProps> = ({ drops, playerPos, onCollect, onDestroy, pickupsBlocked = false, pickupLockUntilRef, isPaused }) => {
    // Map of ID -> Timestamp when burning started
    const burningDrops = useRef<Map<string, number>>(new Map());
    const magnetSourceCache = useRef<Map<string, MagnetSourceCacheEntry>>(new Map());
    // Collected items still flying in; they have already left `drops`.
    const pickupGhosts = useRef<PickupGhost[]>([]);
    const nextMagnetCachePrune = useRef(0);
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
        if (now >= nextMagnetCachePrune.current) {
            magnetSourceCache.current.forEach((entry, key) => {
                if (entry.expiresAt < now) magnetSourceCache.current.delete(key);
            });
            nextMagnetCachePrune.current = now + MAGNET_SOURCE_CACHE_PRUNE_MS;
        }

        const ghosts = pickupGhosts.current;
        for (let k = ghosts.length - 1; k >= 0; k--) {
            if (now - ghosts[k].start >= PICKUP_FLIGHT_MS) ghosts.splice(k, 1);
        }

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

                if (isMagneticMetalItem(drop.type)) {
                    const centerX = Math.floor(drop.position[0]);
                    const centerY = Math.floor(drop.position[1]);
                    const centerZ = Math.floor(drop.position[2]);
                    const cacheKey = `${centerX},${centerY},${centerZ}`;
                    let cached = magnetSourceCache.current.get(cacheKey);

                    if (!cached || cached.expiresAt <= now) {
                        cached = {
                            expiresAt: now + MAGNET_SOURCE_CACHE_MS,
                            sources: collectMagnetSources(
                                getWorldBlock,
                                centerX,
                                centerY,
                                centerZ,
                                MAGNET_RANGE,
                                MAGNET_BLOCK_IDS,
                            ),
                        };
                        magnetSourceCache.current.set(cacheKey, cached);
                    }

                    if (cached.sources.length > 0) {
                        const field = sampleRawMagneticField(
                            cached.sources,
                            drop.position[0],
                            drop.position[1],
                            drop.position[2],
                        );
                        applyMagneticFieldToVelocity(
                            drop.velocity,
                            field,
                            dt,
                            drop.type === BlockType.NEGATIVE_MAGNET ? -1 : 1,
                        );
                    }
                }

                // Physics update
                drop.velocity[1] -= 20.0 * dt; 
                drop.velocity[1] = Math.max(drop.velocity[1], -20);

                const oldPos = _dropOldPos.set(drop.position[0], drop.position[1], drop.position[2]);
                const newPos = _dropNewPos.set(
                    drop.position[0] + drop.velocity[0] * dt,
                    drop.position[1] + drop.velocity[1] * dt,
                    drop.position[2] + drop.velocity[2] * dt
                );
                
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

                const canPickup = now > drop.pickupDelay && !pickupsBlocked
                    && (!pickupLockUntilRef || performance.now() >= pickupLockUntilRef.current);
                const dist = newPos.distanceTo(playerPos);
                
                if (canPickup && !burningDrops.current.has(drop.id)) {
                    if (dist < 1.4) {
                        const fullyCollected = onCollect(drop.id, {
                            type: drop.type,
                            count: drop.count,
                            instance: drop.instance ? structuredClone(drop.instance) : undefined,
                        });
                        if (fullyCollected) {
                            pickupGhosts.current.push({
                                type: drop.type,
                                x: newPos.x,
                                y: newPos.y,
                                z: newPos.z,
                                start: now,
                                phase: dropPhase(drop.id),
                            });
                            newPos.set(0, -5000, 0);
                        } else {
                            drop.pickupDelay = now + 250;
                        }
                    } else if (dist < 5.0) {
                        const dir = _dropPullDir.copy(playerPos).sub(newPos).normalize();
                        const pullStrength = (5.0 - dist) * 25.0 * dt;
                        drop.velocity[0] += dir.x * pullStrength;
                        drop.velocity[1] += dir.y * pullStrength + (2.0 * dt);
                        drop.velocity[2] += dir.z * pullStrength;
                    }
                }
                drop.position[0] = newPos.x;
                drop.position[1] = newPos.y;
                drop.position[2] = newPos.z;
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

    // A group stays mounted while its last item is still flying in: collecting
    // it removes it from `drops` in the same update that starts the flight.
    const groupTypes = new Set(Object.keys(dropsByType).map(Number));
    for (const ghost of pickupGhosts.current) groupTypes.add(ghost.type);

    return (
        <group>
            {[...groupTypes].map(t => (
                <DropGroup key={t} type={t} drops={dropsByType[t] ?? NO_DROPS} ghosts={pickupGhosts.current} playerPos={playerPos} burningDrops={burningDrops} isPaused={isPaused} />
            ))}
        </group>
    );
};
