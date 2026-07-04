
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
    type DragTargetSlot,
    type InventoryAction,
    type InventoryActionHandler,
    type OpenContainer,
    type OpenContainerState,
    ItemStack,
    BlockType,
    CreativeTab,
    BlockDef,
} from '../../types';
import { Slot } from './Slot';
import { worldManager } from '../../systems/WorldManager';
import { BLOCKS } from '../../data/blocks';
import { isEditableElement } from '../../utils/dom';
import { EQUIPMENT_SLOTS, slotForItem, type Equipment } from '../../systems/registry/equipment';
import { getItemTooltip, type TooltipLine } from '../../systems/registry/itemTooltips';
import { canStacksMerge, cloneItemStack, getItemStackLimit } from '../../systems/inventory/itemStackPolicy';
import type { EquipmentSlot } from '../../types';

interface InventoryUIProps {
    inventory: (ItemStack | null)[];
    openContainer: OpenContainer;
    setOpenContainer: (val: OpenContainerState) => void;
    selectedSlot: number;
    craftingGrid2x2: (ItemStack | null)[];
    craftingGrid3x3: (ItemStack | null)[];
    craftingOutput: ItemStack | null;
    cursorStack: ItemStack | null;
    handleInventoryAction: InventoryActionHandler;
    equipment: Equipment;
}

type SlotCollection = DragTargetSlot['collection'];

const SLOT_COLLECTIONS = new Set<SlotCollection>([
    'inventory',
    'crafting',
    'output',
    'creative',
    'chest',
    'furnace_input',
    'furnace_fuel',
    'furnace_output',
    'equipment',
]);

const isSlotCollection = (value: string): value is SlotCollection => SLOT_COLLECTIONS.has(value as SlotCollection);

const CREATIVE_TABS: { id: CreativeTab, name: string, icon: BlockType }[] = [
    { id: 'building', name: 'Building', icon: BlockType.BRICK },
    { id: 'natural', name: 'Natural', icon: BlockType.GRASS },
    { id: 'functional', name: 'Functional', icon: BlockType.CRAFTING_TABLE },
    { id: 'tools', name: 'Tools', icon: BlockType.IRON_PICKAXE },
    { id: 'food', name: 'Food', icon: BlockType.APPLE },
    { id: 'ingredients', name: 'Ingredients', icon: BlockType.IRON_INGOT },
];

const ARMOR_EQUIPMENT_SLOTS = EQUIPMENT_SLOTS.filter((slot) => slot !== 'accessory');

const CraftingArrow: React.FC = () => (
    <svg
        aria-hidden="true"
        className="h-[26px] w-8 shrink-0"
        viewBox="0 0 16 13"
        shapeRendering="crispEdges"
    >
        <path
            fill="#8b8b8b"
            d="M9 0h1v1h1v1h1v1h1v1h1v1h1v1h1v1h-1v1h-1v1h-1v1h-1v1h-1v1h-1v1H9V8H0V5h9V0Z"
        />
    </svg>
);

