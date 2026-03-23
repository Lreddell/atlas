
import { useRef, useEffect, useCallback, useMemo } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { worldManager } from '../../systems/WorldManager';
import { BLOCKS } from '../../data/blocks';
import {
    type BreakingVisual,
    type GameMode,
    type OpenContainerState,
    BlockType,
    ItemStack,
} from '../../types';
import { eatFood, EXHAUSTION_COSTS, type FoodState } from '../../systems/player/playerFood';
import { inputState } from '../../systems/player/playerInput';
import { 
    PLAYER_WIDTH, PLAYER_HEIGHT, PLAYER_HEIGHT_SNEAK, 
    EYE_HEIGHT_STANDING, EYE_HEIGHT_SNEAKING 
} from '../../systems/player/playerConstants';
import { soundManager } from '../../systems/sound/SoundManager';
import { getBlockSoundGroup } from '../../systems/sound/blockSoundGroups';
import { getLunarNightEventState } from '../../systems/world/celestialEvents';
import { isSaplingType, isValidSoil } from '../../systems/world/trees';

interface InteractionControllerProps {
    isLocked: boolean;
    selectedSlot: number;
    inventory: (ItemStack | null)[];
    consumeItem: (slot: number) => void;
    spawnDrop: (type: BlockType, x: number, y: number, z: number) => void;
    setBreakingVisual: Dispatch<SetStateAction<BreakingVisual | null>>;
    setOpenContainer: (value: OpenContainerState) => void;
    openContainer: OpenContainerState;
    gameMode: GameMode;
    setInventory: Dispatch<SetStateAction<(ItemStack | null)[]>>;
    isDead: boolean;
    foodStateRef: MutableRefObject<FoodState>;
    setIsSleeping: Dispatch<SetStateAction<boolean>>;
    onSleepInBed?: (x: number, y: number, z: number) => void;
}

