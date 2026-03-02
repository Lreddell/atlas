
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ItemStack, BlockType, CreativeTab, BlockDef } from '../../types';
import { Slot } from './Slot';
import { worldManager } from '../../systems/WorldManager';
import { BLOCKS } from '../../data/blocks';

interface InventoryUIProps {
    inventory: (ItemStack | null)[];
    openContainer: any;
    setOpenContainer: (val: any) => void;
    selectedSlot: number;
    craftingGrid2x2: (ItemStack | null)[];
    craftingGrid3x3: (ItemStack | null)[];
    craftingOutput: ItemStack | null;
    cursorStack: ItemStack | null;
    setCursorStack: (stack: ItemStack | null) => void;
    handleInventoryAction: (action: string, collection: string, index: number, data?: any) => void;
}

const CREATIVE_TABS: { id: CreativeTab, name: string, icon: BlockType }[] = [
    { id: 'building', name: 'Building', icon: BlockType.BRICK },
    { id: 'natural', name: 'Natural', icon: BlockType.GRASS },
    { id: 'functional', name: 'Functional', icon: BlockType.CRAFTING_TABLE },
    { id: 'tools', name: 'Tools', icon: BlockType.IRON_PICKAXE },
    { id: 'food', name: 'Food', icon: BlockType.APPLE },
    { id: 'ingredients', name: 'Ingredients', icon: BlockType.IRON_INGOT },
];

