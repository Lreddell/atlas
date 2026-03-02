
import React, { useEffect, useState, useRef, useMemo } from 'react';
import { getAtlasURL, getAtlasDimensions, ATLAS_STRIDE, ATLAS_PADDING, ATLAS_RAW_TILE_SIZE } from '../../utils/textures';
import { BLOCKS, ATLAS_COLS } from '../../data/blocks';

interface TextureAtlasViewerProps {
    onClose: () => void;
}

export const TextureAtlasViewer: React.FC<TextureAtlasViewerProps> = ({ onClose }) => {
    const [url, setUrl] = useState<string | null>(null);
    const [dims, setDims] = useState<{width: number, height: number} | null>(null);
    const [zoom, setZoom] = useState(1);
    const [bgMode, setBgMode] = useState<'checker' | 'black' | 'white'>('checker');
    
    // Pan State
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    
    // Hover State
    const [hoverText, setHoverText] = useState<string>("");
    
    const containerRef = useRef<HTMLDivElement>(null);

    // Build lookup map for slots
    const slotMap = useMemo(() => {
        const map = new Map<number, string[]>();
        
        // 1. Add blocks from definitions
        Object.values(BLOCKS).forEach(def => {
            if (def.textureSlot !== undefined) {
                const list = map.get(def.textureSlot) || [];
                if (!list.includes(def.name)) list.push(def.name);
                map.set(def.textureSlot, list);
            }
        });

        // 2. Add manual overrides for known shared slots (from textureMapping/textureResolver logic)
        const manualNames: Record<number, string> = {
            0: "Dirt / Grass Bottom",
            1: "Grass Top",
            2: "Stone",
            3: "Soil",
            12: "Grass Side",
            
            // Logs
            13: "Oak / Spruce Log Top",
            7: "Oak Log Side",
            75: "Cherry Log Top",
            88: "Birch Log Top",
            84: "Basalt Top",
            
            // Sandstone
            18: "Sandstone Side",
            28: "Sandstone Top",
            79: "Red Sandstone",
            
            // Utility
            43: "Crafting Table Top",
            42: "Crafting Table Side",
            44: "Furnace Front",
            45: "Furnace Side",
            47: "Furnace Active",
            
            // Chest
            52: "Chest Front",
            53: "Chest Side",
            54: "Chest Top/Bottom",
            
            // Bed
            65: "Bed Foot Top",
            66: "Bed Head Top",
            67: "Bed Item Icon",
            68: "Bed Side",
            69: "Bed Side Left",
            70: "Bed End",
            71: "Bed Inner",

            // Tools
            32: "Wood Pickaxe", 36: "Wood Axe", 39: "Wood Shovel", 105: "Wood Sword", 106: "Wood Hoe",
            33: "Stone Pickaxe", 37: "Stone Axe", 40: "Stone Shovel", 107: "Stone Sword", 108: "Stone Hoe",
            34: "Iron Pickaxe", 38: "Iron Axe", 41: "Iron Shovel", 109: "Iron Sword", 110: "Iron Hoe",
            113: "Gold Pickaxe", 114: "Gold Axe", 115: "Gold Shovel", 116: "Gold Sword", 117: "Gold Hoe",
            118: "Diamond Pickaxe", 119: "Diamond Axe", 120: "Diamond Shovel", 121: "Diamond Sword", 122: "Diamond Hoe",
            61: "Copper Pickaxe", 62: "Copper Axe", 63: "Copper Shovel", 111: "Copper Sword", 112: "Copper Hoe",
            
            // Misc
            72: "Debug Texture",
            35: "Stick"
        };

        Object.entries(manualNames).forEach(([k, v]) => {
            const key = parseInt(k);
            const list = map.get(key) || [];
            // Prepend specific name
            if (!list.includes(v)) list.unshift(v);
            map.set(key, list);
        });

        return map;
    }, []);

    useEffect(() => {
        setUrl(getAtlasURL());
        const d = getAtlasDimensions();
        setDims(d);
        
        // Center initially
        if (d && window.innerWidth && window.innerHeight) {
            setPan({
                x: (window.innerWidth * 0.95 - d.width) / 2,
                y: (window.innerHeight * 0.9 - d.height) / 2
            });
        }
    }, []);

    const handleWheel = (e: React.WheelEvent) => {
        e.preventDefault();
        e.stopPropagation();
        
        const zoomSpeed = 0.1;
        const newZoom = e.deltaY < 0 
            ? Math.min(10, zoom * (1 + zoomSpeed)) 
            : Math.max(0.1, zoom * (1 - zoomSpeed));
            
        // Zoom towards mouse pointer
        if (containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            
            // Current pos relative to image origin (scaled)
            const imgX = mouseX - pan.x;
            const imgY = mouseY - pan.y;
            
            // Scale factor change
            const scaleChange = newZoom / zoom;
            
            // New pos should be such that the point under mouse remains stable
            // newImgX = imgX * scaleChange
            // newPanX = mouseX - newImgX
            
            setPan({
                x: mouseX - (imgX * scaleChange),
                y: mouseY - (imgY * scaleChange)
            });
        }

        setZoom(newZoom);
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        if (e.button === 0) { // Left click
            setIsDragging(true);
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (isDragging) {
            setPan(prev => ({ x: prev.x + e.movementX, y: prev.y + e.movementY }));
        }

        // Hover Logic
        if (containerRef.current && dims) {
            const rect = containerRef.current.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            // Calculate position in texture space (unscaled)
            const texX = (mouseX - pan.x) / zoom;
            const texY = (mouseY - pan.y) / zoom;

            if (texX >= 0 && texX < dims.width && texY >= 0 && texY < dims.height) {
                // Determine Slot
                const col = Math.floor(texX / ATLAS_STRIDE);
                const row = Math.floor(texY / ATLAS_STRIDE);
                
                // Check if inside the actual 16x16 content area (ignoring padding)
                const localX = texX % ATLAS_STRIDE;
                const localY = texY % ATLAS_STRIDE;
                
                if (localX >= ATLAS_PADDING && localX < ATLAS_PADDING + ATLAS_RAW_TILE_SIZE &&
                    localY >= ATLAS_PADDING && localY < ATLAS_PADDING + ATLAS_RAW_TILE_SIZE) {
                    
                    const slotId = row * ATLAS_COLS + col;
                    const items = slotMap.get(slotId);
                    
                    if (items && items.length > 0) {
                        setHoverText(`Slot ${slotId}: ${items.join(", ")}`);
                    } else {
                        setHoverText(`Slot ${slotId}: (Unused)`);
                    }
                } else {
                    setHoverText(""); // In padding area
                }
            } else {
                setHoverText(""); // Outside image
            }
        }
    };

    const handleMouseUp = () => setIsDragging(false);

    if (!url) return null;

    const getBgStyle = () => {
        if (bgMode === 'white') return { backgroundColor: '#ffffff' };
        if (bgMode === 'black') return { backgroundColor: '#000000' };
        return {
            backgroundColor: '#222',
            backgroundImage: `
                linear-gradient(45deg, #333 25%, transparent 25%), 
                linear-gradient(-45deg, #333 25%, transparent 25%), 
                linear-gradient(45deg, transparent 75%, #333 75%), 
                linear-gradient(-45deg, transparent 75%, #333 75%)
            `,
            backgroundSize: '20px 20px',
            backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px'
        };
    };

    const displayW = dims ? dims.width : 0;
    const displayH = dims ? dims.height : 0;

    return (
        <div 
            className="absolute inset-0 z-[600] bg-black/90 flex items-center justify-center backdrop-blur-sm pointer-events-auto"
            onClick={onClose}
        >
            <div 
                className="bg-[#1a1a1a] border border-white/20 rounded-lg shadow-2xl flex flex-col overflow-hidden w-[95vw] h-[90vh]"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex justify-between items-center px-4 py-3 bg-[#111] border-b border-white/10 shrink-0 z-10">
                    <div className="flex items-center gap-4">
                        <h2 className="text-sm font-bold text-white uppercase tracking-widest flex items-center gap-2">
                            <span className="text-xl">🎨</span> Texture Atlas
                        </h2>
                        {dims && (
                            <span className="text-xs font-mono text-gray-500 bg-black/50 px-2 py-1 rounded">
                                {dims.width}x{dims.height}px
                            </span>
                        )}
                    </div>
                    
                    <div className="flex gap-4 items-center">
                        {/* Zoom Controls */}
                        <div className="flex items-center bg-black/50 rounded border border-white/10">
                            <button 
                                onClick={() => {
                                    setZoom(z => Math.max(0.1, z - 0.5));
                                }}
                                className="px-3 py-1 text-gray-400 hover:text-white hover:bg-white/10 text-lg leading-none transition-colors"
                                title="Zoom Out"
                            >-</button>
                            <span className="text-xs font-mono w-12 text-center text-blue-400">{Math.round(zoom * 100)}%</span>
                            <button 
                                onClick={() => setZoom(z => Math.min(10, z + 0.5))}
                                className="px-3 py-1 text-gray-400 hover:text-white hover:bg-white/10 text-lg leading-none transition-colors"
                                title="Zoom In"
                            >+</button>
                            <button 
                                onClick={() => { 
                                    setZoom(1); 
                                    if(dims && containerRef.current) {
                                        const r = containerRef.current.getBoundingClientRect();
                                        setPan({ x: (r.width - dims.width)/2, y: (r.height - dims.height)/2 });
                                    }
                                }}
                                className="px-2 py-1 text-[10px] text-gray-500 hover:text-white border-l border-white/10 font-bold uppercase transition-colors"
                                title="Reset View"
                            >Reset</button>
                        </div>

                        {/* BG Controls */}
                        <div className="flex items-center gap-1 bg-black/50 p-1 rounded border border-white/10">
                            <button 
                                onClick={() => setBgMode('checker')}
                                className={`w-6 h-6 rounded border transition-all ${bgMode === 'checker' ? 'border-blue-500 ring-1 ring-blue-500/50' : 'border-white/20 hover:border-white/50'}`}
                                style={{
                                    backgroundImage: 'linear-gradient(45deg, #333 25%, transparent 25%), linear-gradient(-45deg, #333 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #333 75%), linear-gradient(-45deg, transparent 75%, #333 75%)',
                                    backgroundSize: '8px 8px',
                                    backgroundColor: '#222'
                                }}
                                title="Checkerboard Background"
                            />
                            <button 
                                onClick={() => setBgMode('black')}
                                className={`w-6 h-6 rounded border bg-black transition-all ${bgMode === 'black' ? 'border-blue-500 ring-1 ring-blue-500/50' : 'border-white/20 hover:border-white/50'}`}
                                title="Black Background"
                            />
                            <button 
                                onClick={() => setBgMode('white')}
                                className={`w-6 h-6 rounded border bg-white transition-all ${bgMode === 'white' ? 'border-blue-500 ring-1 ring-blue-500/50' : 'border-gray-400 hover:border-white'}`}
                                title="White Background"
                            />
                        </div>

                        <div className="w-px h-6 bg-white/10 mx-2" />

                        <button 
                            onClick={onClose}
                            className="text-gray-400 hover:text-white font-bold text-xl px-2 transition-colors"
                            title="Close (F4)"
                        >
                            ✕
                        </button>
                    </div>
                </div>
                
                {/* Viewport - Hidden Overflow, Custom Drag */}
                <div 
                    ref={containerRef}
                    className={`flex-1 overflow-hidden bg-[#0a0a0a] relative ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                    onWheel={handleWheel}
                >
                     {/* 
                        Container applies background BEHIND the image.
                        Transform applied here for Pan/Zoom.
                     */}
                     <div 
                        style={{ 
                            width: displayW,
                            height: displayH,
                            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                            transformOrigin: '0 0',
                            ...getBgStyle() 
                        }}
                        className="border border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.5)] transition-transform duration-75 ease-out absolute top-0 left-0"
                     >
                        <img 
                            src={url} 
                            alt="Atlas" 
                            className="block w-full h-full pointer-events-none select-none"
                            style={{ imageRendering: 'pixelated' }}
                        />
                     </div>
                </div>
                
                {/* Footer */}
                <div className="px-4 py-2 bg-[#111] border-t border-white/10 flex justify-between items-center text-[10px] text-gray-500 font-mono shrink-0 h-9">
                    <span className="flex-1 truncate text-white/90">
                        {hoverText ? hoverText : <span className="text-gray-600 italic">Hover over texture slots to inspect</span>}
                    </span>
                    <span className="text-gray-500">
                        Drag to Pan • Scroll to Zoom • <span className="text-white font-bold">F4</span> to close
                    </span>
                </div>
            </div>
        </div>
    );
};