const ITEM_SORT_ORDER: BlockType[] = [
    // --- BUILDING ---
    BlockType.STONE, BlockType.COBBLESTONE, BlockType.BRICK, 
    BlockType.SANDSTONE, BlockType.RED_SANDSTONE, BlockType.BASALT, BlockType.OBSIDIAN,
    BlockType.OAK_PLANKS, BlockType.SPRUCE_PLANKS, BlockType.BIRCH_PLANKS, BlockType.CHERRY_PLANKS,
    BlockType.JUNGLE_PLANKS, BlockType.DARK_OAK_PLANKS, BlockType.ACACIA_PLANKS,
    BlockType.GLASS, BlockType.WOOL, BlockType.IRON_BLOCK,
    BlockType.ANDESITE, BlockType.DIORITE, BlockType.GRANITE, BlockType.MOSSY_COBBLESTONE,
    // Slabs
    BlockType.STONE_SLAB, BlockType.COBBLESTONE_SLAB, BlockType.BRICK_SLAB, BlockType.SANDSTONE_SLAB, BlockType.RED_SANDSTONE_SLAB,
    BlockType.OAK_SLAB, BlockType.SPRUCE_SLAB, BlockType.BIRCH_SLAB, BlockType.CHERRY_SLAB,
    BlockType.JUNGLE_SLAB, BlockType.DARK_OAK_SLAB, BlockType.ACACIA_SLAB,
    // Stairs
    BlockType.STONE_STAIRS, BlockType.COBBLESTONE_STAIRS, BlockType.BRICK_STAIRS, BlockType.SANDSTONE_STAIRS, BlockType.RED_SANDSTONE_STAIRS,
    BlockType.OAK_STAIRS, BlockType.SPRUCE_STAIRS, BlockType.BIRCH_STAIRS, BlockType.CHERRY_STAIRS,
    BlockType.JUNGLE_STAIRS, BlockType.DARK_OAK_STAIRS, BlockType.ACACIA_STAIRS,
    BlockType.TERRACOTTA, BlockType.TERRACOTTA_WHITE, BlockType.TERRACOTTA_LIGHT_GRAY, BlockType.TERRACOTTA_BROWN, BlockType.TERRACOTTA_RED, BlockType.TERRACOTTA_ORANGE, BlockType.TERRACOTTA_YELLOW, BlockType.TERRACOTTA_MAGENTA,

    // --- NATURAL ---
    BlockType.GRASS, BlockType.DIRT, BlockType.COARSE_DIRT, BlockType.MUD, BlockType.SAND, BlockType.RED_SAND, BlockType.SNOWY_GRASS, BlockType.SNOW_BLOCK, BlockType.ICE, BlockType.PACKED_ICE,
    BlockType.MOSSY_GRASS, BlockType.LUSH_GRASS, BlockType.DARK_GRASS, BlockType.MEADOW_GRASS, BlockType.SAVANNA_GRASS, BlockType.JUNGLE_GRASS, BlockType.PODZOL,
    BlockType.LOG, BlockType.SPRUCE_LOG, BlockType.BIRCH_LOG, BlockType.CHERRY_LOG,
    BlockType.JUNGLE_LOG, BlockType.DARK_OAK_LOG, BlockType.ACACIA_LOG,
    BlockType.LEAVES, BlockType.SPRUCE_LEAVES, BlockType.BIRCH_LEAVES, BlockType.CHERRY_LEAVES,
    BlockType.JUNGLE_LEAVES, BlockType.DARK_OAK_LEAVES, BlockType.ACACIA_LEAVES,
    BlockType.CACTUS, BlockType.DEAD_BUSH, BlockType.GRASS_PLANT, BlockType.ROSE, BlockType.DANDELION, BlockType.PINK_FLOWER, BlockType.WHEAT_SEEDS,
    BlockType.SAPLING, BlockType.SPRUCE_SAPLING, BlockType.BIRCH_SAPLING, BlockType.CHERRY_SAPLING,
    BlockType.JUNGLE_SAPLING, BlockType.DARK_OAK_SAPLING, BlockType.ACACIA_SAPLING,
    BlockType.WATER, BlockType.LAVA, BlockType.MAGMA,
    BlockType.COAL_ORE, BlockType.IRON_ORE, BlockType.COPPER_ORE, BlockType.GOLD_ORE, BlockType.LAPIS_ORE, BlockType.DIAMOND_ORE, BlockType.EMERALD_ORE,

    // --- TOOLS (Tiered) ---
    // Wood
    BlockType.WOOD_SWORD, BlockType.WOOD_PICKAXE, BlockType.WOOD_AXE, BlockType.WOOD_SHOVEL, BlockType.WOOD_HOE,
    // Stone
    BlockType.STONE_SWORD, BlockType.STONE_PICKAXE, BlockType.STONE_AXE, BlockType.STONE_SHOVEL, BlockType.STONE_HOE,
    // Iron
    BlockType.IRON_SWORD, BlockType.IRON_PICKAXE, BlockType.IRON_AXE, BlockType.IRON_SHOVEL, BlockType.IRON_HOE,
    // Gold
    BlockType.GOLD_SWORD, BlockType.GOLD_PICKAXE, BlockType.GOLD_AXE, BlockType.GOLD_SHOVEL, BlockType.GOLD_HOE,
    // Diamond
    BlockType.DIAMOND_SWORD, BlockType.DIAMOND_PICKAXE, BlockType.DIAMOND_AXE, BlockType.DIAMOND_SHOVEL, BlockType.DIAMOND_HOE,
    // Copper (Custom)
    BlockType.COPPER_SWORD, BlockType.COPPER_PICKAXE, BlockType.COPPER_AXE, BlockType.COPPER_SHOVEL, BlockType.COPPER_HOE,
    // Equipment and magnetic tools
    BlockType.IRON_HELMET, BlockType.IRON_CHESTPLATE, BlockType.IRON_LEGGINGS, BlockType.IRON_BOOTS,
    BlockType.POLARITY_BOOTS, BlockType.POSITIVE_MAGNET, BlockType.NEGATIVE_MAGNET,

    // --- INGREDIENTS ---
    BlockType.COAL, BlockType.CHARCOAL, 
    BlockType.RAW_IRON, BlockType.IRON_INGOT, 
    BlockType.RAW_COPPER, BlockType.COPPER_INGOT, 
    BlockType.RAW_GOLD, BlockType.GOLD_INGOT,
    BlockType.DIAMOND, BlockType.EMERALD, BlockType.LAPIS_LAZULI,
    BlockType.STICK,

    // --- FUNCTIONAL ---
    BlockType.CRAFTING_TABLE, BlockType.FURNACE, BlockType.CHEST, BlockType.TORCH, BlockType.BED_ITEM
];

