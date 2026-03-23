import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { getBiome, getGenerationParams, BIOMES } from '../../systems/world/biomes';
import { getTerrainHeight } from '../../systems/world/chunkGeneration';
import { GenConfig, NoiseType, resetGenConfig, loadGenConfig, DEFAULTS, initHistory, pushHistory, undo, redo, getHistoryState } from '../../systems/world/genConfig';
import { CHUNK_SIZE } from '../../constants';
import { worldManager } from '../../systems/WorldManager';
import { createNoiseSet, hashSeed } from '../../utils/noise';
import { deleteWorldGenPresetAsync, getWorldGenPresetByIdAsync, listWorldGenPresetsAsync, saveWorldGenPresetAsync, WorldGenPresetEntry } from '../../systems/world/worldGenPresets';

interface ChunkBaseProps {
    onBack: () => void;
}

interface LayerConfig {
    id: string;
    name: string;
    enabled: boolean;
    opacity: number;
    color: string;
}

const ResetBtn = ({ onClick }: { onClick: () => void }) => (
    <button 
        onClick={onClick} 
        className="ml-2 w-6 flex-shrink-0 flex items-center justify-center bg-[#444] hover:bg-[#555] text-xs rounded text-gray-200 border border-gray-600 aspect-square"
        title="Reset"
        aria-label="Reset"
    >
        R
    </button>
);

