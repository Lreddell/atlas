
import { useState, useCallback, useRef, useEffect } from 'react';
import {
    type DragEndActionData,
    type Drop,
    type GameMode,
    type InventoryActionData,
    type InventoryActionHandler,
    type InventoryCollection,
    type OpenContainerState,
    ItemStack,
    BlockType,
} from '../types';
import { BLOCKS } from '../data/blocks';
import { worldManager } from '../systems/WorldManager';
import { checkRecipe } from '../recipes';
import * as THREE from 'three';
import React from 'react';
import type { ChestState, FurnaceState } from '../systems/world/worldTypes';
import { canStacksMerge, cloneItemStack, getItemStackLimit } from '../systems/inventory/itemStackPolicy';
import { EQUIPMENT_SLOTS, slotForItem, type Equipment } from '../systems/registry/equipment';

const INVENTORY_SIZE = 36;

interface UseInventoryControllerProps {
    gameMode: GameMode;
    setDrops: React.Dispatch<React.SetStateAction<Drop[]>>;
    playerPosRef: React.MutableRefObject<THREE.Vector3>;
    cameraRef: React.MutableRefObject<{ getCamera: () => { pos: THREE.Vector3, dir: THREE.Vector3 } } | null>;
    equipment: Equipment;
    setEquipment: React.Dispatch<React.SetStateAction<Equipment>>;
}