const ITEM_SORT_ORDER: BlockType[] = [
    // --- BUILDING ---
    BlockType.STONE, BlockType.COBBLESTONE, BlockType.BRICK, 
    BlockType.SANDSTONE, BlockType.RED_SANDSTONE, BlockType.BASALT, BlockType.OBSIDIAN,
    BlockType.OAK_PLANKS, BlockType.SPRUCE_PLANKS, BlockType.BIRCH_PLANKS, BlockType.CHERRY_PLANKS,
    BlockType.GLASS, BlockType.WOOL,
    BlockType.TERRACOTTA, BlockType.TERRACOTTA_WHITE, BlockType.TERRACOTTA_LIGHT_GRAY, BlockType.TERRACOTTA_BROWN, BlockType.TERRACOTTA_RED, BlockType.TERRACOTTA_ORANGE, BlockType.TERRACOTTA_YELLOW, BlockType.TERRACOTTA_MAGENTA,

    // --- NATURAL ---
    BlockType.GRASS, BlockType.DIRT, BlockType.SAND, BlockType.RED_SAND, BlockType.SNOWY_GRASS, BlockType.SNOW_BLOCK, BlockType.ICE,
    BlockType.LOG, BlockType.SPRUCE_LOG, BlockType.BIRCH_LOG, BlockType.CHERRY_LOG,
    BlockType.LEAVES, BlockType.SPRUCE_LEAVES, BlockType.BIRCH_LEAVES, BlockType.CHERRY_LEAVES,
    BlockType.CACTUS, BlockType.DEAD_BUSH, BlockType.GRASS_PLANT, BlockType.ROSE, BlockType.DANDELION, BlockType.PINK_FLOWER, BlockType.WHEAT_SEEDS,
    BlockType.SAPLING, BlockType.WATER, BlockType.LAVA, BlockType.MAGMA,
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
    cursorStack, handleInventoryAction
}) => {
    const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
    const [hoverInfo, setHoverInfo] = useState<{name: string, x: number, y: number} | null>(null);
    const [activeTab, setActiveTab] = useState<CreativeTab>('building');
    const [hoveredSlot, setHoveredSlot] = useState<{ collection: string, index: number } | null>(null);
    
    const [isDragging, setIsDragging] = useState(false);
    const [dragMode, setDragMode] = useState<'split' | 'one' | 'shift' | null>(null);
    const [dragSlots, setDragSlots] = useState<Set<string>>(new Set());
    const [startDragStack, setStartDragStack] = useState<ItemStack | null>(null);
    
    const dragSlotsRef = useRef<Set<string>>(new Set());
    const lastClickRef = useRef<{ time: number, key: string } | null>(null);
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
            .filter(b => b.id !== BlockType.AIR && b.id !== BlockType.FURNACE_ACTIVE && b.id !== BlockType.BED_HEAD && b.id !== BlockType.BED_FOOT && b.category === activeTab)
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
            if (!hoveredSlot) return;

            if (e.code.startsWith('Digit') && e.code !== 'Digit0') {
                const hotbarIdx = parseInt(e.code.replace('Digit', '')) - 1;
                if (hotbarIdx >= 0 && hotbarIdx < 9) {
                    handleInventoryAction('swap_hotbar', hoveredSlot.collection, hoveredSlot.index, { hotbarIdx });
                }
            }

            if (e.code === 'KeyQ') {
                const dropAll = e.ctrlKey || e.metaKey;
                handleInventoryAction('drop_key', hoveredSlot.collection, hoveredSlot.index, { dropAll });
            }
        };

        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [hoveredSlot, handleInventoryAction]);

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

    const getSlotKey = (collection: string, index: number) => `${collection}-${index}`;

    const calculateDragDistribution = () => {
        if (!startDragStack || dragSlots.size === 0 || !dragMode) {
            return { remainder: startDragStack ? startDragStack.count : 0, distribution: {} as Record<string, number> };
        }
        
        const distribution: Record<string, number> = {};
        let remainder = startDragStack.count;
        const targets = Array.from(dragSlots).map((k: string) => {
            const [c, i] = k.split('-');
            return { collection: c, index: parseInt(i) };
        });

        if (dragMode === 'one') {
            targets.forEach(t => {
                if (remainder > 0) {
                    distribution[getSlotKey(t.collection, t.index)] = 1;
                    remainder--;
                }
            });
        } else if (dragMode === 'split') {
            const perSlot = Math.floor(startDragStack.count / targets.length);
            const remItems = startDragStack.count % targets.length;
            
            targets.forEach((t, idx) => {
                const bonus = idx < remItems ? 1 : 0;
                const amt = perSlot + bonus;
                if (amt > 0) distribution[getSlotKey(t.collection, t.index)] = amt;
            });
            remainder = 0; 
        }
        
        return { remainder, distribution };
    };

    const dragDist = calculateDragDistribution();

    const handleSlotMouseDown = (collection: string, index: number, e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();

        if (e.shiftKey && !cursorStack && !isDragging) {
             handleInventoryAction('shift_click', collection, index);
             setIsDragging(true);
             setDragMode('shift');
             const key = getSlotKey(collection, index);
             dragSlotsRef.current = new Set([key]);
             setDragSlots(new Set([key]));
             return;
        }

        if (cursorStack && !isDragging) {
            if (collection === 'creative' || collection === 'output' || collection === 'furnace_output') return;

            const mode = e.button === 2 ? 'one' : 'split'; 
            setIsDragging(true);
            setDragMode(mode);
            setStartDragStack(cursorStack);
            
            const key = getSlotKey(collection, index);
            dragSlotsRef.current = new Set([key]);
            setDragSlots(new Set([key]));
            return;
        }

        const now = Date.now();
        const key = getSlotKey(collection, index);
        if (lastClickRef.current && lastClickRef.current.key === key && (now - lastClickRef.current.time < 450)) {
            if (!isDragging) handleInventoryAction('double_click', collection, index);
            lastClickRef.current = null; 
            return;
        }
        lastClickRef.current = { time: now, key: key };

        let action = 'click';
        if (e.type === 'contextmenu' || e.button === 2) action = 'right_click';
        if (e.type === 'auxclick' && e.button === 1) action = 'middle_click';
        if (e.shiftKey && action === 'click') action = 'shift_click';
        
        if (collection === 'creative') {
            const item = creativeItems[index]; 
            handleInventoryAction(action, collection, index, { creativeItem: item });
        } else {
            handleInventoryAction(action, collection, index);
        }
    };

    const tryAddDragSlot = (collection: string, index: number, item: ItemStack | null) => {
        if (!isDragging) return;
        
        const key = getSlotKey(collection, index);

        if (dragMode === 'shift') {
            if (!dragSlotsRef.current.has(key)) {
                dragSlotsRef.current.add(key);
                setDragSlots(new Set(dragSlotsRef.current));
                handleInventoryAction('shift_click', collection, index);
            }
            return;
        }

        if (!startDragStack) return;
        if (collection === 'creative' || collection === 'output' || collection === 'furnace_output') return;
        if (item && item.type !== startDragStack.type) return;
        if (item && item.count >= 64) return;
        
        if (dragMode === 'one' && dragDist.remainder <= 0) return;

        if (!dragSlotsRef.current.has(key)) {
            dragSlotsRef.current.add(key);
            setDragSlots(new Set(dragSlotsRef.current));
        }
    };

    const handleSlotEnter = (collection: string, index: number, item: ItemStack | null, e: React.MouseEvent) => {
        setHoveredSlot({ collection, index });
        tryAddDragSlot(collection, index, item);

        if (!item) {
            setHoverInfo(null);
            return;
        }
        const name = BLOCKS[item.type]?.name || 'Unknown';
        setHoverInfo({ name, x: e.clientX, y: e.clientY });
    };

    const handleMouseUp = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isDragging) {
            if (startDragStack && dragMode !== 'shift') {
                const targets = Array.from(dragSlots).map((k: string) => {
                    const [c, i] = k.split('-');
                    return { collection: c, index: parseInt(i) };
                });
                
                handleInventoryAction('drag_end', '', 0, { 
                    mode: dragMode, 
                    slots: targets, 
                    startStack: startDragStack 
                });
            }

            setIsDragging(false);
            setDragSlots(new Set());
            dragSlotsRef.current = new Set();
            setStartDragStack(null);
            setDragMode(null);
        }
    };

    const onSlotLeave = () => {
        setHoveredSlot(null);
        setHoverInfo(null);
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        setMousePos({x: e.clientX, y: e.clientY});
        if (hoverInfo) {
            setHoverInfo(prev => prev ? { ...prev, x: e.clientX, y: e.clientY } : null);
        }

        if (isDragging) {
            const el = document.elementFromPoint(e.clientX, e.clientY);
            if (el) {
                const slotEl = el.closest('[data-slot-collection]');
                if (slotEl) {
                    const collection = slotEl.getAttribute('data-slot-collection');
                    const index = parseInt(slotEl.getAttribute('data-slot-index') || '-1');
                    if (collection && index >= 0) {
                        let item: ItemStack | null = null;
                        if (collection === 'inventory') item = inventory[index];
                        else if (collection === 'crafting') item = (openContainer?.type === 'crafting' ? craftingGrid3x3 : craftingGrid2x2)[index];
                        else if (collection === 'chest') item = chestItems[index];
                        else if (collection === 'furnace_input') item = furnaceData?.input || null;
                        else if (collection === 'furnace_fuel') item = furnaceData?.fuel || null;
                        
                        tryAddDragSlot(collection, index, item);
                    }
                }
            }
        }
    };

    const stopPropagation = (e: React.SyntheticEvent) => {
        e.stopPropagation();
    };

    const handleBackdropClick = (e: React.MouseEvent) => {
        if (isDragging) {
            handleMouseUp(e);
            return;
        }
        e.stopPropagation();
        if (cursorStack) {
            handleInventoryAction('drop_cursor', '', -1);
        }
    };

    const renderSlot = (item: ItemStack | null, collection: string, index: number, size: 'large' | 'small' = 'large') => {
        let displayItem = item;
        const key = getSlotKey(collection, index);
        const dragAmount = dragDist.distribution[key];
        
        if (isDragging && dragAmount !== undefined && startDragStack) {
            const currentCount = item ? item.count : 0;
            displayItem = { type: startDragStack.type, count: currentCount + dragAmount };
        }

        return (
            <div 
                className={`relative z-20 p-[2px]`}
                data-slot-collection={collection} 
                data-slot-index={index}
                onMouseDown={(e) => handleSlotMouseDown(collection, index, e)}
                onMouseEnter={(e) => handleSlotEnter(collection, index, item, e)}
                onMouseLeave={onSlotLeave}
                onMouseUp={handleMouseUp}
                onClick={() => {}} 
                onContextMenu={() => {}}
                onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); }} 
            >
                <Slot 
                    key={key}
                    item={displayItem} 
                    size={size}
                    onClick={() => {}} 
                    onContextMenu={() => {}}
                    onDoubleClick={() => {}}
                    onAuxClick={e => {
                        if (e.button === 1 && !isDragging) {
                            e.stopPropagation(); e.preventDefault();
                            handleInventoryAction('middle_click', collection, index);
                        }
                    }}
                    onMouseDown={() => {}}
                    onMouseEnter={() => {}}
                    onMouseLeave={() => {}}
                    onMouseUp={() => {}}
                />
            </div>
        );
    };

    const displayCursor = isDragging && startDragStack ? 
        (dragDist.remainder > 0 ? { ...startDragStack, count: dragDist.remainder } : null) 
        : cursorStack;

    return (
        <div 
            className="absolute inset-0 bg-black/70 z-50 flex items-center justify-center backdrop-blur-sm" 
            onMouseMove={handleMouseMove}
            onClick={handleBackdropClick} 
            onMouseDown={(e) => { if(e.button !== 0 && !isDragging) e.stopPropagation(); }}
            onMouseUp={handleMouseUp}
            onWheel={stopPropagation}
            onContextMenu={e => { e.preventDefault(); stopPropagation(e); }}
        >
            <div className={`flex flex-col gap-0 relative ${openContainer.type === 'creative' ? 'w-[800px]' : 'scale-110'}`} onClick={stopPropagation}>
                
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
                                <Slot item={{ type: tab.icon, count: 1 }} size="small" />
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
                        <div className="mb-2 h-[300px] overflow-y-auto bg-[#8b8b8b] p-2 border-2 border-[#333] scrollbar-thin">
                             <div className="flex flex-wrap gap-1 content-start">
                                 {creativeItems.map((it, i) => (
                                     <div key={`c-${i}`} onMouseDown={(e) => handleSlotMouseDown('creative', i, e)}>
                                         <Slot 
                                            item={it}
                                            size="large"
                                            onMouseEnter={(e) => handleSlotEnter('creative', i, it, e)}
                                            onMouseLeave={onSlotLeave}
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

                    <div className="flex gap-6 justify-center">
                        <div className="flex flex-col gap-2">
                            <div className="grid grid-cols-9 gap-0 bg-[#8b8b8b] p-1 border-2 border-t-[#333] border-l-[#333] border-b-white border-r-white">
                                {inventory.slice(9).map((it, i) => renderSlot(it, 'inventory', i + 9))}
                            </div>
                            <div className="grid grid-cols-9 gap-0 mt-2 bg-[#8b8b8b] p-1 border-2 border-t-[#333] border-l-[#333] border-b-white border-r-white">
                                {inventory.slice(0, 9).map((it, i) => renderSlot(it, 'inventory', i))}
                            </div>
                        </div>
                        
                        {openContainer.type !== 'chest' && openContainer.type !== 'creative' && (
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
                </div>
            </div>
            
            {hoverInfo && !isDragging && (
                <div 
                    className="fixed pointer-events-none z-[70] bg-[#100010] border-2 border-[#2a0b4d] text-white px-2 py-1 text-sm font-bold shadow-lg"
                    style={{ left: hoverInfo.x + 15, top: hoverInfo.y - 30 }}
                >
                    <div className="text-white drop-shadow-sm">{hoverInfo.name}</div>
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