export const ChunkBase: React.FC<ChunkBaseProps> = ({ onBack }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [center, setCenter] = useState({ x: 0, z: 0 });
    const [scale, setScale] = useState(4); 
    const [hoverInfo, setHoverInfo] = useState<any>(null);
    
    // UI State
    const [sidebarWidth, setSidebarWidth] = useState(330);
    const isResizingRef = useRef(false);

    const [inputX, setInputX] = useState("0");
    const [inputZ, setInputZ] = useState("0");
    const [showLayers, setShowLayers] = useState(false);
    const [showGrid, setShowGrid] = useState(false);
    const [showRulers, setShowRulers] = useState(false);
    const [rulerType, setRulerType] = useState<'power2' | 'decimal'>('power2');
    const [expandedBiomes, setExpandedBiomes] = useState<Record<string, boolean>>({});
    const [activeSection, setActiveSection] = useState<'noise' | 'biomes' | 'terrain'>('biomes');
    const [historyState, setHistoryState] = useState(getHistoryState());
    const [presetNameInput, setPresetNameInput] = useState('My World Preset');
    const [showSavesMenu, setShowSavesMenu] = useState(false);
    const [savedPresets, setSavedPresets] = useState<WorldGenPresetEntry[]>([]);
    const [selectedPresetId, setSelectedPresetId] = useState<string>('');
    
    // Seed State (Independent from Game)
    const [localSeedInput, setLocalSeedInput] = useState(() => worldManager.getSeed().toString());
    const previewNoiseSet = useMemo(() => {
        const hashed = hashSeed(localSeedInput);
        return createNoiseSet(hashed);
    }, [localSeedInput]);

    // Force re-render token to update canvas when mutable config changes
    const [configVersion, setConfigVersion] = useState(0);

    const [layers, setLayers] = useState<LayerConfig[]>([
        { id: 'biome', name: 'Biomes', enabled: true, opacity: 1.0, color: '#4CAF50' },
        { id: 'height', name: 'Heightmap', enabled: false, opacity: 0.8, color: '#FFFFFF' },
        { id: 'river', name: 'Humidity / Rivers', enabled: false, opacity: 0.6, color: '#2196F3' },
        { id: 'temp', name: 'Temperature', enabled: false, opacity: 0.5, color: '#F44336' },
        { id: 'cont', name: 'Continentalness', enabled: false, opacity: 0.5, color: '#9C27B0' },
        { id: 'weird', name: 'Weirdness', enabled: false, opacity: 0.5, color: '#FF9800' }
    ]);

    // Handle Resize Drag
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isResizingRef.current) return;
            const newWidth = Math.max(250, Math.min(800, e.clientX));
            setSidebarWidth(newWidth);
        };

        const handleMouseUp = () => {
            if (isResizingRef.current) {
                isResizingRef.current = false;
                document.body.style.cursor = '';
            }
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, []);

    // Init History
    useEffect(() => {
        initHistory();
        setHistoryState(getHistoryState());
        void refreshPresetList();
    }, []);

    const forceUpdate = () => {
        setConfigVersion(v => v + 1);
        setHistoryState(getHistoryState());
    };

    const refreshPresetList = async () => {
        const presets = await listWorldGenPresetsAsync();
        setSavedPresets(presets);
        setSelectedPresetId((prev) => (prev && presets.some((preset) => preset.id === prev) ? prev : presets[0]?.id ?? ''));
    };

    const commitChange = () => {
        pushHistory();
        forceUpdate();
    };

    const handleUndo = () => {
        if (undo()) forceUpdate();
    };

    const handleRedo = () => {
        if (redo()) forceUpdate();
    };

    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;

        const width = canvas.width;
        const height = canvas.height;
        
        const PIXEL_STEP = 2; 
        const renderW = Math.ceil(width / PIXEL_STEP);
        const renderH = Math.ceil(height / PIXEL_STEP);

        const imageData = ctx.createImageData(renderW, renderH);
        const data = imageData.data; 

        const invScale = 1 / scale;
        const activeLayers = layers.filter(l => l.enabled && l.opacity > 0);
        const startWX = center.x - (width / 2) * invScale;
        const startWZ = center.z - (height / 2) * invScale;
        const stepWorld = PIXEL_STEP * invScale;

        for (let y = 0; y < renderH; y++) {
            const wz = Math.floor(startWZ + y * stepWorld);
            for (let x = 0; x < renderW; x++) {
                const wx = Math.floor(startWX + x * stepWorld);
                const idx = (y * renderW + x) * 4;

                let r = 10, g = 10, b = 10; 
                let genParams: any = null;
                const getParams = () => {
                    if (!genParams) genParams = getGenerationParams(wx, wz, previewNoiseSet);
                    return genParams;
                };

                for (const layer of activeLayers) {
                    let lr = 0, lg = 0, lb = 0;
                    
                    if (layer.id === 'biome') {
                        const biome = getBiome(wx, wz, previewNoiseSet);
                        const hex = parseInt(biome.color.replace('#', ''), 16);
                        lr = (hex >> 16) & 255;
                        lg = (hex >> 8) & 255;
                        lb = hex & 255;
                    } 
                    else if (layer.id === 'height') {
                        const h = getTerrainHeight(wx, wz, previewNoiseSet);
                        if (h <= GenConfig.height.seaLevel) {
                            const depth = (GenConfig.height.seaLevel - h) / 30; 
                            lr = 20; lg = 50 + depth * 50; lb = 150 + depth * 100;
                        } else {
                            const val = Math.min(255, (h / 140) * 255);
                            lr = val; lg = val; lb = val;
                        }
                    }
                    else if (layer.id === 'river') {
                        const p = getParams();
                        const v = Math.abs(p.riverVal); 
                        if (v < GenConfig.biomes.river.width) {
                            lr = 0; lg = 100; lb = 255; 
                        } else {
                            const i = Math.min(1, v * 5); 
                            lr = i*255; lg = i*255; lb = i*255;
                        }
                    }
                    else if (layer.id === 'temp') {
                        const p = getParams();
                        const t = Math.max(-1, Math.min(1, p.temp));
                        if (t < 0) {
                            lr = (1+t)*255; lg = (1+t)*255; lb = 255;
                        } else {
                            lr = 255; lg = (1-t)*255; lb = (1-t)*255;
                        }
                    }
                    else if (layer.id === 'cont') {
                        const p = getParams();
                        const c = Math.max(-1, Math.min(1, p.continentalness));
                        if (c < GenConfig.biomes.ocean.continentalnessMax) {
                            const d = (c + 1) / 0.7; 
                            lr = 0; lg = 0; lb = 50 + d * 150;
                        } else {
                            const l = (c + 0.3) / 1.3;
                            lr = 50*l; lg = 150 + l*50; lb = 50*l;
                        }
                    }
                    else if (layer.id === 'weird') {
                        const p = getParams();
                        const w = Math.max(-1, Math.min(1, p.weirdness));
                        const i = (w + 1) / 2;
                        lr = i * 255; lg = 0; lb = (1-i) * 255;
                    }

                    const a = layer.opacity;
                    const invA = 1 - a;
                    
                    r = (lr * a) + (r * invA);
                    g = (lg * a) + (g * invA);
                    b = (lb * a) + (b * invA);
                }

                data[idx] = r;
                data[idx+1] = g;
                data[idx+2] = b;
                data[idx+3] = 255;
            }
        }

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = renderW;
        tempCanvas.height = renderH;
        const tempCtx = tempCanvas.getContext('2d');
        if (tempCtx) {
            tempCtx.putImageData(imageData, 0, 0);
            ctx.imageSmoothingEnabled = false; 
            ctx.drawImage(tempCanvas, 0, 0, width, height);
        }
        
        // --- Render Chunk Grid ---
        if (showGrid) {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
            ctx.lineWidth = 1;
            ctx.beginPath();

            const startChunkX = Math.floor(startWX / CHUNK_SIZE) * CHUNK_SIZE;
            const endChunkX = startWX + (width * invScale);
            
            for (let cx = startChunkX; cx <= endChunkX; cx += CHUNK_SIZE) {
                const sx = (cx - center.x) * scale + width / 2;
                ctx.moveTo(sx, 0);
                ctx.lineTo(sx, height);
            }

            const startChunkZ = Math.floor(startWZ / CHUNK_SIZE) * CHUNK_SIZE;
            const endChunkZ = startWZ + (height * invScale);

            for (let cz = startChunkZ; cz <= endChunkZ; cz += CHUNK_SIZE) {
                const sz = (cz - center.z) * scale + height / 2;
                ctx.moveTo(0, sz);
                ctx.lineTo(width, sz);
            }
            ctx.stroke();
        }

        // --- Render Rulers ---
        if (showRulers) {
            const RULER_SIZE = 30;
            let stepCandidates: number[];
            if (rulerType === 'power2') {
                stepCandidates = [1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768];
            } else {
                stepCandidates = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000];
            }
            const targetPxSpacing = 80;
            const blocksPerTargetSpacing = targetPxSpacing / scale;
            let step = stepCandidates[stepCandidates.length - 1];
            for (const s of stepCandidates) { if (s >= blocksPerTargetSpacing) { step = s; break; } }
            ctx.fillStyle = 'rgba(20, 20, 20, 0.9)';
            ctx.fillRect(RULER_SIZE, 0, width - RULER_SIZE, RULER_SIZE);
            ctx.fillStyle = '#ff6b6b'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText("X ->", RULER_SIZE + 8, RULER_SIZE / 2);
            ctx.fillStyle = '#ccc'; ctx.strokeStyle = '#555'; ctx.lineWidth = 1; ctx.font = '10px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
            const startX = Math.floor(startWX / step) * step;
            const endX = startWX + (width * invScale);
            for (let x = startX; x <= endX; x += step) {
                const screenX = (x - center.x) * scale + width / 2;
                if (screenX < RULER_SIZE + 40) continue; 
                ctx.beginPath(); ctx.moveTo(screenX, RULER_SIZE); ctx.lineTo(screenX, RULER_SIZE - 6); ctx.stroke();
                ctx.fillText(x.toString(), screenX, 6);
            }
            ctx.fillStyle = 'rgba(20, 20, 20, 0.9)'; ctx.fillRect(0, RULER_SIZE, RULER_SIZE, height - RULER_SIZE);
            ctx.fillStyle = '#4dabf7'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillText("Z", RULER_SIZE / 2, RULER_SIZE + 8); ctx.fillText("v", RULER_SIZE / 2, RULER_SIZE + 20);
            ctx.fillStyle = '#ccc'; ctx.font = '10px monospace';
            const startZ = Math.floor(startWZ / step) * step;
            const endZ = startWZ + (height * invScale);
            for (let z = startZ; z <= endZ; z += step) {
                const screenY = (z - center.z) * scale + height / 2;
                if (screenY < RULER_SIZE + 40) continue; 
                ctx.beginPath(); ctx.moveTo(RULER_SIZE, screenY); ctx.lineTo(RULER_SIZE - 6, screenY); ctx.stroke();
                ctx.save(); ctx.translate(RULER_SIZE / 2, screenY); ctx.rotate(-Math.PI / 2); ctx.textAlign = "center"; ctx.textBaseline = "middle";
                ctx.fillText(z.toString(), 0, 0); ctx.restore();
            }
            ctx.fillStyle = '#333'; ctx.fillRect(0, 0, RULER_SIZE, RULER_SIZE); ctx.strokeStyle = '#555'; ctx.strokeRect(0, 0, RULER_SIZE, RULER_SIZE);
            ctx.fillStyle = '#aaa'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '9px sans-serif';
            ctx.fillText(rulerType === 'power2' ? "POW2" : "DEC", RULER_SIZE/2, RULER_SIZE/2);
        }

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(width/2 - 10, height/2); ctx.lineTo(width/2 + 10, height/2);
        ctx.moveTo(width/2, height/2 - 10); ctx.lineTo(width/2, height/2 + 10);
        ctx.stroke();
    }, [center, layers, previewNoiseSet, rulerType, scale, showGrid, showRulers]);

    useEffect(() => {
        const frameId = requestAnimationFrame(draw);
        return () => cancelAnimationFrame(frameId);
    }, [configVersion, draw, sidebarWidth]);

    const handleMouseMove = (e: React.MouseEvent) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        const width = canvas.width;
        const height = canvas.height;
        const invScale = 1 / scale;
        const offsetX = (px - width / 2) * invScale;
        const offsetZ = (py - height / 2) * invScale;
        const wx = Math.floor(center.x + offsetX);
        const wz = Math.floor(center.z + offsetZ);
        const biome = getBiome(wx, wz, previewNoiseSet);
        const heightVal = getTerrainHeight(wx, wz, previewNoiseSet);
        const params = getGenerationParams(wx, wz, previewNoiseSet);
        setHoverInfo({ x: wx, z: wz, biome, height: heightVal, ...params });
        if (e.buttons === 1) { 
            setCenter({
                x: center.x - e.movementX * invScale,
                z: center.z - e.movementY * invScale
            });
        }
    };

    const handleWheel = (e: React.WheelEvent) => {
        const zoomSpeed = 0.1;
        const newScale = e.deltaY < 0 ? scale * (1 + zoomSpeed) : scale * (1 - zoomSpeed);
        setScale(Math.max(0.05, Math.min(10, newScale)));
    };

    const goToCoords = () => {
        const x = parseInt(inputX);
        const z = parseInt(inputZ);
        if (!isNaN(x) && !isNaN(z)) setCenter({ x, z });
    };

    const toggleLayer = (id: string) => {
        setLayers(prev => prev.map(l => l.id === id ? { ...l, enabled: !l.enabled } : l));
    };

    const updateOpacity = (id: string, val: number) => {
        setLayers(prev => prev.map(l => l.id === id ? { ...l, opacity: val } : l));
    };

    const handleReset = () => {
        if (!confirm('Reset all world generation settings to defaults?')) return;
        resetGenConfig();
        commitChange();
    };

    const handleRandomSeed = () => {
        const rnd = Math.floor(Math.random() * 2147483647).toString();
        setLocalSeedInput(rnd);
    };

    const downloadConfig = () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(GenConfig, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", "world_gen_config.json");
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    };

    const handleImportClick = () => fileInputRef.current?.click();

    const handleSavePreset = async () => {
        const saved = await saveWorldGenPresetAsync(presetNameInput, GenConfig);
        if (!saved) {
            alert('Enter a preset name first.');
            return;
        }
        await refreshPresetList();
        setSelectedPresetId(saved.id);
        setPresetNameInput(saved.name);
        alert(`Saved preset: ${saved.name}`);
    };

    const handleLoadSelectedPreset = async () => {
        if (!selectedPresetId) return;
        const preset = await getWorldGenPresetByIdAsync(selectedPresetId);
        if (!preset) {
            alert('Preset not found.');
            await refreshPresetList();
            return;
        }
        if (loadGenConfig(preset.config)) {
            commitChange();
            setPresetNameInput(preset.name);
        } else {
            alert('Failed to load preset JSON.');
        }
    };

    const handleDeleteSelectedPreset = async () => {
        if (!selectedPresetId) return;
        const preset = savedPresets.find((item) => item.id === selectedPresetId);
        if (!preset) return;
        if (!confirm(`Delete preset "${preset.name}"?`)) return;
        await deleteWorldGenPresetAsync(selectedPresetId);
        await refreshPresetList();
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const json = JSON.parse(event.target?.result as string);
                if (loadGenConfig(json)) {
                    commitChange();
                    const inferredName = file.name.replace(/\.json$/i, '').trim() || 'Imported Preset';
                    void (async () => {
                        const saved = await saveWorldGenPresetAsync(inferredName, GenConfig);
                        await refreshPresetList();
                        if (saved) {
                            setSelectedPresetId(saved.id);
                            setPresetNameInput(saved.name);
                        }
                    })();
                }
                else alert("Failed to load configuration. Check console.");
            } catch { alert("Invalid JSON file"); }
        };
        reader.readAsText(file);
        e.target.value = ''; 
    };

    const toggleBiomeExpand = (key: string) => setExpandedBiomes(prev => ({ ...prev, [key]: !prev[key] }));

    const getBiomeMeta = (key: string) => {
        switch(key) {
            case 'volcanic': return { name: 'Volcanic', color: BIOMES.VOLCANIC.color };
            case 'mesaBryce': return { name: 'Mesa Bryce', color: BIOMES.MESA_BRYCE.color };
            case 'mesa': return { name: 'Red Mesa', color: BIOMES.RED_MESA.color };
            case 'desert': return { name: 'Desert', color: BIOMES.DESERT.color };
            case 'plains': return { name: 'Plains', color: BIOMES.PLAINS.color };
            case 'forest': return { name: 'Forest', color: BIOMES.FOREST.color };
            case 'cherry': return { name: 'Cherry Grove', color: BIOMES.CHERRY_GROVE.color };
            case 'tundra': return { name: 'Tundra', color: BIOMES.TUNDRA.color };
            case 'ocean': return { name: 'Ocean', color: BIOMES.OCEAN.color };
            case 'river': return { name: 'River', color: BIOMES.RIVER.color };
            default: return { name: key, color: '#888' };
        }
    };

    const biomeKeys = ['volcanic', 'mesaBryce', 'mesa', 'desert', 'plains', 'forest', 'cherry', 'tundra', 'ocean', 'river'] as const;

    return (
        <div className="absolute inset-0 bg-[#222] flex z-[200] overflow-hidden">
            <input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={handleFileChange} />
            
            <div className="bg-[#2a2a2a] border-r border-black flex flex-col shadow-xl z-20 relative flex-shrink-0" style={{ width: sidebarWidth, minWidth: sidebarWidth }}>
                <div className="absolute top-0 right-[-4px] w-3 h-full cursor-col-resize z-50 group flex justify-center" onMouseDown={(e) => { e.preventDefault(); isResizingRef.current = true; document.body.style.cursor = 'col-resize'; }}>
                    <div className="w-[2px] h-full bg-transparent group-hover:bg-blue-500 transition-colors" />
                </div>

                <div className="p-3 bg-[#333] border-b border-black font-bold text-white flex justify-between items-center text-lg">
                    <span>World Editor</span>
                    <button onClick={onBack} className="text-sm px-3 py-1 bg-red-700 rounded hover:bg-red-600">Exit</button>
                </div>
                
                <div className="flex bg-[#222] border-b border-black">
                    <button onClick={() => setActiveSection('biomes')} className={`flex-1 py-3 text-sm font-bold ${activeSection === 'biomes' ? 'bg-[#333] text-white border-b-2 border-blue-500' : 'text-gray-400 hover:bg-[#2a2a2a]'}`}>BIOMES</button>
                    <button onClick={() => setActiveSection('terrain')} className={`flex-1 py-3 text-sm font-bold ${activeSection === 'terrain' ? 'bg-[#333] text-white border-b-2 border-green-500' : 'text-gray-400 hover:bg-[#2a2a2a]'}`}>TERRAIN</button>
                    <button onClick={() => setActiveSection('noise')} className={`flex-1 py-3 text-sm font-bold ${activeSection === 'noise' ? 'bg-[#333] text-white border-b-2 border-orange-500' : 'text-gray-400 hover:bg-[#2a2a2a]'}`}>NOISE</button>
                </div>
                
                <div className="flex-1 overflow-y-auto p-4 space-y-6">
                    {/* --- NOISE SECTION --- */}
                    {activeSection === 'noise' && (
                        <div className="bg-[#1a1a1a] rounded p-3 border border-white/10">
                            {(['temperature', 'continentalness', 'weirdness', 'river', 'terrain'] as const).map(key => (
                                <div key={key} className="mb-6 pl-2 border-l-2 border-white/20">
                                    <div className="text-sm font-bold text-orange-400 capitalize mb-2">{key}</div>
                                    {key !== 'terrain' && (
                                        <>
                                            <div className="flex justify-between text-xs text-gray-400 mb-1">Frequency (Scale)</div>
                                            <input type="range" min="0.0001" max="0.01" step="0.0001" value={GenConfig.noise[key].scale} onChange={(e) => { GenConfig.noise[key].scale = parseFloat(e.target.value); forceUpdate(); }} onMouseUp={commitChange} onDoubleClick={() => { GenConfig.noise[key].scale = DEFAULTS.noise[key].scale; commitChange(); }} className="w-full h-2 bg-gray-600 appearance-none rounded mb-3 cursor-pointer" />
                                            <div className="grid grid-cols-2 gap-4 mb-3">
                                                <div><div className="text-xs text-gray-400 mb-1">Octaves: {(GenConfig.noise[key] as any).octaves}</div><input type="range" min="1" max="5" step="1" value={(GenConfig.noise[key] as any).octaves} onChange={(e) => { (GenConfig.noise[key] as any).octaves = parseInt(e.target.value); forceUpdate(); }} onMouseUp={commitChange} onDoubleClick={() => { (GenConfig.noise[key] as any).octaves = (DEFAULTS.noise[key] as any).octaves; commitChange(); }} className="w-full h-2 bg-gray-600 appearance-none rounded cursor-pointer" /></div>
                                                <div><div className="text-xs text-gray-400 mb-1">Lacunarity: {(GenConfig.noise[key] as any).lacunarity}</div><input type="range" min="1.0" max="4.0" step="0.1" value={(GenConfig.noise[key] as any).lacunarity} onChange={(e) => { (GenConfig.noise[key] as any).lacunarity = parseFloat(e.target.value); forceUpdate(); }} onMouseUp={commitChange} onDoubleClick={() => { (GenConfig.noise[key] as any).lacunarity = (DEFAULTS.noise[key] as any).lacunarity; commitChange(); }} className="w-full h-2 bg-gray-600 appearance-none rounded cursor-pointer" /></div>
                                                <div><div className="text-xs text-gray-400 mb-1">Gain: {(GenConfig.noise[key] as any).gain}</div><input type="range" min="0.1" max="1.0" step="0.05" value={(GenConfig.noise[key] as any).gain} onChange={(e) => { (GenConfig.noise[key] as any).gain = parseFloat(e.target.value); forceUpdate(); }} onMouseUp={commitChange} onDoubleClick={() => { (GenConfig.noise[key] as any).gain = (DEFAULTS.noise[key] as any).gain; commitChange(); }} className="w-full h-2 bg-gray-600 appearance-none rounded cursor-pointer" /></div>
                                                <div><div className="text-xs text-gray-400 mb-1">Amp: {(GenConfig.noise[key] as any).amplification || 1.0}</div><input type="range" min="0.1" max="3.0" step="0.1" value={(GenConfig.noise[key] as any).amplification || 1.0} onChange={(e) => { (GenConfig.noise[key] as any).amplification = parseFloat(e.target.value); forceUpdate(); }} onMouseUp={commitChange} onDoubleClick={() => { (GenConfig.noise[key] as any).amplification = (DEFAULTS.noise[key] as any).amplification || 1.0; commitChange(); }} className="w-full h-2 bg-gray-600 appearance-none rounded cursor-pointer" /></div>
                                            </div>
                                            <div className="flex justify-between items-center text-xs text-gray-400 mb-1"><span>Type</span><select value={GenConfig.noise[key].type} onChange={(e) => { GenConfig.noise[key].type = e.target.value as NoiseType; commitChange(); }} className="bg-black border border-gray-600 rounded px-2 py-1 text-white text-xs"><option value="perlin">Perlin</option><option value="opensimplex2">OpenSimplex2</option><option value="cellular">Cellular</option><option value="value">Value</option><option value="sine">Sine</option><option value="white">White</option></select></div>
                                        </>
                                    )}
                                    {key === 'terrain' && (
                                        <>
                                            <div className="flex justify-between text-xs text-gray-400 mb-1">Base Scale (L)</div>
                                            <input type="range" min="0.001" max="0.05" step="0.001" value={GenConfig.noise.terrain.scale1} onChange={(e) => { GenConfig.noise.terrain.scale1 = parseFloat(e.target.value); forceUpdate(); }} onMouseUp={commitChange} onDoubleClick={() => { GenConfig.noise.terrain.scale1 = DEFAULTS.noise.terrain.scale1; commitChange(); }} className="w-full h-2 bg-gray-600 appearance-none rounded mb-2 cursor-pointer" />
                                            <div className="flex justify-between text-xs text-gray-400 mb-1">Detail Scale (H)</div>
                                            <input type="range" min="0.01" max="0.1" step="0.005" value={GenConfig.noise.terrain.scale2} onChange={(e) => { GenConfig.noise.terrain.scale2 = parseFloat(e.target.value); forceUpdate(); }} onMouseUp={commitChange} onDoubleClick={() => { GenConfig.noise.terrain.scale2 = DEFAULTS.noise.terrain.scale2; commitChange(); }} className="w-full h-2 bg-gray-600 appearance-none rounded mb-3 cursor-pointer" />
                                            <div className="flex justify-between items-center text-xs text-gray-400 mb-1"><span>Type</span><select value={GenConfig.noise[key].type} onChange={(e) => { GenConfig.noise[key].type = e.target.value as NoiseType; commitChange(); }} className="bg-black border border-gray-600 rounded px-2 py-1 text-white text-xs"><option value="perlin">Perlin</option><option value="opensimplex2">OpenSimplex2</option><option value="cellular">Cellular</option><option value="value">Value</option><option value="sine">Sine</option><option value="white">White</option></select></div>
                                        </>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                    {/* --- TERRAIN SHAPE SECTION --- */}
                    {activeSection === 'terrain' && (
                        <div className="bg-[#1a1a1a] rounded p-3 border border-white/10 space-y-6">
                            <div className="border-b border-white/10 pb-4 mb-2">
                                <div className="text-sm font-bold text-green-400 mb-3">Global</div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div><div className="text-xs text-gray-400 mb-1">Sea Level</div><div className="flex"><input type="number" value={GenConfig.height.seaLevel} onChange={(e) => { GenConfig.height.seaLevel = parseInt(e.target.value); forceUpdate(); }} onBlur={commitChange} className="w-full bg-black border border-gray-600 text-sm px-2 py-1 rounded" /><ResetBtn onClick={() => { GenConfig.height.seaLevel = DEFAULTS.height.seaLevel; commitChange(); }} /></div></div>
                                    <div><div className="text-xs text-gray-400 mb-1">Vertical Scale</div><div className="flex"><input type="number" step="0.1" value={GenConfig.height.globalScale} onChange={(e) => { GenConfig.height.globalScale = parseFloat(e.target.value); forceUpdate(); }} onBlur={commitChange} className="w-full bg-black border border-gray-600 text-sm px-2 py-1 rounded" /><ResetBtn onClick={() => { GenConfig.height.globalScale = DEFAULTS.height.globalScale; commitChange(); }} /></div></div>
                                </div>
                            </div>
                            <div>
                                <div className="text-sm font-bold text-blue-400 mb-3">Coast & Ocean</div>
                                <div className="mb-4"><div className="flex justify-between text-xs text-gray-400 mb-1"><span>Coast Power (Curve)</span><span className="text-gray-500 font-mono">{GenConfig.terrainShape.coastPower.toFixed(2)}</span></div><input type="range" min="0.1" max="5.0" step="0.1" value={GenConfig.terrainShape.coastPower} onChange={(e) => { GenConfig.terrainShape.coastPower = parseFloat(e.target.value); forceUpdate(); }} onMouseUp={commitChange} onDoubleClick={() => { GenConfig.terrainShape.coastPower = DEFAULTS.terrainShape.coastPower; commitChange(); }} className="w-full h-2 bg-gray-600 appearance-none rounded cursor-pointer" /></div>
                                <div className="mb-4"><div className="flex justify-between text-xs text-gray-400 mb-1"><span>Land Offset (Beach Size)</span><span className="text-gray-500 font-mono">{GenConfig.terrainShape.landOffset.toFixed(2)}</span></div><input type="range" min="0.01" max="0.5" step="0.01" value={GenConfig.terrainShape.landOffset} onChange={(e) => { GenConfig.terrainShape.landOffset = parseFloat(e.target.value); forceUpdate(); }} onMouseUp={commitChange} onDoubleClick={() => { GenConfig.terrainShape.landOffset = DEFAULTS.terrainShape.landOffset; commitChange(); }} className="w-full h-2 bg-gray-600 appearance-none rounded cursor-pointer" /></div>
                                <div className="grid grid-cols-2 gap-4 mb-4">
                                    <div><div className="text-xs text-gray-400 mb-1">Ocean Base Y</div><div className="flex"><input type="number" value={GenConfig.terrainShape.oceanBaseDepth} onChange={(e) => { GenConfig.terrainShape.oceanBaseDepth = parseFloat(e.target.value); forceUpdate(); }} onBlur={commitChange} className="w-full bg-black border border-gray-600 text-sm px-2 py-1 rounded" /><ResetBtn onClick={() => { GenConfig.terrainShape.oceanBaseDepth = DEFAULTS.terrainShape.oceanBaseDepth; commitChange(); }} /></div></div>
                                    <div><div className="text-xs text-gray-400 mb-1">Deep Ocean Base</div><div className="flex"><input type="number" value={GenConfig.terrainShape.oceanDeepBase} onChange={(e) => { GenConfig.terrainShape.oceanDeepBase = parseFloat(e.target.value); forceUpdate(); }} onBlur={commitChange} className="w-full bg-black border border-gray-600 text-sm px-2 py-1 rounded" /><ResetBtn onClick={() => { GenConfig.terrainShape.oceanDeepBase = DEFAULTS.terrainShape.oceanDeepBase; commitChange(); }} /></div></div>
                                </div>
                                <div><div className="text-xs text-gray-400 mb-1">Ocean Noise Scale</div><input type="range" min="0" max="50" step="1" value={GenConfig.terrainShape.oceanScale} onChange={(e) => { GenConfig.terrainShape.oceanScale = parseFloat(e.target.value); forceUpdate(); }} onMouseUp={commitChange} onDoubleClick={() => { GenConfig.terrainShape.oceanScale = DEFAULTS.terrainShape.oceanScale; commitChange(); }} className="w-full h-2 bg-gray-600 appearance-none rounded cursor-pointer" /></div>
                            </div>
                        </div>
                    )}
                    {/* --- BIOMES SECTION --- */}
                    {activeSection === 'biomes' && (
                        <div className="border-t border-white/10 pt-2 flex flex-col gap-3">
                            {biomeKeys.map(bKey => {
                                const meta = getBiomeMeta(bKey);
                                const isExpanded = expandedBiomes[bKey];
                                const config = (GenConfig.biomes as any)[bKey];
                                const defaultConfig = (DEFAULTS.biomes as any)[bKey];
                                return (
                                    <div key={bKey} className="border border-white/10 rounded bg-[#222]">
                                        <button className="w-full flex items-center gap-3 p-3 hover:bg-[#333] transition-colors" onClick={() => toggleBiomeExpand(bKey)}><div className="w-4 h-4 rounded shadow-sm border border-black/30" style={{ backgroundColor: meta.color }} /><span className="text-sm font-bold text-gray-200 flex-1 text-left">{meta.name}</span><span className="text-xs text-gray-500">{isExpanded ? 'v' : '>'}</span></button>
                                        {isExpanded && (<div className="p-3 space-y-3 bg-[#1a1a1a] border-t border-black/20">{Object.keys(config).map(param => (<div key={param}><div className="flex justify-between items-center text-xs text-gray-400 mb-1"><span className="capitalize">{param.replace(/([A-Z])/g, ' $1').trim()}</span><span className="font-mono text-gray-500 text-[11px]">{config[param]}</span></div>{param === 'base' || param === 'scale' || param === 'deepBase' ? (<input type="range" min="0" max="150" step="1" value={config[param]} onChange={(e) => { config[param] = parseFloat(e.target.value); forceUpdate(); }} onMouseUp={commitChange} onDoubleClick={() => { config[param] = defaultConfig[param]; commitChange(); }} className="w-full h-2 bg-gray-600 appearance-none rounded cursor-pointer accent-blue-500" />) : (<input type="range" min="-1" max="1" step="0.01" value={config[param]} onChange={(e) => { config[param] = parseFloat(e.target.value); forceUpdate(); }} onMouseUp={commitChange} onDoubleClick={() => { config[param] = defaultConfig[param]; commitChange(); }} className="w-full h-2 bg-gray-600 appearance-none rounded cursor-pointer" />)}</div>))}</div>)}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                <div className="p-3 border-t border-black bg-[#222] flex flex-col gap-3">
                    <div className="grid grid-cols-2 gap-2">
                        <button
                            onClick={handleUndo}
                            disabled={!historyState.canUndo}
                            className={`py-1.5 bg-gray-700 font-bold text-xs rounded uppercase tracking-wider transition-colors ${!historyState.canUndo ? 'opacity-30 cursor-not-allowed' : 'hover:bg-gray-600'}`}
                        >
                            Undo
                        </button>
                        <button
                            onClick={handleRedo}
                            disabled={!historyState.canRedo}
                            className={`py-1.5 bg-gray-700 font-bold text-xs rounded uppercase tracking-wider transition-colors ${!historyState.canRedo ? 'opacity-30 cursor-not-allowed' : 'hover:bg-gray-600'}`}
                        >
                            Redo
                        </button>
                    </div>
                    <button onClick={handleReset} className="py-1.5 bg-red-800 hover:bg-red-700 text-white font-bold text-xs rounded uppercase tracking-wider transition-colors">Reset Defaults</button>
                    
                    {/* Seed controls */}
                    <div className="mt-1 pt-3 border-t border-white/5 space-y-2">
                        <div className="flex justify-between items-center px-1">
                             <label className="text-[9px] font-black uppercase text-gray-500 tracking-widest">Preview Seed</label>
                             <div className="text-[8px] text-blue-500/50 font-bold uppercase">Independent</div>
                        </div>
                        <div className="flex gap-1">
                            <input 
                                type="text" 
                                value={localSeedInput} 
                                onChange={e => setLocalSeedInput(e.target.value)}
                                className="flex-1 bg-black border border-[#333] px-2 py-1.5 text-[10px] text-white font-minecraft focus:border-blue-500 outline-none placeholder:text-gray-800"
                                placeholder="Seed..."
                            />
                            {localSeedInput !== worldManager.getSeed().toString() && (
                                <button 
                                    onClick={() => setLocalSeedInput(worldManager.getSeed().toString())}
                                    className="px-2 bg-blue-700 hover:bg-blue-600 border border-white/20 rounded active:scale-95 transition-all text-xs flex items-center justify-center"
                                    title="Sync to World"
                                >Sync</button>
                            )}
                            <button 
                                onClick={handleRandomSeed}
                                className="px-2 bg-gray-700 hover:bg-gray-600 border border-white/20 rounded active:scale-95 transition-all text-xs"
                                title="Randomize Seed"
                            >Rand</button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Viewport */}
            <div className="flex-1 flex flex-col relative">
                {/* Toolbar */}
                <div className="h-14 bg-[#333] border-b border-black flex items-center px-4 gap-4 text-white shadow-md z-10">
                    <div className="relative flex items-center gap-2">
                        <div className="relative">
                            <button onClick={() => setShowLayers(!showLayers)} className={`px-4 py-1.5 text-sm rounded border border-gray-900 font-bold flex items-center gap-2 ${showLayers ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'}`}><span>Visible Layers</span><span className="text-xs bg-black/30 px-2 py-0.5 rounded">{layers.filter(l=>l.enabled).length}</span></button>
                            {showLayers && (
                                <div className="absolute top-full left-0 mt-2 w-72 bg-[#2a2a2a] border border-gray-600 rounded shadow-2xl p-2 z-50 flex flex-col gap-2">
                                    {layers.map(layer => (
                                        <div key={layer.id} className="flex flex-col gap-1 bg-[#1a1a1a] p-2 rounded border border-white/10">
                                            <div className="flex items-center justify-between"><label className="flex items-center gap-2 cursor-pointer select-none"><input type="checkbox" checked={layer.enabled} onChange={() => toggleLayer(layer.id)} className="w-4 h-4 rounded accent-blue-500" /><span className="font-bold text-sm" style={{color: layer.color}}>{layer.name}</span></label><span className="text-xs text-gray-400">{(layer.opacity * 100).toFixed(0)}%</span></div>
                                            <input type="range" min="0" max="1" step="0.05" value={layer.opacity} disabled={!layer.enabled} onChange={(e) => updateOpacity(layer.id, parseFloat(e.target.value))} className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer disabled:opacity-30 accent-white" />
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <label className="flex items-center gap-2 cursor-pointer bg-gray-700 px-3 py-1.5 rounded border border-gray-900 hover:bg-gray-600 select-none h-full"><input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} className="w-4 h-4 rounded accent-blue-500 cursor-pointer" /><span className="text-sm font-bold text-gray-200">Grid</span></label>
                        <div className="flex items-center bg-gray-700 rounded border border-gray-900 h-full"><label className="flex items-center gap-2 cursor-pointer px-3 py-1.5 hover:bg-gray-600 select-none border-r border-gray-600 h-full"><input type="checkbox" checked={showRulers} onChange={(e) => setShowRulers(e.target.checked)} className="w-4 h-4 rounded accent-blue-500 cursor-pointer" /><span className="text-sm font-bold text-gray-200">Rulers</span></label><select className="bg-transparent text-sm text-gray-200 font-bold px-2 outline-none cursor-pointer hover:bg-gray-600 h-full" value={rulerType} onChange={(e) => setRulerType(e.target.value as any)} disabled={!showRulers}><option value="power2" className="bg-[#333]">Pow2</option><option value="decimal" className="bg-[#333]">Dec</option></select></div>
                    </div>
                    <div className="h-8 w-px bg-gray-600 mx-2" />
                    <span className="font-bold text-gray-300 text-sm">Coords:</span>
                    <input className="w-20 bg-gray-800 border border-gray-600 px-2 py-1 rounded text-right text-sm" value={inputX} onChange={e => setInputX(e.target.value)} placeholder="X" />
                    <input className="w-20 bg-gray-800 border border-gray-600 px-2 py-1 rounded text-right text-sm" value={inputZ} onChange={e => setInputZ(e.target.value)} placeholder="Z" />
                    <button onClick={goToCoords} className="px-4 py-1 bg-blue-700 hover:bg-blue-600 rounded font-bold text-sm">Go</button>
                    <div className="flex-1" />
                    <button onClick={() => { setShowSavesMenu((prev) => !prev); if (!showSavesMenu) void refreshPresetList(); }} className={`px-4 py-1 rounded font-bold text-sm border border-gray-900 ${showSavesMenu ? 'bg-indigo-600' : 'bg-gray-700 hover:bg-gray-600'}`}>Saves</button>
                    <div className="text-xs text-gray-400 font-mono">Scale: {scale.toFixed(2)} | Res: 1/2</div>
                </div>

                <div className="flex-1 relative overflow-hidden bg-[#111]">
                    <canvas 
                        ref={canvasRef} 
                        width={window.innerWidth - sidebarWidth} 
                        height={window.innerHeight - 56}
                        className="cursor-crosshair w-full h-full block"
                        onMouseMove={handleMouseMove}
                        onWheel={handleWheel}
                    />
                    
                    {/* Info Panel */}
                    <div className="absolute bottom-4 right-4 bg-black/80 text-white p-4 rounded border border-white/20 font-mono text-sm pointer-events-none w-64 shadow-lg backdrop-blur-sm">
                        {hoverInfo ? (
                            <>
                                <div className="text-yellow-400 font-bold mb-2 border-b border-white/10 pb-1">Block Inspector</div>
                                <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
                                    <span className="text-gray-400">Coords:</span> <span className="font-bold text-white">{hoverInfo.x}, {hoverInfo.z}</span>
                                    <span className="text-gray-400">Biome:</span> <span className="font-bold text-green-400">{hoverInfo.biome.name}</span>
                                    <span className="text-gray-400">Height:</span> <span>{hoverInfo.height}</span>
                                    <span className="text-gray-400">Temp:</span> <span>{hoverInfo.temp.toFixed(3)}</span>
                                    <span className="text-gray-400">Rain:</span> <span>{hoverInfo.riverVal.toFixed(3)}</span>
                                    <span className="text-gray-400">Cont:</span> <span>{hoverInfo.continentalness.toFixed(3)}</span>
                                    <span className="text-gray-400">Weird:</span> <span>{hoverInfo.weirdness.toFixed(3)}</span>
                                </div>
                            </>
                        ) : (
                            <div className="text-gray-400 text-center italic">Hover map for details</div>
                        )}
                    </div>

                    {showSavesMenu && (
                        <div className="absolute top-4 right-4 z-40 w-[420px] bg-[#1a1a1a] border border-white/20 rounded shadow-2xl p-3 space-y-3">
                            <div className="flex items-center justify-between">
                                <div className="text-sm font-bold text-white">Saves</div>
                                <button onClick={() => setShowSavesMenu(false)} className="px-2 py-1 text-xs bg-red-700 hover:bg-red-600 rounded">Close</button>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                                <button onClick={downloadConfig} className="py-2 bg-blue-700 hover:bg-blue-600 text-white font-bold text-xs rounded uppercase tracking-wider transition-colors">Export JSON</button>
                                <button onClick={handleImportClick} className="py-2 bg-green-700 hover:bg-green-600 text-white font-bold text-xs rounded uppercase tracking-wider transition-colors">Import JSON</button>
                            </div>

                            <div className="space-y-2 border border-white/10 rounded bg-[#222] p-2">
                                <div className="text-[10px] font-black uppercase tracking-wider text-gray-400">Save Current Preset</div>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={presetNameInput}
                                        onChange={(e) => setPresetNameInput(e.target.value)}
                                        className="flex-1 bg-black border border-[#333] px-2 py-1.5 text-xs text-white outline-none focus:border-blue-500"
                                        placeholder="Preset name"
                                    />
                                    <button onClick={() => void handleSavePreset()} className="px-3 py-1.5 bg-indigo-700 hover:bg-indigo-600 text-white font-bold text-xs rounded uppercase tracking-wider transition-colors">Save</button>
                                </div>
                                <div className="text-[10px] text-gray-500">Duplicate names auto-increment to avoid overwrites.</div>
                            </div>

                            <div className="space-y-2 border border-white/10 rounded bg-[#222] p-2">
                                <div className="flex items-center justify-between">
                                    <div className="text-[10px] font-black uppercase tracking-wider text-gray-400">Saved Presets</div>
                                    <button onClick={() => void refreshPresetList()} className="px-2 py-1 text-[10px] bg-gray-700 hover:bg-gray-600 rounded uppercase">Refresh</button>
                                </div>
                                <div className="max-h-40 overflow-y-auto border border-white/10 bg-black/40 rounded">
                                    {savedPresets.length === 0 && <div className="px-2 py-2 text-xs text-gray-500">No presets found.</div>}
                                    {savedPresets.map((preset) => (
                                        <button
                                            key={preset.id}
                                            onClick={() => { setSelectedPresetId(preset.id); setPresetNameInput(preset.name); }}
                                            onDoubleClick={() => void handleLoadSelectedPreset()}
                                            className={`w-full text-left px-2 py-1.5 border-b border-white/5 text-xs ${selectedPresetId === preset.id ? 'bg-indigo-900/50 text-white' : 'hover:bg-white/5 text-gray-300'}`}
                                        >
                                            <div className="font-bold truncate">{preset.name}</div>
                                            <div className="text-[10px] text-gray-500">Updated {new Date(preset.updatedAt).toLocaleString()}</div>
                                        </button>
                                    ))}
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <button onClick={() => void handleLoadSelectedPreset()} disabled={!selectedPresetId} className={`py-2 text-xs font-bold rounded uppercase ${selectedPresetId ? 'bg-blue-700 hover:bg-blue-600' : 'bg-gray-700 opacity-40 cursor-not-allowed'}`}>Load</button>
                                    <button onClick={() => void handleDeleteSelectedPreset()} disabled={!selectedPresetId} className={`py-2 text-xs font-bold rounded uppercase ${selectedPresetId ? 'bg-red-700 hover:bg-red-600' : 'bg-gray-700 opacity-40 cursor-not-allowed'}`}>Delete</button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