export const useInventoryController = ({ gameMode, setDrops, playerPosRef, cameraRef, equipment, setEquipment }: UseInventoryControllerProps) => {
    const [inventory, setInventoryState] = useState<(ItemStack | null)[]>(() => Array(INVENTORY_SIZE).fill(null));
    const [cursorStack, setCursorStackState] = useState<ItemStack | null>(null);
    const [openContainer, setOpenContainer] = useState<OpenContainerState>(null);
    const [craftingGrid2x2, setCraftingGrid2x2State] = useState<(ItemStack | null)[]>(Array(4).fill(null));
    const [craftingGrid3x3, setCraftingGrid3x3State] = useState<(ItemStack | null)[]>(Array(9).fill(null));
    const [craftingOutput, setCraftingOutput] = useState<ItemStack | null>(null);

    // --- SHADOW STATE REFS ---
    // These track the state synchronously to prevent race conditions during rapid events (like holding Q)
    const inventoryRef = useRef(inventory);
    const cursorRef = useRef(cursorStack);
    const craftingGrid2x2Ref = useRef(craftingGrid2x2);
    const craftingGrid3x3Ref = useRef(craftingGrid3x3);
    const craftingOutputRef = useRef(craftingOutput);
    const equipmentRef = useRef(equipment);

    const setInventory = useCallback<React.Dispatch<React.SetStateAction<(ItemStack | null)[]>>>((value) => {
        const next = typeof value === 'function' ? value(inventoryRef.current) : value;
        inventoryRef.current = next;
        setInventoryState(next);
    }, []);
    const setCursorStack = useCallback<React.Dispatch<React.SetStateAction<ItemStack | null>>>((value) => {
        const next = typeof value === 'function' ? value(cursorRef.current) : value;
        cursorRef.current = next;
        setCursorStackState(next);
    }, []);
    const setCraftingGrid2x2 = useCallback<React.Dispatch<React.SetStateAction<(ItemStack | null)[]>>>((value) => {
        const next = typeof value === 'function' ? value(craftingGrid2x2Ref.current) : value;
        craftingGrid2x2Ref.current = next;
        setCraftingGrid2x2State(next);
    }, []);
    const setCraftingGrid3x3 = useCallback<React.Dispatch<React.SetStateAction<(ItemStack | null)[]>>>((value) => {
        const next = typeof value === 'function' ? value(craftingGrid3x3Ref.current) : value;
        craftingGrid3x3Ref.current = next;
        setCraftingGrid3x3State(next);
    }, []);

    useEffect(() => { inventoryRef.current = inventory; }, [inventory]);
    useEffect(() => { cursorRef.current = cursorStack; }, [cursorStack]);
    useEffect(() => { craftingGrid2x2Ref.current = craftingGrid2x2; }, [craftingGrid2x2]);
    useEffect(() => { craftingGrid3x3Ref.current = craftingGrid3x3; }, [craftingGrid3x3]);
    useEffect(() => { craftingOutputRef.current = craftingOutput; }, [craftingOutput]);
    useEffect(() => { equipmentRef.current = equipment; }, [equipment]);

    // Helpers
    const spawnItemDrop = useCallback((item: ItemStack) => {
        const { pos, dir } = cameraRef.current ? cameraRef.current.getCamera() : { pos: playerPosRef.current, dir: new THREE.Vector3(0,0,1) };
        const spawnPos = pos.clone().add(dir.clone().multiplyScalar(0.5));
        const throwVel = dir.multiplyScalar(8.0).add(new THREE.Vector3(0, 2.0, 0));

        setDrops(p => [...p, { 
            id: Math.random().toString(), 
            type: item.type, 
            count: item.count, 
            instance: item.instance ? structuredClone(item.instance) : undefined,
            position: [spawnPos.x, spawnPos.y, spawnPos.z], 
            velocity: [throwVel.x, throwVel.y, throwVel.z], 
            createdAt: Date.now(),
            pickupDelay: Date.now() + 1500,
            age: 0,
        }]);
    }, [cameraRef, playerPosRef, setDrops]);

    const getContainerData = useCallback((): FurnaceState | ChestState | null => {
        if (!openContainer) return null;
        if (openContainer.type === 'furnace') return worldManager.getFurnace(openContainer.x, openContainer.y, openContainer.z) ?? null;
        if (openContainer.type === 'chest') return worldManager.getChest(openContainer.x, openContainer.y, openContainer.z) ?? null;
        return null;
    }, [openContainer]);

    const updateSlot = useCallback((collection: InventoryCollection, index: number, newItem: ItemStack | null) => {
        const cData = getContainerData();
        
        if (collection === 'inventory') {
            // Update Sync Ref immediately
            const next = [...inventoryRef.current];
            next[index] = newItem;
            inventoryRef.current = next;
            setInventory(next);
        } else if (collection === 'crafting') {
            (openContainer?.type === 'crafting' ? setCraftingGrid3x3 : setCraftingGrid2x2)(prev => { const n = [...prev]; n[index] = newItem; return n; });
        } else if (collection === 'equipment') {
            const slot = EQUIPMENT_SLOTS[index];
            if (!slot) return;
            equipmentRef.current = { ...equipmentRef.current, [slot]: newItem };
            setEquipment(equipmentRef.current);
        } else if (openContainer?.type === 'furnace' && cData) {
            const fData = cData as FurnaceState;
            if (collection === 'furnace_input') fData.input = newItem;
            if (collection === 'furnace_fuel') fData.fuel = newItem;
            if (collection === 'furnace_output') fData.output = newItem;
        } else if (openContainer?.type === 'chest' && cData) {
            const chData = cData as ChestState;
            chData.items[index] = newItem;
            // Force refresh UI for external containers
            setOpenContainer({ ...openContainer });
        }
    }, [getContainerData, openContainer, setCraftingGrid2x2, setCraftingGrid3x3, setEquipment, setInventory, setOpenContainer]);

    const getSlot = useCallback((collection: InventoryCollection, index: number): ItemStack | null => {
        const cData = getContainerData();
        
        if (collection === 'inventory') return inventoryRef.current[index]; // Use REF for current logic
        if (collection === 'crafting') return (openContainer?.type === 'crafting' ? craftingGrid3x3Ref.current[index] : craftingGrid2x2Ref.current[index]);
        if (collection === 'output') return craftingOutputRef.current;
        if (collection === 'equipment') {
            const slot = EQUIPMENT_SLOTS[index];
            return slot ? equipmentRef.current[slot] : null;
        }
        if (openContainer?.type === 'furnace' && cData) {
            const fData = cData as FurnaceState;
            if (collection === 'furnace_input') return fData.input;
            if (collection === 'furnace_fuel') return fData.fuel;
            if (collection === 'furnace_output') return fData.output;
        }
        if (openContainer?.type === 'chest' && cData) {
            return (cData as ChestState).items[index];
        }
        return null;
    }, [getContainerData, openContainer]);

    // --- ADD TO INVENTORY (Synchronous) ---
    // Moved here to share the shadow state with other inventory actions
    const addToInventory = useCallback((stackOrType: ItemStack | BlockType, count: number = 1): ItemStack | null => {
        const item = typeof stackOrType === 'number'
            ? { type: stackOrType, count }
            : cloneItemStack(stackOrType);
        const next = [...inventoryRef.current];
        let rem = item.count;
        const max = getItemStackLimit(item.type);

        // 1. Fill existing stacks
        for (let i = 0; i < INVENTORY_SIZE && rem > 0; i++) {
            if (next[i] && canStacksMerge(next[i]!, item) && next[i]!.count < max) {
                const add = Math.min(max - next[i]!.count, rem);
                next[i] = cloneItemStack(next[i]!, next[i]!.count + add);
                rem -= add;
            }
        }
        // 2. Fill empty slots
        for (let i = 0; i < INVENTORY_SIZE && rem > 0; i++) {
            if (!next[i]) {
                const add = Math.min(max, rem);
                next[i] = cloneItemStack(item, add);
                rem -= add;
            }
        }
        
        // Update both REF and State
        inventoryRef.current = next;
        setInventory(next);
        return rem > 0 ? cloneItemStack(item, rem) : null;
    }, [setInventory]);

    const addToInventoryList = (list: (ItemStack | null)[], item: ItemStack, reversed: boolean = false): ItemStack | null => {
        let rem = item.count;
        const max = getItemStackLimit(item.type);
        const indices = list.map((_, i) => i);
        if (reversed) indices.reverse();

        // 1. Fill existing
        for (const i of indices) {
            if (list[i] && canStacksMerge(list[i]!, item) && list[i]!.count < max) {
                const add = Math.min(max - list[i]!.count, rem);
                list[i] = { ...list[i]!, count: list[i]!.count + add };
                rem -= add;
                if (rem <= 0) return null;
            }
        }
        // 2. Fill empty
        for (const i of indices) {
            if (!list[i]) {
                const add = Math.min(max, rem);
                list[i] = cloneItemStack(item, add);
                rem -= add;
                if (rem <= 0) return null;
            }
        }
        return { ...item, count: rem };
    };

    const isCollectionAvailable = useCallback((collection: InventoryCollection): boolean => {
        if (collection === 'none') return false;
        if (collection === 'inventory' || collection === 'equipment') return true;
        if (collection === 'creative') return gameMode === 'creative' && openContainer?.type === 'creative';
        if (collection === 'crafting' || collection === 'output') {
            return openContainer?.type === 'inventory' || openContainer?.type === 'crafting';
        }
        if (collection === 'chest') return openContainer?.type === 'chest';
        return openContainer?.type === 'furnace';
    }, [gameMode, openContainer]);

    const getActiveCraftingGrid = useCallback(() => (
        openContainer?.type === 'crafting' ? craftingGrid3x3Ref.current : craftingGrid2x2Ref.current
    ), [openContainer]);

    const isSlotIndexValid = useCallback((collection: InventoryCollection, index: number): boolean => {
        if (!Number.isInteger(index) || index < 0) return false;
        if (collection === 'inventory') return index < INVENTORY_SIZE;
        if (collection === 'equipment') return index < EQUIPMENT_SLOTS.length;
        if (collection === 'crafting') return index < getActiveCraftingGrid().length;
        if (collection === 'output' || collection === 'furnace_input'
            || collection === 'furnace_fuel' || collection === 'furnace_output') return index === 0;
        if (collection === 'chest') {
            const chest = getContainerData() as ChestState | null;
            return !!chest && index < chest.items.length;
        }
        return collection === 'creative';
    }, [getActiveCraftingGrid, getContainerData]);

    const canPlaceInSlot = useCallback((collection: InventoryCollection, index: number, item: ItemStack): boolean => {
        if (!isCollectionAvailable(collection) || !isSlotIndexValid(collection, index)) return false;
        if (collection === 'output' || collection === 'furnace_output' || collection === 'creative') return false;
        if (collection === 'furnace_input') return !!BLOCKS[item.type]?.smeltsInto;
        if (collection === 'furnace_fuel') return !!BLOCKS[item.type]?.isFuel;
        if (collection === 'equipment') {
            const slot = EQUIPMENT_SLOTS[index];
            return !!slot && slotForItem(item.type) === slot;
        }
        return true;
    }, [isCollectionAvailable, isSlotIndexValid]);

    const syncCraftingOutput = useCallback((grid = getActiveCraftingGrid()) => {
        const width = openContainer?.type === 'crafting' ? 3 : 2;
        const result = checkRecipe(grid.map(item => item?.type ?? null), width);
        const next = result ? { ...result } : null;
        craftingOutputRef.current = next;
        setCraftingOutput(next);
        return next;
    }, [getActiveCraftingGrid, openContainer]);

    const consumeCrafts = useCallback((crafts: number) => {
        if (crafts <= 0) return;
        const next = getActiveCraftingGrid().map(item => item
            ? (item.count > crafts ? cloneItemStack(item, item.count - crafts) : null)
            : null);
        (openContainer?.type === 'crafting' ? setCraftingGrid3x3 : setCraftingGrid2x2)(next);
        syncCraftingOutput(next);
    }, [getActiveCraftingGrid, openContainer, setCraftingGrid2x2, setCraftingGrid3x3, syncCraftingOutput]);

    const getCraftLimit = useCallback(() => {
        if (!syncCraftingOutput()) return 0;
        const ingredients = getActiveCraftingGrid().filter((item): item is ItemStack => item !== null);
        return ingredients.length > 0 ? Math.min(...ingredients.map(item => item.count)) : 0;
    }, [getActiveCraftingGrid, syncCraftingOutput]);

    const spawnItemDrops = useCallback((item: ItemStack, totalCount: number) => {
        const max = getItemStackLimit(item.type);
        for (let remaining = totalCount; remaining > 0; remaining -= max) {
            spawnItemDrop(cloneItemStack(item, Math.min(max, remaining)));
        }
    }, [spawnItemDrop]);

    const handleInventoryAction = useCallback<InventoryActionHandler>((action, collection, index, data?: InventoryActionData) => {
        const currentCursor = cursorRef.current;

        // drop_cursor and drag_end are dispatched with collection 'none' (their
        // real targets live in `data`), so they must skip the per-slot availability
        // gate, otherwise every drag distribution was silently dropped and the
        // held stack bounced straight back to the cursor.
        if (action !== 'drop_cursor' && action !== 'drag_end'
            && (!isCollectionAvailable(collection) || !isSlotIndexValid(collection, index))) return;
        const slotItem = collection === 'output'
            ? syncCraftingOutput()
            : getSlot(collection, index);

        // Middle-click never behaves like a normal click. Creative clones a full
        // stack from any visible item; survival leaves the slot untouched.
        if (action === 'middle_click') {
            const creativeItem = collection === 'creative' && data && 'creativeItem' in data
                ? data.creativeItem
                : slotItem;
            if (gameMode === 'creative' && creativeItem && !currentCursor) {
                setCursorStack(cloneItemStack(creativeItem, getItemStackLimit(creativeItem.type)));
            }
            return;
        }

        // --- CREATIVE PICK ---
        if (collection === 'creative') {
            if (gameMode !== 'creative' || !data || !('creativeItem' in data)) return;
            if (action === 'swap_hotbar' && data.hotbarIdx !== undefined) {
                const next = [...inventoryRef.current];
                next[data.hotbarIdx] = cloneItemStack(data.creativeItem, getItemStackLimit(data.creativeItem.type));
                setInventory(next);
                return;
            }
            if (action === 'drop_key') {
                const max = getItemStackLimit(data.creativeItem.type);
                spawnItemDrop(cloneItemStack(data.creativeItem, data.dropAll ? max : 1));
                return;
            }
            const count = action === 'right_click' ? 1 : getItemStackLimit(data.creativeItem.type);
            if (action === 'click' || action === 'right_click') {
                setCursorStack(cloneItemStack(data.creativeItem, count));
            } else if (action === 'shift_click') {
                const next = [...inventoryRef.current];
                addToInventoryList(next, cloneItemStack(data.creativeItem, getItemStackLimit(data.creativeItem.type)));
                setInventory(next);
            }
            return;
        }

        // --- DROP CURSOR ---
        if (action === 'drop_cursor') {
            if (currentCursor) {
                const dropAll = !(data && 'dropAll' in data) || data.dropAll;
                const count = dropAll ? currentCursor.count : 1;
                spawnItemDrop(cloneItemStack(currentCursor, count));
                setCursorStack(currentCursor.count > count
                    ? cloneItemStack(currentCursor, currentCursor.count - count)
                    : null);
            }
            return;
        }

        // --- DROP KEY (Q) ---
        if (action === 'drop_key') {
            // Check using REF to ensure we don't drop items that are already gone in this event loop
            if (!slotItem) return; 
            
            const dropAll = !!(data && 'dropAll' in data && data.dropAll);
            const count = dropAll ? slotItem.count : 1;
            
            // Optimistic update prevention
            if (slotItem.count < count) return;

            if (collection === 'output') {
                const crafts = dropAll ? getCraftLimit() : 1;
                if (crafts <= 0) return;
                spawnItemDrops(slotItem, slotItem.count * crafts);
                consumeCrafts(crafts);
                return;
            }

            spawnItemDrop(cloneItemStack(slotItem, count));
            
            if (slotItem.count - count <= 0) updateSlot(collection, index, null);
            else updateSlot(collection, index, cloneItemStack(slotItem, slotItem.count - count));
            return;
        }

        // --- SWAP HOTBAR (Number Keys) ---
        if (action === 'swap_hotbar') {
            if (currentCursor) return; // Don't swap if dragging
            const hotbarIdx = data && 'hotbarIdx' in data ? data.hotbarIdx : undefined;
            if (hotbarIdx === undefined || hotbarIdx < 0 || hotbarIdx > 8) return;
            
            // Prevent swapping with self if in inventory
            if (collection === 'inventory' && index === hotbarIdx) return;
            if (collection === 'output' || collection === 'furnace_output') {
                if (!slotItem) return;
                if (collection === 'output' && getCraftLimit() <= 0) return;
                const target = inventoryRef.current[hotbarIdx];
                const max = getItemStackLimit(slotItem.type);
                if (target && (!canStacksMerge(target, slotItem) || target.count + slotItem.count > max)) return;
                const next = [...inventoryRef.current];
                next[hotbarIdx] = target
                    ? cloneItemStack(target, target.count + slotItem.count)
                    : cloneItemStack(slotItem);
                setInventory(next);
                if (collection === 'output') consumeCrafts(1);
                else updateSlot(collection, index, null);
                return;
            }

            const targetItem = inventoryRef.current[hotbarIdx];
            if (targetItem && !canPlaceInSlot(collection, index, targetItem)) return;
            
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
                // Craft as many complete recipes as the ingredients and current
                // inventory capacity allow. Never make this all-or-nothing.
                const craftLimit = getCraftLimit();
                for (let crafts = craftLimit; crafts > 0; crafts--) {
                    const nextInv = [...inventoryRef.current];
                    const remainder = addToInventoryList(nextInv, cloneItemStack(slotItem, slotItem.count * crafts));
                    if (!remainder) {
                        setInventory(nextInv);
                        consumeCrafts(crafts);
                        break;
                    }
                }
                return;
            }

            if (collection === 'equipment') {
                const nextInv = [...inventoryRef.current];
                const remainder = addToInventoryList(nextInv, slotItem, true);
                if (remainder?.count === slotItem.count) return;
                setInventory(nextInv);
                updateSlot(collection, index, remainder);
                return;
            }

            // Simple Transfer
            let targetList: (ItemStack|null)[] | null = null;
            let updateTarget = (_l: (ItemStack|null)[]) => {};
            
            if (collection === 'inventory') {
                if ((openContainer?.type === 'inventory' || openContainer?.type === 'creative')) {
                    const equipmentSlot = slotForItem(slotItem.type);
                    if (equipmentSlot && !equipmentRef.current[equipmentSlot]) {
                        const equipmentIndex = EQUIPMENT_SLOTS.indexOf(equipmentSlot);
                        updateSlot('equipment', equipmentIndex, cloneItemStack(slotItem, 1));
                        updateSlot('inventory', index, slotItem.count > 1
                            ? cloneItemStack(slotItem, slotItem.count - 1)
                            : null);
                        return;
                    }
                }

                if (openContainer && openContainer.type !== 'creative') {
                    if (openContainer.type === 'chest') {
                        const chest = getContainerData() as ChestState | null;
                        if (!chest) return;
                        targetList = [...chest.items];
                        updateTarget = (l) => { chest.items = l; setOpenContainer({...openContainer}); };
                    } else if (openContainer.type === 'furnace') {
                        const f = getContainerData() as FurnaceState | null;
                        if (!f) return;
                        const def = BLOCKS[slotItem.type];
                        const destination = def.smeltsInto ? 'furnace_input' : def.isFuel ? 'furnace_fuel' : null;
                        if (destination) {
                            const target = destination === 'furnace_input' ? f.input : f.fuel;
                            const max = getItemStackLimit(slotItem.type);
                            if (!target) {
                                updateSlot(destination, 0, cloneItemStack(slotItem, Math.min(max, slotItem.count)));
                                updateSlot(collection, index, slotItem.count > max
                                    ? cloneItemStack(slotItem, slotItem.count - max)
                                    : null);
                                return;
                            }
                            if (canStacksMerge(target, slotItem) && target.count < max) {
                                const moved = Math.min(max - target.count, slotItem.count);
                                updateSlot(destination, 0, cloneItemStack(target, target.count + moved));
                                updateSlot(collection, index, slotItem.count > moved
                                    ? cloneItemStack(slotItem, slotItem.count - moved)
                                    : null);
                                return;
                            }
                            // A valid furnace item stays put when its machine slot
                            // is blocked; it must not silently jump hotbar sections.
                            return;
                        }
                    }
                } 
                
                if (!targetList) {
                    const isHotbar = index < 9;
                    const newInv = [...inventoryRef.current];
                    newInv[index] = null;
                    let rem = slotItem.count;
                    const max = getItemStackLimit(slotItem.type);
                    const rangeStart = isHotbar ? 9 : 0;
                    const rangeEnd = isHotbar ? 36 : 9;
                    
                    for (let i=rangeStart; i<rangeEnd && rem>0; i++) {
                        if (newInv[i] && canStacksMerge(newInv[i]!, slotItem) && newInv[i]!.count < max) {
                            const add = Math.min(max - newInv[i]!.count, rem);
                            // Clone before changing count, the stack object is shared
                            // with the previous React state array.
                            newInv[i] = cloneItemStack(newInv[i]!, newInv[i]!.count + add);
                            rem -= add;
                        }
                    }
                    for (let i=rangeStart; i<rangeEnd && rem>0; i++) {
                        if (!newInv[i]) {
                            const add = Math.min(max, rem);
                            newInv[i] = cloneItemStack(slotItem, add);
                            rem -= add;
                        }
                    }
                    if (rem > 0) newInv[index] = cloneItemStack(slotItem, rem);
                    
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
            if (!data || !('mode' in data)) return;
            const { mode, slots, startStack } = data as DragEndActionData;
            
            if (mode === 'one') {
                let remainder = startStack.count;
                const newCursor = cloneItemStack(startStack);
                const max = getItemStackLimit(startStack.type);
                
                slots.forEach(slot => {
                    if (remainder <= 0) return;
                    // Output slots are result-only, never deposit into them (matches 'split' mode).
                    if (!canPlaceInSlot(slot.collection, slot.index, startStack)) return;
                    const sItem = getSlot(slot.collection, slot.index);
                    if (!sItem) {
                        updateSlot(slot.collection, slot.index, cloneItemStack(startStack, 1));
                        remainder--;
                    } else if (canStacksMerge(sItem, startStack) && sItem.count < max) {
                        updateSlot(slot.collection, slot.index, cloneItemStack(sItem, sItem.count + 1));
                        remainder--;
                    }
                });
                newCursor.count = remainder;
                setCursorStack(newCursor.count > 0 ? newCursor : null);
            } 
            else if (mode === 'split') {
                const count = startStack.count;
                const max = getItemStackLimit(startStack.type);
                const targets = slots.filter(slot => {
                    const sItem = getSlot(slot.collection, slot.index);
                    if (!canPlaceInSlot(slot.collection, slot.index, startStack)) return false;
                    return !sItem || (canStacksMerge(sItem, startStack) && sItem.count < max);
                });
                
                if (targets.length === 0) { 
                    setCursorStack(startStack); 
                    return; 
                }

                const itemsPerSlot = Math.floor(count / targets.length);
                const extra = count % targets.length;

                // Distribute itemsPerSlot to everyone (+1 to the first `extra`
                // slots), capping each slot at its REAL remaining capacity. A
                // near-full target absorbs only what fits; whatever could not be
                // placed returns to the cursor instead of vanishing.
                let placed = 0;
                targets.forEach((slot, idx) => {
                    const sItem = getSlot(slot.collection, slot.index);
                    const currentCount = sItem ? sItem.count : 0;
                    const bonus = idx < extra ? 1 : 0;
                    const amount = Math.min(itemsPerSlot + bonus, max - currentCount);
                    if (amount > 0) {
                        updateSlot(slot.collection, slot.index, cloneItemStack(startStack, currentCount + amount));
                        placed += amount;
                    }
                });

                const leftover = count - placed;
                setCursorStack(leftover > 0 ? cloneItemStack(startStack, leftover) : null);
            }
            return;
        }

        // --- DOUBLE CLICK (Gather) ---
        if (action === 'double_click') {
            const gatherType = currentCursor ? currentCursor.type : (slotItem ? slotItem.type : null);
            if (!gatherType) return;

            const currentStack = currentCursor ? cloneItemStack(currentCursor) : cloneItemStack(slotItem!, 0);
            const max = getItemStackLimit(gatherType);

            const scanList = (list: (ItemStack|null)[], coll: InventoryCollection, setList: (l:(ItemStack|null)[])=>void) => {
                const newList = [...list];
                let changed = false;
                for(let i=0; i<newList.length; i++) {
                    if(currentStack.count >= max) break;
                    
                    // Logic to gather
                    const item = newList[i];
                    if (item && canStacksMerge(item, currentStack)) {
                         // Don't gather from self if we are technically 'holding' items that originated from here?
                         // If cursor is present, we are gathering INTO cursor.
                         // Standard MC: Scans all slots except the one you clicked if it's already on cursor.
                         if (coll === collection && i === index && currentCursor) continue;

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

            // 2. Scan the active crafting grid and non-result machine slots.
            if (openContainer?.type === 'inventory' || openContainer?.type === 'crafting') {
                const setGrid = openContainer.type === 'crafting' ? setCraftingGrid3x3 : setCraftingGrid2x2;
                scanList(getActiveCraftingGrid(), 'crafting', setGrid);
            }

            // 3. Scan the open container. Result slots are intentionally excluded:
            // taking from them has crafting/smelting side effects.
            const cData = getContainerData();
            if (cData && openContainer?.type === 'chest') {
                const chest = cData as ChestState;
                const openChest = openContainer;
                scanList(chest.items, 'chest', (l) => { chest.items = l; setOpenContainer({ ...openChest }); });
            } else if (cData && openContainer?.type === 'furnace') {
                const furnace = cData as FurnaceState;
                scanList([furnace.input], 'furnace_input', (list) => { furnace.input = list[0]; });
                scanList([furnace.fuel], 'furnace_fuel', (list) => { furnace.fuel = list[0]; });
                setOpenContainer({ ...openContainer });
            }

            if (currentStack.count > 0) {
                setCursorStack(currentStack);
            }
            return;
        }

        // --- STANDARD CLICK ---
        if (collection === 'output' && slotItem) {
            if (getCraftLimit() <= 0) return;
            if (currentCursor) {
                const max = getItemStackLimit(currentCursor.type);
                if (canStacksMerge(currentCursor, slotItem) && currentCursor.count + slotItem.count <= max) {
                    setCursorStack(cloneItemStack(currentCursor, currentCursor.count + slotItem.count));
                    consumeCrafts(1);
                }
            } else {
                setCursorStack(cloneItemStack(slotItem));
                consumeCrafts(1);
            }
            return;
        }

        if (collection === 'furnace_output') {
            if (!slotItem) return;
            if (!currentCursor) {
                const take = action === 'right_click' ? Math.ceil(slotItem.count / 2) : slotItem.count;
                setCursorStack(cloneItemStack(slotItem, take));
                updateSlot(collection, index, slotItem.count > take
                    ? cloneItemStack(slotItem, slotItem.count - take)
                    : null);
            } else {
                const max = getItemStackLimit(currentCursor.type);
                if (canStacksMerge(currentCursor, slotItem) && currentCursor.count + slotItem.count <= max) {
                    setCursorStack(cloneItemStack(currentCursor, currentCursor.count + slotItem.count));
                    updateSlot(collection, index, null);
                }
            }
            return;
        }

        if (!currentCursor) {
            if (!slotItem) return;
            if (action === 'right_click') {
                const take = Math.ceil(slotItem.count / 2);
                const newStack = cloneItemStack(slotItem, take);
                setCursorStack(newStack);
                updateSlot(collection, index, slotItem.count - take > 0 ? cloneItemStack(slotItem, slotItem.count - take) : null);
            } else {
                setCursorStack(cloneItemStack(slotItem));
                updateSlot(collection, index, null);
            }
        } else {
            if (!slotItem) {
                if (!canPlaceInSlot(collection, index, currentCursor)) return;
                if (action === 'right_click') {
                    updateSlot(collection, index, cloneItemStack(currentCursor, 1));
                    setCursorStack(currentCursor.count > 1
                        ? cloneItemStack(currentCursor, currentCursor.count - 1)
                        : null);
                } else {
                    const max = getItemStackLimit(currentCursor.type);
                    const placed = Math.min(max, currentCursor.count);
                    updateSlot(collection, index, cloneItemStack(currentCursor, placed));
                    setCursorStack(currentCursor.count > placed
                        ? cloneItemStack(currentCursor, currentCursor.count - placed)
                        : null);
                }
            } else if (canStacksMerge(slotItem, currentCursor)) {
                const max = getItemStackLimit(slotItem.type);
                if (action === 'right_click') {
                    if (slotItem.count < max) {
                        updateSlot(collection, index, cloneItemStack(slotItem, slotItem.count + 1));
                        setCursorStack(currentCursor.count > 1
                            ? cloneItemStack(currentCursor, currentCursor.count - 1)
                            : null);
                    }
                } else {
                    const space = max - slotItem.count;
                    const add = Math.min(space, currentCursor.count);
                    if (add > 0) {
                        updateSlot(collection, index, cloneItemStack(slotItem, slotItem.count + add));
                        setCursorStack(currentCursor.count > add
                            ? cloneItemStack(currentCursor, currentCursor.count - add)
                            : null);
                    }
                }
            } else {
                // Swap
                if (!canPlaceInSlot(collection, index, currentCursor)) return;
                updateSlot(collection, index, cloneItemStack(currentCursor));
                setCursorStack(cloneItemStack(slotItem));
            }
        }

    }, [canPlaceInSlot, consumeCrafts, gameMode, getActiveCraftingGrid, getContainerData, getCraftLimit, getSlot, isCollectionAvailable, isSlotIndexValid, openContainer, setCraftingGrid2x2, setCraftingGrid3x3, setCursorStack, setInventory, setOpenContainer, spawnItemDrop, spawnItemDrops, syncCraftingOutput, updateSlot]);

    // Recipe Check
    React.useEffect(() => {
        syncCraftingOutput(openContainer?.type === 'crafting' ? craftingGrid3x3 : craftingGrid2x2);
    }, [craftingGrid2x2, craftingGrid3x3, openContainer, syncCraftingOutput]);

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