export const InteractionController = ({ 
    isLocked, selectedSlot, inventory, consumeItem, spawnDrop, setBreakingVisual, setOpenContainer, openContainer, gameMode,
    setInventory, isDead, foodStateRef, setIsSleeping, onSleepInBed
}: InteractionControllerProps) => {
    const { camera, scene } = useThree();
    const raycaster = useRef(new THREE.Raycaster());
    const highlightMeshRef = useRef<THREE.LineSegments>(null);
    
    // Interaction State
    const breakingRef = useRef<{ x: number, y: number, z: number, progress: number } | null>(null);
    const isLeftMouseDown = useRef(false);
    const isRightMouseDown = useRef(false);
    const interactionCooldown = useRef(0);
    const eatingTimer = useRef(0);
    const lastPlacementTime = useRef(0);
    const lastBreakTime = useRef(0);
    const lastHitSoundTime = useRef(0);

    // Refs for props to avoid re-binding listeners
    const inventoryRef = useRef(inventory);
    const selectedSlotRef = useRef(selectedSlot);
    
    const prevLocked = useRef(isLocked);
    const prevOpen = useRef(openContainer);

    const boxGeo = useMemo(() => new THREE.BoxGeometry(1.002, 1.002, 1.002), []);

    useEffect(() => {
        inventoryRef.current = inventory;
        selectedSlotRef.current = selectedSlot;
    }, [inventory, selectedSlot]);

    useEffect(() => {
        const justLocked = isLocked && !prevLocked.current;
        const justClosed = !openContainer && prevOpen.current;
        
        if (justLocked || justClosed) {
             interactionCooldown.current = 10;
             isLeftMouseDown.current = false;
             isRightMouseDown.current = false;
             eatingTimer.current = 0;
        }
        
        if (!isLocked || openContainer) {
             isLeftMouseDown.current = false;
             isRightMouseDown.current = false;
             breakingRef.current = null;
             setBreakingVisual(null);
             eatingTimer.current = 0;
             if (highlightMeshRef.current) highlightMeshRef.current.visible = false;
        }

        prevLocked.current = isLocked;
        prevOpen.current = openContainer;
    }, [isLocked, openContainer, setBreakingVisual]);

    useEffect(() => {
        const onBlur = () => {
            isLeftMouseDown.current = false;
            isRightMouseDown.current = false;
            eatingTimer.current = 0;
        };
        window.addEventListener('blur', onBlur);
        return () => window.removeEventListener('blur', onBlur);
    }, []);

    const handlePickBlock = useCallback(() => {
        if (isDead) return;
        raycaster.current.setFromCamera(new THREE.Vector2(0, 0), camera);
        const reach = gameMode === 'creative' ? 5.2 : 4.5;
        raycaster.current.far = reach + 1; 
        
        const intersects = raycaster.current.intersectObjects(scene.children, true);
        const hit = intersects.find(i => i.object.name === 'chunk' && i.face);
        
        if (hit && hit.face) {
            const bx = Math.floor(hit.point.x - hit.face.normal.x * 0.01);
            const by = Math.floor(hit.point.y - hit.face.normal.y * 0.01);
            const bz = Math.floor(hit.point.z - hit.face.normal.z * 0.01);
            
            const targetType = worldManager.tryGetBlock(bx, by, bz);
            if (targetType !== null && targetType !== BlockType.AIR && targetType !== BlockType.WATER && targetType !== BlockType.LAVA) {
                const pickedType = (targetType === BlockType.BED_HEAD || targetType === BlockType.BED_FOOT) ? BlockType.BED_ITEM : targetType;
                
                const newItem = { type: pickedType, count: 1 };
                
                setInventory((prev) => {
                    const next = [...prev];
                    const existingIdx = next.findIndex(it => it && it.type === pickedType);
                    
                    if (existingIdx !== -1) {
                        if (existingIdx < 9) {
                            if (existingIdx !== selectedSlotRef.current) {
                                const temp = next[selectedSlotRef.current];
                                next[selectedSlotRef.current] = next[existingIdx];
                                next[existingIdx] = temp;
                            }
                        } else {
                            const temp = next[selectedSlotRef.current];
                            next[selectedSlotRef.current] = next[existingIdx];
                            next[existingIdx] = temp;
                        }
                    } else if (gameMode === 'creative') {
                        next[selectedSlotRef.current] = newItem;
                    }
                    return next;
                });
                soundManager.play("ui.click");
            }
        }
    }, [camera, scene, gameMode, setInventory, isDead]);

    const performInteraction = useCallback((isContinuous: boolean, isShiftHeld: boolean = false) => {
        if (gameMode === 'spectator' || isDead) return; 

        const emitPlacementAnimation = () => {
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('atlas:block-placed'));
            }
        };

        raycaster.current.setFromCamera(new THREE.Vector2(0, 0), camera);
        const reach = gameMode === 'creative' ? 5.2 : 4.5;
        raycaster.current.far = reach; 
        
        const intersects = raycaster.current.intersectObjects(scene.children, true);
        const hit = intersects.find(i => i.object.name === 'chunk' && i.face);
        
        if (hit && hit.face) {
            const bx = Math.floor(hit.point.x - hit.face.normal.x * 0.01);
            const by = Math.floor(hit.point.y - hit.face.normal.y * 0.01);
            const bz = Math.floor(hit.point.z - hit.face.normal.z * 0.01);
            
            const targetType = worldManager.tryGetBlock(bx, by, bz);
            if (targetType === null) return; 

            if (!isContinuous && targetType !== BlockType.AIR && targetType !== BlockType.WATER && targetType !== BlockType.LAVA) {
                const isInteractive = targetType === BlockType.CRAFTING_TABLE || 
                                      targetType === BlockType.FURNACE || 
                                      targetType === BlockType.FURNACE_ACTIVE || 
                                      targetType === BlockType.CHEST ||
                                      targetType === BlockType.BED_FOOT || 
                                      targetType === BlockType.BED_HEAD;

                if (isInteractive && !isShiftHeld) {
                    soundManager.play("ui.open");
                    if (targetType === BlockType.CRAFTING_TABLE) {
                        setOpenContainer({ type: 'crafting', x: bx, y: by, z: bz });
                        return;
                    } else if (targetType === BlockType.FURNACE || targetType === BlockType.FURNACE_ACTIVE) {
                        setOpenContainer({ type: 'furnace', x: bx, y: by, z: bz });
                        return;
                    } else if (targetType === BlockType.CHEST) {
                        setOpenContainer({ type: 'chest', x: bx, y: by, z: bz });
                        return;
                    } else if (targetType === BlockType.BED_FOOT || targetType === BlockType.BED_HEAD) {
                        const currentTicks = worldManager.getTime();
                        const time = currentTicks % 24000;
                        const isNight = time > 12542 && time < 23459;
                        if (!isNight) {
                            worldManager.log("You can sleep only at night", "error");
                        } else if (getLunarNightEventState(currentTicks, 24000, worldManager.getSeed()).isBloodMoon) {
                            worldManager.log("You cannot sleep during a blood moon", "error");
                        } else {
                            setIsSleeping(true);
                            onSleepInBed?.(bx, by, bz);
                        }
                        return;
                    }
                }
            }

            if (targetType === BlockType.WATER || targetType === BlockType.LAVA) return; 

            const heldItem = inventoryRef.current[selectedSlotRef.current] as { type: BlockType; count: number } | null;
            const heldItemDef = heldItem ? BLOCKS[heldItem.type as BlockType] : null;
            
            if (heldItem && heldItemDef && (!heldItemDef.isItem || heldItem.type === BlockType.BED_ITEM || isSaplingType(heldItem.type))) {
                
                const now = Date.now();
                if (isContinuous && now - lastPlacementTime.current < 200) return;

                if (heldItem.type === BlockType.TORCH) {
                    if (hit.face.normal.y < 0.9) return;
                }

                // Sapling placement: must be air target on top of valid soil
                if (isSaplingType(heldItem.type)) {
                    if (hit.face.normal.y < 0.9) return; // can only place on top face
                }

                const px = Math.floor(hit.point.x + hit.face.normal.x * 0.5);
                const py = Math.floor(hit.point.y + hit.face.normal.y * 0.5);
                const pz = Math.floor(hit.point.z + hit.face.normal.z * 0.5);
                
                if (worldManager.tryGetBlock(px, py, pz) === null) return;

                // Sapling soil check: block below must be valid soil, target must be air
                if (isSaplingType(heldItem.type)) {
                    const targetBlock = worldManager.tryGetBlock(px, py, pz);
                    const soilBlock = worldManager.tryGetBlock(px, py - 1, pz);
                    if (targetBlock !== BlockType.AIR || soilBlock === null || !isValidSoil(soilBlock)) return;
                }

                const isSneaking = inputState.sneak;
                const currentEyeHeight = isSneaking ? EYE_HEIGHT_SNEAKING : EYE_HEIGHT_STANDING;
                const currentPlayerHeight = isSneaking ? PLAYER_HEIGHT_SNEAK : PLAYER_HEIGHT;

                const playerFeetPos = camera.position.clone();
                playerFeetPos.y -= currentEyeHeight; 
                
                const playerHalfWidth = PLAYER_WIDTH / 2;
                
                const playerAABB = new THREE.Box3(
                    new THREE.Vector3(playerFeetPos.x - playerHalfWidth, playerFeetPos.y, playerFeetPos.z - playerHalfWidth),
                    new THREE.Vector3(playerFeetPos.x + playerHalfWidth, playerFeetPos.y + currentPlayerHeight, playerFeetPos.z + playerHalfWidth)
                );
                const blockAABB = new THREE.Box3(
                    new THREE.Vector3(px, py, pz),
                    new THREE.Vector3(px + 1, py + 1, pz + 1)
                );
                blockAABB.expandByScalar(-0.001);

                if (heldItem.type === BlockType.BED_ITEM) {
                    blockAABB.max.y -= 0.5;
                }

                if (heldItem.type === BlockType.TORCH || heldItem.type === BlockType.BED_ITEM || !playerAABB.intersectsBox(blockAABB)) {
                    
                    let rotation = 0;
                    if (heldItem.type === BlockType.LOG || heldItem.type === BlockType.SPRUCE_LOG || heldItem.type === BlockType.CHERRY_LOG || heldItem.type === BlockType.BIRCH_LOG) {
                        if (Math.abs(hit.face.normal.y) > 0.5) rotation = 0; 
                        else if (Math.abs(hit.face.normal.x) > 0.5) rotation = 1; 
                        else if (Math.abs(hit.face.normal.z) > 0.5) rotation = 2; 
                    } else if (heldItem.type === BlockType.FURNACE || heldItem.type === BlockType.CHEST) {
                        const dir = new THREE.Vector3();
                        camera.getWorldDirection(dir);
                        if (Math.abs(dir.x) > Math.abs(dir.z)) {
                            if (dir.x > 0) rotation = 3; else rotation = 2; 
                        } else {
                            if (dir.z > 0) rotation = 1; else rotation = 0; 
                        }
                    } else if (heldItem.type === BlockType.BED_ITEM) {
                        const dir = new THREE.Vector3();
                        camera.getWorldDirection(dir);
                        let hx = px, hz = pz;
                        
                        if (Math.abs(dir.x) > Math.abs(dir.z)) {
                            if (dir.x > 0) { rotation = 2; hx += 1; } else { rotation = 3; hx -= 1; }
                        } else {
                            if (dir.z > 0) { rotation = 0; hz += 1; } else { rotation = 1; hz -= 1; }
                        }
                        
                        if (worldManager.getBlock(hx, py, hz, false) === BlockType.AIR) {
                            const headAABB = new THREE.Box3(
                                new THREE.Vector3(hx, py, hz),
                                new THREE.Vector3(hx + 1, py + 1, hz + 1)
                            );
                            headAABB.max.y -= 0.5;
                            headAABB.expandByScalar(-0.001);
                            
                            if (!playerAABB.intersectsBox(headAABB) && !playerAABB.intersectsBox(blockAABB)) {
                                worldManager.setBlock(px, py, pz, BlockType.BED_FOOT, rotation);
                                worldManager.setBlock(hx, py, hz, BlockType.BED_HEAD, rotation);
                                consumeItem(selectedSlotRef.current);
                                lastPlacementTime.current = now;
                                emitPlacementAnimation();
                                
                                // Play Sound
                                const group = getBlockSoundGroup(heldItem.type);
                                soundManager.playAt(`block.${group}.place`, {x: px+0.5, y: py+0.5, z: pz+0.5});
                            }
                        }
                        return;
                    }

                    worldManager.setBlock(px, py, pz, heldItem.type, rotation);
                    consumeItem(selectedSlotRef.current);
                    lastPlacementTime.current = now;
                    emitPlacementAnimation();

                    // Play Sound
                    const group = getBlockSoundGroup(heldItem.type);
                    soundManager.playAt(`block.${group}.place`, {x: px+0.5, y: py+0.5, z: pz+0.5});
                }
            }
        }
    }, [camera, scene, consumeItem, gameMode, isDead, onSleepInBed, setOpenContainer, setIsSleeping]);

    useEffect(() => {
        const onDown = (e: MouseEvent) => { 
            if(!isLocked || openContainer || gameMode === 'spectator' || isDead) return; 
            if (interactionCooldown.current > 0) return;

            if (e.button === 1) handlePickBlock();
            if (e.button === 0) isLeftMouseDown.current = true;
            if (e.button === 2) {
                isRightMouseDown.current = true;
                performInteraction(false, e.shiftKey);
            }
        };
        const onUp = (e: MouseEvent) => { 
            if(e.button === 0) {
                isLeftMouseDown.current = false; 
                breakingRef.current = null;
                setBreakingVisual(null);
            }
            if(e.button === 2) {
                isRightMouseDown.current = false;
                eatingTimer.current = 0; 
            }
        };
        
        window.addEventListener('mousedown', onDown);
        window.addEventListener('mouseup', onUp);
        return () => { 
            window.removeEventListener('mousedown', onDown);
            window.removeEventListener('mouseup', onUp);
        };
    }, [isLocked, openContainer, gameMode, isDead, handlePickBlock, performInteraction, setBreakingVisual]); 

    useFrame((_, delta) => {
        if (openContainer || !isLocked || isDead || gameMode === 'spectator') {
            isLeftMouseDown.current = false;
            isRightMouseDown.current = false;
            if (highlightMeshRef.current) highlightMeshRef.current.visible = false;
            return;
        }
        
        if (interactionCooldown.current > 0) {
            interactionCooldown.current--;
            isLeftMouseDown.current = false;
            isRightMouseDown.current = false;
            return;
        }

        raycaster.current.setFromCamera(new THREE.Vector2(0, 0), camera);
        const reach = gameMode === 'creative' ? 5.2 : 4.5;
        raycaster.current.far = reach;
        const hit = raycaster.current.intersectObjects(scene.children, true).find(i => i.object.name === 'chunk' && i.face);

        if (hit && highlightMeshRef.current) {
            const bx = Math.floor(hit.point.x - hit.face!.normal.x * 0.01);
            const by = Math.floor(hit.point.y - hit.face!.normal.y * 0.01);
            const bz = Math.floor(hit.point.z - hit.face!.normal.z * 0.01);
            const targetType = worldManager.tryGetBlock(bx, by, bz);

            if (targetType !== null && targetType !== BlockType.AIR && targetType !== BlockType.WATER && targetType !== BlockType.LAVA) {
                 if (targetType === BlockType.BED_FOOT || targetType === BlockType.BED_HEAD) {
                     highlightMeshRef.current.scale.set(1.002, 0.502, 1.002);
                     highlightMeshRef.current.position.set(bx + 0.5, by + 0.25, bz + 0.5);
                 } else {
                     highlightMeshRef.current.scale.set(1.002, 1.002, 1.002);
                     highlightMeshRef.current.position.set(bx + 0.5, by + 0.5, bz + 0.5);
                 }
                 highlightMeshRef.current.visible = true;
            } else {
                 highlightMeshRef.current.visible = false;
            }
        } else if (highlightMeshRef.current) {
            highlightMeshRef.current.visible = false;
        }

        if (isLeftMouseDown.current && hit) {
            const bx = Math.floor(hit.point.x - hit.face!.normal.x * 0.01);
            const by = Math.floor(hit.point.y - hit.face!.normal.y * 0.01);
            const bz = Math.floor(hit.point.z - hit.face!.normal.z * 0.01);
            const targetType = worldManager.tryGetBlock(bx, by, bz);

            if (targetType !== null && targetType !== BlockType.AIR && targetType !== BlockType.WATER && targetType !== BlockType.LAVA) {
                if (!breakingRef.current || breakingRef.current.x !== bx || breakingRef.current.y !== by || breakingRef.current.z !== bz) {
                    breakingRef.current = { x: bx, y: by, z: bz, progress: 0 };
                }
                
                // Play Hit Sound Throttled
                const now = Date.now();
                if (now - lastHitSoundTime.current > 150) { // Every 150ms
                    const group = getBlockSoundGroup(targetType);
                    soundManager.playAt(`block.${group}.hit`, {x: bx+0.5, y: by+0.5, z: bz+0.5}, { pitch: 0.8 + Math.random() * 0.4 });
                    lastHitSoundTime.current = now;
                }

                if (gameMode === 'creative') {
                    if (now - lastBreakTime.current > 200) {
                        breakingRef.current.progress = 1.0;
                        lastBreakTime.current = now;
                    }
                } else {
                    const heldItem = inventoryRef.current[selectedSlotRef.current] as { type: BlockType; count: number } | null;
                    const targetDef = BLOCKS[targetType];
                    let speedMultiplier = 1;
                    let heldTier = 0;
                    let isBestTool = false;

                    if (heldItem) {
                        const itemDef = BLOCKS[heldItem.type as BlockType];
                        heldTier = itemDef.toolTier || 0;
                        if (targetDef.preferredTool && itemDef.toolType === targetDef.preferredTool) {
                            speedMultiplier = itemDef.toolSpeed || 1;
                            isBestTool = true;
                        }
                    }

                    const requiresTool = (targetDef.minHarvestTier || 0) > 0;
                    const canHarvest = !requiresTool || (isBestTool && heldTier >= (targetDef.minHarvestTier || 0));
                    const penalty = canHarvest ? 1.5 : 5.0;
                    const breakingSpeed = speedMultiplier / targetDef.hardness / penalty;

                    breakingRef.current.progress += delta * breakingSpeed;
                }

                let noDrop = false;
                if (gameMode === 'survival') {
                    const heldItem = inventoryRef.current[selectedSlotRef.current] as { type: BlockType; count: number } | null;
                    const targetDef = BLOCKS[targetType];
                    let heldTier = 0;
                    let isBestTool = false;

                    if (heldItem) {
                        const itemDef = BLOCKS[heldItem.type as BlockType];
                        heldTier = itemDef.toolTier || 0;
                        if (targetDef.preferredTool && itemDef.toolType === targetDef.preferredTool) {
                            isBestTool = true;
                        }
                    }

                    const requiresTool = (targetDef.minHarvestTier || 0) > 0;
                    const canHarvest = !requiresTool || (isBestTool && heldTier >= (targetDef.minHarvestTier || 0));
                    noDrop = !canHarvest;
                }
                
                setBreakingVisual({ pos: [bx, by, bz], progress: breakingRef.current.progress, noDrop });

                if (breakingRef.current.progress >= 1.0) {
                    // Play Break Sound
                    const group = getBlockSoundGroup(targetType);
                    soundManager.playAt(`block.${group}.break`, {x: bx+0.5, y: by+0.5, z: bz+0.5});

                    // Trigger Particles!
                    worldManager.spawnParticles(targetType, bx, by, bz);

                    if (targetType === BlockType.BED_FOOT || targetType === BlockType.BED_HEAD) {
                        const meta = worldManager.getMetadata(bx, by, bz);
                        let ox = bx, oz = bz;
                        if (targetType === BlockType.BED_FOOT) {
                            if (meta === 0) oz += 1;
                            else if (meta === 1) oz -= 1;
                            else if (meta === 2) ox += 1;
                            else if (meta === 3) ox -= 1;
                        } else {
                            if (meta === 0) oz -= 1;
                            else if (meta === 1) oz += 1;
                            else if (meta === 2) ox -= 1;
                            else if (meta === 3) ox += 1;
                        }
                        
                        const otherType = worldManager.getBlock(ox, by, oz, false);
                        const spawnPoint = worldManager.getSpawnPoint();
                        const spawnMatchesThisBed = !!spawnPoint && (
                            (spawnPoint.x === bx && spawnPoint.y === by && spawnPoint.z === bz) ||
                            (spawnPoint.x === ox && spawnPoint.y === by && spawnPoint.z === oz)
                        );
                        if (otherType === BlockType.BED_HEAD || otherType === BlockType.BED_FOOT) {
                            worldManager.setBlock(ox, by, oz, BlockType.AIR);
                        }
                        if (spawnMatchesThisBed) {
                            worldManager.clearSpawnPoint('Warning: Your spawn point has been reset because your bed was broken.', 'error');
                        }
                    }

                    const droppedItems = worldManager.setBlock(bx, by, bz, BlockType.AIR);
                    if (gameMode === 'survival') {
                        const heldItem = inventoryRef.current[selectedSlotRef.current] as { type: BlockType; count: number } | null;
                        const targetDef = BLOCKS[targetType];
                        let heldTier = 0;
                        let isBestTool = false;
                        if (heldItem) {
                            const itemDef = BLOCKS[heldItem.type as BlockType];
                            heldTier = itemDef.toolTier || 0;
                            if (targetDef.preferredTool && itemDef.toolType === targetDef.preferredTool) {
                                isBestTool = true;
                            }
                        }
                        const requiresTool = (targetDef.minHarvestTier || 0) > 0;
                        const canHarvest = !requiresTool || (isBestTool && heldTier >= (targetDef.minHarvestTier || 0));

                        if (canHarvest) {
                            droppedItems.forEach(item => { for(let i=0; i<item.count; i++) spawnDrop(item.type, bx, by, bz); });
                            if (targetDef.drops) {
                                targetDef.drops.forEach(d => { if(Math.random() < d.chance) spawnDrop(d.type, bx, by, bz); });
                            } else {
                                spawnDrop(targetType === BlockType.STONE ? BlockType.COBBLESTONE : targetType, bx, by, bz);
                            }
                        }
                    }
                    breakingRef.current = null; 
                    setBreakingVisual(null);
                    
                    if (foodStateRef && foodStateRef.current && gameMode === 'survival') {
                        foodStateRef.current.foodExhaustionLevel = Math.min(40, foodStateRef.current.foodExhaustionLevel + EXHAUSTION_COSTS.BLOCK_BREAK);
                    }
                }
            }
        } else {
            breakingRef.current = null;
            setBreakingVisual(null);
        }

        if (isRightMouseDown.current) {
            const heldItem = inventoryRef.current[selectedSlotRef.current] as { type: BlockType; count: number } | null;
            const heldItemDef = heldItem ? BLOCKS[heldItem.type as BlockType] : null;
            
            if (heldItem && heldItemDef && heldItemDef.category === 'food') {
                const canEat = gameMode === 'creative' || (foodStateRef.current && foodStateRef.current.foodLevel < 20);
                
                if (canEat) {
                    eatingTimer.current += delta * 20; 
                    if (eatingTimer.current >= 32) { 
                        const def = BLOCKS[heldItem.type as BlockType];
                        if (def.nutrition) {
                            eatFood(foodStateRef.current, def.nutrition, def.saturationModifier || 0.6);
                            consumeItem(selectedSlotRef.current);
                            eatingTimer.current = 0;
                            isRightMouseDown.current = false; 
                            soundManager.play("entity.item.pickup"); // Use generic burp/pickup sound for eating for now
                        }
                    }
                } else {
                    eatingTimer.current = 0;
                }
            } else if (heldItem && heldItemDef && (!heldItemDef.isItem || heldItem.type === BlockType.BED_ITEM)) {
                performInteraction(true);
            }
        } else {
            eatingTimer.current = 0;
        }
    });

    return (
        <lineSegments ref={highlightMeshRef} visible={false}>
            <edgesGeometry args={[boxGeo]} />
            <lineBasicMaterial color="black" />
        </lineSegments>
    );
};
