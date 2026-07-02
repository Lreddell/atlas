import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { getBiome, getGenerationParams, BIOMES } from '../../systems/world/biomes';
import {
    getMagneticFieldColumn,
    getMagneticFieldsConfig,
    getActiveCenters,
    findNearestMagneticField,
} from '../../systems/world/magneticFields';
import { getTerrainHeight } from '../../systems/world/chunkGeneration';
import { GenConfig, NoiseType, resetGenConfig, loadGenConfig, normalizeGenConfigSnapshot, DEFAULTS, initHistory, pushHistory, undo, redo, getHistoryState } from '../../systems/world/genConfig';
import { CHUNK_SIZE } from '../../constants';
import { worldManager } from '../../systems/WorldManager';
import { createNoiseSet, hashSeed } from '../../utils/noise';
import { deleteWorldGenPresetAsync, getWorldGenPresetByIdAsync, listWorldGenPresetsAsync, saveWorldGenPresetAsync, WorldGenPresetEntry } from '../../systems/world/worldGenPresets';
import { ConfirmModal } from './ConfirmModal';

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

// Compact labeled number field for the Magnetic Fields config: tooltip on the
// label, immediate preview on change, history commit on blur, double-click the
// R button to restore the default.
const MfNum = ({ label, title, value, step, onChange, onReset }: {
    label: string;
    title: string;
    value: number;
    step: number;
    onChange: (v: number) => void;
    onReset: () => void;
}) => (
    <div title={title}>
        <div className="text-[10px] text-gray-400 mb-0.5 truncate">{label}</div>
        <div className="flex">
            <input
                type="number"
                step={step}
                value={value}
                onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) onChange(v); }}
                className="w-full min-w-0 bg-black border border-gray-600 text-[11px] px-1.5 py-0.5 rounded"
            />
            <button
                onClick={onReset}
                className="ml-1 w-5 flex-shrink-0 flex items-center justify-center bg-[#444] hover:bg-[#555] text-[10px] rounded text-gray-200 border border-gray-600"
                title="Reset to default"
                aria-label={`Reset ${label}`}
            >R</button>
        </div>
    </div>
);

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
    const [editorStatus, setEditorStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
    const [showResetConfirmation, setShowResetConfirmation] = useState(false);
    const [pendingDeletePreset, setPendingDeletePreset] = useState<WorldGenPresetEntry | null>(null);
    
    // Seed State (Independent from Game)
    const [localSeedInput, setLocalSeedInput] = useState(() => worldManager.getSeed().toString());
    const previewNoiseSet = useMemo(() => {
        const hashed = hashSeed(localSeedInput);
        return createNoiseSet(hashed);
    }, [localSeedInput]);

    // Force re-render token to update canvas when mutable config changes
    const [configVersion, setConfigVersion] = useState(0);

    // Nearest Magnetic Fields arena found via "Find Nearest Field".
    const [nearestMf, setNearestMf] = useState<{ centerX: number; centerZ: number; distance: number } | null>(null);
    const [copiedMfTp, setCopiedMfTp] = useState(false);

    const [layers, setLayers] = useState<LayerConfig[]>([
        { id: 'biome', name: 'Biomes', enabled: true, opacity: 1.0, color: '#4CAF50' },
        { id: 'boss', name: 'Boss Field (Magnetic)', enabled: false, opacity: 0.9, color: '#b388ff' },
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

    const forceUpdate = () => {
        setConfigVersion(v => v + 1);
        setHistoryState(getHistoryState());
    };

    const refreshPresetList = useCallback(async () => {
        const presets = await listWorldGenPresetsAsync();
        setSavedPresets(presets);
        setSelectedPresetId((prev) => (prev && presets.some((preset) => preset.id === prev) ? prev : presets[0]?.id ?? ''));
    }, []);

    const handleRefreshPresetList = useCallback(async () => {
        try {
            await refreshPresetList();
        } catch (error) {
            console.error('[WorldEditor] Failed to refresh presets:', error);
            setEditorStatus({ type: 'error', message: 'Failed to refresh presets.' });
        }
    }, [refreshPresetList]);

    // Init History
    useEffect(() => {
        initHistory();
        setHistoryState(getHistoryState());
        void handleRefreshPresetList();
    }, [handleRefreshPresetList]);

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
        // Boss-biome activation noise sampler (same channel worldgen uses).
        const bossNoise2D = (px: number, pz: number) => previewNoiseSet.bossBiome.noise2D(px, pz);
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
                    else if (layer.id === 'boss') {
                        // Visualize the rare Magnetic Fields "boss biome": where an
                        // instance actually lands, shaded outer→inner by tier (the
                        // golden core is the boss arena plateau); elsewhere a faint
                        // heatmap of the activation noise so you can spot near-misses.
                        const bossSeed = previewNoiseSet.seed | 0;
                        const mfc = getMagneticFieldsConfig();
                        const col = getMagneticFieldColumn(wx, wz, bossSeed, bossNoise2D);
                        if (col) {
                            if (col.isArena) {
                                lr = 255; lg = 224; lb = 130;          // arena plateau
                            } else {
                                const tierT = col.tier / Math.max(1, mfc.tierCount - 1); // 0 outer → 1 inner
                                lr = 110 + tierT * 130; lg = 40 + tierT * 30; lb = 200;   // purple → magenta
                            }
                        } else {
                            const f = bossNoise2D(wx * mfc.fieldFreq, wz * mfc.fieldFreq);
                            const hot = Math.max(0, (f - (mfc.fieldThreshold - 0.3)) / 0.3); // ramps toward threshold
                            lr = hot * 70; lg = 0; lb = hot * 95;
                        }
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

        // --- Active Magnetic Fields centers (boss layer): crosshair + label ---
        if (layers.some(l => l.id === 'boss' && l.enabled)) {
            const endWX = startWX + width * invScale;
            const endWZ = startWZ + height * invScale;
            const centers = getActiveCenters(startWX, startWZ, endWX, endWZ, previewNoiseSet.seed | 0, bossNoise2D, getMagneticFieldsConfig().radius);
            ctx.font = 'bold 11px monospace';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'bottom';
            for (const c of centers) {
                const sx = (c.centerX - center.x) * scale + width / 2;
                const sz = (c.centerZ - center.z) * scale + height / 2;
                ctx.strokeStyle = '#ffe082';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(sx - 8, sz); ctx.lineTo(sx + 8, sz);
                ctx.moveTo(sx, sz - 8); ctx.lineTo(sx, sz + 8);
                ctx.stroke();
                ctx.fillStyle = 'rgba(0,0,0,0.65)';
                const label = `${c.centerX}, ${c.centerZ}`;
                const w = ctx.measureText(label).width;
                ctx.fillRect(sx + 10, sz - 16, w + 8, 15);
                ctx.fillStyle = '#ffe082';
                ctx.fillText(label, sx + 14, sz - 3);
            }
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
        // Magnetic Fields readout: tier / arena / center / distance when inside
        // an instance, plus the raw boss-field noise value at this position.
        const bossSeed = previewNoiseSet.seed | 0;
        const mfc = getMagneticFieldsConfig();
        const mfCol = getMagneticFieldColumn(wx, wz, bossSeed, (px, pz) => previewNoiseSet.bossBiome.noise2D(px, pz));
        const mfFieldVal = previewNoiseSet.bossBiome.noise2D(wx * mfc.fieldFreq, wz * mfc.fieldFreq);
        setHoverInfo({ x: wx, z: wz, biome, height: heightVal, ...params, mfCol, mfFieldVal });
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
        setShowResetConfirmation(true);
    };

    const confirmReset = () => {
        setShowResetConfirmation(false);
        resetGenConfig();
        commitChange();
        setEditorStatus({ type: 'success', message: 'World generation settings reset to defaults.' });
    };

    const handleRandomSeed = () => {
        const rnd = Math.floor(Math.random() * 2147483647).toString();
        setLocalSeedInput(rnd);
    };

    // Find the nearest active Magnetic Fields instance to the current map
    // center, jump the view to its Warden arena, and turn the boss layer on.
    const handleFindNearestMf = () => {
        const found = findNearestMagneticField(
            center.x, center.z, previewNoiseSet.seed | 0,
            (px, pz) => previewNoiseSet.bossBiome.noise2D(px, pz),
        );
        if (!found) {
            setEditorStatus({ type: 'error', message: 'No Magnetic Field found within 50,000 blocks. Check the domain settings.' });
            return;
        }
        setNearestMf(found);
        setCopiedMfTp(false);
        setCenter({ x: found.centerX, z: found.centerZ });
        setInputX(String(found.centerX));
        setInputZ(String(found.centerZ));
        setLayers(prev => prev.map(l => l.id === 'boss' ? { ...l, enabled: true } : l));
        setEditorStatus({ type: 'success', message: `Found Magnetic Field at ${found.centerX}, ${found.centerZ}.` });
    };

    const handleCopyMfTp = async () => {
        if (!nearestMf) return;
        const y = GenConfig.bossDomains.magneticFields.arenaFloorY + 1;
        const cmd = `/tp ${nearestMf.centerX} ${y} ${nearestMf.centerZ}`;
        if (!navigator.clipboard?.writeText) {
            setEditorStatus({ type: 'error', message: `Clipboard unavailable. Teleport command: ${cmd}` });
            return;
        }
        try {
            await navigator.clipboard.writeText(cmd);
            setCopiedMfTp(true);
            setTimeout(() => setCopiedMfTp(false), 1500);
            setEditorStatus({ type: 'success', message: 'Teleport command copied.' });
        } catch {
            setEditorStatus({ type: 'error', message: `Copy failed. Teleport command: ${cmd}` });
        }
    };

    const downloadConfig = () => {
        const snapshot = normalizeGenConfigSnapshot(GenConfig);
        if (!snapshot) {
            setEditorStatus({ type: 'error', message: 'Failed to export world generation configuration.' });
            return;
        }
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(snapshot, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", "world_gen_config.json");
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
        setEditorStatus({ type: 'success', message: 'World generation JSON exported.' });
    };

    const handleImportClick = () => fileInputRef.current?.click();

    const handleSavePreset = async () => {
        setEditorStatus(null);
        try {
            const saved = await saveWorldGenPresetAsync(presetNameInput, GenConfig);
            if (!saved) {
                setEditorStatus({ type: 'error', message: 'Enter a preset name first.' });
                return;
            }
            await refreshPresetList();
            setSelectedPresetId(saved.id);
            setPresetNameInput(saved.name);
            setEditorStatus({ type: 'success', message: `Saved preset: ${saved.name}` });
        } catch (error) {
            console.error('[WorldEditor] Failed to save preset:', error);
            setEditorStatus({ type: 'error', message: 'Failed to save preset.' });
        }
    };

    const handleLoadSelectedPreset = async () => {
        if (!selectedPresetId) return;
        setEditorStatus(null);
        try {
            const preset = await getWorldGenPresetByIdAsync(selectedPresetId);
            if (!preset) {
                setEditorStatus({ type: 'error', message: 'Preset not found.' });
                await refreshPresetList();
                return;
            }
            if (!loadGenConfig(preset.config)) {
                setEditorStatus({ type: 'error', message: 'Failed to load preset JSON.' });
                return;
            }
            commitChange();
            setPresetNameInput(preset.name);
            setEditorStatus({ type: 'success', message: `Loaded preset: ${preset.name}` });
        } catch (error) {
            console.error('[WorldEditor] Failed to load preset:', error);
            setEditorStatus({ type: 'error', message: 'Failed to load preset.' });
        }
    };

    const handleDeleteSelectedPreset = () => {
        if (!selectedPresetId) return;
        const preset = savedPresets.find((item) => item.id === selectedPresetId);
        if (!preset) return;
        setPendingDeletePreset(preset);
    };

    const confirmDeleteSelectedPreset = async () => {
        const preset = pendingDeletePreset;
        setPendingDeletePreset(null);
        if (!preset) return;
        try {
            const deleted = await deleteWorldGenPresetAsync(preset.id);
            if (!deleted) {
                setEditorStatus({ type: 'error', message: `Preset not found: ${preset.name}` });
                await refreshPresetList();
                return;
            }
            await refreshPresetList();
            setEditorStatus({ type: 'success', message: `Deleted preset: ${preset.name}` });
        } catch (error) {
            console.error('[WorldEditor] Failed to delete preset:', error);
            setEditorStatus({ type: 'error', message: 'Failed to delete preset.' });
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            void (async () => {
                try {
                    const json = JSON.parse(event.target?.result as string);
                    if (!loadGenConfig(json)) {
                        setEditorStatus({ type: 'error', message: 'Failed to load configuration.' });
                        return;
                    }
                    commitChange();
                    const inferredName = file.name.replace(/\.json$/i, '').trim() || 'Imported Preset';
                    try {
                        const saved = await saveWorldGenPresetAsync(inferredName, GenConfig);
                        await refreshPresetList();
                        if (saved) {
                            setSelectedPresetId(saved.id);
                            setPresetNameInput(saved.name);
                            setEditorStatus({ type: 'success', message: `Imported preset: ${saved.name}` });
                        } else {
                            setEditorStatus({ type: 'error', message: 'Configuration loaded, but the preset could not be saved.' });
                        }
                    } catch (error) {
                        console.error('[WorldEditor] Failed to save imported preset:', error);
                        setEditorStatus({ type: 'error', message: 'Configuration loaded, but the preset could not be saved.' });
                    }
                } catch {
                    setEditorStatus({ type: 'error', message: 'Invalid JSON file.' });
                }
            })();
        };
        reader.onerror = () => setEditorStatus({ type: 'error', message: 'Failed to read JSON file.' });
        reader.readAsText(file);
        e.target.value = ''; 
    };

    const toggleBiomeExpand = (key: string) => setExpandedBiomes(prev => ({ ...prev, [key]: !prev[key] }));

    // Map every editable GenConfig biome key to its registry name + map colour, so
    // the editor lists ALL biomes (including the later-added forests/mountains/etc.),
    // not just the original ten.
    const BIOME_META: Record<string, { name: string; color: string }> = {
        ocean: { name: 'Ocean', color: BIOMES.OCEAN.color },
        beach: { name: 'Beach', color: BIOMES.BEACH.color },
        tundra: { name: 'Tundra', color: BIOMES.TUNDRA.color },
        river: { name: 'River', color: BIOMES.RIVER.color },
        volcanic: { name: 'Volcanic', color: BIOMES.VOLCANIC.color },
        mesaBryce: { name: 'Mesa Bryce', color: BIOMES.MESA_BRYCE.color },
        mesa: { name: 'Red Mesa', color: BIOMES.RED_MESA.color },
        desert: { name: 'Desert', color: BIOMES.DESERT.color },
        plains: { name: 'Plains', color: BIOMES.PLAINS.color },
        forest: { name: 'Forest', color: BIOMES.FOREST.color },
        cherry: { name: 'Cherry Grove', color: BIOMES.CHERRY_GROVE.color },
        birchForest: { name: 'Birch Forest', color: BIOMES.BIRCH_FOREST.color },
        flowerForest: { name: 'Flower Forest', color: BIOMES.FLOWER_FOREST.color },
        darkForest: { name: 'Dark Forest', color: BIOMES.DARK_FOREST.color },
        meadow: { name: 'Meadow', color: BIOMES.MEADOW.color },
        savanna: { name: 'Savanna', color: BIOMES.SAVANNA.color },
        jungle: { name: 'Jungle', color: BIOMES.JUNGLE.color },
        taiga: { name: 'Taiga', color: BIOMES.TAIGA.color },
        iceSpikes: { name: 'Ice Spikes', color: BIOMES.ICE_SPIKES.color },
        mountains: { name: 'Mountains', color: BIOMES.MOUNTAINS.color },
        swamp: { name: 'Swamp', color: BIOMES.SWAMP.color },
        stoneShore: { name: 'Stone Shore', color: BIOMES.STONE_SHORE.color },
    };

    const getBiomeMeta = (key: string) => BIOME_META[key] ?? { name: key, color: '#888' };

    const biomeKeys = Object.keys(GenConfig.biomes);

    return (
        <div className="absolute inset-0 bg-[#222] flex z-[200] overflow-hidden">
            <input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={handleFileChange} />
            {editorStatus && (
                <div
                    role="status"
                    aria-live="polite"
                    className={`pointer-events-none absolute left-1/2 top-4 z-[260] max-w-[560px] -translate-x-1/2 rounded border px-4 py-2 text-center text-xs font-bold shadow-xl ${editorStatus.type === 'success' ? 'border-green-500/50 bg-green-950/95 text-green-300' : 'border-red-500/50 bg-red-950/95 text-red-300'}`}
                >
                    {editorStatus.message}
                </div>
            )}
            
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
                            {/* Magnetic Fields — an editable boss-domain, placed by the
                                dedicated Boss Field noise channel instead of the
                                temperature/weirdness bands. */}
                            <div className="border border-purple-500/40 rounded bg-[#1c1726] p-3">
                                <div className="flex items-center gap-3 mb-2">
                                    <div className="w-4 h-4 rounded shadow-sm border border-black/30" style={{ backgroundColor: BIOMES.MAGNETIC_FIELDS.color }} />
                                    <span className="text-sm font-bold text-purple-300 flex-1">Magnetic Fields <span className="text-[10px] text-purple-400/70">BOSS</span></span>
                                    <label className="flex items-center gap-1.5 cursor-pointer select-none" title="Generate Magnetic Fields instances at all">
                                        <input
                                            type="checkbox"
                                            checked={GenConfig.bossDomains.magneticFields.enabled}
                                            onChange={(e) => { GenConfig.bossDomains.magneticFields.enabled = e.target.checked; commitChange(); }}
                                            className="w-3.5 h-3.5 accent-purple-500"
                                        />
                                        <span className="text-[10px] text-gray-300">Enabled</span>
                                    </label>
                                </div>
                                <div className="text-[10px] text-gray-500 leading-relaxed mb-2" title="Cell / Field Freq / Threshold decide WHERE instances land — changing them relocates every field (and arena) in the world. The rest reshape terrain around the same centers.">
                                    Placed by the dedicated <span className="text-purple-300">Boss Field</span> noise — enable that map layer to preview instances. Hover the map for tier/arena/center readouts.
                                </div>
                                <div className="grid grid-cols-2 gap-2 mb-2">
                                    <button
                                        onClick={handleFindNearestMf}
                                        className="py-1.5 bg-purple-800 hover:bg-purple-700 text-white font-bold text-[10px] rounded uppercase tracking-wider transition-colors"
                                        title="Search up to 50,000 blocks from the current map center and center the map on the nearest Warden arena"
                                    >Find Nearest Field</button>
                                    <button
                                        onClick={() => void handleCopyMfTp()}
                                        disabled={!nearestMf}
                                        className={`py-1.5 font-bold text-[10px] rounded uppercase tracking-wider transition-colors ${nearestMf ? 'bg-indigo-700 hover:bg-indigo-600 text-white' : 'bg-gray-700 opacity-40 cursor-not-allowed text-gray-300'}`}
                                        title="Copy a /tp command to the found arena center"
                                    >{copiedMfTp ? 'Copied!' : 'Copy /tp'}</button>
                                </div>
                                {nearestMf && (
                                    <div className="text-[10px] text-purple-300/90 font-mono mb-2">
                                        Arena @ {nearestMf.centerX}, {GenConfig.bossDomains.magneticFields.arenaFloorY + 1}, {nearestMf.centerZ} ({Math.round(nearestMf.distance).toLocaleString()} blk away)
                                    </div>
                                )}
                                {(() => {
                                    const mf = GenConfig.bossDomains.magneticFields;
                                    const dmf = DEFAULTS.bossDomains.magneticFields;
                                    const set = <K extends keyof typeof mf>(key: K) => (v: number) => { (mf[key] as number) = v; forceUpdate(); };
                                    const reset = <K extends keyof typeof mf>(key: K) => () => { (mf[key] as typeof mf[K]) = dmf[key]; commitChange(); };
                                    const groups: { title: string; fields: { key: keyof typeof mf; label: string; step: number; tip: string }[] }[] = [
                                        {
                                            title: 'Placement (moves centers!)',
                                            fields: [
                                                { key: 'cell', label: 'Cell Spacing', step: 128, tip: 'Grid spacing between candidate centers (blocks). Larger = rarer.' },
                                                { key: 'fieldFreq', label: 'Field Freq', step: 0.0001, tip: 'Boss-field noise frequency used to activate candidate centers.' },
                                                { key: 'fieldThreshold', label: 'Threshold', step: 0.01, tip: 'Noise value a center must exceed to activate. Higher = rarer.' },
                                            ],
                                        },
                                        {
                                            title: 'Shape',
                                            fields: [
                                                { key: 'radius', label: 'Radius', step: 16, tip: 'Base biome radius in blocks (warped per-edge).' },
                                                { key: 'edgeFreq', label: 'Edge Warp Freq', step: 0.001, tip: 'Boundary wobble frequency.' },
                                                { key: 'edgeAmp', label: 'Edge Warp Amp', step: 0.02, tip: 'Boundary radius variation (0.28 = ±28%).' },
                                                { key: 'tierWarpFreq', label: 'Tier Warp Freq', step: 0.005, tip: 'Cliff-ring wobble frequency.' },
                                                { key: 'tierWarpAmp', label: 'Tier Warp Amp', step: 1, tip: 'How far cliff rings shift in/out (blocks).' },
                                                { key: 'shelfJitterFreq', label: 'Shelf Jitter Freq', step: 0.005, tip: 'Per-column shelf bumpiness frequency.' },
                                                { key: 'shelfJitterAmp', label: 'Shelf Jitter Amp', step: 0.2, tip: 'Shelf bumpiness amplitude (blocks).' },
                                            ],
                                        },
                                        {
                                            title: 'Tiers',
                                            fields: [
                                                { key: 'tierCount', label: 'Tier Count', step: 1, tip: 'Number of shelves from the rim to the arena plateau.' },
                                                { key: 'tierHeight', label: 'Tier Height', step: 1, tip: 'Vertical rise of each magnetite wall (blocks).' },
                                                { key: 'baseHeight', label: 'Base Height Y', step: 1, tip: 'Surface Y of the outermost shelf (tier 0).' },
                                            ],
                                        },
                                        {
                                            title: 'Arena & Blend',
                                            fields: [
                                                { key: 'arenaRadius', label: 'Arena Radius', step: 4, tip: 'Flat plateau radius the Warden arena sits on.' },
                                                { key: 'arenaFloorY', label: 'Arena Floor Y', step: 1, tip: 'World Y of the arena plateau / boss floor.' },
                                                { key: 'apron', label: 'Apron Size', step: 4, tip: 'Edge band (blocks) that ramps down into ambient terrain.' },
                                                { key: 'apronMinY', label: 'Apron Min Y', step: 1, tip: 'The apron never ramps below this Y (soft shore over oceans).' },
                                            ],
                                        },
                                    ];
                                    return groups.map((g) => (
                                        <div key={g.title} className="mb-2">
                                            <div className="text-[9px] font-black uppercase tracking-widest text-purple-400/70 mb-1">{g.title}</div>
                                            <div className="grid grid-cols-2 gap-x-2 gap-y-1.5">
                                                {g.fields.map((f) => (
                                                    <MfNum
                                                        key={String(f.key)}
                                                        label={f.label}
                                                        title={f.tip}
                                                        value={mf[f.key] as number}
                                                        step={f.step}
                                                        onChange={set(f.key)}
                                                        onReset={reset(f.key)}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    ));
                                })()}
                                <button
                                    onClick={() => { GenConfig.bossDomains.magneticFields = JSON.parse(JSON.stringify(DEFAULTS.bossDomains.magneticFields)); commitChange(); }}
                                    className="w-full py-1 bg-[#3a2f4f] hover:bg-[#4a3d63] text-purple-200 font-bold text-[10px] rounded uppercase tracking-wider transition-colors"
                                >Reset Magnetic Fields</button>
                            </div>
                            <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider pt-1">Standard Biomes</div>
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
                                className="flex-1 bg-black border border-[#333] px-2 py-1.5 text-[10px] text-white font-pixel focus:border-blue-500 outline-none placeholder:text-gray-800"
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
                    <button onClick={() => { setShowSavesMenu((prev) => !prev); if (!showSavesMenu) void handleRefreshPresetList(); }} className={`px-4 py-1 rounded font-bold text-sm border border-gray-900 ${showSavesMenu ? 'bg-indigo-600' : 'bg-gray-700 hover:bg-gray-600'}`}>Saves</button>
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
                                    <span className="text-gray-400">Boss Field:</span> <span className="text-purple-300">{hoverInfo.mfFieldVal?.toFixed(3)}</span>
                                    {hoverInfo.mfCol && (
                                        <>
                                            <span className="text-gray-400">MF Tier:</span>
                                            <span className="text-purple-300">{hoverInfo.mfCol.isArena ? 'Arena' : `${hoverInfo.mfCol.tier} / ${getMagneticFieldsConfig().tierCount - 1}`}</span>
                                            <span className="text-gray-400">MF Center:</span>
                                            <span className="text-purple-300">{hoverInfo.mfCol.instance.centerX}, {hoverInfo.mfCol.instance.centerZ}</span>
                                            <span className="text-gray-400">MF Dist:</span>
                                            <span className="text-purple-300">{Math.round(hoverInfo.mfCol.distance)} blk</span>
                                        </>
                                    )}
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
                                        onChange={(e) => { setPresetNameInput(e.target.value); setEditorStatus(null); }}
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
                                    <button onClick={() => void handleRefreshPresetList()} className="px-2 py-1 text-[10px] bg-gray-700 hover:bg-gray-600 rounded uppercase">Refresh</button>
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
                                    <button onClick={handleDeleteSelectedPreset} disabled={!selectedPresetId} className={`py-2 text-xs font-bold rounded uppercase ${selectedPresetId ? 'bg-red-700 hover:bg-red-600' : 'bg-gray-700 opacity-40 cursor-not-allowed'}`}>Delete</button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {showResetConfirmation && (
                <ConfirmModal
                    title="Reset World Generation?"
                    message="Reset every World Editor setting to its default value?"
                    confirmLabel="Reset All"
                    danger
                    onConfirm={confirmReset}
                    onCancel={() => setShowResetConfirmation(false)}
                />
            )}

            {pendingDeletePreset && (
                <ConfirmModal
                    title="Delete Preset?"
                    message={<>Delete <span className="text-white">{pendingDeletePreset.name}</span>? This cannot be undone.</>}
                    confirmLabel="Delete"
                    danger
                    onConfirm={() => void confirmDeleteSelectedPreset()}
                    onCancel={() => setPendingDeletePreset(null)}
                />
            )}
        </div>
    );
};
