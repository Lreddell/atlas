import React, { useState, useMemo, useRef, useEffect } from 'react';
import { ModPack, TextureEntry } from './editorTypes';
import { soundManager } from '../../../systems/sound/SoundManager';
import { PixelEditor } from './PixelEditor';

interface TextureEditorViewProps {
    pack: ModPack;
    onUpdatePack: (pack: ModPack) => void;
    selectedId: string | null;
    onSelectId: (id: string | null) => void;
}

export const TextureEditorView: React.FC<TextureEditorViewProps> = ({ pack, onUpdatePack, selectedId, onSelectId }) => {
    const [listWidth, setListWidth] = useState(() => Number(localStorage.getItem('atlas_texture_list_width')) || 224);
    const textures = useMemo(() => Object.values(pack.textures), [pack.textures]);
    const selectedTexture = selectedId ? pack.textures[selectedId] : null;
    
    const isResizingRef = useRef(false);
    const importInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (isResizingRef.current) {
                const sidebarW = Number(localStorage.getItem('atlas_sidebar_width')) || 260;
                const newWidth = Math.max(150, Math.min(600, e.clientX - sidebarW));
                setListWidth(newWidth);
                localStorage.setItem('atlas_texture_list_width', String(newWidth));
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

    const handleCreateTexture = () => {
        const id = `tex_${Date.now()}`;
        const newTexture: TextureEntry = { id, name: 'New Texture', data: new Array(16 * 16 * 4).fill(0), lastModified: Date.now() };
        onUpdatePack({ ...pack, textures: { ...pack.textures, [id]: newTexture } });
        onSelectId(id);
        soundManager.play("ui.click");
    };

    const handleDeleteTexture = (id: string) => {
        if (!confirm(`Delete texture "${pack.textures[id]?.name || id}"?`)) return;
        const newTextures = { ...pack.textures };
        delete newTextures[id];
        onUpdatePack({ ...pack, textures: newTextures });
        if (selectedId === id) onSelectId(null);
        soundManager.play("ui.click", { pitch: 0.8 });
    };

    const handleExportTexture = () => {
        if (!selectedTexture) return;
        const data = JSON.stringify(selectedTexture, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${selectedTexture.name.replace(/\s+/g, '_')}.json`;
        a.click();
        soundManager.play("ui.click");
    };

    const handleImportTexture = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        
        if (file.type === 'application/json') {
            reader.onload = (event) => {
                try {
                    const imported = JSON.parse(event.target?.result as string);
                    const id = `tex_${Date.now()}`;
                    onUpdatePack({ ...pack, textures: { ...pack.textures, [id]: { ...imported, id, lastModified: Date.now() } } });
                    onSelectId(id);
                    soundManager.play("ui.click", { pitch: 1.2 });
                } catch (err) { alert("Invalid texture JSON"); }
            };
            reader.readAsText(file);
        } else {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = 16; canvas.height = 16;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.drawImage(img, 0, 0, 16, 16);
                    const pixels = Array.from(ctx.getImageData(0, 0, 16, 16).data);
                    const id = `tex_${Date.now()}`;
                    onUpdatePack({ ...pack, textures: { ...pack.textures, [id]: { id, name: file.name.split('.')[0], data: pixels, lastModified: Date.now() } } });
                    onSelectId(id);
                    soundManager.play("ui.click", { pitch: 1.2 });
                }
            };
            img.src = URL.createObjectURL(file);
        }
    };

    const renderThumbnail = (data: number[]) => {
        const canvas = document.createElement('canvas');
        canvas.width = 16; canvas.height = 16;
        const ctx = canvas.getContext('2d');
        if (!ctx) return '';
        ctx.putImageData(new ImageData(new Uint8ClampedArray(data), 16, 16), 0, 0);
        return canvas.toDataURL();
    };

    return (
        <div className="flex h-full bg-black">
            <input type="file" ref={importInputRef} className="hidden" accept=".json,image/*" onChange={handleImportTexture} />
            
            {/* Texture List Sidebar */}
            <div className="bg-[#121212] border-r border-white/5 flex flex-col relative flex-shrink-0" style={{ width: listWidth }}>
                <div 
                    className="resizer-handle" 
                    onMouseDown={() => { isResizingRef.current = true; }} 
                />
                
                <div className="p-3 bg-black/20 flex flex-col gap-2">
                    <button onClick={handleCreateTexture} className="w-full py-2 bg-blue-600 hover:bg-blue-500 rounded font-black text-[10px] uppercase tracking-widest transition-all">
                        + New Texture
                    </button>
                    <div className="flex gap-1">
                        <button onClick={() => importInputRef.current?.click()} className="flex-1 py-1.5 bg-white/5 hover:bg-white/10 rounded text-[9px] font-black uppercase text-gray-500">Import</button>
                        {selectedTexture && <button onClick={handleExportTexture} className="flex-1 py-1.5 bg-white/5 hover:bg-white/10 rounded text-[9px] font-black uppercase text-gray-500">Export</button>}
                    </div>
                </div>
                
                <div className="flex-1 overflow-y-auto px-2 py-3 space-y-1 scrollbar-thin">
                    {textures.map(tex => (
                        <div 
                            key={tex.id}
                            className={`group relative p-2 rounded-md flex items-center gap-3 cursor-pointer border transition-all ${selectedId === tex.id ? 'bg-blue-600/20 border-blue-500/50 shadow-lg' : 'bg-transparent border-transparent hover:bg-white/5'}`}
                            onClick={() => { onSelectId(tex.id); soundManager.play("ui.click"); }}
                        >
                            <div className="w-8 h-8 bg-black rounded border border-white/10 flex-shrink-0 overflow-hidden">
                                <div className="w-full h-full" style={{ backgroundImage: `url(${renderThumbnail(tex.data)})`, backgroundSize: '100% 100%', imageRendering: 'pixelated' }} />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className={`text-[11px] font-bold truncate ${selectedId === tex.id ? 'text-blue-300' : 'text-gray-400'}`}>{tex.name}</div>
                            </div>
                            <button 
                                onClick={(e) => { e.stopPropagation(); handleDeleteTexture(tex.id); }}
                                className="flex items-center justify-center w-7 h-7 rounded bg-red-900/20 text-red-500 hover:bg-red-600 hover:text-white transition-all text-xs"
                                title="Delete Texture"
                            >
                                ✕
                            </button>
                        </div>
                    ))}
                </div>
            </div>

            {/* Editor Area */}
            <div className="flex-1 relative bg-black/40">
                {selectedTexture ? (
                    <PixelEditor 
                        key={selectedTexture.id}
                        initialData={selectedTexture.data} 
                        initialName={selectedTexture.name}
                        onSave={(pixels, name) => {
                            onUpdatePack({
                                ...pack,
                                textures: {
                                    ...pack.textures,
                                    [selectedTexture.id]: { ...selectedTexture, data: pixels, name, lastModified: Date.now() }
                                }
                            });
                        }}
                    />
                ) : (
                    <div className="flex items-center justify-center h-full text-[#333] font-black uppercase text-[10px] tracking-[1em] animate-pulse text-center px-8">Select Texture</div>
                )}
            </div>
        </div>
    );
};