export const InventoryUI: React.FC<InventoryUIProps> = ({ 
    inventory, openContainer, setOpenContainer,
    craftingGrid2x2, craftingGrid3x3, craftingOutput,
    cursorStack, handleInventoryAction,
    equipment
}) => {
    const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
    const [hoverInfo, setHoverInfo] = useState<{name: string, lines: TooltipLine[], x: number, y: number} | null>(null);
    const [activeTab, setActiveTab] = useState<CreativeTab>('building');
    const [hoveredSlot, setHoveredSlot] = useState<DragTargetSlot | null>(null);
    
    const [isDragging, setIsDragging] = useState(false);
    const [dragMode, setDragMode] = useState<'split' | 'one' | 'shift' | null>(null);
    const [dragSlots, setDragSlots] = useState<Set<string>>(new Set());
    const [startDragStack, setStartDragStack] = useState<ItemStack | null>(null);
    
    const dragSlotsRef = useRef<Set<string>>(new Set());
    const dragOriginRef = useRef<DragTargetSlot | null>(null);
    const dragMovedRef = useRef(false);
    const activeDragModeRef = useRef<'split' | 'one' | 'shift' | null>(null);
    const activeDragStackRef = useRef<ItemStack | null>(null);
    const suppressBackdropClickRef = useRef(false);
    const lastClickRef = useRef<{ time: number, key: string, button: number } | null>(null);
    const [, setTick] = useState(0);
    const rafRef = useRef<number>(0);

    const creativeItems = useMemo(() => {
        const manualOrderMap = new Map(ITEM_SORT_ORDER.map((type, i) => [type, i]));

        const sortFn = (a: BlockDef, b: BlockDef) => {
            const idxA = manualOrderMap.get(a.id);
            const idxB = manualOrderMap.get(b.id);
            
            // If both are in manual list, sort by index
            if (idxA !== undefined && idxB !== undefined) return idxA - idxB;
            // If only A is in manual list, A comes first
            if (idxA !== undefined) return -1;
            // If only B is in manual list, B comes first
            if (idxB !== undefined) return 1;
            
            // Fallback: Sort by ID
            return a.id - b.id;
        };

        return Object.values(BLOCKS)
            .filter(b => b.id !== BlockType.AIR
                && b.id !== BlockType.FURNACE_ACTIVE
                && b.id !== BlockType.BED_HEAD
                && b.id !== BlockType.BED_FOOT
                && b.id !== BlockType.DEBUG_CROSS
                && b.category === activeTab)
            .sort(sortFn) 
            .map(b => ({ type: b.id, count: 1 }));
    }, [activeTab]);

    useEffect(() => {
        if (openContainer && openContainer.type === 'furnace') {
            const loop = () => {
                setTick(t => t + 1);
                rafRef.current = requestAnimationFrame(loop);
            };
            rafRef.current = requestAnimationFrame(loop);
        } else {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        }
        return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    }, [openContainer]);

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (isEditableElement(e.target)) return;
            if (!hoveredSlot) return;

            if (e.code.startsWith('Digit') && e.code !== 'Digit0') {
                const hotbarIdx = parseInt(e.code.replace('Digit', '')) - 1;
                if (hotbarIdx >= 0 && hotbarIdx < 9) {
                    const creativeItem = hoveredSlot.collection === 'creative' ? creativeItems[hoveredSlot.index] : undefined;
                    handleInventoryAction('swap_hotbar', hoveredSlot.collection, hoveredSlot.index,
                        creativeItem ? { hotbarIdx, creativeItem } : { hotbarIdx });
                }
            }

            if (e.code === 'KeyQ') {
                const dropAll = e.ctrlKey || e.metaKey;
                const creativeItem = hoveredSlot.collection === 'creative' ? creativeItems[hoveredSlot.index] : undefined;
                handleInventoryAction('drop_key', hoveredSlot.collection, hoveredSlot.index,
                    creativeItem ? { dropAll, creativeItem } : { dropAll });
            }
        };

        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [creativeItems, hoveredSlot, handleInventoryAction]);

    const getChestItems = () => {
        if (openContainer.type === 'chest') {
            const chest = worldManager.getChest(openContainer.x, openContainer.y, openContainer.z);
            return chest ? chest.items : [];
        }
        return [];
    };

    const chestItems = getChestItems();
    const furnaceData = openContainer.type === 'furnace' ? worldManager.getFurnace(openContainer.x, openContainer.y, openContainer.z) : null;
    
    const burnProgress = furnaceData && furnaceData.maxBurnTime > 0 
        ? Math.min(1, Math.max(0, furnaceData.burnTime / furnaceData.maxBurnTime)) 
        : 0;
    const cookProgress = furnaceData && furnaceData.maxCookTime > 0
        ? Math.min(1, Math.max(0, furnaceData.cookTime / furnaceData.maxCookTime))
        : 0;

    const getSlotKey = (collection: SlotCollection, index: number) => `${collection}-${index}`;

    const getUiSlotItem = useCallback((collection: SlotCollection, index: number): ItemStack | null => {
        if (collection === 'inventory') return inventory[index] ?? null;
        if (collection === 'crafting') return (openContainer.type === 'crafting' ? craftingGrid3x3 : craftingGrid2x2)[index] ?? null;
        if (collection === 'output') return craftingOutput;
        if (collection === 'creative') return creativeItems[index] ?? null;
        if (collection === 'chest') return chestItems[index] ?? null;
        if (collection === 'furnace_input') return furnaceData?.input ?? null;
        if (collection === 'furnace_fuel') return furnaceData?.fuel ?? null;
        if (collection === 'furnace_output') return furnaceData?.output ?? null;
        if (collection === 'equipment') {
            const slot = EQUIPMENT_SLOTS[index];
            return slot ? equipment[slot] : null;
        }
        return null;
    }, [chestItems, craftingGrid2x2, craftingGrid3x3, craftingOutput, creativeItems, equipment, furnaceData, inventory, openContainer.type]);

    const canDragIntoSlot = useCallback((collection: SlotCollection, index: number, stack: ItemStack): boolean => {
        if (collection === 'creative' || collection === 'output' || collection === 'furnace_output') return false;
        if (collection === 'furnace_input' && !BLOCKS[stack.type]?.smeltsInto) return false;
        if (collection === 'furnace_fuel' && !BLOCKS[stack.type]?.isFuel) return false;
        if (collection === 'equipment' && slotForItem(stack.type) !== EQUIPMENT_SLOTS[index]) return false;

        const item = getUiSlotItem(collection, index);
        const max = getItemStackLimit(stack.type);
        return !item || (canStacksMerge(item, stack) && item.count < max);
    }, [getUiSlotItem]);

    const calculateDragDistribution = () => {
        if (!startDragStack || dragSlots.size === 0 || !dragMode) {
            return { remainder: startDragStack ? startDragStack.count : 0, distribution: {} as Record<string, number> };
        }
        
        const distribution: Record<string, number> = {};
        let remainder = startDragStack.count;
        const targets: DragTargetSlot[] = Array.from(dragSlots).flatMap((k: string) => {
            const [c, i] = k.split('-');
            if (!isSlotCollection(c)) return [];
            return [{ collection: c, index: parseInt(i, 10) }];
        });

        const eligibleTargets = targets.filter(target => canDragIntoSlot(target.collection, target.index, startDragStack));

        if (dragMode === 'one') {
            eligibleTargets.forEach(target => {
                if (remainder <= 0) return;
                distribution[getSlotKey(target.collection, target.index)] = 1;
                remainder--;
            });
        } else if (dragMode === 'split' && eligibleTargets.length > 0) {
            const perSlot = Math.floor(startDragStack.count / eligibleTargets.length);
            const remItems = startDragStack.count % eligibleTargets.length;
            let placed = 0;
            
            eligibleTargets.forEach((target, idx) => {
                const current = getUiSlotItem(target.collection, target.index)?.count ?? 0;
                const capacity = getItemStackLimit(startDragStack.type) - current;
                const bonus = idx < remItems ? 1 : 0;
                const amount = Math.min(perSlot + bonus, capacity);
                if (amount > 0) {
                    distribution[getSlotKey(target.collection, target.index)] = amount;
                    placed += amount;
                }
            });
            remainder = startDragStack.count - placed;
        }
        
        return { remainder, distribution };
    };

    const dragDist = calculateDragDistribution();

    const dispatchSlotAction = useCallback((action: InventoryAction, collection: SlotCollection, index: number) => {
        if (collection === 'creative') {
            const creativeItem = creativeItems[index];
            if (creativeItem) handleInventoryAction(action, collection, index, { creativeItem });
            return;
        }
        handleInventoryAction(action, collection, index);
    }, [creativeItems, handleInventoryAction]);

    const resetDrag = useCallback(() => {
        activeDragModeRef.current = null;
        activeDragStackRef.current = null;
        dragOriginRef.current = null;
        dragMovedRef.current = false;
        dragSlotsRef.current = new Set();
        setIsDragging(false);
        setDragSlots(new Set());
        setStartDragStack(null);
        setDragMode(null);
    }, []);

    const beginDrag = useCallback((mode: 'split' | 'one' | 'shift', origin: DragTargetSlot, stack: ItemStack | null) => {
        activeDragModeRef.current = mode;
        activeDragStackRef.current = stack ? cloneItemStack(stack) : null;
        dragOriginRef.current = origin;
        dragMovedRef.current = false;

        const originKey = getSlotKey(origin.collection, origin.index);
        const includeOrigin = mode === 'shift' || (!!stack && canDragIntoSlot(origin.collection, origin.index, stack));
        dragSlotsRef.current = includeOrigin ? new Set([originKey]) : new Set();

        setIsDragging(true);
        setDragMode(mode);
        setStartDragStack(stack ? cloneItemStack(stack) : null);
        setDragSlots(new Set(dragSlotsRef.current));
    }, [canDragIntoSlot]);

    const finishDrag = useCallback((commit = true) => {
        const mode = activeDragModeRef.current;
        const origin = dragOriginRef.current;
        if (!mode || !origin) return;
        if (!commit) lastClickRef.current = null;

        suppressBackdropClickRef.current = true;
        window.setTimeout(() => { suppressBackdropClickRef.current = false; }, 0);
        if (commit && mode !== 'shift') {
            const stack = activeDragStackRef.current;
            if (stack) {
                if (!dragMovedRef.current) {
                    dispatchSlotAction(mode === 'one' ? 'right_click' : 'click', origin.collection, origin.index);
                    lastClickRef.current = mode === 'split'
                        ? { time: Date.now(), key: getSlotKey(origin.collection, origin.index), button: 0 }
                        : null;
                } else {
                    lastClickRef.current = null;
                    const targets: DragTargetSlot[] = Array.from(dragSlotsRef.current).flatMap((key) => {
                        const [collection, rawIndex] = key.split('-');
                        if (!isSlotCollection(collection)) return [];
                        return [{ collection, index: parseInt(rawIndex, 10) }];
                    });
                    handleInventoryAction('drag_end', 'none', 0, { mode, slots: targets, startStack: stack });
                }
            }
        }
        resetDrag();
    }, [dispatchSlotAction, handleInventoryAction, resetDrag]);

    useEffect(() => {
        const onPointerUp = () => finishDrag();
        const onPointerCancel = () => finishDrag(false);
        const onBlur = () => finishDrag(false);
        window.addEventListener('pointerup', onPointerUp, true);
        window.addEventListener('pointercancel', onPointerCancel, true);
        window.addEventListener('blur', onBlur);
        return () => {
            window.removeEventListener('pointerup', onPointerUp, true);
            window.removeEventListener('pointercancel', onPointerCancel, true);
            window.removeEventListener('blur', onBlur);
            activeDragModeRef.current = null;
            activeDragStackRef.current = null;
            dragOriginRef.current = null;
            dragSlotsRef.current = new Set();
        };
    }, [finishDrag]);

    const handleSlotPointerDown = (collection: SlotCollection, index: number, e: React.PointerEvent) => {
        e.stopPropagation();
        e.preventDefault();
        if (e.button < 0 || e.button > 2) return;

        const slotItem = getUiSlotItem(collection, index);
        const key = getSlotKey(collection, index);
        const now = Date.now();

        if (e.button === 1) {
            dispatchSlotAction('middle_click', collection, index);
            lastClickRef.current = null;
            return;
        }

        if (e.button === 0 && !e.shiftKey && lastClickRef.current
            && lastClickRef.current.button === 0
            && lastClickRef.current.key === key
            && now - lastClickRef.current.time < 450) {
            dispatchSlotAction('double_click', collection, index);
            lastClickRef.current = null;
            return;
        }

        if (e.shiftKey && e.button === 0 && !cursorStack) {
            lastClickRef.current = null;
            if (!slotItem) return;
            dispatchSlotAction('shift_click', collection, index);
            if (collection !== 'creative' && collection !== 'output' && collection !== 'furnace_output') {
                beginDrag('shift', { collection, index }, null);
                // NOTE: no setPointerCapture — capturing the pointer to the origin
                // slot suppresses mouseenter on the other slots, which is exactly
                // what the paint-drag (handleSlotEnter → tryAddDragSlot) relies on,
                // so capture made drags "stick" to one slot and bounce items back
                // to the cursor. The window-level pointerup/blur listeners already
                // finish the drag no matter where the pointer is released.
            }
            return;
        }

        if (collection === 'creative' || collection === 'output' || collection === 'furnace_output') {
            dispatchSlotAction(e.button === 2 ? 'right_click' : 'click', collection, index);
            lastClickRef.current = e.button === 0
                ? { time: now, key, button: 0 }
                : null;
            return;
        }

        if (cursorStack) {
            beginDrag(e.button === 2 ? 'one' : 'split', { collection, index }, cursorStack);
            // No setPointerCapture — see the note above; it broke multi-slot paint
            // by suppressing the other slots' mouseenter events.
            return;
        }

        dispatchSlotAction(e.button === 2 ? 'right_click' : 'click', collection, index);
        lastClickRef.current = e.button === 0
            ? { time: now, key, button: 0 }
            : null;
    };

    const tryAddDragSlot = (collection: SlotCollection, index: number) => {
        const mode = activeDragModeRef.current;
        if (!mode) return;

        const key = getSlotKey(collection, index);
        if (dragSlotsRef.current.has(key)) return;

        if (mode === 'shift') {
            const item = getUiSlotItem(collection, index);
            if (!item || collection === 'creative' || collection === 'output' || collection === 'furnace_output') return;
            dragSlotsRef.current.add(key);
            dragMovedRef.current = true;
            setDragSlots(new Set(dragSlotsRef.current));
            dispatchSlotAction('shift_click', collection, index);
            return;
        }

        const stack = activeDragStackRef.current;
        if (!stack || !canDragIntoSlot(collection, index, stack)) return;
        dragSlotsRef.current.add(key);
        dragMovedRef.current = key !== getSlotKey(dragOriginRef.current!.collection, dragOriginRef.current!.index);
        setDragSlots(new Set(dragSlotsRef.current));
    };

    const handleSlotEnter = (collection: SlotCollection, index: number, item: ItemStack | null, e: React.MouseEvent) => {
        setHoveredSlot({ collection, index });
        tryAddDragSlot(collection, index);

        if (!item) {
            setHoverInfo(null);
            return;
        }
        const tooltip = getItemTooltip(item);
        setHoverInfo({ name: tooltip.name, lines: tooltip.lines, x: e.clientX, y: e.clientY });
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        e.stopPropagation();
        finishDrag();
    };

    const onSlotLeave = () => {
        setHoveredSlot(null);
        setHoverInfo(null);
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        setMousePos({x: e.clientX, y: e.clientY});
        if (hoverInfo) {
            setHoverInfo(prev => prev ? { ...prev, x: e.clientX, y: e.clientY } : null);
        }

        if (activeDragModeRef.current) {
            const el = document.elementFromPoint(e.clientX, e.clientY);
            if (el) {
                const slotEl = el.closest('[data-slot-collection]');
                if (slotEl) {
                    const collection = slotEl.getAttribute('data-slot-collection');
                    const index = parseInt(slotEl.getAttribute('data-slot-index') || '-1');
                    if (collection && isSlotCollection(collection) && index >= 0) {
                        tryAddDragSlot(collection, index);
                    }
                }
            }
        }
    };

    const stopPropagation = (e: React.SyntheticEvent) => {
        e.stopPropagation();
    };

    const handleBackdropClick = (e: React.MouseEvent) => {
        if (suppressBackdropClickRef.current) {
            e.stopPropagation();
            return;
        }
        e.stopPropagation();
        if (cursorStack) {
            handleInventoryAction('drop_cursor', 'none', -1, { dropAll: true });
        }
    };

    const handleBackdropContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.target === e.currentTarget && !activeDragModeRef.current && cursorStack) {
            handleInventoryAction('drop_cursor', 'none', -1, { dropAll: false });
        }
    };

    const renderSlot = (item: ItemStack | null, collection: SlotCollection, index: number, size: 'large' | 'small' = 'large') => {
        let displayItem = item;
        const key = getSlotKey(collection, index);
        const dragAmount = dragDist.distribution[key];
        
        if (isDragging && dragAmount !== undefined && startDragStack) {
            const currentCount = item ? item.count : 0;
            displayItem = cloneItemStack(startDragStack, currentCount + dragAmount);
        }

        return (
            <div 
                key={key}
                className={`relative z-20 p-[2px]`}
                data-slot-collection={collection} 
                data-slot-index={index}
                onPointerDown={(e) => handleSlotPointerDown(collection, index, e)}
                onMouseEnter={(e) => handleSlotEnter(collection, index, item, e)}
                onMouseLeave={onSlotLeave}
                onPointerUp={handlePointerUp}
                onPointerCancel={() => finishDrag(false)}
                onClick={() => {}} 
                onContextMenu={() => {}}
                onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); }} 
            >
                <Slot 
                    item={displayItem} 
                    size={size}
                    onClick={() => {}} 
                    onContextMenu={() => {}}
                    onDoubleClick={() => {}}
                    onAuxClick={e => { e.stopPropagation(); e.preventDefault(); }}
                    onMouseDown={() => {}}
                    onMouseEnter={() => {}}
                    onMouseLeave={() => {}}
                    onMouseUp={() => {}}
                />
            </div>
        );
    };

    const renderEquipmentSlot = (slot: EquipmentSlot) => {
        const item = equipment[slot] ?? null;
        const index = EQUIPMENT_SLOTS.indexOf(slot);
        return (
            <div
                key={slot}
                className="relative"
                data-slot-collection="equipment"
                data-slot-index={index}
                onPointerDown={(e) => handleSlotPointerDown('equipment', index, e)}
                onMouseEnter={(e) => handleSlotEnter('equipment', index, item, e)}
                onMouseLeave={onSlotLeave}
                onPointerUp={handlePointerUp}
                onPointerCancel={() => finishDrag(false)}
                onContextMenu={(e) => e.preventDefault()}
                onAuxClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                title={slot}
            >
                <Slot item={item} size="large" />
                {!item && (
                    <span className="absolute inset-0 flex items-center justify-center text-[8px] uppercase text-[#5a5a5a] pointer-events-none select-none">
                        {slot}
                    </span>
                )}
            </div>
        );
    };

    const renderPlayerInventory = () => (
        <div className="flex flex-col gap-2">
            <div className="grid grid-cols-9 gap-0 bg-[#8b8b8b] p-1 border-2 border-t-[#333] border-l-[#333] border-b-white border-r-white">
                {inventory.slice(9).map((item, index) => renderSlot(item, 'inventory', index + 9))}
            </div>
            <div className="grid grid-cols-9 gap-0 mt-2 bg-[#8b8b8b] p-1 border-2 border-t-[#333] border-l-[#333] border-b-white border-r-white">
                {inventory.slice(0, 9).map((item, index) => renderSlot(item, 'inventory', index))}
            </div>
        </div>
    );

    const displayCursor = isDragging && startDragStack ? 
        (dragDist.remainder > 0 ? { ...startDragStack, count: dragDist.remainder } : null) 
        : cursorStack;

    return (
        <div 
            className="absolute inset-0 bg-black/70 z-50 flex items-center justify-center"
            onPointerMove={handlePointerMove}
            onClick={handleBackdropClick} 
            onMouseDown={(e) => { if(e.button !== 0 && !isDragging) e.stopPropagation(); }}
            onPointerUp={handlePointerUp}
            onPointerCancel={() => finishDrag(false)}
            onWheel={stopPropagation}
            onContextMenu={handleBackdropContextMenu}
        >
            <div className={`flex flex-col gap-0 relative ${openContainer.type === 'creative' ? 'w-[852px]' : openContainer.type === 'inventory' ? 'w-[1000px]' : 'scale-110'}`} onClick={stopPropagation}>
                
                {openContainer.type === 'creative' && (
                    <div className="flex gap-1 ml-4 z-10 translate-y-[2px]">
                        {CREATIVE_TABS.map(tab => (
                            <div 
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`
                                    w-10 h-10 aspect-square flex items-center justify-center cursor-pointer border-t-2 border-l-2 border-r-2
                                    ${activeTab === tab.id 
                                        ? 'bg-[#c6c6c6] border-white border-b-[#c6c6c6] h-11 -translate-y-1 z-20 pb-1' 
                                        : 'bg-[#8b8b8b] border-[#373737] hover:bg-[#a0a0a0]'}
                                `}
                                title={tab.name}
                            >
                                <Slot item={{ type: tab.icon, count: 1 }} size="small" bare />
                            </div>
                        ))}
                    </div>
                )}

                <div className={`flex flex-col gap-4 p-6 bg-[#c6c6c6] border-4 border-white border-b-[#444] border-r-[#444] shadow-2xl relative z-10`}>
                    <div className="flex justify-between items-center px-1">
                        <h2 className="text-[#333] font-bold text-lg uppercase tracking-wider">{openContainer.type === 'creative' ? CREATIVE_TABS.find(t=>t.id===activeTab)?.name : openContainer.type}</h2>
                        <button 
                            onMouseDown={(e) => e.stopPropagation()} 
                            onMouseUp={(e) => e.stopPropagation()}
                            onClick={() => setOpenContainer(null)} 
                            className="text-[#333] font-bold hover:text-red-600"
                        >✕</button>
                    </div>
                    
                    {openContainer.type === 'creative' && (
                        <div className="mb-2 h-[300px] overflow-x-hidden overflow-y-auto bg-[#8b8b8b] p-2 border-2 border-[#333] scrollbar-thin">
                             <div className="flex flex-wrap gap-1 content-start">
                                 {creativeItems.map((it, i) => (
                                     <div
                                        key={`c-${i}`}
                                        data-slot-collection="creative"
                                        data-slot-index={i}
                                        onPointerDown={(e) => handleSlotPointerDown('creative', i, e)}
                                        onMouseEnter={(e) => handleSlotEnter('creative', i, it, e)}
                                        onMouseLeave={onSlotLeave}
                                        onPointerUp={handlePointerUp}
                                        onPointerCancel={() => finishDrag(false)}
                                        onContextMenu={(e) => e.preventDefault()}
                                        onAuxClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                     >
                                         <Slot 
                                            item={it}
                                            size="large"
                                         />
                                     </div>
                                 ))}
                             </div>
                        </div>
                    )}

                    {openContainer.type === 'chest' && (
                        <div className="mb-2">
                            <div className="grid grid-cols-9 gap-0 bg-[#8b8b8b] p-1 border-2 border-t-[#333] border-l-[#333] border-b-white border-r-white">
                                {chestItems.map((it, i) => renderSlot(it, 'chest', i))}
                            </div>
                        </div>
                    )}

                    {(openContainer.type === 'inventory' || openContainer.type === 'creative') ? (
                        <div className="relative flex justify-center">
                            <div className="relative">
                                <div className="absolute right-full top-2 mr-6 flex items-start gap-1">
                                    {renderEquipmentSlot('accessory')}
                                    <div className="relative flex flex-col gap-1">
                                        <div className="absolute bottom-full left-0 right-0 mb-1 text-[#333] text-[10px] font-bold uppercase text-center">Armor</div>
                                        {ARMOR_EQUIPMENT_SLOTS.map(renderEquipmentSlot)}
                                    </div>
                                </div>

                                {renderPlayerInventory()}

                                {openContainer.type === 'inventory' && (
                                    <div className="absolute left-full top-2 ml-6 flex w-[208px] items-center gap-1">
                                        <div className="grid w-[116px] shrink-0 grid-cols-2 gap-0 p-1 bg-[#8b8b8b] border-2 border-t-[#333] border-l-[#333] border-b-white border-r-white">
                                            {craftingGrid2x2.map((item, index) => renderSlot(item, 'crafting', index))}
                                        </div>
                                        <CraftingArrow />
                                        <div className="shrink-0">{renderSlot(craftingOutput, 'output', 0)}</div>
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="flex gap-6 justify-center">
                            {renderPlayerInventory()}

                            {openContainer.type !== 'chest' && (
                            <>
                                <div className="w-px bg-black/20 self-stretch" />
                                <div className="flex flex-col items-center justify-center min-w-[120px]">
                                    {openContainer.type === 'furnace' ? (
                                        <div className="flex flex-col items-center gap-2">
                                            {renderSlot(furnaceData?.input || null, 'furnace_input', 0)}
                                            
                                            <div className="w-8 h-8 relative flex items-center justify-center">
                                                 <div className="text-2xl text-gray-400 opacity-20 absolute">🔥</div>
                                                 {burnProgress > 0 && (
                                                    <div 
                                                        className="text-2xl absolute bottom-0 left-0 w-full overflow-hidden" 
                                                        style={{ height: `${burnProgress * 100}%` }}
                                                    >
                                                        <div className="absolute bottom-0 left-0 w-full text-center">🔥</div>
                                                    </div>
                                                 )}
                                            </div>

                                            {renderSlot(furnaceData?.fuel || null, 'furnace_fuel', 0)}
                                            
                                            <div className="relative w-12 h-8 flex items-center justify-center mt-1">
                                                <svg width="40" height="24" viewBox="0 0 40 24" fill="#888" className="absolute">
                                                    <path d="M0,8 L24,8 L24,0 L40,12 L24,24 L24,16 L0,16 Z" />
                                                </svg>
                                                
                                                <div style={{ width: 40, height: 24, position: 'absolute', overflow: 'hidden' }}>
                                                     <div style={{ width: 40, height: 24, overflow: 'hidden', clipPath: `inset(0 ${100 - (cookProgress * 100)}% 0 0)` }}>
                                                        <svg width="40" height="24" viewBox="0 0 40 24" fill="#FFF">
                                                            <path d="M0,8 L24,8 L24,0 L40,12 L24,24 L24,16 L0,16 Z" />
                                                        </svg>
                                                     </div>
                                                </div>
                                            </div>

                                            {renderSlot(furnaceData?.output || null, 'furnace_output', 0)}
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-6">
                                            <div className={`grid ${openContainer.type === 'crafting' ? 'grid-cols-3' : 'grid-cols-2'} gap-0 p-1 bg-[#8b8b8b] border-2 border-t-[#333] border-l-[#333] border-b-white border-r-white`}>
                                                {(openContainer.type === 'crafting' ? craftingGrid3x3 : craftingGrid2x2).map((it, i) => renderSlot(it, 'crafting', i))}
                                            </div>
                                            <div className="text-4xl text-[#333] font-bold drop-shadow-sm">→</div>
                                            {renderSlot(craftingOutput, 'output', 0)}
                                        </div>
                                    )}
                                </div>
                            </>
                            )}
                        </div>
                    )}
                </div>
            </div>
            
            {hoverInfo && !isDragging && (
                <div
                    className="fixed pointer-events-none z-[70] max-w-[280px] bg-black/90 text-white px-2 py-1 text-sm shadow-lg"
                    style={{ left: hoverInfo.x + 15, top: hoverInfo.y - 30 }}
                >
                    <div className="text-white font-bold drop-shadow-sm">{hoverInfo.name}</div>
                    {hoverInfo.lines.map((line, i) => (
                        <div
                            key={i}
                            className="text-[12px] text-gray-300 leading-snug"
                        >
                            {line.text}
                        </div>
                    ))}
                </div>
            )}

            {displayCursor && (
                <div className="fixed pointer-events-none z-[60]" style={{ left: mousePos.x - 16, top: mousePos.y - 16 }}>
                   <div className="w-12 h-12 relative">
                        <Slot item={displayCursor} size="large" isCursor={true} />
                   </div>
                </div>
            )}
        </div>
    );
};
