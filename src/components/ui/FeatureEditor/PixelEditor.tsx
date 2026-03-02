
import React, { useState, useEffect, useRef } from 'react';
import { soundManager } from '../../../systems/sound/SoundManager';

type Tool = 'pencil' | 'eraser' | 'bucket' | 'picker';

interface PixelEditorProps {
    initialData: number[];
    initialName: string;
    onSave: (pixels: number[], name: string) => void;
}

const DEFAULT_PALETTE = [
    '#000000', '#FFFFFF', '#FF0000', '#00FF00', '#0000FF', 
    '#FFFF00', '#FF00FF', '#00FFFF', '#8B4513', '#666666',
    '#388E3C', '#2E7D32', '#795548', '#FF9800', '#FFC107',
    '#E91E63', '#9C27B0', '#3F51B5', '#2196F3', '#03A9F4'
];

const PIXEL_SIZE = 30;
const GRID_RESOLUTION = 16;
const CANVAS_SIZE = PIXEL_SIZE * GRID_RESOLUTION; // 480px

export const PixelEditor: React.FC<PixelEditorProps> = ({ initialData, initialName, onSave }) => {
    const [pixels, setPixels] = useState<number[]>(initialData);
    const [name, setName] = useState(initialName);
    const [color, setColor] = useState('#FFFFFF');
    const [toolsWidth, setToolsWidth] = useState(() => Number(localStorage.getItem('atlas_pixel_tools_width')) || 176);
    const [palette, setPalette] = useState<string[]>(() => {
        const saved = localStorage.getItem('atlas_custom_palette');
        return saved ? JSON.parse(saved) : DEFAULT_PALETTE;
    });
    
    const [tool, setTool] = useState<Tool>('pencil');
    const [brushSize, setBrushSize] = useState<1 | 2>(1);
    const [mirrorH, setMirrorH] = useState(false);
    const [mirrorV, setMirrorV] = useState(false);
    const [showGrid, setShowGrid] = useState(true);
    const [zoom, setZoom] = useState(1); 
    
    const [history, setHistory] = useState<number[][]>([initialData]);
    const [historyIdx, setHistoryIdx] = useState(0);

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const isDrawingRef = useRef(false);
    const lastPosRef = useRef<{ x: number, y: number } | null>(null);
    const isResizingRef = useRef(false);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, 16, 16);
        ctx.putImageData(new ImageData(new Uint8ClampedArray(pixels), 16, 16), 0, 0);
    }, [pixels]);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (isResizingRef.current) {
                const sidebarW = Number(localStorage.getItem('atlas_sidebar_width')) || 260;
                const listW = Number(localStorage.getItem('atlas_texture_list_width')) || 224;
                const newWidth = Math.max(120, Math.min(350, e.clientX - sidebarW - listW)); 
                setToolsWidth(newWidth);
                localStorage.setItem('atlas_pixel_tools_width', String(newWidth));
            }
        };
        const handleMouseUp = () => {
            isResizingRef.current = false;
        };
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, []);

    const savePalette = (newPalette: string[]) => {
        setPalette(newPalette);
        localStorage.setItem('atlas_custom_palette', JSON.stringify(newPalette));
    };

    const addColorToPalette = () => {
        if (!palette.includes(color)) {
            const next = [color, ...palette].slice(0, 30);
            savePalette(next);
            soundManager.play("ui.click", { pitch: 1.2 });
        }
    };

    const removeFromPalette = (hex: string) => {
        const next = palette.filter(c => c !== hex);
        savePalette(next);
    };

    const commitHistory = (newPixels: number[]) => {
        const nextHistory = history.slice(0, historyIdx + 1);
        nextHistory.push([...newPixels]);
        if (nextHistory.length > 50) nextHistory.shift();
        setHistory(nextHistory);
        setHistoryIdx(nextHistory.length - 1);
        setPixels(newPixels);
        onSave(newPixels, name);
    };

    const undo = () => {
        if (historyIdx > 0) {
            const prev = history[historyIdx - 1];
            setHistoryIdx(historyIdx - 1);
            setPixels([...prev]);
            onSave([...prev], name);
            soundManager.play("ui.click");
        }
    };

    const redo = () => {
        if (historyIdx < history.length - 1) {
            const next = history[historyIdx + 1];
            setHistoryIdx(historyIdx + 1);
            setPixels([...next]);
            onSave([...next], name);
            soundManager.play("ui.click");
        }
    };

    const handlePixelAction = (x: number, y: number, isMove: boolean = false) => {
        if (x < 0 || x >= 16 || y < 0 || y >= 16) return;
        if (isMove && lastPosRef.current?.x === x && lastPosRef.current?.y === y) return;
        lastPosRef.current = { x, y };

        if (tool === 'picker') {
            const idx = (y * 16 + x) * 4;
            const r = pixels[idx], g = pixels[idx+1], b = pixels[idx+2], a = pixels[idx+3];
            if (a > 0) {
                setColor(`#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`.toUpperCase());
                setTool('pencil');
            }
            return;
        }

        const newPixels = [...pixels];
        const hex = tool === 'eraser' ? '000000' : color.slice(1);
        const aVal = tool === 'eraser' ? 0 : 255;
        const cr = parseInt(hex.slice(0, 2), 16), cg = parseInt(hex.slice(2, 4), 16), cb = parseInt(hex.slice(4, 6), 16);
        
        const draw = (dx: number, dy: number) => {
            const put = (fx: number, fy: number) => {
                if (fx < 0 || fx >= 16 || fy < 0 || fy >= 16) return;
                const idx = (fy * 16 + fx) * 4;
                newPixels[idx] = cr; newPixels[idx+1] = cg; newPixels[idx+2] = cb; newPixels[idx+3] = aVal;
            };
            put(dx, dy);
            if (brushSize === 2) {
                put(dx + 1, dy);
                put(dx, dy + 1);
                put(dx + 1, dy + 1);
            }
            if (mirrorH) put(15 - dx, dy);
            if (mirrorV) put(dx, 15 - dy);
            if (mirrorH && mirrorV) put(15 - dx, 15 - dy);
        };
        draw(x, y);
        setPixels(newPixels);
    };

    const handleMouseEvent = (e: React.MouseEvent, isMove: boolean = false) => {
        const rect = canvasRef.current!.getBoundingClientRect();
        const x = Math.floor(((e.clientX - rect.left) / rect.width) * 16);
        const y = Math.floor(((e.clientY - rect.top) / rect.height) * 16);
        handlePixelAction(x, y, isMove);
    };

    return (
        <div className="flex flex-col h-full bg-[#0a0a0a]">
            {/* Mini Toolbar */}
            <div className="h-12 bg-black border-b border-white/5 flex items-center justify-between px-4 z-20">
                <div className="flex items-center gap-3">
                    <input type="text" value={name} onChange={(e) => { setName(e.target.value); onSave(pixels, e.target.value); }} className="bg-transparent font-black text-xs text-blue-400 focus:text-white outline-none w-32 uppercase" />
                    <div className="h-4 w-px bg-white/10 mx-2" />
                    <div className="flex gap-1">
                        <ToolBtn active={tool === 'pencil'} icon="✏️" onClick={() => setTool('pencil')} />
                        <ToolBtn active={tool === 'eraser'} icon="🧼" onClick={() => setTool('eraser')} />
                        <ToolBtn active={tool === 'bucket'} icon="🪣" onClick={() => setTool('pencil')} />
                        <ToolBtn active={tool === 'picker'} icon="🧪" onClick={() => setTool('picker')} />
                    </div>
                </div>
                <div className="flex gap-2">
                    <button onClick={undo} disabled={historyIdx === 0} className="px-3 py-1 bg-white/5 hover:bg-white/10 disabled:opacity-20 rounded text-[9px] font-black uppercase">Undo</button>
                    <button onClick={redo} disabled={historyIdx === history.length - 1} className="px-3 py-1 bg-white/5 hover:bg-white/10 disabled:opacity-20 rounded text-[9px] font-black uppercase">Redo</button>
                </div>
            </div>

            <div className="flex-1 flex overflow-hidden relative">
                {/* Tools Sidebar */}
                <div className="border-r border-white/5 p-4 flex flex-col gap-6 flex-shrink-0 bg-black/40 relative" style={{ width: toolsWidth }}>
                    <div className="resizer-handle" onMouseDown={() => { isResizingRef.current = true; }} />
                    <section>
                        <div className="text-[10px] font-black text-gray-600 uppercase mb-3 tracking-widest flex justify-between">Color <button onClick={addColorToPalette} className="text-blue-500 hover:text-white">+</button></div>
                        <input type="color" value={color} onChange={(e) => setColor(e.target.value.toUpperCase())} className="w-full h-8 bg-black border border-white/10 cursor-pointer rounded mb-3 outline-none" />
                        <div className="grid grid-cols-5 gap-1.5 max-h-40 overflow-y-auto scrollbar-none">
                            {palette.map((p, i) => (
                                <div key={i} onClick={() => setColor(p)} onContextMenu={(e) => { e.preventDefault(); removeFromPalette(p); }} className={`aspect-square rounded-sm cursor-pointer border border-black/40 transition-transform active:scale-90 ${color === p ? 'ring-1 ring-white scale-105 z-10' : ''}`} style={{ backgroundColor: p }} />
                            ))}
                        </div>
                    </section>
                    <section className="space-y-1">
                        <div className="text-[10px] font-black text-gray-600 uppercase mb-2 tracking-widest">Options</div>
                        <ToggleButton active={brushSize === 2} label="Brush 2x2" onClick={() => setBrushSize(brushSize === 1 ? 2 : 1)} />
                        <ToggleButton active={mirrorH} label="Mirror X" onClick={() => setMirrorH(!mirrorH)} />
                        <ToggleButton active={mirrorV} label="Mirror Y" onClick={() => setMirrorV(!mirrorV)} />
                        <ToggleButton active={showGrid} label="Show Grid" onClick={() => setShowGrid(!showGrid)} />
                    </section>
                </div>

                {/* Viewport */}
                <div className="flex-1 flex flex-col items-center justify-center p-4 relative overflow-hidden bg-[#080808]">
                    <div className="absolute bottom-4 right-4 flex items-center gap-1 z-30 bg-black/80 p-1.5 rounded border border-white/10 shadow-2xl">
                        <button onClick={() => setZoom(Math.max(0.5, zoom - 0.25))} className="w-8 h-8 hover:bg-white/10 rounded font-bold text-lg">-</button>
                        <div className="px-3 text-[10px] font-black text-white/50">{Math.round(zoom * 100)}%</div>
                        <button onClick={() => setZoom(Math.min(4, zoom + 0.25))} className="w-8 h-8 hover:bg-white/10 rounded font-bold text-lg">+</button>
                        <button onClick={() => setZoom(1)} className="ml-2 px-2 py-1 bg-white/5 hover:bg-white/10 rounded text-[9px] font-black uppercase">Reset</button>
                    </div>

                    <div 
                        className="relative shadow-[0_40px_120px_rgba(0,0,0,1)] flex-shrink-0 transition-transform duration-100 ease-out origin-center border-[1px] border-white/10 bg-[#1a1a1a]"
                        style={{ 
                            width: `${CANVAS_SIZE}px`, 
                            height: `${CANVAS_SIZE}px`, 
                            transform: `scale(${zoom})`,
                        }}
                    >
                        {/* Perfect Alignment Checkerboard */}
                        <div 
                            className="absolute inset-0 z-0" 
                            style={{ 
                                backgroundImage: `
                                    linear-gradient(45deg, #121212 25%, transparent 25%), 
                                    linear-gradient(-45deg, #121212 25%, transparent 25%), 
                                    linear-gradient(45deg, transparent 75%, #121212 75%), 
                                    linear-gradient(-45deg, transparent 75%, #121212 75%)
                                `, 
                                backgroundSize: `${PIXEL_SIZE * 2}px ${PIXEL_SIZE * 2}px`, 
                                backgroundPosition: `0 0, 0 ${PIXEL_SIZE}px, ${PIXEL_SIZE}px -${PIXEL_SIZE}px, -${PIXEL_SIZE}px 0px` 
                            }} 
                        />
                        
                        <canvas 
                            ref={canvasRef} 
                            width={16} 
                            height={16} 
                            className="w-full h-full relative z-10 block" 
                            style={{ imageRendering: 'pixelated', width: '100%', height: '100%' }}
                            onMouseDown={(e) => { isDrawingRef.current = true; handleMouseEvent(e); }}
                            onMouseUp={() => { if (isDrawingRef.current) commitHistory(pixels); isDrawingRef.current = false; lastPosRef.current = null; }}
                            onMouseLeave={() => { if (isDrawingRef.current) commitHistory(pixels); isDrawingRef.current = false; lastPosRef.current = null; }}
                            onMouseMove={(e) => { if (isDrawingRef.current) handleMouseEvent(e, true); }} 
                        />
                        
                        {/* High Contrast Precision Grid Overlay */}
                        {showGrid && (
                            <div className="absolute inset-0 pointer-events-none z-20" style={{
                                backgroundImage: `
                                    linear-gradient(to right, rgba(255,255,255,0.08) 1px, transparent 1px),
                                    linear-gradient(to bottom, rgba(255,255,255,0.08) 1px, transparent 1px)
                                `,
                                backgroundSize: `${PIXEL_SIZE}px ${PIXEL_SIZE}px`,
                                backgroundPosition: `0px 0px`
                            }} />
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

const ToolBtn = ({ active, icon, onClick }: any) => (
    <button onClick={onClick} className={`w-8 h-8 flex items-center justify-center rounded border transition-all ${active ? 'bg-blue-600 border-blue-400 scale-110 shadow-lg' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}>{icon}</button>
);

const ToggleButton = ({ active, label, onClick }: any) => (
    <button onClick={() => { onClick(); soundManager.play("ui.click"); }} className={`w-full px-3 py-2 text-[9px] font-black rounded text-left border transition-all ${active ? 'bg-blue-600 text-white border-blue-400 shadow-md' : 'bg-transparent text-gray-500 border-white/5 hover:border-white/20 hover:text-gray-300'}`}>{label}</button>
);
