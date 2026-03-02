
import React, { useState, useMemo } from 'react';
import { ModPack, BlockDefinition, TextureEntry } from './editorTypes';
import { soundManager } from '../../../systems/sound/SoundManager';

interface BlockEditorViewProps {
    pack: ModPack;
    onUpdatePack: (pack: ModPack) => void;
    selectedId: string | null;
    onSelectId: (id: string | null) => void;
}

const CATEGORIES = ['building', 'natural', 'functional', 'tools', 'food', 'ingredients'] as const;
const SOUND_GROUPS = ['stone', 'grass', 'wood', 'sand', 'gravel', 'glass', 'metal', 'cloth', 'snow', 'generic'];

export const BlockEditorView: React.FC<BlockEditorViewProps> = ({ pack, onUpdatePack, selectedId, onSelectId }) => {
    const [search, setSearch] = useState('');
    const blocks = useMemo(() => Object.values(pack.blocks), [pack.blocks]);
    const filtered = blocks.filter(b => b.name.toLowerCase().includes(search.toLowerCase()) || b.id.toLowerCase().includes(search.toLowerCase()));

    const selectedBlock = selectedId ? pack.blocks[selectedId] : null;

    const handleCreateBlock = () => {
        const name = 'New Block';
        const slug = name.toLowerCase().replace(/\s+/g, '_');
        const id = `${pack.meta.id}:${slug}_${Date.now().toString().slice(-4)}`;
        
        const newBlock: BlockDefinition = {
            id,
            name,
            category: 'building',
            hardness: 1.0,
            renderModel: 'cube',
            renderLayer: 'opaque',
            collision: 'solid',
            lightLevel: 0,
            soundGroup: 'stone',
            textures: {
                mode: 'all',
                all: ''
            }
        };
        
        onUpdatePack({
            ...pack,
            blocks: { ...pack.blocks, [id]: newBlock }
        });
        onSelectId(id);
        soundManager.play("ui.click");
    };

    const handleDeleteBlock = (id: string) => {
        if (!confirm(`Delete block "${pack.blocks[id]?.name || id}"?`)) return;
        const nextBlocks = { ...pack.blocks };
        delete nextBlocks[id];
        onUpdatePack({ ...pack, blocks: nextBlocks });
        if (selectedId === id) onSelectId(null);
        soundManager.play("ui.click", { pitch: 0.8 });
    };

    const updateSelected = (updates: Partial<BlockDefinition>) => {
        if (!selectedId || !selectedBlock) return;
        onUpdatePack({
            ...pack,
            blocks: {
                ...pack.blocks,
                [selectedId]: { ...selectedBlock, ...updates }
            }
        });
    };

    const renderTexturePicker = (label: string, value: string | undefined, onPick: (val: string) => void) => {
        return (
            <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-gray-500">{label}</label>
                <div className="flex gap-2 items-center bg-black/40 p-2 border border-white/5 rounded">
                    <div className="w-8 h-8 bg-black rounded border border-white/10 flex-shrink-0 overflow-hidden">
                        {value && pack.textures[value] ? (
                             <img 
                                src={getTextureThumb(pack.textures[value].data)} 
                                className="w-full h-full image-pixelated" 
                                alt=""
                             />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-[8px] text-gray-700">NONE</div>
                        )}
                    </div>
                    <select 
                        value={value || ''} 
                        onChange={(e) => onPick(e.target.value)}
                        className="flex-1 bg-transparent text-xs text-white outline-none"
                    >
                        <option value="">-- None --</option>
                        {Object.values(pack.textures).map((t: TextureEntry) => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                    </select>
                </div>
            </div>
        );
    };

    return (
        <div className="flex h-full bg-black/20">
            {/* List */}
            <div className="w-64 bg-[#121212] border-r border-white/5 flex flex-col">
                <div className="p-3 bg-black/20 flex flex-col gap-2">
                    <input 
                        type="text" 
                        value={search} 
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search blocks..."
                        className="bg-black border border-white/10 rounded px-2 py-1.5 text-[10px] outline-none focus:border-blue-500/50"
                    />
                    <button 
                        onClick={handleCreateBlock}
                        className="w-full py-2 bg-blue-600 hover:bg-blue-500 rounded font-black text-[10px] uppercase tracking-widest transition-all"
                    >
                        + New Block
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
                    {filtered.map(b => (
                        <div 
                            key={b.id}
                            className={`group relative p-2 rounded-md flex items-center gap-3 cursor-pointer border transition-all ${selectedId === b.id ? 'bg-blue-600/20 border-blue-500/50 shadow-lg' : 'bg-transparent border-transparent hover:bg-white/5'}`}
                            onClick={() => onSelectId(b.id)}
                        >
                            <div className="w-8 h-8 bg-black rounded border border-white/10 flex-shrink-0 overflow-hidden">
                                {b.textures.all && pack.textures[b.textures.all] && (
                                    <img src={getTextureThumb(pack.textures[b.textures.all].data)} className="w-full h-full image-pixelated" alt="" />
                                )}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className={`text-[11px] font-bold truncate ${selectedId === b.id ? 'text-blue-300' : 'text-gray-400'}`}>{b.name}</div>
                                <div className="text-[8px] text-gray-600 font-mono truncate">{b.id}</div>
                            </div>
                            <button 
                                onClick={(e) => { e.stopPropagation(); handleDeleteBlock(b.id); }}
                                className="flex items-center justify-center w-7 h-7 rounded bg-red-900/20 text-red-500 hover:bg-red-600 hover:text-white transition-all text-xs"
                                title="Delete Block"
                            >
                                ✕
                            </button>
                        </div>
                    ))}
                </div>
            </div>

            {/* Editor */}
            <div className="flex-1 overflow-y-auto p-8">
                {selectedBlock ? (
                    <div className="max-w-4xl mx-auto flex gap-12">
                        <div className="flex-1 space-y-8">
                            <section className="space-y-4">
                                <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-500 border-b border-white/5 pb-2">Identification</h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-bold text-gray-600 uppercase">Unique ID</label>
                                        <input 
                                            type="text" 
                                            value={selectedBlock.id} 
                                            readOnly
                                            className="w-full bg-black/40 border border-white/5 rounded px-3 py-2 text-xs font-mono text-gray-500 cursor-not-allowed"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-bold text-gray-600 uppercase">Display Name</label>
                                        <input 
                                            type="text" 
                                            value={selectedBlock.name}
                                            onChange={e => updateSelected({ name: e.target.value })}
                                            className="w-full bg-black border border-white/10 rounded px-3 py-2 text-xs text-white focus:border-blue-500 outline-none"
                                        />
                                    </div>
                                </div>
                            </section>

                            <section className="space-y-4">
                                <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-500 border-b border-white/5 pb-2">Properties</h3>
                                <div className="grid grid-cols-3 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-bold text-gray-600 uppercase">Category</label>
                                        <select 
                                            value={selectedBlock.category}
                                            onChange={e => updateSelected({ category: e.target.value as any })}
                                            className="w-full bg-black border border-white/10 rounded px-2 py-1.5 text-xs text-white outline-none"
                                        >
                                            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-bold text-gray-600 uppercase">Hardness</label>
                                        <input 
                                            type="number" step="0.1" 
                                            value={selectedBlock.hardness}
                                            onChange={e => updateSelected({ hardness: parseFloat(e.target.value) })}
                                            className="w-full bg-black border border-white/10 rounded px-3 py-2 text-xs text-white outline-none"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-bold text-gray-600 uppercase">Light (0-15)</label>
                                        <input 
                                            type="number" min="0" max="15"
                                            value={selectedBlock.lightLevel}
                                            onChange={e => updateSelected({ lightLevel: parseInt(e.target.value) })}
                                            className="w-full bg-black border border-white/10 rounded px-3 py-2 text-xs text-white outline-none"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-bold text-gray-600 uppercase">Render Model</label>
                                        <select 
                                            value={selectedBlock.renderModel}
                                            onChange={e => updateSelected({ renderModel: e.target.value as any })}
                                            className="w-full bg-black border border-white/10 rounded px-2 py-1.5 text-xs text-white outline-none"
                                        >
                                            <option value="cube">Cube</option>
                                            <option value="cross">Cross (Plant)</option>
                                        </select>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-bold text-gray-600 uppercase">Render Layer</label>
                                        <select 
                                            value={selectedBlock.renderLayer}
                                            onChange={e => updateSelected({ renderLayer: e.target.value as any })}
                                            className="w-full bg-black border border-white/10 rounded px-2 py-1.5 text-xs text-white outline-none"
                                        >
                                            <option value="opaque">Opaque</option>
                                            <option value="cutout">Cutout (Leaves)</option>
                                            <option value="transparent">Transparent (Water/Glass)</option>
                                        </select>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-bold text-gray-600 uppercase">Collision</label>
                                        <select 
                                            value={selectedBlock.collision}
                                            onChange={e => updateSelected({ collision: e.target.value as any })}
                                            className="w-full bg-black border border-white/10 rounded px-2 py-1.5 text-xs text-white outline-none"
                                        >
                                            <option value="solid">Solid</option>
                                            <option value="none">None</option>
                                        </select>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-bold text-gray-600 uppercase">Sound Group</label>
                                        <select 
                                            value={selectedBlock.soundGroup}
                                            onChange={e => updateSelected({ soundGroup: e.target.value })}
                                            className="w-full bg-black border border-white/10 rounded px-2 py-1.5 text-xs text-white outline-none"
                                        >
                                            {SOUND_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
                                        </select>
                                    </div>
                                </div>
                            </section>

                            <section className="space-y-4">
                                <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-500 border-b border-white/5 pb-2">Texture Mapping</h3>
                                <div className="space-y-6 bg-white/5 p-4 rounded-lg">
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-bold text-gray-600 uppercase">Mapping Mode</label>
                                        <select 
                                            value={selectedBlock.textures.mode}
                                            onChange={e => updateSelected({ textures: { ...selectedBlock.textures, mode: e.target.value as any } })}
                                            className="w-full bg-black border border-white/10 rounded px-2 py-1.5 text-xs text-white outline-none"
                                        >
                                            <option value="all">Single Texture (All Faces)</option>
                                            <option value="top-bottom-side">Top / Bottom / Sides</option>
                                            <option value="six-faces">Full (All 6 Faces)</option>
                                        </select>
                                    </div>

                                    <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                                        {selectedBlock.textures.mode === 'all' && (
                                            renderTexturePicker("Texture", selectedBlock.textures.all, (val) => updateSelected({ textures: { ...selectedBlock.textures, all: val } }))
                                        )}
                                        {selectedBlock.textures.mode === 'top-bottom-side' && (
                                            <>
                                                {renderTexturePicker("Top", selectedBlock.textures.top, (val) => updateSelected({ textures: { ...selectedBlock.textures, top: val } }))}
                                                {renderTexturePicker("Bottom", selectedBlock.textures.bottom, (val) => updateSelected({ textures: { ...selectedBlock.textures, bottom: val } }))}
                                                {renderTexturePicker("Sides", selectedBlock.textures.side, (val) => updateSelected({ textures: { ...selectedBlock.textures, side: val } }))}
                                            </>
                                        )}
                                        {selectedBlock.textures.mode === 'six-faces' && (
                                            <>
                                                {renderTexturePicker("Top", selectedBlock.textures.top, (val) => updateSelected({ textures: { ...selectedBlock.textures, top: val } }))}
                                                {renderTexturePicker("Bottom", selectedBlock.textures.bottom, (val) => updateSelected({ textures: { ...selectedBlock.textures, bottom: val } }))}
                                                {renderTexturePicker("North (Front)", selectedBlock.textures.front, (val) => updateSelected({ textures: { ...selectedBlock.textures, front: val } }))}
                                                {renderTexturePicker("South (Back)", selectedBlock.textures.back, (val) => updateSelected({ textures: { ...selectedBlock.textures, back: val } }))}
                                                {renderTexturePicker("East (Right)", selectedBlock.textures.right, (val) => updateSelected({ textures: { ...selectedBlock.textures, right: val } }))}
                                                {renderTexturePicker("West (Left)", selectedBlock.textures.left, (val) => updateSelected({ textures: { ...selectedBlock.textures, left: val } }))}
                                            </>
                                        )}
                                    </div>
                                </div>
                            </section>
                        </div>

                        {/* Preview Placeholder */}
                        <div className="w-80 space-y-4 flex-shrink-0">
                             <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-500 border-b border-white/5 pb-2">3D Preview</h3>
                             <div className="aspect-square bg-gradient-to-br from-white/5 to-white/0 rounded-xl border border-white/10 flex flex-col items-center justify-center text-center p-8 grayscale opacity-30">
                                <div className="text-4xl mb-4">🧊</div>
                                <div className="text-[10px] font-bold uppercase tracking-tighter">Preview Renderer<br/>Coming Soon</div>
                             </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex items-center justify-center h-full text-[#333] font-black uppercase text-[10px] tracking-[1em] animate-pulse">Select Block</div>
                )}
            </div>
        </div>
    );
};

function getTextureThumb(data: number[]) {
    const canvas = document.createElement('canvas');
    canvas.width = 16; canvas.height = 16;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    ctx.putImageData(new ImageData(new Uint8ClampedArray(data), 16, 16), 0, 0);
    return canvas.toDataURL();
}
