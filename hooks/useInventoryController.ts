
import { useState, useCallback, useRef, useEffect } from 'react';
import { ItemStack, BlockType } from '../types';
import { BLOCKS } from '../data/blocks';
import { worldManager } from '../systems/WorldManager';
import { checkRecipe } from '../recipes';
import * as THREE from 'three';
import React from 'react';

const INVENTORY_SIZE = 36;

interface UseInventoryControllerProps {
    gameMode: 'survival' | 'creative' | 'spectator';
    setDrops: React.Dispatch<React.SetStateAction<any[]>>;
    playerPosRef: React.MutableRefObject<THREE.Vector3>;
    cameraRef: React.MutableRefObject<{ getCamera: () => { pos: THREE.Vector3, dir: THREE.Vector3 } } | null>;
}

export const useInventoryController = ({ gameMode, setDrops, playerPosRef, cameraRef }: UseInventoryControllerProps) => {
    const [inventory, setInventory] = useState<(ItemStack | null)[]>(() => Array(INVENTORY_SIZE).fill(null));
    const [cursorStack, setCursorStack] = useState<ItemStack | null>(null);
    const [openContainer, setOpenContainer] = useState<any>(null);
    const [craftingGrid2x2, setCraftingGrid2x2] = useState<(ItemStack | null)[]>(Array(4).fill(null));
    const [craftingGrid3x3, setCraftingGrid3x3] = useState<(ItemStack | null)[]>(Array(9).fill(null));
    const [craftingOutput, setCraftingOutput] = useState<ItemStack | null>(null);

    // --- SHADOW STATE REFS ---
    // These track the state synchronously to prevent race conditions during rapid events (like holding Q)
    const inventoryRef = useRef(inventory);
    const cursorRef = useRef(cursorStack);
    
    // Sync Refs with State whenever a render commits
    useEffect(() => { inventoryRef.current = inventory; }, [inventory]);
    useEffect(() => { cursorRef.current = cursorStack; }, [cursorStack]);

    // Helpers
    const spawnItemDrop = (item: ItemStack) => {
        const { pos, dir } = cameraRef.current ? cameraRef.current.getCamera() : { pos: playerPosRef.current, dir: new THREE.Vector3(0,0,1) };
        const spawnPos = pos.clone().add(dir.clone().multiplyScalar(0.5));
        const throwVel = dir.multiplyScalar(8.0).add(new THREE.Vector3(0, 2.0, 0));

        setDrops(p => [...p, { 
            id: Math.random().toString(), 
            type: item.type, 
            count: item.count, 
            position: [spawnPos.x, spawnPos.y, spawnPos.z], 
            velocity: [throwVel.x, throwVel.y, throwVel.z], 
            createdAt: Date.now(), 
            pickupDelay: Date.now() + 1500
        }]);
    };

    const getContainerData = () => {
        if (!openContainer) return null;
        if (openContainer.type === 'furnace') return worldManager.getFurnace(openContainer.x, openContainer.y, openContainer.z);
        if (openContainer.type === 'chest') return worldManager.getChest(openContainer.x, openContainer.y, openContainer.z);
        return null;
    };

    const updateSlot = (collection: string, index: number, newItem: ItemStack | null) => {
        const cData = getContainerData();
        
        if (collection === 'inventory') {
            // Update Sync Ref immediately
            const next = [...inventoryRef.current];
            next[index] = newItem;
            inventoryRef.current = next;
            setInventory(next);
        } else if (collection === 'crafting') {
            (openContainer?.type === 'crafting' ? setCraftingGrid3x3 : setCraftingGrid2x2)(prev => { const n = [...prev]; n[index] = newItem; return n; });
        } else if (openContainer?.type === 'furnace' && cData) {
            const fData = cData as any;
            if (collection === 'furnace_input') fData.input = newItem;
            if (collection === 'furnace_fuel') fData.fuel = newItem;
            if (collection === 'furnace_output') fData.output = newItem;
        } else if (openContainer?.type === 'chest' && cData) {
            const chData = cData as any;
            chData.items[index] = newItem;
            // Force refresh UI for external containers
            setOpenContainer({ ...openContainer });
        }
    };

    const getSlot = (collection: string, index: number): ItemStack | null => {
        const cData = getContainerData();
        
        if (collection === 'inventory') return inventoryRef.current[index]; // Use REF for current logic
        if (collection === 'crafting') return (openContainer?.type === 'crafting' ? craftingGrid3x3[index] : craftingGrid2x2[index]);
        if (collection === 'output') return craftingOutput;
        if (openContainer?.type === 'furnace' && cData) {
            const fData = cData as any;
            if (collection === 'furnace_input') return fData.input;
            if (collection === 'furnace_fuel') return fData.fuel;
            if (collection === 'furnace_output') return fData.output;
        }
        if (openContainer?.type === 'chest' && cData) {
            return (cData as any).items[index];
        }
        return null;
    };

    // --- ADD TO INVENTORY (Synchronous) ---
    // Moved here to share the shadow state with other inventory actions
    const addToInventory = useCallback((type: BlockType, count: number = 1) => {
        const next = [...inventoryRef.current];
        let rem = count; 
        const max = 64;

        // 1. Fill existing stacks
        for (let i = 0; i < INVENTORY_SIZE && rem > 0; i++) {
            if (next[i]?.type === type && next[i]!.count < max) {
                const add = Math.min(max - next[i]!.count, rem);
                next[i] = { type, count: next[i]!.count + add };
                rem -= add;
            }
        }
        // 2. Fill empty slots
        for (let i = 0; i < INVENTORY_SIZE && rem > 0; i++) {
            if (!next[i]) {
                const add = Math.min(max, rem);
                next[i] = { type, count: add };
                rem -= add;
            }
        }
        
        // Update both REF and State
        inventoryRef.current = next;
        setInventory(next);
    }, []);

    const addToInventoryList = (list: (ItemStack | null)[], item: ItemStack, reversed: boolean = false): ItemStack | null => {
        let rem = item.count;
        const max = 64;
        const indices = list.map((_, i) => i);
        if (reversed) indices.reverse();

        // 1. Fill existing
        for (const i of indices) {
            if (list[i] && list[i]!.type === item.type && list[i]!.count < max) {
                const add = Math.min(max - list[i]!.count, rem);
                list[i] = { ...list[i]!, count: list[i]!.count + add };
                rem -= add;
                if (rem <= 0) return null;
            }
        }
        // 2. Fill empty
        for (const i of indices) {
            if (!list[i]) {
                list[i] = { type: item.type, count: rem };
                return null;
            }
        }
        return { ...item, count: rem };
    };

    const handleInventoryAction = useCallback((action: string, collection: string, index: number, data?: any) => {
        const slotItem = getSlot(collection, index);

        // --- CREATIVE PICK ---
        if (collection === 'creative') {
            if (action === 'click' && gameMode === 'creative') {
                if (data?.creativeItem) {
                    const newStack = { ...data.creativeItem, count: 64 };
                    cursorRef.current = newStack;
                    setCursorStack(newStack);
                }
            }
            return;
        }

        // --- DROP CURSOR ---
        if (action === 'drop_cursor') {
            if (cursorStack) {
                spawnItemDrop(cursorStack);
                cursorRef.current = null;
                setCursorStack(null);
            }
            return;
        }

        // --- DROP KEY (Q) ---
        if (action === 'drop_key') {
            // Check using REF to ensure we don't drop items that are already gone in this event loop
            if (!slotItem) return; 
            
            const dropAll = data?.dropAll;
            const count = dropAll ? slotItem.count : 1;
            
            // Optimistic update prevention
            if (slotItem.count < count) return;

            spawnItemDrop({ ...slotItem, count });
            
            if (slotItem.count - count <= 0) updateSlot(collection, index, null);
            else updateSlot(collection, index, { ...slotItem, count: slotItem.count - count });
            return;
        }

        // --- SWAP HOTBAR (Number Keys) ---
        if (action === 'swap_hotbar') {
            if (cursorStack) return; // Don't swap if dragging
            const hotbarIdx = data?.hotbarIdx;
            if (hotbarIdx === undefined || hotbarIdx < 0 || hotbarIdx > 8) return;
            
            // Prevent swapping with self if in inventory
            if (collection === 'inventory' && index === hotbarIdx) return;
            // Prevent swapping output
            if (collection === 'output' || collection === 'furnace_output') return;

            const targetItem = inventoryRef.current[hotbarIdx];
            
            // 1. Update Hotbar Slot
            const n = [...inventoryRef.current];
            n[hotbarIdx] = slotItem; 
            if (collection === 'inventory') n[index] = targetItem; 
            
            inventoryRef.current = n;
            setInventory(n);

            // 2. If source was NOT inventory (e.g. chest), update that container
            if (collection !== 'inventory') {
                updateSlot(collection, index, targetItem);
            }
            return;
        }

        // --- SHIFT CLICK (Transfer) ---
        if (action === 'shift_click') {
            if (!slotItem) return;
            
            if (collection === 'output') {
                // Craft Max logic
                const grid = (openContainer?.type === 'crafting' ? craftingGrid3x3 : craftingGrid2x2);
                let craftable = 64;
                grid.forEach(it => { if (it && it.count < craftable) craftable = it.count; });
                
                const produced = slotItem.count * craftable;
                const nextInv = [...inventoryRef.current];
                const added = addToInventoryList(nextInv, { ...slotItem, count: produced });
                
                if (!added) { // All fit
                     inventoryRef.current = nextInv;
                     setInventory(nextInv);
                     
                     (openContainer?.type === 'crafting' ? setCraftingGrid3x3 : setCraftingGrid2x2)(prev => 
                        prev.map(it => it ? (it.count - craftable > 0 ? {...it, count: it.count - craftable} : null) : null)
                     );
                }
                return;
            }

            // Simple Transfer
            let targetList: (ItemStack|null)[] | null = null;
            let updateTarget = (_l: (ItemStack|null)[]) => {};
            
            if (collection === 'inventory') {
                if (openContainer && openContainer.type !== 'creative') {
                    if (openContainer.type === 'chest') {
                        const chest = getContainerData() as any;
                        targetList = [...chest.items];
                        updateTarget = (l) => { chest.items = l; setOpenContainer({...openContainer}); };
                    } else if (openContainer.type === 'furnace') {
                        const f = getContainerData() as any;
                        const def = BLOCKS[slotItem.type];
                        if (def.isFuel && !f.fuel) {
                            f.fuel = slotItem; updateSlot(collection, index, null); return;
                        } else if (def.smeltsInto && !f.input) {
                            f.input = slotItem; updateSlot(collection, index, null); return;
                        }
                    }
                } 
                
                if (!targetList) {
                    const isHotbar = index < 9;
                    const newInv = [...inventoryRef.current];
                    newInv[index] = null;
                    let rem = slotItem.count;
                    const rangeStart = isHotbar ? 9 : 0;
                    const rangeEnd = isHotbar ? 36 : 9;
                    
                    for (let i=rangeStart; i<rangeEnd && rem>0; i++) {
                        if (newInv[i] && newInv[i]!.type === slotItem.type && newInv[i]!.count < 64) {
                            const add = Math.min(64 - newInv[i]!.count, rem);
                            newInv[i]!.count += add; rem -= add;
                        }
                    }
                    for (let i=rangeStart; i<rangeEnd && rem>0; i++) {
                        if (!newInv[i]) { newInv[i] = { type: slotItem.type, count: rem }; rem = 0; }
                    }
                    if (rem > 0) newInv[index] = { ...slotItem, count: rem }; 
                    
                    inventoryRef.current = newInv;
                    setInventory(newInv);
                    return;
                }
            } else {
                targetList = [...inventoryRef.current];
                updateTarget = (l) => { inventoryRef.current = l; setInventory(l); };
            }

            if (targetList) {
                const rem = addToInventoryList(targetList, slotItem, collection !== 'inventory'); 
                updateTarget(targetList);
                updateSlot(collection, index, rem);
            }
            return;
        }

        // --- DRAG END ---
        if (action === 'drag_end') {
            const { mode, slots, startStack } = data as { mode: 'split'|'one', slots: {collection:string, index:number}[], startStack: ItemStack };
            
            if (mode === 'one') {
                let remainder = startStack.count;
                const newCursor = { ...startStack };
                
                slots.forEach(slot => {
                    if (remainder <= 0) return;
                    const sItem = getSlot(slot.collection, slot.index);
                    if (!sItem) {
                        updateSlot(slot.collection, slot.index, { type: startStack.type, count: 1 });
                        remainder--;
                    } else if (sItem.type === startStack.type && sItem.count < 64) {
                        updateSlot(slot.collection, slot.index, { ...sItem, count: sItem.count + 1 });
                        remainder--;
                    }
                });
                newCursor.count = remainder;
                cursorRef.current = newCursor.count > 0 ? newCursor : null;
                setCursorStack(cursorRef.current);
            } 
            else if (mode === 'split') {
                const count = startStack.count;
                const targets = slots.filter(slot => {
                    const sItem = getSlot(slot.collection, slot.index);
                    if (slot.collection === 'output' || slot.collection === 'furnace_output') return false;
                    return !sItem || (sItem.type === startStack.type && sItem.count < 64);
                });
                
                if (targets.length === 0) { 
                    cursorRef.current = startStack;
                    setCursorStack(startStack); 
                    return; 
                }

                const itemsPerSlot = Math.floor(count / targets.length);
                const remainder = count % targets.length;
                
                // Distribute itemsPerSlot to everyone
                // Distribute remainder 1 by 1 to the first 'remainder' slots
                targets.forEach((slot, idx) => {
                    const sItem = getSlot(slot.collection, slot.index);
                    const currentCount = sItem ? sItem.count : 0;
                    const bonus = idx < remainder ? 1 : 0;
                    const amount = itemsPerSlot + bonus;
                    
                    if (amount > 0) {
                        updateSlot(slot.collection, slot.index, { type: startStack.type, count: currentCount + amount });
                    }
                });
                
                // Cursor should be empty if we distributed everything logic correctly
                cursorRef.current = null;
                setCursorStack(null);
            }
            return;
        }

        // --- DOUBLE CLICK (Gather) ---
        if (action === 'double_click') {
            const gatherType = cursorStack ? cursorStack.type : (slotItem ? slotItem.type : null);
            if (!gatherType) return;

            let currentStack = cursorStack ? { ...cursorStack } : { type: gatherType, count: 0 };
            const max = 64;

            const scanList = (list: (ItemStack|null)[], coll: string, setList: (l:(ItemStack|null)[])=>void) => {
                const newList = [...list];
                let changed = false;
                for(let i=0; i<newList.length; i++) {
                    if(currentStack.count >= max) break;
                    
                    // Logic to gather
                    const item = newList[i];
                    if (item && item.type === gatherType) {
                         // Don't gather from self if we are technically 'holding' items that originated from here?
                         // If cursor is present, we are gathering INTO cursor.
                         // Standard MC: Scans all slots except the one you clicked if it's already on cursor.
                         if (coll === collection && i === index && cursorStack) continue;

                         const space = max - currentStack.count;
                         const take = Math.min(space, item.count);
                         if (take > 0) {
                             currentStack.count += take;
                             if (item.count - take <= 0) newList[i] = null;
                             else newList[i] = { ...item, count: item.count - take };
                             changed = true;
                         }
                    }
                }
                if(changed) setList(newList);
            };

            // 1. Scan Main Inventory
            scanList(inventoryRef.current, 'inventory', (l) => { inventoryRef.current = l; setInventory(l); });
            
            // 2. Scan Open Container
            const cData = getContainerData();
            if (cData && openContainer.type === 'chest') {
                const chest = cData as any;
                scanList(chest.items, 'chest', (l) => { chest.items = l; setOpenContainer({...openContainer}); });
            }

            if (currentStack.count > 0) {
                cursorRef.current = currentStack;
                setCursorStack(currentStack);
            }
            return;
        }

        // --- STANDARD CLICK ---
        if (collection === 'output' && slotItem) {
            if (cursorStack) {
                if (cursorStack.type === slotItem.type && cursorStack.count + slotItem.count <= 64) {
                    const newStack = { ...cursorStack, count: cursorStack.count + slotItem.count };
                    cursorRef.current = newStack;
                    setCursorStack(newStack);
                    (openContainer?.type === 'crafting' ? setCraftingGrid3x3 : setCraftingGrid2x2)(p => p.map(i => i ? (i.count > 1 ? {...i, count:i.count-1}:null) : null));
                }
            } else {
                cursorRef.current = slotItem;
                setCursorStack(slotItem);
                (openContainer?.type === 'crafting' ? setCraftingGrid3x3 : setCraftingGrid2x2)(p => p.map(i => i ? (i.count > 1 ? {...i, count:i.count-1}:null) : null));
            }
            return;
        }

        if (!cursorStack) {
            if (!slotItem) return;
            if (action === 'right_click') {
                const take = Math.ceil(slotItem.count / 2);
                const newStack = { type: slotItem.type, count: take };
                cursorRef.current = newStack;
                setCursorStack(newStack);
                updateSlot(collection, index, slotItem.count - take > 0 ? { ...slotItem, count: slotItem.count - take } : null);
            } else {
                cursorRef.current = slotItem;
                setCursorStack(slotItem);
                updateSlot(collection, index, null);
            }
        } else {
            if (!slotItem) {
                if (action === 'right_click') {
                    updateSlot(collection, index, { type: cursorStack.type, count: 1 });
                    if (cursorStack.count > 1) {
                        const newStack = { ...cursorStack, count: cursorStack.count - 1 };
                        cursorRef.current = newStack;
                        setCursorStack(newStack);
                    } else {
                        cursorRef.current = null;
                        setCursorStack(null);
                    }
                } else {
                    updateSlot(collection, index, cursorStack);
                    cursorRef.current = null;
                    setCursorStack(null);
                }
            } else if (slotItem.type === cursorStack.type) {
                if (action === 'right_click') {
                    if (slotItem.count < 64) {
                        updateSlot(collection, index, { ...slotItem, count: slotItem.count + 1 });
                        if (cursorStack.count > 1) {
                            const newStack = { ...cursorStack, count: cursorStack.count - 1 };
                            cursorRef.current = newStack;
                            setCursorStack(newStack);
                        } else {
                            cursorRef.current = null;
                            setCursorStack(null);
                        }
                    }
                } else {
                    const space = 64 - slotItem.count;
                    const add = Math.min(space, cursorStack.count);
                    if (add > 0) {
                        updateSlot(collection, index, { ...slotItem, count: slotItem.count + add });
                        if (cursorStack.count - add > 0) {
                            const newStack = { ...cursorStack, count: cursorStack.count - add };
                            cursorRef.current = newStack;
                            setCursorStack(newStack);
                        } else {
                            cursorRef.current = null;
                            setCursorStack(null);
                        }
                    }
                }
            } else {
                // Swap
                updateSlot(collection, index, cursorStack);
                cursorRef.current = slotItem;
                setCursorStack(slotItem);
            }
        }

    }, [inventory, cursorStack, openContainer, craftingGrid2x2, craftingGrid3x3, craftingOutput, gameMode, addToInventory]);

    // Recipe Check
    React.useEffect(() => {
        const res = checkRecipe((openContainer?.type === 'crafting' ? craftingGrid3x3 : craftingGrid2x2).map(s => s?.type || null), openContainer?.type === 'crafting' ? 3 : 2);
        setCraftingOutput(res ? { ...res } : null);
    }, [craftingGrid2x2, craftingGrid3x3, openContainer]);

    return {
        inventory, setInventory,
        cursorStack, setCursorStack,
        openContainer, setOpenContainer,
        craftingGrid2x2, setCraftingGrid2x2,
        craftingGrid3x3, setCraftingGrid3x3,
        craftingOutput,
        handleInventoryAction,
        addToInventory
    };
};
